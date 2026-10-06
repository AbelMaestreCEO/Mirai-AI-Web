<template>
  <header class="header">
    <MenuToggle />
    <div class="header-title">Organizador de Fotos</div>
  </header>

  <div class="mirror-main">
    <!-- Hero -->
    <section class="mirror-hero animate-up">
      <h1>Refleja tus recuerdos</h1>
      <p>Sube, ordena por fecha y descarga en un solo archivo ZIP.</p>
      <span class="tagline">Donde cada flor cuenta una historia.</span>
    </section>

    <!-- Panel de subida -->
    <section class="glass-card animate-up delay-1" style="margin-bottom:1.5rem;">
      <!-- Drop Zone -->
      <div
        id="dropZone"
        class="upload-area"
        :class="{ dragover }"
        role="button"
        tabindex="0"
        aria-label="Zona de carga de imágenes"
        @dragenter.prevent.stop="dragover = true"
        @dragover.prevent.stop="dragover = true"
        @dragleave.prevent.stop="dragover = false"
        @drop.prevent.stop="onDrop"
        @click="inputEl?.click()"
        @keydown.enter="inputEl?.click()"
        @keydown.space="inputEl?.click()"
      >
        <div class="upload-icon-wrap">
          <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
        </div>
        <p class="upload-title">Arrastra tus fotos y vídeos aquí</p>
        <p>o elige archivos desde tu dispositivo</p>
        <label for="imageInput" class="btn btn-secondary" style="display:inline-flex;align-items:center;gap:8px;cursor:pointer;margin-top:0.25rem;" @click.stop>
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
          Explorar archivos
        </label>
        <input id="imageInput" ref="inputEl" type="file" multiple accept="image/*,video/*" hidden @click.stop @change="onInput">
        <div class="format-pills">
          <span v-for="f in ['JPG', 'PNG', 'GIF', 'WEBP', 'HEIC', 'MP4', 'MOV', 'Fotos 15 MB', 'Vídeos 25 MB']" :key="f" class="format-pill">{{ f }}</span>
        </div>
      </div>

      <!-- Preview -->
      <div id="previewContainer" :class="{ hidden: !files.length }" style="margin-top:1.5rem;">
        <div class="preview-header">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent-color)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
          <h3>Vista previa</h3>
          <span id="imageCount" class="count-badge">{{ files.length }}</span>
        </div>
        <div id="imageList" class="image-list">
          <div v-for="(file, i) in previewFiles" :key="fileKey(file)" class="image-item" :style="{ animationDelay: `${Math.min(i * 0.04, 0.4)}s` }">
            <template v-if="kindOf(file) === 'video'">
              <video muted playsinline preload="metadata" :aria-label="file.name" :src="previewUrl(file)"></video>
              <span class="media-badge">
                <svg xmlns="http://www.w3.org/2000/svg" width="9" height="9" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><polygon points="5 3 19 12 5 21 5 3" /></svg>
                VIDEO
              </span>
            </template>
            <img v-else :alt="file.name" loading="lazy" :src="previewUrl(file)">
            <div class="image-info">
              <span class="image-name">{{ file.name }}</span>
              <span class="image-size">{{ fmtSize(file.size) }}</span>
            </div>
            <button class="remove-btn" :data-i="i" title="Eliminar" @click.stop="removeFile(i)">&times;</button>
          </div>
          <div v-if="files.length > previewFiles.length" class="image-item more-tile">+{{ files.length - previewFiles.length }} archivo(s) mas</div>
        </div>
      </div>

      <!-- Status -->
      <div id="statusMessage" :class="status.type">
        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex-shrink:0" v-html="SVG_ICONS[status.type]"></svg>
        {{ status.message }}
      </div>

      <!-- Upload Progress Panel -->
      <div id="uploadProgressPanel" class="upload-progress-panel" :class="{ hidden: !upload.visible }">
        <div class="upload-progress-header">
          <h3>
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent-color)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <span id="uploadPhaseTitle">{{ upload.title }}</span>
          </h3>
          <span id="uploadProgressStats" class="upload-progress-stats">{{ upload.done }} / {{ upload.total }}</span>
        </div>
        <div class="upload-progress-bar-wrap">
          <div id="uploadProgressBarFill" class="upload-progress-bar-fill" :style="{ width: `${upload.total ? Math.round((upload.done / upload.total) * 100) : 0}%` }"></div>
        </div>
        <div id="uploadFileList" ref="uploadListEl" class="upload-file-list" :class="{ hidden: upload.packaging }">
          <div
            v-for="item in upload.log"
            :id="`upload-item-${item.index}`"
            :key="item.index"
            class="upload-file-item"
            :class="item.status"
            :style="{ animationDelay: `${Math.min(item.index * 0.05, 0.5)}s` }"
          >
            <span
              v-if="item.video"
              class="upload-file-icon"
              style="display:inline-flex;align-items:center;justify-content:center;background:var(--glass-bg);color:var(--accent-color);"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><polygon points="5 3 19 12 5 21 5 3" /></svg>
            </span>
            <img v-else class="upload-file-icon" :src="item.iconUrl" alt="" @load="revoke(item.iconUrl)">
            <div class="upload-file-info">
              <span class="upload-file-name">{{ item.name }}</span>
              <div class="upload-file-meta">
                <span>{{ fmtSize(item.size) }}</span>
                <span class="upload-file-folder">{{ item.folder }}</span>
              </div>
            </div>
            <div class="upload-file-status">
              <div v-if="item.status === 'uploading'" class="mini-spinner"></div>
              <svg
                v-else-if="item.status === 'done'"
                class="check-icon"
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              ><polyline points="20 6 9 17 4 12" /></svg>
              <svg
                v-else
                class="error-icon"
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              ><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </div>
          </div>
        </div>
        <!-- Empaquetado (al terminar las subidas) -->
        <div id="packagingOverlay" class="packaging-overlay" :class="{ hidden: !upload.packaging }">
          <div class="packaging-spinner"></div>
          <p class="packaging-text">Empaquetando tus recuerdos…</p>
          <p class="packaging-sub">Organizando por fecha y creando el ZIP</p>
        </div>
      </div>

      <!-- Panel de lotes (solo cuando la descarga se parte en varios ZIP) -->
      <div id="batchPanel" class="upload-progress-panel" :class="{ hidden: !batches.length }">
        <div class="upload-progress-header">
          <h3>
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent-color)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <polyline points="21 8 21 21 3 21 3 8" />
              <rect x="1" y="3" width="22" height="5" />
              <line x1="10" y1="12" x2="14" y2="12" />
            </svg>
            <span id="batchPanelTitle">Descarga por lotes</span>
          </h3>
          <span id="batchPanelStats" class="upload-progress-stats">{{ batchesDone }} / {{ batches.length }}</span>
        </div>
        <p style="font-size:0.78rem;color:var(--text-tertiary);margin:0 0 10px;">Cada lote es un ZIP independiente con sus carpetas por fecha. Se genera al pulsar Descargar.</p>
        <!-- Descarga en un único ZIP: es un enlace GET de verdad, no un blob;
          el navegador lo escribe directo a disco mientras el servidor lo va
          generando, así que no pasa por la memoria de la pestaña. -->
        <div id="singleZipBox" class="single-zip-box" :class="{ hidden: !singleZip }">
          <div class="single-zip-info">
            <span class="single-zip-title">¿Prefieres un solo archivo?</span>
            <span id="singleZipMeta" class="single-zip-meta">{{ singleZip?.meta }}</span>
          </div>
          <a
            id="singleZipLink"
            class="btn btn-primary"
            download="mirai-mirror-completo.zip"
            data-no-transition
            :href="singleZip?.href"
            style="display:inline-flex;align-items:center;gap:8px;text-decoration:none;"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Descargar todo en un ZIP
          </a>
        </div>
        <div id="batchList">
          <div v-for="b in batches" :id="`batch-row-${b.index}`" :key="b.index" class="batch-row" :class="b.state">
            <div class="batch-row-info">
              <span class="batch-row-title">Lote {{ b.index + 1 }} de {{ batches.length }}</span>
              <span class="batch-row-meta">{{ b.count }} archivo(s) · {{ fmtSize(b.bytes) }}</span>
            </div>
            <button class="btn btn-secondary" :data-batch="b.index" :disabled="b.busy" @click="downloadBatch(b)">{{ b.label }}</button>
          </div>
        </div>
        <button id="downloadAllBtn" class="btn btn-primary" style="display:inline-flex;align-items:center;gap:8px;margin-top:4px;" :disabled="downloadingAll" @click="downloadAllBatches">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          <span class="btn-label">{{ downloadAllLabel }}</span>
        </button>
      </div>

      <!-- Expiration -->
      <div id="expirationWarning" class="expiration-warning" :class="{ hidden: !expiresSoon }">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        El enlace de descarga expira en 30 minutos.
      </div>

      <!-- Botones -->
      <div class="mirror-actions">
        <button id="processBtn" class="btn btn-primary" style="display:inline-flex;align-items:center;gap:8px;" :disabled="!files.length || processing" @click="processFiles">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex-shrink:0" v-html="SVG_ICONS[processing ? 'processing' : 'process']"></svg>
          {{ processing ? 'Procesando…' : 'Procesar y Ordenar' }}
        </button>
        <button id="downloadBtn" class="btn btn-secondary" :style="{ display: downloadShown ? 'inline-flex' : 'none' }" style="align-items:center;gap:8px;" :disabled="!zipBlob" @click="downloadResult">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          Descargar ZIP
        </button>
        <button
          id="resetBtn"
          class="btn btn-secondary"
          :style="{ display: resetShown ? 'inline-flex' : 'none' }"
          style="align-items:center;gap:8px;background:rgba(208,0,0,0.08);border-color:rgba(208,0,0,0.25);color:#8b2626;"
          @click="reset"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <polyline points="1 4 1 10 7 10" />
            <path d="M3.51 15a9 9 0 1 0 .49-3.5" />
          </svg>
          Reiniciar
        </button>
      </div>
    </section>

    <!-- ¿Cómo funciona? -->
    <section class="glass-card animate-up delay-2">
      <h2 style="text-align:center;font-size:1.2rem;font-weight:700;color:var(--text-primary);margin-bottom:0.25rem;letter-spacing:-0.02em;">¿Cómo funciona?</h2>
      <p style="text-align:center;font-size:0.88rem;color:var(--text-tertiary);margin-bottom:0;">Tres pasos para ordenar tus recuerdos</p>
      <div class="steps-grid">
        <div class="step-card">
          <div class="step-icon-wrap">
            <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
          </div>
          <div class="step-number">1</div>
          <p class="step-title">Subida Segura</p>
          <p class="step-desc">Fotos y vídeos viajan cifrados directamente a Cloudflare R2.</p>
        </div>
        <div class="step-card">
          <div class="step-icon-wrap">
            <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </div>
          <div class="step-number">2</div>
          <p class="step-title">Análisis EXIF</p>
          <p class="step-desc">Leemos la fecha real de captura o grabación para ordenarlo cronológicamente.</p>
        </div>
        <div class="step-card">
          <div class="step-icon-wrap">
            <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <polyline points="21 8 21 21 3 21 3 8" />
              <rect x="1" y="3" width="22" height="5" />
              <line x1="10" y1="12" x2="14" y2="12" />
            </svg>
          </div>
          <div class="step-number">3</div>
          <p class="step-title">Empaquetado</p>
          <p class="step-desc">Se crea un ZIP organizado por fecha. Si hay mucho, se divide en lotes.</p>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
