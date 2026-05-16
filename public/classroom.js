// classroom.js - Versión Limpia (Solo lógica del Aula)
// Depende totalmente de app.js para: Menú, Tema, Fetch, Auth

(function () {
    'use strict';

    document.addEventListener('DOMContentLoaded', async () => {
        // 1. Verificación de seguridad (Usando la lógica global si existe, o local)
        // Nota: app.js ya maneja el redirect si falta token, pero por seguridad aquí:
        const token = localStorage.getItem('mirai_auth_token');
        const dni = localStorage.getItem('mirai_user_dni');

        if (!token || !dni) {
            // Si app.js no ha hecho el redirect aún, lo hacemos aquí
            window.location.href = 'login.html';
            return;
        }

        // 2. Inicializar Lógica Específica del Aula
        await loadTasks(dni);
        
        // 3. Configurar botones específicos del aula
        setupProfessorButton();
        setupLogoutButton();

        // 4. Asegurar que el menú de navegación se vea activo en esta página
        if (typeof MiraiApp !== 'undefined') {
            MiraiApp.setActiveNavByURL();
            
            // Opcional: Si quieres que el menú de "Navegación" esté cerrado al entrar al aula
            // MiraiApp.closeCollapsible('.collapsible-section:nth-child(1)');
        }
    });

    // --- LÓGICA DEL AULA ---

    async function loadTasks(userDni) {
        const container = document.getElementById('tasks-container');
        const greeting = document.getElementById('user-greeting');

        if (greeting) greeting.textContent = `Hola, ${userDni}`;

        try {
            // El fetch global ya inyecta el token gracias a app.js
            const response = await fetch(`/api/my-submissions?user_dni=${userDni}`);

            if (!response.ok) {
                if (response.status === 401) {
                    window.location.href = 'login.html';
                    return;
                }
                throw new Error(`Error HTTP: ${response.status}`);
            }

            const data = await response.json();
            const { assignments, submissions } = data;

            if (!assignments || assignments.length === 0) {
                container.innerHTML = `
                    <div class="empty-state">
                        <div style="font-size: 3rem; margin-bottom: 10px;">📭</div>
                        <h3>No tienes tareas asignadas</h3>
                        <p>Por ahora no hay ninguna tarea pendiente para ti. ¡Vuelve pronto!</p>
                        <a href="course_category.html" class="btn-primary" style="margin-top: 15px; display:inline-block;">Ver Cursos Disponibles</a>
                    </div>
                `;
                updateStats([], []);
                return;
            }

            updateStats(assignments, submissions);
            renderTasks(assignments, submissions);

        } catch (error) {
            console.error('Error cargando tareas:', error);
            container.innerHTML = `
                <div class="empty-state" style="color: var(--error-color);">
                    <div style="font-size: 3rem; margin-bottom: 10px;">⚠️</div>
                    <h3>Error al cargar las tareas</h3>
                    <p>Por favor, intenta de nuevo más tarde.</p>
                </div>
            `;
            updateStats([], []);
        }
    }

    function updateStats(assignments, submissions) {
        const pending = assignments.filter(a => !submissions.find(s => s.assignment_id === a.id)).length;
        const completed = submissions.length;

        const pendingEl = document.getElementById('pending-count');
        const completedEl = document.getElementById('completed-count');
        const avgEl = document.getElementById('avg-score');

        if (pendingEl) pendingEl.textContent = pending;
        if (completedEl) completedEl.textContent = completed;

        if (completed > 0 && avgEl) {
            const totalScore = submissions.reduce((sum, s) => sum + (s.score || 0), 0);
            const avg = (totalScore / completed).toFixed(1);
            avgEl.textContent = avg;
        } else if (avgEl) {
            avgEl.textContent = '-';
        }
    }

    function renderTasks(assignments, submissions) {
        const container = document.getElementById('tasks-container');
        if (!container) return;
        
        container.innerHTML = '';

        assignments.forEach(assignment => {
            const submission = submissions.find(s => s.assignment_id === assignment.id);

            let statusText = 'Pendiente';
            let statusClass = 'status-pending';
            let actionText = 'Entregar';
            let actionHref = `classroom_details.html?id=${assignment.id}`;

            if (submission) {
                if (submission.status === 'pending') {
                    statusText = 'En revisión';
                    statusClass = 'status-pending';
                    actionText = 'Ver Detalles';
                } else if (submission.status === 'completed') {
                    statusText = `Revisado ${submission.score}/${assignment.max_score}`;
                    statusClass = 'status-completed';
                    actionText = 'Ver Detalles';
                }
            }

            const card = document.createElement('div');
            card.className = `task-card ${submission ? 'submitted' : ''}`;

            const learnButtonHtml = `
                <button class="btn-learn" data-id="${assignment.id}" data-title="${escapeHtml(assignment.title)}" title="Prepararte para esta tarea">
                    🧠 Aprender
                </button>
            `;

            card.innerHTML = `
                <div class="task-info">
                    <h3>${escapeHtml(assignment.title)}</h3>
                    <div class="task-meta">
                        <span>📚 Curso: ${escapeHtml(assignment.course_title || 'General')}</span>
                        ${assignment.due_date ? `<span>🕒 Vence: ${new Date(assignment.due_date).toLocaleDateString()}</span>` : ''}
                        ${submission && submission.score !== null ? `<span>🏆 Nota: ${submission.score}</span>` : ''}
                    </div>
                    ${assignment.description ? `<p style="margin-top:8px; font-size:0.9rem; color:var(--text-secondary)">${escapeHtml(assignment.description.substring(0, 100))}...</p>` : ''}
                </div>
                <div class="task-actions">
                    <span class="status-badge ${statusClass}">${statusText}</span>
                    ${learnButtonHtml}
                    <a href="${actionHref}" class="btn-primary">${actionText}</a>
                </div>
            `;

            container.appendChild(card);
        });

        // Delegar eventos a los botones de aprender
        document.querySelectorAll('.btn-learn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const taskId = e.target.dataset.id;
                const taskTitle = e.target.dataset.title;
                window.location.href = `learning_hub.html?task_id=${taskId}&task_title=${encodeURIComponent(taskTitle)}`;
            });
        });
    }

    function setupProfessorButton() {
        const btn = document.getElementById('professor-btn');
        if (!btn) return;

        btn.addEventListener('click', async () => {
            try {
                const checkResponse = await fetch('/api/check-professor-role');
                const checkData = await checkResponse.json();

                if (checkData.is_professor) {
                    window.location.href = 'classroom_admin.html';
                } else {
                    alert('⛔ No tienes acceso al panel de profesor. Contacta al administrador.');
                }
            } catch (error) {
                alert('Error verificando acceso. Inténtalo de nuevo.');
            }
        });
    }

    function setupLogoutButton() {
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            if (confirm('¿Estás seguro de que deseas cerrar sesión?')) {
                try {
                    await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' });
                } catch (e) {}
                localStorage.removeItem('mirai_user_dni');
                localStorage.removeItem('mirai_user_name');
                localStorage.removeItem('mirai-ai-conversation-id');
                localStorage.removeItem('mirai-ai-course-id');
                localStorage.removeItem('mirai-ai-lesson-id');
                window.location.href = 'login.html';
            }
        });
    }
}

    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

})();