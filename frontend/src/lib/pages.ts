// Enlaces internos. Cada página conserva el slug de su antiguo .html (/chat,
// /task, /reset-password...), que es también su ruta en la app.

import type { Router } from 'vue-router';

/** URL de una página por su slug ('' o 'index' es el inicio). */
export function pageHref(slug: string): string {
  return slug === '' || slug === 'index' ? '/' : `/${slug}`;
}

/** Va a una página por su slug con el router. `query` sin '?'. */
export function goToPage(router: Router, slug: string, query = ''): void {
  void router.push(pageHref(slug) + (query ? `?${query}` : ''));
}

/**
 * Navegación con carga completa (fuera del router): tras iniciar sesión, para
 * empezar con el estado limpio.
 */
export function fullNavigate(path: string, { replace = false } = {}): void {
  if (replace) window.location.replace(path);
  else window.location.href = path;
}
