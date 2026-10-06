// Páginas antiguas (public/*.html) frente a páginas ya migradas a la app.
//
// Mientras dure la migración, cada enlace interno pasa por pageHref(): si la
// página ya está en la app se navega con el router (/app/<slug>); si no, con
// una carga completa a la página antigua (/<slug>). Al migrar una página basta
// con añadir su slug a MIGRATED y su ruta en router/routes.ts.

import type { Router } from 'vue-router';

/** Slugs (nombre del .html antiguo, sin extensión) que ya viven en la app. */
export const MIGRATED = new Set<string>([
  'login', 'registration', 'verify', 'reset-password',
  'about', 'documentation', 'purchase', 'learning_hub',
  'index', 'settings', 'chat', 'code', 'format', 'investigation', 'generation',
  'apa', 'courses', 'course_category', 'course_details', 'classroom',
  'classroom_details', 'classroom_admin', 'attendance', 'attendance_admin',
  'task', 'projects', 'inventory', 'sales', 'diet', 'location',
]);

export function isMigrated(slug: string): boolean {
  return MIGRATED.has(slug);
}

/** URL de una página por su slug antiguo ('' es el inicio). */
export function pageHref(slug: string): string {
  if (slug === '' || slug === 'index') return isMigrated('index') ? '/app/' : '/';
  return isMigrated(slug) ? `/app/${slug}` : `/${slug}`;
}

/**
 * Va a una página por su slug: con el router si ya está migrada, con carga
 * completa si no. `query` sin '?'.
 */
export function goToPage(router: Router, slug: string, query = ''): void {
  const href = pageHref(slug) + (query ? `?${query}` : '');
  if (isMigrated(slug === '' ? 'index' : slug)) void router.push(href.replace(/^\/app/, '') || '/');
  else goToLegacy(href);
}

/** Navegación con carga completa (fuera del router). */
export function goToLegacy(path: string, { replace = false } = {}): void {
  if (replace) window.location.replace(path);
  else window.location.href = path;
}
