// ============================================
// MIRAI MIRROR - app-mirror.js (Corregido)
// Tema y Sidebar → delegados a mirai-boot.js / MiraiApp
// Clave de tema UNIFICADA: 'mirai-ai-theme'
// ============================================

const MIRROR_CONFIG = {
    API_ENDPOINT: '/api/process',
    MAX_FILE_SIZE: 50 * 1024 * 1024,
    ALLOWED_TYPES: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic'],
    MAX_FILES: 200
};

const elements = {
    dropZone:          document.getElementById('dropZone'),
    imageInput:        document.getElementById('imageInput'),
    previewContainer:  document.getElementById('previewContainer'),
    imageList:         document.getElementById('imageList'),
    processBtn:        document.getElementById('processBtn'),
    downloadBtn:       document.getElementById('downloadBtn'),
    resetBtn:          document.getElementById('resetBtn'),
    statusMessage:     document.getElementById('statusMessage'),
    loadingSpinner:    document.getElementById('loadingSpinner'),
    expirationWarning: document.getElementById('expirationWarning')
};

let state = {
    selectedFiles: [],
    processedBlob: null,
    isProcessing: false
};

// ============================================
// GESTIÓN DE TEMA — DELEGADA A MIRAI-BOOT.JS
// La clave universal es 'mirai-ai-theme'.
// mirai-boot.js ya aplica el tema antes de que
// este script corra. Solo mantenemos las
// funciones por compatibilidad interna.
// ============================================
const THEME_KEY = 'mirai-ai-theme'; // ← UNIFICADA

function initLocalTheme() {
    const savedTheme = localStorage.getItem(THEME_KEY)
        || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', savedTheme);
    syncThemeIcons(savedTheme);
}

function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(THEME_KEY, theme);
    syncThemeIcons(theme);
}

function syncThemeIcons(theme) {
    const sun  = document.querySelector('.sun-icon');
    const moon = document.querySelector('.moon-icon');
    if (!sun || !moon) return;
    if (theme === 'dark') {
        sun.classList.add('hidden');
        moon.classList.remove('hidden');
    } else {
        sun.classList.remove('hidden');
        moon.classList.add('hidden');
    }
}

function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    setTheme(current === 'dark' ? 'light' : 'dark');
}

// ============================================
// INICIALIZACIÓN
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    // El tema ya fue aplicado por mirai-boot.js.
    // Solo asegurar que el toggle de Mirror esté vinculado
    // si mirai-boot.js no lo encontró (id="themeToggle" en mirror).
    const themeToggle = document.getElementById('themeToggle')
                     || document.getElementById('theme-toggle');
    if (themeToggle && !themeToggle.dataset.bootInit) {
        themeToggle.addEventListener('click', toggleTheme);
        themeToggle.dataset.bootInit = 'true';
    }
    // Sincronizar iconos por si acaso
    syncThemeIcons(document.documentElement.getAttribute('data-theme') || 'light');

    // Inicializar lógica de Mirror
    if (!elements.dropZone || !elements.imageInput) {
        console.error('CRÍTICO: Elementos del DOM no encontrados. Verifica el HTML.');
        return;
    }
    setupDropZone();
    setupButtons();
    updateUIState();
});

// ============================================
// DROP ZONE
// ============================================
function setupDropZone() {
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(evt => {
        elements.dropZone.addEventListener(evt, e => { e.preventDefault(); e.stopPropagation(); }, false);
        document.body.addEventListener(evt,     e => { e.preventDefault(); e.stopPropagation(); }, false);
    });
    ['dragenter', 'dragover'].forEach(evt => elements.dropZone.addEventListener(evt, highlight, false));
    ['dragleave', 'drop']    .forEach(evt => elements.dropZone.addEventListener(evt, unhighlight, false));
    elements.dropZone.addEventListener('drop', handleDrop, false);
    elements.imageInput.addEventListener('change', handleFileSelect, false);
    elements.dropZone.addEventListener('click', () => elements.imageInput.click());
}

function highlight()  { if (elements.dropZone) elements.dropZone.classList.add('dragover'); }
function unhighlight(){ if (elements.dropZone) elements.dropZone.classList.remove('dragover'); }

function handleDrop(e)       { handleFiles(e.dataTransfer.files); }
function handleFileSelect(e) { handleFiles(e.target.files); }

function handleFiles(files) {
    const newFiles = Array.from(files).filter(file => {
        if (!MIRROR_CONFIG.ALLOWED_TYPES.includes(file.type)) {
            showStatus(`"${file.name}" no es una imagen válida.`, 'error'); return false;
        }
        if (file.size > MIRROR_CONFIG.MAX_FILE_SIZE) {
            showStatus(`"${file.name}" excede el límite de 50 MB.`, 'error'); return false;
        }
        return true;
    });

    if (state.selectedFiles.length + newFiles.length > MIRROR_CONFIG.MAX_FILES) {
        showStatus(`Máximo ${MIRROR_CONFIG.MAX_FILES} archivos permitidos.`, 'error'); return;
    }

    state.selectedFiles = [...state.selectedFiles, ...newFiles];
    renderPreview();
    updateUIState();
    if (state.selectedFiles.length > 0)
        showStatus(`${state.selectedFiles.length} imagen(es) lista(s) para procesar.`, 'success');
}

