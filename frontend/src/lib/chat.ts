// Piezas del chat sin interfaz: contrato de /api/chat, lectura del streaming,
// detectores de tipo de petición y descargas. La página es ChatPage.vue.

import { proxiedAssetUrl } from './markdown';

export const CONVERSATION_KEY = 'mirai-ai-conversation-id';
export const AUDIO_MODE_KEY = 'mirai-ai-audio-mode';
export const MODEL_KEY = 'mirai-ai-model';
const LOCAL_HISTORY_KEY = 'mirai-ai-local-history';

export type AudioMode = 'auto' | 'always' | 'never';
export const AUDIO_MODES: AudioMode[] = ['auto', 'always', 'never'];

export type TypingKind = 'text' | 'image' | 'music' | 'audio' | 'video';

export interface YouTubeVideo {
  videoId: string;
  title: string;
  channel: string;
  thumbnail: string;
}

/** Respuesta JSON de /api/chat (cuando no llega en streaming). */
export interface ChatResponse {
  type?: string;
  response?: string;
  response_text?: string;
  reasoning?: string;
  audio_url?: string | null;
  image_url?: string;
  video_url?: string;
  thumbnail_url?: string;
  videos?: YouTubeVideo[];
  query?: string;
  suggestions?: string[];
  error?: string;
}

/** Evento 'done' del streaming SSE. */
export interface ChatStreamDone {
  type: 'done';
  response?: string;
  reasoning?: string;
  suggestions?: string[];
  audio_url?: string | null;
}

/** Mensaje de /api/history/:id. */
export interface HistoryMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  audio_url?: string | null;
  video_url?: string | null;
  thumbnail_url?: string | null;
  reasoning?: string | null;
  /** Las imágenes que mandó el usuario, como /api/attachment/… (con la sesión). */
  images?: string[];
}

export interface Conversation {
  id: string;
  title: string;
  created_at?: string;
  updated_at?: string;
}

export interface EnrolledCourse {
  course_id: string;
  metadata_course_id?: string;
  title: string;
}

/** Un mensaje en pantalla. */
export interface ChatMessage {
  id: number;
  role: 'user' | 'assistant' | 'system';
  kind: 'text' | 'user-audio' | 'video' | 'youtube' | 'banner';
  /** Texto crudo (markdown) del mensaje. */
  content: string;
  time: string;
  audioUrl?: string | null;
  reasoning?: string;
  /** Etiqueta del cuadro de razonamiento ('Pensando…', 'Razonó durante 3 s'). */
  reasoningLabel?: string;
  reasoningStreaming?: boolean;
  /** Se está escribiendo por streaming: cursor y sin fila de acciones. */
  streaming?: boolean;
  /** Regenerándose o reescribiéndose (puntos de espera). */
  pending?: boolean;
  videoUrl?: string;
  thumbnailUrl?: string;
  videos?: YouTubeVideo[];
  /** Las imágenes que mandó el usuario con el mensaje. */
  images?: string[];
}

export function nowTime(): string {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/**
 * Zona horaria del navegador (IANA). El Worker la usa para sellar cada
 * mensaje con la hora local del usuario; sin ella cae a UTC.
 */
export function clientTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

export function readAudioMode(): AudioMode {
  const saved = localStorage.getItem(AUDIO_MODE_KEY);
  return AUDIO_MODES.includes(saved as AudioMode) ? (saved as AudioMode) : 'auto';
}

/** Modelo elegido en Configuración. */
export function selectedModel(): string {
  return localStorage.getItem(MODEL_KEY) || 'deepseek';
}

export function saveToLocalHistory(response: string): void {
  try {
    const history = JSON.parse(localStorage.getItem(LOCAL_HISTORY_KEY) || '[]') as unknown[];
    history.push({ role: 'assistant', content: response, timestamp: Date.now() });
    localStorage.setItem(LOCAL_HISTORY_KEY, JSON.stringify(history));
  } catch {
    // Historial local corrupto o lleno: no es imprescindible.
  }
}

export interface StreamHandlers {
  reasoning(delta: string): void;
  content(delta: string): void;
  reset(): void;
}

/** Lee la respuesta SSE de /api/chat y devuelve su evento 'done'. */
export async function consumeChatStream(response: Response, on: StreamHandlers): Promise<ChatStreamDone> {
  if (!response.body) throw new Error('Respuesta vacía');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let result: ChatStreamDone | null = null;
  let streamError: Error | null = null;

  const handleEvent = (payload: { type?: string; delta?: string; error?: string }) => {
    if (payload.type === 'reasoning') {
      if (payload.delta) on.reasoning(payload.delta);
    } else if (payload.type === 'content') {
      if (payload.delta) on.content(payload.delta);
    } else if (payload.type === 'reset') {
      on.reset();
    } else if (payload.type === 'done') {
      result = payload as ChatStreamDone;
    } else if (payload.type === 'error') {
      streamError = new Error(payload.error || 'Error procesando el mensaje');
    }
  };

  const processLines = (chunk: string) => {
    buffer += chunk;
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      try {
        handleEvent(JSON.parse(trimmed.slice(5).trim()) as { type?: string });
      } catch (e) {
        console.warn('Evento SSE ilegible:', e instanceof Error ? e.message : e);
      }
    }
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    processLines(decoder.decode(value, { stream: true }));
  }
  // Último evento sin salto de línea final.
  processLines(decoder.decode() + '\n');

  if (streamError) throw streamError;
  if (!result) throw new Error('La respuesta se interrumpió antes de completarse');
  return result;
}

