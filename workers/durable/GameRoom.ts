/* ============================================
   MIRAI AI - GameRoom (Durable Object)
   Una instancia por partida (idFromName(code)). Autoridad única del estado:
   tablero, turnos, dados, preguntas, puntos y conexiones. El cliente solo
   dibuja lo que recibe.

   Ciclo de juego:
     - Cada jugador tira el dado y mueve una ficha (una acción por ciclo).
     - Al cerrarse el ciclo (todos tiraron y actuaron), a cada jugador le
       llega SU pregunta (fácil).
     - Se pausa hasta que todos respondan o venza el temporizador (30 s).
     - Puntos en % de la nota: fácil +10 / mal 0; difícil +20 / mal -20.
     - Las casillas especiales se regeneran al empezar cada ciclo; quien cae en
       una recibe pregunta difícil.
     - Gana quien lleva una ficha a la meta (posición 56).

   Seguridad: el cliente nunca recibe la respuesta correcta antes de resolver,
   ni puede elegir su pregunta, ni mover fuera de turno. Ver multijugador.md §9.
   ============================================ */
import { DurableObject } from 'cloudflare:workers';

export const LUDO_PATH_LEN = 56;
export const TOKENS_PER_PLAYER = 4;
export const COLORS = ['red', 'green', 'yellow', 'blue'] as const;
export const SAFE_CELLS = new Set([0, 8, 13, 21, 26, 34, 39, 47]);

const ROLLS_PER_CYCLE = 1;
const MAX_CYCLES = 15;
const SPECIAL_CELL_COUNT = 8;
const ANSWER_SECONDS = 30;
const EASY_PERCENT = 10;
const HARD_PERCENT = 20;

export type Color = (typeof COLORS)[number];
export type Difficulty = 'easy' | 'hard';

export interface PendingQuestion {
  id: string;
  difficulty: Difficulty;
  question: string;
  options: string[];
  answer: number;
  percent: number;
}

export interface PlayerState {
  dni: string;
  nickname: string;
  role: 'player' | 'spectator';
  color: Color | null;
  ready: boolean;
  connected: boolean;
  /** -1 = en base; 0..56 = recorrido (56 = meta). */
  tokens: number[];
  /** Tiradas consumidas en el ciclo actual. */
  rolls: number;
  /** Cayó en casilla especial en este ciclo → pregunta difícil. */
  hitSpecial: boolean;
  /** Puntos acumulados en % de la nota (puede ser negativo). */
  points: number;
  answered: boolean;
}

export interface GameState {
  roomId: string;
  code: string;
  sectionId: string | null;
  assignmentId: string | null;
  matchId: string | null;
  maxScore: number;
  maxPlayers: number;
  turnSeconds: number;
  status: 'lobby' | 'playing' | 'question' | 'finished';
  players: PlayerState[];
  turnIndex: number;
  dice: number | null;
  seq: number;
  version: number;
  turnDeadline: number | null;
  questionDeadline: number | null;
  winnerDni: string | null;
  cycle: number;
  specialCells: number[];
  pendingQuestions: Record<string, PendingQuestion>;
  answers: Record<string, number>;
}

export interface ServerMessage {
  type: string;
  seq: number;
  [key: string]: unknown;
}

export function randomDie(): number {
  const buf = new Uint8Array(1);
  crypto.getRandomValues(buf);
  return (buf[0] % 6) + 1;
}

function emptyTokens(): number[] {
  return Array(TOKENS_PER_PLAYER).fill(-1);
}

function isFinished(state: GameState): boolean {
  return state.status === 'finished';
}

function activePlayers(state: GameState): PlayerState[] {
  return state.players.filter((p) => p.role === 'player');
}

function nextTurn(state: GameState) {
  const currentPos = state.turnIndex;
  for (let step = 1; step <= state.players.length; step++) {
    const idx = (currentPos + step) % state.players.length;
    if (state.players[idx].role === 'player') {
      state.turnIndex = idx;
      break;
    }
  }
  state.dice = null;
  state.turnDeadline = Date.now() + state.turnSeconds * 1000;
}

/** Movimientos legales. Toda la validación vive en el servidor. */
export function legalMoves(state: GameState, dni: string): number[] {
  if (state.status !== 'playing' || state.dice === null) return [];
  const player = state.players.find((p) => p.dni === dni);
  if (!player || player.role !== 'player') return [];
  if (state.players[state.turnIndex]?.dni !== dni) return [];

  const dice = state.dice;
  const moves: number[] = [];
  for (let i = 0; i < player.tokens.length; i++) {
    const pos = player.tokens[i];
    if (pos === LUDO_PATH_LEN) continue;
    if (pos === -1) {
      if (dice === 6) moves.push(i);
      continue;
    }
    if (pos + dice <= LUDO_PATH_LEN) moves.push(i);
  }
  return moves;
}

