<template>
  <header class="header">
    <MenuToggle />
    <div class="header-title">Aula Virtual</div>
  </header>

  <div class="classroom-container">
    <div class="classroom-hero">
      <img class="module-hero-icon" src="/icons/ui/classroom-48.png" srcset="/icons/ui/classroom-48.png 1x, /icons/ui/classroom-96.png 2x" alt="" width="64" height="64" loading="lazy" decoding="async">
      <p>Revisa y entrega tus tareas asignadas. Mantén tu progreso al día.</p>
    </div>

    <div class="classroom-toolbar">
      <div id="user-greeting" style="font-size: 1rem; color: var(--text-secondary);">Hola, {{ currentUser?.dni || 'Estudiante' }}</div>
      <button
        v-if="canOpenProfessorPanel"
        id="professor-btn"
        class="btn-secondary"
        title="Panel docente"
        @click="openProfessorPanel"
      >
        👨‍🏫 Panel docente
      </button>
    </div>

    <div v-if="state === 'loading'" class="loading-state">
      <div class="loading-spinner"></div>
      Cargando clases...
    </div>
    <div v-else-if="state === 'expired'" class="empty-state">
      <span class="empty-state-icon">⚠️</span>
      <h3>Sesión expirada</h3>
      <p>Por favor, <AppLink to="login">inicia sesión de nuevo</AppLink>.</p>
    </div>
    <div v-else-if="state === 'error'" class="empty-state">
      <span class="empty-state-icon">❌</span>
      <h3>Error cargando tus clases</h3>
      <p>{{ error }}</p>
    </div>

    <template v-else>
      <!-- Primero: las clases a las que pertenece el estudiante -->
      <template v-if="selectedClass === null">
        <div id="tasks-count" class="tasks-count">{{ classLabel }}</div>

        <div v-if="!classGroups.length" class="empty-state">
          <span class="empty-state-icon">📭</span>
          <h3>No estás unido a ninguna clase</h3>
          <p>Cuando tu profesor te agregue a una clase, aparecerá aquí.</p>
        </div>

        <div v-else class="class-grid">
          <div v-for="cls in classGroups" :key="cls.key" class="class-card">
            <div class="class-icon">📚</div>
            <h3 class="class-title">{{ cls.course_title }}</h3>
            <p class="class-section">🗂️ Sección: {{ cls.section_name }}</p>
            <div class="class-stats">
              <span>⏳ {{ classStats(cls).pending }} pendientes</span>
              <span>✅ {{ classStats(cls).completed }} completadas</span>
              <span>📊 Promedio: {{ classStats(cls).avg }}</span>
            </div>
            <button class="btn-primary class-open-btn" @click="selectedClass = cls.key">Abrir clase</button>
          </div>
        </div>
      </template>

      <!-- Dentro de una clase: sus tareas -->
      <template v-else>
        <button class="back-btn" @click="selectedClass = null">← Volver a clases</button>
        <div class="class-heading">
          <h2>{{ currentClass?.course_title }}</h2>
          <span class="class-section">🗂️ Sección: {{ currentClass?.section_name }}</span>
        </div>

        <!-- Plan de evaluación de la clase, arriba del todo -->
        <section v-if="classPlans.length" class="eval-plans">
          <h3 class="eval-plans-title">📚 Plan de evaluación</h3>
          <article v-for="plan in classPlans" :key="plan.id" class="eval-plan-card">
            <header class="eval-plan-head">
              <div>
                <h4 class="eval-plan-name">{{ plan.title }}</h4>
                <p v-if="plan.strategy" class="eval-plan-strategy">{{ plan.strategy }}</p>
              </div>
              <div class="eval-plan-total">
                <span class="eval-plan-total-value">{{ plan.obtained }}</span>
                <span class="eval-plan-total-max">/ {{ plan.maxScore || plan.total }} pts</span>
              </div>
            </header>

            <ul class="eval-plan-items">
              <li v-for="item in plan.items" :key="item.assignment.id" class="eval-plan-item">
                <div class="eval-plan-item-main">
                  <strong class="eval-plan-item-title">{{ item.assignment.title }}</strong>
                  <div class="eval-plan-item-meta">
                    <span>📅 {{ planDue(item.assignment.due_date) }}</span>
                    <span>Puntaje: {{ item.assignment.max_score ?? '—' }}</span>
                  </div>
                  <details class="eval-plan-contents">
                    <summary>Ver contenidos</summary>
                    <p>{{ planContents(item.assignment.description) }}</p>
                  </details>
                </div>
                <span
                  class="eval-plan-grade"
                  :class="{
                    'is-graded': item.score !== null,
                    'is-submitted': item.submitted && item.score === null,
                  }"
                >
                  {{ item.score !== null
                    ? `${item.score} / ${item.assignment.max_score ?? '?'}`
                    : item.submitted ? 'Entregado' : 'Pendiente' }}
                </span>
              </li>
            </ul>
          </article>
        </section>

        <div id="tasks-count" class="tasks-count">{{ countLabel }}</div>

        <div id="tasks-container" ref="containerEl" class="task-list">
          <div v-if="!cards.length" class="empty-state">
            <span class="empty-state-icon">📭</span>
            <h3>No hay tareas en esta clase</h3>
            <p>Por ahora no hay ninguna tarea pendiente para ti.</p>
          </div>
          <template v-else>
          <div
            v-for="card in cards"
            :key="card.assignment.id"
            class="task-card"
            :class="{ completed: card.done }"
            :data-assignment-id="card.assignment.id"
            :style="{ '--card-accent': card.accent }"
          >
            <span class="status-badge" :class="card.statusClass">{{ card.statusText }}</span>
            <div class="task-icon">{{ card.icon }}</div>
            <h3 class="task-title">{{ card.assignment.title }}</h3>
            <p class="task-course-name">
              📚 {{ card.assignment.course_title || 'Sin curso' }}
              <span v-if="card.assignment.section_name" style="margin-left:8px; font-size:0.8rem; background:var(--secondary-container); color:var(--accent-color); padding:2px 8px; border-radius:12px;">🗂️ {{ card.assignment.section_name }}</span>
              <span v-if="card.assignment.submission_type === 'image'" style="margin-left:4px; font-size:0.8rem; background:var(--secondary-container); color:var(--accent-color); padding:2px 8px; border-radius:12px;">🖼️ Imagen</span>
              <span v-else-if="card.assignment.submission_type === 'any'" style="margin-left:4px; font-size:0.8rem; background:var(--secondary-container); color:var(--accent-color); padding:2px 8px; border-radius:12px;">📎 Cualquier formato</span>
            </p>
            <div class="task-meta">
              <span class="task-meta-item"><span>📅</span> {{ card.dueDate }}</span>
              <span v-if="card.score !== null" class="task-meta-item"><span>⭐</span> {{ card.score }} pts</span>
            </div>
            <div class="task-actions">
              <button class="btn-primary btn-learn" :data-id="card.assignment.id" :data-title="card.assignment.title" @click="openTask(card.assignment)">
                🧠 Aprender y Hacer
              </button>
            </div>
          </div>
          </template>
        </div>
      </template>
    </template>
  </div>

  <!-- Clases y resumen, en el panel de la barra lateral -->
  <Teleport to="#sidebar-page-section" defer>
    <h4>Aula</h4>
    <div class="sidebar-panel-section">
      <p class="sidebar-panel-label">Resumen</p>
      <div class="sidebar-stats">
        <div class="stat-card">
          <div class="stat-icon">⏳</div>
          <div class="stat-content">
            <span class="stat-label">Pendientes</span>
            <span id="pending-count" class="stat-value stat-number">{{ stats.pending }}</span>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon">✅</div>
          <div class="stat-content">
            <span class="stat-label">Completadas</span>
            <span id="completed-count" class="stat-value stat-number">{{ stats.completed }}</span>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon">📚</div>
          <div class="stat-content">
            <span class="stat-label">Clases</span>
            <span id="classes-count" class="stat-value stat-number">{{ classGroups.length }}</span>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
