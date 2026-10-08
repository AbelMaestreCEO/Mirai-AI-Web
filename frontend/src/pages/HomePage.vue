<template>
  
  <!-- HEADER -->
  <header class="header">
    <MenuToggle />
    <h1 class="header-title">Inicio</h1>
    <div style="width: 40px;"></div>
  </header>
  <!-- CONTENIDO PRINCIPAL -->
  <main class="home-main">
    <!-- 1. BARRA PARA NUEVO CHAT -->
    <section class="home-input-section">
      <img src="/favicon.ico" alt="Mirai AI" class="home-logo">
      <div class="home-greeting">
        <h1 class="welcome-title" style="display: inline-flex; flex-wrap: wrap; justify-content: center; gap: 0.25em; overflow: visible; -webkit-text-fill-color: unset; background: none;">
          <span v-for="(word, i) in greeting" :key="i" class="welcome-word" :class="{ shown: i < shownWords }" :style="{ backgroundImage: titleGradient }">{{ word }}</span>
        </h1>
        <p>Escribe tu pregunta o elige una opción</p>
      </div>
      <div class="welcome-input-wrapper">
        <textarea ref="inputRef" v-model="message" class="welcome-textarea" placeholder="Pregúntame lo que quieras..."
          rows="1" autocomplete="off" spellcheck="false" @input="autoResize" @keydown.enter.exact.prevent="sendToChat"></textarea>
        <button class="send-button" aria-label="Enviar mensaje" @click="sendToChat">
          <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
          </svg>
        </button>
      </div>
    </section>
    <!-- 2. ACCESOS DIRECTOS (4 visibles + desplegable vertical) -->
    <div class="shortcuts" :class="{ 'is-open': shortcutsOpen }">
     <div class="shortcuts-grid">
      <AppLink to="chat" class="shortcut-card">
        <img class="shortcut-icon" src="/icons/ui/chat-48.png" srcset="/icons/ui/chat-48.png 1x, /icons/ui/chat-96.png 2x" alt="" width="26" height="26" loading="lazy" decoding="async">
        <span class="shortcut-label">Chat IA</span>
      </AppLink>
      <AppLink to="projects" class="shortcut-card">
        <img class="shortcut-icon" src="/icons/ui/projects-48.png" srcset="/icons/ui/projects-48.png 1x, /icons/ui/projects-96.png 2x" alt="" width="26" height="26" loading="lazy" decoding="async">
        <span class="shortcut-label">Proyectos</span>
      </AppLink>
      <AppLink to="generation" class="shortcut-card">
        <img class="shortcut-icon" src="/icons/ui/generation-48.png" srcset="/icons/ui/generation-48.png 1x, /icons/ui/generation-96.png 2x" alt="" width="26" height="26" loading="lazy" decoding="async">
        <span class="shortcut-label">Generación</span>
      </AppLink>
      <AppLink to="course_category" class="shortcut-card">
        <img class="shortcut-icon" src="/icons/ui/courses-48.png" srcset="/icons/ui/courses-48.png 1x, /icons/ui/courses-96.png 2x" alt="" width="26" height="26" loading="lazy" decoding="async">
        <span class="shortcut-label">Cursos</span>
      </AppLink>
     </div>
     <div id="shortcuts-more" class="shortcuts-more" :inert="!shortcutsOpen">
     <div class="shortcuts-grid">
      <AppLink to="classroom" class="shortcut-card">
        <img class="shortcut-icon" src="/icons/ui/classroom-48.png" srcset="/icons/ui/classroom-48.png 1x, /icons/ui/classroom-96.png 2x" alt="" width="26" height="26" loading="lazy" decoding="async">
        <span class="shortcut-label">Aula</span>
      </AppLink>
      <AppLink to="inventory" class="shortcut-card">
        <img class="shortcut-icon" src="/icons/ui/inventory-48.png" srcset="/icons/ui/inventory-48.png 1x, /icons/ui/inventory-96.png 2x" alt="" width="26" height="26" loading="lazy" decoding="async">
        <span class="shortcut-label">Inventario</span>
      </AppLink>
      <AppLink to="mirror" class="shortcut-card">
        <img class="shortcut-icon" src="/icons/ui/photos-48.png" srcset="/icons/ui/photos-48.png 1x, /icons/ui/photos-96.png 2x" alt="" width="26" height="26" loading="lazy" decoding="async">
        <span class="shortcut-label">Fotos</span>
      </AppLink>
      <AppLink to="format" class="shortcut-card">
        <img class="shortcut-icon" src="/icons/ui/format-48.png" srcset="/icons/ui/format-48.png 1x, /icons/ui/format-96.png 2x" alt="" width="26" height="26" loading="lazy" decoding="async">
        <span class="shortcut-label">Formato</span>
      </AppLink>
      <AppLink to="apa" class="shortcut-card">
        <img class="shortcut-icon" src="/icons/ui/apa-48.png" srcset="/icons/ui/apa-48.png 1x, /icons/ui/apa-96.png 2x" alt="" width="26" height="26" loading="lazy" decoding="async">
        <span class="shortcut-label">APA 7</span>
      </AppLink>
      <AppLink to="attendance" class="shortcut-card">
        <img class="shortcut-icon" src="/icons/ui/attendance-48.png" srcset="/icons/ui/attendance-48.png 1x, /icons/ui/attendance-96.png 2x" alt="" width="26" height="26" loading="lazy" decoding="async">
        <span class="shortcut-label">Asistencia</span>
      </AppLink>
      <AppLink to="investigation" class="shortcut-card">
        <img class="shortcut-icon" src="/icons/ui/investigation-48.png" srcset="/icons/ui/investigation-48.png 1x, /icons/ui/investigation-96.png 2x" alt="" width="26" height="26" loading="lazy" decoding="async">
        <span class="shortcut-label">Investigar</span>
      </AppLink>
      <AppLink to="report" class="shortcut-card">
        <img class="shortcut-icon" src="/icons/ui/reports-48.png" srcset="/icons/ui/reports-48.png 1x, /icons/ui/reports-96.png 2x" alt="" width="26" height="26" loading="lazy" decoding="async">
        <span class="shortcut-label">Reportes</span>
      </AppLink>
      <AppLink to="task" class="shortcut-card">
        <img class="shortcut-icon" src="/icons/ui/tasks-48.png" srcset="/icons/ui/tasks-48.png 1x, /icons/ui/tasks-96.png 2x" alt="" width="26" height="26" loading="lazy" decoding="async">
        <span class="shortcut-label">Tareas</span>
      </AppLink>
      <AppLink to="diet" class="shortcut-card">
        <img class="shortcut-icon" src="/icons/ui/diet-48.png" srcset="/icons/ui/diet-48.png 1x, /icons/ui/diet-96.png 2x" alt="" width="26" height="26" loading="lazy" decoding="async">
        <span class="shortcut-label">Dieta</span>
      </AppLink>
      <AppLink to="location" class="shortcut-card">
        <img class="shortcut-icon" src="/icons/ui/location-48.png" srcset="/icons/ui/location-48.png 1x, /icons/ui/location-96.png 2x" alt="" width="26" height="26" loading="lazy" decoding="async">
        <span class="shortcut-label">Ubicación</span>
      </AppLink>
      <AppLink to="panel" class="shortcut-card">
        <img class="shortcut-icon" src="/icons/ui/panel-48.png" srcset="/icons/ui/panel-48.png 1x, /icons/ui/panel-96.png 2x" alt="" width="26" height="26" loading="lazy" decoding="async">
        <span class="shortcut-label">Panel</span>
      </AppLink>
      <AppLink to="settings" class="shortcut-card">
        <span class="shortcut-icon">⚙️</span>
        <span class="shortcut-label">Configuración</span>
      </AppLink>
      <a href="documentation" class="shortcut-card">
        <img class="shortcut-icon" src="/icons/ui/docs-48.png" srcset="/icons/ui/docs-48.png 1x, /icons/ui/docs-96.png 2x" alt="" width="26" height="26" loading="lazy" decoding="async">
        <span class="shortcut-label">Docs</span>
      </a>
      <a href="purchase" class="shortcut-card">
        <img class="shortcut-icon" src="/icons/ui/plans-48.png" srcset="/icons/ui/plans-48.png 1x, /icons/ui/plans-96.png 2x" alt="" width="26" height="26" loading="lazy" decoding="async">
        <span class="shortcut-label">Planes</span>
      </a>
      <a href="about" class="shortcut-card">
        <span class="shortcut-icon">❔</span>
        <span class="shortcut-label">Acerca de</span>
      </a>
     </div>
     </div>
     <button type="button" class="shortcuts-toggle" :aria-expanded="shortcutsOpen" aria-controls="shortcuts-more" @click="shortcutsOpen = !shortcutsOpen">
        <span class="shortcuts-toggle-label">{{ shortcutsOpen ? 'Mostrar menos' : 'Más aplicaciones' }}</span>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6z"/></svg>
     </button>
    </div>
    <!-- 3. TOKENS DIARIOS -->
    <div class="tokens-card">
      <div class="tokens-header">
        <span class="tokens-title">Tokens disponibles hoy</span>
        <span class="tokens-plan-badge">{{ planLabel }}</span>
      </div>
      <div class="tokens-grid">
        <div class="token-item">
          <span class="token-icon">🖼️</span>
          <span class="token-label">Imágenes</span>
          <div class="token-bar-wrapper">
            <div class="token-bar" :class="tokenBars.imagen.cls" :style="{ width: tokenBars.imagen.width }"></div>
          </div>
          <span class="token-count">{{ tokenBars.imagen.count }}</span>
        </div>
        <div class="token-item">
          <span class="token-icon">🎵</span>
          <span class="token-label">Música</span>
          <div class="token-bar-wrapper">
            <div class="token-bar" :class="tokenBars.musica.cls" :style="{ width: tokenBars.musica.width }"></div>
          </div>
          <span class="token-count">{{ tokenBars.musica.count }}</span>
        </div>
        <div class="token-item">
          <span class="token-icon">🎬</span>
          <span class="token-label">Videos</span>
          <div class="token-bar-wrapper">
            <div class="token-bar" :class="tokenBars.video.cls" :style="{ width: tokenBars.video.width }"></div>
          </div>
          <span class="token-count">{{ tokenBars.video.count }}</span>
        </div>
        <div class="token-item">
          <span class="token-icon">✍️</span>
          <span class="token-label">Texto</span>
          <div class="token-bar-wrapper">
            <div class="token-bar" :class="{ unlimited: tokensLoaded }" style="width:100%"></div>
          </div>
          <span class="token-count">Ilimitado</span>
        </div>
      </div>
      <!-- Chart -->
      <div class="tokens-chart-section">
        <div class="tokens-chart-nav">
          <button @click="prevMonth">‹</button>
          <span class="tokens-chart-month">{{ chartLabel }}</span>
          <button @click="nextMonth">›</button>
        </div>
        <div class="tokens-chart-wrap">
          <div class="tokens-chart">
            <div v-for="day in chartDays" :key="day.n" class="chart-day" :class="{ today: day.today }" :title="day.title">
              <div class="chart-bar-stack">
                <div v-if="day.img > 0" class="chart-seg img" :style="{ height: day.img + 'px' }"></div>
                <div v-if="day.mus > 0" class="chart-seg mus" :style="{ height: day.mus + 'px' }"></div>
                <div v-if="day.vid > 0" class="chart-seg vid" :style="{ height: day.vid + 'px' }"></div>
                <div v-if="!day.img && !day.mus && !day.vid" class="chart-seg" style="height: 2px; background: var(--glass-border, #ddd)"></div>
              </div>
              <div class="chart-day-label">{{ day.n }}</div>
            </div>
          </div>
        </div>
        <div class="tokens-chart-legend">
          <span class="chart-legend-item"><span class="chart-legend-dot" style="background:var(--accent-color,#6750A4)"></span>Imágenes</span>
          <span class="chart-legend-item"><span class="chart-legend-dot" style="background:#F57C00"></span>Música</span>
          <span class="chart-legend-item"><span class="chart-legend-dot" style="background:#1565C0"></span>Videos</span>
        </div>
      </div>
    </div>
    <!-- 4. DASHBOARD -->
    <div class="dashboard-container">
      <h2 class="dashboard-section-title">Panel de Actividad</h2>
      <div class="dashboard-grid">
        <!-- Tareas del Aula Virtual pendientes -->
        <div class="dashboard-card">
          <div class="dashboard-card-header">
            <h3>🏫 Aula Virtual</h3>
            <span v-if="alerts.classroom.items.length" class="badge badge-warning" style="display: inline-block">{{ alerts.classroom.items.length }}</span>
          </div>
          <ul class="dashboard-alert-list">
            <li v-if="!alerts.classroom.loaded" class="dashboard-empty">
              <div class="dashboard-empty-icon">📭</div>
              Cargando tareas del aula...
            </li>
            <li v-else-if="!alerts.classroom.items.length" class="dashboard-empty">
              <div class="dashboard-empty-icon">✅</div>{{ alerts.classroom.empty }}
            </li>
            <template v-else>
              <li v-for="(item, i) in alerts.classroom.items.slice(0, 5)" :key="i" class="dashboard-alert-item">
                <span class="alert-icon">{{ item.icon }}</span>
                <span class="alert-text">{{ item.text }}</span>
                <span class="alert-meta">{{ item.meta }}</span>
              </li>
            </template>
          </ul>
          <AppLink to="classroom" class="dashboard-card-link">Ver aula virtual →</AppLink>
        </div>
        <!-- Tareas personales pendientes -->
        <div class="dashboard-card">
          <div class="dashboard-card-header">
            <h3>🗒️ Tareas Pendientes</h3>
            <span v-if="alerts.tasks.items.length" class="badge badge-info" style="display: inline-block">{{ alerts.tasks.items.length }}</span>
          </div>
          <ul class="dashboard-alert-list">
            <li v-if="!alerts.tasks.loaded" class="dashboard-empty">
              <div class="dashboard-empty-icon">📭</div>
              Cargando tareas...
            </li>
            <li v-else-if="!alerts.tasks.items.length" class="dashboard-empty">
              <div class="dashboard-empty-icon">✅</div>{{ alerts.tasks.empty }}
            </li>
            <template v-else>
              <li v-for="(item, i) in alerts.tasks.items.slice(0, 5)" :key="i" class="dashboard-alert-item">
                <span class="alert-icon">{{ item.icon }}</span>
                <span class="alert-text">{{ item.text }}</span>
                <span class="alert-meta">{{ item.meta }}</span>
              </li>
            </template>
          </ul>
          <AppLink to="task" class="dashboard-card-link">Ver todas las tareas →</AppLink>
        </div>
        <!-- Stock bajo en inventario -->
        <div class="dashboard-card">
          <div class="dashboard-card-header">
            <h3>📦 Stock Bajo</h3>
            <span v-if="alerts.inventory.items.length" class="badge badge-danger" style="display: inline-block">{{ alerts.inventory.items.length }}</span>
          </div>
          <ul class="dashboard-alert-list">
            <li v-if="!alerts.inventory.loaded" class="dashboard-empty">
              <div class="dashboard-empty-icon">📭</div>
              Cargando inventario...
            </li>
            <li v-else-if="!alerts.inventory.items.length" class="dashboard-empty">
              <div class="dashboard-empty-icon">✅</div>{{ alerts.inventory.empty }}
            </li>
            <template v-else>
              <li v-for="(item, i) in alerts.inventory.items.slice(0, 5)" :key="i" class="dashboard-alert-item">
                <span class="alert-icon">{{ item.icon }}</span>
                <span class="alert-text">{{ item.text }}</span>
                <span class="alert-meta">{{ item.meta }}</span>
              </li>
            </template>
          </ul>
          <AppLink to="inventory" class="dashboard-card-link">Ver inventario →</AppLink>
        </div>
      </div>
    </div>
  </main>
  <!-- FOOTER -->
  <footer class="welcome-footer">
    <div class="welcome-footer-grid">
      <div class="welcome-footer-col welcome-footer-brand-col">
        <a href="https://aberumirai.com" class="footer-brand-link">
          <img src="https://assets.aberumirai.com/imgs/icon.webp" alt="Logo Aberu & Mirai"
            class="footer-brand-img">
          <span class="footer-brand-text">Aberu & Mirai Company</span>
        </a>
        <p class="footer-brand-desc">Tu asistente inteligente potenciado por IA. Aprende, gestiona y crea con
          Mirai.</p>
        <div class="footer-social">
          <a href="https://www.facebook.com/AberuMiraiCompany" aria-label="Facebook">
            <img src="https://assets.aberumirai.com/imgs/icons/32/icons8-facebook-32.webp" alt="Facebook">
          </a>
          <a href="https://twitter.com/AberuMirai" aria-label="Twitter">
            <img src="https://assets.aberumirai.com/imgs/icons/32/icons8-twitter-32.webp" alt="Twitter">
          </a>
          <a href="https://www.tiktok.com/@aberu_mirai_company" aria-label="TikTok">
            <img src="https://assets.aberumirai.com/imgs/icons/32/icons8-tiktok-32.webp" alt="TikTok">
          </a>
          <a href="https://www.instagram.com/abel_maestre_ceo/" aria-label="Instagram">
            <img src="https://assets.aberumirai.com/imgs/icons/32/icons8-instagram-32.webp" alt="Instagram">
          </a>
          <a href="https://github.com/AbelMaestreCEO" aria-label="GitHub">
            <img src="https://assets.aberumirai.com/imgs/icons/32/icons8-github-32.webp" alt="GitHub">
          </a>
        </div>
      </div>
      <div class="welcome-footer-col">
        <h4 class="footer-col-title">Navegación</h4>
        <ul class="footer-col-links">
          <li><AppLink to="chat">💬 Chat IA</AppLink></li>
          <li><AppLink to="course_category">📚 Cursos</AppLink></li>
          <li><AppLink to="classroom">🏫 Aula Virtual</AppLink></li>
          <li><AppLink to="inventory">📦 Inventario</AppLink></li>
          <li><AppLink to="mirror">🖼️ Organizador de Fotos</AppLink></li>
          <li><AppLink to="format">📝 Formatos DOCX</AppLink></li>
        </ul>
      </div>
      <div class="welcome-footer-col">
        <h4 class="footer-col-title">Servicios</h4>
        <ul class="footer-col-links">
          <li><a href="https://aberumirai.com#technology">Tecnología & IA</a></li>
          <li><a href="https://aberumirai.com#education">Educación</a></li>
          <li><a href="https://aberumirai.com#sweets">Comidas Dulces</a></li>
          <li><a href="https://aberumirai.com#health">Salud y Bienestar</a></li>
          <li><a href="https://aberumirai.com#clothes">Ropa y Artículos</a></li>
        </ul>
      </div>
      <div class="welcome-footer-col">
        <h4 class="footer-col-title">Empresa</h4>
        <ul class="footer-col-links">
          <li><a href="https://aberumirai.com">Sobre Nosotros</a></li>
          <li><a href="https://aberumirai.com#contact">Contacto</a></li>
          <li><a href="https://dev.aberumirai.com">Desarrollos</a></li>
          <li><a href="https://miraiplus.aberumirai.com">Mirai Plus</a></li>
        </ul>
      </div>
    </div>
    <div class="welcome-footer-bottom">
      <p>&copy;
        {{ year }} Aberu & Mirai Company. Todos los derechos
        reservados.
      </p>
    </div>
  </footer>
