import { callAI } from '../lib/ai';
import { AI_MODEL_NORMAL } from '../lib/ai-models';
import { requireAuth } from '../lib/auth';
import { jsonResponse } from '../lib/http';
import { getAssignmentForStudent } from './chat-context';

export type ActivityType = 'flashcards' | 'find_error' | 'recall' | 'summary' | 'concept_map';

const ACTIVITY_TYPES: ActivityType[] = ['flashcards', 'find_error', 'recall', 'summary', 'concept_map'];

let activityTablesReady = false;

const ACTIVITY_DDL = [
  `CREATE TABLE IF NOT EXISTS activity_sets (
    assignment_id TEXT NOT NULL,
    type          TEXT NOT NULL,
    payload       TEXT NOT NULL,
    created_at    TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (assignment_id, type))`,
  `CREATE TABLE IF NOT EXISTS activity_attempts (
    id            TEXT PRIMARY KEY,
    assignment_id TEXT NOT NULL,
    user_dni      TEXT NOT NULL,
    type          TEXT NOT NULL,
    answers       TEXT,
    result        TEXT,
    score         INTEGER,
    max_score     INTEGER,
    created_at    TEXT DEFAULT (datetime('now')))`,
  `CREATE TABLE IF NOT EXISTS flashcard_reviews (
    assignment_id TEXT NOT NULL,
    user_dni      TEXT NOT NULL,
    card_index    INTEGER NOT NULL,
    repetitions   INTEGER DEFAULT 0,
    ease          REAL DEFAULT 2.5,
    interval_days INTEGER DEFAULT 0,
    due_at        TEXT,
    last_quality  INTEGER,
    updated_at    TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (assignment_id, user_dni, card_index))`,
  `CREATE INDEX IF NOT EXISTS idx_activity_attempts_user
    ON activity_attempts (assignment_id, user_dni)`,
];

async function ensureActivityTables(env: Env) {
  if (activityTablesReady) return;
  for (const ddl of ACTIVITY_DDL) {
    try {
      await env.MIRAI_AI_DB.prepare(ddl).run();
    } catch (error) {
      console.error('Migración actividades:', (error as Error)?.message);
    }
  }
  for (const sql of [
    'ALTER TABLE submissions ADD COLUMN attempt_type TEXT',
    'ALTER TABLE submissions ADD COLUMN retry_used INTEGER DEFAULT 0',
  ]) {
    try {
      await env.MIRAI_AI_DB.prepare(sql).run();
    } catch {
      // La columna ya existe.
    }
  }
  activityTablesReady = true;
}

function parseActivityType(value: unknown): ActivityType | null {
  return ACTIVITY_TYPES.includes(value as ActivityType) ? (value as ActivityType) : null;
}

function parseJsonObject(raw: string): any {
  const cleaned = String(raw || '')
    .replace(/^\uFEFF/, '')
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('La IA no devolvió un JSON válido');
  return JSON.parse(cleaned.slice(start, end + 1));
}

