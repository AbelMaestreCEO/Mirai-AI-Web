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
 * USO EN report:
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

function getToken() { return ''; }

function getUser() {
    return {
        dni:  window.miraiUser?.dni  || '',
        name: window.miraiUser?.name || '',
        role: window.miraiUser?.role || '',
    };
}

async function logout() {
    try { await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' }); } catch (_) {}
    localStorage.removeItem('mirai-ai-conversation-id');
    window.location.href = 'login';
}

// ══════════════════════════════════════════════════════════════════════════════
// API CLIENT
// ══════════════════════════════════════════════════════════════════════════════

async function api(path, opts = {}) {
    const response = await fetch(BASE_URL + path, {
        ...opts,
        credentials: 'same-origin',   // envía cookie HttpOnly igual que app.js
        headers: {
            'Content-Type': 'application/json',
            'X-User-DNI': window.miraiUser?.dni || '',
            ...(opts.headers || {}),
        },
    });

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
    $('#tab-manage').style.display    = tab === 'manage'    ? '' : 'none';

    if (tab === 'manage' && typeof loadManageReports === 'function') {
        loadManageReports();
    }
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
    if (window.miraiUserReady) await window.miraiUserReady;
    const user = getUser();

    // Mostrar la pestaña "Gestionar" si el usuario es profesor o administrador
    const canManageReports = user.role === 'teacher' || user.role === 'admin';
    if (canManageReports) {
        $$('.admin-only').forEach(el => el.style.display = 'inline-flex');
        bindManageEvents();
    }

    // Cargar reportes y enlazar eventos
    await loadReports();
    bindEvents();

    // Arrancar en la pestaña pendiente
    switchTab('pending');

    initRealtimeReports();
}

// ── Arrancar cuando el DOM esté listo ────────────────────────────────────────
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

function initRealtimeReports() {
  const rt = window.MiraiRealtime.getInstance();
 
  rt.subscribe('reports', ({ reports, submissions }) => {
 
    // Nuevos reportes publicados
    reports.forEach(r => {
      const card = document.querySelector(`[data-report-id="${r.id}"]`);
      if (card) {
        flashElement(card);
      } else if (typeof loadReports === 'function') {
        loadReports();
        return;
      }
    });
 
    // Nuevas entregas recibidas (vista profesor)
    submissions.forEach(sub => {
      const exists = document.querySelector(`[data-sub-id="${sub.id}"]`);
      if (!exists) {
        if (typeof appendSubmission === 'function') appendSubmission(sub);
        else if (typeof loadSubmissions === 'function') { loadSubmissions(); return; }
        showToast(`📩 Nueva entrega de ${sub.student_dni} en "${sub.report_title}"`);
      }
    });

    // Si la pestaña de gestión está abierta, refrescarla también
    if (activeTab === 'manage' && typeof loadManageReports === 'function') {
        loadManageReports();
    }
  });

  rt.start();
}

// ══════════════════════════════════════════════════════════════════════════════
// GESTIÓN DE REPORTES (profesores y administradores)
// ══════════════════════════════════════════════════════════════════════════════
//
// Todo lo que sigue habilita, dentro de esta misma página, crear/editar/eliminar
// reportes, asignarlos a una sección completa (como en classroom_admin.html) o a
// personas puntuales, y revisar las respuestas recibidas. Solo se activa para
// usuarios con role 'teacher' o 'admin' (ver bindManageEvents() en init()).

/** @type {Array<Object>} Reportes visibles en la pestaña "Gestionar" */
let manageReports = [];

/** @type {Array<Object>} Usuarios (cualquier rol) para el buscador de acceso individual */
let allUsers = [];

/** @type {Array<Object>} Secciones disponibles para asignar (propias, o todas si es admin) */
let reportSections = [];

/** @type {string|null} ID del reporte en edición; null = creando uno nuevo */
let editingReportId = null;

/** Contador incremental para IDs de preguntas dentro del DOM del constructor */
let qCounter = 0;

function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// ── Datos demo (fallback si la API no responde) ────────────────────────────────

function getDemoManageReports() {
    return [
        {
            id: 'r_demo_1',
            title: 'Reporte de práctica semanal',
            description: 'Documenta las actividades realizadas durante la semana de práctica.',
            icon: '📋',
            deadline: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
            active: true,
            questions: [
                { id: 'q1', type: 'text',  label: '¿Qué actividades realizaste esta semana?' },
                { id: 'q2', type: 'select', label: 'Nivel de dificultad', options: ['Fácil', 'Medio', 'Difícil'] },
            ],
            access: ['s_demo_1', 's_demo_2'],
            individualAccess: ['s_demo_1', 's_demo_2'],
            sectionId: null,
            sectionName: null,
        },
    ];
}

function getDemoUsers() {
    return [
        { id: 's_demo_1', name: 'Ana García',  email: 'ana@email.com' },
        { id: 's_demo_2', name: 'Luis Pérez',  email: 'luis@email.com' },
        { id: 's_demo_3', name: 'María López', email: 'maria@email.com' },
    ];
}

function getDemoSubmissionsFor(reportId) {
    const report = manageReports.find(r => r.id === reportId);
    if (!report || !report.questions) return [];

    return (report.access || []).slice(0, 1).map(userId => {
        const u = allUsers.find(s => s.id === userId);
        const answers = {};
        report.questions.forEach(q => {
            if (q.type === 'text')   answers[q.id] = 'Respuesta de ejemplo.';
            if (q.type === 'select') answers[q.id] = q.options?.[0] || 'Opción 1';
            if (q.type === 'time')   answers[q.id] = '09:30';
            if (q.type === 'date')   answers[q.id] = new Date().toISOString().slice(0, 10);
            if (q.type === 'image')  answers[q.id] = null;
        });
        return {
            id: uid(), reportId, studentId: userId,
            studentName: u?.name || userId,
            submittedAt: new Date().toISOString(),
            answers,
        };
    });
}

// ── Carga de datos ──────────────────────────────────────────────────────────────

async function loadManageReports() {
    setLoading(true);
    try {
        manageReports = await api('/api/reports');
    } catch (err) {
        console.warn('[ReportManage] API no disponible, usando demo:', err.message);
        manageReports = getDemoManageReports();
        showToast('ℹ️ Modo demo — conecta tu API para persistir datos.');
    } finally {
        setLoading(false);
        renderManageReports();
    }
}

async function loadAllUsers() {
    try {
        allUsers = await api('/api/students');
    } catch (err) {
        allUsers = getDemoUsers();
    }
}

async function loadReportSections() {
    const select = $('#report-section-select');
    try {
        reportSections = await api('/api/report-sections');
    } catch (err) {
        reportSections = [];
    }

    if (!select) return;
    const current = select.value;
    select.innerHTML = '<option value="">Sin sección (solo acceso individual)</option>' +
        reportSections.map(s => `<option value="${escapeHtml(s.id)}">${escapeHtml(s.name)}${s.course_title ? ' — ' + escapeHtml(s.course_title) : ''} (${s.student_count} estudiante${s.student_count !== 1 ? 's' : ''})</option>`).join('');
    if (current) select.value = current;
}

// ── Renderizado de la lista ──────────────────────────────────────────────────────

function renderManageReports(filter = '') {
    const list  = $('#reports-list');
    const empty = $('#manage-empty-state');
    if (!list) return;

    const query    = filter.toLowerCase().trim();
    const filtered = manageReports.filter(r =>
        r.title.toLowerCase().includes(query) ||
        (r.description || '').toLowerCase().includes(query)
    );

    list.innerHTML = '';

    if (filtered.length === 0) {
        if (empty) empty.style.display = 'block';
        return;
    }

    if (empty) empty.style.display = 'none';

    filtered.forEach(r => list.appendChild(buildManageReportCard(r)));
}

function buildManageReportCard(r) {
    const accessCount = (r.access || []).length;
    const qCount      = (r.questions || []).length;
    const deadlineBadge = r.deadline ? buildManageDeadlineBadge(r.deadline) : '';
    const sectionChip = r.sectionId
        ? `<span class="report-meta-chip section-chip">🏫 ${escapeHtml(r.sectionName || 'Sección')}</span>`
        : '';

    const card = document.createElement('div');
    card.className  = 'report-card';
    card.dataset.id = r.id;
    card.dataset.reportId = r.id;

    card.innerHTML = `
        <div class="report-card-icon">${escapeHtml(r.icon || '📋')}</div>

        <div class="report-card-info">
            <div class="report-card-title">${escapeHtml(r.title)}</div>
            <div class="report-card-meta">
                <span class="report-meta-chip">❓ ${qCount} pregunta${qCount !== 1 ? 's' : ''}</span>
                <span class="report-meta-chip">👥 ${accessCount} con acceso</span>
                ${sectionChip}
                ${deadlineBadge}
            </div>
        </div>

        <label class="status-toggle" title="${r.active ? 'Desactivar' : 'Activar'} reporte">
            <div class="toggle-switch">
                <input type="checkbox" class="toggle-active" data-id="${r.id}" ${r.active ? 'checked' : ''}>
                <span class="toggle-slider"></span>
            </div>
            <span style="font-size:0.78rem; color:var(--text-secondary,#888);">${r.active ? 'Activo' : 'Inactivo'}</span>
        </label>

        <div class="report-card-actions">
            <button class="btn-icon btn-submissions" data-id="${r.id}" title="Ver respuestas" aria-label="Ver respuestas">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                    <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>
                </svg>
            </button>
            <button class="btn-icon btn-edit" data-id="${r.id}" title="Editar" aria-label="Editar reporte">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                    <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34a.9959.9959 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
                </svg>
            </button>
            <button class="btn-icon danger btn-delete" data-id="${r.id}" title="Eliminar" aria-label="Eliminar reporte">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                    <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                </svg>
            </button>
        </div>
    `;

    return card;
}

function buildManageDeadlineBadge(deadline) {
    const d    = new Date(deadline + 'T00:00:00');
    const now  = new Date();
    const diff = Math.ceil((d - now) / 86400000);

    let style, label;
    if (diff < 0)        { style = 'background:#FFEBEE;color:#C62828;'; label = 'Vencido'; }
    else if (diff === 0) { style = 'background:#FFEBEE;color:#C62828;'; label = 'Hoy'; }
    else if (diff <= 2)  { style = 'background:#FFF8E1;color:#F57F17;'; label = `${diff}d restantes`; }
    else                 { style = '';                                   label = deadline; }

    return `<span class="report-meta-chip" style="${style}">📅 ${escapeHtml(label)}</span>`;
}

// ── Modal de crear / editar ──────────────────────────────────────────────────────

async function openReportModal(reportId = null) {
    editingReportId = reportId;
    qCounter = 0;

    $('#report-title-input').value = '';
    $('#report-desc-input').value  = '';
    $('#report-deadline').value    = '';
    $('#report-icon').value        = '📋';
    $('#questions-list').innerHTML = '';
    $('#report-section-select').value = '';

    await loadReportSections();

    if (reportId) {
        $('#manage-modal-title').textContent = 'Editar Reporte';
        const r = manageReports.find(x => x.id === reportId);
        if (r) {
            $('#report-title-input').value = r.title       || '';
            $('#report-desc-input').value  = r.description || '';
            $('#report-deadline').value    = r.deadline    || '';
            $('#report-icon').value        = r.icon        || '📋';
            if (r.sectionId) $('#report-section-select').value = r.sectionId;
            (r.questions || []).forEach(q => addQuestionToDOM(q.type, q));
        }
    } else {
        $('#manage-modal-title').textContent = 'Crear Reporte';
    }

    await renderStudentAccessList(reportId);
    toggleModal('modal-report', true);
}

function closeReportModal() {
    toggleModal('modal-report', false);
    editingReportId = null;
    window._reportAccessMap = {};
}

// ── Acceso individual: búsqueda y gestión ─────────────────────────────────────────

function maskEmail(email) {
    if (!email || !email.includes('@')) return email;
    const [local, domain] = email.split('@');
    const [domName, ...domExt] = domain.split('.');

    const maskPart = str => str.length <= 2
        ? str[0] + '*'.repeat(str.length - 1)
        : str[0] + '*'.repeat(str.length - 2) + str[str.length - 1];

    return maskPart(local) + '@' + maskPart(domName) + '.' + domExt.join('.');
}

async function renderStudentAccessList(reportId) {
    const container = $('#student-list');
    if (!container) return;

    await loadAllUsers();

    // Al editar, precargar solo el acceso individual (no los de la sección,
    // esos se gestionan desde el selector de sección de arriba)
    const currentAccess = reportId
        ? (manageReports.find(r => r.id === reportId)?.individualAccess || [])
        : [];

    window._reportAccessMap = {};

    container.innerHTML = `
        <div style="display:flex; gap:8px; margin-bottom:0.7rem;">
            <input
                class="form-input"
                type="text"
                id="access-search-dni"
                placeholder="Buscar por cédula…"
                maxlength="20"
                style="flex:1;"
                aria-label="Buscar usuario por cédula">
            <button class="btn-save" type="button" id="access-search-btn"
                style="padding:9px 16px; white-space:nowrap;">
                Buscar
            </button>
        </div>
        <div id="access-search-result" style="margin-bottom:0.7rem; min-height:36px;"></div>
        <div id="access-added-list" style="display:flex; flex-direction:column; gap:6px; max-height:220px; overflow-y:auto;"></div>
    `;

    if (currentAccess.length > 0) {
        currentAccess.forEach(dni => {
            const found = allUsers.find(s => String(s.id) === String(dni));
            if (found) {
                window._reportAccessMap[String(dni)] = {
                    dni:       String(found.id),
                    firstName: found.name?.split(' ')[0] || '',
                    lastName:  found.name?.split(' ').slice(1).join(' ') || '',
                    email:     found.email || '',
                };
            } else {
                window._reportAccessMap[String(dni)] = { dni: String(dni), firstName: '—', lastName: '', email: '' };
            }
        });
        renderAccessAddedList();
    }

    $('#access-search-btn').addEventListener('click', searchUserByDni);
    $('#access-search-dni').addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); searchUserByDni(); }
    });
}

