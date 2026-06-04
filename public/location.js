/**
 * location.js — Módulo de Ubicaciones (Mirai AI)
 * Persistencia: Cloudflare D1 via /api/locations
 * Sin type="module" — funciones globales para onclick en popups
 */

(function () {
    'use strict';

    // ── Config ────────────────────────────────────────────────────────────────
    const DEFAULT_CENTER = [9.0, -66.0];
    const DEFAULT_ZOOM   = 6;

    // ── Estado ────────────────────────────────────────────────────────────────
    let map          = null;
    let pendingLatlng = null;
    let leafletMarkers = {};   // id → L.Marker

    // ── DOM ───────────────────────────────────────────────────────────────────
    const elMap      = document.getElementById('loc-map');
    const elGpsBtn   = document.getElementById('loc-gps-btn');
    const elListBtn  = document.getElementById('loc-list-btn');
    const elList     = document.getElementById('loc-markers-list');
    const elCount    = document.getElementById('loc-count');
    const elHint     = document.getElementById('loc-hint');
    const elTitle    = document.getElementById('loc-title');
    const elDesc     = document.getElementById('loc-desc');
    const elSaveBtn  = document.getElementById('loc-save-btn');
    const elToast    = document.getElementById('loc-toast');
    const elCross    = document.getElementById('loc-crosshair');

    // ── API helpers ───────────────────────────────────────────────────────────
    async function apiGet() {
        const res = await fetch('/api/locations', { credentials: 'same-origin' });
        if (!res.ok) throw new Error('Error al cargar marcadores');
        const data = await res.json();
        return data.markers || [];
    }

    async function apiCreate(payload) {
        const res = await fetch('/api/locations', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error('Error al guardar marcador');
        return (await res.json()).marker;
    }

    async function apiDelete(id) {
        const res = await fetch(`/api/locations/${id}`, {
            method: 'DELETE',
            credentials: 'same-origin',
        });
        if (!res.ok) throw new Error('Error al eliminar marcador');
    }

    // ── Init mapa ─────────────────────────────────────────────────────────────
    function initMap() {
        map = L.map('loc-map', {
            center: DEFAULT_CENTER,
            zoom: DEFAULT_ZOOM,
            zoomControl: true,
        });

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        }).addTo(map);

        map.on('click', onMapClick);

        // Cargar marcadores desde D1
        loadMarkers();
    }

    // ── Cargar desde D1 ───────────────────────────────────────────────────────
    async function loadMarkers() {
        try {
            const markers = await apiGet();
            markers.forEach(m => addLeafletMarker(m));
            updateCount(markers.length);
            renderList(markers);
        } catch (err) {
            console.error('[Locations] loadMarkers:', err);
            showToast('⚠️ No se pudieron cargar los marcadores');
        }
    }

    // ── Clic en el mapa ───────────────────────────────────────────────────────
    function onMapClick(e) {
        pendingLatlng = e.latlng;
        elCross.style.opacity = '1';
        elHint.textContent = `📍 ${pendingLatlng.lat.toFixed(5)}, ${pendingLatlng.lng.toFixed(5)} — Agrega título y guarda`;
        elSaveBtn.disabled = false;
        elTitle.focus();
    }

    // ── Guardar marcador ──────────────────────────────────────────────────────
    elSaveBtn.addEventListener('click', async function () {
        if (!pendingLatlng) return;

        elSaveBtn.disabled = true;
        elSaveBtn.textContent = '...';

        try {
            const marker = await apiCreate({
                title:       elTitle.value.trim() || 'Sin título',
                description: elDesc.value.trim(),
                lat:         pendingLatlng.lat,
                lng:         pendingLatlng.lng,
            });

            addLeafletMarker(marker);

            // Actualizar lista entera (re-fetch para mantener orden)
            const allMarkers = await apiGet();
            renderList(allMarkers);
            updateCount(allMarkers.length);

            // Reset
            pendingLatlng     = null;
            elTitle.value     = '';
            elDesc.value      = '';
            elCross.style.opacity = '0';
            elHint.textContent = 'Toca el mapa para colocar un marcador';
            showToast('✅ Marcador guardado');
        } catch (err) {
            console.error('[Locations] save:', err);
            showToast('⚠️ Error al guardar');
            elSaveBtn.disabled = false;
        } finally {
            elSaveBtn.textContent = 'Guardar';
            elSaveBtn.disabled = !!pendingLatlng ? false : true;
        }
    });

    [elTitle, elDesc].forEach(el =>
        el.addEventListener('keydown', e => {
            if (e.key === 'Enter' && !elSaveBtn.disabled) elSaveBtn.click();
        })
    );

    // ── Añadir marcador Leaflet ───────────────────────────────────────────────
    function addLeafletMarker(marker) {
        if (leafletMarkers[marker.id]) return; // ya existe

        const accent = getComputedStyle(document.documentElement)
            .getPropertyValue('--accent-color').trim() || '#6750A4';

        const icon = L.divIcon({
            html: `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="34" viewBox="0 0 26 34">
                     <path d="M13 0C5.82 0 0 5.82 0 13c0 9.1 13 21 13 21S26 22.1 26 13C26 5.82 20.18 0 13 0z"
                           fill="${accent}" stroke="white" stroke-width="1.4"/>
                     <circle cx="13" cy="13" r="4.5" fill="white"/>
                   </svg>`,
            className: '',
            iconSize:   [26, 34],
            iconAnchor: [13, 34],
            popupAnchor:[0, -34],
        });

        const lm = L.marker([marker.lat, marker.lng], { icon })
            .addTo(map)
            .bindPopup(buildPopup(marker));

        leafletMarkers[marker.id] = lm;
    }

    function buildPopup(m) {
        return `<div class="loc-pop-title">${esc(m.title)}</div>
                ${m.description ? `<div class="loc-pop-desc">${esc(m.description)}</div>` : ''}
                <div class="loc-pop-coords">${Number(m.lat).toFixed(5)}, ${Number(m.lng).toFixed(5)}</div>
                <button class="loc-pop-del" onclick="locDelete('${m.id}')">🗑 Eliminar</button>`;
    }

    // ── Eliminar (global para onclick en popup y lista) ───────────────────────
    window.locDelete = async function (id) {
        try {
            await apiDelete(id);

            // Quitar del mapa
            if (leafletMarkers[id]) {
                map.removeLayer(leafletMarkers[id]);
                delete leafletMarkers[id];
            }

            // Re-render lista
            const allMarkers = await apiGet();
            renderList(allMarkers);
            updateCount(allMarkers.length);
            showToast('🗑 Marcador eliminado');
        } catch (err) {
            console.error('[Locations] delete:', err);
            showToast('⚠️ Error al eliminar');
        }
    };

    // Volar a marcador desde lista
    window.locFly = function (id) {
        const lm = leafletMarkers[id];
        if (!lm) return;
        map.flyTo(lm.getLatLng(), 16, { animate: true, duration: 0.9 });
        lm.openPopup();
        elList.classList.add('hidden');
        elListBtn.classList.remove('open');
    };

    // ── Lista ─────────────────────────────────────────────────────────────────
    elListBtn.addEventListener('click', function () {
        const isOpen = !elList.classList.contains('hidden');
        elList.classList.toggle('hidden', isOpen);
        elListBtn.classList.toggle('open', !isOpen);
    });

    function renderList(markers) {
        if (!markers.length) {
            elList.innerHTML = '<p style="font-size:0.75rem;color:var(--text-secondary,#888);text-align:center;padding:6px;">Sin marcadores</p>';
            return;
        }
        elList.innerHTML = markers.map(m => `
            <div class="loc-item" onclick="locFly('${m.id}')">
                <button class="loc-item-del" onclick="event.stopPropagation();locDelete('${m.id}')" title="Eliminar">✕</button>
                <strong>${esc(m.title)}</strong>
                <span>${m.description ? esc(m.description) : `${Number(m.lat).toFixed(4)}, ${Number(m.lng).toFixed(4)}`}</span>
            </div>`).join('');
    }

    function updateCount(n) {
        elCount.textContent = n;
    }

    // ── GPS ───────────────────────────────────────────────────────────────────
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

                // Marcador "estoy aquí" temporal (sin guardar en DB)
                L.marker(ll, {
                    icon: L.divIcon({
                        html: `<div style="width:14px;height:14px;border-radius:50%;
                                background:var(--accent-color);border:2.5px solid white;
                                box-shadow:0 0 0 5px var(--accent-glow);"></div>`,
                        className: '',
                        iconSize: [14, 14],
                        iconAnchor: [7, 7],
                    })
                }).addTo(map).bindPopup('<strong>📍 Mi ubicación</strong>').openPopup();

                // Pre-cargar coordenadas para guardar
                pendingLatlng = ll;
                elHint.textContent = `📍 ${ll.lat.toFixed(5)}, ${ll.lng.toFixed(5)} — Agrega título y guarda`;
                elSaveBtn.disabled = false;
                elTitle.focus();
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

    // ── Helpers ───────────────────────────────────────────────────────────────
    function showToast(msg) {
        elToast.textContent = msg;
        elToast.classList.add('show');
        clearTimeout(elToast._t);
        elToast._t = setTimeout(() => elToast.classList.remove('show'), 2600);
    }

    function esc(s) {
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    // ── Arranque ──────────────────────────────────────────────────────────────
    // Leaflet está cargado síncronamente antes de este script
    initMap();

})();