</template>

<script setup lang="ts">
// Migración de public/index.html (inicio).
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import MenuToggle from '@/components/MenuToggle.vue';
import AppLink from '@/components/AppLink.vue';
import { api } from '@/lib/api';
import { useRouter } from 'vue-router';
import { goToPage } from '@/lib/pages';

const router = useRouter();
const year = new Date().getFullYear();
const timers: number[] = [];
onBeforeUnmount(() => timers.forEach((t) => clearTimeout(t)));

// ── 1. Saludo del día (palabra a palabra) y caja para empezar un chat ──────
const GREETINGS: Record<number, string[]> = {
  0: ['¡Feliz domingo!', '¿En qué te ayudo?', 'Descansa y aprende.', '¡Hola! ¿Qué necesitas?', 'Domingo de productividad', '¿Lista nueva hoy?', 'Bienvenido de nuevo.', '¿Exploramos algo nuevo?', 'Tu IA está lista.', '¿Qué aprendemos hoy?'],
  1: ['¡Feliz lunes!', '¿En qué te ayudo hoy?', 'Nuevo lunes, nuevas metas.', '¡Arranquemos la semana!', '¿Comenzamos con fuerza?', '¿Qué necesitas hoy?', 'Lunes de productividad', '¿En qué puedo ayudarte?', 'Tu semana empieza bien.', '¡Hola! Estoy aquí.'],
  2: ['¡Feliz martes!', '¿En qué te ayudo?', '¿Seguimos avanzando?', 'Martes de enfoque', '¿Qué aprendemos hoy?', '¡Hola! ¿Qué necesitas?', '¿En qué puedo ayudarte?', 'Estoy lista para ti.', '¿Productividad al máximo?', '¡Vamos con todo!'],
  3: ['¡Feliz miércoles!', '¡Mitad de semana, vamos!', '¿En qué te ayudo?', '¿Qué necesitas hoy?', 'Miércoles en marcha', '¡Hola! Aquí estoy.', '¿En qué puedo ayudarte?', '¿Exploramos algo nuevo?', 'La semana va genial.', '¿Qué aprendemos hoy?'],
  4: ['¡Feliz jueves!', '¿En qué te ayudo?', '¡Ya casi es viernes!', '¿Qué necesitas hoy?', 'Jueves productivo', '¡Hola! Estoy lista.', '¿En qué puedo ayudarte?', '¿Terminamos fuerte?', '¡Ánimo, casi llegamos!', '¿Qué aprendemos hoy?'],
  5: ['¡Feliz viernes!', '¡Cerremos con todo!', '¿En qué te ayudo?', '¡Casi fin de semana!', 'Viernes de logros', '¿Qué necesitas hoy?', '¡Hola! ¿Qué pendientes?', '¿En qué puedo ayudarte?', '¡Un gran cierre de semana!', '¿Lo último de la semana?'],
  6: ['¡Feliz sábado!', '¿En qué te ayudo?', 'Sábado de aprendizaje', '¿Qué exploramos hoy?', '¡Hola! ¿Por dónde empezamos?', '¿Fin de semana productivo?', '¿En qué puedo ayudarte?', '¡Relax con propósito!', '¿Qué aprendemos hoy?', 'Tu IA no descansa.'],
};
const todays = GREETINGS[new Date().getDay()] ?? [];
const greeting = (todays[Math.floor(Math.random() * todays.length)] ?? '¿En qué puedo ayudarte?').split(' ');
const shownWords = ref(0);
const titleGradient = ref('linear-gradient(135deg, #6750A4 0%, #7F67BE 50%, #9A82DB 100%)');

