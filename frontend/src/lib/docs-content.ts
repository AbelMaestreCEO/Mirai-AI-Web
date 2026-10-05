// Contenido de la documentación (copiado de public/documentation.html).
// Los textos de ayuda son HTML fijo escrito aquí; no viene del usuario.

export interface DocModule {
  /** Nombre del icono de /icons/ui o, si no tiene arte, un emoji. */
  icon: string;
  title: string;
  desc: string;
  /** Slug de la página del módulo. */
  href: string;
  subs: { name: string; key: string }[];
}

export const DOC_MODULES: DocModule[] = [
  {
    "icon": "chat",
    "title": "Chat IA",
    "desc": "Conversa con Mirai",
    "href": "chat",
    "subs": [
      {
        "name": "Enviar mensajes",
        "key": "chat-mensajes"
      },
      {
        "name": "Búsqueda web",
        "key": "chat-web"
      },
      {
        "name": "Modelos de IA",
        "key": "chat-modelos"
      },
      {
        "name": "Adjuntar archivos",
        "key": "chat-archivos"
      },
      {
        "name": "Modo voz",
        "key": "chat-voz"
      }
    ]
  },
  {
    "icon": "generation",
    "title": "Generación con IA",
    "desc": "Crea texto, imágenes, video y música",
    "href": "generation",
    "subs": [
      {
        "name": "Generar texto",
        "key": "gen-texto"
      },
      {
        "name": "Generar imágenes",
        "key": "gen-imagen"
      },
      {
        "name": "Editar imágenes",
        "key": "gen-editar"
      },
      {
        "name": "Generar video",
        "key": "gen-video"
      },
      {
        "name": "Generar música",
        "key": "gen-musica"
      },
      {
        "name": "Historial",
        "key": "gen-historial"
      }
    ]
  },
  {
    "icon": "projects",
    "title": "Proyectos",
    "desc": "Gestiona tu código con IA",
    "href": "projects",
    "subs": [
      {
        "name": "Crear proyecto",
        "key": "proj-crear"
      },
      {
        "name": "Subir archivos",
        "key": "proj-archivos"
      },
      {
        "name": "Abrir en Code",
        "key": "proj-code"
      }
    ]
  },
  {
    "icon": "courses",
    "title": "Cursos",
    "desc": "Aprende con lecciones interactivas",
    "href": "course_category",
    "subs": [
      {
        "name": "Buscar cursos",
        "key": "cursos-buscar"
      },
      {
        "name": "Lecciones",
        "key": "cursos-lecciones"
      },
      {
        "name": "Chat educativo",
        "key": "cursos-chat"
      }
    ]
  },
  {
    "icon": "classroom",
    "title": "Aula Virtual",
    "desc": "Secciones, tareas y calificaciones",
    "href": "classroom",
    "subs": [
      {
        "name": "Secciones",
        "key": "aula-secciones"
      },
      {
        "name": "Entregas",
        "key": "aula-entregas"
      },
      {
        "name": "Calificaciones",
        "key": "aula-calificaciones"
      }
    ]
  },
  {
    "icon": "inventory",
    "title": "Inventario",
    "desc": "Control de productos y stock",
    "href": "inventory",
    "subs": [
      {
        "name": "Agregar producto",
        "key": "inv-agregar"
      },
      {
        "name": "Buscar y filtrar",
        "key": "inv-buscar"
      },
      {
        "name": "Alertas de stock",
        "key": "inv-alertas"
      }
    ]
  },
  {
    "icon": "tasks",
    "title": "Tareas",
    "desc": "Kanban, Gantt, lista y calendario",
    "href": "task",
    "subs": [
      {
        "name": "Vista Kanban",
        "key": "task-kanban"
      },
      {
        "name": "Vista Gantt",
        "key": "task-gantt"
      },
      {
        "name": "Vista calendario",
        "key": "task-calendario"
      },
      {
        "name": "Asistente IA",
        "key": "task-ia"
      },
      {
        "name": "Notificaciones push",
        "key": "task-push"
      }
    ]
  },
  {
    "icon": "investigation",
    "title": "Investigación",
    "desc": "Búsqueda web con citas APA",
    "href": "investigation",
    "subs": [
      {
        "name": "Realizar búsqueda",
        "key": "inv-busqueda"
      },
      {
        "name": "Fuentes y bibliografía",
        "key": "inv-fuentes"
      },
      {
        "name": "Historial",
        "key": "inv-historial"
      }
    ]
  },
  {
    "icon": "location",
    "title": "Ubicaciones",
    "desc": "Marcadores en el mapa",
    "href": "location",
    "subs": [
      {
        "name": "Agregar marcador",
        "key": "loc-agregar"
      },
      {
        "name": "Subir imágenes",
        "key": "loc-imagenes"
      },
      {
        "name": "GPS",
        "key": "loc-gps"
      }
    ]
  },
  {
    "icon": "photos",
    "title": "Fotos",
    "desc": "Organizador de imágenes",
    "href": "mirror",
    "subs": [
      {
        "name": "Subir fotos",
        "key": "mirror-subir"
      },
      {
        "name": "Álbumes",
        "key": "mirror-albumes"
      }
    ]
  },
  {
    "icon": "format",
    "title": "Formato de texto",
    "desc": "Herramientas de formato",
    "href": "format",
    "subs": []
  },
  {
    "icon": "apa",
    "title": "APA 7",
    "desc": "Genera documentos en formato APA",
    "href": "apa",
    "subs": []
  },
  {
    "icon": "attendance",
    "title": "Asistencia",
    "desc": "Registro de asistencia con QR",
    "href": "attendance",
    "subs": [
      {
        "name": "Escanear QR",
        "key": "att-qr"
      },
      {
        "name": "Historial",
        "key": "att-historial"
      }
    ]
  },
  {
    "icon": "reports",
    "title": "Reportes",
    "desc": "Genera reportes con IA",
    "href": "report",
    "subs": []
  },
  {
    "icon": "diet",
    "title": "Dieta",
    "desc": "Planificador nutricional con IA",
    "href": "diet",
    "subs": []
  },
  {
    "icon": "⚙️",
    "title": "Configuración",
    "desc": "Tema, idioma y preferencias",
    "href": "settings",
    "subs": [
      {
        "name": "Tema y colores",
        "key": "settings-tema"
      },
      {
        "name": "Preferencias IA",
        "key": "settings-prefs"
      }
    ]
  },
  {
    "icon": "plans",
    "title": "Planes",
    "desc": "Suscripciones y tokens de generación",
    "href": "purchase",
    "subs": [
      {
        "name": "Ver planes",
        "key": "purchase-planes"
      },
      {
        "name": "Costos de API",
        "key": "purchase-api"
      }
    ]
  },
  {
    "icon": "panel",
    "title": "Panel Admin",
    "desc": "Gestión de usuarios y planes",
    "href": "panel",
    "subs": [
      {
        "name": "Usuarios",
        "key": "panel-usuarios"
      },
      {
        "name": "Roles",
        "key": "panel-roles"
      },
      {
        "name": "Planes",
        "key": "panel-planes"
      }
    ]
  }
];