async function searchUserByDni() {
    const input    = $('#access-search-dni');
    const resultEl = $('#access-search-result');
    const dni      = input?.value.trim();

    if (!dni) { showToast('Escribe una cédula para buscar.'); return; }

    resultEl.innerHTML = `<span style="font-size:0.82rem;color:var(--text-secondary,#888);">Buscando…</span>`;

    try {
        const user = await api(`/api/users/search?dni=${encodeURIComponent(dni)}`);
        renderSearchResult(user, resultEl);
    } catch (err) {
        resultEl.innerHTML = `<span style="font-size:0.82rem;color:#e53935;">Usuario no encontrado.</span>`;
    }
}

function renderSearchResult(user, container) {
    const dni         = String(user.dni);
    const already     = !!window._reportAccessMap[dni];
    const initials    = ((user.first_name?.[0] || '') + (user.last_name?.[0] || '')).toUpperCase() || '?';
    const maskedEmail = maskEmail(user.email || '');

    container.innerHTML = `
        <div class="student-row" style="background:var(--secondary-container,#E8DEF8);">
            <div class="student-avatar">${escapeHtml(initials)}</div>
            <div style="flex:1; min-width:0;">
                <div class="student-name">${escapeHtml(user.first_name)} ${escapeHtml(user.last_name)}</div>
                <div class="student-email">${escapeHtml(maskedEmail)}</div>
            </div>
            <button class="btn-save" type="button" id="access-add-btn"
                style="padding:7px 14px; font-size:0.82rem; ${already ? 'opacity:.5;cursor:not-allowed;' : ''}">
                ${already ? 'Agregado' : '+ Agregar'}
            </button>
        </div>
    `;

    if (!already) {
        $('#access-add-btn').addEventListener('click', () => {
            window._reportAccessMap[dni] = {
                dni,
                firstName: user.first_name || '',
                lastName:  user.last_name  || '',
                email:     user.email      || '',
            };
            renderAccessAddedList();
            container.innerHTML = '';
            $('#access-search-dni').value = '';
            showToast('✅ Usuario agregado al reporte.');
        });
    }
}

