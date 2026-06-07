/**
 * ============================================
 * MIRAI BOOT - v2.0 DEFINITIVO
 * ============================================
 * ESTRATEGIA: Este script es el ÚNICO dueño del tema y sidebar.
 *
 * Problema raíz:
 *   - app.js usaba querySelector('.theme-toggle') → registraba listener
 *   - mirai-boot v1 usaba getElementById('theme-toggle') → registraba otro
 *   - MISMO elemento, DOS listeners opuestos → tema no cambiaba (revertía solo)
 *   - Sidebar: dataset.bootInit vs dataset.mobileInit → ambos se registraban
 *     → abría pero no cerraba (o al revés)
 *
 * Solución: cloneNode() reemplaza el elemento y borra TODOS los listeners
 * anteriores antes de registrar uno solo y limpio.
 * Usa dataset.mobileInit (el guard de app.js) para que app.js lo salte.
 *
 * INSTALACIÓN — en cada HTML protegido, PRIMER script antes de auth-guard:
 *   <script src="mirai-boot.js"></script>
 *   <script src="auth-guard.js"></script>
 *   <script type="module" src="app.js" defer></script>
 *   <script type="module" src="[pagina].js" defer></script>
 * ============================================
 */
(function () {
    'use strict';

    var THEME_KEY = 'mirai-ai-theme';

    // ── 1. TEMA INMEDIATO (evita flash blanco/negro al cargar) ───────────────
    // Resolver modo automático: si el usuario eligió 'auto', seguir al sistema
    var _savedMode = localStorage.getItem('mirai-ai-theme-mode') || 'auto';
    if (_savedMode === 'auto') {
        var _prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        localStorage.setItem(THEME_KEY, _prefersDark ? 'dark' : 'light');
    }
    var savedTheme = localStorage.getItem(THEME_KEY)
        || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', savedTheme);

    // ── 2. SINCRONIZAR ICONOS SOL / LUNA ─────────────────────────────────────
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

    // ── 3. CLONAR ELEMENTO: elimina TODOS los event listeners previos ─────────
    function cleanClone(el) {
        if (!el || !el.parentNode) return el;
        var clone = el.cloneNode(true);
        el.parentNode.replaceChild(clone, el);
        return clone;
    }

    // ── 4. BIND TEMA ──────────────────────────────────────────────────────────
    function bindTheme() {
        var btn = document.getElementById('theme-toggle')
               || document.getElementById('themeToggle')
               || document.querySelector('.theme-toggle');
        if (!btn) return;

        // Limpiar listeners previos (app.js, courses.js, inventory.js, etc.)
        btn = cleanClone(btn);

        // Guard que app.js respeta — así no vuelve a registrar
        btn.dataset.mobileInit = 'true'; // (reutilizamos para consistencia)
        btn.dataset.bootInit   = 'true';

        btn.addEventListener('click', function () {
            var current = document.documentElement.getAttribute('data-theme') || 'light';
            var next    = current === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', next);
            localStorage.setItem(THEME_KEY, next);
            syncIcons(next);
        });
    }

    // ── 5. BIND SIDEBAR ───────────────────────────────────────────────────────
    function bindSidebar() {
        var toggle   = document.querySelector('.mobile-menu-toggle');
        var sidebar  = document.querySelector('.mobile-sidebar');
        var overlay  = document.querySelector('.mobile-overlay');
        var closeBtn = document.querySelector('.close-menu');

        if (!toggle || !sidebar) return;

        // Clonar para eliminar todos los listeners previos
        toggle  = cleanClone(toggle);
        if (overlay)  overlay  = cleanClone(overlay);
        if (closeBtn) closeBtn = cleanClone(closeBtn);

        // Marcar con el guard de app.js para que no re-registre
        toggle.dataset.mobileInit = 'true';
        toggle.dataset.bootInit   = 'true';

        function openMenu() {
            sidebar.classList.add('active');
            if (overlay)  overlay.classList.add('active');
            toggle.classList.add('active');
            document.body.style.overflow = 'hidden';
        }

        function closeMenu() {
            sidebar.classList.remove('active');
            if (overlay)  overlay.classList.remove('active');
            toggle.classList.remove('active');
            document.body.style.overflow = '';
        }

        toggle.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            sidebar.classList.contains('active') ? closeMenu() : openMenu();
        });

        if (overlay)  overlay.addEventListener('click',  closeMenu);
        if (closeBtn) closeBtn.addEventListener('click', closeMenu);

        // Cerrar al navegar en mobile
        sidebar.querySelectorAll('.nav-grid-item, .sidebar-links a').forEach(function (link) {
            link.addEventListener('click', function () {
                if (window.innerWidth <= 768) closeMenu();
            });
        });
    }

    // ── 6. EJECUTAR ───────────────────────────────────────────────────────────
    function init() {
        syncIcons(document.documentElement.getAttribute('data-theme') || 'light');
        bindTheme();
        bindSidebar();
    }

    // Ejecutar al tener DOM listo
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Re-ejecutar tras load() por si app.js (module+defer) regeneró el header
    window.addEventListener('load', function () {
        var toggle = document.querySelector('.mobile-menu-toggle');
        var btn    = document.getElementById('theme-toggle')
                  || document.getElementById('themeToggle')
                  || document.querySelector('.theme-toggle');

        // Solo re-bindear si el guard fue perdido (DOM regenerado)
        if (toggle && toggle.dataset.mobileInit !== 'true') bindSidebar();
        if (btn    && btn.dataset.bootInit !== 'true')       bindTheme();

        syncIcons(document.documentElement.getAttribute('data-theme') || 'light');
    });

})();