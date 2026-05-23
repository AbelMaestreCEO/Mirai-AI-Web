/* ============================================================
   MIRAI AI — code.js
   Chat de código contextualizado por proyecto
   ============================================================
   Flujo:
   1. Lee ?project=ID de la URL
   2. Carga info del proyecto (GET /api/projects/:id)
   3. Carga contexto de archivos (GET /api/projects/:id/context)
   4. Lista chats existentes (GET /api/code-chats?project_id=ID)
   5. Si hay un chat, carga su historial (GET /api/history/:chatId)
   6. Envía mensajes (POST /api/code-chat/message)
   ============================================================ */

'use strict';

// ── CONSTANTES ─────────────────────────────────────────────────
const CODE_API = {
  CHATS: (pid) => `/api/code-chats?project_id=${pid}`,
  CHAT_CREATE: '/api/code-chats',
  CHAT_DELETE: (id) => `/api/code-chats/${id}`,
  CHAT_MSG: '/api/code-chat/message',
  PROJECT: (id) => `/api/projects/${id}`,
  CONTEXT: (id) => `/api/projects/${id}/context`,
  HISTORY: (id) => `/api/history/${id}`,
};

const CATEGORY_ICONS = {
  cloudflare: '⚡', web: '🌐', backend: '⚙️',
  movil: '📱', datos: '📊', devops: '🚀', otros: '🗂️',
};

// ── ICONOS Y DETECCIÓN DE LENGUAJE ──────────────────────────────
const LANG_ICONS = {
  html:       { icon: '🌐', label: 'HTML',       color: '#e34c26' },
  css:        { icon: '🎨', label: 'CSS',        color: '#264de4' },
  javascript: { icon: '🟨', label: 'JavaScript', color: '#f7df1e' },
  typescript: { icon: '🔷', label: 'TypeScript', color: '#3178c6' },
  react:      { icon: '⚛️', label: 'React',      color: '#61dafb' },
  vue:        { icon: '💚', label: 'Vue',        color: '#42b883' },
  svelte:     { icon: '🔥', label: 'Svelte',     color: '#ff3e00' },
  python:     { icon: '🐍', label: 'Python',     color: '#3572a5' },
  rust:       { icon: '🦀', label: 'Rust',       color: '#dea584' },
  go:         { icon: '🐹', label: 'Go',         color: '#00add8' },
  php:        { icon: '🐘', label: 'PHP',        color: '#4f5d95' },
  java:       { icon: '☕', label: 'Java',       color: '#b07219' },
  sql:        { icon: '🗄️', label: 'SQL',        color: '#336791' },
  json:       { icon: '📋', label: 'JSON',       color: '#888' },
  bash:       { icon: '🖥️', label: 'Bash',       color: '#4eaa25' },
  kotlin:     { icon: '🟣', label: 'Kotlin',     color: '#f18e33' },
  swift:      { icon: '🍎', label: 'Swift',      color: '#fa7343' },
  dart:       { icon: '🎯', label: 'Dart',       color: '#00b4ab' },
  graphql:    { icon: '🔗', label: 'GraphQL',    color: '#e10098' },
  workers:    { icon: '⚡', label: 'Workers',    color: '#f6821f' },
  default:    { icon: '💻', label: 'Código',     color: '#6750a4' },
};

/**
 * Detecta el lenguaje de programación predominante en el mensaje
 * y el stack tecnológico del proyecto.
 */
