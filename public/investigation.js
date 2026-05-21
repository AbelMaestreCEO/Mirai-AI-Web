/* ============================================
   MIRAI AI - Investigation Page Logic
   Frontend para el Investigador Web con IA
   Conecta con /api/investigation/search
   ============================================ */

'use strict';

// ── Guardia de página: solo corre en investigation.html ──
if (!document.getElementById('inv-input')) {
    // Si no existe el input del investigador, este script no hace nada.
    // app.js ya se encargó de la sidebar y las conversaciones.
    throw new Error('[investigation.js] No estoy en la página de investigación. Saliendo.');
}

// ════════════════════════════════════════════════════════════
// CONFIGURACIÓN
// ════════════════════════════════════════════════════════════

const INV_CONFIG = {
    API_ENDPOINT:   '/api/investigation/search',
    STEP_INTERVAL:  2200,     // ms entre mensajes de carga
    MAX_COPY_RESET: 2500,     // ms hasta restaurar el botón copiar
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
    isBusy:        false,
    loadingTimer:  null,
    stepIndex:     0,
    lastQuestion:  '',
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
};

// ════════════════════════════════════════════════════════════
// ANIMACIÓN DE CARGA
// ════════════════════════════════════════════════════════════

/**
 * Actualiza el estado visual de los chips de etapa.
 * Los chips anteriores al activo se marcan como "done".
 */
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

/**
 * Inicia la rotación de mensajes y chips mientras se espera la respuesta.
 */
function startLoadingAnimation() {
    invState.stepIndex = 0;

    const tick = () => {
        const step = LOADING_STEPS[invState.stepIndex % LOADING_STEPS.length];

        // Fade out → cambio de texto → fade in
        invEl.stepText.style.opacity = '0';
        setTimeout(() => {
            invEl.stepText.textContent = step.text;
            invEl.stepText.style.opacity = '1';
            setChipState(step.chip);
        }, 200);

        invState.stepIndex++;
    };

    tick(); // ejecutar inmediatamente
    invState.loadingTimer = setInterval(tick, INV_CONFIG.STEP_INTERVAL);
}

/**
 * Detiene la rotación y marca todos los chips como completados.
 */
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

/**
 * Resetea los chips a su estado inicial (sin clase).
 */
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

/**
 * Muestra u oculta el estado de carga en la UI.
 */
function setLoadingVisible(visible) {
    if (visible) {
        invEl.loading.classList.add('visible');
    } else {
        invEl.loading.classList.remove('visible');
    }
}

/**
 * Bloquea o desbloquea los controles de entrada mientras se procesa.
 */
function setControlsDisabled(disabled) {
    invEl.sendBtn.disabled = disabled;
    invEl.input.disabled   = disabled;
    invEl.sendBtn.style.opacity = disabled ? '0.5' : '1';
}

/**
 * Muestra un mensaje de error en la UI.
 */
