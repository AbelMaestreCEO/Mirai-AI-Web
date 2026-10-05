/* ============================================
   MIRAI AI - Tareas

   ============================================ */
import { callAI } from '../lib/ai';
import { AI_MODEL_NORMAL } from '../lib/ai-models';
import { requireAuth } from '../lib/auth';
import { jsonResponse } from '../lib/http';

/* ════════════════════════════════════════════════════════════════
   BLOQUE B — Pegar DESPUÉS de handleApiRequest() (como funciones
   de nivel superior en el módulo, igual que handleProjectList etc.)
   ════════════════════════════════════════════════════════════════ */

/**
 * POST /api/tasks/ai-suggest
 * Genera una sugerencia de tarea usando el AI Gateway interno del worker.
 * Usa AI_MODEL_NORMAL (dynamic/DeepLlama) — sin llamadas a APIs externas.
 * Body: { task_title: string }
 * Respuesta: { suggestion: string }
 */
export async function handleTaskAISuggest(request, env, corsHeaders) {
  const userDni = await requireAuth(request, env);
  if (!userDni) return jsonResponse({ error: 'No autorizado' }, 401, corsHeaders);

  let body;
  try { body = await request.json(); } catch {
    return jsonResponse({ error: 'JSON inválido' }, 400, corsHeaders);
  }

  const { task_title } = body;
  if (!task_title || !task_title.trim()) {
    return jsonResponse({ error: 'task_title es requerido' }, 400, corsHeaders);
  }

  const prompt = `Eres un asistente de gestión de tareas. Para la siguiente tarea, genera en español:
1. Descripción clara (2-3 oraciones)
2. Prioridad sugerida (Baja/Media/Alta/Crítica) con razón breve
3. 3-4 subtareas concretas y accionables
 
Tarea: "${task_title.trim()}"
 
Responde en formato limpio, sin Markdown ni asteriscos.`;

  try {
    const suggestion = await callAI(
      AI_MODEL_NORMAL,
      [{ role: 'user', content: prompt }],
      { temperature: 0.7, max_tokens: 600 },
      env
    );

    return jsonResponse({ suggestion: suggestion || 'Sin respuesta del modelo.' }, 200, corsHeaders);
  } catch (error) {
    console.error('[Tasks] AI suggest error:', error);
    return jsonResponse({ error: 'Error al generar sugerencia', details: error.message }, 500, corsHeaders);
  }
}

/**
 * GET /api/tasks
 * Devuelve todas las tareas del usuario autenticado.
 * Cada usuario solo ve SUS propias tareas.
 */
export async function handleTaskList(request, env, corsHeaders) {
  const userDni = await requireAuth(request, env);
  if (!userDni) return jsonResponse({ error: 'No autorizado' }, 401, corsHeaders);

  try {
    const { results } = await env.MIRAI_AI_DB.prepare(`
      SELECT
        id, title, description, status, priority,
        assignee, tag, due_date, estimated_time, progress,
        project, done, created_at, updated_at,
        lat, lng, location_label
      FROM tasks
      WHERE user_dni = ?
      ORDER BY created_at DESC
    `).bind(userDni.toUpperCase()).all();

    return jsonResponse(results, 200, corsHeaders);
  } catch (error) {
    console.error('[Tasks] Error al listar:', error);
    return jsonResponse({ error: 'Error al obtener tareas' }, 500, corsHeaders);
  }
}

/**
 * POST /api/tasks
 * Crea una nueva tarea asociada al usuario autenticado.
 * Body: { title, description?, status?, priority?, assignee?,
 *         tag?, due_date?, estimated_time?, project? }
 */
export async function handleTaskCreate(request, env, corsHeaders) {
  const userDni = await requireAuth(request, env);
  if (!userDni) return jsonResponse({ error: 'No autorizado' }, 401, corsHeaders);

  let body;
  try { body = await request.json(); } catch {
    return jsonResponse({ error: 'JSON inválido' }, 400, corsHeaders);
  }

  const { title, description, status, priority, assignee, tag,
    due_date, estimated_time, project,
    lat, lng, location_label } = body;

  if (!title || !title.trim()) {
    return jsonResponse({ error: 'El título es obligatorio' }, 400, corsHeaders);
  }

  const VALID_STATUS = ['pendiente', 'progreso', 'revision', 'completado'];
  const VALID_PRIORITY = ['baja', 'media', 'alta', 'critica'];

  if (status && !VALID_STATUS.includes(status)) {
    return jsonResponse({ error: `Estado inválido: ${status}` }, 400, corsHeaders);
  }
  if (priority && !VALID_PRIORITY.includes(priority)) {
    return jsonResponse({ error: `Prioridad inválida: ${priority}` }, 400, corsHeaders);
  }

  try {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    await env.MIRAI_AI_DB.prepare(`
      INSERT INTO tasks
        (id, user_dni, title, description, status, priority,
         assignee, tag, due_date, estimated_time, progress,
         project, done, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 0, ?, ?)
    `).bind(
      id,
      userDni.toUpperCase(),
      title.trim(),
      (description || '').trim(),
      status || 'pendiente',
      priority || 'media',
      (assignee || '').trim(),
      (tag || '').trim(),
      due_date || null,
      parseFloat(estimated_time) || 0,
      (project || '').trim(),
      now,
      now,
      lat != null ? parseFloat(lat) : null,   // ← nuevo
      lng != null ? parseFloat(lng) : null,   // ← nuevo
      (location_label || '').trim() || null     // ← nuevo
    ).run();

    return jsonResponse({ success: true, id }, 201, corsHeaders);
  } catch (error) {
    console.error('[Tasks] Error al crear:', error);
    return jsonResponse({ error: 'Error al crear tarea', details: error.message }, 500, corsHeaders);
  }
}

