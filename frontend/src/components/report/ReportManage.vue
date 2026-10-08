<template>
  <!-- Pestaña "Gestionar" (solo profesores / administradores) -->
  <div id="tab-manage" :style="{ display: visible ? '' : 'none' }">
    <div class="manage-toolbar">
      <div class="search-bar">
        <svg viewBox="0 0 24 24" width="16" height="16">
          <path
            d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"
          />
        </svg>
        <input id="manage-search-input" v-model="search" type="text" placeholder="Buscar reportes..." autocomplete="off">
      </div>
      <button id="btn-new-report" class="btn-create" @click="openEditor(null)">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
          <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
        </svg>
        Nuevo Reporte
      </button>
    </div>
    <div id="reports-list" class="reports-list">
      <div
        v-for="r in filtered"
        :key="r.id"
        class="report-card"
        :data-id="r.id"
        :data-report-id="r.id"
        :style="removing.has(r.id) ? { transition: 'opacity .25s, transform .25s', opacity: '0', transform: 'translateX(20px)' } : undefined"
      >
        <div class="report-card-icon">{{ r.icon || '📋' }}</div>
        <div class="report-card-info">
          <div class="report-card-title">{{ r.title }}</div>
          <div class="report-card-meta">
            <span class="report-meta-chip">❓ {{ countLabel((r.questions ?? []).length, 'pregunta') }}</span>
            <span class="report-meta-chip">👥 {{ (r.access ?? []).length }} con acceso</span>
            <span v-if="r.sectionId" class="report-meta-chip section-chip">🏫 {{ r.sectionName || 'Sección' }}</span>
            <span v-if="r.deadline" class="report-meta-chip" :style="deadlineChip(r.deadline, 'Hoy').style">📅 {{ deadlineChip(r.deadline, 'Hoy').label }}</span>
          </div>
        </div>
        <label class="status-toggle" :title="`${r.active ? 'Desactivar' : 'Activar'} reporte`">
          <div class="toggle-switch">
            <input type="checkbox" class="toggle-active" :data-id="r.id" :checked="r.active" @change="toggleActive(r, ($event.target as HTMLInputElement).checked)">
            <span class="toggle-slider"></span>
          </div>
          <span style="font-size:0.78rem; color:var(--text-secondary,#888);">{{ r.active ? 'Activo' : 'Inactivo' }}</span>
        </label>
        <div class="report-card-actions">
          <button class="btn-icon btn-submissions" :data-id="r.id" title="Ver respuestas" aria-label="Ver respuestas" @click="viewSubmissions(r)">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
              <path
                d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"
              />
            </svg>
          </button>
          <button class="btn-icon btn-edit" :data-id="r.id" title="Editar" aria-label="Editar reporte" @click="openEditor(r)">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
              <path
                d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34a.9959.9959 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"
              />
            </svg>
          </button>
          <button class="btn-icon danger btn-delete" :data-id="r.id" title="Eliminar" aria-label="Eliminar reporte" @click="deleteReport(r)">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
              <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
    <div id="manage-empty-state" class="empty-state" :style="{ display: loaded && !filtered.length ? 'block' : 'none' }">
      <div class="empty-state-icon">📋</div>
      <h3>Sin reportes aún</h3>
      <p>Crea tu primer reporte pulsando "Nuevo Reporte".</p>
    </div>
  </div>

  <!-- ===== MODAL: CREAR / EDITAR REPORTE ===== -->
  <div id="modal-report" class="modal-overlay" :class="{ open: editorOpen }" role="dialog" aria-modal="true" aria-labelledby="manage-modal-title" @click.self="closeEditor">
    <div class="modal-box">
      <div class="modal-header">
        <div class="modal-title-wrap">
          <span id="manage-modal-title" class="modal-title">{{ editingId ? 'Editar Reporte' : 'Crear Reporte' }}</span>
        </div>
        <button id="manage-modal-close-btn" class="modal-close" aria-label="Cerrar" @click="closeEditor">✕</button>
      </div>

      <!-- Datos básicos -->
      <div class="form-group">
        <label class="form-label" for="report-title-input">Título del reporte *</label>
        <input id="report-title-input" ref="titleEl" v-model="form.title" class="form-input" type="text" placeholder="Ej: Reporte de práctica semanal" maxlength="120">
      </div>
      <div class="form-group">
        <label class="form-label" for="report-desc-input">Descripción / instrucciones</label>
        <textarea id="report-desc-input" v-model="form.description" class="form-textarea" placeholder="Explica qué deben reportar..."></textarea>
      </div>
      <div class="form-group" style="display:flex; gap:12px; flex-wrap:wrap;">
        <div style="flex:1; min-width:140px;">
          <label class="form-label" for="report-deadline">Fecha límite</label>
          <input id="report-deadline" v-model="form.deadline" class="form-input" type="date">
        </div>
        <div style="flex:1; min-width:140px;">
          <label class="form-label" for="report-icon">Ícono</label>
          <select id="report-icon" v-model="form.icon" class="form-select">
            <option v-for="[icon, label] in ICONS" :key="icon" :value="icon">{{ icon }} {{ label }}</option>
          </select>
        </div>
      </div>

      <!-- Constructor de preguntas -->
      <div class="questions-area">
        <div class="questions-area-label">Preguntas del reporte</div>
        <div class="question-type-btns">
          <button v-for="[type, label] in ADD_BUTTONS" :key="type" class="btn-add-q" type="button" :data-type="type" @click="addQuestion(type)">{{ label }}</button>
        </div>
        <div id="questions-list" class="questions-list">
          <div v-for="(q, qi) in form.questions" :key="q.key" class="question-item" :data-qid="q.id" :data-type="q.type">
            <div class="question-item-header">
              <span class="question-type-badge">{{ QUESTION_TYPE_LABELS[q.type] || q.type }}</span>
              <button class="remove-q" type="button" title="Eliminar pregunta" aria-label="Eliminar pregunta" @click="form.questions.splice(qi, 1)">✕</button>
            </div>
            <div class="form-group" style="margin-bottom:0.4rem;">
              <input v-model="q.label" class="form-input q-label" type="text" placeholder="Escribe la pregunta…" aria-label="Texto de la pregunta">
            </div>
            <template v-if="q.type === 'select'">
              <div class="options-list">
                <div v-for="(opt, oi) in q.options" :key="opt.key" class="option-row">
                  <input v-model="opt.value" class="form-input" type="text" :placeholder="`Opción ${oi + 1}`" :aria-label="`Opción ${oi + 1}`">
                  <button class="btn-remove-opt" type="button" title="Quitar opción" aria-label="Quitar opción" @click="removeOption(q, oi)">✕</button>
                </div>
              </div>
              <button class="btn-add-opt" type="button" @click="q.options.push({ key: ++keySeq, value: '' })">+ Añadir opción</button>
            </template>
            <p v-else-if="q.type === 'image'" class="form-hint">El usuario podrá subir una o más imágenes (JPG, PNG, WebP · máx 5 MB c/u).</p>
            <p v-else-if="q.type === 'time'" class="form-hint">Campo de hora (HH:MM).</p>
            <p v-else-if="q.type === 'date'" class="form-hint">Campo de fecha (YYYY-MM-DD).</p>
          </div>
        </div>
      </div>

      <!-- Asignación por sección -->
      <div class="access-section">
        <div class="access-title">🏫 Asignar por sección</div>
        <p class="form-hint" style="margin-bottom:0.7rem;">
          Todos los estudiantes de la sección seleccionada tendrán acceso automáticamente, incluidos los que se agreguen a la sección más adelante.
        </p>
        <select id="report-section-select" v-model="form.sectionId" class="form-select">
          <option value="">Sin sección (solo acceso individual)</option>
          <option v-for="s in sections" :key="s.id" :value="s.id">
            {{ s.name }}{{ s.course_title ? ` — ${s.course_title}` : '' }} ({{ s.student_count }} estudiante{{ s.student_count !== 1 ? 's' : '' }})
          </option>
        </select>
      </div>

      <!-- Acceso individual -->
      <div class="access-section">
        <div class="access-title">👥 Acceso individual adicional</div>
        <p class="form-hint" style="margin-bottom:0.7rem;">
          Busca por cédula para dar acceso a personas puntuales (de cualquier rol), además de la sección elegida arriba.
        </p>
        <div id="student-list">
          <div style="display:flex; gap:8px; margin-bottom:0.7rem;">
            <input
              id="access-search-dni"
              v-model="accessSearch"
              class="form-input"
              type="text"
              placeholder="Buscar por cédula…"
              maxlength="20"
              style="flex:1;"
              aria-label="Buscar usuario por cédula"
              @keydown.enter.prevent="searchUser"
            >
            <button id="access-search-btn" class="btn-save" type="button" style="padding:9px 16px; white-space:nowrap;" @click="searchUser">Buscar</button>
          </div>
          <div id="access-search-result" style="margin-bottom:0.7rem; min-height:36px;">
            <span v-if="searchState === 'searching'" style="font-size:0.82rem;color:var(--text-secondary,#888);">Buscando…</span>
            <span v-else-if="searchState === 'notfound'" style="font-size:0.82rem;color:#e53935;">Usuario no encontrado.</span>
            <div v-else-if="found" class="student-row" style="background:var(--secondary-container,#E8DEF8);">
              <div class="student-avatar">{{ initials(found.first_name, found.last_name) }}</div>
              <div style="flex:1; min-width:0;">
                <div class="student-name">{{ found.first_name }} {{ found.last_name }}</div>
                <div class="student-email">{{ maskEmail(found.email || '') }}</div>
              </div>
              <button
                id="access-add-btn"
                class="btn-save"
                type="button"
                style="padding:7px 14px; font-size:0.82rem;"
                :style="access[String(found.dni)] ? 'opacity:.5;cursor:not-allowed;' : ''"
                @click="addFound"
              >
                {{ access[String(found.dni)] ? 'Agregado' : '+ Agregar' }}
              </button>
            </div>
          </div>
          <div id="access-added-list" style="display:flex; flex-direction:column; gap:6px; max-height:220px; overflow-y:auto;">
            <p v-if="!Object.keys(access).length" style="font-size:0.8rem;color:var(--text-secondary,#aaa);text-align:center;padding:0.5rem 0;">Sin usuarios agregados aún.</p>
            <div v-for="u in Object.values(access)" :key="u.dni" class="student-row">
              <div class="student-avatar">{{ initials(u.firstName, u.lastName) }}</div>
              <div style="flex:1; min-width:0;">
                <div class="student-name">{{ u.firstName }} {{ u.lastName }}</div>
                <div class="student-email">{{ maskEmail(u.email) }}</div>
              </div>
              <button class="btn-icon danger btn-remove-access" :data-dni="u.dni" title="Quitar acceso" @click="delete access[u.dni]">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                  <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div class="modal-footer">
        <button id="manage-modal-cancel-btn" class="btn-cancel" @click="closeEditor">Cancelar</button>
        <button id="manage-modal-save-btn" class="btn-save" @click="saveReport">Guardar reporte</button>
      </div>
    </div>
  </div>

  <!-- ===== MODAL: VER RESPUESTAS ===== -->
  <div id="modal-submissions" class="modal-overlay" :class="{ open: subs.open }" role="dialog" aria-modal="true" @click.self="subs.open = false">
    <div class="modal-box">
      <div class="modal-header">
        <span id="submissions-title" class="modal-title">Respuestas — {{ subs.report?.title || '' }}</span>
        <button id="submissions-close-btn" class="modal-close" aria-label="Cerrar" @click="subs.open = false">✕</button>
      </div>
      <div id="submissions-content">
        <div v-if="subs.state === 'loading'" style="text-align:center; padding:3rem;">
          <div class="spinner" style="margin:auto;"></div>
        </div>
        <div v-else-if="subs.state === 'error'" class="empty-state" style="padding:2.5rem;">
          <div class="empty-state-icon">⚠️</div>
          <h3>No se pudieron cargar las respuestas</h3>
          <p>Inténtalo de nuevo en unos segundos.</p>
        </div>
        <div v-else-if="!subs.list.length" class="empty-state" style="padding:2.5rem;">
          <div class="empty-state-icon">📭</div>
          <h3>Sin respuestas aún</h3>
          <p>Las personas con acceso aún no han completado este reporte.</p>
        </div>
        <template v-else>
          <div style="display:flex; gap:1rem; flex-wrap:wrap; margin-bottom:1rem;">
            <div v-for="stat in subsStats" :key="stat.label" style="flex:1; background:var(--secondary-container,#E8DEF8); border-radius:12px; padding:0.8rem 1rem; text-align:center; min-width:100px;">
              <div style="font-size:1.4rem; font-weight:700; color:var(--accent-color,#6750A4);">{{ stat.value }}</div>
              <div style="font-size:0.75rem; color:var(--text-secondary,#777);">{{ stat.label }}</div>
            </div>
          </div>
          <div style="overflow-x:auto;">
            <table class="submissions-table">
              <thead>
                <tr>
                  <th>Persona</th>
                  <th>Enviado</th>
                  <th v-for="q in subs.report?.questions ?? []" :key="q.id">{{ q.label || q.type }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="s in subs.list" :key="s.id">
                  <td><strong>{{ s.studentName || s.studentId || '—' }}</strong></td>
                  <td>{{ s.submittedAt ? new Date(s.submittedAt).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' }) : '—' }}</td>
                  <td v-for="q in subs.report?.questions ?? []" :key="q.id">
                    <span v-if="!s.answers?.[q.id]" style="color:var(--text-secondary,#aaa)">—</span>
                    <template v-else-if="q.type === 'image'">
                      <template v-if="imageAnswers(s, q).length">
                        <template v-for="(url, i) in imageAnswers(s, q)" :key="i">
                          <br v-if="i > 0">
                          <a :href="url" target="_blank" rel="noopener">📷 Imagen {{ i + 1 }}</a>
                        </template>
                      </template>
                      <span v-else style="color:var(--text-secondary,#aaa)">Sin imagen</span>
                    </template>
                    <span v-else :title="String(s.answers[q.id])">{{ String(s.answers[q.id]).slice(0, 80) }}{{ String(s.answers[q.id]).length > 80 ? '…' : '' }}</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// Gestión de reportes de profesores y administradores (la pestaña
// "Gestionar" de la página de reportes): crear, editar, activar, borrar,
// asignar a una sección o a personas sueltas y ver las respuestas.
import { computed, nextTick, onBeforeUnmount, reactive, ref } from 'vue';
import { QUESTION_TYPE_LABELS, deadlineChip, reportsApi, type ManagedReport, type Question, type QuestionType, type Submission } from '@/lib/reports';

const props = defineProps<{
  visible: boolean;
  toast: (msg: string, duration?: number) => void;
  setLoading: (on: boolean) => void;
}>();

interface SectionOption {
  id: string;
  name: string;
  course_title?: string | null;
  student_count: number;
}

interface UserOption {
  id: string;
  name?: string | null;
  email?: string | null;
}

interface FoundUser {
  dni: string;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
}

interface AccessEntry {
  dni: string;
  firstName: string;
  lastName: string;
  email: string;
}

interface EditorQuestion {
  key: number;
  id: string;
  type: QuestionType;
  label: string;
  options: { key: number; value: string }[];
}

const ICONS: [string, string][] = [
  ['📋', 'General'],
  ['📝', 'Tarea'],
  ['🔬', 'Investigación'],
  ['📊', 'Datos'],
  ['🏃', 'Actividad física'],
  ['💡', 'Proyecto'],
  ['📸', 'Fotográfico'],
  ['🧪', 'Laboratorio'],
];
const ADD_BUTTONS: [QuestionType, string][] = [
  ['text', '✏️ Texto'],
  ['select', '☑️ Selección'],
  ['time', '🕐 Hora'],
  ['date', '📅 Fecha'],
  ['image', '🖼️ Imagen'],
];

function countLabel(n: number, word: string): string {
  return `${n} ${word}${n !== 1 ? 's' : ''}`;
}

function initials(first?: string | null, last?: string | null): string {
  return `${first?.[0] ?? ''}${last?.[0] ?? ''}`.toUpperCase() || '?';
}

/** a***a@g***l.com */
function maskEmail(email: string): string {
  if (!email.includes('@')) return email;
  const [local = '', domain = ''] = email.split('@');
  const [domName = '', ...domExt] = domain.split('.');
  const mask = (s: string) => (s.length <= 2 ? s[0] + '*'.repeat(s.length - 1) : s[0] + '*'.repeat(s.length - 2) + s[s.length - 1]);
  return `${mask(local)}@${mask(domName)}.${domExt.join('.')}`;
}

// ── Lista ─────────────────────────────────────────────────────────────────
const reports = ref<ManagedReport[]>([]);
const loaded = ref(false);
const search = ref('');
const removing = reactive(new Set<string>());

const filtered = computed(() => {
  const q = search.value.toLowerCase().trim();
  return reports.value.filter((r) => r.title.toLowerCase().includes(q) || (r.description || '').toLowerCase().includes(q));
});

async function reload() {
  props.setLoading(true);
  try {
    reports.value = await reportsApi<ManagedReport[]>('/api/reports');
  } catch (err) {
    console.warn('[ReportManage] No se pudieron cargar los reportes:', err);
    props.toast('❌ No se pudieron cargar los reportes.');
  } finally {
    loaded.value = true;
    props.setLoading(false);
  }
}


// ── Activar / desactivar ──────────────────────────────────────────────────
async function toggleActive(r: ManagedReport, active: boolean) {
  r.active = active;
  try {
    await reportsApi(`/api/reports/${encodeURIComponent(r.id)}`, { method: 'PUT', body: { active } });
    props.toast(active ? '✅ Reporte activado.' : '⏸ Reporte desactivado.');
  } catch (err) {
    console.error('[ReportManage] Error al actualizar estado:', err);
    r.active = !active;
    props.toast('❌ Error al cambiar el estado.');
  }
}

// ── Eliminar ──────────────────────────────────────────────────────────────
const timers: number[] = [];
onBeforeUnmount(() => timers.forEach(clearTimeout));

async function deleteReport(r: ManagedReport) {
  if (!confirm(`¿Eliminar el reporte "${r.title || r.id}"?\n\nEsta acción no se puede deshacer y eliminará todas las respuestas asociadas.`)) return;
  props.setLoading(true);
  try {
    await reportsApi(`/api/reports/${encodeURIComponent(r.id)}`, { method: 'DELETE' });
  } catch (err) {
    console.error('[ReportManage] Error al eliminar:', err);
    props.toast('❌ Error al eliminar el reporte.');
    props.setLoading(false);
    return;
  }
  removing.add(r.id);
  timers.push(
    window.setTimeout(() => {
      reports.value = reports.value.filter((x) => x.id !== r.id);
      removing.delete(r.id);
      props.setLoading(false);
      props.toast('🗑️ Reporte eliminado.');
    }, 250),
  );
}

// ── Editor ────────────────────────────────────────────────────────────────
const editorOpen = ref(false);
const editingId = ref<string | null>(null);
const titleEl = ref<HTMLInputElement | null>(null);
const sections = ref<SectionOption[]>([]);
let keySeq = 0;
let qCounter = 0;

const form = reactive({ title: '', description: '', deadline: '', icon: '📋', sectionId: '', questions: [] as EditorQuestion[] });
const access = reactive<Record<string, AccessEntry>>({});
const accessSearch = ref('');
const searchState = ref<'idle' | 'searching' | 'notfound' | 'found'>('idle');
const found = ref<FoundUser | null>(null);

function newQuestion(type: QuestionType, existing?: Question): EditorQuestion {
  // Las preguntas nuevas se numeran q1, q2…; se salta un id que ya use otra.
  let id = existing?.id;
  while (!id || (!existing && form.questions.some((q) => q.id === id))) id = `q${++qCounter}`;
  const options = type === 'select' ? (existing?.options?.length ? existing.options : ['', '']) : [];
  return { key: ++keySeq, id, type, label: existing?.label || '', options: options.map((value) => ({ key: ++keySeq, value })) };
}

function addQuestion(type: QuestionType) {
  form.questions.push(newQuestion(type));
}

function removeOption(q: EditorQuestion, i: number) {
  if (q.options.length <= 2) {
    props.toast('Mínimo 2 opciones requeridas.');
    return;
  }
  q.options.splice(i, 1);
}

async function loadSections() {
  try {
    sections.value = await reportsApi<SectionOption[]>('/api/report-sections');
  } catch {
    sections.value = [];
  }
}

async function loadUsers(): Promise<UserOption[]> {
  try {
    return await reportsApi<UserOption[]>('/api/students');
  } catch {
    return [];
  }
}

async function openEditor(r: ManagedReport | null) {
  editingId.value = r?.id ?? null;
  qCounter = 0;
  Object.assign(form, { title: '', description: '', deadline: '', icon: '📋', sectionId: '', questions: [] });
  Object.keys(access).forEach((k) => delete access[k]);
  accessSearch.value = '';
  searchState.value = 'idle';
  found.value = null;

  await loadSections();
  if (r) {
    Object.assign(form, { title: r.title || '', description: r.description || '', deadline: r.deadline || '', icon: r.icon || '📋', sectionId: r.sectionId || '' });
    for (const q of r.questions ?? []) {
      ++qCounter;
      form.questions.push(newQuestion(q.type, q));
    }
    // Solo el acceso individual: el de la sección se gestiona con su selector.
    const individual = r.individualAccess ?? [];
    if (individual.length) {
      const users = await loadUsers();
      for (const dni of individual) {
        const u = users.find((x) => String(x.id) === String(dni));
        access[String(dni)] = u
          ? { dni: String(u.id), firstName: u.name?.split(' ')[0] || '', lastName: u.name?.split(' ').slice(1).join(' ') || '', email: u.email || '' }
          : { dni: String(dni), firstName: '—', lastName: '', email: '' };
      }
    }
  }
  editorOpen.value = true;
}

function closeEditor() {
  editorOpen.value = false;
  editingId.value = null;
}

async function searchUser() {
  const dni = accessSearch.value.trim();
  if (!dni) {
    props.toast('Escribe una cédula para buscar.');
    return;
  }
  searchState.value = 'searching';
  try {
    found.value = await reportsApi<FoundUser>(`/api/users/search?dni=${encodeURIComponent(dni)}`);
    searchState.value = 'found';
  } catch {
    found.value = null;
    searchState.value = 'notfound';
  }
}

function addFound() {
  const u = found.value;
  if (!u || access[String(u.dni)]) return;
  access[String(u.dni)] = { dni: String(u.dni), firstName: u.first_name || '', lastName: u.last_name || '', email: u.email || '' };
  found.value = null;
  searchState.value = 'idle';
  accessSearch.value = '';
  props.toast('✅ Usuario agregado al reporte.');
}

async function saveReport() {
  const title = form.title.trim();
  if (!title) {
    props.toast('⚠️ El título del reporte es obligatorio.');
    void nextTick(() => titleEl.value?.focus());
    return;
  }
  const questions: Question[] = form.questions.map((q) => ({
    id: q.id,
    type: q.type,
    label: q.label.trim(),
    ...(q.type === 'select' ? { options: q.options.map((o) => o.value.trim()).filter(Boolean) } : {}),
  }));
  if (!questions.length) {
    props.toast('⚠️ Agrega al menos una pregunta al reporte.');
    return;
  }
  for (const q of questions) {
    if (!q.label) {
      props.toast('⚠️ Todas las preguntas deben tener un texto.');
      return;
    }
    if (q.type === 'select' && (q.options ?? []).length < 2) {
      props.toast(`⚠️ La pregunta "${q.label}" necesita al menos 2 opciones.`);
      return;
    }
  }

  const payload = {
    title,
    description: form.description.trim(),
    icon: form.icon || '📋',
    deadline: form.deadline || null,
    questions,
    access: Object.keys(access),
    sectionId: form.sectionId || null,
    active: true,
  };

  props.setLoading(true);
  try {
    if (editingId.value) {
      await reportsApi(`/api/reports/${encodeURIComponent(editingId.value)}`, { method: 'PUT', body: payload });
      props.toast('✅ Reporte actualizado correctamente.');
    } else {
      await reportsApi('/api/reports', { method: 'POST', body: payload });
      props.toast('✅ Reporte creado correctamente.');
    }
    closeEditor();
    props.setLoading(false);
    await reload();
  } catch (err) {
    // El modal se queda abierto para no perder lo escrito.
    console.error('[ReportManage] Error al guardar:', err);
    props.toast('❌ No se pudo guardar el reporte. Inténtalo de nuevo.');
    props.setLoading(false);
  }
}

// ── Respuestas ────────────────────────────────────────────────────────────
const subs = reactive({ open: false, state: 'loading' as 'loading' | 'ready' | 'error', report: null as ManagedReport | null, list: [] as Submission[] });

const subsStats = computed(() => {
  const accessCount = (subs.report?.access ?? []).length;
  const pct = accessCount > 0 ? Math.min(100, Math.round((subs.list.length / accessCount) * 100)) : 0;
  return [
    { label: 'Respuestas', value: subs.list.length },
    { label: 'Con acceso', value: accessCount },
    { label: 'Completado', value: `${pct}%` },
  ];
});

function imageAnswers(s: Submission, q: Question): string[] {
  const ans = s.answers?.[q.id];
  return Array.isArray(ans) ? ans : [];
}

async function viewSubmissions(r: ManagedReport) {
  Object.assign(subs, { open: true, state: 'loading', report: r, list: [] });
  try {
    subs.list = await reportsApi<Submission[]>(`/api/reports/${encodeURIComponent(r.id)}/submissions`);
    subs.state = 'ready';
  } catch (err) {
    console.error('[ReportManage] Error al cargar respuestas:', err);
    subs.state = 'error';
  }
}

// Escape cierra el modal abierto.
function onKeydown(e: KeyboardEvent) {
  if (e.key !== 'Escape') return;
  if (editorOpen.value) closeEditor();
  if (subs.open) subs.open = false;
}
document.addEventListener('keydown', onKeydown);
onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown));

/** Para que la página sepa si hay un modal abierto (bloquea el scroll). */
const anyModalOpen = computed(() => editorOpen.value || subs.open);
defineExpose({ reload, anyModalOpen });
</script>
