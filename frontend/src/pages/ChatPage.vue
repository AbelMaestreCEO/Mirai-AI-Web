<template>
  <!-- Header -->
  <header class="header">
    <MenuToggle />
    <button id="audio-mode-toggle" class="audio-mode-toggle" :class="AUDIO_MODE_UI[audioMode].class" :title="`Modo: ${AUDIO_MODE_UI[audioMode].label} (clic para cambiar)`" @click="cycleAudioMode">
      <svg viewBox="0 0 24 24" width="16" height="16">
        <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" />
      </svg>
      <span class="audio-mode-label">{{ AUDIO_MODE_UI[audioMode].label }}</span>
    </button>
    <div class="header-title">{{ headerTitle }}</div>
  </header>

  <!-- Contenedor Principal -->
  <div class="chat-container">
    <!-- Área de Mensajes -->
    <main id="chat-messages" ref="messagesEl" class="chat-messages" aria-live="polite" @click="onMessagesClick">
      <!-- Mensaje de bienvenida inicial -->
      <div v-if="showWelcome" class="message ai">
        <div class="message-avatar">M</div>
        <div class="message-content">
          Hola. Soy <strong>Mirai AI</strong>.
          <br><br>
          ¿En qué puedo ayudarte hoy? Puedo escribir código, analizar datos o simplemente charlar.
        </div>
      </div>
      <ChatMessageItem
        v-for="(m, i) in messages"
        :key="m.id"
        :msg="m"
        :avatar="avatar"
        @edit="editMessage(i)"
        @regenerate="regenerate(i)"
        @modify="(action) => modifyResponse(i, action)"
      />
    </main>

    <!-- Indicador de escritura -->
    <div id="typing-indicator" ref="typingEl" class="message ai" :class="{ hidden: !typing }" style="margin-bottom: 20px;">
      <div class="message-avatar">M</div>
      <div class="message-content">
        <div class="typing-indicator" :class="{ hidden: typing !== 'text' && typing !== 'image' }">
          <div class="typing-dot" />
          <div class="typing-dot" />
          <div class="typing-dot" />
        </div>
        <div class="recording-indicator" :class="{ hidden: typing !== 'audio' }">
          <div class="mic-icon">
            <svg viewBox="0 0 24 24" width="24" height="24">
              <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
              <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
            </svg>
          </div>
          <div class="sound-waves">
            <span /><span /><span />
          </div>
          <span class="recording-text" />
        </div>
        <div class="music-indicator" :class="{ hidden: typing !== 'music' }">
          <div class="music-note">🎵</div>
          <div class="music-wave" />
          <div class="music-wave" />
          <div class="music-wave" />
        </div>
        <div class="video-indicator" :class="{ hidden: typing !== 'video' }">
          <div class="video-loader">
            <svg viewBox="0 0 24 24" width="24" height="24" class="video-icon">
              <path d="M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z" fill="currentColor" />
            </svg>
            <div class="video-spinner" />
          </div>
        </div>
      </div>
    </div>
  </div>

  <div id="suggestions-bar" class="suggestions-bar" :style="suggestions === null ? undefined : { display: suggestions.length ? 'flex' : 'none' }">
    <button
      v-for="(text, i) in suggestions ?? []"
      :key="`${suggestionsRound}-${i}`"
      class="suggestion-chip"
      :style="{ animation: 'chipSlideIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards', animationDelay: `${i * 0.05}s`, ...(pressedChip === i ? { transform: 'scale(0.95)', opacity: '0.6' } : {}) }"
      @click.prevent="useSuggestion(text, i)"
    >
      <span class="suggestion-icon">{{ ICONS_POOL[i % ICONS_POOL.length] }}</span>
      <span class="suggestion-text">{{ text }}</span>
    </button>
  </div>

  <!-- Área de Entrada -->
  <footer class="input-area">
    <div class="input-wrapper">
      <button id="attach-btn" class="attach-btn" title="Adjuntar archivo" aria-label="Adjuntar archivo" @click="fileInput?.click()">
        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path d="M16.5 6v11.5c0 2.21-1.79 4-4 4s-4-1.79-4-4V5a2.5 2.5 0 0 1 5 0v10.5c0 .55-.45 1-1 1s-1-.45-1-1V6H10v9.5a2.5 2.5 0 0 0 5 0V5c0-2.21-1.79-4-4-4S7 2.79 7 5v12.5c0 3.04 2.46 5.5 5.5 5.5s5.5-2.46 5.5-5.5V6h-1.5z" />
        </svg>
      </button>
      <input id="file-input" ref="fileInput" type="file" :accept="FILE_ACCEPT" style="display: none;" @change="onFilesChosen">
      <div id="attachments-area" class="attachments-area">
        <div v-for="chip in chips" :key="chip.id" class="attachment-chip">
          <span class="attachment-icon">{{ fileIcon(fileExtension(chip.name)) }}</span>
          <span class="attachment-name" :title="chip.name">{{ chip.name }}</span>
          <span v-if="chip.loading" class="attachment-loading">⏳</span>
          <span v-else class="attachment-remove" @click="removeAttachment(chip.id)">×</span>
        </div>
      </div>
      <textarea
        id="message-input"
        ref="inputEl"
        v-model="input"
        class="message-input"
        :placeholder="recording ? 'Grabando... (Haz clic para enviar)' : 'Escribe tu mensaje aquí...'"
        rows="1"
        autocomplete="off"
        spellcheck="false"
        @input="autoResize"
        @keydown.enter.exact.prevent="send"
      />
      <button id="web-search-btn" class="web-search-btn" :class="{ active: webSearch }" title="Búsqueda web" aria-label="Activar búsqueda web" @click="webSearch = !webSearch">
        <svg viewBox="0 0 24 24" width="20" height="20" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" fill="currentColor" />
        </svg>
      </button>
      <button id="send-button" class="send-button" :class="{ recording }" :disabled="sending" :style="{ opacity: sending ? '0.5' : '1' }" aria-label="Enviar mensaje" @click="sendOrRecord">
        <svg v-if="recording" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" />
        </svg>
        <svg v-else-if="canSend" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" fill="currentColor" />
        </svg>
        <svg v-else viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" fill="currentColor" />
          <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" fill="currentColor" />
        </svg>
      </button>
    </div>
  </footer>

  <!-- Modal Lightbox para Imágenes -->
  <div id="image-lightbox" class="image-lightbox" :class="{ hidden: !lightboxUrl }">
    <div class="lightbox-overlay" @click="closeLightbox" />
    <div class="lightbox-content">
      <button class="lightbox-close" aria-label="Cerrar" @click="closeLightbox">&times;</button>
      <button class="lightbox-download" aria-label="Descargar imagen" @click.stop="downloadImage(lightboxUrl, 'mirai-generated-image.png')">
        <svg viewBox="0 0 24 24" width="24" height="24">
          <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" />
        </svg>
      </button>
      <img id="lightbox-img" :src="lightboxUrl || undefined" alt="Imagen en pantalla completa">
    </div>
  </div>

  <!-- Zona para soltar archivos -->
  <Teleport to="body">
    <div id="drop-zone-overlay" class="drop-zone-overlay" :class="{ active: dropActive }">
      <div class="drop-zone-content">
        <h3>📎 Suelta los archivos aquí</h3>
        <p>PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX, TXT, CSV</p>
      </div>
    </div>
  </Teleport>

  <!-- Conversaciones, en el panel de la barra lateral -->
  <Teleport to="#sidebar-page-section" defer>
    <div class="conversations-header">
      <h4>Conversaciones</h4>
      <button id="new-conversation-btn" class="new-conv-btn" title="Nueva conversación" @click="createNewConversation">
        <svg viewBox="0 0 24 24" width="16" height="16">
          <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
        </svg>
      </button>
    </div>
    <ul id="conversations-list" class="conversations-list">
      <template v-if="enrolledCourses.length">
        <li class="conv-section-title"><span>📚 Cursos Iniciados</span></li>
        <li
          v-for="course in enrolledCourses"
          :key="`course-${course.course_id || course.metadata_course_id}`"
          class="conv-item conv-course-item"
          :class="{ active: !!currentCourseId && (course.course_id || course.metadata_course_id) === currentCourseId }"
          @click="switchToCourse(course.course_id)"
        >
          <span class="conv-item-icon">📖</span>
          <div class="conv-item-info">
            <span class="conv-item-title">{{ course.title }}</span>
            <span class="conv-item-date">Curso</span>
          </div>
          <div class="conv-item-actions">
            <button class="conv-action-btn resume-btn" title="Continuar">
              <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
            </button>
          </div>
        </li>
        <li class="conv-separator"><hr></li>
      </template>

      <template v-if="conversations.length">
        <li class="conv-section-title"><span>💬 Conversaciones</span></li>
        <li v-for="conv in conversations" :key="conv.id" class="conv-item" :class="{ active: !currentCourseId && conv.id === conversationId }" @click="switchConversation(conv.id)">
          <span class="conv-item-icon">💬</span>
          <div class="conv-item-info">
            <input
              v-if="renamingId === conv.id"
              ref="renameInput"
              v-model="renameTitle"
              type="text"
              class="conv-rename-input"
              maxlength="100"
              @click.stop
              @keydown.enter.prevent="saveRename(conv)"
              @keydown.esc="renamingId = null"
              @blur="saveRename(conv)"
            >
            <template v-else>
              <span class="conv-item-title">{{ conv.title }}</span>
              <span class="conv-item-date">{{ formatConversationDate(conv.updated_at || conv.created_at) }}</span>
            </template>
          </div>
          <div class="conv-item-actions">
            <button class="conv-action-btn rename-btn" title="Renombrar" @click.stop="startRename(conv)">
              <svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" /></svg>
            </button>
            <button class="conv-action-btn delete" title="Eliminar" @click.stop="deleteConversation(conv.id)">
              <svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" /></svg>
            </button>
          </div>
        </li>
      </template>
      <li v-else-if="conversationsLoaded && !enrolledCourses.length" class="conv-empty">No hay conversaciones aún</li>
    </ul>
  </Teleport>
