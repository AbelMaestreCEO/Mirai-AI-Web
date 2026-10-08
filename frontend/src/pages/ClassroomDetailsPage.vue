<template>
  <header class="header">
    <MenuToggle />
    <div class="header-title">Detalle de Tarea</div>
  </header>

  <main id="detail-container" class="courses-container">
    <!-- Sin id, o tarea no disponible: el original sustituía todo el contenido. -->
    <div v-if="fatal" class="error-state">
      <div class="error-icon">⚠️</div>
      <h3>Error</h3>
      <p>{{ fatal }}</p>
      <AppLink to="classroom" class="btn btn-primary" style="margin-top: 15px; display:inline-block;">Volver a Tareas</AppLink>
    </div>

    <template v-else>
      <div class="courses-hero" style="animation: cardFadeIn 0.5s cubic-bezier(0.05,0.7,0.1,1) both;">
        <h1 id="detail-hero-title">Detalle de Tarea</h1>
        <p id="detail-hero-subtitle">Revisa la información, descripción y entrega de tu tarea.</p>
      </div>

      <div style="padding: 0 20px; animation: cardFadeIn 0.5s cubic-bezier(0.05,0.7,0.1,1) 0.05s both;">
        <button class="back-btn" @click="router.back()">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
            <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
          </svg>
          Volver al Aula
        </button>
      </div>

      <div v-if="state === 'loading'" id="loading-state" class="loading-state" style="display: block;">
        <div class="loading-spinner"></div>
        <p>Cargando detalles de la tarea...</p>
      </div>

      <div v-else-if="state === 'error'" id="error-state" class="error-state">
        <div class="error-icon">⚠️</div>
        <h3>Error al cargar la tarea</h3>
        <p id="error-message">{{ error }}</p>
        <button class="course-start-btn" style="max-width:200px; margin:0 auto;" @click="load">
          Recargar
        </button>
      </div>

      <div v-else-if="assignment" id="task-content">
        <div class="course-detail-header" style="margin: 0 20px 0; animation: cardFadeIn 0.5s cubic-bezier(0.05,0.7,0.1,1) 0.05s both;">
          <div class="course-detail-icon">📝</div>
          <div class="course-detail-info">
            <h1 id="task-title" class="course-detail-title">{{ assignment.title || 'Sin título' }}</h1>
            <p id="task-course" class="course-detail-description">
              {{ (assignment.course_title || 'General') + (assignment.section_name ? ` — Sección: ${assignment.section_name}` : '') }}
            </p>
          </div>
        </div>

        <br>
        <div class="task-meta-grid" style="padding: 0 20px; margin-bottom: 24px; animation: cardFadeIn 0.5s cubic-bezier(0.05,0.7,0.1,1) 0.15s both;">
          <div class="meta-item">
            <span class="meta-icon">📅</span>
            <div class="meta-content">
              <span class="meta-label">Fecha Límite</span>
              <span id="task-due" class="meta-value">{{ dueDate }}</span>
            </div>
          </div>
          <div class="meta-item">
            <span class="meta-icon">⭐</span>
            <div class="meta-content">
              <span class="meta-label">Puntuación Máxima</span>
              <span id="task-max-score" class="meta-value">{{ assignment.max_score || 'N/A' }}</span>
            </div>
          </div>
          <div class="meta-item">
            <span class="meta-icon">📊</span>
            <div class="meta-content">
              <span class="meta-label">Estado</span>
              <span id="task-status" class="status-badge" :class="status.cls">{{ status.text }}</span>
            </div>
          </div>
        </div>

        <div class="task-description-card" style="margin: 0 20px 24px; animation: cardFadeIn 0.5s cubic-bezier(0.05,0.7,0.1,1) 0.25s both;">
          <h2 class="section-title">Descripción</h2>
          <p id="task-description" class="task-desc-text">{{ assignment.description || 'Sin descripción' }}</p>
        </div>

        <!-- Entrega (aún no entregada) -->
        <div v-if="phase === 'pending'" id="submit-section" class="card submit-section-card" style="margin: 0 20px 24px; animation: cardFadeIn 0.5s cubic-bezier(0.05,0.7,0.1,1) 0.35s both;">
          <h3 class="section-title">Entregar Tarea</h3>
          <p class="section-subtitle">{{ upload.icon }} Sube tu trabajo en formato {{ upload.label }} (máx. 10MB)</p>

          <div
            id="upload-area"
            class="upload-area"
            :class="{ 'drag-over': dragOver }"
            @dragenter.prevent.stop="dragOver = true"
            @dragover.prevent.stop="dragOver = true"
            @dragleave.prevent.stop="dragOver = false"
            @drop.prevent.stop="onDrop"
          >
            <div class="upload-icon">📤</div>
            <p class="upload-text">Arrastra y suelta archivos aquí</p>
            <p class="upload-hint">o</p>
            <div class="file-input-wrapper">
              <button class="btn btn-primary">Seleccionar Archivos</button>
              <input id="file-input" type="file" :accept="upload.accept" multiple @change="onPick">
            </div>
            <div id="file-list" class="file-list">
              <div v-for="(f, i) in files" :key="`${f.name}-${i}`" class="file-chip">
                <span class="attachment-icon">{{ isImageName(f.name) ? '🖼️' : '📄' }}</span>
                <span class="attachment-name">{{ f.name }}</span>
                <span class="attachment-remove" @click="files.splice(i, 1)">×</span>
              </div>
            </div>
          </div>

          <div class="response-textarea">
            <textarea id="task-response" v-model="responseText" placeholder="Escribe tu respuesta o comentarios adicionales..." rows="4"></textarea>
          </div>

          <div class="submit-actions">
            <button id="cancel-submit" class="btn btn-secondary" @click="cancelSubmit">Cancelar</button>
            <button id="submit-task" class="btn btn-primary" :disabled="submitting" @click="submit">{{ submitting ? '⏳ Procesando...' : 'Enviar Tarea' }}</button>
          </div>

          <div v-if="submitStatus" id="submit-status" class="status-message" :class="submitStatus.type" style="display: block;">{{ submitStatus.text }}</div>
        </div>

        <!-- Evaluación con IA (entregada, en revisión) -->
        <div v-if="phase === 'review'" id="evaluate-section" class="card evaluate-section-card" style="margin: 0 20px 24px; animation: cardFadeIn 0.5s cubic-bezier(0.05,0.7,0.1,1) 0.4s both;">
          <h3 class="section-title">¿Quieres una evaluación rápida?</h3>
          <p class="section-subtitle">{{ submittedImage ? 'La IA analizará tu imagen y la comparará con los requisitos de la tarea' : 'Usa nuestra IA para obtener una calificación preliminar' }}</p>
          <button id="ai-evaluate-btn" class="btn btn-primary" :disabled="evaluating" @click="confirmEvaluation">
            {{ evaluating ? '⏳ Evaluando...' : submittedImage ? '🖼️ Evaluar Imagen con IA' : '🤖 Evaluar con IA' }}
          </button>
        </div>

        <!-- Resultado (evaluada) -->
        <div v-if="phase === 'evaluated' && submission" id="feedback-section" class="card feedback-section-card" style="margin: 0 20px 60px; animation: cardFadeIn 0.5s cubic-bezier(0.05,0.7,0.1,1) 0.45s both;">
          <div class="feedback-header">
            <span class="feedback-icon">✅</span>
            <h2 class="section-title">Tarea Evaluada</h2>
          </div>

          <div v-if="submittedImage" style="margin:16px 0;text-align:center;">
            <img :src="submission.file_url ?? undefined" alt="Imagen entregada" style="max-width:100%;max-height:400px;border-radius:12px;border:1px solid var(--glass-border);object-fit:contain;">
          </div>

          <div class="feedback-score">
            <span class="score-label">Tu Puntuación</span>
            <span class="score-value">{{ finalScore }}</span>
            <span class="score-max">/ {{ assignment.max_score }}</span>
          </div>

          <div v-if="feedback.items" class="feedback-content">
            <div v-if="feedback.image" style="margin-bottom:16px;padding:8px 12px;background:var(--secondary-container);border-radius:8px;font-size:0.85rem;">🖼️ Evaluación de imagen</div>
            <div v-for="item in feedback.items" :key="item.label" style="margin-bottom:12px;">
              <strong style="color:var(--accent-primary);">{{ item.label }}:</strong>
              <span style="color:var(--text-secondary);">{{ item.value }}</span>
            </div>
            <p v-if="feedback.general" style="margin-top:16px;"><strong>Resumen General:</strong> {{ feedback.general }}</p>
          </div>
          <template v-else>{{ feedback.text }}</template>
        </div>
      </div>
    </template>
  </main>
