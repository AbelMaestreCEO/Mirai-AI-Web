<template>
  <header class="header">
    <MenuToggle />
    <div class="header-title">Mis Reportes</div>
  </header>

  <div id="main-content" class="report-student-container">
    <div class="reports-hero">
      <h1>Mis Reportes</h1>
      <p>Completa los reportes asignados y, si eres profesor o administrador, créalos y adminístralos.</p>
    </div>

    <!-- Tabs -->
    <div class="report-tabs">
      <button class="tab-btn" :class="{ active: tab === 'pending' }" data-tab="pending" @click="tab = 'pending'">
        {{ pending.length ? `Pendientes (${pending.length})` : 'Pendientes' }}
      </button>
      <button class="tab-btn" :class="{ active: tab === 'completed' }" data-tab="completed" @click="tab = 'completed'">
        {{ completed.length ? `Completados (${completed.length})` : 'Completados' }}
      </button>
      <button
        id="tab-btn-manage"
        class="tab-btn admin-only"
        :class="{ active: tab === 'manage' }"
        :style="canManage ? { display: 'inline-flex' } : undefined"
        data-tab="manage"
        @click="tab = 'manage'"
      >
        🛠️ Gestionar
      </button>
    </div>

    <!-- Pendientes / Completados -->
    <div v-for="list in LISTS" :id="`tab-${list.id}`" :key="list.id" :style="{ display: tab === list.id ? '' : 'none' }">
      <div :id="`${list.id}-grid`" class="reports-grid">
        <div v-for="r in list.id === 'pending' ? pending : completed" :key="r.id" class="report-card-student" :class="{ completed: r.submitted }" :data-id="r.id">
          <div class="rc-top">
            <div class="rc-icon">{{ r.icon || '📋' }}</div>
            <div style="flex:1; min-width:0;">
              <div class="rc-title">{{ r.title }}</div>
            </div>
          </div>
          <div v-if="r.description" class="rc-desc">{{ r.description }}</div>
          <div class="rc-meta">
            <span class="rc-chip">❓ {{ (r.questions ?? []).length }} pregunta{{ (r.questions ?? []).length !== 1 ? 's' : '' }}</span>
            <span v-if="r.deadline" class="rc-chip" :style="deadlineChip(r.deadline, 'Vence hoy').style">📅 {{ deadlineChip(r.deadline, 'Vence hoy').label }}</span>
            <span class="rc-status" :class="r.submitted ? 'completed' : 'pending'">{{ r.submitted ? '✅ Enviado' : '⏳ Pendiente' }}</span>
          </div>
          <div v-if="r.submitted" class="btn-fill done" aria-disabled="true">✅ Enviado{{ r.submittedAt ? ` · ${formatDate(r.submittedAt)}` : '' }}</div>
          <button v-else class="btn-fill btn-open-report" :data-id="r.id" :aria-label="`Completar reporte ${r.title}`" @click="openFill(r)">Completar reporte →</button>
        </div>
      </div>
      <div :id="`empty-${list.id}`" class="empty-state" :style="{ display: loaded && !(list.id === 'pending' ? pending : completed).length ? 'block' : 'none' }">
        <div class="empty-state-icon">{{ list.emptyIcon }}</div>
        <h3>{{ list.emptyTitle }}</h3>
        <p>{{ list.emptyText }}</p>
      </div>
    </div>

    <!-- Gestionar (profesores / administradores) -->
    <ReportManage v-if="canManage" ref="manageRef" :visible="tab === 'manage'" :toast="showToast" :set-loading="setLoading" />
  </div>

  <!-- ===== MODAL: COMPLETAR REPORTE ===== -->
  <div id="modal-fill" class="modal-overlay" :class="{ open: fill.report !== null }" role="dialog" aria-modal="true" @click.self="closeFill">
    <div class="modal-box">
      <div class="modal-header">
        <div class="modal-title-wrap">
          <div id="fill-title" class="modal-title">{{ fill.report?.title || 'Completar reporte' }}</div>
          <div id="fill-subtitle" class="modal-subtitle">{{ fill.report?.description || '' }}</div>
        </div>
        <button id="fill-close-btn" class="modal-close" aria-label="Cerrar" @click="closeFill">✕</button>
      </div>
      <div class="progress-bar-wrap">
        <div id="fill-progress" class="progress-bar-fill" :style="{ width: `${progress}%` }"></div>
      </div>
      <div id="fill-body">
        <div v-for="(q, i) in fill.report?.questions ?? []" :key="q.id" class="answer-group">
          <label class="answer-label" :for="`ans-${q.id}`">
            <span class="q-num">{{ i + 1 }}</span>
            {{ q.label || `Pregunta ${i + 1}` }}
          </label>
          <textarea
            v-if="q.type === 'text'"
            :id="`ans-${q.id}`"
            v-model="fill.answers[q.id]"
            class="answer-textarea"
            :name="`ans-${q.id}`"
            placeholder="Escribe tu respuesta…"
            rows="3"
            :aria-label="q.label"
          ></textarea>
          <select v-else-if="q.type === 'select'" :id="`ans-${q.id}`" v-model="fill.answers[q.id]" class="answer-select" :name="`ans-${q.id}`" :aria-label="q.label">
            <option value="">— Selecciona una opción —</option>
            <option v-for="o in q.options ?? []" :key="o" :value="o">{{ o }}</option>
          </select>
          <template v-else-if="q.type === 'image'">
            <div
              :id="`upload-${q.id}`"
              class="img-upload-area"
              :style="dragOver === q.id ? { borderColor: 'var(--accent-color, #6750A4)', background: 'var(--secondary-container, #E8DEF8)' } : undefined"
              @dragover.prevent="dragOver = q.id"
              @dragleave="dragOver = null"
              @drop.prevent="onDropImages(q.id, $event)"
            >
              <input :id="`file-${q.id}`" type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple aria-label="Subir imágenes" @change="onPickImages(q.id, $event)">
              <div class="img-upload-icon">🖼️</div>
              <div class="img-upload-text">
                Toca o arrastra imágenes aquí<br>
                <small>JPG, PNG, WebP · máx {{ MAX_IMAGE_BYTES / (1024 * 1024) }} MB c/u</small>
              </div>
            </div>
            <div :id="`previews-${q.id}`" class="img-previews">
              <div v-for="(img, j) in fill.images[q.id] ?? []" :key="img.key" class="img-preview-item">
                <img :src="img.dataUrl" :alt="img.name">
                <button class="remove-img" type="button" title="Quitar imagen" aria-label="Quitar imagen" @click="fill.images[q.id]!.splice(j, 1)">✕</button>
              </div>
            </div>
          </template>
          <input
            v-else
            :id="`ans-${q.id}`"
            v-model="fill.answers[q.id]"
            class="answer-input"
            :type="q.type === 'time' || q.type === 'date' ? q.type : 'text'"
            :name="`ans-${q.id}`"
            :aria-label="q.label"
          >
        </div>
      </div>
      <div class="modal-footer">
        <button id="fill-cancel-btn" class="btn-cancel" @click="closeFill">Cancelar</button>
        <button id="fill-submit-btn" class="btn-submit" :disabled="submitting" @click="submitFill">Enviar reporte</button>
      </div>
    </div>
  </div>

  <!-- Toast y carga -->
  <div id="toast" class="toast" :class="{ show: toastVisible }">{{ toastText }}</div>
  <div id="loading-overlay" class="loading-overlay" :class="{ show: loadingCount > 0 }">
    <div class="spinner"></div>
  </div>
