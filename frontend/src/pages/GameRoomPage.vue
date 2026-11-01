<template>
  <header class="header">
    <MenuToggle />
    <div class="header-title">Partida</div>
  </header>

  <div class="room-page">
    <div class="room-top">
      <div>
        <h1 class="room-title">Sala <span class="code">{{ code }}</span></h1>
        <p v-if="state" class="muted small">
          {{ statusText }}
          · {{ playablePlayers.length }}/{{ state.maxPlayers }} jugadores
          <span v-if="state.cycle > 0" class="badge">Ciclo {{ state.cycle }}</span>
          <span v-if="youRole === 'spectator'" class="badge">Espectador</span>
        </p>
      </div>
      <div class="top-actions">
        <button class="btn-secondary" type="button" @click="copyCode">{{ copied ? 'Copiado' : 'Copiar código' }}</button>
        <button class="link-btn danger" type="button" @click="leaveRoom">Salir</button>
      </div>
    </div>

    <p v-if="connectionBanner" class="conn-banner" :class="`conn-${socketStatus}`" role="status">
      {{ connectionBanner }}
    </p>

    <p v-if="lastError" class="app-message app-message--error" role="alert">{{ lastError }}</p>
    <p v-if="notice" class="app-message app-message--success" role="status">{{ notice }}</p>

    <div v-if="!state" class="game-card muted" role="status">Conectando con la sala…</div>

    <template v-else>
      <section v-if="state.status === 'lobby'" class="game-card">
        <h2>Jugadores</h2>
        <ul class="player-list">
          <li v-for="p in state.players" :key="p.id" class="player-item">
            <span class="color-dot" :class="p.color ? `color-${p.color}` : 'color-none'" />
            <span class="player-name">
              {{ p.nickname }}
              <span v-if="p.id === you" class="you-badge">Tú</span>
              <span v-if="p.role === 'spectator'" class="muted small"> · espectador</span>
            </span>
            <span class="muted small">{{ p.connected ? 'conectado' : 'desconectado' }}</span>
            <span v-if="p.role === 'player'" class="ready-chip" :class="{ ready: p.ready }">
              {{ p.ready ? 'Listo' : 'Sin listo' }}
            </span>
          </li>
        </ul>
        <button v-if="youRole === 'player'" class="btn-primary" type="button" @click="toggleReady">
          {{ myPlayer?.ready ? 'Quitar listo' : 'Estoy listo' }}
        </button>
        <button
          v-if="youManage"
          class="btn-primary"
          type="button"
          :disabled="playablePlayers.length < 2 || starting"
          @click="startGame"
        >
          {{ starting ? 'Preparando preguntas…' : 'Iniciar partida' }}
        </button>
        <p v-if="youManage && playablePlayers.length < 2" class="muted small">
          Faltan jugadores: {{ playablePlayers.length }}/2 conectados en esta sala.
        </p>
        <p class="muted small">
          Se necesitan al menos 2 jugadores conectados. Quien creó la sala puede iniciarla desde aquí.
        </p>
      </section>

      <template v-else>
        <section class="game-card">
          <div class="turn-bar">
            <div class="turn-info">
              <template v-if="state.status === 'question'">
                <span class="muted small">Ronda de preguntas</span>
                <span v-if="answerLeft !== null" class="timer">{{ answerLeft }} s</span>
              </template>
              <template v-else>
                <span class="muted small">Turno</span>
                <strong>{{ currentPlayer?.nickname ?? '—' }}</strong>
                <span v-if="turnLeft !== null" class="timer">{{ turnLeft }} s</span>
              </template>
            </div>
            <div class="dice-area">
              <div class="dice" :class="{ rolling: canRoll, spinning: diceRolling }" aria-live="polite">
                {{ diceRolling ? diceFace : (state.dice ?? '·') }}
              </div>
              <button v-if="canRoll" class="btn-primary" type="button" @click="roll">Tirar dado</button>
              <span v-else-if="isMyTurn && state.dice !== null" class="muted small">Elige una ficha</span>
              <span v-else-if="state.status === 'question'" class="muted small">Responde tu pregunta</span>
              <span v-else class="muted small">Esperando turno…</span>
            </div>
          </div>

          <p class="muted small">
            Cada jugador tira 2 veces; después, todos responden su pregunta. Las casillas marcadas son
            especiales: dan pregunta difícil ({{ 20 }}% a favor o en contra).
          </p>

          <div class="ludo-players" role="list" aria-label="Jugadores">
            <div
              v-for="p in playablePlayers"
              :key="`info-${p.id}`"
              class="player-chip"
              :class="[`chip-${p.color ?? 'none'}`, { active: p.id === currentPlayer?.id }]"
              role="listitem"
            >
              <span class="color-dot" :class="p.color ? `color-${p.color}` : 'color-none'" />
              <span class="chip-name">
                {{ p.nickname }}
                <span v-if="p.id === you" class="you-badge">Tú</span>
              </span>
              <span v-if="!p.connected" class="muted small">desconectado</span>
              <span v-if="p.hitSpecial" class="special-chip" title="Cayó en casilla especial">★</span>
              <span class="chip-score">
                <strong>{{ p.points }}%</strong>
                <span class="muted small"> · tiradas {{ Math.min(p.rolls, 2) }}/2</span>
              </span>
            </div>
          </div>

          <div class="ludo-stage">
            <div class="ludo-board" role="group" aria-label="Tablero de ludo">
              <div v-for="cell in boardCells" :key="cell.key" class="cell" :class="cell.className" />
              <span
                v-for="marker in specialMarkers"
                :key="marker.key"
                class="special-marker"
                :class="`marker-${marker.color}`"
                :style="marker.style"
                aria-hidden="true"
              />
              <div class="center-star" aria-hidden="true">
                <span class="tri tri-top" />
                <span class="tri tri-right" />
                <span class="tri tri-bottom" />
                <span class="tri tri-left" />
              </div>
              <template v-for="p in playablePlayers" :key="p.id">
                <button
                  v-for="(pos, idx) in p.tokens"
                  :key="`piece-${p.id}-${idx}`"
                  class="piece"
                  :class="[`piece-${p.color ?? 'none'}`, { actionable: tokenClickable(p, idx), 'at-home': pos >= LUDO_PATH_LEN }]"
                  :style="pieceStyle(p, idx, pos)"
                  :disabled="!tokenClickable(p, idx)"
                  :aria-label="pieceLabel(p, idx, pos)"
                  type="button"
                  @click="sendMove(p, idx)"
                >
                  {{ idx + 1 }}
                </button>
              </template>
            </div>
          </div>
        </section>
      </template>

      <section v-if="state.status === 'finished'" class="game-card game-over" role="status">
        <h2>Partida terminada</h2>
        <p v-if="winnerName">Ganó <strong>{{ winnerName }}</strong> 🎉</p>
        <ul class="player-list">
          <li v-for="p in rankedPlayers" :key="p.id" class="player-item">
            <span class="color-dot" :class="p.color ? `color-${p.color}` : 'color-none'" />
            <span class="player-name">{{ p.nickname }}</span>
            <strong>{{ p.points }}%</strong>
          </li>
        </ul>
        <button class="btn-secondary" type="button" @click="leaveRoom">Volver al lobby</button>
      </section>
    </template>

    <!-- Pregunta personal: solo la ve el jugador al que le toca -->
    <div v-if="activeQuestion" class="question-overlay" role="dialog" aria-modal="true" aria-labelledby="q-title">
      <div class="question-card">
        <div class="question-head">
          <span class="q-badge" :class="activeQuestion.difficulty === 'hard' ? 'hard' : 'easy'">
            {{ activeQuestion.difficulty === 'hard' ? 'Difícil · 20%' : 'Fácil · 10%' }}
          </span>
          <span v-if="answerLeft !== null" class="timer">{{ answerLeft }} s</span>
        </div>
        <h2 id="q-title" class="question-text">{{ activeQuestion.question }}</h2>
        <div class="options">
          <button
            v-for="(option, i) in activeQuestion.options"
            :key="i"
            class="option-btn"
            type="button"
            :disabled="answering || questionResult !== null"
            @click="answer(activeQuestion, i)"
          >
            <span class="option-letter">{{ optionLetter(i) }}</span>
            <span>{{ option }}</span>
          </button>
        </div>
        <p v-if="questionResult" class="result-line" :class="questionResult.correct ? 'ok' : 'ko'">
          <template v-if="questionResult.correct">¡Correcto! +{{ questionResult.delta }}%</template>
          <template v-else-if="questionResult.timeout">Se acabó el tiempo. {{ questionResult.delta }}%</template>
          <template v-else>Incorrecto. {{ questionResult.delta }}%</template>
          · Total: <strong>{{ questionResult.total }}%</strong>
        </p>
        <p v-else class="muted small">Responde antes de que se acabe el tiempo; si no, cuenta como incorrecta.</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import MenuToggle from '@/components/MenuToggle.vue';
