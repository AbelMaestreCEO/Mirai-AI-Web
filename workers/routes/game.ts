/* ============================================
   MIRAI AI - Multijugador: lobby REST y entrada al Durable Object
   - Lobby y resultados en D1 (game_*): fuente de verdad de salas y miembros.
   - Estado en vivo en el Durable Object GameRoom, no aquí.
   - El upgrade de WebSocket valida sesión, sección y reenvía al DO con la
     identidad en cabeceras X-Game-* (nunca la cookie).

   Ver multijugador.md §4.2, §8.1, §8.2 y §9.
   ============================================ */
import { rateLimit, requireAuth } from '../lib/auth';
import { ensureQuestionBank } from '../lib/game-questions';
import { jsonResponse } from '../lib/http';

const WS_PATH_RE = /^\/api\/game\/rooms\/([A-Za-z0-9]{1,32})\/ws$/;
const ROOM_ACTION_RE = /^\/api\/game\/rooms\/([A-Za-z0-9]{1,32})\/(join|leave|start|cancel)$/;
const MATCH_RE = /^\/api\/game\/matches\/([A-Za-z0-9-]{8,64})$/;
const CODE_RE = /^[A-Z0-9]{4,12}$/;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const GAME_TYPES = new Set(['ludo']);

interface RoomRow {
  id: string;
  code: string;
  section_id: string | null;
  assignment_id: string | null;
  created_by: string | null;
  topic: string | null;
  professor_dni: string;
  status: string;
  max_players: number;
  turn_seconds: number;
  expires_at: string | null;
}

type GameRole = 'student' | 'teacher' | 'admin' | 'spectator';

let gameTablesReady = false;

// Copia de db/game.sql para que una base nueva funcione sin migración manual.
// El archivo SQL sigue siendo la referencia para producción.
const GAME_DDL = [
  `CREATE TABLE IF NOT EXISTS game_rooms (
    id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, section_id TEXT,
    assignment_id TEXT, created_by TEXT, topic TEXT,
    professor_dni TEXT NOT NULL, game_type TEXT NOT NULL DEFAULT 'ludo',
    max_players INTEGER NOT NULL DEFAULT 4, turn_seconds INTEGER NOT NULL DEFAULT 40,
    status TEXT NOT NULL DEFAULT 'lobby', created_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT)`,
  `CREATE INDEX IF NOT EXISTS idx_game_rooms_section ON game_rooms(section_id)`,
  `CREATE INDEX IF NOT EXISTS idx_game_rooms_assignment ON game_rooms(assignment_id)`,
  `CREATE INDEX IF NOT EXISTS idx_game_rooms_creator ON game_rooms(created_by)`,
  `CREATE INDEX IF NOT EXISTS idx_game_rooms_professor ON game_rooms(professor_dni)`,
  `CREATE INDEX IF NOT EXISTS idx_game_rooms_expires ON game_rooms(expires_at)`,
  `CREATE TABLE IF NOT EXISTS game_players (
    room_id TEXT NOT NULL REFERENCES game_rooms(id) ON DELETE CASCADE,
    user_dni TEXT NOT NULL, nickname TEXT NOT NULL, avatar_key TEXT,
    role TEXT NOT NULL DEFAULT 'player', status TEXT NOT NULL DEFAULT 'invited',
    joined_at TEXT NOT NULL DEFAULT (datetime('now')), PRIMARY KEY (room_id, user_dni))`,
  `CREATE TABLE IF NOT EXISTS game_matches (
    id TEXT PRIMARY KEY, room_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'playing',
    started_at TEXT, finished_at TEXT, winner_dni TEXT, state_summary TEXT)`,
  `CREATE INDEX IF NOT EXISTS idx_game_matches_room ON game_matches(room_id)`,
  `CREATE TABLE IF NOT EXISTS game_results (
    match_id TEXT NOT NULL, user_dni TEXT NOT NULL, position INTEGER NOT NULL,
    score INTEGER NOT NULL DEFAULT 0, xp INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')), PRIMARY KEY (match_id, user_dni))`,
  `CREATE INDEX IF NOT EXISTS idx_game_results_user ON game_results(user_dni)`,
  `CREATE TABLE IF NOT EXISTS game_moves (
    id TEXT PRIMARY KEY, match_id TEXT NOT NULL, user_dni TEXT NOT NULL,
    move_index INTEGER NOT NULL, payload TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE (match_id, move_index))`,
  `CREATE INDEX IF NOT EXISTS idx_game_moves_match ON game_moves(match_id)`,
  `CREATE TABLE IF NOT EXISTS game_question_bank (
    id TEXT PRIMARY KEY, assignment_id TEXT, topic TEXT NOT NULL, payload TEXT NOT NULL,
    difficulty TEXT, qhash TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')))`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_game_questions_hash
     ON game_question_bank(assignment_id, qhash)`,
  `CREATE INDEX IF NOT EXISTS idx_game_questions_assignment ON game_question_bank(assignment_id)`,
];

async function ensureGameTables(env: Env) {
  if (gameTablesReady) return;
  for (const ddl of GAME_DDL) {
    await env.MIRAI_AI_DB.prepare(ddl).run();
  }
  // Columnas añadidas después: las tablas creadas antes de esta versión no las
  // tienen y CREATE TABLE IF NOT EXISTS no las añade.
  for (const sql of [
    'ALTER TABLE game_rooms ADD COLUMN assignment_id TEXT',
    'ALTER TABLE game_rooms ADD COLUMN created_by TEXT',
    'ALTER TABLE game_rooms ADD COLUMN topic TEXT',
    'ALTER TABLE game_question_bank ADD COLUMN difficulty TEXT',
    'ALTER TABLE game_question_bank ADD COLUMN qhash TEXT',
    'ALTER TABLE submissions ADD COLUMN attempt_type TEXT',
  ]) {
    try {
      await env.MIRAI_AI_DB.prepare(sql).run();
    } catch {
      // La columna ya existe.
    }
  }
  try {
    await env.MIRAI_AI_DB.prepare(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_game_questions_hash
         ON game_question_bank(assignment_id, qhash)`
    ).run();
  } catch {
    // Índice ya existente o datos duplicados previos.
  }
  gameTablesReady = true;
}

