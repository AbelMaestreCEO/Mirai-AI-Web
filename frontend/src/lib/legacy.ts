// Rutas de las páginas que siguen en public/ (fuera de la app Quasar).
//
// Se navega a ellas con una carga completa, no con el router: viven fuera de
// /app/. Cuando una se migre, su enlace pasa a ser una ruta del router.
export const legacyPages = {
  home: '/',
  verify: '/verify',
  registration: '/registration',
} as const;

export function goToLegacy(path: string, { replace = false } = {}): void {
  if (replace) window.location.replace(path);
  else window.location.href = path;
}
