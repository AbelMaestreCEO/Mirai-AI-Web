<template>
  <!-- Aviso del modo educativo -->
  <div v-if="msg.kind === 'banner'" class="education-banner" style="background: linear-gradient(135deg, var(--accent-color), var(--accent-secondary)); color: white; padding: 16px 20px; border-radius: 12px; margin-bottom: 12px; text-align: center; font-size: 0.95rem; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
    <strong>🎓 Modo Educativo Activado</strong><br>
    <small>{{ msg.content }}</small>
  </div>

  <div v-else class="message fade-in" :class="msg.role" :style="msg.pending ? { opacity: '0.7' } : undefined">
    <div v-if="msg.role !== 'system'" class="message-avatar" :style="msg.role === 'user' ? 'padding:0;overflow:hidden;' : ''">
      <template v-if="msg.role === 'user'">
        <img v-if="avatar.url && !avatarFailed" :src="avatar.url" alt="Avatar" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;" @error="avatarFailed = true">
        <template v-else>{{ avatar.initial }}</template>
      </template>
      <template v-else>M</template>
    </div>

    <div class="message-content">
      <!-- Regenerándose / reescribiéndose -->
      <div v-if="msg.pending" class="typing-indicator">
        <div class="typing-dot" />
        <div class="typing-dot" />
        <div class="typing-dot" />
      </div>

      <template v-else>
        <!-- Razonamiento (cadena de pensamiento) -->
        <div v-if="msg.reasoning" class="message-reasoning" :class="{ collapsed: reasoningCollapsed, streaming: msg.reasoningStreaming }">
          <button type="button" class="reasoning-toggle" :aria-expanded="!reasoningCollapsed" @click="toggleReasoning">
            <span class="reasoning-icon">🧠</span>
            <span class="reasoning-label">{{ msg.reasoningLabel || 'Razonamiento' }}</span>
            <svg class="reasoning-chevron" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
              <path d="M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6z" />
            </svg>
          </button>
          <div ref="reasoningBody" class="reasoning-body">{{ msg.reasoning }}</div>
        </div>

        <!-- Vídeo generado -->
        <div v-if="msg.kind === 'video'" class="video-container">
          <div v-if="!videoPlaying" class="video-thumbnail-wrapper" @click="playVideo">
            <img :src="msg.thumbnailUrl || ''" alt="Thumbnail" class="video-thumbnail" loading="lazy">
            <button class="video-play-overlay" title="Reproducir">
              <svg viewBox="0 0 24 24" width="48" height="48"><circle cx="12" cy="12" r="11" fill="rgba(0,0,0,0.5)" stroke="white" stroke-width="1" /><path d="M8 5v14l11-7z" fill="white" /></svg>
            </button>
          </div>
          <video ref="videoEl" class="video-player" :class="{ hidden: !videoPlaying }" controls preload="metadata" :poster="msg.thumbnailUrl || ''">
            <source :src="msg.videoUrl" type="video/mp4">
            Tu navegador no soporta video.
          </video>
          <div class="video-info">
            <span class="video-badge">🎬 Video generado</span>
            <span class="video-prompt">{{ msg.content }}</span>
          </div>
          <div class="video-actions">
            <button class="video-download-btn" title="Descargar" @click="downloadVideo(msg.videoUrl || '', `mirai-video-${Date.now()}.mp4`)">
              <svg viewBox="0 0 24 24" width="16" height="16"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" fill="currentColor" /></svg>
              <span>Descargar</span>
            </button>
          </div>
        </div>

        <!-- Resultados de YouTube -->
        <template v-else-if="msg.kind === 'youtube'">
          <div class="yt-results-header">{{ msg.content || '🎬 Videos encontrados:' }}</div>
          <div class="yt-results-list">
            <div v-for="v in msg.videos" :key="v.videoId" class="yt-card" @click="openYouTube(v.videoId)">
              <div class="yt-thumb-wrap">
                <img :src="v.thumbnail" alt="" loading="lazy">
                <div class="yt-play-icon">
                  <svg viewBox="0 0 24 24" width="36" height="36"><circle cx="12" cy="12" r="11" fill="rgba(0,0,0,0.6)" stroke="white" stroke-width="1" /><path d="M9 6v12l10-6z" fill="white" /></svg>
                </div>
              </div>
              <div class="yt-info">
                <div class="yt-title">{{ v.title }}</div>
                <div class="yt-channel">{{ v.channel }}</div>
              </div>
            </div>
          </div>
          <div v-show="ytVideoId" ref="ytWrap" class="yt-player-wrap">
            <div class="yt-player-close-bar"><button class="yt-player-close-btn" title="Cerrar reproductor" @click="ytVideoId = null">✕ Cerrar</button></div>
            <div class="yt-player-container">
              <iframe v-if="ytVideoId" :src="`https://www.youtube.com/embed/${encodeURIComponent(ytVideoId)}?autoplay=1&rel=0`" frameborder="0" allow="autoplay; encrypted-media" allowfullscreen style="width:100%;aspect-ratio:16/9;border-radius:12px;" />
            </div>
          </div>
        </template>

        <!-- Nota de voz (del usuario, o respuesta de la IA en audio) -->
        <div v-else-if="msg.kind === 'user-audio' || (msg.role === 'assistant' && msg.audioUrl && !msg.streaming)" class="audio-player-container" :class="{ 'user-audio': msg.kind === 'user-audio' }" @click="toggleAudio">
          <div class="audio-player-header">
            <span class="audio-icon">{{ msg.kind === 'user-audio' ? '🎤' : '🎵' }}</span>
            <span class="audio-label">Mensaje de voz</span>
          </div>
          <audio ref="audioEl" controls class="custom-audio-player" preload="metadata" :src="msg.audioUrl || ''" @loadedmetadata="onAudioMeta" @timeupdate="onAudioTime">
            Tu navegador no soporta el elemento de audio.
          </audio>
          <div class="audio-duration">
            <span class="audio-time-current">{{ audioCurrent }}</span>
            <span class="audio-time-total">{{ audioTotal }}</span>
          </div>
        </div>

        <!-- Imágenes que mandó el usuario: encima del texto («esto» → «¿qué es?»).
             Con lightbox-trigger se abren en grande, como las generadas. -->
        <div v-if="msg.images?.length" class="message-images">
          <img v-for="src in msg.images" :key="src" :src="src" alt="Imagen adjunta" class="lightbox-trigger" loading="lazy">
        </div>

        <!-- Texto -->
        <div v-if="showText" class="message-body" v-html="html" />

        <!-- Fila de hora y acciones -->
        <div v-if="!msg.streaming" class="message-meta">
          <span class="message-time">{{ msg.time }}</span>
          <div v-if="msg.role === 'user' && msg.kind === 'text'" class="message-actions">
            <button class="msg-action edit-btn" title="Editar mensaje" @click="emit('edit')">
              <svg viewBox="0 0 24 24" width="14" height="14">
                <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
              </svg>
            </button>
          </div>
          <div v-else-if="msg.kind === 'video'" class="message-actions">
            <button class="msg-action copy-full-btn" :class="copyState" title="Copiar prompt" @click="copyContent">
              <svg v-if="copyState === 'success'" viewBox="0 0 24 24" width="14" height="14"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" /></svg>
              <svg v-else viewBox="0 0 24 24" width="14" height="14"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z" /></svg>
            </button>
          </div>
          <div v-else-if="msg.role === 'assistant' && msg.kind === 'text'" class="message-actions">
            <button class="msg-action copy-full-btn" :class="copyState" :title="msg.audioUrl ? 'Copiar texto original' : 'Copiar respuesta'" @click="copyContent">
              <svg v-if="copyState === 'success'" viewBox="0 0 24 24" width="14" height="14"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" /></svg>
              <svg v-else-if="copyState === 'error'" viewBox="0 0 24 24" width="14" height="14"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" /></svg>
              <svg v-else viewBox="0 0 24 24" width="14" height="14"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z" /></svg>
            </button>
            <button class="msg-action regenerate-btn" title="Regenerar respuesta" @click="emit('regenerate')">
              <svg viewBox="0 0 24 24" width="14" height="14"><path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z" /></svg>
            </button>
            <div class="options-wrapper">
              <button class="msg-action options-btn" title="Más opciones" @click.stop="menuOpen = !menuOpen">
                <svg viewBox="0 0 24 24" width="14" height="14"><path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" /></svg>
              </button>
              <div class="action-menu" :class="{ hidden: !menuOpen }">
                <button v-for="a in MODIFY_ACTIONS" :key="a.action" class="menu-item" @click="modify(a.action)"><span>{{ a.icon }}</span> {{ a.label }}</button>
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { balanceCodeFences, formatMessageContent } from '@/lib/markdown';
import { downloadVideo, type ChatMessage } from '@/lib/chat';