export const DOC_TOPICS: Record<string, { title: string; body: string }> = {
  "chat-mensajes": {
    "title": "💬 Enviar mensajes",
    "body": "<p>Escribe tu mensaje en el campo de texto inferior y presiona el botón de enviar o la tecla Enter.</p><h3>Conversaciones</h3><p>Cada conversación se guarda automáticamente. Puedes crear nuevas o retomar anteriores desde el menú lateral.</p><div class=\"doc-tip\">Mirai aprende tus preferencias cada 10 mensajes para personalizar sus respuestas.</div>"
  },
  "chat-web": {
    "title": "🌐 Búsqueda web",
    "body": "<p>Presiona el botón del globo (🌐) junto al campo de texto para activar la búsqueda web.</p><p>Cuando está activo, Mirai buscará información actual en internet antes de responderte.</p><div class=\"doc-tip\">Ideal para preguntas sobre noticias, datos recientes o temas que requieren información actualizada.</div>"
  },
  "chat-modelos": {
    "title": "🧠 Modelos de IA",
    "body": "<p>Puedes cambiar el modelo de IA desde el selector en la parte superior del chat:</p><ul><li><strong>DeepSeek</strong> — Modelo principal, rápido y preciso</li><li><strong>DeepSeek Reasoner</strong> — Para problemas complejos que requieren razonamiento profundo</li><li><strong>Llama</strong> — Alternativa ligera</li></ul>"
  },
  "chat-archivos": {
    "title": "📎 Adjuntar archivos",
    "body": "<p>Presiona el botón de clip (📎) para adjuntar documentos como contexto para la conversación.</p><p>Formatos soportados: PDF, Word, Excel, PowerPoint, CSV y texto plano.</p>"
  },
  "chat-voz": {
    "title": "🎙️ Modo voz",
    "body": "<p>Presiona el botón de micrófono para dictar tu mensaje por voz. Mirai transcribirá automáticamente lo que digas.</p>"
  },
  "gen-texto": {
    "title": "✍️ Generar texto",
    "body": "<p>Selecciona la pestaña \"Texto\" y elige el tipo: correo electrónico o cambio de tono.</p><h3>Correo</h3><p>Describe el correo que necesitas y Mirai lo redactará profesionalmente.</p><h3>Cambio de tono</h3><p>Pega un texto y selecciona el tono deseado (alegre, profesional, casual, etc.).</p>"
  },
  "gen-imagen": {
    "title": "🖼️ Generar imágenes",
    "body": "<p>Selecciona la pestaña \"Imagen\", elige un estilo (cinematográfico, cartoon, anime, fotorrealista) y describe lo que quieres.</p><div class=\"doc-tip\">Sé específico en tu descripción para obtener mejores resultados.</div>"
  },
  "gen-editar": {
    "title": "✏️ Editar imágenes",
    "body": "<p>Sube una imagen existente o pega su URL, selecciona un estilo predefinido y describe los cambios que deseas.</p><p>Puedes cambiar el fondo, aplicar estilos artísticos o ajustar la relación de aspecto.</p>"
  },
  "gen-video": {
    "title": "🎬 Generar video",
    "body": "<p>Selecciona la pestaña \"Video\", elige un estilo y describe la escena. La generación puede tardar hasta 2 minutos.</p>"
  },
  "gen-musica": {
    "title": "🎵 Generar música",
    "body": "<p>Selecciona la pestaña \"Música\", elige un género (pop, rock, balada, orquestal, etc.) y describe el ambiente o tema.</p>"
  },
  "gen-historial": {
    "title": "🗂️ Historial de generaciones",
    "body": "<p>Todas tus generaciones se guardan automáticamente. El historial se muestra debajo de la sección de generación y se filtra según la pestaña activa.</p>"
  },
  "proj-crear": {
    "title": "➕ Crear proyecto",
    "body": "<p>Presiona \"Nuevo proyecto\", ingresa el nombre, descripción y selecciona las tecnologías utilizadas. Los proyectos se organizan por categoría automáticamente.</p>"
  },
  "proj-archivos": {
    "title": "📁 Subir archivos",
    "body": "<p>Dentro de un proyecto, puedes subir archivos de código que servirán como contexto cuando chatees con la IA sobre el proyecto.</p>"
  },
  "proj-code": {
    "title": "💻 Abrir en Code",
    "body": "<p>Presiona \"Abrir en Code\" para iniciar una conversación con la IA usando los archivos del proyecto como contexto.</p>"
  },
  "cursos-buscar": {
    "title": "🔍 Buscar cursos",
    "body": "<p>Usa la barra de búsqueda y los filtros por categoría (Web, Backend, Datos, etc.) y nivel (Principiante, Intermedio, Avanzado) para encontrar cursos.</p>"
  },
  "cursos-lecciones": {
    "title": "📖 Lecciones",
    "body": "<p>Cada curso tiene múltiples lecciones con contenido teórico. Avanza a tu ritmo y marca las lecciones completadas.</p>"
  },
  "cursos-chat": {
    "title": "💬 Chat educativo",
    "body": "<p>Dentro de cada lección puedes chatear con Mirai, quien tendrá como contexto el contenido de la lección para ayudarte a entender mejor.</p>"
  },
  "aula-secciones": {
    "title": "📋 Secciones",
    "body": "<p>Las secciones son grupos de clase creados por el profesor. Cada sección tiene sus propias tareas y calificaciones.</p>"
  },
  "aula-entregas": {
    "title": "📤 Entregas",
    "body": "<p>Sube tus trabajos y tareas asignadas por el profesor dentro de cada sección. Los formatos aceptados dependen de cada tarea.</p>"
  },
  "aula-calificaciones": {
    "title": "📊 Calificaciones",
    "body": "<p>Consulta tus calificaciones por sección. El profesor puede publicar notas y retroalimentación.</p>"
  },
  "inv-agregar": {
    "title": "➕ Agregar producto",
    "body": "<p>Presiona \"Nuevo producto\", completa el formulario con nombre, categoría, cantidad, precio y foto opcional.</p>"
  },
  "inv-buscar": {
    "title": "🔍 Buscar y filtrar",
    "body": "<p>Usa la barra de búsqueda para encontrar productos por nombre. Filtra por categoría o estado de stock.</p>"
  },
  "inv-alertas": {
    "title": "⚠️ Alertas de stock",
    "body": "<p>Los productos con stock bajo (5 unidades o menos) aparecen con una alerta en el panel de inicio.</p>"
  },
  "task-kanban": {
    "title": "⊞ Vista Kanban",
    "body": "<p>Arrastra y organiza tus tareas entre columnas: Pendiente, En Progreso, Revisión y Completado.</p><p>Cada tarjeta muestra prioridad, asignado, fecha de vencimiento y progreso del checklist.</p>"
  },
  "task-gantt": {
    "title": "📅 Vista Gantt",
    "body": "<p>Visualiza tus tareas en una línea de tiempo. Las barras representan la duración estimada y se posicionan según la fecha de vencimiento.</p><div class=\"doc-tip\">Desliza horizontalmente para ver más días. El día actual se marca con una línea vertical.</div>"
  },
  "task-calendario": {
    "title": "📆 Vista calendario",
    "body": "<p>Visualización mensual de tareas. Cada día muestra las tareas programadas como pastillas de colores según su prioridad.</p>"
  },
  "task-ia": {
    "title": "✨ Asistente IA",
    "body": "<p>Escribe el título de una tarea y la IA generará automáticamente la descripción, prioridad sugerida y subtareas.</p>"
  },
  "task-push": {
    "title": "🔔 Notificaciones push",
    "body": "<p>Activa el toggle de notificaciones para recibir alertas cuando tus tareas estén por vencer.</p>"
  },
  "inv-busqueda": {
    "title": "🔍 Realizar búsqueda",
    "body": "<p>Escribe tu pregunta de investigación. Mirai buscará en la web, noticias y papers académicos simultáneamente.</p><p>Los resultados se sintetizan en un resumen con citas.</p>"
  },
  "inv-fuentes": {
    "title": "📚 Fuentes y bibliografía",
    "body": "<p>Cada búsqueda genera automáticamente las referencias en formato APA 7 listas para copiar.</p>"
  },
  "inv-historial": {
    "title": "🕐 Historial",
    "body": "<p>Tus búsquedas se guardan automáticamente. Puedes consultar o eliminar búsquedas anteriores.</p>"
  },
  "loc-agregar": {
    "title": "📍 Agregar marcador",
    "body": "<p>Toca cualquier punto del mapa para colocar un marcador. Agrega título, descripción e imágenes.</p>"
  },
  "loc-imagenes": {
    "title": "📷 Subir imágenes",
    "body": "<p>Puedes agregar hasta 5 imágenes por marcador. Se muestran como galería al ver los detalles del punto.</p>"
  },
  "loc-gps": {
    "title": "📡 GPS",
    "body": "<p>Presiona el botón de GPS para centrar el mapa en tu ubicación actual y crear un marcador allí.</p>"
  },
  "mirror-subir": {
    "title": "📤 Subir fotos",
    "body": "<p>Arrastra o selecciona fotos para subirlas al organizador. Se almacenan en la nube de forma segura.</p>"
  },
  "mirror-albumes": {
    "title": "📁 Álbumes",
    "body": "<p>Organiza tus fotos en álbumes temáticos para encontrarlas fácilmente.</p>"
  },
  "att-qr": {
    "title": "📱 Escanear QR",
    "body": "<p>Escanea el código QR generado por el profesor para registrar tu asistencia automáticamente.</p>"
  },
  "att-historial": {
    "title": "📋 Historial",
    "body": "<p>Consulta tu registro de asistencia por fecha y clase.</p>"
  },
  "settings-tema": {
    "title": "🎨 Tema y colores",
    "body": "<p>Elige entre modo claro y oscuro. Selecciona uno de los 10 colores de acento disponibles para personalizar toda la interfaz.</p>"
  },
  "settings-prefs": {
    "title": "🧠 Preferencias IA",
    "body": "<p>Mirai detecta automáticamente tus gustos y preferencias cada 10 mensajes. Puedes ver y entender qué ha aprendido sobre ti en la sección \"Tus preferencias\".</p>"
  },
  "panel-usuarios": {
    "title": "👥 Usuarios",
    "body": "<p>Lista todos los usuarios registrados en la plataforma. Busca por nombre, email o DNI.</p>"
  },
  "panel-roles": {
    "title": "🛡️ Roles",
    "body": "<p>Asigna roles a los usuarios: Estudiante, Profesor o Admin. Cada rol tiene permisos diferentes.</p>"
  },
  "purchase-planes": {
    "title": "💎 Planes disponibles",
    "body": "<p>Mirai AI ofrece 5 planes de suscripción mensual:</p><ul><li><strong>Basic</strong> — 10 imágenes, 2 músicas, 1 video por día. Ideal para explorar la plataforma. (Gratis)</li><li><strong>Students</strong> — 25 imágenes, 5 músicas, 3 videos por día. Pensado para estudiantes con necesidades académicas y creativas. ($4.99/mes)</li><li><strong>Development</strong> — 50 imágenes, 12 músicas, 8 videos por día. Para desarrolladores y profesionales. Incluye acceso a DeepSeek V4-Pro y edición avanzada. ($9.99/mes)</li><li><strong>Designer</strong> — 120 imágenes, 25 músicas, 15 videos por día. Para creativos con alta demanda. Incluye LoRA, Try-On y Video Avatar. ($19.99/mes)</li><li><strong>Max</strong> — Generación ilimitada, todos los modelos, soporte prioritario. ($49.99/mes)</li></ul><p>El chat con IA (texto) es ilimitado en todos los planes.</p>"
  },
  "purchase-api": {
    "title": "📊 Costos de API",
    "body": "<p>Los tokens de cada plan se calculan en base al costo real de las APIs:</p><h3>Pruna AI (Generación visual)</h3><ul><li>Imagen: $0.005/imagen</li><li>Edición de imagen: $0.010/imagen</li><li>Video: $0.02/segundo (~$0.10 por video de 5s)</li><li>Upscale: $0.10/imagen 8MP</li><li>Try-On: $0.015/primera prenda</li><li>Entrenamiento LoRA: $1.80/1000 pasos</li></ul><h3>DeepSeek (Chat IA)</h3><ul><li>V4-Flash Input: $0.14/1M tokens (cache miss)</li><li>V4-Flash Output: $0.28/1M tokens</li><li>V4-Pro Input: $0.435/1M tokens</li><li>V4-Pro Output: $0.87/1M tokens</li></ul><div class=\"doc-tip\">El costo de texto por mensaje es mínimo (~$0.0006), por eso el chat es ilimitado en todos los planes.</div>"
  },
  "panel-planes": {
    "title": "⭐ Planes",
    "body": "<p>Asigna planes de tokens a los usuarios:</p><ul><li><strong>Basic</strong> — 10 imágenes, 2 músicas, 1 video por día (Gratis)</li><li><strong>Students</strong> — 25 imágenes, 5 músicas, 3 videos por día ($4.99/mes)</li><li><strong>Development</strong> — 50 imágenes, 12 músicas, 8 videos por día ($9.99/mes)</li><li><strong>Designer</strong> — 120 imágenes, 25 músicas, 15 videos por día ($19.99/mes)</li><li><strong>Max</strong> — Tokens ilimitados ($49.99/mes)</li></ul><p>Los tokens se calculan en base al costo de las APIs de Pruna AI y DeepSeek. Texto ilimitado en todos los planes.</p><p><a href=\"purchase\">Ver página de planes →</a></p>"
  }
};
