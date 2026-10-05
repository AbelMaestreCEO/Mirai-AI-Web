// Antes de montar la app: tema, color de acento y hoja de estilos de siempre.
//
// public/styles.css se importa tal cual (una sola fuente para las páginas
// viejas y las nuevas mientras dure la migración). Se carga aquí, después del
// CSS de Quasar y de app.scss, para que sea la que mande. Justo antes va el
// CSS que algunas páginas antiguas ponían delante de styles.css.
import { defineBoot } from '#q-app';
import '../css/before-styles.css';
import '../../../public/styles.css';
import { applyAppearance } from '@/lib/settings';

export default defineBoot(() => {
  applyAppearance();

  // Si el usuario cambia el tema del sistema con el modo "automático", se sigue.
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener('change', () => applyAppearance());
});
