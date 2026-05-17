/* ============================================
   MIRAI AI - Inventory Module Logic
   Gestión de Inventario Inteligente con IA
   ============================================ */

// --- CONSTANTES Y CONFIGURACIÓN ---
const INV_CONFIG = {
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
        // Tema y Sidebar → manejados por mirai-boot.js + app.js. No tocar aquí.
        // NO llamar MiraiApp.init() — app.js ya se auto-inicializa al cargar.
 
        // Inicializar Lógica de Inventario
        setupEventListeners();
        await loadInventory();
        updateStats();
    });
function initLocalTheme() {
    const savedTheme = localStorage.getItem('mirai-ai-theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', savedTheme);
    const sun = document.querySelector('.sun-icon');
    const moon = document.querySelector('.moon-icon');
    if(sun && moon) {
        if(savedTheme === 'dark') { sun.classList.add('hidden'); moon.classList.remove('hidden'); }
        else { sun.classList.remove('hidden'); moon.classList.add('hidden'); }
    }
}

function setupLocalMobileMenu() {
    const menuToggle = document.querySelector('.mobile-menu-toggle');
    const closeMenu = document.querySelector('.close-menu');
    const sidebar = document.querySelector('.mobile-sidebar');
    const overlay = document.querySelector('.mobile-overlay');
    if (!menuToggle || !closeMenu || !sidebar || !overlay) return;
    function toggleMenu() {
        const isActive = sidebar.classList.contains('active');
        if (isActive) { sidebar.classList.remove('active'); overlay.classList.remove('active'); menuToggle.classList.remove('active'); document.body.style.overflow = ''; }
        else { sidebar.classList.add('active'); overlay.classList.add('active'); menuToggle.classList.add('active'); document.body.style.overflow = 'hidden'; }
    }
    menuToggle.addEventListener('click', toggleMenu);
    closeMenu.addEventListener('click', toggleMenu);
    overlay.addEventListener('click', toggleMenu);
}
// --- CARGAR INVENTARIO DESDE API (CORREGIDO) ---
async function loadInventory() {
    try {
        showLoadingState();

        const userDni = localStorage.getItem('mirai_user_dni');

        const headers = {
            'Content-Type': 'application/json'
            // La cookie HttpOnly se envía automáticamente
        };

        const response = await fetch(`${INV_CONFIG.API_ENDPOINT}/list`, {
            method: 'GET',
            headers: headers
        });

        if (!response.ok) {
            if (response.status === 401) {
                // Si es 401, mostramos un mensaje amigable en lugar de error
                showEmptyState('No has iniciado sesión o tu sesión ha expirado.');
                return;
            }
            throw new Error(`Error HTTP: ${response.status}`);
        }

        const data = await response.json();
        state.products = data.products || [];
        state.filteredProducts = [...state.products];

        renderProducts();
        updateStats();

    } catch (error) {
        console.error('Error cargando inventario:', error);

        // Si el error es de autenticación, mostrar estado vacío amigable
        if (error.message.includes('No autorizado') || error.message.includes('401')) {
            showEmptyState('Por favor, inicia sesión para ver tu inventario.');
        } else {
            showErrorState(error.message);
        }
    }
}

