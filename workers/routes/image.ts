/* ============================================
   MIRAI AI - Imágenes: generación, edición, upscale y evaluación

   ============================================ */
import { callAI } from '../lib/ai';
import { AI_MODEL_NORMAL } from '../lib/ai-models';
import { requireAuth } from '../lib/auth';
import { jsonResponse } from '../lib/http';
import { buildMiraiSystemPrompt } from '../lib/persona';
import {
  type PrunaInput,
  fetchPrunaOutputBuffer,
  resolvePrunaSync,
  resolvePrunaSyncPrediction,
} from '../lib/pruna';
import { calcCost, logApiUsage } from '../lib/usage';
import { ensureConversationExists, saveMessage, updateConversationTimestamp } from './conversations';
import { checkAndConsumeToken } from './plans';

// Valores aceptados por los modelos de imagen de Pruna. Se validan en el
// backend en vez de confiar en el frontend: un aspect_ratio inventado hace que
// Pruna rechace la predicción entera con un 400 poco descriptivo.
export const IMAGE_ASPECT_RATIOS = ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3'];

// Motores de generación de imagen disponibles. p-image es el de uso general;
// p-image-ideogram rinde mucho mejor cuando el prompt lleva texto/tipografía
// (carteles, logos, íconos con etiqueta), y su precio depende del nivel de
// "thinking" y del tamaño de salida — ver API_PRICING.pruna.ideogram.
const IMAGE_ENGINES = ['p-image', 'p-image-ideogram'];

const IDEOGRAM_THINKING_LEVELS = ['very low', 'low', 'medium', 'high', 'very high'];

const IDEOGRAM_IMAGE_SIZES = ['1K', '2K'];

// Normaliza las opciones de imagen que llegan del cliente. Todo lo que no esté
// en la lista blanca cae al valor por defecto: Pruna rechaza la predicción
// entera con un 400 si un enum no es exacto.
interface ImageOptions {
  engine?: string;
  aspect_ratio?: string;
  thinking?: string;
  image_size?: string;
  user_dni?: string | null;
}

function normalizeImageOptions(raw: ImageOptions = {}) {
  const engine = raw.engine && IMAGE_ENGINES.includes(raw.engine) ? raw.engine : 'p-image';
  const aspectRatio = raw.aspect_ratio && IMAGE_ASPECT_RATIOS.includes(raw.aspect_ratio) ? raw.aspect_ratio : '1:1';
  const thinking = raw.thinking && IDEOGRAM_THINKING_LEVELS.includes(raw.thinking) ? raw.thinking : 'high';
  const imageSize = raw.image_size && IDEOGRAM_IMAGE_SIZES.includes(raw.image_size) ? raw.image_size : '1K';
  return { engine, aspectRatio, thinking, imageSize };
}