</template>

<script setup lang="ts">
// Migración de public/chat.html (la lógica estaba en public/app.js).
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import MenuToggle from '@/components/MenuToggle.vue';
import ChatMessageItem, { type ModifyAction } from '@/components/chat/ChatMessageItem.vue';
import { api, apiFetch, errorMessage } from '@/lib/api';
import { handleMarkdownClick } from '@/lib/markdown-actions';
import { currentUser } from '@/lib/session';
import { closeMenu } from '@/lib/shell';
import { goToLegacy, pageHref } from '@/lib/legacy';
import { FILE_ACCEPT, MAX_FILE_SIZE, SUPPORTED_FORMATS, extractText, fileExtension, fileIcon } from '@/lib/chat-files';
import {
  AUDIO_MODES,
  AUDIO_MODE_KEY,
  CONVERSATION_KEY,
  clientTimeZone,
  consumeChatStream,
  downloadImage,
  formatConversationDate,
  nowTime,
  readAudioMode,
  saveToLocalHistory,
  selectedModel,
  typingKindFor,
  type AudioMode,
  type ChatMessage,
  type ChatResponse,
  type Conversation,
  type EnrolledCourse,
  type HistoryMessage,
  type TypingKind,
} from '@/lib/chat';

const route = useRoute();
const router = useRouter();