function renderAccessAddedList() {
    const list = $('#access-added-list');
    if (!list) return;
    list.innerHTML = '';

    const entries = Object.values(window._reportAccessMap || {});

    if (entries.length === 0) {
        list.innerHTML = '<p style="font-size:0.8rem;color:var(--text-secondary,#aaa);text-align:center;padding:0.5rem 0;">Sin usuarios agregados aún.</p>';
        return;
    }

    entries.forEach(u => {
        const initials    = ((u.firstName?.[0] || '') + (u.lastName?.[0] || '')).toUpperCase() || '?';
        const maskedEmail = maskEmail(u.email || '');

        const row = document.createElement('div');
        row.className = 'student-row';
        row.innerHTML = `
            <div class="student-avatar">${escapeHtml(initials)}</div>
            <div style="flex:1; min-width:0;">
                <div class="student-name">${escapeHtml(u.firstName)} ${escapeHtml(u.lastName)}</div>
                <div class="student-email">${escapeHtml(maskedEmail)}</div>
            </div>
            <button class="btn-icon danger btn-remove-access" data-dni="${escapeHtml(u.dni)}" title="Quitar acceso">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                    <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                </svg>
            </button>
        `;

        row.querySelector('.btn-remove-access').addEventListener('click', () => {
            delete window._reportAccessMap[u.dni];
            renderAccessAddedList();
        });

        list.appendChild(row);
    });
}

