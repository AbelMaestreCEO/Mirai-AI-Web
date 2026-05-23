/* ============================================
   MIRAI AI - Investigation Page Logic
   Frontend para el Investigador Web con IA
   Conecta con /api/investigation/search
   ============================================ */

'use strict';

// ── Guardia de página: solo corre en investigation ──
if (!document.getElementById('inv-input')) {
    throw new Error('[investigation.js] No estoy en la página de investigación. Saliendo.');
}

// ════════════════════════════════════════════════════════════
// CONFIGURACIÓN
// ════════════════════════════════════════════════════════════

const INV_CONFIG = {
    API_ENDPOINT:   '/api/investigation/search',
    STEP_INTERVAL:  2200,
    MAX_COPY_RESET: 2500,
};

// ════════════════════════════════════════════════════════════
// MENSAJES ROTATIVOS DE CARGA
// ════════════════════════════════════════════════════════════

const LOADING_STEPS = [
    { text: 'Buscando en la web...',                   chip: 'chip-search' },
    { text: 'Buscando noticias recientes...',          chip: 'chip-search' },
    { text: 'Buscando artículos académicos...',        chip: 'chip-search' },
    { text: 'Consultando fuentes especializadas...',   chip: 'chip-search' },
    { text: 'Leyendo las páginas encontradas...',      chip: 'chip-read'   },
    { text: 'Extrayendo el contenido relevante...',    chip: 'chip-read'   },
    { text: 'Analizando cada fuente en detalle...',    chip: 'chip-read'   },
    { text: 'Preparando la investigación para ti...', chip: 'chip-filter' },
    { text: 'Filtrando información innecesaria...',    chip: 'chip-filter' },
    { text: 'Descartando contenido sin relevancia...', chip: 'chip-filter' },
    { text: 'La IA está redactando el resumen...',     chip: 'chip-write'  },
    { text: 'Parafraseando en tercera persona...',     chip: 'chip-write'  },
    { text: 'Organizando las fuentes citadas...',      chip: 'chip-write'  },
    { text: 'Revisando coherencia del texto...',       chip: 'chip-write'  },
    { text: 'Casi listo, últimos ajustes...',          chip: 'chip-write'  },
];

const CHIP_IDS = ['chip-search', 'chip-read', 'chip-filter', 'chip-write'];

// ════════════════════════════════════════════════════════════
// ESTADO
// ════════════════════════════════════════════════════════════

const invState = {
    isBusy:       false,
    loadingTimer: null,
    stepIndex:    0,
    lastQuestion: '',
    sources:      [],   // guardamos las fuentes para el botón APA
};

// ════════════════════════════════════════════════════════════
// REFERENCIAS AL DOM
// ════════════════════════════════════════════════════════════

const invEl = {
    input:        document.getElementById('inv-input'),
    sendBtn:      document.getElementById('inv-send-btn'),
    loading:      document.getElementById('inv-loading'),
    stepText:     document.getElementById('inv-step-text'),
    error:        document.getElementById('inv-error'),
    result:       document.getElementById('inv-result'),
    summaryBox:   document.getElementById('inv-summary-text'),
    sourcesCount: document.getElementById('inv-sources-count'),
    sourcesGrid:  document.getElementById('inv-sources-grid'),
    copyBtn:      document.getElementById('inv-copy-btn'),
    copyApaBtn:   document.getElementById('inv-copy-apa-btn'),
    apaBox:       document.getElementById('inv-apa-box'),
};

// ════════════════════════════════════════════════════════════
// ANIMACIÓN DE CARGA
// ════════════════════════════════════════════════════════════

function setChipState(activeChipId) {
    const activePos = CHIP_IDS.indexOf(activeChipId);
    CHIP_IDS.forEach((id, i) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.classList.remove('active', 'done');
        if (i < activePos)   el.classList.add('done');
        if (i === activePos) el.classList.add('active');
    });
}

function startLoadingAnimation() {
    invState.stepIndex = 0;
    const tick = () => {
        const step = LOADING_STEPS[invState.stepIndex % LOADING_STEPS.length];
        invEl.stepText.style.opacity = '0';
        setTimeout(() => {
            invEl.stepText.textContent = step.text;
            invEl.stepText.style.opacity = '1';
            setChipState(step.chip);
        }, 200);
        invState.stepIndex++;
    };
    tick();
    invState.loadingTimer = setInterval(tick, INV_CONFIG.STEP_INTERVAL);
}