export type ModifyAction = 'summarize' | 'extend' | 'formal' | 'friendly';

const MODIFY_ACTIONS: { action: ModifyAction; icon: string; label: string }[] = [
  { action: 'summarize', icon: '📝', label: 'Resumir' },
  { action: 'extend', icon: '📈', label: 'Extender' },
  { action: 'formal', icon: '👔', label: 'Tono Formal' },
  { action: 'friendly', icon: '😊', label: 'Tono Amigable' },
];

const props = defineProps<{
  msg: ChatMessage;
  avatar: { url: string | null; initial: string };
}>();

const emit = defineEmits<{
  edit: [];
  regenerate: [];
  modify: [action: ModifyAction];
}>();

// Las respuestas de voz de la IA muestran solo el reproductor; el texto queda
// para el botón de copiar.
const showText = computed(
  () => props.msg.kind === 'text' && !(props.msg.role === 'assistant' && props.msg.audioUrl && !props.msg.streaming),
);

// Durante el streaming, el cursor va pegado al final del texto.
const html = computed(() =>
  props.msg.streaming
    ? formatMessageContent(balanceCodeFences(props.msg.content)) + '<span class="stream-caret"></span>'
    : formatMessageContent(props.msg.content),
);

const avatarFailed = ref(false);
watch(
  () => props.avatar.url,
  () => (avatarFailed.value = false),
);

