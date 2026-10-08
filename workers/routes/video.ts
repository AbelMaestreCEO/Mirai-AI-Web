/* ============================================
   MIRAI AI - Vídeo: generación, avatares y vídeo avanzado
   Jobs asíncronos de Pruna que se finalizan por polling o desde el cron.
   ============================================ */
import { AI_MODEL_NORMAL } from '../lib/ai-models';
import { requireAuth } from '../lib/auth';
import { jsonResponse } from '../lib/http';
import {
  type PrunaInput,
  createPrunaPrediction,
  extractPrunaOutputUrl,
  fetchPrunaOutputBuffer,
  getPrunaPrediction,
  resolvePrunaSync,
} from '../lib/pruna';
import { calcCost, logApiUsage } from '../lib/usage';
import { ensureConversationExists, saveMessage } from './conversations';
import { IMAGE_ASPECT_RATIOS, downloadImageAsBuffer, toPublicImageUrl } from './image';
import { checkAndConsumeToken } from './plans';

// ✨ Configuración Video (Pruna AI P-Video, vía API REST directa — ver resolvePrunaSync)
const VIDEO_CONFIG = {
  MAX_PROMPT_LENGTH: 2000,
  DEFAULT_RESOLUTION: '720p',
  DEFAULT_DURATION: 5,
  DEFAULT_ASPECT_RATIO: '16:9',
};

const VIDEO_RESOLUTIONS = ['720p', '1080p'];

// ✨ Configuración Vídeo Avatar (Pruna AI P-Video-Avatar)
const VIDEO_AVATAR_CONFIG = {
  MODEL: 'pruna/p-video-avatar',
  MODEL_ID: 'p-video-avatar', // valor exacto para el header "Model" de la API REST de Pruna
  DEFAULT_VOICE: 'Zephyr (Female)',
  DEFAULT_LANGUAGE: 'English (US)',
  DEFAULT_RESOLUTION: '720p',
};

// Extrae la duración (en segundos) de un archivo MP4 leyendo el box mvhd
// dentro de moov — sin dependencias externas (Workers no tiene ffprobe).
// Devuelve null si el archivo no tiene la estructura esperada (nunca lanza).
function getMp4DurationSeconds(buffer: ArrayBuffer) {
  try {
    const view = new DataView(buffer);
    const total = buffer.byteLength;

    function readBoxes(start: number, end: number) {
      let offset = start;
      const boxes: any[] = [];
      while (offset + 8 <= end) {
        let size = view.getUint32(offset);
        const type = String.fromCharCode(
          view.getUint8(offset + 4), view.getUint8(offset + 5),
          view.getUint8(offset + 6), view.getUint8(offset + 7)
        );
        let headerSize = 8;
        if (size === 1) {
          if (offset + 16 > end) break;
          const high = view.getUint32(offset + 8);
          const low = view.getUint32(offset + 12);
          size = high * 4294967296 + low;
          headerSize = 16;
        } else if (size === 0) {
          size = end - offset;
        }
        if (size < headerSize || offset + size > end) break;
        boxes.push({ type, start: offset, headerSize, size });
        offset += size;
      }
      return boxes;
    }

    const moov = readBoxes(0, total).find(b => b.type === 'moov');
    if (!moov) return null;

    const mvhd = readBoxes(moov.start + moov.headerSize, moov.start + moov.size).find(b => b.type === 'mvhd');
    if (!mvhd) return null;

    const bodyStart = mvhd.start + mvhd.headerSize;
    const version = view.getUint8(bodyStart);
    let timescale, duration;
    if (version === 1) {
      timescale = view.getUint32(bodyStart + 20);
      duration = view.getUint32(bodyStart + 24) * 4294967296 + view.getUint32(bodyStart + 28);
    } else {
      timescale = view.getUint32(bodyStart + 12);
      duration = view.getUint32(bodyStart + 16);
    }
    if (!timescale) return null;
    return duration / timescale;
  } catch (e: any) {
    console.warn('⚠️ getMp4DurationSeconds falló:', e.message);
    return null;
  }
}

// --- SERVIR VIDEO DESDE R2 ---
export async function handleServeVideo(path: string, env: Env) {
  try {
    const r2Key = path.replace('/api/video/', '');
    const object = await env.MIRAI_AI_ASSETS.get(r2Key);

    if (!object) return new Response('Video no encontrado', { status: 404 });

    const headers = new Headers();
    headers.set('Content-Type', 'video/mp4');
    headers.set('Cache-Control', 'public, max-age=86400');
    headers.set('Accept-Ranges', 'bytes');
    headers.set('Access-Control-Allow-Origin', '*');

    return new Response(object.body, { headers });
  } catch (error) {
    console.error('Error sirviendo video:', error);
    return new Response('Error interno', { status: 500 });
  }
}

// Normaliza las opciones de p-video que llegan del cliente. `draft` cambia el
// precio por segundo (hasta 4x más barato), así que se resuelve una sola vez
// aquí y el valor normalizado es el que se manda a Pruna Y el que se usa para
// calcular el costo: si se separaran, el panel de consumo mentiría.
// `image` (opcional) convierte la generación en imagen-a-vídeo: la imagen pasa
// a ser el primer fotograma y fija la proporción del vídeo.
interface VideoOptions { resolution?: string; aspect_ratio?: string; duration?: number | string; draft?: boolean; image?: string }

