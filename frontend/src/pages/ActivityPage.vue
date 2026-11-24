<template>
  <header class="header">
    <MenuToggle />
    <div class="header-title">Actividad de la tarea</div>
  </header>

  <div class="activity-container" :class="{ 'map-wide': type === 'concept_map' && !result }">
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
        <p v-if="type !== 'concept_map'" class="activity-hint">{{ payload.instructions || TYPE_HINTS[type] }}</p>
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
        <p class="activity-note map-help">
          Arrastra los conceptos para acomodarlos en el lienzo. Para unirlos, arrastra desde un punto de un concepto hasta otro concepto y escribe la relación sobre la línea.
        </p>
        <div ref="scrollRef" class="map-scroll">
          <div ref="boardRef" class="map-board" :style="{ width: boardW + 'px', height: boardH + 'px' }">
            <svg class="map-lines" :width="boardW" :height="boardH">
              <line
                v-for="line in edgeLines"
                :key="`line-${line.id}`"
                :x1="line.x1"
                :y1="line.y1"
                :x2="line.x2"
                :y2="line.y2"
                class="map-line"
              />
              <line
                v-if="linkPreview"
                :x1="linkPreview.x1"
                :y1="linkPreview.y1"
                :x2="linkPreview.x2"
                :y2="linkPreview.y2"
                class="map-line preview"
              />
            </svg>

            <div
              v-for="node in nodes"
              :key="node.id"
              class="map-node"
              :class="{ source: linkSource?.nodeId === node.id, target: linkTargetId === node.id }"
              :style="{ left: node.x + 'px', top: node.y + 'px', width: NODE_W + 'px', height: NODE_H + 'px' }"
              @pointerdown.stop="startDrag(node, $event)"
            >
              <span class="map-node-text">{{ node.concept }}</span>
              <span
                v-for="side in SIDES"
                :key="side"
                class="map-point"
                :class="`point-${side}`"
                @pointerdown.stop="startLink(node, side, $event)"
              ></span>
            </div>

            <div
              v-for="edge in edges"
              :key="`label-${edge.id}`"
              class="map-edge-label"
              :style="edgeLabelStyle(edge)"
            >
              <input
                v-model="edge.label"
                class="map-edge-input"
                :data-edge-id="edge.id"
                type="text"
                placeholder="relación"
                @pointerdown.stop
              >
              <button class="map-edge-remove" title="Eliminar relación" @pointerdown.stop @click="removeEdge(edge.id)">✕</button>
            </div>
          </div>
        </div>
        <p class="activity-note">
          {{ labeledEdgeCount }} relación(es) con texto · {{ edges.length }} enlace(s) trazado(s)
        </p>
        <div class="activity-actions">
          <button class="activity-btn" :disabled="grading || labeledEdgeCount < 3" @click="submitActivity">
            {{ grading ? 'Evaluando...' : 'Entregar mapa' }}
          </button>
        </div>
      </section>

      <!-- PREDICE LA SALIDA (4 retos) -->
      <section v-else-if="type === 'predict_output'" class="activity-card multistep">
        <p class="activity-instruction">{{ payload.instructions }}</p>
        <div class="question-stepper">
          <button
            v-for="qIndex in questionCount"
            :key="`pdot-${qIndex}`"
            class="stepper-dot"
            :class="{ active: qIndex - 1 === questionIndex, done: predictAnswers[qIndex - 1] !== null && predictAnswers[qIndex - 1] !== undefined }"
            :title="`Reto ${qIndex}`"
            @click="goToQuestion(qIndex - 1)"
          >{{ qIndex }}</button>
          <span class="stepper-progress"><span class="stepper-fill" :style="{ width: progressPercent }"></span></span>
        </div>
        <Transition name="q-slide" mode="out-in">
          <div :key="`pq-${questionIndex}`" class="question-body">
            <div class="question-meta">
              <span class="question-count">Reto {{ questionIndex + 1 }} / {{ questionCount }}</span>
              <span class="difficulty-chip" :class="`diff-${questionIndex}`">{{ difficultyLabel(questionIndex) }}</span>
              <span class="activity-note">Lenguaje: {{ currentQuestion?.language }}</span>
            </div>
            <pre class="code-block"><code>{{ currentQuestion?.code }}</code></pre>
            <div class="predict-options">
              <label
                v-for="(option, index) in currentQuestion?.options || []"
                :key="index"
                class="predict-option"
                :class="{ selected: predictAnswers[questionIndex] === index }"
              >
                <input v-model="predictAnswers[questionIndex]" type="radio" :value="index">
                <span class="predict-letter">{{ optionLetter(Number(index)) }}</span>
                <pre class="predict-output">{{ option }}</pre>
              </label>
            </div>
          </div>
        </Transition>
        <div class="activity-actions q-nav">
          <button class="activity-btn secondary" :disabled="questionIndex === 0" @click="prevQuestion">Anterior</button>
          <button v-if="questionIndex < questionCount - 1" class="activity-btn" @click="nextQuestion">Siguiente</button>
          <button v-else class="activity-btn" :disabled="grading || !allPredictAnswered" @click="submitActivity">
            {{ grading ? 'Evaluando...' : 'Entregar 4 retos' }}
          </button>
        </div>
      </section>

      <!-- ENCUENTRA EL BUG EN EL CÓDIGO (4 retos) -->
      <section v-else-if="type === 'find_bug'" class="activity-card multistep">
        <p class="activity-instruction">{{ payload.instructions }}</p>
        <div class="question-stepper">
          <button
            v-for="qIndex in questionCount"
            :key="`bdot-${qIndex}`"
            class="stepper-dot"
            :class="{ active: qIndex - 1 === questionIndex, done: (bugAnswers[qIndex - 1]?.length || 0) > 0 }"
            :title="`Reto ${qIndex}`"
            @click="goToQuestion(qIndex - 1)"
          >{{ qIndex }}</button>
          <span class="stepper-progress"><span class="stepper-fill" :style="{ width: progressPercent }"></span></span>
        </div>
        <Transition name="q-slide" mode="out-in">
          <div :key="`bq-${questionIndex}`" class="question-body">
            <div class="question-meta">
              <span class="question-count">Reto {{ questionIndex + 1 }} / {{ questionCount }}</span>
              <span class="difficulty-chip" :class="`diff-${questionIndex}`">{{ difficultyLabel(questionIndex) }}</span>
              <span class="activity-note">Lenguaje: {{ currentQuestion?.language }}</span>
            </div>
            <div class="bug-toolbar">
              <span class="bug-hint">Toca las líneas que contengan el error.</span>
              <span class="bug-count" :class="{ active: currentBugSelected.length > 0 }">
                {{ currentBugSelected.length }} marcada{{ currentBugSelected.length === 1 ? '' : 's' }}
              </span>
            </div>
            <div class="code-block code-lines">
              <label
                v-for="(line, index) in currentBugLines"
                :key="index"
                class="code-line"
                :class="{ selected: currentBugSelected.includes(index + 1) }"
              >
                <input v-model="bugAnswers[questionIndex]" type="checkbox" :value="index + 1">
                <span class="code-line-check" aria-hidden="true"></span>
                <span class="code-line-number">{{ index + 1 }}</span>
                <code class="code-line-text">{{ line || ' ' }}</code>
              </label>
            </div>
          </div>
        </Transition>
        <div class="activity-actions q-nav">
          <button class="activity-btn secondary" :disabled="questionIndex === 0" @click="prevQuestion">Anterior</button>
          <button v-if="questionIndex < questionCount - 1" class="activity-btn" @click="nextQuestion">Siguiente</button>
          <button v-else class="activity-btn" :disabled="grading || !allBugAnswered" @click="submitActivity">
            {{ grading ? 'Evaluando...' : 'Entregar 4 retos' }}
          </button>
        </div>
      </section>

      <!-- ORDENA EL CÓDIGO (4 retos) -->
      <section v-else-if="type === 'order_code'" class="activity-card multistep">
        <p class="activity-instruction">{{ payload.instructions }}</p>
        <div class="question-stepper">
          <button
            v-for="qIndex in questionCount"
            :key="`odot-${qIndex}`"
            class="stepper-dot"
            :class="{ active: qIndex - 1 === questionIndex, done: orderTouched[qIndex - 1] }"
            :title="`Reto ${qIndex}`"
            @click="goToQuestion(qIndex - 1)"
          >{{ qIndex }}</button>
          <span class="stepper-progress"><span class="stepper-fill" :style="{ width: progressPercent }"></span></span>
        </div>
        <Transition name="q-slide" mode="out-in">
          <div :key="`oq-${questionIndex}`" class="question-body">
            <div class="question-meta">
              <span class="question-count">Reto {{ questionIndex + 1 }} / {{ questionCount }}</span>
              <span class="difficulty-chip" :class="`diff-${questionIndex}`">{{ difficultyLabel(questionIndex) }}</span>
              <span class="activity-note">Lenguaje: {{ currentQuestion?.language }}</span>
            </div>
            <div class="code-block order-list">
              <div
                v-for="(line, index) in currentOrderLines"
                :key="line.id"
                class="order-line"
                :class="{ moved: line.id !== currentOriginalIds[index] }"
              >
                <span class="code-line-number">{{ index + 1 }}</span>
                <pre class="code-line-text">{{ line.text }}</pre>
                <span class="order-actions">
                  <button class="order-btn" :disabled="index === 0" @click="moveLine(index, -1)">↑</button>
                  <button class="order-btn" :disabled="index === currentOrderLines.length - 1" @click="moveLine(index, 1)">↓</button>
                </span>
              </div>
            </div>
          </div>
        </Transition>
        <div class="activity-actions q-nav">
          <button class="activity-btn secondary" :disabled="questionIndex === 0" @click="prevQuestion">Anterior</button>
          <button v-if="questionIndex < questionCount - 1" class="activity-btn" @click="nextQuestion">Siguiente</button>
          <button v-else class="activity-btn" :disabled="grading" @click="submitActivity">
            {{ grading ? 'Evaluando...' : 'Entregar 4 retos' }}
          </button>
        </div>
      </section>
      </template>

      <!-- RESULTADO -->
      <section v-if="result" class="activity-card result-card">
        <div class="result-score">
          <template v-if="result.formative">
            <span class="result-max">Práctica formativa · no cuenta para la nota</span>
          </template>
          <template v-else>
            <span class="result-number">{{ result.score }}</span>
            <span class="result-max">/ {{ result.max_score }}</span>
          </template>
        </div>
        <div class="result-feedback">
          <div v-for="item in feedbackItems" :key="item.label" class="feedback-row">
            <strong>{{ item.label }}:</strong> <span>{{ item.value }}</span>
          </div>
          <p class="feedback-general">{{ result.feedback?.general }}</p>
        </div>

        <h3 v-if="hasReview" class="activity-question" style="margin-top:1rem;">Repaso de errores</h3>

        <div v-if="type === 'flashcards' && result.details?.results" class="result-details">
          <div v-for="item in result.details.results" :key="item.index" class="detail-row" :class="{ ok: item.correct, bad: !item.correct }">
            <span class="detail-icon">{{ item.correct ? '✅' : '❌' }}</span>
            <div>
              <p class="detail-question">{{ item.front || payload?.cards?.[item.index]?.front }}</p>
              <p class="detail-answer">Respuesta esperada: {{ item.back }}</p>
              <p v-if="!item.correct" class="detail-note">Tu respuesta: {{ item.answer || 'Sin respuesta' }}</p>
              <p v-if="item.feedback" class="detail-note">{{ item.feedback }}</p>
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

        <div v-else-if="type === 'predict_output' && result.details?.results" class="result-details">
          <div
            v-for="item in result.details.results"
            :key="`pr-${item.index}`"
            class="question-result"
            :class="item.correct ? 'ok' : 'bad'"
          >
            <div class="question-result-head">
              <span class="detail-icon">{{ item.correct ? '✅' : '❌' }}</span>
              <strong>Reto {{ item.index + 1 }} · {{ item.language }}</strong>
            </div>
            <pre class="code-block"><code>{{ item.code }}</code></pre>
            <div
              v-for="(option, index) in item.options"
              :key="index"
              class="detail-row"
              :class="{
                ok: index === item.correct_index,
                bad: index === item.selected && index !== item.correct_index,
              }"
            >
              <strong>{{ optionLetter(Number(index)) }}.</strong>
              <pre class="predict-output">{{ option }}</pre>
              <span v-if="index === item.correct_index" class="detail-note">Correcta</span>
              <span v-else-if="index === item.selected" class="detail-note">Tu elección</span>
            </div>
            <p v-if="item.explanation" class="detail-note"><strong>Por qué:</strong> {{ item.explanation }}</p>
          </div>
        </div>

        <div v-else-if="type === 'find_bug' && result.details?.results" class="result-details">
          <div
            v-for="item in result.details.results"
            :key="`br-${item.index}`"
            class="question-result"
            :class="item.correct ? 'ok' : 'bad'"
          >
            <div class="question-result-head">
              <span class="detail-icon">{{ item.correct ? '✅' : '❌' }}</span>
              <strong>Reto {{ item.index + 1 }} · {{ item.language }}</strong>
            </div>
            <pre class="code-block"><code>{{ item.code }}</code></pre>
            <div
              v-for="bug in item.bugs"
              :key="bug.line"
              class="detail-row"
              :class="item.selected?.includes(bug.line) ? 'ok' : 'bad'"
            >
              <div>
                <p class="detail-question">Línea {{ bug.line }}</p>
                <p class="detail-answer"><strong>Corrección:</strong> {{ bug.fix }}</p>
                <p class="detail-note">{{ bug.explanation }}</p>
                <p v-if="!item.selected?.includes(bug.line)" class="detail-note">No marcaste esta línea.</p>
              </div>
            </div>
            <p v-if="item.falsePositives" class="detail-note">
              <strong>Líneas marcadas que eran correctas:</strong> {{ falsePositiveLinesOf(item) }}
            </p>
          </div>
        </div>

        <div v-else-if="type === 'order_code' && result.details?.results" class="result-details">
          <div
            v-for="item in result.details.results"
            :key="`or-${item.index}`"
            class="question-result"
            :class="item.correct ? 'ok' : 'bad'"
          >
            <div class="question-result-head">
              <span class="detail-icon">{{ item.correct ? '✅' : '❌' }}</span>
              <strong>Reto {{ item.index + 1 }} · {{ item.language }}</strong>
            </div>
            <p class="detail-note">
              <strong>Coincidencias:</strong> {{ item.matches }} / {{ item.total }}
            </p>
            <div class="order-compare">
              <div>
                <p class="activity-label">Orden correcto</p>
                <pre class="code-block"><code>{{ item.expected.join('\n') }}</code></pre>
              </div>
              <div>
                <p class="activity-label">Tu orden</p>
                <pre class="code-block"><code>{{ item.student.join('\n') }}</code></pre>
              </div>
            </div>
            <p v-if="item.explanation" class="detail-note"><strong>Qué hace:</strong> {{ item.explanation }}</p>
          </div>
        </div>

        <div class="activity-actions">
          <button class="activity-btn" @click="repeatActivity">Repetir actividad</button>
          <button class="activity-btn secondary" @click="backToTask">Volver a la tarea</button>
        </div>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import MenuToggle from '@/components/MenuToggle.vue';
