// classroom.js

document.addEventListener('DOMContentLoaded', async () => {
    if (!checkAuth()) return;

    await loadTasks();
    setupLogout();
});

function checkAuth() {
    const token = localStorage.getItem('mirai_auth_token');
    const dni = localStorage.getItem('mirai_user_dni');
    if (!token || !dni) {
        window.location.href = 'login.html';
        return false;
    }
    return true;
}

async function loadTasks() {
    const container = document.getElementById('tasks-container');
    const userDni = localStorage.getItem('mirai_user_dni');

    try {
        const response = await fetch(`/api/my-submissions?user_dni=${userDni}`);
        
        if (!response.ok) throw new Error('Error cargando tareas');
        
        const data = await response.json();
        const { assignments, submissions } = data;

        updateStats(assignments, submissions);
        renderTasks(assignments, submissions);

    } catch (error) {
        console.error(error);
        container.innerHTML = '<div class="error-state">Error al cargar las tareas. Inténtalo de nuevo.</div>';
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

    if (assignments.length === 0) {
        container.innerHTML = '<div class="empty-state">No tienes tareas asignadas por ahora.</div>';
        return;
    }

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
                    <span>📅 Curso: ${escapeHtml(assignment.course_title)}</span>
                    ${assignment.due_date ? `<span>🕒 Vence: ${new Date(assignment.due_date).toLocaleDateString()}</span>` : ''}
                    ${isCompleted && submission.score ? `<span>🏆 Nota: ${submission.score}</span>` : ''}
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

function setupLogout() {
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            localStorage.clear();
            window.location.href = 'login.html';
        });
    }
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}