/* ============================================
   MIRAI AI - Dieta

   ============================================ */
import { requireAuth } from '../lib/auth';
import { jsonResponse } from '../lib/http';

// ── GET /api/diet/state ─────────────────────────────────────────────────────
// Devuelve goals, planner, shopping y log del día actual del usuario.
export async function handleDietGetState(request: Request, env: Env, corsHeaders: Record<string, string>) {
  const userDni = await requireAuth(request, env);
  if (!userDni) return jsonResponse({ error: 'No autenticado' }, 401, corsHeaders);

  const today = new Date().toISOString().split('T')[0];

  const { results } = await env.MIRAI_AI_DB.prepare(
    `SELECT data_key, data_json FROM diet_data WHERE user_dni = ?`
  ).bind(userDni).all<any>();

  const map: Record<string, any> = {};
  results.forEach(r => {
    try { map[r.data_key] = JSON.parse(r.data_json); }
    catch { map[r.data_key] = {}; }
  });

  return jsonResponse({
    goals: map['goals'] || { kcal: 2000, prot: 150, carb: 220, fat: 65 },
    planner: map['planner'] || {},
    shopping: map['shopping'] || {},
    log: map[`log_${today}`] || []
  }, 200, corsHeaders);
}

// ── PUT /api/diet/:key (goals | planner | shopping) ─────────────────────────
// Guarda un blob JSON asociado a la clave dada para el usuario.
export async function handleDietPutKey(request: Request, env: Env, corsHeaders: Record<string, string>, key: string) {
  const userDni = await requireAuth(request, env);
  if (!userDni) return jsonResponse({ error: 'No autenticado' }, 401, corsHeaders);

  let body;
  try { body = await request.json<any>(); }
  catch { return jsonResponse({ error: 'JSON inválido' }, 400, corsHeaders); }

  await env.MIRAI_AI_DB.prepare(`
    INSERT INTO diet_data (user_dni, data_key, data_json, updated_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(user_dni, data_key)
    DO UPDATE SET data_json = excluded.data_json, updated_at = excluded.updated_at
  `).bind(userDni, key, JSON.stringify(body)).run();

  return jsonResponse({ ok: true }, 200, corsHeaders);
}

// ── DELETE /api/diet/:key (planner) ─────────────────────────────────────────
export async function handleDietDeleteKey(request: Request, env: Env, corsHeaders: Record<string, string>, key: string) {
  const userDni = await requireAuth(request, env);
  if (!userDni) return jsonResponse({ error: 'No autenticado' }, 401, corsHeaders);

  await env.MIRAI_AI_DB.prepare(
    `DELETE FROM diet_data WHERE user_dni = ? AND data_key = ?`
  ).bind(userDni, key).run();

  return jsonResponse({ ok: true }, 200, corsHeaders);
}

// ── PUT /api/diet/log ────────────────────────────────────────────────────────
// Guarda el log del día actual (clave dinámica log_YYYY-MM-DD).
export async function handleDietPutLog(request: Request, env: Env, corsHeaders: Record<string, string>) {
  const userDni = await requireAuth(request, env);
  if (!userDni) return jsonResponse({ error: 'No autenticado' }, 401, corsHeaders);

  let body;
  try { body = await request.json<any>(); }
  catch { return jsonResponse({ error: 'JSON inválido' }, 400, corsHeaders); }

  const today = new Date().toISOString().split('T')[0];
  const key = `log_${today}`;

  await env.MIRAI_AI_DB.prepare(`
    INSERT INTO diet_data (user_dni, data_key, data_json, updated_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(user_dni, data_key)
    DO UPDATE SET data_json = excluded.data_json, updated_at = excluded.updated_at
  `).bind(userDni, key, JSON.stringify(body)).run();

  return jsonResponse({ ok: true }, 200, corsHeaders);
}

// ── DELETE /api/diet/log ─────────────────────────────────────────────────────
// Borra el log del día actual del usuario.
export async function handleDietDeleteLog(request: Request, env: Env, corsHeaders: Record<string, string>) {
  const userDni = await requireAuth(request, env);
  if (!userDni) return jsonResponse({ error: 'No autenticado' }, 401, corsHeaders);

  const today = new Date().toISOString().split('T')[0];

  await env.MIRAI_AI_DB.prepare(
    `DELETE FROM diet_data WHERE user_dni = ? AND data_key = ?`
  ).bind(userDni, `log_${today}`).run();

  return jsonResponse({ ok: true }, 200, corsHeaders);
}

// ── GET /api/diet/history ────────────────────────────────────────────────────
// Lista los últimos 60 días archivados del usuario.
export async function handleDietGetHistory(request: Request, env: Env, corsHeaders: Record<string, string>) {
  const userDni = await requireAuth(request, env);
  if (!userDni) return jsonResponse({ error: 'No autenticado' }, 401, corsHeaders);

  const { results } = await env.MIRAI_AI_DB.prepare(`
    SELECT date, total_kcal, total_prot, total_carb, total_fat, entries_json
    FROM diet_history
    WHERE user_dni = ?
    ORDER BY date DESC
    LIMIT 60
  `).bind(userDni).all<any>();

  return jsonResponse(results.map(r => ({
    date: r.date,
    totalKcal: r.total_kcal,
    prot: r.total_prot,
    carb: r.total_carb,
    fat: r.total_fat,
    meals: (() => { try { return JSON.parse(r.entries_json); } catch { return []; } })()
  })), 200, corsHeaders);
}

// ── POST /api/diet/history ───────────────────────────────────────────────────
// Archiva el log del día como entrada de historial.
// Body: { date, totalKcal, prot, carb, fat, meals[] }
export async function handleDietPostHistory(request: Request, env: Env, corsHeaders: Record<string, string>) {
  const userDni = await requireAuth(request, env);
  if (!userDni) return jsonResponse({ error: 'No autenticado' }, 401, corsHeaders);

  let body;
  try { body = await request.json<any>(); }
  catch { return jsonResponse({ error: 'JSON inválido' }, 400, corsHeaders); }

  const { date, totalKcal, prot, carb, fat, meals } = body;
  if (!date) return jsonResponse({ error: 'Falta el campo date' }, 400, corsHeaders);

  const id = crypto.randomUUID();

  // ON CONFLICT DO NOTHING: no duplica si ya existe ese día
  await env.MIRAI_AI_DB.prepare(`
    INSERT INTO diet_history (id, user_dni, date, total_kcal, total_prot, total_carb, total_fat, entries_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT DO NOTHING
  `).bind(
    id, userDni, date,
    totalKcal || 0, prot || 0, carb || 0, fat || 0,
    JSON.stringify(meals || [])
  ).run();

  return jsonResponse({ ok: true }, 200, corsHeaders);
}
