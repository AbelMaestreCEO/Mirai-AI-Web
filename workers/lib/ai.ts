/* ============================================
   MIRAI AI - Llamadas al modelo de texto
   DeepSeek directo con fallback a Workers AI, lectura de streams SSE y
   reintento cuando el modelo se queda sin espacio razonando.
   ============================================ */
import { calcCost, logApiUsage } from './usage';

// --- CONFIGURACIÓN ---
function getAIGatewayURL(env: Env) {
  return `https://gateway.ai.cloudflare.com/v1/${env.CF_ACCOUNT_ID}/default/compat/chat/completions`;
}

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
export interface CallAIOptions {
  temperature?: number;
  max_tokens?: number;
  onDelta?: AIDeltaHandler | null;
  metaOut?: AIResultMeta;
}

export async function callAI(model: string, messages: any[], options: CallAIOptions = {}, env: Env) {
  const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';
  const FALLBACK_MODEL = '@cf/zai-org/glm-5.2';

  console.log(`🚀 Llamando DeepSeek directo: ${model}`);

  const onDelta = typeof options.onDelta === 'function' ? options.onDelta : null;
  const metaOut = options.metaOut || {};
  metaOut.reasoning = '';
  metaOut.finishReason = null;

  let deepseekResult: string | null = null;
  let deepseekUsage: any = null;

  try {
    const response = await fetch(DEEPSEEK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.max_tokens ?? 2000,
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

    // El registro de consumo va FUERA del try que dispara el fallback: si D1
    // fallaba al anotar el gasto, el catch descartaba una respuesta ya generada
    // y volvía a generarla entera con GLM — el doble de coste y de latencia por
    // un fallo de contabilidad. logApiUsage ya es best-effort por dentro.
    deepseekResult = result.text;
    metaOut.reasoning = result.reasoning;
    metaOut.finishReason = result.finishReason;
    deepseekUsage = usageOut.usage;

  } catch (err) {
    console.warn(`⚠️ DeepSeek falló: ${err.message}. Usando fallback GLM...`);

    // El fallback regenera la respuesta desde cero: si ya se habían enviado
    // trozos al cliente hay que decirle que descarte lo pintado hasta ahora.
    if (onDelta) await onDelta('reset', '');

    const gwUrl = getAIGatewayURL(env);
    const fallbackResponse = await fetch(gwUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'cf-aig-authorization': `Bearer ${env.AI_GATEWAY_KEY}`
      },
      body: JSON.stringify({
        model: FALLBACK_MODEL,
        messages,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.max_tokens ?? 2000,
        stream: true
      })
    });

    if (!fallbackResponse.ok) {
      const fallbackErr = await fallbackResponse.text();
      throw new Error(`Fallback GLM error ${fallbackResponse.status}: ${fallbackErr}`);
    }

    const fallbackResult = splitAIResult(await readSSEStream(fallbackResponse, null, onDelta));
    metaOut.reasoning = fallbackResult.reasoning;
    metaOut.finishReason = fallbackResult.finishReason;
    await logApiUsage(env, {
      provider: 'deepseek_fallback_gateway',
      unit_type: 'call',
      sub_type: FALLBACK_MODEL,
      via_gateway: true,
      cost_usd: 0
    });
    return fallbackResult.text;
  }

  await logApiUsage(env, {
    provider: 'deepseek',
    unit_type: 'tokens',
    sub_type: model,
    tokens_in: deepseekUsage?.prompt_tokens ?? null,
    tokens_out: deepseekUsage?.completion_tokens ?? null,
    cost_usd: calcCost('deepseek', model, {
      tokensIn: deepseekUsage?.prompt_tokens ?? 0,
      tokensOut: deepseekUsage?.completion_tokens ?? 0,
      cacheHitTokens: deepseekUsage?.prompt_cache_hit_tokens ?? 0
    })
  });

  return deepseekResult;
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

  return [
    ...aiMessages.slice(0, -1),
    {
      role: lastTurn.role,
      content: `${lastTurn.content}

[AVISO DEL SISTEMA] En tu intento anterior gastaste todo el espacio razonando y no llegaste a escribir nada para el usuario. Este era tu razonamiento:
"""
${tail}
"""
Escribe AHORA únicamente la respuesta final para el usuario, en su idioma y respetando todas tus reglas. No razones más, no expliques este aviso y no menciones que hubo ningún problema.`
    }
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
    const retryOptions = { ...aiOptions, max_tokens: Math.max(aiOptions.max_tokens ?? 2000, 3000) };
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
