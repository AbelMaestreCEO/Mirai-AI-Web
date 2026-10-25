// Datos de indexación compartidos por el Worker (metadatos en el HTML que
// reciben los buscadores) y el frontend (metadatos al navegar dentro de la SPA).
//
// El panel de administración y las páginas de cuenta quedan fuera del índice:
// no aportan contenido público y no deben aparecer en los resultados.

export interface SeoModule {
  /** Ruta canónica, sin barra final (excepto '/'). */
  path: string;
  title: string;
  description: string;
  /** Si puede aparecer en sitemap.xml y llevar robots "index". */
  indexable: boolean;
  /** Contenido completo de <meta name="robots">. */
  robots: string;
  /** Prioridad y frecuencia para sitemap.xml (solo si indexable). */
  priority?: string;
  changefreq?: string;
}

export const SITE = {
  name: 'Mirai AI',
  legalName: 'Aberu & Mirai Company',
  origin: 'https://ai.aberumirai.com',
  website: 'https://aberumirai.com',
  locale: 'es_ES',
  language: 'es',
  description:
    'Mirai AI combina chat, generación de texto, imágenes, video y música, cursos, aula virtual, proyectos y productividad en una sola plataforma.',
  image: 'https://ai.aberumirai.com/icons/icon-512.png',
  logo: 'https://ai.aberumirai.com/icons/icon-512.png',
  twitter: '@AberuMirai',
  themeColor: '#F5F3F8',
  sameAs: [
    'https://www.facebook.com/AberuMiraiCompany',
    'https://twitter.com/AberuMirai',
    'https://www.tiktok.com/@aberu_mirai_company',
    'https://www.instagram.com/abel_maestre_ceo/',
    'https://github.com/AbelMaestreCEO',
  ],
} as const;

export const ROBOTS_INDEX =
  'index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1';
export const ROBOTS_NOINDEX_FOLLOW = 'noindex, follow';
export const ROBOTS_NOINDEX_NOFOLLOW = 'noindex, nofollow';