// Migración de public/mirror.html (su JS iba dentro de la página): sube fotos
// y vídeos a R2 (/api/mirror/...), el Worker los ordena por fecha EXIF y
// devuelve un ZIP, o varios lotes si no caben en uno. Su CSS iba antes de
// styles.css: está en css/before-styles/mirror.css.
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import MenuToggle from '@/components/MenuToggle.vue';
import { apiFetch } from '@/lib/api';

// Estos límites deben coincidir con MIRROR_CONFIG del Worker.
const MAX_IMAGE_SIZE = 15 * 1024 * 1024;
const MAX_VIDEO_SIZE = 25 * 1024 * 1024;
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic'];
const VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm', 'video/3gpp', 'video/x-matroska'];
const MAX_FILES = 5000;
const CONCURRENT = 3;
// Pintar miles de miniaturas cuelga el navegador; el resto se resume en "+N mas".
const PREVIEW_LIMIT = 120;
// Filas visibles del registro de subida: se podan por arriba.
const UPLOAD_LOG_MAX = 60;
// Empaquetar un lote grande puede tardar, pero no indefinidamente.
const BATCH_TIMEOUT_MS = 5 * 60 * 1000;
// Respiro entre lotes: Chrome estrangula las descargas automáticas encadenadas.
const BATCH_GAP_MS = 1200;
// Revocar en la misma vuelta cancelaba la descarga en algunos navegadores.
const BLOB_URL_TTL = 30_000;
const EXPIRATION_MS = 30 * 60 * 1000;