// ============================================
// PREVIEW
// ============================================
function renderPreview() {
    if (!elements.imageList) return;
    elements.imageList.innerHTML = '';

    if (state.selectedFiles.length === 0) {
        elements.previewContainer?.classList.add('hidden'); return;
    }
    elements.previewContainer?.classList.remove('hidden');

    state.selectedFiles.forEach((file, index) => {
        const item = document.createElement('div');
        item.className = 'image-item';
        const url = URL.createObjectURL(file);
        item.innerHTML = `
            <img src="${url}" alt="${file.name}" onload="URL.revokeObjectURL(this.src)">
            <div class="image-info">
                <span class="image-name">${escapeHtml(file.name)}</span>
                <span class="image-size">${formatFileSize(file.size)}</span>
            </div>
            <button class="remove-btn" data-index="${index}" title="Eliminar">✕</button>`;
        item.querySelector('.remove-btn').addEventListener('click', e => {
            const i = parseInt(e.currentTarget.dataset.index);
            state.selectedFiles.splice(i, 1);
            renderPreview();
            updateUIState();
        });
        elements.imageList.appendChild(item);
    });
}

// ============================================
// BOTONES
// ============================================
function setupButtons() {
    if (elements.processBtn)  elements.processBtn.addEventListener('click',  processImages);
    if (elements.downloadBtn) elements.downloadBtn.addEventListener('click', downloadResult);
    if (elements.resetBtn)    elements.resetBtn.addEventListener('click',    resetApplication);
}

async function processImages() {
    if (state.selectedFiles.length === 0 || state.isProcessing) return;
    state.isProcessing = true;
    updateUIState();
    showStatus('Procesando imágenes...', 'info');

    try {
        const formData = new FormData();
        state.selectedFiles.forEach(file => formData.append('images', file));

        const response = await fetch(MIRROR_CONFIG.API_ENDPOINT, {
            method: 'POST',
            credentials: 'same-origin',
            body: formData
        });

        if (!response.ok) throw new Error(`Error del servidor: ${response.status}`);

        state.processedBlob = await response.blob();
        showStatus('✅ ¡Imágenes procesadas! Descarga lista.', 'success');

        if (elements.downloadBtn) elements.downloadBtn.disabled = false;
        if (elements.expirationWarning) elements.expirationWarning.classList.remove('hidden');

        // Auto-expirar descarga en 30 min
        setTimeout(() => {
            state.processedBlob = null;
            if (elements.downloadBtn) elements.downloadBtn.disabled = true;
            if (elements.expirationWarning) elements.expirationWarning.classList.add('hidden');
            showStatus('El archivo ha expirado. Procesa de nuevo.', 'error');
        }, 30 * 60 * 1000);

    } catch (error) {
        console.error('Error procesando:', error);
        showStatus(`Error: ${error.message}`, 'error');
    } finally {
        state.isProcessing = false;
        updateUIState();
    }
}

function downloadResult() {
    if (!state.processedBlob) return;
    const url  = URL.createObjectURL(state.processedBlob);
    const link = document.createElement('a');
    link.href     = url;
    link.download = `mirai-mirror-${Date.now()}.zip`;
    link.click();
    URL.revokeObjectURL(url);
}

function resetApplication() {
    state.selectedFiles  = [];
    state.processedBlob  = null;
    state.isProcessing   = false;
    if (elements.imageInput) elements.imageInput.value = '';
    if (elements.downloadBtn) elements.downloadBtn.disabled = true;
    if (elements.expirationWarning) elements.expirationWarning.classList.add('hidden');
    renderPreview();
    updateUIState();
    showStatus('Listo para nuevas imágenes.', 'info');
}

// ============================================
// UI STATE
// ============================================
function updateUIState() {
    if (elements.processBtn)
        elements.processBtn.disabled = state.selectedFiles.length === 0 || state.isProcessing;

    if (state.isProcessing) {
        elements.loadingSpinner?.classList.remove('hidden');
        if (elements.processBtn) elements.processBtn.textContent = 'Procesando...';
    } else {
        elements.loadingSpinner?.classList.add('hidden');
        if (elements.processBtn) elements.processBtn.innerHTML = `
            <i data-lucide="sparkles" style="width:18px;height:18px"></i>
            <span>Procesar y Ordenar</span>`;
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }
}

function showStatus(message, type = 'info') {
    if (!elements.statusMessage) { console.warn(`[Mirror] ${type}: ${message}`); return; }
    elements.statusMessage.textContent = message;
    elements.statusMessage.className = `status ${type} show`;
    if (type === 'success')
        setTimeout(() => elements.statusMessage?.classList.remove('show'), 5000);
}

// ============================================
// ERRORES GLOBALES
// ============================================
window.addEventListener('error',   e => showStatus('Error inesperado. Recarga la página.', 'error'));
window.addEventListener('offline', () => showStatus('Sin conexión. Verifica tu internet.', 'error'));
window.addEventListener('online',  () => showStatus('Conexión restaurada.', 'success'));
document.addEventListener('keydown', e => { if (e.key === 'Escape' && state.selectedFiles.length > 0) resetApplication(); });

// ============================================
// UTILIDADES
// ============================================
function escapeHtml(text) {
    if (!text) return '';
    const d = document.createElement('div');
    d.textContent = text;
    return d.innerHTML;
}

function formatFileSize(bytes) {
    if (bytes < 1024)       return `${bytes} B`;
    if (bytes < 1024**2)    return `${(bytes/1024).toFixed(1)} KB`;
    return `${(bytes/1024**2).toFixed(1)} MB`;
}