export const SEO_MODULES: SeoModule[] = [
  {
    path: '/',
    title: 'Mirai AI | Asistente de IA para aprender, crear y organizar',
    description:
      'Mirai AI combina chat, generación de texto, imágenes, video y música, cursos, aula virtual, proyectos y productividad en una sola plataforma.',
    indexable: true,
    robots: ROBOTS_INDEX,
    priority: '1.0',
    changefreq: 'weekly',
  },
  {
    path: '/about',
    title: 'Acerca de Mirai AI | Aberu & Mirai Company',
    description:
      'Conoce Mirai Ecosystem, la plataforma de inteligencia artificial de Aberu & Mirai Company para el aprendizaje, la creatividad y la productividad.',
    indexable: true,
    robots: ROBOTS_INDEX,
    priority: '0.5',
    changefreq: 'yearly',
  },
  {
    path: '/documentation',
    title: 'Documentación de Mirai AI | Guías de todos los módulos',
    description:
      'Guías paso a paso de chat, generación con IA, proyectos, cursos, aula virtual, inventario, tareas y el resto de módulos de Mirai AI.',
    indexable: true,
    robots: ROBOTS_INDEX,
    priority: '0.7',
    changefreq: 'monthly',
  },
  {
    path: '/chat',
    title: 'Chat IA con Mirai | Asistente inteligente',
    description:
      'Conversa con Mirai AI, busca en la web, adjunta archivos y usa modelos de IA avanzados desde un chat disponible en la web.',
    indexable: true,
    robots: ROBOTS_INDEX,
    priority: '0.9',
    changefreq: 'weekly',
  },
  {
    path: '/code',
    title: 'Mirai Code | Programación asistida por IA',
    description:
      'Escribe, revisa y mejora código con inteligencia artificial, con chats de programación y contexto de tus proyectos.',
    indexable: true,
    robots: ROBOTS_INDEX,
    priority: '0.8',
    changefreq: 'monthly',
  },
  {
    path: '/format',
    title: 'Formatos DOCX con IA | Mirai AI',
    description:
      'Sube tus documentos Word y aplica estilos, reglas de formato y conversiones automáticas con inteligencia artificial.',
    indexable: true,
    robots: ROBOTS_INDEX,
    priority: '0.8',
    changefreq: 'monthly',
  },
  {
    path: '/investigation',
    title: 'Investigador Web con IA | Mirai AI',
    description:
      'Investiga cualquier tema con IA: busca en la web, noticias y fuentes académicas y obtén resúmenes con citas y bibliografía.',
    indexable: true,
    robots: ROBOTS_INDEX,
    priority: '0.8',
    changefreq: 'weekly',
  },
  {
    path: '/generation',
    title: 'Generación con IA | Texto, imágenes, video y música',
    description:
      'Genera textos, imágenes, videos y música con inteligencia artificial, edita tus creaciones y guarda un historial de resultados.',
    indexable: true,
    robots: ROBOTS_INDEX,
    priority: '0.9',
    changefreq: 'weekly',
  },
  {
    path: '/apa',
    title: 'Formato APA 7 con IA | Mirai AI',
    description:
      'Convierte tus documentos al formato APA 7 automáticamente, con estructura, referencias y estilos académicos correctos.',
    indexable: true,
    robots: ROBOTS_INDEX,
    priority: '0.8',
    changefreq: 'monthly',
  },
  {
    path: '/courses',
    title: 'Buscar cursos | Mirai AI',
    description:
      'Encuentra cursos y lecciones interactivas para aprender con inteligencia artificial en Mirai AI.',
    indexable: true,
    robots: ROBOTS_INDEX,
    priority: '0.7',
    changefreq: 'weekly',
  },
  {
    path: '/course_category',
    title: 'Cursos y categorías | Mirai AI',
    description:
      'Explora categorías de cursos, lecciones interactivas y contenidos educativos asistidos por inteligencia artificial.',
    indexable: true,
    robots: ROBOTS_INDEX,
    priority: '0.8',
    changefreq: 'weekly',
  },
  {
    path: '/course_details',
    title: 'Detalle del curso | Mirai AI',
    description:
      'Consulta las lecciones, contenidos y progreso de un curso en Mirai AI.',
    indexable: false,
    robots: ROBOTS_NOINDEX_FOLLOW,
  },
  {
    path: '/classroom',
    title: 'Aula Virtual | Mirai AI',
    description:
      'Consulta secciones, tareas, entregas y calificaciones de tu aula virtual con inteligencia artificial.',
    indexable: true,
    robots: ROBOTS_INDEX,
    priority: '0.8',
    changefreq: 'weekly',
  },
  {
    path: '/classroom_details',
    title: 'Detalle de tarea | Mirai AI',
    description:
      'Consulta los detalles, archivos y calificaciones de una tarea del aula virtual.',
    indexable: false,
    robots: ROBOTS_NOINDEX_FOLLOW,
  },
  {
    path: '/classroom_admin',
    title: 'Panel Docente | Mirai AI',
    description: 'Panel de control para docentes y administración del aula virtual.',
    indexable: false,
    robots: ROBOTS_NOINDEX_NOFOLLOW,
  },
  {
    path: '/attendance',
    title: 'Control de Asistencia con QR | Mirai AI',
    description:
      'Registra y consulta la asistencia con códigos QR, marcaciones y paneles de control desde Mirai AI.',
    indexable: true,
    robots: ROBOTS_INDEX,
    priority: '0.7',
    changefreq: 'monthly',
  },
  {
    path: '/attendance_admin',
    title: 'Admin de Asistencia | Mirai AI',
    description: 'Administración del control de asistencia.',
    indexable: false,
    robots: ROBOTS_NOINDEX_NOFOLLOW,
  },
  {
    path: '/task',
    title: 'Gestor de Tareas | Kanban, Gantt y calendario',
    description:
      'Organiza tus tareas con vistas Kanban, Gantt, lista y calendario, y crea tareas más rápido con el asistente de IA.',
    indexable: true,
    robots: ROBOTS_INDEX,
    priority: '0.8',
    changefreq: 'weekly',
  },
  {
    path: '/projects',
    title: 'Proyectos de código con IA | Mirai AI',
    description:
      'Crea y gestiona proyectos, sube archivos y trabaja tu código con inteligencia artificial en Mirai AI.',
    indexable: true,
    robots: ROBOTS_INDEX,
    priority: '0.8',
    changefreq: 'monthly',
  },
  {
    path: '/inventory',
    title: 'Inventario Inteligente | Mirai AI',
    description:
      'Controla productos, existencias y alertas de stock con un inventario inteligente conectado a ventas.',
    indexable: true,
    robots: ROBOTS_INDEX,
    priority: '0.7',
    changefreq: 'monthly',
  },
  {
    path: '/sales',
    title: 'Ventas y compras | Mirai AI',
    description:
      'Registra ventas y compras, controla transacciones y consulta el historial comercial de tu negocio.',
    indexable: true,
    robots: ROBOTS_INDEX,
    priority: '0.7',
    changefreq: 'monthly',
  },
  {
    path: '/diet',
    title: 'Dieta y Nutrición con IA | Mirai AI',
    description:
      'Planifica comidas semanales, cuenta calorías y recibe recomendaciones nutricionales con inteligencia artificial.',
    indexable: true,
    robots: ROBOTS_INDEX,
    priority: '0.8',
    changefreq: 'weekly',
  },
  {
    path: '/location',
    title: 'Ubicaciones y marcadores GPS | Mirai AI',
    description:
      'Guarda marcadores, explora el mapa y organiza tus ubicaciones con GPS e inteligencia artificial.',
    indexable: true,
    robots: ROBOTS_INDEX,
    priority: '0.6',
    changefreq: 'monthly',
  },
  {
    path: '/mirror',
    title: 'Organizador de Fotos | Mirai AI',
    description:
      'Sube tus fotos y videos, organízalos automáticamente y descarga tus recuerdos en paquetes listos para guardar.',
    indexable: true,
    robots: ROBOTS_INDEX,
    priority: '0.7',
    changefreq: 'monthly',
  },
  {
    path: '/report',
    title: 'Reportes con IA | Mirai AI',
    description:
      'Genera, completa y gestiona reportes con inteligencia artificial desde un panel centralizado.',
    indexable: true,
    robots: ROBOTS_INDEX,
    priority: '0.7',
    changefreq: 'monthly',
  },
  {
    path: '/learning_hub',
    title: 'Hub de Aprendizaje | Mirai AI',
    description:
      'Aprende con teoría, quizzes interactivos y práctica guiada por inteligencia artificial en el Hub de Aprendizaje.',
    indexable: true,
    robots: ROBOTS_INDEX,
    priority: '0.8',
    changefreq: 'weekly',
  },
  {
    path: '/purchase',
    title: 'Planes y precios | Mirai AI',
    description:
      'Conoce los planes de Mirai AI: Basic, Students, Development, Designer y Max, con cuotas de generación y acceso a modelos de IA.',
    indexable: true,
    robots: ROBOTS_INDEX,
    priority: '0.9',
    changefreq: 'monthly',
  },
  {
    path: '/settings',
    title: 'Configuración | Mirai AI',
    description: 'Ajusta el tema, el idioma y tus preferencias de Mirai AI.',
    indexable: false,
    robots: ROBOTS_NOINDEX_FOLLOW,
  },
  {
    path: '/panel',
    title: 'Panel de Administración | Mirai AI',
    description: 'Gestión de usuarios y planes de Mirai AI.',
    indexable: false,
    robots: ROBOTS_NOINDEX_NOFOLLOW,
  },
  {
    path: '/api_usage_admin',
    title: 'Consumo de APIs | Mirai AI',
    description: 'Panel administrativo del consumo de APIs externas.',
    indexable: false,
    robots: ROBOTS_NOINDEX_NOFOLLOW,
  },
  {
    path: '/report_admin',
    title: 'Gestión de reportes | Mirai AI',
    description: 'Administración de los reportes de Mirai AI.',
    indexable: false,
    robots: ROBOTS_NOINDEX_NOFOLLOW,
  },
  {
    path: '/login',
    title: 'Iniciar sesión | Mirai AI',
    description: 'Accede a tu cuenta de Mirai AI.',
    indexable: false,
    robots: ROBOTS_NOINDEX_FOLLOW,
  },
  {
    path: '/registration',
    title: 'Crear cuenta | Mirai AI',
    description: 'Crea tu cuenta de Mirai AI y empieza a usar sus módulos de inteligencia artificial.',
    indexable: false,
    robots: ROBOTS_NOINDEX_FOLLOW,
  },
  {
    path: '/verify',
    title: 'Verificar cuenta | Mirai AI',
    description: 'Verifica tu cuenta de Mirai AI.',
    indexable: false,
    robots: ROBOTS_NOINDEX_NOFOLLOW,
  },
  {
    path: '/reset-password',
    title: 'Restablecer contraseña | Mirai AI',
    description: 'Restablece la contraseña de tu cuenta de Mirai AI.',
    indexable: false,
    robots: ROBOTS_NOINDEX_NOFOLLOW,
  },
];

