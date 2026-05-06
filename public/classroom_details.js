// classroom_details.js

// --- SOBRECARGA DE FETCH (IGUAL QUE EN CLASSROOM.JS) ---
const originalFetch = window.fetch;
window.fetch = async function (url, options = {}) {
    if (url.startsWith('/api/') && !url.includes('login') && !url.includes('register')) {
        const token = localStorage.getItem('mirai_auth_token');
        if (token) {
            options.headers = { ...options.headers, 'Authorization': `Bearer ${token}` };
        } else {
            window.location.href = 'login.html';
            return;
        }
    }
    return originalFetch.call(this, url, options);
};

document.addEventListener('DOMContentLoaded', async () => {
    const token = localStorage.getItem('mirai_auth_token');
    if (!token) {
        window.location.href = 'login.html';
        return;
    }

    setupMobileMenu(); // Inicializar menú
    setupLogout();

    const urlParams = new URLSearchParams(window.location.search);
    const assignmentId = urlParams.get('id');

    if (!assignmentId) {
        alert('ID de tarea no válido');
        window.location.href = 'classroom.html';
        return;
    }

    await loadAssignmentDetails();
    setupFileUpload(assignmentId);
});

async function loadAssignmentDetails() {
    const urlParams = new URLSearchParams(window.location.search);
    const assignmentId = urlParams.get('id');

    if (!assignmentId) {
        showError('ID de tarea no proporcionado');
        return;
    }
    if (submission && submission.status === 'completed') {
        statusBadge.className = 'status-badge status-completed';
        statusBadge.textContent = `Revisado ${submission.score}/${assignment.max_score}`;

        // Mostrar feedback si existe
        if (submission.feedback) {
            const feedbackDiv = document.createElement('div');
            feedbackDiv.className = 'feedback-box';
            feedbackDiv.innerHTML = `
            <h4>Retroalimentación del Profesor IA:</h4>
            <p>${JSON.parse(submission.feedback)}</p>
        `;
            container.appendChild(feedbackDiv);
        }
    } else if (submission && submission.status === 'pending') {
        statusBadge.className = 'status-badge status-pending';
        statusBadge.textContent = 'En revisión';

        // Mostrar botón de evaluar (solo para profesores)
        const evaluateBtn = document.createElement('button');
        evaluateBtn.className = 'btn-primary';
        evaluateBtn.textContent = '🤖 Evaluar con IA';
        evaluateBtn.onclick = () => startEvaluation(submission.id);
        container.appendChild(evaluateBtn);
    }
    try {
        const response = await fetch(`/api/assignment-details?id=${assignmentId}`);
        const data = await response.json();

        if (!response.ok) {
            if (response.status === 404) {
                showError('Esta tarea no está disponible para ti o no existe.');
            } else if (response.status === 401) {
                window.location.href = 'login.html';
            } else {
                showError(data.error || 'Error al cargar los detalles');
            }
            return;
        }

        // ... resto del código para renderizar ...
    } catch (error) {
        console.error('Error cargando detalles:', error);
        showError('Error de conexión. Intenta de nuevo.');
    }
}

async function startEvaluation(submissionId) {
    const btn = event.target;
    btn.disabled = true;
    btn.textContent = '⏳ Evaluando...';

    try {
        const response = await fetch('/api/evaluate-submission', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ submission_id: submissionId })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Error al evaluar');
        }

        // Actualizar la interfaz con los resultados
        alert(`✅ Evaluación completada: ${data.score}/${data.max_score}\n\n${data.feedback}`);
        
        // Recargar la página para ver el estado actualizado
        window.location.reload();

    } catch (error) {
        console.error('Error:', error);
        alert('❌ Error al evaluar: ' + error.message);
        btn.disabled = false;
        btn.textContent = '🤖 Evaluar con IA';
    }
}

function setupFileUpload(assignmentId) {
    const fileInput = document.getElementById('file-input');
    const fileNameDisplay = document.getElementById('file-name-display');
    const statusMsg = document.getElementById('upload-status');

    fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (file.type !== 'application/pdf') {
            alert('Solo se permiten archivos PDF');
            fileInput.value = '';
            return;
        }

        if (file.size > 10 * 1024 * 1024) {
            alert('El archivo no puede superar los 10MB');
            fileInput.value = '';
            return;
        }

        fileNameDisplay.textContent = `Archivo seleccionado: ${file.name}`;
        statusMsg.style.display = 'none';

        const formData = new FormData();
        formData.append('file', file);
        formData.append('assignment_id', assignmentId);

        try {
            statusMsg.textContent = 'Subiendo...';
            statusMsg.className = 'status-message';
            statusMsg.style.display = 'block';

            const response = await fetch('/api/submit-assignment', { method: 'POST', body: formData });
            const result = await response.json();

            if (response.ok) {
                statusMsg.textContent = '✅ ¡Entrega exitosa!';
                statusMsg.className = 'status-message status-success';
                setTimeout(() => window.location.reload(), 2000);
            } else {
                throw new Error(result.error || 'Error al entregar');
            }
        } catch (error) {
            console.error(error);
            statusMsg.textContent = `❌ Error: ${error.message}`;
            statusMsg.className = 'status-message status-error';
        }
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
            sidebar.classList.remove('active'); overlay.classList.remove('active');
            menuToggle.classList.remove('active'); document.body.style.overflow = '';
        } else {
            sidebar.classList.add('active'); overlay.classList.add('active');
            menuToggle.classList.add('active'); document.body.style.overflow = 'hidden';
        }
    }
    menuToggle.addEventListener('click', toggleMenu);
    closeMenu.addEventListener('click', toggleMenu);
    overlay.addEventListener('click', toggleMenu);
}

function setupLogout() {
    const btn = document.getElementById('logout-btn');
    if (btn) btn.addEventListener('click', () => { localStorage.clear(); window.location.href = 'login.html'; });
}