import { api } from '@/lib/api';
import {
  GameSocket,
  LUDO_PATH_LEN,
  type GameColor,
  type GameMessage,
  type GamePlayer,
  type GameState,
  type PlayerQuestion,
  type SocketStatus,
} from '@/lib/game';

interface BoardCell {
  r: number;
  c: number;
}

const BOARD_SIZE = 15;

// Circuito común de 52 casillas, en orden (sentido horario).
const RING: BoardCell[] = [
  { r: 6, c: 0 }, { r: 6, c: 1 }, { r: 6, c: 2 }, { r: 6, c: 3 }, { r: 6, c: 4 }, { r: 6, c: 5 },
  { r: 5, c: 6 }, { r: 4, c: 6 }, { r: 3, c: 6 }, { r: 2, c: 6 }, { r: 1, c: 6 }, { r: 0, c: 6 },
  { r: 0, c: 7 }, { r: 0, c: 8 },
  { r: 1, c: 8 }, { r: 2, c: 8 }, { r: 3, c: 8 }, { r: 4, c: 8 }, { r: 5, c: 8 },
  { r: 6, c: 9 }, { r: 6, c: 10 }, { r: 6, c: 11 }, { r: 6, c: 12 }, { r: 6, c: 13 }, { r: 6, c: 14 },
  { r: 7, c: 14 }, { r: 8, c: 14 },
  { r: 8, c: 13 }, { r: 8, c: 12 }, { r: 8, c: 11 }, { r: 8, c: 10 }, { r: 8, c: 9 },
  { r: 9, c: 8 }, { r: 10, c: 8 }, { r: 11, c: 8 }, { r: 12, c: 8 }, { r: 13, c: 8 }, { r: 14, c: 8 },
  { r: 14, c: 7 }, { r: 14, c: 6 },
  { r: 13, c: 6 }, { r: 12, c: 6 }, { r: 11, c: 6 }, { r: 10, c: 6 }, { r: 9, c: 6 },
  { r: 8, c: 5 }, { r: 8, c: 4 }, { r: 8, c: 3 }, { r: 8, c: 2 }, { r: 8, c: 1 }, { r: 8, c: 0 },
  { r: 7, c: 0 },
];