function normalizeVideoOptions(raw: VideoOptions = {}) {
  const resolution = raw.resolution && VIDEO_RESOLUTIONS.includes(raw.resolution) ? raw.resolution : VIDEO_CONFIG.DEFAULT_RESOLUTION;
  const aspectRatio = raw.aspect_ratio && IMAGE_ASPECT_RATIOS.includes(raw.aspect_ratio) ? raw.aspect_ratio : VIDEO_CONFIG.DEFAULT_ASPECT_RATIO;
  const rawDuration = parseInt(String(raw.duration), 10);
  const duration = Number.isFinite(rawDuration) ? Math.min(10, Math.max(1, rawDuration)) : VIDEO_CONFIG.DEFAULT_DURATION;
  return { resolution, aspectRatio, duration, draft: raw.draft === true };
}

export async function handleVideoGeneration(prompt: any, conversationId: string, userDni: string, env: Env, corsHeaders: Record<string, string>, skipHistory = false, videoOptions: VideoOptions = {}, request: Request | null = null) {
  try {
    const { resolution, aspectRatio, duration, draft } = normalizeVideoOptions(videoOptions);
    // Pruna exige una URL http(s) pública para `image`, no un data URI: las
    // subidas del cliente se guardan antes en R2 (toPublicImageUrl necesita el
    // request para conocer el origen público del Worker).
    const imageRef = typeof videoOptions.image === 'string' ? videoOptions.image.trim() : '';
    if (imageRef && !request) throw new Error('No se puede resolver la imagen de referencia sin la petición original');
    const imageSource = imageRef && request ? await toPublicImageUrl(env, request, userDni, imageRef) : null;

    console.log('🎬 Iniciando generación de video con Pruna AI P-Video');
    console.log(`🎬 Opciones: ${resolution}, ${duration}s, ${imageSource ? 'desde imagen' : aspectRatio}, draft=${draft}`);
    console.log('🎬 Prompt original:', prompt);

    // 1. Guardar traza inicial
    if (!skipHistory) {
      await ensureConversationExists(conversationId, prompt, env, null, null, userDni, AI_MODEL_NORMAL);
      await saveMessage(conversationId, 'user', prompt, env, null, null, null, userDni);
    }

    const videoPrompt = simplifyVideoPrompt(prompt);
    console.log('🎬 Video prompt final:', videoPrompt);

    // 2. Llamada directa a la API REST de Pruna (Try-Sync, ver resolvePrunaSync)
    console.log('🚀 Invocando p-video (API directa de Pruna)...');
    const input: PrunaInput = { prompt: videoPrompt, resolution, duration, draft };
    // Con imagen, Pruna ignora aspect_ratio y usa la proporción de la imagen.
    if (imageSource) input.image = imageSource;
    else input.aspect_ratio = aspectRatio;
    const outputRef = await resolvePrunaSync(env, 'p-video', input);

    console.log('📦 Resultado de Pruna Video:', outputRef.substring(0, 80));

    // 3. Descargar o decodificar la salida
    const videoBuffer = await fetchPrunaOutputBuffer(env, outputRef, 'vídeo');
    console.log(`✅ Video obtenido: ${videoBuffer.byteLength} bytes`);

    // Duración real del mp4 descargado: p-video cobra por segundo de video
    // generado, no un precio fijo por generación (ver API_PRICING).
    const durationSeconds = getMp4DurationSeconds(videoBuffer);

    // 4. Guardar en R2
    const uniqueId = crypto.randomUUID();
    const videoFilename = `videos/${uniqueId}.mp4`;

    await env.MIRAI_AI_ASSETS.put(videoFilename, videoBuffer, {
      httpMetadata: { contentType: 'video/mp4' },
      customMetadata: {
        prompt: prompt.substring(0, 200),
        conversation_id: conversationId,
        generated_at: new Date().toISOString(),
        model: 'p-video',
        resolution,
        draft: String(draft),
        image_to_video: String(!!imageSource)
      }
    });

    const videoUrl = `/api/video/${videoFilename}`;
    const assistantContent = imageSource
      ? `🎬 Aquí tienes el video generado a partir de tu imagen:`
      : `🎬 Aquí tienes el video generado a partir de tu prompt:`;

    if (!skipHistory) {
      await saveMessage(conversationId, 'assistant', assistantContent, env, null, videoUrl, null, userDni);
    }

    await logApiUsage(env, {
      provider: 'pruna', unit_type: 'video_seconds', sub_type: 'p-video',
      units: durationSeconds ?? 0, via_gateway: false, user_dni: userDni,
      cost_usd: calcCost('pruna', 'p-video', { durationSeconds, resolution, draft })
    });

    return jsonResponse({
      type: 'video',
      video_url: videoUrl,
      thumbnail_url: null,
      prompt: prompt,
    }, 200, corsHeaders);

  } catch (error: any) {
    console.error('❌ handleVideoGeneration error:', error.message);
    return jsonResponse({ error: 'Error generando video', details: error.message }, 500, corsHeaders);
  }
}

// ══════════════════════════════════════════════════
// VÍDEO AVATAR (Pruna AI P-Video-Avatar) + PERSONAJES
// ══════════════════════════════════════════════════