function stopLoadingAnimation() {
    if (invState.loadingTimer) {
        clearInterval(invState.loadingTimer);
        invState.loadingTimer = null;
    }
    CHIP_IDS.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.classList.remove('active');
        el.classList.add('done');
    });
}

function resetChips() {
    CHIP_IDS.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.classList.remove('active', 'done');
    });
}

// ════════════════════════════════════════════════════════════
// UI HELPERS
// ════════════════════════════════════════════════════════════

function setLoadingVisible(visible) {
    invEl.loading.classList.toggle('visible', visible);
}

function setControlsDisabled(disabled) {
    invEl.sendBtn.disabled     = disabled;
    invEl.input.disabled       = disabled;
    invEl.sendBtn.style.opacity = disabled ? '0.5' : '1';
}

function showError(message) {
    invEl.error.textContent = '⚠️ ' + message;
    invEl.error.classList.add('visible');
    invEl.error.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function hideError() {
    invEl.error.classList.remove('visible');
    invEl.error.textContent = '';
}

function escHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ════════════════════════════════════════════════════════════
// APA 7 — GENERACIÓN DE REFERENCIAS
// ════════════════════════════════════════════════════════════

/**
 * Genera una referencia bibliográfica en formato APA 7 a partir
 * de los metadatos de una fuente.
 *
 * Formato APA 7 para páginas web:
 * Apellido, N. (Año, Día de Mes). Título del artículo. Nombre del sitio. URL
 *
 * Si no hay autor: Título del artículo. (Año). Nombre del sitio. URL
 */
function buildApaReference(src, index) {
    const url   = src.url   || '';
    const title = src.title || url || `Fuente ${index + 1}`;

    // ── Autor ──
    // Exa devuelve author como string libre (ej: "John Doe" o "John Doe, Jane Smith")
    let authorPart = '';
    if (src.author) {
        // Intentar convertir "Nombre Apellido" → "Apellido, N."
        // Si ya viene con coma (apellido, nombre) lo dejamos
        const names = src.author.split(',').map(s => s.trim());
        if (names.length >= 2) {
            // Ya viene "Apellido, Nombre" o "A, B, C"
            authorPart = names.map(n => {
                const parts = n.split(' ').filter(Boolean);
                if (parts.length < 2) return n;
                const last  = parts[parts.length - 1];
                const initials = parts.slice(0, -1).map(p => p[0] + '.').join(' ');
                return `${last}, ${initials}`;
            }).join(', & ');
        } else {
            // Un solo nombre: "Juan Pérez" → "Pérez, J."
            const parts = src.author.trim().split(' ').filter(Boolean);
            if (parts.length >= 2) {
                const last     = parts[parts.length - 1];
                const initials = parts.slice(0, -1).map(p => p[0] + '.').join(' ');
                authorPart = `${last}, ${initials}`;
            } else {
                authorPart = src.author.trim();
            }
        }
    }

    // ── Fecha ──
    // publishedDate de Exa viene en formato ISO: "2024-06-15T00:00:00.000Z" o "2024-06-15"
    let yearPart = 's.f.';  // sin fecha
    let fullDatePart = '';
    if (src.publishedDate) {
        try {
            const d = new Date(src.publishedDate);
            if (!isNaN(d.getTime())) {
                const year = d.getFullYear();
                const months = ['enero','febrero','marzo','abril','mayo','junio',
                                'julio','agosto','septiembre','octubre','noviembre','diciembre'];
                const month = months[d.getMonth()];
                const day   = d.getDate();
                yearPart     = String(year);
                fullDatePart = `${year}, ${day} de ${month}`;
            }
        } catch (_) { /* dejar s.f. */ }
    }

    // ── Nombre del sitio ──
    // Extraemos el hostname de la URL como nombre del sitio
    let siteName = '';
    try {
        siteName = new URL(url).hostname.replace('www.', '');
    } catch (_) { siteName = ''; }

    // ── Construir la referencia ──
    // APA 7 página web con autor:
    //   Apellido, N. (Año, D de Mes). Título. Nombre del sitio. URL
    // Sin autor:
    //   Título. (Año, D de Mes). Nombre del sitio. URL

    let ref = '';

    if (authorPart) {
        ref += `${authorPart}. `;
        ref += fullDatePart ? `(${fullDatePart}). ` : `(${yearPart}). `;
        ref += `${title}. `;
        if (siteName) ref += `${siteName}. `;
        ref += url;
    } else {
        ref += `${title}. `;
        ref += fullDatePart ? `(${fullDatePart}). ` : `(${yearPart}). `;
        if (siteName) ref += `${siteName}. `;
        ref += url;
    }

    return ref;
}

/**
 * Genera el bloque completo de referencias APA 7 de todas las fuentes.
 */
function buildApaBlock(sources) {
    if (!sources || sources.length === 0) return '';
    const refs = sources.map((src, i) => buildApaReference(src, i));
    return 'Referencias\n\n' + refs.map((r, i) => `[${i + 1}] ${r}`).join('\n\n');
}

// ════════════════════════════════════════════════════════════
// RENDERIZADO DE RESULTADO
// ════════════════════════════════════════════════════════════

/**
 * Renderiza el resumen, las tarjetas de fuentes y el bloque APA.
 * @param {object} data — { summary, sources: [{title, url, type, author, publishedDate}] }
 */
function renderResult(data) {
    const summary = (data.summary || '').trim();
    const sources = Array.isArray(data.sources) ? data.sources : [];

    // Guardar fuentes en el estado para el botón APA
    invState.sources = sources;

    // ── Resumen ──
    invEl.summaryBox.textContent = summary;

    // ── Contador de fuentes ──
    invEl.sourcesCount.textContent =
        sources.length === 0 ? 'sin fuentes' :
        sources.length === 1 ? '1 fuente'    :
        `${sources.length} fuentes`;

    // ── Tarjetas de fuentes ──
    invEl.sourcesGrid.innerHTML = '';
    sources.forEach((src, i) => {
        const typeKey   = src.type || 'web';
        const typeLabel = typeKey === 'academic' ? 'Académico'
                        : typeKey === 'news'     ? 'Noticia'
                        :                          'Web';

        const card = document.createElement('a');
        card.href      = src.url || '#';
        card.target    = '_blank';
        card.rel       = 'noopener noreferrer';
        card.className = 'inv-source-card';
        card.innerHTML = `
            <span class="inv-source-type ${escHtml(typeKey)}">${escHtml(typeLabel)}</span>
            <span class="inv-source-name">${escHtml(src.title || src.url || 'Fuente')}</span>
            <span class="inv-source-url">${escHtml(src.url || '')}</span>
        `;
        invEl.sourcesGrid.appendChild(card);
    });

    // ── Bloque APA ──
    const apaText = buildApaBlock(sources);
    if (invEl.apaBox) {
        invEl.apaBox.textContent = apaText;
    }

    // ── Mostrar sección con animación ──
    invEl.result.classList.add('visible');
    invEl.result.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ════════════════════════════════════════════════════════════
// LÓGICA PRINCIPAL — INVESTIGAR
// ════════════════════════════════════════════════════════════

async function startInvestigation() {
    const question = invEl.input.value.trim();
    if (!question) { invEl.input.focus(); return; }
    if (invState.isBusy) return;

    invState.lastQuestion = question;

    // Reset UI
    hideError();
    invEl.result.classList.remove('visible');
    invEl.summaryBox.textContent = '';
    invEl.sourcesGrid.innerHTML  = '';
    if (invEl.apaBox) invEl.apaBox.textContent = '';
    invState.sources = [];
    resetChips();

    // Activar carga
    invState.isBusy = true;
    setControlsDisabled(true);
    setLoadingVisible(true);
    startLoadingAnimation();

    try {
        const response = await fetch(INV_CONFIG.API_ENDPOINT, {
            method:      'POST',
            credentials: 'same-origin',
            headers:     { 'Content-Type': 'application/json' },
            body:        JSON.stringify({ question }),
        });

        stopLoadingAnimation();

        if (!response.ok) {
            let serverError = `Error del servidor (${response.status})`;
            try {
                const errBody = await response.json();
                if (errBody.error) serverError = errBody.error;
            } catch (_) {}
            throw new Error(serverError);
        }

        const data = await response.json();
        if (!data || typeof data.summary !== 'string') {
            throw new Error('La respuesta del servidor no tiene el formato esperado.');
        }

        renderResult(data);

    } catch (err) {
        stopLoadingAnimation();
        const msg = err.message.includes('Failed to fetch')
            ? 'No se pudo conectar con el servidor. Verifica tu conexión a internet.'
            : err.message;
        showError(msg);
        console.error('[investigation.js] Error:', err);

    } finally {
        setLoadingVisible(false);
        setControlsDisabled(false);
        invState.isBusy = false;
        invEl.input.focus();
    }
}

// ════════════════════════════════════════════════════════════
// BOTÓN COPIAR — RESUMEN
// ════════════════════════════════════════════════════════════

async function handleCopy() {
    const text = invEl.summaryBox.textContent || '';
    if (!text) return;

    const originalHTML = invEl.copyBtn.innerHTML;

    const onSuccess = () => {
        invEl.copyBtn.classList.add('copied');
        invEl.copyBtn.innerHTML = `
            <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor">
                <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
            </svg>
            ¡Copiado!
        `;
        setTimeout(() => {
            invEl.copyBtn.classList.remove('copied');
            invEl.copyBtn.innerHTML = originalHTML;
        }, INV_CONFIG.MAX_COPY_RESET);
    };

    try {
        await navigator.clipboard.writeText(text);
        onSuccess();
    } catch (_) {
        try {
            const range = document.createRange();
            range.selectNode(invEl.summaryBox);
            window.getSelection().removeAllRanges();
            window.getSelection().addRange(range);
            document.execCommand('copy');
            window.getSelection().removeAllRanges();
            onSuccess();
        } catch (fallbackErr) {
            console.error('[investigation.js] Error al copiar:', fallbackErr);
        }
    }
}

// ════════════════════════════════════════════════════════════
// BOTÓN COPIAR — BIBLIOGRAFÍA APA 7
// ════════════════════════════════════════════════════════════

async function handleCopyApa() {
    const text = invEl.apaBox ? invEl.apaBox.textContent : buildApaBlock(invState.sources);
    if (!text) return;

    const btn          = invEl.copyApaBtn;
    const originalHTML = btn.innerHTML;

    const onSuccess = () => {
        btn.classList.add('copied');
        btn.innerHTML = `
            <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor">
                <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
            </svg>
            ¡Bibliografía copiada!
        `;
        setTimeout(() => {
            btn.classList.remove('copied');
            btn.innerHTML = originalHTML;
        }, INV_CONFIG.MAX_COPY_RESET);
    };

    try {
        await navigator.clipboard.writeText(text);
        onSuccess();
    } catch (_) {
        try {
            const range = document.createRange();
            range.selectNode(invEl.apaBox);
            window.getSelection().removeAllRanges();
            window.getSelection().addRange(range);
            document.execCommand('copy');
            window.getSelection().removeAllRanges();
            onSuccess();
        } catch (fallbackErr) {
            console.error('[investigation.js] Error al copiar APA:', fallbackErr);
        }
    }
}

// ════════════════════════════════════════════════════════════
// AUTO-RESIZE DEL TEXTAREA
// ════════════════════════════════════════════════════════════

function autoResizeTextarea() {
    invEl.input.style.height = 'auto';
    invEl.input.style.height = Math.min(invEl.input.scrollHeight, 120) + 'px';
}

// ════════════════════════════════════════════════════════════
// REGISTRO DE EVENTOS
// ════════════════════════════════════════════════════════════

function setupEventListeners() {
    invEl.input.addEventListener('input',   autoResizeTextarea);
    invEl.input.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); startInvestigation(); }
    });
    invEl.sendBtn.addEventListener('click',    startInvestigation);
    invEl.copyBtn.addEventListener('click',    handleCopy);
    if (invEl.copyApaBtn) {
        invEl.copyApaBtn.addEventListener('click', handleCopyApa);
    }
}

// ════════════════════════════════════════════════════════════
// INICIALIZACIÓN
// ════════════════════════════════════════════════════════════

function init() {
    setupEventListeners();
    invEl.input.focus();
    console.log('✅ [investigation.js] Investigador Web inicializado.');
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}