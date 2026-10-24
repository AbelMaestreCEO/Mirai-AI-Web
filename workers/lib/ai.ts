/* ============================================
   MIRAI AI - Llamadas al modelo de texto
   DeepSeek directo (sin respaldo vía Cloudflare), lectura de streams SSE y
   reintento cuando el modelo se queda sin espacio razonando.
   ============================================ */
import { calcCost, logApiUsage } from './usage';

// Lee un stream SSE estilo OpenAI separando la cadena de pensamiento
// (reasoning_content) del texto final (content). Devuelve ambos por separado:
// antes se concatenaba `content || reasoning`, de modo que cuando el modelo sólo
// emitía razonamiento el usuario veía el monólogo interno como si fuese la
// respuesta. `onDelta` permite reenviar cada trozo al cliente en vivo.
export type AIDeltaKind = 'reasoning' | 'content' | 'reset';

type AIDeltaHandler = (kind: AIDeltaKind, text: string) => void | Promise<void>;

interface AIResultMeta {
  reasoning?: string;
  finishReason?: string | null;
}

async function readSSEStream(response: Response, usageOut: { usage?: any } | null = null, onDelta: AIDeltaHandler | null = null) {
  let content = '';
  let reasoning = '';
  let finishReason: string | null = null;
  if (!response.body) throw new Error('Respuesta sin cuerpo: no hay stream que leer');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === '[DONE]') continue;
      try {
        const chunk = JSON.parse(payload);
        const choice = chunk.choices?.[0];
        const delta = choice?.delta;
        // 'length' significa que se agotó max_tokens: la respuesta viene cortada.
        if (choice?.finish_reason) finishReason = choice.finish_reason;
        // reasoning_content: DeepSeek. reasoning: GLM y otros proveedores OpenAI-like.
        const thought = delta?.reasoning_content ?? delta?.reasoning;
        if (thought) {
          reasoning += thought;
          if (onDelta) await onDelta('reasoning', thought);
        }
        if (delta?.content) {
          content += delta.content;
          if (onDelta) await onDelta('content', delta.content);
        }
        if (usageOut && chunk.usage) usageOut.usage = chunk.usage;
      } catch {}
    }
  }
  return { content, reasoning, finishReason };
}

// Razonamiento y respuesta se mantienen SEPARADOS. Antes, si el modelo se
// quedaba sin tokens razonando y no llegaba a escribir nada, el monólogo interno
// se promocionaba a respuesta y el usuario veía en pantalla "We need to parse the
// user's message...". Ahora ese caso devuelve texto vacío y quien llama decide
// qué hacer (en el chat: pedirle la conclusión, ver completeTruncatedAnswer).
function splitAIResult({ content, reasoning, finishReason }: { content: string; reasoning: string; finishReason: string | null }) {
  return {
    text: content || '',
    reasoning: reasoning || '',
    finishReason: finishReason || null
  };
}

// options.onDelta(tipo, texto) — se invoca por cada trozo recibido del modelo.
// options.metaOut — objeto donde se dejan {reasoning, finishReason} de la llamada.
// options.thinking — false por defecto: DeepSeek razona solo si se pide.
// options.reasoningEffort — none/low/high/max (con thinking activado).
export type ReasoningEffort = 'none' | 'low' | 'high' | 'max';

export interface CallAIOptions {
  temperature?: number;
  max_tokens?: number;
  thinking?: boolean;
  reasoningEffort?: ReasoningEffort;
  onDelta?: AIDeltaHandler | null;
  metaOut?: AIResultMeta;
}

