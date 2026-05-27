// classroom_details.js - Versión Unificada de Tema

console.log('🔍 classroom_details.js cargado');

// --- INICIALIZACIÓN ---
document.addEventListener('DOMContentLoaded', async () => {
    console.log('✅ DOMContentLoaded');

    const dni = localStorage.getItem('mirai_user_dni');

    if (!dni) {
        window.location.href = 'login';
        return;
    }

    // Delegar Tema y Menú a MiraiApp
    if (typeof MiraiApp !== 'undefined') {
        // MiraiApp ya maneja el tema y el menú
        const themeToggle = document.getElementById('theme-toggle');
        if (themeToggle && !themeToggle.dataset.initialized) {
            themeToggle.addEventListener('click', () => {
                const current = document.documentElement.getAttribute('data-theme');
                const newTheme = current === 'light' ? 'dark' : 'light';
                document.documentElement.setAttribute('data-theme', newTheme);
                localStorage.setItem('mirai-ai-theme', newTheme);
                const sun = document.querySelector('.sun-icon');
                const moon = document.querySelector('.moon-icon');
                if (sun && moon) {
                    if (newTheme === 'dark') { sun.classList.add('hidden'); moon.classList.remove('hidden'); }
                    else { sun.classList.remove('hidden'); moon.classList.add('hidden'); }
                }
                themeToggle.dataset.initialized = 'true';
            });
        }
    } else {
        initLocalTheme();
    }

    setupLogout();
    await loadAssignmentDetails();
});

function initLocalTheme() {
    const savedTheme = localStorage.getItem('mirai-ai-theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', savedTheme);
    const sun = document.querySelector('.sun-icon');
    const moon = document.querySelector('.moon-icon');
    if (sun && moon) {
        if (savedTheme === 'dark') { sun.classList.add('hidden'); moon.classList.remove('hidden'); }
        else { sun.classList.remove('hidden'); moon.classList.add('hidden'); }
    }
}

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
                window.location.href = 'login';
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
        const sectionLabel = assignment.section_name
            ? ` — Sección: ${assignment.section_name}`
            : '';
        elements.course.textContent = (assignment.course_title || 'General') + sectionLabel;
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

// --- FORMULARIO DE SUBIDA ---
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
                <input type="file" id="file-input" accept=".pdf,.docx" multiple>
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
        const validTypes = [
            'application/pdf',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        ];
        const validExtensions = ['.pdf', '.docx'];
        const extension = file.name.split('.').pop().toLowerCase();

        const isValidType = validTypes.includes(file.type) || validExtensions.includes('.' + extension);

        if (!isValidType) {
            alert(`El archivo ${file.name} no es válido. Solo se permiten PDF y DOCX.`);
            return;
        }

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
        submitBtn.textContent = '⏳ Procesando...';

        try {
            const fileInput = document.getElementById('file-input');
            const file = fileInput.files[0];

            if (!file) {
                throw new Error('No se encontró el archivo');
            }

            // 🔴 NUEVO: Extraer texto del documento en el frontend
            console.log('🔍 [FRONTEND] Iniciando extracción de texto...');
            const extractedText = await extractDocumentText(file);
            console.log(`🔍 [FRONTEND] Texto extraído: ${extractedText.length} caracteres`);

            // Enviar el texto extraído junto con el archivo en el mismo request
            formData.append('extracted_text', extractedText);
            // NO guardar en localStorage — el texto puede ser sensible

            // Subir el archivo original a R2 (para almacenamiento)
            const formData = new FormData();
            formData.append('assignment_id', assignmentId);
            formData.append('file', file);

            const uploadResponse = await fetch('/api/submit-assignment', {
                method: 'POST',
                body: formData
            });

            if (!uploadResponse.ok) {
                const err = await uploadResponse.json();
                throw new Error(err.error || 'Error al entregar');
            }

            const uploadData = await uploadResponse.json();

            // 🔴 NUEVO: Asociar el texto extraído con la entrega en la DB
            await fetch('/api/save-extracted-text', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    submission_id: uploadData.submission_id,
                    extracted_text: extractedText
                })
            });

            showStatus('✅ Trabajo entregado correctamente', 'success');
            setTimeout(() => window.location.reload(), 1500);

        } catch (error) {
            console.error('❌ Error:', error);
            showStatus(`❌ Error: ${error.message}`, 'error');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Enviar Tarea';
        }
    });
}

// --- RENDERIZADO DE FEEDBACK ---
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
        criteria.map((c, i) => `${i + 1}. ${c}`).join('\n') +
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

// --- UTILIDADES UI ---
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
                <a href="classroom" class="btn btn-primary" style="margin-top: 15px; display:inline-block;">Volver a Tareas</a>
            </div>
        `;
    } else {
        alert(message);
    }
}

function setupLogout() {
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            if (confirm('¿Estás seguro de que deseas cerrar sesión?')) {
                try {
                    await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' });
                } catch (e) { }
                localStorage.removeItem('mirai_user_dni');
                localStorage.removeItem('mirai_user_name');
                localStorage.removeItem('mirai_user_role');
                localStorage.removeItem('mirai-ai-conversation-id');
                localStorage.removeItem('mirai-ai-course-id');
                localStorage.removeItem('mirai-ai-lesson-id');
                window.location.href = 'login';
            }
        });
    }
}

// ============================================
// EXTRACCIÓN DE TEXTO DE DOCUMENTOS (FRONTEND)
// ============================================

// --- EXTRAER TEXTO DE PDF ---
async function extractTextFromPDF(file) {
    try {
        console.log('📄 [FRONTEND] Extrayendo texto de PDF...');

        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;

        let fullText = '';

        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
            const page = await pdf.getPage(pageNum);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map(item => item.str).join(' ');
            fullText += pageText + '\n\n';
        }

        console.log(`📄 [FRONTEND] PDF extraído: ${fullText.length} caracteres`);
        return fullText.substring(0, 15000); // Limitar para la IA

    } catch (error) {
        console.error('❌ Error extrayendo PDF:', error);
        throw new Error('No se pudo extraer texto del PDF. Asegúrate de que no esté protegido.');
    }
}

// --- EXTRAER TEXTO DE DOCX ---
async function extractTextFromDocx(file) {
    try {
        console.log('📝 [FRONTEND] Extrayendo texto de DOCX...');

        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });

        const text = result.value;
        console.log(`📝 [FRONTEND] DOCX extraído: ${text.length} caracteres`);

        if (text.length < 50) {
            throw new Error('El documento parece estar vacío.');
        }

        return text.substring(0, 15000);

    } catch (error) {
        console.error('❌ Error extrayendo DOCX:', error);
        throw new Error('No se pudo extraer texto del DOCX. Asegúrate de que no esté corrupto.');
    }
}

// --- DETECTAR TIPO Y EXTRAER ---
async function extractDocumentText(file) {
    const extension = file.name.split('.').pop().toLowerCase();
    const contentType = file.type;

    console.log(`🔍 [FRONTEND] Archivo: ${file.name}`);
    console.log(`🔍 [FRONTEND] Tipo: ${contentType}`);
    console.log(`🔍 [FRONTEND] Extensión: ${extension}`);

    if (extension === 'pdf' || contentType.includes('pdf')) {
        return await extractTextFromPDF(file);
    } else if (extension === 'docx' || contentType.includes('word')) {
        return await extractTextFromDocx(file);
    } else {
        throw new Error('Formato no soportado. Solo PDF y DOCX.');
    }
}