import type { RouteRecordRaw } from 'vue-router';

// Cada página conserva el slug de su antiguo .html (/registration, /verify...).
// El Worker sirve la app en cualquier ruta que no sea de la API ni un archivo,
// y redirige las URLs con .html (enlaces de correos, marcadores) a la suya.
const routes: RouteRecordRaw[] = [
  // Páginas de la app: barra lateral y sesión obligatoria.
  // Va antes que el de cuenta: los dos cuelgan de '/', y '/' (el inicio) tiene
  // que resolverse aquí y no en el layout de cuenta vacío.
  {
    path: '/',
    component: () => import('@/layouts/MainLayout.vue'),
    meta: { requiresAuth: true },
    children: [
      { path: '', name: 'index', component: () => import('@/pages/HomePage.vue'), meta: { title: 'Mirai AI - Inicio', subtitle: 'Inicio' } },
      { path: 'about', name: 'about', component: () => import('@/pages/AboutPage.vue'), meta: { title: 'Mirai Ecosystem - Acerca de', subtitle: 'Acerca de' } },
      {
        path: 'documentation',
        name: 'documentation',
        component: () => import('@/pages/DocumentationPage.vue'),
        meta: { title: 'Mirai AI - Documentación', subtitle: 'Documentación' },
      },
      { path: 'chat', name: 'chat', component: () => import('@/pages/ChatPage.vue'), meta: { title: 'Mirai AI - Chat', subtitle: 'Chat' } },
      { path: 'code', name: 'code', component: () => import('@/pages/CodePage.vue'), meta: { title: 'Mirai AI - Code', subtitle: 'Code' } },
      { path: 'format', name: 'format', component: () => import('@/pages/FormatPage.vue'), meta: { title: 'Mirai AI - Formatos DOCX', subtitle: 'Estilos DOCX' } },
      { path: 'investigation', name: 'investigation', component: () => import('@/pages/InvestigationPage.vue'), meta: { title: 'Mirai AI - Investigador', subtitle: 'Investigador Web' } },
      { path: 'generation', name: 'generation', component: () => import('@/pages/GenerationPage.vue'), meta: { title: 'Mirai AI - Generación IA', subtitle: 'Generación con IA' } },
      { path: 'apa', name: 'apa', component: () => import('@/pages/ApaPage.vue'), meta: { title: 'Mirai AI - Formato APA', subtitle: 'Formato APA 7' } },
      { path: 'courses', name: 'courses', component: () => import('@/pages/CoursesPage.vue'), meta: { title: 'Mirai AI - Cursos', subtitle: 'Cursos' } },
      { path: 'course_category', name: 'course_category', component: () => import('@/pages/CourseCategoryPage.vue'), meta: { title: 'Mirai AI - Categorías', subtitle: 'Categorías' } },
      { path: 'course_details', name: 'course_details', component: () => import('@/pages/CourseDetailsPage.vue'), meta: { title: 'Mirai AI - Detalles del Curso', subtitle: 'Lecciones' } },
      { path: 'classroom', name: 'classroom', component: () => import('@/pages/ClassroomPage.vue'), meta: { title: 'Aula Virtual - Mirai AI', subtitle: 'Aula Virtual' } },
      { path: 'classroom_details', name: 'classroom_details', component: () => import('@/pages/ClassroomDetailsPage.vue'), meta: { title: 'Mirai AI - Detalle de Tarea', subtitle: 'Detalle de Tarea' } },
      { path: 'classroom_admin', name: 'classroom_admin', component: () => import('@/pages/ClassroomAdminPage.vue'), meta: { title: 'Panel Docente - Mirai AI', subtitle: 'Panel Docente' } },
      { path: 'attendance', name: 'attendance', component: () => import('@/pages/AttendancePage.vue'), meta: { title: 'Mirai AI - Asistencia', subtitle: 'Control de Asistencia' } },
      { path: 'attendance_admin', name: 'attendance_admin', component: () => import('@/pages/AttendanceAdminPage.vue'), meta: { title: 'Mirai AI - Admin Asistencia', subtitle: 'Admin - Control de Asistencia' } },
      { path: 'task', name: 'task', component: () => import('@/pages/TaskPage.vue'), meta: { title: 'Mirai AI - Tareas', subtitle: 'Tareas' } },
      { path: 'projects', name: 'projects', component: () => import('@/pages/ProjectsPage.vue'), meta: { title: 'Mirai AI - Proyectos', subtitle: 'Proyectos' } },
      { path: 'inventory', name: 'inventory', component: () => import('@/pages/InventoryPage.vue'), meta: { title: 'Mirai AI - Inventario', subtitle: 'Inventario Inteligente' } },
      { path: 'sales', name: 'sales', component: () => import('@/pages/SalesPage.vue'), meta: { title: 'Mirai AI - Ventas', subtitle: 'Ventas' } },
      { path: 'diet', name: 'diet', component: () => import('@/pages/DietPage.vue'), meta: { title: 'Mirai AI - Dieta', subtitle: 'Dieta & Nutrición' } },
      { path: 'location', name: 'location', component: () => import('@/pages/LocationPage.vue'), meta: { title: 'Mirai AI - Ubicaciones', subtitle: 'Ubicaciones' } },
      { path: 'mirror', name: 'mirror', component: () => import('@/pages/MirrorPage.vue'), meta: { title: 'Organizador de Fotos', subtitle: 'Organizador de Fotos' } },
      { path: 'panel', name: 'panel', component: () => import('@/pages/PanelPage.vue'), meta: { title: 'Mirai AI - Panel Admin', subtitle: 'Panel Admin' } },
      { path: 'api_usage_admin', name: 'api_usage_admin', component: () => import('@/pages/ApiUsageAdminPage.vue'), meta: { title: 'Mirai AI - Consumo de APIs', subtitle: 'Consumo de APIs' } },
      { path: 'report', name: 'report', component: () => import('@/pages/ReportPage.vue'), meta: { title: 'Mirai AI - Mis Reportes', subtitle: 'Mis Reportes' } },
      // La antigua gestión de reportes (report_admin.html) es ahora la pestaña "Gestionar".
      { path: 'report_admin', name: 'report_admin', redirect: (to) => ({ path: '/report', query: { ...to.query, tab: 'manage' } }) },
      { path: 'settings', name: 'settings', component: () => import('@/pages/SettingsPage.vue'), meta: { title: 'Mirai AI - Configuración', subtitle: 'Configuración' } },
      { path: 'purchase', name: 'purchase', component: () => import('@/pages/PurchasePage.vue'), meta: { title: 'Mirai AI - Planes', subtitle: 'Planes' } },
      {
        path: 'learning_hub',
        name: 'learning_hub',
        component: () => import('@/pages/LearningHubPage.vue'),
        meta: { title: 'Mirai AI - Hub de Aprendizaje', subtitle: 'Hub de Aprendizaje' },
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
