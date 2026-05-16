/**
 * MIRAI AI - Auth Guard Universal v2
 * - Sin type="module", sin defer → corre síncrono antes que todo
 * - NO depende de app.js ni de ningún otro script
 * - app.js debe tener checkAuth() que solo devuelve true (sin redirects)
 */
(function () {
    'use strict';

    var token = localStorage.getItem('mirai_auth_token');
    var dni   = localStorage.getItem('mirai_user_dni');
    var isLoggedIn = !!(token && dni);

    // Páginas de autenticación (no requieren sesión)
    var AUTH_PAGES = ['login.html', 'register.html', 'registration.html', 'verify.html'];

    // Detectar página actual de forma robusta
    var pathname = window.location.pathname;
    var segments = pathname.split('/').filter(function(s) { return s.length > 0; });
    var currentPage = segments.length > 0 ? segments[segments.length - 1] : 'index.html';

    // Si no tiene extensión, asumir que es una ruta de app (requiere auth)
    var isAuthPage = AUTH_PAGES.some(function (page) {
        return currentPage === page;
    });

    if (isAuthPage && isLoggedIn) {
        // Logueado intentando entrar a login/register → al inicio
        window.location.replace('index.html');
        return;
    }

    if (!isAuthPage && !isLoggedIn) {
        // Sin sesión intentando entrar a cualquier página de la app → al login
        window.location.replace('login.html');
        return;
    }

    // En todos los demás casos: dejar pasar sin hacer nada
})();