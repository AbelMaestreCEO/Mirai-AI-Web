<template>
  <header class="header">
    <MenuToggle />
    <div class="header-title">Uno <span class="beta">BETA</span></div>
  </header>

  <div class="uno-page">
    <div class="room-top">
      <div>
        <h1 class="room-title">
          Sala <span class="code">{{ code }}</span>
          <span class="beta beta--inline">BETA</span>
        </h1>
        <p v-if="state" class="muted small">
          {{ statusText }}
          · {{ playablePlayers.length }}/{{ state.maxPlayers }} jugadores
          <span class="badge">Ronda {{ state.round }}</span>
          <span v-if="youRole === 'spectator'" class="badge">Espectador</span>
        </p>
        <p v-else class="muted small">Uno educativo en pruebas. Puede cambiar.</p>
      </div>
      <div class="top-actions">
        <button class="btn-secondary" type="button" @click="copyCode">{{ copied ? 'Copiado' : 'Copiar código' }}</button>
        <button class="link-btn danger" type="button" @click="leaveRoom">Salir</button>
      </div>
    </div>

    <div v-if="!state" class="game-card muted" role="status">Conectando con la sala…</div>

    <template v-else>
      <!-- Lobby -->
      <section v-if="state.status === 'lobby'" class="game-card">
        <h2>Jugadores</h2>
        <p class="beta-note">
          <span class="beta">BETA</span>
          Estás probando el Uno educativo. Las reglas y la interfaz pueden cambiar.
        </p>
        <ul class="player-list">
          <li v-for="p in state.players" :key="p.id" class="player-item">
            <span class="avatar">{{ initials(p.nickname) }}</span>
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
          {{ me?.ready ? 'Quitar listo' : 'Estoy listo' }}
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
          Se necesitan al menos 2 jugadores. Gana quien se quede sin cartas; las preguntas salvan de los +2/+4.
        </p>
      </section>

      <!-- Partida -->
      <template v-else>
        <section class="game-card uno-table">
          <div class="turn-bar" :class="{ 'my-turn': isMyTurn, waiting: state.status === 'question' }">
            <div class="turn-info">
              <template v-if="state.status === 'question'">
                <span class="muted small">Ronda de preguntas</span>
                <strong v-if="questionEventLabel">{{ questionEventLabel }}</strong>
                <span v-if="answerLeft !== null" class="timer">{{ answerLeft }} s</span>
              </template>
              <template v-else>
                <span class="muted small">Turno</span>
                <strong>{{ currentPlayer?.nickname ?? '—' }}</strong>
                <span v-if="turnLeft !== null" class="timer">{{ turnLeft }} s</span>
              </template>
            </div>
            <div class="direction" :title="state.direction === 1 ? 'Sentido horario' : 'Sentido antihorario'">
              {{ state.direction === 1 ? '↻' : '↺' }}
            </div>
          </div>

          <div class="rivals" role="list" aria-label="Jugadores">
            <div
              v-for="p in playablePlayers"
              :key="`rival-${p.id}`"
              class="rival"
              :class="{ active: p.id === currentPlayer?.id, me: p.id === you, offline: !p.connected }"
              role="listitem"
            >
              <span class="rival-name">
                {{ p.nickname }}
                <span v-if="p.id === you" class="you-badge">Tú</span>
              </span>
              <span class="rival-cards" :aria-label="`${p.handCount} cartas`">
                <span class="mini-back" aria-hidden="true" />
                <span class="mini-count">{{ p.handCount }}</span>
              </span>
            </div>
          </div>

          <div class="table-center">
            <div class="pile">
              <span class="pile-label">Mazo</span>
              <button
                class="deck-card"
                type="button"
                :disabled="!canDraw"
                :aria-label="canDraw ? 'Robar una carta' : 'No puedes robar ahora'"
                @click="draw"
              >
                <span class="deck-count">{{ state.deckCount }}</span>
              </button>
              <span class="pile-label">{{ canDraw ? 'Robar' : '—' }}</span>
            </div>

            <div class="pile">
              <span class="pile-label">Descarte</span>
              <div v-if="state.discardTop" class="uno-card discard" :class="colorClass(state.discardTop.color ?? state.activeColor)">
                <span class="card-value">{{ cardLabel(state.discardTop) }}</span>
              </div>
              <div v-else class="uno-card discard empty">—</div>
              <span class="active-color" :class="colorClass(state.activeColor)">
                Color activo: {{ colorName(state.activeColor) }}
              </span>
            </div>
          </div>

          <div class="hand-head">
            <h3>Tu mano</h3>
            <span v-if="isMyTurn && !hasLegal" class="muted small">Sin jugadas legales: roba una carta.</span>
            <span v-else-if="isMyTurn && drawnThisTurn" class="muted small">Puedes jugar o pulsar «Pasar».</span>
            <span v-else-if="isMyTurn" class="muted small">Juega una carta resaltada.</span>
          </div>

          <div v-if="youRole === 'player'" class="hand" role="list" aria-label="Tu mano">
            <button
              v-for="card in myHand"
              :key="card.id"
              class="uno-card hand-card"
              :class="[colorClass(card.color ?? 'wild'), { legal: isLegal(card), dim: isMyTurn && !isLegal(card) }]"
              type="button"
              :disabled="!isMyTurn || state.status !== 'playing' || !isLegal(card)"
              :aria-label="`Jugar ${cardLabel(card)} ${colorName(card.color ?? 'wild')}`"
              @click="tryPlay(card)"
            >
              <span class="card-value">{{ cardLabel(card) }}</span>
              <span class="card-color-name">{{ colorName(card.color ?? 'wild') }}</span>
            </button>
            <span v-if="myHand.length === 0" class="muted small">Sin cartas.</span>
          </div>

          <div v-if="youRole === 'player'" class="hand-actions">
            <button
              v-if="canDraw"
              class="btn-primary"
              type="button"
              @click="draw"
            >Robar carta</button>
            <button
              v-if="isMyTurn && drawnThisTurn"
              class="btn-secondary"
              type="button"
              @click="pass"
            >Pasar</button>
          </div>
        </section>
      </template>

      <!-- Fin de partida -->
      <section v-if="state.status === 'finished'" class="game-card game-over" role="status">
        <h2>Partida terminada</h2>
        <p v-if="winnerName">Ganó <strong>{{ winnerName }}</strong> 🎉</p>
        <div v-if="finalStats" class="my-score">
          <p>
            Nota: <strong>{{ finalStats.finalPercent }}%</strong>
            <span class="muted small">
              (quiz {{ finalStats.quizPercent }}% · posición {{ finalStats.placementPercent }}%)
            </span>
          </p>
          <p v-if="!isFormative" class="muted small">Puntuación: {{ finalStats.score }}</p>
        </div>
        <ul class="player-list">
          <li v-for="p in rankedPlayers" :key="p.id" class="player-item">
            <span class="player-name">{{ p.nickname }}</span>
            <span class="muted small">{{ p.handCount }} cartas</span>
          </li>
        </ul>
        <div v-if="review.length" class="game-review">
          <h3>Repaso de errores</h3>
          <div v-for="(item, i) in review" :key="`review-${i}`" class="review-item">
            <p class="review-question">{{ item.question }}</p>
            <p class="muted small">
              Correcta: <strong>{{ optionLetter(item.correctIndex) }}. {{ item.options[item.correctIndex] }}</strong>
            </p>
            <p v-if="item.explanation" class="muted small">💡 {{ item.explanation }}</p>
            <p v-if="item.concept" class="muted small">🎯 Concepto: {{ item.concept }}</p>
          </div>
        </div>
        <p v-else-if="youRole === 'player'" class="muted small">Sin errores en esta partida. 🎉</p>
        <button class="btn-secondary" type="button" @click="leaveRoom">Volver al lobby</button>
      </section>
    </template>

    <!-- Pregunta privada -->
    <div v-if="activeQuestion" class="question-overlay" role="dialog" aria-modal="true" aria-labelledby="uno-q-title">
      <div :key="activeQuestion.id" class="question-card">
        <div class="question-head">
          <span class="q-badge" :class="activeQuestion.difficulty">
            {{ difficultyLabel(activeQuestion.difficulty) }}
          </span>
          <span class="penalty-hint">Fallo: +{{ activeQuestion.drawCount }} cartas</span>
          <span v-if="answerLeft !== null" class="timer">{{ answerLeft }} s</span>
        </div>
        <h2 id="uno-q-title" class="question-text">{{ activeQuestion.question }}</h2>
        <div class="options">
          <button
            v-for="(option, i) in activeQuestion.options"
            :key="i"
            class="option-btn"
            type="button"
            :disabled="answerBusy || questionResult !== null"
            @click="answer(i)"
          >
            <span class="option-letter">{{ optionLetter(i) }}</span>
            <span>{{ option }}</span>
          </button>
        </div>
        <div v-if="questionResult" class="question-feedback" :class="questionResult.correct ? 'ok' : 'bad'">
          <p v-if="questionResult.correct">¡Correcto! No robas cartas.</p>
          <p v-else>
            {{ questionResult.timeout ? 'Se agotó el tiempo.' : 'Respuesta incorrecta.' }}
            La correcta era <strong>{{ optionLetter(questionResult.correctIndex) }}</strong>
            <span v-if="questionResult.correctOption">: {{ questionResult.correctOption }}</span>
          </p>
          <p v-if="questionResult.explanation" class="explanation">💡 {{ questionResult.explanation }}</p>
          <p v-if="questionResult.concept && !questionResult.correct" class="explanation">
            🎯 Concepto a repasar: {{ questionResult.concept }}
          </p>
        </div>
        <p class="muted small">
          {{ questionResult ? 'Respuesta enviada. Esperando a los demás…' : 'Responde antes de que se acabe el tiempo; si no, cuentan como incorrectas.' }}
        </p>
      </div>
    </div>

    <!-- Selector de color para +4 -->
    <div v-if="colorPickerCard" class="question-overlay" role="dialog" aria-modal="true" aria-labelledby="uno-color-title">
      <div class="question-card color-card">
        <h2 id="uno-color-title" class="question-text">Elige un color para tu +4</h2>
        <div class="color-options">
          <button
            v-for="color in UNO_COLORS"
            :key="color"
            class="color-option"
            :class="`uno-${color}`"
            type="button"
            @click="playWithColor(color)"
          >{{ colorName(color) }}</button>
        </div>
        <button class="link-btn" type="button" @click="colorPickerCard = null">Cancelar</button>
      </div>
    </div>

    <div class="floating-toasts" aria-live="polite">
      <div v-if="connectionBanner" class="floating-toast info sticky" role="status">{{ connectionBanner }}</div>
      <div v-for="toast in toasts" :key="toast.id" class="floating-toast" :class="toast.tone" role="status">
        {{ toast.text }}
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
  type Difficulty,
  type GameMessage,
  type ReviewItem,
  type SocketStatus,
  type UnoCard,
  type UnoColor,
  type UnoFinalStats,
  type UnoQuestion,
  type UnoQuestionResult,
  type UnoState,
} from '@/lib/game';

