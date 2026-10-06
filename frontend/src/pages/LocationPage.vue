<template>
  <header class="header">
    <MenuToggle />
    <div class="header-title">Ubicaciones</div>
  </header>

  <div class="loc-wrapper">
    <!-- Buscador Places -->
    <div id="loc-search-wrap">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
        <path
          d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zM9.5 14C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"
        />
      </svg>
      <input id="loc-search-input" ref="searchEl" type="text" placeholder="Buscar lugar..." autocomplete="off">
    </div>

    <!-- Mapa -->
    <div id="loc-map" ref="mapEl"></div>

    <!-- Crosshair -->
    <div id="loc-crosshair">
      <svg width="30" height="30" viewBox="0 0 30 30" fill="none">
        <circle cx="15" cy="15" r="11" stroke="white" stroke-width="1.8" stroke-dasharray="4 2" opacity="0.7" />
        <line x1="15" y1="3" x2="15" y2="9" stroke="white" stroke-width="2.2" stroke-linecap="round" />
        <line x1="15" y1="21" x2="15" y2="27" stroke="white" stroke-width="2.2" stroke-linecap="round" />
        <line x1="3" y1="15" x2="9" y2="15" stroke="white" stroke-width="2.2" stroke-linecap="round" />
        <line x1="21" y1="15" x2="27" y2="15" stroke="white" stroke-width="2.2" stroke-linecap="round" />
        <circle cx="15" cy="15" r="2.8" fill="var(--accent-color)" stroke="white" stroke-width="1.3" />
      </svg>
    </div>

    <!-- Botón lista -->
    <button id="loc-list-btn" :class="{ open: listOpen }" title="Marcadores guardados" @click="listOpen = !listOpen">
      <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor">
        <path
          d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5S10.62 6.5 12 6.5s2.5 1.12 2.5 2.5S13.38 11.5 12 11.5z"
        />
      </svg>
      <span id="loc-count">{{ markers.length }}</span>
    </button>

    <!-- Lista marcadores -->
    <div id="loc-markers-list" :class="{ hidden: !listOpen }">
      <p v-if="!markers.length" style="font-size:.75rem;color:var(--text-secondary,#888);text-align:center;padding:6px 0;">Sin marcadores</p>
      <div v-for="m in markers" :key="m.id" class="loc-item" :data-marker-id="m.id" @click="flyTo(m.id)">
        <button class="loc-item-del" title="Eliminar" @click.stop="deleteMarker(m.id)">✕</button>
        <strong>{{ m.title }}</strong>
        <span>{{ m.description || `${Number(m.lat).toFixed(4)}, ${Number(m.lng).toFixed(4)}` }}</span>
      </div>
    </div>

    <!-- FAB GPS -->
    <button id="loc-gps-btn" :class="{ locating }" :disabled="locating" title="Mi ubicación actual" @click="locate">
      <svg viewBox="0 0 24 24" width="21" height="21" fill="currentColor">
        <path
          d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm8.94 3A8.994 8.994 0 0 0 13 3.06V1h-2v2.06A8.994 8.994 0 0 0 3.06 11H1v2h2.06A8.994 8.994 0 0 0 11 20.94V23h2v-2.06A8.994 8.994 0 0 0 20.94 13H23v-2h-2.06zM12 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z"
        />
      </svg>
    </button>

    <!-- Toast -->
    <div id="loc-toast" :class="{ show: toastVisible }">{{ toastText }}</div>

    <!-- Hint flotante -->
    <div id="loc-hint">{{ hint }}</div>

    <!-- Modal flotante — Agregar marcador -->
    <div id="loc-modal-overlay" :class="{ open: pending !== null }" @click.self="clearPending">
      <div id="loc-modal">
        <!-- Vista previa del punto -->
        <div id="loc-modal-map">
          <div id="loc-modal-minimap" ref="minimapEl"></div>
          <svg class="loc-modal-pin" width="28" height="36" viewBox="0 0 26 34">
            <path d="M13 0C5.82 0 0 5.82 0 13c0 9.1 13 21 13 21S26 22.1 26 13C26 5.82 20.18 0 13 0z" fill="var(--accent-color)" stroke="white" stroke-width="1.4" />
            <circle cx="13" cy="13" r="4.5" fill="white" />
          </svg>
          <div id="loc-modal-coords" class="loc-modal-coords-badge">{{ modalCoords }}</div>
        </div>
        <!-- Formulario -->
        <div class="loc-modal-body">
          <div class="loc-modal-title-row">
            <h3>📍 Nuevo marcador</h3>
            <button id="loc-modal-close-btn" class="loc-modal-close" title="Cancelar" @click="clearPending">✕</button>
          </div>
          <input id="loc-title" ref="titleEl" v-model="form.title" type="text" placeholder="Título del lugar" maxlength="60" autocomplete="off" @keydown.enter="saveMarker">
          <input id="loc-desc" v-model="form.desc" type="text" placeholder="Descripción (opcional)" maxlength="120" autocomplete="off" @keydown.enter="saveMarker">
          <!-- Imágenes -->
          <div class="loc-images-section">
            <label class="loc-images-label">📷 Imágenes <span class="loc-images-hint">(máx. 5)</span></label>
            <div id="loc-images-preview" class="loc-images-preview">
              <div v-for="(img, i) in images" :key="img.url" class="loc-img-thumb-wrap">
                <img :src="img.url" alt="">
                <button class="loc-img-thumb-remove" @click="removeImage(i)">✕</button>
              </div>
            </div>
            <label id="loc-images-add-label" class="loc-images-add-btn">
              <input id="loc-images-input" type="file" accept="image/*" multiple style="display:none" @change="onImages">
              + Añadir imágenes
            </label>
          </div>
          <div class="loc-modal-actions">
            <button id="loc-modal-cancel-btn" class="loc-modal-cancel" @click="clearPending">Cancelar</button>
            <button id="loc-save-btn" class="loc-save-btn" :disabled="pending === null || saving" @click="saveMarker">{{ saving ? '...' : 'Guardar punto' }}</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Modal detalle de marcador -->
    <div id="loc-detail-overlay" class="loc-detail-overlay" :class="{ open: detail !== null }" @click.self="detail = null">
      <div id="loc-detail-modal" class="loc-detail-modal">
        <div class="loc-detail-header">
          <h3 id="loc-detail-title">📍 {{ detail ? detail.title || 'Sin título' : 'Detalle' }}</h3>
          <button id="loc-detail-close-btn" class="loc-modal-close" title="Cerrar" @click="detail = null">✕</button>
        </div>
        <div id="loc-detail-images" class="loc-detail-images" :style="{ display: detail?.images?.length ? 'flex' : 'none' }">
          <img v-for="url in detail?.images ?? []" :key="url" :src="url" alt="Imagen del marcador" @click="openImage(url)">
        </div>
        <div id="loc-detail-desc" class="loc-detail-desc">{{ detail?.description || '' }}</div>
        <div id="loc-detail-coords" class="loc-detail-coords">{{ detail ? `${Number(detail.lat).toFixed(5)}, ${Number(detail.lng).toFixed(5)}` : '' }}</div>
        <div class="loc-modal-actions">
          <button id="loc-detail-delete-btn" class="loc-pop-del" @click="deleteFromDetail">🗑 Eliminar</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// Migración de public/location.html y public/location.js: marcadores del
