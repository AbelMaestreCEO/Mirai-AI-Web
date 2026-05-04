// classroom.js

// --- SOBRECARGA DE FETCH PARA INCLUIR TOKEN (IGUAL QUE EN APP.JS) ---
const originalFetch = window.fetch;
window.fetch = async function (url, options = {}) {
    // Solo agregar token a rutas de API
    if (url.startsWith('/api/') && !url.includes('login') && !url.includes('register')) {
        const token = localStorage.getItem('mirai_auth_token');
        if (token) {
            options.headers = {
                ...options.headers,
                'Authorization': `Bearer ${token}`
            };
        } else {
            // Si no hay token, redirigir a login inmediatamente
            window.location.href = 'login.html';
            return;
        }
    }
    return originalFetch.call(this, url, options);
};

document.addEventListener('DOMContentLoaded', async () => {
    // Verificación de seguridad básica
    const token = localStorage.getItem('mirai_auth_token');
    const dni = localStorage.getItem('mirai_user_dni');
    
    if (!token || !dni) {
        window.location.href = 'login.html';
        return;
    }

    // Inicializar menú móvil
    setupMobileMenu();
    
    // Cargar tareas
    await loadTasks(dni);
    setupLogout();
});

async function loadTasks(userDni) {
    const container = document.getElementById('tasks-container');
    const greeting = document.getElementById('user-greeting');
    
    if (greeting) greeting.textContent = `Hola, ${userDni}`;

    try {
        // La petición ahora llevará el token gracias al override de fetch arriba
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

        // Si no hay asignaciones, mostrar mensaje amigable
        if (!assignments || assignments.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div style="font-size: 3rem; margin-bottom: 10px;">📭</div>
                    <h3>No tienes tareas asignadas</h3>
                    <p>Por ahora no hay ninguna tarea pendiente para ti. ¡Vuelve pronto!</p>
                    <a href="course_category.html" class="btn-primary" style="margin-top: 15px; display:inline-block;">Ver Cursos Disponibles</a>
                </div>
            `;
            // Resetear estadísticas
            document.getElementById('pending-count').textContent = '0';
            document.getElementById('completed-count').textContent = '0';
            document.getElementById('avg-score').textContent = '-';
            return;
        }

        updateStats(assignments, submissions);
        renderTasks(assignments, submissions);

    } catch (error) {
        console.error('Error cargando tareas:', error);
        // Si es un error de red o servidor, mostrar mensaje genérico
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
        const isCompleted = !!submission;
        
        const card = document.createElement('div');
        card.className = `task-card ${isCompleted ? 'completed' : ''}`;
        
        const statusBadge = isCompleted 
            ? `<span class="status-badge status-completed">Entregado</span>`
            : `<span class="status-badge status-pending">Pendiente</span>`;

        card.innerHTML = `
            <div class="task-info">
                <h3>${escapeHtml(assignment.title)}</h3>
                <div class="task-meta">
                    <span>📅 Curso: ${escapeHtml(assignment.course_title || 'General')}</span>
                    ${assignment.due_date ? `<span>🕒 Vence: ${new Date(assignment.due_date).toLocaleDateString()}</span>` : ''}
                    ${isCompleted && submission.score !== null ? `<span>🏆 Nota: ${submission.score}</span>` : ''}
                </div>
                ${assignment.description ? `<p style="margin-top:8px; font-size:0.9rem; color:var(--text-secondary)">${escapeHtml(assignment.description.substring(0, 100))}...</p>` : ''}
            </div>
            <div class="task-actions">
                ${statusBadge}
                <a href="classroom_details.html?id=${assignment.id}" class="btn-primary">
                    ${isCompleted ? 'Ver Detalles' : 'Entregar'}
                </a>
            </div>
        `;
        
        container.appendChild(card);
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

// Al final de classroom.js, antes de setupLogout
document.getElementById('professor-btn')?.addEventListener('click', () => {
    // Verificar si el usuario es profesor (puedes tener un campo 'role' en la tabla users)
    // Por ahora, redirigimos directamente. En producción, verifica el rol en D1.
    const dni = localStorage.getItem('mirai_user_dni');
    // Simulación: Si el DNI empieza con 'PROF', es profesor. O verifica en DB.
    // Aquí redirigimos directo, pero podrías pedir contraseña extra.
    window.location.href = 'classroom_admin.html';
});

function setupLogout() {
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            if(confirm('¿Cerrar sesión?')) {
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

