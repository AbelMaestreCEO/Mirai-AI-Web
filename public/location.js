/**
 * location.js — Módulo de Ubicaciones (Mirai AI)
 * Leaflet map + GPS + marcadores con título/descripción
 * Persistencia: localStorage (clave 'mirai-location-markers')
 * Sin type="module" — usa variables globales para compatibilidad con onclick inline
 */

(function () {
    'use strict';

    // ── Constantes ──────────────────────────────────────────────────────────
    const STORAGE_KEY = 'mirai-location-markers';
    const DEFAULT_CENTER = [9.0, -66.0]; // Venezuela como centro por defecto
    const DEFAULT_ZOOM = 6;

    // ── Estado ───────────────────────────────────────────────────────────────
    let map = null;
    let pendingLatLng = null;        // coordenadas donde el usuario tocó
    let leafletMarkers = {};         // id → L.Marker
    let markers = loadMarkers();     // array de objetos guardados

    // ── DOM refs ─────────────────────────────────────────────────────────────
    const elMap       = document.getElementById('loc-map');
    const elGpsBtn    = document.getElementById('loc-gps-btn');
    const elListBtn   = document.getElementById('loc-list-btn');
    const elList      = document.getElementById('loc-markers-list');
    const elCount     = document.getElementById('loc-list-count');
    const elHint      = document.getElementById('loc-hint');
    const elTitle     = document.getElementById('loc-title');
    const elDesc      = document.getElementById('loc-desc');
    const elSaveBtn   = document.getElementById('loc-save-btn');
    const elToast     = document.getElementById('loc-toast');
    const elCrosshair = document.getElementById('loc-crosshair');

    // ── Inicialización del mapa ───────────────────────────────────────────────
    function initMap() {
        map = L.map('loc-map', {
            center: DEFAULT_CENTER,
            zoom: DEFAULT_ZOOM,
            zoomControl: true,
        });

        // Tile layer OpenStreetMap
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        }).addTo(map);

        // Clic en el mapa → colocar marcador temporal
        map.on('click', onMapClick);

        // Renderizar marcadores guardados
        markers.forEach(addLeafletMarker);
        updateListUI();
    }

    // ── Clic en el mapa ───────────────────────────────────────────────────────
    function onMapClick(e) {
        pendingLatLng = e.latlng;

        // Mover crosshair al centro (ya está centrado por CSS, solo mostrarlo)
        elCrosshair.style.opacity = '1';

        // Actualizar hint
        elHint.textContent = `📍 ${pendingLatLng.lat.toFixed(5)}, ${pendingLatLng.lng.toFixed(5)} — Agrega título y guarda`;

        // Habilitar botón guardar
        elSaveBtn.disabled = false;
        elTitle.focus();
    }

    // ── Guardar marcador ──────────────────────────────────────────────────────
    elSaveBtn.addEventListener('click', function () {
        if (!pendingLatLng) return;

        const title = elTitle.value.trim() || 'Sin título';
        const desc  = elDesc.value.trim();

        const marker = {
            id:    Date.now().toString(),
            lat:   pendingLatLng.lat,
            lng:   pendingLatLng.lng,
            title,
            desc,
        };

        markers.push(marker);
        saveMarkers();
        addLeafletMarker(marker);
        updateListUI();

        // Limpiar estado
        pendingLatLng = null;
        elTitle.value = '';
        elDesc.value  = '';
        elSaveBtn.disabled = true;
        elCrosshair.style.opacity = '0';
        elHint.textContent = 'Toca el mapa para colocar un marcador';

        showToast('✅ Marcador guardado');
    });

    // Guardar también con Enter en los campos
    [elTitle, elDesc].forEach(el => {
        el.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' && !elSaveBtn.disabled) elSaveBtn.click();
        });
    });

    // ── Añadir marcador Leaflet ───────────────────────────────────────────────
    function addLeafletMarker(marker) {
        const accentColor = getComputedStyle(document.documentElement)
            .getPropertyValue('--accent-color').trim() || '#6750A4';

        // Icono SVG pin personalizado
        const iconHtml = `
            <svg xmlns="http://www.w3.org/2000/svg" width="28" height="36" viewBox="0 0 28 36">
                <path d="M14 0C6.27 0 0 6.27 0 14c0 9.75 14 22 14 22S28 23.75 28 14C28 6.27 21.73 0 14 0z"
                    fill="${accentColor}" stroke="white" stroke-width="1.5" opacity="0.95"/>
                <circle cx="14" cy="14" r="5" fill="white"/>
            </svg>`;

        const icon = L.divIcon({
            html: iconHtml,
            className: '',
            iconSize: [28, 36],
            iconAnchor: [14, 36],
            popupAnchor: [0, -36],
        });

        const lMarker = L.marker([marker.lat, marker.lng], { icon })
            .addTo(map)
            .bindPopup(buildPopupHTML(marker));

        leafletMarkers[marker.id] = lMarker;
    }

    function buildPopupHTML(marker) {
        return `
            <div class="loc-popup-title">${escapeHtml(marker.title)}</div>
            ${marker.desc ? `<div class="loc-popup-desc">${escapeHtml(marker.desc)}</div>` : ''}
            <div class="loc-popup-coords">${marker.lat.toFixed(5)}, ${marker.lng.toFixed(5)}</div>
            <div style="margin-top:8px;display:flex;gap:6px;">
                <button onclick="locDeleteMarker('${marker.id}')"
                    style="font-size:0.75rem;background:none;border:1px solid #e53935;color:#e53935;border-radius:6px;padding:3px 8px;cursor:pointer;">
                    🗑 Eliminar
                </button>
            </div>`;
    }

    // ── Eliminar marcador (global para popup onclick) ─────────────────────────
    window.locDeleteMarker = function (id) {
        markers = markers.filter(m => m.id !== id);
        saveMarkers();

        if (leafletMarkers[id]) {
            map.removeLayer(leafletMarkers[id]);
            delete leafletMarkers[id];
        }

        updateListUI();
        showToast('🗑 Marcador eliminado');
    };

    // ── Lista lateral ─────────────────────────────────────────────────────────
    elListBtn.addEventListener('click', function () {
        const isOpen = !elList.classList.contains('hidden');
        elList.classList.toggle('hidden', isOpen);
        elListBtn.classList.toggle('list-open', !isOpen);
    });

    function updateListUI() {
        elCount.textContent = markers.length;

        if (markers.length === 0) {
            elList.innerHTML = '<p style="font-size:0.78rem;color:var(--text-secondary,#888);text-align:center;padding:8px 0;">Sin marcadores guardados</p>';
            return;
        }

        elList.innerHTML = markers.map(m => `
            <div class="loc-marker-item" onclick="locFlyTo('${m.id}')">
                <button class="loc-item-del" onclick="event.stopPropagation(); locDeleteMarker('${m.id}')" title="Eliminar">✕</button>
                <strong>${escapeHtml(m.title)}</strong>
                <span>${m.desc ? escapeHtml(m.desc) : `${m.lat.toFixed(4)}, ${m.lng.toFixed(4)}`}</span>
            </div>`
        ).join('');
    }

    // Volar a un marcador desde la lista
    window.locFlyTo = function (id) {
        const marker = markers.find(m => m.id === id);
        if (!marker) return;
        map.flyTo([marker.lat, marker.lng], 16, { animate: true, duration: 1 });
        if (leafletMarkers[id]) leafletMarkers[id].openPopup();
        // Cerrar lista en móvil
        elList.classList.add('hidden');
        elListBtn.classList.remove('list-open');
    };

    // ── GPS: ir a ubicación real ───────────────────────────────────────────────
    elGpsBtn.addEventListener('click', function () {
        if (!navigator.geolocation) {
            showToast('⚠️ Geolocalización no disponible');
            return;
        }

        elGpsBtn.classList.add('locating');
        elGpsBtn.disabled = true;

        navigator.geolocation.getCurrentPosition(
            function (pos) {
                elGpsBtn.classList.remove('locating');
                elGpsBtn.disabled = false;

                const latlng = L.latLng(pos.coords.latitude, pos.coords.longitude);
                map.flyTo(latlng, 17, { animate: true, duration: 1.2 });

                // Marcador temporal de "estoy aquí"
                const pulseIcon = L.divIcon({
                    html: `<div style="
                        width:16px;height:16px;border-radius:50%;
                        background:var(--accent-color);
                        border:3px solid white;
                        box-shadow:0 0 0 4px var(--accent-glow);
                        animation:loc-pulse 1.5s infinite;"></div>`,
                    className: '',
                    iconSize: [16, 16],
                    iconAnchor: [8, 8],
                });

                L.marker(latlng, { icon: pulseIcon })
                    .addTo(map)
                    .bindPopup('<strong>📍 Mi ubicación</strong>')
                    .openPopup();

                // Pre-rellenar coordenadas como pendiente para facilitar guardar
                pendingLatLng = latlng;
                elHint.textContent = `📍 ${latlng.lat.toFixed(5)}, ${latlng.lng.toFixed(5)} — Agrega título y guarda`;
                elSaveBtn.disabled = false;
                elTitle.focus();

                showToast('📍 Ubicación encontrada');
            },
            function (err) {
                elGpsBtn.classList.remove('locating');
                elGpsBtn.disabled = false;
                const msg = err.code === 1 ? 'Permiso denegado' : 'No se pudo obtener la ubicación';
                showToast(`⚠️ ${msg}`);
            },
            { enableHighAccuracy: true, timeout: 10000 }
        );
    });

    // ── Persistencia localStorage ─────────────────────────────────────────────
    function loadMarkers() {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
        } catch {
            return [];
        }
    }

    function saveMarkers() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(markers));
    }

    // ── Utilidades ────────────────────────────────────────────────────────────
    function showToast(msg) {
        elToast.textContent = msg;
        elToast.classList.add('show');
        clearTimeout(elToast._timer);
        elToast._timer = setTimeout(() => elToast.classList.remove('show'), 2500);
    }

    function escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    // ── Arranque ──────────────────────────────────────────────────────────────
    // Esperar a que Leaflet esté disponible (cargado antes en el HTML)
    if (typeof L !== 'undefined') {
        initMap();
    } else {
        document.addEventListener('DOMContentLoaded', initMap);
    }

})();