const message = ref('');
const inputRef = ref<HTMLTextAreaElement | null>(null);

function autoResize() {
  const el = inputRef.value;
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
}

function sendToChat() {
  const text = message.value.trim();
  if (!text) return;
  goToPage(router, 'chat', `initial_message=${encodeURIComponent(text)}`);
}

// ── 2. Accesos directos ──────────────────────────────────────────────────
const shortcutsOpen = ref(false);

// ── 3. Tokens del día y gráfica mensual ──────────────────────────────────
type TokenKind = 'imagen' | 'musica' | 'video';
interface TokenState {
  used: number;
  limit: number;
  remaining: number;
}
const PLAN_LABELS: Record<string, string> = {
  basic: '⭐ Basic',
  students: '🎓 Students',
  development: '💻 Development',
  designer: '🎨 Designer',
  max: '🚀 Max',
};

const planLabel = ref('⭐ Basic');
const tokensLoaded = ref(false);
const tokenBars = reactive<Record<TokenKind, { width: string; cls: string; count: string }>>({
  imagen: { width: '100%', cls: '', count: '10/10' },
  musica: { width: '100%', cls: '', count: '2/2' },
  video: { width: '100%', cls: '', count: '1/1' },
});

async function loadTokens() {
  try {
    const { ok, data } = await api.get<{ plan?: string; tokens?: Record<TokenKind, TokenState> }>('/api/user/tokens');
    if (!ok || !data.tokens) return;
    if (data.plan) planLabel.value = PLAN_LABELS[data.plan] ?? '⭐ Basic';
    for (const kind of ['imagen', 'musica', 'video'] as TokenKind[]) {
      const t = data.tokens[kind];
      if (!t) continue;
      if (t.limit === -1) {
        tokenBars[kind] = { width: '100%', cls: 'unlimited', count: 'Ilimitado' };
        continue;
      }
      const pct = t.limit > 0 ? (t.remaining / t.limit) * 100 : 0;
      tokenBars[kind] = { width: `${pct}%`, cls: pct <= 0 ? 'empty' : pct <= 30 ? 'low' : '', count: `${t.remaining}/${t.limit}` };
    }
    tokensLoaded.value = true;
  } catch {
    // Sin conexión: se quedan los valores por defecto, como antes.
  }
}

