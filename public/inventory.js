/* ============================================
   MIRAI AI - Inventory Module Logic
   Gestión de Inventario Inteligente con IA
   ============================================ */

// --- CONSTANTES Y CONFIGURACIÓN ---
const CONFIG = {
    API_ENDPOINT: '/api/inventory',
    UPLOAD_ENDPOINT: '/api/inventory/upload',
    STORAGE_KEY_THEME: 'mirai-ai-theme',
    MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
    DEBOUNCE_DELAY: 300,
    STOCK_LOW_THRESHOLD: 10,
    STOCK_CRITICAL_THRESHOLD: 3,
};

// --- ELEMENTOS DEL DOM ---
const elements = {
    inventoryGrid: document.getElementById('inventory-grid'),
    inventorySearch: document.getElementById('inventory-search'),
    filterPills: document.getElementById('filter-pills'),
    stockFilter: document.getElementById('stock-filter'),
    inventoryCount: document.getElementById('inventory-count'),
    noResults: document.getElementById('no-results'),
    addProductBtn: document.getElementById('add-product-btn'),
    addProductModal: document.getElementById('add-product-modal'),
    productDetailModal: document.getElementById('product-detail-modal'),
    inventoryForm: document.getElementById('inventory-form'),
    inventoryDropzone: document.getElementById('inventory-dropzone'),
    invPhoto: document.getElementById('inv-photo'),
    previewImg: document.getElementById('preview-img'),
    invStatus: document.getElementById('inv-status'),
    aiProcessing: document.getElementById('ai-processing'),
    btnSubmitInv: document.getElementById('btn-submit-inv'),
    modalClose: document.querySelectorAll('.modal-close'),
    modalCancel: document.querySelectorAll('.modal-cancel'),
    modalOverlay: document.querySelectorAll('.modal-overlay'),
    
    // Estadísticas
    totalProducts: document.getElementById('total-products'),
    lowStock: document.getElementById('low-stock'),
    aiAnalyzed: document.getElementById('ai-analyzed'),
    totalValue: document.getElementById('total-value'),
};

// --- ESTADO DE LA APLICACIÓN ---
let state = {
    products: [],
    filteredProducts: [],
    currentCategory: 'todos',
    currentStockFilter: 'all',
    selectedFile: null,
    isSubmitting: false,
};

// --- INICIALIZACIÓN ---
document.addEventListener('DOMContentLoaded', async () => {
    initializeTheme();
    setupMobileMenu();
    setupEventListeners();
    await loadInventory();
    updateStats();
});

// --- CARGAR INVENTARIO DESDE API ---
async function loadInventory() {
    try {
        showLoadingState();
        
        const response = await fetch(`${CONFIG.API_ENDPOINT}/list`);
        
        if (!response.ok) {
            throw new Error(`Error HTTP: ${response.status}`);
        }
        
        const data = await response.json();
        state.products = data.products || [];
        state.filteredProducts = [...state.products];
        
        renderProducts();
        updateStats();
        
    } catch (error) {
        console.error('Error cargando inventario:', error);
        showErrorState(error.message);
    }
}

// --- RENDERIZAR PRODUCTOS ---
function renderProducts() {
    const grid = elements.inventoryGrid;
    
    // Limpiar grid (excepto no-results)
    const noResults = elements.noResults;
    grid.innerHTML = '';
    grid.appendChild(noResults);
    
    if (state.filteredProducts.length === 0) {
        noResults.style.display = 'block';
        elements.inventoryCount.textContent = 'Mostrando 0 productos';
        return;
    }
    
    noResults.style.display = 'none';
    elements.inventoryCount.textContent = `Mostrando ${state.filteredProducts.length} productos`;
    
    state.filteredProducts.forEach(product => {
        const card = createProductCard(product);
        grid.appendChild(card);
    });
}

