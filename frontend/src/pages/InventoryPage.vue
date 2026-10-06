<template>
  <header class="header">
    <MenuToggle />
    <div class="header-title">Inventario Inteligente</div>
    <button id="add-product-btn" class="btn-primary" title="" @click="openAddModal()">
      <svg viewBox="0 0 24 24" width="18" height="18">
        <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
      </svg>
      <span></span>
    </button>
  </header>

  <div class="courses-container">
    <!-- Hero -->
    <div class="courses-hero">
      <h1>Inventario Inteligente</h1>
      <p>Gestión predictiva y automatizada de productos con IA. Sube fotos y deja que Mirai AI haga el resto.</p>
    </div>

    <!-- Estadísticas Rápidas -->
    <div class="inventory-stats">
      <div class="stat-card">
        <div class="stat-icon">📦</div>
        <div class="stat-content">
          <span class="stat-label">Total Productos</span>
          <span id="total-products" class="stat-value">{{ stats.total }}</span>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">⚠️</div>
        <div class="stat-content">
          <span class="stat-label">Stock Bajo</span>
          <span id="low-stock" class="stat-value warning">{{ stats.low }}</span>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">🤖</div>
        <div class="stat-content">
          <span class="stat-label">Analizados por IA</span>
          <span id="ai-analyzed" class="stat-value">{{ stats.analyzed }}</span>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">💰</div>
        <div class="stat-content">
          <span class="stat-label">Valor Total</span>
          <span id="total-value" class="stat-value">{{ stats.value }}</span>
        </div>
      </div>
    </div>

    <!-- Barra de Búsqueda -->
    <div class="courses-toolbar">
      <div class="courses-search">
        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"
          />
        </svg>
        <input id="inventory-search" v-model="searchInput" type="text" placeholder="Buscar productos por nombre, SKU o tags..." autocomplete="off">
      </div>
    </div>

    <!-- Contador -->
    <div id="inventory-count" class="courses-count">{{ loadState === 'expired' ? '0 productos' : `Mostrando ${loadState === 'ready' ? filtered.length : 0} productos` }}</div>

    <!-- Grid de Productos -->
    <div id="inventory-grid" ref="gridEl" class="courses-grid">
      <div v-if="loadState === 'loading'" class="loading-state">
        <div class="loading-spinner"></div>
        <p>Cargando inventario...</p>
      </div>
      <div v-else-if="loadState === 'error'" class="error-state">
        <div class="error-icon">⚠️</div>
        <h3>Error al cargar inventario</h3>
        <p>{{ loadError }}</p>
        <button class="btn-secondary" @click="loadInventory()">Reintentar</button>
      </div>
      <div
        v-else-if="loadState === 'expired'"
        class="no-results"
        style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px 20px;text-align:center;color:var(--text-secondary);"
      >
        <div style="font-size: 4rem; margin-bottom: 20px;">📦</div>
        <h3 style="color: var(--text-primary); margin-bottom: 10px;">No has iniciado sesión o tu sesión ha expirado.</h3>
        <p style="margin-bottom: 20px;">¡Es el momento de empezar a organizar tus productos!</p>
        <button id="btn-add-first-product" class="btn-primary" style="margin-top: 10px;" @click="openAddModal()">
          <svg viewBox="0 0 24 24" width="18" height="18" style="vertical-align: middle; margin-right: 5px;">
            <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
          </svg>
          Agregar Primer Producto
        </button>
      </div>
      <template v-else>
        <!-- Sin resultados -->
        <div id="no-results" class="no-results" :style="{ display: filtered.length ? 'none' : 'block' }">
          <div class="no-results-icon">📦</div>
          <p>No se encontraron productos con ese filtro</p>
          <button id="btn-add-first" class="btn-secondary" @click="openAddModal()">Agregar tu primer producto</button>
        </div>
        <div
          v-for="p in filtered"
          :key="p.id"
          class="course-card"
          :data-category="p.category || 'general'"
          :data-stock="stockLevel(p.quantity)"
          :data-product-id="p.id"
          :style="{ '--card-accent': CATEGORY_COLORS[p.category ?? ''] || CATEGORY_COLORS.electronica }"
          @click="(e) => !(e.target as HTMLElement).closest('.product-actions') && showDetails(p)"
        >
          <div v-if="p.photo_r2_key" class="inv-card-media" :style="{ backgroundImage: `url('/api/image/${p.photo_r2_key}')` }">
            <span class="course-level" :class="STOCK[stockLevel(p.quantity)].cls">{{ STOCK[stockLevel(p.quantity)].label }}</span>
          </div>
          <div v-else class="inv-card-media no-photo">
            <span class="inv-card-emoji">{{ CATEGORY_ICONS[p.category ?? ''] || '📦' }}</span>
            <span class="course-level" :class="STOCK[stockLevel(p.quantity)].cls">{{ STOCK[stockLevel(p.quantity)].label }}</span>
          </div>
          <div class="inv-card-body">
            <h3 class="course-title inv-card-title">{{ p.name }}</h3>

            <div class="inv-card-desc-wrap">
              <p class="course-description inv-card-desc" :data-desc-id="p.id">{{ p.ai_description || 'Sin descripción' }}</p>
              <button type="button" class="inv-more-btn" :hidden="!overflowing.has(p.id)" @click.stop="openDescription(p)">Mostrar más</button>
            </div>

            <div class="product-tags inv-card-tags">
              <span v-for="tag in tagsOf(p).slice(0, 3)" :key="tag" class="tag-chip">{{ tag }}</span>
            </div>

            <div class="course-meta">
              <span class="course-meta-item"><span>📦</span> {{ p.quantity || 0 }} unidades</span>
              <span class="course-meta-item"><span>💰</span> ${{ (p.unit_price || 0).toFixed(2) }}</span>
            </div>

            <div class="product-demand">
              <span class="demand-label">Demanda:</span>
              <div class="demand-bar">
                <div class="demand-fill" :style="{ width: `${p.demand_score || 0}%`, background: demandColor(p.demand_score || 0) }"></div>
              </div>
              <span class="demand-score">{{ p.demand_score || 0 }}%</span>
            </div>

            <div class="product-actions">
              <button class="btn-view-details" :data-id="p.id" @click.stop="showDetails(p)">Ver Detalles</button>
              <button class="btn-sell-item" :data-id="p.id" title="Poner a la venta" @click.stop="openSellModal(p)">🏷️</button>
              <button class="btn-edit" :data-id="p.id" title="Editar" @click.stop="openAddModal(p)">✏️</button>
              <button class="btn-delete" :data-id="p.id" title="Eliminar" @click.stop="deleteProduct(p.id)">🗑️</button>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>

  <!-- Modal para Agregar/Editar Producto -->
  <div id="add-product-modal" class="modal" :class="{ hidden: modal !== 'add' }">
    <div class="modal-overlay" @click="closeModals"></div>
    <div class="modal-content slide-up">
      <button class="modal-close" @click="closeModals">&times;</button>
      <div class="modal-header">
        <h2 id="modal-title">{{ editingId !== null ? '✏️ Editar Producto' : '📦 Nuevo Producto Inteligente' }}</h2>
        <p class="modal-subtitle">Sube una foto y deja que la IA analice y genere la descripción</p>
      </div>
      <form id="inventory-form" @submit.prevent="submitForm">
        <!-- Zona de Carga de Foto -->
        <div
          v-show="editingId === null"
          id="inventory-dropzone"
          class="upload-zone"
          :class="{ 'drag-over': dragOver }"
          @click="(e) => e.target !== photoInput && photoInput?.click()"
          @dragover.prevent="dragOver = true"
          @dragleave.prevent="dragOver = false"
          @drop.prevent="onDrop"
        >
          <input id="inv-photo" ref="photoInput" type="file" accept="image/*" hidden @change="onPhotoInput">
          <div class="upload-icon">📸</div>
          <p class="upload-text">Haz clic o arrastra una foto del producto</p>
          <p class="upload-hint">Formatos soportados: JPG, PNG, WEBP (Máx 10MB)</p>
          <img v-show="preview" id="preview-img" :src="preview || undefined" style="max-width: 100%; border-radius: 8px; margin-top: 10px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
        </div>
        <!-- Campos del Formulario -->
        <div class="form-row">
          <div class="form-group">
            <label for="inv-name">Nombre del Producto *</label>
            <input id="inv-name" ref="nameInput" v-model="form.name" type="text" placeholder="Ej: Laptop Gaming ASUS" required>
          </div>
          <div class="form-group">
            <label for="inv-sku">SKU (Opcional - Se genera automáticamente si está vacío)</label>
            <input id="inv-sku" v-model="form.sku" type="text" placeholder="Ej: LAP-ASUS-001 (déjalo vacío para automático)">
            <small class="field-hint">Si no lo conoces, déjalo vacío y el sistema generará uno único.</small>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label for="inv-category">Categoría</label>
            <select id="inv-category" v-model="form.category">
              <option value="electronica">Electrónica</option>
              <option value="material">Material</option>
              <option value="mobiliario">Mobiliario</option>
              <option value="consumibles">Consumibles</option>
              <option value="software">Software</option>
            </select>
          </div>
          <div class="form-group">
            <label for="inv-quantity">Cantidad Inicial</label>
            <input id="inv-quantity" v-model="form.quantity" type="number" min="0">
          </div>
        </div>
        <div class="form-group">
          <label for="inv-specs">Especificaciones Técnicas (Opcional)</label>
          <textarea id="inv-specs" v-model="form.specs" placeholder="Ej: 16GB RAM, 512GB SSD, Intel i7, Pantalla 15.6&quot;" rows="3"></textarea>
        </div>
        <div class="form-group">
          <label for="inv-price">Precio Unitario ($)</label>
          <input id="inv-price" v-model="form.price" type="number" min="0" step="0.01" placeholder="0.00">
        </div>

        <!-- Indicador de Proceso IA -->
        <div id="ai-processing" class="ai-status" :class="{ hidden: !submitting }">
          <div class="ai-spinner"></div>
          <div class="ai-text">
            <strong>🤖 Mirai AI está analizando...</strong>
            <p>Identificando producto, generando descripción y calculando predicción</p>
          </div>
        </div>

        <!-- Botones de Acción -->
        <div class="modal-actions">
          <button type="button" class="btn-secondary modal-cancel" @click="closeModals">Cancelar</button>
          <button id="btn-submit-inv" type="submit" class="btn-primary" :disabled="submitting">
            <span class="btn-text" :class="{ hidden: submitting }">{{ editingId !== null ? 'Guardar Cambios' : 'Registrar y Analizar con IA' }}</span>
            <span class="btn-loading" :class="{ hidden: !submitting }">⏳ Procesando...</span>
          </button>
        </div>

        <!-- Mensaje de Estado -->
        <div id="inv-status" class="status-message" :class="status.type ? [status.type, { show: status.show }] : []">{{ status.message }}</div>
      </form>
    </div>
  </div>

  <!-- Modal: Poner producto a la venta -->
  <div id="sell-modal" class="modal" :class="{ hidden: modal !== 'sell' }">
    <div class="modal-overlay" @click="closeModals"></div>
    <div class="modal-content slide-up">
      <button class="modal-close" @click="closeModals">&times;</button>
      <div class="modal-header">
        <h2 id="sell-modal-title">🏷️ Poner a la venta</h2>
        <p id="sell-modal-subtitle" class="modal-subtitle">{{ selling ? `${selling.name} — ${selling.quantity} unidades en inventario` : '' }}</p>
      </div>
      <form id="sell-form" @submit.prevent="submitSell">
        <div class="form-row">
          <div class="form-group">
            <label for="sell-quantity">Cantidad a vender *</label>
            <input id="sell-quantity" v-model="sellForm.quantity" type="number" min="1" :max="selling?.quantity || 1" required>
            <small id="sell-quantity-hint" class="field-hint">Máximo disponible: {{ selling?.quantity || 0 }}</small>
          </div>
          <div class="form-group">
            <label for="sell-price">Precio unitario ($) *</label>
            <input id="sell-price" v-model="sellForm.price" type="number" min="0" step="0.01" required>
          </div>
        </div>
        <div id="sell-status" class="status-message" :class="sellStatus.type">{{ sellStatus.message }}</div>
        <div class="modal-actions">
          <button type="button" class="btn-secondary modal-cancel" @click="closeModals">Cancelar</button>
          <button id="btn-submit-sell" type="submit" class="btn-primary" :disabled="sellBusy">
            <span class="btn-text">Poner a la Venta</span>
          </button>
        </div>
      </form>
    </div>
  </div>

  <!-- Cuadro flotante con la descripción completa del producto -->
  <div id="desc-modal" class="modal inv-desc-modal" :class="{ hidden: modal !== 'desc' }">
    <div class="modal-overlay" @click="closeModals"></div>
    <div class="modal-content slide-up">
      <button id="desc-modal-close" class="modal-close" aria-label="Cerrar" @click="closeModals">&times;</button>
      <h2 id="desc-modal-title" class="inv-desc-modal-title">{{ described?.name }}</h2>
      <p class="inv-desc-modal-sub">Descripción completa</p>
      <p id="desc-modal-text" class="inv-desc-modal-text">{{ described?.ai_description || 'Sin descripción' }}</p>
    </div>
  </div>

  <!-- Modal para Ver Detalles del Producto -->
  <div id="product-detail-modal" class="modal" :class="{ hidden: modal !== 'detail' }">
    <div class="modal-overlay" @click="closeModals"></div>
    <div class="modal-content modal-large">
      <button class="modal-close" @click="closeModals">&times;</button>
      <div v-if="detail" id="product-detail-content">
        <div class="detail-header">
          <div v-if="detail.photo_r2_key" class="detail-photo">
            <img :src="`/api/image/${detail.photo_r2_key}`" :alt="detail.name">
          </div>
          <div class="detail-info">
            <h2>{{ detail.name }}</h2>
            <span class="detail-sku">SKU: {{ detail.sku || 'N/A' }}</span>
            <div class="detail-meta">
              <span class="meta-item">📦 {{ detail.quantity || 0 }} unidades</span>
              <span class="meta-item">💰 ${{ (detail.unit_price || 0).toFixed(2) }} c/u</span>
              <span class="meta-item">💵 Total: ${{ ((detail.quantity || 0) * (detail.unit_price || 0)).toFixed(2) }}</span>
            </div>
          </div>
        </div>

        <div class="detail-section">
          <h3>Descripción Técnica</h3>
          <p>{{ detail.ai_description || 'Sin descripción generada por IA' }}</p>
        </div>

        <div class="detail-section">
          <h3>Etiquetas IA</h3>
          <div class="tags-container">
            <span v-for="tag in tagsOf(detail)" :key="tag" class="tag-chip">{{ tag }}</span>
            <p v-if="!tagsOf(detail).length">Sin etiquetas</p>
          </div>
        </div>

        <div class="detail-section">
          <h3>Predicción de Demanda</h3>
          <div class="prediction-card" :class="prediction(detail).cls">
            <div class="prediction-score">{{ detail.demand_score || 0 }}%</div>
            <p>{{ prediction(detail).text }}</p>
            <p v-if="detail.predicted_restock_date" class="restock-date">Fecha estimada de reposición: {{ detail.predicted_restock_date }}</p>
          </div>
        </div>

        <div class="detail-section">
          <h3>Información</h3>
          <div class="info-grid">
            <div class="info-item">
              <span class="info-label">Categoría</span>
              <span class="info-value">{{ detail.category || 'N/A' }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">Creado</span>
              <span class="info-value">{{ formatDate(detail.created_at) }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">Actualizado</span>
              <span class="info-value">{{ formatDate(detail.updated_at) }}</span>
            </div>
          </div>
        </div>

        <div class="detail-actions">
          <button class="btn-secondary" @click="closeModals">Cerrar</button>
        </div>
      </div>
    </div>
  </div>

  <!-- Filtros, en el panel de la barra lateral -->
  <Teleport to="#sidebar-page-section" defer>
    <h4>Inventario</h4>
    <div class="sidebar-panel-section">
      <p class="sidebar-panel-label">Categoría</p>
      <div id="filter-pills" class="filter-pills sidebar-filter-list">
        <button v-for="c in CATEGORY_FILTERS" :key="c.id" class="filter-pill" :class="{ active: category === c.id }" :data-category="c.id" @click="category = c.id">{{ c.label }}</button>
      </div>

      <p class="sidebar-panel-label">Nivel de stock</p>
      <div id="stock-filter" class="filter-pills sidebar-filter-list">
        <button v-for="s in STOCK_FILTERS" :key="s.id" class="filter-pill" :class="{ active: stock === s.id }" :data-stock="s.id" @click="stock = s.id">{{ s.label }}</button>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
// Migración de public/inventory.html y public/inventory.js: inventario con
// foto analizada por la IA (/api/inventory/...), filtros por categoría y
// stock, y paso a la venta (/api/sales/listings).
//
// Arreglado al migrar: crear un producto fallaba siempre (usaba una variable
// authHeaders que no existía), la búsqueda se perdía al aplicar los filtros y
// los cambios en vivo no actualizaban nada.
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import MenuToggle from '@/components/MenuToggle.vue';
import { api, apiFetch, errorMessage } from '@/lib/api';
import { ensureSubscribed } from '@/lib/push';
import { flashElement, useRealtime } from '@/lib/realtime';

interface Product {
  id: number | string;
  name: string;
  sku?: string | null;
  category?: string | null;
  quantity: number;
  unit_price?: number | null;
  ai_description?: string | null;
  ai_tags?: string | string[] | null;
  demand_score?: number | null;
  predicted_restock_date?: string | null;
  photo_r2_key?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

type StockLevel = 'critical' | 'low' | 'available';

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const STOCK_LOW_THRESHOLD = 10;
const STOCK_CRITICAL_THRESHOLD = 3;

const CATEGORY_COLORS: Record<string, string> = {
  electronica: 'linear-gradient(135deg, #667eea, #764ba2)',
  material: 'linear-gradient(135deg, #f093fb, #f5576c)',
  mobiliario: 'linear-gradient(135deg, #4facfe, #00f2fe)',
  consumibles: 'linear-gradient(135deg, #43e97b, #38f9d7)',
  software: 'linear-gradient(135deg, #fa709a, #fee140)',
};
const CATEGORY_ICONS: Record<string, string> = { electronica: '💻', material: '📝', mobiliario: '🪑', consumibles: '🧴', software: '💿' };
const STOCK: Record<StockLevel, { cls: string; label: string }> = {
  critical: { cls: 'critical', label: 'Crítico' },
  low: { cls: 'warning', label: 'Bajo' },
  available: { cls: 'available', label: 'Disponible' },
};
const CATEGORY_FILTERS = [
  { id: 'todos', label: 'Todos' },
  { id: 'electronica', label: '💻 Electrónica' },
  { id: 'material', label: '📝 Material' },
  { id: 'mobiliario', label: '🪑 Mobiliario' },
  { id: 'consumibles', label: '🧴 Consumibles' },
  { id: 'software', label: '💿 Software' },
];
const STOCK_FILTERS = [
  { id: 'all', label: 'Todo' },
  { id: 'available', label: 'Disponible' },
  { id: 'low', label: 'Stock Bajo' },
  { id: 'critical', label: 'Crítico' },
];

// ── Helpers ───────────────────────────────────────────────────────────────
function stockLevel(quantity: number): StockLevel {
  if (quantity <= STOCK_CRITICAL_THRESHOLD) return 'critical';
  if (quantity <= STOCK_LOW_THRESHOLD) return 'low';
  return 'available';
}

function tagsOf(p: Product): string[] {
  if (!p.ai_tags) return [];
  try {
    const tags: unknown = typeof p.ai_tags === 'string' ? JSON.parse(p.ai_tags) : p.ai_tags;
    return Array.isArray(tags) ? tags.map(String) : [];
  } catch {
    return [];
  }
}

function demandColor(score: number): string {
  return score > 70 ? '#D00000' : score > 40 ? '#FF9F0A' : '#386A20';
}

function prediction(p: Product) {
  const score = p.demand_score || 0;
  if (score > 70) return { text: '⚠️ Alta probabilidad de reposición pronto', cls: 'warning' };
  if (score > 40) return { text: '📊 Demanda moderada', cls: 'info' };
  return { text: 'Demanda normal', cls: 'neutral' };
}

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return 'N/A';
  return new Date(dateStr).toLocaleDateString('es-ES', { year: 'numeric', month: 'short', day: 'numeric' });
}

// ── Carga ─────────────────────────────────────────────────────────────────
const products = ref<Product[]>([]);
const loadState = ref<'loading' | 'ready' | 'expired' | 'error'>('loading');
const loadError = ref('');
const gridEl = ref<HTMLElement | null>(null);

async function loadInventory({ quiet = false } = {}) {
  if (!quiet) loadState.value = 'loading';
  try {
    const res = await apiFetch('/api/inventory/list');
    if (res.status === 401) {
      loadState.value = 'expired';
      return;
    }
    if (!res.ok) throw new Error(`Error HTTP: ${res.status}`);
    const data = (await res.json()) as { products?: Product[] };
    products.value = data.products ?? [];
    loadState.value = 'ready';
  } catch (err) {
    console.error('Error cargando inventario:', err);
    loadError.value = err instanceof Error ? err.message : String(err);
    loadState.value = 'error';
  }
}

const stats = computed(() => {
  const list = products.value;
  return {
    total: list.length,
    low: list.filter((p) => stockLevel(p.quantity) !== 'available').length,
    analyzed: list.filter((p) => p.ai_description && p.ai_description.length > 0).length,
    value: `$${list.reduce((sum, p) => sum + (p.quantity || 0) * (p.unit_price || 0), 0).toFixed(2)}`,
  };
});

// ── Búsqueda y filtros ────────────────────────────────────────────────────
const searchInput = ref('');
const search = ref('');
const category = ref('todos');
const stock = ref('all');
let searchTimer: number | undefined;
watch(searchInput, (v) => {
  clearTimeout(searchTimer);
  searchTimer = window.setTimeout(() => (search.value = v.toLowerCase().trim()), 300);
});
onBeforeUnmount(() => clearTimeout(searchTimer));

const filtered = computed(() => {
  const q = search.value;
  return products.value.filter(
    (p) =>
      (category.value === 'todos' || p.category === category.value) &&
      (stock.value === 'all' || stockLevel(p.quantity) === stock.value) &&
      (!q || (p.name || '').toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q) || tagsOf(p).some((t) => t.toLowerCase().includes(q))),
  );
});

// "Mostrar más" solo si la descripción no cabe en las 3 líneas visibles: se
// mide con las tarjetas ya pintadas.
const overflowing = ref(new Set<Product['id']>());
watch(
  filtered,
  async () => {
    await nextTick();
    const next = new Set<Product['id']>();
    for (const p of filtered.value) {
      const el = gridEl.value?.querySelector<HTMLElement>(`[data-desc-id="${CSS.escape(String(p.id))}"]`);
      if (el && el.scrollHeight - el.clientHeight > 1) next.add(p.id);
    }
    overflowing.value = next;
  },
  { flush: 'post' },
);

// ── Modales ───────────────────────────────────────────────────────────────
const modal = ref<'add' | 'sell' | 'desc' | 'detail' | null>(null);
const detail = ref<Product | null>(null);
const described = ref<Product | null>(null);

function closeModals() {
  modal.value = null;
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') closeModals();
}
onMounted(() => document.addEventListener('keydown', onKeydown));
onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown));