// ── Detectores (solo eligen el indicador de espera) ────────────────────────

const MUSIC_KEYWORDS = [
  'canción', 'cancion', 'música', 'musica', 'melodía', 'melodia', 'canto', 'cantar', 'componer',
  'componer música', 'hacer música', 'crear música', 'generar música', 'tocar música', 'instrumental',
  'balada', 'rumba', 'ritmo', 'beat', 'tema', 'pieza musical', 'sonido', 'audio', 'canción de', 'música de',
  'song', 'music', 'melody', 'compose', 'create music', 'make music', 'generate music', 'play music',
  'ballad', 'track', 'tune', 'piece', 'soundtrack', 'song about', 'music about', 'create a song', 'write a song',
];

const VIDEO_KEYWORDS = [
  'video', 'vídeo', 'clip', 'película', 'corto', 'animación', 'animar', 'movimiento', 'cámara', 'cine',
  'film', 'movie', 'generar video', 'crear video', 'hacer video', 'producir video',
];

const IMAGE_PATTERN =
  /\b(imagen|foto|dibuja|dibujo|ilustra|ilustración|crea una imagen|genera una imagen|pinta|pintura|render|artwork|picture|draw|generate image|make an image|diseña|diseño)\b/;

export function typingKindFor(text: string): TypingKind {
  const lower = text.toLowerCase();
  if (VIDEO_KEYWORDS.some((k) => lower.includes(k))) return 'video';
  if (MUSIC_KEYWORDS.some((k) => lower.includes(k))) return 'music';
  if (IMAGE_PATTERN.test(lower)) return 'image';
  return 'text';
}

// ── Fechas y descargas ────────────────────────────────────────────────────

/** Fecha corta de la lista de conversaciones (las de D1 vienen en UTC sin 'Z'). */
export function formatConversationDate(dateStr?: string): string {
  if (!dateStr) return '';
  const date = new Date(`${dateStr}Z`);
  if (Number.isNaN(date.getTime())) return '';
  const diffDays = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Hoy';
  if (diffDays === 1) return 'Ayer';
  if (diffDays < 7) return `Hace ${diffDays} días`;
  return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

async function downloadVia(url: string, filename: string): Promise<void> {
  const res = await fetch(url, { credentials: 'same-origin' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const blobUrl = URL.createObjectURL(await res.blob());
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(blobUrl);
}

/** Descarga una imagen generada (a través del Worker, que hace de proxy de R2). */
export async function downloadImage(imageUrl: string, filename = 'imagen.png'): Promise<void> {
  try {
    await downloadVia(proxiedAssetUrl(imageUrl.replace(location.origin, ''), 'image'), filename);
  } catch (error) {
    console.error('Error descargando imagen:', error);
    alert('No se pudo descargar automáticamente. Haz clic derecho en la imagen y selecciona "Guardar imagen como..."');
  }
}

export async function downloadVideo(videoUrl: string, filename: string): Promise<void> {
  try {
    await downloadVia(proxiedAssetUrl(videoUrl, 'video'), filename);
  } catch (error) {
    console.error('Error descargando video:', error);
    alert('No se pudo descargar automáticamente. Haz clic derecho y "Guardar como..."');
  }
}