const UNO_COLORS: UnoColor[] = ['red', 'green', 'blue', 'yellow'];

const route = useRoute();
const router = useRouter();
const code = String(route.params.code ?? '').toUpperCase();

type ToastTone = 'ok' | 'ko' | 'info';
interface Toast { id: number; text: string; tone: ToastTone }

const state = ref<UnoState | null>(null);
const you = ref('');
const youRole = ref<'player' | 'spectator'>('player');
const youManage = ref(false);
const starting = ref(false);
const copied = ref(false);
const socketStatus = ref<SocketStatus>('connecting');
const attempt = ref(0);
const now = ref(Date.now());

const myHand = ref<UnoCard[]>([]);
const drawnThisTurn = ref(false);
const activeQuestion = ref<UnoQuestion | null>(null);
const questionResult = ref<UnoQuestionResult | null>(null);
const answerBusy = ref(false);
const review = ref<ReviewItem[]>([]);
const finalStats = ref<UnoFinalStats | null>(null);
const colorPickerCard = ref<UnoCard | null>(null);
const toasts = ref<Toast[]>([]);

let socket: GameSocket | null = null;
let ticker: number | null = null;
let toastId = 0;
const toastTimers = new Map<number, number>();

const playablePlayers = computed(() => state.value?.players.filter((p) => p.role === 'player') ?? []);
const me = computed(() => state.value?.players.find((p) => p.id === you.value) ?? null);
const currentPlayer = computed(() => state.value?.players[state.value?.turnIndex ?? 0] ?? null);
const isMyTurn = computed(
  () => !!me.value && currentPlayer.value?.id === me.value.id && state.value?.status === 'playing',
);
const isFormative = computed(() => state.value?.gradingMode === 'formative');
const winnerName = computed(() => {
  const id = state.value?.winnerId;
  return id ? state.value?.players.find((p) => p.id === id)?.nickname ?? '' : '';
});
const rankedPlayers = computed(() =>
  [...playablePlayers.value].sort((a, b) => a.handCount - b.handCount),
);

