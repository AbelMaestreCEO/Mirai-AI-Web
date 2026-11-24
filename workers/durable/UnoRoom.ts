/* ============================================
   MIRAI AI - UnoRoom (Durable Object)
   Una instancia por partida (idFromName(code)). Autoridad única del estado:
   baraja, manos, turnos, dirección, preguntas y conexiones. El cliente solo
   dibuja lo que recibe (uno-like.md §5.3).

   Modificaciones educativas:
     - +2  → pregunta fácil a los demás; correcto evita 2 cartas.
     - +4  → pregunta difícil; correcto evita 4 cartas.
     - Ronda par → pregunta media a todos; correcto evita 1 carta.
     - 30 s por pregunta, servidor autoritativo con alarm().
   ============================================ */
import { DurableObject } from 'cloudflare:workers';
import { recordConceptErrors } from '../lib/concept-errors';
import { recordTaskModeResult } from '../lib/task-progress';
import {
  ANSWER_SECONDS,
  DEFAULT_CONFIG,
  HAND_SIZE,
  activePlayers,
  advanceTurn,
  beginNextTurn,
  computeFinalScores,
  createDeck,
  drawCards,
  isLegalPlay,
  isNumberCard,
  legalCardIds,
  playCard,
  rankPlayers,
  resetAnswered,
  shuffle,
  topCard,
  type PendingQuestion,
  type ReviewItem,
  type UnoCard,
  type UnoColor,
  type UnoConfig,
  type UnoDifficulty,
  type UnoPlayer,
  type UnoState,
} from '../lib/uno-engine';

const QUESTION_SECONDS = ANSWER_SECONDS;

export type { UnoState } from '../lib/uno-engine';

interface WsAttachment {
  dni: string;
  nickname: string;
  canManage: boolean;
}

interface QuestionPayload {
  question: string;
  options: string[];
  answer: number;
  explanation?: string;
  concept?: string;
}

function randomInt(maxExclusive: number): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] % maxExclusive;
}

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

/** Estado público: nunca expone mazos ni manos ajenas. */
export function publicState(state: UnoState) {
  const winnerIndex = state.winnerDni
    ? state.players.findIndex((p) => p.dni === state.winnerDni)
    : -1;

  return {
    roomId: state.roomId,
    code: state.code,
    sectionId: state.sectionId,
    gameType: state.gameType,
    maxPlayers: state.maxPlayers,
    turnSeconds: state.turnSeconds,
    answerSeconds: QUESTION_SECONDS,
    gradingMode: state.gradingMode,
    status: state.status,
    turnIndex: state.turnIndex,
    direction: state.direction,
    activeColor: state.activeColor,
    discardTop: topCard(state),
    deckCount: state.deck.length,
    round: state.round,
    actionsThisRound: state.actionsThisRound,
    roundsToWin: state.roundsToWin,
    roundMaxMinutes: state.roundMaxMinutes,
    seq: state.seq,
    version: state.version,
    turnDeadline: state.turnDeadline,
    questionDeadline: state.questionDeadline,
    questionKind: state.questionEvent?.kind ?? null,
    canDraw: state.questionEvent === null && state.status === 'playing',
    winnerId: winnerIndex >= 0 ? `p${winnerIndex}` : null,
    players: state.players.map((p, i) => ({
      id: `p${i}`,
      nickname: p.nickname,
      role: p.role,
      teamId: p.teamId,
      seat: p.seat,
      ready: p.ready,
      connected: p.connected,
      handCount: p.hand.length,
      points: p.points,
      answered: p.answered,
      roundWins: p.roundWins,
    })),
  };
}

