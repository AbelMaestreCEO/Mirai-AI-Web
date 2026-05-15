// ============================================
// MIRAI MIRROR - app.js (LIMPIO Y CORREGIDO)
// Desarrollado por Devs Aberu & Mirai Company
// ============================================

const CONFIG = {
    API_ENDPOINT: '/api/process',
    MAX_FILE_SIZE: 50 * 1024 * 1024,
    ALLOWED_TYPES: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic'],
    MAX_FILES: 200
};

const elements = {
    dropZone: document.getElementById('dropZone'),
    imageInput: document.getElementById('imageInput'),
    previewContainer: document.getElementById('previewContainer'),
    imageList: document.getElementById('imageList'),
    processBtn: document.getElementById('processBtn'),
    downloadBtn: document.getElementById('downloadBtn'),
    resetBtn: document.getElementById('resetBtn'),
    statusMessage: document.getElementById('statusMessage'),
    loadingSpinner: document.getElementById('loadingSpinner'),
    expirationWarning: document.getElementById('expirationWarning')
};

let state = {
    selectedFiles: [],
    processedBlob: null,
    isProcessing: false
};

// Inicialización segura
document.addEventListener('DOMContentLoaded', () => {
    // Verificar elementos críticos
    if (!elements.dropZone || !elements.imageInput) {
        console.error("CRÍTICO: Elementos del DOM no encontrados. Verifica los IDs en el HTML.");
        return;
    }

    initializeEventListeners();
    updateUIState();
    logAppStart();
    
    // Forzar re-renderizado de iconos si Lucide cargó tarde
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
});

function logAppStart() {
    console.log('%c🌸 Mirai Mirror Initialized', 'color: #0a84ff; font-size: 14px; font-weight: bold;');
    console.log('%cDevs Aberu & Mirai Company', 'color: #5ac8fa; font-size: 12px;');
}

function initializeEventListeners() {
    // Click en dropzone para abrir input
    if (elements.dropZone) {
        elements.dropZone.addEventListener('click', (e) => {
            if (e.target.tagName !== 'LABEL' && e.target.closest('label') === null) {
                elements.imageInput.click();
            }
        });
    }

    // Cambio en input file
    if (elements.imageInput) {
        elements.imageInput.addEventListener('change', handleFileSelect);
    }

    // Setup Drag & Drop
    setupDragAndDrop();

    // Botones de acción
    if (elements.processBtn) elements.processBtn.addEventListener('click', processImages);
    if (elements.downloadBtn) elements.downloadBtn.addEventListener('click', downloadZip);
    if (elements.resetBtn) elements.resetBtn.addEventListener('click', resetApplication);

    // Prevenir defaults en el body para drag & drop
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        document.body.addEventListener(eventName, preventDefaults, false);
    });
}

function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}

function setupDragAndDrop() {
    const dropZone = elements.dropZone;
    if (!dropZone) return;

    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, highlight, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, unhighlight, false);
    });

    dropZone.addEventListener('drop', handleDrop, false);
}

function highlight(e) {
    if (elements.dropZone) elements.dropZone.classList.add('dragover');
}

function unhighlight(e) {
    if (elements.dropZone) elements.dropZone.classList.remove('dragover');
}

function handleDrop(e) {
    const dt = e.dataTransfer;
    const files = dt.files;
    handleFiles(files);
}

function handleFileSelect(e) {
    const files = e.target.files;
    handleFiles(files);
}

function handleFiles(files) {
    const newFiles = Array.from(files).filter(file => {
        if (!CONFIG.ALLOWED_TYPES.includes(file.type)) {
            showStatus(`Archivo "${file.name}" no es una imagen válida.`, 'error');
            return false;
        }
        
        if (file.size > CONFIG.MAX_FILE_SIZE) {
            showStatus(`Archivo "${file.name}" excede el límite de 50MB.`, 'error');
            return false;
        }
        
        return true;
    });

    if (state.selectedFiles.length + newFiles.length > CONFIG.MAX_FILES) {
        showStatus(`Máximo ${CONFIG.MAX_FILES} archivos permitidos.`, 'error');
        return;
    }

    state.selectedFiles = [...state.selectedFiles, ...newFiles];
    
    renderPreview();
    updateUIState();
    
    if (state.selectedFiles.length > 0) {
        showStatus(`${state.selectedFiles.length} imagen(es) lista(s) para procesar.`, 'success');
    }
}