// ── Constructor de preguntas ──────────────────────────────────────────────────────

const QUESTION_TYPE_LABELS = {
    text:   'Texto',
    select: 'Selección',
    time:   'Hora',
    date:   'Fecha',
    image:  'Imagen',
};

function addQuestionToDOM(type, existing = null) {
    const domId = `q${++qCounter}`;
    const item  = document.createElement('div');
    item.className    = 'question-item';
    item.dataset.qid   = existing?.id || domId;
    item.dataset.type  = type;

    let extraHtml = '';

    if (type === 'select') {
        const opts = existing?.options?.length ? existing.options : ['', ''];
        const optsHtml = opts.map((o, i) => buildOptionRowHTML(o, i)).join('');
        extraHtml = `
            <div class="options-list">${optsHtml}</div>
            <button class="btn-add-opt" type="button">+ Añadir opción</button>
        `;
    } else if (type === 'image') {
        extraHtml = `<p class="form-hint">El usuario podrá subir una o más imágenes (JPG, PNG, WebP · máx 5 MB c/u).</p>`;
    } else if (type === 'time') {
        extraHtml = `<p class="form-hint">Campo de hora (HH:MM).</p>`;
    } else if (type === 'date') {
        extraHtml = `<p class="form-hint">Campo de fecha (YYYY-MM-DD).</p>`;
    }

    item.innerHTML = `
        <div class="question-item-header">
            <span class="question-type-badge">${escapeHtml(QUESTION_TYPE_LABELS[type] || type)}</span>
            <button class="remove-q" type="button" title="Eliminar pregunta" aria-label="Eliminar pregunta">✕</button>
        </div>
        <div class="form-group" style="margin-bottom:0.4rem;">
            <input class="form-input q-label" type="text"
                placeholder="Escribe la pregunta…"
                value="${escapeHtml(existing?.label || '')}"
                aria-label="Texto de la pregunta">
        </div>
        ${extraHtml}
    `;

    item.querySelector('.remove-q').addEventListener('click', () => item.remove());

    const optionsList = item.querySelector('.options-list');
    if (optionsList) {
        optionsList.addEventListener('click', e => {
            const btn = e.target.closest('.btn-remove-opt');
            if (!btn) return;
            if (optionsList.children.length <= 2) {
                showToast('Mínimo 2 opciones requeridas.');
                return;
            }
            btn.closest('.option-row').remove();
            reindexOptions(optionsList);
        });
    }

    const addOptBtn = item.querySelector('.btn-add-opt');
    if (addOptBtn) {
        addOptBtn.addEventListener('click', () => {
            const idx = optionsList.children.length;
            const row = document.createElement('div');
            row.className = 'option-row';
            row.innerHTML = buildOptionRowHTML('', idx);
            optionsList.appendChild(row);
        });
    }

    $('#questions-list').appendChild(item);
}

