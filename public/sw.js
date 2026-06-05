const CACHE_NAME = 'mirai-ai-v199'; // 👈 Cambia esto en cada deploy

// ─── Páginas HTML a precargar ────────────────────────────────────────────────
const HTML_PAGES = [
  '/',
  '/about',
  '/apa',
  '/attendance',
  '/attendance_admin',
  '/chat',
  '/courses',
  '/classroom_details',
  '/classroom_admin',
  '/classroom',
  '/course_details',
  '/course_category',
  '/panel',
  '/format',
  '/inventory',
  '/investigation',
  '/learning_hub',
  '/login',
  '/mirror',
  '/registration',
  '/report',
  '/report_admin',
  '/settings',
  '/verify',
  '/projects',
  '/task',
  '/code',
  '/diet',
  '/generation'
  // Agrega aquí el resto de tus páginas
];

// ─── Assets estáticos a precargar ───────────────────────────────────────────
const STATIC_ASSETS = [
  '/styles.css',
  '/app.js',
  '/manifest.json',
  '/transitions.css',
  '/transitions.js',
  '/app-mirror.js',
  '/attendance_admin.js',
  '/attendance.js',
  '/auth-guard.js',
  '/classroom_admin.js',
  '/classroom_details.js',
  '/classroom.js',
  '/code.js',
  '/courses.js',
  '/format.js',
  '/inventory.js',
  '/investigation.js',
  '/login-guard.js',
  '/login.js',
  '/mirai-boot.js',
  '/projects.js',
  '/registration.js',
  '/report.js',
  '/report_admin.js',
  '/verify.js',
  '/generation.js'
];

const urlsToCache = [...HTML_PAGES, ...STATIC_ASSETS];

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

  const isHTML = request.headers.get('accept')?.includes('text/html');

  if (isHTML) {
    // HTML: Cache First para que la navegación sea INSTANTÁNEA (ilusión de app nativa)
    // Si no está en caché o hay red, actualiza en background
    event.respondWith(
      caches.match(request).then(cached => {
        const networkFetch = fetch(request, { redirect: 'follow' }).then(response => {
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
    clients.openWindow('https://ai.aberumirai.com/inventory')
  );
});