// ============================================
// RENDERIZADO DE VISTA PREVIA
// ============================================
function renderPreview() {
    if (!elements.imageList) return;
    
    elements.imageList.innerHTML = '';
    
    if (state.selectedFiles.length === 0) {
        if (elements.previewContainer) elements.previewContainer.classList.add('hidden');
        return;
    }

    if (elements.previewContainer) elements.previewContainer.classList.remove('hidden');

    state.selectedFiles.forEach((file, index) => {
        const imageItem = document.createElement('div');
        imageItem.className = 'image-item animate-up';
        imageItem.style.animationDelay = `${index * 0.05}s`;

        const img = document.createElement('img');
        img.alt = file.name;
        img.loading = 'lazy';
        
        const removeBtn = document.createElement('button');
        removeBtn.className = 'remove-btn';
        removeBtn.title = 'Eliminar';
        removeBtn.innerHTML = '×';
        removeBtn.onclick = (e) => {
            e.stopPropagation();
            removeFile(index);
        };

        const overlay = document.createElement('div');
        overlay.style.cssText = 'position: absolute; bottom: 0; left: 0; right: 0; background: rgba(0,0,0,0.6); color: white; font-size: 0.7rem; padding: 0.25rem; text-align: center; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;';
        overlay.textContent = file.name;

        const reader = new FileReader();
        reader.onload = (e) => {
            img.src = e.target.result;
            img.style.display = 'block';
        };
        reader.onerror = (err) => {
            console.error('Error reading file:', err);
            img.src = 'data:image/svg+xml,<svg xmlns="https://www.w3.org/2000/svg" width="100" height="100"><rect fill="%23ddd" width="100" height="100"/><text x="50%" y="50%" text-anchor="middle" fill="%23999">Error</text></svg>';
        };
        reader.readAsDataURL(file);

        imageItem.appendChild(img);
        imageItem.appendChild(removeBtn);
        imageItem.appendChild(overlay);
        
        elements.imageList.appendChild(imageItem);
    });
}

function removeFile(index) {
    state.selectedFiles.splice(index, 1);
    renderPreview();
    updateUIState();
    
    if (state.selectedFiles.length === 0) {
        showStatus('Ninguna imagen seleccionada.', 'info');
    } else {
        showStatus(`${state.selectedFiles.length} imagen(es) restante(s).`, 'info');
    }
}

// ============================================
// PROCESAMIENTO
// ============================================
async function processImages() {
    if (state.selectedFiles.length === 0) {
        showStatus('Selecciona al menos una imagen.', 'error');
        return;
    }

    if (state.isProcessing) return;

    state.isProcessing = true;
    state.processedBlob = null;

    if (elements.downloadBtn) elements.downloadBtn.classList.add('hidden');
    if (elements.resetBtn) elements.resetBtn.classList.add('hidden');
    if (elements.expirationWarning) {
        elements.expirationWarning.classList.add('hidden');
        elements.expirationWarning.classList.remove('show');
    }

    updateUIState();
    showStatus(
        `Enviando ${state.selectedFiles.length} imagen(es) al servidor... esto puede tardar unos segundos.`,
        'info'
    );

    try {
        const formData = new FormData();
        state.selectedFiles.forEach(file => formData.append('images', file));

        const response = await fetch(CONFIG.API_ENDPOINT, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            let errMsg = `Error del servidor: ${response.status}`;
            const ct = response.headers.get('Content-Type') || '';
            if (ct.includes('application/json')) {
                const errData = await response.json().catch(() => ({}));
                errMsg = errData.error || errData.message || errMsg;
            }
            throw new Error(errMsg);
        }

        const contentType = response.headers.get('Content-Type') || '';
        if (!contentType.includes('application/zip') && !contentType.includes('octet-stream')) {
            const text = await response.text();
            let errMsg = 'Respuesta inesperada del servidor.';
            try {
                const errData = JSON.parse(text);
                errMsg = errData.error || errData.message || errMsg;
            } catch (_) { /* no era JSON */ }
            throw new Error(errMsg);
        }

        const blob = await response.blob();

        if (!blob || blob.size === 0) {
            throw new Error('El archivo ZIP generado está vacío.');
        }

        state.processedBlob = blob;

        const count = response.headers.get('X-Files-Count') || state.selectedFiles.length;
        showStatus(`¡${count} imagen(es) procesada(s) con éxito! Listas para descargar.`, 'success');

        if (elements.downloadBtn) elements.downloadBtn.classList.remove('hidden');
        if (elements.resetBtn) elements.resetBtn.classList.remove('hidden');

        if (elements.expirationWarning) {
            elements.expirationWarning.classList.remove('hidden');
            elements.expirationWarning.classList.add('show');
        }

    } catch (error) {
        console.error('Error al procesar:', error);
        showStatus(`Error: ${error.message}. Intenta nuevamente.`, 'error');
        if (elements.resetBtn) elements.resetBtn.classList.remove('hidden');
    } finally {
        state.isProcessing = false;
        updateUIState();
    }
}

