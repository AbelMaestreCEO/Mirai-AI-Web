// classroom_details.js - VERSIÓN DEBUG

console.log('🔍 classroom_details.js cargado');

// --- SOBRECARGA DE FETCH ---
const originalFetch = window.fetch;
window.fetch = async function (url, options = {}) {
    console.log('📡 Fetch:', url);
    if (url.startsWith('/api/') && !url.includes('login') && !url.includes('register')) {
        const token = localStorage.getItem('mirai_auth_token');
        console.log('🔐 Token:', token ? 'EXISTS' : 'MISSING');
        if (token) {
            options.headers = {
                ...options.headers,
                'Authorization': `Bearer ${token}`
            };
        } else {
            console.warn('⚠️ Sin token, redirigiendo a login');
            window.location.href = 'login.html';
            return;
        }
    }
    return originalFetch.call(this, url, options);
};

// --- INICIALIZACIÓN ---
document.addEventListener('DOMContentLoaded', async () => {
    console.log('✅ DOMContentLoaded');
    
    const token = localStorage.getItem('mirai_auth_token');
    const dni = localStorage.getItem('mirai_user_dni');
    
    console.log('👤 Token:', token ? 'OK' : 'MISSING');
    console.log('👤 DNI:', dni ? dni : 'MISSING');
    
    if (!token || !dni) {
        console.error('❌ No autenticado');
        window.location.href = 'login.html';
        return;
    }

    setupMobileMenu();
    setupLogout();
    
    console.log('🔄 Cargando detalles de tarea...');
    await loadAssignmentDetails();
});

