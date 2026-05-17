// classroom.js - Versión Corregida
// Depende de app.js para: Menú, Tema.
// La autenticación la maneja auth-guard.js (verifica mirai_user_dni).

(function () {
    'use strict';

    document.addEventListener('DOMContentLoaded', async () => {
        // Auth: solo verificar DNI (token es opcional / HttpOnly cookie)
        // auth-guard.js ya redirigió si no hay DNI, pero por doble seguridad:
        const dni = localStorage.getItem('mirai_user_dni');
        if (!dni) {
            window.location.replace('login.html');
            return;
        }

        // Inicializar Lógica del Aula
        await loadTasks(dni);
        setupProfessorButton();
        setupLogoutButton();

        if (typeof MiraiApp !== 'undefined') {
            MiraiApp.setActiveNavByURL();
        }
    });

    // ── CARGAR TAREAS ─────────────────────────────────────────────────────────
    async function loadTasks(userDni) {
        const container = document.getElementById('tasks-container');
        const greeting  = document.getElementById('user-greeting');

        if (greeting) greeting.textContent = `Hola, ${userDni}`;

        try {
            // Intentar con token si existe; si no, confiar en cookie HttpOnly
            const headers = { 'Content-Type': 'application/json' };
            const token = localStorage.getItem('mirai_auth_token');
            if (token) headers['Authorization'] = `Bearer ${token}`;

            const response = await fetch(`/api/my-submissions?user_dni=${encodeURIComponent(userDni)}`, {
                method: 'GET',
                credentials: 'same-origin', // envía cookies HttpOnly automáticamente
                headers
            });

            if (!response.ok) {
                if (response.status === 401) {
                    // Sesión expirada en servidor: mostrar mensaje, no redirigir en loop
                    if (container) container.innerHTML = `
                        <div class="empty-state">
                            <div style="font-size:3rem;margin-bottom:10px">⚠️</div>
                            <h3>Sesión expirada</h3>
                            <p>Por favor, <a href="login.html">inicia sesión de nuevo</a>.</p>
                        </div>`;
                    return;
                }
                throw new Error(`Error HTTP: ${response.status}`);
            }

            const data = await response.json();
            const { assignments, submissions } = data;

            // Actualizar contadores
            updateStats(assignments, submissions);

            if (!assignments || assignments.length === 0) {
                if (container) container.innerHTML = `
                    <div class="empty-state">
                        <div style="font-size:3rem;margin-bottom:10px">📭</div>
                        <h3>No tienes tareas asignadas</h3>
                        <p>Por ahora no hay ninguna tarea pendiente para ti.</p>
                    </div>`;
                return;
            }

            renderTasks(container, assignments, submissions);

        } catch (error) {
            console.error('Error cargando tareas:', error);
            if (container) container.innerHTML = `
                <div class="empty-state">
                    <div style="font-size:3rem;margin-bottom:10px">❌</div>
                    <h3>Error cargando tareas</h3>
                    <p>${escapeHtml(error.message)}</p>
                </div>`;
        }
    }

    function updateStats(assignments, submissions) {
        if (!assignments) return;
        const subMap = {};
        if (submissions) submissions.forEach(s => { subMap[s.assignment_id] = s; });

        let pending = 0, completed = 0, totalScore = 0, scoredCount = 0;
        assignments.forEach(a => {
            const sub = subMap[a.id];
            if (sub && sub.score !== null) {
                completed++;
                totalScore += sub.score;
                scoredCount++;
            } else {
                pending++;
            }
        });

        const pendEl   = document.getElementById('pending-count');
        const compEl   = document.getElementById('completed-count');
        const avgEl    = document.getElementById('avg-score');
        if (pendEl)  pendEl.textContent  = pending;
        if (compEl)  compEl.textContent  = completed;
        if (avgEl)   avgEl.textContent   = scoredCount > 0 ? (totalScore / scoredCount).toFixed(1) : '-';
    }

    function renderTasks(container, assignments, submissions) {
        container.innerHTML = '';
        const subMap = {};
        if (submissions) submissions.forEach(s => { subMap[s.assignment_id] = s; });

        assignments.forEach(assignment => {
            const submission = subMap[assignment.id];
            const card = document.createElement('div');
            card.className = 'task-card';

            let statusText  = 'Pendiente';
            let statusClass = 'status-pending';
            let actionText  = 'Ver Tarea';
            let actionHref  = `classroom_details.html?id=${assignment.id}`;

            if (submission) {
                if (submission.score !== null) {
                    statusText  = `Calificado: ${submission.score}`;
                    statusClass = 'status-completed';
                } else {
                    statusText  = 'Entregado';
                    statusClass = 'status-completed';
                    actionText  = 'Ver Entrega';
                }
                card.classList.add('completed');
            }

            card.innerHTML = `
                <div class="task-info">
                    <h3>${escapeHtml(assignment.title)}</h3>
                    <div class="task-meta">
                        <span>📚 Curso: ${escapeHtml(assignment.course_title || 'General')}</span>
                        ${assignment.due_date ? `<span>🕒 Vence: ${new Date(assignment.due_date).toLocaleDateString()}</span>` : ''}
                        ${submission && submission.score !== null ? `<span>🏆 Nota: ${submission.score}</span>` : ''}
                    </div>
                    ${assignment.description ? `<p style="margin-top:8px;font-size:.9rem;color:var(--text-secondary)">${escapeHtml(assignment.description.substring(0, 100))}...</p>` : ''}
                </div>
                <div class="task-actions">
                    <span class="status-badge ${statusClass}">${statusText}</span>
                    <button class="btn-learn" data-id="${assignment.id}" data-title="${escapeHtml(assignment.title)}" title="Prepararte para esta tarea">🧠 Aprender</button>
                    <a href="${actionHref}" class="btn-primary">${actionText}</a>
                </div>`;

            container.appendChild(card);
        });

        document.querySelectorAll('.btn-learn').forEach(btn => {
            btn.addEventListener('click', e => {
                const id    = e.currentTarget.dataset.id;
                const title = e.currentTarget.dataset.title;
                window.location.href = `learning_hub.html?task_id=${id}&task_title=${encodeURIComponent(title)}`;
            });
        });
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

                const res  = await fetch('/api/check-professor-role', { credentials: 'same-origin', headers });
                const data = await res.json();

                if (data.is_professor) {
                    window.location.href = 'classroom_admin.html';
                } else {
                    alert('⛔ No tienes acceso al panel de profesor. Contacta al administrador.');
                }
            } catch (error) {
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
            } catch (_) {}
            localStorage.removeItem('mirai_user_dni');
            localStorage.removeItem('mirai_user_name');
            localStorage.removeItem('mirai-ai-conversation-id');
            localStorage.removeItem('mirai-ai-course-id');
            localStorage.removeItem('mirai-ai-lesson-id');
            window.location.href = 'login.html';
        });
    }

    // ── UTILIDAD ──────────────────────────────────────────────────────────────
    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

})();