import type { RouteRecordRaw } from 'vue-router';

// Rutas relativas a /app/. Cada página conserva el slug de su .html antiguo
// (/registration, /verify...), y el Worker redirige la URL antigua a esta.
// Las que aún no se han migrado siguen en public/ (ver lib/legacy.ts).
const routes: RouteRecordRaw[] = [
  // Páginas de la app: barra lateral y sesión obligatoria.
  // Va antes que el de cuenta: los dos cuelgan de '/', y '/' (el inicio) tiene
  // que resolverse aquí y no en el layout de cuenta vacío.
  {
    path: '/',
    component: () => import('@/layouts/MainLayout.vue'),
    meta: { requiresAuth: true },
    children: [
      { path: '', name: 'index', component: () => import('@/pages/HomePage.vue'), meta: { title: 'Mirai AI - Inicio' } },
      { path: 'about', name: 'about', component: () => import('@/pages/AboutPage.vue'), meta: { title: 'Mirai Ecosystem - Acerca de' } },
      {
        path: 'documentation',
        name: 'documentation',
        component: () => import('@/pages/DocumentationPage.vue'),
        meta: { title: 'Mirai AI - Documentación' },
      },
      { path: 'settings', name: 'settings', component: () => import('@/pages/SettingsPage.vue'), meta: { title: 'Mirai AI - Configuración' } },
      { path: 'purchase', name: 'purchase', component: () => import('@/pages/PurchasePage.vue'), meta: { title: 'Mirai AI - Planes' } },
      {
        path: 'learning_hub',
        name: 'learning_hub',
        component: () => import('@/pages/LearningHubPage.vue'),
        meta: { title: 'Mirai AI - Hub de Aprendizaje' },
      },
    ],
  },

  // Páginas de cuenta: sin barra lateral ni sesión.
  {
    path: '/',
    component: () => import('@/layouts/AuthLayout.vue'),
    children: [
      { path: 'login', name: 'login', component: () => import('@/pages/LoginPage.vue'), meta: { title: 'Iniciar Sesión - Mirai AI' } },
      {
        path: 'registration',
        name: 'registration',
        component: () => import('@/pages/RegistrationPage.vue'),
        meta: { title: 'Registrarse - Mirai AI' },
      },
      { path: 'verify', name: 'verify', component: () => import('@/pages/VerifyPage.vue'), meta: { title: 'Verificar Cuenta - Mirai AI' } },
      {
        path: 'reset-password',
        name: 'reset-password',
        component: () => import('@/pages/ResetPasswordPage.vue'),
        meta: { title: 'Restablecer Contraseña - Mirai AI' },
      },
    ],
  },

  {
    path: '/:catchAll(.*)*',
    component: () => import('@/pages/ErrorNotFound.vue'),
  },
];

export default routes;