function showError(message) {
    invEl.error.textContent = '⚠️ ' + message;
    invEl.error.classList.add('visible');
    invEl.error.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

/**
 * Oculta el bloque de error.
 */
function hideError() {
    invEl.error.classList.remove('visible');
    invEl.error.textContent = '';
}

/**
 * Escapa texto para insertarlo en HTML sin riesgos de XSS.
 */
function escHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ════════════════════════════════════════════════════════════
// RENDERIZADO DE RESULTADO
// ════════════════════════════════════════════════════════════

/**
 * Renderiza el resumen y las tarjetas de fuentes.
 * @param {object} data — { summary: string, sources: Array<{title,url,type}> }
 */
function renderResult(data) {
    const summary = (data.summary || '').trim();
    const sources = Array.isArray(data.sources) ? data.sources : [];

    // ── Resumen ──
    invEl.summaryBox.textContent = summary;

    // ── Contador de fuentes ──
    invEl.sourcesCount.textContent =
        sources.length === 0 ? 'sin fuentes' :
        sources.length === 1 ? '1 fuente'    :
        `${sources.length} fuentes`;

    // ── Tarjetas de fuentes ──
    invEl.sourcesGrid.innerHTML = '';
    sources.forEach(src => {
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

    // ── Mostrar sección con animación ──
    invEl.result.classList.add('visible');
    invEl.result.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ════════════════════════════════════════════════════════════
// LÓGICA PRINCIPAL — INVESTIGAR
// ════════════════════════════════════════════════════════════

/**
 * Orquesta todo el flujo:
 * 1. Valida la pregunta
 * 2. Resetea la UI
 * 3. Muestra la animación de carga
 * 4. Llama a /api/investigation/search
 * 5. Renderiza el resultado o muestra el error
 */
async function startInvestigation() {
    const question = invEl.input.value.trim();

    if (!question) {
        invEl.input.focus();
        return;
    }

    if (invState.isBusy) return;

    // ── Guardar pregunta por si el usuario quiere volver a lanzarla ──
    invState.lastQuestion = question;

    // ── Reset completo de la UI ──
    hideError();
    invEl.result.classList.remove('visible');
    invEl.summaryBox.textContent = '';
    invEl.sourcesGrid.innerHTML  = '';
    resetChips();

    // ── Activar estado de carga ──
    invState.isBusy = true;
    setControlsDisabled(true);
    setLoadingVisible(true);
    startLoadingAnimation();

    try {
        const response = await fetch(INV_CONFIG.API_ENDPOINT, {
            method:      'POST',
            credentials: 'same-origin',   // envía la cookie HttpOnly de sesión
            headers:     { 'Content-Type': 'application/json' },
            body:        JSON.stringify({ question }),
        });

        stopLoadingAnimation();

        if (!response.ok) {
            // Intentar parsear el error del servidor
            let serverError = `Error del servidor (${response.status})`;
            try {
                const errBody = await response.json();
                if (errBody.error) serverError = errBody.error;
            } catch (_) { /* ignorar si el body no es JSON */ }
            throw new Error(serverError);
        }

        const data = await response.json();

        // Validación mínima de la respuesta
        if (!data || typeof data.summary !== 'string') {
            throw new Error('La respuesta del servidor no tiene el formato esperado.');
        }

        renderResult(data);

    } catch (err) {
        stopLoadingAnimation();

        // Mensajes de error más amigables para casos comunes
        const msg = err.message.includes('Failed to fetch')
            ? 'No se pudo conectar con el servidor. Verifica tu conexión a internet.'
            : err.message;

        showError(msg);
        console.error('[investigation.js] Error en búsqueda:', err);

    } finally {
        setLoadingVisible(false);
        setControlsDisabled(false);
        invState.isBusy = false;
        invEl.input.focus();
    }
}

// ════════════════════════════════════════════════════════════
// BOTÓN COPIAR
// ════════════════════════════════════════════════════════════

/**
 * Copia el texto del resumen al portapapeles.
 * Muestra feedback visual de éxito o error.
 */
async function handleCopy() {
    const text = invEl.summaryBox.textContent || '';
    if (!text) return;

    const originalHTML = invEl.copyBtn.innerHTML;

    try {
        // API moderna de Clipboard
        await navigator.clipboard.writeText(text);
        showCopySuccess();
    } catch (_) {
        // Fallback para navegadores sin clipboard API (Safari antiguo, etc.)
        try {
            const range = document.createRange();
            range.selectNode(invEl.summaryBox);
            window.getSelection().removeAllRanges();
            window.getSelection().addRange(range);
            document.execCommand('copy');
            window.getSelection().removeAllRanges();
            showCopySuccess();
        } catch (fallbackErr) {
            showCopyError(originalHTML);
            console.error('[investigation.js] Error al copiar:', fallbackErr);
        }
    }

    function showCopySuccess() {
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
    }

    function showCopyError(original) {
        invEl.copyBtn.innerHTML = `
            <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor">
                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
            Error al copiar
        `;
        setTimeout(() => {
            invEl.copyBtn.innerHTML = original;
        }, 2000);
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
    // Textarea: resize automático + Enter para enviar
    invEl.input.addEventListener('input', autoResizeTextarea);
    invEl.input.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            startInvestigation();
        }
    });

    // Botón enviar
    invEl.sendBtn.addEventListener('click', startInvestigation);

    // Botón copiar
    invEl.copyBtn.addEventListener('click', handleCopy);
}

// ════════════════════════════════════════════════════════════
// INICIALIZACIÓN
// ════════════════════════════════════════════════════════════

function init() {
    setupEventListeners();

    // Hacer foco en el input al cargar la página
    invEl.input.focus();

    console.log('✅ [investigation.js] Investigador Web inicializado.');
}

// Ejecutar cuando el DOM esté listo.
// app.js ya usa DOMContentLoaded para el sidebar, así que esperamos
// al mismo evento para no crear condiciones de carrera.
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}