// --- CREAR TARJETA DE PRODUCTO ---
function createProductCard(product) {
    const card = document.createElement('div');
    card.className = 'course-card';
    card.dataset.category = product.category || 'general';
    card.dataset.stock = getStockLevel(product.quantity);
    
    // Color según categoría
    const categoryColors = {
        'electronica': 'linear-gradient(135deg, #667eea, #764ba2)',
        'material': 'linear-gradient(135deg, #f093fb, #f5576c)',
        'mobiliario': 'linear-gradient(135deg, #4facfe, #00f2fe)',
        'consumibles': 'linear-gradient(135deg, #43e97b, #38f9d7)',
        'software': 'linear-gradient(135deg, #fa709a, #fee140)'
    };
    
    card.style.setProperty('--card-accent', categoryColors[product.category] || categoryColors['electronica']);
    
    // Nivel de stock
    const stockLevel = getStockLevel(product.quantity);
    const stockClass = stockLevel === 'critical' ? 'critical' : (stockLevel === 'low' ? 'warning' : 'available');
    const stockLabel = stockLevel === 'critical' ? 'Crítico' : (stockLevel === 'low' ? 'Bajo' : 'Disponible');
    
    // Icono según categoría
    const categoryIcons = {
        'electronica': '💻',
        'material': '📝',
        'mobiliario': '🪑',
        'consumibles': '🧴',
        'software': '💿'
    };
    
    // Tags de IA
    let tagsHtml = '';
    if (product.ai_tags && product.ai_tags.length > 0) {
        try {
            const tags = typeof product.ai_tags === 'string' ? JSON.parse(product.ai_tags) : product.ai_tags;
            tagsHtml = tags.slice(0, 3).map(tag => 
                `<span class="tag-chip">${tag}</span>`
            ).join('');
        } catch (e) {
            console.warn('Error parsing tags:', e);
        }
    }
    
    // Foto (si existe)
    let photoHtml = '';
    if (product.photo_r2_key) {
        const photoUrl = `/api/image/${product.photo_r2_key}`;
        photoHtml = `
            <div class="product-photo" style="background-image: url('${photoUrl}')"></div>
        `;
    }
    
    // Demanda score
    const demandScore = product.demand_score || 0;
    const demandColor = demandScore > 70 ? '#D00000' : (demandScore > 40 ? '#FF9F0A' : '#386A20');
    
    card.innerHTML = `
        <span class="course-level ${stockClass}">${stockLabel}</span>
        ${photoHtml}
        <div class="course-icon">${categoryIcons[product.category] || '📦'}</div>
        <h3 class="course-title">${escapeHtml(product.name)}</h3>
        <p class="course-description">${escapeHtml(product.ai_description || 'Sin descripción')}</p>
        
        ${tagsHtml ? `<div class="product-tags">${tagsHtml}</div>` : ''}
        
        <div class="course-meta">
            <span class="course-meta-item"><span>📦</span> ${product.quantity || 0} unidades</span>
            <span class="course-meta-item"><span>💰</span> $${(product.unit_price || 0).toFixed(2)}</span>
        </div>
        
        <div class="product-demand">
            <span class="demand-label">Demanda:</span>
            <div class="demand-bar">
                <div class="demand-fill" style="width: ${demandScore}%; background: ${demandColor}"></div>
            </div>
            <span class="demand-score">${demandScore}%</span>
        </div>
        
        <div class="product-actions">
            <button class="btn-view-details" data-id="${product.id}">Ver Detalles</button>
        </div>
    `;
    
    // Event listener para ver detalles
    const viewBtn = card.querySelector('.btn-view-details');
    viewBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        showProductDetails(product);
    });
    
    // Click en toda la tarjeta para ver detalles
    card.addEventListener('click', (e) => {
        if (!e.target.closest('.btn-view-details')) {
            showProductDetails(product);
        }
    });
    
    return card;
}

// --- NIVEL DE STOCK ---
function getStockLevel(quantity) {
    if (quantity <= CONFIG.STOCK_CRITICAL_THRESHOLD) return 'critical';
    if (quantity <= CONFIG.STOCK_LOW_THRESHOLD) return 'low';
    return 'available';
}

// --- ACTUALIZAR ESTADÍSTICAS ---
function updateStats() {
    const products = state.products;
    
    // Total productos
    elements.totalProducts.textContent = products.length;
    
    // Stock bajo
    const lowStockCount = products.filter(p => 
        getStockLevel(p.quantity) !== 'available'
    ).length;
    elements.lowStock.textContent = lowStockCount;
    
    // Analizados por IA
    const aiAnalyzedCount = products.filter(p => 
        p.ai_description && p.ai_description.length > 0
    ).length;
    elements.aiAnalyzed.textContent = aiAnalyzedCount;
    
    // Valor total
    const totalValue = products.reduce((sum, p) => 
        sum + ((p.quantity || 0) * (p.unit_price || 0)), 0
    );
    elements.totalValue.textContent = `$${totalValue.toFixed(2)}`;
}

