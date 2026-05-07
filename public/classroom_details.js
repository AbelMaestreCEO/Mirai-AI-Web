// classroom_details.js

// --- SOBRECARGA DE FETCH (Autenticación Global) ---
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

// --- INICIALIZACIÓN ---
document.addEventListener('DOMContentLoaded', async () => {
    const token = localStorage.getItem('mirai_auth_token');
    const dni = localStorage.getItem('mirai_user_dni');
    
    if (!token || !dni) {
        window.location.href = 'login.html';
        return;
    }

    // Inicializar componentes UI
    setupMobileMenu();
    setupLogout();
    
    // Cargar datos de la tarea
    await loadAssignmentDetails();
});

// --- CARGA DE DATOS ---
async function loadAssignmentDetails() {
    const loadingState = document.getElementById('loading-state');
    const errorState = document.getElementById('error-state');
    const contentContainer = document.querySelector('.detail-container');

    if (loadingState) loadingState.style.display = 'block';

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

        // Referencias a elementos del DOM
        const titleEl = document.getElementById('task-title');
        const courseEl = document.getElementById('task-course');
        const dueEl = document.getElementById('task-due');
        const maxScoreEl = document.getElementById('task-max-score');
        const descEl = document.getElementById('task-description');
        const statusBadge = document.getElementById('task-status');
        
        const submitSection = document.getElementById('submit-section');
        const evaluateSection = document.getElementById('evaluate-section');
        const feedbackSection = document.getElementById('feedback-section');
        const disputeSection = document.getElementById('dispute-section');

        // Validar elementos esenciales
        if (!titleEl || !courseEl || !descEl || !statusBadge) {
            console.error('Faltan elementos HTML esenciales');
            showError('Error de estructura en la página.');
            return;
        }

        // Ocultar loading
        if (loadingState) loadingState.style.display = 'none';

        // Rellenar datos básicos
        titleEl.textContent = assignment.title;
        courseEl.textContent = assignment.course_title || 'General';
        descEl.textContent = assignment.description || 'Sin descripción';
        
        if (assignment.due_date) {
            dueEl.textContent = new Date(assignment.due_date).toLocaleDateString('es-ES', {
                day: 'numeric', month: 'long', year: 'numeric'
            });
        } else {
            dueEl.textContent = 'Sin fecha límite';
        }

        if (maxScoreEl) {
            maxScoreEl.textContent = assignment.max_score || 'N/A';
        }

        // --- LÓGICA DE ESTADOS ---
        handleSubmissionState(submission, assignment, submitSection, evaluateSection, feedbackSection, disputeSection);

    } catch (error) {
        console.error('Error cargando detalles:', error);
        if (loadingState) loadingState.style.display = 'none';
        if (errorState) {
            errorState.style.display = 'block';
            document.getElementById('error-message').textContent = error.message;
        } else {
            showError('Error de conexión. Intenta de nuevo.');
        }
    }
}

// --- MANEJO DE ESTADOS DE ENTREGA ---
function handleSubmissionState(submission, assignment, submitSection, evaluateSection, feedbackSection, disputeSection) {
    const statusBadge = document.getElementById('task-status');

    if (submission) {
        if (submission.status === 'evaluated' || submission.status === 'completed') {
            // CASO: Evaluado
            statusBadge.className = 'status-badge status-evaluated';
            const finalScore = submission.professor_note ?? submission.score;
            statusBadge.textContent = `Revisado ${finalScore}/${assignment.max_score}`;
            
            if (feedbackSection) {
                feedbackSection.style.display = 'block';
                renderFeedback(feedbackSection, submission, assignment.max_score, disputeSection);
            }

        } else if (submission.status === 'submitted' || submission.status === 'pending') {
            // CASO: Entregado, en revisión
            statusBadge.className = 'status-badge status-submitted';
            statusBadge.textContent = 'En revisión';
            
            // Botón para evaluar con IA (si el estudiante quiere acelerar)
            if (evaluateSection) {
                evaluateSection.style.display = 'block';
                evaluateSection.innerHTML = `
                    <h3 class="section-title">¿Quieres una evaluación rápida?</h3>
                    <p class="section-subtitle">Usa nuestra IA para obtener una calificación preliminar</p>
                    <button id="ai-evaluate-btn" class="btn btn-primary">
                        🤖 Evaluar con IA
                    </button>
                `;
                
                document.getElementById('ai-evaluate-btn').onclick = () => confirmEvaluation(submission.id);
            }
        }
    } else {
        // CASO: No ha entregado
        statusBadge.className = 'status-badge status-pending';
        statusBadge.textContent = 'Pendiente';
        
        if (submitSection) {
            submitSection.style.display = 'block';
            renderUploadForm(submitSection, assignment.id);
        }
    }
}

