// Estado de la barra lateral, compartido entre MainLayout y el botón de menú
// que cada página pone en su cabecera (las cabeceras son de cada página, como
// en las páginas antiguas).

import { reactive, watch } from 'vue';

export const shell = reactive({
  /** Menú abierto en móvil. */
  open: false,
  /** Barra estrecha (solo iconos) en escritorio. */
  collapsed: false,
  /** Accesos extra de la .nav-grid desplegados ("Ver más"). */
  navExpanded: false,
});

export function openMenu() {
  shell.open = true;
}

export function closeMenu() {
  shell.open = false;
}

export function toggleMenu() {
  shell.open = !shell.open;
}

export function toggleCollapsed() {
  shell.collapsed = !shell.collapsed;
  // Igual que app.js: al colapsar/expandir se recoge la lista de accesos.
  shell.navExpanded = false;
}

// Con el menú abierto en móvil la página de detrás no hace scroll.
watch(
  () => shell.open,
  (open) => {
    document.body.style.overflow = open ? 'hidden' : '';
  },
);

// La barra pasa a ser un cajón deslizable hasta 1100px (por debajo ya no cabe
// con el contenido). Si se amplía la ventana con el cajón abierto se cierra
// para liberar el scroll del body y no dejar el velo a medias.
if (typeof window !== 'undefined') {
  const drawerQuery = window.matchMedia('(max-width: 1100px)');
  drawerQuery.addEventListener?.('change', (event) => {
    if (!event.matches) closeMenu();
  });
}
