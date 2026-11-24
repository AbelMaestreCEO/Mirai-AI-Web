/* ============================================
   MIRAI AI - Motor puro del Uno-like educativo
   Sin dependencias de `cloudflare:workers`: baraja, legalidad y avance de
   turnos se pueden probar de forma aislada (uno-like.md §5.3 y §10).

   El Durable Object UnoRoom es la única autoridad; este módulo solo modela
   las reglas y muta el estado recibido.
   ============================================ */

export const UNO_COLORS = ['azul', 'celeste', 'rosa', 'verde'] as const;
export type UnoColor = (typeof UNO_COLORS)[number];

export type UnoValue =
  | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9'
  | 'skip' | 'reverse' | 'plus2' | 'plus4';

export type UnoDifficulty = 'easy' | 'medium' | 'hard';
export type UnoStatus = 'lobby' | 'playing' | 'question' | 'finished';
export type Direction = 1 | -1;

export interface UnoCard {
  id: string;
  /** null solo en +4 (comodín sin color). */
  color: UnoColor | null;
  value: UnoValue;
}

export interface UnoPlayer {
  dni: string;
  nickname: string;
  role: 'player' | 'spectator';
  teamId: string | null;
  seat: number;
  ready: boolean;
  connected: boolean;
  hand: UnoCard[];
  /** Peso de quiz acertado (informativo). */
  points: number;
  answered: boolean;
  roundWins: number;
}

export interface PendingQuestion {
  id: string;
  difficulty: UnoDifficulty;
  question: string;
  options: string[];
  answer: number;
  explanation: string;
  concept: string;
}

export interface QuestionEvent {
  kind: 'plus2' | 'plus4' | 'periodic';
  sourceDni: string | null;
  targets: string[];
  drawCount: 1 | 2 | 4;
  difficulty: UnoDifficulty;
  deadline: number;
}

export interface ReviewItem {
  question: string;
  options: string[];
  correctIndex: number;
  chosen: number | null;
  explanation: string;
  concept: string;
}

export interface QuizStat {
  earned: number;
  possible: number;
  correct: number;
  total: number;
}

export interface UnoConfig {
  roundsToWin: number;
  roundMaxMinutes: number;
  plusScope: 'others' | 'next';
  teams: boolean;
  teamGrade: 'same' | 'individual';
  weights: Record<UnoDifficulty, number>;
  grading: 'quiz_placement';
}

export interface UnoState {
  roomId: string;
  code: string;
  sectionId: string | null;
  assignmentId: string | null;
  matchId: string | null;
  gameType: 'uno';
  maxScore: number;
  maxPlayers: number;
  turnSeconds: number;
  gradingMode: 'formative' | 'summative';
  status: UnoStatus;
  players: UnoPlayer[];
  deck: UnoCard[];
  discard: UnoCard[];
  activeColor: UnoColor;
  direction: Direction;
  turnIndex: number;
  turnDeadline: number | null;
  questionDeadline: number | null;
  round: number;
  actionsThisRound: number;
  roundStartedAt: number;
  roundsToWin: number;
  roundMaxMinutes: number;
  config: UnoConfig;
  drawnThisTurn: boolean;
  questionEvent: QuestionEvent | null;
  pendingQuestions: Record<string, PendingQuestion>;
  answers: Record<string, number>;
  quizStats: Record<string, QuizStat>;
  review: Record<string, ReviewItem[]>;
  winnerDni: string | null;
  seq: number;
  version: number;
}

export const DEFAULT_CONFIG: UnoConfig = {
  roundsToWin: 1,
  roundMaxMinutes: 15,
  plusScope: 'others',
  teams: false,
  teamGrade: 'same',
  weights: { easy: 1, medium: 2, hard: 3 },
  grading: 'quiz_placement',
};

export const ANSWER_SECONDS = 30;
export const HAND_SIZE = 7;

function randomInt(maxExclusive: number): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] % maxExclusive;
}

export function shuffle<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Baraja completa de 100 cartas (números 1-9, acciones y cuatro +4). */
export function createDeck(): UnoCard[] {
  const cards: UnoCard[] = [];
  for (const color of UNO_COLORS) {
    for (let n = 1; n <= 9; n++) {
      for (let copy = 0; copy < 2; copy++) {
        cards.push({ id: `${color}-${n}-${copy}`, color, value: String(n) as UnoValue });
      }
    }
    for (const value of ['skip', 'reverse', 'plus2'] as const) {
      for (let copy = 0; copy < 2; copy++) {
        cards.push({ id: `${color}-${value}-${copy}`, color, value });
      }
    }
  }
  for (let i = 0; i < 4; i++) {
    cards.push({ id: `wild-plus4-${i}`, color: null, value: 'plus4' });
  }
  return cards;
}

export function isNumberCard(card: UnoCard): boolean {
  return card.value !== 'skip' && card.value !== 'reverse' && card.value !== 'plus2' && card.value !== 'plus4';
}

export function isActive(player: UnoPlayer): boolean {
  return player.role === 'player';
}

export function activePlayers(state: UnoState): UnoPlayer[] {
  return state.players.filter(isActive);
}

export function topCard(state: UnoState): UnoCard | null {
  return state.discard[state.discard.length - 1] ?? null;
}

/** Una carta es legal por color, número, acción o por ser +4. */
export function isLegalPlay(card: UnoCard, top: UnoCard | null, activeColor: UnoColor): boolean {
  if (card.value === 'plus4') return true;
  if (!top) return true;
  if (card.color && card.color === activeColor) return true;
  if (top.color !== null && card.color === top.color) return true;
  if (card.value === top.value) return true;
  return false;
}