function normalizeText(text: string): string {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9áéíóúüñ\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function textMatches(answer: string, expected: string): boolean {
  const a = normalizeText(answer);
  const e = normalizeText(expected);
  if (!a || !e) return false;
  if (a.includes(e) || e.includes(a)) return true;
  const expectedWords = e.split(' ').filter((w) => w.length > 3);
  if (!expectedWords.length) return false;
  const hits = expectedWords.filter((w) => a.includes(w)).length;
  return hits / expectedWords.length >= 0.6;
}

function normalizeRatio(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  const scaled = n > 1 && n <= 100 ? n / 100 : n;
  return Math.max(0, Math.min(1, scaled));
}

function scoreToMax(ratio: number, maxScore: number): number {
  return Math.max(0, Math.min(maxScore, Math.round(ratio * maxScore)));
}

function wordCount(text: string): number {
  return String(text || '').trim().split(/\s+/).filter(Boolean).length;
}

function inferSubmissionType(row: any): string {
  const explicit = String(row?.attempt_type || '').trim();
  if (explicit) return explicit;
  const fileUrl = String(row?.file_url || '');
  if (fileUrl.startsWith('quiz://')) return fileUrl.slice('quiz://'.length);
  if (fileUrl.startsWith('activity://')) return fileUrl.slice('activity://'.length);
  if (fileUrl) return 'document';
  return '';
}

async function getAssignment(assignmentId: string, userDni: string, env: Env) {
  const assignment = await getAssignmentForStudent(assignmentId, userDni, env);
  return assignment || null;
}

async function methodLock(env: Env, assignmentId: string, userDni: string, type: ActivityType): Promise<string | null> {
  const row = await env.MIRAI_AI_DB.prepare(
    'SELECT attempt_type, file_url, status FROM submissions WHERE assignment_id = ? AND UPPER(user_dni) = UPPER(?)'
  ).bind(assignmentId, userDni).first<any>();
  if (!row || row.status === 'reset') return null;
  const existing = inferSubmissionType(row);
  if (!existing || existing === type) return null;
  return existing;
}

function buildContext(assignment: any): string {
  const title = String(assignment?.title || 'Tarea').trim();
  const description = String(assignment?.description || '').trim().slice(0, 2500);
  return `Tarea: ${title}${description ? `\nEnunciado:\n${description}` : ''}`;
}

async function generateFlashcards(assignment: any, env: Env): Promise<any> {
  const system = `Eres la tutora académica de Mirai. Creas tarjetas de estudio para que un estudiante memorice y comprenda una tarea.
Reglas:
- Genera EXACTAMENTE 10 tarjetas.
- "front" es una pregunta breve o un término (máximo 20 palabras).
- "back" es la respuesta correcta y precisa (máximo 30 palabras).
- Cubre los conceptos clave de la tarea, de lo básico a lo profundo.
- Español neutro, sin ambigüedad.
- Devuelve SOLO JSON: {"cards":[{"front":"...","back":"..."}]}`;
  const raw = await callAI(AI_MODEL_NORMAL, [
    { role: 'system', content: system },
    { role: 'user', content: `${buildContext(assignment)}\n\nFormato exacto: {"cards":[{"front":"...","back":"..."}]}` },
  ], { temperature: 0.6, max_tokens: 3500 }, env);
  const parsed = parseJsonObject(raw);
  const cards = (Array.isArray(parsed?.cards) ? parsed.cards : [])
    .map((card: any) => ({ front: String(card?.front || '').trim(), back: String(card?.back || '').trim() }))
    .filter((card: any) => card.front && card.back)
    .slice(0, 10);
  if (cards.length < 6) throw new Error('La IA no generó suficientes tarjetas');
  return { cards };
}

async function generateFindError(assignment: any, env: Env): Promise<any> {
  const system = `Eres la tutora académica de Mirai. Preparas un ejercicio de detección de errores sobre una tarea.
Reglas:
- Escribe un texto académico breve (120-170 palabras) dividido en EXACTAMENTE 6 oraciones numeradas.
- EXACTAMENTE 3 de las 6 oraciones contienen un error conceptual o factual.
- Cada oración debe ser autosuficiente y tener máximo 35 palabras.
- Para cada oración indica "has_error" (true/false), "correction" (la versión correcta si hay error, si no "") y "explanation" (por qué está mal o bien, máximo 25 palabras).
- Español neutro.
- Devuelve SOLO JSON: {"instructions":"...","sentences":[{"text":"...","has_error":true,"correction":"...","explanation":"..."}]}`;
  const raw = await callAI(AI_MODEL_NORMAL, [
    { role: 'system', content: system },
    { role: 'user', content: `${buildContext(assignment)}\n\nFormato exacto: {"instructions":"...","sentences":[{"text":"...","has_error":true,"correction":"...","explanation":"..."}]}` },
  ], { temperature: 0.6, max_tokens: 3500 }, env);
  const parsed = parseJsonObject(raw);
  const sentences = (Array.isArray(parsed?.sentences) ? parsed.sentences : [])
    .map((sentence: any) => ({
      text: String(sentence?.text || '').trim(),
      has_error: sentence?.has_error === true,
      correction: String(sentence?.correction || '').trim(),
      explanation: String(sentence?.explanation || '').trim(),
    }))
    .filter((sentence: any) => sentence.text)
    .slice(0, 8);
  const errors = sentences.filter((sentence: any) => sentence.has_error).length;
  if (sentences.length < 5 || errors < 2) throw new Error('La IA no generó el ejercicio esperado');
  return {
    instructions: String(parsed?.instructions || 'Marca las oraciones que contienen un error y explica por qué.').trim(),
    sentences,
  };
}

async function generateRecall(assignment: any, env: Env): Promise<any> {
  const system = `Eres la tutora académica de Mirai. Preparas un ejercicio de recuerdo libre sobre una tarea.
Reglas:
- Formula una pregunta abierta que obligue a explicar el tema con sus propias palabras.
- Define EXACTAMENTE 6 conceptos clave que una respuesta completa debería incluir.
- Los conceptos deben ser breves (2-6 palabras) y evaluables.
- Español neutro.
- Devuelve SOLO JSON: {"prompt":"...","instructions":"...","key_concepts":["...","..."]}`;
  const raw = await callAI(AI_MODEL_NORMAL, [
    { role: 'system', content: system },
    { role: 'user', content: `${buildContext(assignment)}\n\nFormato exacto: {"prompt":"...","instructions":"...","key_concepts":["..."]}` },
  ], { temperature: 0.6, max_tokens: 2500 }, env);
  const parsed = parseJsonObject(raw);
  const keyConcepts = (Array.isArray(parsed?.key_concepts) ? parsed.key_concepts : [])
    .map((concept: any) => String(concept || '').trim())
    .filter(Boolean)
    .slice(0, 6);
  if (keyConcepts.length < 4) throw new Error('La IA no generó los conceptos clave');
  return {
    prompt: String(parsed?.prompt || 'Explica el tema de la tarea con tus propias palabras.').trim(),
    instructions: String(parsed?.instructions || 'Escribe todo lo que recuerdes, sin consultar el material.').trim(),
    key_concepts: keyConcepts,
  };
}

async function generateSummary(assignment: any, env: Env): Promise<any> {
  const system = `Eres la tutora académica de Mirai. Preparas un ejercicio de síntesis sobre una tarea.
Reglas:
- Escribe un texto fuente de 200-260 palabras sobre el tema de la tarea.
- Define EXACTAMENTE 6 ideas clave que un buen resumen debería conservar.
- Indica un límite de palabras para el resumen: entre 60 y 90 palabras.
- El texto fuente debe ser claro, informativo y autosuficiente.
- Español neutro.
- Devuelve SOLO JSON: {"source_text":"...","min_words":60,"max_words":90,"key_points":["..."]}`;
  const raw = await callAI(AI_MODEL_NORMAL, [
    { role: 'system', content: system },
    { role: 'user', content: `${buildContext(assignment)}\n\nFormato exacto: {"source_text":"...","min_words":60,"max_words":90,"key_points":["..."]}` },
  ], { temperature: 0.6, max_tokens: 4000 }, env);
  const parsed = parseJsonObject(raw);
  const keyPoints = (Array.isArray(parsed?.key_points) ? parsed.key_points : [])
    .map((point: any) => String(point || '').trim())
    .filter(Boolean)
    .slice(0, 6);
  const sourceText = String(parsed?.source_text || '').trim();
  const minWords = Math.max(30, Math.min(150, Math.round(Number(parsed?.min_words) || 60)));
  const maxWords = Math.max(minWords + 10, Math.min(200, Math.round(Number(parsed?.max_words) || 90)));
  if (sourceText.length < 200 || keyPoints.length < 4) throw new Error('La IA no generó el texto fuente');
  return {
    source_text: sourceText,
    min_words: minWords,
    max_words: maxWords,
    instructions: `Resume el texto en ${minWords}-${maxWords} palabras conservando las ideas clave.`,
    key_points: keyPoints,
  };
}

async function generateConceptMap(assignment: any, env: Env): Promise<any> {
  const system = `Eres la tutora académica de Mirai. Preparas un mapa conceptual simple sobre una tarea.
Reglas:
- Define EXACTAMENTE 8 conceptos clave (2-5 palabras cada uno).
- Define entre 8 y 10 relaciones válidas entre pares de conceptos, con una etiqueta breve (1-4 palabras) que describa la relación.
- Las relaciones deben ser académicamente correctas y no repetir el mismo par.
- Español neutro.
- Devuelve SOLO JSON: {"instructions":"...","concepts":["..."],"edges":[{"from":"...","to":"...","label":"..."}]}`;
  const raw = await callAI(AI_MODEL_NORMAL, [
    { role: 'system', content: system },
    { role: 'user', content: `${buildContext(assignment)}\n\nFormato exacto: {"instructions":"...","concepts":["..."],"edges":[{"from":"...","to":"...","label":"..."}]}` },
  ], { temperature: 0.6, max_tokens: 3000 }, env);
  const parsed = parseJsonObject(raw);
  const concepts = (Array.isArray(parsed?.concepts) ? parsed.concepts : [])
    .map((concept: any) => String(concept || '').trim())
    .filter(Boolean)
    .slice(0, 8);
  const conceptSet = new Set(concepts.map((concept: string) => normalizeText(concept)));
  const edges = (Array.isArray(parsed?.edges) ? parsed.edges : [])
    .map((edge: any) => ({
      from: String(edge?.from || '').trim(),
      to: String(edge?.to || '').trim(),
      label: String(edge?.label || '').trim(),
    }))
    .filter((edge: any) => conceptSet.has(normalizeText(edge.from)) && conceptSet.has(normalizeText(edge.to)) && edge.from !== edge.to && edge.label)
    .slice(0, 10);
  if (concepts.length < 6 || edges.length < 6) throw new Error('La IA no generó el mapa esperado');
  return {
    instructions: String(parsed?.instructions || 'Conecta los conceptos con una relación breve y correcta.').trim(),
    concepts,
    edges,
  };
}

async function generateSet(assignment: any, type: ActivityType, env: Env): Promise<any> {
  switch (type) {
    case 'flashcards': return generateFlashcards(assignment, env);
    case 'find_error': return generateFindError(assignment, env);
    case 'recall': return generateRecall(assignment, env);
    case 'summary': return generateSummary(assignment, env);
    case 'concept_map': return generateConceptMap(assignment, env);
  }
}

function sanitizeSet(type: ActivityType, set: any, dueMap?: Map<number, string>): any {
  if (type === 'flashcards') {
    return {
      cards: (set.cards || []).map((card: any, index: number) => ({
        index,
        front: card.front,
        due: !dueMap?.get(index) || new Date(dueMap.get(index) as string).getTime() <= Date.now(),
      })),
    };
  }
  if (type === 'find_error') {
    return {
      instructions: set.instructions,
      sentences: (set.sentences || []).map((sentence: any, index: number) => ({ index, text: sentence.text })),
    };
  }
  if (type === 'recall') {
    return { prompt: set.prompt, instructions: set.instructions };
  }
  if (type === 'summary') {
    return {
      source_text: set.source_text,
      min_words: set.min_words,
      max_words: set.max_words,
      instructions: set.instructions,
    };
  }
  return { instructions: set.instructions, concepts: set.concepts, max_edges: (set.edges || []).length };
}

async function loadSet(env: Env, assignmentId: string, type: ActivityType): Promise<any | null> {
  const row = await env.MIRAI_AI_DB.prepare(
    'SELECT payload FROM activity_sets WHERE assignment_id = ? AND type = ?'
  ).bind(assignmentId, type).first<any>();
  if (!row?.payload) return null;
  try {
    return JSON.parse(row.payload);
  } catch {
    return null;
  }
}

async function saveSet(env: Env, assignmentId: string, type: ActivityType, set: any) {
  await env.MIRAI_AI_DB.prepare(
    `INSERT INTO activity_sets (assignment_id, type, payload)
     VALUES (?, ?, ?)
     ON CONFLICT (assignment_id, type) DO UPDATE SET payload = excluded.payload, created_at = datetime('now')`
  ).bind(assignmentId, type, JSON.stringify(set)).run();
}

async function loadReviewMap(env: Env, assignmentId: string, userDni: string): Promise<Map<number, string>> {
  const rows = await env.MIRAI_AI_DB.prepare(
    'SELECT card_index, due_at FROM flashcard_reviews WHERE assignment_id = ? AND UPPER(user_dni) = UPPER(?)'
  ).bind(assignmentId, userDni).all<any>();
  const map = new Map<number, string>();
  for (const row of rows.results || []) map.set(Number(row.card_index), String(row.due_at || ''));
  return map;
}

function nextSchedule(previous: any, correct: boolean) {
  const quality = correct ? 4 : 1;
  let repetitions = Number(previous?.repetitions) || 0;
  let ease = Number(previous?.ease) || 2.5;
  let intervalDays = Number(previous?.interval_days) || 0;

  if (quality < 3) {
    repetitions = 0;
    intervalDays = 1;
  } else if (repetitions === 0) {
    intervalDays = 1;
    repetitions = 1;
  } else if (repetitions === 1) {
    intervalDays = 6;
    repetitions = 2;
  } else {
    intervalDays = Math.max(1, Math.round(intervalDays * ease));
    repetitions += 1;
  }

  ease = Math.max(1.3, ease + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)));
  const dueAt = new Date(Date.now() + intervalDays * 86400000).toISOString();
  return { repetitions, ease, intervalDays, dueAt, quality };
}

