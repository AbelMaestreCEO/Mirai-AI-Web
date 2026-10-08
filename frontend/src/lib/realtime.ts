// Sincronización "en vivo" entre dispositivos (migración de
// public/mirai-realtime.js): consulta /api/sync/poll con un intervalo que se
// alarga con la pestaña oculta y se acorta un momento al volver a ella.
//
// Diferencias con el original: el sondeo solo corre mientras alguna página
// está suscrita (antes corría en todas), y la suscripción se cancela sola al
// desmontar el componente (useRealtime).
//
// Los cambios de módulos sin suscriptor se guardan en sessionStorage y se
// entregan al suscribirse, como hacía el script antiguo (con las mismas claves).

import { onBeforeUnmount } from 'vue';
import { currentUser } from './session';

export type RealtimeModule =
  | 'inventory'
  | 'classroom'
  | 'attendance'
  | 'diet'
  | 'tasks'
  | 'location'
  | 'courses'
  | 'reports'
  | 'chat'
  | 'generation';

const ALL_MODULES: RealtimeModule[] = ['inventory', 'classroom', 'attendance', 'diet', 'tasks', 'location', 'courses', 'reports', 'chat', 'generation'];

const POLL_INTERVAL_ACTIVE = 5_000;
const POLL_INTERVAL_HIDDEN = 60_000;
const POLL_INTERVAL_FOCUS = 2_000;
const TS_STORAGE_KEY = 'mirai-rt-last-ts';
const PENDING_STORAGE_KEY = 'mirai-rt-pending';

// Los datos de cada módulo dependen del backend (workers/routes/sync.ts).
type Changes = unknown;
type Callback = (changes: Changes) => void;

const subscribers = new Map<RealtimeModule, Set<Callback>>();
let timer: number | undefined;
let running = false;
let focusBurst = 0;
let lastTs = readSession(TS_STORAGE_KEY) || new Date(Date.now() - 30_000).toISOString();

function readSession(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeSession(key: string, value: string) {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    // Almacenamiento lleno o bloqueado: no es imprescindible.
  }
}

// ── Indicador visual (abajo a la derecha) ─────────────────────────────────
type IndicatorState = 'active' | 'syncing' | 'updated' | 'error' | 'off';

const INDICATOR: Record<IndicatorState, { color: string; text: string; opacity: string; anim: string }> = {
  active: { color: '#22c55e', text: 'En vivo', opacity: '0', anim: '' },
  syncing: { color: '#6c63ff', text: 'Sincronizando', opacity: '1', anim: 'rt-pulse 0.8s ease-in-out infinite alternate' },
  updated: { color: '#22c55e', text: '✓ Actualizado', opacity: '1', anim: '' },
  error: { color: '#ef4444', text: 'Sin conexión', opacity: '1', anim: '' },
  off: { color: '#888', text: 'Desconectado', opacity: '0', anim: '' },
};

let hideTimer: number | undefined;

function indicator(): { wrap: HTMLElement; dot: HTMLElement; label: HTMLElement } {
  let wrap = document.getElementById('mirai-rt-indicator');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.id = 'mirai-rt-indicator';
    wrap.innerHTML = '<span id="mirai-rt-dot"></span><span id="mirai-rt-label">En vivo</span>';
    wrap.style.cssText =
      'position:fixed; bottom:1.2rem; right:1.2rem; display:flex; align-items:center; gap:0.4rem; font-size:0.7rem; color:var(--text-secondary,#aaa); opacity:0; transition:opacity 0.4s; z-index:9999; pointer-events:none; user-select:none;';
    document.body.appendChild(wrap);
  }
  return { wrap, dot: wrap.querySelector<HTMLElement>('#mirai-rt-dot')!, label: wrap.querySelector<HTMLElement>('#mirai-rt-label')! };
}

function setIndicator(state: IndicatorState) {
  const { wrap, dot, label } = indicator();
  const s = INDICATOR[state];
  dot.style.cssText = `width:7px; height:7px; border-radius:50%; background:${s.color}; flex-shrink:0; animation:${s.anim};`;
  label.textContent = s.text;
  wrap.style.opacity = s.opacity;
  if (state === 'updated') {
    clearTimeout(hideTimer);
    hideTimer = window.setTimeout(() => (wrap.style.opacity = '0'), 3000);
  }
}

// ── Cambios pendientes ────────────────────────────────────────────────────
function pendingStore(): Record<string, Changes[]> {
  try {
    return JSON.parse(readSession(PENDING_STORAGE_KEY) || '{}') as Record<string, Changes[]>;
  } catch {
    return {};
  }
}

function queuePending(module: string, data: Changes) {
  const store = pendingStore();
  // Como mucho 20 entradas por módulo.
  store[module] = [...(store[module] ?? []), data].slice(-20);
  writeSession(PENDING_STORAGE_KEY, JSON.stringify(store));
}