import { api, errorMessage } from '@/lib/api';
import { dialog } from '@/lib/dialog';
import { goToPage } from '@/lib/pages';

type ActivityType =
  | 'flashcards'
  | 'find_error'
  | 'recall'
  | 'summary'
  | 'concept_map'
  | 'predict_output'
  | 'find_bug'
  | 'order_code';

const TYPE_LABELS: Record<ActivityType, string> = {
  flashcards: 'Flashcards con repetición espaciada',
  find_error: 'Detecta el error',
  recall: 'Recuerdo libre',
  summary: 'Resumen con límite',
  concept_map: 'Mapa conceptual simple',
  predict_output: 'Predice la salida',
  find_bug: 'Encuentra el bug',
  order_code: 'Ordena el código',
};

const TYPE_HINTS: Record<ActivityType, string> = {
  flashcards: 'Recuerda la respuesta de cada tarjeta. Tus aciertos programan el próximo repaso.',
  find_error: 'Marca las oraciones que contienen un error y explica la corrección.',
  recall: 'Escribe todo lo que recuerdes sin consultar el material.',
  summary: 'Resume el texto respetando el límite de palabras.',
  concept_map: 'Conecta los conceptos con relaciones breves y correctas.',
  predict_output: 'Resuelve 4 retos de predicción de salida, del más fácil al más difícil.',
  find_bug: 'Encuentra los errores en 4 códigos, cada reto más difícil que el anterior.',
  order_code: 'Ordena 4 fragmentos de código de dificultad creciente.',
};

