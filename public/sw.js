// Service worker de Mirai AI: abrir la app sin conexión y notificaciones push.
// Lo registra frontend/src/boot/pwa.ts.
//
// Cambiar CACHE_NAME cuando cambie la lista de precarga o este archivo: el
// service worker nuevo borra las cachés con otro nombre al activarse. Los
// archivos de la app (/app/assets/*) llevan hash en el nombre y no hace falta.
const CACHE_NAME = 'mirai-ai-v346';

// El index.html de la app: todas las rutas (/chat, /task...) lo reciben, así
// que sin conexión se sirve esta copia para cualquiera de ellas.
const APP_SHELL = '/';

// ─── Iconos de módulo (Icons8) ──────────────────────────────────────────────
// Se precachean sólo los 48 px: el 2x (96) lo pide el navegador únicamente en
// pantallas HiDPI y lo resuelve el fetch handler.
const MODULE_ICONS = [
  '/icons/ui/apa-48.png',
  '/icons/ui/attendance-48.png',
  '/icons/ui/chat-48.png',
  '/icons/ui/classroom-48.png',
  '/icons/ui/courses-48.png',
  '/icons/ui/diet-48.png',
  '/icons/ui/docs-48.png',
  '/icons/ui/format-48.png',
  '/icons/ui/generation-48.png',
  '/icons/ui/home-48.png',
  '/icons/ui/inventory-48.png',
  '/icons/ui/investigation-48.png',
  '/icons/ui/location-48.png',
  '/icons/ui/panel-48.png',
  '/icons/ui/photos-48.png',
  '/icons/ui/plans-48.png',
  '/icons/ui/projects-48.png',
  '/icons/ui/reports-48.png',
  '/icons/ui/sales-48.png',
  '/icons/ui/tasks-48.png',
];

const PRECACHE = [APP_SHELL, '/manifest.json', '/icons/icon-192.png', ...MODULE_ICONS];

// ─── Instalación: precarga ───────────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      // Cada recurso por separado: si uno falla, los demás se cachean igual.
      Promise.all(PRECACHE.map(url => cache.add(url).catch(err => console.warn('[SW] No se pudo cachear:', url, err.message))))
    )
  );
  self.skipWaiting();
});

// ─── Activación: borrar cachés antiguas ─────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(names => Promise.all(names.filter(name => name !== CACHE_NAME).map(name => caches.delete(name))))
      .then(() => self.clients.claim())
  );
});

function cacheCopy(key, response) {
  if (response.ok && !response.redirected && response.type === 'basic') {
    const copy = response.clone();
    caches.open(CACHE_NAME).then(cache => cache.put(key, copy));
  }
  return response;
}

// ─── Fetch ───────────────────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== location.origin) return;

  // /api/*: siempre red, nunca caché. Cachear /api/me hacía que, con la sesión
  // ya caducada, se siguiera viendo un 200 viejo.
  if (url.pathname.startsWith('/api/')) return;

  // Navegaciones: red primero (el index.html apunta a archivos con hash que
  // cambian en cada deploy) y, sin conexión, la última copia de la app.
  // `fetch(request)` conserva el modo de redirección de la navegación: una
  // redirección (/reset-password.html -> /reset-password) llega tal cual al
  // navegador, que es quien la sigue.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => cacheCopy(APP_SHELL, response))
        .catch(() => caches.match(APP_SHELL).then(cached => cached || Response.error()))
    );
    return;
  }

  // Archivos de la app: el nombre cambia si cambia el contenido; caché primero.
  if (url.pathname.startsWith('/app/assets/')) {
    event.respondWith(caches.match(request).then(cached => cached || fetch(request).then(response => cacheCopy(request, response))));
    return;
  }

  // Iconos, manifest y demás: caché primero y se actualiza en segundo plano.
  event.respondWith(
    caches.match(request).then(cached => {
      const network = fetch(request).then(response => cacheCopy(request, response)).catch(() => null);
      return cached || network.then(response => response || Response.error());
    })
  );
});

// ─── Push Notifications ──────────────────────────────────────────────────────
// requireInteraction + renotify + vibrate: la notificación se queda visible
// hasta que el usuario interactúa con ella (no desaparece sola).
self.addEventListener('push', event => {
  const data = event.data ? event.data.json() : {};
  const title = data.notification?.title || 'Mirai AI';
  const body = data.notification?.body || 'Tienes una nueva notificación.';
  const icon = data.notification?.icon || '/icons/icon-192.png';
  const tag = data.notification?.tag || 'mirai-alert';
  const url = data.notification?.url || '/';

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon,
      // Android pinta el badge solo con el canal alfa: hace falta la silueta
      badge: '/icons/monochrome-512.png',
      tag,
      renotify: true,
      requireInteraction: true,
      vibrate: [200, 100, 200],
      data: { url }
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients.openWindow(self.location.origin + url)
  );
});