// Índice del circuito donde arranca cada color (una casilla cada ~13).
const START_INDEX: Record<GameColor, number> = {
  green: 2,
  yellow: 15,
  blue: 28,
  red: 41,
};

// Pasillo de meta (5 casillas), de la entrada hacia el centro.
const HOME_CELLS: Record<GameColor, BoardCell[]> = {
  green: [{ r: 7, c: 1 }, { r: 7, c: 2 }, { r: 7, c: 3 }, { r: 7, c: 4 }, { r: 7, c: 5 }],
  yellow: [{ r: 1, c: 7 }, { r: 2, c: 7 }, { r: 3, c: 7 }, { r: 4, c: 7 }, { r: 5, c: 7 }],
  blue: [{ r: 7, c: 13 }, { r: 7, c: 12 }, { r: 7, c: 11 }, { r: 7, c: 10 }, { r: 7, c: 9 }],
  red: [{ r: 13, c: 7 }, { r: 12, c: 7 }, { r: 11, c: 7 }, { r: 10, c: 7 }, { r: 9, c: 7 }],
};

// Casillas del patio interior (2×2) donde esperan las fichas.
const BASE_PATIO: Record<GameColor, BoardCell[]> = {
  green: [{ r: 2, c: 2 }, { r: 2, c: 3 }, { r: 3, c: 2 }, { r: 3, c: 3 }],
  yellow: [{ r: 2, c: 11 }, { r: 2, c: 12 }, { r: 3, c: 11 }, { r: 3, c: 12 }],
  red: [{ r: 11, c: 2 }, { r: 11, c: 3 }, { r: 12, c: 2 }, { r: 12, c: 3 }],
  blue: [{ r: 11, c: 11 }, { r: 11, c: 12 }, { r: 12, c: 11 }, { r: 12, c: 12 }],
};

function cellForColor(color: GameColor, pos: number): BoardCell | null {
  if (pos < 0) return null;
  if (pos <= 51) return RING[(START_INDEX[color] + pos) % 52] ?? null;
  return HOME_CELLS[color][Math.min(4, pos - 52)] ?? null;
}

function baseInfo(r: number, c: number, r0: number, c0: number, color: GameColor) {
  const rr = r - r0;
  const cc = c - c0;
  if (rr >= 1 && rr <= 4 && cc >= 1 && cc <= 4) {
    if (rr >= 2 && rr <= 3 && cc >= 2 && cc <= 3) return { type: 'patio', color };
    return { type: 'base', color };
  }
  return { type: 'void', color };
}

function cellInfo(r: number, c: number): { type: string; color?: GameColor } {
  if (r <= 5 && c <= 5) return baseInfo(r, c, 0, 0, 'green');
  if (r <= 5 && c >= 9) return baseInfo(r, c, 0, 9, 'yellow');
  if (r >= 9 && c <= 5) return baseInfo(r, c, 9, 0, 'red');
  if (r >= 9 && c >= 9) return baseInfo(r, c, 9, 9, 'blue');
  if (r >= 6 && r <= 8 && c >= 6 && c <= 8) return { type: 'center' };
  if (r === 7 && c >= 1 && c <= 5) return { type: 'home', color: 'green' };
  if (c === 7 && r >= 1 && r <= 5) return { type: 'home', color: 'yellow' };
  if (r === 7 && c >= 9 && c <= 13) return { type: 'home', color: 'blue' };
  if (c === 7 && r >= 9 && r <= 13) return { type: 'home', color: 'red' };
  if ((r >= 6 && r <= 8) || (c >= 6 && c <= 8)) return { type: 'track' };
  return { type: 'void' };
}