export function legalCardIds(hand: UnoCard[], top: UnoCard | null, activeColor: UnoColor): string[] {
  return hand.filter((card) => isLegalPlay(card, top, activeColor)).map((card) => card.id);
}

export function findCard(player: UnoPlayer, cardId: string): UnoCard | undefined {
  return player.hand.find((card) => card.id === cardId);
}

/** Rebaraja el descarte (menos la carta superior) cuando el mazo se agota. */
export function reshuffleDiscard(state: UnoState): void {
  if (state.deck.length > 0 || state.discard.length <= 1) return;
  const top = state.discard.pop()!;
  state.deck = shuffle(state.discard);
  state.discard = [top];
}

/** Roba `count` cartas para un jugador; nunca falla aunque el mazo esté vacío. */
export function drawCards(state: UnoState, player: UnoPlayer, count: number): UnoCard[] {
  const drawn: UnoCard[] = [];
  for (let i = 0; i < count; i++) {
    if (state.deck.length === 0) reshuffleDiscard(state);
    if (state.deck.length === 0) break;
    const card = state.deck.shift()!;
    player.hand.push(card);
    drawn.push(card);
  }
  return drawn;
}

/**
 * Aplica una jugada ya validada. Devuelve la carta jugada o un código de error.
 * No avanza el turno: UnoRoom decide el efecto (skip, reverse, preguntas).
 */
export function playCard(
  state: UnoState,
  dni: string,
  cardId: string,
  declaredColor?: string,
): { error?: string; card?: UnoCard } {
  if (state.status !== 'playing') return { error: 'not_playing' };
  const current = state.players[state.turnIndex];
  if (!current || current.dni !== dni) return { error: 'not_your_turn' };
  const player = state.players.find((p) => p.dni === dni);
  if (!player || player.role !== 'player') return { error: 'not_a_player' };

  const index = player.hand.findIndex((card) => card.id === cardId);
  if (index === -1) return { error: 'card_not_in_hand' };
  const card = player.hand[index];
  if (!isLegalPlay(card, topCard(state), state.activeColor)) return { error: 'illegal_play' };

  if (card.value === 'plus4') {
    if (!declaredColor || !(UNO_COLORS as readonly string[]).includes(declaredColor)) {
      return { error: 'bad_color' };
    }
    card.color = declaredColor as UnoColor;
  }

  player.hand.splice(index, 1);
  state.discard.push(card);
  state.activeColor = (card.color ?? state.activeColor) as UnoColor;
  return { card };
}

function nextActiveIndex(state: UnoState, from: number, step: number): number {
  const total = state.players.length;
  let idx = from;
  for (let i = 0; i < total; i++) {
    idx = (idx + step + total) % total;
    if (state.players[idx].role === 'player') return idx;
  }
  return from;
}

/**
 * Avanza el turno aplicando bloqueo y voltear giro.
 * Con dos jugadores, `reverse` equivale a `skip` (el mismo jugador repite).
 */
export function advanceTurn(state: UnoState, skipNext: boolean): void {
  const dir = state.direction;
  let idx = nextActiveIndex(state, state.turnIndex, dir);
  if (skipNext) idx = nextActiveIndex(state, idx, dir);
  state.turnIndex = idx;
  state.drawnThisTurn = false;
}

/** Índice del siguiente jugador activo sin mutar (para cálculos). */
export function upcomingIndex(state: UnoState, skipNext: boolean): number {
  const dir = state.direction;
  let idx = nextActiveIndex(state, state.turnIndex, dir);
  if (skipNext) idx = nextActiveIndex(state, idx, dir);
  return idx;
}

export function resetAnswered(state: UnoState): void {
  for (const player of state.players) player.answered = false;
}

export function beginNextTurn(state: UnoState): void {
  state.status = 'playing';
  state.drawnThisTurn = false;
  resetAnswered(state);
  state.turnDeadline = Date.now() + state.turnSeconds * 1000;
}

/** Puntos de quiz: 100 * peso acertado / peso servido. */
export function quizPercent(state: UnoState, dni: string): number {
  const stat = state.quizStats[dni];
  if (!stat || stat.possible <= 0) return 0;
  return Math.max(0, Math.min(100, (100 * stat.earned) / stat.possible));
}

export interface FinalScore {
  dni: string;
  rank: number;
  handCount: number;
  quizPercent: number;
  placementPercent: number;
  finalPercent: number;
  score: number;
}

/**
 * Calcula la nota final por jugador: 70 % quiz + 30 % posición (uno-like.md §3.9).
 * `order` es la lista de jugadores ya ordenada de mejor a peor.
 */
export function computeFinalScores(
  state: UnoState,
  order: UnoPlayer[],
  maxScore: number,
): FinalScore[] {
  const n = order.length;
  return order.map((player, index) => {
    const rank = index + 1;
    const quiz = quizPercent(state, player.dni);
    const placement = n <= 1 ? 100 : (100 * (n - rank)) / (n - 1);
    const finalPercent = Math.max(0, Math.min(100, Math.round(0.7 * quiz + 0.3 * placement)));
    return {
      dni: player.dni,
      rank,
      handCount: player.hand.length,
      quizPercent: quiz,
      placementPercent: placement,
      finalPercent,
      score: Math.round((maxScore * finalPercent) / 100),
    };
  });
}

/** Orden final: menos cartas primero; empate por mejor quiz y luego asiento. */
export function rankPlayers(state: UnoState): UnoPlayer[] {
  return [...activePlayers(state)].sort((a, b) => {
    if (a.hand.length !== b.hand.length) return a.hand.length - b.hand.length;
    const qa = quizPercent(state, a.dni);
    const qb = quizPercent(state, b.dni);
    if (qa !== qb) return qb - qa;
    return a.seat - b.seat;
  });
}
