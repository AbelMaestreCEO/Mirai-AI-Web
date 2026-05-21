/**
 * report.js
 * Módulo de reportes para estudiantes.
 * Solo muestra los reportes a los que el administrador dio acceso al usuario.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * INTEGRACIÓN CON EL BACKEND (Cloudflare Workers + D1)
 * ─────────────────────────────────────────────────────────────────────────────
 * Ajusta BASE_URL a tu worker. Todos los endpoints requieren Authorization: Bearer <token>.
 *
 *   GET  /api/my-reports                    Reportes activos a los que este alumno tiene acceso
 *                                           Responde: Array<Report & { submitted: bool, submittedAt?: string }>
 *
 *   GET  /api/my-reports/:id/submission     Respuesta previa del alumno (si existe)
 *                                           Responde: { answers: { [qId]: any } } | 404
 *
 *   POST /api/my-reports/:id/submit         Enviar respuestas
 *                                           Body: { answers: { [qId]: string | string[] } }
 *                                           Responde: { ok: true, submittedAt: string }
 *
 * Estructura de un reporte devuelto al estudiante:
 *   {
 *     id: string,
 *     title: string,
 *     description: string,
 *     icon: string (emoji),
 *     deadline: string | null (YYYY-MM-DD),
 *     questions: [
 *       { id: string, type: 'text'|'select'|'time'|'date'|'image', label: string, options?: string[] }
 *     ],
 *     submitted: boolean,
 *     submittedAt?: string (ISO)
 *   }
 *
 * NOTA sobre imágenes:
 *   Las imágenes se convierten a base64 en el cliente y se envían como strings en el
 *   campo answers[qId] = [ 'data:image/jpeg;base64,...', ... ].
 *   El worker debe procesar estos strings y subirlos a R2 (u otro storage),
 *   almacenando solo la URL pública final en D1.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * USO EN report.html:
 *   Sustituye el bloque <script type="module"> inline por:
 *   <script type="module" src="report.js"></script>
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ══════════════════════════════════════════════════════════════════════════════
// CONFIGURACIÓN
// ══════════════════════════════════════════════════════════════════════════════

/** URL base de tu Cloudflare Worker / API REST. Deja vacío para rutas relativas. */
const BASE_URL = '';

/** Si true, usa datos demo cuando la API no responde. */
const DEMO_MODE_FALLBACK = true;

/** Límite de tamaño de imagen en bytes (5 MB). */
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

// ══════════════════════════════════════════════════════════════════════════════
// UTILIDADES GENERALES
// ══════════════════════════════════════════════════════════════════════════════

const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// ══════════════════════════════════════════════════════════════════════════════
// AUTENTICACIÓN
// ══════════════════════════════════════════════════════════════════════════════

function getToken() {
    return localStorage.getItem('mirai-token') || '';
}

function getUser() {
    try {
        return JSON.parse(localStorage.getItem('mirai-user')) || {};
    } catch {
        return {};
    }
}

function logout() {
    localStorage.removeItem('mirai-token');
    localStorage.removeItem('mirai-user');
    window.location.href = 'login.html';
}

// ══════════════════════════════════════════════════════════════════════════════
// API CLIENT
// ══════════════════════════════════════════════════════════════════════════════