const legalIds = computed(() => {
  if (!state.value) return [] as string[];
  const top = state.value.discardTop;
  const active = state.value.activeColor;
  return myHand.value
    .filter((card) => {
      if (card.value === 'plus4') return true;
      if (card.color && card.color === active) return true;
      if (top && top.color && card.color === top.color) return true;
      if (top && card.value === top.value) return true;
      return false;
    })
    .map((card) => card.id);
});
const hasLegal = computed(() => legalIds.value.length > 0);
const canDraw = computed(
  () => isMyTurn.value && !hasLegal.value && !drawnThisTurn.value,
);

const turnLeft = computed(() => {
  const deadline = state.value?.turnDeadline;
  if (!deadline || state.value?.status !== 'playing') return null;
  return Math.max(0, Math.ceil((deadline - now.value) / 1000));
});
const answerLeft = computed(() => {
  const deadline = activeQuestion.value?.deadline ?? state.value?.questionDeadline;
  if (!deadline) return null;
  return Math.max(0, Math.ceil((deadline - now.value) / 1000));
});

const statusText = computed(() => {
  switch (state.value?.status) {
    case 'lobby': return 'Esperando para comenzar';
    case 'playing': return 'Partida en curso';
    case 'question': return 'Ronda de preguntas';
    case 'finished': return 'Partida terminada';
    default: return '';
  }
});