// --- MOSTRAR DETALLES DEL PRODUCTO ---
async function showProductDetails(product) {
    const modal = elements.productDetailModal;
    const content = document.getElementById('product-detail-content');
    
    // Cargar foto si existe
    let photoHtml = '';
    if (product.photo_r2_key) {
        const photoUrl = `/api/image/${product.photo_r2_key}`;
        photoHtml = `
            <div class="detail-photo">
                <img src="${photoUrl}" alt="${product.name}">
            </div>
        `;
    }
    
    // Tags
    let tagsHtml = '';
    if (product.ai_tags) {
        try {
            const tags = typeof product.ai_tags === 'string' ? JSON.parse(product.ai_tags) : product.ai_tags;
            tagsHtml = tags.map(tag => 
                `<span class="tag-chip">${tag}</span>`
            ).join('');
        } catch (e) {
            console.warn('Error parsing tags:', e);
        }
    }
    
    // Predicción
    const demandScore = product.demand_score || 0;
    let predictionText = 'Demanda normal';
    let predictionClass = 'neutral';
    
    if (demandScore > 70) {
        predictionText = '⚠️ Alta probabilidad de reposición pronto';
        predictionClass = 'warning';
    } else if (demandScore > 40) {
        predictionText = '📊 Demanda moderada';
        predictionClass = 'info';
    }
    
    content.innerHTML = `
        <div class="detail-header">
            ${photoHtml}
            <div class="detail-info">
                <h2>${escapeHtml(product.name)}</h2>
                <span class="detail-sku">SKU: ${product.sku || 'N/A'}</span>
                <div class="detail-meta">
                    <span class="meta-item">📦 ${product.quantity || 0} unidades</span>
                    <span class="meta-item">💰 $${(product.unit_price || 0).toFixed(2)} c/u</span>
                    <span class="meta-item">💵 Total: $${((product.quantity || 0) * (product.unit_price || 0)).toFixed(2)}</span>
                </div>
            </div>
        </div>
        
        <div class="detail-section">
            <h3>Descripción Técnica</h3>
            <p>${escapeHtml(product.ai_description || 'Sin descripción generada por IA')}</p>
        </div>
        
        <div class="detail-section">
            <h3>Etiquetas IA</h3>
            <div class="tags-container">${tagsHtml || '<p>Sin etiquetas</p>'}</div>
        </div>
        
        <div class="detail-section">
            <h3>Predicción de Demanda</h3>
            <div class="prediction-card ${predictionClass}">
                <div class="prediction-score">${demandScore}%</div>
                <p>${predictionText}</p>
                ${product.predicted_restock_date ? 
                    `<p class="restock-date">Fecha estimada de reposición: ${product.predicted_restock_date}</p>` : 
                    ''}
            </div>
        </div>
        
        <div class="detail-section">
            <h3>Información</h3>
            <div class="info-grid">
                <div class="info-item">
                    <span class="info-label">Categoría</span>
                    <span class="info-value">${product.category || 'N/A'}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Creado</span>
                    <span class="info-value">${formatDate(product.created_at)}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Actualizado</span>
                    <span class="info-value">${formatDate(product.updated_at)}</span>
                </div>
            </div>
        </div>
        
        <div class="detail-actions">
            <button class="btn-secondary" onclick="closeProductDetail()">Cerrar</button>
            <button class="btn-primary" onclick="alert('Función de edición próximamente')">Editar</button>
        </div>
    `;
    
    modal.classList.remove('hidden');
}

// --- SETUP EVENT LISTENERS ---
function setupEventListeners() {
    // Botón agregar producto
    elements.addProductBtn.addEventListener('click', () => {
        openAddProductModal();
    });
    
    // Cerrar modales
    elements.modalClose.forEach(btn => {
        btn.addEventListener('click', closeModals);
    });
    
    elements.modalCancel.forEach(btn => {
        btn.addEventListener('click', closeModals);
    });
    
    elements.modalOverlay.forEach(overlay => {
        overlay.addEventListener('click', closeModals);
    });
    
    // Zona de carga de foto
    elements.inventoryDropzone.addEventListener('click', () => {
        elements.invPhoto.click();
    });
    
    elements.invPhoto.addEventListener('change', handleFileSelect);
    
    // Drag & Drop
    setupDragAndDrop();
    
    // Submit formulario
    elements.inventoryForm.addEventListener('submit', handleFormSubmit);
    
    // Búsqueda
    elements.inventorySearch.addEventListener('input', debounce(handleSearch, CONFIG.DEBOUNCE_DELAY));
    
    // Filtros categoría
    elements.filterPills.addEventListener('click', (e) => {
        if (e.target.classList.contains('filter-pill')) {
            elements.filterPills.querySelectorAll('.filter-pill').forEach(p => 
                p.classList.remove('active')
            );
            e.target.classList.add('active');
            state.currentCategory = e.target.dataset.category;
            applyFilters();
        }
    });
    
    // Filtros stock
    elements.stockFilter.addEventListener('click', (e) => {
        if (e.target.classList.contains('filter-pill')) {
            elements.stockFilter.querySelectorAll('.filter-pill').forEach(p => 
                p.classList.remove('active')
            );
            e.target.classList.add('active');
            state.currentStockFilter = e.target.dataset.stock;
            applyFilters();
        }
    });
    
    // Tecla Escape para cerrar modales
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeModals();
        }
    });
}

