/* ============================================
   MIRAI AI - Banco de preguntas del Ludo (IA)
   Una sola generación por tarea, cacheada en D1 y compartida por todas sus
   salas. Así el gasto de DeepSeek no crece por sala ni por ciclo
   (multijugador.md §5.3 y recomendación de costo).

   Formato de cada pregunta en `game_question_bank.payload`:
     { "question": "...", "options": ["A","B","C","D"], "answer": 0 }
   Las opciones se barajan de nuevo en cada entrega y la respuesta correcta
   nunca sale del servidor antes de resolver.
   ============================================ */
import { callAI } from './ai';
import { AI_MODEL_NORMAL } from './ai-models';

export type Difficulty = 'easy' | 'hard';

export interface BankQuestion {
  id: string;
  difficulty: Difficulty;
  question: string;
  options: string[];
  answer: number;
}

const EASY_TARGET = 24;
const HARD_TARGET = 12;
const EASY_BATCH = 20;
const HARD_BATCH = 10;

interface GeneratedQuestion {
  question: string;
  options: string[];
  answer: number;
}

function systemPrompt(): string {
  return [
    'Eres un generador de preguntas de quiz para estudiantes de secundaria.',
    'Las preguntas deben ser claras, breves, en español y apropiadas para menores.',
    'Cada pregunta tiene exactamente 4 opciones plausibles y una sola correcta.',
    'Responde SOLO con un arreglo JSON, sin markdown ni explicaciones.',
    'Formato: [{"question":"...","options":["...","...","...","..."],"answer":0}]',
    '"answer" es el índice (0-3) de la opción correcta.',
  ].join('\n');
}

function userPrompt(topic: string, difficulty: Difficulty, count: number): string {
  const level =
    difficulty === 'easy'
      ? 'fáciles: conceptos básicos del tema, respuesta directa'
      : 'difíciles: requieren razonar o aplicar el concepto, con distractores cercanos';
  return [
    `Tema: ${topic}`,
    `Genera exactamente ${count} preguntas ${level}.`,
    'No repitas preguntas ni uses la misma respuesta correcta en todas.',
    'Devuelve únicamente el arreglo JSON.',
  ].join('\n');
}

function extractJsonArray(text: string): unknown {
  const fenced = text.replace(/```(?:json)?/gi, '').trim();
  const start = fenced.indexOf('[');
  const end = fenced.lastIndexOf(']');
  if (start === -1 || end <= start) throw new Error('La IA no devolvió un arreglo JSON');
  return JSON.parse(fenced.slice(start, end + 1));
}

function normalizeQuestions(raw: unknown): GeneratedQuestion[] {
  if (!Array.isArray(raw)) return [];
  const out: GeneratedQuestion[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const value = item as Record<string, unknown>;
    const question = String(value.question ?? '').trim();
    const options = Array.isArray(value.options)
      ? value.options.map((o) => String(o).trim()).filter(Boolean)
      : [];
    const answer = Number(value.answer);
    if (!question || options.length !== 4 || !Number.isInteger(answer) || answer < 0 || answer > 3) {
      continue;
    }
    out.push({ question: question.slice(0, 300), options: options.map((o) => o.slice(0, 160)), answer });
  }
  return out;
}

async function hashQuestion(question: string): Promise<string> {
  const data = new TextEncoder().encode(question.toLowerCase().replace(/\s+/g, ' ').trim());
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

async function generateBatch(
  env: Env,
  topic: string,
  difficulty: Difficulty,
  count: number,
  existing: Set<string>
): Promise<GeneratedQuestion[]> {
  const avoid =
    existing.size > 0
      ? `\nNo repitas ni parafrasees estas preguntas ya usadas:\n- ${[...existing].slice(0, 40).join('\n- ')}`
      : '';

  const text = await callAI(
    AI_MODEL_NORMAL,
    [
      { role: 'system', content: systemPrompt() },
      { role: 'user', content: userPrompt(topic, difficulty, count) + avoid },
    ],
    { temperature: 0.8, max_tokens: difficulty === 'easy' ? 2600 : 1600 },
    env
  );

  return normalizeQuestions(extractJsonArray(text));
}

async function countQuestions(env: Env, assignmentId: string, difficulty: Difficulty): Promise<number> {
  const row = await env.MIRAI_AI_DB.prepare(
    'SELECT COUNT(*) AS n FROM game_question_bank WHERE assignment_id = ? AND difficulty = ?'
  )
    .bind(assignmentId, difficulty)
    .first<any>();
  return Number(row?.n ?? 0);
}

async function existingStems(env: Env, assignmentId: string): Promise<Set<string>> {
  const rows = await env.MIRAI_AI_DB.prepare(
    'SELECT payload FROM game_question_bank WHERE assignment_id = ? LIMIT 200'
  )
    .bind(assignmentId)
    .all<any>();
  const stems = new Set<string>();
  for (const row of rows.results ?? []) {
    try {
      const payload = JSON.parse(row.payload);
      if (payload?.question) stems.add(String(payload.question));
    } catch {
      // payload corrupto: se ignora
    }
  }
  return stems;
}

async function storeQuestions(
  env: Env,
  assignmentId: string,
  topic: string,
  difficulty: Difficulty,
  questions: GeneratedQuestion[]
): Promise<number> {
  let stored = 0;
  for (const q of questions) {
    const qhash = await hashQuestion(q.question);
    const result = await env.MIRAI_AI_DB.prepare(
      `INSERT OR IGNORE INTO game_question_bank
         (id, assignment_id, topic, payload, difficulty, qhash)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
      .bind(crypto.randomUUID(), assignmentId, topic, JSON.stringify(q), difficulty, qhash)
      .run();
    if ((result.meta?.changes ?? 0) > 0) stored++;
  }
  return stored;
}

/**
 * Garantiza que la tarea tenga banco suficiente. Solo llama a la IA si falta.
 * Devuelve los totales disponibles; si la IA falla, devuelve lo que ya hubiera.
 */
export async function ensureQuestionBank(
  env: Env,
  assignmentId: string,
  topic: string
): Promise<{ easy: number; hard: number }> {
  let easy = await countQuestions(env, assignmentId, 'easy');
  let hard = await countQuestions(env, assignmentId, 'hard');

  if (easy >= EASY_TARGET && hard >= HARD_TARGET) return { easy, hard };

  const stems = await existingStems(env, assignmentId);

  if (easy < EASY_TARGET) {
    try {
      const batch = await generateBatch(env, topic, 'easy', EASY_BATCH, stems);
      easy += await storeQuestions(env, assignmentId, topic, 'easy', batch);
    } catch (error: any) {
      console.warn('Banco de preguntas fáciles no generado —', error.message);
    }
  }

  if (hard < HARD_TARGET) {
    try {
      const batch = await generateBatch(env, topic, 'hard', HARD_BATCH, stems);
      hard += await storeQuestions(env, assignmentId, topic, 'hard', batch);
    } catch (error: any) {
      console.warn('Banco de preguntas difíciles no generado —', error.message);
    }
  }

  return { easy, hard };
}