/**
 * Punto de entrada del módulo. Devuelve null si la ruta no es del juego para
 * que router.ts siga con el resto del despacho.
 */
export async function handleGameApi(
  request: Request,
  env: Env,
  url: URL,
  path: string,
  corsHeaders: Record<string, string>
): Promise<Response | null> {
  const wsMatch = path.match(WS_PATH_RE);
  if (wsMatch) return handleWebSocket(request, env, wsMatch[1], corsHeaders);

  if (!path.startsWith('/api/game/')) return null;

  await ensureGameTables(env);

  if (path === '/api/game/rooms') {
    if (request.method === 'POST') return createRoom(request, env, corsHeaders);
    if (request.method === 'GET') return listRooms(request, env, url, corsHeaders);
    return methodNotAllowed(corsHeaders);
  }

  const actionMatch = path.match(ROOM_ACTION_RE);
  if (actionMatch && request.method === 'POST') {
    const [, code, action] = actionMatch;
    if (action === 'join') return joinRoom(request, env, code, corsHeaders);
    if (action === 'leave') return leaveRoom(request, env, url, code, corsHeaders);
    if (action === 'start') return startRoom(request, env, code, corsHeaders);
    if (action === 'cancel') return cancelRoom(request, env, code, corsHeaders);
  }

  if (path === '/api/game/my-history' && request.method === 'GET') {
    return myHistory(request, env, corsHeaders);
  }

  const matchMatch = path.match(MATCH_RE);
  if (matchMatch && request.method === 'GET') {
    return getMatch(request, env, matchMatch[1], corsHeaders);
  }

  return null;
}

/* ─────────────────────────── lobby ─────────────────────────── */