const ICONS_POOL = ['💡', '🤔', '🎯', '🧪', '📝', '🚀', '🔍', '✨'];
const MAX_INPUT_HEIGHT = 120;
// Cada cuántos mensajes enviados se pide al servidor que analice las
// preferencias del usuario.
const PREF_INTERVAL = 10;

const AUDIO_MODE_UI: Record<AudioMode, { label: string; class: string; notice: string }> = {
  auto: { label: 'Auto', class: '', notice: '🔊 Modo automático' },
  always: { label: 'Audio', class: 'active', notice: '🎙️ Siempre audio' },
  never: { label: 'Texto', class: 'text-mode', notice: '🔇 Solo texto' },
};

// ── Estado ────────────────────────────────────────────────────────────────
const messages = ref<ChatMessage[]>([]);
const showWelcome = ref(true);
const conversationId = ref<string>('');
const currentCourseId = ref<string | null>(null);
const headerTitle = ref('Mirai Chat');
const audioMode = ref<AudioMode>(readAudioMode());
const typing = ref<TypingKind | null>(null);
const sending = ref(false);
const input = ref('');
const webSearch = ref(false);
const suggestions = ref<string[] | null>(null);
const suggestionsRound = ref(0);
const pressedChip = ref<number | null>(null);

const messagesEl = ref<HTMLElement | null>(null);
const typingEl = ref<HTMLElement | null>(null);
const inputEl = ref<HTMLTextAreaElement | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);

let nextId = 1;
let sentCount = 0;
let disposed = false;

function pushMessage(m: Omit<ChatMessage, 'id' | 'time'> & { time?: string }): ChatMessage {
  messages.value.push({ time: nowTime(), ...m, id: nextId++ });
  // El proxy reactivo: los cambios posteriores sí repintan.
  const added = messages.value[messages.value.length - 1]!;
  void nextTick(scrollToBottom);
  return added;
}

const systemMessage = (content: string) => pushMessage({ role: 'system', kind: 'text', content });

function clearMessages() {
  messages.value = [];
  showWelcome.value = false;
}

// ── Avatar del usuario ────────────────────────────────────────────────────
const profile = ref<{ firstName?: string; avatarUrl?: string } | null>(null);
const avatar = computed(() => {
  const name = (profile.value?.firstName || currentUser.value?.name || '').trim();
  return { url: profile.value?.avatarUrl || null, initial: name ? name[0]!.toUpperCase() : 'U' };
});

async function loadProfile() {
  try {
    const { ok, data } = await api.get<{ profile?: { firstName?: string; avatarUrl?: string } }>('/api/user/profile');
    if (ok && data.profile) profile.value = data.profile;
  } catch {
    // Silencioso: no bloquear el chat si falla.
  }
}

// ── Scroll y entrada ──────────────────────────────────────────────────────
function scrollToBottom() {
  const el = messagesEl.value;
  el?.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
}

function isNearBottom(threshold = 120) {
  const el = messagesEl.value;
  return !el || el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
}