function buildBoard(): { key: string; className: string }[] {
  const cells: { key: string; className: string }[] = [];
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const info = cellInfo(r, c);
      cells.push({
        key: `c-${r}-${c}`,
        className: `cell cell-${info.type}${info.color ? ` color-${info.color}` : ''}`,
      });
    }
  }
  return cells;
}

function cellCenterStyle(cell: BoardCell): Record<string, string> {
  return {
    left: `${((cell.c + 0.5) / BOARD_SIZE) * 100}%`,
    top: `${((cell.r + 0.5) / BOARD_SIZE) * 100}%`,
  };
}

interface QuestionResult {
  correct: boolean;
  correctIndex: number;
  delta: number;
  total: number;
  timeout?: boolean;
}

const route = useRoute();
const router = useRouter();
const code = String(route.params.code ?? '').toUpperCase();

const state = ref<GameState | null>(null);
const you = ref('');
const youRole = ref<'player' | 'spectator'>('player');
const youManage = ref(false);
const starting = ref(false);
const socketStatus = ref<SocketStatus>('connecting');
const attempt = ref(0);
const lastError = ref('');
const notice = ref('');
const copied = ref(false);
const legal = ref<number[]>([]);
const activeQuestion = ref<PlayerQuestion | null>(null);
const questionResult = ref<QuestionResult | null>(null);
const answering = ref(false);
const now = ref(Date.now());
const diceRolling = ref(false);
const diceFace = ref(1);

const boardCells = buildBoard();

let socket: GameSocket | null = null;
let ticker: number | null = null;

const playablePlayers = computed(() => state.value?.players.filter((p) => p.role === 'player') ?? []);

const specialMarkers = computed(() => {
  const s = state.value;
  if (!s) return [] as { key: string; color: GameColor; style: Record<string, string> }[];
  const colors = [
    ...new Set(
      playablePlayers.value
        .map((p) => p.color)
        .filter((c): c is GameColor => c !== null),
    ),
  ];
  const markers: { key: string; color: GameColor; style: Record<string, string> }[] = [];
  for (const pos of s.specialCells) {
    if (pos < 0) continue;
    for (const color of colors) {
      const cell = cellForColor(color, pos);
      if (cell) markers.push({ key: `m-${color}-${pos}`, color, style: cellCenterStyle(cell) });
    }
  }
  return markers;
});
const rankedPlayers = computed(() => [...playablePlayers.value].sort((a, b) => b.points - a.points));
const currentPlayer = computed<GamePlayer | null>(
  () => state.value?.players[state.value.turnIndex] ?? null,
);
const myPlayer = computed(() => state.value?.players.find((p) => p.id === you.value) ?? null);
const isMyTurn = computed(
  () => !!myPlayer.value && currentPlayer.value?.id === myPlayer.value.id && state.value?.status === 'playing',
);
const canRoll = computed(() => isMyTurn.value && state.value?.dice === null);

const statusText = computed(() => {
  switch (state.value?.status) {
    case 'lobby':
      return 'Esperando para comenzar';
    case 'playing':
      return 'Partida en curso';
    case 'question':
      return 'Todos respondiendo su pregunta';
    case 'finished':
      return 'Partida terminada';
    default:
      return '';
  }
});

const winnerName = computed(() => {
  const winnerId = state.value?.winnerId;
  return winnerId ? (state.value?.players.find((p) => p.id === winnerId)?.nickname ?? '') : '';
});

const turnLeft = computed(() => {
  const deadline = state.value?.turnDeadline;
  if (!deadline || state.value?.status !== 'playing') return null;
  return Math.max(0, Math.ceil((deadline - now.value) / 1000));
});

const answerLeft = computed(() => {
  const deadline = activeQuestion.value?.deadline ?? state.value?.questionDeadline;
  if (!deadline || state.value?.status !== 'question') return null;
  return Math.max(0, Math.ceil((deadline - now.value) / 1000));
});

const connectionBanner = computed(() => {
  switch (socketStatus.value) {
    case 'connecting':
      return 'Conectando…';
    case 'reconnecting':
      return `Reconectando… (intento ${attempt.value})`;
    case 'error':
      return 'Sin conexión con la sala. Recarga la página.';
    case 'closed':
      return 'La sala se cerró.';
    default:
      return '';
  }
});

onMounted(() => {
  socket = new GameSocket(code, { onMessage: handleMessage, onStatus: handleStatus });
  socket.connect();
  ticker = window.setInterval(() => (now.value = Date.now()), 1000);
});

onBeforeUnmount(() => {
  socket?.close();
  if (ticker !== null) window.clearInterval(ticker);
});

function handleStatus(status: SocketStatus, tries: number): void {
  socketStatus.value = status;
  attempt.value = tries;
  if (status === 'open') lastError.value = '';
}