function showDetails(p: Product) {
  detail.value = p;
  modal.value = 'detail';
}

function openDescription(p: Product) {
  described.value = p;
  modal.value = 'desc';
}

// ── Alta / edición ────────────────────────────────────────────────────────
const nameInput = ref<HTMLInputElement | null>(null);
const photoInput = ref<HTMLInputElement | null>(null);
const editingId = ref<Product['id'] | null>(null);
const selectedFile = ref<File | null>(null);
const preview = ref('');
const dragOver = ref(false);
const submitting = ref(false);
const form = reactive({ name: '', sku: '', category: 'electronica', quantity: 0 as number | string, specs: '', price: '' as number | string });

const status = reactive({ message: '', type: '', show: false });
let statusTimer: number | undefined;
onBeforeUnmount(() => clearTimeout(statusTimer));

function showStatus(message: string, type: '' | 'success' | 'error' = '') {
  Object.assign(status, { message, type, show: !!type });
  clearTimeout(statusTimer);
  if (message) statusTimer = window.setTimeout(() => (status.show = false), 5000);
}

function resetForm() {
  Object.assign(form, { name: '', sku: '', category: 'electronica', quantity: 0, specs: '', price: '' });
  selectedFile.value = null;
  preview.value = '';
  if (photoInput.value) photoInput.value.value = '';
  showStatus('');
}