function deliverPending(module: RealtimeModule) {
  const store = pendingStore();
  const pending = store[module];
  if (!pending?.length) return;
  for (const data of pending) notify(module, data);
  delete store[module];
  writeSession(PENDING_STORAGE_KEY, JSON.stringify(store));
}

function notify(module: RealtimeModule, data: Changes) {
  subscribers.get(module)?.forEach((cb) => {
    try {
      cb(data);
    } catch (e) {
      console.error(`[MiraiRT] Error en '${module}':`, e);
    }
  });
}

function isEmpty(data: unknown): boolean {
  if (Array.isArray(data)) return data.length === 0;
  if (data && typeof data === 'object') return Object.values(data).every((v) => (Array.isArray(v) ? v.length === 0 : !v));
  return !data;
}

// ── Sondeo ────────────────────────────────────────────────────────────────
async function poll() {
  const user = currentUser.value;
  if (!running || !user?.dni) return;
  setIndicator('syncing');
  try {
    const params = new URLSearchParams({ since: lastTs, modules: ALL_MODULES.join(','), role: user.role || 'student' });
    const res = await fetch(`/api/sync/poll?${params}`, { credentials: 'same-origin', headers: { 'Cache-Control': 'no-cache' } });
    if (!res.ok) {
      if (res.status === 401) stop();
      else setIndicator('error');
      return;
    }
    const { ts, changes } = (await res.json()) as { ts?: string; changes?: Record<string, unknown> };
    if (ts) {
      lastTs = ts;
      writeSession(TS_STORAGE_KEY, ts);
    }
    let hasChanges = false;
    for (const [module, data] of Object.entries(changes ?? {})) {
      if (isEmpty(data)) continue;
      hasChanges = true;
      if (subscribers.get(module as RealtimeModule)?.size) notify(module as RealtimeModule, data);
      else queuePending(module, data);
    }
    setIndicator(hasChanges ? 'updated' : 'active');
  } catch (err) {
    if (!(err instanceof TypeError)) console.warn('[MiraiRT] Error de poll:', err);
    setIndicator('error');
  }
}

function resetTimer() {
  clearInterval(timer);
  const interval = focusBurst > 0 ? POLL_INTERVAL_FOCUS : document.hidden ? POLL_INTERVAL_HIDDEN : POLL_INTERVAL_ACTIVE;
  timer = window.setInterval(() => {
    if (focusBurst > 0 && --focusBurst === 0) resetTimer();
    void poll();
  }, interval);
}

// Al volver a la pestaña: consulta enseguida y unas cuantas veces más rápido.
function onVisibility() {
  if (!running) return;
  if (!document.hidden) {
    focusBurst = 3;
    void poll();
  }
  resetTimer();
}

function start() {
  if (running) return;
  running = true;
  document.addEventListener('visibilitychange', onVisibility);
  setIndicator('active');
  void poll();
  resetTimer();
}

function stop() {
  running = false;
  clearInterval(timer);
  document.removeEventListener('visibilitychange', onVisibility);
  setIndicator('off');
}

/** Suscribe a un módulo. Devuelve la función para cancelar la suscripción. */
export function subscribe(module: RealtimeModule, callback: Callback): () => void {
  let set = subscribers.get(module);
  if (!set) subscribers.set(module, (set = new Set()));
  set.add(callback);
  deliverPending(module);
  start();
  return () => {
    set.delete(callback);
    if ([...subscribers.values()].every((s) => s.size === 0)) stop();
  };
}

/** subscribe() atado al ciclo de vida del componente. */
export function useRealtime(module: RealtimeModule, callback: Callback): void {
  const unsubscribe = subscribe(module, callback);
  onBeforeUnmount(unsubscribe);
}

/** Resalta brevemente un elemento actualizado (clase .rt-updated de styles.css). */
export function flashElement(el: Element | null | undefined): void {
  if (!el) return;
  el.classList.remove('rt-updated');
  void (el as HTMLElement).offsetWidth;
  el.classList.add('rt-updated');
  setTimeout(() => el.classList.remove('rt-updated'), 2000);
}

/** Aviso flotante breve de un cambio recibido (abajo a la derecha). */
export function showToast(message: string, duration = 4000): void {
  const toast = document.createElement('div');
  toast.textContent = message;
  toast.style.cssText =
    'position:fixed;bottom:3.5rem;right:1.2rem;background:var(--glass-bg,rgba(30,30,40,0.95));border:1px solid var(--glass-border,rgba(255,255,255,0.1));color:var(--text-primary,#fff);padding:0.6rem 1rem;border-radius:0.6rem;font-size:0.82rem;z-index:10000;backdrop-filter:blur(12px);animation:rt-toast-in 0.3s ease;max-width:280px;';
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), duration);
}
