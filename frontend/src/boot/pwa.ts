// Registra el service worker (public/sw.js): caché para abrir sin conexión y
// notificaciones push. Antes lo hacía public/pwa.js en cada página.
import { defineBoot } from '#q-app';

export default defineBoot(() => {
  // En `quasar dev` no hay sw.js: lo sirve Workers Assets desde public/.
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  const register = () =>
    navigator.serviceWorker.register('/sw.js').catch((e: unknown) => console.warn('[PWA] No se pudo registrar el Service Worker:', e));
  if (document.readyState === 'complete') void register();
  else window.addEventListener('load', () => void register(), { once: true });
});
