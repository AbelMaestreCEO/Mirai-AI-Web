/* ============================================
   MIRAI AI - Cliente de la API REST de Pruna AI
   Predicciones de imagen y vídeo (Try-Sync y polling).
   ============================================ */

// Descarga la salida de una predicción de Pruna, sea una URL de entrega o un
// data URI en base64. Los dos formatos aparecen según el modelo, y antes cada
// handler repetía el mismo bloque de 20 líneas para resolverlos.
export async function fetchPrunaOutputBuffer(env: Env, outputRef: any, label = 'archivo') {
  let buffer;

  if (outputRef.startsWith('http://') || outputRef.startsWith('https://')) {
    // El endpoint de entrega de Pruna exige el header apikey igual que el resto de su API.
    const headers: Record<string, string> = { 'User-Agent': 'Cloudflare-Worker' };
    if (new URL(outputRef).hostname.endsWith('pruna.ai')) {
      headers['apikey'] = requirePrunaApiKey(env);
    }
    const res = await fetch(outputRef, { headers });
    if (!res.ok) throw new Error(`Error descargando ${label}: Status ${res.status}`);
    buffer = await res.arrayBuffer();
  } else {
    const cleanBase64 = outputRef.replace(/^data:[a-z]+\/[a-z0-9.+-]+;base64,/i, '').trim();
    if (cleanBase64.length < 100) throw new Error(`Respuesta de Pruna sin ${label} válido`);
    const binaryString = atob(cleanBase64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
    buffer = bytes.buffer;
  }

  if (!buffer || buffer.byteLength === 0) {
    throw new Error(`El ${label} descargado desde Pruna está vacío`);
  }
  return buffer;
}

// La generación de vídeo avatar (TTS + lip-sync) puede tardar varios minutos.
// Cloudflare no puede mantener una respuesta HTTP abierta tanto tiempo, así que
// el trabajo se lanza en segundo plano (ctx.waitUntil) y el cliente hace polling
// del estado por id, en vez de esperar la respuesta de env.AI.run() en línea.
// El binding env.AI (Workers AI / AI Gateway) espera la respuesta completa en
// una sola llamada, y Cloudflare corta cualquier ejecución (incluido
// ctx.waitUntil) a los ~30s — muy por debajo de lo que tarda un vídeo con
// lip-sync. Por eso aquí se llama DIRECTO a la API REST de Pruna en modo
// asíncrono (sin "Try-Sync"): crear la predicción es rápido (Pruna la sigue
// procesando en sus propios servidores), y el estado se consulta con
// peticiones cortas y acotadas desde el polling del cliente — nunca esperamos
// dentro de una sola invocación del Worker.
const PRUNA_API_BASE = 'https://api.pruna.ai/v1';

function requirePrunaApiKey(env: Env) {
  const apiKey = env.PRUNA_API_KEY;
  if (!apiKey) {
    throw new Error(
      'PRUNA_API_KEY no está configurada en el Worker. Configúrala con: npx wrangler secret put PRUNA_API_KEY'
    );
  }
  return apiKey;
}

// Crea una predicción en la API REST directa de Pruna. Por defecto en modo
// asíncrono (sin header Try-Sync): Pruna acepta la petición y devuelve
// enseguida un id + estado inicial, y sigue procesándola en sus propios
// servidores (usado por el avatar, que tarda varios minutos). Con
// { trySync: true } agrega el header Try-Sync, que hace que Pruna espere
// hasta 60s en su propio servidor y devuelva el resultado ya terminado en la
// misma respuesta — lo usan p-image/p-image-edit/p-video, que generan en
// segundos.
// Pruna no publica tipos: solo se declaran los campos que se leen aquí.
export type PrunaInput = Record<string, any>;

interface PrunaPrediction {
  id?: string;
  status?: string;
  error?: string;
  detail?: string;
  output?: any;
  result?: any;
  [field: string]: any;
}

export async function createPrunaPrediction(env: Env, modelId: string, input: PrunaInput, { trySync = false } = {}): Promise<PrunaPrediction> {
  const apiKey = requirePrunaApiKey(env);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'apikey': apiKey,
    'Model': modelId,
  };
  if (trySync) headers['Try-Sync'] = 'true';

  const res = await fetch(`${PRUNA_API_BASE}/predictions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ input }),
  });

  const data: PrunaPrediction = await res.json<PrunaPrediction>().catch(() => ({}));
  if (!res.ok) {
    console.error('❌ createPrunaPrediction error:', res.status, JSON.stringify(data).substring(0, 500));
    throw new Error(`Pruna rechazó la predicción (${res.status}): ${data.error || data.detail || JSON.stringify(data).substring(0, 200)}`);
  }
  // En modo Try-Sync, Pruna puede devolver el resultado ya resuelto (status +
  // generation_url) sin un id de predicción — solo exigir `id` en modo async.
  if (!data.id && !trySync) {
    throw new Error(`Pruna no devolvió un id de predicción: ${JSON.stringify(data).substring(0, 300)}`);
  }
  return data;
}

export async function getPrunaPrediction(env: Env, predictionId: string): Promise<PrunaPrediction> {
  const apiKey = requirePrunaApiKey(env);
  // Endpoint real según la documentación oficial de Pruna
  // (https://docs.api.pruna.ai): /v1/predictions/status/{id}, no /v1/predictions/{id}.
  const res = await fetch(`${PRUNA_API_BASE}/predictions/status/${predictionId}`, {
    headers: { 'apikey': apiKey },
  });
  const data: PrunaPrediction = await res.json<PrunaPrediction>().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Error consultando la predicción en Pruna (${res.status}): ${JSON.stringify(data).substring(0, 300)}`);
  }
  return data;
}

