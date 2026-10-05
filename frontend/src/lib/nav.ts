// Accesos de la barra lateral (mismo orden, textos e iconos que la
// .nav-grid de las páginas antiguas).

export interface NavItem {
  /** Slug de la página ('' = inicio). */
  slug: string;
  label: string;
  tooltip: string;
  /** Nombre del icono en /icons/ui/<icon>-48.png y -96.png. */
  icon: string;
  alt: string;
}

export const NAV_ITEMS: NavItem[] = [
  { slug: '', label: 'Hogar', tooltip: 'Hogar', icon: 'home', alt: 'Hogar' },
  { slug: 'chat', label: 'Chat', tooltip: 'Chat', icon: 'chat', alt: 'Chat' },
  { slug: 'projects', label: 'Proyectos', tooltip: 'Proyectos', icon: 'projects', alt: 'Proyectos' },
  { slug: 'generation', label: 'Generación con IA', tooltip: 'Generación con IA', icon: 'generation', alt: 'Generación con IA' },
  { slug: 'course_category', label: 'Cursos', tooltip: 'Cursos', icon: 'courses', alt: 'Cursos' },
  { slug: 'classroom', label: 'Aula', tooltip: 'Aula', icon: 'classroom', alt: 'Aula' },
  { slug: 'inventory', label: 'Inventario', tooltip: 'Inventario', icon: 'inventory', alt: 'Inventario' },
  { slug: 'sales', label: 'Ventas', tooltip: 'Ventas', icon: 'sales', alt: 'Ventas' },
  { slug: 'mirror', label: 'Fotos', tooltip: 'Organizador', icon: 'photos', alt: 'Fotos' },
  { slug: 'format', label: 'Formato', tooltip: 'Formato', icon: 'format', alt: 'Formato' },
  { slug: 'apa', label: 'APA 7', tooltip: 'Formato', icon: 'apa', alt: 'APA 7' },
  { slug: 'attendance', label: 'Asistencia', tooltip: 'Asistencia', icon: 'attendance', alt: 'Asistencia' },
  { slug: 'investigation', label: 'Investigar', tooltip: 'Investigador', icon: 'investigation', alt: 'Investigar' },
  { slug: 'report', label: 'Reportes', tooltip: 'Reportes', icon: 'reports', alt: 'Reportes' },
  { slug: 'task', label: 'Tareas', tooltip: 'Tareas', icon: 'tasks', alt: 'Tareas' },
  { slug: 'diet', label: 'Dieta', tooltip: 'Dieta', icon: 'diet', alt: 'Dieta' },
  { slug: 'location', label: 'Ubicación', tooltip: 'Ubicación', icon: 'location', alt: 'Ubicación' },
  { slug: 'panel', label: 'Panel', tooltip: 'Panel', icon: 'panel', alt: 'Panel' },
  { slug: 'documentation', label: 'Docs', tooltip: 'Documentación', icon: 'docs', alt: 'Documentación' },
  { slug: 'purchase', label: 'Planes', tooltip: 'Planes', icon: 'plans', alt: 'Planes' },
];
