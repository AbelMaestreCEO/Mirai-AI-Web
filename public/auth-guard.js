/**
 * MIRAI AI - Auth Guard Universal v6 (cookie-based)
 *
 * INSTRUCCIONES DE USO:
 * - Poner SOLO en páginas protegidas de la app (index, inventory, classroom, etc.)
 * - NO poner en: login, registration, verify
 *
 * Comportamiento: si no hay sesión válida en cookie → redirige a login
 * Expone window.miraiUser = { dni, name, role } para uso en la app
 * Expone window.miraiUserReady (Promise) para que otros scripts esperen la autenticación
 */
window.miraiUserReady = (async function () {
    'use strict';
    // Solo 401/403/404 significan "no hay sesión válida" (/api/me da 404 si el
    // usuario ya no existe). Un 5xx o la falta de red (app Android abierta sin
    // conexión) no dicen nada de la sesión: antes también mandaban al login y la
    // app sin internet acababa siempre ahí aunque la sesión siguiera abierta.
    // En ese caso se queda en la página y window.miraiUser queda sin definir.
    var res;
    try {
        res = await fetch('/api/me', { credentials: 'same-origin' });
    } catch (e) {
        console.warn('[auth-guard] Sin conexión: no se pudo comprobar la sesión.', e);
        return;
    }
    if (res.status === 401 || res.status === 403 || res.status === 404) {
        window.location.replace('login');
        return;
    }
    if (!res.ok) {
        console.warn('[auth-guard] /api/me respondió ' + res.status + '; no se redirige al login.');
        return;
    }
    try {
        window.miraiUser = await res.json();
    } catch (e) {
        console.warn('[auth-guard] Respuesta de /api/me no válida.', e);
    }
})();
