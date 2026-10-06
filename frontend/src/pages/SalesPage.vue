<template>
  <header class="header">
    <MenuToggle />
    <div class="header-title">Ventas</div>
    <button id="new-purchase-btn" class="btn-primary" title="Registrar compra" @click="openPurchaseModal()">
      <svg viewBox="0 0 24 24" width="18" height="18">
        <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
      </svg>
      <span>Nueva Venta</span>
    </button>
  </header>

  <div class="sales-container">
    <div class="courses-hero">
      <h1>Ventas</h1>
      <p>Gestiona los artículos que pusiste a la venta desde el inventario, tus compradores y el estado de los pagos. Uso interno — solo tú puedes ver estos datos.</p>
    </div>

    <!-- Estadísticas -->
    <div class="sales-stats">
      <div class="stat-card">
        <div class="stat-icon">📦</div>
        <div class="stat-content">
          <span class="stat-card-label">En Venta</span>
          <span id="stat-listings" class="stat-card-value">{{ stats.listings }}</span>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">💰</div>
        <div class="stat-content">
          <span class="stat-card-label">Valor en Venta</span>
          <span id="stat-listings-value" class="stat-card-value">{{ stats.listingsValue }}</span>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">⏳</div>
        <div class="stat-content">
          <span class="stat-card-label">Pendientes</span>
          <span id="stat-pending" class="stat-card-value">{{ pending.length }}</span>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">✅</div>
        <div class="stat-content">
          <span class="stat-card-label">Cobrado</span>
          <span id="stat-paid-value" class="stat-card-value">{{ stats.paidValue }}</span>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">👤</div>
        <div class="stat-content">
          <span class="stat-card-label">Compradores</span>
          <span id="stat-buyers" class="stat-card-value">{{ buyers.length }}</span>
        </div>
      </div>
    </div>

    <!-- Tabs -->
    <div class="sales-tabs">
      <button v-for="t in TABS" :key="t.id" class="sales-tab" :class="{ active: view === t.id }" :data-view="t.id" @click="view = t.id">
        {{ t.label }} <span :id="`badge-${t.id}`" class="sales-tab-badge">{{ badges[t.id] }}</span>
      </button>
    </div>

    <!-- Vista: Inventario en Venta -->
    <div id="view-listings" class="sales-view" :class="{ active: view === 'listings' }">
      <div id="listings-grid" class="courses-grid">
        <div v-if="emptyMessage" class="empty-view"><div class="empty-icon">📦</div><p>{{ emptyMessage }}</p></div>
        <div v-else-if="loaded && !listings.length" class="empty-view">
          <div class="empty-icon">📦</div>
          <p>Aún no has puesto ningún artículo a la venta. Ve a Inventario y desliza un producto para ponerlo en venta.</p>
        </div>
        <div v-for="l in emptyMessage ? [] : listings" :key="l.id" class="course-card sale-listing-card">
          <span class="course-level" :class="LISTING_STATUS[l.status]?.cls ?? 'available'">{{ LISTING_STATUS[l.status]?.label ?? 'En venta' }}</span>
          <div class="course-icon">🏷️</div>
          <h3 class="course-title">{{ l.product_name }}</h3>
          <div class="course-meta">
            <span class="course-meta-item"><span>📦</span> {{ l.quantity }} disponibles</span>
            <span class="course-meta-item"><span>💰</span> {{ formatMoney(l.unit_price) }} c/u</span>
          </div>
          <div class="listing-actions">
            <button class="btn-sell" :data-id="l.id" :disabled="!canSell(l)" @click="canSell(l) && openPurchaseModal(l.id)">Vender</button>
            <button class="btn-withdraw" :data-id="l.id" @click="withdrawListing(l.id)">Retirar</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Vista: Pagos Pendientes -->
    <div id="view-pending" class="sales-view" :class="{ active: view === 'pending' }">
      <div class="sales-table-wrap">
        <table class="sales-table">
          <thead>
            <tr>
              <th>Producto</th>
              <th>Comprador</th>
              <th>Cant.</th>
              <th>Total</th>
              <th>Fecha</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody id="pending-rows">
            <template v-if="!emptyMessage && loaded">
              <tr v-if="!pending.length">
                <td colspan="6"><div class="empty-view"><div class="empty-icon">⏳</div><p>No hay pagos pendientes.</p></div></td>
              </tr>
              <tr v-for="t in pending" :key="t.id">
                <td>{{ t.product_name }}</td>
                <td>
                  <div class="buyer-name-cell">
                    <span>{{ t.buyer_first_name }} {{ t.buyer_last_name }}</span>
                    <span style="color:var(--text-tertiary);font-size:.78rem;">{{ t.buyer_cedula }}</span>
                  </div>
                </td>
                <td>{{ t.quantity }}</td>
                <td>{{ formatMoney(t.total_amount) }}</td>
                <td>{{ formatDate(t.created_at) }}</td>
                <td class="row-actions">
                  <button class="btn-icon-sm btn-mark-paid" :data-id="t.id" title="Marcar como pagado" @click="updateTransactionStatus(t.id, 'pagado')">✅</button>
                  <button class="btn-icon-sm btn-cancel-tx" :data-id="t.id" title="Cancelar y devolver al inventario" @click="cancelTransaction(t.id)">↩️</button>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Vista: Pagos Realizados -->
    <div id="view-paid" class="sales-view" :class="{ active: view === 'paid' }">
      <div class="sales-table-wrap">
        <table class="sales-table">
          <thead>
            <tr>
              <th>Producto</th>
              <th>Comprador</th>
              <th>Cant.</th>
              <th>Total</th>
              <th>Pagado el</th>
            </tr>
          </thead>
          <tbody id="paid-rows">
            <template v-if="!emptyMessage && loaded">
              <tr v-if="!paid.length">
                <td colspan="5"><div class="empty-view"><div class="empty-icon">✅</div><p>Aún no hay pagos realizados.</p></div></td>
              </tr>
              <tr v-for="t in paid" :key="t.id">
                <td>{{ t.product_name }}</td>
                <td>
                  <div class="buyer-name-cell">
                    <span>{{ t.buyer_first_name }} {{ t.buyer_last_name }}</span>
                    <span style="color:var(--text-tertiary);font-size:.78rem;">{{ t.buyer_cedula }}</span>
                  </div>
                </td>
                <td>{{ t.quantity }}</td>
                <td>{{ formatMoney(t.total_amount) }}</td>
                <td>{{ formatDate(t.paid_at) }}</td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Vista: Compradores -->
    <div id="view-buyers" class="sales-view" :class="{ active: view === 'buyers' }">
      <div class="courses-toolbar" style="margin-bottom:1rem;">
        <div class="courses-search">
          <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"
            />
          </svg>
          <input id="buyer-search" v-model="buyerSearch" type="text" placeholder="Buscar por nombre o cédula..." autocomplete="off">
        </div>
        <button id="new-buyer-btn" class="btn-primary" @click="openBuyerModal">
          <svg viewBox="0 0 24 24" width="18" height="18"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" /></svg>
          <span>Registrar Comprador</span>
        </button>
      </div>
      <div class="sales-table-wrap">
        <table class="sales-table">
          <thead>
            <tr>
              <th></th>
              <th>Nombre</th>
              <th>Cédula</th>
              <th>Teléfono</th>
              <th>Cuenta</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody id="buyers-rows">
            <template v-if="!emptyMessage && loaded">
              <tr v-if="!filteredBuyers.length">
                <td colspan="6">
                  <div class="empty-view">
                    <div class="empty-view">
                      <div class="empty-icon">👤</div>
                      <p>{{ buyers.length === 0 ? 'Aún no has registrado compradores.' : 'Sin resultados para esa búsqueda.' }}</p>
                    </div>
                  </div>
                </td>
              </tr>
              <tr v-for="b in filteredBuyers" :key="b.id">
                <td>
                  <button class="fav-star" :class="{ active: b.is_favorite }" :data-id="b.id" title="Favorito" @click="toggleFavorite(b)">{{ b.is_favorite ? '⭐' : '☆' }}</button>
                </td>
                <td>{{ b.first_name }} {{ b.last_name }}</td>
                <td>{{ b.cedula }}</td>
                <td>{{ b.phone || '—' }}</td>
                <td><span class="account-badge" :class="b.has_account ? 'yes' : 'no'">{{ b.has_account ? '✓ Tiene cuenta' : 'Sin cuenta' }}</span></td>
                <td class="row-actions">
                  <button class="btn-icon-sm btn-delete-buyer" :data-id="b.id" title="Eliminar" @click="deleteBuyer(b.id)">🗑️</button>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Vista: Facturas -->
    <div id="view-invoices" class="sales-view" :class="{ active: view === 'invoices' }">
      <div class="sales-table-wrap">
        <table class="sales-table">
          <thead>
            <tr>
              <th>N.º Factura</th>
              <th>Producto</th>
              <th>Comprador</th>
              <th>Cant.</th>
              <th>Subtotal</th>
              <th>IVA (16%)</th>
              <th>Total</th>
              <th>Fecha</th>
              <th>PDF</th>
            </tr>
          </thead>
          <tbody id="invoices-rows">
            <template v-if="!emptyMessage && loaded">
              <tr v-if="!invoices.length">
                <td colspan="9">
                  <div class="empty-view">
                    <div class="empty-icon">🧾</div>
                    <p>Aún no se ha generado ninguna factura. Se crean automáticamente al registrar una venta.</p>
                  </div>
                </td>
              </tr>
              <tr v-for="inv in invoices" :key="inv.id">
                <td>{{ inv.invoice_number }}</td>
                <td>{{ inv.product_name }}</td>
                <td>{{ inv.buyer_first_name }} {{ inv.buyer_last_name }} <span style="color:var(--text-tertiary);font-size:.78rem;">({{ inv.buyer_cedula }})</span></td>
                <td>{{ inv.quantity }}</td>
                <td>{{ formatMoney(inv.subtotal) }}</td>
                <td>{{ formatMoney(inv.tax_amount) }}</td>
                <td><strong>{{ formatMoney(inv.total_amount) }}</strong></td>
                <td>{{ formatDate(inv.created_at) }}</td>
                <td><a class="btn-view-pdf" :href="`/api/sales/invoices/${encodeURIComponent(inv.id)}/pdf`" target="_blank" rel="noopener">🧾 Ver PDF</a></td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
    </div>
  </div>

  <!-- Modal: Registrar Comprador -->
  <div id="buyer-modal" class="modal" :class="{ hidden: modal !== 'buyer' }">
    <div class="modal-overlay" @click="closeModals"></div>
    <div class="modal-content slide-up">
      <button class="modal-close" @click="closeModals">&times;</button>
      <div class="modal-header">
        <h2 id="buyer-modal-title">👤 Registrar Comprador</h2>
        <p class="modal-subtitle">Estos datos son privados y solo tú puedes verlos.</p>
      </div>
      <form id="buyer-form" @submit.prevent="submitBuyer">
        <div class="form-row">
          <div class="form-group">
            <label for="buyer-first-name">Nombre *</label>
            <input id="buyer-first-name" ref="buyerFirstNameEl" v-model="buyerForm.firstName" type="text" required placeholder="Ej: María">
          </div>
          <div class="form-group">
            <label for="buyer-last-name">Apellido *</label>
            <input id="buyer-last-name" v-model="buyerForm.lastName" type="text" required placeholder="Ej: Pérez">
          </div>
        </div>
        <div class="form-group">
          <label for="buyer-cedula-number">Cédula *</label>
          <div class="cedula-row">
            <select id="buyer-cedula-nat" v-model="buyerForm.nat">
              <option v-for="n in ['V', 'E', 'J', 'P', 'G']" :key="n" :value="n">{{ n }}</option>
            </select>
            <input id="buyer-cedula-number" v-model="buyerForm.number" type="text" required placeholder="00000000" inputmode="numeric" pattern="\d{5,9}">
          </div>
          <small class="field-hint">Formato: V-00000000 (nacionalidad - número de identificación)</small>
        </div>
        <div class="form-group">
          <label for="buyer-phone">Teléfono</label>
          <input id="buyer-phone" v-model="buyerForm.phone" type="tel" placeholder="Ej: 0414-1234567">
        </div>
        <div id="buyer-status" :class="['status-message', buyerStatus.type]">{{ buyerStatus.message }}</div>
        <div class="modal-actions">
          <button type="button" class="btn-secondary modal-cancel" @click="closeModals">Cancelar</button>
          <button id="btn-submit-buyer" type="submit" class="btn-primary" :disabled="buyerBusy">
            <span class="btn-text">Guardar Comprador</span>
          </button>
        </div>
      </form>
    </div>
  </div>

  <!-- Modal: Nueva Venta -->
  <div id="purchase-modal" class="modal" :class="{ hidden: modal !== 'purchase' }">
    <div class="modal-overlay" @click="closeModals"></div>
    <div class="modal-content slide-up">
      <button class="modal-close" @click="closeModals">&times;</button>
      <div class="modal-header">
        <h2>🛒 Registrar Venta</h2>
        <p class="modal-subtitle">Se descontará automáticamente del inventario.</p>
      </div>
      <form id="purchase-form" @submit.prevent="submitPurchase">
        <div class="form-group">
          <label for="purchase-listing">Artículo *</label>
          <select id="purchase-listing" v-model="purchase.listingId" required>
            <option v-for="l in sellable" :key="l.id" :value="l.id">{{ l.product_name }} — {{ l.quantity }} disp. — {{ formatMoney(l.unit_price) }}</option>
          </select>
        </div>
        <div class="form-group">
          <label for="purchase-quantity">Cantidad *</label>
          <input id="purchase-quantity" v-model="purchase.quantity" type="number" min="1" :max="selectedListing?.quantity" required>
          <small id="purchase-available-hint" class="field-hint">{{ selectedListing ? `Máximo disponible: ${selectedListing.quantity}` : '' }}</small>
        </div>
        <div class="form-group">
          <label>Comprador *</label>
          <input id="purchase-buyer-search" v-model="purchase.buyerSearch" type="text" placeholder="Buscar comprador por nombre o cédula...">
          <div id="purchase-buyer-picker" class="buyer-picker">
            <div v-if="!pickerBuyers.length" class="buyer-picker-item">Sin compradores. Regístralo abajo.</div>
            <div v-for="b in pickerBuyers" :key="b.id" class="buyer-picker-item" :class="{ selected: b.id === purchase.buyerId }" @click="purchase.buyerId = b.id">
              <span>{{ b.is_favorite ? '⭐ ' : '' }}{{ b.first_name }} {{ b.last_name }} — {{ b.cedula }}</span>
            </div>
          </div>
          <button id="purchase-new-buyer-btn" type="button" class="btn-secondary" style="margin-top:8px;width:100%;" @click="newBuyerFromPurchase">+ Registrar nuevo comprador</button>
        </div>
        <div class="form-group">
          <label for="purchase-notes">Notas (opcional)</label>
          <textarea id="purchase-notes" v-model="purchase.notes" rows="2" placeholder="Ej: Pago en 2 partes, entrega el viernes..."></textarea>
        </div>
        <div class="purchase-total">
          <span>Total</span>
          <span id="purchase-total-amount">{{ formatMoney(selectedListing ? (parseInt(String(purchase.quantity), 10) || 0) * selectedListing.unit_price : 0) }}</span>
        </div>
        <div id="purchase-status" :class="['status-message', purchaseStatus.type]">{{ purchaseStatus.message }}</div>
        <div class="modal-actions">
          <button type="button" class="btn-secondary modal-cancel" @click="closeModals">Cancelar</button>
          <button id="btn-submit-purchase" type="submit" class="btn-primary" :disabled="purchaseBusy">
            <span class="btn-text">Confirmar Venta</span>
          </button>
        </div>
      </form>
    </div>
  </div>

  <!-- Vistas, en el panel de la barra lateral -->
  <Teleport to="#sidebar-page-section" defer>
    <h4>Ventas</h4>
    <div class="sidebar-panel-section" style="flex:1; overflow-y:auto; min-height:0;">
      <p class="sidebar-panel-label" style="font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-tertiary);margin:4px 0 8px;">Vista</p>
      <div id="sidebar-view-pills" class="filter-pills sidebar-filter-list" style="display:flex;flex-direction:column;gap:6px;margin-bottom:20px;">
        <button
          v-for="t in TABS"
          :key="t.id"
          class="filter-pill"
          :class="{ active: view === t.id }"
          :data-view="t.id"
          style="width:100%;box-sizing:border-box;text-align:left;justify-content:flex-start;"
          @click="view = t.id"
        >
          {{ t.label }}
        </button>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