function buildOptionRowHTML(value, index) {
    return `
        <div class="option-row">
            <input class="form-input" type="text"
                placeholder="Opción ${index + 1}"
                value="${escapeHtml(value)}"
                aria-label="Opción ${index + 1}">
            <button class="btn-remove-opt" type="button" title="Quitar opción" aria-label="Quitar opción">✕</button>
        </div>
    `;
}

function reindexOptions(optionsList) {
    [...optionsList.children].forEach((row, i) => {
        const input = row.querySelector('input');
        if (input) {
            input.placeholder = `Opción ${i + 1}`;
            input.ariaLabel   = `Opción ${i + 1}`;
        }
    });
}

// ── Guardar reporte ──────────────────────────────────────────────────────────────

async function saveReportItem() {
    const title = $('#report-title-input').value.trim();

    if (!title) {
        showToast('⚠️ El título del reporte es obligatorio.');
        $('#report-title-input').focus();
        return;
    }

    const questions = collectQuestionsFromDOM();

    if (questions.length === 0) {
        showToast('⚠️ Agrega al menos una pregunta al reporte.');
        return;
    }

    for (const q of questions) {
        if (!q.label) {
            showToast('⚠️ Todas las preguntas deben tener un texto.');
            return;
        }
        if (q.type === 'select' && (!q.options || q.options.filter(Boolean).length < 2)) {
            showToast(`⚠️ La pregunta "${q.label}" necesita al menos 2 opciones.`);
            return;
        }
    }

    const access    = Object.keys(window._reportAccessMap || {});
    const sectionId = $('#report-section-select')?.value || null;
    const sectionName = sectionId
        ? (reportSections.find(s => s.id === sectionId)?.name || null)
        : null;

    const payload = {
        title,
        description: $('#report-desc-input').value.trim(),
        icon:        $('#report-icon').value || '📋',
        deadline:    $('#report-deadline').value || null,
        questions,
        access,
        sectionId,
        active: true,
    };

    setLoading(true);

    try {
        if (editingReportId) {
            await api(`/api/reports/${editingReportId}`, {
                method: 'PUT',
                body: JSON.stringify(payload),
            });
            showToast('✅ Reporte actualizado correctamente.');
        } else {
            await api('/api/reports', {
                method: 'POST',
                body: JSON.stringify(payload),
            });
            showToast('✅ Reporte creado correctamente.');
        }
        await loadManageReports();
    } catch (err) {
        // API no disponible: persistir solo en memoria para no perder el trabajo del usuario
        console.warn('[ReportManage] API no disponible, guardando en modo demo:', err.message);
        if (editingReportId) {
            const idx = manageReports.findIndex(r => r.id === editingReportId);
            if (idx !== -1) {
                manageReports[idx] = {
                    ...manageReports[idx], ...payload,
                    access: [...new Set(access)], individualAccess: access,
                    sectionId, sectionName,
                };
            }
        } else {
            manageReports.unshift({
                id: uid(), ...payload,
                access: [...new Set(access)], individualAccess: access,
                sectionId, sectionName,
            });
        }
        showToast('✅ Guardado en modo demo (sin persistencia).');
    } finally {
        setLoading(false);
        closeReportModal();
        renderManageReports($('#manage-search-input')?.value || '');
    }
}

