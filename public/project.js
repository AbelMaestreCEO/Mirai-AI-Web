/* ============================================================
   MIRAI AI — projects.js
   Gestión de proyectos: CRUD en D1 + archivos en R2
   ============================================================ */

'use strict';

// ── CONFIGURACIÓN ──────────────────────────────────────────────
const API = {
  LIST:   '/api/projects',
  CREATE: '/api/projects',
  UPDATE: (id) => `/api/projects/${id}`,
  DELETE: (id) => `/api/projects/${id}`,
  FILES:  (id) => `/api/projects/${id}/files`,
  FILE_DELETE: (projectId, fileId) => `/api/projects/${projectId}/files/${fileId}`,
};

// Mapa de tecnologías → categoría (para filtros)
const TECH_CATEGORY_MAP = {
  'Cloudflare Workers': 'cloudflare', 'Cloudflare D1': 'cloudflare',
  'Cloudflare R2': 'cloudflare',     'Cloudflare Pages': 'cloudflare',
  'Cloudflare KV': 'cloudflare',     'Cloudflare AI': 'cloudflare',
  'React': 'web', 'Vue': 'web', 'Next.js': 'web', 'Svelte': 'web',
  'Astro': 'web', 'HTML/CSS': 'web', 'JavaScript': 'web',
  'TypeScript': 'web', 'Tailwind CSS': 'web',
  'Node.js': 'backend', 'Python': 'backend', 'Rust': 'backend',
  'Go': 'backend', 'Express': 'backend', 'Hono': 'backend',
  'FastAPI': 'backend', 'Django': 'backend', 'GraphQL': 'backend',
  'React Native': 'movil', 'Flutter': 'movil', 'Swift': 'movil',
  'Kotlin': 'movil', 'Ionic': 'movil',
  'TensorFlow': 'datos', 'PyTorch': 'datos', 'LangChain': 'datos',
  'DeepSeek': 'datos', 'OpenAI': 'datos', 'Anthropic Claude': 'datos',
  'AWS Lambda': 'devops', 'Firebase': 'devops', 'Supabase': 'devops',
};

// Emojis de icono por categoría
const CATEGORY_ICONS = {
  cloudflare: '⚡', web: '🌐', backend: '⚙️',
  movil: '📱', datos: '📊', devops: '🚀', otros: '🗂️',
};

// ── ESTADO ──────────────────────────────────────────────────────
let allProjects = [];
let currentFilter = 'todos';
let searchQuery = '';
let editingProjectId = null;
let pendingDeleteId = null;
let newFiles = [];           // File[] nuevos a subir
let deletedFileIds = [];     // IDs de archivos existentes marcados para eliminar
let existingFiles = [];      // Archivos actuales del proyecto en edición

// ── HELPERS ────────────────────────────────────────────────────

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatDate(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
}

function getFileIcon(name) {
  const ext = name.split('.').pop().toLowerCase();
  const icons = {
    js: '🟨', ts: '🔷', jsx: '⚛️', tsx: '⚛️',
    py: '🐍', rs: '🦀', go: '🐹',
    html: '🌐', css: '🎨', json: '📋',
    md: '📄', txt: '📄', sql: '🗄️',
    env: '🔐', toml: '⚙️', yaml: '⚙️', yml: '⚙️',
    sh: '🖥️', bat: '🖥️', vue: '💚', svelte: '🔥',
    astro: '🚀', php: '🐘', java: '☕', c: '💡', cpp: '💡',
    h: '💡', cs: '💜', rb: '💎', swift: '🍎', kt: '🟣', dart: '🎯',
  };
  return icons[ext] || '📄';
}

/** Deduce la categoría principal del proyecto según su stack */
function inferCategory(techStack) {
  if (!Array.isArray(techStack) || techStack.length === 0) return 'otros';
  const counts = {};
  techStack.forEach(t => {
    const cat = TECH_CATEGORY_MAP[t] || 'otros';
    counts[cat] = (counts[cat] || 0) + 1;
  });
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

// ── TOAST ──────────────────────────────────────────────────────

function showToast(message, type = 'info', duration = 3200) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), duration);
}

