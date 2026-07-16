/**
 * location.js — Módulo de Ubicaciones (Mirai AI)
 * Persistencia: Cloudflare D1 via /api/locations + /api/tasks
 * Proveedor de mapas: Google Maps + Places + Geocoding
 */

(function () {
    'use strict';

    const DEFAULT_CENTER = { lat: 9.0, lng: -66.0 };
    const DEFAULT_ZOOM = 6;

    const PRIORITY_COLOR = { critica: '#ef4444', alta: '#f97316', media: '#eab308', baja: '#22c55e' };
    const STATUS_LABEL = { pendiente: 'Pendiente', progreso: 'En Progreso', revision: 'Revisión', completado: 'Completado' };
    const PRIORITY_LABEL = { critica: '🔴 Crítica', alta: '🟠 Alta', media: '🟡 Media', baja: '🟢 Baja' };

    let map = null;
    let geocoder = null;
    let pendingLatlng = null;
    let pendingMarker = null;
    let locMarkers = {};
    let taskMarkers = [];
    let allMarkersCache = [];
    let currentInfoWindow = null;

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
    const elImagesInput = document.getElementById('loc-images-input');
    const elImagesPreview = document.getElementById('loc-images-preview');
    const elDetailOverlay = document.getElementById('loc-detail-overlay');
    let minimapInstance = null;
    let pendingImages = [];

    /* ── API ─────────────────────────────────────────────────────────────── */

    async function apiLocations() {
        const res = await fetch('/api/locations', { credentials: 'same-origin' });
        if (!res.ok) throw new Error('Error al cargar marcadores');
        return (await res.json()).markers || [];
    }

    async function apiLocCreate(formData) {
        const res = await fetch('/api/locations', {
            method: 'POST',
            credentials: 'same-origin',
            body: formData,
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

    // Beacon best-effort para el panel de consumo de APIs — las llamadas reales
    // a Maps/Places/Geocoding ocurren en el navegador, nunca pasan por el Worker.
    function trackMapsUsage(type) {
        fetch('/api/track-maps-usage', {
            method: 'POST',
            credentials: 'same-origin',
            keepalive: true,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type }),
        }).catch(() => {});
    }

    /* ── Load Google Maps API ───────────────────────────────────────────── */

    async function loadGoogleMaps() {
        if (window.google && window.google.maps) return;

        const res = await fetch('/api/maps-key', { credentials: 'same-origin' });
        const { key } = await res.json();
        if (!key) {
            showToast('⚠️ API Key de Google Maps no configurada');
            return;
        }

        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=places,marker&loading=async&callback=__gmInit`;
            script.async = true;
            script.defer = true;
            window.__gmInit = () => { delete window.__gmInit; trackMapsUsage('map_load'); resolve(); };
            script.onerror = () => reject(new Error('Error cargando Google Maps'));
            document.head.appendChild(script);
        });
    }

    /* ── Init ────────────────────────────────────────────────────────────── */

    async function init() {
        try {
            await loadGoogleMaps();
            initMap();
        } catch (err) {
            console.error('[Location] init:', err);
            showToast('⚠️ Error al inicializar el mapa');
        }
    }

    function initMap() {
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        map = new google.maps.Map(document.getElementById('loc-map'), {
            center: DEFAULT_CENTER,
            zoom: DEFAULT_ZOOM,
            mapId: 'mirai-locations',
            disableDefaultUI: false,
            zoomControl: true,
            streetViewControl: false,
            mapTypeControl: false,
            fullscreenControl: false,
            gestureHandling: 'greedy',
            colorScheme: isDark ? 'DARK' : 'LIGHT',
        });

        geocoder = new google.maps.Geocoder();

        map.addListener('click', onMapClick);

        initSearchBox();
        loadLocMarkers();
        loadTaskMarkers();
        initRealtimeLocation();
    }

    /* ── Places Search Box ──────────────────────────────────────────────── */

    function initSearchBox() {
        const input = document.getElementById('loc-search-input');
        if (!input) return;

        const autocomplete = new google.maps.places.Autocomplete(input, {
            fields: ['geometry', 'name', 'formatted_address'],
        });
        autocomplete.bindTo('bounds', map);

        autocomplete.addListener('place_changed', () => {
            const place = autocomplete.getPlace();
            if (!place.geometry || !place.geometry.location) {
                showToast('⚠️ No se encontró ese lugar');
                return;
            }
            trackMapsUsage('places_autocomplete');

            const loc = place.geometry.location;
            map.panTo(loc);
            map.setZoom(15);

            const latlng = { lat: loc.lat(), lng: loc.lng() };
            pendingLatlng = latlng;
            dropPendingPin(latlng);
            openModal(latlng);

            if (place.name) elTitle.value = place.name;
            input.value = '';
        });
    }

    /* ── Helpers for AdvancedMarkerElement ───────────────────────────────── */

    function createPinSvg(fillColor, fillOpacity, strokeColor, strokeWidth, strokeDash) {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('width', '26');
        svg.setAttribute('height', '34');
        svg.setAttribute('viewBox', '0 0 26 34');

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', 'M13 0C5.82 0 0 5.82 0 13c0 9.1 13 21 13 21S26 22.1 26 13C26 5.82 20.18 0 13 0z');
        path.setAttribute('fill', fillColor);
        path.setAttribute('fill-opacity', String(fillOpacity));
        path.setAttribute('stroke', strokeColor);
        path.setAttribute('stroke-width', String(strokeWidth));
        if (strokeDash) path.setAttribute('stroke-dasharray', strokeDash);
        svg.appendChild(path);

        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', '13');
        circle.setAttribute('cy', '13');
        circle.setAttribute('r', fillOpacity < 1 ? '4' : '4.5');
        circle.setAttribute('fill', fillOpacity < 1 ? fillColor : 'white');
        circle.setAttribute('opacity', fillOpacity < 1 ? '0.75' : '1');
        svg.appendChild(circle);

        return svg;
    }

    function createCirclePinEl(color, emoji) {
        const div = document.createElement('div');
        div.style.cssText = `width:30px;height:30px;border-radius:50%;background:${color};border:2.5px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.22);display:flex;align-items:center;justify-content:center;font-size:14px;line-height:1;`;
        div.textContent = emoji || '🗒️';
        return div;
    }

    function createGpsDotEl(accentColor) {
        const div = document.createElement('div');
        div.style.cssText = `width:14px;height:14px;border-radius:50%;background:${accentColor};border:2.5px solid white;box-shadow:0 0 0 5px var(--accent-glow);`;
        return div;
    }

    /* ── Pending pin ────────────────────────────────────────────────────── */

    function dropPendingPin(latlng) {
        if (pendingMarker) pendingMarker.map = null;
        const accent = getAccent();
        const pinEl = createPinSvg(accent, 0.3, accent, 2.5, '4 3');

        pendingMarker = new google.maps.marker.AdvancedMarkerElement({
            position: latlng,
            map: map,
            content: pinEl,
            zIndex: 1000,
        });
    }

    function onMapClick(e) {
        const latlng = { lat: e.latLng.lat(), lng: e.latLng.lng() };
        pendingLatlng = latlng;
        dropPendingPin(latlng);
        openModal(latlng);
    }

    function openModal(latlng) {
        elModalCoords.textContent = `${latlng.lat.toFixed(5)}, ${latlng.lng.toFixed(5)}`;
        elSaveBtn.disabled = false;
        elModalOverlay.classList.add('open');

        if (geocoder && !elDesc.value) {
            geocoder.geocode({ location: latlng }, (results, status) => {
                if (status === 'OK' && results[0]) {
                    trackMapsUsage('geocode');
                    const addr = results[0].formatted_address;
                    if (!elDesc.value) elDesc.value = addr;
                }
            });
        }

        setTimeout(() => {
            const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
            if (minimapInstance) {
                minimapInstance.setCenter(latlng);
                minimapInstance.setZoom(15);
            } else {
                minimapInstance = new google.maps.Map(elModalMinimap, {
                    center: latlng,
                    zoom: 15,
                    mapId: 'mirai-minimap',
                    disableDefaultUI: true,
                    gestureHandling: 'none',
                    colorScheme: isDark ? 'DARK' : 'LIGHT',
                });
            }
            elTitle.focus();
        }, 80);
    }

    function clearPending() {
        if (pendingMarker) { pendingMarker.map = null; pendingMarker = null; }
        pendingLatlng = null;
        elSaveBtn.disabled = true;
        elHint.textContent = 'Toca el mapa para colocar un marcador';
        elTitle.value = '';
        elDesc.value = '';
        pendingImages = [];
        elImagesPreview.innerHTML = '';
        if (elImagesInput) elImagesInput.value = '';
        elModalOverlay.classList.remove('open');
    }

    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            if (elDetailOverlay && elDetailOverlay.classList.contains('open')) {
                elDetailOverlay.classList.remove('open');
            } else if (pendingLatlng) {
                clearPending();
            }
        }
    });
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
            const fd = new FormData();
            fd.append('title', elTitle.value.trim() || 'Sin título');
            fd.append('description', elDesc.value.trim());
            fd.append('lat', pendingLatlng.lat);
            fd.append('lng', pendingLatlng.lng);
            pendingImages.forEach(f => fd.append('images', f));
            const marker = await apiLocCreate(fd);
            if (pendingMarker) { pendingMarker.map = null; pendingMarker = null; }
            addLocMarker(marker);

            const all = await apiLocations();
            allMarkersCache = all;
            renderList(all);
            updateCount(all.length);

            pendingLatlng = null;
            elTitle.value = '';
            elDesc.value = '';
            pendingImages = [];
            elImagesPreview.innerHTML = '';
            if (elImagesInput) elImagesInput.value = '';
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
            allMarkersCache = markers;
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
        const pinEl = createPinSvg(accent, 1, '#ffffff', 1.4);

        const gMarker = new google.maps.marker.AdvancedMarkerElement({
            position: { lat: Number(m.lat), lng: Number(m.lng) },
            map: map,
            content: pinEl,
            title: m.title,
        });

        const infoWindow = new google.maps.InfoWindow({
            content: buildLocPopup(m),
        });

        gMarker.addEventListener('gmp-click', () => {
            if (currentInfoWindow) currentInfoWindow.close();
            infoWindow.open(map, gMarker);
            currentInfoWindow = infoWindow;
        });

        locMarkers[m.id] = { marker: gMarker, infoWindow };
    }

    function buildLocPopup(m) {
        const imgs = m.images || [];
        const thumb = imgs.length > 0
            ? `<img class="loc-pop-thumb" src="${esc(imgs[0])}" alt="" onerror="this.style.display='none'">`
            : '';
        return `${thumb}
                <div class="loc-pop-title">${esc(m.title)}</div>
                ${m.description ? `<div class="loc-pop-desc">${esc(m.description)}</div>` : ''}
                <div class="loc-pop-coords">${Number(m.lat).toFixed(5)}, ${Number(m.lng).toFixed(5)}</div>
                <div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap;">
                    <button class="loc-pop-details-btn" onclick="locShowDetail('${m.id}')">Ver detalles</button>
                    <button class="loc-pop-del" onclick="locDelete('${m.id}')" style="margin-top:0;">🗑 Eliminar</button>
                </div>`;
    }

    /* ── Eliminar ubicación ──────────────────────────────────────────────── */

    window.locDelete = async function (id) {
        try {
            await apiLocDelete(id);
            if (locMarkers[id]) {
                locMarkers[id].marker.map = null;
                if (locMarkers[id].infoWindow) locMarkers[id].infoWindow.close();
                delete locMarkers[id];
            }
            const all = await apiLocations();
            allMarkersCache = all;
            renderList(all);
            updateCount(all.length);
            showToast('🗑 Marcador eliminado');
        } catch (err) {
            console.error('[Locations] delete:', err);
            showToast('⚠️ Error al eliminar');
        }
    };

    window.locFly = function (id) {
        const entry = locMarkers[id];
        if (!entry) return;
        map.panTo(entry.marker.position);
        map.setZoom(16);
        if (currentInfoWindow) currentInfoWindow.close();
        entry.infoWindow.open(map, entry.marker);
        currentInfoWindow = entry.infoWindow;
        elList.classList.add('hidden');
        elListBtn.classList.remove('open');
    };

    /* ── Cargar tareas pendientes con ubicación ──────────────────────────── */

    async function loadTaskMarkers() {
        taskMarkers.forEach(m => { m.map = null; });
        taskMarkers = [];

        const tasks = await apiTasks();

        tasks
            .filter(t => t.lat != null && t.lng != null && t.status !== 'completado')
            .forEach(t => {
                const color = PRIORITY_COLOR[t.priority] || '#888';
                const pinEl = createCirclePinEl(color, '🗒️');

                const gMarker = new google.maps.marker.AdvancedMarkerElement({
                    position: { lat: Number(t.lat), lng: Number(t.lng) },
                    map: map,
                    content: pinEl,
                    title: t.title,
                });

                const infoWindow = new google.maps.InfoWindow({
                    content: buildTaskPopup(t, color),
                });

                gMarker.addEventListener('gmp-click', () => {
                    if (currentInfoWindow) currentInfoWindow.close();
                    infoWindow.open(map, gMarker);
                    currentInfoWindow = infoWindow;
                });

                taskMarkers.push(gMarker);
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

                const ll = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                map.panTo(ll);
                map.setZoom(17);

                const dotEl = createGpsDotEl(getAccent());
                const gpsMkr = new google.maps.marker.AdvancedMarkerElement({
                    position: ll,
                    map: map,
                    content: dotEl,
                    title: 'Mi ubicación actual',
                });

                const gpsiw = new google.maps.InfoWindow({ content: '<strong>📍 Mi ubicación actual</strong>' });
                gpsiw.open(map, gpsMkr);
                gpsMkr.addEventListener('gmp-click', () => gpsiw.open(map, gpsMkr));

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

    /* ── Image upload handling ───────────────────────────────────────────── */

    if (elImagesInput) {
        elImagesInput.addEventListener('change', function () {
            const files = Array.from(this.files);
            files.forEach(f => {
                if (pendingImages.length >= 5) return;
                pendingImages.push(f);
            });
            this.value = '';
            renderImagePreviews();
        });
    }

    function renderImagePreviews() {
        elImagesPreview.innerHTML = pendingImages.map((f, i) => {
            const url = URL.createObjectURL(f);
            return `<div class="loc-img-thumb-wrap">
                        <img src="${url}" alt="">
                        <button class="loc-img-thumb-remove" onclick="locRemovePendingImg(${i})">✕</button>
                    </div>`;
        }).join('');
    }

    window.locRemovePendingImg = function (idx) {
        pendingImages.splice(idx, 1);
        renderImagePreviews();
    };

    /* ── Detail modal ───────────────────────────────────────────────────── */

    window.locShowDetail = function (id) {
        const m = allMarkersCache.find(x => x.id === id);
        if (!m) return;

        document.getElementById('loc-detail-title').textContent = '📍 ' + (m.title || 'Sin título');
        document.getElementById('loc-detail-desc').textContent = m.description || '';
        document.getElementById('loc-detail-coords').textContent = `${Number(m.lat).toFixed(5)}, ${Number(m.lng).toFixed(5)}`;

        const imgsEl = document.getElementById('loc-detail-images');
        const imgs = m.images || [];
        if (imgs.length > 0) {
            imgsEl.innerHTML = imgs.map(url =>
                `<img src="${esc(url)}" alt="Imagen del marcador" onclick="window.open('${esc(url)}','_blank')">`
            ).join('');
            imgsEl.style.display = 'flex';
        } else {
            imgsEl.innerHTML = '';
            imgsEl.style.display = 'none';
        }

        const delBtn = document.getElementById('loc-detail-delete-btn');
        delBtn.onclick = async function () {
            await window.locDelete(id);
            elDetailOverlay.classList.remove('open');
        };

        elDetailOverlay.classList.add('open');
    };

    if (elDetailOverlay) {
        document.getElementById('loc-detail-close-btn').addEventListener('click', () => elDetailOverlay.classList.remove('open'));
        elDetailOverlay.addEventListener('click', e => { if (e.target === elDetailOverlay) elDetailOverlay.classList.remove('open'); });
    }

    function initRealtimeLocation() {
        const rt = window.MiraiRealtime.getInstance();

        rt.subscribe('location', (markers) => {
            markers.forEach(marker => {
                if (typeof addMarkerToMap === 'function') {
                    addMarkerToMap(marker);
                } else if (typeof loadMarkers === 'function') {
                    loadMarkers();
                    return;
                }
                const item = document.querySelector(`[data-marker-id="${marker.id}"]`);
                if (!item && typeof appendMarkerListItem === 'function') {
                    appendMarkerListItem(marker);
                }
            });
        });

        rt.start();
    }

    /* ── Arranque ────────────────────────────────────────────────────────── */
    init();

})();
