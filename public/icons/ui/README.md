# Iconos de módulo

PNG a 48 px (1x) y 96 px (2x) usados en el grid de navegación lateral, en los
accesos directos del inicio y en las tarjetas de `documentation.html`.
Sustituyen a los emoji que se usaban antes, que se veían distintos en cada
sistema operativo.

Fuente: [Icons8](https://icons8.com) — estilo *Windows 11 Color*.
La licencia gratuita de Icons8 exige atribución visible (un enlace a
https://icons8.com desde el sitio); si se prefiere no mostrarla hace falta una
licencia de pago.

## Convención

El nombre del archivo es el del módulo, no el del icono original de Icons8, para
que `iconHtml('inventory')` y `/icons/ui/inventory-48.png` coincidan:

| Archivo         | Módulo              | Emoji anterior |
| --------------- | ------------------- | -------------- |
| `home`          | Hogar               | 🏠             |
| `chat`          | Chat                | 💬             |
| `projects`      | Proyectos           | 🗂️             |
| `generation`    | Generación con IA   | 🖌️             |
| `courses`       | Cursos              | 📚             |
| `classroom`     | Aula Virtual        | 🏫             |
| `inventory`     | Inventario          | 📦             |
| `sales`         | Ventas              | 🛒             |
| `photos`        | Fotos               | 🖼️             |
| `format`        | Formato             | 📝             |
| `apa`           | APA 7               | 📄             |
| `attendance`    | Asistencia          | ✅             |
| `investigation` | Investigar          | 🔭             |
| `reports`       | Reportes            | 📋             |
| `tasks`         | Tareas              | 🗒️             |
| `diet`          | Dieta               | 🥗             |
| `location`      | Ubicación           | 📍             |
| `panel`         | Panel               | 🔑             |
| `docs`          | Documentación       | 📖             |
| `plans`         | Planes              | 💎             |

## Pendientes

Todavía sin arte propio (siguen como emoji):

- **Configuración** ⚙️ — accesos directos de `index.html` y tarjeta de `documentation.html`
- **Acerca de** ❔ — accesos directos de `index.html`

Al añadirlos: descargar de Icons8 en Windows 11 Color a 48 y 96 px, guardarlos
aquí como `settings-48/96.png` y `about-48/96.png`, añadirlos a `MODULE_ICONS`
en `public/sw.js` y en `public/documentation.html`, y reemplazar los dos `<span
class="shortcut-icon">` que quedan en `public/index.html`.
