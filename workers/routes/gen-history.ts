/* ============================================
   MIRAI AI - Historial de generation.html

   ============================================ */
import { requireAuth } from '../lib/auth';
import { jsonResponse } from '../lib/http';

// ══════════════════════════════════════════════════
// HISTORIAL DE GENERACIÓN CON IA
// ══════════════════════════════════════════════════

// Tipos válidos del historial de generación. Coinciden con las pestañas de
// generation.html. Estaba repetida como literal en el save, el get y el delete,
// así que añadir una pestaña obligaba a acordarse de los tres sitios.
const GEN_HISTORY_TYPES = ['texto', 'imagen', 'editar', 'activos', 'video', 'avatar', 'videoedit', 'musica'];

export async function handleGenHistorySave(request: Request, env: Env, corsHeaders: Record<string, string>) {
  const userDni = await requireAuth(request, env);
  if (!userDni) return jsonResponse({ error: 'No autorizado' }, 401, corsHeaders);

  let body;
  try { body = await request.json<any>(); } catch {
    return jsonResponse({ error: 'JSON inválido' }, 400, corsHeaders);
  }

  const { type, badge, prompt, result } = body;
  if (!type || !GEN_HISTORY_TYPES.includes(type)) {
    return jsonResponse({ error: 'type inválido' }, 400, corsHeaders);
  }

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

    const { meta } = await env.MIRAI_AI_DB.prepare(`
      INSERT INTO gen_history (user_dni, type, badge, prompt, result)
      VALUES (?, ?, ?, ?, ?)
    `).bind(
      userDni.toUpperCase(),
      type,
      badge || null,
      (prompt || '').substring(0, 500),
      (result || '').substring(0, 4000)
    ).run();

    return jsonResponse({ success: true, id: meta.last_row_id }, 201, corsHeaders);
  } catch (error: any) {
    console.error('❌ gen-history save error:', error);
    return jsonResponse({ error: 'Error al guardar', details: error.message }, 500, corsHeaders);
  }
}

export async function handleGenHistoryGet(request: Request, env: Env, corsHeaders: Record<string, string>) {
  const userDni = await requireAuth(request, env);
  if (!userDni) return jsonResponse({ error: 'No autorizado' }, 401, corsHeaders);

  const url = new URL(request.url);
  const type = url.searchParams.get('type');   // opcional: filtrar por tipo
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
  const limit = 20;
  const offset = (page - 1) * limit;

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

    let query, params;
    if (type && GEN_HISTORY_TYPES.includes(type)) {
      query = `SELECT id, type, badge, prompt, result, created_at
               FROM gen_history
               WHERE user_dni = ? AND type = ?
               ORDER BY created_at DESC LIMIT ? OFFSET ?`;
      params = [userDni.toUpperCase(), type, limit, offset];
    } else {
      query = `SELECT id, type, badge, prompt, result, created_at
               FROM gen_history
               WHERE user_dni = ?
               ORDER BY created_at DESC LIMIT ? OFFSET ?`;
      params = [userDni.toUpperCase(), limit, offset];
    }

    const { results } = await env.MIRAI_AI_DB.prepare(query).bind(...params).all<any>();
    return jsonResponse({ items: results, page, limit }, 200, corsHeaders);
  } catch (error: any) {
    console.error('❌ gen-history get error:', error);
    return jsonResponse({ error: 'Error al obtener historial', details: error.message }, 500, corsHeaders);
  }
}

export async function handleGenHistoryDelete(request: Request, env: Env, corsHeaders: Record<string, string>) {
  const userDni = await requireAuth(request, env);
  if (!userDni) return jsonResponse({ error: 'No autorizado' }, 401, corsHeaders);

  const url = new URL(request.url);
  const id = url.searchParams.get('id');    // DELETE /api/gen-history?id=5   → borra uno
  const type = url.searchParams.get('type'); // DELETE /api/gen-history?type=imagen → borra categoría
  // Sin parámetros → borra TODO el historial del usuario

  try {
    if (id) {
      await env.MIRAI_AI_DB.prepare(
        `DELETE FROM gen_history WHERE id = ? AND user_dni = ?`
      ).bind(parseInt(id), userDni.toUpperCase()).run();
    } else if (type && GEN_HISTORY_TYPES.includes(type)) {
      await env.MIRAI_AI_DB.prepare(
        `DELETE FROM gen_history WHERE user_dni = ? AND type = ?`
      ).bind(userDni.toUpperCase(), type).run();
    } else {
      await env.MIRAI_AI_DB.prepare(
        `DELETE FROM gen_history WHERE user_dni = ?`
      ).bind(userDni.toUpperCase()).run();
    }

    return jsonResponse({ success: true }, 200, corsHeaders);
  } catch (error: any) {
    console.error('❌ gen-history delete error:', error);
    return jsonResponse({ error: 'Error al eliminar', details: error.message }, 500, corsHeaders);
  }
}