function collectQuestionsFromDOM() {
    return $$('.question-item').map(item => {
        const q = {
            id:    item.dataset.qid,
            type:  item.dataset.type,
            label: item.querySelector('.q-label')?.value.trim() || '',
        };

        if (q.type === 'select') {
            q.options = [...item.querySelectorAll('.options-list .form-input')]
                .map(input => input.value.trim())
                .filter(Boolean);
        }

        return q;
    });
}

// ── Activar / desactivar ──────────────────────────────────────────────────────────

async function toggleReportActive(reportId, active) {
    const r = manageReports.find(x => x.id === reportId);
    if (r) r.active = active;

    const toggleLabel = $(`input.toggle-active[data-id="${reportId}"]`)
        ?.closest('.status-toggle')
        ?.querySelector('span');
    if (toggleLabel) toggleLabel.textContent = active ? 'Activo' : 'Inactivo';

    try {
        await api(`/api/reports/${reportId}`, {
            method: 'PUT',
            body: JSON.stringify({ active }),
        });
        showToast(active ? '✅ Reporte activado.' : '⏸ Reporte desactivado.');
    } catch (err) {
        console.error('[ReportManage] Error al actualizar estado:', err);
        if (r) r.active = !active;
        if (toggleLabel) toggleLabel.textContent = !active ? 'Activo' : 'Inactivo';
        showToast('❌ Error al cambiar el estado.');
    }
}

