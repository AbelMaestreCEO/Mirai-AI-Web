/**
 * location.js — Módulo de Ubicaciones (Mirai AI)
 * Persistencia: Cloudflare D1 via /api/locations + /api/tasks
 * Sin type="module" — funciones globales para onclick en popups
 *
 * Pines en el mapa:
 *  • Pin sólido accent-color  → marcador de ubicación guardado (/api/locations)
 *  • Pin circular con emoji   → tarea pendiente con lat/lng (/api/tasks)
 *  • Pin provisional punteado → punto de clic antes de guardar
 */

(function () {
    'use strict';

    const DEFAULT_CENTER = [9.0, -66.0];
    const DEFAULT_ZOOM = 6;

    const PRIORITY_COLOR = { critica: '#ef4444', alta: '#f97316', media: '#eab308', baja: '#22c55e' };
    const STATUS_LABEL = { pendiente: 'Pendiente', progreso: 'En Progreso', revision: 'Revisión', completado: 'Completado' };
    const PRIORITY_LABEL = { critica: '🔴 Crítica', alta: '🟠 Alta', media: '🟡 Media', baja: '🟢 Baja' };

    let map = null;
    let pendingLatlng = null;
    let pendingMarker = null;   // pin provisional (antes de guardar)
    let locMarkers = {};     // id → L.Marker (ubicaciones guardadas)
    let taskMarkers = [];     // L.Marker[] (tareas con ubicación)

    const elGpsBtn = document.getElementById('loc-gps-btn');
    const elListBtn = document.getElementById('loc-list-btn');
    const elList = document.getElementById('loc-markers-list');
    const elCount = document.getElementById('loc-count');
    const elHint = document.getElementById('loc-hint');
    const elTitle = document.getElementById('loc-title');
    const elDesc = document.getElementById('loc-desc');
    const elSaveBtn = document.getElementById('loc-save-btn');
    const elToast = document.getElementById('loc-toast');
    const elModalOverlay = document.getElementById('loc-modal-overlay');
    const elModalCoords = document.getElementById('loc-modal-coords');
    const elModalMinimap = document.getElementById('loc-modal-minimap');
    let minimapInstance = null;
    /* ── API ─────────────────────────────────────────────────────────────── */

    async function apiLocations() {
        const res = await fetch('/api/locations', { credentials: 'same-origin' });
        if (!res.ok) throw new Error('Error al cargar marcadores');
        return (await res.json()).markers || [];
    }

    async function apiLocCreate(payload) {
        const res = await fetch('/api/locations', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error('Error al guardar marcador');
        return (await res.json()).marker;
    }

    async function apiLocDelete(id) {
        const res = await fetch(`/api/locations/${id}`, {
            method: 'DELETE',
            credentials: 'same-origin',
        });
        if (!res.ok) throw new Error('Error al eliminar');
    }

    async function apiTasks() {
        try {
            const res = await fetch('/api/tasks', { credentials: 'same-origin' });
            if (!res.ok) return [];
            const data = await res.json();
            return Array.isArray(data) ? data : [];
        } catch { return []; }
    }

    /* ── Init ────────────────────────────────────────────────────────────── */

    function initMap() {
        map = L.map('loc-map', { center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM });

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        }).addTo(map);

        map.on('click', onMapClick);

        loadLocMarkers();
        loadTaskMarkers();
        initRealtimeLocation();
    }

    function dropPendingPin(latlng) {
        if (pendingMarker) { map.removeLayer(pendingMarker); pendingMarker = null; }
        const accent = getAccent();
        pendingMarker = L.marker(latlng, {
            icon: L.divIcon({
                html: `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="34" viewBox="0 0 26 34">
                         <path d="M13 0C5.82 0 0 5.82 0 13c0 9.1 13 21 13 21S26 22.1 26 13C26 5.82 20.18 0 13 0z"
                               fill="none" stroke="${accent}" stroke-width="2.5" stroke-dasharray="4 3"/>
                         <circle cx="13" cy="13" r="4" fill="${accent}" opacity="0.75"/>
                       </svg>`,
                className: '',
                iconSize: [26, 34], iconAnchor: [13, 34],
            }),
            zIndexOffset: 1000,
        }).addTo(map);
    }

    function onMapClick(e) {
        pendingLatlng = e.latlng;
        dropPendingPin(e.latlng);
        openModal(e.latlng);
    }

    function openModal(latlng) {
        elModalCoords.textContent = `${latlng.lat.toFixed(5)}, ${latlng.lng.toFixed(5)}`;
        elSaveBtn.disabled = false;
        elModalOverlay.classList.add('open');

        setTimeout(() => {
            if (minimapInstance) {
                minimapInstance.invalidateSize();
                minimapInstance.setView(latlng, 15);
            } else {
                minimapInstance = L.map('loc-modal-minimap', {
                    center: latlng,
                    zoom: 15,
                    zoomControl: false,
                    attributionControl: false,
                    dragging: false,
                    scrollWheelZoom: false,
                    doubleClickZoom: false,
                    touchZoom: false,
                });
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(minimapInstance);
                minimapInstance.invalidateSize();
            }
            elTitle.focus();
        }, 80);
    }

    function clearPending() {
        if (pendingMarker) { map.removeLayer(pendingMarker); pendingMarker = null; }
        pendingLatlng = null;
        elSaveBtn.disabled = true;
        elHint.textContent = 'Toca el mapa para colocar un marcador';
        elTitle.value = '';
        elDesc.value = '';
        elModalOverlay.classList.remove('open');
    }

    document.addEventListener('keydown', e => { if (e.key === 'Escape' && pendingLatlng) clearPending(); });
    document.getElementById('loc-modal-close-btn').addEventListener('click', clearPending);
    document.getElementById('loc-modal-cancel-btn').addEventListener('click', clearPending);
    elModalOverlay.addEventListener('click', function(e) {
        if (e.target === elModalOverlay) clearPending();
    });

    /* ── Guardar ubicación ───────────────────────────────────────────────── */

    elSaveBtn.addEventListener('click', async function () {
        if (!pendingLatlng) return;
        elSaveBtn.disabled = true;
        elSaveBtn.textContent = '...';
        try {
            const marker = await apiLocCreate({
                title: elTitle.value.trim() || 'Sin título',
                description: elDesc.value.trim(),
                lat: pendingLatlng.lat,
                lng: pendingLatlng.lng,
            });
            // Quitar provisional → poner permanente
            if (pendingMarker) { map.removeLayer(pendingMarker); pendingMarker = null; }
            addLocMarker(marker);

            const all = await apiLocations();
            renderList(all);
            updateCount(all.length);

            pendingLatlng = null;
            elTitle.value = '';
            elDesc.value = '';
            elSaveBtn.disabled = true;
            elHint.textContent = 'Toca el mapa para colocar un marcador';
            showToast('✅ Marcador guardado');
            elModalOverlay.classList.remove('open');
        } catch (err) {
            console.error('[Locations] save:', err);
            showToast('⚠️ Error al guardar');
            elSaveBtn.disabled = false;
        } finally {
            elSaveBtn.textContent = 'Guardar';
        }
    });

    [elTitle, elDesc].forEach(el =>
        el.addEventListener('keydown', e => { if (e.key === 'Enter' && !elSaveBtn.disabled) elSaveBtn.click(); })
    );

    /* ── Cargar marcadores de ubicaciones guardadas ──────────────────────── */

    async function loadLocMarkers() {
        try {
            const markers = await apiLocations();
            markers.forEach(m => addLocMarker(m));
            updateCount(markers.length);
            renderList(markers);
        } catch (err) {
            console.error('[Locations] load:', err);
            showToast('⚠️ No se pudieron cargar los marcadores');
        }
    }

    function addLocMarker(m) {
        if (locMarkers[m.id]) return;
        const accent = getAccent();
        const lm = L.marker([m.lat, m.lng], {
            icon: L.divIcon({
                html: `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="34" viewBox="0 0 26 34">
                         <path d="M13 0C5.82 0 0 5.82 0 13c0 9.1 13 21 13 21S26 22.1 26 13C26 5.82 20.18 0 13 0z"
                               fill="${accent}" stroke="white" stroke-width="1.4"/>
                         <circle cx="13" cy="13" r="4.5" fill="white"/>
                       </svg>`,
                className: '',
                iconSize: [26, 34], iconAnchor: [13, 34], popupAnchor: [0, -34],
            }),
        }).addTo(map).bindPopup(buildLocPopup(m));
        locMarkers[m.id] = lm;
    }

    function buildLocPopup(m) {
        return `<div class="loc-pop-title">${esc(m.title)}</div>
                ${m.description ? `<div class="loc-pop-desc">${esc(m.description)}</div>` : ''}
                <div class="loc-pop-coords">${Number(m.lat).toFixed(5)}, ${Number(m.lng).toFixed(5)}</div>
                <button class="loc-pop-del" onclick="locDelete('${m.id}')">🗑 Eliminar</button>`;
    }

    /* ── Eliminar ubicación ──────────────────────────────────────────────── */

    window.locDelete = async function (id) {
        try {
            await apiLocDelete(id);
            if (locMarkers[id]) { map.removeLayer(locMarkers[id]); delete locMarkers[id]; }
            const all = await apiLocations();
            renderList(all);
            updateCount(all.length);
            showToast('🗑 Marcador eliminado');
        } catch (err) {
            console.error('[Locations] delete:', err);
            showToast('⚠️ Error al eliminar');
        }
    };

    window.locFly = function (id) {
        const lm = locMarkers[id];
        if (!lm) return;
        map.flyTo(lm.getLatLng(), 16, { animate: true, duration: 0.9 });
        lm.openPopup();
        elList.classList.add('hidden');
        elListBtn.classList.remove('open');
    };

    /* ── Cargar tareas pendientes con ubicación ──────────────────────────── */

    async function loadTaskMarkers() {
        // Limpiar anteriores
        taskMarkers.forEach(m => map.removeLayer(m));
        taskMarkers = [];

        const tasks = await apiTasks();

        tasks
            .filter(t => t.lat != null && t.lng != null && t.status !== 'completado')
            .forEach(t => {
                const color = PRIORITY_COLOR[t.priority] || '#888';
                const lm = L.marker([t.lat, t.lng], {
                    icon: L.divIcon({
                        html: `<div style="
                            width:30px;height:30px;border-radius:50%;
                            background:${color};
                            border:2.5px solid white;
                            box-shadow:0 2px 8px rgba(0,0,0,0.22);
                            display:flex;align-items:center;justify-content:center;
                            font-size:14px;line-height:1;">🗒️</div>`,
                        className: '',
                        iconSize: [30, 30], iconAnchor: [15, 15], popupAnchor: [0, -15],
                    }),
                }).addTo(map).bindPopup(buildTaskPopup(t, color));
                taskMarkers.push(lm);
            });
    }

    function buildTaskPopup(t, color) {
        return `
            <div class="loc-pop-title">🗒️ ${esc(t.title)}</div>
            ${t.description ? `<div class="loc-pop-desc">${esc(t.description)}</div>` : ''}
            ${t.location_label ? `<div class="loc-pop-desc">📍 ${esc(t.location_label)}</div>` : ''}
            <div class="loc-pop-coords" style="margin-top:4px;">
              <span style="color:${color};font-weight:700;">${PRIORITY_LABEL[t.priority] || t.priority}</span>
              &nbsp;·&nbsp; ${STATUS_LABEL[t.status] || t.status}
              ${t.due_date ? `&nbsp;·&nbsp; Vence: ${t.due_date}` : ''}
            </div>
            <a href="task" style="display:inline-block;margin-top:7px;font-size:.73rem;
               border:1px solid var(--accent-color);color:var(--accent-color);
               border-radius:6px;padding:3px 8px;text-decoration:none;background:none;">
              Ver tareas →
            </a>`;
    }

    /* ── Lista de marcadores ─────────────────────────────────────────────── */

    elListBtn.addEventListener('click', function () {
        const isOpen = !elList.classList.contains('hidden');
        elList.classList.toggle('hidden', isOpen);
        elListBtn.classList.toggle('open', !isOpen);
    });

    function renderList(markers) {
        if (!markers.length) {
            elList.innerHTML = '<p style="font-size:.75rem;color:var(--text-secondary,#888);text-align:center;padding:6px 0;">Sin marcadores</p>';
            return;
        }
        elList.innerHTML = markers.map(m => `
            <div class="loc-item" onclick="locFly('${m.id}')">
                <button class="loc-item-del" onclick="event.stopPropagation();locDelete('${m.id}')" title="Eliminar">✕</button>
                <strong>${esc(m.title)}</strong>
                <span>${m.description ? esc(m.description) : `${Number(m.lat).toFixed(4)}, ${Number(m.lng).toFixed(4)}`}</span>
            </div>`).join('');
    }

    function updateCount(n) { elCount.textContent = n; }

    /* ── GPS ─────────────────────────────────────────────────────────────── */

    elGpsBtn.addEventListener('click', function () {
        if (!navigator.geolocation) { showToast('⚠️ Geolocalización no disponible'); return; }
        elGpsBtn.classList.add('locating');
        elGpsBtn.disabled = true;

        navigator.geolocation.getCurrentPosition(
            function (pos) {
                elGpsBtn.classList.remove('locating');
                elGpsBtn.disabled = false;

                const ll = L.latLng(pos.coords.latitude, pos.coords.longitude);
                map.flyTo(ll, 17, { animate: true, duration: 1.1 });

                // Punto "estoy aquí" (no guardado)
                L.marker(ll, {
                    icon: L.divIcon({
                        html: `<div style="width:14px;height:14px;border-radius:50%;
                               background:var(--accent-color);border:2.5px solid white;
                               box-shadow:0 0 0 5px var(--accent-glow);"></div>`,
                        className: '',
                        iconSize: [14, 14], iconAnchor: [7, 7],
                    })
                }).addTo(map).bindPopup('<strong>📍 Mi ubicación actual</strong>').openPopup();

                // Pre-cargar como pendiente para guardar
                pendingLatlng = ll;
                dropPendingPin(ll);
                elHint.textContent = `📍 ${ll.lat.toFixed(5)}, ${ll.lng.toFixed(5)} — Agrega título y guarda`;
                openModal(ll);
                showToast('📍 Ubicación encontrada');
            },
            function (err) {
                elGpsBtn.classList.remove('locating');
                elGpsBtn.disabled = false;
                showToast(err.code === 1 ? '⚠️ Permiso denegado' : '⚠️ No se pudo obtener ubicación');
            },
            { enableHighAccuracy: true, timeout: 10000 }
        );
    });

    /* ── Helpers ─────────────────────────────────────────────────────────── */

    function getAccent() {
        return getComputedStyle(document.documentElement)
            .getPropertyValue('--accent-color').trim() || '#6750A4';
    }

    function showToast(msg) {
        elToast.textContent = msg;
        elToast.classList.add('show');
        clearTimeout(elToast._t);
        elToast._t = setTimeout(() => elToast.classList.remove('show'), 2600);
    }

    function esc(s) {
        return String(s || '')
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function initRealtimeLocation() {
        const rt = window.MiraiRealtime.getInstance();

        rt.subscribe('location', (markers) => {
            markers.forEach(marker => {
                // Si hay un mapa Leaflet/Google Maps activo, agregar el marcador
                if (typeof addMarkerToMap === 'function') {
                    addMarkerToMap(marker);
                } else if (typeof loadMarkers === 'function') {
                    loadMarkers();
                    return;
                }
                // Actualizar lista lateral si existe
                const item = document.querySelector(`[data-marker-id="${marker.id}"]`);
                if (!item && typeof appendMarkerListItem === 'function') {
                    appendMarkerListItem(marker);
                }
            });
        });

        rt.start();
    }

    /* ── Arranque ────────────────────────────────────────────────────────── */
    initMap();

})();