function openAddModal(p?: Product) {
  resetForm();
  editingId.value = p ? p.id : null;
  if (p) {
    Object.assign(form, {
      name: p.name || '',
      sku: p.sku || '',
      category: p.category || '',
      quantity: p.quantity || 0,
      price: p.unit_price || 0,
      specs: p.ai_description || '',
    });
    // En edición la foto no se cambia (la zona de la foto está oculta).
    if (p.photo_r2_key) preview.value = `/api/image/${p.photo_r2_key}`;
  }
  modal.value = 'add';
  setTimeout(() => nameInput.value?.focus(), 100);
}

function selectFile(file: File | undefined) {
  if (!file) return;
  if (file.size > MAX_FILE_SIZE) {
    showStatus('El archivo excede 10MB', 'error');
    return;
  }
  if (!file.type.startsWith('image/')) {
    showStatus('Por favor, selecciona un archivo de imagen', 'error');
    return;
  }
  selectedFile.value = file;
  const reader = new FileReader();
  reader.onload = () => (preview.value = String(reader.result));
  reader.readAsDataURL(file);
  showStatus('✅ Imagen seleccionada', 'success');
}

function onPhotoInput(e: Event) {
  selectFile((e.target as HTMLInputElement).files?.[0]);
}

function onDrop(e: DragEvent) {
  dragOver.value = false;
  selectFile(e.dataTransfer?.files[0]);
}