// --- MOSTRAR ESTADO VACÍO (NUEVO) ---
function showEmptyState(message = 'Tu inventario está vacío. ¡Agrega tu primer producto!') {
    const grid = elements.inventoryGrid;
    const noResults = elements.noResults;

    // Limpiar grid
    grid.innerHTML = '';

    // Crear mensaje amigable
    const emptyDiv = document.createElement('div');
    emptyDiv.className = 'no-results';
    emptyDiv.style.display = 'flex';
    emptyDiv.style.flexDirection = 'column';
    emptyDiv.style.alignItems = 'center';
    emptyDiv.style.justifyContent = 'center';
    emptyDiv.style.padding = '60px 20px';
    emptyDiv.style.textAlign = 'center';
    emptyDiv.style.color = 'var(--text-secondary)';

    emptyDiv.innerHTML = `
        <div style="font-size: 4rem; margin-bottom: 20px;">📦</div>
        <h3 style="color: var(--text-primary); margin-bottom: 10px;">${message}</h3>
        <p style="margin-bottom: 20px;">¡Es el momento de empezar a organizar tus productos!</p>
        <button class="btn-primary" id="btn-add-first-product" style="margin-top: 10px;">
            <svg viewBox="0 0 24 24" width="18" height="18" style="vertical-align: middle; margin-right: 5px;">
                <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
            </svg>
            Agregar Primer Producto
        </button>
    `;

    grid.appendChild(emptyDiv);

    // Evento para abrir modal
    const btn = emptyDiv.querySelector('#btn-add-first-product');
    if (btn) {
        btn.addEventListener('click', () => {
            openAddProductModal();
        });
    }

    elements.inventoryCount.textContent = '0 productos';
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

// ============================================
// CREAR TARJETA DE PRODUCTO (CORREGIDA)
// ============================================
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

    // ✅ AQUÍ ESTABA EL ERROR: Debemos incluir los botones en el template string
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
            <button class="btn-edit" data-id="${product.id}" title="Editar">✏️</button>
            <button class="btn-delete" data-id="${product.id}" title="Eliminar">🗑️</button>
        </div>
    `;

    // ✅ AHORA SÍ: Los elementos existen en el DOM, podemos agregar los listeners
    const viewBtn = card.querySelector('.btn-view-details');
    const editBtn = card.querySelector('.btn-edit');
    const deleteBtn = card.querySelector('.btn-delete');

    // Listener: Ver Detalles
    if (viewBtn) {
        viewBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            showProductDetails(product);
        });
    }

    // Listener: Editar
    if (editBtn) {
        editBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            editProduct(product);
        });
    }

    // Listener: Eliminar
    if (deleteBtn) {
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteProduct(product.id);
        });
    }

    // Listener: Click en toda la tarjeta (excluyendo botones)
    card.addEventListener('click', (e) => {
        if (!e.target.closest('.product-actions')) {
            showProductDetails(product);
        }
    });

    return card;
}

// --- NIVEL DE STOCK ---
function getStockLevel(quantity) {
    if (quantity <= INV_CONFIG.STOCK_CRITICAL_THRESHOLD) return 'critical';
    if (quantity <= INV_CONFIG.STOCK_LOW_THRESHOLD) return 'low';
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
        </div>
    `;

    modal.classList.remove('hidden');
}

