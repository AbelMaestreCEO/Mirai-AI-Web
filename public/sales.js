/* ============================================================
   sales.js — Módulo de Ventas · Mirai AI
   Conectado a /api/sales/*. Todo aislado por usuario (session cookie).
   Nada se guarda en localStorage — todo vive en D1.
   ============================================================ */
(function () {
  'use strict';

  const API = '/api/sales';

  /* ── Estado ──────────────────────────────────────────────── */
  let LISTINGS = [];
  let BUYERS = [];
  let PENDING_TX = [];
  let PAID_TX = [];
  let activeView = 'listings';
  let selectedBuyerId = null;
  let reopenPurchaseAfterBuyer = false;

  /* ══════════════════════════════════════════════════════════
     API
  ══════════════════════════════════════════════════════════ */

  async function apiFetch(url, options = {}) {
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      ...options,
    });
    if (res.status === 401) {
      showEmptyStates('No has iniciado sesión o tu sesión ha expirado.');
      return null;
    }
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  }

  async function fetchListings() {
    const data = await apiFetch(`${API}/listings`);
    LISTINGS = Array.isArray(data) ? data : (data?.results || []);
  }

  async function fetchBuyers() {
    const data = await apiFetch(`${API}/buyers`);
    BUYERS = Array.isArray(data) ? data : (data?.results || []);
  }

  async function fetchTransactions() {
    const [pending, paid] = await Promise.all([
      apiFetch(`${API}/transactions?status=pendiente`),
      apiFetch(`${API}/transactions?status=pagado`),
    ]);
    PENDING_TX = Array.isArray(pending) ? pending : (pending?.results || []);
    PAID_TX = Array.isArray(paid) ? paid : (paid?.results || []);
  }

  async function loadAll() {
    await Promise.all([fetchListings(), fetchBuyers(), fetchTransactions()]);
    renderAll();
  }

  /* ══════════════════════════════════════════════════════════
     RENDER — general
  ══════════════════════════════════════════════════════════ */

  function renderAll() {
    renderListings();
    renderBuyers();
    renderTransactions('pendiente');
    renderTransactions('pagado');
    updateStats();
  }

  function updateStats() {
    const activeListings = LISTINGS.filter(l => l.status === 'active');
    const listingsValue = activeListings.reduce((sum, l) => sum + (l.quantity * l.unit_price), 0);
    const paidValue = PAID_TX.reduce((sum, t) => sum + (t.total_amount || 0), 0);

    setText('stat-listings', activeListings.length);
    setText('stat-listings-value', formatMoney(listingsValue));
    setText('stat-pending', PENDING_TX.length);
    setText('stat-paid-value', formatMoney(paidValue));
    setText('stat-buyers', BUYERS.length);

    setText('badge-listings', LISTINGS.length);
    setText('badge-pending', PENDING_TX.length);
    setText('badge-paid', PAID_TX.length);
    setText('badge-buyers', BUYERS.length);
  }

  function showEmptyStates(message) {
    document.getElementById('listings-grid').innerHTML = emptyStateHtml('📦', message);
    document.getElementById('pending-rows').innerHTML = '';
    document.getElementById('paid-rows').innerHTML = '';
    document.getElementById('buyers-rows').innerHTML = '';
  }

  function emptyStateHtml(icon, message) {
    return `<div class="empty-view"><div class="empty-icon">${icon}</div><p>${escapeHtml(message)}</p></div>`;
  }

  /* ══════════════════════════════════════════════════════════
     RENDER — Inventario en Venta
  ══════════════════════════════════════════════════════════ */

  function renderListings() {
    const grid = document.getElementById('listings-grid');
    grid.innerHTML = '';

    if (LISTINGS.length === 0) {
      grid.innerHTML = emptyStateHtml('📦', 'Aún no has puesto ningún artículo a la venta. Ve a Inventario y desliza un producto para ponerlo en venta.');
      return;
    }

    LISTINGS.forEach(listing => grid.appendChild(buildListingCard(listing)));
  }

  function buildListingCard(listing) {
    const card = document.createElement('div');
    card.className = 'course-card sale-listing-card';

    const statusLabel = listing.status === 'agotado' ? 'Agotado' : (listing.status === 'retirado' ? 'Retirado' : 'En venta');
    const statusClass = listing.status === 'agotado' ? 'critical' : (listing.status === 'retirado' ? 'warning' : 'available');
    const canSell = listing.status === 'active' && listing.quantity > 0;

    card.innerHTML = `
      <span class="course-level ${statusClass}">${statusLabel}</span>
      <div class="course-icon">🏷️</div>
      <h3 class="course-title">${escapeHtml(listing.product_name)}</h3>
      <div class="course-meta">
        <span class="course-meta-item"><span>📦</span> ${listing.quantity} disponibles</span>
        <span class="course-meta-item"><span>💰</span> ${formatMoney(listing.unit_price)} c/u</span>
      </div>
      <div class="listing-actions">
        <button class="btn-sell" data-id="${listing.id}" ${canSell ? '' : 'disabled'}>Vender</button>
        <button class="btn-withdraw" data-id="${listing.id}">Retirar</button>
      </div>
    `;

    card.querySelector('.btn-sell')?.addEventListener('click', () => {
      if (!canSell) return;
      openPurchaseModal(listing.id);
    });
    card.querySelector('.btn-withdraw')?.addEventListener('click', () => withdrawListing(listing.id));

    return card;
  }

  async function withdrawListing(id) {
    if (!confirm('¿Retirar este artículo de la venta? Dejará de estar disponible para compradores.')) return;
    try {
      await apiFetch(`${API}/listings/${id}`, { method: 'DELETE' });
      await loadAll();
    } catch (err) {
      alert('Error al retirar: ' + err.message);
    }
  }

  /* ══════════════════════════════════════════════════════════
     RENDER — Compradores
  ══════════════════════════════════════════════════════════ */

  function renderBuyers() {
    const tbody = document.getElementById('buyers-rows');
    tbody.innerHTML = '';

    const q = (document.getElementById('buyer-search')?.value || '').toLowerCase().trim();
    const filtered = BUYERS.filter(b => {
      if (!q) return true;
      const full = `${b.first_name} ${b.last_name} ${b.cedula}`.toLowerCase();
      return full.includes(q);
    });

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6"><div class="empty-view">${emptyStateHtml('👤', BUYERS.length === 0 ? 'Aún no has registrado compradores.' : 'Sin resultados para esa búsqueda.')}</div></td></tr>`;
      return;
    }

    filtered.forEach(b => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><button class="fav-star ${b.is_favorite ? 'active' : ''}" data-id="${b.id}" title="Favorito">${b.is_favorite ? '⭐' : '☆'}</button></td>
        <td>${escapeHtml(b.first_name)} ${escapeHtml(b.last_name)}</td>
        <td>${escapeHtml(b.cedula)}</td>
        <td>${escapeHtml(b.phone || '—')}</td>
        <td><span class="account-badge ${b.has_account ? 'yes' : 'no'}">${b.has_account ? '✓ Tiene cuenta' : 'Sin cuenta'}</span></td>
        <td class="row-actions">
          <button class="btn-icon-sm btn-delete-buyer" data-id="${b.id}" title="Eliminar">🗑️</button>
        </td>
      `;
      tr.querySelector('.fav-star').addEventListener('click', () => toggleFavorite(b));
      tr.querySelector('.btn-delete-buyer').addEventListener('click', () => deleteBuyer(b.id));
      tbody.appendChild(tr);
    });
  }

  async function toggleFavorite(buyer) {
    try {
      await apiFetch(`${API}/buyers/${buyer.id}`, {
        method: 'PUT',
        body: JSON.stringify({ is_favorite: !buyer.is_favorite }),
      });
      buyer.is_favorite = !buyer.is_favorite;
      renderBuyers();
    } catch (err) {
      alert('Error al actualizar favorito: ' + err.message);
    }
  }

  async function deleteBuyer(id) {
    if (!confirm('¿Eliminar este comprador? Esta acción no se puede deshacer.')) return;
    try {
      await apiFetch(`${API}/buyers/${id}`, { method: 'DELETE' });
      await fetchBuyers();
      renderBuyers();
      updateStats();
    } catch (err) {
      alert('Error al eliminar: ' + err.message);
    }
  }

  /* ══════════════════════════════════════════════════════════
     RENDER — Pagos (pendientes / realizados)
  ══════════════════════════════════════════════════════════ */

  function renderTransactions(status) {
    const list = status === 'pendiente' ? PENDING_TX : PAID_TX;
    const tbody = document.getElementById(status === 'pendiente' ? 'pending-rows' : 'paid-rows');
    tbody.innerHTML = '';

    if (list.length === 0) {
      const cols = status === 'pendiente' ? 6 : 5;
      tbody.innerHTML = `<tr><td colspan="${cols}">${emptyStateHtml(status === 'pendiente' ? '⏳' : '✅', status === 'pendiente' ? 'No hay pagos pendientes.' : 'Aún no hay pagos realizados.')}</td></tr>`;
      return;
    }

    list.forEach(t => {
      const tr = document.createElement('tr');
      const buyerCell = `
        <div class="buyer-name-cell">
          <span>${escapeHtml(t.buyer_first_name)} ${escapeHtml(t.buyer_last_name)}</span>
          <span style="color:var(--text-tertiary);font-size:.78rem;">${escapeHtml(t.buyer_cedula)}</span>
        </div>
      `;

      if (status === 'pendiente') {
        tr.innerHTML = `
          <td>${escapeHtml(t.product_name)}</td>
          <td>${buyerCell}</td>
          <td>${t.quantity}</td>
          <td>${formatMoney(t.total_amount)}</td>
          <td>${formatDate(t.created_at)}</td>
          <td class="row-actions">
            <button class="btn-icon-sm btn-mark-paid" data-id="${t.id}" title="Marcar como pagado">✅</button>
            <button class="btn-icon-sm btn-cancel-tx" data-id="${t.id}" title="Cancelar y devolver al inventario">↩️</button>
          </td>
        `;
        tr.querySelector('.btn-mark-paid').addEventListener('click', () => updateTransactionStatus(t.id, 'pagado'));
        tr.querySelector('.btn-cancel-tx').addEventListener('click', () => {
          if (confirm('¿Cancelar esta venta? La cantidad se devolverá al inventario y al artículo en venta.')) {
            updateTransactionStatus(t.id, 'cancelado');
          }
        });
      } else {
        tr.innerHTML = `
          <td>${escapeHtml(t.product_name)}</td>
          <td>${buyerCell}</td>
          <td>${t.quantity}</td>
          <td>${formatMoney(t.total_amount)}</td>
          <td>${formatDate(t.paid_at)}</td>
        `;
      }
      tbody.appendChild(tr);
    });
  }

  async function updateTransactionStatus(id, status) {
    try {
      await apiFetch(`${API}/transactions/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ status }),
      });
      await Promise.all([fetchTransactions(), fetchListings()]);
      renderTransactions('pendiente');
      renderTransactions('pagado');
      renderListings();
      updateStats();
    } catch (err) {
      alert('Error: ' + err.message);
    }
  }

  /* ══════════════════════════════════════════════════════════
     MODAL — Comprador
  ══════════════════════════════════════════════════════════ */

  const buyerModal = document.getElementById('buyer-modal');
  const buyerForm = document.getElementById('buyer-form');

  function openBuyerModal() {
    buyerForm.reset();
    document.getElementById('buyer-status').textContent = '';
    buyerModal.classList.remove('hidden');
    document.getElementById('buyer-first-name').focus();
  }

  function closeBuyerModal() {
    buyerModal.classList.add('hidden');
    reopenPurchaseAfterBuyer = false;
  }

  buyerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const firstName = document.getElementById('buyer-first-name').value.trim();
    const lastName = document.getElementById('buyer-last-name').value.trim();
    const nat = document.getElementById('buyer-cedula-nat').value;
    const number = document.getElementById('buyer-cedula-number').value.trim().replace(/\D/g, '');
    const phone = document.getElementById('buyer-phone').value.trim();
    const statusEl = document.getElementById('buyer-status');

    if (!number || number.length < 5) {
      statusEl.textContent = 'Ingresa un número de cédula válido (5 a 9 dígitos).';
      statusEl.className = 'status-message error';
      return;
    }

    const cedula = `${nat}-${number}`;
    const btn = document.getElementById('btn-submit-buyer');
    btn.disabled = true;

    try {
      const result = await apiFetch(`${API}/buyers`, {
        method: 'POST',
        body: JSON.stringify({ first_name: firstName, last_name: lastName, cedula, phone }),
      });
      await fetchBuyers();
      renderBuyers();
      updateStats();
      closeBuyerModal();

      if (reopenPurchaseAfterBuyer) {
        reopenPurchaseAfterBuyer = false;
        openPurchaseModal(document.getElementById('purchase-listing').value || null, result.id);
      }
    } catch (err) {
      statusEl.textContent = err.message;
      statusEl.className = 'status-message error';
    } finally {
      btn.disabled = false;
    }
  });

  document.getElementById('new-buyer-btn').addEventListener('click', openBuyerModal);

  /* ══════════════════════════════════════════════════════════
     MODAL — Registrar Venta / Compra
  ══════════════════════════════════════════════════════════ */

  const purchaseModal = document.getElementById('purchase-modal');
  const purchaseForm = document.getElementById('purchase-form');

  function openPurchaseModal(preselectListingId, preselectBuyerId) {
    const select = document.getElementById('purchase-listing');
    select.innerHTML = '';

    const sellable = LISTINGS.filter(l => l.status === 'active' && l.quantity > 0);
    if (sellable.length === 0) {
      alert('No tienes artículos disponibles para vender. Ve a Inventario y pon alguno a la venta.');
      return;
    }

    sellable.forEach(l => {
      const opt = document.createElement('option');
      opt.value = l.id;
      opt.textContent = `${l.product_name} — ${l.quantity} disp. — ${formatMoney(l.unit_price)}`;
      select.appendChild(opt);
    });
    if (preselectListingId) select.value = preselectListingId;

    selectedBuyerId = preselectBuyerId || null;
    document.getElementById('purchase-buyer-search').value = '';
    document.getElementById('purchase-quantity').value = 1;
    document.getElementById('purchase-notes').value = '';
    document.getElementById('purchase-status').textContent = '';

    renderBuyerPicker();
    updatePurchaseHints();
    purchaseModal.classList.remove('hidden');
  }

  function closePurchaseModal() {
    purchaseModal.classList.add('hidden');
  }

  function getSelectedListing() {
    const id = document.getElementById('purchase-listing').value;
    return LISTINGS.find(l => l.id === id);
  }

  function updatePurchaseHints() {
    const listing = getSelectedListing();
    const hint = document.getElementById('purchase-available-hint');
    const qtyInput = document.getElementById('purchase-quantity');
    if (listing) {
      hint.textContent = `Máximo disponible: ${listing.quantity}`;
      qtyInput.max = listing.quantity;
    }
    updatePurchaseTotal();
  }

  function updatePurchaseTotal() {
    const listing = getSelectedListing();
    const qty = parseInt(document.getElementById('purchase-quantity').value, 10) || 0;
    const total = listing ? qty * listing.unit_price : 0;
    document.getElementById('purchase-total-amount').textContent = formatMoney(total);
  }

  function renderBuyerPicker() {
    const container = document.getElementById('purchase-buyer-picker');
    const q = (document.getElementById('purchase-buyer-search').value || '').toLowerCase().trim();
    container.innerHTML = '';

    const filtered = BUYERS.filter(b => {
      if (!q) return true;
      return `${b.first_name} ${b.last_name} ${b.cedula}`.toLowerCase().includes(q);
    });

    if (filtered.length === 0) {
      container.innerHTML = '<div class="buyer-picker-item">Sin compradores. Regístralo abajo.</div>';
      return;
    }

    filtered.forEach(b => {
      const div = document.createElement('div');
      div.className = 'buyer-picker-item' + (b.id === selectedBuyerId ? ' selected' : '');
      div.innerHTML = `<span>${b.is_favorite ? '⭐ ' : ''}${escapeHtml(b.first_name)} ${escapeHtml(b.last_name)} — ${escapeHtml(b.cedula)}</span>`;
      div.addEventListener('click', () => {
        selectedBuyerId = b.id;
        renderBuyerPicker();
      });
      container.appendChild(div);
    });
  }

  document.getElementById('purchase-listing').addEventListener('change', updatePurchaseHints);
  document.getElementById('purchase-quantity').addEventListener('input', updatePurchaseTotal);
  document.getElementById('purchase-buyer-search').addEventListener('input', renderBuyerPicker);

  document.getElementById('purchase-new-buyer-btn').addEventListener('click', () => {
    reopenPurchaseAfterBuyer = true;
    closePurchaseModal();
    openBuyerModal();
  });

  document.getElementById('new-purchase-btn').addEventListener('click', () => openPurchaseModal());

  purchaseForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const statusEl = document.getElementById('purchase-status');
    const listing = getSelectedListing();
    const qty = parseInt(document.getElementById('purchase-quantity').value, 10);

    if (!listing) { statusEl.textContent = 'Selecciona un artículo.'; statusEl.className = 'status-message error'; return; }
    if (!selectedBuyerId) { statusEl.textContent = 'Selecciona un comprador.'; statusEl.className = 'status-message error'; return; }
    if (!qty || qty <= 0) { statusEl.textContent = 'Cantidad inválida.'; statusEl.className = 'status-message error'; return; }
    if (qty > listing.quantity) { statusEl.textContent = `Solo hay ${listing.quantity} unidades disponibles.`; statusEl.className = 'status-message error'; return; }

    const btn = document.getElementById('btn-submit-purchase');
    btn.disabled = true;

    try {
      await apiFetch(`${API}/transactions`, {
        method: 'POST',
        body: JSON.stringify({
          listing_id: listing.id,
          buyer_id: selectedBuyerId,
          quantity: qty,
          notes: document.getElementById('purchase-notes').value.trim(),
        }),
      });
      closePurchaseModal();
      await loadAll();
      switchView('pending');
    } catch (err) {
      statusEl.textContent = err.message;
      statusEl.className = 'status-message error';
    } finally {
      btn.disabled = false;
    }
  });

  /* ══════════════════════════════════════════════════════════
     TABS / VISTAS
  ══════════════════════════════════════════════════════════ */

  function switchView(view) {
    activeView = view;
    document.querySelectorAll('.sales-tab').forEach(t => t.classList.toggle('active', t.dataset.view === view));
    document.querySelectorAll('.sidebar-filter-list .filter-pill[data-view]').forEach(p => p.classList.toggle('active', p.dataset.view === view));
    document.querySelectorAll('.sales-view').forEach(v => v.classList.toggle('active', v.id === `view-${view}`));
  }

  document.querySelectorAll('.sales-tab').forEach(tab => {
    tab.addEventListener('click', () => switchView(tab.dataset.view));
  });
  document.querySelectorAll('.sidebar-filter-list .filter-pill[data-view]').forEach(pill => {
    pill.addEventListener('click', () => switchView(pill.dataset.view));
  });

  document.getElementById('buyer-search').addEventListener('input', renderBuyers);

  /* ══════════════════════════════════════════════════════════
     MODALES — cierre genérico
  ══════════════════════════════════════════════════════════ */

  document.querySelectorAll('.modal-close, .modal-cancel').forEach(btn => {
    btn.addEventListener('click', () => {
      buyerModal.classList.add('hidden');
      purchaseModal.classList.add('hidden');
      reopenPurchaseAfterBuyer = false;
    });
  });
  document.querySelectorAll('.modal-overlay').forEach(ov => {
    ov.addEventListener('click', () => {
      buyerModal.classList.add('hidden');
      purchaseModal.classList.add('hidden');
      reopenPurchaseAfterBuyer = false;
    });
  });

  /* ══════════════════════════════════════════════════════════
     HELPERS
  ══════════════════════════════════════════════════════════ */

  function setText(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }
  function formatMoney(n) { return `$${(n || 0).toFixed(2)}`; }
  function formatDate(str) {
    if (!str) return '—';
    try { return new Date(str).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }); }
    catch { return str; }
  }
  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* ══════════════════════════════════════════════════════════
     INIT
  ══════════════════════════════════════════════════════════ */

  async function init() {
    if (window.miraiUserReady) await window.miraiUserReady;
    await loadAll();
  }

  init();

})();