</template>

<script setup lang="ts">
// Migración de public/report.html y public/report.js: el alumno completa los
// reportes a los que tiene acceso; profesores y administradores, además, los
// gestionan en la pestaña "Gestionar" (components/report/ReportManage.vue).
// public/report_admin.html, una versión anterior de esa gestión, redirige
// aquí con ?tab=manage.
//
// Cambio al migrar: si la API fallaba, la página antigua enseñaba reportes de
// demostración inventados y, al enviar, daba el reporte por enviado aunque no
// se hubiera guardado. Ahora avisa del error.
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import MenuToggle from '@/components/MenuToggle.vue';
import ReportManage from '@/components/report/ReportManage.vue';
import { ensureSubscribed } from '@/lib/push';
import { useRealtime } from '@/lib/realtime';
import { MAX_IMAGE_BYTES, deadlineChip, reportsApi, type StudentReport } from '@/lib/reports';
import { currentUser } from '@/lib/session';

type Tab = 'pending' | 'completed' | 'manage';

const LISTS = [
  { id: 'pending', emptyIcon: '🎉', emptyTitle: '¡Todo al día!', emptyText: 'No tienes reportes pendientes por completar.' },
  { id: 'completed', emptyIcon: '📋', emptyTitle: 'Sin reportes completados', emptyText: 'Aquí aparecerán los reportes que ya hayas enviado.' },
] as const;

const route = useRoute();
const canManage = computed(() => currentUser.value?.role === 'teacher' || currentUser.value?.role === 'admin');

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// ── Toast y capa de carga ─────────────────────────────────────────────────
const toastText = ref('');
const toastVisible = ref(false);
let toastTimer: number | undefined;

function showToast(msg: string, duration = 2800) {
  clearTimeout(toastTimer);
  toastText.value = msg;
  toastVisible.value = true;
  toastTimer = window.setTimeout(() => (toastVisible.value = false), duration);
}

const loadingCount = ref(0);

function setLoading(on: boolean) {
  loadingCount.value = Math.max(0, loadingCount.value + (on ? 1 : -1));
}

// ── Mis reportes ──────────────────────────────────────────────────────────
const reports = ref<StudentReport[]>([]);
const loaded = ref(false);
const tab = ref<Tab>('pending');
const manageRef = ref<InstanceType<typeof ReportManage> | null>(null);

const pending = computed(() => reports.value.filter((r) => !r.submitted));
const completed = computed(() => reports.value.filter((r) => r.submitted));

async function loadReports({ quiet = false } = {}) {
  if (!quiet) setLoading(true);
  try {
    reports.value = await reportsApi<StudentReport[]>('/api/my-reports');
  } catch (err) {
    console.warn('[Report] No se pudieron cargar los reportes:', err);
    showToast('❌ No se pudieron cargar tus reportes. Recarga la página para reintentar.');
  } finally {
    loaded.value = true;
    if (!quiet) setLoading(false);
  }
}

// La gestión se carga cada vez que se abre su pestaña.
watch(tab, (t) => t === 'manage' && void manageRef.value?.reload());

// ── Completar un reporte ──────────────────────────────────────────────────
interface PickedImage {
  key: number;
  name: string;
  dataUrl: string;
}

