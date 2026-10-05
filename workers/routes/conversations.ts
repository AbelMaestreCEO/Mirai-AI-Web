/* ============================================
   MIRAI AI - Conversaciones del chat
   Historial, mensajes, contexto educativo y adjuntos.
   ============================================ */
import { AI_MODEL_NORMAL } from '../lib/ai-models';
import { requireAuth } from '../lib/auth';
import { jsonResponse } from '../lib/http';
import { LEARNING_MODES, getAssignmentForStudent, getLessonContext } from './chat-context';

// ── SESIONES DE APRENDIZAJE ───────────────────────────────────
// Un chat por (usuario, tarea o lección, modo), que se retoma si ya existe.
// El servidor guarda QUÉ se estudia y en qué modo (learning_context), y con
// eso arma él mismo la tarea de Mirai en cada mensaje
// (buildConversationTaskPrompt). El navegador ya no manda ningún prompt.
//
// La identidad sale de la sesión (requireAuth), no de una cabecera que pone
// el propio navegador: antes este endpoint y /api/set-system-prompt se
// fiaban de X-User-DNI, así que bastaba un DNI ajeno y un id de conversación
// para cambiarle el prompt a la conversación de otra persona.
export async function handleGetOrCreateLearningChat(request, env, corsHeaders) {
  const userDni = await requireAuth(request, env);
  if (!userDni) return jsonResponse({ error: 'No autorizado. Inicia sesión.' }, 401, corsHeaders);

  const url = new URL(request.url);
  const mode = url.searchParams.get('mode');
  const assignmentId = url.searchParams.get('assignment_id');
  const courseId = url.searchParams.get('course_id');
  const lessonId = url.searchParams.get('lesson_id');

  if (!mode || !LEARNING_MODES[mode]) {
    return jsonResponse({ error: 'Modo no válido: theory, quiz o practice' }, 400, corsHeaders);
  }

  const db = env.MIRAI_AI_DB;
  let context;
  let subject;

  if (assignmentId) {
    const assignment = await getAssignmentForStudent(assignmentId, userDni, env);
    if (!assignment) return jsonResponse({ error: 'Tarea no encontrada o sin acceso' }, 404, corsHeaders);
    context = { kind: 'assignment', assignment_id: String(assignment.id), mode };
    subject = assignment.title;
  } else if (courseId && lessonId) {
    const lesson = await getLessonContext(courseId, lessonId, env);
    if (!lesson) return jsonResponse({ error: 'Lección no encontrada' }, 404, corsHeaders);
    context = { kind: 'lesson', course_id: String(courseId), lesson_id: String(lessonId), mode };
    subject = lesson.title;
  } else {
    return jsonResponse({ error: 'Falta assignment_id, o course_id y lesson_id' }, 400, corsHeaders);
  }

  // JSON.stringify con las claves siempre en el mismo orden: la búsqueda es
  // por igualdad exacta. (Antes miraba solo el último chat de aprendizaje del
  // usuario, y cambiar de tarea creaba uno nuevo cada vez.)
  const learningContext = JSON.stringify(context);

  const existing = await db.prepare(
    'SELECT id, title FROM conversations WHERE user_dni = ? AND learning_context = ? ORDER BY updated_at DESC LIMIT 1'
  ).bind(userDni, learningContext).first();

  if (existing) {
    return jsonResponse({ chat_id: existing.id, title: existing.title, is_new: false }, 200, corsHeaders);
  }

  const modeLabels = { theory: 'Teoría', quiz: 'Quiz', practice: 'Práctica' };
  const chatId = `learn_${crypto.randomUUID()}`;
  const now = Math.floor(Date.now() / 1000);
  const title = `${modeLabels[mode]}: ${String(subject || 'Aprendizaje').slice(0, 80)}`;

  await db.prepare(`
        INSERT INTO conversations (id, title, model, created_at, updated_at, user_dni, learning_context)
        VALUES (?, ?, 'deepseek-r1', ?, ?, ?, ?)
    `).bind(chatId, title, now, now, userDni, learningContext).run();

  return jsonResponse({ chat_id: chatId, title, is_new: true }, 201, corsHeaders);
}

