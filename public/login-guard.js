/**
 * MIRAI AI - Login Guard (cookie-based)
 *
 * INSTRUCCIONES DE USO:
 * - Poner SOLO en login (antes de login.js)
 * - NO poner en ninguna otra página
 *
 * Comportamiento: si ya hay sesión activa → redirige a index
 */
(async function () {
    'use strict';
    try {
        var res = await fetch('/api/me', { credentials: 'same-origin' });
        if (res.ok) {
            window.location.replace('/');
        }
    } catch (e) {
        // No session — stay on login
    }
})();