// usuario (/api/locations, fotos en R2) y tareas pendientes con ubicación
// sobre Google Maps (Places para buscar, Geocoding para la dirección).
//
// Arreglado al migrar: los marcadores nuevos de otro dispositivo no llegaban
// al mapa (el aviso en vivo llamaba a funciones que no existían).
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import MenuToggle from '@/components/MenuToggle.vue';
import { apiFetch } from '@/lib/api';
import { accentColor, loadGoogleMaps, mapColorScheme, pinSvg, trackMapsUsage } from '@/lib/google-maps';
import { goToPage, pageHref } from '@/lib/legacy';
import { useRealtime } from '@/lib/realtime';

interface LocMarker {
  id: string;
  title: string;
  description?: string | null;
  lat: number | string;
  lng: number | string;
  images?: string[];
}

interface TaskRow {
  title: string;
  description?: string | null;
  status?: string | null;
  priority?: string | null;
  due_date?: string | null;
  lat?: number | string | null;
  lng?: number | string | null;
  location_label?: string | null;
}

const DEFAULT_CENTER = { lat: 9.0, lng: -66.0 };
const DEFAULT_ZOOM = 6;
const HINT = 'Toca el mapa para colocar un marcador';
const PIN_PATH = 'M13 0C5.82 0 0 5.82 0 13c0 9.1 13 21 13 21S26 22.1 26 13C26 5.82 20.18 0 13 0z';
const PRIORITY_COLOR: Record<string, string> = { critica: '#ef4444', alta: '#f97316', media: '#eab308', baja: '#22c55e' };
const STATUS_LABEL: Record<string, string> = { pendiente: 'Pendiente', progreso: 'En Progreso', revision: 'Revisión', completado: 'Completado' };
const PRIORITY_LABEL: Record<string, string> = { critica: '🔴 Crítica', alta: '🟠 Alta', media: '🟡 Media', baja: '🟢 Baja' };

const router = useRouter();

// ── Toast ─────────────────────────────────────────────────────────────────
const toastText = ref('');
const toastVisible = ref(false);
let toastTimer: number | undefined;

function showToast(msg: string) {
  toastText.value = msg;
  toastVisible.value = true;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (toastVisible.value = false), 2600);
}

// ── API ───────────────────────────────────────────────────────────────────
async function apiLocations(): Promise<LocMarker[]> {
  const res = await apiFetch('/api/locations');
  if (!res.ok) throw new Error('Error al cargar marcadores');
  return ((await res.json()) as { markers?: LocMarker[] }).markers ?? [];
}

async function apiTasks(): Promise<TaskRow[]> {
  try {
    const res = await apiFetch('/api/tasks');
    if (!res.ok) return [];
    const data: unknown = await res.json();
    return Array.isArray(data) ? (data as TaskRow[]) : [];
  } catch {
    return [];
  }
}

// ── Mapa ──────────────────────────────────────────────────────────────────
const mapEl = ref<HTMLElement | null>(null);
const minimapEl = ref<HTMLElement | null>(null);
const searchEl = ref<HTMLInputElement | null>(null);
let map: google.maps.Map | null = null;
let minimap: google.maps.Map | null = null;
let geocoder: google.maps.Geocoder | null = null;
let currentInfoWindow: google.maps.InfoWindow | null = null;
const locMarkers = new Map<string, { marker: google.maps.marker.AdvancedMarkerElement; infoWindow: google.maps.InfoWindow }>();
let taskMarkers: google.maps.marker.AdvancedMarkerElement[] = [];
let unmounted = false;

