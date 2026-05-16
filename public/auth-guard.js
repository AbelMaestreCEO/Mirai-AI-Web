/**
 * MIRAI AI - Auth Guard Universal v3
 * - Sin type="module", sin defer → corre síncrono antes que todo
 * - Protección anti-bucle integrada
 */
(function () {
    'use strict';

    // ── Protección anti-bucle ──────────────────────────────────────────────
    // Si ya redirigimos hace menos de 2 segundos, no volver a redirigir.
    var lastRedirect = parseInt(sessionStorage.getItem('_guard_redirect') || '0', 10);
    var now = Date.now();
    if (now - lastRedirect < 2000) {
        // Demasiados redirects seguidos → limpiar y dejar pasar
        sessionStorage.removeItem('_guard_redirect');
        return;
    }

    var token = localStorage.getItem('mirai_auth_token');
    var dni   = localStorage.getItem('mirai_user_dni');
    var isLoggedIn = !!(token && dni);

    // Páginas de autenticación (no requieren sesión activa)
    var AUTH_PAGES = ['login.html', 'register.html', 'registration.html', 'verify.html'];

    // Detectar página actual de forma robusta
    var pathname = window.location.pathname;
    var segments = pathname.split('/').filter(function(s) { return s.length > 0; });
    var currentPage = segments.length > 0 ? segments[segments.length - 1] : '';

    var isAuthPage = AUTH_PAGES.some(function (page) {
        return currentPage === page;
    });

    function redirect(url) {
        sessionStorage.setItem('_guard_redirect', String(Date.now()));
        window.location.replace(url);
    }

    if (isAuthPage && isLoggedIn) {
        // Logueado intentando entrar a login/register → al inicio
        redirect('index.html');
        return;
    }

    if (!isAuthPage && !isLoggedIn) {
        // Sin sesión en página protegida → al login
        redirect('login.html');
        return;
    }

    // Dejar pasar sin hacer nada
})();