const fill = reactive({
  report: null as StudentReport | null,
  answers: {} as Record<string, string>,
  images: {} as Record<string, PickedImage[]>,
});
const submitting = ref(false);
const dragOver = ref<string | null>(null);
let imageSeq = 0;

const progress = computed(() => {
  const qs = fill.report?.questions ?? [];
  if (!qs.length) return 100;
  const filled = qs.filter((q) => (q.type === 'image' ? (fill.images[q.id] ?? []).length > 0 : (fill.answers[q.id] ?? '').trim())).length;
  return Math.round((filled / qs.length) * 100);
});

async function openFill(r: StudentReport) {
  if (r.submitted) {
    showToast('Ya enviaste este reporte.');
    return;
  }
  fill.answers = Object.fromEntries((r.questions ?? []).filter((q) => q.type !== 'image').map((q) => [q.id, '']));
  fill.images = Object.fromEntries((r.questions ?? []).filter((q) => q.type === 'image').map((q) => [q.id, [] as PickedImage[]]));
  fill.report = r;
  // Respuesta previa (si la hay): las imágenes no se recargan.
  try {
    const prev = await reportsApi<{ answers?: Record<string, unknown> }>(`/api/my-reports/${encodeURIComponent(r.id)}/submission`);
    for (const q of r.questions ?? []) {
      const val = prev?.answers?.[q.id];
      if (val && q.type !== 'image' && fill.report === r) fill.answers[q.id] = String(val);
    }
  } catch {
    // 404: no hay respuesta previa
  }
}

function closeFill() {
  fill.report = null;
  fill.answers = {};
  fill.images = {};
}

function addImages(qId: string, files: FileList | null | undefined) {
  for (const file of Array.from(files ?? [])) {
    if (file.size > MAX_IMAGE_BYTES) {
      showToast(`⚠️ "${file.name}" supera el límite de ${MAX_IMAGE_BYTES / (1024 * 1024)} MB.`);
      continue;
    }
    const reader = new FileReader();
    reader.onload = () => fill.images[qId]?.push({ key: ++imageSeq, name: file.name, dataUrl: String(reader.result) });
    reader.onerror = () => showToast(`❌ Error al leer "${file.name}".`);
    reader.readAsDataURL(file);
  }
}

function onPickImages(qId: string, e: Event) {
  addImages(qId, (e.target as HTMLInputElement).files);
}

function onDropImages(qId: string, e: DragEvent) {
  dragOver.value = null;
  addImages(qId, e.dataTransfer?.files);
}

async function submitFill() {
  const r = fill.report;
  if (!r || submitting.value) return;

  // Todas las preguntas son obligatorias.
  const answers: Record<string, string | string[]> = {};
  for (const q of r.questions ?? []) {
    const val = q.type === 'image' ? (fill.images[q.id] ?? []).map((img) => img.dataUrl) : (fill.answers[q.id] ?? '').trim();
    if (!val.length) {
      showToast(`⚠️ Por favor responde: "${q.label || 'Pregunta'}"`);
      (document.getElementById(`ans-${q.id}`) ?? document.getElementById(`upload-${q.id}`))?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    answers[q.id] = val;
  }

  submitting.value = true;
  setLoading(true);
  try {
    const result = await reportsApi<{ submittedAt?: string } | null>(`/api/my-reports/${encodeURIComponent(r.id)}/submit`, { method: 'POST', body: { answers } });
    r.submitted = true;
    r.submittedAt = result?.submittedAt || new Date().toISOString();
    closeFill();
    showToast('🎉 ¡Reporte enviado correctamente!', 3500);
  } catch (err) {
    console.error('[Report] Error al enviar:', err);
    showToast('❌ Error al enviar el reporte. Intenta de nuevo.');
  } finally {
    submitting.value = false;
    setLoading(false);
  }
}

// ── Modales: Escape y scroll de fondo ─────────────────────────────────────
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && fill.report) closeFill();
}

const anyModalOpen = computed(() => fill.report !== null || !!manageRef.value?.anyModalOpen);
watch(anyModalOpen, (open) => (document.body.style.overflow = open ? 'hidden' : ''));

// ── En vivo ───────────────────────────────────────────────────────────────
interface ReportChanges {
  reports?: { id: string }[];
  submissions?: { id: string; student_dni?: string; report_title?: string }[];
}

useRealtime('reports', (data) => {
  const { reports: changed = [], submissions = [] } = (data as ReportChanges | null) ?? {};
  if (changed.length) void loadReports({ quiet: true });
  for (const sub of submissions) showToast(`📩 Nueva entrega de ${sub.student_dni} en "${sub.report_title}"`);
  if (tab.value === 'manage') void manageRef.value?.reload();
});

onMounted(async () => {
  document.addEventListener('keydown', onKeydown);
  void ensureSubscribed();
  await loadReports();
  if (route.query.tab === 'manage' && canManage.value) tab.value = 'manage';
});

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown);
  clearTimeout(toastTimer);
  document.body.style.overflow = '';
});
</script>

<style>
/* CSS propio de la página antigua, limitado a ella (ver router: meta.page). */
/* ===== STUDENT REPORT STYLES ===== */
:where(body[data-page="report"]) .report-student-container {
  --page-max: 860px;
  max-width: var(--page-max);
  margin: 0 auto;
  padding: 1.5rem 1rem 5rem;
}

:where(body[data-page="report"]) .reports-hero {
  text-align: center;
  padding: 2rem 1rem 1.5rem;
}