function handleMessage(message: GameMessage): void {
  if (
    message.type !== 'state_snapshot' &&
    state.value &&
    typeof message.seq === 'number' &&
    message.seq < state.value.seq
  ) {
    return;
  }

  switch (message.type) {
    case 'state_snapshot': {
      you.value = message.you ?? '';
      youRole.value = message.youRole ?? 'player';
      youManage.value = message.youManage === true;
      legal.value = message.legal ?? [];
      if (message.state) state.value = message.state;
      const snapshotQuestion = message.question;
      if (snapshotQuestion && typeof snapshotQuestion === 'object') {
        activeQuestion.value = snapshotQuestion as PlayerQuestion;
      }
      if (state.value?.status === 'question') {
        questionResult.value = activeQuestion.value?.answered ? questionResult.value : null;
      }
      break;
    }
    case 'room_state':
      if (message.state) state.value = message.state;
      break;
    case 'move_applied':
      if (message.state) {
        state.value = message.state;
        legal.value = [];
      }
      break;
    case 'dice_result':
      if (state.value) state.value = { ...state.value, dice: message.dice ?? null };
      legal.value = message.legal ?? [];
      triggerDiceRoll(message.dice ?? 1);
      break;
    case 'turn_started':
      if (state.value) {
        const index = state.value.players.findIndex((p) => p.id === message.dni);
        state.value = {
          ...state.value,
          status: 'playing',
          turnIndex: index >= 0 ? index : state.value.turnIndex,
          dice: null,
        };
        legal.value = [];
      }
      activeQuestion.value = null;
      questionResult.value = null;
      break;
    case 'special_cells':
      if (state.value) {
        state.value = {
          ...state.value,
          specialCells: message.cells ?? [],
          cycle: message.cycle ?? state.value.cycle,
        };
      }
      break;
    case 'question':
      activeQuestion.value = {
        id: String(message.id ?? ''),
        question: String(message.question ?? ''),
        options: message.options ?? [],
        difficulty: message.difficulty ?? 'easy',
        percent: Number(message.percent ?? 10),
        deadline: message.deadline ?? null,
      };
      questionResult.value = null;
      answering.value = false;
      if (state.value) state.value = { ...state.value, status: 'question' };
      break;
    case 'question_result':
      questionResult.value = {
        correct: message.correct === true,
        correctIndex: Number(message.correctIndex ?? 0),
        delta: Number(message.delta ?? 0),
        total: Number(message.total ?? 0),
        timeout: message.timeout === true,
      };
      answering.value = false;
      if (state.value) {
        state.value = {
          ...state.value,
          players: state.value.players.map((p) =>
            p.id === you.value ? { ...p, points: questionResult.value!.total } : p,
          ),
        };
      }
      break;
    case 'question_phase_started':
      if (state.value) state.value = { ...state.value, status: 'question', dice: null };
      break;
    case 'question_phase_end':
      notice.value = 'Ronda de preguntas terminada. Continúa el juego.';
      window.setTimeout(() => (notice.value = ''), 2500);
      activeQuestion.value = null;
      break;
    case 'game_over':
      if (state.value) {
        state.value = { ...state.value, status: 'finished', winnerId: message.winner ?? null };
      }
      break;
    case 'error':
      lastError.value = errorText(message.code);
      break;
    case 'pong':
      return;
  }
}

function errorText(code?: string): string {
  switch (code) {
    case 'not_your_turn':
      return 'No es tu turno.';
    case 'already_rolled':
      return 'Ya tiraste el dado este turno.';
    case 'illegal_move':
      return 'Ese movimiento no es válido.';
    case 'not_playing':
      return 'La partida no está en curso.';
    case 'turn_timeout':
      return 'Se agotó el tiempo del turno.';
    case 'question_timeout':
      return 'Se agotó el tiempo para responder.';
    case 'no_questions':
      return 'No hay preguntas disponibles; se continúa sin ronda de preguntas.';
    case 'not_question_phase':
      return 'No es momento de responder.';
    case 'not_your_question':
      return 'Esa pregunta no es tuya.';
    case 'already_answered':
      return 'Ya respondiste esta pregunta.';
    case 'room_cancelled':
      return 'El docente canceló la sala.';
    default:
      return 'Ocurrió un error en la sala.';
  }
}

function pieceStyle(player: GamePlayer, index: number, pos: number): Record<string, string> {
  const color = player.color;
  if (!color) return { display: 'none' };
  const cell = pos < 0 ? BASE_PATIO[color][index % 4] : cellForColor(color, pos);
  if (!cell) return { display: 'none' };
  return {
    left: `${((cell.c + 0.5) / BOARD_SIZE) * 100}%`,
    top: `${((cell.r + 0.5) / BOARD_SIZE) * 100}%`,
  };
}

function pieceLabel(player: GamePlayer, index: number, pos: number): string {
  if (pos < 0) return `Ficha ${index + 1} de ${player.nickname} en la base`;
  if (pos >= LUDO_PATH_LEN) return `Ficha ${index + 1} de ${player.nickname} en la meta`;
  return `Ficha ${index + 1} de ${player.nickname}, casilla ${pos}`;
}

