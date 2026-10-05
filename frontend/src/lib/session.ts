// Sesión del usuario (equivalente a public/auth-guard.js).
//
// La sesión vive en la cookie HttpOnly que pone el Worker. Aquí solo se
// pregunta a /api/me quién es el usuario, una vez por carga de la app.

import { ref } from 'vue';

export interface SessionUser {
  dni: string;
  name: string;
  role: string;
  [field: string]: unknown;
}

/** Resultado de comprobar la sesión. */
export type SessionState =
  | { status: 'authenticated'; user: SessionUser }
  | { status: 'anonymous' }
  // Sin red o error del servidor: no se sabe si hay sesión. Igual que
  // auth-guard.js, en ese caso no se manda al login (la app Android sin
  // conexión acababa siempre ahí aunque la sesión siguiera abierta).
  | { status: 'unknown' };

export const currentUser = ref<SessionUser | null>(null);

let pending: Promise<SessionState> | null = null;

async function fetchSession(): Promise<SessionState> {
  let res: Response;
  try {
    res = await fetch('/api/me', { credentials: 'same-origin' });
  } catch {
    return { status: 'unknown' };
  }
  // 404: el usuario de la sesión ya no existe.
  if (res.status === 401 || res.status === 403 || res.status === 404) return { status: 'anonymous' };
  if (!res.ok) return { status: 'unknown' };
  try {
    const user = (await res.json()) as SessionUser;
    currentUser.value = user;
    return { status: 'authenticated', user };
  } catch {
    return { status: 'unknown' };
  }
}

/** Comprueba la sesión (cacheado durante la vida de la app). */
export function ensureSession(): Promise<SessionState> {
  if (!pending) pending = fetchSession();
  return pending;
}

/** Olvida lo cacheado (tras login/logout sin recargar). */
export function resetSession(): void {
  pending = null;
  currentUser.value = null;
}

export function isAdmin(): boolean {
  return currentUser.value?.role === 'admin';
}
