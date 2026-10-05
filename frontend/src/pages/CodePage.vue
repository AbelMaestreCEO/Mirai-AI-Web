<template>
  <!-- ══ HEADER ════════════════════════════════════════════════ -->
  <header class="header">
    <MenuToggle />
    <!-- Barra de proyecto en el header -->
    <div id="header-project-bar" class="code-project-bar">
      <span id="header-project-icon" class="code-project-icon">{{ projectIcon }}</span>
      <div class="code-project-info">
        <span id="header-project-name" class="code-project-name">{{ project?.name ?? 'Cargando proyecto...' }}</span>
        <span id="header-project-stack" class="code-project-stack">{{ stackSummary }}</span>
      </div>
    </div>
    <!-- Badge de contexto -->
    <span id="context-badge" class="context-badge" :class="contextState" :title="contextTitle">
      <svg viewBox="0 0 24 24" width="10" height="10" fill="currentColor">
        <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm4 18H6V4h7v5h5v11z" />
      </svg>
      <span id="context-badge-text">{{ contextText }}</span>
    </span>
    <!-- Botón volver -->
    <AppLink id="back-to-projects" to="projects" class="code-back-btn">
      <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor">
        <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
      </svg>
      <span>Proyectos</span>
    </AppLink>
  </header>

  <!-- ══ CHAT ══════════════════════════════════════════════════ -->
  <div class="chat-container">
    <main id="code-messages" ref="messagesEl" class="chat-messages" aria-live="polite" @click="handleMarkdownClick">
      <!-- Error que impide usar la página -->
      <div v-if="fatal" class="code-loading-overlay">
        <div style="font-size:2rem">⚠️</div>
        <p>{{ fatal.message }}</p>
        <AppLink
          v-if="fatal.action === 'projects'"
          to="projects"
          style="padding:0.5rem 1.2rem;border-radius:12px;background:var(--accent-gradient);color:#fff;font-weight:700;text-decoration:none;font-size:0.9rem;"
        >
          Ir a Proyectos
        </AppLink>
        <a
          v-else
          href=""
          style="padding:0.5rem 1.2rem;border-radius:12px;background:var(--accent-gradient);color:#fff;font-weight:700;text-decoration:none;font-size:0.9rem;"
          @click.prevent="reload"
        >
          Reintentar
        </a>
      </div>

      <!-- Cargando proyecto / historial -->
      <div v-else-if="loading" class="code-loading-overlay">
        <div class="code-spinner" />
        <p>{{ loading }}</p>
      </div>

      <template v-else>
        <!-- Bienvenida de un chat vacío -->
        <div v-if="welcome" class="message ai">
          <div class="message-avatar">M</div>
          <div class="message-content">
            <strong>¡Hola! Soy tu asistente de código para <em>{{ project?.name || 'tu proyecto' }}</em>.</strong><br><br>
            <div v-if="techStack.length" style="margin-bottom:0.75rem">
              <span
                v-for="t in techStack.slice(0, 6)"
                :key="t"
                style="display:inline-block;padding:2px 8px;border-radius:20px;background:var(--secondary-container);color:var(--accent-color);font-size:0.75rem;font-weight:600;margin:2px;"
              >{{ t }}</span>
            </div>
            Tengo acceso a todos los archivos de tu proyecto. Puedo ayudarte a:<br><br>
            &bull; <strong>Explicar</strong> cómo funciona tu código<br>
            &bull; <strong>Detectar bugs</strong> y sugerir correcciones<br>
            &bull; <strong>Escribir nuevo código</strong> compatible con tu stack<br>
            &bull; <strong>Refactorizar</strong> y optimizar lo que ya tienes<br>
            &bull; <strong>Documentar</strong> funciones y módulos<br><br>
            ¿Por dónde empezamos?
          </div>
        </div>

        <div v-for="m in messages" :key="m.id" class="message" :class="m.role">
          <div class="message-avatar">{{ m.role === 'user' ? 'Tú' : 'M' }}</div>
          <div class="message-content" v-html="formatMessageContent(m.content)" />
        </div>
      </template>
    </main>

    <!-- Indicador de escritura con el lenguaje detectado -->
    <div id="code-indicator" ref="indicatorEl" class="message ai" :class="{ hidden: !typingLang }" style="margin-bottom:20px;">
      <div class="message-avatar">M</div>
      <div class="message-content">
        <div class="lang-typing-wrap">
          <span class="lang-typing-icon">{{ typingInfo.icon }}</span>
          <span class="lang-typing-badge" :style="{ background: `${typingInfo.color}22`, color: typingInfo.color }">{{ typingInfo.label }}</span>
          <div class="lang-typing-dots">
            <span /><span /><span />
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- ══ INPUT ═════════════════════════════════════════════════ -->
  <footer class="input-area">
    <div id="suggestions-bar" class="quick-actions-bar">
      <button v-for="a in QUICK_ACTIONS" :key="a.label" class="quick-action-btn" :data-prompt="a.prompt" @click="quickAction(a.prompt)">{{ a.label }}</button>
    </div>
    <div class="input-wrapper">
      <textarea
        id="code-input"
        ref="inputEl"
        v-model="input"
        class="message-input"
        placeholder="Pregunta sobre tu código..."
        rows="1"
        autocomplete="off"
        spellcheck="false"
        @input="autoResize"
        @keydown.enter.exact.prevent="sendMessage"
      />
      <button id="code-button" class="send-button" aria-label="Enviar mensaje" @click="sendMessage">
        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
        </svg>
      </button>
    </div>
  </footer>

  <!-- Proyecto y chats, en el panel de la barra lateral -->
  <Teleport to="#sidebar-page-section" defer>
    <div id="sidebar-project-info" class="code-sidebar-project" :style="{ display: project ? 'flex' : 'none' }">
      <span id="sidebar-project-icon">{{ projectIcon }}</span>
      <span id="sidebar-project-name" class="code-sidebar-project-name">{{ project?.name ?? 'Proyecto' }}</span>
    </div>

    <div class="conversations-header">
      <h4>Conversaciones</h4>
      <button
        id="new-chat-btn"
        class="icon-btn"
        title="Nueva conversación"
        :disabled="creating"
        style="background:none;border:none;cursor:pointer;font-size:1.1rem;color:var(--accent-color)"
        @click="createNewChat"
      >
        ＋
      </button>
    </div>

    <ul id="code-chats-list" style="list-style:none;padding:0;margin:0">
      <li v-if="!chats.length">
        <div class="code-no-chats">Aún no hay chats. Crea el primero con el botón <strong>+</strong></div>
      </li>
      <li v-for="chat in chats" :key="chat.id">
        <div class="code-conv-item" :class="{ active: chat.id === currentChatId }" :data-chat-id="chat.id" @click="switchChat(chat.id)">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" style="flex-shrink:0;opacity:0.5">
            <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" />
          </svg>
          <span class="conv-title">{{ chat.title || 'Chat sin título' }}</span>
          <button class="code-conv-delete" :data-chat-id="chat.id" title="Eliminar chat" @click.stop="deleteChat(chat.id)">×</button>
        </div>
      </li>
    </ul>
  </Teleport>
