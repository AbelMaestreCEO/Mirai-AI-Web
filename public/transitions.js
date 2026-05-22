/* ============================================================
   transitions.js — Mirai AI PWA Native Feel
   Incluir antes del </body> en TODAS las páginas
   ============================================================ */

(() => {
  'use strict';

  // ─── CONFIGURACIÓN ────────────────────────────────────────
  const CONFIG = {
    minLoaderMs:    300,   // Mínimo visual del overlay (evita parpadeo)
    exitDurationMs: 190,   // Debe coincidir con transition de .page-exit en CSS
    reducedMotion:  window.matchMedia('(prefers-reduced-motion: reduce)').matches
                    || document.documentElement.classList.contains('reduce-motion'),
  };

  // ─── CREAR OVERLAY ────────────────────────────────────────
  function createOverlay() {
    if (document.getElementById('transition-overlay')) return;
    const overlay = document.createElement('div');
    overlay.id = 'transition-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = '<div class="t-spinner"></div>';
    document.body.appendChild(overlay);
  }

  function showOverlay() {
    document.getElementById('transition-overlay')?.classList.add('overlay-visible');
  }

  function hideOverlay() {
    document.getElementById('transition-overlay')?.classList.remove('overlay-visible');
  }

  // ─── ENTRADA ──────────────────────────────────────────────
  // FIX: usa Date.now() (comparable entre páginas) en lugar de
  // performance.now() (que se reinicia en cada documento)
  function pageEnter() {
    if (CONFIG.reducedMotion) {
      document.documentElement.classList.add('page-ready');
      hideOverlay();
      return;
    }

    // Recuperar cuándo se hizo el clic (timestamp absoluto)
    let clickedAt = 0;
    try {
      const stored = sessionStorage.getItem('__t_click');
      if (stored) {
        clickedAt = parseInt(stored, 10);
        sessionStorage.removeItem('__t_click');
      }
    } catch (_) {}

    // Tiempo que ya pasó desde el clic hasta ahora
    const elapsed  = clickedAt ? (Date.now() - clickedAt) : CONFIG.minLoaderMs;
    // Cuánto falta para cumplir el mínimo visual (puede ser 0)
    const waitMore = Math.max(0, CONFIG.minLoaderMs - elapsed);

    setTimeout(() => {
      hideOverlay();
      // Doble rAF: asegura que el browser pinte antes de hacer fade-in
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          document.documentElement.classList.add('page-ready');
        });
      });
    }, waitMore);
  }

  // ─── SALIDA ───────────────────────────────────────────────
  function pageExit(href) {
    if (CONFIG.reducedMotion) {
      location.href = href;
      return;
    }

    // Guardar el momento del clic con Date.now() (absoluto, comparable entre páginas)
    try { sessionStorage.setItem('__t_click', String(Date.now())); } catch (_) {}

    showOverlay();
    document.documentElement.classList.add('page-exit');

    setTimeout(() => { location.href = href; }, CONFIG.exitDurationMs);
  }

  // ─── INTERCEPTAR LINKS ────────────────────────────────────
  function interceptLinks() {
    document.addEventListener('click', e => {

      const anchor = e.target.closest('a');
      if (!anchor) return;

      const href = anchor.getAttribute('href');
      if (!href) return;

      // Ignorar casos que no deben animarse
      if (anchor.target === '_blank')                          return;
      if (href.startsWith('#'))                                return;
      if (href.startsWith('mailto:') || href.startsWith('tel:')) return;
      if (href.startsWith('javascript:'))                      return;
      if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey)   return;
      if (anchor.hostname && anchor.hostname !== location.hostname) return;
      if (anchor.href === location.href)                       return;

      e.preventDefault();
      pageExit(anchor.href);
    });
  }

  // ─── BOTÓN ATRÁS / ADELANTE (bfcache) ────────────────────
  // Cuando el browser restaura una página desde bfcache,
  // el DOMContentLoaded no se dispara — manejarlo aquí
  window.addEventListener('pageshow', e => {
    if (e.persisted) {
      document.documentElement.classList.remove('page-exit');
      hideOverlay();
      // Sin animación — la página ya estaba lista
      document.documentElement.classList.add('page-ready');
    }
  });

  // ─── SAFETY NET ───────────────────────────────────────────
  // Si algo falla (JS bloqueado, error, timeout), mostrar la página
  // después de 2s para que nunca se quede en blanco
  const safetyTimer = setTimeout(() => {
    document.documentElement.classList.add('page-ready');
    hideOverlay();
  }, 2000);

  // ─── INIT ─────────────────────────────────────────────────
  function init() {
    createOverlay();
    interceptLinks();

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        clearTimeout(safetyTimer);
        pageEnter();
      });
    } else {
      clearTimeout(safetyTimer);
      pageEnter();
    }
  }

  init();

})();