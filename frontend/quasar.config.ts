// Configuración de la app Quasar.
// https://v2.quasar.dev/quasar-cli-vite/quasar-config-file
//
// La app responde en la raíz del sitio (/chat, /task...), pero se compila a
// public/app/: Workers Assets sirve sus archivos bajo /app/ (index.html y
// /app/assets/*, con hash en el nombre) junto al resto de public/, y el Worker
// devuelve /app/index.html en cualquier ruta que no sea de la API ni un
// archivo (ver workers/worker.ts).

import { defineConfig } from '#q-app';

export default defineConfig(() => {
  return {
    // appearance: tema/acento y la hoja de estilos antes de montar nada;
    // pwa: registra el service worker (public/sw.js).
    boot: ['appearance', 'pwa'],

    css: ['app.scss'],

    extras: [
      // La app actual usa Roboto; se sirve en local en vez de desde Google Fonts.
      'roboto-font',
      // Iconos internos de algunos componentes de Quasar.
      'material-icons',
    ],

    build: {
      target: {
        browser: 'baseline-widely-available',
      },

      typescript: {
        strict: true,
        vueShim: true,
      },

      vueRouterMode: 'history',
      vueRouterBase: '/',
      // Solo la URL de los archivos compilados: las rutas van desde la raíz.
      publicPath: '/app/',
      distDir: '../public/app',
      // public/app/ está fuera de frontend/ a propósito: es lo que sirve Workers Assets.
      allowOutsideProjectDistDir: true,

    },

    devServer: {
      open: false,
      // En desarrollo, la API la sirve `wrangler dev` (npm run dev en la raíz).
      proxy: {
        '/api': {
          target: 'http://localhost:8787',
          changeOrigin: false,
        },
      },
    },

    framework: {
      config: {},
      lang: 'es',
      plugins: [],
    },

    animations: [],
  };
});