// Migración de public/sales.html y public/sales.js: artículos puestos a la
// venta desde el inventario, compradores, pagos y facturas (/api/sales/...).
import { computed, nextTick, onMounted, reactive, ref } from 'vue';
import MenuToggle from '@/components/MenuToggle.vue';
import { api, errorMessage } from '@/lib/api';
import { ensureSubscribed } from '@/lib/push';

interface Listing {
  id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  status: string;
}

interface Buyer {
  id: string;
  first_name: string;
  last_name: string;
  cedula: string;
  phone?: string | null;
  is_favorite?: number | boolean;
  has_account?: number | boolean;
}

interface Transaction {
  id: string;
  product_name: string;
  buyer_first_name: string;
  buyer_last_name: string;
  buyer_cedula: string;
  quantity: number;
  total_amount: number;
  created_at?: string | null;
  paid_at?: string | null;
}

interface Invoice extends Omit<Transaction, 'paid_at'> {
  invoice_number: string;
  subtotal: number;
  tax_amount: number;
}

type View = 'listings' | 'pending' | 'paid' | 'buyers' | 'invoices';

const TABS: { id: View; label: string }[] = [
  { id: 'listings', label: '📦 Inventario en Venta' },
  { id: 'pending', label: '⏳ Pagos Pendientes' },
  { id: 'paid', label: '✅ Pagos Realizados' },
  { id: 'buyers', label: '👤 Compradores' },
  { id: 'invoices', label: '🧾 Facturas' },
];