const markers = ref<LocMarker[]>([]);
const listOpen = ref(false);
const hint = ref(HINT);

async function init() {
  try {
    if (!(await loadGoogleMaps())) {
      showToast('⚠️ API Key de Google Maps no configurada');
      return;
    }
    if (unmounted || !mapEl.value) return;
    initMap(mapEl.value);
  } catch (err) {
    console.error('[Location] init:', err);
    showToast('⚠️ Error al inicializar el mapa');
  }
}

function initMap(el: HTMLElement) {
  map = new google.maps.Map(el, {
    center: DEFAULT_CENTER,
    zoom: DEFAULT_ZOOM,
    mapId: 'mirai-locations',
    disableDefaultUI: false,
    zoomControl: true,
    streetViewControl: false,
    mapTypeControl: false,
    fullscreenControl: false,
    gestureHandling: 'greedy',
    colorScheme: mapColorScheme(),
  });
  geocoder = new google.maps.Geocoder();
  map.addListener('click', (e: google.maps.MapMouseEvent) => {
    if (e.latLng) placePending({ lat: e.latLng.lat(), lng: e.latLng.lng() });
  });
  initSearchBox();
  void loadLocMarkers();
  void loadTaskMarkers();
}

function initSearchBox() {
  const input = searchEl.value;
  if (!input || !map) return;
  const autocomplete = new google.maps.places.Autocomplete(input, { fields: ['geometry', 'name', 'formatted_address'] });
  autocomplete.bindTo('bounds', map);
  autocomplete.addListener('place_changed', () => {
    const place = autocomplete.getPlace();
    const loc = place.geometry?.location;
    if (!loc) {
      showToast('⚠️ No se encontró ese lugar');
      return;
    }
    trackMapsUsage('places_autocomplete');
    map?.panTo(loc);
    map?.setZoom(15);
    placePending({ lat: loc.lat(), lng: loc.lng() });
    if (place.name) form.title = place.name;
    input.value = '';
  });
}

// ── Marcadores (AdvancedMarkerElement) ────────────────────────────────────
function circlePin(color: string, emoji: string): HTMLElement {
  const div = document.createElement('div');
  div.style.cssText = `width:30px;height:30px;border-radius:50%;background:${color};border:2.5px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.22);display:flex;align-items:center;justify-content:center;font-size:14px;line-height:1;`;
  div.textContent = emoji || '🗒️';
  return div;
}

function gpsDot(color: string): HTMLElement {
  const div = document.createElement('div');
  div.style.cssText = `width:14px;height:14px;border-radius:50%;background:${color};border:2.5px solid white;box-shadow:0 0 0 5px var(--accent-glow);`;
  return div;
}

function openInfo(infoWindow: google.maps.InfoWindow, marker: google.maps.marker.AdvancedMarkerElement) {
  currentInfoWindow?.close();
  infoWindow.open({ map, anchor: marker });
  currentInfoWindow = infoWindow;
}

/** Nodo con clase y texto (el contenido de las ventanas de info se arma a mano). */
function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function locPopup(m: LocMarker): HTMLElement {
  const root = document.createElement('div');
  const firstImage = m.images?.[0];
  if (firstImage) {
    const img = el('img', 'loc-pop-thumb');
    img.src = firstImage;
    img.alt = '';
    img.onerror = () => (img.style.display = 'none');
    root.append(img);
  }
  root.append(el('div', 'loc-pop-title', m.title));
  if (m.description) root.append(el('div', 'loc-pop-desc', m.description));
  root.append(el('div', 'loc-pop-coords', `${Number(m.lat).toFixed(5)}, ${Number(m.lng).toFixed(5)}`));
  const actions = el('div', '');
  actions.style.cssText = 'display:flex;gap:6px;margin-top:6px;flex-wrap:wrap;';
  const detailsBtn = el('button', 'loc-pop-details-btn', 'Ver detalles');
  detailsBtn.onclick = () => showDetail(m.id);
  const delBtn = el('button', 'loc-pop-del', '🗑 Eliminar');
  delBtn.style.marginTop = '0';
  delBtn.onclick = () => void deleteMarker(m.id);
  actions.append(detailsBtn, delBtn);
  root.append(actions);
  return root;
}

function taskPopup(t: TaskRow, color: string): HTMLElement {
  const root = document.createElement('div');
  root.append(el('div', 'loc-pop-title', `🗒️ ${t.title}`));
  if (t.description) root.append(el('div', 'loc-pop-desc', t.description));
  if (t.location_label) root.append(el('div', 'loc-pop-desc', `📍 ${t.location_label}`));
  const meta = el('div', 'loc-pop-coords');
  meta.style.marginTop = '4px';
  const priority = el('span', '', PRIORITY_LABEL[t.priority ?? ''] || t.priority || '');
  priority.style.cssText = `color:${color};font-weight:700;`;
  const sep = ' · ';
  meta.append(priority, `${sep}${STATUS_LABEL[t.status ?? ''] || t.status || ''}${t.due_date ? `${sep}Vence: ${t.due_date}` : ''}`);
  root.append(meta);
  const link = el('a', '', 'Ver tareas →');
  link.href = pageHref('task');
  link.style.cssText =
    'display:inline-block;margin-top:7px;font-size:.73rem;border:1px solid var(--accent-color);color:var(--accent-color);border-radius:6px;padding:3px 8px;text-decoration:none;background:none;';
  link.onclick = (e) => {
    if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey) return;
    e.preventDefault();
    goToPage(router, 'task');
  };
  root.append(link);
  return root;
}

