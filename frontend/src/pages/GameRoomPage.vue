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
        <p class="muted small">
          Se necesitan al menos 2 jugadores conectados. Cualquiera de ellos puede iniciar la partida.
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
              <div class="dice" :class="{ rolling: canRoll }" aria-live="polite">{{ state.dice ?? '·' }}</div>
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

          <div class="board" role="group" aria-label="Tablero">
            <div
              v-for="p in playablePlayers"
              :key="p.id"
              class="lane"
              :class="[`color-${p.color}`, { active: p.id === currentPlayer?.id, asking: p.id === currentPlayer?.id && state.status === 'question' }]"
            >
              <div class="lane-head">
                <span class="color-dot" :class="p.color ? `color-${p.color}` : 'color-none'" />
                <span class="nowrap">{{ p.nickname }}</span>
                <span v-if="p.id === you" class="you-badge">Tú</span>
                <span v-if="!p.connected" class="muted small">desconectado</span>
                <span v-if="p.hitSpecial" class="special-chip" title="Cayó en casilla especial">★</span>
                <span class="lane-score">
                  <strong>{{ p.points }}%</strong>
                  <span class="muted small"> · tiradas {{ Math.min(p.rolls, 2) }}/2</span>
                </span>
              </div>
              <div class="lane-body">
                <div class="base" :aria-label="`Base de ${p.nickname}`">
                  <button
                    v-for="token in tokensInBase(p)"
                    :key="`b${token}`"
                    class="token base-token"
                    type="button"
                    :class="{ actionable: tokenClickable(p, token) }"
                    :disabled="!tokenClickable(p, token)"
                    :aria-label="`Mover ficha ${token + 1} de ${p.nickname} desde la base`"
                    @click="sendMove(p, token)"
                  >
                    {{ token + 1 }}
                  </button>
                </div>
                <div class="rail">
                  <div class="rail-track" />
                  <span
                    v-for="cell in state.specialCells"
                    :key="`s${cell}`"
                    class="special-cell"
                    :style="{ left: `${tokenPercent(cell)}%` }"
                    aria-hidden="true"
                  />
                  <button
                    v-for="item in tokensOnTrack(p)"
                    :key="`t${item.index}`"
                    class="token"
                    type="button"
                    :class="{ actionable: tokenClickable(p, item.index), home: item.pos >= LUDO_PATH_LEN }"
                    :style="{ left: `${tokenPercent(item.pos)}%` }"
                    :disabled="!tokenClickable(p, item.index)"
                    :aria-label="`Ficha ${item.index + 1} de ${p.nickname}, casilla ${item.pos}`"
                    @click="sendMove(p, item.index)"
                  >
                    {{ item.index + 1 }}
                  </button>
                  <span class="goal" aria-hidden="true">Meta</span>
                </div>
              </div>
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
  tokenPercent,
  type GameMessage,
  type GamePlayer,
  type GameState,
  type PlayerQuestion,
  type SocketStatus,
} from '@/lib/game';

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

let socket: GameSocket | null = null;
let ticker: number | null = null;

const playablePlayers = computed(() => state.value?.players.filter((p) => p.role === 'player') ?? []);
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

function tokensInBase(player: GamePlayer): number[] {
  return player.tokens.flatMap((pos, index) => (pos < 0 ? [index] : []));
}

function tokensOnTrack(player: GamePlayer): { index: number; pos: number }[] {
  return player.tokens.flatMap((pos, index) => (pos >= 0 ? [{ index, pos }] : []));
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
  background: var(--surface-variant, #e7e0ec);
}

.conn-reconnecting,
.conn-connecting {
  background: #fff4d6;
  color: #6b4e00;
}

.conn-error,
.conn-closed {
  background: var(--error-container, #f9dedc);
  color: var(--error, #b3261e);
}

.game-card {
  background: var(--surface, #fef7ff);
  border: 1px solid var(--outline-variant, #cac4d0);
  border-radius: 16px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.muted {
  color: var(--on-surface-variant, #49454f);
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
  background: var(--surface-variant, #e7e0ec);
}

.badge {
  margin-left: 6px;
}

.you-badge {
  background: var(--accent-color, #6750a4);
  color: #fff;
}

.ready-chip.ready {
  background: var(--success-container, #d0fadf);
  color: var(--success, #006a4a);
}

.special-chip {
  background: #fff4d6;
  color: #6b4e00;
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
  background: var(--surface-variant, #e7e0ec);
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
  color: var(--accent-color, #6750a4);
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
  background: #fff;
  border: 2px solid var(--outline, #79747e);
  display: grid;
  place-items: center;
  font-size: 1.6rem;
  font-weight: 800;
}

.dice.rolling {
  border-color: var(--accent-color, #6750a4);
  box-shadow: 0 0 0 4px rgba(103, 80, 164, 0.18);
}

.board {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.lane {
  border-radius: 12px;
  padding: 10px;
  background: var(--surface-variant, #e7e0ec);
  border: 2px solid transparent;
}

.lane.active {
  border-color: var(--accent-color, #6750a4);
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
  color: var(--on-surface-variant, #49454f);
}

.token {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  border: 2px solid rgba(0, 0, 0, 0.35);
  background: #fff;
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
  background: var(--success-container, #d0fadf);
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
  background: var(--accent-color, #6750a4);
  color: #fff;
}

.btn-secondary {
  background: var(--surface-variant, #e7e0ec);
  color: var(--on-surface, #1d1b20);
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
  color: var(--accent-color, #6750a4);
}

.link-btn.danger {
  color: var(--error, #b3261e);
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
  background: var(--surface, #fef7ff);
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
  background: var(--success-container, #d0fadf);
  color: var(--success, #006a4a);
}

.q-badge.hard {
  background: #ffe0b2;
  color: #8a4b00;
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
  border: 2px solid var(--outline-variant, #cac4d0);
  background: var(--surface, #fef7ff);
  cursor: pointer;
  min-height: 48px;
}

.option-btn:hover:not(:disabled) {
  border-color: var(--accent-color, #6750a4);
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
  background: var(--surface-variant, #e7e0ec);
  flex: 0 0 auto;
}

.result-line {
  font-weight: 700;
}

.result-line.ok {
  color: var(--success, #006a4a);
}

.result-line.ko {
  color: var(--error, #b3261e);
}

@media (max-width: 560px) {
  .lane-body {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
