/* ============================================================
   task.js — Gestor de Tareas · Mirai AI
   Conectado a la API real (/api/tasks).
   Cada tarea está aislada por usuario (session cookie).
   ============================================================ */
(function () {
  'use strict';

  /* ── Constantes ─────────────────────────────────────────── */
  const API       = '/api/tasks';
  const CAL_COLORS = { critica: '#ef4444', alta: '#f97316', media: '#eab308', baja: '#22c55e' };
  const STATUS_LABEL = { pendiente: 'Pendiente', progreso: 'En Progreso', revision: 'Revisión', completado: 'Completado' };
  const PRIORITY_LABEL = { critica: '🔴 Crítica', alta: '🟠 Alta', media: '🟡 Media', baja: '🟢 Baja' };
  const TAG_COLORS = {
    'UI/UX':        { bg: 'rgba(99,102,241,.12)',  fg: '#6366f1' },
    'Backend':      { bg: 'rgba(239,68,68,.12)',   fg: '#ef4444' },
    'Testing':      { bg: 'rgba(99,102,241,.12)',  fg: '#6366f1' },
    'DevOps':       { bg: 'rgba(14,165,233,.12)',  fg: '#0ea5e9' },
    'Docs':         { bg: 'rgba(34,197,94,.12)',   fg: '#16a34a' },
    'Feature':      { bg: 'rgba(249,115,22,.12)',  fg: '#f97316' },
    'Legal':        { bg: 'rgba(234,179,8,.12)',   fg: '#ca8a04' },
    'Performance':  { bg: 'rgba(14,165,233,.12)',  fg: '#0ea5e9' },
    'A11y':         { bg: 'rgba(34,197,94,.12)',   fg: '#16a34a' },
  };

  /* ── Estado ──────────────────────────────────────────────── */
  let TASKS       = [];
  let activeView  = 'kanban';
  let calYear     = new Date().getFullYear();
  let calMonth    = new Date().getMonth();
  let editingId   = null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  /* ══════════════════════════════════════════════════════════
     API — funciones CRUD
  ══════════════════════════════════════════════════════════ */

  async function apiFetch(url, options = {}) {
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
    if (res.status === 401) {
      // No autenticado → redirigir al login
      window.location.href = '/login';
      return null;
    }
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  }

  async function fetchTasks() {
    const data = await apiFetch(API);
    if (!data) return false;
    TASKS = (Array.isArray(data) ? data : []).map(normalizeTask);
    return true;
  }

  async function createTask(payload) {
    return await apiFetch(API, { method: 'POST', body: JSON.stringify(payload) });
  }

  async function updateTask(id, payload) {
    return await apiFetch(`${API}/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
  }

  async function deleteTask(id) {
    return await apiFetch(`${API}/${id}`, { method: 'DELETE' });
  }

  /** Normaliza campos de la DB al formato interno */
  function normalizeTask(t) {
    return {
      id:          t.id,
      title:       t.title       || '',
      description: t.description || '',
      status:      t.status      || 'pendiente',
      priority:    t.priority    || 'media',
      assignee:    t.assignee    || '',
      tag:         t.tag         || '',
      due:         t.due_date    || t.due || '',
      time:        parseFloat(t.estimated_time || t.time || 0),
      progress:    parseInt(t.progress || 0, 10),
      project:     t.project     || '',
      done:        t.done === 1 || t.done === true,
    };
  }

  /* ══════════════════════════════════════════════════════════
     ESTADÍSTICAS
  ══════════════════════════════════════════════════════════ */

  function updateStats() {
    const total   = TASKS.length;
    const done    = TASKS.filter(t => t.status === 'completado').length;
    const prog    = TASKS.filter(t => t.status === 'progreso').length;
    const overdue = TASKS.filter(t => t.due && new Date(t.due + 'T00:00:00') < today && t.status !== 'completado').length;
    const time    = TASKS.reduce((a, t) => a + (t.time || 0), 0);

    setText('stat-total',    total);
    setText('stat-done',     done);
    setText('stat-progress', prog);
    setText('stat-overdue',  overdue);
    setText('stat-time',     time + 'h');
  }

  /* ══════════════════════════════════════════════════════════
     VISTA KANBAN
  ══════════════════════════════════════════════════════════ */

  function renderKanban() {
    const q               = getSearchQuery();
    const activePriority  = getActivePriority();
    const activeProject   = getActiveProject();

    ['pendiente', 'progreso', 'revision', 'completado'].forEach(col => {
      const colEl = document.querySelector(`.kanban-col[data-col="${col}"]`);
      if (!colEl) return;

      // Eliminar cards existentes (conservar header y drop-zone)
      colEl.querySelectorAll('.task-card').forEach(c => c.remove());

      const tasks = TASKS.filter(t => {
        if (t.status !== col) return false;
        if (q && !t.title.toLowerCase().includes(q)) return false;
        if (activePriority !== 'todas' && t.priority !== activePriority) return false;
        if (activeProject !== 'todos' && t.project !== activeProject) return false;
        return true;
      });

      const badge = colEl.querySelector('.kanban-col-badge');
      if (badge) badge.textContent = tasks.length;

      const dropZone = colEl.querySelector('.kanban-drop-zone');
      tasks.forEach(t => colEl.insertBefore(buildTaskCard(t), dropZone));
    });
  }

  function buildTaskCard(t) {
    const isOverdue = t.due && new Date(t.due + 'T00:00:00') < today && t.status !== 'completado';
    const dueFmt    = t.due ? formatDate(t.due) : '';
    const tagC      = tagColor(t.tag);
    const initials  = t.assignee ? t.assignee.substring(0, 2).toUpperCase() : '?';

    const card = document.createElement('div');
    card.className = 'task-card';
    card.dataset.priority = t.priority;
    card.dataset.col      = t.status;
    card.dataset.id       = t.id;
    if (t.status === 'completado') card.style.opacity = '0.7';

    card.innerHTML = `
      <div class="task-card-header">
        <span class="task-card-title"${t.done ? ' style="text-decoration:line-through;"' : ''}>${esc(t.title)}</span>
        <span class="task-priority ${t.priority}"></span>
      </div>
      ${t.tag || t.time ? `
        <div class="task-card-meta">
          ${t.tag ? `<span class="task-tag" style="background:${tagC.bg};color:${tagC.fg};">${esc(t.tag)}</span>` : ''}
          ${t.time ? `<span>⏱ ${t.time}h est.</span>` : ''}
        </div>` : ''}
      <div class="task-card-footer">
        <div class="task-assignee" title="${esc(t.assignee)}">${initials}</div>
        ${dueFmt ? `<span class="task-due${isOverdue ? ' vencida' : ''}">${isOverdue ? 'Venció' : 'Vence'} ${dueFmt}</span>` : ''}
      </div>
      <div class="task-checklist-bar">
        <div class="task-checklist-fill" style="width:${t.progress}%"></div>
      </div>
    `;

    card.addEventListener('click', () => openEditModal(t));
    return card;
  }

  /* ══════════════════════════════════════════════════════════
     VISTA LISTA
  ══════════════════════════════════════════════════════════ */

  function renderList() {
    const container = document.getElementById('list-rows');
    if (!container) return;
    container.innerHTML = '';

    const q              = getSearchQuery();
    const activePriority = getActivePriority();
    const activeProject  = getActiveProject();

    const filtered = TASKS.filter(t => {
      if (q && !t.title.toLowerCase().includes(q)) return false;
      if (activePriority !== 'todas' && t.priority !== activePriority) return false;
      if (activeProject !== 'todos' && t.project !== activeProject) return false;
      return true;
    });

    filtered.forEach(t => {
      const dueFmt   = t.due ? formatDate(t.due) : '—';
      const isOverdue = t.due && new Date(t.due + 'T00:00:00') < today && !t.done;

      const row = document.createElement('div');
      row.className = 'list-task-row';
      row.innerHTML = `
        <div class="list-task-check ${t.done ? 'done' : ''}" data-id="${t.id}">${t.done ? '✓' : ''}</div>
        <div class="list-task-name ${t.done ? 'done' : ''}">${esc(t.title)}</div>
        <div><span class="priority-badge ${t.priority}">${PRIORITY_LABEL[t.priority] || t.priority}</span></div>
        <div style="font-size:.82rem;font-weight:600;">${esc(t.assignee) || '—'}</div>
        <div style="font-size:.8rem;color:var(--text-secondary);">${STATUS_LABEL[t.status] || t.status}</div>
        <div style="font-size:.78rem;color:${isOverdue ? '#ef4444' : 'var(--text-secondary)'};">${dueFmt}</div>
        <div style="font-size:.78rem;color:var(--text-secondary);">${t.time ? t.time + 'h' : '—'}</div>
      `;

      row.querySelector('.list-task-check').addEventListener('click', async e => {
        e.stopPropagation();
        const newDone   = !t.done;
        const newStatus = newDone ? 'completado' : 'pendiente';
        try {
          await updateTask(t.id, { done: newDone, status: newStatus, progress: newDone ? 100 : 0 });
          t.done = newDone; t.status = newStatus; t.progress = newDone ? 100 : 0;
          updateStats(); renderList();
        } catch (err) { console.error(err); }
      });

      row.addEventListener('click', e => {
        if (!e.target.classList.contains('list-task-check')) openEditModal(t);
      });

      container.appendChild(row);
    });
  }

  /* ══════════════════════════════════════════════════════════
     VISTA GANTT
  ══════════════════════════════════════════════════════════ */

  function renderGantt() {
    const dH = document.getElementById('gantt-days-header');
    const rC = document.getElementById('gantt-rows');
    if (!dH || !rC) return;
    dH.innerHTML = ''; rC.innerHTML = '';

    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - 3);
    const totalDays = 21;
    const dayWidth  = 100 / totalDays;

    for (let i = 0; i < totalDays; i++) {
      const d = new Date(startDate);
      d.setDate(startDate.getDate() + i);
      const isToday = d.toDateString() === today.toDateString();
      const div = document.createElement('div');
      div.className = 'gantt-day' + (isToday ? ' today' : '');
      div.textContent = d.getDate() + '/' + (d.getMonth() + 1);
      dH.appendChild(div);
    }

    const tasksWithDue = TASKS.filter(t => t.due);
    if (tasksWithDue.length === 0) {
      rC.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--text-secondary);">Sin tareas con fecha de vencimiento</div>';
      return;
    }

    tasksWithDue.forEach(t => {
      const row   = document.createElement('div'); row.className = 'gantt-row';
      const label = document.createElement('div'); label.className = 'gantt-task-label';
      label.title = t.title; label.textContent = t.title;
      row.appendChild(label);

      const tl    = document.createElement('div'); tl.className = 'gantt-timeline-row';
      const tOff  = Math.round((today - startDate) / 86400000);
      if (tOff >= 0 && tOff < totalDays) {
        const line = document.createElement('div'); line.className = 'gantt-today-line';
        line.style.left = (tOff * dayWidth) + '%'; tl.appendChild(line);
      }

      const dueDate  = new Date(t.due + 'T00:00:00');
      const endOff   = Math.round((dueDate - startDate) / 86400000);
      const dur      = Math.max(2, Math.min(5, Math.ceil((t.time || 2) / 2)));
      const startOff = Math.max(0, endOff - dur);

      if (endOff >= 0 && startOff < totalDays) {
        const cs  = Math.max(0, startOff);
        const ce  = Math.min(totalDays, endOff + 1);
        const bar = document.createElement('div'); bar.className = 'gantt-bar-wrap';
        bar.style.left       = (cs * dayWidth) + '%';
        bar.style.width      = ((ce - cs) * dayWidth) + '%';
        bar.style.background = CAL_COLORS[t.priority];
        bar.title            = t.title;
        bar.textContent      = t.title.split(' ').slice(0, 2).join(' ');
        bar.addEventListener('click', () => openEditModal(t));
        tl.appendChild(bar);
      }

      row.appendChild(tl); rC.appendChild(row);
    });
  }

  /* ══════════════════════════════════════════════════════════
     VISTA CALENDARIO
  ══════════════════════════════════════════════════════════ */

  function renderCalendar() {
    const months = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                    'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    const labelEl = document.getElementById('cal-month-label');
    if (labelEl) labelEl.textContent = months[calMonth] + ' ' + calYear;

    const grid = document.getElementById('cal-grid');
    if (!grid) return;
    grid.innerHTML = '';

    const firstDay = new Date(calYear, calMonth, 1);
    let startDow   = firstDay.getDay();
    startDow       = startDow === 0 ? 6 : startDow - 1;

    const dim    = new Date(calYear, calMonth + 1, 0).getDate();
    const diPrev = new Date(calYear, calMonth, 0).getDate();
    const total  = Math.ceil((startDow + dim) / 7) * 7;

    // Agrupar tareas por fecha de vencimiento
    const tbd = {};
    TASKS.forEach(t => {
      if (t.due) {
        if (!tbd[t.due]) tbd[t.due] = [];
        tbd[t.due].push(t);
      }
    });

    for (let i = 0; i < total; i++) {
      const cell = document.createElement('div'); cell.className = 'cal-cell';
      let dn, y = calYear, m = calMonth;

      if (i < startDow) {
        dn = diPrev - startDow + i + 1; m--;
        if (m < 0) { m = 11; y--; } cell.classList.add('other-month');
      } else if (i >= startDow + dim) {
        dn = i - startDow - dim + 1; m++;
        if (m > 11) { m = 0; y++; } cell.classList.add('other-month');
      } else { dn = i - startDow + 1; }

      if (dn === today.getDate() && m === today.getMonth() && y === today.getFullYear()) {
        cell.classList.add('today');
      }

      const dd = document.createElement('div'); dd.className = 'cal-date'; dd.textContent = dn;
      cell.appendChild(dd);

      const key = `${y}-${String(m + 1).padStart(2, '0')}-${String(dn).padStart(2, '0')}`;
      if (tbd[key]) {
        tbd[key].slice(0, 3).forEach(t => {
          const pill = document.createElement('span'); pill.className = 'cal-task-pill';
          pill.style.background = CAL_COLORS[t.priority]; pill.title = t.title;
          pill.textContent = t.title;
          pill.addEventListener('click', () => openEditModal(t));
          cell.appendChild(pill);
        });
      }

      grid.appendChild(cell);
    }
  }

  /* ══════════════════════════════════════════════════════════
     MODAL — Crear / Editar
  ══════════════════════════════════════════════════════════ */

  const overlay = document.getElementById('task-modal-overlay');

  function openNewModal(status = 'pendiente') {
    editingId = null;
    document.querySelector('.task-modal-title').textContent = 'Nueva Tarea';
    document.getElementById('save-task-btn').textContent    = 'Guardar Tarea';
    resetForm();
    document.getElementById('modal-status').value = status;
    overlay.classList.add('open');
  }

  function openEditModal(t) {
    editingId = t.id;
    document.querySelector('.task-modal-title').textContent = 'Editar Tarea';
    document.getElementById('save-task-btn').textContent    = 'Actualizar Tarea';
    document.getElementById('modal-title').value    = t.title       || '';
    document.getElementById('modal-desc').value     = t.description || '';
    document.getElementById('modal-priority').value = t.priority    || 'media';
    document.getElementById('modal-status').value   = t.status      || 'pendiente';
    document.getElementById('modal-date').value     = t.due         || '';
    document.getElementById('modal-time').value     = t.time        || '';
    document.getElementById('modal-assignee').value = t.assignee    || '';
    document.getElementById('modal-tag').value      = t.tag         || '';
    document.getElementById('modal-project').value  = t.project     || '';
    overlay.classList.add('open');
  }

  function resetForm() {
    ['modal-title', 'modal-desc', 'modal-date', 'modal-time'].forEach(id => {
      const el = document.getElementById(id); if (el) el.value = '';
    });
    document.getElementById('modal-priority').value = 'media';
    document.getElementById('modal-status').value   = 'pendiente';
    document.getElementById('modal-assignee').value = '';
    document.getElementById('modal-tag').value      = '';
    document.getElementById('modal-project').value  = '';
    const checklist = document.getElementById('modal-checklist');
    if (checklist) checklist.innerHTML = '';
  }

  document.getElementById('save-task-btn').addEventListener('click', async () => {
    const title = document.getElementById('modal-title').value.trim();
    if (!title) { alert('Escribe un título.'); return; }

    const payload = {
      title,
      description:    document.getElementById('modal-desc').value,
      status:         document.getElementById('modal-status').value,
      priority:       document.getElementById('modal-priority').value,
      assignee:       document.getElementById('modal-assignee').value,
      tag:            document.getElementById('modal-tag').value,
      due_date:       document.getElementById('modal-date').value || null,
      estimated_time: parseFloat(document.getElementById('modal-time').value) || 0,
      project:        document.getElementById('modal-project').value,
    };

    const btn = document.getElementById('save-task-btn');
    btn.disabled = true; btn.textContent = 'Guardando...';

    try {
      if (editingId) {
        await updateTask(editingId, payload);
        const idx = TASKS.findIndex(t => t.id === editingId);
        if (idx !== -1) {
          TASKS[idx] = { ...TASKS[idx], ...payload, time: payload.estimated_time, due: payload.due_date || '' };
        }
      } else {
        const result = await createTask(payload);
        TASKS.push(normalizeTask({ id: result.id, ...payload }));
      }
      overlay.classList.remove('open');
      refreshView();
      updateStats();
    } catch (err) {
      alert('Error al guardar: ' + err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = editingId ? 'Actualizar Tarea' : 'Guardar Tarea';
    }
  });

  /* ══════════════════════════════════════════════════════════
     NAVEGACIÓN DE VISTAS
  ══════════════════════════════════════════════════════════ */

  function refreshView() {
    switch (activeView) {
      case 'kanban':   renderKanban();   break;
      case 'list':     renderList();     break;
      case 'gantt':    renderGantt();    break;
      case 'calendar': renderCalendar(); break;
    }
  }

  /* ══════════════════════════════════════════════════════════
     BINDINGS DE EVENTOS
  ══════════════════════════════════════════════════════════ */

  // Modal: cerrar
  document.getElementById('close-modal-btn').addEventListener('click', () => overlay.classList.remove('open'));
  document.getElementById('cancel-modal-btn').addEventListener('click', () => overlay.classList.remove('open'));
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.classList.remove('open'); });

  // Nueva tarea — header
  document.getElementById('open-modal-btn').addEventListener('click', () => openNewModal());

  // Tabs de vista
  document.querySelectorAll('.view-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.view-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeView = btn.dataset.view;
      document.querySelectorAll('.view-panel').forEach(p => p.style.display = 'none');
      const panel = document.getElementById('view-' + activeView);
      if (panel) panel.style.display = '';
      refreshView();
    });
  });

  // Kanban: botones + y drop zones
  document.querySelectorAll('.kanban-add-btn, .kanban-drop-zone').forEach(el => {
    el.addEventListener('click', () => openNewModal(el.dataset.col || 'pendiente'));
  });

  // Calendario: nav
  document.getElementById('cal-prev')?.addEventListener('click', () => {
    calMonth--; if (calMonth < 0) { calMonth = 11; calYear--; } renderCalendar();
  });
  document.getElementById('cal-next')?.addEventListener('click', () => {
    calMonth++; if (calMonth > 11) { calMonth = 0; calYear++; } renderCalendar();
  });

  // Búsqueda
  document.getElementById('task-search').addEventListener('input', () => refreshView());

  // Filtro de prioridad
  document.querySelectorAll('[data-priority]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-priority]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      refreshView();
    });
  });

  // Selector de proyecto
  document.querySelectorAll('.project-chip[data-project]').forEach(c => {
    c.addEventListener('click', () => {
      document.querySelectorAll('.project-chip[data-project]').forEach(x => x.classList.remove('active'));
      c.classList.add('active');
      refreshView();
    });
  });

  // Agregar subtarea
  document.getElementById('add-subtask-btn')?.addEventListener('click', () => {
    const item = document.createElement('div');
    item.className = 'checklist-item';
    item.innerHTML = '<input class="checklist-checkbox" type="checkbox"> <input type="text" placeholder="Nueva subtarea..." style="border:none;background:transparent;font-size:.85rem;color:var(--text-primary);width:100%;outline:none;">';
    document.getElementById('modal-checklist').appendChild(item);
    item.querySelector('input[type=text]').focus();
  });

  // Asistente IA — usa el AI Gateway interno del worker (AI_MODEL_NORMAL)
  document.getElementById('ai-generate-btn')?.addEventListener('click', async () => {
    const input     = document.getElementById('ai-task-input').value.trim();
    const resultDiv = document.getElementById('ai-result');
    if (!input) return;

    const btn = document.getElementById('ai-generate-btn');
    btn.disabled = true;
    resultDiv.style.display = ''; resultDiv.textContent = '✨ Generando con IA...';

    try {
      const res = await fetch('/api/tasks/ai-suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task_title: input }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
      resultDiv.textContent = data.suggestion || 'Sin respuesta.';
    } catch (e) {
      resultDiv.textContent = '⚠️ ' + (e.message || 'No se pudo generar la sugerencia.');
    } finally {
      btn.disabled = false;
    }
  });

  document.getElementById('ai-suggest-btn')?.addEventListener('click', () => {
    document.getElementById('ai-task-input')?.scrollIntoView({ behavior: 'smooth' });
    document.getElementById('ai-task-input')?.focus();
  });

  /* ══════════════════════════════════════════════════════════
     HELPERS
  ══════════════════════════════════════════════════════════ */

  function getSearchQuery()    { return (document.getElementById('task-search')?.value || '').toLowerCase(); }
  function getActivePriority() { return document.querySelector('[data-priority].active')?.dataset?.priority || 'todas'; }
  function getActiveProject()  { return document.querySelector('.project-chip[data-project].active')?.dataset?.project || 'todos'; }

  function formatDate(str) {
    if (!str) return '';
    try {
      return new Date(str + 'T00:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
    } catch { return str; }
  }

  function esc(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function tagColor(tag) {
    return TAG_COLORS[tag] || { bg: 'rgba(103,80,164,.12)', fg: '#6750A4' };
  }

  function setText(id, val) {
    const el = document.getElementById(id); if (el) el.textContent = val;
  }

  /* ══════════════════════════════════════════════════════════
     INICIALIZACIÓN
  ══════════════════════════════════════════════════════════ */

  async function init() {
    // Estado de carga
    ['stat-total','stat-done','stat-progress','stat-overdue','stat-time'].forEach(id => setText(id, '…'));

    const kanbanArea = document.getElementById('view-kanban');
    if (kanbanArea) {
      kanbanArea.querySelectorAll('.task-card').forEach(c => c.remove());
    }

    const ok = await fetchTasks();

    if (ok) {
      updateStats();
      renderKanban();
    } else {
      if (kanbanArea) {
        kanbanArea.innerHTML = `
          <div style="grid-column:1/-1;text-align:center;padding:3rem;color:var(--text-secondary);">
            <div style="font-size:2rem;margin-bottom:1rem;">🔒</div>
            <p>No se pudieron cargar las tareas.</p>
            <p style="font-size:.85rem;margin-top:.5rem;">Verifica que has iniciado sesión.</p>
          </div>
        `;
      }
      ['stat-total','stat-done','stat-progress','stat-overdue'].forEach(id => setText(id, '0'));
      setText('stat-time', '0h');
    }
  }

  init();

})();