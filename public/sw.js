const CACHE_NAME = 'mirai-ai-v240'; // 👈 Cambia esto en cada deploy

// ─── Páginas HTML a precargar ────────────────────────────────────────────────
const HTML_PAGES = [
  '/about',
  '/apa',
  '/attendance_admin',
  '/attendance',
  '/chat',
  '/classroom',
  '/classroom_admin',
  '/classroom_details',
  '/code',
  '/course_category',
  '/courses',
  '/diet',
  '/format',
  '/generation',
  '/',
  '/inventory',
  '/investigation',
  '/learning_hub',
  '/location',
  '/login',
  '/mirror',
  '/panel',
  '/projects',
  '/registration',
  '/report',
  '/report_admin',
  '/settings',
  '/task',
  '/verify',
];

// ─── Assets estáticos a precargar ───────────────────────────────────────────
const STATIC_ASSETS = [
  '/login-styles.css',
  '/styles.css',
  '/transitions.css',
  '/welcome-styles.css',
  
  '/manifest.json',
  
  '/js/apa/abstract.js',
  '/app.js',
  '/js/app.js',
  '/app-mirror.js',
  '/attendance.js',
  '/attendance_admin.js',
  '/auth-guard.js',
  '/js/apa/citations.js',
  '/classroom.js',
  '/classroom_admin.js',
  '/classroom_details.js',
  '/js/api/client.js',
  '/code.js',
  '/js/utils/constants.js',
  '/courses.js',
  '/js/processors/docxReader.js',
  '/js/processors/docxWriter.js',
  '/js/apa/figures.js',
  '/js/fileHandler.js',
  '/format.js',
  '/generation.js',
  '/js/apa/headers.js',
  '/inventory.js',
  '/investigation.js',
  '/location.js',
  '/login-guard.js',
  '/js/apa/margins.js',
  '/login.js',
  '/mirai-boot.js',
  '/mirai-realtime.js',
  '/js/utils/notifications.js',
  '/js/apa/pageNumbers.js',
  '/js/apa/paragraphs.js',
  '/projects.js',
  '/js/apa/references.js',
  '/registration.js',
  '/report.js',
  '/report_admin.js',
  '/js/apa/spacing.js',
  '/js/apa/tables.js',
  '/task.js',
  '/js/utils/themeManager.js',
  '/js/apa/titlePage.js',
  '/transitions.js',
  '/js/apa/typography.js',
  '/js/uiHandler.js',
  '/js/utils/validators.js',
  '/verify.js',
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