function detectLanguageFromContext(message) {
  const lower = message.toLowerCase();

  if (/workers|cloudflare|wrangler|d1\b|r2\b|pages\b/.test(lower)) return 'workers';
  if (/<\/?[a-z][\s\S]*>/i.test(message) || /\bhtml\b/.test(lower))  return 'html';
  if (/\breact\b|jsx|\.tsx|use[A-Z]/.test(lower))                     return 'react';
  if (/\bvue\b|\.vue\b/.test(lower))                                  return 'vue';
  if (/\bsvelte\b/.test(lower))                                       return 'svelte';
  if (/\btypescript\b|\.ts\b|: string|: number|interface /.test(lower)) return 'typescript';
  if (/\bgraphql\b|gql`|schema!/.test(lower))                         return 'graphql';
  if (/\bcss\b|flexbox|grid-template|selector|@media|tailwind/.test(lower)) return 'css';
  if (/\bsql\b|select\s+\*|insert into|create table|where\s+/.test(lower)) return 'sql';
  if (/\bpython\b|def\s+|\.py\b|pip\s|import\s+numpy|pandas/.test(lower))  return 'python';
  if (/\brust\b|fn\s+main|cargo\b|\.rs\b|println!/.test(lower))      return 'rust';
  if (/\bgolang\b|\bgo\b.*func|\.go\b|goroutine/.test(lower))        return 'go';
  if (/\bphp\b|<\?php|laravel|composer/.test(lower))                  return 'php';
  if (/\bjava\b|\.java\b|public\s+static\s+void\s+main/.test(lower))  return 'java';
  if (/\bkotlin\b|\.kt\b|fun\s+/.test(lower))                        return 'kotlin';
  if (/\bswift\b|\.swift\b|func\s+/.test(lower))                     return 'swift';
  if (/\bdart\b|flutter\b|\.dart\b/.test(lower))                     return 'dart';
  if (/\bjson\b|api\b.*fetch|axios|\.json\b/.test(lower))             return 'json';
  if (/\bbash\b|shell\b|npm\b|yarn\b|#!/.test(lower))                 return 'bash';
  if (/\bjavascript\b|js\b|const\s|let\s|var\s|function\s/.test(lower)) return 'javascript';

  // Fallback: inferir del stack del proyecto
  if (projectData?.tech_stack) {
    const stack = Array.isArray(projectData.tech_stack)
      ? projectData.tech_stack
      : [];
    const stackStr = stack.join(' ').toLowerCase();
    if (/workers|cloudflare/.test(stackStr)) return 'workers';
    if (/react/.test(stackStr))              return 'react';
    if (/vue/.test(stackStr))                return 'vue';
    if (/svelte/.test(stackStr))             return 'svelte';
    if (/typescript/.test(stackStr))         return 'typescript';
    if (/python/.test(stackStr))             return 'python';
    if (/rust/.test(stackStr))               return 'rust';
    if (/go\b/.test(stackStr))               return 'go';
    if (/html|css/.test(stackStr))           return 'html';
    if (/javascript|node/.test(stackStr))    return 'javascript';
  }

  return 'default';
}

/**
 * Actualiza el indicador de escritura con el icono del lenguaje detectado.
 */
function showLangTypingIndicator(langKey) {
  const lang = LANG_ICONS[langKey] || LANG_ICONS.default;
  const indicator = document.getElementById('code-indicator');

  indicator.querySelector('.message-content').innerHTML = `
    <div class="lang-typing-wrap">
      <span class="lang-typing-icon">${lang.icon}</span>
      <span class="lang-typing-badge" style="background:${lang.color}22;color:${lang.color}">${lang.label}</span>
      <div class="lang-typing-dots">
        <span></span><span></span><span></span>
      </div>
    </div>`;

  indicator.classList.remove('hidden');
}

// ── ESTADO ──────────────────────────────────────────────────────
let projectId = null;
let projectData = null;
let projectContext = '';
let currentChatId = null;
let allChats = [];
let isTyping = false;

// ── INIT ────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', initCode);

async function initCode() {
  // Leer project ID de la URL
  const params = new URLSearchParams(window.location.search);
  projectId = params.get('project') || params.get('projects');

  if (!projectId) {
    showFatalError('No se especificó ningún proyecto.', 'Ir a Proyectos', 'projects');
    return;
  }

  try {
    // 1. Cargar info del proyecto
    await loadProjectInfo();

    // 2. Cargar contexto de archivos (en paralelo)
    loadProjectContext(); // no await, se resuelve asíncrono

    // 3. Cargar chats existentes
    await loadChats();

    // 4. Si hay chat activo en URL o primer chat disponible, cargarlo
    const chatParam = params.get('chat');
    if (chatParam && allChats.find(c => c.id === chatParam)) {
      await switchChat(chatParam);
    } else if (allChats.length > 0) {
      await switchChat(allChats[0].id);
    } else {
      // Auto-crear el primer chat cuando no existe ninguno
      await createNewChat();
    }

  } catch (err) {
    console.error('[Code] Error de inicialización:', err);
    showFatalError('Error al cargar el proyecto. Verifica tu conexión.', 'Reintentar', '');
  }
}

// ── CARGAR INFO DEL PROYECTO ────────────────────────────────────
async function loadProjectInfo() {
  const res = await fetch(CODE_API.PROJECT(projectId), { credentials: 'include' });
  if (!res.ok) throw new Error(`Proyecto no encontrado (HTTP ${res.status})`);

  const data = await res.json();
  projectData = data.project || data;

  const techStack = Array.isArray(projectData.tech_stack)
    ? projectData.tech_stack
    : JSON.parse(projectData.tech_stack || '[]');

  const category = projectData.category || 'otros';
  const icon = CATEGORY_ICONS[category] || '💻';

  // Header
  document.getElementById('header-project-icon').textContent = icon;
  document.getElementById('header-project-name').textContent = projectData.name;
  document.getElementById('header-project-stack').textContent =
    techStack.slice(0, 4).join(' · ') + (techStack.length > 4 ? ` +${techStack.length - 4}` : '');

  // Sidebar
  document.getElementById('sidebar-project-info').style.display = 'flex';
  document.getElementById('sidebar-project-icon').textContent = icon;
  document.getElementById('sidebar-project-name').textContent = projectData.name;

  // Title de la pestaña
  document.title = `Code — ${projectData.name} | Mirai AI`;
}

// ── CARGAR CONTEXTO DE ARCHIVOS ─────────────────────────────────
async function loadProjectContext() {
  const badge = document.getElementById('context-badge');
  const badgeText = document.getElementById('context-badge-text');

  try {
    const res = await fetch(CODE_API.CONTEXT(projectId), { credentials: 'include' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    projectContext = data.context || '';
    const fileCount = data.files?.length || 0;

    badge.className = 'context-badge';
    badgeText.textContent = `${fileCount} archivo${fileCount !== 1 ? 's' : ''}`;
    badge.title = `Contexto cargado: ${fileCount} archivo${fileCount !== 1 ? 's' : ''} del proyecto`;
  } catch (err) {
    console.warn('[Code] No se pudo cargar contexto:', err);
    badge.className = 'context-badge error';
    badgeText.textContent = 'Sin contexto';
    badge.title = 'No se pudo cargar el contexto de archivos';
  }
}

// ── CARGAR CHATS ────────────────────────────────────────────────
async function loadChats() {
  const res = await fetch(CODE_API.CHATS(projectId), { credentials: 'include' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  allChats = data.chats || [];
  renderChatList();
}

function renderChatList() {
  const list = document.getElementById('code-chats-list');
  const emptyMsg = document.getElementById('chats-empty-msg');

  if (allChats.length === 0) {
    list.innerHTML = `<li><div class="code-no-chats">
      Aún no hay chats. Crea el primero con el botón <strong>+</strong>
    </div></li>`;
    return;
  }

  list.innerHTML = allChats.map(chat => `
    <li>
      <div class="code-conv-item ${chat.id === currentChatId ? 'active' : ''}"
           data-chat-id="${chat.id}">
        <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" style="flex-shrink:0;opacity:0.5">
          <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/>
        </svg>
        <span class="conv-title">${escHtml(chat.title || 'Chat sin título')}</span>
        <button class="code-conv-delete" data-chat-id="${chat.id}" title="Eliminar chat">×</button>
      </div>
    </li>`).join('');

  list.querySelectorAll('.code-conv-item').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target.classList.contains('code-conv-delete')) return;
      switchChat(el.dataset.chatId);
    });
  });

  list.querySelectorAll('.code-conv-delete').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteChat(btn.dataset.chatId);
    });
  });
}

// ── CAMBIAR DE CHAT ─────────────────────────────────────────────
async function switchChat(chatId) {
  currentChatId = chatId;
  renderChatList(); // actualizar activo en sidebar

  // Actualizar URL sin recargar
  const url = new URL(window.location);
  url.searchParams.set('chat', chatId);
  window.history.replaceState({}, '', url);

  // Mostrar loading
  const messagesEl = document.getElementById('code-messages');
  messagesEl.innerHTML = `
    <div class="code-loading-overlay">
      <div class="code-spinner"></div>
      <p>Cargando historial...</p>
    </div>`;

  try {
    const res = await fetch(CODE_API.HISTORY(chatId), { credentials: 'include' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const messages = data.messages || [];

    if (messages.length === 0) {
      showWelcome();
    } else {
      messagesEl.innerHTML = '';
      messages.forEach(msg => appendMessage(msg.role === 'user' ? 'user' : 'ai', msg.content));
      scrollToBottom();
    }
  } catch (err) {
    console.error('[Code] Error cargando historial:', err);
    messagesEl.innerHTML = '';
    showWelcome();
  }
}

// ── CREAR NUEVO CHAT ────────────────────────────────────────────
async function createNewChat() {
  if (!projectData) {
    console.warn('[Code] projectData aún no disponible, reintentando...');
    await loadProjectInfo();
  }

  const btn = document.getElementById('new-chat-btn');
  btn.disabled = true;

  try {
    const res = await fetch(CODE_API.CHAT_CREATE, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_id: projectId,
        title: `Chat ${allChats.length + 1}`,
      }),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    allChats.unshift(data.chat);
    renderChatList();
    await switchChat(data.chat.id);
  } catch (err) {
    console.error('[Code] Error creando chat:', err);
  } finally {
    btn.disabled = false;
  }
}

// ── ELIMINAR CHAT ────────────────────────────────────────────────
async function deleteChat(chatId) {
  if (!confirm('¿Eliminar este chat y todo su historial?')) return;

  try {
    const res = await fetch(CODE_API.CHAT_DELETE(chatId), {
      method: 'DELETE',
      credentials: 'include',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    allChats = allChats.filter(c => c.id !== chatId);

    if (currentChatId === chatId) {
      currentChatId = null;
      if (allChats.length > 0) {
        await switchChat(allChats[0].id);
      } else {
        showWelcome();
        const url = new URL(window.location);
        url.searchParams.delete('chat');
        window.history.replaceState({}, '', url);
      }
    }

    renderChatList();
  } catch (err) {
    console.error('[Code] Error eliminando chat:', err);
  }
}

// ── ENVIAR MENSAJE ──────────────────────────────────────────────
async function sendMessage() {
  const input = document.getElementById('code-input');
  const message = input.value.trim();
  if (!message || isTyping) return;

  // Si no hay chat activo, crear uno primero
  if (!currentChatId) {
    await createNewChat();
    if (!currentChatId) return;
  }

  isTyping = true;
  input.value = '';
  input.style.height = 'auto';

  // Mostrar mensaje del usuario
  appendMessage('user', message);
  scrollToBottom();

  // Mostrar indicador de escritura con lenguaje detectado
  const detectedLang = detectLanguageFromContext(message);
  showLangTypingIndicator(detectedLang);
  scrollToBottom();

  try {
    const res = await fetch(CODE_API.CHAT_MSG, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        conversation_id: currentChatId,
        project_id: projectId,
        model: 'deepseek-reasoner',
      }),
    });

    typing.classList.add('hidden');

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${res.status}`);
    }

    const data = await res.json();
    appendMessage('ai', data.response || '');
    scrollToBottom();

    // Actualizar título del chat con el primer mensaje si aún es genérico
    const chat = allChats.find(c => c.id === currentChatId);
    if (chat && (chat.title.startsWith('Chat ') || chat.title === 'Nueva conversación')) {
      chat.title = message.substring(0, 50) + (message.length > 50 ? '…' : '');
      renderChatList();
    }
  } catch (err) {
    typing.classList.add('hidden');
    console.error('[Code] Error enviando mensaje:', err);
    appendMessage('ai', `⚠️ Error: ${err.message}. Intenta de nuevo.`);
    scrollToBottom();
  } finally {
    isTyping = false;
    input.focus();
  }
}

