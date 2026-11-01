<template>
  <header class="header">
    <MenuToggle />
    <div class="header-title">Actividad de la tarea</div>
  </header>

  <div class="activity-container">
    <div v-if="state === 'loading'" class="loading-state">
      <div class="loading-spinner"></div>
      <p>Preparando tu actividad con IA...</p>
    </div>

    <div v-else-if="state === 'error'" class="empty-state">
      <span class="empty-state-icon">⚠️</span>
      <h3>No se pudo abrir la actividad</h3>
      <p>{{ error }}</p>
      <button class="activity-btn secondary" @click="backToTask">Volver a la tarea</button>
    </div>

    <template v-else-if="payload || result">
      <div v-if="payload" class="activity-hero">
        <span class="activity-badge">{{ TYPE_LABELS[type] }}</span>
        <p class="activity-hint">{{ payload.instructions || TYPE_HINTS[type] }}</p>
      </div>

      <!-- FLASHCARDS -->
      <template v-if="!result">
      <section v-if="type === 'flashcards'" class="activity-card">
        <div class="activity-progress">
          <span>Tarjeta {{ cardIndex + 1 }} / {{ payload.cards.length }}</span>
          <span v-if="payload.cards[cardIndex]?.due" class="due-chip">Para repasar hoy</span>
        </div>
        <div class="flashcard">
          <div class="flashcard-front">{{ payload.cards[cardIndex]?.front }}</div>
        </div>
        <label class="activity-label" :for="`card-answer-${cardIndex}`">Tu respuesta</label>
        <textarea
          :id="`card-answer-${cardIndex}`"
          v-model="cardAnswers[cardIndex]"
          class="activity-textarea"
          rows="3"
          placeholder="Escribe lo que recuerdes..."
        ></textarea>
        <div class="activity-actions">
          <button class="activity-btn secondary" :disabled="cardIndex === 0" @click="cardIndex--">Anterior</button>
          <button v-if="cardIndex < payload.cards.length - 1" class="activity-btn" @click="cardIndex++">Siguiente</button>
          <button v-else class="activity-btn" :disabled="grading" @click="submitActivity">
            {{ grading ? 'Calificando...' : 'Calificar flashcards' }}
          </button>
        </div>
        <p class="activity-note">La repetición espaciada programará tu próximo repaso según tus aciertos.</p>
      </section>

      <!-- DETECTA EL ERROR -->
      <section v-else-if="type === 'find_error'" class="activity-card">
        <p class="activity-instruction">{{ payload.instructions }}</p>
        <div v-for="sentence in payload.sentences" :key="sentence.index" class="sentence-row">
          <label class="sentence-check">
            <input v-model="selectedSentences" type="checkbox" :value="sentence.index">
            <span class="sentence-text">{{ sentence.text }}</span>
          </label>
          <input
            v-if="selectedSentences.includes(sentence.index)"
            v-model="corrections[sentence.index]"
            class="sentence-input"
            type="text"
            placeholder="¿Cuál sería la versión correcta? (opcional)"
          >
        </div>
        <div class="activity-actions">
          <button class="activity-btn" :disabled="grading" @click="submitActivity">
            {{ grading ? 'Calificando...' : 'Entregar detección' }}
          </button>
        </div>
      </section>

      <!-- RECUERDO LIBRE -->
      <section v-else-if="type === 'recall'" class="activity-card">
        <h3 class="activity-question">{{ payload.prompt }}</h3>
        <label class="activity-label" for="recall-answer">Escribe todo lo que recuerdes</label>
        <textarea
          id="recall-answer"
          v-model="recallText"
          class="activity-textarea"
          rows="10"
          placeholder="Explica el tema con tus propias palabras..."
        ></textarea>
        <div class="activity-actions">
          <button class="activity-btn" :disabled="grading || recallText.trim().length < 20" @click="submitActivity">
            {{ grading ? 'Evaluando...' : 'Entregar recuerdo' }}
          </button>
        </div>
      </section>

      <!-- RESUMEN CON LÍMITE -->
      <section v-else-if="type === 'summary'" class="activity-card">
        <details class="source-box">
          <summary>Leer el texto fuente</summary>
          <p>{{ payload.source_text }}</p>
        </details>
        <label class="activity-label" for="summary-answer">
          Tu resumen ({{ summaryWords }} / {{ payload.min_words }}-{{ payload.max_words }} palabras)
        </label>
        <textarea
          id="summary-answer"
          v-model="summaryText"
          class="activity-textarea"
          rows="8"
          :placeholder="`Resume en ${payload.min_words}-${payload.max_words} palabras...`"
        ></textarea>
        <div class="activity-actions">
          <button class="activity-btn" :disabled="grading || summaryWords < 5" @click="submitActivity">
            {{ grading ? 'Evaluando...' : 'Entregar resumen' }}
          </button>
        </div>
      </section>

      <!-- MAPA CONCEPTUAL -->
      <section v-else-if="type === 'concept_map'" class="activity-card">
        <p class="activity-instruction">{{ payload.instructions }}</p>
        <div class="concepts-grid">
          <span v-for="concept in payload.concepts" :key="concept" class="concept-chip">{{ concept }}</span>
        </div>
        <div class="edge-form">
          <select v-model="edgeFrom" class="edge-select">
            <option value="" disabled>Desde...</option>
            <option v-for="concept in payload.concepts" :key="`from-${concept}`" :value="concept">{{ concept }}</option>
          </select>
          <select v-model="edgeTo" class="edge-select">
            <option value="" disabled>Hacia...</option>
            <option v-for="concept in payload.concepts" :key="`to-${concept}`" :value="concept">{{ concept }}</option>
          </select>
          <input v-model="edgeLabel" class="edge-input" type="text" placeholder="Relación (ej: causa)">
          <button class="activity-btn small" :disabled="!canAddEdge" @click="addEdge">Añadir</button>
        </div>
        <p class="activity-note">{{ edges.length }} / {{ payload.max_edges }} relaciones añadidas</p>
        <div v-if="edges.length" class="edge-list">
          <div v-for="(edge, index) in edges" :key="`${edge.from}-${edge.to}-${index}`" class="edge-item">
            <span>{{ edge.from }} → {{ edge.to }} <em>({{ edge.label }})</em></span>
            <button class="edge-remove" @click="edges.splice(index, 1)">✕</button>
          </div>
        </div>
        <div class="activity-actions">
          <button class="activity-btn" :disabled="grading || edges.length < 3" @click="submitActivity">
            {{ grading ? 'Evaluando...' : 'Entregar mapa' }}
          </button>
        </div>
      </section>
      </template>

      <!-- RESULTADO -->
      <section v-if="result" class="activity-card result-card">
        <div class="result-score">
          <span class="result-number">{{ result.score }}</span>
          <span class="result-max">/ {{ result.max_score }}</span>
        </div>
        <div class="result-feedback">
          <div v-for="item in feedbackItems" :key="item.label" class="feedback-row">
            <strong>{{ item.label }}:</strong> <span>{{ item.value }}</span>
          </div>
          <p class="feedback-general">{{ result.feedback?.general }}</p>
        </div>

        <div v-if="type === 'flashcards' && result.details?.results" class="result-details">
          <div v-for="item in result.details.results" :key="item.index" class="detail-row" :class="{ ok: item.correct, bad: !item.correct }">
            <span class="detail-icon">{{ item.correct ? '✅' : '❌' }}</span>
            <div>
              <p class="detail-question">{{ payload.cards[item.index]?.front }}</p>
              <p class="detail-answer">Respuesta: {{ item.back }}</p>
              <p v-if="!item.correct" class="detail-note">Tu respuesta: {{ item.answer || 'Sin respuesta' }}</p>
            </div>
          </div>
        </div>

        <div v-else-if="type === 'find_error' && result.details?.sentences" class="result-details">
          <div v-for="sentence in result.details.sentences" :key="sentence.index" class="detail-row" :class="{ ok: sentence.selected === sentence.has_error, bad: sentence.selected !== sentence.has_error }">
            <span class="detail-icon">{{ sentence.selected === sentence.has_error ? '✅' : '❌' }}</span>
            <div>
              <p class="detail-question">{{ sentence.text }}</p>
              <p class="detail-answer">{{ sentence.has_error ? `Error: ${sentence.correction}` : 'Esta oración era correcta.' }}</p>
              <p class="detail-note">{{ sentence.explanation }}</p>
            </div>
          </div>
        </div>

        <div v-else-if="(type === 'recall' || type === 'summary') && result.details" class="result-details">
          <p v-if="result.details.missing?.length" class="detail-note"><strong>Faltó:</strong> {{ result.details.missing.join(', ') }}</p>
          <p v-if="result.details.misconceptions?.length" class="detail-note"><strong>Revisa:</strong> {{ result.details.misconceptions.join('; ') }}</p>
          <p v-if="type === 'summary'" class="detail-note"><strong>Palabras:</strong> {{ result.details.words }} (límite {{ result.details.min_words }}-{{ result.details.max_words }})</p>
        </div>

        <div v-else-if="type === 'concept_map' && result.details" class="result-details">
          <p v-if="result.details.missing?.length" class="detail-note">
            <strong>Relaciones esperadas que faltaron:</strong> {{ missingEdgesText }}
          </p>
          <p v-if="result.details.extra?.length" class="detail-note">
            <strong>Relaciones fuera de la referencia:</strong> {{ extraEdgesText }}
          </p>
        </div>

        <div class="activity-actions">
          <button class="activity-btn secondary" @click="backToTask">Volver a la tarea</button>
        </div>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import MenuToggle from '@/components/MenuToggle.vue';