function addLocMarker(m: LocMarker) {
  if (!map || locMarkers.has(m.id)) return;
  const marker = new google.maps.marker.AdvancedMarkerElement({
    position: { lat: Number(m.lat), lng: Number(m.lng) },
    map,
    content: pinSvg({ width: 26, height: 34, d: PIN_PATH, fill: accentColor(), fillOpacity: 1, stroke: '#ffffff', strokeWidth: 1.4, dot: { cx: 13, cy: 13, r: 4.5, fill: 'white', opacity: 1 } }),
    title: m.title,
  });
  const infoWindow = new google.maps.InfoWindow({ content: locPopup(m) });
  marker.addEventListener('gmp-click', () => openInfo(infoWindow, marker));
  locMarkers.set(m.id, { marker, infoWindow });
}

function removeLocMarker(id: string) {
  const entry = locMarkers.get(id);
  if (!entry) return;
  entry.marker.map = null;
  entry.infoWindow.close();
  locMarkers.delete(id);
}

async function refreshMarkers() {
  markers.value = await apiLocations();
}

async function loadLocMarkers() {
  try {
    await refreshMarkers();
    markers.value.forEach(addLocMarker);
  } catch (err) {
    console.error('[Locations] load:', err);
    showToast('⚠️ No se pudieron cargar los marcadores');
  }
}

async function loadTaskMarkers() {
  taskMarkers.forEach((m) => (m.map = null));
  taskMarkers = [];
  for (const t of await apiTasks()) {
    if (t.lat == null || t.lng == null || t.status === 'completado' || !map) continue;
    const color = PRIORITY_COLOR[t.priority ?? ''] || '#888';
    const marker = new google.maps.marker.AdvancedMarkerElement({
      position: { lat: Number(t.lat), lng: Number(t.lng) },
      map,
      content: circlePin(color, '🗒️'),
      title: t.title,
    });
    const infoWindow = new google.maps.InfoWindow({ content: taskPopup(t, color) });
    marker.addEventListener('gmp-click', () => openInfo(infoWindow, marker));
    taskMarkers.push(marker);
  }
}

function flyTo(id: string) {
  const entry = locMarkers.get(id);
  if (!entry || !map) return;
  if (entry.marker.position) map.panTo(entry.marker.position);
  map.setZoom(16);
  openInfo(entry.infoWindow, entry.marker);
  listOpen.value = false;
}