async function createRoom(request: Request, env: Env, corsHeaders: Record<string, string>) {
  const dni = await requireAuth(request, env);
  if (!dni) return jsonResponse({ error: 'No autorizado. Inicia sesión.' }, 401, corsHeaders);

  const professor = await isActiveProfessor(dni, env);
  const admin = await isAdmin(dni, env);

  if (!(await rateLimit(env, `game:create:${dni}`, 5, 600))) {
    return jsonResponse({ error: 'Demasiadas salas creadas. Espera unos minutos.' }, 429, corsHeaders);
  }

  const body = await readJson(request);
  const gameType = String(body?.game_type ?? 'ludo');
  if (!GAME_TYPES.has(gameType)) {
    return jsonResponse({ error: 'Tipo de juego no soportado' }, 400, corsHeaders);
  }

  const maxPlayers = clampInt(body?.max_players, 2, 4, 4);
  const turnSeconds = clampInt(body?.turn_seconds, 15, 120, 40);
  const expiresMinutes = clampInt(body?.expires_in_minutes, 10, 240, 120);
  const assignmentId = body?.assignment_id ? String(body.assignment_id) : null;
  const sectionInput = body?.section_id ? String(body.section_id) : null;

  const scope = await resolveRoomScope(dni, env, { assignmentId, sectionId: sectionInput, professor, admin });
  if ('error' in scope) {
    return jsonResponse({ error: scope.error }, scope.status, corsHeaders);
  }

  // Recomendación C: 1 sala activa por alumno creador. Los docentes pueden
  // tener varias (varias clases a la vez).
  const isStaff = professor || admin;
  if (!isStaff) {
    const existing = await env.MIRAI_AI_DB.prepare(
      `SELECT code FROM game_rooms
        WHERE created_by = ? AND status IN ('lobby', 'playing')
          AND (expires_at IS NULL OR datetime(expires_at) > datetime('now'))
        ORDER BY created_at DESC LIMIT 1`
    )
      .bind(dni.toUpperCase())
      .first<any>();
    if (existing) {
      return jsonResponse(
        { error: 'Ya tienes una sala activa. Úsala o espera a que expire.', code: existing.code },
        409,
        corsHeaders
      );
    }
  }

  const id = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + expiresMinutes * 60_000).toISOString();
  const nickname = await resolveNickname(dni, env);
  // Quien crea la sala juega: si un docente quiere espectar, entra a una sala
  // ajena. Los demás docentes con acceso siguen entrando como espectadores.
  const creatorRole = 'player';

  let code = '';
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = generateCode(6);
    try {
      await env.MIRAI_AI_DB.prepare(
        `INSERT INTO game_rooms
           (id, code, section_id, assignment_id, created_by, topic, professor_dni,
            game_type, max_players, turn_seconds, status, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'lobby', ?)`
      )
        .bind(
          id,
          candidate,
          scope.sectionId,
          assignmentId,
          dni.toUpperCase(),
          scope.topic,
          scope.professorDni,
          gameType,
          maxPlayers,
          turnSeconds,
          expiresAt
        )
        .run();
      code = candidate;
      break;
    } catch (error: any) {
      if (!/UNIQUE/i.test(error?.message ?? '')) throw error;
    }
  }

  if (!code) {
    return jsonResponse({ error: 'No se pudo generar un código de sala' }, 503, corsHeaders);
  }

  await env.MIRAI_AI_DB.prepare(
    `INSERT INTO game_players (room_id, user_dni, nickname, role, status)
     VALUES (?, ?, ?, ?, 'joined')`
  )
    .bind(id, dni.toUpperCase(), nickname, creatorRole)
    .run();

  return jsonResponse(
    {
      id,
      code,
      section_id: scope.sectionId,
      assignment_id: assignmentId,
      topic: scope.topic,
      game_type: gameType,
      max_players: maxPlayers,
      turn_seconds: turnSeconds,
      status: 'lobby',
      expires_at: expiresAt,
    },
    201,
    corsHeaders
  );
}

async function listRooms(request: Request, env: Env, url: URL, corsHeaders: Record<string, string>) {
  const dni = await requireAuth(request, env);
  if (!dni) return jsonResponse({ error: 'No autorizado. Inicia sesión.' }, 401, corsHeaders);

  const assignmentId = url.searchParams.get('assignment_id');
  const sectionId = url.searchParams.get('section_id');
  if (!assignmentId && !sectionId) {
    return jsonResponse({ error: 'assignment_id o section_id requerido' }, 400, corsHeaders);
  }

  let filter: string;
  let bindValue: string;

  if (assignmentId) {
    const assignment = await getAssignment(assignmentId, env);
    if (!assignment) return jsonResponse({ error: 'Tarea no encontrada' }, 404, corsHeaders);
    if (!(await canAccessAssignment(assignment, dni, env))) {
      return jsonResponse({ error: 'No tienes acceso a esta tarea' }, 403, corsHeaders);
    }
    filter = 'r.assignment_id = ?';
    bindValue = assignmentId;
  } else {
    const section = await env.MIRAI_AI_DB.prepare('SELECT professor_dni FROM sections WHERE id = ?')
      .bind(sectionId)
      .first<any>();
    if (!section) return jsonResponse({ error: 'Sección no encontrada' }, 404, corsHeaders);
    const isOwner = section.professor_dni.toUpperCase() === dni.toUpperCase();
    if (!isOwner && !(await isAdmin(dni, env)) && !(await isSectionMember(sectionId!, dni, env))) {
      return jsonResponse({ error: 'No perteneces a esta sección' }, 403, corsHeaders);
    }
    filter = 'r.section_id = ?';
    bindValue = sectionId!;
  }

  // Solo salas con hueco, ordenadas por huecos libres. group_concat devuelve los
  // apodos de los jugadores (nunca DNI) para mostrarlos en el lobby.
  const rows = await env.MIRAI_AI_DB.prepare(
    `SELECT r.id, r.code, r.section_id, r.assignment_id, r.game_type, r.max_players,
            r.turn_seconds, r.status, r.created_at, r.expires_at, r.created_by,
            COUNT(p.user_dni) AS player_count,
            GROUP_CONCAT(p.nickname, '||') AS player_names
       FROM game_rooms r
       LEFT JOIN game_players p ON p.room_id = r.id AND p.role = 'player'
      WHERE ${filter}
        AND r.status IN ('lobby', 'playing')
        AND (r.expires_at IS NULL OR datetime(r.expires_at) > datetime('now'))
      GROUP BY r.id
      HAVING COUNT(p.user_dni) < r.max_players
      ORDER BY (r.max_players - COUNT(p.user_dni)) DESC, r.created_at DESC`
  )
    .bind(bindValue)
    .all<any>();

  const rooms = (rows.results ?? []).map((row: any) => {
    const names = row.player_names ? String(row.player_names).split('||') : [];
    return {
      id: row.id,
      code: row.code,
      section_id: row.section_id,
      assignment_id: row.assignment_id,
      game_type: row.game_type,
      max_players: row.max_players,
      turn_seconds: row.turn_seconds,
      status: row.status,
      created_at: row.created_at,
      expires_at: row.expires_at,
      players: names,
      player_count: Number(row.player_count ?? names.length),
      free_slots: Math.max(0, Number(row.max_players) - Number(row.player_count ?? names.length)),
      is_creator: String(row.created_by ?? '').toUpperCase() === dni.toUpperCase(),
    };
  });

  return jsonResponse(rooms, 200, corsHeaders);
}