</template>

<script setup lang="ts">
// Migración de public/classroom_details.html y public/classroom_details.js:
// detalle de una tarea del aula, entrega (PDF/DOCX/imagen, con el texto
// extraído en el navegador), evaluación con IA y retroalimentación.
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import MenuToggle from '@/components/MenuToggle.vue';
import AppLink from '@/components/AppLink.vue';
import { api, apiFetch, errorMessage } from '@/lib/api';
import { extractText, fileExtension } from '@/lib/chat-files';
import { goToPage } from '@/lib/pages';

interface Submission {
  id: number | string;
  status?: string;
  score?: number | null;
  professor_note?: number | null;
  file_url?: string | null;
  feedback?: string | Record<string, unknown> | null;
}

interface AssignmentDetails {
  id: number | string;
  title?: string;
  description?: string;
  course_title?: string | null;
  section_name?: string | null;
  due_date?: string | null;
  max_score?: number | null;
  submission_type?: string | null;
  submission?: Submission | null;
}

const UPLOAD_TYPES: Record<string, { accept: string; label: string; icon: string }> = {
  document: { accept: '.pdf,.docx', label: 'PDF o DOCX', icon: '📄' },
  image: { accept: '.png,.jpg,.jpeg,.webp', label: 'imagen PNG, JPG o WEBP', icon: '🖼️' },
  any: { accept: '.pdf,.docx,.png,.jpg,.jpeg,.webp', label: 'PDF, DOCX o imagen PNG/JPG/WEBP', icon: '📎' },
};