/** Aplica un movimiento ya validado. Devuelve el evento público o null. */
export function applyMove(state: GameState, dni: string, token: number) {
  if (!legalMoves(state, dni).includes(token)) return null;
  const player = state.players.find((p) => p.dni === dni)!;
  const dice = state.dice!;
  const from = player.tokens[token];
  let captured: { dni: string; token: number } | null = null;

  if (player.tokens[token] === -1) {
    player.tokens[token] = 0;
  } else {
    player.tokens[token] += dice;
  }

  const landing = player.tokens[token];
  if (!SAFE_CELLS.has(landing)) {
    for (const other of state.players) {
      if (other.dni === dni || other.role !== 'player') continue;
      for (let t = 0; t < other.tokens.length; t++) {
        if (other.tokens[t] === landing) {
          other.tokens[t] = -1;
          captured = { dni: other.dni, token: t };
        }
      }
    }
  }

  const reachedMeta = player.tokens.some((p) => p === LUDO_PATH_LEN);
  if (reachedMeta) {
    state.status = 'finished';
    state.winnerDni = dni;
    state.dice = null;
    state.turnDeadline = null;
  }

  return { dni, token, from, landing, captured, finished: reachedMeta };
}

/** Estado público: nunca expone DNI ni la respuesta correcta de las preguntas. */
export function publicState(state: GameState) {
  const winnerIndex = state.winnerDni
    ? state.players.findIndex((p) => p.dni === state.winnerDni)
    : -1;

  return {
    roomId: state.roomId,
    code: state.code,
    sectionId: state.sectionId,
    maxPlayers: state.maxPlayers,
    turnSeconds: state.turnSeconds,
    answerSeconds: ANSWER_SECONDS,
    status: state.status,
    turnIndex: state.turnIndex,
    dice: state.dice,
    seq: state.seq,
    version: state.version,
    turnDeadline: state.turnDeadline,
    questionDeadline: state.questionDeadline,
    cycle: state.cycle,
    specialCells: state.specialCells,
    winnerId: winnerIndex >= 0 ? `p${winnerIndex}` : null,
    players: state.players.map((p, i) => ({
      id: `p${i}`,
      nickname: p.nickname,
      role: p.role,
      color: p.color,
      ready: p.ready,
      connected: p.connected,
      tokens: p.tokens,
      rolls: p.rolls,
      hitSpecial: p.hitSpecial,
      points: p.points,
      answered: p.answered,
    })),
  };
}

interface WsAttachment {
  dni: string;
  nickname: string;
  canManage: boolean;
}

/** Cabeceras HTTP solo admiten bytes; el Worker manda el apodo codificado. */
function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function jsonMsg(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function randomInt(maxExclusive: number): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] % maxExclusive;
}

function pickSpecialCells(): number[] {
  const chosen = new Set<number>();
  let guard = 0;
  while (chosen.size < SPECIAL_CELL_COUNT && guard < 500) {
    guard++;
    const cell = 1 + randomInt(LUDO_PATH_LEN - 1);
    if (SAFE_CELLS.has(cell)) continue;
    chosen.add(cell);
  }
  return [...chosen].sort((a, b) => a - b);
}