const questionEventLabel = computed(() => {
  switch (state.value?.questionKind) {
    case 'plus2': return 'Carta +2: pregunta fácil';
    case 'plus4': return 'Carta +4: pregunta difícil';
    case 'periodic': return 'Ronda par: pregunta media';
    default: return '';
  }
});

const connectionBanner = computed(() => {
  switch (socketStatus.value) {
    case 'connecting': return 'Conectando…';
    case 'reconnecting': return `Reconectando… (intento ${attempt.value})`;
    case 'error': return 'Sin conexión con la sala. Recarga la página.';
    case 'closed': return 'La sala se cerró.';
    default: return '';
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
  for (const timer of toastTimers.values()) window.clearTimeout(timer);
  toastTimers.clear();
});

function handleStatus(status: SocketStatus, tries: number): void {
  socketStatus.value = status;
  attempt.value = tries;
}

function handleMessage(message: GameMessage): void {
  switch (message.type) {
    case 'state_snapshot': {
      you.value = message.you ?? '';
      youRole.value = message.youRole ?? 'player';
      youManage.value = message.youManage === true;
      if (message.state) state.value = message.state as unknown as UnoState;
      if (Array.isArray(message.hand)) myHand.value = message.hand;
      const q = message.question;
      if (q && typeof q === 'object') {
        const question = q as unknown as UnoQuestion;
        activeQuestion.value = question;
        if (question.answered) answerBusy.value = true;
      } else {
        activeQuestion.value = null;
      }
      if (Array.isArray(message.review)) review.value = message.review;
      break;
    }
    case 'room_state':
      if (message.state) state.value = message.state as unknown as UnoState;
      break;
    case 'turn_started':
      drawnThisTurn.value = false;
      if (state.value) {
        const index = state.value.players.findIndex((p) => p.id === message.dni);
        state.value = {
          ...state.value,
          status: 'playing',
          turnIndex: index >= 0 ? index : state.value.turnIndex,
          questionKind: null,
          turnDeadline: typeof message.deadline === 'number' ? message.deadline : state.value.turnDeadline,
          direction: message.direction === -1 ? -1 : 1,
        };
      }
      break;
    case 'card_played':
      if (message.dni === you.value && message.card) {
        myHand.value = myHand.value.filter((c) => c.id !== message.card!.id);
      }
      if (state.value && message.activeColor) {
        state.value = { ...state.value, activeColor: message.activeColor };
      }
      break;
    case 'hand_update':
      if (Array.isArray(message.hand)) myHand.value = message.hand;
      break;
    case 'drew_card':
      if (message.dni === you.value) {
        drawnThisTurn.value = true;
        if (message.card) {
          myHand.value = [...myHand.value, message.card as UnoCard];
        }
      }
      break;
    case 'direction_changed':
      if (state.value && (message.direction === 1 || message.direction === -1)) {
        state.value = { ...state.value, direction: message.direction };
      }
      break;
    case 'round_completed':
      pushToast(`Ronda ${message.round ?? ''} completada`, 'info');
      break;
    case 'question_phase_started':
      if (state.value) {
        state.value = { ...state.value, status: 'question', questionKind: message.kind ?? null };
      }
      break;
    case 'question':
      activeQuestion.value = {
        id: String(message.id ?? ''),
        question: String(message.question ?? ''),
        options: message.options ?? [],
        difficulty: (message.difficulty ?? 'easy') as Difficulty,
        drawCount: Number(message.drawCount ?? 1),
        deadline: typeof message.deadline === 'number' ? message.deadline : null,
      };
      questionResult.value = null;
      break;
    case 'question_result':
      questionResult.value = {
        correct: message.correct === true,
        correctIndex: Number(message.correctIndex ?? 0),
        correctOption: typeof message.correctOption === 'string' ? message.correctOption : '',
        explanation: typeof message.explanation === 'string' ? message.explanation : '',
        concept: typeof message.concept === 'string' ? message.concept : '',
        timeout: message.timeout === true,
      };
      answerBusy.value = false;
      break;
    case 'question_phase_end':
      activeQuestion.value = null;
      questionResult.value = null;
      answerBusy.value = false;
      if (state.value) state.value = { ...state.value, status: 'playing', questionKind: null };
      break;
    case 'penalty_applied':
      if (message.dni === you.value) {
        pushToast(`Robas ${message.drawCount ?? 0} carta(s)`, 'ko');
      } else {
        pushToast(`${playerName(message.dni)} roba ${message.drawCount ?? 0} carta(s)`, 'info');
      }
      break;
    case 'game_over':
      activeQuestion.value = null;
      questionResult.value = null;
      if (Array.isArray(message.review)) review.value = message.review;
      finalStats.value = (message.stats as UnoFinalStats | null) ?? null;
      if (state.value) {
        state.value = { ...state.value, status: 'finished', winnerId: message.winner ?? null };
      }
      break;
    case 'error':
      pushToast(errorText(message.code as string | undefined), 'ko');
      break;
    case 'pong':
      return;
  }
}

function errorText(code?: string): string {
  switch (code) {
    case 'not_your_turn': return 'No es tu turno.';
    case 'illegal_play': return 'Esa carta no se puede jugar ahora.';
    case 'must_play': return 'Tienes una jugada legal: debes jugar una carta.';
    case 'bad_color': return 'Elige un color para el +4.';
    case 'not_playing': return 'La partida no está en curso.';
    case 'not_question_phase': return 'No es momento de responder.';
    case 'not_your_question': return 'Esa pregunta no es tuya.';
    case 'already_answered': return 'Ya respondiste esta pregunta.';
    case 'turn_timeout': return 'Se agotó el tiempo del turno.';
    case 'question_timeout': return 'Se agotó el tiempo para responder.';
    case 'no_questions': return 'No hay preguntas disponibles; se continúa sin penalización.';
    case 'room_cancelled': return 'El docente canceló la sala.';
    default: return 'Ocurrió un error en la sala.';
  }
}

function isLegal(card: UnoCard): boolean {
  return legalIds.value.includes(card.id);
}

function tryPlay(card: UnoCard): void {
  if (card.value === 'plus4') {
    colorPickerCard.value = card;
    return;
  }
  socket?.send({ type: 'play', cardId: card.id });
}

function playWithColor(color: UnoColor): void {
  const card = colorPickerCard.value;
  colorPickerCard.value = null;
  if (!card) return;
  socket?.send({ type: 'play', cardId: card.id, color });
}

function draw(): void {
  socket?.send({ type: 'draw' });
}

function pass(): void {
  socket?.send({ type: 'pass' });
}

function answer(choice: number): void {
  const question = activeQuestion.value;
  if (!question || answerBusy.value || questionResult.value) return;
  answerBusy.value = true;
  socket?.send({ type: 'answer', id: question.id, choice });
}

function toggleReady(): void {
  socket?.send({ type: 'ready' });
}

async function startGame(): Promise<void> {
  if (starting.value) return;
  starting.value = true;
  try {
    const res = await api.post<{ error?: string }>(`/api/game/rooms/${code}/start`, {});
    if (!res.ok) pushToast(res.data.error ?? 'No se pudo iniciar la partida.', 'ko');
  } finally {
    starting.value = false;
  }
}

function leaveRoom(): void {
  const assignmentId = typeof route.query.assignment_id === 'string' ? route.query.assignment_id : '';
  void router.replace({ path: '/game', query: assignmentId ? { assignment_id: assignmentId } : {} });
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

function pushToast(text: string, tone: ToastTone): void {
  const id = ++toastId;
  toasts.value = [...toasts.value, { id, text, tone }];
  const timer = window.setTimeout(() => {
    toasts.value = toasts.value.filter((t) => t.id !== id);
    toastTimers.delete(id);
  }, 3000);
  toastTimers.set(id, timer);
}

function playerName(id?: string | null): string {
  if (!id) return 'Alguien';
  return state.value?.players.find((p) => p.id === id)?.nickname ?? 'Alguien';
}

function cardLabel(card: UnoCard): string {
  switch (card.value) {
    case 'plus2': return '+2';
    case 'plus4': return '+4';
    case 'skip': return '⊘';
    case 'reverse': return '⇄';
    default: return card.value;
  }
}

function colorClass(color: UnoColor | 'wild'): string {
  return `uno-${color}`;
}

function colorName(color: UnoColor | 'wild'): string {
  switch (color) {
    case 'red': return 'Rojo';
    case 'green': return 'Verde';
    case 'blue': return 'Azul';
    case 'yellow': return 'Amarillo';
    default: return 'Comodín';
  }
}

function difficultyLabel(difficulty: Difficulty): string {
  switch (difficulty) {
    case 'hard': return 'Difícil';
    case 'medium': return 'Media';
    default: return 'Fácil';
  }
}

function optionLetter(index: number): string {
  return String.fromCharCode(65 + index);
}

function initials(name: string): string {
  return name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?';
}

void UNO_COLORS;
</script>

<style scoped>
.uno-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
  color: var(--text-primary);
  --bad: #b3261e;
  --card-red: #e53935;
  --card-green: #43a047;
  --card-blue: #1e88e5;
  --card-yellow: #f9d63a;
}

[data-theme="dark"] .uno-page {
  --bad: #ffb4ab;
}

.beta {
  display: inline-block;
  font-size: 0.62rem;
  font-weight: 800;
  letter-spacing: 0.12em;
  padding: 2px 7px;
  border-radius: 999px;
  background: linear-gradient(120deg, #ff9800, #ff5722);
  color: #fff;
  vertical-align: middle;
}

.beta--inline {
  margin-left: 8px;
  font-size: 0.55rem;
}

.beta-note {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.85rem;
  color: var(--text-secondary);
  background: var(--secondary-container);
  border-radius: 12px;
  padding: 10px 12px;
}

.room-top {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  justify-content: space-between;
  align-items: flex-start;
}

.room-title {
  font-size: 1.5rem;
  font-weight: 700;
}

.code {
  letter-spacing: 0.12em;
  color: var(--accent-color);
}

.top-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.badge {
  display: inline-block;
  margin-left: 6px;
  font-size: 0.7rem;
  font-weight: 600;
  padding: 1px 8px;
  border-radius: 999px;
  background: var(--secondary-container);
}

.turn-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 14px;
  border-radius: 14px;
  background: var(--secondary-container);
  border: 2px solid transparent;
}

.turn-bar.my-turn {
  border-color: var(--accent-color);
  box-shadow: 0 0 0 3px var(--accent-glow, rgba(103, 80, 164, 0.18));
}

.turn-bar.waiting {
  opacity: 0.85;
}

.turn-info {
  display: flex;
  gap: 10px;
  align-items: baseline;
  flex-wrap: wrap;
}

.timer {
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  padding: 2px 10px;
  border-radius: 999px;
  background: var(--glass-bg);
}

.direction {
  font-size: 1.5rem;
  font-weight: 700;
}

.rivals {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.rival {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 12px;
  border-radius: 12px;
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  min-width: 120px;
}

.rival.active {
  border-color: var(--accent-color);
  background: var(--secondary-container);
}

.rival.offline {
  opacity: 0.55;
}

.rival-name {
  font-weight: 600;
  font-size: 0.9rem;
}

.rival-cards {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--text-secondary);
}

.mini-back {
  width: 22px;
  height: 30px;
  border-radius: 4px;
  background: url('/cards/atras.jpg') center / cover no-repeat;
  border: 1px solid rgba(0, 0, 0, 0.25);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.18);
}