// Extrae una URL (o base64) de vídeo desde una respuesta de predicción de Pruna.
// El campo documentado es 'generation_url'; se dejan otros nombres como respaldo
// por si el esquema varía entre modelos.
export function extractPrunaOutputUrl(prediction: PrunaPrediction) {
  const candidates = [
    prediction.generation_url,
    prediction.output,
    prediction.video,
    prediction.video_url,
    prediction.result?.video,
    prediction.result?.output,
    prediction.urls?.output,
    prediction.urls?.get,
  ];
  for (let c of candidates) {
    if (Array.isArray(c)) c = c[0];
    if (typeof c === 'string' && c.trim()) return c.trim();
    if (c && typeof c === 'object') {
      if (typeof c.video === 'string') return c.video.trim();
      if (typeof c.url === 'string') return c.url.trim();
    }
  }
  return null;
}

const PRUNA_TERMINAL_OK = ['succeeded', 'success', 'completed'];

const PRUNA_TERMINAL_FAIL = ['failed', 'canceled', 'cancelled', 'error'];

// Genera vía la API REST directa de Pruna en modo síncrono (Try-Sync) y
// devuelve la predicción ya terminada. p-image/p-image-edit/p-video/
// p-image-upscale/p-judger resuelven en segundos (muy por debajo del límite de
// 60s de Try-Sync), así que en el caso normal esto resuelve en una sola llamada
// HTTP sin ningún polling. Si por lo que sea Pruna todavía no terminó al
// responder (no garantizado al 100% por su documentación), cae a un polling
// corto y acotado como red de seguridad antes de fallar.
//
// La mayoría de modelos devuelven un fichero y les sirve resolvePrunaSync, que
// extrae la URL. p-judger devuelve JSON con las puntuaciones, no un fichero,
// por eso el acceso a la predicción cruda vive en su propia función.
export async function resolvePrunaSyncPrediction(env: Env, modelId: string, input: PrunaInput) {
  let prediction = await createPrunaPrediction(env, modelId, input, { trySync: true });
  let attempts = 0;
  while (
    !PRUNA_TERMINAL_OK.includes((prediction.status || '').toLowerCase()) &&
    !PRUNA_TERMINAL_FAIL.includes((prediction.status || '').toLowerCase()) &&
    attempts < 5
  ) {
    if (!prediction.id) break; // sin id no hay nada que consultar, cortar acá
    await new Promise(r => setTimeout(r, 2000));
    prediction = await getPrunaPrediction(env, prediction.id);
    attempts++;
  }

  const status = (prediction.status || '').toLowerCase();
  if (PRUNA_TERMINAL_FAIL.includes(status)) {
    throw new Error(prediction.error || prediction.detail || `Pruna (${modelId}) falló la generación`);
  }

  return prediction;
}

export async function resolvePrunaSync(env: Env, modelId: string, input: PrunaInput) {
  const prediction = await resolvePrunaSyncPrediction(env, modelId, input);
  const outputRef = extractPrunaOutputUrl(prediction);
  if (!outputRef) {
    throw new Error(`Pruna (${modelId}) no devolvió una salida reconocible: ${JSON.stringify(prediction).substring(0, 300)}`);
  }
  return outputRef;
}