const LISTING_STATUS: Record<string, { label: string; cls: string }> = {
  agotado: { label: 'Agotado', cls: 'critical' },
  retirado: { label: 'Retirado', cls: 'warning' },
};

function formatMoney(n?: number | null): string {
  return `$${(n || 0).toFixed(2)}`;
}

function formatDate(str?: string | null): string {
  if (!str) return '—';
  return new Date(str).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ── Datos ─────────────────────────────────────────────────────────────────
const listings = ref<Listing[]>([]);
const buyers = ref<Buyer[]>([]);
const pending = ref<Transaction[]>([]);
const paid = ref<Transaction[]>([]);
const invoices = ref<Invoice[]>([]);
const loaded = ref(false);
/** Si no se pudo cargar: el aviso va en la vista de artículos y las tablas quedan vacías. */
const emptyMessage = ref('');
const view = ref<View>('listings');

class SessionExpired extends Error {}

async function getList<T>(path: string): Promise<T[]> {
  const { ok, status, data } = await api.get<T[] | { results?: T[]; error?: string }>(path);
  if (status === 401) throw new SessionExpired();
  if (!ok) throw new Error(errorMessage(data, `HTTP ${status}`));
  return Array.isArray(data) ? data : (data.results ?? []);
}

const fetchListings = async () => (listings.value = await getList<Listing>('/api/sales/listings'));
const fetchBuyers = async () => (buyers.value = await getList<Buyer>('/api/sales/buyers'));
async function fetchTransactions() {
  [pending.value, paid.value] = await Promise.all([
    getList<Transaction>('/api/sales/transactions?status=pendiente'),
    getList<Transaction>('/api/sales/transactions?status=pagado'),
  ]);
}
const fetchInvoices = async () => (invoices.value = await getList<Invoice>('/api/sales/invoices'));

async function loadAll() {
  await Promise.all([fetchListings(), fetchBuyers(), fetchTransactions(), fetchInvoices()]);
  loaded.value = true;
  emptyMessage.value = '';
}

/** Ejecuta una acción; si la sesión caducó, lo muestra como en la carga. */
async function run(action: () => Promise<unknown>, errorPrefix: string) {
  try {
    await action();
  } catch (err) {
    if (err instanceof SessionExpired) emptyMessage.value = 'No has iniciado sesión o tu sesión ha expirado.';
    else alert(`${errorPrefix}${err instanceof Error ? err.message : String(err)}`);
  }
}

async function mutate(method: 'post' | 'put' | 'delete', path: string, body?: unknown) {
  const res = method === 'delete' ? await api.delete(path) : await api[method](path, body);
  if (res.status === 401) throw new SessionExpired();
  if (!res.ok) throw new Error(errorMessage(res.data, `HTTP ${res.status}`));
  return res.data as { id?: string };
}

const stats = computed(() => {
  const active = listings.value.filter((l) => l.status === 'active');
  return {
    listings: active.length,
    listingsValue: formatMoney(active.reduce((sum, l) => sum + l.quantity * l.unit_price, 0)),
    paidValue: formatMoney(paid.value.reduce((sum, t) => sum + (t.total_amount || 0), 0)),
  };
});

const badges = computed<Record<View, number>>(() => ({
  listings: listings.value.length,
  pending: pending.value.length,
  paid: paid.value.length,
  buyers: buyers.value.length,
  invoices: invoices.value.length,
}));

// ── Artículos en venta ────────────────────────────────────────────────────
function canSell(l: Listing): boolean {
  return l.status === 'active' && l.quantity > 0;
}

async function withdrawListing(id: string) {
  if (!confirm('¿Retirar este artículo de la venta? Dejará de estar disponible para compradores.')) return;
  await run(async () => {
    await mutate('delete', `/api/sales/listings/${encodeURIComponent(id)}`);
    await loadAll();
  }, 'Error al retirar: ');
}

// ── Compradores ───────────────────────────────────────────────────────────
const buyerSearch = ref('');

function matchesBuyer(b: Buyer, q: string): boolean {
  return !q || `${b.first_name} ${b.last_name} ${b.cedula}`.toLowerCase().includes(q);
}

const filteredBuyers = computed(() => buyers.value.filter((b) => matchesBuyer(b, buyerSearch.value.toLowerCase().trim())));

async function toggleFavorite(b: Buyer) {
  await run(async () => {
    await mutate('put', `/api/sales/buyers/${encodeURIComponent(b.id)}`, { is_favorite: !b.is_favorite });
    b.is_favorite = !b.is_favorite;
  }, 'Error al actualizar favorito: ');
}

async function deleteBuyer(id: string) {
  if (!confirm('¿Eliminar este comprador? Esta acción no se puede deshacer.')) return;
  await run(async () => {
    await mutate('delete', `/api/sales/buyers/${encodeURIComponent(id)}`);
    await fetchBuyers();
  }, 'Error al eliminar: ');
}

// ── Pagos ─────────────────────────────────────────────────────────────────
async function updateTransactionStatus(id: string, status: 'pagado' | 'cancelado') {
  await run(async () => {
    await mutate('put', `/api/sales/transactions/${encodeURIComponent(id)}`, { status });
    await Promise.all([fetchTransactions(), fetchListings()]);
  }, 'Error: ');
}

function cancelTransaction(id: string) {
  if (confirm('¿Cancelar esta venta? La cantidad se devolverá al inventario y al artículo en venta.')) void updateTransactionStatus(id, 'cancelado');
}

// ── Modales ───────────────────────────────────────────────────────────────
const modal = ref<'buyer' | 'purchase' | null>(null);
let reopenPurchaseAfterBuyer = false;

function closeModals() {
  modal.value = null;
  reopenPurchaseAfterBuyer = false;
}

// Registrar comprador
const buyerFirstNameEl = ref<HTMLInputElement | null>(null);
const buyerForm = reactive({ firstName: '', lastName: '', nat: 'V', number: '', phone: '' });
const buyerStatus = reactive({ message: '', type: '' });
const buyerBusy = ref(false);

function openBuyerModal() {
  Object.assign(buyerForm, { firstName: '', lastName: '', nat: 'V', number: '', phone: '' });
  Object.assign(buyerStatus, { message: '', type: '' });
  modal.value = 'buyer';
  void nextTick(() => buyerFirstNameEl.value?.focus());
}

async function submitBuyer() {
  const number = buyerForm.number.trim().replace(/\D/g, '');
  if (!number || number.length < 5) {
    Object.assign(buyerStatus, { message: 'Ingresa un número de cédula válido (5 a 9 dígitos).', type: 'error' });
    return;
  }
  buyerBusy.value = true;
  try {
    const result = await mutate('post', '/api/sales/buyers', {
      first_name: buyerForm.firstName.trim(),
      last_name: buyerForm.lastName.trim(),
      cedula: `${buyerForm.nat}-${number}`,
      phone: buyerForm.phone.trim(),
    });
    await fetchBuyers();
    const reopen = reopenPurchaseAfterBuyer;
    closeModals();
    if (reopen) openPurchaseModal(purchase.listingId || undefined, result.id);
  } catch (err) {
    Object.assign(buyerStatus, {
      message: err instanceof SessionExpired ? 'No has iniciado sesión o tu sesión ha expirado.' : err instanceof Error ? err.message : String(err),
      type: 'error',
    });
  } finally {
    buyerBusy.value = false;
  }
}

// Registrar venta
const purchase = reactive({ listingId: '', quantity: 1 as number | string, buyerSearch: '', buyerId: null as string | null, notes: '' });
const purchaseStatus = reactive({ message: '', type: '' });
const purchaseBusy = ref(false);

const sellable = computed(() => listings.value.filter(canSell));
const selectedListing = computed(() => listings.value.find((l) => l.id === purchase.listingId));
const pickerBuyers = computed(() => buyers.value.filter((b) => matchesBuyer(b, purchase.buyerSearch.toLowerCase().trim())));

function openPurchaseModal(listingId?: string, buyerId?: string) {
  if (!sellable.value.length) {
    alert('No tienes artículos disponibles para vender. Ve a Inventario y pon alguno a la venta.');
    return;
  }
  const preselected = listingId && sellable.value.some((l) => l.id === listingId) ? listingId : sellable.value[0]!.id;
  Object.assign(purchase, { listingId: preselected, quantity: 1, buyerSearch: '', buyerId: buyerId ?? null, notes: '' });
  Object.assign(purchaseStatus, { message: '', type: '' });
  modal.value = 'purchase';
}

function newBuyerFromPurchase() {
  openBuyerModal();
  reopenPurchaseAfterBuyer = true;
}

function purchaseError(message: string) {
  Object.assign(purchaseStatus, { message, type: 'error' });
}

async function submitPurchase() {
  const listing = selectedListing.value;
  const qty = parseInt(String(purchase.quantity), 10);
  if (!listing) return purchaseError('Selecciona un artículo.');
  if (!purchase.buyerId) return purchaseError('Selecciona un comprador.');
  if (!qty || qty <= 0) return purchaseError('Cantidad inválida.');
  if (qty > listing.quantity) return purchaseError(`Solo hay ${listing.quantity} unidades disponibles.`);

  purchaseBusy.value = true;
  try {
    await mutate('post', '/api/sales/transactions', { listing_id: listing.id, buyer_id: purchase.buyerId, quantity: qty, notes: purchase.notes.trim() });
    closeModals();
    await loadAll();
    view.value = 'pending';
  } catch (err) {
    purchaseError(err instanceof SessionExpired ? 'No has iniciado sesión o tu sesión ha expirado.' : err instanceof Error ? err.message : String(err));
  } finally {
    purchaseBusy.value = false;
  }
}

onMounted(async () => {
  void ensureSubscribed();
  try {
    await loadAll();
  } catch (err) {
    if (err instanceof SessionExpired) {
      emptyMessage.value = 'No has iniciado sesión o tu sesión ha expirado.';
    } else {
      console.error('No se pudieron cargar las ventas:', err);
      emptyMessage.value = 'No se pudieron cargar los datos. Error del servidor o sin conexión; recarga la página para reintentar.';
    }
  }
});
</script>

<style>
/* CSS propio de la página antigua, limitado a ella (ver router: meta.page). */
/* ===== MÓDULO DE VENTAS ===== */
/* `--page-max` lo consume la regla compartida del final de styles.css,
 que en escritorio reserva el hueco del sidebar y centra la caja. */
:where(body[data-page="sales"]) .sales-container {
  --page-max: 1400px;
  max-width: var(--page-max);
  margin: 0 auto;
  padding: 1rem 1rem 3rem;
}

:where(body[data-page="sales"]) .sales-stats {
  display: flex;
  gap: .5rem;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
  padding-bottom: 4px;
  margin-bottom: 1rem;
}
:where(body[data-page="sales"]) .sales-stats::-webkit-scrollbar { display: none; }

:where(body[data-page="sales"]) .sales-stats .stat-card {
  display: flex;
  align-items: center;
  gap: .5rem;
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  border-radius: 10px;
  padding: .5rem .85rem;
  white-space: nowrap;
  flex-shrink: 0;
}

:where(body[data-page="sales"]) .sales-stats .stat-card-value {
  font-size: 1.15rem;
  font-weight: 800;
  background: var(--accent-gradient);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  line-height: 1;
}

:where(body[data-page="sales"]) .sales-stats .stat-card-label {
  font-size: .7rem;
  color: var(--text-secondary);
  font-weight: 500;
}

/* Tabs */
:where(body[data-page="sales"]) .sales-tabs {
  display: flex;
  gap: .25rem;
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  border-radius: 10px;
  padding: 3px;
  margin-bottom: 1.25rem;
  overflow-x: auto;
  scrollbar-width: none;
}
:where(body[data-page="sales"]) .sales-tabs::-webkit-scrollbar { display: none; }

:where(body[data-page="sales"]) .sales-tab {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 8px 14px;
  border-radius: 8px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-size: .85rem;
  font-weight: 600;
  cursor: pointer;
  transition: all .2s;
  white-space: nowrap;
}

:where(body[data-page="sales"]) .sales-tab.active {
  background: var(--accent-gradient);
  color: #fff;
  box-shadow: 0 2px 8px var(--accent-glow);
}

:where(body[data-page="sales"]) .sales-tab:not(.active):hover {
  background: var(--secondary-container);
  color: var(--text-primary);
}

:where(body[data-page="sales"]) .sales-tab-badge {
  background: rgba(0, 0, 0, .15);
  border-radius: 999px;
  padding: 1px 7px;
  font-size: .72rem;
}

:where(body[data-page="sales"]) .sales-view { display: none; }
:where(body[data-page="sales"]) .sales-view.active { display: block; }

/* Listado de artículos en venta — reusa .course-card */
:where(body[data-page="sales"]) .sale-listing-card .course-meta { margin-top: .4rem; }

:where(body[data-page="sales"]) .listing-actions {
  display: flex;
  gap: 8px;
  margin-top: .75rem;
}

:where(body[data-page="sales"]) .listing-actions button {
  flex: 1;
  padding: 8px;
  border-radius: 8px;
  border: 1px solid var(--glass-border);
  font-size: .82rem;
  font-weight: 600;
  cursor: pointer;
  transition: all .2s;
}

:where(body[data-page="sales"]) .btn-sell {
  background: var(--accent-gradient);
  color: #fff;
  border: none !important;
}
:where(body[data-page="sales"]) .btn-sell:hover { opacity: .9; }

:where(body[data-page="sales"]) .btn-withdraw {
  background: var(--secondary-container);
  color: var(--text-primary);
}
:where(body[data-page="sales"]) .btn-withdraw:hover { border-color: #ef4444; color: #ef4444; }

/* Tablas genéricas (compradores / pagos) */
:where(body[data-page="sales"]) .sales-table-wrap {
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  border-radius: 14px;
  overflow: hidden;
}

:where(body[data-page="sales"]) .sales-table {
  width: 100%;
  border-collapse: collapse;
  font-size: .85rem;
}

:where(body[data-page="sales"]) .sales-table th {
  text-align: left;
  padding: 10px 14px;
  font-size: .72rem;
  text-transform: uppercase;
  letter-spacing: .04em;
  color: var(--text-tertiary);
  border-bottom: 1px solid var(--glass-border);
  white-space: nowrap;
}

:where(body[data-page="sales"]) .sales-table td {
  padding: 10px 14px;
  border-bottom: 1px solid var(--glass-border);
  vertical-align: middle;
}

:where(body[data-page="sales"]) .sales-table tr:last-child td { border-bottom: none; }

:where(body[data-page="sales"]) .buyer-name-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}

:where(body[data-page="sales"]) .account-badge {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: .7rem;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 999px;
}
:where(body[data-page="sales"]) .account-badge.yes { background: rgba(34,197,94,.14); color: #16a34a; }
:where(body[data-page="sales"]) .account-badge.no { background: rgba(148,163,184,.14); color: var(--text-tertiary); }

:where(body[data-page="sales"]) .status-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: .72rem;
  font-weight: 700;
  padding: 3px 10px;
  border-radius: 999px;
}
:where(body[data-page="sales"]) .status-badge.pendiente { background: rgba(234,179,8,.14); color: #ca8a04; }
:where(body[data-page="sales"]) .status-badge.pagado { background: rgba(34,197,94,.14); color: #16a34a; }
:where(body[data-page="sales"]) .status-badge.cancelado { background: rgba(239,68,68,.14); color: #ef4444; }

:where(body[data-page="sales"]) .fav-star {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 1.05rem;
  line-height: 1;
  padding: 2px;
  opacity: .4;
}
:where(body[data-page="sales"]) .fav-star.active { opacity: 1; }

:where(body[data-page="sales"]) .row-actions { display: flex; gap: 6px; }

:where(body[data-page="sales"]) .btn-icon-sm {
  background: var(--secondary-container);
  border: 1px solid var(--glass-border);
  border-radius: 7px;
  width: 30px;
  height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-size: .85rem;
}
:where(body[data-page="sales"]) .btn-icon-sm:hover { border-color: var(--accent-color); }

:where(body[data-page="sales"]) .empty-view {
  text-align: center;
  padding: 3rem 1rem;
  color: var(--text-secondary);
}
:where(body[data-page="sales"]) .empty-view .empty-icon { font-size: 2.5rem; margin-bottom: .75rem; }

/* Selector de comprador dentro del modal de compra */
:where(body[data-page="sales"]) .buyer-picker {
  max-height: 220px;
  overflow-y: auto;
  border: 1px solid var(--glass-border);
  border-radius: 10px;
}

:where(body[data-page="sales"]) .buyer-picker-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  cursor: pointer;
  border-bottom: 1px solid var(--glass-border);
  font-size: .85rem;
}
:where(body[data-page="sales"]) .buyer-picker-item:last-child { border-bottom: none; }
:where(body[data-page="sales"]) .buyer-picker-item:hover { background: var(--secondary-container); }
:where(body[data-page="sales"]) .buyer-picker-item.selected { background: var(--accent-gradient); color: #fff; }

:where(body[data-page="sales"]) .purchase-total {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 14px;
  background: var(--secondary-container);
  border-radius: 10px;
  font-weight: 700;
  margin-top: .5rem;
}

:where(body[data-page="sales"]) .cedula-row {
  display: grid;
  grid-template-columns: 90px 1fr;
  gap: 8px;
}

:where(body[data-page="sales"]) .btn-view-pdf {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 5px 10px;
  border-radius: 7px;
  border: 1px solid var(--glass-border);
  background: var(--secondary-container);
  color: var(--accent-color);
  font-size: .78rem;
  font-weight: 700;
  cursor: pointer;
  text-decoration: none;
}
:where(body[data-page="sales"]) .btn-view-pdf:hover { border-color: var(--accent-color); }
</style>