// ── Razonamiento ──────────────────────────────────────────────────────────
const reasoningCollapsed = ref(true);
const reasoningBody = ref<HTMLElement | null>(null);

function toggleReasoning() {
  reasoningCollapsed.value = !reasoningCollapsed.value;
  // Al plegar se vuelve al principio del pensamiento; al desplegar se respeta
  // dónde estaba mirando el usuario.
  if (reasoningCollapsed.value && reasoningBody.value) reasoningBody.value.scrollTop = 0;
}

// Mientras se piensa, el cuadro plegado sigue la última línea (como una
// consola); al terminar vuelve arriba.
watch(
  () => [props.msg.reasoning, props.msg.reasoningStreaming] as const,
  async ([, streaming]) => {
    await nextTick();
    const el = reasoningBody.value;
    if (el) el.scrollTop = streaming ? el.scrollHeight : 0;
  },
);

// ── Copiar ────────────────────────────────────────────────────────────────
const copyState = ref<'' | 'success' | 'error'>('');

async function copyContent() {
  try {
    await navigator.clipboard.writeText(props.msg.content);
    copyState.value = 'success';
  } catch {
    copyState.value = 'error';
  }
  setTimeout(() => (copyState.value = ''), 2000);
}

// ── Menú de opciones ──────────────────────────────────────────────────────
const menuOpen = ref(false);

function modify(action: ModifyAction) {
  menuOpen.value = false;
  emit('modify', action);
}

function closeMenu() {
  menuOpen.value = false;
}

// Un clic en cualquier otro sitio cierra el menú; el listener solo existe
// mientras está abierto.
watch(menuOpen, (open) => {
  if (open) document.addEventListener('click', closeMenu);
  else document.removeEventListener('click', closeMenu);
});
onBeforeUnmount(() => document.removeEventListener('click', closeMenu));

// ── Audio ─────────────────────────────────────────────────────────────────
const audioEl = ref<HTMLAudioElement | null>(null);
const audioCurrent = ref('0:00');
const audioTotal = ref('--:--');

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return '0:00';
  return `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60)
    .toString()
    .padStart(2, '0')}`;
}

function onAudioMeta() {
  if (audioEl.value) audioTotal.value = formatTime(audioEl.value.duration);
}

function onAudioTime() {
  if (audioEl.value) audioCurrent.value = formatTime(audioEl.value.currentTime);
}

// Clic en la tarjeta (fuera de los controles nativos): reproducir/pausar.
function toggleAudio(e: MouseEvent) {
  const audio = audioEl.value;
  if (!audio || (e.target as HTMLElement).tagName === 'AUDIO') return;
  if (audio.paused) void audio.play();
  else audio.pause();
}

// ── Vídeo y YouTube ───────────────────────────────────────────────────────
const videoEl = ref<HTMLVideoElement | null>(null);
const videoPlaying = ref(false);

function playVideo() {
  videoPlaying.value = true;
  void videoEl.value?.play();
}

const ytVideoId = ref<string | null>(null);
const ytWrap = ref<HTMLElement | null>(null);

async function openYouTube(videoId: string) {
  ytVideoId.value = videoId;
  await nextTick();
  ytWrap.value?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
</script>