const FEEDBACK_LABELS: Record<string, string> = {
  apa: 'Normas APA',
  tercera_persona: 'Tercera Persona',
  conectores: 'Conectores Lógicos',
  tablas_figuras: 'Tablas y Figuras',
  originalidad: 'Originalidad',
  coherencia: 'Coherencia',
  profundidad: 'Profundidad',
  pertinencia_tematica: 'Pertinencia Temática',
  cumplimiento_requisitos: 'Cumplimiento de Requisitos',
  calidad_visual: 'Calidad Visual',
  creatividad: 'Creatividad y Esfuerzo',
  precision: 'Precisión',
  presentacion: 'Presentación',
  pertinencia: 'Pertinencia',
};

const IMAGE_CRITERIA = [
  'Cumplimiento de requisitos de la tarea',
  'Calidad visual (claridad, resolución, enfoque)',
  'Creatividad y esfuerzo',
  'Precisión de los elementos representados',
  'Presentación (encuadre, limpieza)',
  'Pertinencia temática',
];

const DOCUMENT_CRITERIA = [
  'Pertinencia Temática',
  'Cumplimiento de normas APA 7ma edición',
  'Escrito en tercera persona',
  'Uso adecuado de conectores lógicos',
  'Tablas y figuras etiquetadas correctamente',
  'Originalidad del contenido',
  'Coherencia y estructura lógica',
  'Profundidad en el análisis',
];

const MAX_FILE_SIZE = 10 * 1024 * 1024;
// El texto que se manda a la IA se recorta a esta longitud.
const MAX_TEXT = 15000;

const route = useRoute();
const router = useRouter();
const assignmentId = computed(() => (typeof route.query.id === 'string' ? route.query.id : ''));

