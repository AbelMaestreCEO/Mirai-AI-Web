<template>
  <header class="header">
    <MenuToggle />
    <div class="header-title">Aula Virtual</div>
  </header>

  <div class="classroom-container">
    <div class="classroom-hero">
      <h1>Aula Virtual</h1>
      <p>Revisa y entrega tus tareas asignadas. Mantén tu progreso al día.</p>
    </div>

    <div class="classroom-toolbar">
      <div id="user-greeting" style="font-size: 1rem; color: var(--text-secondary);">Hola, {{ currentUser?.dni || 'Estudiante' }}</div>
      <button id="professor-btn" class="btn-secondary" title="Acceso para Profesores" @click="openProfessorPanel">
        👨‍🏫 ¿Es un profesor?
      </button>
    </div>

    <div id="tasks-count" class="tasks-count">{{ countLabel }}</div>

    <div id="tasks-container" ref="containerEl" class="task-list">
      <div v-if="state === 'loading'" class="loading-state">
        <div class="loading-spinner"></div>
        Cargando tareas...
      </div>
      <div v-else-if="state === 'expired'" class="empty-state">
        <span class="empty-state-icon">⚠️</span>
        <h3>Sesión expirada</h3>
        <p>Por favor, <AppLink to="login">inicia sesión de nuevo</AppLink>.</p>
      </div>
      <div v-else-if="state === 'error'" class="empty-state">
        <span class="empty-state-icon">❌</span>
        <h3>Error cargando tareas</h3>
        <p>{{ error }}</p>
      </div>
      <div v-else-if="!assignments.length" class="empty-state">
        <span class="empty-state-icon">📭</span>
        <h3>No tienes tareas asignadas</h3>
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
            <button class="btn-secondary btn-learn" :data-id="card.assignment.id" :data-title="card.assignment.title" @click="learn(card.assignment)">
              🧠 Aprender
            </button>
            <AppLink to="classroom_details" :query="`id=${card.assignment.id}`" class="btn-primary">{{ card.action }}</AppLink>
          </div>
        </div>
      </template>
    </div>
  </div>

  <!-- Clases y resumen, en el panel de la barra lateral -->
  <Teleport to="#sidebar-page-section" defer>
    <h4>Aula</h4>
    <div class="sidebar-panel-section">
      <p class="sidebar-panel-label">Clases</p>
      <div id="course-tabs" class="sidebar-course-tabs" :style="{ display: courseTabs.length > 1 ? 'flex' : 'none' }">
        <button class="filter-pill" :class="{ active: activeCourse === 'all' }" @click="activeCourse = 'all'">📚 Todos</button>
        <button v-for="tab in courseTabs" :key="tab.id" class="filter-pill" :class="{ active: activeCourse === tab.id }" :data-course="tab.id" @click="activeCourse = tab.id">
          {{ tab.title }}
        </button>
      </div>
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
          <div class="stat-icon">📊</div>
          <div class="stat-content">
            <span class="stat-label">Promedio</span>
            <span id="avg-score" class="stat-value stat-number avg">{{ stats.avg }}</span>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
// Migración de public/classroom.html y public/classroom.js: tareas del alumno
// con su estado de entrega, filtro por clase y resumen en la barra lateral.
import { computed, nextTick, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import MenuToggle from '@/components/MenuToggle.vue';
import AppLink from '@/components/AppLink.vue';
import { api } from '@/lib/api';
import { goToPage } from '@/lib/legacy';
import { ensureSubscribed } from '@/lib/push';
import { flashElement, showToast, useRealtime } from '@/lib/realtime';
import { currentUser } from '@/lib/session';

interface Assignment {
  id: number | string;
  title: string;
  course_id?: string | null;
  course_title?: string | null;
  section_name?: string | null;
  submission_type?: string | null;
  due_date?: string | null;
}

interface Submission {
  assignment_id: number | string;
  score: number | null;
}

const router = useRouter();
const assignments = ref<Assignment[]>([]);
const submissions = ref<Submission[]>([]);
const state = ref<'loading' | 'ready' | 'expired' | 'error'>('loading');
const error = ref('');
const containerEl = ref<HTMLElement | null>(null);

// ── Carga ─────────────────────────────────────────────────────────────────
async function loadTasks() {
  const dni = currentUser.value?.dni;
  if (!dni) return;
  try {
    const { ok, status, data } = await api.get<{ assignments?: Assignment[]; submissions?: Submission[] }>(
      `/api/my-submissions?user_dni=${encodeURIComponent(dni)}`,
    );
    if (status === 401) {
      state.value = 'expired';
      return;
    }
    if (!ok) throw new Error(`Error HTTP: ${status}`);
    assignments.value = data.assignments || [];
    submissions.value = data.submissions || [];
    state.value = 'ready';
  } catch (err) {
    console.error('Error cargando tareas:', err);
    error.value = err instanceof Error ? err.message : String(err);
    state.value = 'error';
  }
}

// ── Filtro por clase ──────────────────────────────────────────────────────
const activeCourse = ref('all');

const courseTabs = computed(() => {
  const seen = new Map<string, string>();
  for (const a of assignments.value) {
    const id = a.course_id || '__none__';
    if (!seen.has(id)) seen.set(id, a.course_title || 'Sin curso');
  }
  return [...seen].map(([id, title]) => ({ id, title }));
});

const filtered = computed(() =>
  activeCourse.value === 'all' ? assignments.value : assignments.value.filter((a) => (a.course_id || '__none__') === activeCourse.value),
);

// ── Tarjetas ──────────────────────────────────────────────────────────────
const cards = computed(() => {
  const byAssignment = new Map(submissions.value.map((s) => [String(s.assignment_id), s]));
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
    return { pending: 0, completed: 0, avg: '-' };
  }
  const shown = cards.value;
  const scores = shown.map((c) => c.score).filter((s): s is number => s !== null);
  return {
    pending: shown.filter((c) => !c.done).length,
    completed: shown.filter((c) => c.done).length,
    avg: scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : '-',
  };
});

const countLabel = computed(() => {
  if (state.value === 'loading') return 'Cargando tareas...';
  const n = filtered.value.length;
  return n > 0 ? `Mostrando ${n} tarea${n !== 1 ? 's' : ''}` : 'Sin tareas';
});

// ── Acciones ──────────────────────────────────────────────────────────────
function learn(a: Assignment) {
  goToPage(router, 'learning_hub', `task_id=${a.id}&task_title=${encodeURIComponent(a.title)}`);
}

async function openProfessorPanel() {
  try {
    const { data } = await api.get<{ is_professor?: boolean }>('/api/check-professor-role');
    if (data.is_professor) goToPage(router, 'classroom_admin');
    else alert('⛔ No tienes acceso al panel de profesor. Contacta al administrador.');
  } catch {
    alert('Error verificando acceso. Inténtalo de nuevo.');
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

onMounted(() => {
  void ensureSubscribed();
  void loadTasks();
});
</script>
