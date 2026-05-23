/**
 * report_admin.js
 * Módulo de administración de reportes — exclusivo para profesores (role: 'teacher').
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * INTEGRACIÓN CON EL BACKEND (Cloudflare Workers + D1)
 * ─────────────────────────────────────────────────────────────────────────────
 * Ajusta BASE_URL a tu worker. Todos los endpoints requieren Authorization: Bearer <token>.
 *
 *   GET    /api/reports                        Lista de reportes del profesor autenticado
 *   POST   /api/reports                        Crear reporte  { title, description, icon, deadline, active, questions, access }
 *   PUT    /api/reports/:id                    Actualizar reporte (mismo body parcial)
 *   DELETE /api/reports/:id                    Eliminar reporte
 *   GET    /api/reports/:id/submissions        Respuestas enviadas por estudiantes
 *   GET    /api/students                       Lista de todos los estudiantes { id, name, email }
 *
 * Estructura de un reporte:
 *   {
 *     id: string,
 *     title: string,
 *     description: string,
 *     icon: string (emoji),
 *     deadline: string | null (YYYY-MM-DD),
 *     active: boolean,
 *     questions: [
 *       { id: string, type: 'text'|'select'|'time'|'date'|'image', label: string, options?: string[] }
 *     ],
 *     access: string[]   // array de student IDs con acceso
 *   }
 *
 * Estructura de una respuesta (submission):
 *   {
 *     id: string,
 *     reportId: string,
 *     studentId: string,
 *     studentName: string,
 *     submittedAt: string (ISO),
 *     answers: { [questionId]: string | string[] }
 *   }
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * USO EN report_admin:
 *   Sustituye el bloque <script type="module"> inline por:
 *   <script type="module" src="report_admin.js"></script>
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ══════════════════════════════════════════════════════════════════════════════
// CONFIGURACIÓN
// ══════════════════════════════════════════════════════════════════════════════

/** URL base de tu Cloudflare Worker / API REST. Deja vacío para usar rutas relativas. */
const BASE_URL = '';

/** Si true, usa datos demo cuando la API no responde (útil en desarrollo). */
const DEMO_MODE_FALLBACK = true;

// ══════════════════════════════════════════════════════════════════════════════
// UTILIDADES GENERALES
// ══════════════════════════════════════════════════════════════════════════════

/** Alias de querySelector */
const $ = (sel, ctx = document) => ctx.querySelector(sel);

/** Alias de querySelectorAll → Array */
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

/** Escapa HTML para evitar XSS al insertar strings en el DOM */
function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/** Genera un ID único simple basado en timestamp + random */
function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// ══════════════════════════════════════════════════════════════════════════════
// AUTENTICACIÓN
// ══════════════════════════════════════════════════════════════════════════════

function getToken() {
    // El sistema Mirai usa cookie HttpOnly para auth; este valor es complementario.
    return localStorage.getItem('mirai_auth_token') || '';
}

/**
 * Devuelve un objeto normalizado con los datos del usuario desde localStorage.
 * Claves reales del sistema: mirai_user_dni, mirai_user_name, mirai_user_role.
 */
function getUser() {
    return {
        dni:  localStorage.getItem('mirai_user_dni')  || '',
        name: localStorage.getItem('mirai_user_name') || '',
        role: localStorage.getItem('mirai_user_role') || '',  // 'teacher' | 'student'
    };
}

function logout() {
    // Limpiar las claves reales del sistema Mirai
    localStorage.removeItem('mirai_user_dni');
    localStorage.removeItem('mirai_user_name');
    localStorage.removeItem('mirai_user_role');
    localStorage.removeItem('mirai_auth_token');
    localStorage.removeItem('mirai-ai-conversation-id');
    window.location.href = 'login';
}

// ══════════════════════════════════════════════════════════════════════════════
// API CLIENT
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Realiza una petición autenticada a la API.
 * @param {string} path   - Ruta relativa, ej: '/api/reports'
 * @param {RequestInit} opts - Opciones fetch adicionales
 * @returns {Promise<any>} - JSON parseado
 * @throws {Error} - Si el servidor devuelve status >= 400
 */