async function deleteMarker(id: string) {
  try {
    const res = await apiFetch(`/api/locations/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Error al eliminar');
    removeLocMarker(id);
    await refreshMarkers();
    showToast('🗑 Marcador eliminado');
  } catch (err) {
    console.error('[Locations] delete:', err);
    showToast('⚠️ Error al eliminar');
  }
}

// ── Marcador pendiente y modal de alta ────────────────────────────────────
const pending = ref<google.maps.LatLngLiteral | null>(null);
let pendingMarker: google.maps.marker.AdvancedMarkerElement | null = null;
const titleEl = ref<HTMLInputElement | null>(null);
const form = reactive({ title: '', desc: '' });
const saving = ref(false);
const images = ref<{ file: File; url: string }[]>([]);

const modalCoords = computed(() => (pending.value ? `${pending.value.lat.toFixed(5)}, ${pending.value.lng.toFixed(5)}` : '–'));

function dropPendingPin(latlng: google.maps.LatLngLiteral) {
  if (pendingMarker) pendingMarker.map = null;
  if (!map) return;
  const accent = accentColor();
  pendingMarker = new google.maps.marker.AdvancedMarkerElement({
    position: latlng,
    map,
    content: pinSvg({ width: 26, height: 34, d: PIN_PATH, fill: accent, fillOpacity: 0.3, stroke: accent, strokeWidth: 2.5, strokeDash: '4 3', dot: { cx: 13, cy: 13, r: 4, fill: accent, opacity: 0.75 } }),
    zIndex: 1000,
  });
}

function removePendingPin() {
  if (pendingMarker) pendingMarker.map = null;
  pendingMarker = null;
}

/** Coloca el marcador pendiente y abre el modal para guardarlo. */
function placePending(latlng: google.maps.LatLngLiteral) {
  pending.value = latlng;
  dropPendingPin(latlng);
  if (geocoder && !form.desc) {
    void geocoder.geocode({ location: latlng }).then(
      ({ results }) => {
        const first = results[0];
        if (!first) return;
        trackMapsUsage('geocode');
        if (!form.desc) form.desc = first.formatted_address;
      },
      () => {},
    );
  }
  window.setTimeout(() => {
    if (!minimapEl.value || !pending.value) return;
    if (minimap) {
      minimap.setCenter(latlng);
      minimap.setZoom(15);
    } else {
      minimap = new google.maps.Map(minimapEl.value, {
        center: latlng,
        zoom: 15,
        mapId: 'mirai-minimap',
        disableDefaultUI: true,
        gestureHandling: 'none',
        colorScheme: mapColorScheme(),
      });
    }
    titleEl.value?.focus();
  }, 80);
}

function resetForm() {
  form.title = '';
  form.desc = '';
  images.value.forEach((img) => URL.revokeObjectURL(img.url));
  images.value = [];
  hint.value = HINT;
}

function clearPending() {
  removePendingPin();
  pending.value = null;
  resetForm();
}

function onImages(e: Event) {
  const input = e.target as HTMLInputElement;
  for (const file of Array.from(input.files ?? [])) {
    if (images.value.length >= 5) break;
    images.value.push({ file, url: URL.createObjectURL(file) });
  }
  input.value = '';
}

function removeImage(i: number) {
  const [img] = images.value.splice(i, 1);
  if (img) URL.revokeObjectURL(img.url);
}

async function saveMarker() {
  const latlng = pending.value;
  if (!latlng || saving.value) return;
  saving.value = true;
  try {
    const fd = new FormData();
    fd.append('title', form.title.trim() || 'Sin título');
    fd.append('description', form.desc.trim());
    fd.append('lat', String(latlng.lat));
    fd.append('lng', String(latlng.lng));
    images.value.forEach((img) => fd.append('images', img.file));
    const res = await apiFetch('/api/locations', { method: 'POST', body: fd });
    if (!res.ok) throw new Error('Error al guardar marcador');
    const { marker } = (await res.json()) as { marker: LocMarker };
    removePendingPin();
    addLocMarker(marker);
    await refreshMarkers();
    pending.value = null;
    resetForm();
    showToast('✅ Marcador guardado');
  } catch (err) {
    console.error('[Locations] save:', err);
    showToast('⚠️ Error al guardar');
  } finally {
    saving.value = false;
  }
}

// ── GPS ───────────────────────────────────────────────────────────────────
const locating = ref(false);

function locate() {
  if (!navigator.geolocation) {
    showToast('⚠️ Geolocalización no disponible');
    return;
  }
  locating.value = true;
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      locating.value = false;
      if (!map) return;
      const ll = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      map.panTo(ll);
      map.setZoom(17);
      const gpsMarker = new google.maps.marker.AdvancedMarkerElement({ position: ll, map, content: gpsDot(accentColor()), title: 'Mi ubicación actual' });
      const content = el('strong', '', '📍 Mi ubicación actual');
      const gpsInfo = new google.maps.InfoWindow({ content });
      gpsInfo.open({ map, anchor: gpsMarker });
      gpsMarker.addEventListener('gmp-click', () => gpsInfo.open({ map, anchor: gpsMarker }));
      placePending(ll);
      hint.value = `📍 ${ll.lat.toFixed(5)}, ${ll.lng.toFixed(5)} — Agrega título y guarda`;
      showToast('📍 Ubicación encontrada');
    },
    (err) => {
      locating.value = false;
      showToast(err.code === 1 ? '⚠️ Permiso denegado' : '⚠️ No se pudo obtener ubicación');
    },
    { enableHighAccuracy: true, timeout: 10000 },
  );
}

// ── Detalle ───────────────────────────────────────────────────────────────
const detail = ref<LocMarker | null>(null);

function showDetail(id: string) {
  detail.value = markers.value.find((m) => m.id === id) ?? null;
}

async function deleteFromDetail() {
  if (!detail.value) return;
  await deleteMarker(detail.value.id);
  detail.value = null;
}

function openImage(url: string) {
  window.open(url, '_blank');
}

// Escape cierra el detalle o, si no está abierto, descarta el marcador pendiente.
function onKeydown(e: KeyboardEvent) {
  if (e.key !== 'Escape') return;
  if (detail.value) detail.value = null;
  else if (pending.value) clearPending();
}

// Marcadores nuevos o editados desde otro dispositivo.
useRealtime('location', () => {
  if (!map) return;
  void refreshMarkers()
    .then(() => markers.value.forEach(addLocMarker))
    .catch(() => {});
});

onMounted(() => {
  document.addEventListener('keydown', onKeydown);
  void nextTick(init);
});

onBeforeUnmount(() => {
  unmounted = true;
  document.removeEventListener('keydown', onKeydown);
  clearTimeout(toastTimer);
  images.value.forEach((img) => URL.revokeObjectURL(img.url));
});
</script>

<style>
/* CSS propio de la página antigua, limitado a ella (ver router: meta.page). */
    /* ── Wrapper ── */
    :where(body[data-page="location"]) .loc-wrapper {
      height: calc(100dvh - 56px);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      position: relative;
    }

    /* ── Mapa ocupa todo el wrapper (sin panel inferior) ── */
    :where(body[data-page="location"]) #loc-map {
      height: calc(100dvh - 56px);
      width: 100%;
      z-index: 0;
      display: block;
    }

    /* ── FAB GPS ── */
    :where(body[data-page="location"]) #loc-gps-btn {
      position: absolute;
      bottom: 120px;
      right: 10px;
      z-index: 500;
      width: 46px;
      height: 46px;
      border-radius: 50%;
      background: var(--accent-gradient);
      color: #fff;
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 16px var(--accent-glow);
      transition: transform 0.18s;
    }

    :where(body[data-page="location"]) #loc-gps-btn:hover {
      transform: scale(1.08);
    }

    :where(body[data-page="location"]) #loc-gps-btn.locating {
      animation: loc-pulse 1s infinite;
    }

    @keyframes loc-pulse {

      0%,
      100% {
        box-shadow: 0 4px 16px var(--accent-glow);
      }

      50% {
        box-shadow: 0 0 0 10px transparent, 0 4px 24px var(--accent-glow);
      }
    }

    /* ── Botón lista ── */
    :where(body[data-page="location"]) #loc-list-btn {
      position: absolute;
      top: 10px;
      right: 10px;
      z-index: 500;
      background: var(--glass-bg);
      border: 1px solid var(--glass-border);
      border-radius: 10px;
      padding: 7px 11px;
      font-size: 0.78rem;
      font-weight: 600;
      cursor: pointer;
      color: var(--accent-color);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      display: flex;
      align-items: center;
      gap: 5px;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.10);
    }

    :where(body[data-page="location"]) #loc-list-btn.open {
      background: var(--accent-gradient);
      color: #fff;
      border-color: transparent;
    }

    /* ── Lista lateral ── */
    :where(body[data-page="location"]) #loc-markers-list {
      position: absolute;
      top: 46px;
      right: 10px;
      z-index: 490;
      width: 210px;
      max-height: 320px;
      overflow-y: auto;
      background: var(--glass-bg);
      border: 1px solid var(--glass-border);
      border-radius: 12px;
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      padding: 6px;
      display: flex;
      flex-direction: column;
      gap: 5px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
    }

    :where(body[data-page="location"]) #loc-markers-list.hidden {
      display: none;
    }

    :where(body[data-page="location"]) .loc-item {
      background: var(--secondary-container);
      border-radius: 9px;
      padding: 7px 9px;
      cursor: pointer;
      border: 1px solid transparent;
      transition: border-color 0.15s;
    }

    :where(body[data-page="location"]) .loc-item:hover {
      border-color: var(--accent-color);
    }

    :where(body[data-page="location"]) .loc-item strong {
      display: block;
      font-size: 0.78rem;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    :where(body[data-page="location"]) .loc-item span {
      display: block;
      font-size: 0.7rem;
      color: var(--text-secondary, #888);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    :where(body[data-page="location"]) .loc-item-del {
      float: right;
      background: none;
      border: none;
      color: var(--text-secondary, #888);
      cursor: pointer;
      font-size: 0.8rem;
      padding: 0 2px;
      line-height: 1;
    }

    :where(body[data-page="location"]) .loc-item-del:hover {
      color: #e53935;
    }

    /* ── Crosshair ── */
    :where(body[data-page="location"]) #loc-crosshair {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      pointer-events: none;
      z-index: 400;
      opacity: 0;
      transition: opacity 0.2s;
    }

    /* ── Toast ── */
    :where(body[data-page="location"]) #loc-toast {
      position: absolute;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%) translateY(6px);
      background: var(--glass-bg);
      border: 1px solid var(--glass-border);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border-radius: 20px;
      padding: 7px 16px;
      font-size: 0.82rem;
      opacity: 0;
      pointer-events: none;
      z-index: 600;
      white-space: nowrap;
      transition: opacity 0.3s, transform 0.3s;
    }

    :where(body[data-page="location"]) #loc-toast.show {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }

    /* ── Hint flotante sobre el mapa ── */
    :where(body[data-page="location"]) #loc-hint {
      position: absolute;
      top: 56px;
      left: 50%;
      transform: translateX(-50%);
      text-align: center;
      font-size: 0.72rem;
      color: var(--text-secondary, #888);
      background: var(--glass-bg);
      border: 1px solid var(--glass-border);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      padding: 4px 14px;
      border-radius: 16px;
      pointer-events: none;
      z-index: 300;
      white-space: nowrap;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
    }

    /* ══════════════════════════════════════
 MODAL FLOTANTE — Agregar marcador
══════════════════════════════════════ */
    :where(body[data-page="location"]) #loc-modal-overlay {
      position: fixed;
      inset: 0;
      z-index: 800;
      background: rgba(0, 0, 0, 0.38);
      backdrop-filter: blur(4px);
      -webkit-backdrop-filter: blur(4px);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.22s;
    }

    :where(body[data-page="location"]) #loc-modal-overlay.open {
      opacity: 1;
      pointer-events: all;
    }

    :where(body[data-page="location"]) #loc-modal {
      background: var(--glass-bg);
      border: 1px solid var(--glass-border);
      border-radius: 20px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.22);
      width: 100%;
      max-width: 420px;
      overflow: hidden;
      transform: translateY(18px) scale(0.97);
      transition: transform 0.22s cubic-bezier(0.34, 1.36, 0.64, 1);
    }

    :where(body[data-page="location"]) #loc-modal-overlay.open #loc-modal {
      transform: translateY(0) scale(1);
    }

    /* Minimap / vista previa */
    :where(body[data-page="location"]) #loc-modal-map {
      width: 100%;
      height: 160px;
      background: var(--secondary-container);
      position: relative;
      overflow: hidden;
    }

    :where(body[data-page="location"]) #loc-modal-map iframe {
      width: 100%;
      height: 100%;
      border: none;
      pointer-events: none;
    }

    :where(body[data-page="location"]) .loc-modal-pin {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -100%);
      z-index: 1000;
      pointer-events: none;
    }

    :where(body[data-page="location"]) #loc-modal-minimap .gm-style {
      border-radius: inherit;
    }

    :where(body[data-page="location"]) .loc-modal-coords-badge {
      position: absolute;
      bottom: 8px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(0, 0, 0, 0.55);
      color: #fff;
      font-size: 0.65rem;
      padding: 3px 10px;
      border-radius: 10px;
      white-space: nowrap;
      z-index: 11;
      letter-spacing: 0.02em;
    }

    /* Cuerpo del modal */
    :where(body[data-page="location"]) .loc-modal-body {
      padding: 18px 20px 20px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    :where(body[data-page="location"]) .loc-modal-title-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 2px;
    }

    :where(body[data-page="location"]) .loc-modal-title-row h3 {
      font-size: 0.95rem;
      font-weight: 700;
      margin: 0;
    }

    :where(body[data-page="location"]) .loc-modal-close {
      background: none;
      border: none;
      cursor: pointer;
      color: var(--text-secondary, #888);
      font-size: 1.3rem;
      line-height: 1;
      padding: 0;
      display: flex;
      align-items: center;
      transition: color 0.15s;
    }

    :where(body[data-page="location"]) .loc-modal-close:hover {
      color: #e53935;
    }

    :where(body[data-page="location"]) .loc-modal-body input {
      width: 100%;
      box-sizing: border-box;
      background: var(--secondary-container);
      border: 1px solid var(--glass-border);
      border-radius: 10px;
      padding: 10px 13px;
      font-size: 0.875rem;
      color: var(--text-primary, inherit);
      outline: none;
      font-family: inherit;
      transition: border-color 0.2s;
    }

    :where(body[data-page="location"]) .loc-modal-body input:focus {
      border-color: var(--accent-color);
    }

    :where(body[data-page="location"]) .loc-modal-actions {
      display: flex;
      gap: 8px;
      margin-top: 2px;
    }

    :where(body[data-page="location"]) .loc-modal-cancel {
      flex: 1;
      background: var(--secondary-container);
      border: 1px solid var(--glass-border);
      border-radius: 10px;
      padding: 10px;
      font-size: 0.85rem;
      font-weight: 600;
      cursor: pointer;
      color: var(--text-primary, inherit);
      font-family: inherit;
      transition: opacity 0.15s;
    }

    :where(body[data-page="location"]) .loc-modal-cancel:hover {
      opacity: 0.75;
    }

    :where(body[data-page="location"]) .loc-save-btn {
      flex: 2;
      background: var(--accent-gradient);
      color: #fff;
      border: none;
      border-radius: 10px;
      padding: 10px 16px;
      font-size: 0.85rem;
      font-weight: 600;
      cursor: pointer;
      font-family: inherit;
      transition: opacity 0.18s, transform 0.18s;
    }

    :where(body[data-page="location"]) .loc-save-btn:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    :where(body[data-page="location"]) .loc-save-btn:not(:disabled):hover {
      opacity: 0.88;
      transform: scale(1.02);
    }

    /* Responsive: móvil pequeño */
    @media (max-width: 480px) {
      :where(body[data-page="location"]) #loc-modal {
        max-width: 100%;
        border-radius: 16px 16px 0 0;
      }

      :where(body[data-page="location"]) #loc-modal-overlay {
        align-items: flex-end;
        padding: 0;
      }

      :where(body[data-page="location"]) #loc-modal-map {
        height: 130px;
      }
    }

    :where(body[data-page="location"]) #loc-modal-minimap {
      width: 100%;
      height: 100%;
      min-height: 160px;
    }

    :where(body[data-page="location"]) .gm-style .gm-style-iw-c {
      background: var(--glass-bg) !important;
      border: 1px solid var(--glass-border) !important;
      border-radius: 12px !important;
      color: var(--text-primary, inherit) !important;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15) !important;
      padding: 12px !important;
    }
    :where(body[data-page="location"]) .gm-style .gm-style-iw-tc::after {
      background: var(--glass-bg) !important;
    }

    /* Places autocomplete wrapper */
    :where(body[data-page="location"]) #loc-search-wrap {
      position: absolute;
      top: 10px;
      left: 10px;
      z-index: 500;
      width: 260px;
      max-width: calc(100% - 80px);
      background: var(--glass-bg);
      border: 1px solid var(--glass-border);
      border-radius: 10px;
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      box-shadow: 0 2px 10px rgba(0,0,0,0.10);
      overflow: hidden;
      display: flex;
      align-items: center;
      padding: 0 10px;
    }
    :where(body[data-page="location"]) #loc-search-wrap svg {
      flex-shrink: 0;
      color: var(--text-secondary, #888);
    }
    :where(body[data-page="location"]) #loc-search-wrap input {
      flex: 1;
      border: none;
      background: transparent;
      padding: 9px 8px;
      font-size: 0.82rem;
      color: var(--text-primary, inherit);
      outline: none;
      font-family: inherit;
    }
    :where(body[data-page="location"]) #loc-search-wrap input::placeholder {
      color: var(--text-secondary, #999);
    }
    /* Hide Google's pac-container default styling overrides */
    :where(body[data-page="location"]) .pac-container {
      border-radius: 10px !important;
      border: 1px solid var(--glass-border) !important;
      box-shadow: 0 8px 24px rgba(0,0,0,0.15) !important;
      margin-top: 4px !important;
      font-family: inherit !important;
    }

    :where(body[data-page="location"]) .loc-pop-title {
      font-weight: 700;
      font-size: 0.88rem;
      margin-bottom: 2px;
    }

    :where(body[data-page="location"]) .loc-pop-desc {
      font-size: 0.78rem;
      color: var(--text-secondary, #888);
    }

    :where(body[data-page="location"]) .loc-pop-coords {
      font-size: 0.7rem;
      color: var(--text-secondary, #888);
      margin-top: 3px;
    }

    :where(body[data-page="location"]) .loc-pop-del {
      margin-top: 7px;
      font-size: 0.73rem;
      background: none;
      border: 1px solid #e53935;
      color: #e53935;
      border-radius: 6px;
      padding: 3px 8px;
      cursor: pointer;
      transition: background 0.15s, color 0.15s;
    }
    :where(body[data-page="location"]) .loc-pop-del:hover {
      background: #e53935;
      color: #fff;
    }

    /* ── Popup thumbnail ── */
    :where(body[data-page="location"]) .loc-pop-thumb {
      width: 100%;
      max-height: 100px;
      object-fit: cover;
      border-radius: 8px;
      margin-bottom: 6px;
    }
    :where(body[data-page="location"]) .loc-pop-details-btn {
      display: inline-block;
      margin-top: 6px;
      font-size: 0.73rem;
      border: 1px solid var(--accent-color, #6750A4);
      color: var(--accent-color, #6750A4);
      border-radius: 6px;
      padding: 4px 10px;
      cursor: pointer;
      background: none;
      transition: background 0.15s, color 0.15s;
    }
    :where(body[data-page="location"]) .loc-pop-details-btn:hover {
      background: var(--accent-color, #6750A4);
      color: #fff;
    }

    /* ── Image upload in form ── */
    :where(body[data-page="location"]) .loc-images-section {
      margin-top: 4px;
    }
    :where(body[data-page="location"]) .loc-images-label {
      font-size: 0.78rem;
      font-weight: 600;
      color: var(--text-secondary, #888);
    }
    :where(body[data-page="location"]) .loc-images-hint {
      font-weight: 400;
      opacity: 0.7;
    }
    :where(body[data-page="location"]) .loc-images-preview {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin-top: 8px;
    }
    :where(body[data-page="location"]) .loc-img-thumb-wrap {
      position: relative;
      width: 64px;
      height: 64px;
      border-radius: 10px;
      overflow: hidden;
      border: 1.5px solid var(--glass-border, rgba(103,80,164,0.12));
    }
    :where(body[data-page="location"]) .loc-img-thumb-wrap img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    :where(body[data-page="location"]) .loc-img-thumb-remove {
      position: absolute;
      top: 2px;
      right: 2px;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: rgba(0,0,0,0.55);
      color: #fff;
      font-size: 11px;
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      line-height: 1;
    }
    :where(body[data-page="location"]) .loc-images-add-btn {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      margin-top: 8px;
      padding: 6px 14px;
      border-radius: 10px;
      border: 1.5px dashed var(--glass-border, rgba(103,80,164,0.2));
      background: transparent;
      color: var(--accent-color, #6750A4);
      font-size: 0.8rem;
      font-weight: 600;
      cursor: pointer;
      transition: border-color 0.2s, background 0.2s;
    }
    :where(body[data-page="location"]) .loc-images-add-btn:hover {
      border-color: var(--accent-color, #6750A4);
      background: var(--secondary-container, #E8DEF8);
    }

    /* ── Detail modal ── */
    :where(body[data-page="location"]) .loc-detail-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.45);
      backdrop-filter: blur(4px);
      z-index: 2000;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1rem;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.22s ease;
    }
    :where(body[data-page="location"]) .loc-detail-overlay.open {
      opacity: 1;
      pointer-events: all;
    }
    :where(body[data-page="location"]) .loc-detail-modal {
      background: var(--glass-bg, rgba(255,255,255,0.97));
      border: 1px solid var(--glass-border, rgba(103,80,164,0.12));
      border-radius: 18px;
      padding: 1.5rem;
      width: 100%;
      max-width: 420px;
      max-height: 85vh;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 1rem;
      transform: translateY(16px) scale(0.98);
      transition: transform 0.22s ease;
      box-shadow: 0 20px 60px rgba(0,0,0,0.18);
    }
    :where(body[data-page="location"]) .loc-detail-overlay.open .loc-detail-modal {
      transform: translateY(0) scale(1);
    }
    :where(body[data-page="location"]) .loc-detail-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    :where(body[data-page="location"]) .loc-detail-header h3 {
      font-size: 1.05rem;
      font-weight: 700;
      margin: 0;
    }
    :where(body[data-page="location"]) .loc-detail-images {
      display: flex;
      gap: 8px;
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
      scrollbar-width: none;
      padding-bottom: 4px;
    }
    :where(body[data-page="location"]) .loc-detail-images::-webkit-scrollbar { display: none; }
    :where(body[data-page="location"]) .loc-detail-images img {
      width: 100%;
      max-width: 280px;
      height: 180px;
      object-fit: cover;
      border-radius: 12px;
      flex-shrink: 0;
      cursor: pointer;
      transition: transform 0.2s;
    }
    :where(body[data-page="location"]) .loc-detail-images img:hover {
      transform: scale(1.03);
    }
    :where(body[data-page="location"]) .loc-detail-desc {
      font-size: 0.88rem;
      color: var(--text-secondary, #666);
      line-height: 1.5;
    }
    :where(body[data-page="location"]) .loc-detail-coords {
      font-size: 0.75rem;
      color: var(--text-secondary, #888);
    }
</style>
