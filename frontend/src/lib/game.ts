// Cliente del WebSocket de una sala multijugador.
//
// El servidor (Durable Object GameRoom) es la autoridad: aquí solo se envían
// intenciones (ready/roll/move) y se dibuja el estado recibido. Al reconectar,
// el servidor manda un state_snapshot completo, así que no hay que reproducir
// deltas ni hacer polling (multijugador.md §4.3 y §8.2).

export type GameStatus = 'lobby' | 'playing' | 'question' | 'finished';
export type GameColor = 'red' | 'green' | 'yellow' | 'blue';
export type Difficulty = 'easy' | 'hard';

export interface GamePlayer {
  /** Identificador público (p0, p1...); nunca el DNI. */
  id: string;
  nickname: string;
  role: 'player' | 'spectator';
  color: GameColor | null;
  ready: boolean;
  connected: boolean;
  /** -1 = en base; 0..56 = recorrido; 56 = meta. */
  tokens: number[];
  rolls: number;
  hitSpecial: boolean;
  /** Puntos en % de la nota (puede ser negativo). */
  points: number;
  answered: boolean;
}

export interface GameState {
  roomId: string;
  code: string;
  sectionId: string | null;
  maxPlayers: number;
  turnSeconds: number;
  answerSeconds?: number;
  status: GameStatus;
  players: GamePlayer[];
  turnIndex: number;
  dice: number | null;
  seq: number;
  version: number;
  turnDeadline: number | null;
  questionDeadline: number | null;
  cycle: number;
  specialCells: number[];
  winnerId: string | null;
}

/** Pregunta que solo ve el jugador al que le toca. */
export interface PlayerQuestion {
  id: string;
  question: string;
  options: string[];
  difficulty: Difficulty;
  percent: number;
  deadline: number | null;
  answered?: boolean;
}

export interface GameMessage {
  type: string;
  seq: number;
  state?: GameState;
  you?: string;
  youRole?: 'player' | 'spectator';
  dni?: string;
  dice?: number;
  legal?: number[];
  token?: number;
  winner?: string;
  code?: string;
  cycle?: number;
  cells?: number[];
  deadline?: number;
  question?: PlayerQuestion | string | null;
  id?: string;
  options?: string[];
  difficulty?: Difficulty;
  percent?: number;
  answered?: boolean;
  correct?: boolean;
  correctIndex?: number;
  delta?: number;
  total?: number;
  timeout?: boolean;
  [key: string]: unknown;
}

export type SocketStatus = 'connecting' | 'open' | 'closed' | 'reconnecting' | 'error';

export interface GameSocketHandlers {
  onMessage: (message: GameMessage) => void;
  onStatus: (status: SocketStatus, attempt: number) => void;
}

/** 4001 conexión duplicada, 4002 sin identidad, 4003 sala cerrada. */
const TERMINAL_CLOSE_CODES = new Set([4001, 4002, 4003]);
const MAX_ATTEMPTS = 6;

export class GameSocket {
  private ws: WebSocket | null = null;
  private attempt = 0;
  private timer: number | null = null;
  private stopped = false;
  private readonly url: string;

  constructor(
    private readonly code: string,
    private readonly handlers: GameSocketHandlers,
  ) {
    const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
    this.url = `${scheme}://${window.location.host}/api/game/rooms/${encodeURIComponent(code)}/ws`;
  }

  connect(): void {
    if (this.stopped) return;
    this.handlers.onStatus(this.attempt === 0 ? 'connecting' : 'reconnecting', this.attempt);

    let socket: WebSocket;
    try {
      socket = new WebSocket(this.url);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws = socket;

    socket.onopen = () => {
      this.attempt = 0;
      this.handlers.onStatus('open', 0);
    };

    socket.onmessage = (event) => {
      if (typeof event.data !== 'string') return;
      try {
        this.handlers.onMessage(JSON.parse(event.data) as GameMessage);
      } catch {
        // Mensaje no JSON: se ignora.
      }
    };

    socket.onclose = (event) => {
      this.ws = null;
      if (this.stopped) return;
      // 1006 = el handshake no llegó a completarse (401/404/500 o DO caído).
      console.warn(`GameSocket cerrado con código ${event.code}${event.reason ? `: ${event.reason}` : ''}`);
      if (TERMINAL_CLOSE_CODES.has(event.code)) {
        this.stopped = true;
        this.handlers.onStatus('closed', 0);
        return;
      }
      this.scheduleReconnect();
    };

    socket.onerror = () => {
      // El cierre llega igualmente por onclose.
    };
  }

  send(message: Record<string, unknown>): boolean {
    if (this.ws?.readyState !== WebSocket.OPEN) return false;
    this.ws.send(JSON.stringify(message));
    return true;
  }

  close(): void {
    this.stopped = true;
    if (this.timer !== null) {
      window.clearTimeout(this.timer);
      this.timer = null;
    }
    this.ws?.close(1000, 'Salida del jugador');
    this.ws = null;
    this.handlers.onStatus('closed', 0);
  }

  private scheduleReconnect(): void {
    if (this.stopped) return;
    if (this.attempt >= MAX_ATTEMPTS) {
      this.stopped = true;
      this.handlers.onStatus('error', this.attempt);
      return;
    }
    // Backoff exponencial con jitter: ~1s, 2s, 4s, 8s, 16s, 30s.
    const base = Math.min(30_000, 1000 * 2 ** this.attempt);
    const delay = base + Math.floor(Math.random() * 400);
    this.attempt += 1;
    this.handlers.onStatus('reconnecting', this.attempt);
    this.timer = window.setTimeout(() => {
      this.timer = null;
      this.connect();
    }, delay);
  }
}

export const LUDO_PATH_LEN = 56;

export function tokenPercent(position: number): number {
  if (position < 0) return 0;
  return Math.min(100, (position / LUDO_PATH_LEN) * 100);
}