async function api(path, opts = {}) {
    const response = await fetch(BASE_URL + path, {
        ...opts,
        credentials: 'same-origin',   // envía cookie HttpOnly igual que app.js
        headers: {
            'Content-Type': 'application/json',
            'X-User-DNI': localStorage.getItem('mirai_user_dni') || '',
            ...(opts.headers || {}),
        },
    });

    if (response.status === 401) {
        logout();
        throw new Error('No autorizado');
    }

    if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        throw new Error(`HTTP ${response.status}: ${errorBody}`);
    }

    if (response.status === 204) return null;

    return response.json();
}

// ══════════════════════════════════════════════════════════════════════════════
// UI HELPERS
// ══════════════════════════════════════════════════════════════════════════════

let toastTimer = null;

/**
 * Muestra un mensaje toast en la parte inferior de la pantalla.
 * @param {string} msg
 * @param {number} [duration=2800] - ms
 */
function showToast(msg, duration = 2800) {
    const toast = $('#toast');
    if (!toast) return;
    if (toastTimer) clearTimeout(toastTimer);
    toast.textContent = msg;
    toast.classList.add('show');
    toastTimer = setTimeout(() => toast.classList.remove('show'), duration);
}

/**
 * Activa / desactiva el overlay de carga global.
 * @param {boolean} on
 */
function setLoading(on) {
    const overlay = $('#loading-overlay');
    if (overlay) overlay.classList.toggle('show', on);
}

/**
 * Abre o cierra un modal por su ID.
 * @param {string} modalId
 * @param {boolean} open
 */
function toggleModal(modalId, open) {
    const modal = $(`#${modalId}`);
    if (!modal) return;
    modal.classList.toggle('open', open);
    document.body.style.overflow = open ? 'hidden' : '';
}

// ══════════════════════════════════════════════════════════════════════════════
// ESTADO GLOBAL
// ══════════════════════════════════════════════════════════════════════════════

/** @type {Array<Object>} Lista de reportes del profesor */
let reports = [];

/** @type {Array<Object>} Lista de estudiantes del sistema */
let students = [];

/** @type {string|null} ID del reporte que se está editando; null = crear nuevo */
let editingId = null;

/** Contador incremental para IDs de preguntas dentro del DOM */
let qCounter = 0;

// ══════════════════════════════════════════════════════════════════════════════
// DATOS DEMO (fallback cuando la API no está disponible)
// ══════════════════════════════════════════════════════════════════════════════

function getDemoReports() {
    return [
        {
            id: 'r_demo_1',
            title: 'Reporte de práctica semanal',
            description: 'Documenta las actividades realizadas durante la semana de práctica.',
            icon: '📋',
            deadline: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
            active: true,
            questions: [
                { id: 'q1', type: 'text',   label: '¿Qué actividades realizaste esta semana?' },
                { id: 'q2', type: 'select',  label: 'Nivel de dificultad', options: ['Fácil', 'Medio', 'Difícil'] },
                { id: 'q3', type: 'time',    label: 'Hora de inicio de la actividad principal' },
                { id: 'q4', type: 'date',    label: 'Fecha de realización' },
                { id: 'q5', type: 'image',   label: 'Foto de evidencia' },
            ],
            access: ['s_demo_1', 's_demo_2'],
        },
        {
            id: 'r_demo_2',
            title: 'Laboratorio #3 — Química',
            description: 'Reporte de resultados del experimento de titulación ácido-base.',
            icon: '🧪',
            deadline: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
            active: false,
            questions: [
                { id: 'q1', type: 'text',  label: 'Describe el procedimiento seguido.' },
                { id: 'q2', type: 'text',  label: '¿Cuáles fueron tus resultados?' },
                { id: 'q3', type: 'image', label: 'Foto del experimento' },
            ],
            access: ['s_demo_1', 's_demo_3'],
        },
    ];
}