function uniqueSkuError(data: unknown, message: string): string | null {
  const details = (data as { details?: unknown } | null)?.details;
  return typeof details === 'string' && details.includes('UNIQUE constraint') ? message : null;
}

async function submitForm() {
  if (submitting.value) return;
  const name = form.name;
  const quantity = parseInt(String(form.quantity), 10) || 0;
  const price = parseFloat(String(form.price)) || 0;
  if (!name.trim()) {
    showStatus('El nombre del producto es obligatorio', 'error');
    return;
  }
  if (editingId.value === null && !selectedFile.value) {
    showStatus('Por favor, sube una foto del producto', 'error');
    return;
  }

  submitting.value = true;
  try {
    if (editingId.value !== null) {
      const { ok, data } = await api.put('/api/inventory/update', {
        id: editingId.value,
        name,
        sku: form.sku.trim() || null,
        category: form.category,
        quantity,
        unit_price: price,
        ai_description: form.specs,
        ai_tags: form.category,
      });
      if (!ok) {
        throw new Error(
          uniqueSkuError(data, 'Ya existe un producto con ese SKU. Por favor, usa otro o déjalo vacío.') ?? errorMessage(data, 'Error al actualizar producto'),
        );
      }
      showStatus('✅ Producto actualizado correctamente', 'success');
      await loadInventory({ quiet: true });
      closeModals();
    } else {
      const fd = new FormData();
      fd.append('photo', selectedFile.value!);
      fd.append('name', name);
      fd.append('sku', form.sku);
      fd.append('category', form.category);
      fd.append('quantity', String(quantity));
      fd.append('specs', form.specs);
      fd.append('unit_price', String(price));
      const res = await apiFetch('/api/inventory/upload', { method: 'POST', body: fd });
      const data = (await res.json().catch(() => ({}))) as { sku?: string };
      if (!res.ok) {
        throw new Error(
          uniqueSkuError(data, 'Ya existe un producto con ese SKU. Déjalo vacío para generar uno automático.') ?? errorMessage(data, 'Error al registrar producto'),
        );
      }
      showStatus(`✅ ¡Producto registrado! SKU: ${data.sku || 'Automático'} - La IA está analizando...`, 'success');
      setTimeout(() => {
        void loadInventory({ quiet: true });
        closeModals();
      }, 3000);
    }
  } catch (err) {
    console.error('Error en formulario:', err);
    showStatus(`❌ Error: ${err instanceof Error ? err.message : String(err)}`, 'error');
  } finally {
    submitting.value = false;
  }
}