interface FeedbackItem {
  label: string;
  value: string;
}

interface GradeResult {
  success: boolean;
  score: number;
  max_score: number;
  formative?: boolean;
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
const questionIndex = ref(0);
const predictAnswers = ref<(number | null)[]>([]);
const bugAnswers = ref<number[][]>([]);
const orderAnswers = ref<{ id: string; text: string }[][]>([]);
const orderOriginal = ref<string[][]>([]);
const orderTouched = ref<boolean[]>([]);

const boardW = ref(760);
const boardH = ref(560);
const NODE_W = 156;
const NODE_H = 72;
const MAP_MARGIN = 28;
const COL_GAP = 48;
const ROW_GAP = 72;
const SIDES = ['top', 'right', 'bottom', 'left'] as const;
type Side = (typeof SIDES)[number];
const SIDE_OFFSETS: Record<Side, { x: number; y: number }> = {
  top: { x: NODE_W / 2, y: 0 },
  bottom: { x: NODE_W / 2, y: NODE_H },
  left: { x: 0, y: NODE_H / 2 },
  right: { x: NODE_W, y: NODE_H / 2 },
};

interface MapNode {
  id: string;
  concept: string;
  x: number;
  y: number;
}

interface MapEdge {
  id: string;
  fromId: string;
  toId: string;
  fromSide: Side;
  toSide: Side;
  label: string;
}

const boardRef = ref<HTMLElement | null>(null);
const scrollRef = ref<HTMLElement | null>(null);
const nodes = ref<MapNode[]>([]);
const edges = ref<MapEdge[]>([]);
const linkSource = ref<{ nodeId: string; side: Side } | null>(null);
const linkPointer = ref<{ x: number; y: number } | null>(null);
const linkTargetId = ref<string | null>(null);
let edgeSeq = 0;
let dragState: { id: string; offsetX: number; offsetY: number } | null = null;
let linkState: { nodeId: string; side: Side } | null = null;

const summaryWords = computed(() => summaryText.value.trim().split(/\s+/).filter(Boolean).length);

const questions = computed<any[]>(() => (Array.isArray(payload.value?.questions) ? payload.value.questions : []));
const questionCount = computed(() => questions.value.length);
const currentQuestion = computed<any>(() => questions.value[questionIndex.value] || {});

function splitLines(code: string): string[] {
  return String(code || '').split('\n');
}

const currentBugLines = computed<string[]>(() => splitLines(currentQuestion.value?.code));
const currentBugSelected = computed<number[]>(() => bugAnswers.value[questionIndex.value] || []);
const currentOrderLines = computed<{ id: string; text: string }[]>(() => orderAnswers.value[questionIndex.value] || []);
const currentOriginalIds = computed<string[]>(() => orderOriginal.value[questionIndex.value] || []);

const allPredictAnswered = computed(() =>
  questions.value.length > 0 && questions.value.every((_, index) => {
    const value = predictAnswers.value[index];
    return value !== null && value !== undefined;
  }),
);
const allBugAnswered = computed(() =>
  questions.value.length > 0 && questions.value.every((_, index) => (bugAnswers.value[index]?.length || 0) > 0),
);
const progressPercent = computed(() => {
  if (questionCount.value <= 1) return '0%';
  return `${(questionIndex.value / (questionCount.value - 1)) * 100}%`;
});

const DIFFICULTY_LABELS = ['Fácil', 'Intermedio', 'Difícil', 'Muy difícil'];

function difficultyLabel(index: number): string {
  return DIFFICULTY_LABELS[Math.min(index, DIFFICULTY_LABELS.length - 1)] || `Reto ${index + 1}`;
}

function goToQuestion(index: number) {
  if (index < 0 || index >= questionCount.value) return;
  questionIndex.value = index;
}

function prevQuestion() {
  goToQuestion(questionIndex.value - 1);
}

function nextQuestion() {
  goToQuestion(questionIndex.value + 1);
}

function falsePositiveLinesOf(item: any): string {
  const selected: number[] = Array.isArray(item?.selected) ? item.selected : [];
  const bugLines = new Set((item?.bugs || []).map((bug: any) => Number(bug.line)));
  return selected.filter((line) => !bugLines.has(Number(line))).join(', ');
}

const hasReview = computed(() => {
  const details = result.value?.details;
  if (!details) return false;
  if (type.value === 'flashcards') return (details.results || []).some((item: any) => !item.correct);
  if (type.value === 'predict_output' || type.value === 'find_bug' || type.value === 'order_code') {
    return (details.results || []).some((item: any) => !item.correct);
  }
  return Boolean(details.missing?.length || details.extra?.length || details.misconceptions?.length);
});

const labeledEdgeCount = computed(() => edges.value.filter((edge) => edge.label.trim().length > 0).length);

const linkPreview = computed(() => {
  if (!linkSource.value || !linkPointer.value) return null;
  const node = nodes.value.find((item) => item.id === linkSource.value?.nodeId);
  if (!node) return null;
  const start = pointOf(node, linkSource.value.side);
  return { x1: start.x, y1: start.y, x2: linkPointer.value.x, y2: linkPointer.value.y };
});

const edgeLines = computed(() => {
  return edges.value
    .map((edge) => {
      const from = nodes.value.find((item) => item.id === edge.fromId);
      const to = nodes.value.find((item) => item.id === edge.toId);
      if (!from || !to) return null;
      const a = pointOf(from, edge.fromSide);
      const b = pointOf(to, edge.toSide);
      return { id: edge.id, x1: a.x, y1: a.y, x2: b.x, y2: b.y };
    })
    .filter((line): line is { id: string; x1: number; y1: number; x2: number; y2: number } => line !== null);
});

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function pointOf(node: MapNode, side: Side) {
  const offset = SIDE_OFFSETS[side];
  return { x: node.x + offset.x, y: node.y + offset.y };
}

function boardPoint(event: PointerEvent) {
  const rect = boardRef.value?.getBoundingClientRect();
  return { x: event.clientX - (rect?.left || 0), y: event.clientY - (rect?.top || 0) };
}

function layoutNodes() {
  const count = nodes.value.length;
  if (!count) return;
  const cols = clamp(
    Math.floor((boardW.value - MAP_MARGIN) / (NODE_W + COL_GAP)),
    1,
    4,
  );
  const rows = Math.max(1, Math.ceil(count / cols));
  const gridW = cols * NODE_W + (cols - 1) * COL_GAP;
  const startX = Math.max(MAP_MARGIN, (boardW.value - gridW) / 2);
  boardH.value = Math.max(560, MAP_MARGIN * 2 + rows * NODE_H + (rows - 1) * ROW_GAP);
  nodes.value.forEach((node, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    node.x = Math.round(startX + col * (NODE_W + COL_GAP));
    node.y = Math.round(MAP_MARGIN + row * (NODE_H + ROW_GAP));
  });
}

function clampNodes() {
  for (const node of nodes.value) {
    node.x = clamp(node.x, 0, Math.max(0, boardW.value - NODE_W));
    node.y = clamp(node.y, 0, Math.max(0, boardH.value - NODE_H));
  }
}

function measureBoard() {
  const available = scrollRef.value?.clientWidth;
  if (!available) return;
  const next = Math.max(300, available - 2);
  if (next === boardW.value) return;
  boardW.value = next;
  if (edges.value.length) clampNodes();
  else layoutNodes();
}

let resizeObserver: ResizeObserver | null = null;

function observeBoard() {
  if (typeof ResizeObserver === 'undefined' || !scrollRef.value) return;
  resizeObserver?.disconnect();
  resizeObserver = new ResizeObserver(() => measureBoard());
  resizeObserver.observe(scrollRef.value);
}

function initMap(concepts: string[]) {
  nodes.value = concepts.map((concept, index) => ({
    id: `n${index}`,
    concept: String(concept),
    x: 0,
    y: 0,
  }));
  edges.value = [];
  edgeSeq = 0;
  linkSource.value = null;
  linkPointer.value = null;
  linkTargetId.value = null;
  layoutNodes();
}

function startDrag(node: MapNode, event: PointerEvent) {
  if (event.pointerType === 'mouse' && event.button !== 0) return;
  const point = boardPoint(event);
  dragState = { id: node.id, offsetX: point.x - node.x, offsetY: point.y - node.y };
  window.addEventListener('pointermove', onDragMove);
  window.addEventListener('pointerup', onDragEnd);
}

function onDragMove(event: PointerEvent) {
  if (!dragState) return;
  const node = nodes.value.find((item) => item.id === dragState?.id);
  if (!node) return;
  const point = boardPoint(event);
  node.x = clamp(point.x - dragState.offsetX, 0, boardW.value - NODE_W);
  node.y = clamp(point.y - dragState.offsetY, 0, boardH.value - NODE_H);
}

function onDragEnd() {
  dragState = null;
  window.removeEventListener('pointermove', onDragMove);
  window.removeEventListener('pointerup', onDragEnd);
}

function startLink(node: MapNode, side: Side, event: PointerEvent) {
  if (event.pointerType === 'mouse' && event.button !== 0) return;
  linkSource.value = { nodeId: node.id, side };
  linkPointer.value = boardPoint(event);
  linkState = { nodeId: node.id, side };
  window.addEventListener('pointermove', onLinkMove);
  window.addEventListener('pointerup', onLinkEnd);
}

function onLinkMove(event: PointerEvent) {
  const point = boardPoint(event);
  linkPointer.value = point;
  const target = hitTestNode(point, linkState?.nodeId);
  linkTargetId.value = target?.id || null;
}

function onLinkEnd(event: PointerEvent) {
  window.removeEventListener('pointermove', onLinkMove);
  window.removeEventListener('pointerup', onLinkEnd);
  const point = boardPoint(event);
  const source = linkState;
  linkSource.value = null;
  linkPointer.value = null;
  linkTargetId.value = null;
  linkState = null;
  if (!source) return;
  const target = hitTestNode(point, source.nodeId);
  if (!target) return;
  addEdge(source.nodeId, target.id, source.side, nearestSide(target, point));
}

function hitTestNode(point: { x: number; y: number }, excludeId?: string): MapNode | null {
  for (const node of nodes.value) {
    if (node.id === excludeId) continue;
    for (const side of SIDES) {
      const sp = pointOf(node, side);
      if (Math.hypot(sp.x - point.x, sp.y - point.y) <= 18) return node;
    }
  }
  for (const node of nodes.value) {
    if (node.id === excludeId) continue;
    if (point.x >= node.x && point.x <= node.x + NODE_W && point.y >= node.y && point.y <= node.y + NODE_H) {
      return node;
    }
  }
  return null;
}

function nearestSide(node: MapNode, point: { x: number; y: number }): Side {
  let best: Side = 'left';
  let bestDistance = Infinity;
  for (const side of SIDES) {
    const sp = pointOf(node, side);
    const distance = Math.hypot(sp.x - point.x, sp.y - point.y);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = side;
    }
  }
  return best;
}