const MONTH_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const now = new Date();
const todayStr = now.toISOString().slice(0, 10);
const chartYear = ref(now.getFullYear());
const chartMonth = ref(now.getMonth());
const chartLabel = computed(() => `${MONTH_NAMES[chartMonth.value]} ${chartYear.value}`);

interface ChartDay {
  n: number;
  today: boolean;
  title: string;
  img: number;
  mus: number;
  vid: number;
}
const chartDays = ref<ChartDay[]>([]);

async function loadChart() {
  const y = chartYear.value;
  const m = chartMonth.value;
  const key = `${y}-${String(m + 1).padStart(2, '0')}`;
  chartDays.value = [];
  try {
    const { ok, data } = await api.get<{ days?: { token_date: string; imagen?: number; musica?: number; video?: number }[] }>(
      `/api/user/tokens/monthly?month=${key}`,
    );
    // Si se cambió de mes mientras cargaba, esta respuesta ya no vale.
    if (!ok || y !== chartYear.value || m !== chartMonth.value) return;
    const byDay = new Map((data.days ?? []).map((d) => [d.token_date, d]));
    const total = new Date(y, m + 1, 0).getDate();
    let maxVal = 1;
    for (const d of byDay.values()) maxVal = Math.max(maxVal, (d.imagen ?? 0) + (d.musica ?? 0) + (d.video ?? 0));
    const BAR = 60;
    const days: ChartDay[] = [];
    for (let i = 1; i <= total; i++) {
      const dateStr = `${key}-${String(i).padStart(2, '0')}`;
      const d = byDay.get(dateStr);
      const img = d?.imagen ?? 0;
      const mus = d?.musica ?? 0;
      const vid = d?.video ?? 0;
      days.push({
        n: i,
        today: dateStr === todayStr,
        title: `${i}/${m + 1}: ${img} img, ${mus} mus, ${vid} vid`,
        img: (img / maxVal) * BAR,
        mus: (mus / maxVal) * BAR,
        vid: (vid / maxVal) * BAR,
      });
    }
    chartDays.value = days;
  } catch (e) {
    console.warn('Chart error:', e);
  }
}