// Migración de public/classroom.html y public/classroom.js: tareas del alumno
// con su estado de entrega, filtro por clase y resumen en la barra lateral.
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import MenuToggle from '@/components/MenuToggle.vue';
import AppLink from '@/components/AppLink.vue';
import { api } from '@/lib/api';
import { dialog } from '@/lib/dialog';
import { goToPage } from '@/lib/pages';
import { ensureSubscribed } from '@/lib/push';
import { flashElement, showToast, useRealtime } from '@/lib/realtime';
import { currentUser } from '@/lib/session';

interface Assignment {
  id: number | string;
  title: string;
  description?: string | null;
  course_id?: string | null;
  course_title?: string | null;
  section_id?: string | null;
  section_name?: string | null;
  submission_type?: string | null;
  due_date?: string | null;
  max_score?: number | null;
  created_at?: string | null;
  plan_id?: string | null;
  plan_title?: string | null;
  plan_strategy?: string | null;
  plan_max_score?: number | null;
  points_per_evaluation?: number | null;
  evaluation_count?: number | null;
}

interface Submission {
  assignment_id: number | string;
  score: number | null;
  status?: string | null;
}

interface StudentClass {
  section_id?: string | null;
  section_name?: string | null;
  course_id?: string | null;
  course_title?: string | null;
}

