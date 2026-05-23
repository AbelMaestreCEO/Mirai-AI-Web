/**
 * MIRAI AI - Auth Guard Universal v4
 *
 * INSTRUCCIONES DE USO:
 * - Poner SOLO en páginas protegidas de la app (index, inventory, classroom, etc.)
 * - NO poner en: login, registration, verify
 *
 * Comportamiento: si no hay sesión → redirige a login
 */
(function () {
    'use strict';

    var dni = localStorage.getItem('mirai_user_dni');

    if (!dni) {
        window.location.replace('login');
    }
})();