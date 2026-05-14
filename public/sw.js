const CACHE_NAME = 'mirai-ai-v1';
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
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
});

// Activación: Limpiar cachés antiguas
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// Fetch: Servir desde caché si está disponible, sino de la red
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          return response;
        }
        return fetch(event.request);
      }
    )
  );
});

// En sw.js
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.notification?.title || 'Mirai AI';
  const body = data.notification?.body || 'Tienes una nueva notificación.';
  const icon = data.notification?.icon || '/icon.png';

  event.waitUntil(
    self.registration.showNotification(title, {
      body: body,
      icon: icon,
      badge: '/badge.png',
      tag: 'inventory-alert',
      requireInteraction: true
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow('https://ai.aberumirai.com/inventory.html')
  );
});