async function gradeFlashcards(set: any, answers: any, env: Env, assignmentId: string, userDni: string) {
  const submitted = new Map<number, string>();
  for (const item of Array.isArray(answers) ? answers : []) {
    submitted.set(Number(item?.card_index), String(item?.answer || ''));
  }
  const results = [];
  let correct = 0;
  for (let index = 0; index < (set.cards || []).length; index++) {
    const card = set.cards[index];
    const answer = submitted.get(index) || '';
    const ok = textMatches(answer, card.back);
    if (ok) correct++;
    const previous = await env.MIRAI_AI_DB.prepare(
      'SELECT repetitions, ease, interval_days FROM flashcard_reviews WHERE assignment_id = ? AND UPPER(user_dni) = UPPER(?) AND card_index = ?'
    ).bind(assignmentId, userDni, index).first<any>();
    const schedule = nextSchedule(previous, ok);
    await env.MIRAI_AI_DB.prepare(
      `INSERT INTO flashcard_reviews
         (assignment_id, user_dni, card_index, repetitions, ease, interval_days, due_at, last_quality, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT (assignment_id, user_dni, card_index) DO UPDATE SET
         repetitions = excluded.repetitions, ease = excluded.ease,
         interval_days = excluded.interval_days, due_at = excluded.due_at,
         last_quality = excluded.last_quality, updated_at = datetime('now')`
    ).bind(assignmentId, userDni.toUpperCase(), index, schedule.repetitions, schedule.ease, schedule.intervalDays, schedule.dueAt, schedule.quality).run();
    results.push({
      index,
      correct: ok,
      answer,
      back: card.back,
      next_review_days: schedule.intervalDays,
    });
  }
  const total = (set.cards || []).length || 1;
  const ratio = correct / total;
  return {
    ratio,
    feedback: {
      memoria: `${correct} de ${total} tarjetas recordadas correctamente.`,
      constancia: correct === total ? 'Dominio completo en esta sesión.' : 'Repasa las tarjetas falladas en los próximos días.',
      general: `Sesión de flashcards completada: ${correct}/${total}. La repetición espaciada ya programó tus próximos repasos.`,
    },
    details: { results, correct, total },
  };
}