function autoResize() {
  const el = inputEl.value;
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${Math.min(el.scrollHeight, MAX_INPUT_HEIGHT)}px`;
}

async function focusInput() {
  await nextTick();
  autoResize();
  inputEl.value?.focus();
}

function showTyping(kind: TypingKind) {
  typing.value = kind;
  setTimeout(() => typingEl.value?.scrollIntoView({ behavior: 'smooth' }), 300);
}

// ── Modo de audio ─────────────────────────────────────────────────────────
function setAudioMode(mode: AudioMode) {
  audioMode.value = mode;
  localStorage.setItem(AUDIO_MODE_KEY, mode);
}

function cycleAudioMode() {
  setAudioMode(AUDIO_MODES[(AUDIO_MODES.indexOf(audioMode.value) + 1) % AUDIO_MODES.length]!);
  systemMessage(AUDIO_MODE_UI[audioMode.value].notice);
}

// ── Sugerencias ───────────────────────────────────────────────────────────
function setSuggestions(list: string[] | undefined) {
  suggestions.value = list ?? [];
  suggestionsRound.value++;
  pressedChip.value = null;
  void nextTick(() => document.getElementById('suggestions-bar')?.scrollTo({ left: 0 }));
}

function useSuggestion(text: string, index: number) {
  pressedChip.value = index;
  input.value = text;
  void send();
}

// ── Envío ─────────────────────────────────────────────────────────────────
interface ChatRequest {
  message: string;
  force_type?: number | null;
  audio_mode?: AudioMode;
  stream?: boolean;
  web_search?: boolean;
  course_id?: string;
  lesson_id?: string;
}

function postChat(body: ChatRequest): Promise<Response> {
  return apiFetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      conversation_id: conversationId.value,
      audio_mode: audioMode.value,
      model: selectedModel(),
      time_zone: clientTimeZone(),
      ...body,
    }),
  });
}

async function postChatJson(body: ChatRequest): Promise<ChatResponse> {
  const res = await postChat(body);
  if (!res.ok) throw new Error(`Error HTTP: ${res.status}`);
  return (await res.json()) as ChatResponse;
}

const canSend = computed(() => input.value.trim().length > 0 || attachments.value.length > 0);

function countSentMessage() {
  if (++sentCount < PREF_INTERVAL) return;
  sentCount = 0;
  api
    .post('/api/user/preferences/analyze', { conversation_id: conversationId.value })
    .catch((e: unknown) => console.warn('Error analizando preferencias:', e));
}

/** Pinta una respuesta JSON de /api/chat según su tipo. */
function showResponse(data: ChatResponse, userText: string) {
  if (data.type === 'image' && data.image_url) {
    pushMessage({ role: 'assistant', kind: 'text', content: `![Imagen generada](${data.image_url})` });
    return true;
  }
  if (data.type === 'music' && data.audio_url) {
    pushMessage({ role: 'assistant', kind: 'text', content: `🎵 Canción generada: ${userText}`, audioUrl: data.audio_url });
    return true;
  }
  if (data.type === 'youtube' && data.videos) {
    pushMessage({ role: 'assistant', kind: 'youtube', content: data.response || '', videos: data.videos });
    return true;
  }
  if (data.type === 'video' && data.video_url) {
    pushMessage({ role: 'assistant', kind: 'video', content: userText, videoUrl: data.video_url, thumbnailUrl: data.thumbnail_url || '' });
    return true;
  }
  if (data.type === 'video') {
    pushMessage({ role: 'assistant', kind: 'text', content: data.response || '🎬 Video no disponible' });
    return true;
  }
  if (data.response) {
    pushMessage({ role: 'assistant', kind: 'text', content: data.response, audioUrl: data.audio_url || null, reasoning: data.reasoning || '' });
    return true;
  }
  return false;
}

// Tras una imagen, la IA la comenta brevemente con su personalidad.
function commentImage(userText: string) {
  setTimeout(() => {
    postChatJson({
      message: `[SYSTEM_IMAGE_COMMENT] El usuario pidió esta imagen: "${userText}". Reacciona y admírala brevemente con tu personalidad, en el mismo idioma del usuario. Máximo 2 frases. No describas la imagen técnicamente, sé espontánea y emotiva.`,
      audio_mode: 'never',
      force_type: 1,
    })
      .then((data) => {
        if (data.response && !disposed) pushMessage({ role: 'assistant', kind: 'text', content: data.response });
      })
      .catch((e: unknown) => console.warn('No se pudo generar comentario de imagen:', e));
  }, 800);
}

/** Burbuja de la IA que se va rellenando con el streaming. */
function startStreamingMessage() {
  const msg = pushMessage({ role: 'assistant', kind: 'text', content: '', streaming: true, reasoning: '' });
  const startedAt = Date.now();
  let text = '';
  let thought = '';
  let sawContent = false;
  let queued = false;
  let finished = false;

  // Un repintado por frame: con trozos de pocos caracteres, reformatear el
  // markdown en cada uno satura el hilo principal.
  const flush = () => {
    const stick = isNearBottom();
    msg.content = text;
    if (stick) void nextTick(scrollToBottom);
  };

  return {
    pushReasoning(delta: string) {
      typing.value = null;
      thought += delta;
      msg.reasoning = thought;
      msg.reasoningLabel = 'Pensando…';
      msg.reasoningStreaming = true;
      if (isNearBottom()) void nextTick(scrollToBottom);
    },
    pushContent(delta: string) {
      typing.value = null;
      sawContent = true;
      text += delta;
      if (queued || finished) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        if (!finished) flush();
      });
    },
    // El modelo de respaldo reescribe la respuesta desde cero.
    reset() {
      text = '';
      thought = '';
      sawContent = false;
      msg.reasoning = '';
      msg.content = '';
    },
    hasContent: () => text.length > 0,
    remove() {
      messages.value = messages.value.filter((m) => m.id !== msg.id);
    },
    finish({ response, reasoning }: { response?: string | undefined; reasoning?: string | undefined } = {}) {
      finished = true;
      if (typeof response === 'string' && response.trim()) text = response;
      const serverReasoning = typeof reasoning === 'string' && reasoning.trim() ? reasoning : '';
      // Cuando el modelo solo emite pensamiento, el servidor lo asciende a
      // respuesta: el cuadro sobra porque diría lo mismo que la burbuja.
      if (!sawContent && !serverReasoning && thought) msg.reasoning = '';
      else if (serverReasoning) msg.reasoning = serverReasoning;
      if (msg.reasoning) {
        msg.reasoningStreaming = false;
        msg.reasoningLabel = `Razonó durante ${Math.max(1, Math.round((Date.now() - startedAt) / 1000))} s`;
      }
      msg.content = text;
      msg.streaming = false;
      msg.time = nowTime();
      if (isNearBottom()) void nextTick(scrollToBottom);
      return text;
    },
  };
}

async function send() {
  const userInput = input.value.trim();
  if ((!userInput && attachments.value.length === 0) || sending.value) return;
  countSentMessage();

  let fullMessage = userInput;
  if (attachments.value.length) {
    const section = attachments.value.map((att) => `[Archivo: ${att.name}]\n${att.text}`).join('\n\n---\n\n');
    fullMessage = fullMessage ? `${fullMessage}\n\n---\n\n${section}` : section;
  }

  input.value = '';
  attachments.value = [];
  chips.value = chips.value.filter((c) => c.loading);
  void nextTick(autoResize);

  pushMessage({ role: 'user', kind: 'text', content: fullMessage });
  sending.value = true;
  showTyping(typingKindFor(userInput));

  let stream: ReturnType<typeof startStreamingMessage> | null = null;
  try {
    const res = await postChat({ message: fullMessage, force_type: null, web_search: webSearch.value, stream: true });
    if (!res.ok) throw new Error(`Error HTTP: ${res.status}`);

    // El servidor solo responde en SSE para las respuestas de texto; imagen,
    // música, vídeo y YouTube siguen llegando como JSON de una pieza.
    if ((res.headers.get('content-type') || '').includes('text/event-stream')) {
      const s = startStreamingMessage();
      stream = s;
      const done = await consumeChatStream(res, {
        reasoning: (d) => s.pushReasoning(d),
        content: (d) => s.pushContent(d),
        reset: () => s.reset(),
      });
      const finalText = s.finish({ response: done.response, reasoning: done.reasoning });
      stream = null;
      setSuggestions(done.suggestions);
      void loadConversations();
      if (finalText) saveToLocalHistory(finalText);
      return;
    }

    const data = (await res.json()) as ChatResponse;
    if (!showResponse(data, userInput)) throw new Error('No se recibió respuesta válida');
    if (data.type === 'image' && data.image_url) commentImage(userInput);
    setSuggestions(data.suggestions);
    void loadConversations();
    const textToSave = data.response || data.response_text || '';
    if (textToSave) saveToLocalHistory(textToSave);
  } catch (error) {
    console.error('Error enviando mensaje:', error);
    // Si el stream se cortó a mitad, se conserva lo ya escrito; si no había
    // nada, se retira la burbuja vacía.
    if (stream) {
      if (stream.hasContent()) stream.finish();
      else stream.remove();
    }
    systemMessage(`⚠️ Error: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    typing.value = null;
    sending.value = false;
    void focusInput();
  }
}