// ── Eliminar reporte ──────────────────────────────────────────────────────────────

async function deleteReportItem(reportId) {
    const r = manageReports.find(x => x.id === reportId);
    const confirmMsg = `¿Eliminar el reporte "${r?.title || reportId}"?\n\nEsta acción no se puede deshacer y eliminará todas las respuestas asociadas.`;

    if (!confirm(confirmMsg)) return;

    setLoading(true);

    try {
        await api(`/api/reports/${reportId}`, { method: 'DELETE' });
    } catch (err) {
        console.error('[ReportManage] Error al eliminar:', err);
        showToast('❌ Error al eliminar el reporte.');
        setLoading(false);
        return;
    }

    const card = $(`.report-card[data-id="${reportId}"]`, $('#reports-list'));
    if (card) {
        card.style.transition = 'opacity .25s, transform .25s';
        card.style.opacity    = '0';
        card.style.transform  = 'translateX(20px)';
    }

    setTimeout(() => {
        manageReports = manageReports.filter(r => r.id !== reportId);
        setLoading(false);
        renderManageReports($('#manage-search-input')?.value || '');
        showToast('🗑️ Reporte eliminado.');
    }, 250);
}

// ── Ver respuestas ──────────────────────────────────────────────────────────────

async function viewManageSubmissions(reportId) {
    const r = manageReports.find(x => x.id === reportId);
    $('#submissions-title').textContent = `Respuestas — ${r?.title || ''}`;

    const content = $('#submissions-content');
    content.innerHTML = `
        <div style="text-align:center; padding:3rem;">
            <div class="spinner" style="margin:auto;"></div>
        </div>`;

    toggleModal('modal-submissions', true);

    try {
        const subs = await api(`/api/reports/${reportId}/submissions`);
        renderManageSubmissionsTable(subs, r);
    } catch {
        renderManageSubmissionsTable(getDemoSubmissionsFor(reportId), r);
    }
}