async function joinRoom(request: Request, env: Env, code: string, corsHeaders: Record<string, string>) {
  const dni = await requireAuth(request, env);
  if (!dni) return jsonResponse({ error: 'No autorizado. Inicia sesión.' }, 401, corsHeaders);

  if (!(await rateLimit(env, `game:join:${dni}`, 30, 60))) {
    return jsonResponse({ error: 'Demasiados intentos. Espera un momento.' }, 429, corsHeaders);
  }

  const room = await getRoom(code, env);
  if (!room) return jsonResponse({ error: 'Sala no encontrada' }, 404, corsHeaders);
  if (room.status !== 'lobby') {
    return jsonResponse({ error: 'La partida ya comenzó o la sala no admite más jugadores' }, 409, corsHeaders);
  }
  if (room.expires_at && Date.parse(room.expires_at) < Date.now()) {
    return jsonResponse({ error: 'La sala ha expirado' }, 410, corsHeaders);
  }

  const role = await resolveRole(room, dni, env);
  if (!role) return jsonResponse({ error: 'No perteneces a esta sección' }, 403, corsHeaders);

  if (role === 'student') {
    const count = await env.MIRAI_AI_DB.prepare(
      "SELECT COUNT(*) AS n FROM game_players WHERE room_id = ? AND role = 'player'"
    )
      .bind(room.id)
      .first<any>();
    if ((count?.n ?? 0) >= room.max_players) {
      return jsonResponse({ error: 'La sala está llena' }, 409, corsHeaders);
    }
  }

  const nickname = await resolveNickname(dni, env);
  const playerRole = role === 'student' ? 'player' : 'spectator';
  await env.MIRAI_AI_DB.prepare(
    `INSERT INTO game_players (room_id, user_dni, nickname, role, status)
     VALUES (?, ?, ?, ?, 'joined')
     ON CONFLICT(room_id, user_dni) DO UPDATE SET status = 'joined', nickname = excluded.nickname`
  )
    .bind(room.id, dni.toUpperCase(), nickname, playerRole)
    .run();

  return jsonResponse({ room: { id: room.id, code: room.code, status: room.status }, role: playerRole }, 200, corsHeaders);
}

async function leaveRoom(
  request: Request,
  env: Env,
  url: URL,
  code: string,
  corsHeaders: Record<string, string>
) {
  const dni = await requireAuth(request, env);
  if (!dni) return jsonResponse({ error: 'No autorizado. Inicia sesión.' }, 401, corsHeaders);

  const room = await getRoom(code, env);
  if (!room) return jsonResponse({ error: 'Sala no encontrada' }, 404, corsHeaders);

  const requested = url.searchParams.get('user_dni');
  const manager = await canManageRoom(room, dni, env);
  const target = requested && manager ? requested.toUpperCase() : dni.toUpperCase();
  if (requested && !manager) {
    return jsonResponse({ error: 'Solo el docente puede expulsar jugadores' }, 403, corsHeaders);
  }

  await env.MIRAI_AI_DB.prepare('DELETE FROM game_players WHERE room_id = ? AND user_dni = ?')
    .bind(room.id, target)
    .run();

  await callRoomAction(env, room.code, 'remove', dni, roleForDo(manager ? 'teacher' : 'student'), target);

  return jsonResponse({ ok: true }, 200, corsHeaders);
}