// ── Acciones sobre mensajes ───────────────────────────────────────────────
function editMessage(index: number) {
  const msg = messages.value[index];
  if (!msg) return;
  input.value = msg.content;
  messages.value.splice(index, 1);
  void focusInput();
}

const MODIFY_PROMPTS: Record<ModifyAction, string> = {
  summarize: 'Resume de manera concisa la siguiente respuesta:\n\n',
  extend: 'Expande y detalla más la siguiente respuesta:\n\n',
  formal: 'Reescribe con un tono formal y profesional:\n\n',
  friendly: 'Reescribe con un tono amigable y cercano:\n\n',
};

/** Rehace una respuesta de la IA en su sitio con el mensaje indicado. */
async function rewrite(msg: ChatMessage, message: string, keepReasoning: boolean) {
  msg.pending = true;
  try {
    const data = await postChatJson({ message });
    if (data.response) {
      msg.content = data.response;
      msg.reasoning = keepReasoning ? data.reasoning || '' : '';
      msg.reasoningLabel = 'Razonamiento';
      msg.audioUrl = null;
      msg.time = nowTime();
      saveToLocalHistory(data.response);
    }
  } catch (error) {
    console.error('Error reescribiendo la respuesta:', error);
  } finally {
    msg.pending = false;
  }
}

function regenerate(index: number) {
  const msg = messages.value[index];
  const prev = messages.value[index - 1];
  if (!msg || !prev || prev.role !== 'user' || prev.kind !== 'text') return;
  void rewrite(msg, `${prev.content}\n\n(Por favor, genera una respuesta diferente)`, true);
}