function renderManageSubmissionsTable(subs, report) {
    const content = $('#submissions-content');

    if (!subs || subs.length === 0) {
        content.innerHTML = `
            <div class="empty-state" style="padding:2.5rem;">
                <div class="empty-state-icon">📭</div>
                <h3>Sin respuestas aún</h3>
                <p>Las personas con acceso aún no han completado este reporte.</p>
            </div>`;
        return;
    }

    const qs = report?.questions || [];

    const colHeaders = ['Persona', 'Enviado', ...qs.map(q => escapeHtml(q.label || q.type))];
    const thead = colHeaders.map(h => `<th>${h}</th>`).join('');

    const tbody = subs.map(s => {
        const nameCell      = escapeHtml(s.studentName || s.studentId || '—');
        const submittedCell = s.submittedAt
            ? escapeHtml(new Date(s.submittedAt).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' }))
            : '—';

        const answerCells = qs.map(q => {
            const ans = s.answers?.[q.id];
            if (!ans) return '<span style="color:var(--text-secondary,#aaa)">—</span>';
            if (q.type === 'image') {
                if (Array.isArray(ans) && ans.length > 0) {
                    return ans.map((url, i) =>
                        `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">📷 Imagen ${i + 1}</a>`
                    ).join('<br>');
                }
                return '<span style="color:var(--text-secondary,#aaa)">Sin imagen</span>';
            }
            return `<span title="${escapeHtml(String(ans))}">${escapeHtml(String(ans).slice(0, 80))}${String(ans).length > 80 ? '…' : ''}</span>`;
        });

        const cells = [`<strong>${nameCell}</strong>`, submittedCell, ...answerCells];
        return `<tr>${cells.map(c => `<td>${c}</td>`).join('')}</tr>`;
    }).join('');

    const accessCount = (report?.access || []).length;
    const pct         = accessCount > 0 ? Math.round((subs.length / accessCount) * 100) : 0;

    content.innerHTML = `
        <div style="display:flex; gap:1rem; flex-wrap:wrap; margin-bottom:1rem;">
            <div style="flex:1; background:var(--secondary-container,#E8DEF8); border-radius:12px; padding:0.8rem 1rem; text-align:center; min-width:100px;">
                <div style="font-size:1.4rem; font-weight:700; color:var(--accent-color,#6750A4);">${subs.length}</div>
                <div style="font-size:0.75rem; color:var(--text-secondary,#777);">Respuestas</div>
            </div>
            <div style="flex:1; background:var(--secondary-container,#E8DEF8); border-radius:12px; padding:0.8rem 1rem; text-align:center; min-width:100px;">
                <div style="font-size:1.4rem; font-weight:700; color:var(--accent-color,#6750A4);">${accessCount}</div>
                <div style="font-size:0.75rem; color:var(--text-secondary,#777);">Con acceso</div>
            </div>
            <div style="flex:1; background:var(--secondary-container,#E8DEF8); border-radius:12px; padding:0.8rem 1rem; text-align:center; min-width:100px;">
                <div style="font-size:1.4rem; font-weight:700; color:var(--accent-color,#6750A4);">${pct}%</div>
                <div style="font-size:0.75rem; color:var(--text-secondary,#777);">Completado</div>
            </div>
        </div>

        <div style="overflow-x:auto;">
            <table class="submissions-table">
                <thead><tr>${thead}</tr></thead>
                <tbody>${tbody}</tbody>
            </table>
        </div>
    `;
}

// ── Binding de eventos de gestión ──────────────────────────────────────────────────

function bindManageEvents() {
    $('#btn-new-report')?.addEventListener('click', () => openReportModal(null));

    $('#manage-modal-close-btn')?.addEventListener('click', closeReportModal);
    $('#manage-modal-cancel-btn')?.addEventListener('click', closeReportModal);
    $('#manage-modal-save-btn')?.addEventListener('click', saveReportItem);

    $('#submissions-close-btn')?.addEventListener('click', () => {
        toggleModal('modal-submissions', false);
    });

    [$('#modal-report'), $('#modal-submissions')].forEach(overlay => {
        overlay?.addEventListener('click', e => {
            if (e.target !== overlay) return;
            overlay.classList.remove('open');
            document.body.style.overflow = '';
            editingReportId = null;
        });
    });

    document.addEventListener('keydown', e => {
        if (e.key !== 'Escape') return;
        if ($('#modal-report')?.classList.contains('open')) closeReportModal();
        if ($('#modal-submissions')?.classList.contains('open')) toggleModal('modal-submissions', false);
    });

    $$('.btn-add-q').forEach(btn => {
        btn.addEventListener('click', () => addQuestionToDOM(btn.dataset.type));
    });

    $('#reports-list')?.addEventListener('click', e => {
        const editBtn = e.target.closest('.btn-edit');
        const delBtn  = e.target.closest('.btn-delete');
        const subBtn  = e.target.closest('.btn-submissions');
        const toggle  = e.target.closest('input.toggle-active');

        if (editBtn) openReportModal(editBtn.dataset.id);
        if (delBtn)  deleteReportItem(delBtn.dataset.id);
        if (subBtn)  viewManageSubmissions(subBtn.dataset.id);
        if (toggle)  toggleReportActive(toggle.dataset.id, toggle.checked);
    });

    $('#manage-search-input')?.addEventListener('input', e => {
        renderManageReports(e.target.value);
    });
}