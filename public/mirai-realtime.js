/**
 * mirai-realtime.js
 * ─────────────────────────────────────────────────────────────────
 * Sistema de sincronización en tiempo real para Mirai AI.
 * Polling inteligente con Visibility API — sin WebSockets ni SSE.
 *
 * MÓDULOS SOPORTADOS (mapeados al schema D1 real):
 *   'inventory'   → inventory_products, inventory_logs
 *   'classroom'   → sections, section_students, assignments, submissions
 *   'attendance'  → att_records, att_qr_sessions, att_classes
 *   'diet'        → diet_data, diet_history
 *   'tasks'       → tasks
 *   'location'    → location_markers
 *   'courses'     → courses, lessons, categories
 *   'reports'     → reports, report_submissions
 *   'chat'        → conversations, messages
 *   'generation'  → gen_history
 *
 * El polling consulta TODOS los módulos siempre. Los cambios para módulos
 * sin suscriptores se almacenan en sessionStorage y se entregan cuando
 * la página del módulo se carga y llama subscribe().
 *
 * USO:
 *   const rt = window.MiraiRealtime.getInstance();
 *   rt.subscribe('classroom', (changes) => handleChanges(changes));
 *   rt.start();
 * ─────────────────────────────────────────────────────────────────
 */

const POLL_INTERVAL_ACTIVE = 5_000;
const POLL_INTERVAL_HIDDEN = 60_000;
const POLL_INTERVAL_FOCUS  = 2_000;
const POLL_ENDPOINT        = '/api/sync/poll';
const TS_STORAGE_KEY       = 'mirai-rt-last-ts';
const PENDING_STORAGE_KEY  = 'mirai-rt-pending';

const ALL_MODULES = [
  'inventory', 'classroom', 'attendance', 'diet', 'tasks',
  'location', 'courses', 'reports', 'chat', 'generation'
];

class MiraiRealtimeEngine {
  #subscribers = new Map();  // module → Set<callback>
  #timer       = null;
  #lastTs      = null;
  #running     = false;
  #hidden      = false;
  #focusBurst  = 0;

  constructor() {
    const stored = sessionStorage.getItem(TS_STORAGE_KEY);
    this.#lastTs = stored || new Date(Date.now() - 30_000).toISOString();

    document.addEventListener('visibilitychange', () => {
      this.#hidden = document.hidden;
      if (!document.hidden && this.#running) {
        this.#focusBurst = 3;
        this.#doPoll();
        this.#resetTimer();
      }
    });

    this.#createIndicator();
  }

  // ── API PÚBLICA ────────────────────────────────────────────────

  subscribe(module, callback) {
    if (!this.#subscribers.has(module)) {
      this.#subscribers.set(module, new Set());
    }
    this.#subscribers.get(module).add(callback);

    // Entregar cambios pendientes acumulados mientras esta página no estaba cargada
    this.#deliverPending(module);

    return () => this.#subscribers.get(module)?.delete(callback);
  }

  start() {
    if (this.#running) return;
    this.#running = true;
    this.#setIndicator('active');
    this.#doPoll();
    this.#resetTimer();
    console.log('[MiraiRT] ▶ Iniciado — suscriptores:', [...this.#subscribers.keys()].join(', ') || '(ninguno, polling global)');
  }

  stop() {
    this.#running = false;
    clearInterval(this.#timer);
    this.#timer = null;
    this.#setIndicator('off');
  }

  async forceRefresh() {
    await this.#doPoll();
  }

  // ── INTERNOS ───────────────────────────────────────────────────

  #resetTimer() {
    clearInterval(this.#timer);
    let interval;
    if (this.#focusBurst > 0) {
      interval = POLL_INTERVAL_FOCUS;
    } else {
      interval = this.#hidden ? POLL_INTERVAL_HIDDEN : POLL_INTERVAL_ACTIVE;
    }
    this.#timer = setInterval(() => {
      if (this.#focusBurst > 0) {
        this.#focusBurst--;
        if (this.#focusBurst === 0) this.#resetTimer();
      }
      this.#doPoll();
    }, interval);
  }

  async #doPoll() {
    if (!this.#running) return;

    const userDni  = window.miraiUser?.dni;
    const userRole = window.miraiUser?.role;
    if (!userDni) return;

    this.#setIndicator('syncing');

    try {
      const params = new URLSearchParams({
        since:   this.#lastTs,
        modules: ALL_MODULES.join(','),
        role:    userRole || 'student'
      });

      const res = await fetch(`${POLL_ENDPOINT}?${params}`, {
        credentials: 'same-origin',
        headers: { 'Cache-Control': 'no-cache' }
      });

      if (!res.ok) {
        if (res.status === 401) { this.stop(); return; }
        this.#setIndicator('error');
        return;
      }

      const { ts, changes } = await res.json();

      if (ts) {
        this.#lastTs = ts;
        sessionStorage.setItem(TS_STORAGE_KEY, ts);
      }

      let hasChanges = false;

      if (changes) {
        for (const [module, data] of Object.entries(changes)) {
          const isEmpty = Array.isArray(data)
            ? data.length === 0
            : Object.values(data).every(v => Array.isArray(v) ? v.length === 0 : !v);

          if (isEmpty) continue;
          hasChanges = true;

          const subs = this.#subscribers.get(module);
          if (subs && subs.size > 0) {
            subs.forEach(cb => {
              try { cb(data); }
              catch (e) { console.error(`[MiraiRT] Error en '${module}':`, e); }
            });
          } else {
            // Sin suscriptores activos → guardar para cuando la página se cargue
            this.#queuePending(module, data);
          }
        }
      }

      this.#setIndicator(hasChanges ? 'updated' : 'active');

    } catch (err) {
      if (err.name !== 'TypeError') {
        console.warn('[MiraiRT] Error de poll:', err.message);
      }
      this.#setIndicator('error');
    }
  }

  // ── PENDING CHANGES (sessionStorage) ───────────────────────────

  #getPendingStore() {
    try {
      return JSON.parse(sessionStorage.getItem(PENDING_STORAGE_KEY) || '{}');
    } catch { return {}; }
  }

  #savePendingStore(store) {
    try {
      sessionStorage.setItem(PENDING_STORAGE_KEY, JSON.stringify(store));
    } catch { /* storage full — discard silently */ }
  }

  #queuePending(module, data) {
    const store = this.#getPendingStore();
    if (!store[module]) {
      store[module] = [];
    }
    store[module].push(data);
    // Máximo 20 entradas pendientes por módulo para no saturar storage
    if (store[module].length > 20) {
      store[module] = store[module].slice(-20);
    }
    this.#savePendingStore(store);
    console.log(`[MiraiRT] Cambio en '${module}' guardado (sin suscriptores activos)`);
  }

