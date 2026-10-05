/* ============================================
   MIRAI AI - Chat principal
   Clasificación de intención, chat de texto (con y sin streaming) y búsqueda
   en YouTube.
   ============================================ */
import { type AIDeltaKind, type CallAIOptions, REASONING_STYLE_NOTE, callAI, callAIEnsuringAnswer } from '../lib/ai';
import { AI_MODEL_NORMAL, AI_MODEL_PRO } from '../lib/ai-models';
import { requireAuth } from '../lib/auth';
import { jsonResponse } from '../lib/http';
import { buildMiraiSystemPrompt } from '../lib/persona';
import { calcCost, logApiUsage } from '../lib/usage';
import { generateAndStoreTTS } from './audio';
import {
  TEMPORAL_PROMPT_NOTE,
  annotateHistoryTurns,
  buildConversationTaskPrompt,
  buildCurrentTurnHeader,
  formatShortStamp,
  normalizeTimeZone,
  wrapTaskPrompt,
} from './chat-context';
import {
  ensureConversationExists,
  getConversationHistory,
  saveConversationContext,
  saveMessage,
  updateConversationTimestamp,
} from './conversations';
import { handleRoutedImageGeneration } from './image';
import { handleMusicGeneration } from './music';
import { type TokenType, checkAndConsumeToken } from './plans';
import { handleVideoGeneration } from './video';

// Techo de salida del chat de texto. Tiene que dar para el razonamiento Y la
// respuesta: con 2000 el modelo se quedaba sin espacio deliberando y terminaba
// sin escribir nada. Sólo se factura lo que realmente genera, no el techo.
const CHAT_MAX_TOKENS = 4000;

// --- CONFIGURACIÓN DE CLASIFICACIÓN ---
const INTENT_TYPES = {
  TEXT: 1,
  IMAGE: 2,
  VIDEO: 3,
  MUSIC: 4,
  TEXT_DEFAULT: 5,
  YOUTUBE: 6
};

const CLASSIFICATION_PROMPT = `You are an intent classifier for a multimodal AI assistant. Analyze the user's message and determine what type of response they need.

Categories:
1 = TEXT: Questions, conversations, explanations, code, analysis, greetings, opinions, translations, math, help requests
2 = IMAGE: User explicitly wants to generate, create, draw, render, illustrate, paint, design an image/picture/artwork/photo/illustration
3 = VIDEO: User explicitly wants to generate, create, animate a video/animation/GIF/motion clip
4 = MUSIC: User explicitly wants to generate, create, compose music/audio/song/melody/soundtrack/beat/SFX, or describes a musical style
5 = TEXT (default): When ambiguous or unclear, ALWAYS default to text
6 = YOUTUBE: User wants to search, find, watch, play, or see a YouTube video. Keywords: "busca un video", "pon un video", "reproduce", "busca en youtube", "quiero ver un video de", "muéstrame un video", "video de youtube", "tutorial de", "pon música de" (when referring to existing songs/artists, NOT generating new music)

Rules:
- If the user asks to "explain AND draw", classify as IMAGE (the text part comes naturally with the image)
- If the user says something casual like "hola" or "qué es X", it's TEXT
- Only classify as 2/3/4/6 when the user CLEARLY wants generated media or YouTube
- IMPORTANT: Distinguish between MUSIC (4) = user wants to CREATE/GENERATE new music, vs YOUTUBE (6) = user wants to FIND/WATCH/LISTEN to an EXISTING video or song on YouTube
- If the user mentions a specific artist, band, or existing song they want to hear, classify as YOUTUBE (6), not MUSIC (4)
- When intent is 2, write a detailed English prompt for image generation. CRITICAL: If the user asks for a copyrighted character (anime, games, movies, brands, real people), DO NOT use the character name or franchise. Instead describe ONLY their visual traits: hair color/style, outfit colors, accessories, body type. Example: instead of "Hatsune Miku" write "anime girl with very long teal twin pigtails, futuristic black and teal outfit, small headset, bright cyan eyes, slim figure".
- When the user asks for a real person or copyrighted character, add a special field "is_copyright": true to the JSON response.
- When intent is 4, write a CONCISE English prompt for music generation (max 200 chars). Include: genre, mood, and key instruments. Do NOT include lyrics or vocal instructions. Example: "Smooth jazz ballad with saxophone and piano, slow tempo, romantic mood"
- When intent is 6, write a concise YouTube search query in the user's language that will find the best matching video. Example: user says "pon algo de Bad Bunny" → prompt: "Bad Bunny canciones"

Respond ONLY with valid JSON, nothing else:
{"intent": <number>, "prompt": "<detailed English prompt for generation if intent 2/3/4, search query if intent 6, empty string if 1/5>", "is_copyright": <true if user asked for copyrighted/real person, false otherwise>}`;