/**
 * PUT /api/tasks/:id
 * Actualiza cualquier campo de una tarea.
 * Solo el dueño (user_dni) puede actualizar.
 * Body: Partial<{ title, description, status, priority, assignee,
 *                 tag, due_date, estimated_time, project, progress, done }>
 */
export async function handleTaskUpdate(request, env, corsHeaders, taskId) {
  const userDni = await requireAuth(request, env);
  if (!userDni) return jsonResponse({ error: 'No autorizado' }, 401, corsHeaders);

  // Verificar propiedad
  const existing = await env.MIRAI_AI_DB.prepare(
    'SELECT id FROM tasks WHERE id = ? AND user_dni = ?'
  ).bind(taskId, userDni.toUpperCase()).first();

  if (!existing) {
    return jsonResponse({ error: 'Tarea no encontrada o sin permiso' }, 404, corsHeaders);
  }

  let body;
  try { body = await request.json(); } catch {
    return jsonResponse({ error: 'JSON inválido' }, 400, corsHeaders);
  }

  // Construir SET dinámico con solo los campos enviados
  const fields = [];
  const values = [];

  const addField = (col, val) => { fields.push(`${col} = ?`); values.push(val); };

  if (body.title !== undefined) addField('title', body.title.trim());
  if (body.description !== undefined) addField('description', (body.description || '').trim());
  if (body.status !== undefined) addField('status', body.status);
  if (body.priority !== undefined) addField('priority', body.priority);
  if (body.assignee !== undefined) addField('assignee', (body.assignee || '').trim());
  if (body.tag !== undefined) addField('tag', (body.tag || '').trim());
  if (body.due_date !== undefined) addField('due_date', body.due_date || null);
  if (body.estimated_time !== undefined) addField('estimated_time', parseFloat(body.estimated_time) || 0);
  if (body.project !== undefined) addField('project', (body.project || '').trim());
  if (body.progress !== undefined) addField('progress', parseInt(body.progress, 10) || 0);
  if (body.done !== undefined) addField('done', body.done ? 1 : 0);
  if (body.lat !== undefined) addField('lat', body.lat != null ? parseFloat(body.lat) : null);
  if (body.lng !== undefined) addField('lng', body.lng != null ? parseFloat(body.lng) : null);
  if (body.location_label !== undefined) addField('location_label', body.location_label || null);

  if (fields.length === 0) {
    return jsonResponse({ error: 'Sin campos para actualizar' }, 400, corsHeaders);
  }

  fields.push('updated_at = ?');
  values.push(new Date().toISOString());
  // WHERE
  values.push(taskId, userDni.toUpperCase());

  try {
    await env.MIRAI_AI_DB.prepare(
      `UPDATE tasks SET ${fields.join(', ')} WHERE id = ? AND user_dni = ?`
    ).bind(...values).run();

    return jsonResponse({ success: true }, 200, corsHeaders);
  } catch (error) {
    console.error('[Tasks] Error al actualizar:', error);
    return jsonResponse({ error: 'Error al actualizar tarea', details: error.message }, 500, corsHeaders);
  }
}

/**
 * DELETE /api/tasks/:id
 * Elimina una tarea. Solo el dueño puede eliminarla.
 */
export async function handleTaskDelete(request, env, corsHeaders, taskId) {
  const userDni = await requireAuth(request, env);
  if (!userDni) return jsonResponse({ error: 'No autorizado' }, 401, corsHeaders);

  const existing = await env.MIRAI_AI_DB.prepare(
    'SELECT id FROM tasks WHERE id = ? AND user_dni = ?'
  ).bind(taskId, userDni.toUpperCase()).first();

  if (!existing) {
    return jsonResponse({ error: 'Tarea no encontrada o sin permiso' }, 404, corsHeaders);
  }

  try {
    await env.MIRAI_AI_DB.prepare(
      'DELETE FROM tasks WHERE id = ? AND user_dni = ?'
    ).bind(taskId, userDni.toUpperCase()).run();

    return jsonResponse({ success: true }, 200, corsHeaders);
  } catch (error) {
    console.error('[Tasks] Error al eliminar:', error);
    return jsonResponse({ error: 'Error al eliminar tarea', details: error.message }, 500, corsHeaders);
  }
}
