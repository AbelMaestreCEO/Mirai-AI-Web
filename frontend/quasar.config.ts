// Configuración de la app Quasar.
// https://v2.quasar.dev/quasar-cli-vite/quasar-config-file
//
// Mientras conviva con las páginas HTML de public/, la app vive bajo /app/:
// se compila a public/app/ (lo sirve Workers Assets) y el Worker devuelve
// /app/index.html para cualquier ruta /app/... que no sea un archivo
// (ver workers/worker.ts).

import { defineConfig } from '#q-app';

export default defineConfig(() => {
  return {
    boot: [],

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
      vueRouterBase: '/app/',
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
