import type { RouteRecordRaw } from 'vue-router';

// Rutas relativas a /app/. Las páginas que aún no se han migrado siguen en
// public/ y se enlazan con navegación normal (window.location), no con el router.
const routes: RouteRecordRaw[] = [
  {
    path: '/',
    component: () => import('@/layouts/AuthLayout.vue'),
    children: [
      { path: '', redirect: { name: 'login' } },
      { path: 'login', name: 'login', component: () => import('@/pages/LoginPage.vue') },
    ],
  },

  {
    path: '/:catchAll(.*)*',
    component: () => import('@/pages/ErrorNotFound.vue'),
  },
];

export default routes;