// --- RENDERIZADO DE FORMULARIO DE SUBIDA ---
function renderUploadForm(container, assignmentId) {
    container.innerHTML = `
        <h3 class="section-title">Entregar Tarea</h3>
        <p class="section-subtitle">Sube tu trabajo en formato PDF (máx. 10MB)</p>
        
        <div class="upload-area" id="upload-area">
            <div class="upload-icon">📤</div>
            <p class="upload-text">Arrastra y suelta archivos aquí</p>
            <p class="upload-hint">o</p>
            
            <div class="file-input-wrapper">
                <button class="btn btn-primary">
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                        <path d="M9 16h6v-6h4l-7-7-7 7h4zm-4 2h14v2H5z"/>
                    </svg>
                    Seleccionar Archivos
                </button>
                <input type="file" id="file-input" accept=".pdf,.doc,.docx" multiple>
            </div>

            <div id="file-list" class="file-list"></div>
        </div>

        <div class="response-textarea">
            <textarea id="task-response" placeholder="Escribe tu respuesta o comentarios adicionales..." rows="4"></textarea>
        </div>

        <div class="submit-actions">
            <button id="cancel-submit" class="btn btn-secondary">Cancelar</button>
            <button id="submit-task" class="btn btn-primary">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                    <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
                </svg>
                Enviar Tarea
            </button>
        </div>

        <div id="submit-status" class="status-message"></div>
    `;

    // Event Listeners
    const fileInput = document.getElementById('file-input');
    const submitBtn = document.getElementById('submit-task');
    const uploadArea = document.getElementById('upload-area');
    const fileList = document.getElementById('file-list');

    // Drag & Drop
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        uploadArea.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    ['dragenter', 'dragover'].forEach(eventName => {
        uploadArea.addEventListener(eventName, () => uploadArea.classList.add('drag-over'), false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        uploadArea.addEventListener(eventName, () => uploadArea.classList.remove('drag-over'), false);
    });

    uploadArea.addEventListener('drop', handleDrop, false);

    function handleDrop(e) {
        const dt = e.dataTransfer;
        const files = dt.files;
        handleFiles(files);
    }

    fileInput.addEventListener('change', (e) => handleFiles(e.target.files));

    function handleFiles(files) {
        fileList.innerHTML = '';
        [...files].forEach(validateAndAddFile);
    }

    function validateAndAddFile(file) {
        if (file.size > 10 * 1024 * 1024) {
            alert(`El archivo ${file.name} supera los 10MB`);
            return;
        }
        
        const chip = document.createElement('div');
        chip.className = 'file-chip';
        chip.innerHTML = `
            <span class="attachment-icon">📄</span>
            <span class="attachment-name">${file.name}</span>
            <span class="attachment-remove" onclick="this.parentElement.remove()">×</span>
        `;
        fileList.appendChild(chip);
    }

    // Submit
    submitBtn.addEventListener('click', async () => {
        const files = fileList.querySelectorAll('.file-chip');
        if (files.length === 0) {
            showStatus('Debes seleccionar al menos un archivo', 'error');
            return;
        }

        submitBtn.disabled = true;
        submitBtn.innerHTML = '⏳ Enviando...';

        try {
            const formData = new FormData();
            formData.append('assignment_id', assignmentId);
            
            // Nota: Necesitas ajustar esto según cómo manejes múltiples archivos en tu backend
            const fileInput = document.getElementById('file-input');
            if (fileInput.files.length > 0) {
                formData.append('file', fileInput.files[0]);
            }

            const response = await fetch('/api/submit-assignment', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || 'Error al entregar');
            }

            showStatus('✅ Trabajo entregado correctamente', 'success');
            setTimeout(() => window.location.reload(), 1500);

        } catch (error) {
            showStatus(`❌ Error: ${error.message}`, 'error');
            submitBtn.disabled = false;
            submitBtn.innerHTML = `
                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                    <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
                </svg>
                Enviar Tarea
            `;
        }
    });
}

