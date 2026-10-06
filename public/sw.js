const CACHE_NAME = 'mirai-ai-v335'; // 👈 Cambia esto en cada deploy

// ─── Páginas HTML a precargar ────────────────────────────────────────────────
const HTML_PAGES = [
  // App Quasar (frontend/): las páginas ya migradas viven aquí.
  '/app/',
  '/api_usage_admin',
  '/diet',
  '/inventory',
  '/location',
  '/mirror',
  '/panel',
  '/projects',
  '/report',
  '/report_admin',
];

// Páginas que ya viven en la app Quasar (/app/<slug>): su URL antigua es una
// redirección del Worker. Mantener en sincronía con MIGRATED_PAGES de
// workers/worker.ts y MIGRATED de frontend/src/lib/legacy.ts.
const MIGRATED_PAGES = new Set([
  'login', 'registration', 'verify', 'reset-password',
  'about', 'documentation', 'purchase', 'learning_hub',
  'index', 'settings', 'chat', 'code', 'format', 'investigation', 'generation',
  'apa', 'courses', 'course_category', 'course_details', 'classroom',
  'classroom_details', 'classroom_admin', 'attendance', 'attendance_admin',
  'task',
]);

// ─── Assets estáticos a precargar ───────────────────────────────────────────
const STATIC_ASSETS = [
  '/styles.css',
  '/transitions.css',
  '/welcome-styles.css',
  
  '/manifest.json',
  '/icons/icon-192.png',
  
  '/app.js',
  '/app-mirror.js',
  '/auth-guard.js',
  '/inventory.js',
  '/location.js',
  '/mirai-boot.js',
  '/mirai-realtime.js',
  '/pwa.js',
  '/projects.js',
  '/report.js',
  '/report_admin.js',
  '/transitions.js',
];


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

const urlsToCache = [...HTML_PAGES, ...STATIC_ASSETS, ...MODULE_ICONS];

// ─── Instalación: Precachear todo ───────────────────────────────────────────
// DESPUÉS
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[SW] Precacheando páginas y assets...');
      // Promise.all + catch individual: si un recurso falla, los demás siguen
      return Promise.all(
        urlsToCache.map(url =>
          cache.add(url).catch(err =>
            console.warn('[SW] No se pudo cachear (probablemente redirect/auth):', url, err.message)
          )
        )
      );
    })
  );
  self.skipWaiting();
});

// ─── Activación: Limpiar cachés antiguas ────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames =>
      Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME)
          .map(name => {
            console.log('[SW] Eliminando caché antigua:', name);
            return caches.delete(name);
          })
      )
    ).then(() => self.clients.claim())
  );
});

// ─── Fetch: Estrategia mixta ─────────────────────────────────────────────────
self.addEventListener('fetch', event => {

  if (!event.request) return;
  if (event.request.method !== 'GET') return;

  const { request } = event;
  const url = new URL(request.url);

  // Solo manejar requests del mismo origen
  if (url.origin !== location.origin) return;

  // /api/*: siempre red, nunca caché. Cachear /api/me (u otros endpoints) provocaba que,
  // al vencer/invalidarse la sesión, el navegador siguiera viendo una respuesta 200 vieja
  // mientras el servidor ya devolvía 401 — eso generaba el rebote infinito login↔index
  // entre auth-guard.js y login-guard.js.
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(request));
    return;
  }

  const isHTML = request.headers.get('accept')?.includes('text/html');

  // URL antiguas de páginas ya migradas a /app/: el Worker las redirige. No
  // hay nada que cachear y una redirección dentro de respondWith() es fácil de
  // romper (ver más abajo), así que se dejan pasar sin tocar.
  const legacySlug = url.pathname.replace(/^\/+/, '').replace(/\.html$/, '') || 'index';
  if (MIGRATED_PAGES.has(legacySlug)) return;

  // App Quasar (/app/): su index.html apunta a archivos con hash que cambian en
  // cada deploy y los viejos dejan de existir. Servirlo desde caché primero
  // (como el resto del HTML) podía dejar la app en blanco pidiendo JS borrado,
  // así que va red primero y la caché solo queda para cuando no hay conexión.
  // Sus /app/assets/* sí pueden ir por caché: el nombre cambia si cambian.
  if (isHTML && url.pathname === '/app') return; // 307 a /app/: que lo siga el navegador
  if (isHTML && url.pathname.startsWith('/app/')) {
    event.respondWith(
      // Petición nueva a la URL en vez de reenviar `request`: si la navegación
      // venía de una redirección (/about -> /app/about), reenviar la petición
      // original acababa en un error de red.
      fetch(url.href, { credentials: 'same-origin' }).then(response => {
        if (response.ok && !response.redirected) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
        }
        return response;
      }).catch(() => caches.match(request).then(cached => cached || Response.error()))
    );
    return;
  }

  if (isHTML) {
    // HTML: Cache First para que la navegación sea INSTANTÁNEA (ilusión de app nativa)
    // Si no está en caché o hay red, actualiza en background
    event.respondWith(
      caches.match(request).then(cached => {
        // Sin { redirect: 'follow' }: en una navegación (modo de redirección
        // 'manual') devolver una respuesta ya redirigida es un error de red, y
        // las páginas migradas (/about -> /app/about) acababan en una página de
        // error. Así una redirección llega como opaqueredirect y la sigue el
        // propio navegador.
        const networkFetch = fetch(request).then(response => {
          // No cachear respuestas redirigidas (ej. auth redirects)
          if (response.ok && !response.redirected) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          }
          return response;
        }).catch(() => null);

        // Devuelve caché inmediatamente si existe, si no espera la red
        return cached || networkFetch;
      })
    );
    return;
  }

  // CSS, JS, imágenes: Cache First con actualización en background
  event.respondWith(
    caches.match(request).then(cached => {
      const networkFetch = fetch(request, { redirect: 'follow' }).then(response => {
        if (response.ok && !response.redirected) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
        }
        return response;
      }).catch(() => null);

      return cached || networkFetch;
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