import { api, errorMessage } from '@/lib/api';
import { goToPage } from '@/lib/pages';

type ActivityType = 'flashcards' | 'find_error' | 'recall' | 'summary' | 'concept_map';

const TYPE_LABELS: Record<ActivityType, string> = {
  flashcards: 'Flashcards con repetición espaciada',
  find_error: 'Detecta el error',
  recall: 'Recuerdo libre',
  summary: 'Resumen con límite',
  concept_map: 'Mapa conceptual simple',
};

const TYPE_HINTS: Record<ActivityType, string> = {
  flashcards: 'Recuerda la respuesta de cada tarjeta. Tus aciertos programan el próximo repaso.',
  find_error: 'Marca las oraciones que contienen un error y explica la corrección.',
  recall: 'Escribe todo lo que recuerdes sin consultar el material.',
  summary: 'Resume el texto respetando el límite de palabras.',
  concept_map: 'Conecta los conceptos con relaciones breves y correctas.',
};

interface FeedbackItem {
  label: string;
  value: string;
}

interface GradeResult {
  success: boolean;
  score: number;
  max_score: number;
  feedback: Record<string, string>;
  details?: any;
}

const route = useRoute();
const router = useRouter();
const assignmentId = computed(() => (typeof route.query.id === 'string' ? route.query.id : ''));
const type = computed<ActivityType>(() => {
  const value = typeof route.query.type === 'string' ? route.query.type : '';
  return (value in TYPE_LABELS ? value : 'flashcards') as ActivityType;
});