// --- MANEJAR HISTORIAL (CORREGIDO) ---
export async function handleHistory(request, conversationId, env, corsHeaders) {
  try {
    // 1. AUTENTICAR
    const userDni = await requireAuth(request, env);
    if (!userDni) {
      return jsonResponse({ error: 'No autorizado. Inicia sesión.' }, 401, corsHeaders);
    }

    if (!conversationId) {
      return jsonResponse({ error: 'conversation_id es requerido' }, 400, corsHeaders);
    }

    // 2. VERIFICAR PROPIEDAD (MODIFICADO)
    const conv = await env.MIRAI_AI_DB.prepare(
      "SELECT user_dni, course_id FROM conversations WHERE id = ?"
    ).bind(conversationId).first();

    if (!conv) {
      return jsonResponse({ error: 'Conversación no encontrada' }, 404, corsHeaders);
    }

    if (conv.user_dni !== userDni) {
      return jsonResponse({ error: 'Acceso denegado a esta conversación' }, 403, corsHeaders);
    }

    // ✅ PERMITIR ACCESO SI ES CONVERSACIÓN DE CURSO (Compartida)
    // O SI EL USUARIO ES EL DUEÑO (Conversación normal)
    const isSharedCourseConv = !!conv.course_id;
    const isOwnedByUser = conv.user_dni === userDni;
    if (!isSharedCourseConv && !isOwnedByUser) {
      console.warn(`⛔ Bloqueo: Usuario ${userDni} intenta acceder a conv ${conversationId} que no es suya ni es de curso.`);
      return jsonResponse({ error: 'Acceso denegado a esta conversación' }, 403, corsHeaders);
    }

    // 3. OBTENER HISTORIAL COMPLETO para el frontend
    // `reasoning` puede no existir todavía si la migración aún no ha corrido en
    // este aislado, así que se consulta con reserva.
    let results;
    try {
      ({ results } = await env.MIRAI_AI_DB.prepare(`
        SELECT id, role, content, audio_url, video_url, reasoning, created_at
        FROM messages
        WHERE conversation_id = ?
        ORDER BY created_at ASC
      `).bind(conversationId).all());
    } catch (columnError) {
      ({ results } = await env.MIRAI_AI_DB.prepare(`
        SELECT id, role, content, audio_url, video_url, created_at
        FROM messages
        WHERE conversation_id = ?
        ORDER BY created_at ASC
      `).bind(conversationId).all());
    }
    const messages = results.map(row => ({
      id: row.id,
      role: row.role,
      content: row.content,
      audio_url: row.audio_url,
      video_url: row.video_url,
      reasoning: row.reasoning ?? null,
      created_at: row.created_at
    }));

    return jsonResponse(messages, 200, corsHeaders);

  } catch (error) {
    console.error('History handler error:', error);
    return jsonResponse({ error: 'Error obteniendo historial' }, 500, corsHeaders);
  }
}

export async function getConversationHistory(conversationId, env, limit = 20) {
  const stmt = env.MIRAI_AI_DB.prepare(`
    SELECT id, role, content, audio_url, video_url, created_at
    FROM messages
    WHERE conversation_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `);
  const { results } = await stmt.bind(conversationId, limit).all();
  results.reverse();
  return results.map(row => ({
    id: row.id,
    role: row.role,
    content: row.content,
    audio_url: row.audio_url,
    video_url: row.video_url,
    created_at: row.created_at
  }));
}

// --- GUARDAR MENSAJE (CORREGIDO) ---
export async function saveMessage(conversationId, role, content, env, audioUrl: string | null = null, videoUrl: string | null = null, thumbnailUrl: string | null = null, userDni: string | null = null, model = AI_MODEL_NORMAL, reasoning: string | null = null) {
  try {
    await ensureConversationExists(conversationId, content, env, null, null, userDni, model);

    if (userDni) {
      const conv = await env.MIRAI_AI_DB.prepare(
        "SELECT user_dni, course_id FROM conversations WHERE id = ?"
      ).bind(conversationId).first();

      if (conv) {
        const isSharedCourseConv = !!conv.course_id;
        const isOwnedByUser = conv.user_dni === userDni;

        if (!isSharedCourseConv && !isOwnedByUser) {
          throw new Error('Acceso denegado: no puedes escribir en esta conversación');
        }
      }
    }

    const messageId = crypto.randomUUID();

    try {
      const stmt = env.MIRAI_AI_DB.prepare(`
        INSERT INTO messages (id, conversation_id, role, content, audio_url, video_url, thumbnail_url, reasoning, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `);
      await stmt.bind(messageId, conversationId, role, content, audioUrl, videoUrl, thumbnailUrl, reasoning).run();
    } catch (columnError) {
      // Base de datos aún sin la columna 'reasoning' (la migración corre en
      // handleApiRequest): guardar el mensaje sin el pensamiento antes que perderlo.
      console.warn('⚠️ INSERT con reasoning falló, reintentando sin la columna:', columnError.message);
      const legacyStmt = env.MIRAI_AI_DB.prepare(`
        INSERT INTO messages (id, conversation_id, role, content, audio_url, video_url, thumbnail_url, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `);
      await legacyStmt.bind(messageId, conversationId, role, content, audioUrl, videoUrl, thumbnailUrl).run();
    }

    return messageId;
  } catch (error) {
    console.error('Error saving message:', error);
    throw error;
  }
}