// ============================================
// DESCARGA
// ============================================
function downloadZip() {
    if (!state.processedBlob) {
        showStatus('No hay archivo para descargar.', 'error');
        return;
    }

    const url = window.URL.createObjectURL(state.processedBlob);
    const a = document.createElement('a');
    a.href = url;
    
    const now = new Date();
    const timestamp = now.toISOString().slice(0, 10).replace(/-/g, '');
    a.download = `mirai_mirror_${timestamp}.zip`;
    
    document.body.appendChild(a);
    a.click();
    
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
    
    showStatus('Descarga iniciada. ¡Disfruta tus fotos organizadas!', 'success');
}

// ============================================
// REINICIO
// ============================================
function resetApplication() {
    state.selectedFiles = [];
    state.processedBlob = null;
    state.isProcessing = false;
    
    if (elements.imageInput) elements.imageInput.value = '';
    
    if (elements.imageList) elements.imageList.innerHTML = '';
    if (elements.previewContainer) elements.previewContainer.classList.add('hidden');
    if (elements.downloadBtn) elements.downloadBtn.classList.add('hidden');
    if (elements.resetBtn) elements.resetBtn.classList.add('hidden');
    
    if (elements.expirationWarning) {
        elements.expirationWarning.classList.add('hidden');
        elements.expirationWarning.classList.remove('show');
    }
    
    showStatus('Aplicación reiniciada. Listo para nuevas imágenes.', 'info');
    updateUIState();
}

// ============================================
// UTILIDADES UI
// ============================================
function updateUIState() {
    if (elements.processBtn) {
        elements.processBtn.disabled = state.selectedFiles.length === 0 || state.isProcessing;
    }
    
    if (state.isProcessing) {
        if (elements.loadingSpinner) elements.loadingSpinner.classList.remove('hidden');
        if (elements.processBtn) {
            elements.processBtn.innerHTML = '<span class="spinner" style="width: 20px; height: 20px; border-width: 2px;"></span> Procesando...';
        }
    } else {
        if (elements.loadingSpinner) elements.loadingSpinner.classList.add('hidden');
        if (elements.processBtn) {
            elements.processBtn.innerHTML = `
                <i data-lucide="sparkles" style="width: 18px; height: 18px;"></i>
                <span>Procesar y Ordenar</span>
            `;
            if (typeof lucide !== 'undefined') {
                lucide.createIcons();
            }
        }
    }
}

function showStatus(message, type = 'info') {
    if (!elements.statusMessage) {
        console.warn(`Estado (${type}): ${message}`);
        return;
    }
    
    elements.statusMessage.textContent = message;
    elements.statusMessage.className = `status ${type} show`;
    
    elements.statusMessage.classList.remove('info', 'success', 'error');
    elements.statusMessage.classList.add(type, 'show');
    
    if (type === 'success') {
        setTimeout(() => {
            if (elements.statusMessage) {
                elements.statusMessage.classList.remove('show');
            }
        }, 5000);
    }
}

// ============================================
// MANEJO DE ERRORES GLOBALES
// ============================================
window.addEventListener('error', (e) => {
    console.error('Error global:', e.error);
    showStatus('Ocurrió un error inesperado. Por favor recarga la página.', 'error');
});

window.addEventListener('offline', () => {
    showStatus('Sin conexión. Verifica tu conexión a internet.', 'error');
});

window.addEventListener('online', () => {
    showStatus('Conexión restaurada.', 'success');
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && state.selectedFiles.length > 0) {
        resetApplication();
    }
});

// ============================================
// GESTIÓN DE TEMA (CLARO / OSCURO)
// ============================================
function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 
                       (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
    setTheme(savedTheme);
}

function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
    
    const sunIcon = document.querySelector('.sun-icon');
    const moonIcon = document.querySelector('.moon-icon');
    
    if (sunIcon && moonIcon) {
        if (theme === 'light') {
            sunIcon.style.display = 'none';
            moonIcon.style.display = 'block';
        } else {
            sunIcon.style.display = 'block';
            moonIcon.style.display = 'none';
        }
    }
}

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
}

// Inicializar tema al cargar (si no se ha hecho ya en DOMContentLoaded)
if (!document.body.dataset.themeInitialized) {
    document.body.dataset.themeInitialized = 'true';
    document.addEventListener('DOMContentLoaded', () => {
        initTheme();
        const themeToggle = document.getElementById('themeToggle');
        if (themeToggle) {
            themeToggle.addEventListener('click', toggleTheme);
        }
    });
}