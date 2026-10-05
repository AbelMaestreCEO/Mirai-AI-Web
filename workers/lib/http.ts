/* ============================================
   MIRAI AI - Utilidades HTTP y JSON

   ============================================ */

// ─────────────────────────────────────────────────────────────
// Helper ya definido en projects-endpoints.js — copiado aquí
// por si se integra este archivo de forma independiente
// ─────────────────────────────────────────────────────────────
export function safeJsonParse(str, fallback: any = null) {
  try { return JSON.parse(str); } catch { return fallback; }
}

// ════════════════════════════════════════════════════════════
// HELPERS INTERNOS
// ════════════════════════════════════════════════════════════

/**
 * Parsea JSON de forma segura; devuelve fallback si falla.
 * @template T
 * @param {string|null} raw
 * @param {T} fallback
 * @returns {T}
 */
export function safeJson(raw, fallback) {
  try { return JSON.parse(raw) ?? fallback; }
  catch { return fallback; }
}

/**
 * Genera un UUID v4 usando la API nativa de Workers.
 * @returns {string}
 */
export function newId() {
  return crypto.randomUUID();
}

/**
 * Valida que una string tenga entre min y max caracteres (sin contar espacios extremos).
 * @param {string} value
 * @param {number} min
 * @param {number} max
 * @returns {boolean}
 */
export function strLen(value, min, max) {
  const s = (value || '').trim();
  return s.length >= min && s.length <= max;
}

// --- UTILIDADES ---
export function jsonResponse(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...headers
    }
  });
}
