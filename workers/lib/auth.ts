/* ============================================
   MIRAI AI - Sesión, contraseñas y permisos
   Cookie de sesión, requireAuth/isAdminUser, normalización de DNI y rate limit.
   ============================================ */
import { jsonResponse } from './http';

// Hash de contraseña usando PBKDF2 nativo
export async function hashPassword(password, salt) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + salt);
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    data,
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: encoder.encode(salt),
      iterations: 100000,
      hash: "SHA-256"
    },
    keyMaterial,
    256 // bits
  );
  // Convertir ArrayBuffer a string hex
  const bytes = new Uint8Array(derivedBits);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Generar salt aleatorio usando crypto.getRandomValues (nativo en Workers)
export function generateSalt() {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('');
}

// --- NUEVO: VALIDACIÓN DE EMAIL ---
export function isValidEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

// --- INTERCEPTOR DE AUTENTICACIÓN (cookie HttpOnly + Bearer como fallback) ---
export function getTokenFromRequest(request) {
  // 1. Intentar leer desde cookie HttpOnly (método seguro)
  const cookieHeader = request.headers.get('Cookie') || '';
  const cookieMatch = cookieHeader.match(/(?:^|;\s*)session=([^;]+)/);
  if (cookieMatch) return cookieMatch[1];

  // 2. Fallback: Bearer token (compatibilidad con clientes viejos)
  const authHeader = request.headers.get('Authorization') || '';
  if (authHeader.startsWith('Bearer ')) return authHeader.slice(7);

  return null;
}

// Sesiones sin vencimiento por tiempo: el token vive hasta que el usuario cierre sesión.
// 400 días es el máximo de Max-Age que los navegadores (Chrome/Edge) aceptan en una cookie;
// pedir más se trunca igualmente, así que es el techo práctico para "no expira".
export const SESSION_MAX_AGE_SECS = 400 * 24 * 3600;

export function makeSessionCookie(token, maxAgeSecs = SESSION_MAX_AGE_SECS) {
  return `session=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${maxAgeSecs}`;
}

export function clearSessionCookie() {
  return `session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`;
}

export async function requireAuth(request, env) {
  const token = getTokenFromRequest(request);
  if (!token) return null;

  // La sesión no vence por tiempo: solo se invalida con logout (borrado explícito de la fila).
  const session = await env.MIRAI_AI_DB.prepare(
    "SELECT user_dni FROM sessions WHERE token = ?"
  ).bind(token).first();

  if (!session) return null;
  return session.user_dni;
}

/** ¿El usuario tiene rol 'admin' en la tabla users? */
export async function isAdminUser(userDni, env) {
  try {
    const row = await env.MIRAI_AI_DB.prepare(
      'SELECT role FROM users WHERE dni = ?'
    ).bind(userDni.toUpperCase()).first();
    return row?.role === 'admin';
  } catch (error) {
    console.error('isAdminUser error:', error.message);
    return false;
  }
}

export function clientIp(request) {
  return request.headers.get('CF-Connecting-IP') || 'desconocida';
}

/**
 * Contador de ventana fija sobre KV_RATE.
 * Si KV falla deja pasar: es una capa de contención, no la defensa principal.
 * La protección real del OTP es otp_attempts en D1, que sí es consistente.
 * @returns {Promise<boolean>} true si la petición se permite.
 */
export async function rateLimit(env, key, limit, windowSecs) {
  if (!env.KV_RATE) return true;

  const bucket = Math.floor(Date.now() / (windowSecs * 1000));
  const kvKey = `rl:${key}:${bucket}`;

  try {
    const current = parseInt(await env.KV_RATE.get(kvKey), 10) || 0;
    if (current >= limit) return false;
    await env.KV_RATE.put(kvKey, String(current + 1), { expirationTtl: Math.max(60, windowSecs * 2) });
    return true;
  } catch (e) {
    console.warn('rateLimit: KV_RATE no disponible —', e.message);
    return true;
  }
}

/** Comparación en tiempo constante: no filtra cuántos dígitos se acertaron. */
export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/* ══════════════════════════════════════════════════════════════════════
   VENTAS — módulo interno, todos los datos aislados por user_dni
   Tablas: sale_listings, sale_buyers, sale_transactions (ver db/sales.sql)
   ══════════════════════════════════════════════════════════════════════ */

export const CEDULA_RE = /^[A-Za-z]-\d{5,9}$/;

export function normalizeCedula(raw) {
  const v = (raw || '').trim().toUpperCase().replace(/\s+/g, '');
  return v;
}

/** Formato canónico del DNI, el mismo que exige handleRegister. */
const DNI_PATTERN = /^[A-Z]{1,5}-[A-Z0-9]{5,15}$/;

/**
 * Lleva un DNI a la forma canónica con la que se guarda en users.dni.
 *
 * La importación por lotes de alumnos exigía /^\d+$/ (solo dígitos) e insertaba
 * el número tal cual en section_students, pero el registro guarda "V-30840119"
 * (y db/V.sql migró los sueltos a ese formato). Resultado: los alumnos
 * importados por lote nunca hacían match con users.dni, así que salían sin
 * nombre en la sección y no recibían ninguna tarea. Aquí se acepta tanto
 * "30840119" como "V-30840119" y siempre se devuelve la forma con prefijo.
 *
 * @returns {string|null} el DNI canónico, o null si no es válido
 */
export function normalizeDni(raw) {
  const value = (raw == null ? '' : String(raw)).trim().toUpperCase().replace(/\s+/g, '');
  if (!value) return null;

  // Solo dígitos → se asume cédula venezolana y se le antepone "V-"
  const candidate = /^\d+$/.test(value) ? `V-${value}` : value;

  return DNI_PATTERN.test(candidate) ? candidate : null;
}

export async function requireAdminAuth(request, env, corsHeaders) {
  const userDni = await requireAuth(request, env);
  if (!userDni) {
    return jsonResponse({ error: 'No autorizado. Inicia sesión.' }, 401, corsHeaders);
  }

  const row = await env.MIRAI_AI_DB.prepare(
    "SELECT role FROM users WHERE dni = ?"
  ).bind(userDni.toUpperCase()).first();

  if (!row || row.role !== 'admin') {
    return jsonResponse({ error: 'Acceso denegado. Requiere rol de administrador.' }, 403, corsHeaders);
  }

  return userDni;
}