// --- GENERAR IMAGEN CON PRUNA AI P-IMAGE / P-IMAGE-IDEOGRAM ---
async function generateAndStoreImage(prompt: any, conversationId: string, env: Env, options: ImageOptions = {}) {
  try {
    const { engine, aspectRatio, thinking, imageSize } = normalizeImageOptions(options);
    const userDni = options.user_dni || null;

    console.log(`🖼️ Iniciando generación con ${engine} (API directa de Pruna)`);
    console.log('🖼️ Prompt original:', prompt);

    // 1. Llamada directa a la API REST de Pruna (Try-Sync, ver resolvePrunaSync).
    //    Ideogram acepta además el nivel de "thinking" y el tamaño de salida,
    //    que son los que determinan su precio.
    const prunaInput: PrunaInput = { prompt: prompt, aspect_ratio: aspectRatio };
    if (engine === 'p-image-ideogram') {
      prunaInput.thinking = thinking;
      prunaInput.image_size = imageSize;
    }

    const outputRef = await resolvePrunaSync(env, engine, prunaInput);

    console.log(`✅ Pruna (${engine}) respondió:`, outputRef.substring(0, 80));

    // 2. Procesar: URL de descarga o Base64
    const imageBuffer = await fetchPrunaOutputBuffer(env, outputRef, 'imagen');
    console.log(`✅ Imagen obtenida: ${imageBuffer.byteLength} bytes`);

    // 3. Guardar en R2
    const imageId = crypto.randomUUID();
    const r2Key = `generated-images/${conversationId}/${imageId}.jpg`;

    await env.MIRAI_AI_ASSETS.put(r2Key, imageBuffer, {
      httpMetadata: { contentType: 'image/jpeg' },
      customMetadata: {
        conversation_id: conversationId,
        prompt: prompt.substring(0, 200),
        generated_at: new Date().toISOString(),
        model: engine
      }
    });

    // 4. Registrar en D1
    const imageUrl = `/api/image/${r2Key}`;
    await saveMessage(conversationId, 'assistant', imageUrl, env, null, null, null, null, 'image');

    console.log(`✨ Imagen generada exitosamente: ${imageUrl}`);
    await logApiUsage(env, {
      provider: 'pruna', unit_type: 'prediction', sub_type: engine,
      via_gateway: false, user_dni: userDni,
      cost_usd: calcCost('pruna', engine, { thinking, imageSize })
    });
    return imageUrl;

  } catch (error) {
    console.error('❌ Error en generateAndStoreImage:', error.message);
    throw error;
  }
}

// --- EDITAR IMAGEN CON PRUNA AI P-IMAGE-EDIT ---
export async function handleImageEdit(request: Request, env: Env, corsHeaders: Record<string, string>) {
  try {
    const userDni = await requireAuth(request, env);
    if (!userDni) {
      return jsonResponse({ error: 'No autenticado' }, 401, corsHeaders);
    }

    const tokenCheck = await checkAndConsumeToken(userDni, 'imagen', env);
    if (!tokenCheck.allowed) {
      return jsonResponse({
        error: `Has alcanzado el límite diario de ${tokenCheck.limit} imágenes. Vuelve a intentarlo mañana.`,
        token_limit_reached: true,
      }, 429, corsHeaders);
    }

    const { prompt, image_url, aspect_ratio } = await request.json<any>();

    if (!prompt || !image_url) {
      return jsonResponse({ error: 'Se requiere prompt e image_url' }, 400, corsHeaders);
    }

    let imageSource = image_url;
    if (image_url.startsWith('/api/image/')) {
      const origin = new URL(request.url).origin;
      imageSource = origin + image_url;
    }

    console.log('✏️ Iniciando edición con p-image-edit (API directa de Pruna)');
    console.log('✏️ Prompt:', prompt.substring(0, 100));

    const outputRef = await resolvePrunaSync(env, 'p-image-edit', {
      prompt: prompt,
      images: [imageSource],
      aspect_ratio: aspect_ratio || '1:1',
    });

    const imageBuffer = await fetchPrunaOutputBuffer(env, outputRef, 'imagen editada');

    const imageId = crypto.randomUUID();
    const conversationId = `edit_${Date.now()}`;
    const r2Key = `generated-images/${conversationId}/${imageId}.jpg`;

    await env.MIRAI_AI_ASSETS.put(r2Key, imageBuffer, {
      httpMetadata: { contentType: 'image/jpeg' },
      customMetadata: {
        prompt: prompt.substring(0, 200),
        generated_at: new Date().toISOString(),
        model: 'p-image-edit',
        source_image: image_url.substring(0, 200),
      }
    });

    const editedUrl = `/api/image/${r2Key}`;
    console.log(`✨ Imagen editada exitosamente: ${editedUrl}`);
    await logApiUsage(env, {
      provider: 'pruna', unit_type: 'prediction', sub_type: 'p-image-edit',
      via_gateway: false, user_dni: userDni, cost_usd: calcCost('pruna', 'p-image-edit')
    });

    return jsonResponse({
      image_url: editedUrl,
      prompt: prompt,
    }, 200, corsHeaders);

  } catch (error) {
    console.error('❌ handleImageEdit error:', error.message);
    return jsonResponse({
      error: 'Error al editar imagen: ' + error.message,
    }, 500, corsHeaders);
  }
}

