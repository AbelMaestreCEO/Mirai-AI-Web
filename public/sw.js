const CACHE_NAME = 'mirai-ai-v57'; // 👈 Cambia esto en cada deploy

const urlsToCache = [
  '/',
  '/index.html',
  '/styles.css',
  '/app.js',
  '/manifest.json'
];

// Instalación: Cachear recursos estáticos
self.addEventListener('install', event => {
  event.waitUntil(
  caches.open(CACHE_NAME).then(cache => {
    // Solo cachear GET requests
    if (event.request.method !== 'GET') return;
    return cache.put(event.request, response);
  })
);
  // Forzar activación inmediata sin esperar que cierren las pestañas
  self.skipWaiting();
});

// Activación: Limpiar cachés antiguas y tomar control de inmediato
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames =>
      Promise.all(
        cacheNames
          .filter(cacheName => cacheName !== CACHE_NAME)
          .map(cacheName => {
            console.log('Eliminando caché antigua:', cacheName);
            return caches.delete(cacheName);
          })
      )
    ).then(() => self.clients.claim()) // 👈 Toma control de todas las pestañas abiertas
  );
});

// Fetch: Network First para HTML, Cache First para assets estáticos
self.addEventListener('fetch', event => {

  if (!event.request) return;
  if (event.request.method !== 'GET') return;

  const { request } = event;
  const url = new URL(request.url);
  
  // Solo manejar requests del mismo origen
  if (url.origin !== location.origin) {
    return;
  }

  // HTML: siempre intentar red primero (detecta actualizaciones)
  if (request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          return response;
        })
        .catch(() => caches.match(request)) // Fallback a caché si no hay red
    );
    return;
  }

  // CSS, JS, imágenes: Cache First con actualización en background
  event.respondWith(
    caches.match(request).then(cached => {
      const networkFetch = fetch(request).then(response => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
        return response;
      });
      return cached || networkFetch;
    })
  );
});

// Push notifications
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