interface ClassGroup {
  key: string;
  course_title: string;
  section_name: string;
  assignments: Assignment[];
}

const router = useRouter();
const route = useRoute();

// El botón del panel docente solo se muestra a profesores y administradores.
const canOpenProfessorPanel = computed(() => {
  const role = String(currentUser.value?.role || '').toLowerCase();
  return ['admin', 'teacher', 'professor', 'profesor'].includes(role);
});

const assignments = ref<Assignment[]>([]);
const submissions = ref<Submission[]>([]);
const classes = ref<StudentClass[]>([]);
const state = ref<'loading' | 'ready' | 'expired' | 'error'>('loading');
const error = ref('');
const containerEl = ref<HTMLElement | null>(null);

// ── Carga ─────────────────────────────────────────────────────────────────
async function loadTasks() {
  const dni = currentUser.value?.dni;
  if (!dni) return;
  try {
    const { ok, status, data } = await api.get<{
      assignments?: Assignment[];
      submissions?: Submission[];
      classes?: StudentClass[];
    }>(`/api/my-submissions?user_dni=${encodeURIComponent(dni)}`);
    if (status === 401) {
      state.value = 'expired';
      return;
    }
    if (!ok) throw new Error(`Error HTTP: ${status}`);
    assignments.value = data.assignments || [];
    submissions.value = data.submissions || [];
    classes.value = data.classes || [];
    state.value = 'ready';
  } catch (err) {
    console.error('Error cargando tareas:', err);
    error.value = err instanceof Error ? err.message : String(err);
    state.value = 'error';
  }
}

// ── Clases y filtro ───────────────────────────────────────────────────────
const selectedClass = ref<string | null>(null);

