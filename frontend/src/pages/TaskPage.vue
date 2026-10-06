<template>
  <header class="header">
    <MenuToggle />
    <div class="header-title">Tareas</div>
    <div class="header-actions" style="display:flex;gap:8px;align-items:center;">
      <button id="ai-suggest-btn" class="btn-ai-task" @click="focusAiInput">✨ <span>IA</span></button>
      <button id="open-modal-btn" class="btn-new-task" @click="openNewModal()">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
          <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
        </svg>
        Nueva Tarea
      </button>
    </div>
  </header>

  <div class="tasks-container">
    <!-- Stats — compact horizontal -->
    <div class="tasks-stats">
      <div class="stat-card"><div id="stat-total" class="stat-card-value">{{ stats.total }}</div><div class="stat-card-label">Total</div></div>
      <div class="stat-card"><div id="stat-done" class="stat-card-value">{{ stats.done }}</div><div class="stat-card-label">Completadas</div></div>
      <div class="stat-card"><div id="stat-progress" class="stat-card-value">{{ stats.progress }}</div><div class="stat-card-label">En Progreso</div></div>
      <div class="stat-card"><div id="stat-overdue" class="stat-card-value">{{ stats.overdue }}</div><div class="stat-card-label">Vencidas</div></div>
      <div class="stat-card"><div id="stat-time" class="stat-card-value">{{ stats.time }}</div><div class="stat-card-label">Tiempo Est.</div></div>
    </div>

    <!-- Toolbar -->
    <div class="tasks-toolbar">
      <div class="tasks-toolbar-row">
        <div class="courses-search">
          <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"
            />
          </svg>
          <input id="task-search" v-model="search" type="text" placeholder="Buscar tareas..." autocomplete="off">
        </div>
        <div class="view-tabs">
          <button v-for="v in VIEWS" :key="v.id" class="view-tab" :class="{ active: activeView === v.id }" :data-view="v.id" @click="activeView = v.id">
            {{ v.icon }} <span class="tab-label">{{ v.label }}</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Layout principal -->
    <div class="tasks-main-layout">
      <div id="tasks-view-area">
        <!-- KANBAN -->
        <div v-show="activeView === 'kanban'" id="view-kanban" class="view-panel">
          <div v-if="loadState === 'expired' || loadState === 'error'" style="grid-column:1/-1;text-align:center;padding:3rem;color:var(--text-secondary);">
            <div style="font-size:2rem;margin-bottom:1rem;">{{ loadState === 'error' ? '⚠️' : '🔒' }}</div>
            <p>No se pudieron cargar las tareas.</p>
            <p style="font-size:.85rem;margin-top:.5rem;">
              {{ loadState === 'error' ? 'Error del servidor o sin conexión. Recarga la página para reintentar.' : 'Verifica que has iniciado sesión.' }}
            </p>
          </div>
          <div v-else class="kanban-board">
            <div v-for="col in COLUMNS" :key="col.id" class="kanban-col" :data-col="col.id">
              <div class="kanban-col-header">
                <div class="kanban-col-title">{{ col.title }} <span class="kanban-col-badge">{{ kanban[col.id].length }}</span></div>
                <button class="kanban-add-btn" :data-col="col.id" @click="openNewModal(col.id)">＋</button>
              </div>
              <div
                v-for="t in kanban[col.id]"
                :key="t.id"
                class="task-card"
                :data-priority="t.priority"
                :data-col="t.status"
                :data-id="t.id"
                :style="t.status === 'completado' ? { opacity: '0.7' } : undefined"
                @click="openEditModal(t)"
              >
                <div class="task-card-header">
                  <span class="task-card-title" :style="t.done ? { textDecoration: 'line-through' } : undefined">{{ t.title }}</span>
                  <span class="task-priority" :class="t.priority"></span>
                </div>
                <div v-if="t.tag || t.time || t.location_label" class="task-card-meta">
                  <span v-if="t.tag" class="task-tag" :style="{ background: tagColor(t.tag).bg, color: tagColor(t.tag).fg }">{{ t.tag }}</span>
                  <span v-if="t.time">⏱ {{ t.time }}h est.</span>
                  <span v-if="t.location_label" :title="t.location_label">📍 {{ t.location_label.split(',')[0] }}</span>
                </div>
                <div class="task-card-footer">
                  <div class="task-assignee" :title="t.assignee">{{ t.assignee ? t.assignee.substring(0, 2).toUpperCase() : '?' }}</div>
                  <span v-if="t.due" class="task-due" :class="{ vencida: isOverdue(t) }">{{ isOverdue(t) ? 'Venció' : 'Vence' }} {{ formatDate(t.due) }}</span>
                </div>
                <div class="task-checklist-bar">
                  <div class="task-checklist-fill" :style="{ width: `${t.progress}%` }"></div>
                </div>
              </div>
              <div class="kanban-drop-zone" :data-col="col.id" @click="openNewModal(col.id)">＋ Agregar tarea</div>
            </div>
          </div>
        </div>

        <!-- GANTT -->
        <div v-show="activeView === 'gantt'" id="view-gantt" class="view-panel">
          <div class="gantt-wrapper">
            <div class="gantt-scroll-area">
              <div class="gantt-inner">
                <div class="gantt-header-row">
                  <div class="gantt-label-col">Tarea</div>
                  <div id="gantt-days-header" class="gantt-timeline-header">
                    <div v-for="d in gantt.days" :key="d.label" class="gantt-day" :class="{ today: d.today }">{{ d.label }}</div>
                  </div>
                </div>
                <div id="gantt-rows">
                  <div v-if="!gantt.rows.length" style="text-align:center;padding:2rem;color:var(--text-secondary);">Sin tareas con fecha de vencimiento</div>
                  <div v-for="row in gantt.rows" :key="row.task.id" class="gantt-row">
                    <div class="gantt-task-label" :title="row.task.title">{{ row.task.title }}</div>
                    <div class="gantt-timeline-row">
                      <div v-if="gantt.todayLeft !== null" class="gantt-today-line" :style="{ left: gantt.todayLeft }"></div>
                      <div
                        v-if="row.bar"
                        class="gantt-bar-wrap"
                        :style="{ left: row.bar.left, width: row.bar.width, background: CAL_COLORS[row.task.priority] }"
                        :title="row.task.title"
                        @click="openEditModal(row.task)"
                      >
                        {{ row.task.title.split(' ').slice(0, 2).join(' ') }}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- LISTA -->
        <div v-show="activeView === 'list'" id="view-list" class="view-panel">
          <div class="list-view">
            <div class="list-view-header">
              <span></span><span>Tarea</span><span>Prioridad</span><span>Asignado</span><span>Estado</span><span>Vence</span><span>Tiempo</span>
            </div>
            <div id="list-rows">
              <div v-for="t in filtered" :key="t.id" class="list-task-row" @click="openEditModal(t)">
                <div class="list-task-check" :class="{ done: t.done }" :data-id="t.id" @click.stop="toggleDone(t)">{{ t.done ? '✓' : '' }}</div>
                <div class="list-task-name" :class="{ done: t.done }">
                  {{ t.title }}
                  <span v-if="t.location_label" style="font-size:.7rem;color:var(--text-secondary);margin-left:5px;">📍 {{ t.location_label.split(',')[0] }}</span>
                </div>
                <div><span class="priority-badge" :class="t.priority">{{ PRIORITY_LABEL[t.priority] || t.priority }}</span></div>
                <div style="font-size:.82rem;font-weight:600;">{{ t.assignee || '—' }}</div>
                <div style="font-size:.8rem;color:var(--text-secondary);">{{ STATUS_LABEL[t.status] || t.status }}</div>
                <div style="font-size:.78rem;" :style="{ color: t.due && !t.done && dueDate(t.due) < today ? '#ef4444' : 'var(--text-secondary)' }">
                  {{ t.due ? formatDate(t.due) : '—' }}
                </div>
                <div style="font-size:.78rem;color:var(--text-secondary);">{{ t.time ? `${t.time}h` : '—' }}</div>
              </div>
            </div>
          </div>
        </div>

        <!-- CALENDARIO -->
        <div v-show="activeView === 'calendar'" id="view-calendar" class="view-panel">
          <div class="calendar-wrapper">
            <div class="calendar-nav">
              <button id="cal-prev" class="cal-nav-btn" @click="moveMonth(-1)">‹ Anterior</button>
              <h3 id="cal-month-label">{{ MONTHS[calMonth] }} {{ calYear }}</h3>
              <button id="cal-next" class="cal-nav-btn" @click="moveMonth(1)">Siguiente ›</button>
            </div>
            <div class="calendar-grid-header">
              <div v-for="d in ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']" :key="d" class="cal-day-name">{{ d }}</div>
            </div>
            <div id="cal-grid" class="calendar-grid">
              <div v-for="cell in calendar" :key="cell.key" class="cal-cell" :class="{ 'other-month': cell.other, today: cell.today }">
                <div class="cal-date">{{ cell.day }}</div>
                <span
                  v-for="t in cell.tasks"
                  :key="t.id"
                  class="cal-task-pill"
                  :style="{ background: CAL_COLORS[t.priority] }"
                  :title="t.title"
                  @click="openEditModal(t)"
                >{{ t.title }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Push notifications toggle -->
    <div id="task-notif-bar" class="task-notif-bar">
      <div class="task-notif-info">
        <span>🔔</span>
        <span>Notificaciones push para tareas</span>
      </div>
      <label class="task-notif-switch">
        <input id="task-notif-toggle" v-model="notifOn" type="checkbox" @change="onNotifToggle">
        <span class="task-notif-slider"></span>
      </label>
    </div>

    <!-- AI assistant — collapsible -->
    <details ref="aiPanelEl" class="task-ai-panel">
      <summary>✨ Asistente IA <span class="ai-badge">Beta</span></summary>
      <div style="padding:.75rem 0 0;">
        <div class="modal-form-group" style="margin-bottom:.5rem;">
          <input id="ai-task-input" ref="aiInputEl" v-model="aiInput" type="text" placeholder="Ej: Migrar base de datos a PostgreSQL">
        </div>
        <button id="ai-generate-btn" class="btn-new-task" style="width:100%;justify-content:center;" :disabled="aiBusy" @click="generateAi">✨ Generar con IA</button>
        <div
          v-show="aiResult"
          id="ai-result"
          style="margin-top:.75rem;padding:.75rem;background:var(--secondary-container);border-radius:9px;font-size:.8rem;color:var(--text-primary);line-height:1.5;white-space:pre-wrap;"
        >{{ aiResult }}</div>
      </div>
    </details>
  </div>

  <!-- ===== MODAL ===== -->
  <div id="task-modal-overlay" class="task-modal-overlay" :class="{ open: modalOpen }" @click.self="modalOpen = false">
    <div class="task-modal">
      <div class="task-modal-header">
        <span class="task-modal-title">{{ editingId !== null ? 'Editar Tarea' : 'Nueva Tarea' }}</span>
        <button id="close-modal-btn" class="modal-close-btn" @click="modalOpen = false">✕</button>
      </div>
      <div class="modal-form-group"><label>Título *</label><input id="modal-title" v-model="form.title" type="text" placeholder="Descripción breve de la tarea"></div>
      <div class="modal-form-group"><label>Descripción</label><textarea id="modal-desc" v-model="form.description" placeholder="Detalles, criterios de aceptación..."></textarea></div>
      <div class="modal-form-row">
        <div class="modal-form-group" style="margin-bottom:0;">
          <label>Prioridad</label>
          <select id="modal-priority" v-model="form.priority">
            <option value="baja">🟢 Baja</option>
            <option value="media">🟡 Media</option>
            <option value="alta">🟠 Alta</option>
            <option value="critica">🔴 Crítica</option>
          </select>
        </div>
        <div class="modal-form-group" style="margin-bottom:0;">
          <label>Estado</label>
          <select id="modal-status" v-model="form.status">
            <option value="pendiente">⬜ Pendiente</option>
            <option value="progreso">🔵 En Progreso</option>
            <option value="revision">🟡 Revisión</option>
            <option value="completado">✅ Completado</option>
          </select>
        </div>
      </div>
      <div class="modal-form-row" style="margin-top:.75rem;">
        <div class="modal-form-group" style="margin-bottom:0;"><label>Fecha de vencimiento</label><input id="modal-date" v-model="form.due" type="date"></div>
        <div class="modal-form-group" style="margin-bottom:0;">
          <label>Tiempo estimado (h)</label><input id="modal-time" v-model="form.time" type="number" placeholder="0" min="0" step="0.5">
        </div>
      </div>
      <div class="modal-form-row" style="margin-top:.75rem;">
        <div class="modal-form-group" style="margin-bottom:0;">
          <label>Asignado a</label>
          <select id="modal-assignee" v-model="form.assignee">
            <option value="">Sin asignar</option>
            <option value="AL">Ana López</option>
            <option value="CR">Carlos R.</option>
            <option value="DM">Diego M.</option>
            <option value="LP">Luis P.</option>
            <option value="SR">Sofia R.</option>
            <option value="MB">Mirai Bot</option>
          </select>
        </div>
        <div class="modal-form-group" style="margin-bottom:0;">
          <label>Etiqueta</label>
          <select id="modal-tag" v-model="form.tag">
            <option value="">Sin etiqueta</option>
            <option v-for="tag in TAGS" :key="tag">{{ tag }}</option>
          </select>
        </div>
      </div>
      <div class="modal-form-group" style="margin-top:.75rem;">
        <label>Proyecto</label>
        <select id="modal-project" v-model="form.project">
          <option value="">Sin proyecto</option>
          <option value="sprint">Sprint Q3</option>
          <option value="curso">Curso Web</option>
          <option value="evento">Evento Anual</option>
        </select>
      </div>
      <!-- ── UBICACIÓN ── -->
      <div class="modal-form-group" style="margin-top:.75rem;">
        <label>📍 Ubicación (opcional)</label>
        <div class="loc-pick-row">
          <input id="modal-location-label" v-model="form.location_label" type="text" placeholder="Nombre del lugar" maxlength="80" autocomplete="off" readonly>
          <button id="modal-pick-loc-btn" type="button" class="btn-pick-loc" :class="{ active: mapOpen }" @click="mapOpen ? closeModalMap() : openModalMap()">📍 Elegir</button>
          <button
            v-show="form.lat !== null"
            id="modal-clear-loc-btn"
            type="button"
            class="btn-pick-loc"
            style="background:none;border-color:#e53935;color:#e53935;"
            title="Quitar ubicación"
            @click="clearLocation"
          >✕</button>
        </div>
        <div id="modal-map-container" ref="mapEl" :style="{ display: mapOpen ? 'block' : 'none' }">
          <p v-if="mapUnavailable" style="padding:12px;text-align:center;font-size:.8rem;">⚠️ Google Maps no disponible</p>
        </div>
      </div>
      <div class="modal-form-group" style="margin-top:.5rem;">
        <label>Subtareas / Checklist</label>
        <div id="modal-checklist" ref="checklistEl">
          <div v-for="id in checklist" :key="id" class="checklist-item">
            <input class="checklist-checkbox" type="checkbox">
            <input
              type="text"
              placeholder="Nueva subtarea..."
              style="border:none;background:transparent;font-size:.85rem;color:var(--text-primary);width:100%;outline:none;"
            >
          </div>
        </div>
        <button id="add-subtask-btn" class="btn-secondary" style="margin-top:.5rem;width:100%;font-size:.8rem;" @click="addSubtask">＋ Agregar subtarea</button>
      </div>
      <div class="modal-actions">
        <button id="cancel-modal-btn" class="btn-secondary" @click="modalOpen = false">Cancelar</button>
        <button id="save-task-btn" class="btn-new-task" :disabled="saving" @click="saveTask">
          {{ saving ? 'Guardando...' : editingId !== null ? 'Actualizar Tarea' : 'Guardar Tarea' }}
        </button>
      </div>
    </div>
  </div>

  <!-- Proyectos y prioridad, en el panel de la barra lateral -->
  <Teleport to="#sidebar-page-section" defer>
    <h4>Tareas</h4>
    <div class="sidebar-panel-section">
      <p class="sidebar-panel-label">Proyectos</p>
      <div id="sidebar-project-selector" class="sidebar-project-selector">
        <button class="project-chip" :class="{ active: activeProject === 'todos' }" data-project="todos" @click="activeProject = 'todos'">Todos</button>
        <button
          v-for="p in PROJECTS"
          :key="p.id"
          class="project-chip"
          :class="{ active: activeProject === p.id }"
          :data-project="p.id"
          @click="activeProject = p.id"
        >
          <span class="project-dot" :style="{ background: p.color }"></span> {{ p.label }}
        </button>
        <button class="project-chip" style="border-style:dashed;">+ Proyecto</button>
      </div>

      <p class="sidebar-panel-label">Prioridad</p>
      <div id="priority-pills" class="filter-pills sidebar-filter-list">
        <button
          v-for="p in PRIORITY_FILTERS"
          :key="p.id"
          class="filter-pill"
          :class="{ active: activePriority === p.id }"
          :data-priority="p.id"
          @click="activePriority = p.id"
        >
          {{ p.label }}
        </button>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
// Migración de public/task.html y public/task.js: tareas del usuario
// (/api/tasks) en tablero, Gantt, lista y calendario, con ubicación opcional
// elegida en un mapa de Google.
import { computed, nextTick, onMounted, reactive, ref } from 'vue';
import MenuToggle from '@/components/MenuToggle.vue';
import { api, errorMessage } from '@/lib/api';
import { accentColor, loadGoogleMaps, mapColorScheme, pinSvg } from '@/lib/google-maps';
import { ensureSubscribed, notificationPermission, requestNotifications } from '@/lib/push';

type Status = 'pendiente' | 'progreso' | 'revision' | 'completado';
type Priority = 'critica' | 'alta' | 'media' | 'baja';

/** Fila de la tabla tasks tal como la devuelve la API. */
interface TaskRow {
  id: number | string;
  title?: string | null;
  description?: string | null;
  status?: string | null;
  priority?: string | null;
  assignee?: string | null;
  tag?: string | null;
  due_date?: string | null;
  estimated_time?: number | string | null;
  progress?: number | string | null;
  project?: string | null;
  done?: number | boolean | null;
  lat?: number | string | null;
  lng?: number | string | null;
  location_label?: string | null;
}

interface Task {
  id: number | string;
  title: string;
  description: string;
  status: Status;
  priority: Priority;
  assignee: string;
  tag: string;
  due: string;
  time: number;
  progress: number;
  project: string;
  done: boolean;
  lat: number | null;
  lng: number | null;
  location_label: string;
}

const CAL_COLORS: Record<string, string> = { critica: '#ef4444', alta: '#f97316', media: '#eab308', baja: '#22c55e' };
const STATUS_LABEL: Record<string, string> = { pendiente: 'Pendiente', progreso: 'En Progreso', revision: 'Revisión', completado: 'Completado' };
const PRIORITY_LABEL: Record<string, string> = { critica: '🔴 Crítica', alta: '🟠 Alta', media: '🟡 Media', baja: '🟢 Baja' };
const TAG_COLORS: Record<string, { bg: string; fg: string }> = {
  'UI/UX': { bg: 'rgba(99,102,241,.12)', fg: '#6366f1' },
  Backend: { bg: 'rgba(239,68,68,.12)', fg: '#ef4444' },
  Testing: { bg: 'rgba(99,102,241,.12)', fg: '#6366f1' },
  DevOps: { bg: 'rgba(14,165,233,.12)', fg: '#0ea5e9' },
  Docs: { bg: 'rgba(34,197,94,.12)', fg: '#16a34a' },
  Feature: { bg: 'rgba(249,115,22,.12)', fg: '#f97316' },
  Legal: { bg: 'rgba(234,179,8,.12)', fg: '#ca8a04' },
  Performance: { bg: 'rgba(14,165,233,.12)', fg: '#0ea5e9' },
  A11y: { bg: 'rgba(34,197,94,.12)', fg: '#16a34a' },
};
const TAGS = ['UI/UX', 'Backend', 'Testing', 'DevOps', 'Docs', 'Feature', 'Legal', 'Performance'];
const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const VIEWS = [
  { id: 'kanban', icon: '⊞', label: 'Kanban' },
  { id: 'gantt', icon: '📅', label: 'Gantt' },
  { id: 'list', icon: '☰', label: 'Lista' },
  { id: 'calendar', icon: '📆', label: 'Calendario' },
] as const;
const COLUMNS: { id: Status; title: string }[] = [
  { id: 'pendiente', title: '⬜ Pendiente' },
  { id: 'progreso', title: '🔵 En Progreso' },
  { id: 'revision', title: '🟡 Revisión' },
  { id: 'completado', title: '✅ Completado' },
];
const PROJECTS = [
  { id: 'sprint', label: 'Sprint Q3', color: '#6750A4' },
  { id: 'curso', label: 'Curso Web', color: '#1565C0' },
  { id: 'evento', label: 'Evento Anual', color: '#2E7D32' },
];
const PRIORITY_FILTERS = [
  { id: 'todas', label: 'Todas' },
  { id: 'critica', label: '🔴 Crítica' },
  { id: 'alta', label: '🟠 Alta' },
  { id: 'media', label: '🟡 Media' },
  { id: 'baja', label: '🟢 Baja' },
];

const today = new Date();
today.setHours(0, 0, 0, 0);

const tasks = ref<Task[]>([]);
const loadState = ref<'loading' | 'ready' | 'expired' | 'error'>('loading');
const activeView = ref<(typeof VIEWS)[number]['id']>('kanban');
const search = ref('');
const activePriority = ref('todas');
const activeProject = ref('todos');

function normalizeTask(t: TaskRow): Task {
  return {
    id: t.id,
    title: t.title || '',
    description: t.description || '',
    status: (t.status || 'pendiente') as Status,
    priority: (t.priority || 'media') as Priority,
    assignee: t.assignee || '',
    tag: t.tag || '',
    due: t.due_date || '',
    time: parseFloat(String(t.estimated_time || 0)) || 0,
    progress: parseInt(String(t.progress || 0), 10) || 0,
    project: t.project || '',
    done: t.done === 1 || t.done === true,
    lat: t.lat != null ? parseFloat(String(t.lat)) : null,
    lng: t.lng != null ? parseFloat(String(t.lng)) : null,
    location_label: t.location_label || '',
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────
function dueDate(due: string): Date {
  return new Date(`${due}T00:00:00`);
}

function isOverdue(t: Task): boolean {
  return !!t.due && dueDate(t.due) < today && t.status !== 'completado';
}

function formatDate(str: string): string {
  if (!str) return '';
  try {
    return dueDate(str).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
  } catch {
    return str;
  }
}

function tagColor(tag: string) {
  return TAG_COLORS[tag] || { bg: 'rgba(103,80,164,.12)', fg: '#6750A4' };
}

// ── Estadísticas ──────────────────────────────────────────────────────────
const stats = computed(() => {
  if (loadState.value === 'loading') return { total: '…', done: '…', progress: '…', overdue: '…', time: '…' };
  const list = tasks.value;
  return {
    total: list.length,
    done: list.filter((t) => t.status === 'completado').length,
    progress: list.filter((t) => t.status === 'progreso').length,
    overdue: list.filter(isOverdue).length,
    time: `${list.reduce((a, t) => a + (t.time || 0), 0)}h`,
  };
});

// ── Filtros (búsqueda, prioridad y proyecto: tablero y lista) ─────────────
const filtered = computed(() => {
  const q = search.value.toLowerCase();
  return tasks.value.filter(
    (t) =>
      (!q || t.title.toLowerCase().includes(q)) &&
      (activePriority.value === 'todas' || t.priority === activePriority.value) &&
      (activeProject.value === 'todos' || t.project === activeProject.value),
  );
});

const kanban = computed(() => {
  const cols: Record<Status, Task[]> = { pendiente: [], progreso: [], revision: [], completado: [] };
  for (const t of filtered.value) cols[t.status]?.push(t);
  return cols;
});

// ── Gantt: 21 días desde hace 3 ───────────────────────────────────────────
const gantt = computed(() => {
  const totalDays = 21;
  const dayWidth = 100 / totalDays;
  const start = new Date(today);
  start.setDate(start.getDate() - 3);
  const days = Array.from({ length: totalDays }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return { label: `${d.getDate()}/${d.getMonth() + 1}`, today: d.toDateString() === today.toDateString() };
  });
  const tOff = Math.round((today.getTime() - start.getTime()) / 86400000);
  const todayLeft = tOff >= 0 && tOff < totalDays ? `${tOff * dayWidth}%` : null;
  const rows = tasks.value
    .filter((t) => t.due)
    .map((t) => {
      const endOff = Math.round((dueDate(t.due).getTime() - start.getTime()) / 86400000);
      const dur = Math.max(2, Math.min(5, Math.ceil((t.time || 2) / 2)));
      const startOff = Math.max(0, endOff - dur);
      let bar: { left: string; width: string } | null = null;
      if (endOff >= 0 && startOff < totalDays) {
        const cs = Math.max(0, startOff);
        const ce = Math.min(totalDays, endOff + 1);
        bar = { left: `${cs * dayWidth}%`, width: `${(ce - cs) * dayWidth}%` };
      }
      return { task: t, bar };
    });
  return { days, todayLeft, rows };
});

// ── Calendario (semanas de lunes a domingo) ───────────────────────────────
const calYear = ref(today.getFullYear());
const calMonth = ref(today.getMonth());

function moveMonth(delta: number) {
  const d = new Date(calYear.value, calMonth.value + delta, 1);
  calYear.value = d.getFullYear();
  calMonth.value = d.getMonth();
}

const calendar = computed(() => {
  const year = calYear.value;
  const month = calMonth.value;
  const startDow = (new Date(year, month, 1).getDay() + 6) % 7;
  const dim = new Date(year, month + 1, 0).getDate();
  const total = Math.ceil((startDow + dim) / 7) * 7;
  const byDue = new Map<string, Task[]>();
  for (const t of tasks.value) {
    if (t.due) byDue.set(t.due, [...(byDue.get(t.due) ?? []), t]);
  }
  return Array.from({ length: total }, (_, i) => {
    const d = new Date(year, month, i - startDow + 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return {
      key,
      day: d.getDate(),
      other: d.getMonth() !== month,
      today: d.getTime() === today.getTime(),
      tasks: (byDue.get(key) ?? []).slice(0, 3),
    };
  });
});

// ── Carga ─────────────────────────────────────────────────────────────────
async function loadTasks() {
  try {
    const { ok, status, data } = await api.get<TaskRow[] | { error?: string }>('/api/tasks');
    if (status === 401) {
      loadState.value = 'expired';
      return;
    }
    if (!ok) throw new Error(errorMessage(data, `HTTP ${status}`));
    tasks.value = (Array.isArray(data) ? data : []).map(normalizeTask);
    loadState.value = 'ready';
  } catch (err) {
    console.error('No se pudieron cargar las tareas:', err);
    loadState.value = 'error';
  }
}

async function toggleDone(t: Task) {
  const done = !t.done;
  const status: Status = done ? 'completado' : 'pendiente';
  const progress = done ? 100 : 0;
  const { ok, data } = await api.put(`/api/tasks/${t.id}`, { done, status, progress });
  if (!ok) {
    console.error(errorMessage(data, 'No se pudo actualizar la tarea'));
    return;
  }
  Object.assign(t, { done, status, progress });
}

// ── Modal: crear / editar ─────────────────────────────────────────────────
const modalOpen = ref(false);
const editingId = ref<number | string | null>(null);
const saving = ref(false);

function emptyForm() {
  return {
    title: '',
    description: '',
    priority: 'media' as Priority,
    status: 'pendiente' as Status,
    due: '',
    time: '' as string | number,
    assignee: '',
    tag: '',
    project: '',
    lat: null as number | null,
    lng: null as number | null,
    location_label: '',
  };
}

const form = reactive(emptyForm());

// Subtareas: solo en el formulario (la API no las guarda), como antes.
let subtaskSeq = 0;
const checklist = ref<number[]>([]);
const checklistEl = ref<HTMLElement | null>(null);

function addSubtask() {
  checklist.value.push(++subtaskSeq);
  void nextTick(() => checklistEl.value?.querySelector<HTMLInputElement>('.checklist-item:last-child input[type=text]')?.focus());
}

function openNewModal(status: Status = 'pendiente') {
  editingId.value = null;
  Object.assign(form, emptyForm(), { status });
  checklist.value = [];
  closeModalMap();
  removePin();
  modalOpen.value = true;
}

function openEditModal(t: Task) {
  editingId.value = t.id;
  Object.assign(form, {
    title: t.title,
    description: t.description,
    priority: t.priority || 'media',
    status: t.status || 'pendiente',
    due: t.due,
    time: t.time || '',
    assignee: t.assignee,
    tag: t.tag,
    project: t.project,
    lat: t.lat,
    lng: t.lng,
    location_label: t.location_label,
  });
  modalOpen.value = true;
}

async function saveTask() {
  const title = form.title.trim();
  if (!title) {
    alert('Escribe un título.');
    return;
  }
  const payload = {
    title,
    description: form.description,
    status: form.status,
    priority: form.priority,
    assignee: form.assignee,
    tag: form.tag,
    due_date: form.due || null,
    estimated_time: parseFloat(String(form.time)) || 0,
    project: form.project,
    lat: form.lat,
    lng: form.lng,
    location_label: form.location_label || null,
  };

  saving.value = true;
  try {
    if (editingId.value !== null) {
      const { ok, status, data } = await api.put(`/api/tasks/${editingId.value}`, payload);
      if (!ok) throw new Error(errorMessage(data, `HTTP ${status}`));
      const t = tasks.value.find((x) => x.id === editingId.value);
      if (t) {
        Object.assign(t, {
          title: payload.title,
          description: payload.description,
          status: payload.status,
          priority: payload.priority,
          assignee: payload.assignee,
          tag: payload.tag,
          project: payload.project,
          time: payload.estimated_time,
          due: payload.due_date || '',
          lat: payload.lat,
          lng: payload.lng,
          location_label: payload.location_label || '',
        });
      }
    } else {
      const { ok, status, data } = await api.post<{ id?: number | string }>('/api/tasks', payload);
      if (!ok) throw new Error(errorMessage(data, `HTTP ${status}`));
      tasks.value.push(normalizeTask({ ...payload, id: data.id ?? `tmp-${Date.now()}` }));
    }
    modalOpen.value = false;
  } catch (err) {
    alert(`Error al guardar: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    saving.value = false;
  }
}

// ── Mini-mapa del modal ───────────────────────────────────────────────────
const mapEl = ref<HTMLElement | null>(null);
const mapOpen = ref(false);
const mapUnavailable = ref(false);
let modalMap: google.maps.Map | null = null;
let modalPin: google.maps.marker.AdvancedMarkerElement | null = null;
let geocoder: google.maps.Geocoder | null = null;

async function openModalMap() {
  mapOpen.value = true;
  const ready = await loadGoogleMaps();
  mapUnavailable.value = !ready;
  if (!ready || !mapEl.value) return;
  if (modalMap) {
    google.maps.event.trigger(modalMap, 'resize');
  } else {
    await nextTick();
    modalMap = new google.maps.Map(mapEl.value, {
      center: { lat: 9.0, lng: -66.0 },
      zoom: 5,
      mapId: 'mirai-task-map',
      disableDefaultUI: true,
      zoomControl: true,
      gestureHandling: 'greedy',
      colorScheme: mapColorScheme(),
    });
    modalMap.addListener('click', (e: google.maps.MapMouseEvent) => {
      if (e.latLng) placeModalPin({ lat: e.latLng.lat(), lng: e.latLng.lng() }, true);
    });
  }
  if (form.lat !== null && form.lng !== null) {
    modalMap.setCenter({ lat: form.lat, lng: form.lng });
    modalMap.setZoom(14);
    placeModalPin({ lat: form.lat, lng: form.lng }, false);
  }
}

function closeModalMap() {
  mapOpen.value = false;
}

function removePin() {
  if (modalPin) modalPin.map = null;
  modalPin = null;
}

function placeModalPin(latlng: google.maps.LatLngLiteral, doGeocode: boolean) {
  if (!modalMap) return;
  removePin();
  modalPin = new google.maps.marker.AdvancedMarkerElement({
    position: latlng,
    map: modalMap,
    content: pinSvg({
      width: 22,
      height: 30,
      d: 'M11 0C4.93 0 0 4.93 0 11c0 7.7 11 19 11 19S22 18.7 22 11C22 4.93 17.07 0 11 0z',
      fill: accentColor(),
      stroke: 'white',
      strokeWidth: 1.4,
      dot: { cx: 11, cy: 11, r: 4, fill: 'white' },
    }),
  });
  form.lat = latlng.lat;
  form.lng = latlng.lng;
  if (doGeocode) void reverseGeocode(latlng);
}

async function reverseGeocode(latlng: google.maps.LatLngLiteral) {
  try {
    geocoder ??= new google.maps.Geocoder();
    const { results } = await geocoder.geocode({ location: latlng });
    form.location_label = results[0]
      ? results[0].formatted_address.split(',').slice(0, 2).join(', ')
      : `${latlng.lat.toFixed(4)}, ${latlng.lng.toFixed(4)}`;
  } catch {
    form.location_label = `${latlng.lat.toFixed(5)}, ${latlng.lng.toFixed(5)}`;
  }
}

function clearLocation() {
  form.lat = null;
  form.lng = null;
  form.location_label = '';
  removePin();
}

// ── Asistente IA ──────────────────────────────────────────────────────────
const aiPanelEl = ref<HTMLDetailsElement | null>(null);
const aiInputEl = ref<HTMLInputElement | null>(null);
const aiInput = ref('');
const aiResult = ref('');
const aiBusy = ref(false);

function focusAiInput() {
  // El panel está plegado: sin abrirlo, el campo no se ve ni recibe el foco.
  if (aiPanelEl.value) aiPanelEl.value.open = true;
  void nextTick(() => {
    aiInputEl.value?.scrollIntoView({ behavior: 'smooth' });
    aiInputEl.value?.focus();
  });
}

async function generateAi() {
  const input = aiInput.value.trim();
  if (!input) return;
  aiBusy.value = true;
  aiResult.value = '✨ Generando con IA...';
  try {
    const { ok, status, data } = await api.post<{ suggestion?: string; error?: string }>('/api/tasks/ai-suggest', { task_title: input });
    if (!ok) throw new Error(errorMessage(data, `Error ${status}`));
    aiResult.value = data.suggestion || 'Sin respuesta.';
  } catch (e) {
    aiResult.value = `⚠️ ${(e instanceof Error && e.message) || 'No se pudo generar la sugerencia.'}`;
  } finally {
    aiBusy.value = false;
  }
}

// ── Notificaciones push ───────────────────────────────────────────────────
const notifOn = ref(notificationPermission() === 'granted');

async function onNotifToggle() {
  if (!notifOn.value) return;
  const result = await requestNotifications();
  if (result === 'granted') console.log('[Tasks] Push activadas');
  else notifOn.value = false;
}

onMounted(() => {
  void ensureSubscribed();
  void loadTasks();
});
</script>

<style>
/* CSS propio de la página antigua, limitado a ella (ver router: meta.page). */
/* ===== TASKS MODULE ===== */
:where(body[data-page="task"]) .tasks-container {
  --page-max: 1400px;
  max-width: var(--page-max);
  margin: 0 auto;
  padding: 1rem 1rem 3rem;
}

/* El hueco del sidebar y el centrado los resuelve la regla compartida
 del final de styles.css a partir de `--page-max`. */

/* Stats — compact horizontal scroll */
:where(body[data-page="task"]) .tasks-stats {
  display: flex;
  gap: .5rem;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
  padding-bottom: 4px;
  margin-bottom: 1rem;
}
:where(body[data-page="task"]) .tasks-stats::-webkit-scrollbar { display: none; }

:where(body[data-page="task"]) .stat-card {
  display: flex;
  align-items: center;
  gap: .5rem;
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  border-radius: 10px;
  padding: .5rem .85rem;
  white-space: nowrap;
  flex-shrink: 0;
}

:where(body[data-page="task"]) .stat-card-value {
  font-size: 1.15rem;
  font-weight: 800;
  background: var(--accent-gradient);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  line-height: 1;
}

:where(body[data-page="task"]) .stat-card-label {
  font-size: .7rem;
  color: var(--text-secondary);
  font-weight: 500;
}

/* Toolbar */
:where(body[data-page="task"]) .tasks-toolbar {
  display: flex;
  flex-direction: column;
  gap: .6rem;
  margin-bottom: 1rem;
}

:where(body[data-page="task"]) .tasks-toolbar-row {
  display: flex;
  align-items: center;
  gap: .5rem;
}

:where(body[data-page="task"]) .tasks-toolbar .courses-search {
  flex: 1;
  min-width: 0;
}

/* View tabs */
:where(body[data-page="task"]) .view-tabs {
  display: flex;
  gap: .25rem;
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  border-radius: 10px;
  padding: 3px;
  flex-shrink: 0;
}

:where(body[data-page="task"]) .view-tab {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 6px 12px;
  border-radius: 8px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-size: .82rem;
  font-weight: 500;
  cursor: pointer;
  transition: all .2s;
  white-space: nowrap;
}

:where(body[data-page="task"]) .view-tab.active {
  background: var(--accent-gradient);
  color: #fff;
  box-shadow: 0 2px 8px var(--accent-glow);
}

:where(body[data-page="task"]) .view-tab:not(.active):hover {
  background: var(--secondary-container);
  color: var(--text-primary);
}

/* Priority pills — horizontal scroll */
:where(body[data-page="task"]) .tasks-toolbar .filter-pills {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  flex-wrap: nowrap;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
  padding-bottom: 2px;
}
:where(body[data-page="task"]) .tasks-toolbar .filter-pills::-webkit-scrollbar { display: none; }

/* Project selector — horizontal scroll */
:where(body[data-page="task"]) .project-selector {
  display: flex;
  align-items: center;
  gap: .4rem;
  overflow-x: auto;
  flex-wrap: nowrap;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
  margin-bottom: .75rem;
  padding-bottom: 2px;
}
:where(body[data-page="task"]) .project-selector::-webkit-scrollbar { display: none; }

/* Buttons */
:where(body[data-page="task"]) .btn-new-task {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  background: var(--accent-gradient);
  color: #fff;
  border: none;
  border-radius: 10px;
  font-size: .88rem;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  box-shadow: 0 2px 10px var(--accent-glow);
  transition: opacity .2s, transform .15s;
}

:where(body[data-page="task"]) .btn-new-task:hover {
  opacity: .9;
  transform: translateY(-1px);
}

:where(body[data-page="task"]) .btn-ai-task {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  background: var(--secondary-container);
  color: var(--accent-color);
  border: 1px solid var(--glass-border);
  border-radius: 10px;
  font-size: .85rem;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  transition: all .2s;
}

:where(body[data-page="task"]) .btn-ai-task:hover {
  background: var(--accent-gradient);
  color: #fff;
  border-color: transparent;
}

:where(body[data-page="task"]) .btn-secondary {
  padding: 8px 18px;
  border: 1px solid var(--glass-border);
  background: var(--secondary-container);
  color: var(--text-primary);
  border-radius: 9px;
  font-size: .87rem;
  font-weight: 600;
  cursor: pointer;
  transition: all .2s;
}

:where(body[data-page="task"]) .btn-secondary:hover {
  border-color: var(--accent-color);
}

:where(body[data-page="task"]) .project-chip {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 5px 12px;
  border-radius: 20px;
  border: 1.5px solid var(--glass-border);
  background: var(--glass-bg);
  font-size: .8rem;
  font-weight: 600;
  cursor: pointer;
  color: var(--text-secondary);
  transition: all .2s;
}

:where(body[data-page="task"]) .project-chip.active {
  border-color: var(--accent-color);
  background: var(--secondary-container);
  color: var(--accent-color);
}

:where(body[data-page="task"]) .project-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

/* Layout — single column, no sidebar */
:where(body[data-page="task"]) .tasks-main-layout {
  display: block;
}

/* ── KANBAN ── */
:where(body[data-page="task"]) .kanban-board {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 1rem;
}

:where(body[data-page="task"]) .kanban-col {
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  border-radius: 14px;
  padding: 1rem;
  min-height: 420px;
  display: flex;
  flex-direction: column;
  gap: .75rem;
}

:where(body[data-page="task"]) .kanban-col-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: .25rem;
}

:where(body[data-page="task"]) .kanban-col-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 700;
  font-size: .9rem;
  color: var(--text-primary);
}

:where(body[data-page="task"]) .kanban-col-badge {
  background: var(--secondary-container);
  color: var(--accent-color);
  border-radius: 20px;
  padding: 1px 9px;
  font-size: .75rem;
  font-weight: 700;
}

:where(body[data-page="task"]) .kanban-add-btn {
  background: none;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 2px;
  border-radius: 6px;
  font-size: 1.1rem;
  transition: color .2s;
}

:where(body[data-page="task"]) .kanban-add-btn:hover {
  color: var(--accent-color);
}

:where(body[data-page="task"]) .task-card {
  background: var(--surface);
  border: 1px solid var(--glass-border);
  border-radius: 10px;
  padding: .85rem;
  cursor: pointer;
  transition: transform .18s, box-shadow .18s;
}

:where(body[data-page="task"]) .task-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px var(--accent-glow);
}

:where(body[data-page="task"]) .task-card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 6px;
  margin-bottom: .5rem;
}

:where(body[data-page="task"]) .task-card-title {
  font-size: .875rem;
  font-weight: 600;
  color: var(--text-primary);
  line-height: 1.3;
}

:where(body[data-page="task"]) .task-priority {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
  margin-top: 4px;
}

:where(body[data-page="task"]) .task-priority.critica {
  background: #ef4444;
}

:where(body[data-page="task"]) .task-priority.alta {
  background: #f97316;
}

:where(body[data-page="task"]) .task-priority.media {
  background: #eab308;
}

:where(body[data-page="task"]) .task-priority.baja {
  background: #22c55e;
}

:where(body[data-page="task"]) .task-card-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  font-size: .75rem;
  color: var(--text-secondary);
  margin-bottom: .5rem;
}

:where(body[data-page="task"]) .task-tag {
  padding: 2px 8px;
  border-radius: 20px;
  font-size: .7rem;
  font-weight: 600;
}

:where(body[data-page="task"]) .task-card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: .5rem;
}

:where(body[data-page="task"]) .task-assignee {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--accent-gradient);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: .65rem;
  font-weight: 700;
  color: #fff;
  flex-shrink: 0;
}

:where(body[data-page="task"]) .task-due {
  font-size: .72rem;
  color: var(--text-secondary);
}

:where(body[data-page="task"]) .task-due.vencida {
  color: #ef4444;
  font-weight: 600;
}

:where(body[data-page="task"]) .task-checklist-bar {
  height: 3px;
  background: var(--glass-border);
  border-radius: 99px;
  margin-top: .5rem;
  overflow: hidden;
}

:where(body[data-page="task"]) .task-checklist-fill {
  height: 100%;
  background: var(--accent-gradient);
  border-radius: 99px;
  transition: width .4s;
}

:where(body[data-page="task"]) .kanban-drop-zone {
  border: 2px dashed var(--glass-border);
  border-radius: 10px;
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  font-size: .8rem;
  cursor: pointer;
  transition: border-color .2s, background .2s;
  margin-top: auto;
}

:where(body[data-page="task"]) .kanban-drop-zone:hover {
  border-color: var(--accent-color);
  background: var(--secondary-container);
  color: var(--accent-color);
}

/* ── LISTA ── */
:where(body[data-page="task"]) .list-view {
  display: flex;
  flex-direction: column;
  gap: 0;
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  border-radius: 14px;
  overflow: hidden;
}

:where(body[data-page="task"]) .list-view-header {
  display: grid;
  grid-template-columns: 32px 1fr 100px 90px 90px 80px 80px;
  align-items: center;
  gap: .5rem;
  padding: .75rem 1rem;
  background: var(--secondary-container);
  font-size: .75rem;
  font-weight: 700;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: .04em;
}

:where(body[data-page="task"]) .list-task-row {
  display: grid;
  grid-template-columns: 32px 1fr 100px 90px 90px 80px 80px;
  align-items: center;
  gap: .5rem;
  padding: .75rem 1rem;
  border-top: 1px solid var(--glass-border);
  transition: background .15s;
  cursor: pointer;
  font-size: .85rem;
}

:where(body[data-page="task"]) .list-task-row:hover {
  background: var(--secondary-container);
}

:where(body[data-page="task"]) .list-task-check {
  width: 18px;
  height: 18px;
  border: 2px solid var(--glass-border);
  border-radius: 5px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all .2s;
  flex-shrink: 0;
}

:where(body[data-page="task"]) .list-task-check.done {
  background: var(--accent-gradient);
  border-color: transparent;
  color: #fff;
}

:where(body[data-page="task"]) .list-task-name {
  font-weight: 500;
  color: var(--text-primary);
}

:where(body[data-page="task"]) .list-task-name.done {
  text-decoration: line-through;
  color: var(--text-secondary);
}

:where(body[data-page="task"]) .priority-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border-radius: 20px;
  font-size: .72rem;
  font-weight: 700;
}

:where(body[data-page="task"]) .priority-badge.critica {
  background: rgba(239, 68, 68, .12);
  color: #ef4444;
}

:where(body[data-page="task"]) .priority-badge.alta {
  background: rgba(249, 115, 22, .12);
  color: #f97316;
}

:where(body[data-page="task"]) .priority-badge.media {
  background: rgba(234, 179, 8, .12);
  color: #ca8a04;
}

:where(body[data-page="task"]) .priority-badge.baja {
  background: rgba(34, 197, 94, .12);
  color: #16a34a;
}

/* ── GANTT ── */
:where(body[data-page="task"]) .gantt-wrapper {
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  border-radius: 14px;
  overflow: hidden;
}

/* Scroll horizontal del Gantt — funciona en móvil y PC */
:where(body[data-page="task"]) .gantt-scroll-area {
  overflow-x: auto;
  overflow-y: visible;
  -webkit-overflow-scrolling: touch;
  border-radius: 14px;
}

:where(body[data-page="task"]) .gantt-scroll-area::-webkit-scrollbar {
  height: 5px;
}

:where(body[data-page="task"]) .gantt-scroll-area::-webkit-scrollbar-track {
  background: var(--glass-border);
  border-radius: 99px;
}

:where(body[data-page="task"]) .gantt-scroll-area::-webkit-scrollbar-thumb {
  background: var(--accent-color);
  border-radius: 99px;
  opacity: .6;
}

:where(body[data-page="task"]) .gantt-inner {
  min-width: 560px;
}

:where(body[data-page="task"]) .gantt-header-row {
  display: flex;
  background: var(--secondary-container);
  border-bottom: 1px solid var(--glass-border);
}

:where(body[data-page="task"]) .gantt-label-col {
  width: 120px;
  flex-shrink: 0;
  padding: .65rem .6rem;
  font-size: .72rem;
  font-weight: 700;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: .04em;
  border-right: 1px solid var(--glass-border);
}

:where(body[data-page="task"]) .gantt-timeline-header {
  flex: 1;
  display: flex;
  overflow: hidden;
}

:where(body[data-page="task"]) .gantt-day {
  flex: 1;
  text-align: center;
  padding: .65rem 0;
  font-size: .7rem;
  color: var(--text-secondary);
  border-right: 1px solid var(--glass-border);
  min-width: 40px;
}

:where(body[data-page="task"]) .gantt-day.today {
  background: var(--secondary-container);
  color: var(--accent-color);
  font-weight: 700;
}

:where(body[data-page="task"]) .gantt-row {
  display: flex;
  border-bottom: 1px solid var(--glass-border);
  align-items: center;
  min-height: 48px;
}

:where(body[data-page="task"]) .gantt-row:last-child {
  border-bottom: none;
}

:where(body[data-page="task"]) .gantt-task-label {
  width: 120px;
  flex-shrink: 0;
  padding: .5rem .6rem;
  font-size: .78rem;
  font-weight: 500;
  color: var(--text-primary);
  border-right: 1px solid var(--glass-border);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

:where(body[data-page="task"]) .gantt-timeline-row {
  flex: 1;
  position: relative;
  height: 48px;
  display: flex;
  align-items: center;
}

:where(body[data-page="task"]) .gantt-bar-wrap {
  position: absolute;
  height: 22px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  padding: 0 8px;
  font-size: .68rem;
  font-weight: 600;
  color: #fff;
  overflow: hidden;
  white-space: nowrap;
  cursor: pointer;
  transition: opacity .2s;
}

:where(body[data-page="task"]) .gantt-bar-wrap:hover {
  opacity: .85;
}

:where(body[data-page="task"]) .gantt-today-line {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  background: var(--accent-color);
  opacity: .6;
  pointer-events: none;
}

/* ── CALENDARIO ── */
:where(body[data-page="task"]) .calendar-wrapper {
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  border-radius: 14px;
  overflow: hidden;
}

:where(body[data-page="task"]) .calendar-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.25rem;
  border-bottom: 1px solid var(--glass-border);
}

:where(body[data-page="task"]) .calendar-nav h3 {
  font-size: 1rem;
  font-weight: 700;
  color: var(--text-primary);
}

:where(body[data-page="task"]) .cal-nav-btn {
  background: var(--secondary-container);
  border: 1px solid var(--glass-border);
  border-radius: 8px;
  padding: 5px 10px;
  cursor: pointer;
  color: var(--text-primary);
  font-size: .85rem;
  transition: all .2s;
}

:where(body[data-page="task"]) .cal-nav-btn:hover {
  background: var(--accent-gradient);
  color: #fff;
  border-color: transparent;
}

:where(body[data-page="task"]) .calendar-grid-header {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  background: var(--secondary-container);
}

:where(body[data-page="task"]) .cal-day-name {
  text-align: center;
  padding: .5rem;
  font-size: .72rem;
  font-weight: 700;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: .05em;
}

:where(body[data-page="task"]) .calendar-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
}

:where(body[data-page="task"]) .cal-cell {
  border-right: 1px solid var(--glass-border);
  border-bottom: 1px solid var(--glass-border);
  min-height: 80px;
  padding: .4rem;
  cursor: pointer;
  transition: background .15s;
}

:where(body[data-page="task"]) .cal-cell:hover {
  background: var(--secondary-container);
}

:where(body[data-page="task"]) .cal-cell:nth-child(7n) {
  border-right: none;
}

:where(body[data-page="task"]) .cal-date {
  font-size: .78rem;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: .3rem;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
}

:where(body[data-page="task"]) .cal-cell.today .cal-date {
  background: var(--accent-gradient);
  color: #fff;
}

:where(body[data-page="task"]) .cal-cell.other-month {
  opacity: .4;
}

:where(body[data-page="task"]) .cal-task-pill {
  display: block;
  padding: 1px 6px;
  border-radius: 4px;
  font-size: .67rem;
  font-weight: 600;
  color: #fff;
  margin-bottom: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ── MODAL ── */
:where(body[data-page="task"]) .task-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, .45);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  opacity: 0;
  pointer-events: none;
  transition: opacity .25s;
}

:where(body[data-page="task"]) .task-modal-overlay.open {
  opacity: 1;
  pointer-events: all;
}

:where(body[data-page="task"]) .task-modal {
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  border-radius: 18px;
  width: 100%;
  max-width: 620px;
  max-height: 90vh;
  overflow-y: auto;
  padding: 1.5rem;
  transform: translateY(20px);
  transition: transform .25s;
}

:where(body[data-page="task"]) .task-modal-overlay.open .task-modal {
  transform: translateY(0);
}

:where(body[data-page="task"]) .task-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1.25rem;
}

:where(body[data-page="task"]) .task-modal-title {
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--text-primary);
}

:where(body[data-page="task"]) .modal-close-btn {
  background: var(--secondary-container);
  border: none;
  border-radius: 8px;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-size: 1.1rem;
  color: var(--text-secondary);
  transition: all .2s;
}

:where(body[data-page="task"]) .modal-close-btn:hover {
  background: var(--accent-gradient);
  color: #fff;
}

:where(body[data-page="task"]) .modal-form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: .75rem;
  margin-bottom: .75rem;
}

:where(body[data-page="task"]) .modal-form-group {
  display: flex;
  flex-direction: column;
  gap: .3rem;
  margin-bottom: .75rem;
}

:where(body[data-page="task"]) .modal-form-group label {
  font-size: .78rem;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: .04em;
}

:where(body[data-page="task"]) .modal-form-group input,
:where(body[data-page="task"]) .modal-form-group select,
:where(body[data-page="task"]) .modal-form-group textarea {
  background: var(--surface);
  border: 1px solid var(--glass-border);
  border-radius: 9px;
  padding: .55rem .75rem;
  font-size: .88rem;
  color: var(--text-primary);
  font-family: inherit;
  transition: border-color .2s;
  width: 100%;
}

:where(body[data-page="task"]) .modal-form-group input:focus,
:where(body[data-page="task"]) .modal-form-group select:focus,
:where(body[data-page="task"]) .modal-form-group textarea:focus {
  outline: none;
  border-color: var(--accent-color);
}

:where(body[data-page="task"]) .modal-form-group textarea {
  resize: vertical;
  min-height: 80px;
}

:where(body[data-page="task"]) .modal-actions {
  display: flex;
  gap: .75rem;
  justify-content: flex-end;
  margin-top: 1rem;
}

:where(body[data-page="task"]) .checklist-item {
  display: flex;
  align-items: center;
  gap: .5rem;
  padding: .45rem 0;
  border-bottom: 1px solid var(--glass-border);
  font-size: .85rem;
  color: var(--text-primary);
}

:where(body[data-page="task"]) .checklist-item:last-child {
  border-bottom: none;
}

:where(body[data-page="task"]) .checklist-checkbox {
  width: 16px;
  height: 16px;
  accent-color: var(--accent-color);
}

:where(body[data-page="task"]) .ai-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  background: linear-gradient(135deg, #8b5cf6, #ec4899);
  color: #fff;
  border-radius: 20px;
  font-size: .7rem;
  font-weight: 700;
}

/* Push notification bar */
:where(body[data-page="task"]) .task-notif-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: .75rem;
  margin-top: 1.25rem;
  padding: .65rem 1rem;
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  border-radius: 12px;
  font-size: .82rem;
  font-weight: 500;
  color: var(--text-primary);
}
:where(body[data-page="task"]) .task-notif-info {
  display: flex;
  align-items: center;
  gap: .5rem;
}
:where(body[data-page="task"]) .task-notif-switch {
  position: relative;
  width: 44px;
  height: 24px;
  flex-shrink: 0;
}
:where(body[data-page="task"]) .task-notif-switch input { opacity: 0; width: 0; height: 0; }
:where(body[data-page="task"]) .task-notif-slider {
  position: absolute;
  inset: 0;
  background: var(--glass-border);
  border-radius: 24px;
  cursor: pointer;
  transition: background .25s;
}
:where(body[data-page="task"]) .task-notif-slider::before {
  content: '';
  position: absolute;
  width: 18px;
  height: 18px;
  left: 3px;
  bottom: 3px;
  background: #fff;
  border-radius: 50%;
  transition: transform .25s;
  box-shadow: 0 1px 3px rgba(0,0,0,.15);
}
:where(body[data-page="task"]) .task-notif-switch input:checked + .task-notif-slider {
  background: var(--accent-color);
}
:where(body[data-page="task"]) .task-notif-switch input:checked + .task-notif-slider::before {
  transform: translateX(20px);
}

/* AI panel */
:where(body[data-page="task"]) .task-ai-panel {
  margin-top: .75rem;
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  border-radius: 12px;
  padding: .75rem 1rem;
}
:where(body[data-page="task"]) .task-ai-panel summary {
  font-size: .85rem;
  font-weight: 600;
  color: var(--text-primary);
  cursor: pointer;
  list-style: none;
  display: flex;
  align-items: center;
  gap: .4rem;
}
:where(body[data-page="task"]) .task-ai-panel summary::-webkit-details-marker { display: none; }
:where(body[data-page="task"]) .task-ai-panel summary::after {
  content: '›';
  margin-left: auto;
  font-size: 1.1rem;
  transition: transform .2s;
  color: var(--text-secondary);
}
:where(body[data-page="task"]) .task-ai-panel[open] summary::after {
  transform: rotate(90deg);
}

/* Responsive */
@media (max-width: 900px) {
  :where(body[data-page="task"]) .list-view-header {
    grid-template-columns: 32px 1fr 90px 80px;
  }
  :where(body[data-page="task"]) .list-view-header span:nth-child(n+5) { display: none; }
  :where(body[data-page="task"]) .list-task-row {
    grid-template-columns: 32px 1fr 90px 80px;
  }
  :where(body[data-page="task"]) .list-task-row>*:nth-child(n+5) { display: none; }
  :where(body[data-page="task"]) .kanban-board { grid-template-columns: repeat(2, 1fr); }
  :where(body[data-page="task"]) .modal-form-row { grid-template-columns: 1fr; }
}

@media (max-width: 560px) {
  :where(body[data-page="task"]) .tasks-container { padding: .75rem .6rem 3rem; }
  :where(body[data-page="task"]) .kanban-board { grid-template-columns: 1fr; }
  :where(body[data-page="task"]) .view-tab .tab-label { display: none; }

  /* En móviles estrechos "Nueva Tarea" + "IA" + el título no caben en
   la cabecera y la desbordaban. El botón de la cabecera se queda en
   el icono "+"; los `.btn-new-task` de los modales no se tocan. */
  :where(body[data-page="task"]) .header-actions .btn-new-task { padding: 8px 12px; font-size: 0; gap: 0; }
  :where(body[data-page="task"]) .header-actions .btn-new-task svg { width: 18px; height: 18px; }
  :where(body[data-page="task"]) .header-title { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
  :where(body[data-page="task"]) .gantt-label-col, :where(body[data-page="task"]) .gantt-task-label { width: 90px; font-size: .7rem; padding: .4rem .4rem; }
  :where(body[data-page="task"]) .gantt-day { min-width: 32px; font-size: .65rem; padding: .5rem 0; }
  :where(body[data-page="task"]) .gantt-inner { min-width: 420px; }
}

/* ── Ubicación en modal ── */
:where(body[data-page="task"]) .loc-pick-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

:where(body[data-page="task"]) .loc-pick-row input[type="text"] {
  flex: 1;
  min-width: 0;
}

:where(body[data-page="task"]) .btn-pick-loc {
  flex-shrink: 0;
  padding: 9px 12px;
  background: var(--secondary-container);
  border: 1px solid var(--glass-border);
  border-radius: 9px;
  color: var(--accent-color);
  font-size: .82rem;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  transition: all .2s;
}

:where(body[data-page="task"]) .btn-pick-loc:hover,
:where(body[data-page="task"]) .btn-pick-loc.active {
  background: var(--accent-gradient);
  color: #fff;
  border-color: transparent;
}

:where(body[data-page="task"]) #modal-map-container {
  height: 200px;
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid var(--glass-border);
  margin-top: .5rem;
  display: none;
}

/* ── Proyectos y prioridades en el panel lateral ── */
:where(body[data-page="task"]) .sidebar-panel-section {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}

:where(body[data-page="task"]) .sidebar-panel-label {
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-tertiary);
  margin: 4px 0 8px;
}

:where(body[data-page="task"]) .sidebar-project-selector {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 20px;
}

:where(body[data-page="task"]) .sidebar-project-selector .project-chip {
  width: 100%;
  box-sizing: border-box;
}

:where(body[data-page="task"]) .sidebar-filter-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

:where(body[data-page="task"]) .sidebar-filter-list .filter-pill {
  width: 100%;
  box-sizing: border-box;
  text-align: left;
  justify-content: flex-start;
}
</style>
