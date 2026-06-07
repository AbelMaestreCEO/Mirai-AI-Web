// classroom.js - Versión Unificada
// Depende de app.js para: Menú, Tema.
// La autenticación la maneja auth-guard.js (verifica mirai_user_dni).

(function () {
    'use strict';

    document.addEventListener('DOMContentLoaded', async () => {
        const dni = localStorage.getItem('mirai_user_dni');
        if (!dni) {
            window.location.replace('login');
            return;
        }

        await loadTasks(dni);
        setupProfessorButton();
        setupLogoutButton();

        if (typeof MiraiApp !== 'undefined') {
            MiraiApp.setActiveNavByURL();
        }
        initRealtimeClassroom();
    });

    // ── CARGAR TAREAS ─────────────────────────────────────────────────────────
    async function loadTasks(userDni) {
        const container = document.getElementById('tasks-container');
        const greeting = document.getElementById('user-greeting');

        if (greeting) greeting.textContent = `Hola, ${userDni}`;

        try {
            const headers = { 'Content-Type': 'application/json' };
            const token = localStorage.getItem('mirai_auth_token');
            if (token) headers['Authorization'] = `Bearer ${token}`;

            const response = await fetch(`/api/my-submissions?user_dni=${encodeURIComponent(userDni)}`, {
                method: 'GET',
                credentials: 'same-origin',
                headers
            });

            if (!response.ok) {
                if (response.status === 401) {
                    if (container) container.innerHTML = `
                        <div class="empty-state">
                            <span class="empty-state-icon">⚠️</span>
                            <h3>Sesión expirada</h3>
                            <p>Por favor, <a href="login">inicia sesión de nuevo</a>.</p>
                        </div>`;
                    return;
                }
                throw new Error(`Error HTTP: ${response.status}`);
            }

            const data = await response.json();
            const { assignments, submissions } = data;

            if (!assignments || assignments.length === 0) {
                if (container) container.innerHTML = `
                    <div class="empty-state">
                        <span class="empty-state-icon">📭</span>
                        <h3>No tienes tareas asignadas</h3>
                        <p>Por ahora no hay ninguna tarea pendiente para ti.</p>
                    </div>`;
                updateStatsDOM(0, 0, '-');
                updateCountLabel(0);
                return;
            }

            renderTasks(container, assignments, submissions);

        } catch (error) {
            console.error('Error cargando tareas:', error);
            if (container) container.innerHTML = `
                <div class="empty-state">
                    <span class="empty-state-icon">❌</span>
                    <h3>Error cargando tareas</h3>
                    <p>${escapeHtml(error.message)}</p>
                </div>`;
        }
    }

    // ── COURSE TABS ───────────────────────────────────────────────────────────
    let _allAssignments = [];
    let _allSubmissions = [];
    let _activeCourse   = 'all';

    function buildCourseTabs(assignments) {
        const tabsEl = document.getElementById('course-tabs');
        if (!tabsEl) return;

        // Collect unique courses preserving order
        const seen = new Map();
        assignments.forEach(a => {
            const id    = a.course_id  || '__none__';
            const title = a.course_title || 'Sin curso';
            if (!seen.has(id)) seen.set(id, title);
        });

        // Only show tabs when there is more than one course
        if (seen.size <= 1) { tabsEl.style.display = 'none'; return; }
        tabsEl.style.display = 'flex';
        tabsEl.innerHTML = '';

        // "All" pill
        const allBtn = document.createElement('button');
        allBtn.className = 'filter-pill' + (_activeCourse === 'all' ? ' active' : '');
        allBtn.textContent = '📚 Todos';
        allBtn.addEventListener('click', () => { _activeCourse = 'all'; applyFilter(); });
        tabsEl.appendChild(allBtn);

        seen.forEach((title, id) => {
            const btn = document.createElement('button');
            btn.className = 'filter-pill' + (_activeCourse === id ? ' active' : '');
            btn.textContent = title;
            btn.dataset.course = id;
            btn.addEventListener('click', () => { _activeCourse = id; applyFilter(); });
            tabsEl.appendChild(btn);
        });
    }

    function applyFilter() {
        // Update active pill
        const tabsEl = document.getElementById('course-tabs');
        if (tabsEl) {
            tabsEl.querySelectorAll('.filter-pill').forEach(btn => {
                const isAll    = !btn.dataset.course;
                const isActive = isAll ? _activeCourse === 'all' : btn.dataset.course === _activeCourse;
                btn.classList.toggle('active', isActive);
            });
        }

        const filtered = _activeCourse === 'all'
            ? _allAssignments
            : _allAssignments.filter(a => (a.course_id || '__none__') === _activeCourse);

        renderCards(document.getElementById('tasks-container'), filtered, _allSubmissions);
    }

    function renderTasks(container, assignments, submissions) {
        _allAssignments = assignments;
        _allSubmissions = submissions;
        _activeCourse   = 'all';

        buildCourseTabs(assignments);
        renderCards(container, assignments, submissions);
    }

    function renderCards(container, assignments, submissions) {
        container.innerHTML = '';

        // Mapa de submissions por assignment_id para búsqueda O(1)
        const subMap = {};
        if (submissions) submissions.forEach(s => { subMap[s.assignment_id] = s; });

        let pending = 0, completed = 0, totalScore = 0, scoredCount = 0;

        assignments.forEach(assignment => {
            const submission = subMap[assignment.id];

            let statusText, statusClass, cardAccent, taskIcon, actionText, actionHref;
            actionHref = `classroom_details?id=${assignment.id}`;

            if (submission) {
                if (submission.score !== null) {
                    statusText = `Calificado: ${submission.score}`;
                    statusClass = 'status-completed';
                    cardAccent = 'linear-gradient(135deg, #4caf50, #81c784)';
                    taskIcon = '✅';
                    actionText = 'Ver Calificación';
                    completed++;
                    totalScore += submission.score;
                    scoredCount++;
                } else {
                    statusText = 'Entregado';
                    statusClass = 'status-completed';
                    cardAccent = 'linear-gradient(135deg, #4caf50, #81c784)';
                    taskIcon = '✅';
                    actionText = 'Ver Entrega';
                    completed++;
                }
            } else {
                const isLate = assignment.due_date && new Date(assignment.due_date) < new Date();
                if (isLate) {
                    statusText = 'Atrasada';
                    statusClass = 'status-late';
                    cardAccent = 'linear-gradient(135deg, #e53935, #ef9a9a)';
                    taskIcon = '🚨';
                } else {
                    statusText = 'Pendiente';
                    statusClass = 'status-pending';
                    cardAccent = 'linear-gradient(135deg, #6750A4, #9A82DB)';
                    taskIcon = '🧠';
                }
                actionText = 'Ver Tarea';
                pending++;
            }

            const isCompleted = !!submission;
            const dueDate = assignment.due_date
                ? new Date(assignment.due_date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
                : 'Sin fecha límite';

            const card = document.createElement('div');
            card.className = `task-card${isCompleted ? ' completed' : ''}`;
            card.style.setProperty('--card-accent', cardAccent);

            card.innerHTML = `
                <span class="status-badge ${statusClass}">${statusText}</span>

                <div class="task-icon">${taskIcon}</div>

                <h3 class="task-title">${escapeHtml(assignment.title)}</h3>

                <p class="task-course-name">
                    📚 ${escapeHtml(assignment.course_title || 'Sin curso')}
                    ${assignment.section_name ? `<span style="margin-left:8px; font-size:0.8rem; background:var(--secondary-container); color:var(--accent-color); padding:2px 8px; border-radius:12px;">🗂️ ${escapeHtml(assignment.section_name)}</span>` : ''}
                </p>

                <div class="task-meta">
                    <span class="task-meta-item"><span>📅</span> ${dueDate}</span>
                    ${submission && submission.score !== null
                    ? `<span class="task-meta-item"><span>⭐</span> ${submission.score} pts</span>`
                    : ''}
                </div>

                <div class="task-actions">
                    <button class="btn-secondary btn-learn"
                            data-id="${assignment.id}"
                            data-title="${escapeHtml(assignment.title)}">
                        🧠 Aprender
                    </button>
                    <a href="${actionHref}" class="btn-primary">${actionText}</a>
                </div>`;

            container.appendChild(card);
        });

        // Eventos del botón Aprender
        container.querySelectorAll('.btn-learn').forEach(btn => {
            btn.addEventListener('click', e => {
                const id = e.currentTarget.dataset.id;
                const title = e.currentTarget.dataset.title;
                window.location.href = `learning_hub?task_id=${id}&task_title=${encodeURIComponent(title)}`;
            });
        });

        const avg = scoredCount > 0 ? (totalScore / scoredCount).toFixed(1) : '-';
        updateStatsDOM(pending, completed, avg);
        updateCountLabel(assignments.length);
    }
    function updateStatsDOM(pending, completed, avg) {
        const pendEl = document.getElementById('pending-count');
        const compEl = document.getElementById('completed-count');
        const avgEl = document.getElementById('avg-score');
        if (pendEl) pendEl.textContent = pending;
        if (compEl) compEl.textContent = completed;
        if (avgEl) avgEl.textContent = avg;
    }

    function updateCountLabel(count) {
        const el = document.getElementById('tasks-count');
        if (el) el.textContent = count > 0
            ? `Mostrando ${count} tarea${count !== 1 ? 's' : ''}`
            : 'Sin tareas';
    }

    // ── BOTÓN PROFESOR ────────────────────────────────────────────────────────
    function setupProfessorButton() {
        const btn = document.getElementById('professor-btn');
        if (!btn) return;

        btn.addEventListener('click', async () => {
            try {
                const headers = {};
                const token = localStorage.getItem('mirai_auth_token');
                if (token) headers['Authorization'] = `Bearer ${token}`;

                const res = await fetch('/api/check-professor-role', { credentials: 'same-origin', headers });
                const data = await res.json();

                if (data.is_professor) {
                    window.location.href = 'classroom_admin';
                } else {
                    alert('⛔ No tienes acceso al panel de profesor. Contacta al administrador.');
                }
            } catch {
                alert('Error verificando acceso. Inténtalo de nuevo.');
            }
        });
    }

    // ── BOTÓN LOGOUT ──────────────────────────────────────────────────────────
    function setupLogoutButton() {
        const btn = document.getElementById('logout-btn');
        if (!btn) return;

        btn.addEventListener('click', async () => {
            if (!confirm('¿Estás seguro de que deseas cerrar sesión?')) return;
            try {
                await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' });
            } catch (_) { }
            ['mirai_user_dni', 'mirai_user_name', 'mirai_user_role', 'mirai-ai-conversation-id',
                'mirai-ai-course-id', 'mirai-ai-lesson-id'].forEach(k => localStorage.removeItem(k));
            window.location.href = 'login';
        });
    }

    // ── UTILIDAD ──────────────────────────────────────────────────────────────
    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // ── UTILIDADES REALTIME ───────────────────────────────────────────────────
    function flashElement(el) {
        if (!el) return;
        el.classList.remove('rt-updated');
        void el.offsetWidth;
        el.classList.add('rt-updated');
        setTimeout(() => el.classList.remove('rt-updated'), 2000);
    }

    function showToast(message, duration = 4000) {
        if (typeof window.showNotification === 'function') { window.showNotification(message); return; }
        const toast = document.createElement('div');
        toast.textContent = message;
        toast.style.cssText = `
            position:fixed;bottom:3.5rem;right:1.2rem;
            background:var(--glass-bg,rgba(30,30,40,0.95));
            border:1px solid var(--glass-border,rgba(255,255,255,0.1));
            color:var(--text-primary,#fff);padding:0.6rem 1rem;
            border-radius:0.6rem;font-size:0.82rem;z-index:10000;
            backdrop-filter:blur(12px);max-width:280px;
        `;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), duration);
    }

    function initRealtimeClassroom() {
        if (!window.MiraiRealtime) {
            let attempts = 0;
            const wait = setInterval(() => {
                attempts++;
                if (window.MiraiRealtime) { clearInterval(wait); _startRealtimeClassroom(); }
                else if (attempts > 50) { clearInterval(wait); console.warn('[Classroom] mirai-realtime.js no disponible.'); }
            }, 100);
            return;
        }
        _startRealtimeClassroom();
    }

    function _startRealtimeClassroom() {
        const rt = window.MiraiRealtime.getInstance();
        const dni = localStorage.getItem('mirai_user_dni');

        rt.subscribe('classroom', (payload) => {
            const sections = payload.sections || [];
            const assignments = payload.assignments || [];
            const submissions = payload.submissions || [];

            // — Tareas nuevas: recargar lista completa —
            if (assignments.length > 0 && dni) {
                console.log('[RT] Tarea nueva detectada, llamando loadTasks con dni:', dni);
                loadTasks(dni).then(() => {
                    console.log('[RT] loadTasks completado');
                }).catch(err => {
                    console.error('[RT] loadTasks falló:', err);
                });
                return;
            }

            // — Secciones nuevas —
            if (sections.length > 0 && dni) {
                loadTasks(dni);
                return;
            }

            // — Calificaciones actualizadas —
            if (submissions.length > 0) {
                submissions.forEach(sub => {
                    if (sub.status === 'graded' || sub.status === 'reviewed') {
                        const cards = document.querySelectorAll('.task-card');
                        let found = false;
                        cards.forEach(card => {
                            const link = card.querySelector(`a[href*="${sub.assignment_id}"]`);
                            if (link) {
                                found = true;
                                const badge = card.querySelector('.status-badge');
                                if (badge) {
                                    badge.textContent = `Calificado: ${sub.score ?? '—'}`;
                                    badge.className = 'status-badge status-completed';
                                }
                                flashElement(card);
                                showToast(`✅ "${sub.assignment_title}" calificada: ${sub.score ?? 'Sin nota'} pts`);
                            }
                        });
                        if (!found && dni) loadTasks(dni);
                    }
                    if (sub.dispute_status === 'resolved') {
                        showToast(`📋 Disputa resuelta para "${sub.assignment_title}"`);
                        if (dni) loadTasks(dni);
                    }
                });
            }
        });

        rt.start();
    }

})();