  #deliverPending(module) {
    const store = this.#getPendingStore();
    const pending = store[module];
    if (!pending || pending.length === 0) return;

    const subs = this.#subscribers.get(module);
    if (!subs || subs.size === 0) return;

    console.log(`[MiraiRT] Entregando ${pending.length} cambio(s) pendiente(s) para '${module}'`);

    // Entregar cada cambio acumulado
    for (const data of pending) {
      subs.forEach(cb => {
        try { cb(data); }
        catch (e) { console.error(`[MiraiRT] Error entregando pendiente '${module}':`, e); }
      });
    }

    // Limpiar pendientes de este módulo
    delete store[module];
    this.#savePendingStore(store);
  }

  // ── INDICADOR VISUAL ───────────────────────────────────────────

  #createIndicator() {
    if (document.getElementById('mirai-rt-indicator')) return;
    const el = document.createElement('div');
    el.id = 'mirai-rt-indicator';
    el.innerHTML = `<span id="mirai-rt-dot"></span><span id="mirai-rt-label">En vivo</span>`;
    el.style.cssText = `
      position:fixed; bottom:1.2rem; right:1.2rem;
      display:flex; align-items:center; gap:0.4rem;
      font-size:0.7rem; color:var(--text-secondary,#aaa);
      opacity:0; transition:opacity 0.4s;
      z-index:9999; pointer-events:none; user-select:none;
    `;
    document.addEventListener('DOMContentLoaded', () => document.body.appendChild(el));
    if (document.body) document.body.appendChild(el);
  }

  #setIndicator(state) {
    const dot   = document.getElementById('mirai-rt-dot');
    const label = document.getElementById('mirai-rt-label');
    const wrap  = document.getElementById('mirai-rt-indicator');
    if (!dot || !wrap) return;

    const states = {
      active:  { color: '#22c55e', text: 'En vivo',       opacity: '0',   anim: '' },
      syncing: { color: '#6c63ff', text: 'Sincronizando', opacity: '1',   anim: 'rt-pulse 0.8s ease-in-out infinite alternate' },
      updated: { color: '#22c55e', text: '✓ Actualizado', opacity: '1',   anim: '' },
      error:   { color: '#ef4444', text: 'Sin conexión',  opacity: '1',   anim: '' },
      off:     { color: '#888',    text: 'Desconectado',  opacity: '0',   anim: '' },
    };

    const s = states[state] || states.active;
    dot.style.cssText = `
      width:7px; height:7px; border-radius:50%;
      background:${s.color}; flex-shrink:0;
      animation:${s.anim};
    `;
    if (label) label.textContent = s.text;
    wrap.style.opacity = s.opacity;

    if (state === 'updated') {
      clearTimeout(this._hideTimer);
      this._hideTimer = setTimeout(() => {
        if (wrap) wrap.style.opacity = '0';
      }, 3000);
    }
  }
}

// ── Singleton ─────────────────────────────────────────────────────
const _getInstance = (() => {
  let _instance = null;
  return () => {
    if (!_instance) _instance = new MiraiRealtimeEngine();
    return _instance;
  };
})();

function flashElement(el) {
  if (!el) return;
  el.classList.remove('rt-updated');
  void el.offsetWidth;
  el.classList.add('rt-updated');
  setTimeout(() => el.classList.remove('rt-updated'), 2000);
}

function showToast(message, duration = 4000) {
  if (typeof window.showNotification === 'function') { window.showNotification(message); return; }
  if (typeof window.showToast === 'function') { window.showToast(message); return; }
  const toast = document.createElement('div');
  toast.textContent = message;
  toast.style.cssText = `
    position:fixed;bottom:3.5rem;right:1.2rem;
    background:var(--glass-bg,rgba(30,30,40,0.95));
    border:1px solid var(--glass-border,rgba(255,255,255,0.1));
    color:var(--text-primary,#fff);padding:0.6rem 1rem;
    border-radius:0.6rem;font-size:0.82rem;z-index:10000;
    backdrop-filter:blur(12px);animation:rt-toast-in 0.3s ease;max-width:280px;
  `;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), duration);
}

// Auto-iniciar polling global cuando el usuario esté autenticado
if (window.miraiUserReady) {
  window.miraiUserReady.then(() => {
    if (window.miraiUser?.dni) {
      const rt = _getInstance();
      rt.start();
    }
  });
}

window.MiraiRealtime = { getInstance: _getInstance };
window.flashElement  = flashElement;
window.showToast     = showToast;

try {
  if (typeof exports !== 'undefined') {
    exports.MiraiRealtime = window.MiraiRealtime;
    exports.flashElement  = flashElement;
    exports.showToast     = showToast;
  }
} catch(e) { /* no es CommonJS, ignorar */ }
