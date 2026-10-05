// Cliente mínimo para la API del Worker (/api/...).
//
// La sesión va en una cookie HttpOnly (session=...) que pone el propio Worker:
// aquí no se guarda ni se envía ningún token a mano.

import { currentUser } from './session';

/** Cuerpo de error que devuelven las rutas del Worker. */
export interface ApiErrorBody {
  error?: string;
  [field: string]: unknown;
}

export interface ApiResult<T> {
  ok: boolean;
  status: number;
  data: T;
}

let sessionExpiredShown = false;

async function request<T>(method: string, path: string, body?: unknown): Promise<ApiResult<T>> {
  const init: RequestInit = { method, credentials: 'same-origin' };
  if (body !== undefined) {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify(body);
  }
  const res = await fetch(path, init);
  // Igual que el fetch envuelto de app.js: un 401 en mitad de la app es una
  // sesión caducada; se avisa una sola vez. Solo con sesión iniciada: en las
  // páginas de cuenta (que no cargaban app.js) un 401 es una respuesta normal,
  // como un código de verificación caducado.
  if (res.status === 401 && currentUser.value && !path.startsWith('/api/me') && !sessionExpiredShown) {
    sessionExpiredShown = true;
    alert('Tu sesión ha expirado o es inválida. Por favor, cierra sesión y vuelve a iniciar sesión.');
  }
  // Algunas rutas responden sin cuerpo JSON (p. ej. un 502 de la plataforma).
  const data = (await res.json().catch(() => ({}))) as T;
  return { ok: res.ok, status: res.status, data };
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body: unknown) => request<T>('POST', path, body),
};

// ── Cuenta ────────────────────────────────────────────────────────────────
// Contrato de workers/routes/account.ts (handleLogin, handleForgotPassword).

export interface LoginSuccess {
  success: true;
  dni: string;
  first_name: string;
  role: string;
}

/** 403 cuando el usuario tiene 2FA: hay que seguir en /verify. */
export interface LoginNeedsVerification extends ApiErrorBody {
  error: string;
  needs_verification: true;
  /** false si el correo con el código no se pudo enviar. */
  message_sent?: boolean;
}

export type LoginResponse = LoginSuccess | LoginNeedsVerification | ApiErrorBody;

export function isNeedsVerification(data: LoginResponse): data is LoginNeedsVerification {
  return (data as LoginNeedsVerification).needs_verification === true;
}

/** El mensaje de error de una respuesta de la API, o `fallback` si no trae. */
export function errorMessage(data: unknown, fallback: string): string {
  const error = data && typeof data === 'object' ? (data as ApiErrorBody).error : undefined;
  return typeof error === 'string' && error ? error : fallback;
}