// --- SETUP EVENT LISTENERS ---
function setupEventListeners() {
    // Botón agregar producto
    elements.addProductBtn.addEventListener('click', () => {
        openAddProductModal(); // Sin argumento = Crear
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
    elements.inventorySearch.addEventListener('input', debounce(handleSearch, INV_CONFIG.DEBOUNCE_DELAY));

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
    
    const btnNotifications = document.getElementById('btn-enable-notifications');
    if (btnNotifications) {
        btnNotifications.addEventListener('click', async () => {
            try {
                if (!('Notification' in window)) {
                    alert('Tu navegador no soporta notificaciones.');
                    return;
                }

                if (Notification.permission === 'granted') {
                    console.log('✅ Notificaciones ya permitidas.');
                    await subscribeUser();
                    return;
                }

                if (Notification.permission !== 'denied') {
                    const permission = await Notification.requestPermission();
                    if (permission === 'granted') {
                        console.log('✅ Permiso concedido.');
                        await subscribeUser();
                    } else {
                        console.log('❌ Permiso denegado.');
                        alert('Has denegado las notificaciones.');
                    }
                }
            } catch (error) {
                console.error('Error al solicitar permiso:', error);
            }
        });
    }

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
    if (file.size > INV_CONFIG.MAX_FILE_SIZE) {
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

// --- SUBMIT FORMULARIO (CORREGIDO CON AUTH) ---
async function handleFormSubmit(e) {
    e.preventDefault();

    if (state.isSubmitting) return;

    const mode = document.getElementById('btn-submit-inv').dataset.mode || 'create';
    const productId = document.getElementById('btn-submit-inv').dataset.productId;

    const file = elements.invPhoto.files[0];
    const name = document.getElementById('inv-name').value;
    const sku = document.getElementById('inv-sku').value;
    const category = document.getElementById('inv-category').value;
    const quantity = parseInt(document.getElementById('inv-quantity').value) || 0;
    const specs = document.getElementById('inv-specs').value;
    const price = parseFloat(document.getElementById('inv-price').value) || 0;

    // Validaciones básicas
    if (!name.trim()) {
        showStatus('El nombre del producto es obligatorio', 'error');
        return;
    }

    state.isSubmitting = true;
    setLoadingState(true);

    try {
        if (mode === 'edit') {
            // --- MODO EDICIÓN ---
            const payload = {
                id: productId,
                name,
                sku: sku.trim() || null,
                category,
                quantity,
                unit_price: price,
                ai_description: specs,
                ai_tags: category
            };

            const response = await fetch('/api/inventory/update', {
                method: 'PUT',
                credentials: 'same-origin',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            const data = await response.json();
            if (!response.ok) {
                if (data.details && data.details.includes('UNIQUE constraint')) {
                    throw new Error('Ya existe un producto con ese SKU. Por favor, usa otro o déjalo vacío.');
                }
                throw new Error(data.error || 'Error al actualizar producto');
            }

            showStatus('✅ Producto actualizado correctamente', 'success');
            await loadInventory();
            closeModals();
            resetForm();

        } else {
            // --- MODO CREACIÓN ---
            if (!file) {
                showStatus('Por favor, sube una foto del producto', 'error');
                state.isSubmitting = false;
                setLoadingState(false);
                return;
            }

            const formData = new FormData();
            formData.append('photo', file);
            formData.append('name', name);
            formData.append('sku', sku);
            formData.append('category', category);
            formData.append('quantity', quantity);
            formData.append('specs', specs);
            formData.append('unit_price', price);

            const response = await fetch(INV_CONFIG.UPLOAD_ENDPOINT, {
                method: 'POST',
                headers: authHeaders, // ✅ Token en FormData (no se necesita Content-Type, el browser lo pone)
                body: formData
            });

            const data = await response.json();

            if (!response.ok) {
                if (data.details && data.details.includes('UNIQUE constraint')) {
                    throw new Error('Ya existe un producto con ese SKU. Déjalo vacío para generar uno automático.');
                }
                throw new Error(data.error || 'Error al registrar producto');
            }

            const skuDisplay = data.sku || 'Automático';
            showStatus(`✅ ¡Producto registrado! SKU: ${skuDisplay} - La IA está analizando...`, 'success');

            setTimeout(async () => {
                await loadInventory();
                closeModals();
                resetForm();
            }, 3000);
        }

    } catch (error) {
        console.error('Error en formulario:', error);

        // Si es error 401, redirigir a login
        if (error.message.includes('401') || error.message.includes('No autorizado')) {
            showStatus('❌ Sesión expirada. Serás redirigido al login...', 'error');
            setTimeout(() => { window.location.href = 'login.html'; }, 2000);
        } else {
            showStatus(`❌ Error: ${error.message}`, 'error');
        }
    } finally {
        state.isSubmitting = false;
        setLoadingState(false);
    }
}

// ============================================
// ELIMINAR PRODUCTO (CORREGIDO CON AUTH)
// ============================================
async function deleteProduct(productId) {
    if (!confirm('¿Estás seguro de que deseas eliminar este producto? Esta acción no se puede deshacer y se borrará la imagen asociada.')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/inventory/delete?id=${productId}`, {
            method: 'DELETE',
            credentials: 'same-origin'
            // La cookie se envía automáticamente
        });

        const data = await response.json();

        if (!response.ok) {
            if (response.status === 401) {
                throw new Error('Sesión expirada. Serás redirigido al login.');
            }
            throw new Error(data.error || 'Error al eliminar');
        }

        showStatus('✅ Producto eliminado correctamente', 'success');
        await loadInventory();
        closeModals();

    } catch (error) {
        console.error('Error eliminando producto:', error);

        if (error.message.includes('Sesión expirada') || error.message.includes('401')) {
            showStatus('❌ Sesión expirada. Redirigiendo...', 'error');
            setTimeout(() => { window.location.href = 'login.html'; }, 2000);
        } else {
            showStatus(`❌ Error: ${error.message}`, 'error');
        }
    }
}

// ============================================
// EDITAR PRODUCTO (CORREGIDO CON openAddProductModal)
// ============================================
async function editProduct(product) {
    const modal = document.getElementById('add-product-modal');
    const form = document.getElementById('inventory-form');
    const title = document.getElementById('modal-title');
    const submitBtn = document.getElementById('btn-submit-inv');
    const btnText = submitBtn.querySelector('.btn-text');
    const dropzone = document.getElementById('inventory-dropzone');

    // Resetear formulario
    form.reset();
    document.getElementById('preview-img').style.display = 'none';
    document.getElementById('preview-img').src = '';
    state.selectedFile = null;
    showStatus('', '');

    // Precargar datos
    document.getElementById('inv-name').value = product.name || '';
    document.getElementById('inv-sku').value = product.sku || '';
    document.getElementById('inv-category').value = product.category || 'general';
    document.getElementById('inv-quantity').value = product.quantity || 0;
    document.getElementById('inv-price').value = product.unit_price || 0;
    document.getElementById('inv-specs').value = product.ai_description || '';

    // ✅ CORRECCIÓN: Cambiar texto del botón SIN destruir los spans internos
    if (btnText) {
        btnText.textContent = 'Guardar Cambios';
    }

    // Configurar modo edición
    submitBtn.dataset.mode = 'edit';
    submitBtn.dataset.productId = product.id;

    // Cambiar título del modal
    if (title) {
        title.textContent = '✏️ Editar Producto';
    }

    // Ocultar zona de foto en edición
    if (dropzone) {
        dropzone.style.display = 'none';
    }

    // Mostrar foto actual si existe
    if (product.photo_r2_key) {
        const photoUrl = `/api/image/${product.photo_r2_key}`;
        const preview = document.getElementById('preview-img');
        preview.src = photoUrl;
        preview.style.display = 'block';
    }

    // Abrir modal con animación
    modal.classList.remove('hidden');

    // Enfocar primer campo
    setTimeout(() => {
        document.getElementById('inv-name').focus();
    }, 100);
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
function openAddProductModal(product = null) {
    const modal = document.getElementById('add-product-modal');
    const form = document.getElementById('inventory-form');
    const title = document.getElementById('modal-title');
    const submitBtn = document.getElementById('btn-submit-inv');
    const dropzone = document.getElementById('inventory-dropzone');

    // Resetear formulario
    form.reset();
    document.getElementById('preview-img').style.display = 'none';
    document.getElementById('preview-img').src = '';
    state.selectedFile = null;
    document.getElementById('inv-photo').value = '';
    showStatus('', '');

    // Configurar modo (Crear vs Editar)
    if (product) {
        // MODO EDICIÓN
        title.textContent = '✏️ Editar Producto';
        submitBtn.querySelector('.btn-text').textContent = 'Guardar Cambios';
        submitBtn.dataset.mode = 'edit';
        submitBtn.dataset.productId = product.id;

        // Precargar datos
        document.getElementById('inv-name').value = product.name || '';
        document.getElementById('inv-sku').value = product.sku || '';
        document.getElementById('inv-category').value = product.category || 'general';
        document.getElementById('inv-quantity').value = product.quantity || 0;
        document.getElementById('inv-price').value = product.unit_price || 0;
        document.getElementById('inv-specs').value = product.ai_description || '';

        // Ocultar zona de carga de foto en edición (opcional)
        dropzone.style.display = 'none';

        // Mostrar foto actual si existe
        if (product.photo_r2_key) {
            const photoUrl = `/api/image/${product.photo_r2_key}`;
            const preview = document.getElementById('preview-img');
            preview.src = photoUrl;
            preview.style.display = 'block';
            // Nota: En esta versión simple, no permitimos cambiar la foto en edición
        }

    } else {
        // MODO CREACIÓN
        title.textContent = '📦 Nuevo Producto Inteligente';
        submitBtn.querySelector('.btn-text').textContent = 'Registrar y Analizar con IA';
        submitBtn.dataset.mode = 'create';
        delete submitBtn.dataset.productId; // Limpiar ID

        // Mostrar zona de carga
        dropzone.style.display = 'block';
    }

    // Abrir modal con animación
    modal.classList.remove('hidden');

    // Enfocar primer campo
    setTimeout(() => {
        document.getElementById('inv-name').focus();
    }, 100);
}

function closeModals() {
    const modal = document.getElementById('add-product-modal');
    modal.classList.add('hidden');

    // Resetear estado del formulario después de la animación
    setTimeout(() => {
        resetForm();
    }, 300);
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
    const savedTheme = localStorage.getItem(INV_CONFIG.STORAGE_KEY_THEME);
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

// Función global para cerrar el modal de detalles (llamada desde HTML)
window.closeProductDetail = function () {
    const modal = document.getElementById('product-detail-modal');
    if (modal) {
        modal.classList.add('hidden');
    }
};

// También asegurémonos de que las otras funciones de cierre sean globales si se llaman desde HTML
window.closeModals = function () {
    const addModal = document.getElementById('add-product-modal');
    const detailModal = document.getElementById('product-detail-modal');
    if (addModal) addModal.classList.add('hidden');
    if (detailModal) detailModal.classList.add('hidden');
    resetForm();
};

// ============================================
// SOLICITAR SUSCRIPCIÓN A NOTIFICACIONES
// ============================================
async function requestNotificationPermission() {
    if (!('Notification' in window)) {
        alert('Tu navegador no soporta notificaciones.');
        return;
    }

    if (Notification.permission === 'granted') {
        console.log('✅ Notificaciones ya permitidas.');
        await subscribeUser();
        return;
    }

    if (Notification.permission !== 'denied') {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
            console.log('✅ Permiso concedido.');
            await subscribeUser();
        } else {
            console.log('❌ Permiso denegado.');
        }
    }
}

async function subscribeUser() {
    if (!('PushManager' in window)) {
        console.warn('❌ Push Manager no soportado.');
        return;
    }

    try {
        const registration = await navigator.serviceWorker.ready;

        // Obtener la clave pública VAPID desde el servidor (permite rotarla sin cambiar código)
        const vapidRes = await fetch('/api/vapid-key', { credentials: 'same-origin' });
        if (!vapidRes.ok) throw new Error('No se pudo obtener la clave VAPID');
        const { publicKey } = await vapidRes.json();
        const applicationServerKey = urlBase64ToUint8Array(publicKey);

        const subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: applicationServerKey
        });

        const { endpoint, keys } = subscription;
        const { p256dh, auth } = keys;

        // Enviar al servidor
        const response = await fetch('/api/notifications/subscribe', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                credentials: 'same-origin'
            },
            body: JSON.stringify({ endpoint, p256dh, auth })
        });

        if (response.ok) {
            console.log('✅ Suscripción guardada en servidor.');
            showStatus('🔔 Notificaciones activadas para alertas de stock.', 'success');
        } else {
            console.error('❌ Error al suscribirse:', await response.text());
        }

    } catch (error) {
        console.error('Error en suscripción:', error);
    }
}

// Helper: Convertir Base64 a Uint8Array
function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
        .replace(/\-/g, '+')
        .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

console.log('✅ Módulo de Inventario Inteligente inicializado');