// ── Eliminar ──────────────────────────────────────────────────────────────
async function deleteProduct(id: Product['id']) {
  if (!confirm('¿Estás seguro de que deseas eliminar este producto? Esta acción no se puede deshacer y se borrará la imagen asociada.')) return;
  const { ok, data } = await api.delete(`/api/inventory/delete?id=${encodeURIComponent(String(id))}`);
  if (!ok) {
    alert(`❌ Error: ${errorMessage(data, 'Error al eliminar')}`);
    return;
  }
  await loadInventory({ quiet: true });
  closeModals();
}

// ── Poner a la venta ──────────────────────────────────────────────────────
const selling = ref<Product | null>(null);
const sellForm = reactive({ quantity: 1 as number | string, price: '' as number | string });
const sellStatus = reactive({ message: '', type: '' });
const sellBusy = ref(false);

function openSellModal(p: Product) {
  selling.value = p;
  Object.assign(sellForm, { quantity: p.quantity || 1, price: (p.unit_price || 0).toFixed(2) });
  Object.assign(sellStatus, { message: '', type: '' });
  modal.value = 'sell';
}

async function submitSell() {
  const quantity = parseInt(String(sellForm.quantity), 10);
  const unitPrice = parseFloat(String(sellForm.price));
  if (!quantity || quantity <= 0) {
    Object.assign(sellStatus, { message: 'Ingresa una cantidad válida.', type: 'error' });
    return;
  }
  sellBusy.value = true;
  try {
    const { ok, status: code, data } = await api.post('/api/sales/listings', { product_id: selling.value?.id, quantity, unit_price: unitPrice });
    if (!ok) throw new Error(errorMessage(data, `HTTP ${code}`));
    Object.assign(sellStatus, { message: '✅ Producto puesto a la venta.', type: 'success' });
    setTimeout(closeModals, 900);
  } catch (err) {
    Object.assign(sellStatus, { message: (err instanceof Error && err.message) || 'Error al poner el producto a la venta.', type: 'error' });
  } finally {
    sellBusy.value = false;
  }
}

