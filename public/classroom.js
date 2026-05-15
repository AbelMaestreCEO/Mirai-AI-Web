// classroom.js - Versión Unificada de Tema

(function () {
    'use strict';

    // ✅ MiraiApp ya está disponible globalmente

    document.addEventListener('DOMContentLoaded', function () {

        // --- Ejemplo: Abrir el desplegable de Navegación al cargar ---
        MiraiApp.openCollapsible('.collapsible-section:nth-child(1)');

        // --- Ejemplo: Detectar tema actual para ajustar colores de canvas ---
        const theme = MiraiApp.getTheme();
        console.log('Tema actual:', theme);

        // --- Ejemplo: Re-inicializar desplegables si agregaste contenido dinámico ---
        function loadClassroomData() {
            fetch('/api/classroom/tasks')
                .then(res => res.json())
                .then(tasks => {
                    renderTasks(tasks);
                    // Si inyectaste HTML con nuevos collapsibles:
                    MiraiApp.initCollapsibles();
                });
        }

        // --- Ejemplo: Marcar navegación activa manualmente ---
        MiraiApp.setActiveNavByURL();

        // --- Lógica propia del aula ---
        function renderTasks(tasks) {
            const container = document.getElementById('tasks-container');
            if (!container) return;

            container.innerHTML = tasks.map(task => `
                <div class="task-card">
                    <h3>${task.title}</h3>
                    <p>${task.description}</p>
                </div>
            `).join('');
        }

        loadClassroomData();
    });

})();

// --- SOBRECARGA DE FETCH PARA INCLUIR TOKEN ---
const originalFetch = window.fetch;
window.fetch = async function (url, options = {}) {
    if (url.startsWith('/api/') && !url.includes('login') && !url.includes('register')) {
        const token = localStorage.getItem('mirai_auth_token');
        if (token) {
            options.headers = {
                ...options.headers,
                'Authorization': `Bearer ${token}`
            };
        } else {
            window.location.href = 'login.html';
            return;
        }
    }
    return originalFetch.call(this, url, options);
};

// --- FUNCIÓN UNIFICADA DE TEMA (COPIADA DE APP.JS) ---
function initUnifiedTheme() {
    const savedTheme = localStorage.getItem('mirai-ai-theme') || 
                       (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    applyTheme(savedTheme);
}

function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    
    // Sincronizar iconos si existen
    const sunIcon = document.querySelector('.sun-icon');
    const moonIcon = document.querySelector('.moon-icon');
    
    if (sunIcon && moonIcon) {
        if (theme === 'dark') {
            sunIcon.classList.add('hidden');
            moonIcon.classList.remove('hidden');
        } else {
            sunIcon.classList.remove('hidden');
            moonIcon.classList.add('hidden');
        }
    }
}

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    applyTheme(newTheme);
    localStorage.setItem('mirai-ai-theme', newTheme);
}

// --- INICIALIZACIÓN ---
document.addEventListener('DOMContentLoaded', async () => {
    // 1. Inicializar Tema Globalmente
    initUnifiedTheme();

    // 2. Verificación de seguridad básica
    const token = localStorage.getItem('mirai_auth_token');
    const dni = localStorage.getItem('mirai_user_dni');

    if (!token || !dni) {
        window.location.href = 'login.html';
        return;
    }

    // 3. Configurar listeners del tema
    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
        themeToggle.addEventListener('click', toggleTheme);
    }

    // 4. Inicializar menú móvil y cargar tareas
    setupMobileMenu();
    await loadTasks(dni);
    setupLogout();
});

async function loadTasks(userDni) {
    const container = document.getElementById('tasks-container');
    const greeting = document.getElementById('user-greeting');

    if (greeting) greeting.textContent = `Hola, ${userDni}`;

    try {
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
            document.getElementById('pending-count').textContent = '0';
            document.getElementById('completed-count').textContent = '0';
            document.getElementById('avg-score').textContent = '-';
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
    }
}

function updateStats(assignments, submissions) {
    const pending = assignments.filter(a => !submissions.find(s => s.assignment_id === a.id)).length;
    const completed = submissions.length;

    document.getElementById('pending-count').textContent = pending;
    document.getElementById('completed-count').textContent = completed;

    if (completed > 0) {
        const totalScore = submissions.reduce((sum, s) => sum + (s.score || 0), 0);
        const avg = (totalScore / completed).toFixed(1);
        document.getElementById('avg-score').textContent = avg;
    }
}

function renderTasks(assignments, submissions) {
    const container = document.getElementById('tasks-container');
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

    document.querySelectorAll('.btn-learn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const taskId = e.target.dataset.id;
            const taskTitle = e.target.dataset.title;
            window.location.href = `learning_hub.html?task_id=${taskId}&task_title=${encodeURIComponent(taskTitle)}`;
        });
    });
}

function setupMobileMenu() {
    const menuToggle = document.querySelector('.mobile-menu-toggle');
    const closeMenu = document.querySelector('.close-menu');
    const sidebar = document.querySelector('.mobile-sidebar');
    const overlay = document.querySelector('.mobile-overlay');

    if (!menuToggle || !closeMenu || !sidebar || !overlay) return;

    function toggleMenu() {
        const isActive = sidebar.classList.contains('active');
        if (isActive) {
            sidebar.classList.remove('active');
            overlay.classList.remove('active');
            menuToggle.classList.remove('active');
            document.body.style.overflow = '';
        } else {
            sidebar.classList.add('active');
            overlay.classList.add('active');
            menuToggle.classList.add('active');
            document.body.style.overflow = 'hidden';
        }
    }

    menuToggle.addEventListener('click', toggleMenu);
    closeMenu.addEventListener('click', toggleMenu);
    overlay.addEventListener('click', toggleMenu);
}

document.getElementById('professor-btn')?.addEventListener('click', async () => {
    const dni = localStorage.getItem('mirai_user_dni');

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

function setupLogout() {
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            if (confirm('¿Cerrar sesión?')) {
                localStorage.clear();
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