// ── MODAL UTILS ────────────────────────────────────────────────

function openModal(modalId) {
  document.getElementById(modalId).classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeModal(modalId) {
  document.getElementById(modalId).classList.remove('active');
  document.body.style.overflow = '';
}

// ── RENDERIZADO ─────────────────────────────────────────────────

function getFilteredProjects() {
  let projects = allProjects;
  if (currentFilter !== 'todos') {
    projects = projects.filter(p => p.category === currentFilter);
  }
  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase();
    projects = projects.filter(p =>
      p.name.toLowerCase().includes(q) ||
      (p.description || '').toLowerCase().includes(q) ||
      (Array.isArray(p.tech_stack) ? p.tech_stack : JSON.parse(p.tech_stack || '[]'))
        .some(t => t.toLowerCase().includes(q))
    );
  }
  return projects;
}

function renderProjects() {
  const grid = document.getElementById('projects-grid');
  const countEl = document.getElementById('projects-count');
  const filtered = getFilteredProjects();

  countEl.textContent = filtered.length === 0
    ? 'No se encontraron proyectos'
    : `Mostrando ${filtered.length} proyecto${filtered.length !== 1 ? 's' : ''}`;

  if (filtered.length === 0) {
    grid.innerHTML = `
      <div class="projects-empty">
        <div class="projects-empty-icon">🗂️</div>
        <p>${searchQuery || currentFilter !== 'todos'
          ? 'No hay proyectos con ese filtro. Prueba con otro término.'
          : 'Aún no tienes proyectos. ¡Crea el primero!'}</p>
      </div>`;
    return;
  }

  grid.innerHTML = filtered.map(p => {
    const techStack = Array.isArray(p.tech_stack)
      ? p.tech_stack
      : JSON.parse(p.tech_stack || '[]');
    const category = p.category || inferCategory(techStack);
    const icon = CATEGORY_ICONS[category] || '🗂️';
    const tags = techStack.slice(0, 4).map(t =>
      `<span class="project-tech-tag">${t}</span>`
    ).join('') + (techStack.length > 4
      ? `<span class="project-tech-tag">+${techStack.length - 4}</span>` : '');

    return `
      <div class="project-card" data-id="${p.id}" data-category="${category}">
        <div class="project-card-accent"></div>
        <div class="project-card-header">
          <span class="project-icon">${icon}</span>
          <div class="project-card-actions">
            <button class="project-action-btn edit" data-id="${p.id}" title="Editar proyecto">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor">
                <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
              </svg>
            </button>
            <button class="project-action-btn delete" data-id="${p.id}" data-name="${p.name}" title="Eliminar proyecto">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor">
                <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
              </svg>
            </button>
          </div>
        </div>
        <h3 class="project-title">${escapeHtml(p.name)}</h3>
        ${p.description ? `<p class="project-description">${escapeHtml(p.description)}</p>` : ''}
        ${tags ? `<div class="project-tech-tags">${tags}</div>` : ''}
        <div class="project-meta">
          <span class="project-meta-item">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm4 18H6V4h7v5h5v11z"/></svg>
            ${p.file_count || 0} archivo${(p.file_count || 0) !== 1 ? 's' : ''}
          </span>
          <span class="project-meta-item">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67V7z"/></svg>
            ${formatDate(p.created_at)}
          </span>
        </div>
        <button class="project-open-btn" data-id="${p.id}">
          💻 Abrir en Code
        </button>
      </div>`;
  }).join('');

  // Eventos de las tarjetas
  grid.querySelectorAll('.project-action-btn.edit').forEach(btn => {
    btn.addEventListener('click', (e) => { e.stopPropagation(); openEditModal(btn.dataset.id); });
  });
  grid.querySelectorAll('.project-action-btn.delete').forEach(btn => {
    btn.addEventListener('click', (e) => { e.stopPropagation(); openDeleteModal(btn.dataset.id, btn.dataset.name); });
  });
  grid.querySelectorAll('.project-open-btn').forEach(btn => {
    btn.addEventListener('click', (e) => { e.stopPropagation(); openInCode(btn.dataset.id); });
  });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function openInCode(projectId) {
  window.location.href = `code.html?project=${projectId}`;
}

// ── CARGAR PROYECTOS ───────────────────────────────────────────

async function loadProjects() {
  try {
    const res = await fetch(API.LIST, { credentials: 'include' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    allProjects = data.projects || [];

    // Normalizar tech_stack a array si viene como string JSON
    allProjects = allProjects.map(p => ({
      ...p,
      tech_stack: Array.isArray(p.tech_stack)
        ? p.tech_stack
        : JSON.parse(p.tech_stack || '[]'),
      category: p.category || inferCategory(
        Array.isArray(p.tech_stack) ? p.tech_stack : JSON.parse(p.tech_stack || '[]')
      ),
    }));

    renderProjects();
  } catch (err) {
    console.error('[Projects] Error al cargar:', err);
    document.getElementById('projects-count').textContent = 'Error al cargar proyectos';
    document.getElementById('projects-grid').innerHTML = `
      <div class="projects-empty">
        <div class="projects-empty-icon">⚠️</div>
        <p>No se pudieron cargar los proyectos. Intenta de nuevo.</p>
      </div>`;
  }
}

// ── MODAL DE CREACIÓN / EDICIÓN ────────────────────────────────

function resetModal() {
  document.getElementById('project-name').value = '';
  document.getElementById('project-desc').value = '';
  document.querySelectorAll('.tech-chip').forEach(c => c.classList.remove('selected'));
  document.getElementById('new-files-list').innerHTML = '';
  document.getElementById('existing-files-section').style.display = 'none';
  document.getElementById('existing-files-list').innerHTML = '';
  document.getElementById('file-input').value = '';
  document.getElementById('upload-progress-wrap').style.display = 'none';
  document.getElementById('upload-progress-fill').style.width = '0%';
  document.getElementById('modal-save-btn').disabled = false;
  newFiles = [];
  deletedFileIds = [];
  existingFiles = [];
  editingProjectId = null;
}

function openCreateModal() {
  resetModal();
  document.getElementById('modal-title').textContent = 'Nuevo Proyecto';
  document.getElementById('modal-save-text').textContent = 'Crear proyecto';
  openModal('project-modal');
  document.getElementById('project-name').focus();
}

async function openEditModal(projectId) {
  resetModal();
  editingProjectId = projectId;
  document.getElementById('modal-title').textContent = 'Editar Proyecto';
  document.getElementById('modal-save-text').textContent = 'Guardar cambios';
  openModal('project-modal');

  const project = allProjects.find(p => p.id === projectId);
  if (!project) return;

  document.getElementById('project-name').value = project.name;
  document.getElementById('project-desc').value = project.description || '';

  const techStack = Array.isArray(project.tech_stack)
    ? project.tech_stack
    : JSON.parse(project.tech_stack || '[]');

  document.querySelectorAll('.tech-chip').forEach(chip => {
    if (techStack.includes(chip.dataset.tech)) chip.classList.add('selected');
  });

  // Cargar archivos actuales
  try {
    const res = await fetch(API.FILES(projectId), { credentials: 'include' });
    if (res.ok) {
      const data = await res.json();
      existingFiles = data.files || [];
      renderExistingFiles();
    }
  } catch (e) {
    console.warn('[Projects] No se pudieron cargar archivos del proyecto', e);
  }
}

function renderExistingFiles() {
  const section = document.getElementById('existing-files-section');
  const list = document.getElementById('existing-files-list');
  if (existingFiles.length === 0) { section.style.display = 'none'; return; }

  section.style.display = 'flex';
  list.innerHTML = existingFiles.map(f => `
    <div class="existing-file-item ${deletedFileIds.includes(f.id) ? 'marked-delete' : ''}" id="ef-${f.id}">
      <span class="file-item-icon">${getFileIcon(f.name)}</span>
      <span class="file-item-name">${escapeHtml(f.name)}</span>
      <span class="file-item-size">${formatBytes(f.size || 0)}</span>
      <button class="file-item-remove" data-file-id="${f.id}" title="${deletedFileIds.includes(f.id) ? 'Restaurar' : 'Eliminar'}">
        ${deletedFileIds.includes(f.id) ? '↩' : '×'}
      </button>
    </div>`).join('');

  list.querySelectorAll('.file-item-remove').forEach(btn => {
    btn.addEventListener('click', () => toggleFileDelete(btn.dataset.fileId));
  });
}

function toggleFileDelete(fileId) {
  const idx = deletedFileIds.indexOf(fileId);
  if (idx === -1) {
    deletedFileIds.push(fileId);
  } else {
    deletedFileIds.splice(idx, 1);
  }
  renderExistingFiles();
}

function renderNewFileList() {
  const list = document.getElementById('new-files-list');
  if (newFiles.length === 0) { list.innerHTML = ''; return; }
  list.innerHTML = newFiles.map((f, i) => `
    <div class="file-item">
      <span class="file-item-icon">${getFileIcon(f.name)}</span>
      <span class="file-item-name">${escapeHtml(f.name)}</span>
      <span class="file-item-size">${formatBytes(f.size)}</span>
      <button class="file-item-remove" data-index="${i}" title="Quitar">×</button>
    </div>`).join('');

  list.querySelectorAll('.file-item-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      newFiles.splice(parseInt(btn.dataset.index), 1);
      renderNewFileList();
    });
  });
}