// ── En vivo: cambios desde otro dispositivo ───────────────────────────────
useRealtime('inventory', (data) => {
  const changed = ((data as { products?: { id: Product['id'] }[] } | null)?.products ?? []).map((p) => String(p.id));
  if (!changed.length) return;
  void (async () => {
    await loadInventory({ quiet: true });
    await nextTick();
    for (const id of changed) flashElement(gridEl.value?.querySelector(`[data-product-id="${CSS.escape(id)}"]`));
  })();
});

onMounted(() => {
  void ensureSubscribed();
  void loadInventory();
});
</script>

<style>
/* CSS propio de la página antigua, limitado a ella (ver router: meta.page). */
/* ── Filtros de inventario en el panel lateral ── */
:where(body[data-page="inventory"]) .sidebar-panel-section {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}

:where(body[data-page="inventory"]) .sidebar-panel-label {
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-tertiary);
  margin: 4px 0 8px;
}

:where(body[data-page="inventory"]) .sidebar-filter-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 20px;
}

:where(body[data-page="inventory"]) .sidebar-filter-list .filter-pill {
  width: 100%;
  box-sizing: border-box;
  text-align: left;
  justify-content: flex-start;
}

/* ── Grid de inventario: 3 columnas en escritorio ── */
@media (min-width: 901px) {
  :where(body[data-page="inventory"]) #inventory-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}

/* ── Botón "Poner a la venta" ── */
:where(body[data-page="inventory"]) .btn-sell-item {
  background: rgba(22, 163, 74, 0.1);
  color: #16a34a;
  border: 1px solid rgba(22, 163, 74, 0.25);
}

:where(body[data-page="inventory"]) .btn-sell-item:hover {
  background: #16a34a;
  color: #fff;
  border-color: #16a34a;
}

/* ══════════════════════════════════════════════
 TARJETAS DE PRODUCTO — TODAS DEL MISMO TAMAÑO
 ══════════════════════════════════════════════
 Cada bloque de la tarjeta tiene una altura fija o recortada, de modo
 que la altura total no depende del largo del nombre, la descripción
 ni del número de etiquetas. `grid-auto-rows: 1fr` iguala además
 todas las filas entre sí. */
:where(body[data-page="inventory"]) #inventory-grid {
  grid-auto-rows: 1fr;
  align-items: stretch;
}

