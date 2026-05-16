/**
 * MIRAI AI - Auth Guard Universal v4
 *
 * INSTRUCCIONES DE USO:
 * - Poner SOLO en páginas protegidas de la app (index, inventory, classroom, etc.)
 * - NO poner en: login.html, registration.html, verify.html
 *
 * Comportamiento: si no hay sesión → redirige a login.html
 */
(function () {
    'use strict';

    var dni = localStorage.getItem('mirai_user_dni');

    if (!dni) {
        window.location.replace('login.html');
    }
})();