// Convierte una referencia de imagen del cliente en una URL http(s) absoluta.
// Pruna descarga los inputs desde internet, así que una ruta relativa
// (/api/image/...) o un data URI no le sirven tal cual.
export async function toPublicImageUrl(env: Env, request: Request, userDni: string, imageRef: any) {
  if (imageRef.startsWith('http://') || imageRef.startsWith('https://')) return imageRef;

  const origin = new URL(request.url).origin;
  if (imageRef.startsWith('/api/')) return origin + imageRef;

  if (imageRef.startsWith('data:')) {
    const buffer = await downloadImageAsBuffer(imageRef);
    const r2Key = `image-uploads/${userDni.toLowerCase()}/${crypto.randomUUID()}.jpg`;
    await env.MIRAI_AI_ASSETS.put(r2Key, buffer, {
      httpMetadata: { contentType: 'image/jpeg' },
      customMetadata: { user_dni: userDni.toUpperCase(), uploaded_at: new Date().toISOString() }
    });
    return `${origin}/api/image/${r2Key}`;
  }

  throw new Error('Formato de imagen no reconocido');
}

// --- MEJORAR CALIDAD DE IMAGEN CON PRUNA AI P-IMAGE-UPSCALE ---
// El precio depende de los megapíxeles pedidos por tramos (1-4 MP → $0.005 …
// 65-128 MP → $0.12), no es fijo por imagen: ver upscalePriceForMegapixels().
const UPSCALE_MIN_MEGAPIXELS = 1;

const UPSCALE_MAX_MEGAPIXELS = 128;

const UPSCALE_DEFAULT_MEGAPIXELS = 4;

export async function handleImageUpscale(request: Request, env: Env, corsHeaders: Record<string, string>) {
  try {
    const userDni = await requireAuth(request, env);
    if (!userDni) return jsonResponse({ error: 'No autenticado' }, 401, corsHeaders);

    const tokenCheck = await checkAndConsumeToken(userDni, 'imagen', env);
    if (!tokenCheck.allowed) {
      return jsonResponse({
        error: `Has alcanzado el límite diario de ${tokenCheck.limit} imágenes. Vuelve a intentarlo mañana.`,
        token_limit_reached: true,
      }, 429, corsHeaders);
    }

    const { image_url, target, enhance_details, enhance_realism } = await request.json<any>();
    if (!image_url) {
      return jsonResponse({ error: 'Se requiere image_url' }, 400, corsHeaders);
    }

    const rawTarget = parseInt(target, 10);
    const targetMegapixels = Number.isFinite(rawTarget)
      ? Math.min(UPSCALE_MAX_MEGAPIXELS, Math.max(UPSCALE_MIN_MEGAPIXELS, rawTarget))
      : UPSCALE_DEFAULT_MEGAPIXELS;

    const imageSource = await toPublicImageUrl(env, request, userDni, image_url);

    console.log(`🔍 Iniciando mejora con p-image-upscale (objetivo: ${targetMegapixels} MP)`);

    const outputRef = await resolvePrunaSync(env, 'p-image-upscale', {
      image: imageSource,
      upscale_mode: 'target',
      target: targetMegapixels,
      enhance_details: enhance_details === true,
      enhance_realism: enhance_realism !== false, // por defecto activo: la mayoría de entradas aquí son imágenes generadas por IA
      output_format: 'jpg',
    });

    const imageBuffer = await fetchPrunaOutputBuffer(env, outputRef, 'imagen');

    const r2Key = `generated-images/upscale_${Date.now()}/${crypto.randomUUID()}.jpg`;
    await env.MIRAI_AI_ASSETS.put(r2Key, imageBuffer, {
      httpMetadata: { contentType: 'image/jpeg' },
      customMetadata: {
        generated_at: new Date().toISOString(),
        model: 'p-image-upscale',
        target_megapixels: String(targetMegapixels),
        source_image: image_url.substring(0, 200),
      }
    });

    const upscaledUrl = `/api/image/${r2Key}`;
    console.log(`✨ Imagen mejorada: ${upscaledUrl}`);

    await logApiUsage(env, {
      provider: 'pruna', unit_type: 'prediction', sub_type: 'p-image-upscale',
      via_gateway: false, user_dni: userDni,
      cost_usd: calcCost('pruna', 'p-image-upscale', { targetMegapixels })
    });

    return jsonResponse({
      image_url: upscaledUrl,
      target_megapixels: targetMegapixels,
    }, 200, corsHeaders);

  } catch (error) {
    console.error('❌ handleImageUpscale error:', error.message);
    return jsonResponse({ error: 'Error al mejorar la imagen: ' + error.message }, 500, corsHeaders);
  }
}