:where(body[data-page="inventory"]) #inventory-grid .course-card {
  height: 100%;
  padding: 0 0 18px;
  cursor: pointer;
}

/* ── Cabecera visual: foto del producto o degradado con emoji ── */
:where(body[data-page="inventory"]) .inv-card-media {
  position: relative;
  height: 132px;
  flex-shrink: 0;
  background-size: cover;
  background-position: center;
  background-color: var(--secondary-container);
  display: flex;
  align-items: center;
  justify-content: center;
  border-bottom: 1px solid var(--glass-border);
}

:where(body[data-page="inventory"]) .inv-card-media.no-photo {
  background-image: var(--card-accent);
}

:where(body[data-page="inventory"]) .inv-card-media.no-photo::after {
  content: '';
  position: absolute;
  inset: 0;
  background: var(--glass-bg);
  opacity: 0.72;
}

:where(body[data-page="inventory"]) .inv-card-emoji {
  position: relative;
  z-index: 1;
  font-size: 2.6rem;
  line-height: 1;
}

/* La insignia de stock se ancla sobre la cabecera */
:where(body[data-page="inventory"]) #inventory-grid .course-level {
  top: 10px;
  right: 10px;
  z-index: 2;
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
}

/* Colores de la insignia según el nivel de stock */
:where(body[data-page="inventory"]) .course-level.available {
  background: rgba(56, 106, 32, 0.18);
  color: #386A20;
  border: 1px solid rgba(56, 106, 32, 0.3);
}

