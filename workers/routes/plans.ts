/* ============================================
   MIRAI AI - Planes y tokens diarios

   ============================================ */
import { requireAuth } from '../lib/auth';
import { jsonResponse } from '../lib/http';

// ── Sistema de Tokens / Cuotas Diarias ──────────────────────────

export type TokenType = 'imagen' | 'musica' | 'video';

// -1 = ilimitado
const PLAN_LIMITS: Record<string, Record<TokenType, number>> = {
  basic:       { imagen: 10, musica: 2, video: 1 },
  students:    { imagen: 25, musica: 5, video: 3 },
  development: { imagen: 50, musica: 12, video: 8 },
  designer:    { imagen: 120, musica: 25, video: 15 },
  max:         { imagen: -1, musica: -1, video: -1 },
};

export async function ensurePlanColumn(env: Env) {
  try {
    await env.MIRAI_AI_DB.prepare(
      `ALTER TABLE users ADD COLUMN plan TEXT DEFAULT 'basic'`
    ).run();
  } catch (_) { }
}

async function getUserPlanLimits(userDni: string, env: Env) {
  await ensurePlanColumn(env);
  const row = await env.MIRAI_AI_DB.prepare(
    `SELECT plan FROM users WHERE dni = ?`
  ).bind(userDni.toUpperCase()).first<any>();
  const plan = (row && row.plan) || 'basic';
  return { plan, limits: PLAN_LIMITS[plan] || PLAN_LIMITS.basic };
}

async function ensureTokensTable(env: Env) {
  await env.MIRAI_AI_DB.prepare(`
    CREATE TABLE IF NOT EXISTS daily_tokens (
      user_dni   TEXT NOT NULL,
      token_date TEXT NOT NULL,
      imagen     INTEGER DEFAULT 0,
      musica     INTEGER DEFAULT 0,
      video      INTEGER DEFAULT 0,
      PRIMARY KEY (user_dni, token_date)
    )
  `).run();
}

async function getDailyUsage(userDni: string, env: Env) {
  await ensureTokensTable(env);
  const today = new Date().toISOString().slice(0, 10);
  const row = await env.MIRAI_AI_DB.prepare(
    `SELECT imagen, musica, video FROM daily_tokens WHERE user_dni = ? AND token_date = ?`
  ).bind(userDni.toUpperCase(), today).first<any>();
  return {
    imagen: row ? row.imagen : 0,
    musica: row ? row.musica : 0,
    video:  row ? row.video  : 0,
  };
}

export async function checkAndConsumeToken(userDni: string, type: TokenType, env: Env) {
  const { limits } = await getUserPlanLimits(userDni, env);
  const limit = limits[type];
  if (limit === undefined) return { allowed: true };
  if (limit === -1) return { allowed: true, used: 0, limit: -1 };

  // `type` viene siempre de las claves de PLAN_LIMITS (comprobado arriba con
  // limits[type]), pero se valida igualmente porque se interpola en el SQL.
  if (!Object.prototype.hasOwnProperty.call(PLAN_LIMITS.basic, type)) {
    return { allowed: true };
  }

  await ensureTokensTable(env);
  const today = new Date().toISOString().slice(0, 10);
  const dni = userDni.toUpperCase();

  // Consumo atómico: antes se leía el contador, se comparaba con el límite y se
  // incrementaba en tres pasos sueltos, así que varias peticiones simultáneas
  // leían el mismo valor y se saltaban la cuota diaria. Ahora el INSERT crea la
  // fila si no existe y el UPDATE solo incrementa mientras siga por debajo del
  // límite: quien no consiga cambiar la fila es que ya no tenía cupo.
  await env.MIRAI_AI_DB.prepare(
    `INSERT OR IGNORE INTO daily_tokens (user_dni, token_date) VALUES (?, ?)`
  ).bind(dni, today).run();

  const consumed = await env.MIRAI_AI_DB.prepare(
    `UPDATE daily_tokens SET ${type} = ${type} + 1
      WHERE user_dni = ? AND token_date = ? AND ${type} < ?`
  ).bind(dni, today, limit).run();

  const row = await env.MIRAI_AI_DB.prepare(
    `SELECT ${type} AS used FROM daily_tokens WHERE user_dni = ? AND token_date = ?`
  ).bind(dni, today).first<any>();

  const used = row?.used ?? 0;

  if (!consumed.meta?.changes) {
    return { allowed: false, used, limit };
  }

  return { allowed: true, used, limit };
}

export async function handleGetTokens(request: Request, env: Env, corsHeaders: Record<string, string>) {
  const userDni = await requireAuth(request, env);
  if (!userDni) return jsonResponse({ error: 'No autorizado' }, 401, corsHeaders);

  try {
    const usage = await getDailyUsage(userDni, env);
    const { plan, limits } = await getUserPlanLimits(userDni, env);

    const buildToken = (type: TokenType) => {
      const limit = limits[type];
      if (limit === -1) return { used: usage[type], limit: -1, remaining: -1 };
      return { used: usage[type], limit, remaining: limit - usage[type] };
    };

    return jsonResponse({
      plan,
      tokens: {
        imagen: buildToken('imagen'),
        musica: buildToken('musica'),
        video:  buildToken('video'),
        texto:  { used: 0, limit: -1, remaining: -1 },
      }
    }, 200, corsHeaders);
  } catch (error) {
    console.error('❌ handleGetTokens error:', error);
    return jsonResponse({ error: 'Error al obtener tokens' }, 500, corsHeaders);
  }
}

export async function handleGetTokensMonthly(request: Request, env: Env, corsHeaders: Record<string, string>, url: URL) {
  const userDni = await requireAuth(request, env);
  if (!userDni) return jsonResponse({ error: 'No autorizado' }, 401, corsHeaders);

  try {
    await ensureTokensTable(env);
    const month = url.searchParams.get('month') || new Date().toISOString().slice(0, 7);
    const startDate = month + '-01';
    const endDate = month + '-31';

    const { results } = await env.MIRAI_AI_DB.prepare(`
      SELECT token_date, imagen, musica, video
      FROM daily_tokens
      WHERE user_dni = ? AND token_date >= ? AND token_date <= ?
      ORDER BY token_date ASC
    `).bind(userDni.toUpperCase(), startDate, endDate).all<any>();

    return jsonResponse({ month, days: results || [] }, 200, corsHeaders);
  } catch (error) {
    console.error('❌ handleGetTokensMonthly error:', error);
    return jsonResponse({ error: 'Error al obtener historial' }, 500, corsHeaders);
  }
}