.mini-count {
  font-size: 0.85rem;
  font-weight: 700;
}

.table-center {
  display: flex;
  gap: 28px;
  justify-content: center;
  align-items: flex-end;
  flex-wrap: wrap;
  padding: 12px 0;
}

.pile {
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: center;
}

.pile-label {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-secondary);
}

.deck-card {
  width: 76px;
  height: 110px;
  border-radius: 12px;
  border: 3px solid var(--accent-color);
  background: url('/cards/atras.jpg') center / cover no-repeat;
  color: #fff;
  font-size: 1.2rem;
  font-weight: 800;
  cursor: pointer;
  display: grid;
  place-items: center;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.6);
}

.deck-card:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.deck-count {
  background: rgba(0, 0, 0, 0.35);
  border-radius: 999px;
  padding: 2px 12px;
}

.active-color {
  font-size: 0.78rem;
  font-weight: 600;
  padding: 2px 10px;
  border-radius: 999px;
  color: #fff;
}

.uno-card {
  width: 76px;
  height: 110px;
  border-radius: 12px;
  border: 3px solid rgba(0, 0, 0, 0.18);
  color: #fff;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  position: relative;
  overflow: hidden;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.18);
}

.uno-card::before {
  content: '';
  position: absolute;
  inset: 6px;
  border: 2px solid rgba(255, 255, 255, 0.55);
  border-radius: 8px;
  pointer-events: none;
}