async function gradeFindError(set: any, answers: any) {
  const sentences = Array.isArray(set.sentences) ? set.sentences : [];
  const errorIndexes = sentences.map((sentence: any, index: number) => (sentence.has_error ? index : -1)).filter((index: number) => index >= 0);
  const selected = new Set<number>(
    (Array.isArray(answers?.selected) ? answers.selected : []).map((index: any) => Number(index)).filter((index: number) => Number.isInteger(index)),
  );
  const hits = errorIndexes.filter((index: number) => selected.has(index)).length;
  const falsePositives = [...selected].filter((index) => !sentences[index]?.has_error).length;
  const ratio = errorIndexes.length ? Math.max(0, hits - 0.5 * falsePositives) / errorIndexes.length : 0;
  return {
    ratio,
    feedback: {
      atencion: `Identificaste ${hits} de ${errorIndexes.length} oraciones con error.`,
      precision: falsePositives ? `Marcaste ${falsePositives} oración(es) correcta(s) como errónea(s).` : 'No marcaste oraciones correctas como erróneas.',
      general: `Detección de errores completada: ${hits}/${errorIndexes.length} aciertos.`,
    },
    details: {
      sentences: sentences.map((sentence: any, index: number) => ({
        index,
        text: sentence.text,
        has_error: sentence.has_error,
        selected: selected.has(index),
        correction: sentence.correction,
        explanation: sentence.explanation,
      })),
      hits,
      falsePositives,
      totalErrors: errorIndexes.length,
    },
  };
}