// --- EVALUAR IMAGEN CONTRA SU PROMPT CON PRUNA AI P-JUDGER ---
// A diferencia del resto de modelos, la salida no es un fichero sino un JSON de
// puntuaciones, así que aquí se usa la predicción cruda en vez de extraer una URL.
export async function handleImageJudge(request: Request, env: Env, corsHeaders: Record<string, string>) {
  try {
    const userDni = await requireAuth(request, env);
    if (!userDni) return jsonResponse({ error: 'No autenticado' }, 401, corsHeaders);

    const { image_url, prompt } = await request.json<any>();
    if (!image_url || !prompt) {
      return jsonResponse({ error: 'Se requiere image_url y prompt' }, 400, corsHeaders);
    }

    const imageSource = await toPublicImageUrl(env, request, userDni, image_url);

    console.log('⚖️ Evaluando imagen con p-judger');

    const prediction = await resolvePrunaSyncPrediction(env, 'p-judger', {
      prompt: prompt,
      image: imageSource,
    });

    // El esquema documentado es { total, level1, level2, level3, detailed },
    // pero la predicción puede envolverlo en `output` según el modo.
    const raw = prediction.output ?? prediction.result ?? prediction;
    const scores = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};

    await logApiUsage(env, {
      provider: 'pruna', unit_type: 'prediction', sub_type: 'p-judger',
      via_gateway: false, user_dni: userDni,
      cost_usd: calcCost('pruna', 'p-judger') // $0.005 por imagen de entrada evaluada
    });

    return jsonResponse({
      total: typeof scores.total === 'number' ? scores.total : null,
      scores,
    }, 200, corsHeaders);

  } catch (error) {
    console.error('❌ handleImageJudge error:', error.message);
    return jsonResponse({ error: 'Error al evaluar la imagen: ' + error.message }, 500, corsHeaders);
  }
}

