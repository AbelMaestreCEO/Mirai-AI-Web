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
    try {
        var res = await fetch('/api/me', { credentials: 'same-origin' });
        if (!res.ok) {
            window.location.replace('login');
            return;
        }
        window.miraiUser = await res.json();
    } catch (e) {
        window.location.replace('login');
    }
})();