async function ensureVideoAvatarCharactersTable(env: Env) {
  await env.MIRAI_AI_DB.prepare(`
    CREATE TABLE IF NOT EXISTS video_avatar_characters (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_dni   TEXT NOT NULL,
      name       TEXT,
      image_url  TEXT NOT NULL,
      r2_key     TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
}

// Guarda una imagen de personaje en R2 + D1 para poder reutilizarla después
async function saveVideoAvatarCharacter(userDni: string, name: any, imageBuffer: ArrayBuffer, env: Env) {
  await ensureVideoAvatarCharactersTable(env);
  const dni = userDni.toUpperCase();
  const uniqueId = crypto.randomUUID();
  const r2Key = `characters/${dni.toLowerCase()}/${uniqueId}.jpg`;

  await env.MIRAI_AI_ASSETS.put(r2Key, imageBuffer, {
    httpMetadata: { contentType: 'image/jpeg' },
    customMetadata: { userDni: dni, uploadedAt: new Date().toISOString() }
  });

  const imageUrl = `/api/image/${r2Key}`;

  let finalName = (name || '').trim();
  if (!finalName) {
    const countRow = await env.MIRAI_AI_DB.prepare(
      `SELECT COUNT(*) as c FROM video_avatar_characters WHERE user_dni = ?`
    ).bind(dni).first<any>();
    finalName = `Personaje ${(countRow?.c || 0) + 1}`;
  }

  const { meta } = await env.MIRAI_AI_DB.prepare(`
    INSERT INTO video_avatar_characters (user_dni, name, image_url, r2_key)
    VALUES (?, ?, ?, ?)
  `).bind(dni, finalName, imageUrl, r2Key).run();

  return { id: meta.last_row_id, name: finalName, image_url: imageUrl };
}

export async function handleSaveVideoAvatarCharacter(request: Request, env: Env, corsHeaders: Record<string, string>) {
  try {
    const userDni = await requireAuth(request, env);
    if (!userDni) return jsonResponse({ error: 'No autorizado' }, 401, corsHeaders);

    const { image, name } = await request.json<any>();
    if (!image) return jsonResponse({ error: 'Se requiere una imagen' }, 400, corsHeaders);

    const imageBuffer = await downloadImageAsBuffer(image);
    if (!imageBuffer || imageBuffer.byteLength === 0) {
      return jsonResponse({ error: 'Imagen inválida' }, 400, corsHeaders);
    }

    const character = await saveVideoAvatarCharacter(userDni, name, imageBuffer, env);
    return jsonResponse({ success: true, character }, 201, corsHeaders);
  } catch (error: any) {
    console.error('❌ handleSaveVideoAvatarCharacter error:', error.message);
    return jsonResponse({ error: 'Error al guardar personaje', details: error.message }, 500, corsHeaders);
  }
}

export async function handleListVideoAvatarCharacters(request: Request, env: Env, corsHeaders: Record<string, string>) {
  try {
    const userDni = await requireAuth(request, env);
    if (!userDni) return jsonResponse({ error: 'No autorizado' }, 401, corsHeaders);

    await ensureVideoAvatarCharactersTable(env);
    const { results } = await env.MIRAI_AI_DB.prepare(`
      SELECT id, name, image_url, created_at FROM video_avatar_characters
      WHERE user_dni = ? ORDER BY created_at DESC
    `).bind(userDni.toUpperCase()).all<any>();

    return jsonResponse({ characters: results || [] }, 200, corsHeaders);
  } catch (error: any) {
    console.error('❌ handleListVideoAvatarCharacters error:', error.message);
    return jsonResponse({ error: 'Error al obtener personajes', details: error.message }, 500, corsHeaders);
  }
}

export async function handleDeleteVideoAvatarCharacter(request: Request, env: Env, corsHeaders: Record<string, string>) {
  try {
    const userDni = await requireAuth(request, env);
    if (!userDni) return jsonResponse({ error: 'No autorizado' }, 401, corsHeaders);

    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    if (!id) return jsonResponse({ error: 'Se requiere id' }, 400, corsHeaders);

    await ensureVideoAvatarCharactersTable(env);
    const row = await env.MIRAI_AI_DB.prepare(
      `SELECT r2_key FROM video_avatar_characters WHERE id = ? AND user_dni = ?`
    ).bind(id, userDni.toUpperCase()).first<any>();

    if (row?.r2_key) {
      await env.MIRAI_AI_ASSETS.delete(row.r2_key).catch(() => null);
    }

    await env.MIRAI_AI_DB.prepare(
      `DELETE FROM video_avatar_characters WHERE id = ? AND user_dni = ?`
    ).bind(id, userDni.toUpperCase()).run();

    return jsonResponse({ success: true }, 200, corsHeaders);
  } catch (error: any) {
    console.error('❌ handleDeleteVideoAvatarCharacter error:', error.message);
    return jsonResponse({ error: 'Error al eliminar personaje', details: error.message }, 500, corsHeaders);
  }
}

async function ensureVideoAvatarJobsTable(env: Env) {
  await env.MIRAI_AI_DB.prepare(`
    CREATE TABLE IF NOT EXISTS video_avatar_jobs (
      id                   TEXT PRIMARY KEY,
      user_dni             TEXT NOT NULL,
      status               TEXT NOT NULL DEFAULT 'pending',
      pruna_prediction_id  TEXT,
      video_url            TEXT,
      error                TEXT,
      character_id         INTEGER,
      character_name       TEXT,
      character_image_url  TEXT,
      created_at           DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at           DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
  // Compatibilidad con tablas creadas por una versión anterior de este código
  try {
    await env.MIRAI_AI_DB.prepare(
      `ALTER TABLE video_avatar_jobs ADD COLUMN pruna_prediction_id TEXT`
    ).run();
  } catch (_) { }
  // La resolución se guarda para poder calcular el costo real ($/segundo
  // varía por resolución) cuando el job termina, sin depender del input
  // original que ya no está disponible en ese punto.
  try {
    await env.MIRAI_AI_DB.prepare(
      `ALTER TABLE video_avatar_jobs ADD COLUMN resolution TEXT`
    ).run();
  } catch (_) { }
  // Esta tabla nació solo para el avatar, pero p-video-edit, p-video-animate y
  // p-video-replace necesitan exactamente el mismo ciclo (crear predicción →
  // polling → descargar → cobrar por segundo), así que se reutiliza para los
  // cuatro en vez de duplicar tabla, cron y endpoint de estado. job_kind dice
  // de cuál se trata y model_id qué modelo de Pruna hay que consultar y cobrar.
  for (const columnSql of [
    `ALTER TABLE video_avatar_jobs ADD COLUMN job_kind TEXT DEFAULT 'avatar'`,
    `ALTER TABLE video_avatar_jobs ADD COLUMN model_id TEXT`,
    `ALTER TABLE video_avatar_jobs ADD COLUMN draft INTEGER DEFAULT 0`,
  ]) {
    try {
      await env.MIRAI_AI_DB.prepare(columnSql).run();
    } catch (_) { }
  }
}

// Configuración de los tres modelos de vídeo avanzados. Comparten el flujo
// asíncrono, y solo se diferencian en qué inputs acepta cada uno y cómo se
// etiqueta el resultado en el historial.
interface AdvancedVideoModel {
  model_id: string;
  label: string;
  r2_prefix: string;
  needs_prompt: boolean;
  needs_images: boolean;
  max_images?: number;
  max_source_seconds?: number;
  supports_draft: boolean;
  supports_resolution: boolean;
}

const ADVANCED_VIDEO_MODELS: Record<string, AdvancedVideoModel> = {
  edit: {
    model_id: 'p-video-edit',
    label: '✂️ Edición de vídeo',
    r2_prefix: 'videos/edit',
    needs_prompt: true,
    needs_images: false,
    supports_draft: true,
    // p-video-edit no acepta `resolution`: su precio depende solo del modo.
    supports_resolution: false,
    max_source_seconds: 15,
  },
  animate: {
    model_id: 'p-video-animate',
    label: '🕺 Animación',
    r2_prefix: 'videos/animate',
    needs_prompt: false,
    needs_images: true,
    max_images: 1, // "Animate uses the first image only"
    supports_draft: false,
    supports_resolution: true,
  },
  replace: {
    model_id: 'p-video-replace',
    label: '🔁 Reemplazo',
    r2_prefix: 'videos/replace',
    needs_prompt: false,
    needs_images: true,
    max_images: 4, // "Replace: 1–4 identity references"
    supports_draft: false,
    supports_resolution: true,
  },
};

export async function handleVideoAvatarGeneration(request: Request, env: Env, corsHeaders: Record<string, string>) {
  try {
    const userDni = await requireAuth(request, env);
    if (!userDni) return jsonResponse({ error: 'No autenticado' }, 401, corsHeaders);

    const tokenCheck = await checkAndConsumeToken(userDni, 'video', env);
    if (!tokenCheck.allowed) {
      return jsonResponse({
        error: `Has alcanzado el límite diario de ${tokenCheck.limit} videos. Vuelve a intentarlo mañana.`,
        token_limit_reached: true,
      }, 429, corsHeaders);
    }

    const body = await request.json<any>();
    const {
      image, character_id, character_name,
      voice_script, audio, voice, voice_language,
      resolution, video_prompt, voice_prompt, negative_prompt,
    } = body;

    if (!voice_script && !audio) {
      return jsonResponse({ error: 'Se requiere un guion de voz (voice_script) o un audio' }, 400, corsHeaders);
    }

    const origin = new URL(request.url).origin;
    await ensureVideoAvatarCharactersTable(env);
    await ensureVideoAvatarJobsTable(env);

    let imageSource: any = null;
    let characterInfo: any = null;
    const requestedCharacterId = character_id ? parseInt(character_id, 10) : null;

    if (requestedCharacterId) {
      const row = await env.MIRAI_AI_DB.prepare(
        `SELECT id, name, image_url FROM video_avatar_characters WHERE id = ? AND user_dni = ?`
      ).bind(requestedCharacterId, userDni.toUpperCase()).first<any>();
      if (!row) return jsonResponse({ error: 'Personaje no encontrado' }, 404, corsHeaders);
      imageSource = origin + row.image_url;
      characterInfo = { id: row.id, name: row.name, image_url: row.image_url };
    } else {
      if (!image) return jsonResponse({ error: 'Se requiere una imagen de personaje' }, 400, corsHeaders);
      const rawSource = image.startsWith('/api/image/') ? origin + image : image;

      // Se guarda automáticamente como personaje reutilizable para próximas generaciones
      try {
        const imageBuffer = await downloadImageAsBuffer(rawSource);
        const saved = await saveVideoAvatarCharacter(userDni, character_name, imageBuffer, env);
        characterInfo = saved;
        imageSource = origin + saved.image_url;
      } catch (saveErr: any) {
        console.warn('⚠️ No se pudo guardar el personaje, se usará la imagen directamente:', saveErr.message);
        imageSource = rawSource;
      }
    }

    // Pruna necesita una URL http(s) real para image/audio, no un data URI.
    if (imageSource.startsWith('data:')) {
      const imageBuffer = await downloadImageAsBuffer(imageSource);
      const saved = await saveVideoAvatarCharacter(userDni, character_name, imageBuffer, env);
      characterInfo = characterInfo || saved;
      imageSource = origin + saved.image_url;
    }

    let audioUrl: any = null;
    if (audio) {
      if (audio.startsWith('data:')) {
        const audioMatch = /^data:audio\/([a-z0-9.+-]+);base64,/i.exec(audio);
        const ext = audioMatch ? audioMatch[1].split('+')[0] : 'mp3';
        const audioBase64 = audio.replace(/^data:audio\/[a-z0-9.+-]+;base64,/i, '').trim();
        const binaryString = atob(audioBase64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
        const audioKey = `audio-uploads/${userDni.toLowerCase()}/${crypto.randomUUID()}.${ext}`;
        await env.MIRAI_AI_ASSETS.put(audioKey, bytes.buffer, {
          httpMetadata: { contentType: `audio/${ext}` }
        });
        audioUrl = `${origin}/api/audio/${audioKey}`;
      } else {
        audioUrl = audio.startsWith('/api/') ? origin + audio : audio;
      }
    }

    const input: PrunaInput = {
      image: imageSource,
      voice: voice || VIDEO_AVATAR_CONFIG.DEFAULT_VOICE,
      voice_language: voice_language || VIDEO_AVATAR_CONFIG.DEFAULT_LANGUAGE,
      resolution: resolution || VIDEO_AVATAR_CONFIG.DEFAULT_RESOLUTION,
      disable_safety_filter: true,
    };
    if (video_prompt) input.video_prompt = video_prompt;
    if (voice_prompt) input.voice_prompt = voice_prompt;
    if (negative_prompt) input.negative_prompt = negative_prompt;

    if (audioUrl) {
      input.audio = audioUrl;
    } else {
      input.voice_script = voice_script;
    }

    const prediction = await createPrunaPrediction(env, VIDEO_AVATAR_CONFIG.MODEL_ID, input);
    const jobId = crypto.randomUUID();

    await env.MIRAI_AI_DB.prepare(`
      INSERT INTO video_avatar_jobs (id, user_dni, status, pruna_prediction_id, character_id, character_name, character_image_url, resolution, job_kind, model_id)
      VALUES (?, ?, 'pending', ?, ?, ?, ?, ?, 'avatar', ?)
    `).bind(
      jobId,
      userDni.toUpperCase(),
      prediction.id,
      characterInfo ? characterInfo.id : null,
      characterInfo ? characterInfo.name : null,
      characterInfo ? characterInfo.image_url : null,
      input.resolution,
      VIDEO_AVATAR_CONFIG.MODEL_ID
    ).run();

    return jsonResponse({
      job_id: jobId,
      character: characterInfo,
    }, 202, corsHeaders);

  } catch (error: any) {
    console.error('❌ handleVideoAvatarGeneration error:', error.message);
    return jsonResponse({ error: 'Error generando vídeo avatar', details: error.message }, 500, corsHeaders);
  }
}

// Guarda en R2 un vídeo de origen subido por el usuario y devuelve su URL
// pública absoluta: Pruna descarga los inputs desde internet, así que un data
// URI o una ruta relativa no le sirven.
async function toPublicVideoUrl(env: Env, request: Request, userDni: string, videoRef: any) {
  if (videoRef.startsWith('http://') || videoRef.startsWith('https://')) return videoRef;

  const origin = new URL(request.url).origin;
  if (videoRef.startsWith('/api/')) return origin + videoRef;

  if (videoRef.startsWith('data:')) {
    const base64 = videoRef.replace(/^data:video\/[a-z0-9.+-]+;base64,/i, '').trim();
    if (base64.length < 100) throw new Error('Vídeo inválido');
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);

    const r2Key = `video-uploads/${userDni.toLowerCase()}/${crypto.randomUUID()}.mp4`;
    await env.MIRAI_AI_ASSETS.put(r2Key, bytes.buffer, {
      httpMetadata: { contentType: 'video/mp4' },
      customMetadata: { user_dni: userDni.toUpperCase(), uploaded_at: new Date().toISOString() }
    });
    return `${origin}/api/video/${r2Key}`;
  }

  throw new Error('Formato de vídeo no reconocido');
}

// --- VÍDEO AVANZADO: P-VIDEO-EDIT / P-VIDEO-ANIMATE / P-VIDEO-REPLACE ---
// Los tres parten de un vídeo de origen y tardan minutos, así que se crean en
// modo asíncrono y comparten la tabla de jobs, el polling y el cron del avatar.
export async function handleAdvancedVideoGeneration(request: Request, env: Env, corsHeaders: Record<string, string>, kind: string) {
  try {
    const config = ADVANCED_VIDEO_MODELS[kind];
    if (!config) return jsonResponse({ error: 'Tipo de vídeo no soportado' }, 400, corsHeaders);

    const userDni = await requireAuth(request, env);
    if (!userDni) return jsonResponse({ error: 'No autenticado' }, 401, corsHeaders);

    const tokenCheck = await checkAndConsumeToken(userDni, 'video', env);
    if (!tokenCheck.allowed) {
      return jsonResponse({
        error: `Has alcanzado el límite diario de ${tokenCheck.limit} videos. Vuelve a intentarlo mañana.`,
        token_limit_reached: true,
      }, 429, corsHeaders);
    }

    const body = await request.json<any>();
    const { video, prompt, instruction_prompt, images, character_id, resolution, draft, fps } = body;

    if (!video) {
      return jsonResponse({ error: 'Se requiere un vídeo de origen' }, 400, corsHeaders);
    }
    if (config.needs_prompt && !(prompt && prompt.trim())) {
      return jsonResponse({ error: 'Se requiere un prompt con la edición a aplicar' }, 400, corsHeaders);
    }

    await ensureVideoAvatarCharactersTable(env);
    await ensureVideoAvatarJobsTable(env);

    // Las imágenes de referencia pueden venir sueltas o ser un personaje ya
    // guardado del módulo de avatar, que es justo lo que sirve como identidad.
    let imageRefs = Array.isArray(images) ? images.filter(Boolean) : (images ? [images] : []);
    let characterInfo: any = null;

    if (character_id) {
      const row = await env.MIRAI_AI_DB.prepare(
        `SELECT id, name, image_url FROM video_avatar_characters WHERE id = ? AND user_dni = ?`
      ).bind(parseInt(character_id, 10), userDni.toUpperCase()).first<any>();
      if (!row) return jsonResponse({ error: 'Personaje no encontrado' }, 404, corsHeaders);
      characterInfo = { id: row.id, name: row.name, image_url: row.image_url };
      imageRefs = [row.image_url, ...imageRefs];
    }

    if (config.needs_images && imageRefs.length === 0) {
      return jsonResponse({ error: 'Se requiere al menos una imagen de referencia' }, 400, corsHeaders);
    }

    const maxImages = config.max_images || 4;
    const resolvedImages: any[] = [];
    for (const ref of imageRefs.slice(0, maxImages)) {
      resolvedImages.push(await toPublicImageUrl(env, request, userDni, ref));
    }

    const videoSource = await toPublicVideoUrl(env, request, userDni, video);

    const useDraft = config.supports_draft && draft === true;
    const useResolution = config.supports_resolution
      ? (VIDEO_RESOLUTIONS.includes(resolution) ? resolution : VIDEO_CONFIG.DEFAULT_RESOLUTION)
      : null;

    const input: PrunaInput = {
      video: videoSource,
      disable_safety_checker: true,
    };
    if (resolvedImages.length) input.images = resolvedImages;
    if (config.needs_prompt) input.prompt = prompt.trim();
    if (instruction_prompt && instruction_prompt.trim()) input.instruction_prompt = instruction_prompt.trim();
    if (useResolution) input.resolution = useResolution;
    if (config.supports_draft) input.draft = useDraft;
    const parsedFps = parseInt(fps, 10);
    if (Number.isFinite(parsedFps) && parsedFps > 0) input.fps = parsedFps;

    console.log(`🎞️ Creando job de ${config.model_id} (draft=${useDraft}, resolución=${useResolution || 'n/a'})`);

    const prediction = await createPrunaPrediction(env, config.model_id, input);
    const jobId = crypto.randomUUID();

    await env.MIRAI_AI_DB.prepare(`
      INSERT INTO video_avatar_jobs (id, user_dni, status, pruna_prediction_id, character_id, character_name, character_image_url, resolution, job_kind, model_id, draft)
      VALUES (?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      jobId,
      userDni.toUpperCase(),
      prediction.id,
      characterInfo ? characterInfo.id : null,
      characterInfo ? characterInfo.name : null,
      characterInfo ? characterInfo.image_url : null,
      // p-video-edit no expone resolución; se guarda 720p para que el cálculo
      // de costo tenga una clave válida (su tarifa es igual en ambas).
      useResolution || VIDEO_CONFIG.DEFAULT_RESOLUTION,
      kind,
      config.model_id,
      useDraft ? 1 : 0
    ).run();

    return jsonResponse({
      job_id: jobId,
      kind,
      character: characterInfo,
    }, 202, corsHeaders);

  } catch (error: any) {
    console.error(`❌ handleAdvancedVideoGeneration (${kind}) error:`, error.message);
    return jsonResponse({ error: 'Error generando el vídeo', details: error.message }, 500, corsHeaders);
  }
}

export async function handleGetVideoAvatarJob(request: Request, env: Env, corsHeaders: Record<string, string>) {
  try {
    const userDni = await requireAuth(request, env);
    if (!userDni) return jsonResponse({ error: 'No autenticado' }, 401, corsHeaders);

    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    if (!id) return jsonResponse({ error: 'Se requiere id' }, 400, corsHeaders);

    await ensureVideoAvatarJobsTable(env);
    const job = await env.MIRAI_AI_DB.prepare(
      `SELECT id, status, pruna_prediction_id, video_url, error, character_id, character_name, character_image_url, resolution, job_kind, model_id, draft
       FROM video_avatar_jobs WHERE id = ? AND user_dni = ?`
    ).bind(id, userDni.toUpperCase()).first<any>();

    if (!job) return jsonResponse({ error: 'Trabajo no encontrado' }, 404, corsHeaders);

    const characterPayload = job.character_id ? {
      id: job.character_id,
      name: job.character_name,
      image_url: job.character_image_url
    } : null;

    const kind = job.job_kind || 'avatar';

    // Si ya terminó (éxito o error), devolvemos el resultado guardado sin
    // volver a consultar a Pruna.
    if (job.status === 'done' || job.status === 'error') {
      return jsonResponse({
        status: job.status,
        video_url: job.video_url || null,
        error: job.error || null,
        character: characterPayload,
        kind,
      }, 200, corsHeaders);
    }

    // Sigue pendiente: una única consulta rápida y acotada al estado en Pruna.
    const result = await checkAndFinalizeVideoAvatarJob(job, userDni, env);
    return jsonResponse({ ...result, character: characterPayload, kind }, 200, corsHeaders);

  } catch (error: any) {
    console.error('❌ handleGetVideoAvatarJob error:', error.message);
    return jsonResponse({ error: 'Error al consultar el trabajo', details: error.message }, 500, corsHeaders);
  }
}

// Consulta el estado de una predicción en Pruna y, si ya terminó, descarga el
// vídeo y actualiza D1/historial. Vale para los cuatro modelos asíncronos
// (avatar, edit, animate, replace): el modelo concreto sale de job.model_id.
// Se usa tanto desde el polling del cliente (GET /api/video-jobs) como desde el
// cron de abajo, que es el que garantiza que el job se complete aunque el
// usuario haya cerrado la pestaña.
async function checkAndFinalizeVideoAvatarJob(job: any, userDni: string, env: Env) {
  try {
    const prediction = await getPrunaPrediction(env, job.pruna_prediction_id);
    const status = (prediction.status || '').toLowerCase();

    if (status === 'succeeded' || status === 'success' || status === 'completed') {
      // El polling del cliente y el cron pueden entrar aquí a la vez sobre el
      // mismo job: sin este cierre atómico se descargaba el vídeo dos veces, se
      // escribían dos objetos en R2, dos filas en gen_history y se cobraba dos
      // veces en api_usage_log. El UPDATE condicionado a status='pending' solo
      // deja pasar al primero que llegue.
      const claim = await env.MIRAI_AI_DB.prepare(
        `UPDATE video_avatar_jobs SET status = 'finalizing', updated_at = datetime('now')
          WHERE id = ? AND status = 'pending'`
      ).bind(job.id).run();

      if (!claim.meta?.changes) {
        // Otro proceso ya lo está finalizando (o lo finalizó): devolver su estado.
        const current = await env.MIRAI_AI_DB.prepare(
          'SELECT status, video_url, error FROM video_avatar_jobs WHERE id = ?'
        ).bind(job.id).first<any>();
        return {
          status: current?.status === 'done' ? 'done' : (current?.status === 'error' ? 'error' : 'pending'),
          video_url: current?.video_url || null,
          error: current?.error || null,
        };
      }

      const outputRef = extractPrunaOutputUrl(prediction);
      if (!outputRef) {
        throw new Error(`Predicción completada pero sin salida reconocible: ${JSON.stringify(prediction).substring(0, 300)}`);
      }

      const videoBuffer = await fetchPrunaOutputBuffer(env, outputRef, 'vídeo');

      // Duración real del mp4: toda la familia p-video-* cobra por segundo de
      // vídeo generado (varía con el audio/voz o el clip de origen), no un
      // precio fijo por generación.
      const durationSeconds = getMp4DurationSeconds(videoBuffer);

      // Los jobs creados antes de que la tabla tuviera job_kind/model_id son
      // todos de avatar, de ahí los valores por defecto.
      const jobKind = job.job_kind || 'avatar';
      const modelId = job.model_id || VIDEO_AVATAR_CONFIG.MODEL_ID;
      const advancedConfig = ADVANCED_VIDEO_MODELS[jobKind] || null;
      const r2Prefix = advancedConfig ? advancedConfig.r2_prefix : 'videos/avatar';

      const videoFilename = `${r2Prefix}/${crypto.randomUUID()}.mp4`;
      await env.MIRAI_AI_ASSETS.put(videoFilename, videoBuffer, {
        httpMetadata: { contentType: 'video/mp4' },
        customMetadata: {
          user_dni: userDni.toUpperCase(),
          generated_at: new Date().toISOString(),
          model: modelId,
        }
      });
      const videoUrl = `/api/video/${videoFilename}`;

      await env.MIRAI_AI_DB.prepare(`
        UPDATE video_avatar_jobs SET status = 'done', video_url = ?, updated_at = datetime('now') WHERE id = ?
      `).bind(videoUrl, job.id).run();

      await logApiUsage(env, {
        provider: 'pruna', unit_type: 'video_seconds', sub_type: modelId,
        units: durationSeconds ?? 0, via_gateway: false, user_dni: userDni,
        cost_usd: calcCost('pruna', modelId, {
          durationSeconds,
          resolution: job.resolution || VIDEO_AVATAR_CONFIG.DEFAULT_RESOLUTION,
          draft: job.draft === 1,
        })
      });

      // Se guarda también en el historial desde el backend: si el usuario
      // cerró la pestaña mientras se generaba, el vídeo no se pierde.
      try {
        await env.MIRAI_AI_DB.prepare(`
          CREATE TABLE IF NOT EXISTS gen_history (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            user_dni   TEXT    NOT NULL,
            type       TEXT    NOT NULL,
            badge      TEXT,
            prompt     TEXT,
            result     TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `).run();
        // Los tres modelos avanzados comparten la pestaña 'videoedit' del
        // historial; el badge es el que distingue cuál fue.
        const historyType = advancedConfig ? 'videoedit' : 'avatar';
        const historyBadge = advancedConfig ? advancedConfig.label : '🗣️ Avatar';
        await env.MIRAI_AI_DB.prepare(`
          INSERT INTO gen_history (user_dni, type, badge, prompt, result)
          VALUES (?, ?, ?, ?, ?)
        `).bind(
          userDni.toUpperCase(),
          historyType,
          historyBadge,
          advancedConfig ? advancedConfig.label : '🗣️ Vídeo avatar',
          videoUrl.substring(0, 4000)
        ).run();
      } catch (histErr: any) {
        console.warn(`⚠️ [job ${job.id}] No se pudo guardar en historial:`, histErr.message);
      }

      return { status: 'done', video_url: videoUrl, error: null };
    }

    if (status === 'failed' || status === 'canceled' || status === 'cancelled' || status === 'error') {
      const errMsg = prediction.error || prediction.detail || 'La generación falló en Pruna';
      await env.MIRAI_AI_DB.prepare(`
        UPDATE video_avatar_jobs SET status = 'error', error = ?, updated_at = datetime('now') WHERE id = ?
      `).bind(String(errMsg).substring(0, 500), job.id).run();

      return { status: 'error', video_url: null, error: errMsg };
    }

    // Todavía procesando (starting/processing/etc.)
    return { status: 'pending', video_url: null, error: null };

  } catch (pollErr: any) {
    console.error(`❌ [job ${job.id}] error consultando Pruna:`, pollErr.message);
    // Si el fallo ocurrió después de reclamar el job, hay que devolverlo a
    // 'pending' o se quedaría en 'finalizing' y el cron (que solo mira
    // 'pending') no volvería a tocarlo nunca.
    try {
      await env.MIRAI_AI_DB.prepare(
        `UPDATE video_avatar_jobs SET status = 'pending', updated_at = datetime('now')
          WHERE id = ? AND status = 'finalizing'`
      ).bind(job.id).run();
    } catch (_) { /* best-effort */ }

    // No marcamos el job como error por un fallo transitorio de red al consultar;
    // se reintentará en el siguiente poll/tick de cron.
    return { status: 'pending', video_url: null, error: null };
  }
}

// Red de seguridad: revisa periódicamente (vía Cron Trigger) los jobs que
// sigan 'pending' en D1, sin depender de que el cliente siga haciendo polling
// (si cerró la pestaña, perdió la conexión, etc.). Así ningún vídeo generado
// por Pruna se pierde aunque nadie esté mirando la pantalla de resultado.
// Un job de vídeo tarda minutos, no horas. Pasado este plazo se da por perdido
// en vez de reconsultarlo a Pruna cada 2 minutos indefinidamente: sin este tope,
// un job cuya predicción ya no existe (o cuya descarga falla siempre) se
// reintentaba para siempre, porque el catch del poll lo devuelve a 'pending'.
const VIDEO_AVATAR_JOB_MAX_AGE_HOURS = 2;

export async function finalizePendingVideoAvatarJobs(env: Env) {
  try {
    await ensureVideoAvatarJobsTable(env);

    // 1. Cerrar los jobs demasiado viejos, y rescatar los que se quedaron en
    //    'finalizing' porque el proceso que los reclamó murió a medias.
    await env.MIRAI_AI_DB.prepare(`
      UPDATE video_avatar_jobs
         SET status = 'pending', updated_at = datetime('now')
       WHERE status = 'finalizing'
         AND updated_at < datetime('now', '-10 minutes')
    `).run();

    const expired = await env.MIRAI_AI_DB.prepare(`
      UPDATE video_avatar_jobs
         SET status = 'error',
             error = 'La generación superó el tiempo máximo de espera.',
             updated_at = datetime('now')
       WHERE status IN ('pending', 'finalizing')
         AND created_at < datetime('now', '-${VIDEO_AVATAR_JOB_MAX_AGE_HOURS} hours')
    `).run();

    if (expired.meta?.changes) {
      console.log(`[Scheduled] ${expired.meta.changes} trabajo(s) de vídeo caducado(s).`);
    }

    // 2. Revisar los que siguen vivos.
    const { results } = await env.MIRAI_AI_DB.prepare(`
      SELECT id, user_dni, pruna_prediction_id, resolution, job_kind, model_id, draft FROM video_avatar_jobs
      WHERE status = 'pending' AND pruna_prediction_id IS NOT NULL
      ORDER BY created_at ASC LIMIT 25
    `).all<any>();

    if (!results || results.length === 0) return;

    console.log(`[Scheduled] Revisando ${results.length} trabajo(s) de vídeo pendiente(s)...`);
    for (const job of results) {
      const result = await checkAndFinalizeVideoAvatarJob(job, job.user_dni, env);
      if (result.status !== 'pending') {
        console.log(`[Scheduled] Job ${job.id} → ${result.status}`);
      }
    }
  } catch (error: any) {
    console.error('❌ finalizePendingVideoAvatarJobs error:', error.message);
  }
}

function simplifyVideoPrompt(prompt: any) {
  return prompt.length <= VIDEO_CONFIG.MAX_PROMPT_LENGTH ? prompt : prompt.substring(0, VIDEO_CONFIG.MAX_PROMPT_LENGTH);
}