const assignment = ref<AssignmentDetails | null>(null);
const state = ref<'loading' | 'ready' | 'error'>('loading');
const error = ref('');
const fatal = ref('');

const isImageName = (name: string) => /\.(png|jpg|jpeg|webp)$/i.test(name);

// ── Carga ─────────────────────────────────────────────────────────────────
async function load() {
  const id = assignmentId.value;
  fatal.value = id ? '' : `ID de tarea no proporcionado. URL: ${location.href}`;
  if (!id) return;
  state.value = 'loading';
  try {
    const { ok, status, data } = await api.get<AssignmentDetails & { error?: string }>(`/api/assignment-details?id=${encodeURIComponent(id)}`);
    if (!ok) {
      if (status === 404) fatal.value = 'Esta tarea no está disponible para ti o no existe.';
      else if (status === 401) goToPage(router, 'login');
      else fatal.value = errorMessage(data, 'Error al cargar los detalles');
      return;
    }
    assignment.value = data;
    state.value = 'ready';
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
    state.value = 'error';
  }
}

// Se recarga también si cambia ?id= sin salir de la página (atrás/adelante).
watch(assignmentId, () => void load(), { immediate: true });

const submission = computed(() => assignment.value?.submission ?? null);
const submittedImage = computed(() => !!submission.value?.file_url && isImageName(submission.value.file_url));
const finalScore = computed(() => submission.value?.professor_note ?? submission.value?.score);

const dueDate = computed(() =>
  assignment.value?.due_date
    ? new Date(assignment.value.due_date).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })
    : 'Sin fecha límite',
);

// pending: sin entregar · review: entregada sin evaluar · evaluated: con nota.
const phase = computed<'pending' | 'review' | 'evaluated' | 'none'>(() => {
  const s = submission.value;
  if (!s) return 'pending';
  if (s.status === 'evaluated' || s.status === 'completed') return 'evaluated';
  if (s.status === 'submitted' || s.status === 'pending') return 'review';
  return 'none';
});

const status = computed(() => {
  switch (phase.value) {
    case 'evaluated':
      return { cls: 'status-evaluated', text: `Revisado ${finalScore.value}/${assignment.value?.max_score}` };
    case 'review':
      return { cls: 'status-submitted', text: 'En revisión' };
    case 'pending':
      return { cls: 'status-pending', text: 'Pendiente' };
    default:
      return { cls: 'status-pending', text: 'Cargando...' };
  }
});

// La retroalimentación de la IA es un JSON { criterio: texto, general }.
const feedback = computed(() => {
  const raw = submission.value?.feedback;
  if (!raw) return { text: 'Sin retroalimentación.' };
  try {
    const fb = (typeof raw === 'string' ? JSON.parse(raw) : raw) as Record<string, unknown>;
    const items = Object.entries(fb)
      .filter(([key, value]) => key !== 'general' && value)
      .map(([key, value]) => ({ label: FEEDBACK_LABELS[key] || key.replace(/_/g, ' ').toUpperCase(), value: String(value) }));
    return { items, image: !!(fb.cumplimiento_requisitos || fb.calidad_visual), general: fb.general ? String(fb.general) : '' };
  } catch {
    return { text: String(raw) };
  }
});

// ── Entrega ───────────────────────────────────────────────────────────────
const upload = computed(() => UPLOAD_TYPES[assignment.value?.submission_type || 'document'] ?? UPLOAD_TYPES.any!);
const files = ref<File[]>([]);
const responseText = ref('');
const dragOver = ref(false);
const submitting = ref(false);
const submitStatus = ref<{ text: string; type: 'success' | 'error' } | null>(null);

function addFile(file: File) {
  const allowed = upload.value.accept.split(',').map((e) => e.replace('.', ''));
  if (!allowed.includes(fileExtension(file.name))) {
    alert(`El archivo ${file.name} no es válido. Esta tarea solo acepta: ${upload.value.label}.`);
    return;
  }
  if (file.size > MAX_FILE_SIZE) {
    alert(`El archivo ${file.name} supera los 10MB`);
    return;
  }
  files.value.push(file);
}