export async function ensureConversationExists(conversationId, firstMessage, env, courseId: string | null = null, lessonId: string | null = null, userDni: string | null = null, model = AI_MODEL_NORMAL) {
  try {
    // 1. Verificar si ya existe
    const existing = await env.MIRAI_AI_DB.prepare(
      "SELECT id FROM conversations WHERE id = ?"
    ).bind(conversationId).first();

    if (!existing) {
      console.log(`🆕 Conversación NO encontrada. Creando: ${conversationId}`);

      const title = firstMessage ? firstMessage.substring(0, 50) + (firstMessage.length > 50 ? '...' : '') : 'Nueva conversación';

      // Insertar con todos los campos necesarios
      await env.MIRAI_AI_DB.prepare(
        `INSERT INTO conversations (id, title, model, course_id, lesson_id, user_dni, created_at, updated_at) 
         VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
      ).bind(
        conversationId,
        title,
        model,
        courseId || null,
        lessonId || null,
        userDni || null // Si es curso, user_dni puede ser null
      ).run();

      console.log(`✅ Conversación creada exitosamente: ${conversationId}`);
    } else {
      console.log(`ℹ️ Conversación ya existe: ${conversationId}`);
    }
  } catch (error) {
    console.error(`❌ ERROR CRÍTICO al asegurar conversación ${conversationId}:`, error.message);
    console.error(`Stack:`, error.stack);
    // No lanzamos el error aquí para no romper el flujo, pero sí loguearlo
    throw error; // Opcional: si quieres que falle la petición si no se puede crear
  }
}

// Actualizar timestamp de conversación
export async function updateConversationTimestamp(conversationId, env) {
  try {
    const stmt = env.MIRAI_AI_DB.prepare(`
      UPDATE conversations
      SET updated_at = datetime('now')
      WHERE id = ?
    `);

    await stmt.bind(conversationId).run();

  } catch (error) {
    console.error('Error updating conversation timestamp:', error);
  }
}

/**
 * POST /api/upload — adjunta un archivo a una conversación del chat.
 *
 * La ruta existía en el router desde siempre, pero la función nunca llegó a
 * escribirse: la llamada lanzaba un ReferenceError que el try/catch de
 * handleApiRequest convertía en un 500 genérico, así que adjuntar archivos en
 * el chat estaba roto de forma silenciosa. public/app.js espera { r2_key, url }.
 */
const UPLOAD_ALLOWED_EXTENSIONS = ['txt', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'csv'];

const UPLOAD_MAX_FILE_SIZE = 10 * 1024 * 1024;

export async function handleUpload(request, env, corsHeaders) {
  try {
    const userDni = await requireAuth(request, env);
    if (!userDni) return jsonResponse({ error: 'No autorizado' }, 401, corsHeaders);

    let formData;
    try { formData = await request.formData(); } catch {
      return jsonResponse({ error: 'FormData inválido' }, 400, corsHeaders);
    }

    const file = formData.get('file');
    const conversationId = formData.get('conversation_id');

    if (!file || typeof file === 'string') {
      return jsonResponse({ error: 'Archivo requerido' }, 400, corsHeaders);
    }

    const extension = (file.name.split('.').pop() || '').toLowerCase();
    if (!UPLOAD_ALLOWED_EXTENSIONS.includes(extension)) {
      return jsonResponse({ error: `El formato .${extension} no está permitido` }, 400, corsHeaders);
    }
    if (file.size > UPLOAD_MAX_FILE_SIZE) {
      return jsonResponse({ error: 'El archivo excede el límite de 10MB' }, 400, corsHeaders);
    }

    // Si se indica conversación, tiene que ser del usuario: la clave R2 y la
    // fila de attachments cuelgan de ella.
    if (conversationId) {
      const conv = await env.MIRAI_AI_DB.prepare(
        'SELECT id, user_dni FROM conversations WHERE id = ?'
      ).bind(conversationId).first();

      if (conv && (conv.user_dni || '').toUpperCase() !== userDni.toUpperCase()) {
        return jsonResponse({ error: 'No tienes acceso a esta conversación' }, 403, corsHeaders);
      }
    }

    const attachmentId = crypto.randomUUID();
    const r2Key = `attachments/${userDni.toUpperCase()}/${conversationId || 'sin-conversacion'}/${attachmentId}.${extension}`;

    await env.MIRAI_AI_ASSETS.put(r2Key, file.stream(), {
      httpMetadata: { contentType: file.type || 'application/octet-stream' },
      customMetadata: {
        user_dni: userDni.toUpperCase(),
        conversation_id: conversationId || '',
        original_name: file.name,
      },
    });

    // El registro en D1 es best-effort: la tabla attachments exige
    // conversation_id NOT NULL, así que sin conversación se omite la fila pero
    // el adjunto ya está en R2 y la respuesta sigue siendo válida.
    if (conversationId) {
      try {
        await env.MIRAI_AI_DB.prepare(
          `INSERT INTO attachments (id, conversation_id, r2_key, original_name, file_type)
           VALUES (?, ?, ?, ?, ?)`
        ).bind(attachmentId, conversationId, r2Key, file.name, extension).run();
      } catch (dbError) {
        console.warn('⚠️ No se pudo registrar el adjunto en D1:', dbError.message);
      }
    }

    return jsonResponse({
      success: true,
      id: attachmentId,
      r2_key: r2Key,
      url: `/api/attachment/${r2Key}`,
    }, 201, corsHeaders);

  } catch (error) {
    console.error('Error en handleUpload:', error);
    return jsonResponse({ error: 'Error al subir el archivo' }, 500, corsHeaders);
  }
}

// --- ELIMINAR CONVERSACIÓN (CORREGIDO) ---
export async function handleDeleteConversation(request, conversationId, env, corsHeaders) {
  try {
    // 1. AUTENTICAR
    const userDni = await requireAuth(request, env);
    if (!userDni) {
      return jsonResponse({ error: 'No autorizado. Inicia sesión.' }, 401, corsHeaders);
    }

    // 2. VERIFICAR PROPIEDAD
    const conv = await env.MIRAI_AI_DB.prepare(
      "SELECT user_dni, course_id FROM conversations WHERE id = ?"
    ).bind(conversationId).first();

    if (!conv) {
      return jsonResponse({ error: 'Conversación no encontrada' }, 404, corsHeaders);
    }

    if (conv.user_dni !== userDni) {
      return jsonResponse({ error: 'No puedes eliminar conversaciones de otros usuarios' }, 403, corsHeaders);
    }

    // 3. ELIMINAR (solo si es dueño)
    await env.MIRAI_AI_DB.prepare(
      "DELETE FROM messages WHERE conversation_id = ?"
    ).bind(conversationId).run();

    await env.MIRAI_AI_DB.prepare(
      "DELETE FROM conversations WHERE id = ? AND user_dni = ?"
    ).bind(conversationId, userDni).run();

    return jsonResponse({
      success: true,
      was_course: !!conv.course_id
    }, 200, corsHeaders);

  } catch (error) {
    console.error('Error deleting conversation:', error);
    return jsonResponse({ error: error.message }, 500, corsHeaders);
  }
}

export async function handleListConversations(request, env, corsHeaders) {
  try {
    const userDni = await requireAuth(request, env);
    if (!userDni) {
      return jsonResponse({ error: 'No autorizado. Inicia sesión.' }, 401, corsHeaders);
    }

    console.log(`🔍 [DEBUG] Listando conversaciones para usuario: "${userDni}"`);

    // CORRECCIÓN: Agregar user_dni a la SELECT
    const stmt = env.MIRAI_AI_DB.prepare(`
      SELECT id, title, created_at, updated_at, course_id, user_dni
      FROM conversations
      WHERE user_dni = ? 
      AND (course_id IS NULL OR course_id = '' OR course_id = 'NULL')
      ORDER BY updated_at DESC
      LIMIT 50
    `);

    const queryResult = await stmt.bind(userDni).all();

    if (!queryResult || !queryResult.results) {
      return jsonResponse({ regular: [], courses: [] }, 200, corsHeaders);
    }

    const allConversations = queryResult.results;

    // El filtro ahora funcionará porque user_dni está disponible
    const regular = allConversations.filter(r => {
      const hasCourse = r.course_id !== null && r.course_id !== undefined && r.course_id !== '';
      return !hasCourse && r.user_dni === userDni;
    });

    const courses = allConversations.filter(r => {
      const hasCourse = r.course_id !== null && r.course_id !== undefined && r.course_id !== '';
      return hasCourse;
    });

    console.log(`✅ [FINAL] Encontradas: ${regular.length} normales, ${courses.length} de cursos`);

    return jsonResponse({ regular, courses }, 200, corsHeaders);

  } catch (error) {
    console.error('❌ Error listing conversations:', error);
    return jsonResponse({ error: 'Error obteniendo conversaciones', details: error.message }, 500, corsHeaders);
  }
}

// --- RENOMBRAR CONVERSACIÓN ---
export async function handleRenameConversation(request, env, corsHeaders) {
  try {
    const { conversation_id, title } = await request.json();

    if (!conversation_id || !title) {
      return jsonResponse({ error: 'Faltan campos' }, 400, corsHeaders);
    }

    const stmt = env.MIRAI_AI_DB.prepare(`
      UPDATE conversations SET title = ?, updated_at = datetime('now')
      WHERE id = ?
    `);

    await stmt.bind(title.substring(0, 100), conversation_id).run();

    return jsonResponse({ success: true }, 200, corsHeaders);

  } catch (error) {
    console.error('Error renaming conversation:', error);
    return jsonResponse({ error: 'Error renombrando conversación' }, 500, corsHeaders);
  }
}

export async function saveConversationContext(conversationId, courseId, lessonId, env) {
  try {
    await env.MIRAI_AI_DB.prepare(
      `UPDATE conversations SET course_id = ?, lesson_id = ?, updated_at = datetime('now')
       WHERE id = ?`
    ).bind(courseId, lessonId, conversationId).run();
    console.log('🎓 Contexto educativo guardado:', courseId, lessonId);
  } catch (error) {
    console.error('❌ Error guardando contexto educativo:', error.message);
  }
}

export async function getConversationEducationContext(conversationId, env) {
  try {
    const result = await env.MIRAI_AI_DB.prepare(
      `SELECT course_id, lesson_id FROM conversations WHERE id = ?`
    ).bind(conversationId).first();
    return result;
  } catch (error) {
    console.error('❌ Error obteniendo contexto educativo:', error.message);
    return null;
  }
}

// --- NUEVA FUNCIÓN: Obtener o Crear Conversación de Curso PRIVADA por Usuario ---
export async function getOrCreateEducationConversation(courseId, lessonId, userDni, env) {
  try {
    console.log(`🎓 Buscando conversación para Curso: ${courseId}, Lección: ${lessonId}, Usuario: ${userDni}`);

    // 1. Buscar si el usuario YA tiene una conversación para este curso
    // IMPORTANTE: Filtramos POR user_dni Y course_id
    const existing = await env.MIRAI_AI_DB.prepare(
      `SELECT id FROM conversations 
       WHERE user_dni = ? AND course_id = ?`
    ).bind(userDni, courseId).first();

    if (existing) {
      console.log(`✅ Conversación existente encontrada: ${existing.id}`);
      return existing.id;
    }

    // 2. Si no existe, CREAR UNA NUEVA específica para este usuario
    const newConvId = crypto.randomUUID();
    const title = `Curso: ${courseId} - Lección: ${lessonId}`;

    await env.MIRAI_AI_DB.prepare(
      `INSERT INTO conversations (id, title, course_id, lesson_id, user_dni, created_at, updated_at) 
       VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
    ).bind(newConvId, title, courseId, lessonId, userDni).run();

    console.log(`✅ Nueva conversación creada para usuario ${userDni}: ${newConvId}`);
    return newConvId;

  } catch (error) {
    console.error('❌ Error en getOrCreateEducationConversation:', error.message);
    throw error;
  }
}