// --- CARGA DE DATOS ---
async function loadAssignmentDetails() {
    console.log('📥 loadAssignmentDetails iniciado');
    
    const loadingState = document.getElementById('loading-state');
    const errorState = document.getElementById('error-state');
    const taskContent = document.getElementById('task-content');
    const detailContainer = document.getElementById('detail-container');

    console.log('🔍 Elementos encontrados:', {
        loadingState: !!loadingState,
        errorState: !!errorState,
        taskContent: !!taskContent,
        detailContainer: !!detailContainer
    });

    if (loadingState) loadingState.style.display = 'block';
    if (errorState) errorState.style.display = 'none';
    if (taskContent) taskContent.style.display = 'none';

    const urlParams = new URLSearchParams(window.location.search);
    const assignmentId = urlParams.get('id');
    
    console.log('🆔 Assignment ID:', assignmentId);
    
    if (!assignmentId) {
        console.error('❌ ID de tarea no proporcionado');
        showError('ID de tarea no proporcionado. URL: ' + window.location.href);
        return;
    }

    try {
        console.log('📡 Llamando a API...');
        const response = await fetch(`/api/assignment-details?id=${assignmentId}`);
        console.log('📊 Response Status:', response.status);
        
        const data = await response.json();
        console.log('📦 Data recibida:', data);
        
        if (!response.ok) {
            console.error('❌ API Error:', data.error);
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
        const submission = data.submission;

        console.log('📋 Assignment:', assignment);
        console.log('📝 Submission:', submission);

        // Referencias a elementos
        const elements = {
            title: document.getElementById('task-title'),
            course: document.getElementById('task-course'),
            due: document.getElementById('task-due'),
            maxScore: document.getElementById('task-max-score'),
            description: document.getElementById('task-description'),
            status: document.getElementById('task-status'),
            submitSection: document.getElementById('submit-section'),
            evaluateSection: document.getElementById('evaluate-section'),
            feedbackSection: document.getElementById('feedback-section')
        };

        console.log('🔍 Elementos DOM:', elements);

        // Validar elementos esenciales
        const essentialIds = ['task-title', 'task-course', 'task-description', 'task-status'];
        const missingIds = essentialIds.filter(id => !elements[id.toLowerCase().replace('task-', '')]);
        
        if (missingIds.length > 0) {
            console.error('❌ Elementos faltantes:', missingIds);
            showError(`Faltan elementos HTML: ${missingIds.join(', ')}`);
            return;
        }

        // Ocultar loading, mostrar contenido
        if (loadingState) loadingState.style.display = 'none';
        if (taskContent) taskContent.style.display = 'block';

        // Rellenar datos
        elements.title.textContent = assignment.title || 'Sin título';
        elements.course.textContent = assignment.course_title || 'General';
        elements.description.textContent = assignment.description || 'Sin descripción';
        
        if (assignment.due_date) {
            elements.due.textContent = new Date(assignment.due_date).toLocaleDateString('es-ES', {
                day: 'numeric', month: 'long', year: 'numeric'
            });
        } else {
            elements.due.textContent = 'Sin fecha límite';
        }

        if (elements.maxScore) {
            elements.maxScore.textContent = assignment.max_score || 'N/A';
        }

        // Manejar estado de entrega
        handleSubmissionState(submission, assignment, elements);

    } catch (error) {
        console.error('💥 Error en loadAssignmentDetails:', error);
        if (loadingState) loadingState.style.display = 'none';
        if (errorState) {
            errorState.style.display = 'block';
            const msgEl = document.getElementById('error-message');
            if (msgEl) msgEl.textContent = error.message;
        } else {
            showError('Error de conexión: ' + error.message);
        }
    }
}

// --- MANEJO DE ESTADOS ---
function handleSubmissionState(submission, assignment, elements) {
    console.log('🔄 handleSubmissionState:', { submission, assignmentId: assignment.id });

    if (submission) {
        if (submission.status === 'evaluated' || submission.status === 'completed') {
            console.log('✅ Estado: Evaluado');
            elements.status.className = 'status-badge status-evaluated';
            const finalScore = submission.professor_note ?? submission.score;
            elements.status.textContent = `Revisado ${finalScore}/${assignment.max_score}`;
            
            if (elements.feedbackSection) {
                elements.feedbackSection.style.display = 'block';
                renderFeedback(elements.feedbackSection, submission, assignment.max_score);
            }

        } else if (submission.status === 'submitted' || submission.status === 'pending') {
            console.log('⏳ Estado: En revisión');
            elements.status.className = 'status-badge status-submitted';
            elements.status.textContent = 'En revisión';
            
            if (elements.evaluateSection) {
                elements.evaluateSection.style.display = 'block';
                elements.evaluateSection.innerHTML = `
                    <h3 class="section-title">¿Quieres una evaluación rápida?</h3>
                    <p class="section-subtitle">Usa nuestra IA para obtener una calificación preliminar</p>
                    <button id="ai-evaluate-btn" class="btn btn-primary">🤖 Evaluar con IA</button>
                `;
                
                document.getElementById('ai-evaluate-btn').onclick = () => confirmEvaluation(submission.id);
            }
        }
    } else {
        console.log('📤 Estado: Pendiente de entrega');
        elements.status.className = 'status-badge status-pending';
        elements.status.textContent = 'Pendiente';
        
        if (elements.submitSection) {
            elements.submitSection.style.display = 'block';
            renderUploadForm(elements.submitSection, assignment.id);
        }
    }
}

// --- RESTO DE FUNCIONES (sin cambios) ---
function renderUploadForm(container, assignmentId) {
    container.innerHTML = `
        <h3 class="section-title">Entregar Tarea</h3>
        <p class="section-subtitle">Sube tu trabajo en formato PDF (máx. 10MB)</p>
        
        <div class="upload-area" id="upload-area">
            <div class="upload-icon">📤</div>
            <p class="upload-text">Arrastra y suelta archivos aquí</p>
            <p class="upload-hint">o</p>
            
            <div class="file-input-wrapper">
                <button class="btn btn-primary">Seleccionar Archivos</button>
                <input type="file" id="file-input" accept=".pdf,.doc,.docx" multiple>
            </div>

            <div id="file-list" class="file-list"></div>
        </div>

        <div class="response-textarea">
            <textarea id="task-response" placeholder="Escribe tu respuesta o comentarios adicionales..." rows="4"></textarea>
        </div>

        <div class="submit-actions">
            <button id="cancel-submit" class="btn btn-secondary">Cancelar</button>
            <button id="submit-task" class="btn btn-primary">Enviar Tarea</button>
        </div>

        <div id="submit-status" class="status-message"></div>
    `;

    const fileInput = document.getElementById('file-input');
    const submitBtn = document.getElementById('submit-task');
    const uploadArea = document.getElementById('upload-area');
    const fileList = document.getElementById('file-list');

    // Drag & Drop
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        uploadArea.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
        }, false);
    });

    ['dragenter', 'dragover'].forEach(eventName => {
        uploadArea.addEventListener(eventName, () => uploadArea.classList.add('drag-over'), false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        uploadArea.addEventListener(eventName, () => uploadArea.classList.remove('drag-over'), false);
    });

    uploadArea.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        const files = dt.files;
        [...files].forEach(validateAndAddFile);
    }, false);

    fileInput.addEventListener('change', (e) => {
        [...e.target.files].forEach(validateAndAddFile);
    });

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

    submitBtn.addEventListener('click', async () => {
        const files = fileList.querySelectorAll('.file-chip');
        if (files.length === 0) {
            showStatus('Debes seleccionar al menos un archivo', 'error');
            return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = '⏳ Enviando...';

        try {
            const formData = new FormData();
            formData.append('assignment_id', assignmentId);
            
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
            submitBtn.textContent = 'Enviar Tarea';
        }
    });
}

function renderFeedback(container, submission, maxScore) {
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
    `;
}

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

        alert(`✅ Evaluación completada: ${data.score}/${data.max_score}`);
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

function showStatus(message, type) {
    const statusEl = document.getElementById('submit-status');
    if (statusEl) {
        statusEl.textContent = message;
        statusEl.className = `status-message ${type === 'success' ? 'success' : 'error'}`;
        statusEl.style.display = 'block';
    }
}

function showError(message) {
    console.error('❌ showError:', message);
    const container = document.getElementById('detail-container');
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
    
    if (!menuToggle || !closeMenu || !sidebar || !overlay) {
        console.warn('⚠️ Elementos del menú no encontrados');
        return;
    }

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