:where(body[data-page="report"]) .reports-hero h1 {
  font-size: clamp(1.6rem, 4vw, 2.2rem);
  font-weight: 700;
  background: var(--accent-gradient, linear-gradient(135deg,#6750A4,#9A82DB));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  margin-bottom: 0.4rem;
}

:where(body[data-page="report"]) .reports-hero p { color: var(--text-secondary, #666); font-size: 0.95rem; }

/* Admin link button */
:where(body[data-page="report"]) .btn-admin-link {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  border-radius: 12px;
  background: var(--secondary-container, #E8DEF8);
  color: var(--accent-color, #6750A4);
  font-size: 0.85rem;
  font-weight: 600;
  text-decoration: none;
  border: 1.5px solid var(--glass-border, rgba(103,80,164,0.2));
  transition: background .18s, transform .15s, box-shadow .18s;
  margin-top: 0.5rem;
}

:where(body[data-page="report"]) .btn-admin-link:hover {
  background: var(--accent-gradient, linear-gradient(135deg,#6750A4,#9A82DB));
  color: #fff;
  transform: translateY(-2px);
  box-shadow: 0 4px 16px var(--accent-glow, rgba(103,80,164,0.25));
}

/* Admin link only visible for teachers */
:where(body[data-page="report"]) .admin-only { display: none; }

/* Tabs */
/* En móviles estrechos las tres pestañas no caben en una fila y
 desbordaban la pantalla; se desplazan en horizontal en su propia
 barra en vez de empujar el ancho de la página. */
:where(body[data-page="report"]) .report-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 1.5rem;
  border-bottom: 2px solid var(--glass-border, rgba(103,80,164,0.1));
  padding-bottom: 0;
  overflow-x: auto;
  scrollbar-width: none;
}

:where(body[data-page="report"]) .report-tabs::-webkit-scrollbar { display: none; }

:where(body[data-page="report"]) .tab-btn {
  flex-shrink: 0;
  padding: 9px 18px;
  background: none;
  border: none;
  font-size: 0.88rem;
  font-weight: 600;
  color: var(--text-secondary, #888);
  cursor: pointer;
  border-bottom: 2.5px solid transparent;
  margin-bottom: -2px;
  transition: color .2s, border-color .2s;
}

:where(body[data-page="report"]) .tab-btn.active {
  color: var(--accent-color, #6750A4);
  border-bottom-color: var(--accent-color, #6750A4);
}

/* Report cards grid */
:where(body[data-page="report"]) .reports-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1rem;
}

:where(body[data-page="report"]) .report-card-student {
  background: var(--glass-bg, rgba(255,255,255,0.94));
  border: 1px solid var(--glass-border, rgba(103,80,164,0.12));
  border-radius: 18px;
  padding: 1.3rem;
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
  cursor: pointer;
  transition: box-shadow .2s, transform .2s;
  position: relative;
  overflow: hidden;
}

:where(body[data-page="report"]) .report-card-student::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 3px;
  background: var(--accent-gradient, linear-gradient(135deg,#6750A4,#9A82DB));
  opacity: 0;
  transition: opacity .2s;
}

:where(body[data-page="report"]) .report-card-student:hover {
  box-shadow: 0 8px 28px var(--accent-glow, rgba(103,80,164,0.15));
  transform: translateY(-3px);
}

:where(body[data-page="report"]) .report-card-student:hover::before { opacity: 1; }

:where(body[data-page="report"]) .report-card-student.completed { border-color: #66BB6A; }
:where(body[data-page="report"]) .report-card-student.completed::before { background: linear-gradient(135deg,#2E7D32,#66BB6A); opacity: 1; }

:where(body[data-page="report"]) .rc-top {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

:where(body[data-page="report"]) .rc-icon {
  width: 46px;
  height: 46px;
  border-radius: 12px;
  background: var(--secondary-container, #E8DEF8);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.4rem;
  flex-shrink: 0;
}

:where(body[data-page="report"]) .rc-title {
  font-weight: 700;
  font-size: 0.97rem;
  color: var(--text-primary, #1a1a1a);
  line-height: 1.3;
}

:where(body[data-page="report"]) .rc-desc {
  font-size: 0.82rem;
  color: var(--text-secondary, #777);
  line-height: 1.45;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

:where(body[data-page="report"]) .rc-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 6px;
}

:where(body[data-page="report"]) .rc-chip {
  font-size: 0.74rem;
  padding: 3px 9px;
  border-radius: 99px;
  background: var(--secondary-container, #E8DEF8);
  color: var(--text-secondary, #666);
}

:where(body[data-page="report"]) .rc-status {
  font-size: 0.74rem;
  font-weight: 700;
  padding: 3px 10px;
  border-radius: 99px;
}

:where(body[data-page="report"]) .rc-status.pending {
  background: #FFF3E0;
  color: #E65100;
}

:where(body[data-page="report"]) .rc-status.completed {
  background: #E8F5E9;
  color: #2E7D32;
}

:where(body[data-page="report"]) .btn-fill {
  display: block;
  width: 100%;
  padding: 9px;
  border: none;
  border-radius: 10px;
  background: var(--accent-gradient, linear-gradient(135deg,#6750A4,#9A82DB));
  color: #fff;
  font-size: 0.88rem;
  font-weight: 600;
  cursor: pointer;
  transition: opacity .2s, transform .15s;
  box-shadow: 0 2px 10px var(--accent-glow, rgba(103,80,164,0.2));
  text-align: center;
}

:where(body[data-page="report"]) .btn-fill:hover { opacity: .88; transform: translateY(-1px); }
:where(body[data-page="report"]) .btn-fill.done { background: linear-gradient(135deg,#2E7D32,#66BB6A); box-shadow: none; }

/* Empty */
:where(body[data-page="report"]) .empty-state {
  text-align: center;
  padding: 4rem 2rem;
  color: var(--text-secondary, #999);
}

:where(body[data-page="report"]) .empty-state-icon { font-size: 3.5rem; margin-bottom: 1rem; }
:where(body[data-page="report"]) .empty-state h3 { font-size: 1.05rem; margin-bottom: 0.3rem; color: var(--text-primary,#333); }

/* ===== FILL MODAL ===== */
:where(body[data-page="report"]) .modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.45);
  backdrop-filter: blur(6px);
  z-index: 1000;
  display: none;
  align-items: flex-start;
  justify-content: center;
  padding: 1rem;
  overflow-y: auto;
}

:where(body[data-page="report"]) .modal-overlay.open { display: flex; }

:where(body[data-page="report"]) .modal-box {
  background: var(--glass-bg, #fff);
  border-radius: 20px;
  padding: 1.8rem;
  width: 100%;
  max-width: 640px;
  margin: auto;
  box-shadow: 0 16px 48px rgba(0,0,0,0.18);
  animation: modalIn .25s ease;
}

@keyframes modalIn {
  from { opacity: 0; transform: translateY(20px) scale(.97); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}

:where(body[data-page="report"]) .modal-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 1.4rem;
  gap: 1rem;
}

:where(body[data-page="report"]) .modal-title-wrap {}
:where(body[data-page="report"]) .modal-title { font-size: 1.1rem; font-weight: 700; color: var(--text-primary,#1a1a1a); }
:where(body[data-page="report"]) .modal-subtitle { font-size: 0.82rem; color: var(--text-secondary,#777); margin-top: 3px; }

:where(body[data-page="report"]) .modal-close {
  background: none;
  border: none;
  font-size: 1.4rem;
  cursor: pointer;
  color: var(--text-secondary,#666);
  line-height: 1;
  padding: 4px;
  flex-shrink: 0;
}

/* Answer fields */
:where(body[data-page="report"]) .answer-group {
  margin-bottom: 1.2rem;
}

:where(body[data-page="report"]) .answer-label {
  display: block;
  font-size: 0.87rem;
  font-weight: 600;
  color: var(--text-primary, #333);
  margin-bottom: 6px;
}

:where(body[data-page="report"]) .answer-label .q-num {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--accent-gradient, linear-gradient(135deg,#6750A4,#9A82DB));
  color: #fff;
  font-size: 0.72rem;
  font-weight: 700;
  margin-right: 6px;
  flex-shrink: 0;
}

:where(body[data-page="report"]) .answer-input,
:where(body[data-page="report"]) .answer-select,
:where(body[data-page="report"]) .answer-textarea {
  width: 100%;
  padding: 10px 14px;
  border: 1.5px solid var(--glass-border, rgba(103,80,164,0.2));
  border-radius: 10px;
  background: var(--bg-primary, #F5F3F8);
  color: var(--text-primary, #1a1a1a);
  font-size: 0.9rem;
  font-family: inherit;
  transition: border-color .2s, box-shadow .2s;
  box-sizing: border-box;
}

:where(body[data-page="report"]) .answer-input:focus,
:where(body[data-page="report"]) .answer-select:focus,
:where(body[data-page="report"]) .answer-textarea:focus {
  outline: none;
  border-color: var(--accent-color, #6750A4);
  box-shadow: 0 0 0 3px var(--accent-glow, rgba(103,80,164,0.18));
}

:where(body[data-page="report"]) .answer-textarea { min-height: 90px; resize: vertical; }

/* Image upload */
:where(body[data-page="report"]) .img-upload-area {
  border: 2px dashed var(--glass-border, rgba(103,80,164,0.25));
  border-radius: 12px;
  padding: 1.4rem;
  text-align: center;
  cursor: pointer;
  transition: border-color .2s, background .2s;
  position: relative;
}

:where(body[data-page="report"]) .img-upload-area:hover {
  border-color: var(--accent-color, #6750A4);
  background: var(--secondary-container, #E8DEF8);
}

:where(body[data-page="report"]) .img-upload-area input[type="file"] {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
  width: 100%;
  height: 100%;
}

:where(body[data-page="report"]) .img-upload-icon { font-size: 2rem; margin-bottom: 0.4rem; }
:where(body[data-page="report"]) .img-upload-text { font-size: 0.82rem; color: var(--text-secondary,#777); }

:where(body[data-page="report"]) .img-previews {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}

:where(body[data-page="report"]) .img-preview-item {
  position: relative;
  width: 72px;
  height: 72px;
}

:where(body[data-page="report"]) .img-preview-item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 8px;
  border: 1px solid var(--glass-border, rgba(103,80,164,0.15));
}

:where(body[data-page="report"]) .img-preview-item .remove-img {
  position: absolute;
  top: -5px;
  right: -5px;
  background: #e53935;
  color: #fff;
  border: none;
  border-radius: 50%;
  width: 18px;
  height: 18px;
  font-size: 10px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}

/* Progress bar */
:where(body[data-page="report"]) .progress-bar-wrap {
  height: 4px;
  background: var(--secondary-container, #E8DEF8);
  border-radius: 99px;
  margin-bottom: 1.4rem;
  overflow: hidden;
}

:where(body[data-page="report"]) .progress-bar-fill {
  height: 100%;
  border-radius: 99px;
  background: var(--accent-gradient, linear-gradient(135deg,#6750A4,#9A82DB));
  transition: width .4s ease;
}

/* Modal footer */
:where(body[data-page="report"]) .modal-footer {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  margin-top: 1.4rem;
  padding-top: 1rem;
  border-top: 1px solid var(--glass-border, rgba(103,80,164,0.1));
}

:where(body[data-page="report"]) .btn-cancel {
  padding: 10px 20px;
  border: 1.5px solid var(--glass-border, rgba(103,80,164,0.2));
  border-radius: 10px;
  background: none;
  color: var(--text-secondary,#666);
  font-size: 0.9rem;
  cursor: pointer;
  transition: background .15s;
}

:where(body[data-page="report"]) .btn-cancel:hover { background: var(--secondary-container,#E8DEF8); }

:where(body[data-page="report"]) .btn-submit {
  padding: 10px 24px;
  border: none;
  border-radius: 10px;
  background: var(--accent-gradient, linear-gradient(135deg,#6750A4,#9A82DB));
  color: #fff;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: opacity .2s, transform .15s;
  box-shadow: 0 2px 10px var(--accent-glow, rgba(103,80,164,0.25));
}

:where(body[data-page="report"]) .btn-submit:hover { opacity: .88; transform: translateY(-1px); }
:where(body[data-page="report"]) .btn-submit:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }

/* Success overlay */
:where(body[data-page="report"]) .success-screen {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3rem 2rem;
  text-align: center;
}

:where(body[data-page="report"]) .success-screen .success-icon {
  font-size: 4rem;
  margin-bottom: 1rem;
  animation: popIn .4s cubic-bezier(.175,.885,.32,1.275);
}

@keyframes popIn {
  from { transform: scale(0); opacity: 0; }
  to   { transform: scale(1); opacity: 1; }
}

:where(body[data-page="report"]) .success-screen h3 { font-size: 1.2rem; font-weight: 700; color: var(--text-primary,#222); margin-bottom: 0.4rem; }
:where(body[data-page="report"]) .success-screen p { color: var(--text-secondary,#777); font-size: 0.9rem; }

/* Toast */
:where(body[data-page="report"]) .toast {
  position: fixed;
  bottom: 2rem;
  left: 50%;
  transform: translateX(-50%) translateY(10px);
  background: #323232;
  color: #fff;
  padding: 12px 22px;
  border-radius: 12px;
  font-size: 0.88rem;
  font-weight: 500;
  opacity: 0;
  pointer-events: none;
  transition: opacity .3s, transform .3s;
  z-index: 9999;
  white-space: nowrap;
}

:where(body[data-page="report"]) .toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }

/* Loading */
:where(body[data-page="report"]) .loading-overlay {
  position: fixed;
  inset: 0;
  background: rgba(255,255,255,0.7);
  display: none;
  align-items: center;
  justify-content: center;
  z-index: 2000;
  backdrop-filter: blur(4px);
}

:where(body[data-page="report"]) .loading-overlay.show { display: flex; }

:where(body[data-page="report"]) .spinner {
  width: 44px;
  height: 44px;
  border: 4px solid var(--secondary-container, #E8DEF8);
  border-top-color: var(--accent-color, #6750A4);
  border-radius: 50%;
  animation: spin .8s linear infinite;
}

@keyframes spin { to { transform: rotate(360deg); } }

/* Deadline warning */
:where(body[data-page="report"]) .deadline-badge {
  font-size: 0.72rem;
  font-weight: 600;
  padding: 3px 9px;
  border-radius: 99px;
}

:where(body[data-page="report"]) .deadline-badge.urgent { background: #FFEBEE; color: #C62828; }
:where(body[data-page="report"]) .deadline-badge.soon { background: #FFF8E1; color: #F57F17; }
:where(body[data-page="report"]) .deadline-badge.ok { background: #E8F5E9; color: #2E7D32; }

/* ═══════════════════════════════════════════════════════════════
 GESTIÓN DE REPORTES (profesores y administradores)
 ═══════════════════════════════════════════════════════════════ */

:where(body[data-page="report"]) .manage-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1.5rem;
  flex-wrap: wrap;
}

:where(body[data-page="report"]) .search-bar {
  position: relative;
  flex: 1;
  min-width: 200px;
}

:where(body[data-page="report"]) .search-bar svg {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  fill: var(--text-secondary, #999);
}

:where(body[data-page="report"]) .search-bar input {
  width: 100%;
  padding: 10px 14px 10px 38px;
  border: 1.5px solid var(--glass-border, rgba(103,80,164,0.2));
  border-radius: 12px;
  background: var(--glass-bg, #fff);
  color: var(--text-primary, #222);
  font-size: 0.9rem;
  transition: border-color .2s, box-shadow .2s;
  box-sizing: border-box;
}

:where(body[data-page="report"]) .search-bar input:focus {
  outline: none;
  border-color: var(--accent-color, #6750A4);
  box-shadow: 0 0 0 3px var(--accent-glow, rgba(103,80,164,0.15));
}

:where(body[data-page="report"]) .btn-create {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: var(--accent-gradient, linear-gradient(135deg,#6750A4,#9A82DB));
  color: #fff;
  border: none;
  border-radius: 12px;
  padding: 10px 20px;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: opacity .2s, transform .15s;
  box-shadow: 0 2px 12px var(--accent-glow, rgba(103,80,164,0.25));
  white-space: nowrap;
}

:where(body[data-page="report"]) .btn-create:hover { opacity: .88; transform: translateY(-1px); }

:where(body[data-page="report"]) .reports-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

:where(body[data-page="report"]) .report-card {
  background: var(--glass-bg, rgba(255,255,255,0.94));
  border: 1px solid var(--glass-border, rgba(103,80,164,0.12));
  border-radius: 16px;
  padding: 1.2rem 1.4rem;
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
  transition: box-shadow .2s, transform .2s;
}

:where(body[data-page="report"]) .report-card:hover {
  box-shadow: 0 6px 24px var(--accent-glow, rgba(103,80,164,0.15));
  transform: translateY(-2px);
}

:where(body[data-page="report"]) .report-card-icon {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  background: var(--secondary-container, #E8DEF8);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.4rem;
  flex-shrink: 0;
}

:where(body[data-page="report"]) .report-card-info { flex: 1; min-width: 160px; }

:where(body[data-page="report"]) .report-card-title {
  font-weight: 700;
  font-size: 1rem;
  color: var(--text-primary, #1a1a1a);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

:where(body[data-page="report"]) .report-card-meta {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  margin-top: 4px;
}

:where(body[data-page="report"]) .report-meta-chip {
  font-size: 0.75rem;
  color: var(--text-secondary, #666);
  background: var(--secondary-container, #E8DEF8);
  padding: 2px 8px;
  border-radius: 99px;
  white-space: nowrap;
}

:where(body[data-page="report"]) .report-meta-chip.section-chip {
  background: var(--accent-gradient, linear-gradient(135deg,#6750A4,#9A82DB));
  color: #fff;
}

:where(body[data-page="report"]) .report-card-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

:where(body[data-page="report"]) .btn-icon {
  background: none;
  border: 1px solid var(--glass-border, rgba(103,80,164,0.2));
  border-radius: 10px;
  padding: 7px;
  cursor: pointer;
  color: var(--accent-color, #6750A4);
  transition: background .15s, transform .15s;
  display: flex;
  align-items: center;
}

:where(body[data-page="report"]) .btn-icon:hover { background: var(--secondary-container, #E8DEF8); transform: scale(1.1); }
:where(body[data-page="report"]) .btn-icon.danger { color: #e53935; border-color: rgba(229,57,53,0.2); }
:where(body[data-page="report"]) .btn-icon.danger:hover { background: #fff0f0; }

:where(body[data-page="report"]) .status-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  user-select: none;
}

:where(body[data-page="report"]) .toggle-switch { position: relative; width: 36px; height: 20px; }
:where(body[data-page="report"]) .toggle-switch input { opacity: 0; width: 0; height: 0; }

:where(body[data-page="report"]) .toggle-slider {
  position: absolute;
  inset: 0;
  border-radius: 99px;
  background: #ccc;
  transition: background .3s;
}

:where(body[data-page="report"]) .toggle-slider::before {
  content: '';
  position: absolute;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #fff;
  top: 3px;
  left: 3px;
  transition: transform .3s;
}

:where(body[data-page="report"]) .toggle-switch input:checked + .toggle-slider { background: var(--accent-color, #6750A4); }
:where(body[data-page="report"]) .toggle-switch input:checked + .toggle-slider::before { transform: translateX(16px); }

/* Formulario del modal de gestión */
:where(body[data-page="report"]) .form-group { margin-bottom: 1.1rem; }

:where(body[data-page="report"]) .form-label {
  display: block;
  font-size: 0.83rem;
  font-weight: 600;
  color: var(--text-secondary, #555);
  margin-bottom: 5px;
  letter-spacing: 0.02em;
}

:where(body[data-page="report"]) .form-input,
:where(body[data-page="report"]) .form-textarea,
:where(body[data-page="report"]) .form-select {
  width: 100%;
  padding: 10px 14px;
  border: 1.5px solid var(--glass-border, rgba(103,80,164,0.2));
  border-radius: 10px;
  background: var(--bg-primary, #F5F3F8);
  color: var(--text-primary, #1a1a1a);
  font-size: 0.9rem;
  font-family: inherit;
  transition: border-color .2s, box-shadow .2s;
  box-sizing: border-box;
}

:where(body[data-page="report"]) .form-input:focus,
:where(body[data-page="report"]) .form-textarea:focus,
:where(body[data-page="report"]) .form-select:focus {
  outline: none;
  border-color: var(--accent-color, #6750A4);
  box-shadow: 0 0 0 3px var(--accent-glow, rgba(103,80,164,0.18));
}

:where(body[data-page="report"]) .form-textarea { min-height: 80px; resize: vertical; }
:where(body[data-page="report"]) .form-hint { font-size: 0.78rem; color: var(--text-secondary, #777); margin-top: 4px; }

/* Constructor de preguntas */
:where(body[data-page="report"]) .questions-area { margin-top: 1.2rem; }

:where(body[data-page="report"]) .questions-area-label {
  font-size: 0.9rem;
  font-weight: 700;
  color: var(--text-primary, #222);
  margin-bottom: 0.8rem;
}

:where(body[data-page="report"]) .question-type-btns {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 1rem;
}

:where(body[data-page="report"]) .btn-add-q {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 7px 14px;
  border-radius: 10px;
  border: 1.5px solid var(--glass-border, rgba(103,80,164,0.2));
  background: var(--glass-bg, #fff);
  color: var(--accent-color, #6750A4);
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  transition: background .15s, border-color .15s, transform .1s;
}

:where(body[data-page="report"]) .btn-add-q:hover {
  background: var(--secondary-container, #E8DEF8);
  border-color: var(--accent-color, #6750A4);
  transform: translateY(-1px);
}

:where(body[data-page="report"]) .questions-list { display: flex; flex-direction: column; gap: 0.75rem; }

:where(body[data-page="report"]) .question-item {
  background: var(--secondary-container, #E8DEF8);
  border-radius: 12px;
  padding: 1rem 1.1rem;
  position: relative;
  animation: slideDown .2s ease;
}

@keyframes slideDown {
  from { opacity: 0; transform: translateY(-8px); }
  to   { opacity: 1; transform: translateY(0); }
}

:where(body[data-page="report"]) .question-item-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 0.6rem;
}

:where(body[data-page="report"]) .question-type-badge {
  font-size: 0.7rem;
  font-weight: 700;
  padding: 3px 8px;
  border-radius: 99px;
  background: var(--accent-color, #6750A4);
  color: #fff;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

:where(body[data-page="report"]) .question-item .remove-q {
  margin-left: auto;
  background: none;
  border: none;
  cursor: pointer;
  color: #e53935;
  font-size: 1rem;
  line-height: 1;
  padding: 2px;
}

:where(body[data-page="report"]) .options-list { margin-top: 0.5rem; }

:where(body[data-page="report"]) .option-row {
  display: flex;
  gap: 6px;
  margin-bottom: 5px;
  align-items: center;
}

:where(body[data-page="report"]) .option-row .form-input { flex: 1; padding: 6px 10px; }

:where(body[data-page="report"]) .btn-remove-opt {
  background: none;
  border: none;
  color: #e53935;
  cursor: pointer;
  font-size: 1.1rem;
  line-height: 1;
}

:where(body[data-page="report"]) .btn-add-opt {
  background: none;
  border: 1px dashed var(--accent-color, #6750A4);
  color: var(--accent-color, #6750A4);
  border-radius: 8px;
  padding: 5px 12px;
  font-size: 0.8rem;
  cursor: pointer;
  margin-top: 4px;
}

/* Sección de acceso (por sección + individual) */
:where(body[data-page="report"]) .access-section {
  margin-top: 1.4rem;
  padding-top: 1.2rem;
  border-top: 1px solid var(--glass-border, rgba(103,80,164,0.12));
}

:where(body[data-page="report"]) .access-title {
  font-size: 0.9rem;
  font-weight: 700;
  color: var(--text-primary, #222);
  margin-bottom: 0.7rem;
}

:where(body[data-page="report"]) .student-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 200px;
  overflow-y: auto;
}

:where(body[data-page="report"]) .student-row {
  display: flex;
  align-items: center;
  gap: 10px;
  background: var(--glass-bg, #fff);
  border-radius: 10px;
  padding: 8px 12px;
  border: 1px solid var(--glass-border, rgba(103,80,164,0.1));
}

:where(body[data-page="report"]) .student-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--accent-gradient, linear-gradient(135deg,#6750A4,#9A82DB));
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 0.8rem;
  font-weight: 700;
  flex-shrink: 0;
}

:where(body[data-page="report"]) .student-name { flex: 1; font-size: 0.87rem; color: var(--text-primary, #222); }
:where(body[data-page="report"]) .student-email { font-size: 0.75rem; color: var(--text-secondary, #888); }

:where(body[data-page="report"]) .btn-save {
  padding: 10px 24px;
  border: none;
  border-radius: 10px;
  background: var(--accent-gradient, linear-gradient(135deg,#6750A4,#9A82DB));
  color: #fff;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: opacity .2s, transform .15s;
  box-shadow: 0 2px 10px var(--accent-glow, rgba(103,80,164,0.25));
}

:where(body[data-page="report"]) .btn-save:hover { opacity: .88; transform: translateY(-1px); }

/* Tabla de respuestas */
:where(body[data-page="report"]) .submissions-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
  margin-top: 0.5rem;
}

:where(body[data-page="report"]) .submissions-table th {
  text-align: left;
  padding: 8px 10px;
  border-bottom: 2px solid var(--glass-border, rgba(103,80,164,0.15));
  color: var(--text-secondary, #666);
  font-weight: 600;
  font-size: 0.78rem;
  letter-spacing: 0.03em;
}

:where(body[data-page="report"]) .submissions-table td {
  padding: 10px;
  border-bottom: 1px solid var(--glass-border, rgba(103,80,164,0.08));
  color: var(--text-primary, #222);
}

:where(body[data-page="report"]) .submissions-table tr:last-child td { border-bottom: none; }
:where(body[data-page="report"]) .submissions-table tr:hover td { background: var(--secondary-container, #E8DEF8); }

@media (max-width: 600px) {
  :where(body[data-page="report"]) .report-card { flex-wrap: wrap; }
  :where(body[data-page="report"]) .report-card-actions { width: 100%; justify-content: flex-end; }
}

@media (max-width: 480px) {
  :where(body[data-page="report"]) .reports-grid { grid-template-columns: 1fr; }
  :where(body[data-page="report"]) .modal-box { padding: 1.2rem; }
  :where(body[data-page="report"]) .tab-btn { padding: 9px 12px; font-size: 0.82rem; }
}
</style>