function triggerDiceRoll(face: number): void {
  diceFace.value = face;
  diceRolling.value = true;
  window.setTimeout(() => {
    diceRolling.value = false;
  }, 700);
}

function tokenClickable(player: GamePlayer, token: number): boolean {
  return (
    player.id === you.value &&
    isMyTurn.value &&
    state.value?.dice !== null &&
    legal.value.includes(token)
  );
}

function optionLetter(i: number): string {
  return 'ABCD'[i] ?? '?';
}

function toggleReady(): void {
  socket?.send({ type: 'ready' });
}

function roll(): void {
  socket?.send({ type: 'roll' });
}

async function startGame(): Promise<void> {
  if (starting.value) return;
  starting.value = true;
  lastError.value = '';
  try {
    const res = await api.post<{ error?: string }>(`/api/game/rooms/${code}/start`, {});
    if (!res.ok) lastError.value = res.data.error ?? 'No se pudo iniciar la partida.';
  } catch {
    lastError.value = 'No se pudo iniciar la partida.';
  } finally {
    starting.value = false;
  }
}

function sendMove(player: GamePlayer, token: number): void {
  if (!tokenClickable(player, token)) return;
  socket?.send({ type: 'move', token });
}

function answer(question: PlayerQuestion, choice: number): void {
  if (answering.value || questionResult.value) return;
  answering.value = true;
  const ok = socket?.send({ type: 'answer', id: question.id, choice });
  if (!ok) answering.value = false;
}

async function copyCode(): Promise<void> {
  try {
    await navigator.clipboard.writeText(code);
    copied.value = true;
    window.setTimeout(() => (copied.value = false), 1500);
  } catch {
    // Portapapeles no disponible.
  }
}

async function leaveRoom(): Promise<void> {
  socket?.close();
  await api.post(`/api/game/rooms/${code}/leave`, {}).catch(() => null);
  const assignmentId = typeof route.query.assignment_id === 'string' ? route.query.assignment_id : '';
  void router.replace({ path: '/game', query: assignmentId ? { assignment_id: assignmentId } : {} });
}
</script>

<style scoped>
.room-page {
  max-width: 980px;
  margin: 0 auto;
  padding: 16px 16px 64px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  color: var(--text-primary);
  --ok: #006a4a;
  --bad: #b3261e;
}

[data-theme="dark"] .room-page {
  --ok: #7ddba8;
  --bad: #ffb4ab;
}

.room-top {
  display: flex;
  gap: 12px;
  justify-content: space-between;
  align-items: flex-start;
  flex-wrap: wrap;
}

.room-title {
  font-size: 1.5rem;
  font-weight: 700;
}

.code {
  letter-spacing: 0.18em;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}

.top-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.conn-banner {
  margin: 0;
  padding: 10px 14px;
  border-radius: 12px;
  font-weight: 600;
  background: var(--secondary-container);
}

.conn-reconnecting,
.conn-connecting {
  background: #fff4d6;
  color: #6b4e00;
}

[data-theme="dark"] .conn-reconnecting,
[data-theme="dark"] .conn-connecting {
  background: #4a3a00;
  color: #ffe08a;
}