// ── RENDERIZADO DE MENSAJES ─────────────────────────────────────
function appendMessage(role, content) {
  const messagesEl = document.getElementById('code-messages');

  // Quitar el overlay de welcome/loading si existe
  const overlay = messagesEl.querySelector('.code-loading-overlay, .code-welcome');
  if (overlay) overlay.remove();

  const div = document.createElement('div');
  div.className = `message ${role}`;
  div.innerHTML = `
    <div class="message-avatar">${role === 'user' ? 'Tú' : 'M'}</div>
    <div class="message-content">${renderMarkdown(content)}</div>`;
  messagesEl.appendChild(div);
}

/**
 * Renderizado básico de Markdown orientado a código.
 * Para bloques de código usa <pre><code>, con botón de copiar.
 * El resto (negrita, cursiva, inline code, links) también se procesa.
 */
function renderMarkdown(text) {
  if (!text) return '';

  let html = escHtml(text);

  // Bloques de código (```lang\n...\n```)
  html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    const langLabel = lang || 'code';
    const safeCode = code.trimEnd();
    const id = 'cb-' + Math.random().toString(36).slice(2, 8);
    return `<div class="code-block-wrap">
      <div class="code-block-header">
        <span class="code-lang">${escHtml(langLabel)}</span>
        <button class="copy-code-btn" onclick="copyCode('${id}')" title="Copiar código">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor">
            <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
          </svg>
          Copiar
        </button>
      </div>
      <pre id="${id}"><code>${safeCode}</code></pre>
    </div>`;
  });

  // Código inline (`code`)
  html = html.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');

  // Negrita
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__(.+?)__/g, '<strong>$1</strong>');

  // Cursiva
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  html = html.replace(/_(.+?)_/g, '<em>$1</em>');

  // Encabezados
  html = html.replace(/^### (.+)$/gm, '<h4 style="margin:0.75rem 0 0.25rem;font-size:0.95rem;">$1</h4>');
  html = html.replace(/^## (.+)$/gm, '<h3 style="margin:0.75rem 0 0.25rem;font-size:1rem;">$1</h3>');
  html = html.replace(/^# (.+)$/gm, '<h2 style="margin:0.75rem 0 0.25rem;font-size:1.1rem;">$1</h2>');

  // Listas
  html = html.replace(/^\* (.+)$/gm, '<li>$1</li>');
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>)/s, '<ul style="padding-left:1.2rem;margin:0.3rem 0;">$1</ul>');

  // Saltos de línea (fuera de bloques de código)
  html = html.replace(/\n/g, '<br>');

  return html;
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

window.copyCode = function (id) {
  const el = document.getElementById(id);
  if (!el) return;
  navigator.clipboard.writeText(el.textContent).catch(() => { });
  const btn = el.closest('.code-block-wrap')?.querySelector('.copy-code-btn');
  if (btn) {
    btn.textContent = '✓ Copiado';
    setTimeout(() => {
      btn.innerHTML = `<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor">
        <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
      </svg> Copiar`;
    }, 2000);
  }
};

// ── WELCOME ──────────────────────────────────────────────────────
function showWelcome() {
  const messagesEl = document.getElementById('code-messages');
  const name = projectData?.name || 'tu proyecto';
  const techStack = Array.isArray(projectData?.tech_stack)
    ? projectData.tech_stack
    : JSON.parse(projectData?.tech_stack || '[]');

  const stackBadges = techStack.slice(0, 6).map(t =>
    `<span style="display:inline-block;padding:2px 8px;border-radius:20px;
      background:var(--secondary-container);color:var(--accent-color);
      font-size:0.75rem;font-weight:600;margin:2px;">${escHtml(t)}</span>`
  ).join('');

  messagesEl.innerHTML = `
    <div class="message ai">
      <div class="message-avatar">M</div>
      <div class="message-content">
        <strong>¡Hola! Soy tu asistente de código para <em>${escHtml(name)}</em>.</strong><br><br>
        ${techStack.length ? `<div style="margin-bottom:0.75rem">${stackBadges}</div>` : ''}
        Tengo acceso a todos los archivos de tu proyecto. Puedo ayudarte a:<br><br>
        &bull; <strong>Explicar</strong> cómo funciona tu código<br>
        &bull; <strong>Detectar bugs</strong> y sugerir correcciones<br>
        &bull; <strong>Escribir nuevo código</strong> compatible con tu stack<br>
        &bull; <strong>Refactorizar</strong> y optimizar lo que ya tienes<br>
        &bull; <strong>Documentar</strong> funciones y módulos<br><br>
        ¿Por dónde empezamos?
      </div>
    </div>`;
}

function showFatalError(msg, btnText, href) {
  const messagesEl = document.getElementById('code-messages');
  messagesEl.innerHTML = `
    <div class="code-loading-overlay">
      <div style="font-size:2rem">⚠️</div>
      <p>${escHtml(msg)}</p>
      ${btnText ? `<a href="${escHtml(href) || '#'}" 
        style="padding:0.5rem 1.2rem;border-radius:12px;background:var(--accent-gradient);
               color:#fff;font-weight:700;text-decoration:none;font-size:0.9rem;">
        ${escHtml(btnText)}
      </a>` : ''}
    </div>`;
}

function scrollToBottom() {
  const el = document.getElementById('code-messages');
  el.scrollTop = el.scrollHeight;
}

// ── ESTILOS DE BLOQUES DE CÓDIGO ──────────────────────────────────
(function injectCodeStyles() {
  const style = document.createElement('style');
  style.textContent = `
    .code-block-wrap {
      border-radius: 12px;
      overflow: hidden;
      border: 1px solid var(--glass-border, rgba(103,80,164,0.15));
      margin: 0.5rem 0;
      font-size: 0.82rem;
    }
    .code-block-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.35rem 0.75rem;
      background: var(--secondary-container, #E8DEF8);
    }
    .code-lang {
      font-size: 0.72rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--accent-color, #6750A4);
    }
    .copy-code-btn {
      display: flex;
      align-items: center;
      gap: 4px;
      background: transparent;
      border: none;
      cursor: pointer;
      font-size: 0.72rem;
      font-weight: 600;
      color: var(--text-secondary, #888);
      padding: 2px 6px;
      border-radius: 6px;
      transition: background 0.15s, color 0.15s;
      font-family: inherit;
    }
    .copy-code-btn:hover { background: rgba(0,0,0,0.08); color: var(--accent-color); }
    .code-block-wrap pre {
      margin: 0;
      padding: 0.85rem 1rem;
      overflow-x: auto;
      background: #0d1117;
      color: #e6edf3;
      line-height: 1.55;
    }
    html[data-theme="dark"] .code-block-wrap pre { background: #161b22; }
    .code-block-wrap pre code { font-family: 'Fira Code', 'Consolas', 'Monaco', monospace; }
    .inline-code {
      background: var(--secondary-container, #E8DEF8);
      color: var(--accent-color, #6750A4);
      padding: 1px 5px;
      border-radius: 5px;
      font-size: 0.87em;
      font-family: 'Fira Code', 'Consolas', monospace;
    }
  `;
  document.head.appendChild(style);
})();

// ── EVENT LISTENERS ──────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Nuevo chat
  document.getElementById('new-chat-btn')
    .addEventListener('click', createNewChat);

  // Enviar mensaje
  document.getElementById('code-button')
    .addEventListener('click', sendMessage);

  // Enter para enviar (Shift+Enter = nueva línea)
  document.getElementById('code-input')
    .addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

  // Auto-resize del textarea
  document.getElementById('code-input')
    .addEventListener('input', function () {
      this.style.height = 'auto';
      this.style.height = Math.min(this.scrollHeight, 160) + 'px';
    });
});