async function gradeRecall(set: any, answers: any, maxScore: number, env: Env) {
  const text = String(answers?.text || '').trim().slice(0, 6000);
  const concepts: string[] = set.key_concepts || [];
  let covered: string[] = [];
  let missing: string[] = [];
  let misconceptions: string[] = [];
  let ratio = 0;

  if (text.length < 20) {
    missing = concepts;
  } else {
    try {
      const raw = await callAI(AI_MODEL_NORMAL, [
        {
          role: 'system',
          content: `Eres un profesor que evalúa una respuesta de recuerdo libre.
Compara la respuesta del estudiante con los conceptos clave.
Reglas:
- "covered": conceptos que la respuesta incluye, aunque use otras palabras.
- "missing": conceptos clave que faltan.
- "misconceptions": ideas incorrectas detectadas (vacío si no hay).
- "ratio": número entre 0 y 1 con la cobertura conceptual (0 = nada, 1 = todos los conceptos correctos).
- "feedback": una frase breve y alentadora.
Devuelve SOLO JSON: {"covered":["..."],"missing":["..."],"misconceptions":["..."],"ratio":0.0,"feedback":"..."}`,
        },
        {
          role: 'user',
          content: `Conceptos clave:\n${concepts.map((concept, index) => `${index + 1}. ${concept}`).join('\n')}\n\nRespuesta del estudiante:\n${text}`,
        },
      ], { temperature: 0.2, max_tokens: 1500 }, env);
      const parsed = parseJsonObject(raw);
      covered = Array.isArray(parsed?.covered) ? parsed.covered.map((item: any) => String(item)) : [];
      missing = Array.isArray(parsed?.missing) ? parsed.missing.map((item: any) => String(item)) : [];
      misconceptions = Array.isArray(parsed?.misconceptions) ? parsed.misconceptions.map((item: any) => String(item)) : [];
      ratio = normalizeRatio(parsed?.ratio);
    } catch (error) {
      console.warn('Calificación IA de recuerdo falló, usando coincidencia simple:', (error as Error)?.message);
      covered = concepts.filter((concept) => textMatches(text, concept));
      missing = concepts.filter((concept) => !textMatches(text, concept));
      ratio = concepts.length ? covered.length / concepts.length : 0;
    }
  }

  return {
    ratio,
    feedback: {
      memoria: `Cubriste ${covered.length} de ${concepts.length} conceptos clave.`,
      cobertura: missing.length ? `Faltó mencionar: ${missing.join(', ')}.` : 'Cobertura conceptual completa.',
      organizacion: misconceptions.length ? `Revisa estas ideas: ${misconceptions.join('; ')}.` : 'Sin ideas incorrectas detectadas.',
      general: `Recuerdo libre evaluado sobre ${maxScore} puntos.`,
    },
    details: { covered, missing, misconceptions, key_concepts: concepts },
  };
}

