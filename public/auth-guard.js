/**
 * ============================================
 * MIRAI AI - Auth Guard Universal
 * Incluir como PRIMER script en TODAS las páginas (antes que app.js)
 * NO usar type="module" para que corra de forma síncrona e inmediata
 * ============================================
 */
(function () {
    'use strict';

    var token = localStorage.getItem('mirai_auth_token');
    var dni   = localStorage.getItem('mirai_user_dni');
    var isLoggedIn = !!(token && dni);

    // Páginas donde el usuario NO debe estar si ya inició sesión
    var AUTH_PAGES = ['login.html', 'register.html', 'registration.html', 'verify.html'];

    // Páginas que REQUIEREN sesión activa (todas las demás)
    // login/register/verify son las únicas que NO la requieren

    var currentPath = window.location.pathname;
    var currentPage = currentPath.split('/').pop() || 'index.html';

    var isAuthPage = AUTH_PAGES.some(function (page) {
        return currentPage === page || currentPath.endsWith('/' + page);
    });

    if (isAuthPage) {
        // Estás en login/register/verify
        if (isLoggedIn) {
            // Ya tienes sesión → llévame al inicio
            window.location.replace('index.html');
        }
        // Sin sesión → deja pasar normalmente
    } else {
        // Estás en cualquier página de la app
        if (!isLoggedIn) {
            // Sin sesión → llévame al login
            window.location.replace('login.html');
        }
        // Con sesión → deja pasar normalmente
    }
})();