.conn-error,
.conn-closed {
  background: var(--secondary-container);
  color: var(--bad, #b3261e);
}

.game-card {
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  border-radius: 16px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.muted {
  color: var(--text-secondary);
}

.small {
  font-size: 0.85rem;
}

.badge,
.you-badge,
.ready-chip,
.special-chip {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 600;
  background: var(--secondary-container);
}

.badge {
  margin-left: 6px;
}

.you-badge {
  background: var(--accent-gradient);
  color: #fff;
}

.ready-chip.ready {
  background: var(--secondary-container);
  color: var(--ok, #006a4a);
}

.special-chip {
  background: #fff4d6;
  color: #6b4e00;
}

[data-theme="dark"] .special-chip {
  background: #4a3a00;
  color: #ffe08a;
}

.player-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.player-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 12px;
  background: var(--secondary-container);
  flex-wrap: wrap;
}

.player-name {
  font-weight: 600;
  flex: 1;
}

.color-dot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #9e9e9e;
  flex: 0 0 auto;
}

.color-red { background: #e53935; }
.color-green { background: #43a047; }
.color-yellow { background: #fdd835; }
.color-blue { background: #1e88e5; }
.color-none { background: #9e9e9e; }

.turn-bar {
  display: flex;
  gap: 16px;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
}

.turn-info {
  display: flex;
  gap: 8px;
  align-items: baseline;
}

.timer {
  font-weight: 700;
  color: var(--accent-color);
}

.dice-area {
  display: flex;
  gap: 12px;
  align-items: center;
}

.dice {
  width: 56px;
  height: 56px;
  border-radius: 14px;
  background: var(--glass-bg);
  border: 2px solid var(--text-tertiary);
  display: grid;
  place-items: center;
  font-size: 1.6rem;
  font-weight: 800;
}

.dice.rolling {
  border-color: var(--accent-color);
  box-shadow: 0 0 0 4px rgba(103, 80, 164, 0.18);
}

.dice.spinning {
  animation: dice-spin 0.7s cubic-bezier(0.35, 0.1, 0.25, 1);
}

@keyframes dice-spin {
  0% { transform: rotate(0deg) scale(1); }
  25% { transform: rotate(90deg) scale(1.12) translateY(-2px); }
  50% { transform: rotate(180deg) scale(1.05); }
  75% { transform: rotate(270deg) scale(1.12) translateY(-2px); }
  100% { transform: rotate(360deg) scale(1); }
}

.board {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* ── Tablero de Ludo ── */
.ludo-players {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.player-chip {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 999px;
  background: var(--secondary-container);
  border: 2px solid transparent;
}

.player-chip.active {
  border-color: var(--accent-color);
}

.chip-name {
  font-weight: 600;
  white-space: nowrap;
}

.chip-score {
  white-space: nowrap;
  font-size: 0.85rem;
}

.ludo-stage {
  display: flex;
  justify-content: center;
}

.ludo-board {
  position: relative;
  width: 100%;
  max-width: 560px;
  aspect-ratio: 1 / 1;
  display: grid;
  grid-template-columns: repeat(15, 1fr);
  grid-template-rows: repeat(15, 1fr);
  gap: 1px;
  background: #0b0b0b;
  border: 3px solid #0b0b0b;
  border-radius: 8px;
  padding: 1px;
  box-sizing: content-box;
  overflow: hidden;
}

.cell {
  box-sizing: border-box;
}

.cell-track {
  background: #fbfbfb;
}

/* Colores de las casillas (base, patio, pasillo). */
.cell.color-green { background: #43a047; }
.cell.color-yellow { background: #fdd835; }
.cell.color-red { background: #e53935; }
.cell.color-blue { background: #1e88e5; }

.cell.cell-void {
  background: transparent;
}

.cell.cell-center {
  background: transparent;
}

.cell.cell-patio {
  background: #f7f7f7;
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.25);
}

/* Fichas (jugadores). */
.piece {
  position: absolute;
  width: calc(100% / 15 * 0.82);
  height: calc(100% / 15 * 0.82);
  transform: translate(-50%, -50%);
  border-radius: 50%;
  border: 2px solid rgba(0, 0, 0, 0.4);
  background: #fff;
  color: #1c1b1f;
  font: inherit;
  font-size: clamp(0.5rem, 1.4vw, 0.72rem);
  font-weight: 800;
  display: grid;
  place-items: center;
  padding: 0;
  cursor: default;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
  transition:
    left 0.42s cubic-bezier(0.34, 1.15, 0.64, 1),
    top 0.42s cubic-bezier(0.34, 1.15, 0.64, 1),
    box-shadow 0.2s ease;
  z-index: 3;
}

.piece.piece-green { background: #43a047; color: #fff; }
.piece.piece-yellow { background: #fdd835; color: #3a2d00; }
.piece.piece-red { background: #e53935; color: #fff; }
.piece.piece-blue { background: #1e88e5; color: #fff; }
.piece.piece-none { background: #9e9e9e; color: #fff; }

.piece.at-home {
  box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.9), 0 2px 6px rgba(0, 0, 0, 0.35);
}

.piece.actionable {
  cursor: pointer;
  z-index: 5;
  animation: piece-pulse 1.1s ease-in-out infinite;
}

.piece.actionable:hover {
  box-shadow: 0 0 0 4px rgba(103, 80, 164, 0.55), 0 2px 6px rgba(0, 0, 0, 0.35);
}

@keyframes piece-pulse {
  0%, 100% { filter: brightness(1); }
  50% { filter: brightness(1.25); }
}

/* Casillas especiales: pequeño rombo del color del jugador. */
.special-marker {
  position: absolute;
  width: calc(100% / 15 * 0.42);
  height: calc(100% / 15 * 0.42);
  transform: translate(-50%, -50%) rotate(45deg);
  border-radius: 1px;
  opacity: 0.85;
  pointer-events: none;
  z-index: 2;
}

.marker-green { background: #2e7d32; }
.marker-yellow { background: #c9a600; }
.marker-red { background: #c62828; }
.marker-blue { background: #1565c0; }

/* Meta central: 4 triángulos. */
.center-star {
  position: absolute;
  left: 40%;
  top: 40%;
  width: 20%;
  height: 20%;
  z-index: 2;
  pointer-events: none;
}

.tri {
  position: absolute;
  inset: 0;
}

.tri-top { background: #fdd835; clip-path: polygon(0 0, 100% 0, 50% 50%); }
.tri-right { background: #1e88e5; clip-path: polygon(100% 0, 100% 100%, 50% 50%); }
.tri-bottom { background: #e53935; clip-path: polygon(0 100%, 100% 100%, 50% 50%); }
.tri-left { background: #43a047; clip-path: polygon(0 0, 0 100%, 50% 50%); }

.lane {
  border-radius: 12px;
  padding: 10px;
  background: var(--secondary-container);
  border: 2px solid transparent;
}

.lane.active {
  border-color: var(--accent-color);
}

.lane.active.asking {
  border-style: dashed;
}

.lane-head {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 8px;
  flex-wrap: wrap;
}

.nowrap {
  white-space: nowrap;
}

.lane-score {
  margin-left: auto;
  white-space: nowrap;
}

.lane-body {
  display: flex;
  gap: 10px;
  align-items: center;
}

.base {
  display: flex;
  gap: 4px;
  flex: 0 0 auto;
  min-width: 44px;
  min-height: 34px;
  padding: 4px;
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.06);
}

.rail {
  position: relative;
  flex: 1;
  height: 34px;
  min-width: 0;
}

.rail-track {
  position: absolute;
  left: 0;
  right: 24px;
  top: 50%;
  height: 6px;
  transform: translateY(-50%);
  border-radius: 3px;
  background: rgba(0, 0, 0, 0.12);
}

.special-cell {
  position: absolute;
  top: 50%;
  width: 10px;
  height: 10px;
  transform: translate(-50%, -50%) rotate(45deg);
  background: #ffb300;
  border: 1px solid #8a5b00;
  border-radius: 2px;
  opacity: 0.9;
}

.goal {
  position: absolute;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  font-size: 0.65rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-secondary);
}

.token {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  border: 2px solid rgba(0, 0, 0, 0.35);
  background: var(--glass-bg);
  color: #1c1b1f;
  font: inherit;
  font-size: 0.8rem;
  font-weight: 700;
  cursor: default;
  display: grid;
  place-items: center;
  padding: 0;
  transition: transform 0.15s ease;
}

.rail .token {
  position: absolute;
  top: 50%;
  transform: translate(-50%, -50%);
}

.base-token {
  flex: 0 0 auto;
}

.token.actionable {
  cursor: pointer;
  box-shadow: 0 0 0 3px rgba(103, 80, 164, 0.35);
}

.token.actionable:hover {
  transform: translate(-50%, -50%) scale(1.15);
}

.base-token.actionable:hover {
  transform: scale(1.12);
}

.token.home {
  background: var(--secondary-container);
}

.lane.color-red .token { background: #ffebee; border-color: #e53935; }
.lane.color-green .token { background: #e8f5e9; border-color: #43a047; }
.lane.color-yellow .token { background: #fffde7; border-color: #c9a600; }
.lane.color-blue .token { background: #e3f2fd; border-color: #1e88e5; }

.btn-primary,
.btn-secondary {
  font: inherit;
  font-weight: 600;
  border-radius: 999px;
  padding: 10px 20px;
  min-height: 44px;
  cursor: pointer;
  border: 2px solid transparent;
}

.btn-primary {
  background: var(--accent-gradient);
  color: #fff;
}

.btn-secondary {
  background: var(--secondary-container);
  color: var(--text-primary);
}

.btn-primary:disabled,
.btn-secondary:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.link-btn {
  font: inherit;
  font-weight: 600;
  background: none;
  border: none;
  padding: 6px;
  cursor: pointer;
  text-decoration: underline;
  color: var(--accent-color);
}

.link-btn.danger {
  color: var(--bad, #b3261e);
}

.game-over p {
  font-size: 1.1rem;
}

.question-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: grid;
  place-items: center;
  padding: 16px;
  z-index: 50;
}

.question-card {
  width: min(560px, 100%);
  background: var(--glass-bg);
  border-radius: 20px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.35);
}

.question-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.q-badge {
  font-weight: 700;
  font-size: 0.8rem;
  padding: 4px 12px;
  border-radius: 999px;
}

.q-badge.easy {
  background: var(--secondary-container);
  color: var(--ok, #006a4a);
}

.q-badge.hard {
  background: #ffe0b2;
  color: #8a4b00;
}

[data-theme="dark"] .q-badge.hard {
  background: #4a3a00;
  color: #ffe08a;
}

.question-text {
  font-size: 1.15rem;
  font-weight: 700;
  line-height: 1.35;
}

.options {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.option-btn {
  font: inherit;
  text-align: left;
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 12px 14px;
  border-radius: 12px;
  border: 2px solid var(--glass-border);
  background: var(--glass-bg);
  cursor: pointer;
  min-height: 48px;
}

.option-btn:hover:not(:disabled) {
  border-color: var(--accent-color);
}

.option-btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.option-letter {
  font-weight: 800;
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--secondary-container);
  flex: 0 0 auto;
}

.result-line {
  font-weight: 700;
}

.result-line.ok {
  color: var(--ok, #006a4a);
}

.result-line.ko {
  color: var(--bad, #b3261e);
}

@media (max-width: 560px) {
  .lane-body {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