export async function callAI(model: string, messages: any[], options: CallAIOptions = {}, env: Env) {
  const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';

  console.log(`🚀 Llamando DeepSeek directo: ${model}`);

  const onDelta = typeof options.onDelta === 'function' ? options.onDelta : null;
  const metaOut = options.metaOut || {};
  metaOut.reasoning = '';
  metaOut.finishReason = null;

  const response = await fetch(DEEPSEEK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${env.DEEPSEEK_API_KEY}`
    },
    body: JSON.stringify({
      model,
      messages,
      // DeepSeek razona por defecto (effort high). Aquí se apaga salvo que la
      // ruta lo pida expresamente.
      thinking: { type: options.thinking === true ? 'enabled' : 'disabled' },
      ...(options.thinking === true && options.reasoningEffort
        ? { reasoning_effort: options.reasoningEffort }
        : {}),
      temperature: options.temperature ?? 0.7,
      // Sin tope propio: si la ruta no fija max_tokens, se usa el de DeepSeek
      // (8K sin pensar, 64K pensando) en vez de cortar la respuesta.
      ...(options.max_tokens != null ? { max_tokens: options.max_tokens } : {}),
      stream: true,
      stream_options: { include_usage: true }
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`DeepSeek error ${response.status}: ${err}`);
  }

  const usageOut: { usage?: any } = {};
  const raw = await readSSEStream(response, usageOut, onDelta);
  const result = splitAIResult(raw);

  metaOut.reasoning = result.reasoning;
  metaOut.finishReason = result.finishReason;

  await logApiUsage(env, {
    provider: 'deepseek',
    unit_type: 'tokens',
    sub_type: model,
    tokens_in: usageOut.usage?.prompt_tokens ?? null,
    tokens_out: usageOut.usage?.completion_tokens ?? null,
    cost_usd: calcCost('deepseek', model, {
      tokensIn: usageOut.usage?.prompt_tokens ?? 0,
      tokensOut: usageOut.usage?.completion_tokens ?? 0,
      cacheHitTokens: usageOut.usage?.prompt_cache_hit_tokens ?? 0
    })
  });

  return result.text;
}

// ── GARANTÍA DE RESPUESTA ─────────────────────────────────────
// Los modelos con cadena de pensamiento pueden gastar todo max_tokens razonando
// y terminar sin escribir una sola palabra para el usuario. Antes eso se veía en
// pantalla como un monólogo en inglés ("We need to parse the user's message…").
// Aquí se detecta y se le pide la conclusión, con su propio razonamiento delante.

export const REASONING_STYLE_NOTE = `

[ESTILO DE RAZONAMIENTO]
Piensa lo justo antes de responder y escribe siempre una respuesta. No deliberes contigo misma sobre tus propias reglas ni sobre cómo cumplirlas: aplícalas directamente. Si dos instrucciones parecen chocar, elige la más específica, sigue adelante y responde; jamás te quedes sin contestar por haber pensado de más.`;

// El reintento reescribe el último turno en lugar de añadir uno nuevo: así se
// mantiene la alternancia usuario/asistente que exigen los modelos razonadores.
function buildAnswerRetryMessages(aiMessages: any[], reasoning: string) {
  const lastTurn = aiMessages[aiMessages.length - 1];
  // La conclusión suele estar al final del razonamiento, así que se conserva
  // la cola y no la cabeza.
  const tail = reasoning.slice(-3000);

  const notice = `

[AVISO DEL SISTEMA] En tu intento anterior gastaste todo el espacio razonando y no llegaste a escribir nada para el usuario. Este era tu razonamiento:
"""
${tail}
"""
Escribe AHORA únicamente la respuesta final para el usuario, en su idioma y respetando todas tus reglas. No razones más, no expliques este aviso y no menciones que hubo ningún problema.`;

  // Con imágenes el contenido es una lista de partes: el aviso va como un
  // trozo de texto más, detrás, y las imágenes se quedan.
  const content = Array.isArray(lastTurn.content)
    ? [...lastTurn.content, { type: 'text', text: notice.trim() }]
    : `${lastTurn.content}${notice}`;

  return [
    ...aiMessages.slice(0, -1),
    { role: lastTurn.role, content }
  ];
}

// Envoltura de callAI para las rutas de conversación: garantiza que se devuelve
// texto visible o se lanza un error, nunca el monólogo interno.
export async function callAIEnsuringAnswer({ aiModel, aiMessages, aiOptions, env, onDelta = null }: {
  aiModel: string; aiMessages: any[]; aiOptions: CallAIOptions; env: Env; onDelta?: AIDeltaHandler | null;
}) {
  const meta: AIResultMeta = {};
  let text = await callAI(aiModel, aiMessages, { ...aiOptions, onDelta, metaOut: meta }, env);
  let reasoning = meta.reasoning || '';

  if (meta.finishReason === 'length') {
    console.warn('⚠️ El modelo cortó por límite de tokens (finish_reason=length).');
  }

  if (!text.trim() && reasoning.trim()) {
    console.warn(`⚠️ Respuesta vacía (finish_reason=${meta.finishReason}); pidiendo la conclusión al modelo.`);
    const retryMeta: AIResultMeta = {};
    const retryOptions = { ...aiOptions };
    // Solo se sube el techo si la ruta ya lo había fijado; sin techo, se deja
    // el valor por defecto de DeepSeek.
    if (retryOptions.max_tokens != null) {
      retryOptions.max_tokens = Math.max(retryOptions.max_tokens, 3000);
    }
    text = await callAI(
      aiModel,
      buildAnswerRetryMessages(aiMessages, reasoning),
      { ...retryOptions, onDelta, metaOut: retryMeta },
      env
    );
    reasoning = [reasoning, retryMeta.reasoning].filter(part => part && part.trim()).join('\n\n');
  }

  if (!text.trim()) {
    throw new Error('El modelo terminó sin escribir una respuesta. Vuelve a intentarlo.');
  }

  return { text, reasoning };
}