const MODULE_BY_PATH = new Map(SEO_MODULES.map((module) => [module.path, module]));

/** Módulos que sí deben aparecer en sitemap.xml. */
export const SITEMAP_MODULES = SEO_MODULES.filter((module) => module.indexable);

export interface SeoInfo extends SeoModule {
  /** false si la ruta no existe (se sirve la página 404 con estado 404). */
  known: boolean;
  canonical: string;
}

/**
 * Normaliza la ruta pedida: quita query/hash, barra final y el prefijo /app/
 * de las URLs antiguas, para que /app/chat y /chat compartan metadatos.
 */
export function normalizeSeoPath(input: string): string {
  const [withoutQuery = ''] = input.split('?');
  const [withoutHash = ''] = withoutQuery.split('#');
  let path = withoutHash;
  if (path === '/app') path = '/';
  else if (path.startsWith('/app/')) path = path.slice(4) || '/';
  if (!path.startsWith('/')) path = `/${path}`;
  if (path.length > 1) path = path.replace(/\/+$/, '');
  return path || '/';
}

/** Metadatos de una ruta. Las rutas desconocidas reciben noindex + estado 404. */
export function getSeo(input: string): SeoInfo {
  const path = normalizeSeoPath(input);
  const module = MODULE_BY_PATH.get(path);

  if (module) {
    return {
      ...module,
      known: true,
      canonical: `${SITE.origin}${path === '/' ? '/' : path}`,
    };
  }

  return {
    path,
    title: `Página no encontrada | ${SITE.name}`,
    description: 'La página que buscas no existe o cambió de dirección.',
    indexable: false,
    robots: ROBOTS_NOINDEX_NOFOLLOW,
    known: false,
    canonical: `${SITE.origin}${path}`,
  };
}

