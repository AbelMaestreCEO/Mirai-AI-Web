/* ============================================
   MIRAI AI - Chats de código (code.html)

   ============================================ */
import { requireAuth } from '../lib/auth';
import { jsonResponse, safeJsonParse } from '../lib/http';
import { handleTextChatInternal } from './chat';

/* ════════════════════════════════════════════════════════════
   BLOQUE 2 — HANDLERS
   ════════════════════════════════════════════════════════════ */

// ─────────────────────────────────────────────────────────────
// GET /api/code-chats?project_id=xxx
// Lista los chats de código asociados a un proyecto del usuario
// ─────────────────────────────────────────────────────────────
export async function handleCodeChatList(request: Request, env: Env, corsHeaders: Record<string, string>, url: URL) {
  const userDni = await requireAuth(request, env);
  if (!userDni) return jsonResponse({ error: 'No autorizado' }, 401, corsHeaders);

  const projectId = url.searchParams.get('project_id');
  if (!projectId) return jsonResponse({ error: 'project_id requerido' }, 400, corsHeaders);

  // Verificar que el proyecto pertenece al usuario
  const project = await env.MIRAI_AI_DB.prepare(
    'SELECT id, name FROM projects WHERE id = ? AND user_dni = ?'
  ).bind(projectId, userDni.toUpperCase()).first<any>();

  if (!project) return jsonResponse({ error: 'Proyecto no encontrado o sin permiso' }, 404, corsHeaders);

  try {
    const { results } = await env.MIRAI_AI_DB.prepare(`
      SELECT id, title, created_at, updated_at
      FROM conversations
      WHERE project_id = ? AND user_dni = ?
      ORDER BY updated_at DESC
      LIMIT 50
    `).bind(projectId, userDni.toUpperCase()).all<any>();

    return jsonResponse({ chats: results }, 200, corsHeaders);
  } catch (error) {
    console.error('[CodeChat] Error al listar chats:', error);
    return jsonResponse({ error: 'Error al obtener chats' }, 500, corsHeaders);
  }
}