function onPick(e: Event) {
  const input = e.target as HTMLInputElement;
  Array.from(input.files ?? []).forEach(addFile);
  input.value = '';
}

function onDrop(e: DragEvent) {
  dragOver.value = false;
  Array.from(e.dataTransfer?.files ?? []).forEach(addFile);
}

function cancelSubmit() {
  files.value = [];
  responseText.value = '';
  submitStatus.value = null;
}

/** Texto del PDF/DOCX para que la IA lo evalúe (las imágenes las ve la IA de visión). */
async function documentText(file: File): Promise<string> {
  const ext = fileExtension(file.name);
  if (ext === 'pdf' || file.type.includes('pdf')) {
    try {
      return (await extractText(file, 'pdf')).substring(0, MAX_TEXT);
    } catch {
      throw new Error('No se pudo extraer texto del PDF. Asegúrate de que no esté protegido.');
    }
  }
  if (ext === 'docx' || file.type.includes('word')) {
    let text: string;
    try {
      text = await extractText(file, 'docx');
    } catch {
      throw new Error('No se pudo extraer texto del DOCX. Asegúrate de que no esté corrupto.');
    }
    if (text.length < 50) throw new Error('No se pudo extraer texto del DOCX. Asegúrate de que no esté corrupto.');
    return text.substring(0, MAX_TEXT);
  }
  throw new Error('Formato no soportado. Solo PDF y DOCX.');
}

async function submit() {
  // Se entrega el primer archivo de la lista, como hacía la página antigua.
  const file = files.value[0];
  if (!file) {
    submitStatus.value = { text: 'Debes seleccionar al menos un archivo', type: 'error' };
    return;
  }
  submitting.value = true;
  try {
    const extracted = isImageName(file.name) ? '' : await documentText(file);

    const form = new FormData();
    form.append('assignment_id', String(assignment.value?.id ?? assignmentId.value));
    form.append('file', file);
    if (extracted) form.append('extracted_text', extracted);
    const res = await apiFetch('/api/submit-assignment', { method: 'POST', body: form });
    const data = (await res.json().catch(() => ({}))) as { submission_id?: number | string; error?: string };
    if (!res.ok) throw new Error(errorMessage(data, 'Error al entregar'));

    if (extracted) await api.post('/api/save-extracted-text', { submission_id: data.submission_id, extracted_text: extracted });

    submitStatus.value = { text: '✅ Trabajo entregado correctamente', type: 'success' };
    setTimeout(() => {
      files.value = [];
      submitStatus.value = null;
      submitting.value = false;
      void load();
    }, 1500);
  } catch (err) {
    console.error('Error entregando la tarea:', err);
    submitStatus.value = { text: `❌ Error: ${err instanceof Error ? err.message : String(err)}`, type: 'error' };
    submitting.value = false;
  }
}

// ── Evaluación con IA ─────────────────────────────────────────────────────
const evaluating = ref(false);

async function confirmEvaluation() {
  const s = submission.value;
  if (!s) return;
  const criteria = submittedImage.value ? IMAGE_CRITERIA : DOCUMENT_CRITERIA;
  const intro = submittedImage.value ? '🖼️ La IA analizará tu imagen' : 'La IA evaluará tu trabajo';
  const message = `${intro} basándose en los siguientes criterios:\n\n${criteria.map((c, i) => `${i + 1}. ${c}`).join('\n')}\n\n¿Deseas proceder?`;
  if (!confirm(message)) return;

  evaluating.value = true;
  try {
    const { ok, data } = await api.post<{ score?: number; max_score?: number; error?: string }>('/api/evaluate-submission', { submission_id: s.id });
    if (!ok) throw new Error(errorMessage(data, 'Error al evaluar'));
    alert(`✅ Evaluación completada: ${data.score}/${data.max_score}`);
    await load();
  } catch (err) {
    console.error('Error evaluando:', err);
    alert('❌ Error al evaluar: ' + (err instanceof Error ? err.message : String(err)));
  } finally {
    evaluating.value = false;
  }
}
</script>
