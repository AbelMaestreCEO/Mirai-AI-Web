// classroom_details.js

// --- SOBRECARGA DE FETCH (IGUAL QUE EN CLASSROOM.JS) ---
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

document.addEventListener('DOMContentLoaded', async () => {
    const token = localStorage.getItem('mirai_auth_token');
    const dni = localStorage.getItem('mirai_user_dni');
    
    if (!token || !dni) {
        window.location.href = 'login.html';
        return;
    }

    await loadAssignmentDetails();
});


async function loadAssignmentDetails() {
    const urlParams = new URLSearchParams(window.location.search);
    const assignmentId = urlParams.get('id');
    
    if (!assignmentId) {
        showError('ID de tarea no proporcionado');
        return;
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

        const assignment = data;
        const submission = data.submission; // Puede ser null

        // ✨ CORRECCIÓN: Verificar existencia de elementos antes de usarlos
        const titleEl = document.getElementById('task-title');
        const courseEl = document.getElementById('task-course');
        const dueEl = document.getElementById('task-due');
        const maxScoreEl = document.getElementById('task-max-score');
        const descEl = document.getElementById('task-description');
        const statusBadge = document.getElementById('task-status');
        const submitSection = document.getElementById('submit-section');
        const evaluateSection = document.getElementById('evaluate-section');
        const feedbackSection = document.getElementById('feedback-section');

        if (!titleEl || !courseEl || !descEl || !statusBadge) {
            console.error('Faltan elementos HTML esenciales. Verifica classroom_details.html');
            showError('Error de estructura en la página.');
            return;
        }

        // Rellenar datos básicos
        titleEl.textContent = assignment.title;
        courseEl.textContent = assignment.course_title || 'General';
        descEl.textContent = assignment.description || 'Sin descripción';
        
        if (assignment.due_date) {
            dueEl.textContent = new Date(assignment.due_date).toLocaleDateString();
        } else {
            dueEl.textContent = 'Sin fecha límite';
        }

        if (maxScoreEl) {
            maxScoreEl.textContent = assignment.max_score || 'N/A';
        }

        // Limpiar secciones dinámicas
        if (submitSection) submitSection.innerHTML = '';
        if (evaluateSection) evaluateSection.innerHTML = '';
        if (feedbackSection) feedbackSection.innerHTML = '';

        // --- LÓGICA DE ESTADOS ---
        if (submission) {
            if (submission.status === 'completed') {
                // CASO: Evaluado
                statusBadge.className = 'status-badge status-completed';
                statusBadge.textContent = `Revisado ${submission.score}/${assignment.max_score}`;
                
                if (feedbackSection) {
                    feedbackSection.style.display = 'block';
                    let feedbackText = 'Sin retroalimentación.';
                    try {
                        if (submission.feedback) {
                            // Si es string JSON, parsearlo; si ya es objeto, usarlo
                            feedbackText = typeof submission.feedback === 'string' 
                                ? JSON.parse(submission.feedback) 
                                : submission.feedback;
                        }
                    } catch (e) {
                        feedbackText = submission.feedback || 'Sin retroalimentación.';
                    }
                    
                    feedbackSection.innerHTML = `
                        <h4 style="margin-top:0; color:#2e7d32;">Retroalimentación del Profesor IA:</h4>
                        <p>${feedbackText}</p>
                    `;
                }

            } else if (submission.status === 'pending') {
                // CASO: Entregado, en revisión
                statusBadge.className = 'status-badge status-pending';
                statusBadge.textContent = 'En revisión';
                
                // Verificar si es profesor para mostrar botón de evaluar
                const isProfessor = await checkIfUserIsProfessor();
                if (isProfessor && evaluateSection) {
                    evaluateSection.style.display = 'block';
                    const btn = document.createElement('button');
                    btn.className = 'btn-primary';
                    btn.textContent = '🤖 Evaluar con IA';
                    btn.onclick = () => startEvaluation(submission.id);
                    evaluateSection.appendChild(btn);
                }
            }
        } else {
            // CASO: No ha entregado
            statusBadge.className = 'status-badge status-pending';
            statusBadge.textContent = 'Pendiente';
            
            if (submitSection) {
                submitSection.style.display = 'block';
                submitSection.innerHTML = `
                    <form id="upload-form" enctype="multipart/form-data">
                        <div class="form-group" style="margin-bottom: 15px;">
                            <label style="display:block; margin-bottom:5px; font-weight:bold;">Sube tu trabajo (PDF):</label>
                            <input type="file" id="file-input" accept=".pdf" class="form-control" style="width:100%; padding:8px;" required>
                        </div>
                        <button type="submit" class="btn-primary">Entregar Trabajo</button>
                    </form>
                `;

                document.getElementById('upload-form').addEventListener('submit', async (e) => {
                    e.preventDefault();
                    const fileInput = document.getElementById('file-input');
                    const file = fileInput.files[0];

                    if (!file) {
                        alert('Por favor selecciona un archivo.');
                        return;
                    }

                    if (file.type !== 'application/pdf') {
                        alert('Solo se permiten archivos PDF.');
                        return;
                    }

                    const formData = new FormData();
                    formData.append('file', file);
                    formData.append('assignment_id', assignmentId);

                    try {
                        const uploadResponse = await fetch('/api/submit-assignment', {
                            method: 'POST',
                            body: formData
                        });

                        if (!uploadResponse.ok) {
                            const err = await uploadResponse.json();
                            throw new Error(err.error || 'Error al subir');
                        }

                        alert('✅ Trabajo entregado correctamente. Está en revisión.');
                        window.location.reload();
                    } catch (error) {
                        alert('❌ Error: ' + error.message);
                    }
                });
            }
        }

    } catch (error) {
        console.error('Error cargando detalles:', error);
        showError('Error de conexión. Intenta de nuevo.');
    }
}

async function checkIfUserIsProfessor() {
    try {
        const response = await fetch('/api/check-professor-role');
        const data = await response.json();
        return data.is_professor;
    } catch (error) {
        return false;
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

        alert(`✅ Evaluación completada: ${data.score}/${data.max_score}\n\n${data.feedback}`);
        window.location.reload();

    } catch (error) {
        console.error('Error:', error);
        alert('❌ Error al evaluar: ' + error.message);
        btn.disabled = false;
        btn.textContent = '🤖 Evaluar con IA';
    }
}
function showError(message) {
    const container = document.querySelector('.classroom-container');
    if (container) {
        container.innerHTML = `
            <div class="empty-state" style="color: var(--error-color); text-align: center; padding: 40px;">
                <div style="font-size: 3rem; margin-bottom: 10px;">⚠️</div>
                <h3>Error</h3>
                <p>${message}</p>
                <a href="classroom.html" class="btn-primary" style="margin-top: 15px; display:inline-block;">Volver a Tareas</a>
            </div>
        `;
    } else {
        alert(message);
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