async function startRoom(request: Request, env: Env, code: string, corsHeaders: Record<string, string>) {
  const dni = await requireAuth(request, env);
  if (!dni) return jsonResponse({ error: 'No autorizado. Inicia sesión.' }, 401, corsHeaders);

  const room = await getRoom(code, env);
  if (!room) return jsonResponse({ error: 'Sala no encontrada' }, 404, corsHeaders);
  if (!(await canManageRoom(room, dni, env))) {
    return jsonResponse({ error: 'Solo el creador de la sala o el docente puede iniciarla' }, 403, corsHeaders);
  }
  if (room.status !== 'lobby') {
    return jsonResponse({ error: 'La partida ya está iniciada' }, 409, corsHeaders);
  }

  // Banco de preguntas: se genera (si falta) antes de empezar, nunca a mitad de
  // partida, para no comer el tiempo de respuesta con la latencia de la IA.
  let maxScore = 100;
  if (room.assignment_id) {
    const assignment = await env.MIRAI_AI_DB.prepare(
      'SELECT max_score FROM assignments WHERE id = ?'
    )
      .bind(room.assignment_id)
      .first<any>();
    if (assignment?.max_score) maxScore = Number(assignment.max_score);

    const bank = await ensureQuestionBank(
      env,
      room.assignment_id,
      room.topic || 'tema de la tarea'
    );
    if (bank.easy + bank.hard === 0) {
      return jsonResponse(
        { error: 'No se pudieron generar preguntas para esta tarea. Inténtalo de nuevo.' },
        503,
        corsHeaders
      );
    }
  }

  const matchId = crypto.randomUUID();
  const startedAt = new Date().toISOString();
  await env.MIRAI_AI_DB.batch([
    env.MIRAI_AI_DB.prepare("UPDATE game_rooms SET status = 'playing' WHERE id = ? AND status = 'lobby'").bind(room.id),
    env.MIRAI_AI_DB.prepare(
      "INSERT INTO game_matches (id, room_id, status, started_at) VALUES (?, ?, 'playing', ?)"
    ).bind(matchId, room.id, startedAt),
  ]);

  const extra: Record<string, string> = {
    'X-Game-Match': matchId,
    'X-Game-Max-Score': String(maxScore),
  };
  if (room.assignment_id) extra['X-Game-Assignment'] = room.assignment_id;

  const result = await callRoomAction(env, room.code, 'start', dni, 'teacher', undefined, extra);
  if (!result.ok) {
    await env.MIRAI_AI_DB.batch([
      env.MIRAI_AI_DB.prepare("UPDATE game_rooms SET status = 'lobby' WHERE id = ?").bind(room.id),
      env.MIRAI_AI_DB.prepare('DELETE FROM game_matches WHERE id = ?').bind(matchId),
    ]);
    return jsonResponse({ error: result.error || 'La sala aún no está lista' }, result.status, corsHeaders);
  }

  return jsonResponse({ match_id: matchId, started_at: startedAt, room_id: room.id }, 200, corsHeaders);
}

async function cancelRoom(request: Request, env: Env, code: string, corsHeaders: Record<string, string>) {
  const dni = await requireAuth(request, env);
  if (!dni) return jsonResponse({ error: 'No autorizado. Inicia sesión.' }, 401, corsHeaders);

  const room = await getRoom(code, env);
  if (!room) return jsonResponse({ error: 'Sala no encontrada' }, 404, corsHeaders);
  if (!(await canManageRoom(room, dni, env))) {
    return jsonResponse({ error: 'Solo el creador de la sala o el docente puede cancelarla' }, 403, corsHeaders);
  }

  await env.MIRAI_AI_DB.prepare("UPDATE game_rooms SET status = 'cancelled' WHERE id = ?")
    .bind(room.id)
    .run();
  await callRoomAction(env, room.code, 'cancel', dni, 'teacher');

  return jsonResponse({ ok: true }, 200, corsHeaders);
}

async function getMatch(
  request: Request,
  env: Env,
  matchId: string,
  corsHeaders: Record<string, string>
) {
  const dni = await requireAuth(request, env);
  if (!dni) return jsonResponse({ error: 'No autorizado. Inicia sesión.' }, 401, corsHeaders);

  const match = await env.MIRAI_AI_DB.prepare(
    `SELECT m.id, m.room_id, m.status, m.started_at, m.finished_at, m.winner_dni,
            r.code, r.section_id, r.professor_dni
       FROM game_matches m
       JOIN game_rooms r ON r.id = m.room_id
      WHERE m.id = ?`
  )
    .bind(matchId)
    .first<any>();
  if (!match) return jsonResponse({ error: 'Partida no encontrada' }, 404, corsHeaders);

  const manager =
    match.professor_dni?.toUpperCase() === dni.toUpperCase() || (await isAdmin(dni, env));
  if (!manager) {
    const participant = await env.MIRAI_AI_DB.prepare(
      'SELECT 1 AS ok FROM game_results WHERE match_id = ? AND user_dni = ?'
    )
      .bind(matchId, dni.toUpperCase())
      .first<any>();
    if (!participant) {
      return jsonResponse({ error: 'No tienes acceso a esta partida' }, 403, corsHeaders);
    }
  }

  const results = await env.MIRAI_AI_DB.prepare(
    'SELECT user_dni, position, score, xp FROM game_results WHERE match_id = ? ORDER BY position'
  )
    .bind(matchId)
    .all<any>();

  return jsonResponse({ match, results: results.results ?? [] }, 200, corsHeaders);
}