const state = ref<'loading' | 'ready' | 'error'>('loading');
const error = ref('');
const payload = ref<any>(null);
const grading = ref(false);
const result = ref<GradeResult | null>(null);

const cardIndex = ref(0);
const cardAnswers = ref<string[]>([]);
const selectedSentences = ref<number[]>([]);
const corrections = ref<Record<number, string>>({});
const recallText = ref('');
const summaryText = ref('');
const edgeFrom = ref('');
const edgeTo = ref('');
const edgeLabel = ref('');
const edges = ref<{ from: string; to: string; label: string }[]>([]);

const summaryWords = computed(() => summaryText.value.trim().split(/\s+/).filter(Boolean).length);

const canAddEdge = computed(() => {
  if (!edgeFrom.value || !edgeTo.value || !edgeLabel.value.trim()) return false;
  if (edgeFrom.value === edgeTo.value) return false;
  if (edges.value.length >= (payload.value?.max_edges || 10)) return false;
  const exists = edges.value.some((edge) =>
    (edge.from === edgeFrom.value && edge.to === edgeTo.value)
    || (edge.from === edgeTo.value && edge.to === edgeFrom.value));
  return !exists;
});

const feedbackItems = computed<FeedbackItem[]>(() => {
  const feedback = result.value?.feedback || {};
  return Object.entries(feedback)
    .filter(([key]) => key !== 'general')
    .map(([key, value]) => ({
      label: key.replace(/_/g, ' ').replace(/^\w/, (letter) => letter.toUpperCase()),
      value: String(value),
    }));
});