async function gradeSummary(set: any, answers: any, maxScore: number, env: Env) {
  const text = String(answers?.text || '').trim().slice(0, 4000);
  const words = wordCount(text);
  const keyPoints: string[] = set.key_points || [];
  let coverage = 0;
  let fidelity = 0;
  let synthesis = 0;
  let missing: string[] = [];
  let feedbackText = '';

  if (words < 10) {
    missing = keyPoints;
  } else {
    try {
      const raw = await callAI(AI_MODEL_NORMAL, [
        {
          role: 'system',
          content: `Eres un profesor que evalúa un resumen.
Criterios (0 a 1 cada uno):
- "coverage": cuántas ideas clave conserva.
- "fidelity": si no inventa ni distorsiona la información del texto fuente.
- "synthesis": si jerarquiza y condensa en vez de copiar fragmentos.
- "missing": ideas clave ausentes.
- "feedback": frase breve.
Devuelve SOLO JSON: {"coverage":0.0,"fidelity":0.0,"synthesis":0.0,"missing":["..."],"feedback":"..."}`,
        },
        {
          role: 'user',
          content: `Texto fuente:\n${set.source_text}\n\nIdeas clave:\n${keyPoints.map((point, index) => `${index + 1}. ${point}`).join('\n')}\n\nResumen del estudiante (${words} palabras):\n${text}`,
        },
      ], { temperature: 0.2, max_tokens: 1500 }, env);
      const parsed = parseJsonObject(raw);
      coverage = normalizeRatio(parsed?.coverage);
      fidelity = normalizeRatio(parsed?.fidelity);
      synthesis = normalizeRatio(parsed?.synthesis);
      missing = Array.isArray(parsed?.missing) ? parsed.missing.map((item: any) => String(item)) : [];
      feedbackText = String(parsed?.feedback || '').trim();
    } catch (error) {
      console.warn('Calificación IA de resumen falló, usando coincidencia simple:', (error as Error)?.message);
      const found = keyPoints.filter((point) => textMatches(text, point));
      missing = keyPoints.filter((point) => !textMatches(text, point));
      coverage = keyPoints.length ? found.length / keyPoints.length : 0;
      fidelity = 0.7;
      synthesis = 0.7;
    }
  }

  const minWords = Number(set.min_words) || 60;
  const maxWords = Number(set.max_words) || 90;
  let lengthFactor = 1;
  if (words < minWords) lengthFactor = Math.max(0, words / minWords);
  else if (words > maxWords) lengthFactor = Math.max(0.5, maxWords / words);
  const ratio = (0.5 * coverage + 0.3 * fidelity + 0.2 * synthesis) * lengthFactor;

  return {
    ratio,
    feedback: {
      sintesis: `Resumen de ${words} palabras (límite ${minWords}-${maxWords}).`,
      cobertura: missing.length ? `Faltó incluir: ${missing.join(', ')}.` : 'Conservaste todas las ideas clave.',
      fidelidad: feedbackText || (fidelity >= 0.7 ? 'El resumen es fiel al texto fuente.' : 'Revisa si algunas ideas se distorsionaron.'),
      general: `Síntesis evaluada sobre ${maxScore} puntos.`,
    },
    details: { words, min_words: minWords, max_words: maxWords, coverage, fidelity, synthesis, missing },
  };
}

function edgeKey(a: string, b: string): string {
  const left = normalizeText(a);
  const right = normalizeText(b);
  return left < right ? `${left}|${right}` : `${right}|${left}`;
}