export class UnoRoom extends DurableObject<Env> {
  private cachedState: UnoState | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ctx.storage.sql.exec(
      `CREATE TABLE IF NOT EXISTS uno_state (
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

  private loadState(): UnoState | null {
    if (this.cachedState) return this.cachedState;
    const row = this.ctx.storage.sql
      .exec<{ state: string }>('SELECT state FROM uno_state WHERE id = 1')
      .toArray()[0];
    if (!row) return null;
    this.cachedState = JSON.parse(row.state) as UnoState;
    if (!this.cachedState.review) this.cachedState.review = {};
    if (!this.cachedState.quizStats) this.cachedState.quizStats = {};
    if (!this.cachedState.config) this.cachedState.config = { ...DEFAULT_CONFIG };
    return this.cachedState;
  }

  private saveState(state: UnoState) {
    state.seq++;
    state.version++;
    this.cachedState = state;
    this.ctx.storage.sql.exec(
      `INSERT INTO uno_state (id, state) VALUES (1, ?)
       ON CONFLICT(id) DO UPDATE SET state = excluded.state`,
      JSON.stringify(state)
    );
  }

  private ensureAlarm(state: UnoState) {
    const deadline =
      state.status === 'question'
        ? state.questionDeadline ?? Date.now() + QUESTION_SECONDS * 1000
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

  private createRoom(code: string, sectionId: string | null): UnoState {
    const state: UnoState = {
      roomId: code || this.ctx.id.toString(),
      code,
      sectionId,
      assignmentId: null,
      matchId: null,
      gameType: 'uno',
      maxScore: 100,
      maxPlayers: 4,
      turnSeconds: 30,
      gradingMode: 'summative',
      status: 'lobby',
      players: [],
      deck: [],
      discard: [],
      activeColor: 'red',
      direction: 1,
      turnIndex: 0,
      turnDeadline: null,
      questionDeadline: null,
      round: 1,
      actionsThisRound: 0,
      roundStartedAt: Date.now(),
      roundsToWin: 1,
      roundMaxMinutes: 15,
      config: { ...DEFAULT_CONFIG },
      drawnThisTurn: false,
      questionEvent: null,
      pendingQuestions: {},
      answers: {},
      quizStats: {},
      review: {},
      winnerDni: null,
      seq: 0,
      version: 0,
    };
    this.saveState(state);
    return state;
  }

  private upsertPlayer(
    state: UnoState,
    dni: string,
    nickname: string,
    spectator: boolean
  ): UnoPlayer | null {
    const existing = state.players.find((p) => p.dni === dni);
    if (existing) {
      existing.connected = true;
      if (nickname) existing.nickname = nickname;
      if (!spectator && existing.role !== 'player' && state.status === 'lobby') {
        existing.role = 'player';
        existing.ready = false;
        existing.seat = activePlayers(state).filter((p) => p.dni !== dni).length;
      }
      return existing;
    }

    if (spectator) {
      const s: UnoPlayer = {
        dni,
        nickname: nickname || 'Docente',
        role: 'spectator',
        teamId: null,
        seat: -1,
        ready: true,
        connected: true,
        hand: [],
        points: 0,
        answered: false,
        roundWins: 0,
      };
      state.players.push(s);
      return s;
    }

    const active = activePlayers(state);
    if (state.status !== 'lobby' || active.length >= state.maxPlayers) return null;

    const player: UnoPlayer = {
      dni,
      nickname: nickname || `Jugador ${active.length + 1}`,
      role: 'player',
      teamId: null,
      seat: active.length,
      ready: false,
      connected: true,
      hand: [],
      points: 0,
      answered: false,
      roundWins: 0,
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

  /* ─────────────── acciones administrativas ─────────────── */

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

  private async actionStart(request: Request, state: UnoState): Promise<Response> {
    if (state.status !== 'lobby') return jsonMsg({ error: 'La partida ya está iniciada' }, 409);
    if (activePlayers(state).length < 2) {
      return jsonMsg({ error: 'Se necesitan al menos 2 jugadores conectados' }, 409);
    }

    state.matchId = request.headers.get('X-Game-Match') || `${state.roomId}:${Date.now()}`;
    state.assignmentId = request.headers.get('X-Game-Assignment') || null;
    state.maxScore = Number(request.headers.get('X-Game-Max-Score') ?? 100) || 100;
    state.gradingMode =
      request.headers.get('X-Game-Grading-Mode') === 'formative' ? 'formative' : 'summative';

    const rawConfig = request.headers.get('X-Game-Config');
    if (rawConfig) {
      try {
        const parsed = JSON.parse(safeDecode(rawConfig)) as Partial<UnoConfig>;
        state.config = { ...DEFAULT_CONFIG, ...parsed, weights: { ...DEFAULT_CONFIG.weights, ...(parsed.weights ?? {}) } };
      } catch {
        state.config = { ...DEFAULT_CONFIG };
      }
    }
    state.roundsToWin = Math.max(1, Math.min(3, Number(state.config.roundsToWin) || 1));
    state.roundMaxMinutes = Math.max(1, Number(state.config.roundMaxMinutes) || 15);

    await this.loadQuestionPool(state.assignmentId);
    if (state.assignmentId && this.poolCount() === 0) {
      return jsonMsg({ error: 'No hay preguntas disponibles para esta tarea' }, 409);
    }

    this.startGame(state, 1);
    return jsonMsg({ ok: true }, 200);
  }

  private actionCancel(state: UnoState): Response {
    const remaining = state.players.filter((p) => p.role === 'player' && p.connected).length;
    if (remaining > 1) {
      return jsonMsg({ error: 'Solo puedes cerrar la sala cuando quede un jugador' }, 409);
    }
    state.status = 'finished';
    state.turnDeadline = null;
    state.questionDeadline = null;
    this.saveState(state);
    this.broadcast({ type: 'error', seq: state.seq, code: 'room_cancelled' });
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

  private removePlayer(state: UnoState, dni: string) {
    if (state.status === 'lobby') {
      state.players = state.players.filter((p) => p.dni !== dni);
    } else {
      const player = state.players.find((p) => p.dni === dni);
      if (player) {
        player.connected = false;
        if (player.hand.length) {
          state.deck.push(...player.hand);
          player.hand = [];
        }
      }
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

  /* ─────────────── banco de preguntas ─────────────── */

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

  private takeQuestion(difficulty: UnoDifficulty): PendingQuestion | null {
    const pick = (d: UnoDifficulty | null) => {
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

    const order: UnoDifficulty[] =
      difficulty === 'easy'
        ? ['easy', 'medium', 'hard']
        : difficulty === 'medium'
          ? ['medium', 'easy', 'hard']
          : ['hard', 'medium', 'easy'];

    let row = order.map((d) => pick(d)).find((r) => r) ?? null;
    if (!row) {
      // Banco agotado: se reciclan las preguntas usadas una vez.
      this.ctx.storage.sql.exec('UPDATE question_pool SET used = 0');
      row = order.map((d) => pick(d)).find((r) => r) ?? null;
    }
    if (!row) return null;

    this.ctx.storage.sql.exec('UPDATE question_pool SET used = 1 WHERE id = ?', row.id);
    try {
      const payload = JSON.parse(row.payload) as QuestionPayload;
      if (!Array.isArray(payload.options) || payload.options.length !== 4) return null;
      return this.shuffleOptions({
        id: row.id,
        difficulty,
        question: String(payload.question ?? ''),
        options: payload.options.map((o) => String(o)),
        answer: Number(payload.answer ?? 0),
        explanation: String(payload.explanation ?? ''),
        concept: String(payload.concept ?? ''),
      });
    } catch {
      return null;
    }
  }

  private shuffleOptions(question: PendingQuestion): PendingQuestion {
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

  /* ─────────────── mensajes de WebSocket ─────────────── */

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
      case 'pick_seat':
        this.handlePickSeat(state, attachment.dni, Number(msg.seat));
        return;
      case 'play':
        this.handlePlay(state, attachment.dni, String(msg.cardId ?? ''), msg.color ? String(msg.color) : undefined);
        return;
      case 'draw':
        this.handleDraw(state, attachment.dni);
        return;
      case 'pass':
        this.handlePass(state, attachment.dni);
        return;
      case 'answer':
        this.handleAnswer(state, attachment.dni, String(msg.id ?? ''), Number(msg.choice));
        return;
      case 'chat':
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

  /* ─────────────── arranque y reparto ─────────────── */

  private startGame(state: UnoState, round: number) {
    state.round = round;
    state.actionsThisRound = 0;
    state.roundStartedAt = Date.now();
    state.direction = 1;
    state.drawnThisTurn = false;
    state.questionEvent = null;
    state.pendingQuestions = {};
    state.answers = {};
    state.questionDeadline = null;
    resetAnswered(state);

    for (const player of state.players) {
      player.hand = [];
      player.points = 0;
      if (round === 1) player.roundWins = 0;
    }
    state.deck = shuffle(createDeck());
    state.discard = [];

    const active = activePlayers(state);
    for (const player of active) {
      for (let i = 0; i < HAND_SIZE; i++) {
        const card = state.deck.shift();
        if (!card) break;
        player.hand.push(card);
      }
    }

    let first = state.deck.shift() ?? null;
    let guard = 0;
    while (first && !isNumberCard(first) && guard < 200) {
      state.deck.push(first);
      first = state.deck.shift() ?? null;
      guard++;
    }
    if (first) {
      state.discard.push(first);
      state.activeColor = (first.color ?? 'red') as UnoColor;
    }

    state.status = 'playing';
    if (active.length) {
      const starter = active[randomInt(active.length)];
      state.turnIndex = Math.max(0, state.players.indexOf(starter));
    } else {
      state.turnIndex = 0;
    }
    state.turnDeadline = Date.now() + state.turnSeconds * 1000;

    this.saveState(state);
    this.broadcastSnapshots(state);
    this.broadcast({
      type: 'turn_started',
      seq: state.seq,
      dni: this.publicId(state, state.players[state.turnIndex].dni),
      deadline: state.turnDeadline,
      direction: state.direction,
    });
    this.broadcastRoomState(state);
    this.ensureAlarm(state);
  }

  private broadcastSnapshots(state: UnoState) {
    for (const ws of this.ctx.getWebSockets()) {
      const attachment = ws.deserializeAttachment() as WsAttachment | null;
      if (!attachment) continue;
      this.send(ws, this.snapshotFor(state, attachment.dni, attachment.canManage));
    }
  }

  private handleReady(state: UnoState, dni: string) {
    const player = state.players.find((p) => p.dni === dni);
    if (!player || player.role !== 'player' || state.status !== 'lobby') return;
    player.ready = !player.ready;
    this.saveState(state);
    this.broadcastRoomState(state);
  }

  private handlePickSeat(state: UnoState, dni: string, seat: number) {
    if (state.status !== 'lobby') return this.sendError(dni, state, 'not_lobby');
    const player = state.players.find((p) => p.dni === dni);
    if (!player || player.role !== 'player') return;
    if (!Number.isInteger(seat) || seat < 0 || seat >= state.maxPlayers) {
      return this.sendError(dni, state, 'bad_seat');
    }
    if (state.players.some((p) => p.role === 'player' && p.dni !== dni && p.seat === seat)) {
      return this.sendError(dni, state, 'seat_taken');
    }
    player.seat = seat;
    this.saveState(state);
    this.broadcastRoomState(state);
  }

  /* ─────────────── turno ─────────────── */

  private handlePlay(state: UnoState, dni: string, cardId: string, declaredColor?: string) {
    if (state.status !== 'playing') return this.sendError(dni, state, 'not_playing');
    const current = state.players[state.turnIndex];
    if (!current || current.dni !== dni) return this.sendError(dni, state, 'not_your_turn');

    const player = state.players.find((p) => p.dni === dni);
    if (!player) return;

    // Antes de jugar se exige legalidad; el motor la vuelve a validar.
    const card = player.hand.find((c) => c.id === cardId);
    if (card && !isLegalPlay(card, topCard(state), state.activeColor)) {
      return this.sendError(dni, state, 'illegal_play');
    }

    const result = playCard(state, dni, cardId, declaredColor);
    if (result.error || !result.card) return this.sendError(dni, state, result.error ?? 'illegal_play');
    const played = result.card;

    const activeCount = activePlayers(state).length;
    const skip = played.value === 'skip' || (played.value === 'reverse' && activeCount === 2);
    const reversed = played.value === 'reverse';
    if (reversed) state.direction = state.direction === 1 ? -1 : 1;

    this.saveState(state);

    // Fin de ronda: la última carta se ve pero sus efectos no se resuelven.
    if (player.hand.length === 0) {
      this.broadcast({
        type: 'card_played',
        seq: state.seq,
        dni: this.publicId(state, dni),
        card: played,
        activeColor: state.activeColor,
        handCount: 0,
      });
      this.awardRoundWin(state, player);
      return;
    }

    this.broadcast({
      type: 'card_played',
      seq: state.seq,
      dni: this.publicId(state, dni),
      card: played,
      activeColor: state.activeColor,
      handCount: player.hand.length,
    });
    if (reversed) {
      this.broadcast({ type: 'direction_changed', seq: state.seq, direction: state.direction });
    }

    if (played.value === 'plus2' || played.value === 'plus4') {
      const kind = played.value === 'plus2' ? 'plus2' : 'plus4';
      const difficulty: UnoDifficulty = played.value === 'plus2' ? 'easy' : 'hard';
      const drawCount = played.value === 'plus2' ? 2 : 4;
      const others = activePlayers(state).filter((p) => p.dni !== dni);
      const targets =
        state.config.plusScope === 'next'
          ? others.slice(0, 1).map((p) => p.dni)
          : others.map((p) => p.dni);
      this.openQuestionEvent(state, {
        kind,
        sourceDni: dni,
        targets,
        drawCount: drawCount as 2 | 4,
        difficulty,
      });
      return;
    }

    this.advanceAfterCard(state, skip);
  }

  private handleDraw(state: UnoState, dni: string) {
    if (state.status !== 'playing') return this.sendError(dni, state, 'not_playing');
    const current = state.players[state.turnIndex];
    if (!current || current.dni !== dni) return this.sendError(dni, state, 'not_your_turn');
    // Segundo "draw" en el mismo turno equivale a plantarse.
    if (state.drawnThisTurn) return this.handlePass(state, dni);

    const player = state.players.find((p) => p.dni === dni);
    if (!player) return;

    const hand = player.hand;
    const legalBefore = legalCardIds(hand, topCard(state), state.activeColor);
    // Si ya tenía jugada legal, no puede robar.
    if (legalBefore.length > 0) return this.sendError(dni, state, 'must_play');

    const drawn = drawCards(state, player, 1);
    state.drawnThisTurn = true;
    state.turnDeadline = Date.now() + state.turnSeconds * 1000;
    this.saveState(state);

    const card = drawn[0] ?? null;
    this.sendTo(dni, {
      type: 'drew_card',
      seq: state.seq,
      dni: this.publicId(state, dni),
      card,
      handCount: player.hand.length,
    });
    this.broadcast({
      type: 'drew_card',
      seq: state.seq,
      dni: this.publicId(state, dni),
      handCount: player.hand.length,
    });

    if (!card) {
      this.advanceAfterCard(state, false);
      return;
    }

    const legalNow = legalCardIds(player.hand, topCard(state), state.activeColor);
    if (legalNow.length === 0) {
      this.advanceAfterCard(state, false);
      return;
    }
    // La carta robada es legal: puede jugarla o plantarse (segundo draw/pass).
    this.ensureAlarm(state);
  }

  private handlePass(state: UnoState, dni: string) {
    if (state.status !== 'playing') return this.sendError(dni, state, 'not_playing');
    const current = state.players[state.turnIndex];
    if (!current || current.dni !== dni) return this.sendError(dni, state, 'not_your_turn');
    this.advanceAfterCard(state, false);
  }

  /* ─────────────── preguntas ─────────────── */

  private openQuestionEvent(
    state: UnoState,
    event: {
      kind: 'plus2' | 'plus4' | 'periodic';
      sourceDni: string | null;
      targets: string[];
      drawCount: 1 | 2 | 4;
      difficulty: UnoDifficulty;
    }
  ) {
    const deadline = Date.now() + QUESTION_SECONDS * 1000;
    state.questionEvent = { ...event, deadline };
    state.pendingQuestions = {};
    state.answers = {};
    state.questionDeadline = deadline;
    state.turnDeadline = null;
    state.status = 'question';
    for (const player of state.players) player.answered = false;

    const weight = state.config.weights[event.difficulty] ?? 1;
    for (const dni of event.targets) {
      const question = this.takeQuestion(event.difficulty);
      if (!question) continue;
      state.pendingQuestions[dni] = question;
      const stat = (state.quizStats[dni] ??= { earned: 0, possible: 0, correct: 0, total: 0 });
      stat.possible += weight;
      stat.total += 1;
    }

    if (Object.keys(state.pendingQuestions).length === 0) {
      state.questionEvent = null;
      state.questionDeadline = null;
      this.broadcast({ type: 'error', seq: state.seq, code: 'no_questions' });
      this.continueAfterEvent(state, event.kind);
      return;
    }

    this.saveState(state);
    this.broadcast({
      type: 'question_phase_started',
      seq: state.seq,
      kind: event.kind,
      sourceDni: event.sourceDni ? this.publicId(state, event.sourceDni) : null,
      deadline,
      drawCount: event.drawCount,
      difficulty: event.difficulty,
    });

    for (const dni of event.targets) {
      const question = state.pendingQuestions[dni];
      if (!question) continue;
      this.sendTo(dni, {
        type: 'question',
        seq: state.seq,
        id: question.id,
        question: question.question,
        options: question.options,
        difficulty: question.difficulty,
        drawCount: event.drawCount,
        deadline,
      });
    }

    this.broadcastRoomState(state);
    this.ensureAlarm(state);
  }

  private handleAnswer(state: UnoState, dni: string, id: string, choice: number) {
    const event = state.questionEvent;
    if (state.status !== 'question' || !event) return this.sendError(dni, state, 'not_question_phase');
    if (!event.targets.includes(dni)) return this.sendError(dni, state, 'not_your_question');
    const question = state.pendingQuestions[dni];
    if (!question || question.id !== id) return this.sendError(dni, state, 'not_your_question');
    if (state.answers[dni] !== undefined) return this.sendError(dni, state, 'already_answered');
    if (!Number.isInteger(choice) || choice < 0 || choice > 3) {
      return this.sendError(dni, state, 'bad_choice');
    }

    state.answers[dni] = choice;
    const player = state.players.find((p) => p.dni === dni);
    const correct = choice === question.answer;
    if (player) {
      player.answered = true;
      if (correct) {
        const weight = state.config.weights[question.difficulty] ?? 1;
        player.points += weight;
        const stat = (state.quizStats[dni] ??= { earned: 0, possible: 0, correct: 0, total: 0 });
        stat.earned += weight;
        stat.correct += 1;
      }
    }

    if (!correct && question.concept) {
      void recordConceptErrors(this.env, state.assignmentId, dni, 'uno', [question.concept]);
    }

    this.saveState(state);
    this.sendTo(dni, {
      type: 'question_result',
      seq: state.seq,
      id: question.id,
      correct,
      correctIndex: question.answer,
      correctOption: question.options[question.answer] ?? '',
      explanation: question.explanation,
      concept: question.concept,
      drawCount: event.drawCount,
    });
    this.broadcastRoomState(state);

    if (event.targets.every((target) => state.answers[target] !== undefined)) {
      this.resolveQuestionEvent(state);
    }
  }

  private resolveQuestionEvent(state: UnoState) {
    const event = state.questionEvent;
    if (!event) return;

    for (const dni of event.targets) {
      const question = state.pendingQuestions[dni];
      if (!question) continue;
      const choice = state.answers[dni];
      const correct = choice !== undefined && choice === question.answer;
      const player = state.players.find((p) => p.dni === dni);

      if (!correct) {
        this.addReviewItem(state, dni, question, choice ?? null);
        if (player) {
          drawCards(state, player, event.drawCount);
          this.sendTo(dni, {
            type: 'hand_update',
            seq: state.seq,
            hand: player.hand,
          });
          this.sendTo(dni, {
            type: 'penalty_applied',
            seq: state.seq,
            dni: this.publicId(state, dni),
            drawCount: event.drawCount,
            handCount: player.hand.length,
          });
          this.broadcast({
            type: 'penalty_applied',
            seq: state.seq,
            dni: this.publicId(state, dni),
            drawCount: event.drawCount,
            handCount: player.hand.length,
          });
        }
      }

      if (choice === undefined) {
        this.sendTo(dni, {
          type: 'question_result',
          seq: state.seq,
          id: question.id,
          correct: false,
          correctIndex: question.answer,
          correctOption: question.options[question.answer] ?? '',
          explanation: question.explanation,
          concept: question.concept,
          timeout: true,
          drawCount: event.drawCount,
        });
        if (question.concept) {
          void recordConceptErrors(this.env, state.assignmentId, dni, 'uno', [question.concept]);
        }
      }
    }

    const kind = event.kind;
    state.pendingQuestions = {};
    state.answers = {};
    state.questionEvent = null;
    state.questionDeadline = null;
    this.broadcast({ type: 'question_phase_end', seq: state.seq, kind });
    this.continueAfterEvent(state, kind);
  }

  private continueAfterEvent(state: UnoState, kind: 'plus2' | 'plus4' | 'periodic') {
    if (kind === 'periodic') {
      beginNextTurn(state);
      this.saveState(state);
      this.broadcast({
        type: 'turn_started',
        seq: state.seq,
        dni: this.publicId(state, state.players[state.turnIndex]?.dni ?? ''),
        deadline: state.turnDeadline,
        direction: state.direction,
      });
      this.broadcastRoomState(state);
      this.ensureAlarm(state);
      return;
    }
    this.advanceAfterCard(state, false);
  }

  private addReviewItem(
    state: UnoState,
    dni: string,
    question: PendingQuestion,
    chosen: number | null
  ) {
    const item: ReviewItem = {
      question: question.question,
      options: question.options,
      correctIndex: question.answer,
      chosen,
      explanation: question.explanation,
      concept: question.concept,
    };
    state.review[dni] = [...(state.review[dni] ?? []), item];
  }

  /* ─────────────── avance de turno y ronda ─────────────── */

  private advanceAfterCard(state: UnoState, skip: boolean) {
    advanceTurn(state, skip);
    state.actionsThisRound++;

    const count = activePlayers(state).length;
    let roundClosed = false;
    if (state.actionsThisRound >= Math.max(1, count)) {
      state.actionsThisRound = 0;
      state.round++;
      state.roundStartedAt = Date.now();
      roundClosed = true;
    }

    if (roundClosed) {
      this.broadcast({ type: 'round_completed', seq: state.seq, round: state.round });
      if (state.round % 2 === 0) {
        const targets = activePlayers(state).map((p) => p.dni);
        this.openQuestionEvent(state, {
          kind: 'periodic',
          sourceDni: null,
          targets,
          drawCount: 1,
          difficulty: 'medium',
        });
        return;
      }
    }

    beginNextTurn(state);
    this.saveState(state);
    this.broadcast({
      type: 'turn_started',
      seq: state.seq,
      dni: this.publicId(state, state.players[state.turnIndex]?.dni ?? ''),
      deadline: state.turnDeadline,
      direction: state.direction,
    });
    this.broadcastRoomState(state);
    this.ensureAlarm(state);
  }

  private awardRoundWin(state: UnoState, player: UnoPlayer) {
    player.roundWins += 1;
    if (player.roundWins >= state.roundsToWin) {
      this.finishGame(state, player.dni);
      return;
    }
    // Mejor de N: se reparte otra ronda y empieza quien ganó la anterior.
    this.startGame(state, state.round + 1);
  }

  /* ─────────────── alarmas ─────────────── */

  async alarm() {
    const state = this.loadState();
    if (!state || state.status === 'lobby' || state.status === 'finished') return;

    if (state.status === 'question') {
      if (state.questionDeadline && Date.now() >= state.questionDeadline) {
        this.broadcast({ type: 'error', seq: state.seq, code: 'question_timeout' });
        this.resolveQuestionEvent(state);
      } else {
        this.ensureAlarm(state);
      }
      return;
    }

    if (Date.now() - state.roundStartedAt > state.roundMaxMinutes * 60_000) {
      const ranking = rankPlayers(state);
      this.finishGame(state, ranking[0]?.dni ?? null, true);
      return;
    }

    if (state.turnDeadline && Date.now() >= state.turnDeadline) {
      const current = state.players[state.turnIndex];
      if (current) {
        if (!state.drawnThisTurn) {
          const drawn = drawCards(state, current, 1);
          this.broadcast({
            type: 'drew_card',
            seq: state.seq,
            dni: this.publicId(state, current.dni),
            handCount: current.hand.length,
          });
          this.sendTo(current.dni, {
            type: 'drew_card',
            seq: state.seq,
            dni: this.publicId(state, current.dni),
            card: drawn[0] ?? null,
            handCount: current.hand.length,
          });
        }
      }
      this.broadcast({ type: 'error', seq: state.seq, code: 'turn_timeout' });
      this.advanceAfterCard(state, false);
      return;
    }

    this.ensureAlarm(state);
  }

  /* ─────────────── fin de partida y nota ─────────────── */

  private finishGame(state: UnoState, winnerDni: string | null, byTime = false) {
    state.status = 'finished';
    state.winnerDni = winnerDni;
    state.turnDeadline = null;
    state.questionDeadline = null;
    state.questionEvent = null;
    state.pendingQuestions = {};
    state.answers = {};
    this.saveState(state);

    const ordered = byTime || !winnerDni
      ? rankPlayers(state)
      : [
          ...activePlayers(state).sort((a, b) => {
            if (a.dni === winnerDni) return -1;
            if (b.dni === winnerDni) return 1;
            if (a.hand.length !== b.hand.length) return a.hand.length - b.hand.length;
            return a.seat - b.seat;
          }),
        ];
    const scores = computeFinalScores(state, ordered, state.maxScore);
    const publicWinner = winnerDni ? this.publicId(state, winnerDni) : '';

    for (const ws of this.ctx.getWebSockets()) {
      const attachment = ws.deserializeAttachment() as WsAttachment | null;
      if (!attachment) continue;
      const mine = scores.find((s) => s.dni === attachment.dni) ?? null;
      this.send(ws, {
        type: 'game_over',
        seq: state.seq,
        winner: publicWinner,
        review: state.review[attachment.dni] ?? [],
        stats: mine
          ? {
              rank: mine.rank,
              handCount: mine.handCount,
              quizPercent: Math.round(mine.quizPercent),
              placementPercent: Math.round(mine.placementPercent),
              finalPercent: mine.finalPercent,
              score: mine.score,
            }
          : null,
        standings: scores.map((s) => ({
          id: this.publicId(state, s.dni),
          rank: s.rank,
          finalPercent: s.finalPercent,
        })),
      });
    }
    this.broadcastRoomState(state);
    void this.ctx.storage.deleteAlarm();
    void this.persistResults(state, scores);
  }

  private async persistResults(
    state: UnoState,
    scores: ReturnType<typeof computeFinalScores>
  ) {
    try {
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
          JSON.stringify({
            round: state.round,
            players: scores.map((s) => ({
              rank: s.rank,
              handCount: s.handCount,
              quizPercent: Math.round(s.quizPercent),
              finalPercent: s.finalPercent,
            })),
          })
        )
        .run();

      await this.env.MIRAI_AI_DB.prepare('DELETE FROM game_results WHERE match_id = ?')
        .bind(matchId)
        .run();
      for (const entry of scores) {
        await this.env.MIRAI_AI_DB.prepare(
          `INSERT INTO game_results (match_id, user_dni, position, score, xp, created_at)
           VALUES (?, ?, ?, ?, 0, ?)
           ON CONFLICT(match_id, user_dni) DO UPDATE SET position = excluded.position, score = excluded.score`
        )
          .bind(matchId, entry.dni, entry.rank, Math.round(entry.finalPercent), now)
          .run();
      }

      await this.env.MIRAI_AI_DB.prepare("UPDATE game_rooms SET status = 'finished' WHERE id = ?")
        .bind(state.roomId)
        .run();

      if (state.assignmentId) {
        await this.applyGrades(state, scores);
      }
    } catch (error: any) {
      console.warn('UnoRoom.persistResults: D1 no disponible —', error.message);
    }
  }

  private async applyGrades(state: UnoState, scores: ReturnType<typeof computeFinalScores>) {
    const formative = state.gradingMode === 'formative';
    for (const entry of scores) {
      const percent = entry.finalPercent;
      const score = Math.round((state.maxScore * percent) / 100);

      if (state.assignmentId) {
        await recordTaskModeResult(
          this.env,
          state.assignmentId,
          entry.dni,
          'uno',
          formative ? 0 : score,
          state.maxScore,
          'game://uno',
          {
            general: `Uno completado: ${Math.round(entry.quizPercent)}% de aciertos y posición ${entry.rank}.`,
          }
        );
      }

      const existing = await this.env.MIRAI_AI_DB.prepare(
        'SELECT id, score, file_url FROM submissions WHERE assignment_id = ? AND user_dni = ?'
      )
        .bind(state.assignmentId, entry.dni)
        .first<any>();

      if (existing && !String(existing.file_url ?? '').startsWith('game://')) continue;
      if (!formative && existing && Number(existing.score ?? 0) >= score) continue;

      const feedback = JSON.stringify({
        source: 'uno',
        formative,
        percent,
        quiz_percent: Math.round(entry.quizPercent),
        placement_percent: Math.round(entry.placementPercent),
        max_score: state.maxScore,
        round: state.round,
      });

      await this.env.MIRAI_AI_DB.prepare(
        `INSERT INTO submissions
           (id, assignment_id, user_dni, file_url, status, score, graded_at, feedback, attempt_type)
         VALUES (?, ?, ?, 'game://uno', 'graded', ?, datetime('now'), ?, 'uno')
         ON CONFLICT(assignment_id, user_dni) DO UPDATE SET
           file_url = 'game://uno', status = 'graded', score = excluded.score,
           graded_at = excluded.graded_at, feedback = excluded.feedback, attempt_type = 'uno'`
      )
        .bind(crypto.randomUUID(), state.assignmentId, entry.dni, formative ? null : score, feedback)
        .run();
    }
  }

  /* ─────────────── utilidades de difusión ─────────────── */

  private publicId(state: UnoState, dni: string): string {
    const index = state.players.findIndex((p) => p.dni === dni);
    return index >= 0 ? `p${index}` : '';
  }

  private snapshotFor(state: UnoState, dni: string, canManage: boolean) {
    const player = state.players.find((p) => p.dni === dni);
    const question = state.pendingQuestions[dni];
    const hand: UnoCard[] = player?.hand ?? [];
    const legal = player ? legalCardIds(hand, topCard(state), state.activeColor) : [];
    return {
      type: 'state_snapshot',
      seq: state.seq,
      you: this.publicId(state, dni),
      youRole: player?.role ?? 'spectator',
      youManage: canManage,
      hand,
      legal,
      review: state.status === 'finished' ? state.review[dni] ?? [] : undefined,
      question: question
        ? {
            id: question.id,
            question: question.question,
            options: question.options,
            difficulty: question.difficulty,
            drawCount: state.questionEvent?.drawCount ?? 1,
            deadline: state.questionDeadline,
            answered: state.answers[dni] !== undefined,
          }
        : null,
      state: publicState(state),
    };
  }

  private send(ws: WebSocket, message: Record<string, unknown> & { type: string; seq: number }) {
    try {
      ws.send(JSON.stringify(message));
    } catch {
      /* socket muerto */
    }
  }

  private sendTo(dni: string, message: Record<string, unknown> & { type: string; seq: number }) {
    for (const ws of this.ctx.getWebSockets(`user:${dni}`)) {
      this.send(ws, message);
    }
  }

  private sendError(dni: string, state: UnoState, code: string) {
    this.sendTo(dni, { type: 'error', seq: state.seq, code });
  }

  private broadcast(message: Record<string, unknown> & { type: string; seq: number }) {
    const payload = JSON.stringify(message);
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(payload);
      } catch {
        /* socket muerto */
      }
    }
  }

  private broadcastRoomState(state: UnoState) {
    this.broadcast({ type: 'room_state', seq: state.seq, state: publicState(state) });
  }
}
