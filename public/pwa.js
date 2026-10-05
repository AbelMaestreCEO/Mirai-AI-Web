/* ============================================================
   MIRAI AI — Registro del Service Worker
   Se carga en todas las páginas (junto al <link rel="manifest">)
   para que la PWA/TWA tenga el SW activo desde la primera página
   que se abra, no solo desde /chat. notifications.js espera a
   navigator.serviceWorker.ready para suscribirse a push.
   ============================================================ */
if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
        navigator.serviceWorker.register('/sw.js').catch(function (e) {
            console.warn('[PWA] No se pudo registrar el Service Worker:', e);
        });
    });
}