// --- CLASIFICAR INTENCIÓN DEL USUARIO ---
async function classifyIntent(message: string, env: Env): Promise<IntentClassification> {
  try {
    const content = await callAI(
      AI_MODEL_NORMAL,
      [{ role: 'system', content: CLASSIFICATION_PROMPT }, { role: 'user', content: message }],
      { temperature: 0.05, max_tokens: 150 },
      env
    );

    console.log(`🏷️ Raw classification: ${content}`);

    return parseClassification(content);

  } catch (error) {
    console.error('❌ classifyIntent error:', error.message);
    return { intent: INTENT_TYPES.TEXT_DEFAULT, prompt: '' }; // Fallback seguro
  }
}

async function handleYouTubeSearch(query: any, originalMessage: string, conversationId: string, userDni: string, env: Env, corsHeaders: Record<string, string>, skipHistory: boolean) {
  const apiKey = env.GOOGLE_MAPS_KEY;
  if (!apiKey) {
    return jsonResponse({ type: 'text', response: '⚠️ YouTube no está configurado en este momento.' }, 200, corsHeaders);
  }

  try {
    const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=5&q=${encodeURIComponent(query)}&key=${apiKey}`;
    const ytRes = await fetch(searchUrl);
    if (!ytRes.ok) throw new Error(`YouTube API: ${ytRes.status}`);
    const ytData: any = await ytRes.json<any>();
    await logApiUsage(env, { provider: 'youtube', unit_type: 'call', user_dni: userDni, cost_usd: 0 });

    const videos = (ytData.items || []).map((item: any) => ({
      videoId: item.id.videoId,
      title: item.snippet.title,
      channel: item.snippet.channelTitle,
      thumbnail: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.medium?.url || item.snippet.thumbnails.default?.url,
      description: item.snippet.description,
    }));

    if (!videos.length) {
      return jsonResponse({ type: 'text', response: '😕 No encontré videos para esa búsqueda.' }, 200, corsHeaders);
    }

    if (!skipHistory && conversationId) {
      try {
        const DB = env.MIRAI_AI_DB;
        const titles = videos.slice(0, 3).map((v: any, i: number) => `${i + 1}. ${v.title}`).join('\n');
        const assistantContent = `🎬 Videos encontrados para "${originalMessage}":\n${titles}`;
        await DB.prepare('INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)')
          .bind(conversationId, 'user', originalMessage).run();
        await DB.prepare('INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)')
          .bind(conversationId, 'assistant', assistantContent).run();
        await DB.prepare('UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?')
          .bind(conversationId).run();
      } catch (e) { console.error('[YouTube] history save:', e); }
    }

    return jsonResponse({
      type: 'youtube',
      query: query,
      videos: videos,
      response: `🎬 Encontré ${videos.length} videos para ti:`,
    }, 200, corsHeaders);

  } catch (err) {
    console.error('[YouTube] search error:', err);
    return jsonResponse({ type: 'text', response: '⚠️ Error al buscar en YouTube. Intenta de nuevo.' }, 200, corsHeaders);
  }
}

export async function handleChat(request: Request, env: Env, corsHeaders: Record<string, string>, ctx: ExecutionContext | null = null) {
  // 1. Autenticar
  const userDni = await requireAuth(request, env);
  if (!userDni) {
    return jsonResponse({ error: 'No autorizado. Inicia sesión.' }, 401, corsHeaders);
  }

  console.log('🔍 handleChat llamado');
  console.log('🔍 env.AI disponible:', !!env.AI);

  try {
    // ✨ LEER body UNA SOLA VEZ
    const { message, conversation_id, audio_mode, force_type, course_id, lesson_id, model, skip_history, web_search, stream, time_zone, image_options, video_options } = await request.json<any>();

    // Validar entrada
    if (!message || typeof message !== 'string') {
      return jsonResponse({ error: 'El campo "message" es requerido' }, 400, corsHeaders);
    }
    if (!conversation_id || typeof conversation_id !== 'string') {
      return jsonResponse({ error: 'El campo "conversation_id" es requerido' }, 400, corsHeaders);
    }

    // Si skip_history, saltar toda la lógica de conversación en DB
    if (!skip_history) {
      // 2. ASEGURAR PERMISO DE ACCESO (MODIFICADO)
      let convData = await env.MIRAI_AI_DB.prepare(
        "SELECT user_dni, course_id FROM conversations WHERE id = ?"
      ).bind(conversation_id).first<any>();

      if (!convData) {
        await ensureConversationExists(conversation_id, message, env, course_id, lesson_id, userDni, model);
        const newConvData = await env.MIRAI_AI_DB.prepare(
          "SELECT user_dni, course_id FROM conversations WHERE id = ?"
        ).bind(conversation_id).first<any>();
        if (!newConvData) {
          return jsonResponse({ error: 'Error interno al crear conversación' }, 500, corsHeaders);
        }
        convData = newConvData;
      }

      const isSharedCourseConv = !!convData.course_id;
      const isOwnedByUser = convData.user_dni === userDni;

      if (!isSharedCourseConv && !isOwnedByUser) {
        return jsonResponse({ error: 'Acceso denegado a esta conversación' }, 403, corsHeaders);
      }

      if (!convData) {
        await env.MIRAI_AI_DB.prepare(
          "UPDATE conversations SET user_dni = ? WHERE id = ?"
        ).bind(userDni, conversation_id).run();
      }
    }

    console.log(`📩 Recibido: audio_mode = ${audio_mode}`);
    if (course_id && lesson_id) {
      console.log(`🎓 Contexto educativo: course=${course_id}, lesson=${lesson_id}`);
    }

    // ✨ PASO 1: CLASIFICAR INTENCIÓN (o usar fuerza del frontend)
    let classification;

    if (force_type && [1, 2, 3, 4].includes(force_type)) {
      classification = { intent: force_type, prompt: message };
      console.log(`⚡ Tipo forzado desde frontend: intent=${force_type}`);
    } else {
      classification = await classifyIntent(message, env);
    }

    console.log(`🎯 Clasificación final: intent=${classification.intent}, prompt="${classification.prompt.substring(0, 80)}"`);

    // ✨ PASO 2: VERIFICAR CUOTA DIARIA ANTES DE ENRUTAR
    const intentToTokenType: Record<number, TokenType> = {
      [INTENT_TYPES.IMAGE]: 'imagen',
      [INTENT_TYPES.VIDEO]: 'video',
      [INTENT_TYPES.MUSIC]: 'musica',
    };
    const tokenType = intentToTokenType[classification.intent];
    if (tokenType) {
      const tokenCheck = await checkAndConsumeToken(userDni, tokenType, env);
      if (!tokenCheck.allowed) {
        const typeLabels: Record<TokenType, string> = { imagen: 'imágenes', musica: 'canciones', video: 'videos' };
        return jsonResponse({
          error: `Has alcanzado el límite diario de ${tokenCheck.limit} ${typeLabels[tokenType]}. Vuelve a intentarlo mañana.`,
          token_limit_reached: true,
          token_type: tokenType,
          used: tokenCheck.used,
          limit: tokenCheck.limit,
        }, 429, corsHeaders);
      }
    }

    // ✨ PASO 3: ENRUTAR SEGÚN INTENCIÓN
    switch (classification.intent) {

      case INTENT_TYPES.IMAGE:
        return await handleRoutedImageGeneration(
          classification.prompt || message,
          message,
          conversation_id,
          userDni,
          env,
          corsHeaders,
          classification.is_copyright === true,
          !!skip_history,
          image_options || {}
        );

      case INTENT_TYPES.VIDEO:
        return await handleVideoGeneration(
          classification.prompt || message,
          conversation_id,
          userDni,
          env,
          corsHeaders,
          !!skip_history,
          video_options || {}
        );

      case INTENT_TYPES.MUSIC:
        return await handleMusicGeneration(
          classification.prompt || message,
          conversation_id,
          userDni,
          env,
          corsHeaders,
          !!skip_history
        );

      case INTENT_TYPES.YOUTUBE:
        return await handleYouTubeSearch(
          classification.prompt || message,
          message,
          conversation_id,
          userDni,
          env,
          corsHeaders,
          !!skip_history
        );

      case INTENT_TYPES.TEXT:
      case INTENT_TYPES.TEXT_DEFAULT:
      default:
        // ✨ PASAR course_id y lesson_id a handleTextChatInternal
        return await handleTextChatInternal(
          message,
          conversation_id,
          audio_mode,
          course_id || null,
          lesson_id || null,
          model || 'deepseek',
          env,
          corsHeaders,
          userDni,
          !!web_search,
          !!stream,
          ctx,
          time_zone
        );
    }

  } catch (error) {
    console.error('Chat handler error:', error.message);
    console.error('Stack:', error.stack);
    return jsonResponse({ error: 'Error procesando el mensaje', details: error.message }, 500, corsHeaders);
  }
}

// --- PARSEAR RESPUESTA DE CLASIFICACIÓN ---
interface IntentClassification {
  intent: number;
  prompt: string;
  is_copyright?: boolean;
}

function parseClassification(content: any): IntentClassification {
  // Intent 1: JSON directo
  try {
    const parsed = JSON.parse(content.trim());
    if (parsed.intent >= 1 && parsed.intent <= 6) {
      return {
        intent: parsed.intent,
        prompt: parsed.prompt || '',
        is_copyright: parsed.is_copyright === true
      };
    }
  } catch (e) {
    // Continuar al fallback
  }

  // Intent 2: Extraer JSON de texto (DeepSeek a veces envuelve en markdown)
  const jsonMatch = content.match(/\{[\s\S]*?"intent"\s*:\s*\d+[\s\S]*?\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.intent >= 1 && parsed.intent <= 6) {
        return {
          intent: parsed.intent,
          prompt: parsed.prompt || '',
          is_copyright: parsed.is_copyright === true
        };
      }
    } catch (e2) {
      // Continuar al fallback
    }
  }

  // Intent 3: Buscar solo el número de intent
  const numberMatch = content.match(/"intent"\s*:\s*(\d)/);
  if (numberMatch) {
    const intent = parseInt(numberMatch[1]);
    // El rango era 1..5, dejando fuera el intent 6 (YOUTUBE) que sí aceptan los
    // dos caminos anteriores: una respuesta de YouTube que solo casara por este
    // patrón terminaba cayendo al texto por defecto.
    if (intent >= 1 && intent <= 6) {
      const promptMatch = content.match(/"prompt"\s*:\s*"([^"]*)"/);
      return {
        intent,
        prompt: promptMatch ? promptMatch[1] : '',
        is_copyright: /"is_copyright"\s*:\s*true/.test(content)
      };
    }
  }

  // Fallback: texto por defecto
  console.warn('⚠️ No se pudo parsear clasificación, usando TEXT por defecto');
  return { intent: INTENT_TYPES.TEXT_DEFAULT, prompt: '' };
}

export async function handleTextChatInternal(message: string, conversation_id: string, audio_mode: string | boolean, course_id: string | null, lesson_id: string | null, model: any, env: Env, corsHeaders: Record<string, string>, userDni: string, webSearch = false, stream = false, ctx: ExecutionContext | null = null, timeZone: string | null = null) {
  try {
    console.log('🔍 handleTextChatInternal llamado');
    console.log('🔍 Parámetros:', { conversation_id, course_id, lesson_id, audio_mode, model, userDni });

    // 1. Asegurar conversación
    await ensureConversationExists(conversation_id, message, env, course_id, lesson_id, userDni, model);

    // 2. Guardar contexto educativo si se proporciona
    if (course_id && lesson_id) {
      await saveConversationContext(conversation_id, course_id, lesson_id, env);
    }

    // 3. El prompt del sistema. Siempre empieza por Mirai (personaje prestado
    // por Mirai Assistant + PUBLIC_CHAT_RULES); si la conversación tiene una
    // tarea —un proyecto de código, una sesión de aprendizaje, una lección—
    // va DEBAJO, como lo que Mirai hace aquí. Antes la tarea sustituía a Mirai
    // entera y en esas conversaciones hablaba «un tutor» sin su conducta.
    const taskPrompt = await buildConversationTaskPrompt(conversation_id, course_id, lesson_id, userDni, env);
    let systemPrompt = await buildMiraiSystemPrompt(env);
    if (taskPrompt) {
      systemPrompt += '\n\n' + wrapTaskPrompt(taskPrompt);
      console.log(`🎓 Tarea de la conversación: ${taskPrompt.substring(0, 60)}...`);
    }

    // Inyectar datos personales del usuario en el system prompt. Solo el
    // nombre: el DNI no le hace falta al modelo para saludar, y todo lo que va
    // en el prompt sale a DeepSeek (o al respaldo) en cada mensaje.
    if (userDni) {
      try {
        const userData = await env.MIRAI_AI_DB.prepare(
          "SELECT first_name, last_name, ai_preferences_json FROM users WHERE dni = ?"
        ).bind(userDni).first<any>();
        if (userData) {
          const personalInfo = `\n\n[DATOS DEL USUARIO] El usuario con quien hablas se llama ${userData.first_name || ''} ${userData.last_name || ''}. Usa su nombre para personalizar tus respuestas, salúdalo por su nombre cuando sea apropiado. Si el usuario se presenta con otro nombre o te pide que lo llames de otra forma, respeta su preferencia sin discutir ni darle vueltas.`;
          systemPrompt += personalInfo;

          if (userData.ai_preferences_json) {
            try {
              const prefs = JSON.parse(userData.ai_preferences_json);
              const entries = Object.entries(prefs).filter(([, v]) => v);
              if (entries.length > 0) {
                systemPrompt += '\n\n[PREFERENCIAS DEL USUARIO] ' + entries.map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`).join('; ') + '. Adapta tus respuestas a estos gustos.';
              }
            } catch (e) { /* ignore malformed prefs */ }
          }
        }
      } catch (e) {
        console.warn('⚠️ Error al obtener datos del usuario para system prompt:', e.message);
      }
    }

    // Explicación del sellado temporal: texto fijo, así que el prefijo del
    // prompt sigue siendo idéntico entre mensajes y la caché aguanta.
    systemPrompt += TEMPORAL_PROMPT_NOTE;
    systemPrompt += REASONING_STYLE_NOTE;

    console.log('System prompt activo:', systemPrompt.substring(0, 80) + '...');

    // 4. Obtener historial
    const history = await getConversationHistory(conversation_id, env);

    // 4.5 Web search — single Exa call, inject context
    let webContext = '';
    if (webSearch && env.EXA_API_KEY) {
      try {
        console.log('🌐 Web search activado para chat');
        const exaRes = await fetch('https://api.exa.ai/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': env.EXA_API_KEY },
          body: JSON.stringify({ query: message, numResults: 5, type: 'auto', contents: { highlights: true } }),
        });
        if (exaRes.ok) {
          const exaData: any = await exaRes.json<any>();
          await logApiUsage(env, { provider: 'exa', unit_type: 'search', sub_type: 'chat_websearch', cost_usd: calcCost('exa', null) });
          const results = (exaData.results || []).slice(0, 5);
          if (results.length > 0) {
            webContext = '\n\n[CONTEXTO WEB — Resultados de búsqueda recientes]\n' +
              results.map((r: any, i: number) => {
                const highlights = (r.highlights || []).join(' ').slice(0, 800);
                return `[${i + 1}] ${r.title || 'Sin título'} (${r.url})\n${highlights}`;
              }).join('\n\n') +
              '\n\n[FIN CONTEXTO WEB] Usa esta información para complementar tu respuesta. Cita las fuentes cuando sea relevante.';
            console.log(`🌐 ${results.length} resultados web inyectados`);
          }
        }
      } catch (e) {
        console.warn('⚠️ Web search falló:', e.message);
      }
    }

    const finalMessage = webContext ? message + webContext : message;

    // 4.6 Sellado temporal
    const zone = normalizeTimeZone(timeZone);
    const now = new Date();
    const historyTurns = annotateHistoryTurns(history, zone);
    const stampedMessage = `${buildCurrentTurnHeader(now, zone, history)}\n${finalMessage}`;
    console.log(`🕒 Contexto temporal: ${formatShortStamp(now, zone)} (${zone})`);

    // 5. ENRUTAR SEGÚN EL MODELO
    let aiModel;
    let aiMessages;
    let aiOptions;

    if (model === 'llama') {
      console.log('🦙 Usando DeepLlama (Gateway)');
      aiModel = AI_MODEL_NORMAL;
      aiMessages = [
        { role: 'system', content: systemPrompt },
        ...historyTurns,
        { role: 'user', content: stampedMessage }
      ];
      aiOptions = { temperature: 0.7, max_tokens: CHAT_MAX_TOKENS };

    } else if (model === 'deepseek-reasoner') {
      console.log('🧠 Usando modelo DeepSeek Reasoner (Pro)');
      aiModel = AI_MODEL_PRO;
      aiMessages = [
        ...historyTurns,
        { role: "user", content: stampedMessage }
      ];
      if (aiMessages.length === 1) {
        aiMessages[0].content = `[Contexto del sistema]\n${systemPrompt}\n\n[Pregunta del usuario]\n${stampedMessage}`;
      }
      aiOptions = { temperature: 0.6, max_tokens: 8000 };

    } else {
      console.log('🚀 Usando modelo DeepSeek');
      aiModel = AI_MODEL_NORMAL;
      aiMessages = [
        { role: "system", content: systemPrompt },
        ...historyTurns,
        { role: "user", content: stampedMessage }
      ];
      aiOptions = { temperature: 0.7, max_tokens: CHAT_MAX_TOKENS };
    }

    // 5.b Modo streaming (SSE): el cliente pinta pensamiento y respuesta trozo a
    // trozo. Con audio_mode 'always' se responde en JSON como siempre, porque el
    // TTS sólo puede generarse cuando el texto está completo.
    if (stream && audio_mode !== 'always') {
      return streamTextChat({
        aiModel, aiMessages, aiOptions,
        message, conversation_id, env, corsHeaders, userDni, ctx
      });
    }

    const { text: aiResponse, reasoning: aiReasoning } = await callAIEnsuringAnswer({
      aiModel, aiMessages, aiOptions, env
    });

    // 6. Procesar respuesta
    const { cleanResponse, suggestions } = extractSuggestions(aiResponse);

    let audio_url: string | null = null;
    if (audio_mode === 'always' && cleanResponse.length > 0) {
      audio_url = await generateAndStoreTTS(cleanResponse, conversation_id, env);
    }

    await saveMessage(conversation_id, 'user', message, env, null, null, null, userDni);
    await saveMessage(conversation_id, 'assistant', cleanResponse, env, audio_url, null, null, userDni, AI_MODEL_NORMAL, aiReasoning || null);
    await updateConversationTimestamp(conversation_id, env);

    return jsonResponse({
      response: cleanResponse,
      reasoning: aiReasoning || null,
      audio_url: audio_url,
      suggestions: suggestions
    }, 200, corsHeaders);

  } catch (error) {
    console.error('❌ Error en handleTextChatInternal:', error.message);
    return jsonResponse({ error: 'Error procesando mensaje', details: error.message }, 500, corsHeaders);
  }
}