const classGroups = computed<ClassGroup[]>(() => {
  const groups = new Map<string, ClassGroup>();
  const ensure = (courseId?: string | null, courseTitle?: string | null, sectionId?: string | null, sectionName?: string | null) => {
    const key = `${courseId || 'none'}::${sectionId || 'none'}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        course_title: courseTitle || 'Clase sin nombre',
        section_name: sectionName || 'Sin sección',
        assignments: [],
      };
      groups.set(key, group);
    }
    return group;
  };

  for (const c of classes.value) {
    ensure(c.course_id, c.course_title, c.section_id, c.section_name);
  }
  for (const a of assignments.value) {
    ensure(a.course_id, a.course_title, a.section_id, a.section_name).assignments.push(a);
  }
  return [...groups.values()];
});

const currentClass = computed(() => classGroups.value.find((g) => g.key === selectedClass.value) ?? null);

// Si la clase seleccionada desaparece al recargar, se vuelve al listado.
watch(classGroups, (groups) => {
  if (selectedClass.value && !groups.some((g) => g.key === selectedClass.value)) {
    selectedClass.value = null;
  }
});

const filtered = computed(() =>
  selectedClass.value === null ? assignments.value : currentClass.value?.assignments ?? [],
);

interface PlanItem {
  assignment: Assignment;
  score: number | null;
  submitted: boolean;
}

interface ClassPlan {
  id: string;
  title: string;
  strategy: string;
  maxScore: number;
  total: number;
  obtained: number;
  items: PlanItem[];
}

// Plan de evaluación de la clase seleccionada, con sus contenidos y notas.
const classPlans = computed<ClassPlan[]>(() => {
  const byAssignment = new Map(
    submissions.value
      .filter((s) => s.status !== 'reset')
      .map((s) => [String(s.assignment_id), s]),
  );
  const plans = new Map<string, ClassPlan>();
  for (const assignment of currentClass.value?.assignments ?? []) {
    if (!assignment.plan_id) continue;
    const key = String(assignment.plan_id);
    let plan = plans.get(key);
    if (!plan) {
      plan = {
        id: key,
        title: assignment.plan_title || 'Plan de evaluación',
        strategy: assignment.plan_strategy || '',
        maxScore: Number(assignment.plan_max_score) || 0,
        total: 0,
        obtained: 0,
        items: [],
      };
      plans.set(key, plan);
    }
    const submission = byAssignment.get(String(assignment.id));
    const score = submission?.score ?? null;
    plan.total += Number(assignment.max_score) || 0;
    if (score !== null) plan.obtained += Number(score) || 0;
    plan.items.push({ assignment, score, submitted: !!submission });
  }
  for (const plan of plans.values()) {
    plan.items.sort((a, b) => {
      const aKey = String(a.assignment.due_date || a.assignment.created_at || '');
      const bKey = String(b.assignment.due_date || b.assignment.created_at || '');
      return aKey.localeCompare(bKey) || a.assignment.title.localeCompare(b.assignment.title);
    });
  }
  return [...plans.values()];
});

// Quita las líneas de cabecera del plan que ya se muestran aparte.
function planContents(description?: string | null): string {
  const text = String(description || '').trim();
  if (!text) return 'Sin contenido detallado.';
  const cleaned = text
    .replace(/^Plan de evaluación:.*$/m, '')
    .replace(/^Estrategia:.*$/m, '')
    .trim();
  return cleaned || 'Sin contenido detallado.';
}

function planDue(value?: string | null): string {
  if (!value) return 'Sin fecha';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Sin fecha';
  return date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
}

const classLabel = computed(() => {
  const n = classGroups.value.length;
  return n > 0 ? `Tus clases (${n})` : 'Tus clases';
});

function classStats(group: ClassGroup) {
  const byAssignment = new Map(
    submissions.value
      .filter((s) => s.status !== 'reset')
      .map((s) => [String(s.assignment_id), s]),
  );
  const completed = group.assignments.filter((a) => byAssignment.has(String(a.id))).length;
  const scores = group.assignments
    .map((a) => byAssignment.get(String(a.id))?.score)
    .filter((score): score is number => score !== null && score !== undefined);
  const avg = scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : '-';
  return { pending: group.assignments.length - completed, completed, avg };
}

// ── Tarjetas ──────────────────────────────────────────────────────────────
const cards = computed(() => {
  const byAssignment = new Map(
    submissions.value
      .filter((s) => s.status !== 'reset')
      .map((s) => [String(s.assignment_id), s]),
  );
  return filtered.value.map((assignment) => {
    const submission = byAssignment.get(String(assignment.id));
    const late = !!assignment.due_date && new Date(assignment.due_date) < new Date();
    const graded = !!submission && submission.score !== null;
    return {
      assignment,
      done: !!submission,
      score: submission?.score ?? null,
      statusText: submission ? (graded ? `Calificado: ${submission.score}` : 'Entregado') : late ? 'Atrasada' : 'Pendiente',
      statusClass: submission ? 'status-completed' : late ? 'status-late' : 'status-pending',
      accent: submission
        ? 'linear-gradient(135deg, #4caf50, #81c784)'
        : late
          ? 'linear-gradient(135deg, #e53935, #ef9a9a)'
          : 'linear-gradient(135deg, #6750A4, #9A82DB)',
      icon: submission ? '✅' : late ? '🚨' : '🧠',
      action: submission ? (graded ? 'Ver Calificación' : 'Ver Entrega') : 'Ver Tarea',
      dueDate: assignment.due_date
        ? new Date(assignment.due_date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
        : 'Sin fecha límite',
    };
  });
});

const stats = computed(() => {
  if (state.value !== 'ready' || !assignments.value.length) {
    return { pending: 0, completed: 0 };
  }
  const shown = cards.value;
  return {
    pending: shown.filter((c) => !c.done).length,
    completed: shown.filter((c) => c.done).length,
  };
});

const countLabel = computed(() => {
  if (state.value === 'loading') return 'Cargando tareas...';
  const n = filtered.value.length;
  return n > 0 ? `Mostrando ${n} tarea${n !== 1 ? 's' : ''}` : 'Sin tareas';
});

// ── Acciones ──────────────────────────────────────────────────────────────
function openTask(a: Assignment) {
  goToPage(router, 'classroom_details', `id=${encodeURIComponent(String(a.id))}`);
}

async function openProfessorPanel() {
  try {
    const { data } = await api.get<{ is_professor?: boolean }>('/api/check-professor-role');
    if (data.is_professor) goToPage(router, 'classroom_admin');
    else dialog.alert('⛔ No tienes acceso al panel de profesor. Contacta al administrador.');
  } catch {
    dialog.alert('Error verificando acceso. Inténtalo de nuevo.');
  }
}

// ── Tiempo real ───────────────────────────────────────────────────────────
interface ClassroomChanges {
  sections?: unknown[];
  assignments?: unknown[];
  submissions?: { assignment_id: number | string; assignment_title?: string; score?: number | null; status?: string; dispute_status?: string }[];
}

useRealtime('classroom', (raw) => {
  const payload = (raw ?? {}) as ClassroomChanges;
  // Tareas o secciones nuevas: se recarga la lista.
  if (payload.assignments?.length) {
    void loadTasks().then(() => flashElement(containerEl.value));
    return;
  }
  if (payload.sections?.length) {
    void loadTasks();
    return;
  }
  for (const sub of payload.submissions ?? []) {
    if (sub.status === 'graded' || sub.status === 'reviewed') {
      showToast(`✅ "${sub.assignment_title}" calificada: ${sub.score ?? 'Sin nota'} pts`);
      void loadTasks().then(async () => {
        await nextTick();
        flashElement(containerEl.value?.querySelector(`[data-assignment-id="${CSS.escape(String(sub.assignment_id))}"]`));
      });
    }
    if (sub.dispute_status === 'resolved') {
      showToast(`📋 Disputa resuelta para "${sub.assignment_title}"`);
      void loadTasks();
    }
  }
});

// Enlace de invitación: /classroom?join=CODE
async function joinFromLink(): Promise<boolean> {
  const code = typeof route.query.join === 'string' ? route.query.join.trim() : '';
  if (!code) return false;
  try {
    const { ok, data } = await api.post<{
      already_member?: boolean;
      section?: { name?: string };
      error?: string;
    }>('/api/join-section', { code });
    if (!ok) {
      dialog.alert(data.error || 'El enlace de invitación no es válido.');
      return false;
    }
    showToast(
      data.already_member
        ? `Ya estabas en la clase ${data.section?.name || ''}`.trim()
        : `✅ Te uniste a la clase ${data.section?.name || ''}`.trim(),
    );
    return true;
  } catch {
    dialog.alert('Error de conexión al unirse a la clase.');
    return false;
  } finally {
    const query = { ...route.query };
    delete query.join;
    void router.replace({ path: route.path, query });
  }
}

onMounted(async () => {
  void ensureSubscribed();
  await joinFromLink();
  await loadTasks();
});
</script>

<style>
/* Vista de clases del aula. */
:where(body[data-page="classroom"]) .class-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 16px;
  padding-bottom: 40px;
}

:where(body[data-page="classroom"]) .class-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  padding: 24px;
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  border-radius: var(--border-radius-lg);
  box-shadow: var(--glass-shadow);
  transition: transform .25s, box-shadow .25s, border-color .25s;
  animation: cardFadeIn .4s cubic-bezier(0.05, 0.7, 0.1, 1) both;
}

:where(body[data-page="classroom"]) .class-card:hover {
  transform: translateY(-6px);
  border-color: var(--accent-color);
  box-shadow: 0 16px 48px rgba(0, 0, 0, .1), 0 4px 20px var(--accent-glow);
}

:where(body[data-page="classroom"]) .class-icon {
  font-size: 2rem;
}

:where(body[data-page="classroom"]) .class-title {
  font-size: 1.05rem;
  font-weight: 800;
  color: var(--text-primary);
}

:where(body[data-page="classroom"]) .class-section {
  font-size: .8rem;
  background: var(--secondary-container);
  color: var(--accent-color);
  padding: 3px 10px;
  border-radius: 12px;
}

:where(body[data-page="classroom"]) .class-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin: 4px 0 8px;
  font-size: .78rem;
  color: var(--text-secondary);
}

:where(body[data-page="classroom"]) .class-open-btn {
  width: 100%;
  justify-content: center;
  margin-top: auto;
}

:where(body[data-page="classroom"]) .class-heading {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  margin: 12px 0 4px;
  padding: 0 4px;
}

:where(body[data-page="classroom"]) .class-heading h2 {
  font-size: 1.3rem;
  font-weight: 800;
  color: var(--text-primary);
}

/* Plan de evaluación de la clase */
:where(body[data-page="classroom"]) .eval-plans {
  margin: 18px 0 8px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

:where(body[data-page="classroom"]) .eval-plans-title {
  font-size: 1.05rem;
  font-weight: 800;
  color: var(--text-primary);
  padding: 0 4px;
}

:where(body[data-page="classroom"]) .eval-plan-card {
  border: 1px solid var(--glass-border);
  border-radius: var(--border-radius-lg);
  background: var(--glass-bg);
  box-shadow: var(--glass-shadow);
  overflow: hidden;
}

:where(body[data-page="classroom"]) .eval-plan-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 20px;
  background: var(--secondary-container);
}

:where(body[data-page="classroom"]) .eval-plan-name {
  font-size: 1rem;
  font-weight: 800;
  color: var(--text-primary);
}

:where(body[data-page="classroom"]) .eval-plan-strategy {
  margin-top: 4px;
  font-size: .82rem;
  color: var(--text-secondary);
  white-space: pre-line;
}

:where(body[data-page="classroom"]) .eval-plan-total {
  display: flex;
  align-items: baseline;
  gap: 4px;
  white-space: nowrap;
}

:where(body[data-page="classroom"]) .eval-plan-total-value {
  font-size: 1.5rem;
  font-weight: 800;
  color: var(--accent-color);
}

:where(body[data-page="classroom"]) .eval-plan-total-max {
  font-size: .8rem;
  color: var(--text-secondary);
}

:where(body[data-page="classroom"]) .eval-plan-items {
  list-style: none;
  margin: 0;
  padding: 0;
}

:where(body[data-page="classroom"]) .eval-plan-item {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 20px;
  border-top: 1px solid var(--glass-border);
}

:where(body[data-page="classroom"]) .eval-plan-item-main {
  flex: 1;
  min-width: 0;
}

:where(body[data-page="classroom"]) .eval-plan-item-title {
  display: block;
  color: var(--text-primary);
  font-size: .92rem;
}

:where(body[data-page="classroom"]) .eval-plan-item-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 4px;
  font-size: .78rem;
  color: var(--text-secondary);
}

:where(body[data-page="classroom"]) .eval-plan-contents {
  margin-top: 8px;
  font-size: .82rem;
  color: var(--text-secondary);
}

:where(body[data-page="classroom"]) .eval-plan-contents summary {
  cursor: pointer;
  font-weight: 600;
  color: var(--accent-color);
}

:where(body[data-page="classroom"]) .eval-plan-contents p {
  margin-top: 8px;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--bg-color);
  white-space: pre-line;
  max-height: 180px;
  overflow-y: auto;
}

:where(body[data-page="classroom"]) .eval-plan-grade {
  flex-shrink: 0;
  align-self: center;
  padding: 6px 12px;
  border-radius: 12px;
  font-size: .8rem;
  font-weight: 700;
  background: rgba(245, 158, 11, .15);
  color: #b45309;
  white-space: nowrap;
}

:where(body[data-page="classroom"]) .eval-plan-grade.is-graded {
  background: rgba(22, 163, 74, .15);
  color: #16a34a;
}

:where(body[data-page="classroom"]) .eval-plan-grade.is-submitted {
  background: var(--secondary-container);
  color: var(--accent-color);
}
</style>
