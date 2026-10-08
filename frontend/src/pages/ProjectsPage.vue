<template>
  <header class="header">
    <MenuToggle />
    <div class="header-title">Proyectos</div>
  </header>

  <div class="courses-container">
    <!-- Hero -->
    <div class="courses-hero">
      <h1>Mis Proyectos</h1>
      <p>Crea proyectos, sube tus archivos y chatea con la IA usando tu código como contexto.</p>
    </div>

    <!-- Toolbar: búsqueda + filtros + botón nuevo -->
    <div class="courses-toolbar">
      <div class="courses-toolbar-top">
        <div class="courses-search">
          <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"
            />
          </svg>
          <input id="project-search" v-model="search" type="text" placeholder="Buscar proyectos..." autocomplete="off">
        </div>
      </div>
      <button id="new-project-btn" class="projects-new-btn" @click="openCreateModal">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
          <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
        </svg>
        Nuevo proyecto
      </button>
      <div id="filter-pills" class="filter-pills">
        <button v-for="f in FILTERS" :key="f.id" class="filter-pill" :class="{ active: filter === f.id }" :data-filter="f.id" @click="filter = f.id">{{ f.label }}</button>
      </div>
    </div>

    <!-- Contador -->
    <div id="projects-count" class="courses-count">{{ countLabel }}</div>

    <!-- Grid de proyectos -->
    <div id="projects-grid" class="courses-grid">
      <template v-if="state === 'loading'">
        <div v-for="(sk, i) in SKELETONS" :id="`sk${i + 1}`" :key="i" class="skeleton-card">
          <div v-for="(w, j) in sk" :key="j" class="skeleton-line" :style="{ height: j === 1 ? '20px' : '14px', width: w }"></div>
        </div>
      </template>
      <div v-else-if="state === 'error'" class="projects-empty">
        <div class="projects-empty-icon">⚠️</div>
        <p>No se pudieron cargar los proyectos. Intenta de nuevo.</p>
      </div>
      <div v-else-if="!filtered.length" class="projects-empty">
        <div class="projects-empty-icon">🗂️</div>
        <p>{{ search || filter !== 'todos' ? 'No hay proyectos con ese filtro. Prueba con otro término.' : 'Aún no tienes proyectos. ¡Crea el primero!' }}</p>
      </div>
      <template v-else>
        <div v-for="p in filtered" :key="p.id" class="project-card" :data-id="p.id" :data-category="p.category">
          <div class="project-card-accent"></div>
          <div class="project-card-header">
            <span class="project-icon">{{ CATEGORY_ICONS[p.category] || '🗂️' }}</span>
            <div class="project-card-actions">
              <button class="project-action-btn edit" :data-id="p.id" title="Editar proyecto" @click.stop="openEditModal(p)">
                <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor">
                  <path
                    d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"
                  />
                </svg>
              </button>
              <button class="project-action-btn delete" :data-id="p.id" :data-name="p.name" title="Eliminar proyecto" @click.stop="openDeleteModal(p)">
                <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor">
                  <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
                </svg>
              </button>
            </div>
          </div>
          <h3 class="project-title">{{ p.name }}</h3>
          <p v-if="p.description" class="project-description">{{ p.description }}</p>
          <div v-if="p.tech_stack.length" class="project-tech-tags">
            <span v-for="t in p.tech_stack.slice(0, 4)" :key="t" class="project-tech-tag">{{ t }}</span>
            <span v-if="p.tech_stack.length > 4" class="project-tech-tag">+{{ p.tech_stack.length - 4 }}</span>
          </div>
          <div class="project-meta">
            <span class="project-meta-item">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor">
                <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm4 18H6V4h7v5h5v11z" />
              </svg>
              {{ p.file_count || 0 }} archivo{{ (p.file_count || 0) !== 1 ? 's' : '' }}
            </span>
            <span class="project-meta-item">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor">
                <path
                  d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67V7z"
                />
              </svg>
              {{ formatDate(p.created_at) }}
            </span>
          </div>
          <button class="project-open-btn" :data-id="p.id" @click.stop="goToPage(router, 'code', `projects=${encodeURIComponent(p.id)}`)">
            💻 Abrir en Code
          </button>
        </div>
      </template>
    </div>
  </div>

  <!-- ══ MODAL: CREAR / EDITAR PROYECTO ══ -->
  <div id="project-modal" class="modal-overlay" :class="{ active: modal === 'project' }" role="dialog" aria-modal="true" aria-labelledby="modal-title" @click.self="closeModal">
    <div class="modal-box">
      <div class="modal-header">
        <h2 id="modal-title" class="modal-title">{{ editing ? 'Editar Proyecto' : 'Nuevo Proyecto' }}</h2>
        <button id="modal-close-btn" class="modal-close-btn" aria-label="Cerrar" @click="closeModal">&times;</button>
      </div>
      <!-- Nombre -->
      <div class="field-group">
        <label class="field-label" for="project-name">Nombre del proyecto *</label>
        <input id="project-name" ref="nameEl" v-model="form.name" class="field-input" type="text" placeholder="Mi app con Workers + D1" maxlength="80" @keydown.enter="saveProject">
      </div>
      <!-- Descripción -->
      <div class="field-group">
        <label class="field-label" for="project-desc">Descripción</label>
        <textarea id="project-desc" v-model="form.description" class="field-textarea" placeholder="¿Qué hace este proyecto? ¿Cuál es su objetivo?" maxlength="500"></textarea>
      </div>
      <!-- Selector de tecnología -->
      <div class="field-group">
        <span class="field-label">Stack tecnológico</span>
        <div id="tech-selector" class="tech-selector">
          <div v-for="group in TECH_GROUPS" :key="group.label">
            <p class="tech-group-label">{{ group.label }}</p>
            <div class="tech-chips">
              <button
                v-for="[tech, label] in group.chips"
                :key="tech"
                class="tech-chip"
                :class="{ selected: form.tech.includes(tech) }"
                :data-tech="tech"
                @click="toggleTech(tech)"
              >
                {{ label }}
              </button>
            </div>
          </div>
        </div>
      </div>
      <!-- Archivos existentes (solo en modo edición) -->
      <div id="existing-files-section" class="field-group" :style="{ display: existingFiles.length ? 'flex' : 'none' }">
        <span class="field-label">Archivos actuales</span>
        <div id="existing-files-list" class="file-list">
          <div v-for="f in existingFiles" :id="`ef-${f.id}`" :key="f.id" class="existing-file-item" :class="{ 'marked-delete': deletedFileIds.includes(f.id) }">
            <span class="file-item-icon">{{ fileIcon(f.name) }}</span>
            <span class="file-item-name">{{ f.name }}</span>
            <span class="file-item-size">{{ formatBytes(f.size || 0) }}</span>
            <button class="file-item-remove" :data-file-id="f.id" :title="deletedFileIds.includes(f.id) ? 'Restaurar' : 'Eliminar'" @click="toggleFileDelete(f.id)">
              {{ deletedFileIds.includes(f.id) ? '↩' : '×' }}
            </button>
          </div>
        </div>
      </div>
      <!-- Upload de archivos -->
      <div class="field-group">
        <span class="field-label">Agregar archivos</span>
        <div
          id="file-drop-zone"
          class="file-drop-zone"
          :class="{ dragover }"
          @dragover.prevent="dragover = true"
          @dragleave="dragover = false"
          @drop.prevent="onDrop"
        >
          <input id="file-input" type="file" multiple :accept="ACCEPT" @change="onFileInput">
          <div class="file-drop-icon">📁</div>
          <p class="file-drop-text">
            <strong>Haz clic o arrastra archivos</strong><br>
            .js, .ts, .py, .html, .css, .sql, .json, .md y más
          </p>
        </div>
        <div id="new-files-list" class="file-list">
          <div v-for="(f, i) in newFiles" :key="`${f.name}-${f.size}`" class="file-item">
            <span class="file-item-icon">{{ fileIcon(f.name) }}</span>
            <span class="file-item-name">{{ f.name }}</span>
            <span class="file-item-size">{{ formatBytes(f.size) }}</span>
            <button class="file-item-remove" :data-index="i" title="Quitar" @click="newFiles.splice(i, 1)">×</button>
          </div>
        </div>
        <!-- Barra de progreso (oculta por defecto) -->
        <div v-show="uploadProgress !== null" id="upload-progress-wrap">
          <div class="upload-progress-bar">
            <div id="upload-progress-fill" class="upload-progress-fill" :style="{ width: `${uploadProgress ?? 0}%` }"></div>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button id="modal-cancel-btn" class="btn-cancel" @click="closeModal">Cancelar</button>
        <button id="modal-save-btn" class="btn-primary" :disabled="saving" @click="saveProject">
          <span id="modal-save-text">
            <template v-if="saving"><span class="btn-spinner"></span>Guardando...</template>
            <template v-else>{{ editing ? 'Guardar cambios' : 'Crear proyecto' }}</template>
          </span>
        </button>
      </div>
    </div>
  </div>

  <!-- ══ MODAL: CONFIRMAR ELIMINACIÓN ══ -->
  <div id="delete-modal" class="modal-overlay" :class="{ active: modal === 'delete' }" role="dialog" aria-modal="true" @click.self="closeModal">
    <div class="modal-box confirm-box">
      <div class="modal-header">
        <h2 class="modal-title">Eliminar proyecto</h2>
        <button id="delete-modal-close" class="modal-close-btn" aria-label="Cerrar" @click="closeModal">&times;</button>
      </div>
      <p class="confirm-message">
        ¿Estás seguro de que deseas eliminar <strong id="delete-project-name">"{{ pendingDelete?.name }}"</strong>?<br>
        Se eliminarán todos sus archivos permanentemente. Esta acción no se puede deshacer.
      </p>
      <div class="modal-footer">
        <button id="delete-cancel-btn" class="btn-cancel" @click="closeModal">Cancelar</button>
        <button id="delete-confirm-btn" class="btn-danger" :disabled="deleting" @click="confirmDelete">{{ deleting ? 'Eliminando...' : 'Eliminar' }}</button>
      </div>
    </div>
  </div>

  <!-- Toast container -->
  <div id="toast-container" class="toast-container">
    <div v-for="t in toasts" :key="t.id" class="toast" :class="t.type">{{ t.message }}</div>
  </div>