const missingEdgesText = computed(() => {
  const missing = result.value?.details?.missing || [];
  return missing.map((edge: any) => `${edge.from} → ${edge.to}`).join('; ');
});

const extraEdgesText = computed(() => {
  const extra = result.value?.details?.extra || [];
  return extra.map((edge: any) => `${edge.from} → ${edge.to} (${edge.label})`).join('; ');
});

function resetLocalState() {
  payload.value = null;
  cardIndex.value = 0;
  cardAnswers.value = [];
  selectedSentences.value = [];
  corrections.value = {};
  recallText.value = '';
  summaryText.value = '';
  edgeFrom.value = '';
  edgeTo.value = '';
  edgeLabel.value = '';
  edges.value = [];
  result.value = null;
}

async function load() {
  if (!assignmentId.value) {
    state.value = 'error';
    error.value = 'Falta el id de la tarea en la URL.';
    return;
  }
  state.value = 'loading';
  error.value = '';
  resetLocalState();
  try {
    const { ok, status, data } = await api.post<any>('/api/activity/start', {
      assignment_id: assignmentId.value,
      type: type.value,
    });
    if (!ok) throw new Error(errorMessage(data, `Error ${status}`));
    if (data.already_graded) {
      result.value = {
        success: true,
        score: Number(data.score) || 0,
        max_score: Number(data.max_score) || 0,
        feedback: data.feedback || {},
      };
      state.value = 'ready';
      return;
    }
    payload.value = data;
    if (type.value === 'flashcards') {
      cardAnswers.value = Array((data.cards || []).length).fill('');
    }
    state.value = 'ready';
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
    state.value = 'error';
  }
}

function addEdge() {
  if (!canAddEdge.value) return;
  edges.value.push({ from: edgeFrom.value, to: edgeTo.value, label: edgeLabel.value.trim() });
  edgeFrom.value = '';
  edgeTo.value = '';
  edgeLabel.value = '';
}

function buildAnswers(): any {
  if (type.value === 'flashcards') {
    return {
      answers: (payload.value?.cards || []).map((card: any, index: number) => ({
        card_index: index,
        answer: cardAnswers.value[index] || '',
      })),
    };
  }
  if (type.value === 'find_error') {
    return { selected: selectedSentences.value, corrections: corrections.value };
  }
  if (type.value === 'recall') return { text: recallText.value };
  if (type.value === 'summary') return { text: summaryText.value };
  return { edges: edges.value };
}