/** Datos estructurados schema.org para una página. */
export function buildStructuredData(seo: SeoInfo): Record<string, unknown> {
  const organizationId = `${SITE.origin}/#organization`;
  const websiteId = `${SITE.origin}/#website`;
  const applicationId = `${SITE.origin}/#application`;

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': organizationId,
        name: SITE.legalName,
        url: SITE.website,
        logo: SITE.logo,
        sameAs: [...SITE.sameAs],
      },
      {
        '@type': 'WebSite',
        '@id': websiteId,
        url: `${SITE.origin}/`,
        name: SITE.name,
        description: SITE.description,
        inLanguage: SITE.language,
        publisher: { '@id': organizationId },
      },
      {
        '@type': 'SoftwareApplication',
        '@id': applicationId,
        name: SITE.name,
        url: `${SITE.origin}/`,
        description: SITE.description,
        applicationCategory: 'EducationalApplication',
        operatingSystem: 'Web',
        inLanguage: SITE.language,
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
        publisher: { '@id': organizationId },
      },
      {
        '@type': 'WebPage',
        '@id': `${seo.canonical}#webpage`,
        url: seo.canonical,
        name: seo.title,
        description: seo.description,
        inLanguage: SITE.language,
        isPartOf: { '@id': websiteId },
        about: { '@id': applicationId },
        mainEntity: { '@id': applicationId },
      },
    ],
  };
}
