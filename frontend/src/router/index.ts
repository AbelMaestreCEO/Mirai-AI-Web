import { defineRouter } from '#q-app';
import {
  createMemoryHistory,
  createRouter,
  createWebHashHistory,
  createWebHistory,
} from 'vue-router';

import routes from './routes';
import { ensureSession } from '@/lib/session';

declare module 'vue-router' {
  interface RouteMeta {
    /** Requiere sesión (lo que hacía auth-guard.js en las páginas protegidas). */
    requiresAuth?: boolean;
    /** Título de la pestaña (el <title> de la página antigua). */
    title?: string;
    /**
     * Slug de la página antigua. Va en <body data-page>: el CSS propio de cada
     * página está limitado con :where(body[data-page="<slug>"]) para que no
     * afecte a las demás aunque siga cargado.
     */
    page?: string;
  }
}

// El modo y la base (/app/) se configuran en quasar.config.ts, no aquí.
export default defineRouter(() => {
  const createHistory = import.meta.env.QUASAR_SERVER
    ? createMemoryHistory
    : import.meta.env.QUASAR_VUE_ROUTER_MODE === 'history'
      ? createWebHistory
      : createWebHashHistory;

  const router = createRouter({
    scrollBehavior: () => ({ left: 0, top: 0 }),
    routes,
    history: createHistory(import.meta.env.QUASAR_VUE_ROUTER_BASE),
  });

  router.beforeEach(async (to) => {
    if (!to.matched.some((r) => r.meta.requiresAuth)) return true;
    const session = await ensureSession();
    // Sin red o con el servidor caído no se sabe si hay sesión: se deja pasar
    // y cada llamada a la API dirá lo que haga falta (igual que auth-guard.js).
    if (session.status === 'anonymous') return { name: 'login' };
    return true;
  });

  router.afterEach((to) => {
    const title = [...to.matched].reverse().find((r) => r.meta.title)?.meta.title;
    if (title) document.title = title;
    document.body.dataset.page = to.meta.page ?? String(to.name ?? '');
  });

  return router;
});