.card-value {
  font-size: 1.9rem;
  font-weight: 800;
  line-height: 1;
  position: relative;
  z-index: 1;
}

.card-color-name {
  font-size: 0.62rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  opacity: 0.85;
  position: relative;
  z-index: 1;
}

.discard {
  width: 88px;
  height: 128px;
}

.discard.empty {
  border-style: dashed;
  color: var(--text-secondary);
  background: var(--glass-bg);
}

.uno-red { background: var(--card-red); }
.uno-green { background: var(--card-green); }
.uno-blue { background: var(--card-blue); }
.uno-yellow { background: var(--card-yellow); color: #4a3600; }
.uno-wild {
  background: conic-gradient(from 0deg, var(--card-red), var(--card-yellow), var(--card-green), var(--card-blue), var(--card-red));
}

.hand-head {
  display: flex;
  gap: 10px;
  align-items: baseline;
  flex-wrap: wrap;
}

.hand-head h3 {
  font-size: 1rem;
}

.hand {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding: 8px 2px 14px;
}

.hand-card {
  flex: 0 0 auto;
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease, opacity 0.15s ease;
}

.hand-card.legal {
  box-shadow: 0 0 0 3px #fff, 0 0 0 6px var(--accent-color), 0 8px 16px rgba(0, 0, 0, 0.2);
}

.hand-card.legal:hover {
  transform: translateY(-8px);
}

.hand-card.dim {
  opacity: 0.45;
}

.hand-card:disabled {
  cursor: default;
}

.hand-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
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
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  padding: 10px 12px;
  border-radius: 12px;
  background: var(--secondary-container);
}