function modifyResponse(index: number, action: ModifyAction) {
  const msg = messages.value[index];
  if (msg) void rewrite(msg, MODIFY_PROMPTS[action] + msg.content, false);
}

// Botones del HTML formateado (código, tablas, imágenes) y abrir imágenes.
function onMessagesClick(e: MouseEvent) {
  if (handleMarkdownClick(e)) return;
  const target = e.target as HTMLElement;
  if (target instanceof HTMLImageElement && target.classList.contains('lightbox-trigger')) {
    lightboxUrl.value = target.src;
    document.body.style.overflow = 'hidden';
  }
}

// ── Lightbox ──────────────────────────────────────────────────────────────
const lightboxUrl = ref('');

function closeLightbox() {
  lightboxUrl.value = '';
  document.body.style.overflow = '';
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && lightboxUrl.value) closeLightbox();
}

// ── Adjuntos ──────────────────────────────────────────────────────────────
interface Attachment {
  id: string;
  name: string;
  type: string;
  text: string;
  r2_key?: string;
  url?: string;
}

const attachments = ref<Attachment[]>([]);
const chips = ref<{ id: string; name: string; loading: boolean }[]>([]);

async function processFile(file: File) {
  if (file.size > MAX_FILE_SIZE) {
    alert(`El archivo "${file.name}" excede el tamaño máximo de 10MB`);
    return;
  }
  const extension = fileExtension(file.name);
  if (!SUPPORTED_FORMATS.includes(extension)) {
    alert(`El formato .${extension} no es soportado`);
    return;
  }

  const id = crypto.randomUUID();
  chips.value.push({ id, name: file.name, loading: true });
  try {
    const text = await extractText(file, extension);

    const form = new FormData();
    form.append('file', file);
    form.append('conversation_id', conversationId.value);
    const res = await apiFetch('/api/upload', { method: 'POST', body: form });
    if (!res.ok) throw new Error(`Error subiendo archivo: ${res.status}`);
    const upload = (await res.json()) as { r2_key?: string; url?: string };

    attachments.value.push({ id, name: file.name, type: extension, text, ...upload });
    const chip = chips.value.find((c) => c.id === id);
    if (chip) chip.loading = false;
  } catch (error) {
    console.error(`Error procesando archivo ${file.name}:`, error);
    chips.value = chips.value.filter((c) => c.id !== id);
    alert(`Error al procesar "${file.name}". Intenta con otro archivo.`);
  }
}

function removeAttachment(id: string) {
  attachments.value = attachments.value.filter((a) => a.id !== id);
  chips.value = chips.value.filter((c) => c.id !== id);
}

async function processFiles(files: FileList | null | undefined) {
  for (const file of Array.from(files ?? [])) await processFile(file);
}

async function onFilesChosen() {
  await processFiles(fileInput.value?.files);
  // Para poder volver a elegir el mismo archivo.
  if (fileInput.value) fileInput.value.value = '';
}

// Arrastrar y soltar en toda la página.
const dropActive = ref(false);
let dragCounter = 0;

function onDragEnter(e: DragEvent) {
  e.preventDefault();
  if (++dragCounter === 1) dropActive.value = true;
}

function onDragLeave(e: DragEvent) {
  e.preventDefault();
  if (--dragCounter <= 0) {
    dragCounter = 0;
    dropActive.value = false;
  }
}

function onDragOver(e: DragEvent) {
  e.preventDefault();
}

function onDrop(e: DragEvent) {
  e.preventDefault();
  dragCounter = 0;
  dropActive.value = false;
  void processFiles(e.dataTransfer?.files);
}

// ── Notas de voz (el botón de enviar graba si no hay texto) ──────────────
const recording = ref(false);
let mediaRecorder: MediaRecorder | null = null;
let audioChunks: Blob[] = [];

async function sendOrRecord() {
  if (canSend.value) await send();
  else if (!recording.value) await startRecording();
  else stopRecording();
}

async function startRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);
    audioChunks = [];
    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) audioChunks.push(event.data);
    };
    mediaRecorder.onstop = () => {
      stream.getTracks().forEach((track) => track.stop());
      if (!disposed) void processAudio(new Blob(audioChunks, { type: 'audio/webm' }));
    };
    mediaRecorder.start();
    recording.value = true;
  } catch (err) {
    console.error('Error accediendo al micrófono:', err);
    alert('No se pudo acceder al micrófono. Verifica los permisos.');
  }
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
  recording.value = false;
}