[data-theme="dark"] :where(body[data-page="inventory"]) .course-level.available {
  background: rgba(168, 216, 140, 0.18);
  color: #A8D88C;
}

:where(body[data-page="inventory"]) .course-level.warning {
  background: rgba(255, 159, 10, 0.18);
  color: #C77700;
  border: 1px solid rgba(255, 159, 10, 0.3);
}

[data-theme="dark"] :where(body[data-page="inventory"]) .course-level.warning {
  color: #FFB74D;
}

:where(body[data-page="inventory"]) .course-level.critical {
  background: rgba(208, 0, 0, 0.18);
  color: #D00000;
  border: 1px solid rgba(208, 0, 0, 0.3);
}

[data-theme="dark"] :where(body[data-page="inventory"]) .course-level.critical {
  color: #FF8A80;
}

/* ── Cuerpo de la tarjeta ── */
:where(body[data-page="inventory"]) .inv-card-body {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  padding: 16px 18px 0;
}

/* Nombre: siempre 2 líneas de alto, recortado con puntos suspensivos */
:where(body[data-page="inventory"]) .inv-card-title {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  min-height: 2.6em;
  margin-bottom: 6px;
}

/* Descripción: 3 líneas exactas para que el pie quede alineado */
:where(body[data-page="inventory"]) .inv-card-desc-wrap {
  margin-bottom: 8px;
}

:where(body[data-page="inventory"]) .inv-card-desc {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  min-height: calc(3 * 1.55em);
  margin-bottom: 0;
  flex: none;
}

/* Botón "Mostrar más": sólo se muestra si el texto se recortó */
:where(body[data-page="inventory"]) .inv-more-btn {
  background: none;
  border: none;
  padding: 2px 0 0;
  margin: 0;
  font-family: inherit;
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--accent-color);
  cursor: pointer;
  transition: opacity 0.2s;
}

:where(body[data-page="inventory"]) .inv-more-btn:hover {
  opacity: 0.75;
  text-decoration: underline;
}

/* Etiquetas de IA: una sola fila, sin desbordar. El `margin-top: auto`
 empuja este bloque y todo lo que sigue (unidades, demanda, botones)
 al pie de la tarjeta, de modo que quedan alineados entre tarjetas
 aunque la descripción sea más corta o falte el botón "Mostrar más". */
:where(body[data-page="inventory"]) .inv-card-tags {
  margin: auto 0 4px;
  height: 24px;
  overflow: hidden;
  flex-wrap: nowrap;
}

:where(body[data-page="inventory"]) .inv-card-tags .tag-chip {
  white-space: nowrap;
}

/* Pie de la tarjeta */
:where(body[data-page="inventory"]) #inventory-grid .course-meta {
  margin-bottom: 0;
  padding-top: 12px;
}

:where(body[data-page="inventory"]) #inventory-grid .product-demand {
  margin: 10px 0 0;
}

:where(body[data-page="inventory"]) #inventory-grid .product-actions {
  margin-top: 12px;
}

/* ── Cuadro flotante con la descripción completa ── */
:where(body[data-page="inventory"]) .inv-desc-modal .modal-content {
  max-width: 560px;
  padding: 28px;
}

:where(body[data-page="inventory"]) .inv-desc-modal-title {
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0 0 4px;
  padding-right: 32px;
}

:where(body[data-page="inventory"]) .inv-desc-modal-sub {
  font-size: 0.78rem;
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-weight: 600;
  margin: 0 0 16px;
}

:where(body[data-page="inventory"]) .inv-desc-modal-text {
  font-size: 0.92rem;
  line-height: 1.65;
  color: var(--text-secondary);
  white-space: pre-wrap;
  max-height: 55vh;
  overflow-y: auto;
  margin: 0;
}
</style>