.avatar {
  width: 34px;
  height: 34px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  font-size: 0.8rem;
  font-weight: 700;
  background: var(--accent-gradient);
  color: #fff;
}

.player-name {
  flex: 1;
  min-width: 80px;
  font-weight: 600;
}

.you-badge {
  font-size: 0.65rem;
  font-weight: 700;
  padding: 1px 7px;
  border-radius: 999px;
  background: var(--accent-color);
  color: #fff;
  margin-left: 4px;
}

.ready-chip {
  font-size: 0.75rem;
  font-weight: 600;
  padding: 2px 10px;
  border-radius: 999px;
  background: var(--glass-bg);
}

.ready-chip.ready {
  background: rgba(67, 160, 71, 0.2);
  color: #2e7d32;
}

.game-over .my-score {
  padding: 12px;
  border-radius: 12px;
  background: var(--secondary-container);
}

.game-review {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.review-item {
  padding: 10px 12px;
  border-radius: 12px;
  background: var(--secondary-container);
}

.review-question {
  font-weight: 600;
  margin-bottom: 4px;
}

.question-overlay {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: grid;
  place-items: center;
  box-sizing: border-box;
  padding: 16px;
  background: rgba(0, 0, 0, 0.5);
  animation: uno-overlay-in 0.18s ease-out both;
}

@keyframes uno-overlay-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

.question-card {
  position: relative;
  width: min(560px, 100%);
  max-height: calc(100dvh - 32px);
  overflow-y: auto;
  overflow-x: hidden;
  box-sizing: border-box;
  background: var(--glass-bg);
  color: var(--text-primary);
  border: 1px solid var(--glass-border);
  border-radius: 20px;
  padding: 22px 20px 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.3);
  animation: uno-card-in 0.26s ease-out both;
}

.question-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 4px;
  background: var(--accent-gradient);
  border-radius: 20px 20px 0 0;
  pointer-events: none;
}