// ── CHAT DE TEXTO EN STREAMING (SSE) ──────────────────────────
// Devuelve de inmediato una respuesta cuyo cuerpo se va llenando con eventos:
//   {type:'reasoning', delta}  trozo de la cadena de pensamiento
//   {type:'content',   delta}  trozo de la respuesta visible
//   {type:'reset'}             descartar lo pintado (entró el modelo de respaldo)
//   {type:'done', response, reasoning, suggestions}
//   {type:'error', error}
// El bloque [SUGGESTIONS]…[/SUGGESTIONS] se retiene en el servidor para que no
// aparezca a medio escribir dentro de la burbuja.
function streamTextChat({ aiModel, aiMessages, aiOptions, message, conversation_id, env, corsHeaders, userDni, ctx }: {
  aiModel: string; aiMessages: any[]; aiOptions: CallAIOptions; message: string; conversation_id: string;
  env: Env; corsHeaders: Record<string, string>; userDni: string; ctx: ExecutionContext | null;
}) {
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  // Si el usuario cierra la pestaña, escribir en el stream falla. Ese fallo NO
  // debe propagarse a callAI: allí un error se interpreta como caída de DeepSeek
  // y dispararía una segunda generación completa con el modelo de respaldo.
  let clientGone = false;
  const send = async (payload: unknown) => {
    if (clientGone) return;
    try {
      await writer.write(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
    } catch (_) {
      clientGone = true;
    }
  };

  const SUG_OPEN = '[SUGGESTIONS]';

  // Cuánto del buffer puede emitirse sin riesgo de partir el marcador de
  // sugerencias por la mitad.
  const safeLength = (buf: string) => {
    const i = buf.lastIndexOf('[');
    if (i === -1) return buf.length;
    const tail = buf.slice(i);
    if (tail.length >= SUG_OPEN.length) return tail.startsWith(SUG_OPEN) ? i : buf.length;
    return SUG_OPEN.startsWith(tail) ? i : buf.length;
  };

  const run = async () => {
    // Primer evento inmediato: abre el stream sin esperar al primer token del
    // modelo y evita que un intermediario lo mantenga en buffer.
    await send({ type: 'start' });

    let contentBuffer = '';
    let emitted = 0;
    let suggestionsStarted = false;

    const onDelta = async (type: AIDeltaKind, text: string) => {
      if (type === 'reset') {
        contentBuffer = '';
        emitted = 0;
        suggestionsStarted = false;
        await send({ type: 'reset' });
        return;
      }
      if (type === 'reasoning') {
        await send({ type: 'reasoning', delta: text });
        return;
      }
      contentBuffer += text;
      if (suggestionsStarted) return;
      if (contentBuffer.includes(SUG_OPEN)) suggestionsStarted = true;
      const limit = safeLength(contentBuffer);
      if (limit > emitted) {
        await send({ type: 'content', delta: contentBuffer.slice(emitted, limit) });
        emitted = limit;
      }
    };

    try {
      const { text: aiResponse, reasoning: aiReasoning } = await callAIEnsuringAnswer({
        aiModel, aiMessages, aiOptions, env, onDelta
      });
      const { cleanResponse, suggestions } = extractSuggestions(aiResponse);
      const reasoning = aiReasoning || null;

      try {
        await saveMessage(conversation_id, 'user', message, env, null, null, null, userDni);
        await saveMessage(conversation_id, 'assistant', cleanResponse, env, null, null, null, userDni, AI_MODEL_NORMAL, reasoning);
        await updateConversationTimestamp(conversation_id, env);
      } catch (dbError) {
        // La respuesta ya se entregó al usuario: un fallo al persistirla no debe
        // convertirse en un error visible en pantalla.
        console.error('❌ Error guardando mensajes del stream:', dbError.message);
      }

      await send({ type: 'done', response: cleanResponse, reasoning, suggestions, audio_url: null });
    } catch (error) {
      console.error('❌ Error en streamTextChat:', error.message);
      await send({ type: 'error', error: error.message || 'Error procesando mensaje' });
    } finally {
      try { await writer.close(); } catch (_) { /* ya cerrado */ }
    }
  };

  // waitUntil mantiene vivo el worker aunque el cliente cierre la conexión, de
  // modo que la respuesta acabe guardándose en la conversación.
  const task = run();
  if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(task);

  return new Response(readable, {
    status: 200,
    headers: {
      ...corsHeaders,
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    }
  });
}

function extractSuggestions(aiResponse: any) {
  if (!aiResponse || typeof aiResponse !== 'string') {
    return { cleanResponse: aiResponse || '', suggestions: [] };
  }

  const suggestionsMatch = aiResponse.match(/\[SUGGESTIONS\]([\s\S]*?)\[\/SUGGESTIONS\]/);

  if (!suggestionsMatch) {
    console.warn('⚠️ No se encontró bloque [SUGGESTIONS] en la respuesta');
    return { cleanResponse: aiResponse, suggestions: [] };
  }

  const suggestionsText = suggestionsMatch[1].trim();
  const suggestions = suggestionsText
    .split('\n')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('['))
    .slice(0, 6);

  const cleanResponse = aiResponse
    .replace(/\[SUGGESTIONS\][\s\S]*?\[\/SUGGESTIONS\]/, '')
    .trim();

  console.log('✅ Sugerencias encontradas:', suggestions.length);

  return { cleanResponse, suggestions };
}
