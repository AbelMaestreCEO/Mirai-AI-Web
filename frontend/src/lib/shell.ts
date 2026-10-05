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