// ── GUARDAR PROYECTO ───────────────────────────────────────────

async function saveProject() {
  const name = document.getElementById('project-name').value.trim();
  if (!name) {
    showToast('El nombre del proyecto es obligatorio.', 'error');
    document.getElementById('project-name').focus();
    return;
  }

  const description = document.getElementById('project-desc').value.trim();
  const techStack = [...document.querySelectorAll('.tech-chip.selected')].map(c => c.dataset.tech);
  const category = inferCategory(techStack);

  const saveBtn = document.getElementById('modal-save-btn');
  const saveText = document.getElementById('modal-save-text');
  saveBtn.disabled = true;
  saveText.innerHTML = '<span class="btn-spinner"></span>Guardando...';

  try {
    let projectId = editingProjectId;

    // 1. Crear o actualizar el proyecto (metadatos)
    const body = JSON.stringify({ name, description, tech_stack: techStack, category });
    const method = editingProjectId ? 'PUT' : 'POST';
    const url = editingProjectId ? API.UPDATE(editingProjectId) : API.CREATE;

    const res = await fetch(url, {
      method,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${res.status}`);
    }

    const data = await res.json();
    projectId = data.project?.id || projectId;

    // 2. Eliminar archivos marcados para borrado
    if (deletedFileIds.length > 0) {
      await Promise.all(deletedFileIds.map(fid =>
        fetch(API.FILE_DELETE(projectId, fid), {
          method: 'DELETE',
          credentials: 'include',
        })
      ));
    }

    // 3. Subir archivos nuevos
    if (newFiles.length > 0) {
      const progressWrap = document.getElementById('upload-progress-wrap');
      const progressFill = document.getElementById('upload-progress-fill');
      progressWrap.style.display = 'block';

      for (let i = 0; i < newFiles.length; i++) {
        const file = newFiles[i];
        const formData = new FormData();
        formData.append('file', file);
        formData.append('project_id', projectId);

        const uploadRes = await fetch(API.FILES(projectId), {
          method: 'POST',
          credentials: 'include',
          body: formData,
        });

        if (!uploadRes.ok) {
          const err = await uploadRes.json().catch(() => ({}));
          console.warn(`[Projects] Error subiendo ${file.name}:`, err);
          showToast(`No se pudo subir: ${file.name}`, 'error');
        }

        progressFill.style.width = `${Math.round(((i + 1) / newFiles.length) * 100)}%`;
      }
    }

    showToast(
      editingProjectId ? '✅ Proyecto actualizado correctamente.' : '✅ Proyecto creado correctamente.',
      'success'
    );
    closeModal('project-modal');
    await loadProjects();

  } catch (err) {
    console.error('[Projects] Error al guardar:', err);
    showToast(`Error: ${err.message}`, 'error');
  } finally {
    saveBtn.disabled = false;
    saveText.textContent = editingProjectId ? 'Guardar cambios' : 'Crear proyecto';
  }
}

// ── ELIMINAR PROYECTO ──────────────────────────────────────────

function openDeleteModal(projectId, projectName) {
  pendingDeleteId = projectId;
  document.getElementById('delete-project-name').textContent = `"${projectName}"`;
  openModal('delete-modal');
}

async function confirmDelete() {
  if (!pendingDeleteId) return;

  const btn = document.getElementById('delete-confirm-btn');
  btn.disabled = true;
  btn.textContent = 'Eliminando...';

  try {
    const res = await fetch(API.DELETE(pendingDeleteId), {
      method: 'DELETE',
      credentials: 'include',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    showToast('🗑️ Proyecto eliminado.', 'info');
    closeModal('delete-modal');
    await loadProjects();
  } catch (err) {
    console.error('[Projects] Error al eliminar:', err);
    showToast(`Error al eliminar: ${err.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Eliminar';
    pendingDeleteId = null;
  }
}

// ── INIT ────────────────────────────────────────────────────────

function initProjects() {
  // Botón nuevo proyecto
  document.getElementById('new-project-btn')
    .addEventListener('click', openCreateModal);

  // Cerrar modales
  document.getElementById('modal-close-btn').addEventListener('click', () => closeModal('project-modal'));
  document.getElementById('modal-cancel-btn').addEventListener('click', () => closeModal('project-modal'));
  document.getElementById('delete-modal-close').addEventListener('click', () => closeModal('delete-modal'));
  document.getElementById('delete-cancel-btn').addEventListener('click', () => closeModal('delete-modal'));

  // Cerrar al hacer clic en el overlay
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal(overlay.id);
    });
  });

  // Guardar proyecto
  document.getElementById('modal-save-btn').addEventListener('click', saveProject);

  // Confirmar eliminación
  document.getElementById('delete-confirm-btn').addEventListener('click', confirmDelete);

  // Tech chips (toggle)
  document.querySelectorAll('.tech-chip').forEach(chip => {
    chip.addEventListener('click', () => chip.classList.toggle('selected'));
  });

  // Búsqueda
  const searchInput = document.getElementById('project-search');
  searchInput.addEventListener('input', () => {
    searchQuery = searchInput.value;
    renderProjects();
  });

  // Filtros
  document.querySelectorAll('.filter-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      currentFilter = pill.dataset.filter;
      renderProjects();
    });
  });

  // File input
  const fileInput = document.getElementById('file-input');
  fileInput.addEventListener('change', () => {
    const selected = Array.from(fileInput.files);
    selected.forEach(f => {
      if (!newFiles.find(existing => existing.name === f.name && existing.size === f.size)) {
        newFiles.push(f);
      }
    });
    renderNewFileList();
    fileInput.value = '';
  });

  // Drag & Drop
  const dropZone = document.getElementById('file-drop-zone');

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('dragover');
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    const dropped = Array.from(e.dataTransfer.files);
    dropped.forEach(f => {
      if (!newFiles.find(ex => ex.name === f.name && ex.size === f.size)) {
        newFiles.push(f);
      }
    });
    renderNewFileList();
  });

  // Atajo de teclado: Escape cierra modales
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (document.getElementById('project-modal').classList.contains('active')) closeModal('project-modal');
      if (document.getElementById('delete-modal').classList.contains('active')) closeModal('delete-modal');
    }
    // Enter en el campo nombre confirma guardar (si modal abierto)
    if (e.key === 'Enter' && e.target === document.getElementById('project-name')) {
      saveProject();
    }
  });

  // Cargar proyectos
  loadProjects();
}

// Esperar a que app.js haya inicializado la autenticación
document.addEventListener('DOMContentLoaded', initProjects);