async function processAudio(blob: Blob) {
  showTyping('text');
  try {
    const uploadForm = new FormData();
    uploadForm.append('audio', blob, `voice-${Date.now()}.webm`);
    uploadForm.append('conversation_id', conversationId.value);
    const upload = await apiFetch('/api/upload-audio', { method: 'POST', body: uploadForm });
    if (!upload.ok) throw new Error(`Error subiendo audio: ${upload.status}`);

    const transcribeForm = new FormData();
    transcribeForm.append('audio', blob, `voice-${Date.now()}.webm`);
    transcribeForm.append('conversation_id', conversationId.value);
    const res = await apiFetch('/api/transcribe', { method: 'POST', body: transcribeForm });
    if (!res.ok) throw new Error(`Error transcribiendo: ${res.status}`);
    const transcription = (await res.json()) as { success?: boolean; audio_url?: string; transcription?: string };

    if (!transcription.success || !transcription.audio_url) {
      systemMessage('⚠️ Error procesando audio');
      return;
    }
    pushMessage({ role: 'user', kind: 'user-audio', content: transcription.transcription || '', audioUrl: transcription.audio_url });

    // La transcripción va a la IA como un mensaje normal (sin streaming).
    const text = transcription.transcription || '';
    const data = await postChatJson({ message: text, force_type: null });
    if (!showResponse(data, text)) throw new Error('No se recibió respuesta válida');
    void loadConversations();
  } catch (error) {
    console.error('Error procesando audio:', error);
    systemMessage(`⚠️ Error de audio: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    typing.value = null;
  }
}

// ── Conversaciones ────────────────────────────────────────────────────────
const conversations = ref<Conversation[]>([]);
const enrolledCourses = ref<EnrolledCourse[]>([]);
const conversationsLoaded = ref(false);

function setConversation(id: string) {
  conversationId.value = id;
  localStorage.setItem(CONVERSATION_KEY, id);
}

async function loadConversations() {
  try {
    const { ok, data } = await api.get<{ regular?: Conversation[] }>('/api/conversations');
    if (!ok) {
      console.error('Error en respuesta API:', 'conversations');
      return;
    }
    const courses = await api.get<EnrolledCourse[]>('/api/enrolled-courses');
    conversations.value = data.regular || [];
    enrolledCourses.value = courses.ok && Array.isArray(courses.data) ? courses.data : [];
    conversationsLoaded.value = true;
  } catch (error) {
    console.error('Error cargando conversaciones:', error);
  }
}

async function loadHistory(id: string) {
  try {
    const res = await apiFetch(`/api/history/${encodeURIComponent(id)}`);
    if (!res.ok) return;
    const history = (await res.json()) as HistoryMessage[];
    clearMessages();
    for (const msg of history) {
      if (msg.role === 'user') {
        if (msg.audio_url) pushMessage({ role: 'user', kind: 'user-audio', content: msg.content, audioUrl: msg.audio_url });
        else pushMessage({ role: 'user', kind: 'text', content: msg.content });
      } else if (msg.role === 'assistant') {
        if (msg.video_url) {
          const prompt = msg.content.replace('🎬 Aquí tienes el video que pediste:\n\n_Prompt: ', '').replace(/_$/, '');
          pushMessage({ role: 'assistant', kind: 'video', content: prompt, videoUrl: msg.video_url, thumbnailUrl: msg.thumbnail_url || '' });
        } else {
          pushMessage({ role: 'assistant', kind: 'text', content: msg.content, audioUrl: msg.audio_url || null, reasoning: msg.reasoning || '' });
        }
      }
    }
    await nextTick();
    if (messagesEl.value) messagesEl.value.scrollTop = messagesEl.value.scrollHeight;
  } catch (error) {
    console.error('Error cargando historial:', error);
  }
}

async function educationConversation(courseId: string): Promise<string> {
  const { data } = await api.get<{ conversation_id: string }>(`/api/education-conversation?course=${encodeURIComponent(courseId)}`);
  return data.conversation_id;
}

async function switchConversation(id: string) {
  if (id === conversationId.value && !currentCourseId.value) return;
  currentCourseId.value = null;
  setConversation(id);
  clearMessages();
  await loadHistory(id);
  closeMenu();
}

async function switchToCourse(courseId: string) {
  // Se recuerda la última conversación normal.
  if (!currentCourseId.value) localStorage.setItem('mirai-ai-last-normal-conv', conversationId.value);
  const convId = await educationConversation(courseId);
  setConversation(convId);
  currentCourseId.value = courseId;
  localStorage.setItem('mirai-ai-course-id', courseId);
  clearMessages();
  await loadHistory(convId);
  closeMenu();
}

async function createNewConversation() {
  setConversation(crypto.randomUUID());
  currentCourseId.value = null;
  clearMessages();
  systemMessage('✨ Nueva conversación iniciada. ¿En qué puedo ayudarte?');
  await loadConversations();
  closeMenu();
  void focusInput();
}

const renamingId = ref<string | null>(null);
const renameTitle = ref('');
const renameInput = ref<HTMLInputElement[]>([]);

async function startRename(conv: Conversation) {
  renamingId.value = conv.id;
  renameTitle.value = conv.title;
  await nextTick();
  renameInput.value[0]?.focus();
  renameInput.value[0]?.select();
}

async function saveRename(conv: Conversation) {
  // Enter y el blur que le sigue llegan los dos: solo cuenta el primero.
  if (renamingId.value !== conv.id) return;
  renamingId.value = null;
  const title = renameTitle.value.trim();
  if (title && title !== conv.title) {
    try {
      await api.put('/api/conversations/rename', { conversation_id: conv.id, title });
    } catch (error) {
      console.error('Error renombrando:', error);
    }
  }
  await loadConversations();
}

async function deleteConversation(id: string) {
  if (!confirm('¿Eliminar esta conversación? No se puede deshacer.')) return;
  try {
    const { ok } = await api.delete('/api/chat/clear', { conversation_id: id });
    if (!ok) throw new Error('Error eliminando');
    if (id === conversationId.value) await createNewConversation();
    await loadConversations();
  } catch (error) {
    console.error('Error eliminando conversación:', error);
    alert('Error al eliminar la conversación.');
  }
}

// ── Arranque ──────────────────────────────────────────────────────────────
function queryParam(name: string): string | null {
  const v = route.query[name];
  return typeof v === 'string' && v ? v : null;
}

/** Tarea del aula o lección: el servidor crea (o recupera) el chat de estudio. */
async function startLearningSession(query: URLSearchParams): Promise<boolean> {
  try {
    const { ok, status, data } = await api.get<{ chat_id?: string; error?: string }>(`/api/get-or-create-learning-chat?${query.toString()}`);
    if (!ok || !data.chat_id) throw new Error(errorMessage(data, `Error del servidor: ${status}`));
    setConversation(data.chat_id);
    await loadHistory(data.chat_id);
    return true;
  } catch (err) {
    console.error('Error en inicio de sesión de aprendizaje:', err);
    return false;
  }
}

/** Primer mensaje de una lección: la IA saluda con el contexto del curso. */
async function sendEducationWelcome(courseId: string, lessonId: string) {
  pushMessage({ role: 'system', kind: 'banner', content: `Curso: ${courseId} | Lección: ${lessonId}` });
  try {
    const data = await postChatJson({ message: 'Hola, estoy listo para comenzar esta lección.', course_id: courseId, lesson_id: lessonId });
    if (data.response) {
      pushMessage({ role: 'assistant', kind: 'text', content: data.response, audioUrl: data.audio_url || null });
      if (data.suggestions) setSuggestions(data.suggestions);
    }
  } catch (error) {
    console.error('Error en welcome message:', error);
    systemMessage('⚠️ Error al cargar la lección. Intenta de nuevo.');
  }
}

async function loadOrCreateConversation() {
  const courseId = queryParam('course');
  const lessonId = queryParam('lesson');

  if (queryParam('mode') === 'education' && courseId) {
    // En las clases, solo texto.
    setAudioMode('never');
    if (!lessonId) {
      goToLegacy(`${pageHref('course_details')}?id=${encodeURIComponent(courseId)}`);
      return;
    }
    const convId = await educationConversation(courseId);
    setConversation(convId);
    currentCourseId.value = courseId;
    localStorage.setItem('mirai-ai-course-id', courseId);
    localStorage.setItem('mirai-ai-lesson-id', lessonId);
    await loadHistory(convId);

    const course = await api.get<{ title?: string }>(`/api/course-details?id=${encodeURIComponent(courseId)}`).catch(() => null);
    headerTitle.value = `Mirai AI - ${(course?.ok && course.data.title) || 'Curso'}`;
    await sendEducationWelcome(courseId, lessonId);
    return;
  }

  const savedId = localStorage.getItem(CONVERSATION_KEY);
  if (savedId) {
    setConversation(savedId);
    await loadHistory(savedId);
  } else {
    setConversation(crypto.randomUUID());
  }
}

async function init() {
  const contextTask = queryParam('context_task');
  const courseId = queryParam('course');
  const lessonId = queryParam('lesson');
  const mode = queryParam('context_mode') || queryParam('mode');

  // Qué se estudia: una tarea del aula o una lección de un curso. El prompt de
  // la tutora lo arma el servidor; el navegador solo dice qué y en qué modo.
  const learning = contextTask
    ? new URLSearchParams({ assignment_id: contextTask })
    : courseId && lessonId
      ? new URLSearchParams({ course_id: courseId, lesson_id: lessonId })
      : null;

  let started = false;
  if (learning && mode) {
    learning.set('mode', mode);
    started = await startLearningSession(learning);
  }
  if (!started) await loadOrCreateConversation();

  // Mensaje traído desde el inicio (?initial_message=...): se envía solo.
  const initial = queryParam('initial_message');
  if (initial && !disposed) {
    void router.replace({ name: 'chat' });
    input.value = initial;
    await send();
  }
}

onMounted(() => {
  document.addEventListener('dragenter', onDragEnter);
  document.addEventListener('dragleave', onDragLeave);
  document.addEventListener('dragover', onDragOver);
  document.addEventListener('drop', onDrop);
  document.addEventListener('keydown', onKeydown);
  void loadProfile();
  void loadConversations();
  void focusInput();
  void init();
});

onBeforeUnmount(() => {
  disposed = true;
  document.removeEventListener('dragenter', onDragEnter);
  document.removeEventListener('dragleave', onDragLeave);
  document.removeEventListener('dragover', onDragOver);
  document.removeEventListener('drop', onDrop);
  document.removeEventListener('keydown', onKeydown);
  if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
  if (lightboxUrl.value) closeLightbox();
});
</script>
