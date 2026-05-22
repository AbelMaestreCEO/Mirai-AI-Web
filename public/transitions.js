/* ============================================================
   transitions.js — Mirai AI PWA Native Feel
   Incluir antes del </body> en TODAS las páginas
   ============================================================ */

(() => {
  'use strict';

  // ─── CONFIGURACIÓN ────────────────────────────────────────
  const CONFIG = {
    minLoaderMs:    350,   // Tiempo mínimo que se muestra el overlay (ms)
    exitDurationMs: 220,   // Debe coincidir con transition de .page-exit en CSS
    reducedMotion:  window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  };

  // ─── CREAR OVERLAY EN EL DOM ──────────────────────────────
  // Se inyecta una sola vez, antes de cualquier navegación
  function createOverlay() {
    if (document.getElementById('transition-overlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'transition-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = '<div class="spinner"></div>';
    document.body.appendChild(overlay);
  }

  // ─── MOSTRAR / OCULTAR OVERLAY ────────────────────────────
  function showOverlay() {
    const overlay = document.getElementById('transition-overlay');
    if (overlay) overlay.classList.add('overlay-visible');
  }

  function hideOverlay() {
    const overlay = document.getElementById('transition-overlay');
    if (overlay) overlay.classList.remove('overlay-visible');
  }

  // ─── ANIMACIÓN DE ENTRADA (página destino) ────────────────
  // Se ejecuta cuando esta página termina de cargar
  function pageEnter() {
    if (CONFIG.reducedMotion) {
      document.documentElement.classList.add('page-ready');
      hideOverlay();
      return;
    }

    // Tiempo que tardó en cargar desde que se hizo clic
    const elapsed = performance.now() - (window.__transitionStart || performance.now());
    const remaining = Math.max(0, CONFIG.minLoaderMs - elapsed);

    // Si cargó muy rápido (caché), respeta el mínimo visual para
    // que la transición no se sienta como un parpadeo
    setTimeout(() => {
      hideOverlay();
      // Pequeño frame para que el browser pinte antes del fade-in
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          document.documentElement.classList.add('page-ready');
        });
      });
    }, remaining);
  }

  // ─── ANIMACIÓN DE SALIDA (página actual) ──────────────────
  // Se ejecuta cuando el usuario hace clic en un link
  function pageExit(callback) {
    if (CONFIG.reducedMotion) {
      callback();
      return;
    }

    showOverlay();
    document.documentElement.classList.add('page-exit');

    setTimeout(callback, CONFIG.exitDurationMs);
  }

  // ─── INTERCEPTAR CLICKS EN LINKS ─────────────────────────
  function interceptLinks() {
    document.addEventListener('click', event => {

      // Busca el <a> más cercano al elemento clickeado
      const anchor = event.target.closest('a');
      if (!anchor) return;

      const href = anchor.getAttribute('href');
      if (!href) return;

      // ── Ignorar estos casos ──────────────────────────────
      // Links externos
      if (anchor.hostname && anchor.hostname !== location.hostname) return;
      // Links que abren en otra pestaña
      if (anchor.target === '_blank') return;
      // Anclas en la misma página (#seccion)
      if (href.startsWith('#')) return;
      // Links con modificadores de teclado (Ctrl+clic, Cmd+clic)
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      // Links mailto: y tel:
      if (href.startsWith('mailto:') || href.startsWith('tel:')) return;
      // Links javascript:
      if (href.startsWith('javascript:')) return;
      // Ya estamos en esa página
      if (anchor.href === location.href) return;

      // ── Navegar con transición ───────────────────────────
      event.preventDefault();

      // Guardar timestamp para calcular el tiempo de carga en destino
      window.__transitionStart = performance.now();
      // Pasar el timestamp a la siguiente página via sessionStorage
      try {
        sessionStorage.setItem('__transitionStart', String(performance.now()));
      } catch (_) {}

      pageExit(() => {
        location.href = anchor.href;
      });
    });
  }

  // ─── RECUPERAR TIMESTAMP ENTRE PÁGINAS ───────────────────
  // Cuando la página destino carga, recupera cuándo se hizo clic
  function restoreTransitionStart() {
    try {
      const stored = sessionStorage.getItem('__transitionStart');
      if (stored) {
        window.__transitionStart = parseFloat(stored);
        sessionStorage.removeItem('__transitionStart');
      }
    } catch (_) {}
  }

  // ─── MANEJAR BOTÓN ATRÁS / ADELANTE ──────────────────────
  // El browser restaura páginas desde bfcache — necesitamos
  // mostrarlas correctamente sin el overlay
  window.addEventListener('pageshow', event => {
    if (event.persisted) {
      // Página restaurada desde back-forward cache
      document.documentElement.classList.remove('page-exit');
      hideOverlay();
      document.documentElement.classList.add('page-ready');
    }
  });

  // ─── INICIALIZACIÓN ───────────────────────────────────────
  function init() {
    restoreTransitionStart();
    createOverlay();
    interceptLinks();

    // Disparar entrada cuando el DOM esté listo
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', pageEnter);
    } else {
      // DOMContentLoaded ya ocurrió (script cargado con defer o al final del body)
      pageEnter();
    }
  }

  init();

})();