function shuffleOptions(question: PendingQuestion): PendingQuestion {
  const indices = question.options.map((_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  return {
    ...question,
    options: indices.map((i) => question.options[i]),
    answer: indices.indexOf(question.answer),
  };
}

export class GameRoom extends DurableObject<Env> {
  private cachedState: GameState | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ctx.storage.sql.exec(
      `CREATE TABLE IF NOT EXISTS game_state (
         id INTEGER PRIMARY KEY CHECK (id = 1),
         state TEXT NOT NULL
       )`
    );
    this.ctx.storage.sql.exec(
      `CREATE TABLE IF NOT EXISTS question_pool (
         id TEXT PRIMARY KEY,
         difficulty TEXT,
         payload TEXT NOT NULL,
         used INTEGER NOT NULL DEFAULT 0
       )`
    );
  }

  /* ─────────────── estado persistente ─────────────── */

  private loadState(): GameState | null {
    if (this.cachedState) return this.cachedState;
    const row = this.ctx.storage.sql
      .exec<{ state: string }>('SELECT state FROM game_state WHERE id = 1')
      .toArray()[0];
    if (!row) return null;
    this.cachedState = JSON.parse(row.state) as GameState;
    return this.cachedState;
  }

  private saveState(state: GameState) {
    state.seq++;
    state.version++;
    this.cachedState = state;
    this.ctx.storage.sql.exec(
      `INSERT INTO game_state (id, state) VALUES (1, ?)
       ON CONFLICT(id) DO UPDATE SET state = excluded.state`,
      JSON.stringify(state)
    );
  }

  private ensureAlarm(state: GameState) {
    const deadline =
      state.status === 'question'
        ? state.questionDeadline ?? Date.now() + ANSWER_SECONDS * 1000
        : state.turnDeadline ?? Date.now() + state.turnSeconds * 1000;
    this.ctx.storage.setAlarm(deadline);
  }

  /* ─────────────── entrada HTTP / WebSocket ─────────────── */

  async fetch(request: Request): Promise<Response> {
    const dni = request.headers.get('X-Game-User');
    const roleHeader = request.headers.get('X-Game-Role') || 'student';
    const nickname = safeDecode(request.headers.get('X-Game-Nickname') || '').slice(0, 24);
    const code = request.headers.get('X-Game-Code') || '';
    const sectionId = request.headers.get('X-Game-Section') || null;
    const canManage = request.headers.get('X-Game-CanManage') === '1';

    if (!dni) return new Response('No autorizado', { status: 401 });

    if (request.headers.get('Upgrade') !== 'websocket') {
      if (request.method === 'POST' && request.headers.get('X-Game-Action')) {
        return this.handleAction(request);
      }
      const state = this.loadState();
      if (!state) return new Response('Sala no iniciada', { status: 404 });
      return new Response(JSON.stringify(publicState(state)), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const state = this.loadState() ?? this.createRoom(code, sectionId);

    const isSpectator = roleHeader !== 'student';
    const player = this.upsertPlayer(state, dni, nickname, isSpectator);
    if (!player && !isSpectator) {
      return new Response('Sala llena o partida en curso', { status: 409 });
    }

    this.closeDuplicateSockets(dni);

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server, [`user:${dni}`]);
    server.serializeAttachment({
      dni,
      nickname: player?.nickname ?? nickname,
      canManage,
    } satisfies WsAttachment);

    this.saveState(state);
    server.send(JSON.stringify(this.snapshotFor(state, dni, canManage)));
    this.broadcastRoomState(state);
    if (state.status !== 'lobby' && state.status !== 'finished') this.ensureAlarm(state);

    return new Response(null, { status: 101, webSocket: client });
  }

  private createRoom(code: string, sectionId: string | null): GameState {
    const state: GameState = {
      roomId: code || this.ctx.id.toString(),
      code,
      sectionId,
      assignmentId: null,
      matchId: null,
      maxScore: 100,
      maxPlayers: 4,
      turnSeconds: 40,
      status: 'lobby',
      players: [],
      turnIndex: 0,
      dice: null,
      seq: 0,
      version: 0,
      turnDeadline: null,
      questionDeadline: null,
      winnerDni: null,
      cycle: 0,
      specialCells: [],
      pendingQuestions: {},
      answers: {},
    };
    this.saveState(state);
    return state;
  }

  private upsertPlayer(state: GameState, dni: string, nickname: string, spectator: boolean): PlayerState | null {
    const existing = state.players.find((p) => p.dni === dni);
    if (existing) {
      existing.connected = true;
      if (nickname) existing.nickname = nickname;
      // Salas creadas antes del cambio dejaron al docente como espectador. Si
      // ahora entra como jugador y aún no ha empezado, se convierte en jugador.
      if (!spectator && existing.role !== 'player' && state.status === 'lobby') {
        const used = new Set(activePlayers(state).filter((p) => p.dni !== dni).map((p) => p.color));
        existing.role = 'player';
        existing.ready = false;
        existing.tokens = emptyTokens();
        existing.rolls = 0;
        existing.hitSpecial = false;
        existing.points = 0;
        existing.answered = false;
        existing.color = COLORS.find((c) => !used.has(c)) ?? null;
      }
      return existing;
    }

    if (spectator) {
      const s: PlayerState = {
        dni,
        nickname: nickname || 'Docente',
        role: 'spectator',
        color: null,
        ready: true,
        connected: true,
        tokens: [],
        rolls: 0,
        hitSpecial: false,
        points: 0,
        answered: false,
      };
      state.players.push(s);
      return s;
    }

    const active = activePlayers(state);
    if (state.status !== 'lobby' || active.length >= state.maxPlayers) return null;

    const used = new Set(active.map((p) => p.color));
    const color = COLORS.find((c) => !used.has(c)) ?? null;
    const player: PlayerState = {
      dni,
      nickname: nickname || `Jugador ${active.length + 1}`,
      role: 'player',
      color,
      ready: false,
      connected: true,
      tokens: emptyTokens(),
      rolls: 0,
      hitSpecial: false,
      points: 0,
      answered: false,
    };
    state.players.push(player);
    return player;
  }

  private closeDuplicateSockets(dni: string) {
    for (const socket of this.ctx.getWebSockets(`user:${dni}`)) {
      try {
        socket.close(4001, 'Reconexión en otra pestaña');
      } catch {
        /* ya cerrado */
      }
    }
  }

  /* ─────────────── acciones administrativas (desde el Worker) ─────────────── */

  private async handleAction(request: Request): Promise<Response> {
    const action = request.headers.get('X-Game-Action') || '';
    const role = request.headers.get('X-Game-Role') || '';
    const manager = request.headers.get('X-Game-Manager') === '1';
    if (!manager && role !== 'teacher' && role !== 'admin') {
      return jsonMsg({ error: 'Solo el creador de la sala o el docente puede administrarla' }, 403);
    }

    const state = this.loadState();
    if (!state) return jsonMsg({ error: 'La sala aún no tiene conexiones' }, 409);

    switch (action) {
      case 'start':
        return this.actionStart(request, state);
      case 'cancel':
        return this.actionCancel(state);
      case 'remove': {
        const target = request.headers.get('X-Game-Target');
        if (!target) return jsonMsg({ error: 'Falta el jugador a expulsar' }, 400);
        this.removePlayer(state, target);
        return jsonMsg({ ok: true }, 200);
      }
      default:
        return jsonMsg({ error: 'Acción desconocida' }, 400);
    }
  }

  private async actionStart(request: Request, state: GameState): Promise<Response> {
    if (state.status !== 'lobby') return jsonMsg({ error: 'La partida ya está iniciada' }, 409);
    const players = activePlayers(state);
    if (players.length < 2) {
      return jsonMsg({ error: 'Se necesitan al menos 2 jugadores conectados' }, 409);
    }

    state.matchId = request.headers.get('X-Game-Match') || `${state.roomId}:${Date.now()}`;
    state.assignmentId = request.headers.get('X-Game-Assignment') || null;
    state.maxScore = Number(request.headers.get('X-Game-Max-Score') ?? 100) || 100;

    await this.loadQuestionPool(state.assignmentId);
    if (state.assignmentId && this.poolCount() === 0) {
      return jsonMsg({ error: 'No hay preguntas disponibles para esta tarea' }, 409);
    }

    for (const p of state.players) {
      p.rolls = 0;
      p.hitSpecial = false;
      p.points = 0;
      p.answered = false;
    }
    state.pendingQuestions = {};
    state.answers = {};
    this.startCycle(state, 1);
    return jsonMsg({ ok: true }, 200);
  }

  private actionCancel(state: GameState): Response {
    state.status = 'finished';
    state.turnDeadline = null;
    state.questionDeadline = null;
    this.saveState(state);
    this.broadcastError(state, 'room_cancelled');
    void this.ctx.storage.deleteAlarm();
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.close(4003, 'Sala cancelada por el docente');
      } catch {
        /* ya cerrado */
      }
    }
    return jsonMsg({ ok: true }, 200);
  }

  private removePlayer(state: GameState, dni: string) {
    if (state.status === 'lobby') {
      state.players = state.players.filter((p) => p.dni !== dni);
    } else {
      const player = state.players.find((p) => p.dni === dni);
      if (player) player.connected = false;
    }
    this.saveState(state);
    for (const ws of this.ctx.getWebSockets(`user:${dni}`)) {
      try {
        ws.close(4003, 'Has salido de la sala');
      } catch {
        /* ya cerrado */
      }
    }
    this.broadcastRoomState(state);
  }

  /* ─────────────── banco de preguntas (copia local del DO) ─────────────── */

  private async loadQuestionPool(assignmentId: string | null) {
    this.ctx.storage.sql.exec('DELETE FROM question_pool');
    if (!assignmentId) return;
    const rows = await this.env.MIRAI_AI_DB.prepare(
      'SELECT id, difficulty, payload FROM game_question_bank WHERE assignment_id = ?'
    )
      .bind(assignmentId)
      .all<any>();
    for (const row of rows.results ?? []) {
      this.ctx.storage.sql.exec(
        'INSERT OR IGNORE INTO question_pool (id, difficulty, payload, used) VALUES (?, ?, ?, 0)',
        row.id,
        row.difficulty ?? null,
        row.payload
      );
    }
  }

  private poolCount(): number {
    const row = this.ctx.storage.sql
      .exec<{ n: number }>('SELECT COUNT(*) AS n FROM question_pool')
      .toArray()[0];
    return Number(row?.n ?? 0);
  }

  private takeQuestion(difficulty: Difficulty): PendingQuestion | null {
    const pick = (d: Difficulty | null) => {
      const rows = d
        ? this.ctx.storage.sql
            .exec<{ id: string; payload: string }>(
              'SELECT id, payload FROM question_pool WHERE used = 0 AND difficulty = ? ORDER BY random() LIMIT 1',
              d
            )
            .toArray()
        : this.ctx.storage.sql
            .exec<{ id: string; payload: string }>(
              'SELECT id, payload FROM question_pool WHERE used = 0 ORDER BY random() LIMIT 1'
            )
            .toArray();
      return rows[0] ?? null;
    };

    const row = pick(difficulty) ?? pick(difficulty === 'easy' ? 'hard' : 'easy') ?? pick(null);
    if (!row) return null;

    this.ctx.storage.sql.exec('UPDATE question_pool SET used = 1 WHERE id = ?', row.id);
    try {
      const payload = JSON.parse(row.payload);
      if (!Array.isArray(payload.options) || payload.options.length !== 4) return null;
      return shuffleOptions({
        id: row.id,
        difficulty,
        question: String(payload.question ?? ''),
        options: payload.options.map((o: unknown) => String(o)),
        answer: Number(payload.answer ?? 0),
        percent: difficulty === 'hard' ? HARD_PERCENT : EASY_PERCENT,
      });
    } catch {
      return null;
    }
  }

  /* ─────────────── mensajes de WebSocket (hibernación) ─────────────── */

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    if (typeof message !== 'string') return;
    const attachment = ws.deserializeAttachment() as WsAttachment | null;
    if (!attachment) {
      ws.close(4002, 'Sin identidad');
      return;
    }

    let msg: any;
    try {
      msg = JSON.parse(message);
    } catch {
      this.send(ws, { type: 'error', seq: 0, code: 'bad_json' });
      return;
    }

    const state = this.loadState();
    if (!state) {
      this.send(ws, { type: 'error', seq: 0, code: 'room_not_found' });
      return;
    }

    switch (msg?.type) {
      case 'ping':
        this.send(ws, { type: 'pong', seq: state.seq });
        return;
      case 'join':
        ws.serializeAttachment({
          dni: attachment.dni,
          nickname: String(msg.nickname || attachment.nickname).slice(0, 24),
          canManage: attachment.canManage,
        } satisfies WsAttachment);
        this.send(ws, this.snapshotFor(state, attachment.dni, attachment.canManage));
        return;
      case 'ready':
        this.handleReady(state, attachment.dni);
        return;
      case 'pick_color':
        this.handlePickColor(state, attachment.dni, String(msg.color ?? ''));
        return;
      case 'roll':
        this.handleRoll(state, attachment.dni);
        return;
      case 'move':
        this.handleMove(state, attachment.dni, Number(msg.token));
        return;
      case 'answer':
        this.handleAnswer(state, attachment.dni, String(msg.id ?? ''), Number(msg.choice));
        return;
      case 'chat':
        // Desactivado por defecto (menores). Se habilitará con moderación.
        return;
      default:
        this.send(ws, { type: 'error', seq: state.seq, code: 'unknown_type' });
    }
  }

  async webSocketClose(ws: WebSocket) {
    const attachment = ws.deserializeAttachment() as WsAttachment | null;
    const state = this.loadState();
    if (!attachment || !state) return;
    const player = state.players.find((p) => p.dni === attachment.dni);
    if (player) {
      player.connected = false;
      this.saveState(state);
      this.broadcastRoomState(state);
    }
  }

  async webSocketError(ws: WebSocket) {
    await this.webSocketClose(ws);
  }

  /* ─────────────── ciclo de juego ─────────────── */

  private startCycle(state: GameState, cycle: number) {
    state.cycle = cycle;
    state.status = 'playing';
    for (const p of state.players) {
      p.rolls = 0;
      p.hitSpecial = false;
      p.answered = false;
    }
    state.pendingQuestions = {};
    state.answers = {};
    state.dice = null;
    state.questionDeadline = null;
    state.specialCells = pickSpecialCells();
    const firstPlayer = state.players.findIndex((p) => p.role === 'player');
    state.turnIndex = firstPlayer >= 0 ? firstPlayer : 0;
    state.turnDeadline = Date.now() + state.turnSeconds * 1000;

    this.saveState(state);
    this.broadcast({ type: 'special_cells', seq: state.seq, cells: state.specialCells, cycle });
    this.broadcast({
      type: 'turn_started',
      seq: state.seq,
      dni: this.publicId(state, state.players[state.turnIndex].dni),
      cycle,
    });
    this.broadcastRoomState(state);
    this.ensureAlarm(state);
  }

  private endTurn(state: GameState) {
    const players = activePlayers(state);
    const cycleDone = players.length > 0 && players.every((p) => p.rolls >= ROLLS_PER_CYCLE);
    if (cycleDone) {
      this.startQuestionPhase(state);
      return;
    }
    nextTurn(state);
    this.saveState(state);
    this.broadcast({
      type: 'turn_started',
      seq: state.seq,
      dni: this.publicId(state, state.players[state.turnIndex].dni),
      cycle: state.cycle,
    });
    this.ensureAlarm(state);
  }

  private handlePickColor(state: GameState, dni: string, color: string) {
    if (state.status !== 'lobby') return this.broadcastError(state, 'not_lobby');
    const player = state.players.find((p) => p.dni === dni);
    if (!player || player.role !== 'player') return;
    if (!(COLORS as readonly string[]).includes(color)) return this.broadcastError(state, 'bad_color');
    const taken = state.players.some(
      (p) => p.role === 'player' && p.dni !== dni && p.color === color,
    );
    if (taken) return this.broadcastError(state, 'color_taken');
    player.color = color as Color;
    player.ready = false;
    this.saveState(state);
    this.broadcastRoomState(state);
  }

  private handleReady(state: GameState, dni: string) {
    const player = state.players.find((p) => p.dni === dni);
    if (!player || player.role !== 'player' || state.status !== 'lobby') return;
    player.ready = !player.ready;
    this.saveState(state);
    this.broadcastRoomState(state);
  }

  private handleRoll(state: GameState, dni: string) {
    if (state.status !== 'playing') return this.broadcastError(state, 'not_playing');
    if (state.players[state.turnIndex]?.dni !== dni) return this.broadcastError(state, 'not_your_turn');
    if (state.dice !== null) return this.broadcastError(state, 'already_rolled');

    const dice = randomDie();
    const player = state.players.find((p) => p.dni === dni)!;
    player.rolls++;
    state.dice = dice;
    state.turnDeadline = Date.now() + state.turnSeconds * 1000;

    const legal = legalMoves(state, dni);
    this.saveState(state);
    this.broadcast({ type: 'dice_result', seq: state.seq, dni: this.publicId(state, dni), dice, legal });

    if (legal.length === 0) {
      this.endTurn(state);
    } else {
      this.ensureAlarm(state);
    }
  }

  private handleMove(state: GameState, dni: string, token: number) {
    if (state.status !== 'playing') return this.broadcastError(state, 'not_playing');
    if (state.players[state.turnIndex]?.dni !== dni) return this.broadcastError(state, 'not_your_turn');

    const event = applyMove(state, dni, token);
    if (!event) return this.broadcastError(state, 'illegal_move');

    const player = state.players.find((p) => p.dni === dni)!;
    if (state.specialCells.includes(event.landing)) player.hitSpecial = true;

    this.saveState(state);
    this.broadcast({
      type: 'move_applied',
      seq: state.seq,
      dni: this.publicId(state, dni),
      token,
      captured: event.captured ? this.publicId(state, event.captured.dni) : null,
      special: player.hitSpecial,
      state: publicState(state),
    });

    if (isFinished(state)) {
      this.finishGame(state, state.winnerDni);
      return;
    }
    this.endTurn(state);
  }

  /* ─────────────── fase de preguntas ─────────────── */

  private startQuestionPhase(state: GameState) {
    state.status = 'question';
    state.dice = null;
    state.turnDeadline = null;
    state.pendingQuestions = {};
    state.answers = {};

    for (const player of activePlayers(state)) {
      player.answered = false;
      const question = this.takeQuestion(player.hitSpecial ? 'hard' : 'easy');
      if (question) state.pendingQuestions[player.dni] = question;
    }

    if (Object.keys(state.pendingQuestions).length === 0) {
      // Sin banco disponible: se degrada sin romper la partida.
      this.broadcastError(state, 'no_questions');
      this.resumeAfterQuestions(state);
      return;
    }

    state.questionDeadline = Date.now() + ANSWER_SECONDS * 1000;
    this.saveState(state);
    this.broadcast({
      type: 'question_phase_started',
      seq: state.seq,
      deadline: state.questionDeadline,
      cycle: state.cycle,
    });

    for (const player of activePlayers(state)) {
      const question = state.pendingQuestions[player.dni];
      if (!question) continue;
      this.sendTo(player.dni, {
        type: 'question',
        seq: state.seq,
        id: question.id,
        question: question.question,
        options: question.options,
        difficulty: question.difficulty,
        percent: question.percent,
        deadline: state.questionDeadline,
      });
    }

    this.ensureAlarm(state);
  }

  private handleAnswer(state: GameState, dni: string, id: string, choice: number) {
    if (state.status !== 'question') return this.broadcastError(state, 'not_question_phase');
    const question = state.pendingQuestions[dni];
    if (!question || question.id !== id) return this.broadcastError(state, 'not_your_question');
    if (state.answers[dni] !== undefined) return this.broadcastError(state, 'already_answered');
    if (!Number.isInteger(choice) || choice < 0 || choice > 3) {
      return this.broadcastError(state, 'bad_choice');
    }

    state.answers[dni] = choice;
    const player = state.players.find((p) => p.dni === dni);
    if (!player) return;

    const correct = choice === question.answer;
    const delta = correct ? question.percent : question.difficulty === 'hard' ? -question.percent : 0;
    player.points += delta;
    player.answered = true;

    this.saveState(state);
    this.sendTo(dni, {
      type: 'question_result',
      seq: state.seq,
      id: question.id,
      correct,
      correctIndex: question.answer,
      delta,
      total: player.points,
    });
    this.broadcastRoomState(state);

    if (activePlayers(state).every((p) => p.answered)) {
      this.resumeAfterQuestions(state);
    }
  }

  private resumeAfterQuestions(state: GameState) {
    for (const player of activePlayers(state)) {
      const question = state.pendingQuestions[player.dni];
      if (!question || player.answered) continue;

      // Sin respuesta a tiempo = incorrecta (en difícil resta).
      const delta = question.difficulty === 'hard' ? -question.percent : 0;
      player.points += delta;
      player.answered = true;
      this.sendTo(player.dni, {
        type: 'question_result',
        seq: state.seq,
        id: question.id,
        correct: false,
        correctIndex: question.answer,
        delta,
        total: player.points,
        timeout: true,
      });
    }

    state.pendingQuestions = {};
    state.answers = {};
    state.questionDeadline = null;
    this.broadcast({ type: 'question_phase_end', seq: state.seq, cycle: state.cycle });

    if (state.cycle >= MAX_CYCLES) {
      const ranking = [...activePlayers(state)].sort((a, b) => b.points - a.points);
      this.finishGame(state, ranking[0]?.dni ?? null);
      return;
    }

    this.startCycle(state, state.cycle + 1);
  }

  /* ─────────────── turnos y limpieza (alarm) ─────────────── */

  async alarm() {
    const state = this.loadState();
    if (!state || state.status === 'lobby' || state.status === 'finished') return;

    if (state.status === 'question') {
      if (state.questionDeadline && Date.now() >= state.questionDeadline) {
        this.broadcastError(state, 'question_timeout');
        this.resumeAfterQuestions(state);
      } else {
        this.ensureAlarm(state);
      }
      return;
    }

    if (state.turnDeadline && Date.now() >= state.turnDeadline) {
      const current = state.players[state.turnIndex];
      if (current) {
        // Si no llegó a tirar, la espera cuenta como tirada (pase).
        if (state.dice === null) current.rolls++;
      }
      this.broadcastError(state, 'turn_timeout');
      if (state.dice !== null) {
        state.dice = null;
        this.saveState(state);
      }
      this.endTurn(state);
      return;
    }

    this.ensureAlarm(state);
  }

  /* ─────────────── fin de partida y nota ─────────────── */

  private finishGame(state: GameState, winnerDni: string | null) {
    state.status = 'finished';
    state.winnerDni = winnerDni;
    state.dice = null;
    state.turnDeadline = null;
    state.questionDeadline = null;
    this.saveState(state);

    const publicWinner = winnerDni ? this.publicId(state, winnerDni) : '';
    this.broadcast({ type: 'game_over', seq: state.seq, winner: publicWinner });
    this.broadcastRoomState(state);
    void this.ctx.storage.deleteAlarm();
    void this.persistResults(state);
  }

  private async persistResults(state: GameState) {
    try {
      const players = activePlayers(state);
      const ordered = [...players].sort((a, b) => b.points - a.points);
      const matchId = state.matchId || `${state.roomId}:${Date.now()}`;
      const now = new Date().toISOString();

      await this.env.MIRAI_AI_DB.prepare(
        `INSERT INTO game_matches (id, room_id, status, started_at, finished_at, winner_dni, state_summary)
         VALUES (?, ?, 'finished', NULL, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           status = 'finished', finished_at = excluded.finished_at,
           winner_dni = excluded.winner_dni, state_summary = excluded.state_summary`
      )
        .bind(
          matchId,
          state.roomId,
          now,
          state.winnerDni,
          JSON.stringify({ cycle: state.cycle, players: ordered.map((p) => ({ points: p.points, tokens: p.tokens })) })
        )
        .run();

      await this.env.MIRAI_AI_DB.prepare('DELETE FROM game_results WHERE match_id = ?').bind(matchId).run();
      for (let i = 0; i < ordered.length; i++) {
        const p = ordered[i];
        await this.env.MIRAI_AI_DB.prepare(
          `INSERT INTO game_results (match_id, user_dni, position, score, xp, created_at)
           VALUES (?, ?, ?, ?, 0, ?)
           ON CONFLICT(match_id, user_dni) DO UPDATE SET position = excluded.position, score = excluded.score`
        )
          .bind(matchId, p.dni, i + 1, Math.max(0, Math.round(p.points)), now)
          .run();
      }

      await this.env.MIRAI_AI_DB.prepare(
        "UPDATE game_rooms SET status = 'finished' WHERE id = ?"
      )
        .bind(state.roomId)
        .run();

      if (state.assignmentId) {
        await this.applyGrades(state, ordered);
      }
    } catch (error: any) {
      console.warn('GameRoom.persistResults: D1 no disponible —', error.message);
    }
  }

  /** Los puntos son la nota: se guardan como submission de la tarea (mejor marca). */
  private async applyGrades(state: GameState, players: PlayerState[]) {
    for (const player of players) {
      const percent = Math.max(0, Math.min(100, player.points));
      const score = Math.round((state.maxScore * percent) / 100);

      const existing = await this.env.MIRAI_AI_DB.prepare(
        'SELECT id, score, file_url FROM submissions WHERE assignment_id = ? AND user_dni = ?'
      )
        .bind(state.assignmentId, player.dni)
        .first<any>();

      // No se pisa una entrega de otro método (documento, quiz...): Ludo es una
      // forma más de hacer la tarea, no un reemplazo silencioso.
      if (existing && !String(existing.file_url ?? '').startsWith('game://')) continue;
      if (existing && Number(existing.score ?? 0) >= score) continue;

      const feedback = JSON.stringify({
        source: 'ludo',
        percent,
        max_score: state.maxScore,
        cycle: state.cycle,
      });

      await this.env.MIRAI_AI_DB.prepare(
        `INSERT INTO submissions
           (id, assignment_id, user_dni, file_url, status, score, graded_at, feedback, attempt_type)
         VALUES (?, ?, ?, 'game://ludo', 'graded', ?, datetime('now'), ?, 'ludo')
         ON CONFLICT(assignment_id, user_dni) DO UPDATE SET
           file_url = 'game://ludo', status = 'graded', score = excluded.score,
           graded_at = excluded.graded_at, feedback = excluded.feedback, attempt_type = 'ludo'`
      )
        .bind(crypto.randomUUID(), state.assignmentId, player.dni, score, feedback)
        .run();
    }
  }

  /* ─────────────── utilidades de difusión ─────────────── */

  private publicId(state: GameState, dni: string): string {
    const index = state.players.findIndex((p) => p.dni === dni);
    return index >= 0 ? `p${index}` : '';
  }

  /** Snapshot completo para UN jugador: incluye su id, su rol y su pregunta. */
  private snapshotFor(state: GameState, dni: string, canManage: boolean): ServerMessage {
    const player = state.players.find((p) => p.dni === dni);
    const question = state.pendingQuestions[dni];
    return {
      type: 'state_snapshot',
      seq: state.seq,
      you: this.publicId(state, dni),
      youRole: player?.role ?? 'spectator',
      youManage: canManage,
      legal: legalMoves(state, dni),
      question: question
        ? {
            id: question.id,
            question: question.question,
            options: question.options,
            difficulty: question.difficulty,
            percent: question.percent,
            deadline: state.questionDeadline,
            answered: state.answers[dni] !== undefined,
          }
        : null,
      state: publicState(state),
    };
  }

  private send(ws: WebSocket, message: ServerMessage) {
    try {
      ws.send(JSON.stringify(message));
    } catch {
      /* socket muerto */
    }
  }

  private sendTo(dni: string, message: ServerMessage) {
    for (const ws of this.ctx.getWebSockets(`user:${dni}`)) {
      this.send(ws, message);
    }
  }

  private broadcast(message: ServerMessage) {
    const payload = JSON.stringify(message);
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(payload);
      } catch {
        /* socket muerto */
      }
    }
  }

  private broadcastRoomState(state: GameState) {
    this.broadcast({ type: 'room_state', seq: state.seq, state: publicState(state) });
  }

  private broadcastError(state: GameState, code: string) {
    this.broadcast({ type: 'error', seq: state.seq, code });
  }
}
