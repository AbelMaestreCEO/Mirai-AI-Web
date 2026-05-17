/**
 * ============================================
 * MIRAI BOOT - v1.0 - Script Universal de Arranque
 * ============================================
 * PROPÓSITO: Garantizar tema y sidebar en TODAS las páginas,
 * sin importar si MiraiApp (app.js) carga o no.
 *
 * INSTRUCCIONES:
 * Incluir como PRIMER script (sin defer, sin module) en cada
 * página protegida, ANTES de auth-guard.js y app.js:
 *
 *   <script src="mirai-boot.js"></script>
 *   <script src="auth-guard.js"></script>
 *   <script type="module" src="app.js" defer></script>
 *   ...
 *
 * NO incluir en: login.html, registration.html, verify.html
 * ============================================
 */
(function () {
    'use strict';

    var THEME_KEY = 'mirai-ai-theme'; // Clave ÚNICA y universal

    // ── 1. APLICAR TEMA INMEDIATAMENTE (evita flash) ──────────────────────────
    var saved = localStorage.getItem(THEME_KEY);
    if (!saved) {
        saved = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    document.documentElement.setAttribute('data-theme', saved);

    // ── 2. SINCRONIZAR ICONOS SOL/LUNA ────────────────────────────────────────
    function syncIcons(theme) {
        var sun  = document.querySelector('.sun-icon');
        var moon = document.querySelector('.moon-icon');
        if (!sun || !moon) return;
        if (theme === 'dark') {
            sun.classList.add('hidden');
            moon.classList.remove('hidden');
        } else {
            sun.classList.remove('hidden');
            moon.classList.add('hidden');
        }
    }

    // ── 3. TOGGLE DE TEMA (cualquier id o clase) ──────────────────────────────
    function bindThemeToggle() {
        // Soporta: id="theme-toggle", class="theme-toggle", id="themeToggle"
        var btn = document.getElementById('theme-toggle')
               || document.getElementById('themeToggle')
               || document.querySelector('.theme-toggle');

        if (!btn || btn.dataset.bootInit === 'true') return;
        btn.dataset.bootInit = 'true';

        btn.addEventListener('click', function () {
            var current = document.documentElement.getAttribute('data-theme') || 'light';
            var next    = current === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', next);
            localStorage.setItem(THEME_KEY, next);
            syncIcons(next);
        });
    }

    // ── 4. SIDEBAR / MENÚ MÓVIL ───────────────────────────────────────────────
    function bindSidebar() {
        var toggle  = document.querySelector('.mobile-menu-toggle');
        var sidebar = document.querySelector('.mobile-sidebar');
        var overlay = document.querySelector('.mobile-overlay');
        var closeBtn= document.querySelector('.close-menu');

        if (!toggle || !sidebar) return;
        if (toggle.dataset.bootInit === 'true') return; // evitar doble bind
        toggle.dataset.bootInit = 'true';

        function openMenu() {
            sidebar.classList.add('active');
            if (overlay) overlay.classList.add('active');
            toggle.classList.add('active');
            document.body.style.overflow = 'hidden';
        }

        function closeMenu() {
            sidebar.classList.remove('active');
            if (overlay) overlay.classList.remove('active');
            toggle.classList.remove('active');
            document.body.style.overflow = '';
        }

        function toggleMenu() {
            sidebar.classList.contains('active') ? closeMenu() : openMenu();
        }

        toggle.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            toggleMenu();
        });

        if (overlay)  overlay.addEventListener('click',  closeMenu);
        if (closeBtn) closeBtn.addEventListener('click', closeMenu);

        // Cerrar al navegar (mobile)
        var links = sidebar.querySelectorAll('.nav-grid-item, .sidebar-links a');
        links.forEach(function (link) {
            link.addEventListener('click', function () {
                if (window.innerWidth <= 768) closeMenu();
            });
        });
    }

    // ── 5. INICIALIZAR AL CARGAR DOM ──────────────────────────────────────────
    function onDOMReady() {
        syncIcons(document.documentElement.getAttribute('data-theme') || 'light');
        bindThemeToggle();
        bindSidebar();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', onDOMReady);
    } else {
        onDOMReady();
    }

    // ── 6. RE-BIND TRAS app.js (por si app.js reemplaza elementos) ────────────
    // Escucha el evento que MiraiApp puede disparar al terminar de montar el DOM
    window.addEventListener('load', function () {
        bindThemeToggle();
        bindSidebar();
    });

})();