</template>

<script setup lang="ts">
// Migración de public/projects.html y public/projects.js: proyectos del
// usuario (/api/projects, en D1) con sus archivos (en R2) para usarlos como
// contexto en Code.
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import MenuToggle from '@/components/MenuToggle.vue';
import { api, apiFetch, errorMessage } from '@/lib/api';
import { goToPage } from '@/lib/pages';

interface Project {
  id: string;
  name: string;
  description?: string | null;
  tech_stack: string[];
  category: string;
  file_count?: number | null;
  created_at?: string | null;
}

interface ProjectFile {
  id: string;
  name: string;
  size?: number | null;
}

// Tecnología → categoría (para los filtros y el icono).
const TECH_CATEGORY_MAP: Record<string, string> = {
  'Cloudflare Workers': 'cloudflare',
  'Cloudflare D1': 'cloudflare',
  'Cloudflare R2': 'cloudflare',
  'Cloudflare Pages': 'cloudflare',
  'Cloudflare KV': 'cloudflare',
  'Cloudflare AI': 'cloudflare',
  React: 'web',
  Vue: 'web',
  'Next.js': 'web',
  Svelte: 'web',
  Astro: 'web',
  'HTML/CSS': 'web',
  JavaScript: 'web',
  TypeScript: 'web',
  'Tailwind CSS': 'web',
  'Node.js': 'backend',
  Python: 'backend',
  Rust: 'backend',
  Go: 'backend',
  Express: 'backend',
  Hono: 'backend',
  FastAPI: 'backend',
  Django: 'backend',
  GraphQL: 'backend',
  'React Native': 'movil',
  Flutter: 'movil',
  Swift: 'movil',
  Kotlin: 'movil',
  Ionic: 'movil',
  TensorFlow: 'datos',
  PyTorch: 'datos',
  LangChain: 'datos',
  DeepSeek: 'datos',
  OpenAI: 'datos',
  'Anthropic Claude': 'datos',
  'AWS Lambda': 'devops',
  Firebase: 'devops',
  Supabase: 'devops',
};