function getDemoStudents() {
    return [
        { id: 's_demo_1', name: 'Ana García',   email: 'ana@email.com' },
        { id: 's_demo_2', name: 'Luis Pérez',   email: 'luis@email.com' },
        { id: 's_demo_3', name: 'María López',  email: 'maria@email.com' },
        { id: 's_demo_4', name: 'Carlos Ruiz',  email: 'carlos@email.com' },
    ];
}

function getDemoSubmissions(reportId) {
    const report = reports.find(r => r.id === reportId);
    if (!report || !report.questions) return [];

    return report.access.slice(0, 1).map(studentId => {
        const student = students.find(s => s.id === studentId);
        const answers = {};
        report.questions.forEach(q => {
            if (q.type === 'text')   answers[q.id] = 'Respuesta de ejemplo del estudiante.';
            if (q.type === 'select') answers[q.id] = q.options?.[0] || 'Opción 1';
            if (q.type === 'time')   answers[q.id] = '09:30';
            if (q.type === 'date')   answers[q.id] = new Date().toISOString().slice(0, 10);
            if (q.type === 'image')  answers[q.id] = null; // en demo no hay imágenes reales
        });
        return {
            id: uid(),
            reportId,
            studentId,
            studentName: student?.name || studentId,
            submittedAt: new Date().toISOString(),
            answers,
        };
    });
}

// ══════════════════════════════════════════════════════════════════════════════
// CARGA DE DATOS
// ══════════════════════════════════════════════════════════════════════════════