function addEdge(fromId: string, toId: string, fromSide: Side, toSide: Side) {
  if (fromId === toId) return;
  const exists = edges.value.some(
    (edge) => (edge.fromId === fromId && edge.toId === toId) || (edge.fromId === toId && edge.toId === fromId),
  );
  if (exists || edges.value.length >= Math.max(6, nodes.value.length)) return;
  const id = `e${edgeSeq++}`;
  edges.value.push({ id, fromId, toId, fromSide, toSide, label: '' });
  void nextTick(() => {
    const input = boardRef.value?.querySelector<HTMLInputElement>(`input[data-edge-id="${id}"]`);
    input?.focus();
  });
}

function removeEdge(id: string) {
  edges.value = edges.value.filter((edge) => edge.id !== id);
}

function edgeLabelStyle(edge: MapEdge) {
  const from = nodes.value.find((item) => item.id === edge.fromId);
  const to = nodes.value.find((item) => item.id === edge.toId);
  if (!from || !to) return {};
  const a = pointOf(from, edge.fromSide);
  const b = pointOf(to, edge.toSide);
  return { left: `${(a.x + b.x) / 2}px`, top: `${(a.y + b.y) / 2}px` };
}

const feedbackItems = computed<FeedbackItem[]>(() => {
  const feedback = result.value?.feedback || {};
  return Object.entries(feedback)
    .filter(([key]) => key !== 'general' && key !== 'formative')
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
  nodes.value = [];
  edges.value = [];
  linkSource.value = null;
  linkPointer.value = null;
  linkTargetId.value = null;
  questionIndex.value = 0;
  predictAnswers.value = [];
  bugAnswers.value = [];
  orderAnswers.value = [];
  orderOriginal.value = [];
  orderTouched.value = [];
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
    payload.value = data;
    if (type.value === 'flashcards') {
      cardAnswers.value = Array((data.cards || []).length).fill('');
    }
    const loadedQuestions = Array.isArray(data.questions) ? data.questions : [];
    if (type.value === 'predict_output') {
      predictAnswers.value = loadedQuestions.map(() => null);
    }
    if (type.value === 'find_bug') {
      bugAnswers.value = loadedQuestions.map(() => []);
    }
    if (type.value === 'order_code') {
      orderAnswers.value = loadedQuestions.map((question: any) =>
        (Array.isArray(question.lines) ? question.lines : []).map((line: any) => ({ id: String(line.id), text: String(line.text ?? '') })),
      );
      orderOriginal.value = orderAnswers.value.map((lines) => lines.map((line) => line.id));
      orderTouched.value = loadedQuestions.map(() => false);
    }
    const concepts = Array.isArray(data.concepts) ? data.concepts : [];
    state.value = 'ready';
    await nextTick();
    if (type.value === 'concept_map') {
      measureBoard();
      initMap(concepts);
      observeBoard();
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
    state.value = 'error';
  }
}

async function repeatActivity() {
  if (!(await dialog.confirm('Puedes repetir esta actividad. La nueva nota reemplazará a la anterior. ¿Continuar?'))) return;
  void load();
}

function buildAnswers(): any {
  if (type.value === 'flashcards') {
    return (payload.value?.cards || []).map((card: any, index: number) => ({
      card_index: index,
      answer: cardAnswers.value[index] || '',
    }));
  }
  if (type.value === 'find_error') {
    return { selected: selectedSentences.value, corrections: corrections.value };
  }
  if (type.value === 'recall') return { text: recallText.value };
  if (type.value === 'summary') return { text: summaryText.value };
  if (type.value === 'predict_output') return { selected: predictAnswers.value };
  if (type.value === 'find_bug') return { selected: bugAnswers.value };
  if (type.value === 'order_code') return { orders: orderAnswers.value.map((lines) => lines.map((line) => line.id)) };
  if (type.value === 'concept_map') {
    return {
      edges: edges.value
        .filter((edge) => edge.label.trim())
        .map((edge) => {
          const from = nodes.value.find((node) => node.id === edge.fromId);
          const to = nodes.value.find((node) => node.id === edge.toId);
          return { from: from?.concept || '', to: to?.concept || '', label: edge.label.trim() };
        })
        .filter((edge) => edge.from && edge.to),
    };
  }
  return {};
}

function optionLetter(index: number): string {
  return 'ABCD'[index] ?? String(index + 1);
}

function moveLine(index: number, delta: number) {
  const lines = orderAnswers.value[questionIndex.value];
  if (!lines) return;
  const target = index + delta;
  if (target < 0 || target >= lines.length) return;
  const copy = [...lines];
  const [item] = copy.splice(index, 1);
  if (!item) return;
  copy.splice(target, 0, item);
  orderAnswers.value[questionIndex.value] = copy;
  orderTouched.value[questionIndex.value] = true;
}

async function submitActivity() {
  if (grading.value) return;
  if (type.value === 'flashcards' && cardAnswers.value.every((answer) => !answer.trim())) {
    dialog.alert('Escribe al menos una respuesta antes de calificar.');
    return;
  }
  if (type.value === 'predict_output' && !allPredictAnswered.value) {
    dialog.alert('Selecciona una salida en cada uno de los 4 retos.');
    return;
  }
  if (type.value === 'find_bug' && !allBugAnswered.value) {
    dialog.alert('Marca al menos una línea con error en cada uno de los 4 retos.');
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
    dialog.alert(err instanceof Error ? err.message : String(err));
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

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  resizeObserver = null;
});
</script>

<style>
:where(body[data-page="activity"]) .activity-container {
  max-width: 820px;
  margin: 0 auto;
  padding: 1.25rem 1rem 3rem;
}

:where(body[data-page="activity"]) .activity-container.map-wide {
  max-width: min(1400px, 100vw - 2rem);
  padding-left: .75rem;
  padding-right: .75rem;
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

:where(body[data-page="activity"]) .map-help {
  margin: 0 0 .8rem;
}

:where(body[data-page="activity"]) .map-scroll {
  width: 100%;
  overflow: auto;
  border: 1px solid var(--glass-border, rgba(255, 255, 255, .12));
  border-radius: 14px;
  background: var(--secondary-container, rgba(108, 99, 255, .06));
}

:where(body[data-page="activity"]) .map-board {
  position: relative;
  background-image: radial-gradient(var(--glass-border, rgba(103, 80, 164, .12)) 1px, transparent 1px);
  background-size: 22px 22px;
}

:where(body[data-page="activity"]) .map-lines {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

:where(body[data-page="activity"]) .map-line {
  stroke: var(--accent-color, #6c63ff);
  stroke-width: 2.5;
  stroke-linecap: round;
}

:where(body[data-page="activity"]) .map-line.preview {
  stroke: var(--text-secondary, #8a8a8a);
  stroke-dasharray: 6 5;
}

:where(body[data-page="activity"]) .map-node {
  position: absolute;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: .35rem .6rem;
  box-sizing: border-box;
  border-radius: 14px;
  background: var(--secondary-container, rgba(30, 30, 44, .96));
  border: 2px solid var(--glass-border, rgba(255, 255, 255, .28));
  color: var(--text-primary, #eee);
  font-size: .85rem;
  font-weight: 600;
  line-height: 1.25;
  cursor: grab;
  touch-action: none;
  user-select: none;
  overflow: visible;
}

:where(body[data-page="activity"]) .map-node:active {
  cursor: grabbing;
}

:where(body[data-page="activity"]) .map-node.source {
  border-color: var(--accent-color, #6c63ff);
  box-shadow: 0 0 0 3px var(--accent-glow, rgba(108, 99, 255, .25));
}

:where(body[data-page="activity"]) .map-node.target {
  border-color: #22c55e;
  box-shadow: 0 0 0 3px rgba(34, 197, 94, .25);
}

:where(body[data-page="activity"]) .map-node-text {
  pointer-events: none;
  word-break: break-word;
}

:where(body[data-page="activity"]) .map-point {
  position: absolute;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--accent-color, #6c63ff);
  border: 2px solid var(--glass-bg, #1e1e2c);
  cursor: crosshair;
  touch-action: none;
  transform: translate(-50%, -50%);
}

:where(body[data-page="activity"]) .map-point:hover {
  transform: translate(-50%, -50%) scale(1.25);
}

:where(body[data-page="activity"]) .map-point.point-top { left: 50%; top: 0; }
:where(body[data-page="activity"]) .map-point.point-bottom { left: 50%; top: 100%; }
:where(body[data-page="activity"]) .map-point.point-left { left: 0; top: 50%; }
:where(body[data-page="activity"]) .map-point.point-right { left: 100%; top: 50%; }

:where(body[data-page="activity"]) .map-edge-label {
  position: absolute;
  z-index: 3;
  display: flex;
  align-items: center;
  gap: .2rem;
  transform: translate(-50%, -50%);
}

:where(body[data-page="activity"]) .map-edge-input {
  width: 96px;
  padding: .2rem .4rem;
  font-size: .74rem;
  font-family: inherit;
  text-align: center;
  color: var(--text-primary, #eee);
  background: var(--glass-bg, #1e1e2c);
  border: 1px solid var(--glass-border, rgba(255, 255, 255, .28));
  border-radius: 8px;
}

:where(body[data-page="activity"]) .map-edge-input:focus {
  outline: none;
  border-color: var(--accent-color, #6c63ff);
}

:where(body[data-page="activity"]) .map-edge-remove {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  padding: 0;
  border-radius: 50%;
  border: none;
  background: rgba(239, 68, 68, .9);
  color: #fff;
  font-size: .62rem;
  line-height: 1;
  cursor: pointer;
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

:where(body[data-page="activity"]) .code-block {
  background: color-mix(in srgb, var(--accent-color) 5%, var(--glass-bg));
  border: 1px solid var(--glass-border);
  border-radius: 10px;
  padding: .8rem .9rem;
  margin: 0 0 1rem;
  overflow-x: auto;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: .88rem;
  line-height: 1.55;
  color: var(--text-primary, #eee);
}

:where(body[data-page="activity"]) .code-block code {
  font-family: inherit;
  white-space: pre;
}

:where(body[data-page="activity"]) .predict-options {
  display: flex;
  flex-direction: column;
  gap: .5rem;
}

:where(body[data-page="activity"]) .predict-option {
  display: flex;
  align-items: flex-start;
  gap: .6rem;
  padding: .6rem .7rem;
  border: 1px solid var(--glass-border, rgba(255, 255, 255, .14));
  border-radius: 10px;
  cursor: pointer;
}

:where(body[data-page="activity"]) .predict-option.selected {
  border-color: var(--accent-primary, #6c63ff);
  background: rgba(108, 99, 255, .12);
}

:where(body[data-page="activity"]) .predict-option input {
  margin-top: .35rem;
  accent-color: var(--accent-primary, #6c63ff);
}

:where(body[data-page="activity"]) .predict-letter {
  font-weight: 700;
  color: var(--accent-primary, #6c63ff);
}

:where(body[data-page="activity"]) .predict-output {
  margin: 0;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: .85rem;
  white-space: pre-wrap;
  word-break: break-word;
}

:where(body[data-page="activity"]) .bug-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: .6rem;
  flex-wrap: wrap;
  margin: 0 0 .6rem;
}

:where(body[data-page="activity"]) .bug-hint {
  font-size: .82rem;
  color: var(--text-secondary);
}

:where(body[data-page="activity"]) .bug-count {
  font-size: .78rem;
  font-weight: 600;
  padding: .2rem .7rem;
  border-radius: var(--border-radius-pill, 999px);
  color: var(--text-secondary);
  background: var(--secondary-container);
  border: 1px solid var(--glass-border);
  transition: var(--transition-fast);
}

:where(body[data-page="activity"]) .bug-count.active {
  color: #fff;
  background: var(--accent-gradient);
  border-color: transparent;
  box-shadow: 0 2px 10px var(--accent-glow);
}

:where(body[data-page="activity"]) .code-lines {
  padding: .4rem;
  background: color-mix(in srgb, var(--accent-color) 4%, var(--glass-bg));
  border-color: color-mix(in srgb, var(--accent-color) 22%, var(--glass-border));
}

:where(body[data-page="activity"]) .code-line {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: .55rem;
  padding: .28rem .6rem;
  border-radius: var(--border-radius-sm, 12px);
  border: 1px solid transparent;
  cursor: pointer;
  transition: background var(--transition-fast), border-color var(--transition-fast), box-shadow var(--transition-fast);
}

:where(body[data-page="activity"]) .code-line:hover {
  background: color-mix(in srgb, var(--accent-color) 8%, transparent);
}

:where(body[data-page="activity"]) .code-line.selected {
  background: color-mix(in srgb, var(--accent-color) 16%, transparent);
  border-color: color-mix(in srgb, var(--accent-color) 45%, transparent);
  box-shadow: inset 3px 0 0 var(--accent-color);
}

:where(body[data-page="activity"]) .code-line input {
  position: absolute;
  width: 0;
  height: 0;
  margin: 0;
  opacity: 0;
  pointer-events: none;
}

:where(body[data-page="activity"]) .code-line-check {
  flex: none;
  position: relative;
  margin-top: .28rem;
  width: 18px;
  height: 18px;
  border-radius: 6px;
  border: 1.5px solid color-mix(in srgb, var(--accent-color) 45%, var(--glass-border));
  background: var(--glass-bg);
  transition: var(--transition-fast);
}

:where(body[data-page="activity"]) .code-line-check::after {
  content: "";
  position: absolute;
  inset: 0;
  margin: auto;
  width: 5px;
  height: 9px;
  border: solid #fff;
  border-width: 0 2px 2px 0;
  transform: rotate(45deg) scale(0);
  opacity: 0;
  transition: var(--transition-fast);
}

:where(body[data-page="activity"]) .code-line.selected .code-line-check {
  background: var(--accent-gradient);
  border-color: transparent;
  box-shadow: 0 2px 8px var(--accent-glow);
}

:where(body[data-page="activity"]) .code-line.selected .code-line-check::after {
  transform: rotate(45deg) scale(1);
  opacity: 1;
}

:where(body[data-page="activity"]) .code-line input:focus-visible + .code-line-check {
  outline: 2px solid var(--accent-color);
  outline-offset: 2px;
}

:where(body[data-page="activity"]) .code-line-number {
  min-width: 1.6rem;
  text-align: right;
  color: var(--text-tertiary, var(--text-secondary));
  user-select: none;
  font-variant-numeric: tabular-nums;
  transition: color var(--transition-fast);
}

:where(body[data-page="activity"]) .code-line.selected .code-line-number {
  color: var(--accent-color);
  font-weight: 700;
}

:where(body[data-page="activity"]) .code-line-text {
  margin: 0;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: .85rem;
  white-space: pre;
}

:where(body[data-page="activity"]) .order-list {
  padding: .4rem 0;
}

:where(body[data-page="activity"]) .order-line {
  display: flex;
  align-items: flex-start;
  gap: .5rem;
  padding: .2rem .6rem;
}

:where(body[data-page="activity"]) .order-line .code-line-text {
  flex: 1;
}

:where(body[data-page="activity"]) .order-actions {
  display: flex;
  gap: .25rem;
}

:where(body[data-page="activity"]) .order-btn {
  background: transparent;
  color: var(--text-primary, #eee);
  border: 1px solid var(--glass-border, rgba(255, 255, 255, .2));
  border-radius: 6px;
  width: 1.8rem;
  height: 1.8rem;
  cursor: pointer;
}

:where(body[data-page="activity"]) .order-btn:disabled {
  opacity: .35;
  cursor: not-allowed;
}

:where(body[data-page="activity"]) .order-compare {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: .8rem;
}

/* ---- Actividades de 4 retos: animaciones y efectos ---- */

@keyframes act-card-in {
  from { opacity: 0; transform: translateY(16px) scale(.99); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

@keyframes act-pop {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes act-score-in {
  from { opacity: 0; transform: scale(.8); }
  to { opacity: 1; transform: scale(1); }
}

:where(body[data-page="activity"]) .activity-card {
  animation: act-card-in .35s cubic-bezier(.22, 1, .36, 1);
}

:where(body[data-page="activity"]) .multistep {
  position: relative;
  overflow: hidden;
}

:where(body[data-page="activity"]) .multistep::before {
  content: "";
  position: absolute;
  inset: 0 0 auto 0;
  height: 3px;
  background: var(--accent-gradient);
  opacity: .85;
}

:where(body[data-page="activity"]) .question-stepper {
  display: flex;
  align-items: center;
  gap: .5rem;
  margin: .2rem 0 1.1rem;
}

:where(body[data-page="activity"]) .stepper-dot {
  flex: none;
  width: 2rem;
  height: 2rem;
  border-radius: 50%;
  border: 1.5px solid color-mix(in srgb, var(--accent-color) 40%, var(--glass-border));
  background: var(--glass-bg);
  color: var(--text-secondary, #888);
  font-size: .82rem;
  font-weight: 700;
  cursor: pointer;
  transition: transform .18s ease, background .25s ease, color .25s ease, box-shadow .25s ease, border-color .25s ease;
}

:where(body[data-page="activity"]) .stepper-dot:hover {
  transform: translateY(-2px) scale(1.06);
  border-color: var(--accent-color);
}

:where(body[data-page="activity"]) .stepper-dot.done {
  color: #fff;
  background: color-mix(in srgb, var(--accent-color) 65%, transparent);
  border-color: transparent;
}

:where(body[data-page="activity"]) .stepper-dot.active {
  color: #fff;
  background: var(--accent-gradient);
  border-color: transparent;
  box-shadow: 0 4px 14px var(--accent-glow);
  transform: scale(1.08);
}

:where(body[data-page="activity"]) .stepper-progress {
  position: relative;
  flex: 1;
  height: 6px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent-color) 14%, transparent);
  overflow: hidden;
}

:where(body[data-page="activity"]) .stepper-fill {
  position: absolute;
  inset: 0 auto 0 0;
  border-radius: 999px;
  background: var(--accent-gradient);
  transition: width .4s cubic-bezier(.22, 1, .36, 1);
}

:where(body[data-page="activity"]) .question-body {
  animation: act-pop .28s cubic-bezier(.22, 1, .36, 1);
}

:where(body[data-page="activity"]) .question-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: .55rem;
  margin-bottom: .7rem;
}

:where(body[data-page="activity"]) .question-meta .activity-note {
  margin: 0;
}

:where(body[data-page="activity"]) .question-count {
  font-size: .78rem;
  font-weight: 700;
  color: var(--accent-color);
  padding: .15rem .6rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent-color) 12%, transparent);
}

:where(body[data-page="activity"]) .difficulty-chip {
  font-size: .72rem;
  font-weight: 700;
  letter-spacing: .02em;
  padding: .15rem .6rem;
  border-radius: 999px;
  color: #fff;
  background: var(--accent-gradient);
  box-shadow: 0 2px 10px var(--accent-glow);
}

:where(body[data-page="activity"]) .difficulty-chip.diff-2 {
  background: linear-gradient(135deg, color-mix(in srgb, var(--accent-color) 55%, #f59e0b) 0%, #f59e0b 100%);
}

:where(body[data-page="activity"]) .difficulty-chip.diff-3 {
  background: linear-gradient(135deg, color-mix(in srgb, var(--accent-color) 40%, #ef4444) 0%, #ef4444 100%);
}

:where(body[data-page="activity"]) .q-nav {
  justify-content: space-between;
  align-items: center;
}

:where(body[data-page="activity"]) .activity-btn {
  transition: transform .16s ease, box-shadow .22s ease, filter .22s ease, background .22s ease;
}

:where(body[data-page="activity"]) .activity-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 8px 20px var(--accent-glow);
  filter: brightness(1.04);
}

:where(body[data-page="activity"]) .activity-btn:active:not(:disabled) {
  transform: translateY(0) scale(.97);
  box-shadow: 0 2px 8px var(--accent-glow);
}

:where(body[data-page="activity"]) .predict-option {
  transition: transform .18s ease, border-color .18s ease, background .18s ease, box-shadow .18s ease;
}

:where(body[data-page="activity"]) .predict-option:hover {
  transform: translateX(3px);
  border-color: color-mix(in srgb, var(--accent-color) 55%, var(--glass-border));
}

:where(body[data-page="activity"]) .predict-option.selected {
  box-shadow: 0 4px 16px var(--accent-glow);
  transform: translateX(3px);
}

:where(body[data-page="activity"]) .order-line {
  transition: background .2s ease, box-shadow .2s ease;
  border-radius: 8px;
}

:where(body[data-page="activity"]) .order-line.moved {
  background: color-mix(in srgb, var(--accent-color) 10%, transparent);
  box-shadow: inset 3px 0 0 var(--accent-color);
}

:where(body[data-page="activity"]) .order-btn {
  transition: transform .14s ease, border-color .14s ease, background .14s ease;
}

:where(body[data-page="activity"]) .order-btn:hover:not(:disabled) {
  transform: scale(1.12);
  border-color: var(--accent-color);
  background: color-mix(in srgb, var(--accent-color) 12%, transparent);
}

:where(body[data-page="activity"]) .question-result {
  padding: .9rem;
  border-radius: 14px;
  background: var(--surface, rgba(255, 255, 255, .04));
  border: 1px solid var(--glass-border, rgba(255, 255, 255, .12));
  border-left: 4px solid transparent;
  animation: act-pop .3s cubic-bezier(.22, 1, .36, 1);
}

:where(body[data-page="activity"]) .question-result.ok {
  border-left-color: #22c55e;
}

:where(body[data-page="activity"]) .question-result.bad {
  border-left-color: #ef4444;
}

:where(body[data-page="activity"]) .question-result-head {
  display: flex;
  align-items: center;
  gap: .5rem;
  margin-bottom: .6rem;
}

:where(body[data-page="activity"]) .question-result .code-block {
  margin-bottom: .6rem;
}

:where(body[data-page="activity"]) .result-number {
  animation: act-score-in .45s cubic-bezier(.22, 1, .36, 1);
}

.q-slide-enter-active,
.q-slide-leave-active {
  transition: opacity .22s ease, transform .22s ease;
}

.q-slide-enter-from {
  opacity: 0;
  transform: translateX(20px);
}

.q-slide-leave-to {
  opacity: 0;
  transform: translateX(-20px);
}

@media (prefers-reduced-motion: reduce) {
  :where(body[data-page="activity"]) .activity-card,
  :where(body[data-page="activity"]) .question-body,
  :where(body[data-page="activity"]) .question-result,
  :where(body[data-page="activity"]) .result-number {
    animation: none;
  }
  .q-slide-enter-active,
  .q-slide-leave-active {
    transition: none;
  }
}

@media (max-width: 640px) {
  :where(body[data-page="activity"]) .order-compare {
    grid-template-columns: 1fr;
  }

  :where(body[data-page="activity"]) .stepper-dot {
    width: 1.75rem;
    height: 1.75rem;
    font-size: .76rem;
  }
}

</style>