async function myHistory(request: Request, env: Env, corsHeaders: Record<string, string>) {
  const dni = await requireAuth(request, env);
  if (!dni) return jsonResponse({ error: 'No autorizado. Inicia sesión.' }, 401, corsHeaders);

  const rows = await env.MIRAI_AI_DB.prepare(
    `SELECT gr.match_id, gr.position, gr.score, gr.xp, gr.created_at,
            m.status, m.finished_at, m.winner_dni,
            r.code, r.section_id, r.game_type
       FROM game_results gr
       JOIN game_matches m ON m.id = gr.match_id
       LEFT JOIN game_rooms r ON r.id = m.room_id
      WHERE gr.user_dni = ?
      ORDER BY gr.created_at DESC
      LIMIT 50`
  )
    .bind(dni.toUpperCase())
    .all<any>();

  return jsonResponse(rows.results ?? [], 200, corsHeaders);
}

/* ─────────────────────── WebSocket (al DO) ─────────────────────── */

async function handleWebSocket(
  request: Request,
  env: Env,
  rawCode: string,
  corsHeaders: Record<string, string>
): Promise<Response> {
  if (request.headers.get('Upgrade') !== 'websocket') {
    return new Response('Se esperaba una conexión WebSocket', {
      status: 426,
      headers: { Upgrade: 'websocket' },
    });
  }

  const code = rawCode.toUpperCase();
  if (!CODE_RE.test(code)) {
    return jsonResponse({ error: 'Código de sala inválido' }, 400, corsHeaders);
  }

  const dni = await requireAuth(request, env);
  if (!dni) return jsonResponse({ error: 'No autorizado. Inicia sesión.' }, 401, corsHeaders);

  if (!(await rateLimit(env, `game:ws:${dni}`, 30, 60))) {
    return jsonResponse({ error: 'Demasiadas conexiones. Espera un momento.' }, 429, corsHeaders);
  }

  await ensureGameTables(env);
  const room = await getRoom(code, env);
  if (!room) return jsonResponse({ error: 'Sala no encontrada' }, 404, corsHeaders);
  if (room.status === 'cancelled' || room.status === 'finished') {
    return jsonResponse({ error: 'La sala ya no está activa' }, 410, corsHeaders);
  }
  if (room.expires_at && Date.parse(room.expires_at) < Date.now()) {
    return jsonResponse({ error: 'La sala ha expirado' }, 410, corsHeaders);
  }

  const role = await resolveRole(room, dni, env);
  if (!role) return jsonResponse({ error: 'No perteneces a esta sección' }, 403, corsHeaders);

  const nickname = await resolveNickname(dni, env);
  const registered = await registerPlayerInRoom(room, dni, nickname, role, env);
  if (!registered) {
    return jsonResponse({ error: 'La sala está llena' }, 409, corsHeaders);
  }

  // Copia la petición original (conserva el upgrade a WebSocket) y solo añade
  // las cabeceras de identidad.
  const manager = await canManageRoom(room, dni, env);
  const forward = new Request(request);
  forward.headers.set('X-Game-User', dni.toUpperCase());
  forward.headers.set('X-Game-Role', roleForDo(role));
  forward.headers.set('X-Game-Code', room.code);
  forward.headers.set('X-Game-Nickname', encodeURIComponent(nickname));
  forward.headers.set('X-Game-CanManage', manager ? '1' : '0');
  if (room.section_id) forward.headers.set('X-Game-Section', room.section_id);

  const stub = env.GAME_ROOM.get(env.GAME_ROOM.idFromName(room.code));
  try {
    return await stub.fetch(forward);
  } catch (error: any) {
    console.error('GameRoom WS no disponible —', error?.message ?? error);
    return jsonResponse({ error: 'La sala no está disponible' }, 502, corsHeaders);
  }
}

/* ─────────────────────────── helpers ─────────────────────────── */