async function loadData() {
    setLoading(true);
    try {
        reports = await api('/api/reports');
    } catch (err) {
        console.warn('[ReportAdmin] API no disponible, usando demo:', err.message);
        if (DEMO_MODE_FALLBACK) {
            reports = getDemoReports();
            showToast('ℹ️ Modo demo — conecta tu API para persistir datos.');
        }
    } finally {
        setLoading(false);
        renderReports();
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// RENDERIZADO DE LA LISTA DE REPORTES
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Renderiza la lista de reportes aplicando un filtro de texto opcional.
 * @param {string} [filter='']
 */
function renderReports(filter = '') {
    const list  = $('#reports-list');
    const empty = $('#empty-state');
    if (!list) return;

    const query    = filter.toLowerCase().trim();
    const filtered = reports.filter(r =>
        r.title.toLowerCase().includes(query) ||
        (r.description || '').toLowerCase().includes(query)
    );

    list.innerHTML = '';

    if (filtered.length === 0) {
        if (empty) empty.style.display = 'block';
        return;
    }

    if (empty) empty.style.display = 'none';

    filtered.forEach(r => {
        const card = buildReportCard(r);
        list.appendChild(card);
    });
}

/**
 * Construye el DOM de una tarjeta de reporte.
 * @param {Object} r - Objeto reporte
 * @returns {HTMLElement}
 */
function buildReportCard(r) {
    const accessCount = (r.access || []).length;
    const qCount      = (r.questions || []).length;
    const deadlineBadge = r.deadline ? buildDeadlineBadge(r.deadline) : '';

    const card = document.createElement('div');
    card.className  = 'report-card';
    card.dataset.id = r.id;

    card.innerHTML = `
        <div class="report-card-icon">${escapeHtml(r.icon || '📋')}</div>

        <div class="report-card-info">
            <div class="report-card-title">${escapeHtml(r.title)}</div>
            <div class="report-card-meta">
                <span class="report-meta-chip">❓ ${qCount} pregunta${qCount !== 1 ? 's' : ''}</span>
                <span class="report-meta-chip">👥 ${accessCount} estudiante${accessCount !== 1 ? 's' : ''}</span>
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

/**
 * Genera el HTML del badge de fecha límite con colores según urgencia.
 * @param {string} deadline - Fecha en formato YYYY-MM-DD
 * @returns {string}
 */
function buildDeadlineBadge(deadline) {
    const d    = new Date(deadline + 'T00:00:00');
    const now  = new Date();
    const diff = Math.ceil((d - now) / 86400000);

    let cls, label;
    if (diff < 0)       { cls = 'deadline-urgent'; label = 'Vencido'; }
    else if (diff === 0){ cls = 'deadline-urgent'; label = 'Hoy'; }
    else if (diff <= 2) { cls = 'deadline-soon';   label = `${diff}d restantes`; }
    else                { cls = 'deadline-ok';     label = deadline; }

    return `<span class="report-meta-chip ${cls}" style="
        ${cls === 'deadline-urgent' ? 'background:#FFEBEE;color:#C62828;' : ''}
        ${cls === 'deadline-soon'   ? 'background:#FFF8E1;color:#F57F17;' : ''}
        ${cls === 'deadline-ok'     ? ''                                   : ''}
    ">📅 ${escapeHtml(label)}</span>`;
}

// ══════════════════════════════════════════════════════════════════════════════
// MODAL DE CREAR / EDITAR REPORTE
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Abre el modal de edición/creación.
 * @param {string|null} reportId - null para crear, string para editar
 */
function openModal(reportId = null) {
    editingId = reportId;
    qCounter  = 0;

    // Limpiar formulario
    $('#report-title-input').value = '';
    $('#report-desc-input').value  = '';
    $('#report-deadline').value    = '';
    $('#report-icon').value        = '📋';
    $('#questions-list').innerHTML = '';

    if (reportId) {
        $('#modal-title').textContent = 'Editar Reporte';
        const r = reports.find(x => x.id === reportId);
        if (r) {
            $('#report-title-input').value = r.title        || '';
            $('#report-desc-input').value  = r.description  || '';
            $('#report-deadline').value    = r.deadline     || '';
            $('#report-icon').value        = r.icon         || '📋';
            (r.questions || []).forEach(q => addQuestionToDOM(q.type, q));
        }
    } else {
        $('#modal-title').textContent = 'Crear Reporte';
    }

    renderStudentAccessList(reportId);
    toggleModal('modal-report', true);
}

/** Cierra el modal de edición. */
function closeModal() {
    toggleModal('modal-report', false);
    editingId = null;
    window._accessMap = {};
}

// ── Búsqueda y gestión de acceso de usuarios ─────────────────────────────────

/**
 * Enmascara un email: a***r@g**.com
 * @param {string} email
 * @returns {string}
 */
function maskEmail(email) {
    if (!email || !email.includes('@')) return email;
    const [local, domain] = email.split('@');
    const [domName, ...domExt] = domain.split('.');

    const maskPart = str => str.length <= 2
        ? str[0] + '*'.repeat(str.length - 1)
        : str[0] + '*'.repeat(str.length - 2) + str[str.length - 1];

    return maskPart(local) + '@' + maskPart(domName) + '.' + domExt.join('.');
}

/**
 * Inicializa la sección de acceso: buscador por cédula + lista de agregados.
 * @param {string|null} reportId
 */
function renderStudentAccessList(reportId) {
    const container = $('#student-list');
    if (!container) return;

    // Cargar accesos previos si se está editando
    const currentAccess = reportId
        ? (reports.find(r => r.id === reportId)?.access || [])
        : [];

    // accessMap: { dni: { dni, firstName, lastName, email } }
    // Se puebla con los usuarios ya agregados al abrir el modal
    if (!window._accessMap) window._accessMap = {};
    window._accessMap = {};

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
        <input type="hidden" id="access-dns-hidden">
    `;

    // Pre-cargar usuarios ya en la lista de acceso (solo en edición)
    if (currentAccess.length > 0) {
        currentAccess.forEach(dni => {
            // Intentar recuperar datos del array global students si existe
            const found = (typeof students !== 'undefined' ? students : []).find(s => String(s.id) === String(dni) || String(s.dni) === String(dni));
            if (found) {
                const u = {
                    dni:       String(found.id || found.dni),
                    firstName: found.name?.split(' ')[0] || found.first_name || '',
                    lastName:  found.name?.split(' ').slice(1).join(' ') || found.last_name || '',
                    email:     found.email || '',
                };
                window._accessMap[u.dni] = u;
            } else {
                // Sin datos locales, agregar solo con DNI
                window._accessMap[String(dni)] = { dni: String(dni), firstName: '—', lastName: '', email: '' };
            }
        });
        renderAccessAddedList();
    }

    // Evento buscar
    $('#access-search-btn').addEventListener('click', searchUserByDni);
    $('#access-search-dni').addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); searchUserByDni(); }
    });
}

/**
 * Llama a la API buscando un usuario por su cédula.
 */
async function searchUserByDni() {
    const input   = $('#access-search-dni');
    const resultEl = $('#access-search-result');
    const dni     = input?.value.trim();

    if (!dni) { showToast('Escribe una cédula para buscar.'); return; }

    resultEl.innerHTML = `<span style="font-size:0.82rem;color:var(--text-secondary,#888);">Buscando…</span>`;

    try {
        const user = await api(`/api/users/search?dni=${encodeURIComponent(dni)}`);
        // Respuesta esperada: { dni, first_name, last_name, email }
        renderSearchResult(user, resultEl);
    } catch (err) {
        if (DEMO_MODE_FALLBACK) {
            // Demo: simular resultado
            renderSearchResult({
                dni,
                first_name: 'Usuario',
                last_name:  'Demo',
                email:      'usuario@demo.com',
            }, resultEl);
        } else {
            resultEl.innerHTML = `<span style="font-size:0.82rem;color:#e53935;">Usuario no encontrado.</span>`;
        }
    }
}

/**
 * Muestra el resultado de búsqueda con botón para agregar.
 * @param {Object} user  { dni, first_name, last_name, email }
 * @param {HTMLElement} container
 */
function renderSearchResult(user, container) {
    const dni       = String(user.dni);
    const already   = !!window._accessMap[dni];
    const initials  = ((user.first_name?.[0] || '') + (user.last_name?.[0] || '')).toUpperCase() || '?';
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
            window._accessMap[dni] = {
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

/**
 * Re-renderiza la lista de usuarios ya agregados al acceso del reporte.
 */
function renderAccessAddedList() {
    const list = $('#access-added-list');
    if (!list) return;
    list.innerHTML = '';

    const entries = Object.values(window._accessMap);

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
            delete window._accessMap[u.dni];
            renderAccessAddedList();
        });

        list.appendChild(row);
    });
}

// ── Constructor de preguntas ──────────────────────────────────────────────────

const QUESTION_TYPE_LABELS = {
    text:   'Texto',
    select: 'Selección',
    time:   'Hora',
    date:   'Fecha',
    image:  'Imagen',
};

/**
 * Añade una pregunta al DOM del constructor de reportes.
 * @param {'text'|'select'|'time'|'date'|'image'} type
 * @param {Object|null} [existing] - Datos previos si se está editando
 */
function addQuestionToDOM(type, existing = null) {
    const domId = `q${++qCounter}`;
    const item  = document.createElement('div');
    item.className       = 'question-item';
    item.dataset.qid     = existing?.id || domId;
    item.dataset.type    = type;

    let extraHtml = '';

    if (type === 'select') {
        const opts = existing?.options?.length ? existing.options : ['', ''];
        const optsHtml = opts.map((o, i) => buildOptionRowHTML(o, i)).join('');
        extraHtml = `
            <div class="options-list">${optsHtml}</div>
            <button class="btn-add-opt" type="button">+ Añadir opción</button>
        `;
    } else if (type === 'image') {
        extraHtml = `
            <p style="font-size:0.78rem;color:var(--text-secondary,#777);margin-top:4px;">
                El estudiante podrá subir una o más imágenes (JPG, PNG, WebP · máx 5 MB c/u).
            </p>`;
    } else if (type === 'time') {
        extraHtml = `<p style="font-size:0.78rem;color:var(--text-secondary,#777);margin-top:4px;">
            Campo de hora (HH:MM).
        </p>`;
    } else if (type === 'date') {
        extraHtml = `<p style="font-size:0.78rem;color:var(--text-secondary,#777);margin-top:4px;">
            Campo de fecha (YYYY-MM-DD).
        </p>`;
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

    // ── Eventos del ítem ────────────────────────────────────────────────────

    // Eliminar pregunta
    item.querySelector('.remove-q').addEventListener('click', () => item.remove());

    // Select: eliminar opción (delegado al options-list)
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

    // Select: añadir opción
    const addOptBtn = item.querySelector('.btn-add-opt');
    if (addOptBtn) {
        addOptBtn.addEventListener('click', () => {
            const idx = optionsList.children.length;
            const row = document.createElement('div');
            row.className   = 'option-row';
            row.innerHTML   = buildOptionRowHTML('', idx);
            optionsList.appendChild(row);
        });
    }

    $('#questions-list').appendChild(item);
}

/**
 * HTML de una fila de opción dentro de un select-type question.
 * @param {string} value
 * @param {number} index
 * @returns {string}
 */
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

/**
 * Actualiza los placeholders de las opciones al eliminar una.
 * @param {HTMLElement} optionsList
 */
function reindexOptions(optionsList) {
    [...optionsList.children].forEach((row, i) => {
        const input = row.querySelector('input');
        if (input) {
            input.placeholder  = `Opción ${i + 1}`;
            input.ariaLabel    = `Opción ${i + 1}`;
        }
    });
}

// ══════════════════════════════════════════════════════════════════════════════
// GUARDAR REPORTE
// ══════════════════════════════════════════════════════════════════════════════

/** Lee el formulario, valida y llama a la API para crear o actualizar un reporte. */
async function saveReport() {
    const title = $('#report-title-input').value.trim();

    if (!title) {
        showToast('⚠️ El título del reporte es obligatorio.');
        $('#report-title-input').focus();
        return;
    }

    // Recolectar preguntas del DOM
    const questions = collectQuestionsFromDOM();

    if (questions.length === 0) {
        showToast('⚠️ Agrega al menos una pregunta al reporte.');
        return;
    }

    // Validar que cada pregunta tenga texto
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

    // Recolectar acceso de usuarios desde el mapa de búsqueda
    const access = Object.keys(window._accessMap || {});

    const payload = {
        title,
        description: $('#report-desc-input').value.trim(),
        icon:        $('#report-icon').value || '📋',
        deadline:    $('#report-deadline').value || null,
        questions,
        access,
        active:      true,
    };

    setLoading(true);

    try {
        if (editingId) {
            // ── ACTUALIZAR ────────────────────────────────────────────────────
            await api(`/api/reports/${editingId}`, {
                method: 'PUT',
                body: JSON.stringify(payload),
            });
            // Actualizar estado local
            const idx = reports.findIndex(r => r.id === editingId);
            if (idx !== -1) reports[idx] = { ...reports[idx], ...payload };
            showToast('✅ Reporte actualizado correctamente.');
        } else {
            // ── CREAR ─────────────────────────────────────────────────────────
            const created = await api('/api/reports', {
                method: 'POST',
                body: JSON.stringify(payload),
            });
            const newReport = { id: created?.id || uid(), ...payload };
            reports.unshift(newReport);
            showToast('✅ Reporte creado correctamente.');
        }
    } catch (err) {
        if (DEMO_MODE_FALLBACK) {
            // Modo demo: persistir solo en memoria
            if (editingId) {
                const idx = reports.findIndex(r => r.id === editingId);
                if (idx !== -1) reports[idx] = { id: editingId, ...payload };
            } else {
                reports.unshift({ id: uid(), ...payload });
            }
            showToast('✅ Guardado en modo demo (sin persistencia).');
        } else {
            console.error('[ReportAdmin] Error al guardar:', err);
            showToast('❌ Error al guardar. Intenta de nuevo.');
            setLoading(false);
            return;
        }
    } finally {
        setLoading(false);
        closeModal();
        renderReports($('#search-input')?.value || '');
    }
}

/**
 * Extrae todas las preguntas del DOM del constructor.
 * @returns {Array<Object>}
 */
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

// ══════════════════════════════════════════════════════════════════════════════
// TOGGLE ACTIVO / INACTIVO
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Activa o desactiva un reporte actualizando la API y el estado local.
 * @param {string} reportId
 * @param {boolean} active
 */
async function toggleActive(reportId, active) {
    // Optimistic UI
    const r = reports.find(x => x.id === reportId);
    if (r) r.active = active;

    // Actualizar texto del toggle en el DOM sin re-renderizar todo
    const toggleLabel = $(`input.toggle-active[data-id="${reportId}"]`)
        ?.closest('.status-toggle')
        ?.querySelector('span');
    if (toggleLabel) toggleLabel.textContent = active ? 'Activo' : 'Inactivo';

    try {
        await api(`/api/reports/${reportId}`, {
            method: 'PUT',
            body: JSON.stringify({ active }),
        });
    } catch (err) {
        // En modo demo la falla es silenciosa
        if (!DEMO_MODE_FALLBACK) {
            console.error('[ReportAdmin] Error al actualizar estado:', err);
            // Revertir
            if (r) r.active = !active;
            showToast('❌ Error al cambiar el estado.');
        }
    }

    showToast(active ? '✅ Reporte activado.' : '⏸ Reporte desactivado.');
}

// ══════════════════════════════════════════════════════════════════════════════
// ELIMINAR REPORTE
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Solicita confirmación y elimina un reporte.
 * @param {string} reportId
 */
async function deleteReport(reportId) {
    const r = reports.find(x => x.id === reportId);
    const confirmMsg = `¿Eliminar el reporte "${r?.title || reportId}"?\n\nEsta acción no se puede deshacer y eliminará todas las respuestas asociadas.`;

    if (!confirm(confirmMsg)) return;

    setLoading(true);

    try {
        await api(`/api/reports/${reportId}`, { method: 'DELETE' });
    } catch (err) {
        if (!DEMO_MODE_FALLBACK) {
            console.error('[ReportAdmin] Error al eliminar:', err);
            showToast('❌ Error al eliminar el reporte.');
            setLoading(false);
            return;
        }
    } finally {
        // Animar salida del card antes de actualizar lista
        const card = $(`[data-id="${reportId}"]`, $('#reports-list'));
        if (card) {
            card.style.transition = 'opacity .25s, transform .25s';
            card.style.opacity    = '0';
            card.style.transform  = 'translateX(20px)';
        }

        setTimeout(() => {
            reports = reports.filter(r => r.id !== reportId);
            setLoading(false);
            renderReports($('#search-input')?.value || '');
            showToast('🗑️ Reporte eliminado.');
        }, 250);
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// VER RESPUESTAS (SUBMISSIONS)
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Abre el modal de respuestas y carga los datos del servidor.
 * @param {string} reportId
 */
async function viewSubmissions(reportId) {
    const r = reports.find(x => x.id === reportId);
    $('#submissions-title').textContent = `Respuestas — ${r?.title || ''}`;

    const content = $('#submissions-content');
    content.innerHTML = `
        <div style="text-align:center; padding:3rem;">
            <div class="spinner" style="margin:auto;"></div>
        </div>`;

    toggleModal('modal-submissions', true);

    try {
        const subs = await api(`/api/reports/${reportId}/submissions`);
        renderSubmissionsTable(subs, r);
    } catch {
        if (DEMO_MODE_FALLBACK) {
            renderSubmissionsTable(getDemoSubmissions(reportId), r);
        } else {
            renderSubmissionsTable([], r);
        }
    }
}

/**
 * Renderiza la tabla de respuestas en el modal de submissions.
 * @param {Array<Object>} subs
 * @param {Object} report
 */
function renderSubmissionsTable(subs, report) {
    const content = $('#submissions-content');

    if (!subs || subs.length === 0) {
        content.innerHTML = `
            <div class="empty-state" style="padding:2.5rem;">
                <div class="empty-state-icon">📭</div>
                <h3>Sin respuestas aún</h3>
                <p>Los estudiantes con acceso aún no han completado este reporte.</p>
            </div>`;
        return;
    }

    const qs = report?.questions || [];

    // ── Tabla principal ──────────────────────────────────────────────────────
    const colHeaders = ['Estudiante', 'Enviado', ...qs.map(q => escapeHtml(q.label || q.type))];
    const thead = colHeaders.map(h => `<th>${h}</th>`).join('');

    const tbody = subs.map(s => {
        const studentCell    = escapeHtml(s.studentName || s.studentId || '—');
        const submittedCell  = s.submittedAt
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

        const cells = [
            `<strong>${studentCell}</strong>`,
            submittedCell,
            ...answerCells,
        ];

        return `<tr>${cells.map(c => `<td>${c}</td>`).join('')}</tr>`;
    }).join('');

    // ── Resumen ──────────────────────────────────────────────────────────────
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

// ══════════════════════════════════════════════════════════════════════════════
// BINDING DE EVENTOS
// ══════════════════════════════════════════════════════════════════════════════

function bindEvents() {
    // ── Nuevo reporte ─────────────────────────────────────────────────────────
    $('#btn-new-report')?.addEventListener('click', () => openModal(null));

    // ── Modal edición: cerrar ─────────────────────────────────────────────────
    $('#modal-close-btn')?.addEventListener('click', closeModal);
    $('#modal-cancel-btn')?.addEventListener('click', closeModal);

    // ── Modal edición: guardar ────────────────────────────────────────────────
    $('#modal-save-btn')?.addEventListener('click', saveReport);

    // ── Modal submissions: cerrar ─────────────────────────────────────────────
    $('#submissions-close-btn')?.addEventListener('click', () => {
        toggleModal('modal-submissions', false);
    });

    // ── Cerrar modales al hacer click en el overlay ───────────────────────────
    $$('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', e => {
            if (e.target !== overlay) return;
            overlay.classList.remove('open');
            document.body.style.overflow = '';
            editingId = null;
        });
    });

    // ── Cerrar con Escape ─────────────────────────────────────────────────────
    document.addEventListener('keydown', e => {
        if (e.key !== 'Escape') return;
        $$('.modal-overlay.open').forEach(m => {
            m.classList.remove('open');
            document.body.style.overflow = '';
            editingId = null;
        });
    });

    // ── Botones de tipo de pregunta ───────────────────────────────────────────
    $$('.btn-add-q').forEach(btn => {
        btn.addEventListener('click', () => addQuestionToDOM(btn.dataset.type));
    });

    // ── Acciones sobre tarjetas (delegación) ──────────────────────────────────
    $('#reports-list')?.addEventListener('click', e => {
        const editBtn  = e.target.closest('.btn-edit');
        const delBtn   = e.target.closest('.btn-delete');
        const subBtn   = e.target.closest('.btn-submissions');
        const toggle   = e.target.closest('input.toggle-active');

        if (editBtn)  openModal(editBtn.dataset.id);
        if (delBtn)   deleteReport(delBtn.dataset.id);
        if (subBtn)   viewSubmissions(subBtn.dataset.id);
        if (toggle)   toggleActive(toggle.dataset.id, toggle.checked);
    });

    // ── Buscador ──────────────────────────────────────────────────────────────
    $('#search-input')?.addEventListener('input', e => {
        renderReports(e.target.value);
    });

    // ── Logout ────────────────────────────────────────────────────────────────
    $('#logout-btn')?.addEventListener('click', logout);
}

// ══════════════════════════════════════════════════════════════════════════════
// INICIALIZACIÓN
// ══════════════════════════════════════════════════════════════════════════════

async function init() {
    const user = getUser();

    // ── Verificación de rol ───────────────────────────────────────────────────
    if (!user || user.role !== 'teacher') {
        const denied  = $('#access-denied');
        const content = $('#main-content');
        if (denied)  denied.style.display  = 'flex';
        if (content) content.style.display = 'none';
        return; // Detener ejecución — no hay nada más que hacer
    }

    // ── Mostrar contenido ─────────────────────────────────────────────────────
    const content = $('#main-content');
    if (content) content.style.display = 'block';

    // ── Cargar datos y enlazar eventos ────────────────────────────────────────
    await loadData();
    bindEvents();
}

// ── Arrancar cuando el DOM esté listo ────────────────────────────────────────
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}