async function gradeConceptMap(set: any, answers: any) {
  const reference = Array.isArray(set.edges) ? set.edges : [];
  const submitted = (Array.isArray(answers?.edges) ? answers.edges : [])
    .map((edge: any) => ({
      from: String(edge?.from || '').trim(),
      to: String(edge?.to || '').trim(),
      label: String(edge?.label || '').trim(),
    }))
    .filter((edge: any) => edge.from && edge.to && edge.from !== edge.to && edge.label)
    .slice(0, 20);

  const submittedByPair = new Map<string, any[]>();
  for (const edge of submitted) {
    const key = edgeKey(edge.from, edge.to);
    submittedByPair.set(key, [...(submittedByPair.get(key) || []), edge]);
  }

  const matches = [];
  const missing = [];
  for (const edge of reference) {
    const candidates = submittedByPair.get(edgeKey(edge.from, edge.to)) || [];
    const match = candidates.find((candidate) => textMatches(candidate.label, edge.label) || textMatches(edge.label, candidate.label));
    if (match) matches.push({ ...edge, student_label: match.label });
    else missing.push(edge);
  }

  const usedKeys = new Set(matches.map((edge: any) => edgeKey(edge.from, edge.to)));
  const extra = submitted.filter((edge: any) => !usedKeys.has(edgeKey(edge.from, edge.to)));
  const ratio = reference.length ? matches.length / reference.length : 0;

  return {
    ratio,
    feedback: {
      relaciones: `Conectaste correctamente ${matches.length} de ${reference.length} relaciones esperadas.`,
      organizacion: missing.length ? `Faltaron relaciones como: ${missing.slice(0, 3).map((edge: any) => `${edge.from} → ${edge.to}`).join('; ')}.` : 'Mapa completo.',
      precision: extra.length ? `Hay ${extra.length} relación(es) que no forman parte del mapa de referencia.` : 'Sin relaciones incorrectas.',
      general: `Mapa conceptual evaluado sobre ${reference.length} relaciones.`,
    },
    details: { matches, missing, extra, total_reference: reference.length },
  };
}

async function saveSubmission(env: Env, assignmentId: string, userDni: string, type: ActivityType, score: number, maxScore: number, feedback: any) {
  const ownerDni = userDni.toUpperCase();
  const existing = await env.MIRAI_AI_DB.prepare(
    'SELECT id FROM submissions WHERE assignment_id = ? AND UPPER(user_dni) = UPPER(?)'
  ).bind(assignmentId, ownerDni).first<any>();
  const feedbackJson = JSON.stringify(feedback);
  const fileUrl = `activity://${type}`;

  let submissionId = existing?.id;
  if (existing) {
    await env.MIRAI_AI_DB.prepare(
      `UPDATE submissions
          SET file_url = ?, status = 'evaluated', score = ?, feedback = ?,
              graded_at = datetime('now'), attempt_type = ?, submitted_at = datetime('now')
        WHERE id = ?`
    ).bind(fileUrl, score, feedbackJson, type, submissionId).run();
  } else {
    submissionId = crypto.randomUUID();
    await env.MIRAI_AI_DB.prepare(
      `INSERT INTO submissions
         (id, assignment_id, user_dni, file_url, status, score, feedback, graded_at,
          submitted_at, attempt_type, retry_used)
       VALUES (?, ?, ?, ?, 'evaluated', ?, ?, datetime('now'), datetime('now'), ?, 0)`
    ).bind(submissionId, assignmentId, ownerDni, fileUrl, score, feedbackJson, type).run();
  }
  return submissionId;
}