</template>

<script setup lang="ts">
// Migración de public/code.html y public/code.js: chat de código con el
// contexto de los archivos de un proyecto.
//
// Flujo: ?project=ID → GET /api/projects/:id → GET /api/projects/:id/context
// (en paralelo) → GET /api/code-chats?project_id=ID → historial del chat
// (GET /api/history/:chatId) → POST /api/code-chat/message.
import { computed, nextTick, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import MenuToggle from '@/components/MenuToggle.vue';
import AppLink from '@/components/AppLink.vue';
import { api, errorMessage } from '@/lib/api';
import { formatMessageContent } from '@/lib/markdown';
import { handleMarkdownClick } from '@/lib/markdown-actions';

interface Project {
  name: string;
  category?: string;
  tech_stack?: string[] | string | null;
}

interface CodeChat {
  id: string;
  title: string;
}

interface CodeMessage {
  id: number;
  role: 'user' | 'ai';
  content: string;
}

const CATEGORY_ICONS: Record<string, string> = {
  cloudflare: '⚡',
  web: '🌐',
  backend: '⚙️',
  movil: '📱',
  datos: '📊',
  devops: '🚀',
  otros: '🗂️',
};

const LANG_ICONS: Record<string, { icon: string; label: string; color: string }> = {
  html: { icon: '🌐', label: 'HTML', color: '#e34c26' },
  css: { icon: '🎨', label: 'CSS', color: '#264de4' },
  javascript: { icon: '🟨', label: 'JavaScript', color: '#f7df1e' },
  typescript: { icon: '🔷', label: 'TypeScript', color: '#3178c6' },
  react: { icon: '⚛️', label: 'React', color: '#61dafb' },
  vue: { icon: '💚', label: 'Vue', color: '#42b883' },
  svelte: { icon: '🔥', label: 'Svelte', color: '#ff3e00' },
  python: { icon: '🐍', label: 'Python', color: '#3572a5' },
  rust: { icon: '🦀', label: 'Rust', color: '#dea584' },
  go: { icon: '🐹', label: 'Go', color: '#00add8' },
  php: { icon: '🐘', label: 'PHP', color: '#4f5d95' },
  java: { icon: '☕', label: 'Java', color: '#b07219' },
  sql: { icon: '🗄️', label: 'SQL', color: '#336791' },
  json: { icon: '📋', label: 'JSON', color: '#888' },
  bash: { icon: '🖥️', label: 'Bash', color: '#4eaa25' },
  kotlin: { icon: '🟣', label: 'Kotlin', color: '#f18e33' },
  swift: { icon: '🍎', label: 'Swift', color: '#fa7343' },
  dart: { icon: '🎯', label: 'Dart', color: '#00b4ab' },
  graphql: { icon: '🔗', label: 'GraphQL', color: '#e10098' },
  workers: { icon: '⚡', label: 'Workers', color: '#f6821f' },
  default: { icon: '💻', label: 'Código', color: '#6750a4' },
};

const QUICK_ACTIONS = [
  { label: '🐛 Buscar bugs', prompt: 'Busca bugs y errores en el código del proyecto y explícame cada uno' },
  { label: '📝 Documentar', prompt: 'Documenta todas las funciones y módulos principales del proyecto con JSDoc o el estándar del lenguaje' },
  { label: '⚡ Optimizar', prompt: 'Analiza el rendimiento del código y sugiere optimizaciones concretas con ejemplos' },
  { label: '🔐 Seguridad', prompt: 'Revisa el código en busca de vulnerabilidades de seguridad y malas prácticas' },
  { label: '🧪 Generar tests', prompt: 'Genera tests unitarios para las funciones principales del proyecto' },
  { label: '🔄 Refactorizar', prompt: 'Refactoriza el código para mejorar legibilidad y mantenibilidad sin cambiar su comportamiento' },
];

const route = useRoute();
const router = useRouter();

const projectId = (() => {
  const v = route.query.project ?? route.query.projects;
  return typeof v === 'string' ? v : '';
})();

// ── Proyecto ──────────────────────────────────────────────────────────────
const project = ref<Project | null>(null);

const techStack = computed<string[]>(() => {
  const raw = project.value?.tech_stack;
  if (Array.isArray(raw)) return raw;
  try {
    const parsed: unknown = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
});

const projectIcon = computed(() => (project.value ? CATEGORY_ICONS[project.value.category || 'otros'] || '💻' : '💻'));
const stackSummary = computed(() => {
  const stack = techStack.value;
  return stack.slice(0, 4).join(' · ') + (stack.length > 4 ? ` +${stack.length - 4}` : '');
});

async function loadProjectInfo() {
  const { ok, status, data } = await api.get<{ project?: Project } & Project>(`/api/projects/${encodeURIComponent(projectId)}`);
  if (!ok) throw new Error(`Proyecto no encontrado (HTTP ${status})`);
  project.value = data.project || data;
  applyTitle();
}

// El título de la pestaña lleva el nombre del proyecto. El router pone el de
// la ruta en cada navegación (también al cambiar ?chat=), así que se repite.
function applyTitle() {
  if (project.value) document.title = `Code — ${project.value.name} | Mirai AI`;
}

// ── Contexto de archivos ──────────────────────────────────────────────────
const contextState = ref<'loading' | '' | 'error'>('loading');
const contextText = ref('Cargando');
const contextTitle = ref('Estado del contexto');

async function loadProjectContext() {
  try {
    const { ok, status, data } = await api.get<{ files?: unknown[] }>(`/api/projects/${encodeURIComponent(projectId)}/context`);
    if (!ok) throw new Error(`HTTP ${status}`);
    const count = data.files?.length || 0;
    const files = `${count} archivo${count !== 1 ? 's' : ''}`;
    contextState.value = '';
    contextText.value = files;
    contextTitle.value = `Contexto cargado: ${files} del proyecto`;
  } catch (err) {
    console.warn('[Code] No se pudo cargar contexto:', err);
    contextState.value = 'error';
    contextText.value = 'Sin contexto';
    contextTitle.value = 'No se pudo cargar el contexto de archivos';
  }
}

// ── Mensajes ──────────────────────────────────────────────────────────────
const messages = ref<CodeMessage[]>([]);
const welcome = ref(false);
const loading = ref<string | null>('Cargando proyecto y contexto...');
const fatal = ref<{ message: string; action: 'projects' | 'retry' } | null>(null);
const messagesEl = ref<HTMLElement | null>(null);
const indicatorEl = ref<HTMLElement | null>(null);
let nextId = 1;

async function scrollToBottom() {
  await nextTick();
  if (messagesEl.value) messagesEl.value.scrollTop = messagesEl.value.scrollHeight;
}

function appendMessage(role: CodeMessage['role'], content: string) {
  messages.value.push({ id: nextId++, role, content });
  void scrollToBottom();
}

function showWelcome() {
  messages.value = [];
  welcome.value = true;
}

function reload() {
  location.reload();
}

// ── Chats ─────────────────────────────────────────────────────────────────
const chats = ref<CodeChat[]>([]);
const currentChatId = ref<string | null>(null);
const creating = ref(false);

async function loadChats() {
  const { ok, status, data } = await api.get<{ chats?: CodeChat[] }>(`/api/code-chats?project_id=${encodeURIComponent(projectId)}`);
  if (!ok) throw new Error(`HTTP ${status}`);
  chats.value = data.chats || [];
}

function setChatInUrl(chatId: string | null) {
  const query = { ...route.query };
  if (chatId) query.chat = chatId;
  else delete query.chat;
  void router.replace({ query }).then(applyTitle);
}

async function switchChat(chatId: string) {
  currentChatId.value = chatId;
  setChatInUrl(chatId);
  loading.value = 'Cargando historial...';
  try {
    const { ok, status, data } = await api.get<{ role: string; content: string }[] | { messages?: { role: string; content: string }[] }>(
      `/api/history/${encodeURIComponent(chatId)}`,
    );
    if (!ok) throw new Error(`HTTP ${status}`);
    const history = Array.isArray(data) ? data : data.messages || [];
    showWelcome();
    if (history.length) {
      welcome.value = false;
      for (const msg of history) messages.value.push({ id: nextId++, role: msg.role === 'user' ? 'user' : 'ai', content: msg.content });
    }
  } catch (err) {
    console.error('[Code] Error cargando historial:', err);
    showWelcome();
  } finally {
    loading.value = null;
    void scrollToBottom();
  }
}

async function createNewChat() {
  if (!project.value) await loadProjectInfo().catch(() => undefined);
  creating.value = true;
  try {
    const { ok, status, data } = await api.post<{ chat: CodeChat }>('/api/code-chats', {
      project_id: projectId,
      title: `Chat ${chats.value.length + 1}`,
    });
    if (!ok) throw new Error(`HTTP ${status}`);
    chats.value.unshift(data.chat);
    await switchChat(data.chat.id);
  } catch (err) {
    console.error('[Code] Error creando chat:', err);
  } finally {
    creating.value = false;
  }
}

async function deleteChat(chatId: string) {
  if (!confirm('¿Eliminar este chat y todo su historial?')) return;
  try {
    const { ok, status } = await api.delete(`/api/code-chats/${encodeURIComponent(chatId)}`);
    if (!ok) throw new Error(`HTTP ${status}`);
    chats.value = chats.value.filter((c) => c.id !== chatId);
    if (currentChatId.value === chatId) {
      currentChatId.value = null;
      const first = chats.value[0];
      if (first) {
        await switchChat(first.id);
      } else {
        showWelcome();
        setChatInUrl(null);
      }
    }
  } catch (err) {
    console.error('[Code] Error eliminando chat:', err);
  }
}

// ── Envío ─────────────────────────────────────────────────────────────────
const input = ref('');
const inputEl = ref<HTMLTextAreaElement | null>(null);
const typingLang = ref<string | null>(null);
const typingInfo = computed(() => LANG_ICONS[typingLang.value ?? 'default'] ?? LANG_ICONS.default!);
let sending = false;

function autoResize() {
  const el = inputEl.value;
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
}

/** Lenguaje predominante del mensaje (o, si no se nota, del stack del proyecto). */
function detectLanguage(message: string): string {
  const lower = message.toLowerCase();
  if (/workers|cloudflare|wrangler|d1\b|r2\b|pages\b/.test(lower)) return 'workers';
  if (/<\/?[a-z][\s\S]*>/i.test(message) || /\bhtml\b/.test(lower)) return 'html';
  if (/\breact\b|jsx|\.tsx|use[A-Z]/.test(lower)) return 'react';
  if (/\bvue\b|\.vue\b/.test(lower)) return 'vue';
  if (/\bsvelte\b/.test(lower)) return 'svelte';
  if (/\btypescript\b|\.ts\b|: string|: number|interface /.test(lower)) return 'typescript';
  if (/\bgraphql\b|gql`|schema!/.test(lower)) return 'graphql';
  if (/\bcss\b|flexbox|grid-template|selector|@media|tailwind/.test(lower)) return 'css';
  if (/\bsql\b|select\s+\*|insert into|create table|where\s+/.test(lower)) return 'sql';
  if (/\bpython\b|def\s+|\.py\b|pip\s|import\s+numpy|pandas/.test(lower)) return 'python';
  if (/\brust\b|fn\s+main|cargo\b|\.rs\b|println!/.test(lower)) return 'rust';
  if (/\bgolang\b|\bgo\b.*func|\.go\b|goroutine/.test(lower)) return 'go';
  if (/\bphp\b|<\?php|laravel|composer/.test(lower)) return 'php';
  if (/\bjava\b|\.java\b|public\s+static\s+void\s+main/.test(lower)) return 'java';
  if (/\bkotlin\b|\.kt\b|fun\s+/.test(lower)) return 'kotlin';
  if (/\bswift\b|\.swift\b|func\s+/.test(lower)) return 'swift';
  if (/\bdart\b|flutter\b|\.dart\b/.test(lower)) return 'dart';
  if (/\bjson\b|api\b.*fetch|axios|\.json\b/.test(lower)) return 'json';
  if (/\bbash\b|shell\b|npm\b|yarn\b|#!/.test(lower)) return 'bash';
  if (/\bjavascript\b|js\b|const\s|let\s|var\s|function\s/.test(lower)) return 'javascript';

  const stack = techStack.value.join(' ').toLowerCase();
  if (/workers|cloudflare/.test(stack)) return 'workers';
  if (/react/.test(stack)) return 'react';
  if (/vue/.test(stack)) return 'vue';
  if (/svelte/.test(stack)) return 'svelte';
  if (/typescript/.test(stack)) return 'typescript';
  if (/python/.test(stack)) return 'python';
  if (/rust/.test(stack)) return 'rust';
  if (/go\b/.test(stack)) return 'go';
  if (/html|css/.test(stack)) return 'html';
  if (/javascript|node/.test(stack)) return 'javascript';
  return 'default';
}

async function sendMessage() {
  const message = input.value.trim();
  if (!message || sending) return;

  // Sin chat activo, se crea uno primero.
  if (!currentChatId.value) {
    await createNewChat();
    if (!currentChatId.value) return;
  }
  const chatId = currentChatId.value;

  sending = true;
  input.value = '';
  if (inputEl.value) inputEl.value.style.height = 'auto';

  appendMessage('user', message);
  typingLang.value = detectLanguage(message);
  void scrollToBottom();

  try {
    const { ok, status, data } = await api.post<{ response?: string; error?: string }>('/api/code-chat/message', {
      message,
      conversation_id: chatId,
      project_id: projectId,
      model: 'deepseek-reasoner',
    });
    typingLang.value = null;
    if (!ok) throw new Error(errorMessage(data, `HTTP ${status}`));
    appendMessage('ai', data.response || '');

    // El título genérico del chat pasa a ser el primer mensaje.
    const chat = chats.value.find((c) => c.id === chatId);
    if (chat && (chat.title.startsWith('Chat ') || chat.title === 'Nueva conversación')) {
      chat.title = message.substring(0, 50) + (message.length > 50 ? '…' : '');
    }
  } catch (err) {
    typingLang.value = null;
    console.error('[Code] Error enviando mensaje:', err);
    appendMessage('ai', `⚠️ Error: ${err instanceof Error ? err.message : String(err)}. Intenta de nuevo.`);
  } finally {
    sending = false;
    inputEl.value?.focus();
  }
}

function quickAction(prompt: string) {
  input.value = prompt;
  inputEl.value?.focus();
  void sendMessage();
}

// ── Arranque ──────────────────────────────────────────────────────────────
onMounted(async () => {
  if (!projectId) {
    fatal.value = { message: 'No se especificó ningún proyecto.', action: 'projects' };
    return;
  }
  try {
    await loadProjectInfo();
    void loadProjectContext();
    await loadChats();

    const chatParam = typeof route.query.chat === 'string' ? route.query.chat : null;
    const first = chats.value[0];
    if (chatParam && chats.value.some((c) => c.id === chatParam)) await switchChat(chatParam);
    else if (first) await switchChat(first.id);
    // Sin chats: se crea el primero.
    else await createNewChat();
  } catch (err) {
    console.error('[Code] Error de inicialización:', err);
    fatal.value = { message: 'Error al cargar el proyecto. Verifica tu conexión.', action: 'retry' };
  }
});
</script>

<style>
/* CSS propio de la página antigua, limitado a ella (ver router: meta.page). */
/* ── Tablas Markdown ── */
:where(body[data-page="code"]) .md-table-wrapper {
  overflow-x: auto;
  margin: 12px 0;
  border-radius: 10px;
}

:where(body[data-page="code"]) .md-table {
  border-collapse: collapse;
  width: 100%;
  font-size: 0.875rem;
  min-width: 320px;
}

:where(body[data-page="code"]) .md-table th {
  background: var(--accent-gradient, linear-gradient(135deg, #6750A4, #9A82DB));
  color: #fff;
  font-weight: 600;
  padding: 8px 14px;
  text-align: left;
  border: 1px solid rgba(255, 255, 255, 0.15);
  white-space: nowrap;
}

:where(body[data-page="code"]) .md-table td {
  padding: 7px 14px;
  border: 1px solid var(--glass-border, rgba(103, 80, 164, 0.12));
  vertical-align: top;
  line-height: 1.45;
}

:where(body[data-page="code"]) .md-table tbody tr:nth-child(even) td {
  background: var(--secondary-container, #E8DEF8);
  opacity: 0.85;
}

:where(body[data-page="code"]) .md-table tbody tr:hover td {
  background: var(--accent-glow, rgba(103, 80, 164, 0.12));
}

html[data-theme="dark"] :where(body[data-page="code"]) .md-table td {
  border-color: rgba(255, 255, 255, 0.08);
}

html[data-theme="dark"] :where(body[data-page="code"]) .md-table tbody tr:nth-child(even) td {
  background: rgba(255, 255, 255, 0.05);
  opacity: 1;
}

:where(body[data-page="code"]) .copy-table-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  margin-top: 6px;
  padding: 4px 10px;
  font-size: 0.75rem;
  color: var(--accent-color, #6750A4);
  background: transparent;
  border: 1px solid var(--accent-color, #6750A4);
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.2s, color 0.2s;
  fill: currentColor;
}

:where(body[data-page="code"]) .copy-table-btn svg path {
  fill: currentColor;
}

:where(body[data-page="code"]) .copy-table-btn:hover {
  background: var(--accent-glow, rgba(103, 80, 164, 0.12));
}

:where(body[data-page="code"]) .copy-table-btn.copied {
  color: #2e7d32;
  border-color: #2e7d32;
  background: rgba(46, 125, 50, 0.08);
}

:where(body[data-page="code"]) svg {
  display: block;
}

:where(body[data-page="code"]) .message-content {
  counter-reset: list-item;
}

/* ── Mensajes: mismo estilo que chat ── */
@keyframes msgSlideIn {
  from {
    opacity: 0;
    transform: translateY(8px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

:where(body[data-page="code"]) .message.user .message-content {
  background: var(--accent-glow, rgba(103, 80, 164, 0.18)) !important;
  color: #1a1a1a !important;
  border-radius: 18px !important;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.15) !important;
  border: none !important;
}

:where(body[data-page="code"]) .message.ai .message-content {
  background: #ffffff !important;
  color: #1a1a1a !important;
  border-radius: 18px !important;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.10) !important;
  border: none !important;
}

html[data-theme="dark"] :where(body[data-page="code"]) .message.ai .message-content {
  background: #1c1c1e !important;
  color: #f0f0f0 !important;
}

html[data-theme="dark"] :where(body[data-page="code"]) .message.user .message-content {
  color: #f0f0f0 !important;
}

@media (max-width: 768px) {
  :where(body[data-page="code"]) .quick-actions-bar {
    width: 100%;
    max-width: 800px;
  }

  :where(body[data-page="code"]) .chat-messages {
    padding-left: 14px !important;
    padding-right: 14px !important;
  }

  :where(body[data-page="code"]) .message.user .message-content,
  :where(body[data-page="code"]) .message.ai .message-content {
    max-width: 82% !important;
  }
}

/* ── Barra de proyecto en el header ── */
:where(body[data-page="code"]) .code-project-bar {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.3rem 0.8rem 0.3rem 0;
  flex: 1;
  min-width: 0;
  overflow: hidden;
}

:where(body[data-page="code"]) .code-project-icon {
  font-size: 1.1rem;
  flex-shrink: 0;
}

:where(body[data-page="code"]) .code-project-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

:where(body[data-page="code"]) .code-project-name {
  font-size: 0.88rem;
  font-weight: 700;
  color: var(--text-primary, #1a1a1a);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.2;
}

:where(body[data-page="code"]) .code-project-stack {
  font-size: 0.7rem;
  color: var(--text-secondary, #888);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.2;
}

:where(body[data-page="code"]) .code-back-btn {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.35rem 0.65rem;
  border-radius: 10px;
  border: 1px solid var(--glass-border, rgba(103, 80, 164, 0.15));
  background: transparent;
  color: var(--text-secondary, #666);
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
  text-decoration: none;
  flex-shrink: 0;
  transition: background 0.18s, color 0.18s;
  font-family: inherit;
}

:where(body[data-page="code"]) .code-back-btn:hover {
  background: var(--secondary-container, #E8DEF8);
  color: var(--accent-color, #6750A4);
}

/* ── Header de conversaciones (sidebar) ── */
:where(body[data-page="code"]) .conversations-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.2rem 0;
}

:where(body[data-page="code"]) .conversations-header h4 {
  font-size: 0.82rem;
  font-weight: 700;
  color: var(--text-secondary, #888);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin: 0;
}

/* ── Nombre de proyecto en sidebar ── */
:where(body[data-page="code"]) .code-sidebar-project {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.6rem;
  border-radius: 12px;
  background: var(--secondary-container, #E8DEF8);
  margin-bottom: 0.5rem;
  min-width: 0;
}

:where(body[data-page="code"]) .code-sidebar-project-name {
  font-size: 0.82rem;
  font-weight: 700;
  color: var(--accent-color, #6750A4);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ── Item de chat en sidebar ── */
:where(body[data-page="code"]) .code-conv-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.6rem;
  border-radius: 10px;
  cursor: pointer;
  transition: background 0.15s;
  min-width: 0;
}

:where(body[data-page="code"]) .code-conv-item:hover {
  background: var(--secondary-container, #E8DEF8);
}

:where(body[data-page="code"]) .code-conv-item.active {
  background: var(--secondary-container, #E8DEF8);
}

:where(body[data-page="code"]) .code-conv-item .conv-title {
  flex: 1;
  font-size: 0.82rem;
  color: var(--text-primary, #333);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.3;
}

:where(body[data-page="code"]) .code-conv-item.active .conv-title {
  font-weight: 600;
  color: var(--accent-color, #6750A4);
}

:where(body[data-page="code"]) .code-conv-delete {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: none;
  background: transparent;
  color: var(--text-secondary, #aaa);
  cursor: pointer;
  font-size: 0.95rem;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.15s, color 0.15s, background 0.15s;
  padding: 0;
}

:where(body[data-page="code"]) .code-conv-item:hover .code-conv-delete {
  opacity: 1;
}

:where(body[data-page="code"]) .code-conv-delete:hover {
  color: #B71C1C;
  background: #FFEBEE;
}

/* ── Indicador de contexto cargado ── */
:where(body[data-page="code"]) .context-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.72rem;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 20px;
  background: var(--secondary-container, #E8DEF8);
  color: var(--accent-color, #6750A4);
  flex-shrink: 0;
}

:where(body[data-page="code"]) .context-badge.loading {
  background: #FFF3E0;
  color: #E65100;
}

:where(body[data-page="code"]) .context-badge.error {
  background: #FFEBEE;
  color: #B71C1C;
}

/* ── Loading overlay en el chat ── */
:where(body[data-page="code"]) .code-loading-overlay {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  padding: 3rem 1rem;
  color: var(--text-secondary, #888);
  font-size: 0.9rem;
  text-align: center;
}

:where(body[data-page="code"]) .code-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--glass-border, #ddd);
  border-top-color: var(--accent-color, #6750A4);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* ── Botón nuevo chat ── */
:where(body[data-page="code"]) .new-conv-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 8px;
  border: 1px solid var(--glass-border, rgba(103, 80, 164, 0.18));
  background: transparent;
  color: var(--text-secondary, #888);
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

:where(body[data-page="code"]) .new-conv-btn:hover {
  background: var(--secondary-container, #E8DEF8);
  color: var(--accent-color, #6750A4);
}

/* ── Estado vacío de chats ── */
:where(body[data-page="code"]) .code-no-chats {
  font-size: 0.78rem;
  color: var(--text-secondary, #aaa);
  text-align: center;
  padding: 0.75rem 0.5rem;
  line-height: 1.4;
}

/* ── Sugerencias de código ── */
:where(body[data-page="code"]) .quick-actions-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  padding: 0.5rem 1rem 0.4rem;
  justify-content: center;
  width: 100%;
}

:where(body[data-page="code"]) .quick-action-btn {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.35rem 0.75rem;
  border-radius: 20px;
  border: 1px solid var(--glass-border, rgba(103, 80, 164, 0.18));
  background: var(--glass-bg, rgba(255, 255, 255, 0.9));
  color: var(--text-secondary, #666);
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
  white-space: nowrap;
}

:where(body[data-page="code"]) .quick-action-btn:hover {
  background: var(--secondary-container, #E8DEF8);
  color: var(--accent-color, #6750A4);
  border-color: var(--accent-color, #6750A4);
}

/* ── Indicador de escritura con lenguaje ── */
:where(body[data-page="code"]) .lang-typing-wrap {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.15rem 0;
}

:where(body[data-page="code"]) .lang-typing-icon {
  font-size: 1.35rem;
  line-height: 1;
  animation: langPulse 1.4s ease-in-out infinite;
}

@keyframes langPulse {

  0%,
  100% {
    transform: scale(1);
    opacity: 1;
  }

  50% {
    transform: scale(1.18);
    opacity: 0.75;
  }
}

:where(body[data-page="code"]) .lang-typing-badge {
  font-size: 0.7rem;
  font-weight: 700;
  padding: 2px 7px;
  border-radius: 20px;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  border: 1px solid currentColor;
  opacity: 0.85;
}

:where(body[data-page="code"]) .lang-typing-dots {
  display: flex;
  gap: 4px;
  align-items: center;
}

:where(body[data-page="code"]) .lang-typing-dots span {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--accent-color, #6750A4);
  animation: langDot 1.3s ease-in-out infinite;
}

:where(body[data-page="code"]) .lang-typing-dots span:nth-child(1) {
  animation-delay: 0s;
}

:where(body[data-page="code"]) .lang-typing-dots span:nth-child(2) {
  animation-delay: 0.22s;
}

:where(body[data-page="code"]) .lang-typing-dots span:nth-child(3) {
  animation-delay: 0.44s;
}

@keyframes langDot {

  0%,
  80%,
  100% {
    transform: translateY(0);
    opacity: 0.35;
  }

  40% {
    transform: translateY(-6px);
    opacity: 1;
  }
}

/* ── Responsive: header más compacto en móvil ── */
:where(body[data-page="code"]) .header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

:where(body[data-page="code"]) .header-title {
  display: none;
}

/* ocultamos el título genérico */

@media (max-width: 480px) {
  :where(body[data-page="code"]) .code-project-stack {
    display: none;
  }

  :where(body[data-page="code"]) .code-back-btn span {
    display: none;
  }

  :where(body[data-page="code"]) .code-back-btn {
    padding: 0.35rem 0.5rem;
  }
}
</style>