@keyframes uno-card-in {
  from { opacity: 0; transform: translateY(10px) scale(0.985); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

.question-head {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.q-badge {
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: 3px 10px;
  border-radius: 999px;
  background: var(--secondary-container);
}

.q-badge.easy { color: #2e7d32; }
.q-badge.medium { color: var(--accent-color); }
.q-badge.hard { color: #c62828; }

[data-theme="dark"] .q-badge.easy { color: #a5d6a7; }
[data-theme="dark"] .q-badge.hard { color: #ef9a9a; }

.penalty-hint {
  font-size: 0.78rem;
  color: var(--text-secondary);
}

.question-text {
  font-size: 1.15rem;
  font-weight: 700;
  line-height: 1.35;
  color: var(--text-primary);
}

.options {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.option-btn {
  display: flex;
  gap: 10px;
  align-items: center;
  text-align: left;
  font: inherit;
  padding: 12px 14px;
  border-radius: 12px;
  border: 2px solid var(--glass-border);
  background: var(--glass-bg);
  color: inherit;
  cursor: pointer;
  transition: border-color 0.16s ease, background 0.16s ease, transform 0.16s ease;
  animation: uno-option-in 0.22s ease-out both;
}

.option-btn:nth-child(1) { animation-delay: 40ms; }
.option-btn:nth-child(2) { animation-delay: 80ms; }
.option-btn:nth-child(3) { animation-delay: 120ms; }
.option-btn:nth-child(4) { animation-delay: 160ms; }

@keyframes uno-option-in {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}

.option-btn:hover:not(:disabled) {
  border-color: var(--accent-color);
  transform: translateY(-1px);
}

.option-btn:focus-visible {
  outline: 3px solid var(--accent-color);
  outline-offset: 2px;
}

.option-btn:disabled {
  opacity: 0.6;
  cursor: default;
}

.option-letter {
  flex: 0 0 auto;
  width: 26px;
  height: 26px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  font-weight: 700;
  background: var(--secondary-container);
  color: var(--text-primary);
}

.question-feedback {
  border-radius: 12px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  animation: uno-option-in 0.2s ease-out both;
}

.question-feedback.ok { background: rgba(67, 160, 71, 0.16); }
.question-feedback.bad { background: rgba(211, 47, 47, 0.14); }
.explanation { font-size: 0.9rem; }

.color-card {
  width: min(420px, 100%);
}

.color-options {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}

.color-option {
  font: inherit;
  font-weight: 700;
  color: #fff;
  border: none;
  border-radius: 14px;
  min-height: 64px;
  cursor: pointer;
}

.color-option.uno-yellow { color: #4a3600; }

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

.btn-primary { background: var(--accent-gradient); color: #fff; }
.btn-secondary { background: var(--secondary-container); color: var(--text-primary); }
.btn-primary:disabled,
.btn-secondary:disabled { opacity: 0.55; cursor: not-allowed; }

.link-btn {
  font: inherit;
  font-weight: 600;
  background: none;
  border: none;
  padding: 6px;
  color: var(--accent-color);
  cursor: pointer;
  text-decoration: underline;
}

.link-btn.danger { color: var(--bad); }

.floating-toasts {
  position: fixed;
  right: 16px;
  bottom: 16px;
  z-index: 90;
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-width: 320px;
}

.floating-toast {
  padding: 10px 14px;
  border-radius: 12px;
  font-size: 0.9rem;
  font-weight: 600;
  color: #fff;
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.25);
}

.floating-toast.ok { background: #2e7d32; }
.floating-toast.ko { background: #c62828; }
.floating-toast.info { background: #455a64; }

.game-card {
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  border-radius: 16px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.game-card h2 { font-size: 1.1rem; font-weight: 600; }

.muted { color: var(--text-secondary); }
.small { font-size: 0.85rem; }

@media (max-width: 560px) {
  .table-center { gap: 16px; }
  .top-actions { width: 100%; }
  .question-overlay { padding: 10px; }
  .question-card { padding: 18px 14px 16px; border-radius: 16px; }
  .question-card::before { border-radius: 16px 16px 0 0; }
  .question-text { font-size: 1.05rem; }
}

/* Animaciones suaves sin coste continuo: solo transform/opacity, y se apagan
   si el usuario pide menos movimiento (o tiene reducedMotion activado). */
@media (prefers-reduced-motion: reduce) {
  .question-overlay,
  .question-card,
  .option-btn {
    animation: none !important;
  }

  .option-btn:hover:not(:disabled) {
    transform: none;
  }
}
</style>

<style>
/* El hueco del sidebar y el centrado los resuelve la regla compartida del final
   de styles.css (familia A). Aquí solo se declaran ancho y relleno. */
:where(body[data-page="game_room"]) .uno-page {
  --page-max: 980px;
  --page-pad: 16px;
  box-sizing: border-box;
  max-width: var(--page-max);
  margin: 0 auto;
  padding: 16px 16px 64px;
}

@media (max-width: 640px) {
  :where(body[data-page="game_room"]) .uno-page {
    --page-pad: 10px;
    padding: 10px 10px 48px;
  }
}

/* El modal de preguntas y el selector de color respetan el hueco del sidebar:
   el fondo cubre toda la pantalla, pero la tarjeta se centra en el área libre. */
@media (min-width: 769px) {
  .mobile-sidebar~.uno-page .question-overlay {
    padding-left: calc(var(--sidebar-w) + 16px);
  }

  .mobile-sidebar.collapsed~.uno-page .question-overlay {
    padding-left: calc(var(--sidebar-w-collapsed) + 16px);
  }
}
</style>