function prevMonth() {
  chartMonth.value--;
  if (chartMonth.value < 0) {
    chartMonth.value = 11;
    chartYear.value--;
  }
  void loadChart();
}

function nextMonth() {
  if (chartYear.value === now.getFullYear() && chartMonth.value === now.getMonth()) return;
  chartMonth.value++;
  if (chartMonth.value > 11) {
    chartMonth.value = 0;
    chartYear.value++;
  }
  void loadChart();
}

// ── 4. Panel de actividad (lee lo que otras páginas dejan en localStorage) ─
interface AlertItem {
  icon: string;
  text: string;
  meta: string;
}
type AlertKey = 'classroom' | 'tasks' | 'inventory';
const alerts = reactive<Record<AlertKey, { loaded: boolean; empty: string; items: AlertItem[] }>>({
  classroom: { loaded: false, empty: 'No hay tareas pendientes del aula', items: [] },
  tasks: { loaded: false, empty: 'No hay tareas pendientes', items: [] },
  inventory: { loaded: false, empty: 'No hay productos con stock bajo', items: [] },
});

function dueLabel(dateStr?: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const days = Math.ceil((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (days < 0) return 'Vencida';
  if (days === 0) return 'Hoy';
  if (days === 1) return 'Mañana';
  return `En ${days} días`;
}

function readList(...keys: string[]): Record<string, any>[] {
  try {
    for (const key of keys) {
      const raw = localStorage.getItem(key);
      if (raw) {
        const all = JSON.parse(raw);
        return Array.isArray(all) ? all.filter(Boolean) : [];
      }
    }
  } catch {
    // Dato corrupto o almacenamiento bloqueado: lista vacía.
  }
  return [];
}

function loadAlerts() {
  alerts.classroom.items = readList('mirai-classroom-tasks', 'classroom-tasks')
    .filter((t) => !t.status || t.status === 'pending' || t.status === 'pendiente' || !t.completed)
    .map((t) => ({ icon: '📝', text: t.title || t.name || t.materia || 'Tarea sin título', meta: dueLabel(t.dueDate || t.fecha || t.deadline) }));

  alerts.tasks.items = readList('mirai-tasks', 'tasks')
    .filter((t) => !t.completed && (!t.status || (t.status !== 'completed' && t.status !== 'done')))
    .map((t) => {
      const priority = t.priority || t.prioridad || '';
      const icon = priority === 'high' || priority === 'alta' ? '🔴' : priority === 'medium' || priority === 'media' ? '🟡' : '🔵';
      return { icon, text: t.title || t.name || t.texto || 'Tarea sin título', meta: dueLabel(t.dueDate || t.fecha || t.deadline) };
    });

  alerts.inventory.items = readList('mirai-inventory', 'inventory-products')
    .map((p) => ({ p, qty: parseInt(p.quantity || p.cantidad || p.stock || 0) }))
    .filter(({ qty }) => qty <= 5)
    .map(({ p, qty }) => ({ icon: qty === 0 ? '🚫' : '⚠️', text: p.name || p.nombre || p.title || 'Producto', meta: `${qty} uds.` }));

  alerts.classroom.loaded = alerts.tasks.loaded = alerts.inventory.loaded = true;
}

onMounted(() => {
  const css = getComputedStyle(document.documentElement).getPropertyValue('--accent-gradient').trim();
  if (css) titleGradient.value = css;
  greeting.forEach((_w, i) => timers.push(window.setTimeout(() => (shownWords.value = i + 1), 80 * i)));

  loadAlerts();
  void loadTokens();
  void loadChart();
});
</script>

<style>
/* CSS propio de la página antigua, limitado a ella (ver router: meta.page). */
/* El hueco del sidebar lo reserva la regla compartida del final de
 styles.css (familia B, a sangre completa), que sigue `--sidebar-w`. */

/* ===== LOGO ===== */
:where(body[data-page="index"]) .home-logo {
  display: block;
  margin: 0 auto 8px;
  width: 56px;
  height: 56px;
  object-fit: contain;
}

/* ===== ACCESOS DIRECTOS (4 columnas + desplegable vertical) ===== */
:where(body[data-page="index"]) .shortcuts {
  width: 100%;
  max-width: 760px;
  margin: 0 auto;
  padding: 0 40px 12px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: center;
}

:where(body[data-page="index"]) .shortcuts-grid {
  width: 100%;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

/* El panel extra se abre en vertical animando la fila de 0fr a 1fr */
:where(body[data-page="index"]) .shortcuts-more {
  width: 100%;
  display: grid;
  grid-template-rows: 0fr;
  visibility: hidden;
  transition: grid-template-rows 0.3s ease, visibility 0s linear 0.3s;
}

:where(body[data-page="index"]) .shortcuts-more > .shortcuts-grid {
  min-height: 0;
  overflow: hidden;
  padding: 0 2px;
  margin: 0 -2px;
}

:where(body[data-page="index"]) .shortcuts.is-open .shortcuts-more {
  grid-template-rows: 1fr;
  visibility: visible;
  transition: grid-template-rows 0.3s ease, visibility 0s;
}

:where(body[data-page="index"]) .shortcuts.is-open .shortcuts-more > .shortcuts-grid {
  padding-top: 12px;
}

:where(body[data-page="index"]) .shortcuts-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 12px;
  padding: 8px 18px;
  font: inherit;
  font-size: 0.8rem;
  font-weight: 500;
  color: var(--text-secondary, #49454F);
  background: var(--glass-bg, rgba(255, 255, 255, 0.94));
  border: 1px solid var(--glass-border, rgba(103, 80, 164, 0.12));
  border-radius: 999px;
  cursor: pointer;
  transition: border-color 0.2s ease, color 0.2s ease;
}

:where(body[data-page="index"]) .shortcuts-toggle:hover {
  border-color: var(--accent-color, #6750A4);
  color: var(--accent-color, #6750A4);
}

:where(body[data-page="index"]) .shortcuts-toggle svg {
  width: 16px;
  height: 16px;
  fill: currentColor;
  transition: transform 0.3s ease;
}

:where(body[data-page="index"]) .shortcuts.is-open .shortcuts-toggle svg {
  transform: rotate(180deg);
}

:where(body[data-page="index"]) .shortcut-card {
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 14px 8px;
  height: 90px;
  background: var(--glass-bg, rgba(255, 255, 255, 0.94));
  border: 1px solid var(--glass-border, rgba(103, 80, 164, 0.12));
  border-radius: var(--border-radius-lg, 16px);
  text-decoration: none;
  color: var(--text-primary, #1C1B1F);
  transition: all 0.25s ease;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

:where(body[data-page="index"]) .shortcut-card:hover {
  border-color: var(--accent-color, #6750A4);
  transform: translateY(-2px);
  box-shadow: 0 4px 16px var(--accent-glow, rgba(103, 80, 164, 0.15));
}

:where(body[data-page="index"]) .shortcut-icon {
  font-size: 1.5rem;
}

:where(body[data-page="index"]) img.shortcut-icon {
  width: 26px;
  height: 26px;
  object-fit: contain;
  display: block;
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.18));
}

:where(body[data-page="index"]) .shortcut-label {
  font-size: 0.72rem;
  font-weight: 500;
  text-align: center;
  white-space: nowrap;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--text-secondary, #49454F);
}

/* ===== TOKENS CARD ===== */
:where(body[data-page="index"]) .tokens-card {
  margin: 20px 20px 0;
  padding: 20px 24px;
  background: var(--glass-bg, rgba(255,255,255,0.94));
  border: 1px solid var(--glass-border, rgba(103,80,164,0.12));
  border-radius: var(--border-radius-lg, 16px);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}
:where(body[data-page="index"]) .tokens-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}
:where(body[data-page="index"]) .tokens-title {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--text-primary, #1C1B1F);
}
:where(body[data-page="index"]) .tokens-reset-hint {
  font-size: 0.7rem;
  color: var(--text-secondary, #49454F);
  opacity: 0.7;
}
:where(body[data-page="index"]) .tokens-plan-badge {
  display: inline-flex;
  align-items: center;
  padding: 0.2rem 0.65rem;
  border-radius: 20px;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  background: var(--secondary-container, #E8DEF8);
  color: var(--accent-color, #6750A4);
}
:where(body[data-page="index"]) .tokens-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 14px;
}
:where(body[data-page="index"]) .token-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}
:where(body[data-page="index"]) .token-icon { font-size: 1.4rem; }
:where(body[data-page="index"]) .token-label {
  font-size: 0.72rem;
  font-weight: 500;
  color: var(--text-secondary, #49454F);
}
:where(body[data-page="index"]) .token-bar-wrapper {
  width: 100%;
  height: 6px;
  background: var(--glass-border, rgba(103,80,164,0.12));
  border-radius: 3px;
  overflow: hidden;
}
:where(body[data-page="index"]) .token-bar {
  height: 100%;
  background: var(--accent-gradient, linear-gradient(135deg,#6750A4,#7F67BE));
  border-radius: 3px;
  transition: width 0.5s ease;
}
:where(body[data-page="index"]) .token-bar.low { background: linear-gradient(135deg,#E65100,#F57C00); }
:where(body[data-page="index"]) .token-bar.empty { background: #ccc; width: 0% !important; }
:where(body[data-page="index"]) .token-bar.unlimited { background: var(--accent-gradient, linear-gradient(135deg,#6750A4,#7F67BE)); width: 100% !important; }
:where(body[data-page="index"]) .token-count {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-primary, #1C1B1F);
}
@media (max-width: 480px) {
  :where(body[data-page="index"]) .tokens-grid { grid-template-columns: repeat(2, 1fr); gap: 12px; }
  :where(body[data-page="index"]) .tokens-card { margin: 12px 12px 0; padding: 16px; }
}

/* ===== TOKEN CHART ===== */
:where(body[data-page="index"]) .tokens-chart-section {
  margin-top: 16px;
  border-top: 1px solid var(--glass-border, rgba(103,80,164,0.1));
  padding-top: 14px;
}
:where(body[data-page="index"]) .tokens-chart-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}
:where(body[data-page="index"]) .tokens-chart-nav button {
  background: none;
  border: 1px solid var(--glass-border, rgba(103,80,164,0.12));
  border-radius: 8px;
  padding: 4px 10px;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-secondary, #49454F);
  cursor: pointer;
  transition: all 0.15s;
}
:where(body[data-page="index"]) .tokens-chart-nav button:hover {
  border-color: var(--accent-color, #6750A4);
  color: var(--accent-color, #6750A4);
}
:where(body[data-page="index"]) .tokens-chart-month {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-primary, #1C1B1F);
}
:where(body[data-page="index"]) .tokens-chart-wrap {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
  padding-bottom: 4px;
}
:where(body[data-page="index"]) .tokens-chart-wrap::-webkit-scrollbar { display: none; }
:where(body[data-page="index"]) .tokens-chart {
  display: flex;
  align-items: flex-end;
  gap: 3px;
  height: 90px;
  min-width: max-content;
}
:where(body[data-page="index"]) .chart-day {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  min-width: 14px;
}
:where(body[data-page="index"]) .chart-bar-stack {
  display: flex;
  flex-direction: column-reverse;
  gap: 1px;
  width: 12px;
  height: 70px;
  justify-content: flex-start;
}
:where(body[data-page="index"]) .chart-seg {
  width: 100%;
  border-radius: 2px;
  min-height: 0;
  transition: height 0.3s ease;
}
:where(body[data-page="index"]) .chart-seg.img { background: var(--accent-color, #6750A4); }
:where(body[data-page="index"]) .chart-seg.mus { background: #F57C00; }
:where(body[data-page="index"]) .chart-seg.vid { background: #1565C0; }
:where(body[data-page="index"]) .chart-day-label {
  font-size: 0.55rem;
  color: var(--text-secondary, #888);
  line-height: 1;
}
:where(body[data-page="index"]) .chart-day.today .chart-day-label {
  color: var(--accent-color, #6750A4);
  font-weight: 700;
}
:where(body[data-page="index"]) .tokens-chart-legend {
  display: flex;
  gap: 12px;
  justify-content: center;
  margin-top: 8px;
}
:where(body[data-page="index"]) .chart-legend-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 0.65rem;
  color: var(--text-secondary, #888);
}
:where(body[data-page="index"]) .chart-legend-dot {
  width: 8px;
  height: 8px;
  border-radius: 2px;
  flex-shrink: 0;
}

/* ===== DASHBOARD ===== */
:where(body[data-page="index"]) .dashboard-container {
  padding: 20px 20px 40px;
}

:where(body[data-page="index"]) .dashboard-section-title {
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--text-primary, #1C1B1F);
  margin: 24px 0 14px;
  padding-left: 4px;
}

:where(body[data-page="index"]) .dashboard-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 16px;
}

:where(body[data-page="index"]) .dashboard-card {
  background: var(--glass-bg, rgba(255, 255, 255, 0.94));
  border: 1px solid var(--glass-border, rgba(103, 80, 164, 0.12));
  border-radius: var(--border-radius-lg, 16px);
  padding: 22px 24px;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  transition: all 0.25s ease;
}

:where(body[data-page="index"]) .dashboard-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px var(--accent-glow, rgba(103, 80, 164, 0.12));
}

:where(body[data-page="index"]) .dashboard-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}

:where(body[data-page="index"]) .dashboard-card-header h3 {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--text-primary, #1C1B1F);
  display: flex;
  align-items: center;
  gap: 8px;
}

:where(body[data-page="index"]) .dashboard-card-header .badge {
  font-size: 0.7rem;
  font-weight: 700;
  padding: 3px 10px;
  border-radius: 20px;
  color: #fff;
}

:where(body[data-page="index"]) .badge-warning {
  background: linear-gradient(135deg, #E65100, #F57C00);
}

:where(body[data-page="index"]) .badge-danger {
  background: linear-gradient(135deg, #B71C1C, #D32F2F);
}

:where(body[data-page="index"]) .badge-info {
  background: var(--accent-gradient, linear-gradient(135deg, #6750A4, #7F67BE));
}

:where(body[data-page="index"]) .badge-success {
  background: linear-gradient(135deg, #2E7D32, #388E3C);
}

:where(body[data-page="index"]) .dashboard-alert-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

:where(body[data-page="index"]) .dashboard-alert-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-radius: var(--border-radius-md, 12px);
  background: var(--secondary-container, #E8DEF8);
  font-size: 0.85rem;
  color: var(--text-primary, #1C1B1F);
  transition: background 0.2s ease;
}

:where(body[data-page="index"]) .dashboard-alert-item:hover {
  filter: brightness(0.96);
}

:where(body[data-page="index"]) .dashboard-alert-item .alert-icon {
  font-size: 1.1rem;
  flex-shrink: 0;
}

:where(body[data-page="index"]) .dashboard-alert-item .alert-text {
  flex: 1;
  line-height: 1.4;
}

:where(body[data-page="index"]) .dashboard-alert-item .alert-meta {
  font-size: 0.72rem;
  color: var(--text-tertiary, #79747E);
  white-space: nowrap;
}

:where(body[data-page="index"]) .dashboard-empty {
  text-align: center;
  padding: 24px 16px;
  color: var(--text-tertiary, #79747E);
  font-size: 0.85rem;
}

:where(body[data-page="index"]) .dashboard-empty-icon {
  font-size: 2rem;
  margin-bottom: 8px;
}

:where(body[data-page="index"]) .dashboard-card-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-top: 12px;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--accent-color, #6750A4);
  text-decoration: none;
  transition: gap 0.2s ease;
}

:where(body[data-page="index"]) .dashboard-card-link:hover {
  gap: 8px;
}

/* ===== INPUT CENTRAL ===== */
:where(body[data-page="index"]) .home-input-section {
  max-width: 700px;
  margin: 0 auto;
  padding: 24px 20px 16px;
}

:where(body[data-page="index"]) .home-greeting {
  text-align: center;
  margin-bottom: 16px;
}

:where(body[data-page="index"]) .home-greeting h1 {
  font-size: 1.4rem;
  font-weight: 700;
  background: var(--accent-gradient, linear-gradient(135deg, #6750A4, #7F67BE 50%, #9A82DB));
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  color: transparent;
}

:where(body[data-page="index"]) .home-greeting p {
  font-size: 0.85rem;
  color: var(--text-tertiary, #79747E);
  margin-top: 4px;
}

/* ===== PC ===== */
@media (min-width: 768px) {
  :where(body[data-page="index"]) .dashboard-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  :where(body[data-page="index"]) .dashboard-card {
    padding: 26px 28px;
  }

  :where(body[data-page="index"]) .shortcuts {
    padding: 0 48px 14px;
  }

  :where(body[data-page="index"]) .shortcuts-grid {
    gap: 14px;
  }

  :where(body[data-page="index"]) .shortcuts.is-open .shortcuts-more > .shortcuts-grid {
    padding-top: 14px;
  }

  :where(body[data-page="index"]) .shortcut-card {
    height: 96px;
  }
}

@media (min-width: 1100px) {
  :where(body[data-page="index"]) .dashboard-grid {
    grid-template-columns: repeat(3, 1fr);
  }

  :where(body[data-page="index"]) .dashboard-card {
    padding: 28px 32px;
  }

  :where(body[data-page="index"]) .shortcuts {
    max-width: 820px;
    padding: 0 60px 14px;
  }
}

/* ===== MÓVIL ===== */
@media (max-width: 768px) {
  :where(body[data-page="index"]) .home-logo {
    width: 44px;
    height: 44px;
  }

  :where(body[data-page="index"]) .home-input-section {
    padding: 20px 12px 12px;
  }

  :where(body[data-page="index"]) .shortcuts {
    padding: 0 10px 10px;
  }

  :where(body[data-page="index"]) .shortcuts-grid {
    gap: 8px;
  }

  :where(body[data-page="index"]) .shortcuts.is-open .shortcuts-more > .shortcuts-grid {
    padding-top: 8px;
  }

  :where(body[data-page="index"]) .shortcuts-toggle {
    margin-top: 10px;
  }

  :where(body[data-page="index"]) .shortcut-card {
    height: 74px;
    padding: 10px 6px;
    border-radius: 12px;
  }

  :where(body[data-page="index"]) .shortcut-icon {
    font-size: 1.3rem;
  }

  :where(body[data-page="index"]) img.shortcut-icon {
    width: 22px;
    height: 22px;
  }

  :where(body[data-page="index"]) .shortcut-label {
    font-size: 0.65rem;
  }

  :where(body[data-page="index"]) .dashboard-container {
    padding: 12px 10px 32px;
  }

  :where(body[data-page="index"]) .dashboard-card {
    padding: 16px 14px;
  }

  :where(body[data-page="index"]) .dashboard-section-title {
    margin: 16px 0 10px;
    font-size: 1rem;
  }

  :where(body[data-page="index"]) .home-greeting h1 {
    font-size: 1.2rem;
  }

  :where(body[data-page="index"]) .home-greeting p {
    font-size: 0.8rem;
  }
}

/* Saludo del día: cada palabra entra con un pequeño retraso (antes, estilos en línea desde JS). */
:where(body[data-page="index"]) .welcome-word {
  display: inline-block;
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  color: transparent;
  opacity: 0;
  transform: translateY(16px);
  transition: opacity 0.45s ease, transform 0.45s ease;
}

:where(body[data-page="index"]) .welcome-word.shown {
  opacity: 1;
  transform: translateY(0);
}
</style>
