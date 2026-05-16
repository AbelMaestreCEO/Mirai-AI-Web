/**
 * MIRAI AI - Login Guard
 *
 * INSTRUCCIONES DE USO:
 * - Poner SOLO en login.html (antes de login.js)
 * - NO poner en ninguna otra página
 *
 * Comportamiento: si ya hay sesión activa → redirige a index.html
 */
(function () {
    'use strict';

    var token = localStorage.getItem('mirai_auth_token');
    var dni   = localStorage.getItem('mirai_user_dni');

    if (token && dni) {
        window.location.replace('index.html');
    }
})();