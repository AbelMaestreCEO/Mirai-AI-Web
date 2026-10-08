// Antes de montar la app: tema, color de acento y hoja de estilos de siempre.
//
// css/styles.css es la hoja de las páginas antiguas, con las mismas clases. Se
// carga aquí, después del CSS de Quasar y de app.scss, para que sea la que
// mande. Justo antes va el CSS que algunas páginas ponían delante de ella.
import { defineBoot } from '#q-app';
import '../css/before-styles.css';
import '../css/styles.css';
import { applyAppearance } from '@/lib/settings';

export default defineBoot(() => {
  applyAppearance();

  // Si el usuario cambia el tema del sistema con el modo "automático", se sigue.
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener('change', () => applyAppearance());
});