const CATEGORY_ICONS: Record<string, string> = { cloudflare: '⚡', web: '🌐', backend: '⚙️', movil: '📱', datos: '📊', devops: '🚀', otros: '🗂️' };

const FILTERS = [
  { id: 'todos', label: 'Todos' },
  { id: 'cloudflare', label: '☁️ Cloudflare' },
  { id: 'web', label: '🌐 Web' },
  { id: 'backend', label: '⚙️ Backend' },
  { id: 'movil', label: '📱 Móvil' },
  { id: 'datos', label: '📊 Datos' },
  { id: 'devops', label: '🚀 DevOps' },
  { id: 'otros', label: '🔧 Otros' },
];

/** [tecnología, texto del chip] por grupo. */
const TECH_GROUPS: { label: string; chips: [string, string][] }[] = [
  {
    label: '☁️ Ecosistema Cloud',
    chips: [
      ['Cloudflare Workers', 'Workers'],
      ['Cloudflare D1', 'D1'],
      ['Cloudflare R2', 'R2'],
      ['Cloudflare Pages', 'Pages'],
      ['Cloudflare KV', 'KV'],
      ['Cloudflare AI', 'CF AI'],
      ['AWS Lambda', 'AWS Lambda'],
      ['Firebase', 'Firebase'],
      ['Supabase', 'Supabase'],
    ],
  },
  {
    label: '🌐 Frontend / Web',
    chips: [
      ['HTML/CSS', 'HTML/CSS'],
      ['JavaScript', 'JavaScript'],
      ['TypeScript', 'TypeScript'],
      ['React', 'React'],
      ['Vue', 'Vue'],
      ['Next.js', 'Next.js'],
      ['Svelte', 'Svelte'],
      ['Astro', 'Astro'],
      ['Tailwind CSS', 'Tailwind'],
    ],
  },
  {
    label: '⚙️ Backend',
    chips: [
      ['Node.js', 'Node.js'],
      ['Python', 'Python'],
      ['Rust', 'Rust'],
      ['Go', 'Go'],
      ['Express', 'Express'],
      ['Hono', 'Hono'],
      ['FastAPI', 'FastAPI'],
      ['Django', 'Django'],
      ['GraphQL', 'GraphQL'],
    ],
  },
  {
    label: '🗄️ Base de Datos',
    chips: [
      ['SQLite', 'SQLite'],
      ['PostgreSQL', 'PostgreSQL'],
      ['MySQL', 'MySQL'],
      ['MongoDB', 'MongoDB'],
      ['Redis', 'Redis'],
      ['Drizzle ORM', 'Drizzle ORM'],
      ['Prisma', 'Prisma'],
    ],
  },
  {
    label: '📱 Móvil / Multiplataforma',
    chips: [
      ['React Native', 'React Native'],
      ['Flutter', 'Flutter'],
      ['Swift', 'Swift'],
      ['Kotlin', 'Kotlin'],
      ['Ionic', 'Ionic'],
    ],
  },
  {
    label: '🤖 IA / ML',
    chips: [
      ['DeepSeek', 'DeepSeek'],
      ['OpenAI', 'OpenAI'],
      ['Anthropic Claude', 'Claude'],
      ['LangChain', 'LangChain'],
      ['TensorFlow', 'TensorFlow'],
      ['PyTorch', 'PyTorch'],
    ],
  },
];

// Las mismas extensiones que acepta el Worker (POST /api/projects/:id/files).
const ACCEPT =
  '.js,.ts,.jsx,.tsx,.py,.rs,.go,.html,.css,.json,.md,.txt,.env,.toml,.yaml,.yml,.sql,.sh,.bat,.vue,.svelte,.astro,.php,.java,.c,.cpp,.h,.cs,.rb,.swift,.kt,.dart';

const SKELETONS = [
  ['40%', '70%', '90%', '60%'],
  ['35%', '65%', '85%', '50%'],
  ['45%', '75%', '80%', '55%'],
];

