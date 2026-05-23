const CACHE_NAME = 'mirai-ai-v130'; // 👈 Cambia esto en cada deploy

// ─── Páginas HTML a precargar ────────────────────────────────────────────────
const HTML_PAGES = [
  '/',
  '/about.html',
  '/apa.html',
  '/attendance.html',
  '/attendance_admin.html',
  '/index.html',
  '/chat.html',
  '/courses.html',
  '/classroom_details.html',
  '/classroom_admin.html',
  '/classroom.html',
  '/course_details.html',
  '/course_category.html',
  '/panel.html',
  '/format.html',
  '/inventory.html',
  '/investigation.html',
  '/learning_hub.html',
  '/login.html',
  '/mirror.html',
  '/registration.html',
  '/report.html',
  '/report_admin.html',
  '/settings.html',
  '/verify.html',
  '/projects.html',
  '/task.html',
  '/code.html',
  // Agrega aquí el resto de tus páginas
];

// ─── Assets estáticos a precargar ───────────────────────────────────────────
const STATIC_ASSETS = [
  '/styles.css',
  '/app.js',
  '/manifest.json',
  '/transitions.css',  // 👈 El CSS de transiciones que agregaremos
  '/transitions.js',    // 👈 El JS de transiciones que agregaremos
];

const urlsToCache = [...HTML_PAGES, ...STATIC_ASSETS];

// ─── Instalación: Precachear todo ───────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[SW] Precacheando páginas y assets...');
      // addAll falla si cualquier recurso no responde — úsalo solo con archivos que existen
      return cache.addAll(urlsToCache);
    })
  );
  // Activar inmediatamente sin esperar que se cierren pestañas
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

  const isHTML = request.headers.get('accept')?.includes('text/html');

  if (isHTML) {
    // HTML: Cache First para que la navegación sea INSTANTÁNEA (ilusión de app nativa)
    // Si no está en caché o hay red, actualiza en background
    event.respondWith(
      caches.match(request).then(cached => {
        const networkFetch = fetch(request).then(response => {
          if (response.ok) {
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
      const networkFetch = fetch(request).then(response => {
        if (response.ok) {
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
self.addEventListener('push', event => {
  const data = event.data ? event.data.json() : {};
  const title = data.notification?.title || 'Mirai AI';
  const body = data.notification?.body || 'Tienes una nueva notificación.';
  const icon = data.notification?.icon || '/icon.png';

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon,
      badge: '/badge.png',
      tag: 'inventory-alert',
      requireInteraction: true
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow('https://ai.aberumirai.com/inventory.html')
  );
});