function generateCode(length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return out;
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

async function readJson(request: Request): Promise<any> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

async function getRoom(code: string, env: Env): Promise<RoomRow | null> {
  return env.MIRAI_AI_DB.prepare(
    `SELECT id, code, section_id, assignment_id, created_by, topic, professor_dni,
            status, max_players, turn_seconds, expires_at
       FROM game_rooms WHERE code = ?`
  )
    .bind(code.toUpperCase())
    .first<RoomRow>();
}

interface AssignmentRow {
  id: string;
  title: string | null;
  section_id: string | null;
  course_id: string | null;
  section_professor: string | null;
  course_owner: string | null;
}

async function getAssignment(assignmentId: string, env: Env): Promise<AssignmentRow | null> {
  return env.MIRAI_AI_DB.prepare(
    `SELECT a.id, a.title, a.section_id, a.course_id,
            s.professor_dni AS section_professor,
            c.user_dni AS course_owner
       FROM assignments a
       LEFT JOIN sections s ON s.id = a.section_id
       LEFT JOIN user_courses c ON c.id = a.course_id
      WHERE a.id = ?`
  )
    .bind(assignmentId)
    .first<AssignmentRow>();
}

/** Alumno de la sección, asignado individualmente, docente dueño o admin. */
async function canAccessAssignment(assignment: AssignmentRow, dni: string, env: Env): Promise<boolean> {
  const upper = dni.toUpperCase();
  if (assignment.section_professor?.toUpperCase() === upper) return true;
  if (assignment.course_owner?.toUpperCase() === upper) return true;
  if (await isAdmin(dni, env)) return true;

  const assigned = await env.MIRAI_AI_DB.prepare(
    'SELECT 1 AS ok FROM assignment_students WHERE assignment_id = ? AND UPPER(user_dni) = UPPER(?)'
  )
    .bind(assignment.id, dni)
    .first<any>();
  if (assigned) return true;

  if (assignment.section_id) {
    return isSectionMember(assignment.section_id, dni, env);
  }
  return false;
}

interface RoomScope {
  sectionId: string | null;
  professorDni: string;
  topic: string | null;
}

/**
 * Resuelve a qué se liga la sala. Con assignment_id puede crearla cualquier
 * alumno con acceso a la tarea (el docente solo publica la tarea). Sin tarea
 * (modo antiguo) sigue siendo solo para docentes y se liga a la sección.
 */
async function resolveRoomScope(
  dni: string,
  env: Env,
  opts: { assignmentId: string | null; sectionId: string | null; professor: boolean; admin: boolean }
): Promise<RoomScope | { error: string; status: number }> {
  if (opts.assignmentId) {
    const assignment = await getAssignment(opts.assignmentId, env);
    if (!assignment) return { error: 'Tarea no encontrada', status: 404 };
    if (!(await canAccessAssignment(assignment, dni, env))) {
      return { error: 'No tienes acceso a esta tarea', status: 403 };
    }
    if (opts.sectionId && assignment.section_id && opts.sectionId !== assignment.section_id) {
      return { error: 'La sección no corresponde a la tarea', status: 400 };
    }
    return {
      sectionId: assignment.section_id ?? null,
      professorDni: assignment.section_professor || assignment.course_owner || dni.toUpperCase(),
      topic: assignment.title,
    };
  }

  if (opts.sectionId) {
    if (!opts.professor && !opts.admin) {
      return { error: 'Solo un docente puede crear salas sin tarea', status: 403 };
    }
    const section = await env.MIRAI_AI_DB.prepare(
      'SELECT professor_dni, name FROM sections WHERE id = ?'
    )
      .bind(opts.sectionId)
      .first<any>();
    if (!section) return { error: 'Sección no encontrada', status: 404 };
    if (!opts.admin && section.professor_dni.toUpperCase() !== dni.toUpperCase()) {
      return { error: 'La sección no te pertenece', status: 403 };
    }
    return {
      sectionId: opts.sectionId,
      professorDni: section.professor_dni,
      topic: section.name ?? null,
    };
  }

  return { error: 'assignment_id o section_id requerido', status: 400 };
}

async function isActiveProfessor(dni: string, env: Env): Promise<boolean> {
  const row = await env.MIRAI_AI_DB.prepare(
    'SELECT 1 AS ok FROM professors WHERE dni = ? AND is_active = 1'
  )
    .bind(dni.toUpperCase())
    .first<any>();
  return !!row;
}

async function isAdmin(dni: string, env: Env): Promise<boolean> {
  const row = await env.MIRAI_AI_DB.prepare('SELECT role FROM users WHERE dni = ?')
    .bind(dni.toUpperCase())
    .first<any>();
  return row?.role === 'admin';
}

async function isSectionMember(sectionId: string, dni: string, env: Env): Promise<boolean> {
  const row = await env.MIRAI_AI_DB.prepare(
    'SELECT 1 AS ok FROM section_students WHERE section_id = ? AND UPPER(user_dni) = UPPER(?)'
  )
    .bind(sectionId, dni)
    .first<any>();
  return !!row;
}

/**
 * Mantiene el roster de D1 sincronizado con las conexiones WebSocket. Es lo que
 * permite al lobby mostrar los nombres de quienes están dentro de cada sala.
 */
async function registerPlayerInRoom(
  room: RoomRow,
  dni: string,
  nickname: string,
  role: GameRole,
  env: Env
): Promise<boolean> {
  const upper = dni.toUpperCase();
  const playerRole = role === 'student' ? 'player' : 'spectator';

  const existing = await env.MIRAI_AI_DB.prepare(
    'SELECT role FROM game_players WHERE room_id = ? AND user_dni = ?'
  )
    .bind(room.id, upper)
    .first<any>();

  // Si ya figuraba como espectador (p. ej. sala creada antes del cambio) y
  // ahora entra como jugador, se respeta el aforo antes de promoverlo.
  const becomingPlayer = playerRole === 'player' && existing?.role !== 'player';
  if (becomingPlayer) {
    const count = await env.MIRAI_AI_DB.prepare(
      "SELECT COUNT(*) AS n FROM game_players WHERE room_id = ? AND role = 'player'"
    )
      .bind(room.id)
      .first<any>();
    if ((count?.n ?? 0) >= room.max_players) return false;
  }

  await env.MIRAI_AI_DB.prepare(
    `INSERT INTO game_players (room_id, user_dni, nickname, role, status)
     VALUES (?, ?, ?, ?, 'joined')
     ON CONFLICT(room_id, user_dni) DO UPDATE SET
       nickname = excluded.nickname, role = excluded.role, status = 'joined'`
  )
    .bind(room.id, upper, nickname, playerRole)
    .run();

  return true;
}

async function canManageRoom(room: RoomRow, dni: string, env: Env): Promise<boolean> {
  const upper = dni.toUpperCase();
  if (room.created_by && room.created_by.toUpperCase() === upper) return true;
  if (room.professor_dni.toUpperCase() === upper) return true;
  return isAdmin(dni, env);
}

async function resolveRole(room: RoomRow, dni: string, env: Env): Promise<GameRole | null> {
  const upper = dni.toUpperCase();
  // El creador siempre juega, aunque sea docente o admin.
  if (room.created_by?.toUpperCase() === upper) return 'student';

  // El docente dueño de la sección observa (si no fue quien creó la sala).
  if (room.professor_dni.toUpperCase() === upper) return 'teacher';

  // Otros docentes observan; no se convierten en jugadores por tener acceso.
  if (await isActiveProfessor(dni, env)) return 'spectator';
  if (await isAdmin(dni, env)) return 'admin';

  if (room.assignment_id) {
    const assignment = await getAssignment(room.assignment_id, env);
    if (assignment && (await canAccessAssignment(assignment, dni, env))) return 'student';
  }

  if (room.section_id) {
    if (await isSectionMember(room.section_id, dni, env)) return 'student';
  } else if (!room.assignment_id) {
    return 'student';
  }

  return null;
}

/** El DO solo distingue alumno (juega) del resto (observa). */
function roleForDo(role: GameRole): string {
  return role === 'student' ? 'student' : role;
}

async function resolveNickname(dni: string, env: Env): Promise<string> {
  try {
    const user = await env.MIRAI_AI_DB.prepare(
      'SELECT first_name, last_name FROM users WHERE dni = ?'
    )
      .bind(dni.toUpperCase())
      .first<any>();
    const name = [user?.first_name, user?.last_name].filter(Boolean).join(' ').trim();
    return (name || 'Jugador').slice(0, 24);
  } catch {
    return 'Jugador';
  }
}

interface ActionOutcome {
  ok: boolean;
  status: number;
  error?: string;
}

/** Acción administrativa sobre el DO (start/cancel/remove). Nunca rompe el REST. */
async function callRoomAction(
  env: Env,
  code: string,
  action: string,
  dni: string,
  role: string,
  target?: string,
  extra?: Record<string, string>
): Promise<ActionOutcome> {
  try {
    const headers = new Headers({
      'X-Game-User': dni.toUpperCase(),
      'X-Game-Role': role,
      'X-Game-Code': code,
      'X-Game-Action': action,
      // El Worker ya autorizó (creador de la sala, docente o admin). El DO
      // confía en esta cabecera porque solo llega desde aquí, nunca del cliente.
      'X-Game-Manager': '1',
    });
    if (target) headers.set('X-Game-Target', target);
    for (const [key, value] of Object.entries(extra ?? {})) headers.set(key, value);

    const stub = env.GAME_ROOM.get(env.GAME_ROOM.idFromName(code));
    const response = await stub.fetch(
      new Request(`https://game.internal/${code}`, { method: 'POST', headers })
    );
    if (response.ok) return { ok: true, status: 200 };
    const data = await response.json<any>().catch(() => null);
    return { ok: false, status: response.status, error: data?.error };
  } catch (error: any) {
    console.warn(`GameRoom ${action} falló —`, error.message);
    return { ok: false, status: 503, error: 'La sala no está disponible' };
  }
}

function methodNotAllowed(corsHeaders: Record<string, string>) {
  return jsonResponse({ error: 'Método no permitido' }, 405, corsHeaders);
}