const FILE_ICONS: Record<string, string> = {
  js: '🟨',
  ts: '🔷',
  jsx: '⚛️',
  tsx: '⚛️',
  py: '🐍',
  rs: '🦀',
  go: '🐹',
  html: '🌐',
  css: '🎨',
  json: '📋',
  md: '📄',
  txt: '📄',
  sql: '🗄️',
  env: '🔐',
  toml: '⚙️',
  yaml: '⚙️',
  yml: '⚙️',
  sh: '🖥️',
  bat: '🖥️',
  vue: '💚',
  svelte: '🔥',
  astro: '🚀',
  php: '🐘',
  java: '☕',
  c: '💡',
  cpp: '💡',
  h: '💡',
  cs: '💜',
  rb: '💎',
  swift: '🍎',
  kt: '🟣',
  dart: '🎯',
};

const router = useRouter();

// ── Helpers ───────────────────────────────────────────────────────────────
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${parseFloat((bytes / 1024 ** i).toFixed(1))} ${sizes[i]}`;
}

function formatDate(iso?: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fileIcon(name: string): string {
  return FILE_ICONS[(name.split('.').pop() ?? '').toLowerCase()] || '📄';
}

/** Categoría principal del proyecto según su stack (la más repetida). */
function inferCategory(techStack: string[]): string {
  if (!techStack.length) return 'otros';
  const counts = new Map<string, number>();
  for (const t of techStack) {
    const cat = TECH_CATEGORY_MAP[t] || 'otros';
    counts.set(cat, (counts.get(cat) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]![0];
}

function parseStack(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  try {
    const parsed: unknown = JSON.parse(String(value || '[]'));
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

// ── Toasts ────────────────────────────────────────────────────────────────
const toasts = ref<{ id: number; message: string; type: string }[]>([]);
let toastSeq = 0;

function showToast(message: string, type: 'info' | 'success' | 'error' = 'info', duration = 3200) {
  const id = ++toastSeq;
  toasts.value.push({ id, message, type });
  setTimeout(() => (toasts.value = toasts.value.filter((t) => t.id !== id)), duration);
}

// ── Lista ─────────────────────────────────────────────────────────────────
const projects = ref<Project[]>([]);
const state = ref<'loading' | 'ready' | 'error'>('loading');
const search = ref('');
const filter = ref('todos');

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase();
  return projects.value.filter(
    (p) =>
      (filter.value === 'todos' || p.category === filter.value) &&
      (!q || p.name.toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q) || p.tech_stack.some((t) => t.toLowerCase().includes(q))),
  );
});

const countLabel = computed(() => {
  if (state.value === 'loading') return 'Cargando proyectos...';
  if (state.value === 'error') return 'Error al cargar proyectos';
  const n = filtered.value.length;
  return n === 0 ? 'No se encontraron proyectos' : `Mostrando ${n} proyecto${n !== 1 ? 's' : ''}`;
});

async function loadProjects() {
  try {
    const { ok, status, data } = await api.get<{ projects?: (Omit<Project, 'tech_stack' | 'category'> & { tech_stack?: unknown; category?: string | null })[] }>(
      '/api/projects',
    );
    if (!ok) throw new Error(`HTTP ${status}`);
    projects.value = (data.projects ?? []).map((p) => {
      const tech_stack = parseStack(p.tech_stack);
      return { ...p, tech_stack, category: p.category || inferCategory(tech_stack) };
    });
    state.value = 'ready';
  } catch (err) {
    console.error('[Projects] Error al cargar:', err);
    state.value = 'error';
  }
}

// ── Modales ───────────────────────────────────────────────────────────────
const modal = ref<'project' | 'delete' | null>(null);

// Con un modal abierto no se desplaza la página de fondo.
watch(modal, (m) => (document.body.style.overflow = m ? 'hidden' : ''));
onBeforeUnmount(() => (document.body.style.overflow = ''));

function closeModal() {
  modal.value = null;
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') closeModal();
}
onMounted(() => document.addEventListener('keydown', onKeydown));
onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown));

// ── Crear / editar ────────────────────────────────────────────────────────
const nameEl = ref<HTMLInputElement | null>(null);
const editing = ref<Project | null>(null);
const form = reactive({ name: '', description: '', tech: [] as string[] });
const existingFiles = ref<ProjectFile[]>([]);
const deletedFileIds = ref<string[]>([]);
const newFiles = ref<File[]>([]);
const uploadProgress = ref<number | null>(null);
const saving = ref(false);
const dragover = ref(false);

function resetModal() {
  Object.assign(form, { name: '', description: '', tech: [] });
  existingFiles.value = [];
  deletedFileIds.value = [];
  newFiles.value = [];
  uploadProgress.value = null;
  editing.value = null;
}

function openCreateModal() {
  resetModal();
  modal.value = 'project';
  void nextTick(() => nameEl.value?.focus());
}

async function openEditModal(p: Project) {
  resetModal();
  editing.value = p;
  Object.assign(form, { name: p.name, description: p.description || '', tech: [...p.tech_stack] });
  modal.value = 'project';
  try {
    const { ok, data } = await api.get<{ files?: ProjectFile[] }>(`/api/projects/${encodeURIComponent(p.id)}/files`);
    // Si mientras tanto se cerró o se abrió otro proyecto, no se mezclan.
    if (ok && editing.value?.id === p.id) existingFiles.value = data.files ?? [];
  } catch (e) {
    console.warn('[Projects] No se pudieron cargar archivos del proyecto', e);
  }
}

function toggleTech(tech: string) {
  const i = form.tech.indexOf(tech);
  if (i === -1) form.tech.push(tech);
  else form.tech.splice(i, 1);
}

function toggleFileDelete(id: string) {
  const i = deletedFileIds.value.indexOf(id);
  if (i === -1) deletedFileIds.value.push(id);
  else deletedFileIds.value.splice(i, 1);
}

function addFiles(files: File[]) {
  for (const f of files) {
    if (!newFiles.value.some((x) => x.name === f.name && x.size === f.size)) newFiles.value.push(f);
  }
}

function onFileInput(e: Event) {
  const input = e.target as HTMLInputElement;
  addFiles(Array.from(input.files ?? []));
  input.value = '';
}

function onDrop(e: DragEvent) {
  dragover.value = false;
  addFiles(Array.from(e.dataTransfer?.files ?? []));
}

async function saveProject() {
  if (saving.value) return;
  const name = form.name.trim();
  if (!name) {
    showToast('El nombre del proyecto es obligatorio.', 'error');
    nameEl.value?.focus();
    return;
  }
  const tech_stack = [...form.tech];
  const body = { name, description: form.description.trim(), tech_stack, category: inferCategory(tech_stack) };
  const wasEditing = !!editing.value;

  saving.value = true;
  try {
    // 1. Crear o actualizar el proyecto (metadatos)
    const res = editing.value
      ? await api.put<{ project?: { id?: string } }>(`/api/projects/${encodeURIComponent(editing.value.id)}`, body)
      : await api.post<{ project?: { id?: string } }>('/api/projects', body);
    if (!res.ok) throw new Error(errorMessage(res.data, `HTTP ${res.status}`));
    const projectId = res.data.project?.id || editing.value?.id;
    if (!projectId) throw new Error('El servidor no devolvió el proyecto');
    const base = `/api/projects/${encodeURIComponent(projectId)}/files`;

    // 2. Eliminar archivos marcados para borrado
    await Promise.all(deletedFileIds.value.map((fid) => apiFetch(`${base}/${encodeURIComponent(fid)}`, { method: 'DELETE' })));

    // 3. Subir archivos nuevos, uno a uno
    if (newFiles.value.length) {
      uploadProgress.value = 0;
      const files = [...newFiles.value];
      for (const [i, file] of files.entries()) {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('project_id', projectId);
        const up = await apiFetch(base, { method: 'POST', body: fd });
        if (!up.ok) {
          console.warn(`[Projects] Error subiendo ${file.name}:`, await up.json().catch(() => ({})));
          showToast(`No se pudo subir: ${file.name}`, 'error');
        }
        uploadProgress.value = Math.round(((i + 1) / files.length) * 100);
      }
    }

    closeModal();
    await loadProjects();
    showToast(wasEditing ? '✅ Proyecto actualizado correctamente.' : '✅ Proyecto creado correctamente.', 'success');
  } catch (err) {
    console.error('[Projects] Error al guardar:', err);
    showToast(`Error: ${err instanceof Error ? err.message : String(err)}`, 'error');
    await loadProjects(); // sincronizar aunque haya fallado algo
  } finally {
    saving.value = false;
  }
}

// ── Eliminar ──────────────────────────────────────────────────────────────
const pendingDelete = ref<Project | null>(null);
const deleting = ref(false);

function openDeleteModal(p: Project) {
  pendingDelete.value = p;
  modal.value = 'delete';
}

async function confirmDelete() {
  const p = pendingDelete.value;
  if (!p) return;
  deleting.value = true;
  try {
    const { ok, status } = await api.delete(`/api/projects/${encodeURIComponent(p.id)}`);
    if (!ok) throw new Error(`HTTP ${status}`);
    showToast('🗑️ Proyecto eliminado.', 'info');
    closeModal();
    await loadProjects();
  } catch (err) {
    console.error('[Projects] Error al eliminar:', err);
    showToast(`Error al eliminar: ${err instanceof Error ? err.message : String(err)}`, 'error');
  } finally {
    deleting.value = false;
  }
}

onMounted(loadProjects);
</script>

<style>
/* CSS propio de la página antigua, limitado a ella (ver router: meta.page). */
/* ── Estilos exclusivos de Projects (mínimos, todo lo demás viene de styles.css) ── */

/* ── Estado vacío ── */
:where(body[data-page="projects"]) .projects-empty {
  grid-column: 1 / -1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  padding: 4rem 2rem;
  text-align: center;
  color: var(--text-secondary, #777);
}

:where(body[data-page="projects"]) .projects-empty-icon {
  font-size: 3.5rem;
  opacity: 0.5;
}

:where(body[data-page="projects"]) .projects-empty p {
  font-size: 1rem;
  max-width: 340px;
  line-height: 1.5;
}

/* ── Tarjeta de Proyecto ── */
:where(body[data-page="projects"]) .project-card {
  background: var(--glass-bg, rgba(255, 255, 255, 0.94));
  border: 1px solid var(--glass-border, rgba(103, 80, 164, 0.12));
  border-radius: 20px;
  padding: 1.4rem 1.4rem 1.2rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  position: relative;
  overflow: hidden;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
  cursor: pointer;
}

:where(body[data-page="projects"]) .project-card:hover {
  transform: translateY(-3px);
  box-shadow: 0 8px 28px var(--accent-glow, rgba(103, 80, 164, 0.18));
}

:where(body[data-page="projects"]) .project-card-accent {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 4px;
  border-radius: 20px 20px 0 0;
  background: var(--accent-gradient, linear-gradient(135deg, #6750A4, #9A82DB));
}

:where(body[data-page="projects"]) .project-card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.5rem;
  padding-top: 0.4rem;
}

:where(body[data-page="projects"]) .project-icon {
  font-size: 2rem;
  line-height: 1;
  flex-shrink: 0;
}

:where(body[data-page="projects"]) .project-card-actions {
  display: flex;
  gap: 0.4rem;
  flex-shrink: 0;
}

:where(body[data-page="projects"]) .project-action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 1px solid var(--glass-border, rgba(103, 80, 164, 0.12));
  background: transparent;
  color: var(--text-secondary, #777);
  cursor: pointer;
  transition: background 0.18s, color 0.18s, border-color 0.18s;
  flex-shrink: 0;
}

:where(body[data-page="projects"]) .project-action-btn:hover {
  background: var(--secondary-container, #E8DEF8);
  color: var(--accent-color, #6750A4);
  border-color: var(--accent-color, #6750A4);
}

:where(body[data-page="projects"]) .project-action-btn.delete:hover {
  background: #FFEBEE;
  color: #B71C1C;
  border-color: #B71C1C;
}

:where(body[data-page="projects"]) .project-title {
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--text-primary, #1a1a1a);
  margin: 0;
  line-height: 1.3;
}

:where(body[data-page="projects"]) .project-description {
  font-size: 0.875rem;
  color: var(--text-secondary, #666);
  line-height: 1.5;
  margin: 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

:where(body[data-page="projects"]) .project-tech-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

:where(body[data-page="projects"]) .project-tech-tag {
  font-size: 0.72rem;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 20px;
  background: var(--secondary-container, #E8DEF8);
  color: var(--accent-color, #6750A4);
  letter-spacing: 0.02em;
  white-space: nowrap;
}

:where(body[data-page="projects"]) .project-meta {
  display: flex;
  align-items: center;
  gap: 1rem;
  font-size: 0.8rem;
  color: var(--text-secondary, #888);
  border-top: 1px solid var(--glass-border, rgba(103, 80, 164, 0.10));
  padding-top: 0.75rem;
  margin-top: auto;
}

:where(body[data-page="projects"]) .project-meta-item {
  display: flex;
  align-items: center;
  gap: 0.3rem;
}

:where(body[data-page="projects"]) .project-open-btn {
  margin-top: 0.5rem;
  width: 100%;
  padding: 0.55rem 1rem;
  border-radius: 12px;
  border: none;
  background: var(--accent-gradient, linear-gradient(135deg, #6750A4, #9A82DB));
  color: #fff;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.18s, transform 0.18s;
  letter-spacing: 0.02em;
}

:where(body[data-page="projects"]) .project-open-btn:hover {
  opacity: 0.9;
  transform: scale(1.01);
}

/* ── Modal Base (reutiliza glass de styles.css) ── */
:where(body[data-page="projects"]) .modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 1rem;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.22s ease;
}

:where(body[data-page="projects"]) .modal-overlay.active {
  opacity: 1;
  pointer-events: all;
}

:where(body[data-page="projects"]) .modal-box {
  background: var(--glass-bg, rgba(255, 255, 255, 0.97));
  border: 1px solid var(--glass-border, rgba(103, 80, 164, 0.15));
  border-radius: 24px;
  padding: 2rem;
  width: 100%;
  max-width: 600px;
  max-height: 90vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  transform: translateY(16px) scale(0.98);
  transition: transform 0.22s ease;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.18);
}

:where(body[data-page="projects"]) .modal-overlay.active .modal-box {
  transform: translateY(0) scale(1);
}

:where(body[data-page="projects"]) .modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

:where(body[data-page="projects"]) .modal-title {
  font-size: 1.2rem;
  font-weight: 700;
  color: var(--text-primary, #1a1a1a);
  margin: 0;
}

:where(body[data-page="projects"]) .modal-close-btn {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 1px solid var(--glass-border);
  background: transparent;
  cursor: pointer;
  font-size: 1.2rem;
  color: var(--text-secondary, #777);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: background 0.18s;
}

:where(body[data-page="projects"]) .modal-close-btn:hover {
  background: var(--secondary-container, #E8DEF8);
}

/* ── Inputs del modal ── */
:where(body[data-page="projects"]) .field-group {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

:where(body[data-page="projects"]) .field-label {
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--text-secondary, #666);
  letter-spacing: 0.03em;
  text-transform: uppercase;
}

:where(body[data-page="projects"]) .field-input,
:where(body[data-page="projects"]) .field-textarea {
  width: 100%;
  padding: 0.65rem 0.9rem;
  border-radius: 12px;
  border: 1.5px solid var(--glass-border, rgba(103, 80, 164, 0.18));
  background: var(--secondary-container, #F5F0FF);
  color: var(--text-primary, #1a1a1a);
  font-size: 0.92rem;
  font-family: inherit;
  outline: none;
  transition: border-color 0.18s, box-shadow 0.18s;
  box-sizing: border-box;
}

:where(body[data-page="projects"]) .field-input:focus,
:where(body[data-page="projects"]) .field-textarea:focus {
  border-color: var(--accent-color, #6750A4);
  box-shadow: 0 0 0 3px var(--accent-glow, rgba(103, 80, 164, 0.15));
}

:where(body[data-page="projects"]) .field-textarea {
  resize: vertical;
  min-height: 80px;
}

/* ── Selector de tecnología ── */
:where(body[data-page="projects"]) .tech-selector {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

:where(body[data-page="projects"]) .tech-group-label {
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--text-secondary, #888);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-bottom: 0.15rem;
}

:where(body[data-page="projects"]) .tech-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

:where(body[data-page="projects"]) .tech-chip {
  padding: 0.3rem 0.75rem;
  border-radius: 20px;
  border: 1.5px solid var(--glass-border, rgba(103, 80, 164, 0.18));
  background: transparent;
  color: var(--text-secondary, #666);
  font-size: 0.8rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.18s ease;
  font-family: inherit;
  white-space: nowrap;
}

:where(body[data-page="projects"]) .tech-chip:hover {
  border-color: var(--accent-color, #6750A4);
  color: var(--accent-color, #6750A4);
  background: var(--secondary-container, #E8DEF8);
}

:where(body[data-page="projects"]) .tech-chip.selected {
  border-color: var(--accent-color, #6750A4);
  background: var(--accent-gradient, linear-gradient(135deg, #6750A4, #9A82DB));
  color: #fff;
  font-weight: 600;
}

/* ── Upload de archivos ── */
:where(body[data-page="projects"]) .file-drop-zone {
  border: 2px dashed var(--glass-border, rgba(103, 80, 164, 0.25));
  border-radius: 14px;
  padding: 1.5rem;
  text-align: center;
  cursor: pointer;
  transition: border-color 0.18s, background 0.18s;
  position: relative;
}

:where(body[data-page="projects"]) .file-drop-zone:hover,
:where(body[data-page="projects"]) .file-drop-zone.dragover {
  border-color: var(--accent-color, #6750A4);
  background: var(--secondary-container, #F0EBFF);
}

:where(body[data-page="projects"]) .file-drop-zone input[type="file"] {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
  width: 100%;
  height: 100%;
}

:where(body[data-page="projects"]) .file-drop-icon {
  font-size: 2rem;
  margin-bottom: 0.5rem;
}

:where(body[data-page="projects"]) .file-drop-text {
  font-size: 0.88rem;
  color: var(--text-secondary, #888);
  line-height: 1.4;
}

:where(body[data-page="projects"]) .file-drop-text strong {
  color: var(--accent-color, #6750A4);
}

/* ── Lista de archivos seleccionados ── */
:where(body[data-page="projects"]) .file-list {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  max-height: 180px;
  overflow-y: scroll;
  /* scroll siempre visible, no solo al hover */
  overflow-x: hidden;
  min-height: 0;
  /* permite que flex colapse correctamente */
  flex-shrink: 0;
  /* evita que el padre comprima esta lista */
}

:where(body[data-page="projects"]) .courses-container {
  padding-left: 1.1rem;
  padding-right: 1.1rem;
  box-sizing: border-box;
}

:where(body[data-page="projects"]) .file-item {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.45rem 0.75rem;
  border-radius: 10px;
  background: var(--secondary-container, #F5F0FF);
  font-size: 0.82rem;
  flex-shrink: 0;
  /* AGREGAR esta propiedad al bloque ya existente */
}

:where(body[data-page="projects"]) .file-item-icon {
  font-size: 1rem;
  flex-shrink: 0;
}

:where(body[data-page="projects"]) .file-item-name {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--text-primary, #333);
}

:where(body[data-page="projects"]) .file-item-size {
  color: var(--text-secondary, #888);
  flex-shrink: 0;
}

:where(body[data-page="projects"]) .file-item-remove {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text-secondary, #aaa);
  font-size: 1rem;
  line-height: 1;
  padding: 0 2px;
  transition: color 0.15s;
  flex-shrink: 0;
}

:where(body[data-page="projects"]) .file-item-remove:hover {
  color: #B71C1C;
}

/* ── Botones del modal ── */
:where(body[data-page="projects"]) .modal-footer {
  display: flex;
  gap: 0.75rem;
  justify-content: flex-end;
  padding-top: 0.5rem;
  border-top: 1px solid var(--glass-border, rgba(103, 80, 164, 0.10));
}

:where(body[data-page="projects"]) .btn-cancel {
  padding: 0.6rem 1.4rem;
  border-radius: 12px;
  border: 1.5px solid var(--glass-border);
  background: transparent;
  color: var(--text-secondary, #666);
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
  transition: background 0.18s;
}

:where(body[data-page="projects"]) .btn-cancel:hover {
  background: var(--secondary-container, #E8DEF8);
}

:where(body[data-page="projects"]) .btn-primary {
  padding: 0.6rem 1.6rem;
  border-radius: 12px;
  border: none;
  background: var(--accent-gradient, linear-gradient(135deg, #6750A4, #9A82DB));
  color: #fff;
  font-size: 0.9rem;
  font-weight: 700;
  cursor: pointer;
  font-family: inherit;
  transition: opacity 0.18s, transform 0.18s;
  letter-spacing: 0.02em;
}

:where(body[data-page="projects"]) .btn-primary:hover:not(:disabled) {
  opacity: 0.88;
  transform: scale(1.02);
}

:where(body[data-page="projects"]) .btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* ── Loading spinner dentro de botón ── */
:where(body[data-page="projects"]) .btn-spinner {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255, 255, 255, 0.4);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
  vertical-align: middle;
  margin-right: 6px;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* ── Progress bar de subida ── */
:where(body[data-page="projects"]) .upload-progress-bar {
  height: 4px;
  border-radius: 4px;
  background: var(--glass-border, #ddd);
  overflow: hidden;
}

:where(body[data-page="projects"]) .upload-progress-fill {
  height: 100%;
  background: var(--accent-gradient);
  transition: width 0.3s ease;
  border-radius: 4px;
}

/* ── Toast ── */
:where(body[data-page="projects"]) .toast-container {
  position: fixed;
  bottom: 1.5rem;
  right: 1.5rem;
  z-index: 2000;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

:where(body[data-page="projects"]) .toast {
  padding: 0.75rem 1.2rem;
  border-radius: 14px;
  font-size: 0.88rem;
  font-weight: 600;
  color: #fff;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.18);
  animation: toastIn 0.3s ease forwards;
  max-width: 320px;
}

:where(body[data-page="projects"]) .toast.success {
  background: #2E7D32;
}

:where(body[data-page="projects"]) .toast.error {
  background: #B71C1C;
}

:where(body[data-page="projects"]) .toast.info {
  background: var(--accent-color, #6750A4);
}

@keyframes toastIn {
  from {
    opacity: 0;
    transform: translateY(12px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* ── Modal de confirmación de eliminación ── */
:where(body[data-page="projects"]) .confirm-box {
  max-width: 400px;
}

:where(body[data-page="projects"]) .confirm-message {
  font-size: 0.95rem;
  color: var(--text-secondary, #555);
  line-height: 1.5;
}

:where(body[data-page="projects"]) .confirm-message strong {
  color: var(--text-primary, #1a1a1a);
}

:where(body[data-page="projects"]) .btn-danger {
  padding: 0.6rem 1.6rem;
  border-radius: 12px;
  border: none;
  background: linear-gradient(135deg, #B71C1C, #EF5350);
  color: #fff;
  font-size: 0.9rem;
  font-weight: 700;
  cursor: pointer;
  font-family: inherit;
  transition: opacity 0.18s;
}

:where(body[data-page="projects"]) .btn-danger:hover {
  opacity: 0.88;
}

/* ── Files existentes en modal de edición ── */
:where(body[data-page="projects"]) .existing-file-item {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.45rem 0.75rem;
  border-radius: 10px;
  background: var(--secondary-container, #F5F0FF);
  font-size: 0.82rem;
  flex-shrink: 0;
  /* no se comprima verticalmente */
  min-width: 0;
  /* permite truncar texto largo */
  width: 100%;
  /* fuerza una sola columna */
  box-sizing: border-box;
}

:where(body[data-page="projects"]) #existing-files-list {
  flex-direction: column;
  flex-wrap: nowrap;
  /* elimina el layout de 2 columnas */
  overflow-y: auto;
  overflow-x: hidden;
  max-height: 220px;
}

:where(body[data-page="projects"]) .existing-file-item.marked-delete {
  opacity: 0.5;
  text-decoration: line-through;
  background: #FFEBEE;
}

:where(body[data-page="projects"]) .existing-file-item .file-item-remove {
  color: var(--text-secondary);
}

/* ── Skeleton loader ── */
:where(body[data-page="projects"]) .skeleton-card {
  background: var(--glass-bg, rgba(255, 255, 255, 0.6));
  border: 1px solid var(--glass-border);
  border-radius: 20px;
  padding: 1.4rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

:where(body[data-page="projects"]) .skeleton-line {
  border-radius: 8px;
  background: linear-gradient(90deg,
      var(--secondary-container, #eee) 25%,
      var(--glass-border, #ddd) 50%,
      var(--secondary-container, #eee) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.4s infinite;
}

@keyframes shimmer {
  0% {
    background-position: 200% 0;
  }

  100% {
    background-position: -200% 0;
  }
}

/* ── Toolbar de búsqueda (igual a courses) ── */
:where(body[data-page="projects"]) .projects-new-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.65rem 1.2rem;
  border-radius: 20px;
  border: none;
  background: var(--accent-gradient, linear-gradient(135deg, #6750A4, #9A82DB));
  color: #fff;
  font-size: 0.88rem;
  font-weight: 700;
  cursor: pointer;
  font-family: inherit;
  transition: opacity 0.18s, transform 0.18s;
  white-space: nowrap;
  letter-spacing: 0.02em;
  width: 100%;
}

:where(body[data-page="projects"]) .projects-new-btn:hover {
  opacity: 0.88;
  transform: scale(1.02);
}

:where(body[data-page="projects"]) .projects-new-btn svg {
  flex-shrink: 0;
}

/* Ajuste toolbar para incluir botón nuevo */
:where(body[data-page="projects"]) .courses-toolbar {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

:where(body[data-page="projects"]) .courses-toolbar-top {
  width: 100%;
}

:where(body[data-page="projects"]) .courses-toolbar-top .courses-search {
  width: 100%;
}

:where(body[data-page="projects"]) #filter-pills {
  display: flex;
  overflow-x: auto;
  flex-wrap: nowrap;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
  padding-bottom: 4px;
  width: 100%;
}

:where(body[data-page="projects"]) #filter-pills::-webkit-scrollbar {
  display: none;
}

:where(body[data-page="projects"]) .filter-pill {
  flex-shrink: 0;
}

@media (max-width: 480px) {
  :where(body[data-page="projects"]) .modal-box {
    padding: 1.4rem 1.2rem;
  }

  :where(body[data-page="projects"]) .modal-footer {
    flex-direction: column-reverse;
  }

  :where(body[data-page="projects"]) .btn-cancel,
  :where(body[data-page="projects"]) .btn-primary,
  :where(body[data-page="projects"]) .btn-danger {
    width: 100%;
    text-align: center;
  }

  :where(body[data-page="projects"]) .toast-container {
    left: 1rem;
    right: 1rem;
  }
}
</style>