async function submitActivity() {
  if (grading.value) return;
  if (type.value === 'flashcards' && cardAnswers.value.every((answer) => !answer.trim())) {
    alert('Escribe al menos una respuesta antes de calificar.');
    return;
  }
  grading.value = true;
  try {
    const { ok, status, data } = await api.post<GradeResult & { error?: string }>('/api/activity/grade', {
      assignment_id: assignmentId.value,
      type: type.value,
      answers: buildAnswers(),
    });
    if (!ok) throw new Error(errorMessage(data, `Error ${status}`));
    result.value = data;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (err) {
    alert(err instanceof Error ? err.message : String(err));
  } finally {
    grading.value = false;
  }
}

function backToTask() {
  goToPage(router, 'classroom_details', `id=${encodeURIComponent(assignmentId.value)}`);
}

onMounted(() => {
  void load();
});
</script>

<style>
:where(body[data-page="activity"]) .activity-container {
  max-width: 820px;
  margin: 0 auto;
  padding: 1.25rem 1rem 3rem;
}

:where(body[data-page="activity"]) .activity-hero {
  margin-bottom: 1rem;
}

:where(body[data-page="activity"]) .activity-badge {
  display: inline-block;
  padding: .3rem .7rem;
  border-radius: 999px;
  background: var(--accent-primary, #6c63ff);
  color: #fff;
  font-size: .78rem;
  font-weight: 600;
}

:where(body[data-page="activity"]) .activity-hint {
  margin: .6rem 0 0;
  color: var(--text-secondary, #888);
  font-size: .92rem;
}

:where(body[data-page="activity"]) .activity-card {
  background: var(--surface, rgba(255, 255, 255, .04));
  border: 1px solid var(--glass-border, rgba(255, 255, 255, .12));
  border-radius: 16px;
  padding: 1.25rem;
  margin-bottom: 1rem;
}

:where(body[data-page="activity"]) .activity-progress {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: .85rem;
  color: var(--text-secondary, #888);
  margin-bottom: .75rem;
}

:where(body[data-page="activity"]) .due-chip {
  background: rgba(108, 99, 255, .18);
  color: var(--accent-primary, #6c63ff);
  border-radius: 999px;
  padding: .15rem .6rem;
  font-weight: 600;
}

:where(body[data-page="activity"]) .flashcard {
  min-height: 180px;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 1.5rem;
  border-radius: 14px;
  background: var(--secondary-container, rgba(108, 99, 255, .08));
  border: 1px solid var(--glass-border, rgba(255, 255, 255, .12));
  margin-bottom: 1rem;
}

:where(body[data-page="activity"]) .flashcard-front {
  font-size: 1.15rem;
  font-weight: 600;
  line-height: 1.45;
}

:where(body[data-page="activity"]) .activity-label {
  display: block;
  font-size: .85rem;
  color: var(--text-secondary, #888);
  margin-bottom: .4rem;
}

:where(body[data-page="activity"]) .activity-textarea,
:where(body[data-page="activity"]) .sentence-input,
:where(body[data-page="activity"]) .edge-input,
:where(body[data-page="activity"]) .edge-select {
  width: 100%;
  background: var(--surface, rgba(255, 255, 255, .04));
  color: var(--text-primary, #eee);
  border: 1px solid var(--glass-border, rgba(255, 255, 255, .14));
  border-radius: 10px;
  padding: .7rem .8rem;
  font-size: .95rem;
  font-family: inherit;
}

:where(body[data-page="activity"]) .activity-textarea:focus,
:where(body[data-page="activity"]) .sentence-input:focus,
:where(body[data-page="activity"]) .edge-input:focus {
  outline: none;
  border-color: var(--accent-primary, #6c63ff);
}

:where(body[data-page="activity"]) .activity-actions {
  display: flex;
  gap: .6rem;
  flex-wrap: wrap;
  margin-top: 1rem;
}

:where(body[data-page="activity"]) .activity-btn {
  background: var(--accent-primary, #6c63ff);
  color: #fff;
  border: none;
  border-radius: 10px;
  padding: .65rem 1.1rem;
  font-weight: 600;
  cursor: pointer;
}

:where(body[data-page="activity"]) .activity-btn.secondary {
  background: transparent;
  color: var(--text-primary, #eee);
  border: 1px solid var(--glass-border, rgba(255, 255, 255, .2));
}

:where(body[data-page="activity"]) .activity-btn.small {
  padding: .5rem .8rem;
  white-space: nowrap;
}

:where(body[data-page="activity"]) .activity-btn:disabled {
  opacity: .45;
  cursor: not-allowed;
}

:where(body[data-page="activity"]) .activity-note {
  margin: .7rem 0 0;
  font-size: .8rem;
  color: var(--text-secondary, #888);
}

:where(body[data-page="activity"]) .activity-instruction,
:where(body[data-page="activity"]) .activity-question {
  margin: 0 0 1rem;
  line-height: 1.5;
}

:where(body[data-page="activity"]) .sentence-row {
  margin-bottom: .85rem;
}

:where(body[data-page="activity"]) .sentence-check {
  display: flex;
  gap: .6rem;
  align-items: flex-start;
  cursor: pointer;
  line-height: 1.5;
}

:where(body[data-page="activity"]) .sentence-check input {
  margin-top: .3rem;
  accent-color: var(--accent-primary, #6c63ff);
}

:where(body[data-page="activity"]) .sentence-input {
  margin-top: .5rem;
}

:where(body[data-page="activity"]) .source-box {
  background: var(--secondary-container, rgba(108, 99, 255, .08));
  border-radius: 12px;
  padding: .8rem 1rem;
  margin-bottom: 1rem;
  line-height: 1.6;
}

:where(body[data-page="activity"]) .source-box summary {
  cursor: pointer;
  font-weight: 600;
}

:where(body[data-page="activity"]) .concepts-grid {
  display: flex;
  flex-wrap: wrap;
  gap: .5rem;
  margin-bottom: 1rem;
}

:where(body[data-page="activity"]) .concept-chip {
  background: var(--secondary-container, rgba(108, 99, 255, .12));
  border: 1px solid var(--glass-border, rgba(255, 255, 255, .14));
  border-radius: 999px;
  padding: .35rem .75rem;
  font-size: .85rem;
}

:where(body[data-page="activity"]) .edge-form {
  display: grid;
  grid-template-columns: 1fr 1fr 1.4fr auto;
  gap: .5rem;
  align-items: center;
}

:where(body[data-page="activity"]) .edge-list {
  margin-top: .8rem;
  display: flex;
  flex-direction: column;
  gap: .4rem;
}

:where(body[data-page="activity"]) .edge-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: .5rem;
  font-size: .88rem;
  background: var(--surface, rgba(255, 255, 255, .04));
  border-radius: 8px;
  padding: .45rem .6rem;
}

:where(body[data-page="activity"]) .edge-remove {
  background: transparent;
  border: none;
  color: var(--text-secondary, #888);
  cursor: pointer;
  font-size: .9rem;
}

:where(body[data-page="activity"]) .result-card {
  text-align: left;
}

:where(body[data-page="activity"]) .result-score {
  display: flex;
  align-items: baseline;
  gap: .4rem;
  margin-bottom: .8rem;
}

:where(body[data-page="activity"]) .result-number {
  font-size: 2.4rem;
  font-weight: 700;
  color: var(--accent-primary, #6c63ff);
}

:where(body[data-page="activity"]) .result-max {
  color: var(--text-secondary, #888);
}

:where(body[data-page="activity"]) .feedback-row {
  margin-bottom: .45rem;
  font-size: .9rem;
  line-height: 1.5;
}

:where(body[data-page="activity"]) .feedback-general {
  margin-top: .7rem;
  font-weight: 600;
}

:where(body[data-page="activity"]) .result-details {
  margin-top: 1rem;
  display: flex;
  flex-direction: column;
  gap: .6rem;
}

:where(body[data-page="activity"]) .detail-row {
  display: flex;
  gap: .6rem;
  padding: .7rem;
  border-radius: 10px;
  background: var(--surface, rgba(255, 255, 255, .04));
  border-left: 3px solid transparent;
}

:where(body[data-page="activity"]) .detail-row.ok {
  border-left-color: #22c55e;
}

:where(body[data-page="activity"]) .detail-row.bad {
  border-left-color: #ef4444;
}

:where(body[data-page="activity"]) .detail-question {
  margin: 0 0 .25rem;
  font-weight: 600;
}

:where(body[data-page="activity"]) .detail-answer {
  margin: 0;
  font-size: .88rem;
  color: var(--text-secondary, #bbb);
}

:where(body[data-page="activity"]) .detail-note {
  margin: .3rem 0 0;
  font-size: .82rem;
  color: var(--text-secondary, #888);
}

@media (max-width: 640px) {
  :where(body[data-page="activity"]) .edge-form {
    grid-template-columns: 1fr;
  }
}
</style>