async function api(path, opts = {}) {
    const response = await fetch(BASE_URL + path, {
        ...opts,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${getToken()}`,
            ...(opts.headers || {}),
        },
    });

    if (response.status === 401) {
        logout();
        throw new Error('No autorizado');
    }

    if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`HTTP ${response.status}: ${body}`);
    }

    if (response.status === 204) return null;
    return response.json();
}

// ══════════════════════════════════════════════════════════════════════════════
// UI HELPERS
// ══════════════════════════════════════════════════════════════════════════════

let toastTimer = null;

function showToast(msg, duration = 2800) {
    const toast = $('#toast');
    if (!toast) return;
    if (toastTimer) clearTimeout(toastTimer);
    toast.textContent = msg;
    toast.classList.add('show');
    toastTimer = setTimeout(() => toast.classList.remove('show'), duration);
}

function setLoading(on) {
    $('#loading-overlay')?.classList.toggle('show', on);
}

function toggleModal(modalId, open) {
    const modal = $(`#${modalId}`);
    if (!modal) return;
    modal.classList.toggle('open', open);
    document.body.style.overflow = open ? 'hidden' : '';
}

// ══════════════════════════════════════════════════════════════════════════════
// ESTADO GLOBAL
// ══════════════════════════════════════════════════════════════════════════════

/** @type {Array<Object>} Reportes a los que el estudiante tiene acceso */
let myReports = [];

/** @type {string} Tab activa: 'pending' | 'completed' */
let activeTab = 'pending';

/** @type {Object|null} Reporte actualmente abierto en el modal de llenado */
let openReport = null;

/**
 * Almacén temporal de imágenes seleccionadas por el usuario.
 * @type {Object.<string, Array<{file: File, dataUrl: string}>>}
 * Clave: questionId
 */
let imagePreviews = {};

// ══════════════════════════════════════════════════════════════════════════════
// DATOS DEMO
// ══════════════════════════════════════════════════════════════════════════════

function getDemoReports() {
    return [
        {
            id: 'r_demo_1',
            title: 'Reporte de práctica semanal',
            description: 'Documenta las actividades realizadas durante la semana de práctica.',
            icon: '📋',
            deadline: new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10),
            questions: [
                { id: 'q1', type: 'text',   label: '¿Qué actividades realizaste esta semana?' },
                { id: 'q2', type: 'select',  label: 'Nivel de dificultad', options: ['Fácil', 'Medio', 'Difícil'] },
                { id: 'q3', type: 'time',    label: 'Hora de inicio de la actividad principal' },
                { id: 'q4', type: 'date',    label: 'Fecha de la actividad principal' },
                { id: 'q5', type: 'image',   label: 'Foto de evidencia (sube una imagen)' },
            ],
            submitted: false,
        },
        {
            id: 'r_demo_2',
            title: 'Laboratorio #3 — Química',
            description: 'Reporte de resultados del experimento de titulación ácido-base.',
            icon: '🧪',
            deadline: new Date(Date.now() - 1 * 86400000).toISOString().slice(0, 10),
            questions: [
                { id: 'q1', type: 'text',  label: 'Describe el procedimiento seguido.' },
                { id: 'q2', type: 'text',  label: '¿Cuáles fueron tus resultados?' },
                { id: 'q3', type: 'image', label: 'Foto del experimento' },
            ],
            submitted: true,
            submittedAt: new Date(Date.now() - 86400000).toISOString(),
        },
    ];
}

// ══════════════════════════════════════════════════════════════════════════════
// CARGA DE DATOS
// ══════════════════════════════════════════════════════════════════════════════

async function loadReports() {
    setLoading(true);
    try {
        myReports = await api('/api/my-reports');
    } catch (err) {
        console.warn('[Report] API no disponible, usando demo:', err.message);
        if (DEMO_MODE_FALLBACK) {
            myReports = getDemoReports();
            showToast('ℹ️ Modo demo — conecta tu API para ver tus reportes reales.');
        } else {
            myReports = [];
        }
    } finally {
        setLoading(false);
        renderAllTabs();
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// RENDERIZADO DE TARJETAS
// ══════════════════════════════════════════════════════════════════════════════

/** Renderiza ambas pestañas. */
function renderAllTabs() {
    const pending   = myReports.filter(r => !r.submitted);
    const completed = myReports.filter(r =>  r.submitted);

    renderGrid('pending-grid',   'empty-pending',   pending);
    renderGrid('completed-grid', 'empty-completed', completed);

    // Actualizar contadores en los tabs
    updateTabCounters(pending.length, completed.length);
}

/**
 * Muestra / oculta los contadores de items en cada tab button.
 * @param {number} pendingCount
 * @param {number} completedCount
 */
function updateTabCounters(pendingCount, completedCount) {
    const pendingBtn   = $('[data-tab="pending"]');
    const completedBtn = $('[data-tab="completed"]');

    if (pendingBtn) {
        pendingBtn.textContent = pendingCount > 0
            ? `Pendientes (${pendingCount})`
            : 'Pendientes';
    }
    if (completedBtn) {
        completedBtn.textContent = completedCount > 0
            ? `Completados (${completedCount})`
            : 'Completados';
    }
}

/**
 * Renderiza un grid de tarjetas de reporte.
 * @param {string} gridId
 * @param {string} emptyId
 * @param {Array<Object>} reports
 */
function renderGrid(gridId, emptyId, reports) {
    const grid  = $(`#${gridId}`);
    const empty = $(`#${emptyId}`);
    if (!grid) return;

    grid.innerHTML = '';

    if (reports.length === 0) {
        if (empty) empty.style.display = 'block';
        return;
    }

    if (empty) empty.style.display = 'none';

    reports.forEach(r => {
        grid.appendChild(buildStudentCard(r));
    });
}

/**
 * Construye la tarjeta de un reporte para el estudiante.
 * @param {Object} r
 * @returns {HTMLElement}
 */
function buildStudentCard(r) {
    const qCount   = (r.questions || []).length;
    const deadline = r.deadline ? buildDeadlineBadge(r.deadline) : '';

    const card = document.createElement('div');
    card.className  = `report-card-student${r.submitted ? ' completed' : ''}`;
    card.dataset.id = r.id;

    // Botón de acción según estado
    const actionHtml = r.submitted
        ? `<div class="btn-fill done" aria-disabled="true">
               ✅ Enviado${r.submittedAt ? ' · ' + formatDate(r.submittedAt) : ''}
           </div>`
        : `<button class="btn-fill btn-open-report" data-id="${r.id}" aria-label="Completar reporte ${escapeHtml(r.title)}">
               Completar reporte →
           </button>`;

    card.innerHTML = `
        <div class="rc-top">
            <div class="rc-icon">${escapeHtml(r.icon || '📋')}</div>
            <div style="flex:1; min-width:0;">
                <div class="rc-title">${escapeHtml(r.title)}</div>
            </div>
        </div>
        ${r.description ? `<div class="rc-desc">${escapeHtml(r.description)}</div>` : ''}
        <div class="rc-meta">
            <span class="rc-chip">❓ ${qCount} pregunta${qCount !== 1 ? 's' : ''}</span>
            ${deadline}
            <span class="rc-status ${r.submitted ? 'completed' : 'pending'}">
                ${r.submitted ? '✅ Enviado' : '⏳ Pendiente'}
            </span>
        </div>
        ${actionHtml}
    `;

    return card;
}

/**
 * Badge de fecha límite con color según urgencia.
 * @param {string} deadline YYYY-MM-DD
 * @returns {string}
 */
function buildDeadlineBadge(deadline) {
    const d    = new Date(deadline + 'T00:00:00');
    const diff = Math.ceil((d - new Date()) / 86400000);

    let style, label;
    if (diff < 0)       { style = 'background:#FFEBEE;color:#C62828;'; label = 'Vencido'; }
    else if (diff === 0){ style = 'background:#FFEBEE;color:#C62828;'; label = 'Vence hoy'; }
    else if (diff <= 2) { style = 'background:#FFF8E1;color:#F57F17;'; label = `${diff}d restantes`; }
    else                { style = '';                                    label = deadline; }

    return `<span class="rc-chip" style="${style}">📅 ${escapeHtml(label)}</span>`;
}

/**
 * Formatea una fecha ISO a string legible corto.
 * @param {string} iso
 * @returns {string}
 */
function formatDate(iso) {
    try {
        return new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch {
        return '';
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// MODAL DE LLENADO DE REPORTE
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Abre el modal de llenado para un reporte específico.
 * @param {string} reportId
 */
async function openFillModal(reportId) {
    const r = myReports.find(x => x.id === reportId);
    if (!r)           return;
    if (r.submitted) { showToast('Ya enviaste este reporte.'); return; }

    openReport    = r;
    imagePreviews = {};

    // Encabezado del modal
    $('#fill-title').textContent    = r.title;
    $('#fill-subtitle').textContent = r.description || '';

    // Reset barra de progreso
    updateProgressBar(0);

    // Render preguntas
    const body = $('#fill-body');
    body.innerHTML = '';
    (r.questions || []).forEach((q, i) => {
        body.appendChild(buildAnswerField(q, i));
    });

    // Intentar pre-cargar respuesta guardada previamente (borrador)
    await tryLoadDraft(reportId);

    // Observar cambios para la barra de progreso
    body.addEventListener('input', computeAndUpdateProgress);
    body.addEventListener('change', computeAndUpdateProgress);
    computeAndUpdateProgress();

    toggleModal('modal-fill', true);
}

/**
 * Intenta cargar una respuesta previa (borrador) del servidor.
 * Si no existe, no hace nada.
 * @param {string} reportId
 */
async function tryLoadDraft(reportId) {
    try {
        const prev = await api(`/api/my-reports/${reportId}/submission`);
        if (!prev?.answers) return;

        (openReport.questions || []).forEach(q => {
            const val = prev.answers[q.id];
            if (!val) return;

            if (q.type === 'image') return; // imágenes no se pre-cargan (URLs del servidor)

            const el = $(`#ans-${q.id}`);
            if (el) el.value = val;
        });
    } catch {
        // 404 o error: no hay borrador, continuar normal
    }
}

/**
 * Construye el campo de respuesta correspondiente al tipo de pregunta.
 * @param {Object} q - Pregunta
 * @param {number} index - Índice base-0
 * @returns {HTMLElement}
 */
function buildAnswerField(q, index) {
    const group = document.createElement('div');
    group.className = 'answer-group';

    let fieldHtml = '';

    switch (q.type) {
        case 'text':
            fieldHtml = `
                <textarea
                    class="answer-textarea"
                    id="ans-${q.id}"
                    name="ans-${q.id}"
                    placeholder="Escribe tu respuesta…"
                    rows="3"
                    aria-label="${escapeHtml(q.label)}"></textarea>`;
            break;

        case 'select': {
            const opts = (q.options || [])
                .map(o => `<option value="${escapeHtml(o)}">${escapeHtml(o)}</option>`)
                .join('');
            fieldHtml = `
                <select
                    class="answer-select"
                    id="ans-${q.id}"
                    name="ans-${q.id}"
                    aria-label="${escapeHtml(q.label)}">
                    <option value="">— Selecciona una opción —</option>
                    ${opts}
                </select>`;
            break;
        }

        case 'time':
            fieldHtml = `
                <input
                    class="answer-input"
                    type="time"
                    id="ans-${q.id}"
                    name="ans-${q.id}"
                    aria-label="${escapeHtml(q.label)}">`;
            break;

        case 'date':
            fieldHtml = `
                <input
                    class="answer-input"
                    type="date"
                    id="ans-${q.id}"
                    name="ans-${q.id}"
                    aria-label="${escapeHtml(q.label)}">`;
            break;

        case 'image':
            // Inicializar array de previsualizaciones para esta pregunta
            imagePreviews[q.id] = [];
            fieldHtml = buildImageUploadHTML(q.id);
            break;

        default:
            fieldHtml = `<input class="answer-input" type="text" id="ans-${q.id}">`;
    }

    group.innerHTML = `
        <label class="answer-label" for="ans-${q.id}">
            <span class="q-num">${index + 1}</span>
            ${escapeHtml(q.label || `Pregunta ${index + 1}`)}
        </label>
        ${fieldHtml}
    `;

    // Enlazar eventos para campo de imagen
    if (q.type === 'image') {
        const fileInput = $(`#file-${q.id}`, group);
        if (fileInput) {
            fileInput.addEventListener('change', () =>
                handleImageFiles(q.id, fileInput.files)
            );
        }

        // Soporte drag & drop
        const uploadArea = $(`#upload-${q.id}`, group);
        if (uploadArea) {
            uploadArea.addEventListener('dragover', e => {
                e.preventDefault();
                uploadArea.style.borderColor = 'var(--accent-color, #6750A4)';
                uploadArea.style.background  = 'var(--secondary-container, #E8DEF8)';
            });
            uploadArea.addEventListener('dragleave', () => {
                uploadArea.style.borderColor = '';
                uploadArea.style.background  = '';
            });
            uploadArea.addEventListener('drop', e => {
                e.preventDefault();
                uploadArea.style.borderColor = '';
                uploadArea.style.background  = '';
                handleImageFiles(q.id, e.dataTransfer.files);
            });
        }
    }

    return group;
}

/**
 * HTML del área de carga de imágenes.
 * @param {string} qId
 * @returns {string}
 */
function buildImageUploadHTML(qId) {
    return `
        <div class="img-upload-area" id="upload-${qId}">
            <input type="file" accept="image/jpeg,image/png,image/webp,image/gif"
                multiple id="file-${qId}" aria-label="Subir imágenes">
            <div class="img-upload-icon">🖼️</div>
            <div class="img-upload-text">
                Toca o arrastra imágenes aquí<br>
                <small>JPG, PNG, WebP · máx ${MAX_IMAGE_BYTES / (1024 * 1024)} MB c/u</small>
            </div>
        </div>
        <div class="img-previews" id="previews-${qId}"></div>
    `;
}

// ── Manejo de imágenes ────────────────────────────────────────────────────────

/**
 * Procesa los archivos de imagen seleccionados: valida tamaño,
 * convierte a base64 y renderiza la previsualización.
 * @param {string} qId
 * @param {FileList} files
 */
function handleImageFiles(qId, files) {
    [...files].forEach(file => {
        if (file.size > MAX_IMAGE_BYTES) {
            showToast(`⚠️ "${file.name}" supera el límite de ${MAX_IMAGE_BYTES / (1024 * 1024)} MB.`);
            return;
        }

        const reader = new FileReader();
        reader.onload = e => {
            const entry = { file, dataUrl: e.target.result };
            imagePreviews[qId].push(entry);
            renderImagePreview(qId, entry);
            computeAndUpdateProgress();
        };
        reader.onerror = () => showToast(`❌ Error al leer "${file.name}".`);
        reader.readAsDataURL(file);
    });
}

/**
 * Añade una miniatura de imagen al área de previsualizaciones.
 * @param {string} qId
 * @param {{ file: File, dataUrl: string }} entry
 */
function renderImagePreview(qId, entry) {
    const container = $(`#previews-${qId}`);
    if (!container) return;

    const wrap = document.createElement('div');
    wrap.className = 'img-preview-item';

    const img = document.createElement('img');
    img.src = entry.dataUrl;
    img.alt = entry.file.name;

    const removeBtn = document.createElement('button');
    removeBtn.className  = 'remove-img';
    removeBtn.type       = 'button';
    removeBtn.title      = 'Quitar imagen';
    removeBtn.ariaLabel  = 'Quitar imagen';
    removeBtn.textContent = '✕';

    removeBtn.addEventListener('click', () => {
        const idx = imagePreviews[qId].indexOf(entry);
        if (idx !== -1) imagePreviews[qId].splice(idx, 1);
        wrap.remove();
        computeAndUpdateProgress();
    });

    wrap.appendChild(img);
    wrap.appendChild(removeBtn);
    container.appendChild(wrap);
}

// ── Barra de progreso ─────────────────────────────────────────────────────────

/**
 * Calcula cuántas preguntas han sido respondidas y actualiza la barra.
 */
function computeAndUpdateProgress() {
    if (!openReport) return;
    const qs = openReport.questions || [];
    if (qs.length === 0) { updateProgressBar(100); return; }

    let filled = 0;
    qs.forEach(q => {
        if (q.type === 'image') {
            if ((imagePreviews[q.id] || []).length > 0) filled++;
        } else {
            const el = $(`#ans-${q.id}`);
            if (el && el.value.trim()) filled++;
        }
    });

    const pct = Math.round((filled / qs.length) * 100);
    updateProgressBar(pct);
}

/**
 * Actualiza el ancho de la barra de progreso.
 * @param {number} pct 0-100
 */
function updateProgressBar(pct) {
    const bar = $('#fill-progress');
    if (bar) bar.style.width = `${pct}%`;
}

// ── Cerrar modal de llenado ───────────────────────────────────────────────────

function closeFillModal() {
    toggleModal('modal-fill', false);
    openReport    = null;
    imagePreviews = {};

    // Limpiar el body del modal (libera memoria de las dataURLs)
    const body = $('#fill-body');
    if (body) body.innerHTML = '';
}

// ══════════════════════════════════════════════════════════════════════════════
// ENVÍO DE REPORTE
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Recolecta las respuestas, valida y envía el reporte al servidor.
 */
async function submitReport() {
    if (!openReport) return;

    const submitBtn = $('#fill-submit-btn');
    if (submitBtn) submitBtn.disabled = true;

    // ── Recolectar respuestas ─────────────────────────────────────────────────
    const answers = {};
    let   valid   = true;

    for (const q of openReport.questions || []) {
        if (q.type === 'image') {
            const imgs = imagePreviews[q.id] || [];
            answers[q.id] = imgs.map(e => e.dataUrl);
        } else {
            const el = $(`#ans-${q.id}`);
            answers[q.id] = el ? el.value.trim() : '';
        }

        // Validación: todas las preguntas son obligatorias
        const val = answers[q.id];
        const isEmpty = !val || (Array.isArray(val) && val.length === 0);
        if (isEmpty) {
            showToast(`⚠️ Por favor responde: "${escapeHtml(q.label || 'Pregunta')}"`);
            // Scroll al campo con error
            const errEl = $(`#ans-${q.id}`) || $(`#upload-${q.id}`);
            if (errEl) errEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            valid = false;
            break;
        }
    }

    if (!valid) {
        if (submitBtn) submitBtn.disabled = false;
        return;
    }

    // ── Enviar al servidor ────────────────────────────────────────────────────
    setLoading(true);
    const reportId = openReport.id;

    try {
        const result = await api(`/api/my-reports/${reportId}/submit`, {
            method: 'POST',
            body: JSON.stringify({ answers }),
        });

        const submittedAt = result?.submittedAt || new Date().toISOString();
        markAsSubmitted(reportId, submittedAt);

    } catch (err) {
        if (DEMO_MODE_FALLBACK) {
            console.warn('[Report] API no disponible, marcando como enviado en demo:', err.message);
            markAsSubmitted(reportId, new Date().toISOString());
        } else {
            console.error('[Report] Error al enviar:', err);
            showToast('❌ Error al enviar el reporte. Intenta de nuevo.');
            if (submitBtn) submitBtn.disabled = false;
            setLoading(false);
        }
    }
}

/**
 * Actualiza el estado local y la UI tras un envío exitoso.
 * @param {string} reportId
 * @param {string} submittedAt ISO string
 */
function markAsSubmitted(reportId, submittedAt) {
    const r = myReports.find(x => x.id === reportId);
    if (r) {
        r.submitted   = true;
        r.submittedAt = submittedAt;
    }

    setLoading(false);
    closeFillModal();
    renderAllTabs();
    showSuccessAnimation();
}

/**
 * Muestra un toast animado de éxito.
 */
function showSuccessAnimation() {
    showToast('🎉 ¡Reporte enviado correctamente!', 3500);
}

// ══════════════════════════════════════════════════════════════════════════════
// GESTIÓN DE PESTAÑAS
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Cambia a la pestaña indicada, mostrando / ocultando los grids correspondientes.
 * @param {'pending'|'completed'} tab
 */
function switchTab(tab) {
    activeTab = tab;

    // Botones
    $$('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tab);
    });

    // Contenido
    $('#tab-pending').style.display   = tab === 'pending'   ? '' : 'none';
    $('#tab-completed').style.display = tab === 'completed' ? '' : 'none';
}

// ══════════════════════════════════════════════════════════════════════════════
// BINDING DE EVENTOS
// ══════════════════════════════════════════════════════════════════════════════

function bindEvents() {
    // ── Tabs ──────────────────────────────────────────────────────────────────
    $$('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    // ── Abrir modal de llenado (delegado en cada grid) ────────────────────────
    ['#pending-grid', '#completed-grid'].forEach(sel => {
        $(sel)?.addEventListener('click', e => {
            const btn = e.target.closest('.btn-open-report');
            if (btn) openFillModal(btn.dataset.id);
        });
    });

    // ── Cerrar modal de llenado ───────────────────────────────────────────────
    $('#fill-close-btn')?.addEventListener('click', closeFillModal);
    $('#fill-cancel-btn')?.addEventListener('click', closeFillModal);
    $('#modal-fill')?.addEventListener('click', e => {
        if (e.target === $('#modal-fill')) closeFillModal();
    });

    // ── Enviar reporte ────────────────────────────────────────────────────────
    $('#fill-submit-btn')?.addEventListener('click', submitReport);

    // ── Cerrar con Escape ─────────────────────────────────────────────────────
    document.addEventListener('keydown', e => {
        if (e.key !== 'Escape') return;
        if ($('#modal-fill.open')) closeFillModal();
    });

    // ── Logout ────────────────────────────────────────────────────────────────
    $('#logout-btn')?.addEventListener('click', logout);
}

// ══════════════════════════════════════════════════════════════════════════════
// INICIALIZACIÓN
// ══════════════════════════════════════════════════════════════════════════════

async function init() {
    const user = getUser();

    // Mostrar botón de panel admin si el usuario es profesor
    if (user.role === 'teacher') {
        $$('.admin-only').forEach(el => el.style.display = 'inline-flex');
    }

    // Cargar reportes y enlazar eventos
    await loadReports();
    bindEvents();

    // Arrancar en la pestaña pendiente
    switchTab('pending');
}

// ── Arrancar cuando el DOM esté listo ────────────────────────────────────────
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}