// ─────────────────────────────────────────────────────────────
// POST /api/code-chats
// Body: { project_id, title? }
// Crea una nueva conversación vinculada al proyecto.
// Fetcha el contexto del proyecto y lo guarda como system_prompt
// para que handleTextChatInternal lo use automáticamente.
// ─────────────────────────────────────────────────────────────
export async function handleCodeChatCreate(request: Request, env: Env, corsHeaders: Record<string, string>) {
  const userDni = await requireAuth(request, env);
  if (!userDni) return jsonResponse({ error: 'No autorizado' }, 401, corsHeaders);

  let body;
  try { body = await request.json<any>(); } catch {
    return jsonResponse({ error: 'JSON inválido' }, 400, corsHeaders);
  }

  const { project_id, title = 'Nuevo chat' } = body;
  if (!project_id) return jsonResponse({ error: 'project_id requerido' }, 400, corsHeaders);

  // Verificar propiedad del proyecto y obtener su info
  const project = await env.MIRAI_AI_DB.prepare(
    'SELECT id, name, tech_stack FROM projects WHERE id = ? AND user_dni = ?'
  ).bind(project_id, userDni.toUpperCase()).first<any>();

  if (!project) return jsonResponse({ error: 'Proyecto no encontrado o sin permiso' }, 404, corsHeaders);

  try {
    // Obtener archivos del proyecto para construir el contexto
    const { results: files } = await env.MIRAI_AI_DB.prepare(
      'SELECT id, name, r2_key, size FROM project_files WHERE project_id = ? ORDER BY uploaded_at ASC'
    ).bind(project_id).all<any>();

    // Construir el system prompt con el contexto de los archivos
    const systemPrompt = await buildCodeSystemPrompt(project, files, env);

    // Crear la conversación en D1
    const conversationId = crypto.randomUUID();
    const now = new Date().toISOString();
    const safeTitle = (title || 'Nuevo chat').substring(0, 100);

    await env.MIRAI_AI_DB.prepare(`
      INSERT INTO conversations
        (id, title, model, user_dni, project_id, system_prompt, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      conversationId,
      safeTitle,
      'deepseek',
      userDni.toUpperCase(),
      project_id,
      systemPrompt,
      now,
      now
    ).run();

    return jsonResponse({
      success: true,
      chat: {
        id: conversationId,
        title: safeTitle,
        created_at: now,
        updated_at: now,
      },
    }, 201, corsHeaders);
  } catch (error: any) {
    console.error('[CodeChat] Error al crear chat:', error);
    return jsonResponse({ error: 'Error al crear chat', details: error.message }, 500, corsHeaders);
  }
}

// ─────────────────────────────────────────────────────────────
// DELETE /api/code-chats/:id
// Elimina el chat y todos sus mensajes
// ─────────────────────────────────────────────────────────────
export async function handleCodeChatDelete(request: Request, env: Env, corsHeaders: Record<string, string>, chatId: string) {
  const userDni = await requireAuth(request, env);
  if (!userDni) return jsonResponse({ error: 'No autorizado' }, 401, corsHeaders);

  // Verificar propiedad
  const chat = await env.MIRAI_AI_DB.prepare(
    'SELECT id FROM conversations WHERE id = ? AND user_dni = ? AND project_id IS NOT NULL'
  ).bind(chatId, userDni.toUpperCase()).first<any>();

  if (!chat) return jsonResponse({ error: 'Chat no encontrado o sin permiso' }, 404, corsHeaders);

  try {
    // Eliminar mensajes primero
    await env.MIRAI_AI_DB.prepare(
      'DELETE FROM messages WHERE conversation_id = ?'
    ).bind(chatId).run();

    // Eliminar conversación
    await env.MIRAI_AI_DB.prepare(
      'DELETE FROM conversations WHERE id = ?'
    ).bind(chatId).run();

    return jsonResponse({ success: true }, 200, corsHeaders);
  } catch (error) {
    console.error('[CodeChat] Error al eliminar chat:', error);
    return jsonResponse({ error: 'Error al eliminar chat' }, 500, corsHeaders);
  }
}

// ─────────────────────────────────────────────────────────────
// POST /api/code-chat/message
// Body: { message, conversation_id, project_id, model? }
// Envía un mensaje y obtiene respuesta de la IA.
// Delega en handleTextChatInternal() que ya lee el system_prompt
// guardado en la conversación (el contexto del proyecto).
// ─────────────────────────────────────────────────────────────
export async function handleCodeChatMessage(request: Request, env: Env, corsHeaders: Record<string, string>) {
  const userDni = await requireAuth(request, env);
  if (!userDni) return jsonResponse({ error: 'No autorizado' }, 401, corsHeaders);

  let body;
  try { body = await request.json<any>(); } catch {
    return jsonResponse({ error: 'JSON inválido' }, 400, corsHeaders);
  }

  const { message, conversation_id, project_id, model = 'deepseek' } = body;

  if (!message || typeof message !== 'string' || !message.trim()) {
    return jsonResponse({ error: 'El campo "message" es requerido' }, 400, corsHeaders);
  }
  if (!conversation_id) {
    return jsonResponse({ error: 'El campo "conversation_id" es requerido' }, 400, corsHeaders);
  }

  // Verificar que la conversación pertenece al usuario y es un code chat
  const conv = await env.MIRAI_AI_DB.prepare(
    'SELECT id, project_id FROM conversations WHERE id = ? AND user_dni = ?'
  ).bind(conversation_id, userDni.toUpperCase()).first<any>();

  if (!conv) {
    return jsonResponse({ error: 'Conversación no encontrada o sin permiso' }, 404, corsHeaders);
  }

  // Si se envía project_id, verificar coherencia
  if (project_id && conv.project_id !== project_id) {
    return jsonResponse({ error: 'El chat no pertenece a ese proyecto' }, 403, corsHeaders);
  }

  // Delegar en handleTextChatInternal (reutiliza toda la lógica existente:
  // historial, system_prompt desde DB, llamada a DeepSeek/Llama, TTS, etc.)
  return await handleTextChatInternal(
    message.trim(),
    conversation_id,
    false,      // audio_mode: desactivado en code
    null,       // course_id
    null,       // lesson_id
    model,
    env,
    corsHeaders,
    userDni
  );
}

// ─────────────────────────────────────────────────────────────
// Helper: construir el system prompt de código con contexto
// ─────────────────────────────────────────────────────────────
async function buildCodeSystemPrompt(project: any, files: any[], env: Env) {
  const techStack = safeJsonParse(project.tech_stack, []);
  const stackStr = techStack.join(', ') || 'no especificado';

  // Encabezado del prompt
  let prompt = `Ayudas al usuario con su proyecto de programación "${project.name}", como experta en: ${stackStr}.
Eres precisa, técnica y concisa. Usas bloques de código markdown cuando incluyes código.
No repites información innecesariamente. Siempre priorizas las mejores prácticas del stack.
 
`;

  if (files.length === 0) {
    prompt += 'El proyecto aún no tiene archivos cargados. Puedes ayudar con preguntas generales sobre el stack.';
    return prompt;
  }

  // Incluir contenido de archivos (igual que handleProjectContext pero inline)
  const MAX_FILE_SIZE = 150 * 1024; // 150 KB por archivo
  const MAX_TOTAL_CHARS = 60_000;    // límite total del system prompt

  prompt += `A continuación están los archivos del proyecto:\n`;

  let totalChars = prompt.length;

  for (const file of files) {
    if (file.size > MAX_FILE_SIZE) {
      prompt += `\n### ${file.name}\n[Omitido: supera 150 KB]\n`;
      continue;
    }

    const obj = await env.MIRAI_AI_ASSETS.get(file.r2_key);
    if (!obj) {
      prompt += `\n### ${file.name}\n[No encontrado en almacenamiento]\n`;
      continue;
    }

    const text = await obj.text();
    const lang = (file.name.split('.').pop() ?? '').toLowerCase();
    const block = `\n### ${file.name}\n\`\`\`${lang}\n${text.trimEnd()}\n\`\`\`\n`;

    if (totalChars + block.length > MAX_TOTAL_CHARS) {
      prompt += `\n### ${file.name}\n[Omitido: límite de contexto alcanzado]\n`;
      break;
    }

    prompt += block;
    totalChars += block.length;
  }

  return prompt;
}