type StatusType = 'info' | 'success' | 'error';

const SVG_ICONS: Record<StatusType | 'process' | 'processing', string> = {
  process: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
  processing: '<polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.5"/>',
  info: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>',
  success: '<polyline points="20 6 9 17 4 12"/>',
  error: '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>',
};

function kindOf(file: File): 'image' | 'video' | null {
  const t = (file.type || '').toLowerCase();
  if (IMAGE_TYPES.includes(t)) return 'image';
  if (VIDEO_TYPES.includes(t)) return 'video';
  return null;
}

function fmtSize(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 ** 2).toFixed(1)} MB`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** El mensaje de error del Worker en vez de un "HTTP 500" seco. */
async function readErrorMessage(res: Response): Promise<string> {
  try {
    const data = JSON.parse(await res.text()) as { error?: string };
    if (data?.error) return data.error;
  } catch {
    // no era JSON
  }
  return `HTTP ${res.status}`;
}

// ── Estado ────────────────────────────────────────────────────────────────
const inputEl = ref<HTMLInputElement | null>(null);
const uploadListEl = ref<HTMLElement | null>(null);
const files = ref<File[]>([]);
const dragover = ref(false);
const processing = ref(false);
const status = reactive<{ message: string; type: StatusType }>({ message: 'Listo para subir fotos y vídeos.', type: 'info' });
let sessionId: string | null = null;
let aborted = false;

function showStatus(message: string, type: StatusType = 'info') {
  Object.assign(status, { message, type });
}

// ── Selección y vista previa ──────────────────────────────────────────────
// Cada archivo tiene su clave y su URL de vista previa mientras está en la lista.
const keys = new WeakMap<File, number>();
const previewUrls = new Map<File, string>();
let keySeq = 0;

function fileKey(file: File): number {
  let k = keys.get(file);
  if (k === undefined) keys.set(file, (k = ++keySeq));
  return k;
}

function previewUrl(file: File): string {
  let url = previewUrls.get(file);
  if (!url) previewUrls.set(file, (url = URL.createObjectURL(file)));
  return url;
}

function releasePreview(file: File) {
  const url = previewUrls.get(file);
  if (url) URL.revokeObjectURL(url);
  previewUrls.delete(file);
}

const previewFiles = computed(() => files.value.slice(0, PREVIEW_LIMIT));
const resetShown = ref(false);

function addFiles(list: FileList | File[]) {
  const rejected: string[] = [];
  const valid = Array.from(list).filter((f) => {
    const kind = kindOf(f);
    if (!kind) {
      rejected.push(`${f.name}: formato no admitido`);
      return false;
    }
    const limit = kind === 'video' ? MAX_VIDEO_SIZE : MAX_IMAGE_SIZE;
    if (f.size > limit) {
      rejected.push(`${f.name}: supera ${fmtSize(limit)}`);
      return false;
    }
    return true;
  });

  // Se acepta lo que quepa y se avisa de lo que sobró.
  const accepted = valid.slice(0, Math.max(0, MAX_FILES - files.value.length));
  const overflow = valid.length - accepted.length;
  files.value = [...files.value, ...accepted];
  if (files.value.length) resetShown.value = true;

  const notes: string[] = [];
  if (rejected.length) notes.push(`${rejected.length} descartado(s)`);
  if (overflow) notes.push(`${overflow} fuera del limite de ${MAX_FILES}`);

  if (!files.value.length) {
    showStatus(rejected[0] ?? 'No se anadio ningun archivo.', 'error');
    return;
  }
  const videos = files.value.filter((f) => kindOf(f) === 'video').length;
  const photos = files.value.length - videos;
  const detail = videos ? `${photos} foto(s) y ${videos} video(s)` : `${photos} foto(s)`;
  showStatus(`${detail} listo(s) para procesar${notes.length ? ` — ${notes.join(', ')}.` : '.'}`, notes.length ? 'info' : 'success');
}

function onInput(e: Event) {
  addFiles((e.target as HTMLInputElement).files ?? []);
}

function onDrop(e: DragEvent) {
  dragover.value = false;
  addFiles(e.dataTransfer?.files ?? []);
}

function removeFile(i: number) {
  const [file] = files.value.splice(i, 1);
  if (file) releasePreview(file);
}

// Soltar un archivo fuera de la zona no debe abrirlo en la pestaña.
function blockDrop(e: DragEvent) {
  e.preventDefault();
}

// ── Subida y empaquetado ──────────────────────────────────────────────────
interface LogItem {
  index: number;
  name: string;
  size: number;
  video: boolean;
  iconUrl: string;
  status: 'uploading' | 'done' | 'error';
  folder: string;
}

const upload = reactive({ visible: false, title: 'Subiendo archivos…', done: 0, total: 0, packaging: false, log: [] as LogItem[] });

function revoke(url: string) {
  if (url) URL.revokeObjectURL(url);
}

function logItem(index: number): LogItem | undefined {
  return upload.log.find((x) => x.index === index);
}

function addToUploadLog(file: File, index: number) {
  const video = kindOf(file) === 'video';
  // Para vídeo no se crea URL: un <img> no lo pinta y serían miles vivas.
  upload.log.push({ index, name: file.name, size: file.size, video, iconUrl: video ? '' : URL.createObjectURL(file), status: 'uploading', folder: '' });
  while (upload.log.length > UPLOAD_LOG_MAX) {
    const old = upload.log.shift();
    if (old) revoke(old.iconUrl);
  }
  void nextTick(() => uploadListEl.value?.lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
}

interface Batch {
  index: number;
  count: number;
  bytes: number;
  state: '' | 'done' | 'error';
  busy: boolean;
  label: string;
}

interface Plan {
  batches?: { index: number; count: number; bytes: number }[];
  singleZip?: { available?: boolean };
  totalFiles?: number;
  totalBytes?: number;
}

const zipBlob = ref<Blob | null>(null);
const downloadShown = ref(false);
const expiresSoon = ref(false);
let expireTimer: number | undefined;
const batches = ref<Batch[]>([]);
const batchesDone = computed(() => batches.value.filter((b) => b.state === 'done').length);
const singleZip = ref<{ href: string; meta: string } | null>(null);

async function postJson(path: string, body: unknown, init: RequestInit = {}) {
  return apiFetch(path, { ...init, method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}

async function processFiles() {
  if (!files.value.length || processing.value) return;
  processing.value = true;
  aborted = false;
  Object.assign(upload, { visible: true, title: 'Subiendo imagenes…', done: 0, total: files.value.length, packaging: false, log: [] });
  const total = files.value.length;
  let errors = 0;

  try {
    // 1. Sesión
    const sesRes = await apiFetch('/api/mirror/session', { method: 'POST' });
    if (!sesRes.ok) throw new Error('No se pudo crear la sesion');
    const sid = ((await sesRes.json()) as { sessionId: string }).sessionId;
    sessionId = sid;

    // 2. Subidas, como mucho CONCURRENT a la vez
    const queue = files.value.map((file, index) => ({ file, index }));
    let cursor = 0;
    const uploadNext = async () => {
      while (cursor < queue.length) {
        if (aborted) return;
        const { file, index } = queue[cursor++]!;
        addToUploadLog(file, index);
        const fd = new FormData();
        fd.append('image', file);
        fd.append('sessionId', sid);
        fd.append('lastModified', String(file.lastModified || 0));
        try {
          const res = await apiFetch('/api/mirror/upload', { method: 'POST', body: fd });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = (await res.json()) as { folder?: string };
          const item = logItem(index);
          if (item) Object.assign(item, { status: 'done', folder: data.folder ?? '' });
        } catch {
          const item = logItem(index);
          if (item) item.status = 'error';
          errors++;
        }
        upload.done++;
      }
    };
    await Promise.all(Array.from({ length: CONCURRENT }, uploadNext));
    if (aborted) return;

    if (errors === total) {
      showStatus('Todas las imagenes fallaron al subir.', 'error');
      return;
    }

    // 3. Plan de lotes: solo consulta D1, no genera ningún ZIP todavía.
    Object.assign(upload, { title: 'Preparando descarga…', packaging: true });
    const planRes = await postJson('/api/mirror/plan', { sessionId: sid });
    if (!planRes.ok) throw new Error(`Error al preparar la descarga: ${planRes.status}`);
    const plan = (await planRes.json()) as Plan;
    const planBatches = plan.batches ?? [];
    const baseMsg = errors > 0 ? `${total - errors} de ${total} archivo(s) procesados` : `${total} archivo(s) procesados`;

    if (planBatches.length <= 1) {
      // 4a. Cabe en un solo ZIP: se genera ya.
      const pkgRes = await postJson('/api/mirror/package', { sessionId: sid, batch: 0 });
      if (!pkgRes.ok) throw new Error(`Error al empaquetar: ${pkgRes.status}`);
      zipBlob.value = await pkgRes.blob();
      upload.visible = false;
      showStatus(`${baseMsg}. Descarga lista.`, 'success');
      downloadShown.value = true;
      expiresSoon.value = true;
      clearTimeout(expireTimer);
      expireTimer = window.setTimeout(() => {
        zipBlob.value = null;
        expiresSoon.value = false;
        showStatus('El archivo ha expirado. Procesa de nuevo.', 'error');
      }, EXPIRATION_MS);
    } else {
      // 4b. Varios lotes: cada uno se genera al pulsar Descargar.
      upload.visible = false;
      batches.value = planBatches.map((b) => ({ ...b, state: '', busy: false, label: 'Descargar' }));
      singleZip.value = plan.singleZip?.available
        ? {
            href: `/api/mirror/download-all?sessionId=${encodeURIComponent(sid)}`,
            meta: `${plan.totalFiles} archivo(s) · ${fmtSize(plan.totalBytes ?? 0)} en un unico ZIP con todas las carpetas por fecha.`,
          }
        : null;
      showStatus(
        singleZip.value ? `${baseMsg}. Descargalos en un solo ZIP o en ${planBatches.length} lotes.` : `${baseMsg}. Se reparten en ${planBatches.length} lotes.`,
        'success',
      );
    }
  } catch (err) {
    showStatus(`Error: ${err instanceof Error ? err.message : String(err)}`, 'error');
    upload.visible = false;
  } finally {
    processing.value = false;
  }
}

// ── Descargas ─────────────────────────────────────────────────────────────
// Cada URL de blob retiene su ZIP entero en memoria: se sueltan en cuanto el
// navegador ha cogido la descarga.
const pendingBlobUrls = new Set<string>();

function releaseBlobUrl(url: string) {
  if (!pendingBlobUrls.delete(url)) return;
  URL.revokeObjectURL(url);
}

function releaseAllBlobUrls() {
  pendingBlobUrls.forEach((url) => URL.revokeObjectURL(url));
  pendingBlobUrls.clear();
}

function saveBlob(blob: Blob, filename: string): string {
  const url = URL.createObjectURL(blob);
  pendingBlobUrls.add(url);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => releaseBlobUrl(url), BLOB_URL_TTL);
  return url;
}

function downloadResult() {
  if (zipBlob.value) saveBlob(zipBlob.value, `mirai-mirror-${Date.now()}.zip`);
}

async function downloadBatch(b: Batch): Promise<string | false> {
  if (b.busy) return false;
  Object.assign(b, { busy: true, label: 'Generando…' });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), BATCH_TIMEOUT_MS);
  try {
    const res = await postJson('/api/mirror/package', { sessionId, batch: b.index }, { signal: ctrl.signal });
    if (!res.ok) throw new Error(await readErrorMessage(res));
    const url = saveBlob(await res.blob(), `mirai-mirror-lote-${String(b.index + 1).padStart(2, '0')}.zip`);
    Object.assign(b, { state: 'done', label: 'Descargado' });
    return url;
  } catch (err) {
    const msg = err instanceof Error && err.name === 'AbortError' ? 'el servidor tardo demasiado en generar el ZIP' : err instanceof Error ? err.message : String(err);
    Object.assign(b, { state: 'error', busy: false, label: 'Reintentar' });
    showStatus(`Lote ${b.index + 1}: ${msg}`, 'error');
    return false;
  } finally {
    clearTimeout(timer);
  }
}

const downloadingAll = ref(false);
const downloadAllLabel = ref('Descargar todos los lotes');

async function downloadAllBatches() {
  if (downloadingAll.value) return;
  downloadingAll.value = true;
  try {
    // En serie a propósito: dos lotes a la vez son dos ZIP enteros en memoria.
    let failed = false;
    let prevUrl: string | null = null;
    for (const b of batches.value) {
      if (b.state === 'done') continue;
      downloadAllLabel.value = `Generando lote ${b.index + 1} de ${batches.value.length}…`;
      const url = await downloadBatch(b);
      if (!url) {
        failed = true;
        break;
      }
      // El ZIP anterior se suelta cuando el siguiente ya está en marcha.
      if (prevUrl) releaseBlobUrl(prevUrl);
      prevUrl = url;
      await sleep(BATCH_GAP_MS);
    }
    if (!failed && batchesDone.value >= batches.value.length) {
      showStatus(`Los ${batches.value.length} lotes se han descargado.`, 'success');
    } else if (failed) {
      showStatus('La descarga se detuvo. Reintenta el lote marcado en rojo o vuelve a pulsar "Descargar todos los lotes".', 'error');
    }
  } finally {
    downloadingAll.value = false;
    downloadAllLabel.value = 'Descargar todos los lotes';
  }
}

// ── Reinicio ──────────────────────────────────────────────────────────────
async function reset() {
  aborted = true;
  releaseAllBlobUrls();
  if (sessionId) {
    await postJson('/api/mirror/cleanup', { sessionId }).catch(() => {});
  }
  sessionId = null;
  files.value.forEach(releasePreview);
  files.value = [];
  if (inputEl.value) inputEl.value.value = '';
  zipBlob.value = null;
  clearTimeout(expireTimer);
  Object.assign(upload, { visible: false, packaging: false, log: [] });
  downloadShown.value = false;
  resetShown.value = false;
  expiresSoon.value = false;
  batches.value = [];
  singleZip.value = null;
  processing.value = false;
  showStatus('Listo para nuevas fotos y videos.', 'info');
}

// ── Eventos globales ──────────────────────────────────────────────────────
const onOffline = () => showStatus('Sin conexion a internet.', 'error');
const onOnline = () => showStatus('Conexion restaurada.', 'success');

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && files.value.length && !processing.value) void reset();
}

onMounted(() => {
  window.addEventListener('offline', onOffline);
  window.addEventListener('online', onOnline);
  document.addEventListener('keydown', onKeydown);
  document.body.addEventListener('dragover', blockDrop);
  document.body.addEventListener('drop', blockDrop);
});

onBeforeUnmount(() => {
  aborted = true;
  window.removeEventListener('offline', onOffline);
  window.removeEventListener('online', onOnline);
  document.removeEventListener('keydown', onKeydown);
  document.body.removeEventListener('dragover', blockDrop);
  document.body.removeEventListener('drop', blockDrop);
  clearTimeout(expireTimer);
  releaseAllBlobUrls();
  previewUrls.forEach((url) => URL.revokeObjectURL(url));
  upload.log.forEach((item) => revoke(item.iconUrl));
});
</script>