export async function handleRoutedImageGeneration(prompt: any, originalMessage: string, conversationId: string, userDni: string, env: Env, corsHeaders: Record<string, string>, isCopyright = false, skipHistory = false, imageOptions = {}) {
  try {
    if (!skipHistory) {
      await ensureConversationExists(conversationId, originalMessage, env, null, null, userDni, AI_MODEL_NORMAL);
      await saveMessage(conversationId, 'user', originalMessage, env, null, null, null, userDni);
    }

    let imageUrl;
    try {
      imageUrl = await generateAndStoreImage(prompt, conversationId, env, { ...imageOptions, user_dni: userDni });
    } catch (imageError) {
      const isBlocked = imageError.message.includes('safety') ||
        imageError.message.includes('flagged') ||
        imageError.message.includes('blocked') ||
        isCopyright;

      if (isBlocked) {
        // El rechazo lo escribe la misma Mirai del chat (personaje prestado por
        // Mirai Assistant + PUBLIC_CHAT_RULES), con el motivo REAL del bloqueo.
        // Antes tenía un mini-prompt propio que siempre culpaba a los derechos
        // de autor: ante una petición sexual o violenta, Mirai se excusaba con
        // un personaje «muy tímido» que no existía en vez de decir que eso no.
        const refusalTask = isCopyright
          ? 'The user asked you to generate an image of a copyrighted character or a real person, and the app cannot create those. In 1 or 2 sentences, apologize, say you can\'t draw that character or person (name them if their message makes it clear), and offer to create something original instead.'
          : 'The user asked for an image that the app\'s safety filter blocked. In 1 or 2 sentences, say kindly but plainly that you can\'t create that image, without guessing a reason or describing what they asked for, and offer to help with a different idea.';

        const fallbackRefusal = 'Lo siento, no puedo generar esa imagen. ¿Probamos con otra idea? 🙏';
        let refusalText = fallbackRefusal;
        try {
          const systemPrompt = await buildMiraiSystemPrompt(env);
          const generated = await callAI(
            AI_MODEL_NORMAL,
            [
              { role: 'system', content: `${systemPrompt}\n\n[TAREA] ${refusalTask} Reply only with that message, in the user's language.` },
              { role: 'user', content: originalMessage }
            ],
            { max_tokens: 600 },
            env
          );
          // Un modelo con razonamiento puede gastar el tope pensando y devolver
          // texto vacío: entonces se queda la frase fija, no un mensaje en blanco.
          if (generated && generated.trim()) refusalText = generated.trim();
        } catch (_) { }

        if (!skipHistory) {
          await saveMessage(conversationId, 'assistant', refusalText, env, null, null, null, userDni);
          await updateConversationTimestamp(conversationId, env);
        }

        return jsonResponse({
          response: refusalText,
          audio_url: null,
          suggestions: []
        }, 200, corsHeaders);
      }

      throw imageError;
    }

    const assistantContent = `![Imagen generada](${imageUrl})`;
    if (!skipHistory) {
      await saveMessage(conversationId, 'assistant', assistantContent, env, null, null, null, userDni);
      await updateConversationTimestamp(conversationId, env);
    }

    return jsonResponse({
      type: 'image',
      image_url: imageUrl,
      prompt: prompt
    }, 200, corsHeaders);

  } catch (error) {
    console.error('❌ handleRoutedImageGeneration error:', error.message);
    return jsonResponse({ error: 'Error generando imagen', details: error.message }, 500, corsHeaders);
  }
}

// Descarga una imagen (URL http(s) o data URI base64) y devuelve un ArrayBuffer
export async function downloadImageAsBuffer(source: any) {
  if (source.startsWith('data:')) {
    const base64 = source.replace(/^data:image\/[a-z0-9.+-]+;base64,/i, '').trim();
    if (base64.length < 100) throw new Error('Imagen inválida');
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
    return bytes.buffer;
  }
  const res = await fetch(source, { headers: { 'User-Agent': 'Cloudflare-Worker' } });
  if (!res.ok) throw new Error(`Error descargando imagen: ${res.status}`);
  return await res.arrayBuffer();
}

// --- SERVIR IMÁGENES DESDE R2 CON CORS ---
export async function handleServeImage(path: string, env: Env) {
  try {
    const r2Key = path.replace('/api/image/', '');

    const object = await env.MIRAI_AI_ASSETS.get(r2Key);

    if (object === null) {
      return new Response('Imagen no encontrada', { status: 404 });
    }

    const headers = new Headers();
    headers.set('Content-Type', 'image/png');
    headers.set('Cache-Control', 'public, max-age=86400');
    headers.set('Access-Control-Allow-Origin', '*'); // ✨ CORS EXPLÍCITO
    headers.set('Access-Control-Allow-Methods', 'GET, HEAD');
    headers.set('Access-Control-Allow-Headers', '*');
    headers.set('Access-Control-Max-Age', '86400');

    return new Response(object.body, { headers });

  } catch (error) {
    console.error('Error sirviendo imagen:', error);
    return new Response('Error interno', { status: 500 });
  }
}