// --- DRAG & DROP ---
function setupDragAndDrop() {
    const dropzone = elements.inventoryDropzone;
    
    dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.classList.add('drag-over');
    });
    
    dropzone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        dropzone.classList.remove('drag-over');
    });
    
    dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.classList.remove('drag-over');
        
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            elements.invPhoto.files = files;
            handleFileSelect({ target: { files } });
        }
    });
}

// --- SELECCIONAR ARCHIVO ---
function handleFileSelect(e) {
    const file = e.target.files[0];
    
    if (!file) return;
    
    // Validar tamaño
    if (file.size > CONFIG.MAX_FILE_SIZE) {
        showStatus('El archivo excede 10MB', 'error');
        return;
    }
    
    // Validar tipo
    if (!file.type.startsWith('image/')) {
        showStatus('Por favor, selecciona un archivo de imagen', 'error');
        return;
    }
    
    state.selectedFile = file;
    
    // Previsualizar
    const reader = new FileReader();
    reader.onload = (ev) => {
        elements.previewImg.src = ev.target.result;
        elements.previewImg.style.display = 'block';
    };
    reader.readAsDataURL(file);
    
    showStatus('✅ Imagen seleccionada', 'success');
}

// --- SUBMIT FORMULARIO ---
async function handleFormSubmit(e) {
    e.preventDefault();
    
    if (state.isSubmitting) return;
    
    const file = elements.invPhoto.files[0];
    const name = document.getElementById('inv-name').value;
    const sku = document.getElementById('inv-sku').value;
    const category = document.getElementById('inv-category').value;
    const quantity = parseInt(document.getElementById('inv-quantity').value) || 0;
    const specs = document.getElementById('inv-specs').value;
    const price = parseFloat(document.getElementById('inv-price').value) || 0;
    
    // Validaciones
    if (!file) {
        showStatus('Por favor, sube una foto del producto', 'error');
        return;
    }
    
    if (!name.trim()) {
        showStatus('El nombre del producto es obligatorio', 'error');
        return;
    }
    
    state.isSubmitting = true;
    setLoadingState(true);
    
    try {
        const formData = new FormData();
        formData.append('photo', file);
        formData.append('name', name);
        formData.append('sku', sku);
        formData.append('category', category);
        formData.append('quantity', quantity);
        formData.append('specs', specs);
        formData.append('unit_price', price);
        
        const response = await fetch(CONFIG.UPLOAD_ENDPOINT, {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Error al registrar producto');
        }
        
        showStatus('✅ ¡Producto registrado! La IA está analizando...', 'success');
        
        // Esperar un momento para que la IA procese
        setTimeout(async () => {
            await loadInventory();
            closeModals();
            resetForm();
            showStatus('✅ Producto agregado al inventario', 'success');
        }, 3000);
        
    } catch (error) {
        console.error('Error registrando producto:', error);
        showStatus(`❌ Error: ${error.message}`, 'error');
    } finally {
        state.isSubmitting = false;
        setLoadingState(false);
    }
}

// --- APLICAR FILTROS ---
function applyFilters() {
    let filtered = [...state.products];
    
    // Filtro por categoría
    if (state.currentCategory !== 'todos') {
        filtered = filtered.filter(p => p.category === state.currentCategory);
    }
    
    // Filtro por stock
    if (state.currentStockFilter !== 'all') {
        filtered = filtered.filter(p => {
            const stockLevel = getStockLevel(p.quantity);
            return stockLevel === state.currentStockFilter;
        });
    }
    
    state.filteredProducts = filtered;
    renderProducts();
}

// --- BUSCAR ---
function handleSearch(e) {
    const query = e.target.value.toLowerCase().trim();
    
    if (!query) {
        state.filteredProducts = [...state.products];
    } else {
        state.filteredProducts = state.products.filter(p => {
            const nameMatch = (p.name || '').toLowerCase().includes(query);
            const skuMatch = (p.sku || '').toLowerCase().includes(query);
            
            let tagsMatch = false;
            if (p.ai_tags) {
                try {
                    const tags = typeof p.ai_tags === 'string' ? JSON.parse(p.ai_tags) : p.ai_tags;
                    tagsMatch = tags.some(tag => tag.toLowerCase().includes(query));
                } catch (e) {
                    // Ignorar error
                }
            }
            
            return nameMatch || skuMatch || tagsMatch;
        });
    }
    
    // Aplicar filtros de categoría y stock también
    applyFilters();
}

// --- GESTIÓN DE MODALES ---
function openAddProductModal() {
    elements.addProductModal.classList.remove('hidden');
    document.getElementById('inv-name').focus();
}

function closeModals() {
    elements.addProductModal.classList.add('hidden');
    elements.productDetailModal.classList.add('hidden');
    resetForm();
}

function closeProductDetail() {
    elements.productDetailModal.classList.add('hidden');
}

// --- RESET FORMULARIO ---
function resetForm() {
    elements.inventoryForm.reset();
    elements.previewImg.style.display = 'none';
    elements.previewImg.src = '';
    state.selectedFile = null;
    elements.invPhoto.value = '';
    showStatus('', '');
}

// --- ESTADOS DE UI ---
function setLoadingState(isLoading) {
    const btn = elements.btnSubmitInv;
    const btnText = btn.querySelector('.btn-text');
    const btnLoading = btn.querySelector('.btn-loading');
    
    if (isLoading) {
        btn.disabled = true;
        btnText.classList.add('hidden');
        btnLoading.classList.remove('hidden');
        elements.aiProcessing.classList.remove('hidden');
    } else {
        btn.disabled = false;
        btnText.classList.remove('hidden');
        btnLoading.classList.add('hidden');
        elements.aiProcessing.classList.add('hidden');
    }
}

function showStatus(message, type = '') {
    const status = elements.invStatus;
    status.textContent = message;
    status.className = 'status-message';
    
    if (type) {
        status.classList.add(type);
        status.classList.add('show');
    }
    
    if (message) {
        setTimeout(() => {
            status.classList.remove('show');
        }, 5000);
    }
}

function showLoadingState() {
    elements.inventoryGrid.innerHTML = `
        <div class="loading-state">
            <div class="loading-spinner"></div>
            <p>Cargando inventario...</p>
        </div>
    `;
}

function showErrorState(message) {
    elements.inventoryGrid.innerHTML = `
        <div class="error-state">
            <div class="error-icon">⚠️</div>
            <h3>Error al cargar inventario</h3>
            <p>${message}</p>
            <button class="btn-secondary" onclick="location.reload()">Reintentar</button>
        </div>
    `;
}

// --- UTILIDADES ---
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatDate(dateStr) {
    if (!dateStr) return 'N/A';
    try {
        const date = new Date(dateStr);
        return date.toLocaleDateString('es-ES', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    } catch (e) {
        return dateStr;
    }
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// --- TEMA ---
function initializeTheme() {
    const savedTheme = localStorage.getItem(CONFIG.STORAGE_KEY_THEME);
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const theme = savedTheme || (prefersDark ? 'dark' : 'light');
    applyTheme(theme);
}

function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    const sunIcon = document.querySelector('.sun-icon');
    const moonIcon = document.querySelector('.moon-icon');
    
    if (sunIcon && moonIcon) {
        if (theme === 'dark') {
            sunIcon.classList.add('hidden');
            moonIcon.classList.remove('hidden');
        } else {
            sunIcon.classList.remove('hidden');
            moonIcon.classList.add('hidden');
        }
    }
}

// --- MENÚ MÓVIL ---
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
    
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && sidebar.classList.contains('active')) {
            toggleMenu();
        }
    });
}

// --- CERRAR SESIÓN ---
document.getElementById('logout-btn')?.addEventListener('click', () => {
    if (confirm('¿Estás seguro de que deseas cerrar sesión?')) {
        localStorage.removeItem('mirai_auth_token');
        localStorage.removeItem('mirai_user_dni');
        window.location.href = 'login.html';
    }
});

// --- TEMA TOGGLE ---
document.getElementById('theme-toggle')?.addEventListener('click', () => {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    applyTheme(newTheme);
    localStorage.setItem(CONFIG.STORAGE_KEY_THEME, newTheme);
});

console.log('✅ Módulo de Inventario Inteligente inicializado');