export async function handleActivityApi(
  request: Request,
  env: Env,
  url: URL,
  path: string,
  corsHeaders: Record<string, string>,
): Promise<Response | null> {
  if (!path.startsWith('/api/activity/')) return null;

  const userDni = await requireAuth(request, env);
  if (!userDni) return jsonResponse({ error: 'No autorizado' }, 401, corsHeaders);

  await ensureActivityTables(env);

  if (path === '/api/activity/start' && request.method === 'POST') {
    try {
      const body = await request.json<any>().catch(() => ({}));
      const assignmentId = String(body?.assignment_id || '').trim();
      const type = parseActivityType(body?.type);
      if (!assignmentId || !type) return jsonResponse({ error: 'Faltan assignment_id o type válido' }, 400, corsHeaders);

      const assignment = await getAssignment(assignmentId, userDni, env);
      if (!assignment) return jsonResponse({ error: 'Tarea no encontrada o sin acceso' }, 404, corsHeaders);

      const locked = await methodLock(env, assignmentId, userDni, type);
      if (locked) {
        return jsonResponse({ error: `Ya elegiste otra forma de hacer esta tarea (${locked}).` }, 409, corsHeaders);
      }

      const existing = await env.MIRAI_AI_DB.prepare(
        'SELECT attempt_type, file_url, status, score, feedback FROM submissions WHERE assignment_id = ? AND UPPER(user_dni) = UPPER(?)'
      ).bind(assignmentId, userDni).first<any>();
      if (existing && existing.status !== 'reset' && inferSubmissionType(existing) === type) {
        let feedback: Record<string, unknown> = {};
        try {
          feedback = JSON.parse(String(existing.feedback || '{}'));
        } catch {
          feedback = {};
        }
        return jsonResponse({
          type,
          assignment_id: assignmentId,
          already_graded: true,
          score: Number(existing.score) || 0,
          max_score: Math.max(1, Math.round(Number(assignment.max_score) || 100)),
          feedback,
        }, 200, corsHeaders);
      }

      let set = await loadSet(env, assignmentId, type);
      if (!set) {
        set = await generateSet(assignment, type, env);
        await saveSet(env, assignmentId, type, set);
      }

      const dueMap = type === 'flashcards' ? await loadReviewMap(env, assignmentId, userDni) : undefined;
      return jsonResponse({ type, assignment_id: assignmentId, ...sanitizeSet(type, set, dueMap) }, 200, corsHeaders);
    } catch (error: any) {
      console.error('Error generando actividad:', error);
      return jsonResponse({ error: 'No se pudo preparar la actividad. Inténtalo de nuevo.' }, 502, corsHeaders);
    }
  }

  if (path === '/api/activity/grade' && request.method === 'POST') {
    try {
      const body = await request.json<any>().catch(() => ({}));
      const assignmentId = String(body?.assignment_id || '').trim();
      const type = parseActivityType(body?.type);
      if (!assignmentId || !type) return jsonResponse({ error: 'Faltan assignment_id o type válido' }, 400, corsHeaders);

      const assignment = await getAssignment(assignmentId, userDni, env);
      if (!assignment) return jsonResponse({ error: 'Tarea no encontrada o sin acceso' }, 404, corsHeaders);

      const locked = await methodLock(env, assignmentId, userDni, type);
      if (locked) {
        return jsonResponse({ error: `Ya elegiste otra forma de hacer esta tarea (${locked}).` }, 409, corsHeaders);
      }

      const alreadyGraded = await env.MIRAI_AI_DB.prepare(
        'SELECT attempt_type, file_url, status FROM submissions WHERE assignment_id = ? AND UPPER(user_dni) = UPPER(?)'
      ).bind(assignmentId, userDni).first<any>();
      if (alreadyGraded && alreadyGraded.status !== 'reset' && inferSubmissionType(alreadyGraded) === type) {
        return jsonResponse({ error: 'Ya completaste esta actividad. Tu nota ya está guardada.' }, 409, corsHeaders);
      }

      const set = await loadSet(env, assignmentId, type);
      if (!set) return jsonResponse({ error: 'La actividad no está preparada. Vuelve a abrirla.' }, 409, corsHeaders);

      const maxScore = Math.max(1, Math.round(Number(assignment.max_score) || 100));
      const answers = body?.answers || {};
      let graded: { ratio: number; feedback: Record<string, string>; details: any };

      if (type === 'flashcards') graded = await gradeFlashcards(set, answers, env, assignmentId, userDni);
      else if (type === 'find_error') graded = await gradeFindError(set, answers);
      else if (type === 'recall') graded = await gradeRecall(set, answers, maxScore, env);
      else if (type === 'summary') graded = await gradeSummary(set, answers, maxScore, env);
      else graded = await gradeConceptMap(set, answers);

      const score = scoreToMax(graded.ratio, maxScore);
      const feedback = { ...graded.feedback, general: graded.feedback.general || `Actividad completada: ${score}/${maxScore}.` };
      const submissionId = await saveSubmission(env, assignmentId, userDni, type, score, maxScore, feedback);

      const attemptId = crypto.randomUUID();
      await env.MIRAI_AI_DB.prepare(
        `INSERT INTO activity_attempts
           (id, assignment_id, user_dni, type, answers, result, score, max_score)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        attemptId, assignmentId, userDni.toUpperCase(), type,
        JSON.stringify(answers).slice(0, 20000),
        JSON.stringify({ feedback, details: graded.details }).slice(0, 20000),
        score, maxScore,
      ).run();

      return jsonResponse({
        success: true,
        assignment_id: assignmentId,
        type,
        submission_id: submissionId,
        attempt_id: attemptId,
        score,
        max_score: maxScore,
        feedback,
        details: graded.details,
      }, 200, corsHeaders);
    } catch (error: any) {
      console.error('Error calificando actividad:', error);
      return jsonResponse({ error: 'No se pudo calificar la actividad. Inténtalo de nuevo.' }, 502, corsHeaders);
    }
  }

  return jsonResponse({ error: 'Ruta no encontrada' }, 404, corsHeaders);
}