// --- RENDERIZADO DE FEEDBACK ---
function renderFeedback(container, submission, maxScore, disputeContainer) {
    let feedbackText = 'Sin retroalimentación.';
    
    try {
        if (submission.feedback) {
            const fb = typeof submission.feedback === 'string' 
                ? JSON.parse(submission.feedback) 
                : submission.feedback;
            
            let formattedFeedback = '<div class="feedback-content">';
            for (const [key, value] of Object.entries(fb)) {
                if (key !== 'general' && value) {
                    formattedFeedback += `
                        <div style="margin-bottom:12px;">
                            <strong style="color:var(--accent-primary);">${key.replace(/_/g, ' ').toUpperCase()}:</strong>
                            <span style="color:var(--text-secondary);">${value}</span>
                        </div>
                    `;
                }
            }
            if (fb.general) {
                formattedFeedback += `<p style="margin-top:16px;"><strong>Resumen General:</strong> ${fb.general}</p>`;
            }
            formattedFeedback += '</div>';
            feedbackText = formattedFeedback;
        }
    } catch (e) {
        feedbackText = submission.feedback || 'Sin retroalimentación.';
    }
    
    container.innerHTML = `
        <div class="feedback-header">
            <span class="feedback-icon">✅</span>
            <h2 class="section-title">Tarea Evaluada</h2>
        </div>

        <div class="feedback-score">
            <span class="score-label">Tu Puntuación</span>
            <span class="score-value">${submission.professor_note ?? submission.score}</span>
            <span class="score-max">/ ${maxScore}</span>
        </div>

        ${feedbackText}

        <div id="dispute-section-inner" class="dispute-box" style="display: ${submission.dispute_status ? 'none' : 'flex'}">
            <p class="dispute-text">¿No estás de acuerdo con la evaluación?</p>
            <button id="dispute-btn" class="btn btn-secondary">Solicitar Revisión</button>
        </div>
    `;

    // Manejar disputa
    const disputeInner = document.getElementById('dispute-section-inner');
    if (disputeInner && !submission.dispute_status) {
        document.getElementById('dispute-btn').onclick = () => openDisputeModal(submission.id, maxScore);
    } else if (disputeInner && submission.dispute_status === 'pending') {
        disputeInner.innerHTML = '<p style="color:#ff9800; font-weight:bold;">⚠️ Tu disputa está en revisión.</p>';
    } else if (disputeInner && submission.dispute_status === 'resolved') {
        disputeInner.innerHTML = '<p style="color:#4caf50; font-weight:bold;">✅ Tu disputa ha sido resuelta.</p>';
    }
}

// --- EVALUACIÓN CON IA ---
function confirmEvaluation(submissionId) {
    const criteria = [
        "Cumplimiento de normas APA 7ma edición",
        "Escrito en tercera persona",
        "Uso adecuado de conectores lógicos",
        "Tablas y figuras etiquetadas correctamente",
        "Originalidad del contenido",
        "Coherencia y estructura lógica",
        "Profundidad en el análisis"
    ];

    const message = "La IA evaluará tu trabajo basándose en los siguientes criterios:\n\n" + 
                    criteria.map((c, i) => `${i+1}. ${c}`).join('\n') + 
                    "\n\n¿Deseas proceder?";

    if (confirm(message)) {
        startEvaluation(submissionId);
    }
}

async function startEvaluation(submissionId) {
    const btn = document.getElementById('ai-evaluate-btn');
    if (btn) {
        btn.disabled = true;
        btn.textContent = '⏳ Evaluando...';
    }

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

        alert(`✅ Evaluación completada: ${data.score}/${data.max_score}\n\nRevisa los resultados abajo.`);
        window.location.reload();

    } catch (error) {
        console.error('Error:', error);
        alert('❌ Error al evaluar: ' + error.message);
        if (btn) {
            btn.disabled = false;
            btn.textContent = '🤖 Evaluar con IA';
        }
    }
}

// --- DISPUTA DE NOTA ---
function openDisputeModal(submissionId, maxScore) {
    const reason = prompt("Explica por qué no estás conforme con tu nota (máx. 500 caracteres):");
    
    if (!reason || reason.trim() === '') {
        alert("Debes proporcionar un motivo.");
        return;
    }

    if (reason.length > 500) {
        alert("El motivo no puede superar los 500 caracteres.");
        return;
    }

    submitDispute(submissionId, reason);
}

async function submitDispute(submissionId, reason) {
    try {
        const response = await fetch('/api/dispute-grade', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ submission_id: submissionId, reason: reason })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Error al registrar disputa');
        }

        alert('✅ Disputa registrada. El profesor revisará tu caso.');
        window.location.reload();

    } catch (error) {
        console.error('Error:', error);
        alert('❌ Error al registrar disputa: ' + error.message);
    }
}

// --- UTILIDADES ---
function showStatus(message, type) {
    const statusEl = document.getElementById('submit-status');
    if (statusEl) {
        statusEl.textContent = message;
        statusEl.className = `status-message ${type === 'success' ? 'success' : 'error'}`;
        statusEl.style.display = 'block';
    }
}

function showError(message) {
    const container = document.querySelector('.detail-container');
    if (container) {
        container.innerHTML = `
            <div class="error-state">
                <div class="error-icon">⚠️</div>
                <h3>Error</h3>
                <p>${message}</p>
                <a href="classroom.html" class="btn btn-primary" style="margin-top: 15px; display:inline-block;">Volver a Tareas</a>
            </div>
        `;
    } else {
        alert(message);
    }
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

function setupLogout() {
    const btn = document.getElementById('logout-btn');
    if (btn) {
        btn.addEventListener('click', () => { 
            localStorage.clear(); 
            window.location.href = 'login.html'; 
        });
    }
}