<template>
  <header class="header">
    <MenuToggle />
    <div class="header-title">Estilos DOCX</div>
  </header>

  <div class="courses-container">
    <div class="courses-hero">
      <h1>Formatos DOCX</h1>
      <p>Aplica negrita, cursiva y subrayado automáticamente a palabras clave en tus documentos DOCX.</p>
    </div>

    <!-- Barra de progreso (oculta mientras no se procesa) -->
    <div id="fmt-progress-row" class="fmt-progress-row" :style="progress > 0 ? { display: 'flex' } : undefined">
      <div class="fmt-progress-track">
        <div id="fmt-progress-fill" class="fmt-progress-fill" :style="{ width: `${progress}%` }"></div>
      </div>
      <span id="fmt-progress-label" class="fmt-progress-label">{{ progress }}%</span>
    </div>

    <div id="fmt-status-row" class="courses-count fmt-status-row">
      <span id="fmt-status-icon">{{ STATUS_ICONS[status.type] }}</span>
      <span id="fmt-status-msg">{{ status.message }}</span>
    </div>

    <div class="fmt-grid">
      <!-- ── COLUMNA IZQUIERDA: Documentos ── -->
      <div class="course-card" style="cursor:default; animation-delay:0.05s;">
        <div class="course-icon">📁</div>
        <h3 class="course-title">Documentos</h3>
        <p class="course-description">Archivos DOCX a procesar</p>
        <div
          id="fmt-upload-zone"
          class="fmt-upload-zone"
          :class="{ 'drag-over': dragOver }"
          @click="fileInput?.click()"
          @dragover.prevent="dragOver = true"
          @dragleave="dragOver = false"
          @drop.prevent="onDrop"
        >
          <span style="font-size:2.5rem; display:block; margin-bottom:10px;">📂</span>
          <p class="upload-text" style="margin:0 0 4px;">Arrastra archivos <strong>DOCX</strong> aquí</p>
          <p class="upload-hint" style="margin:0;">o haz clic para seleccionar</p>
          <input id="fmt-file-input" ref="fileInput" type="file" accept=".docx" multiple hidden @change="onFilesChosen">
        </div>
        <ul id="fmt-file-list" class="fmt-file-list">
          <li v-if="!files.length" class="empty-state" style="padding:12px; text-align:center; font-size:0.85rem; color:var(--text-tertiary);">
            No hay archivos seleccionados
          </li>
          <li v-for="(f, i) in files" :key="`${f.name}-${i}`" class="fmt-file-item">
            <span>
              <strong>{{ f.name }}</strong>
              <span class="fmt-file-size">{{ formatSize(f.size) }}</span>
            </span>
            <button class="btn-fmt-remove" title="Eliminar" @click="files.splice(i, 1)">✕</button>
          </li>
        </ul>
        <div class="fmt-col-stats">
          <div class="stat-card" style="padding:12px 16px; gap:10px; flex:1;">
            <div class="stat-icon" style="width:36px;height:36px;font-size:1.2rem;">📄</div>
            <div class="stat-content">
              <span class="stat-label">Archivos</span>
              <span id="fmt-file-count" class="stat-value" style="font-size:1.2rem;">{{ files.length }}</span>
            </div>
          </div>
          <div class="stat-card" style="padding:12px 16px; gap:10px; flex:1;">
            <div class="stat-icon" style="width:36px;height:36px;font-size:1.2rem;">💾</div>
            <div class="stat-content">
              <span class="stat-label">Total</span>
              <span id="fmt-total-size" class="stat-value" style="font-size:1.2rem;">{{ files.length ? formatSize(totalSize) : '0 KB' }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- ── COLUMNA DERECHA: Reglas ── -->
      <div class="course-card" style="cursor:default; animation-delay:0.1s;">
        <div class="course-icon">🎯</div>
        <h3 class="course-title">Reglas de Formato</h3>
        <p class="course-description">Palabras clave y estilos</p>
        <div class="form-group">
          <label for="fmt-keyword">Palabra clave</label>
          <input id="fmt-keyword" ref="keywordInput" v-model="keyword" type="text" placeholder="Ej: contrato, cláusula..." autocomplete="off" @keydown.enter.prevent="addRule">
        </div>
        <div class="form-group">
          <label>Estilos a aplicar</label>
          <div class="fmt-style-row">
            <label class="fmt-style-check">
              <input id="fmt-bold" v-model="bold" type="checkbox">
              <strong>B</strong> Negrita
            </label>
            <label class="fmt-style-check">
              <input id="fmt-italic" v-model="italic" type="checkbox">
              <em>I</em> Cursiva
            </label>
            <label class="fmt-style-check">
              <input id="fmt-underline" v-model="underline" type="checkbox">
              <u>U</u> Subrayado
            </label>
          </div>
        </div>
        <button id="fmt-add-rule-btn" class="btn-secondary" style="width:100%; margin-bottom:16px;" @click="addRule">
          ➕ Añadir Regla
        </button>
        <div style="overflow-x:auto; border:1px solid var(--glass-border); border-radius:var(--border-radius-sm); margin-bottom:8px;">
          <table class="fmt-rules-table">
            <thead>
              <tr>
                <th>Palabra</th>
                <th>Estilos</th>
                <th style="width:32px;"></th>
              </tr>
            </thead>
            <tbody id="fmt-rules-body">
              <tr v-if="!rules.length">
                <td colspan="3" style="text-align:center; color:var(--text-tertiary); font-size:0.85rem; padding:14px;">
                  Sin reglas definidas.
                </td>
              </tr>
              <tr v-for="(r, i) in rules" :key="`${r.keyword}-${i}`">
                <td>{{ r.keyword }}</td>
                <td>
                  <span v-if="r.style_bold" class="fmt-badge fmt-badge-b">B</span>
                  <span v-if="r.style_italic" class="fmt-badge fmt-badge-i">I</span>
                  <span v-if="r.style_underline" class="fmt-badge fmt-badge-u">U</span>
                </td>
                <td>
                  <button class="btn-fmt-remove" title="Eliminar regla" @click="removeRule(i)">✕</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="fmt-col-stats" style="margin-bottom:12px;">
          <div class="stat-card" style="padding:12px 16px; gap:10px; flex:1;">
            <div class="stat-icon" style="width:36px;height:36px;font-size:1.2rem;">📋</div>
            <div class="stat-content">
              <span class="stat-label">Reglas</span>
              <span id="fmt-rule-count" class="stat-value" style="font-size:1.2rem;">{{ rules.length }}</span>
            </div>
          </div>
        </div>
        <button id="fmt-process-btn" class="course-start-btn" :disabled="!files.length || processing" style="font-size:1rem; padding:14px;" @click="processFiles">
          ⚡ Procesar y Descargar
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// Migración de public/format.html y public/format.js: aplica negrita,
// cursiva y subrayado a palabras clave en documentos DOCX.
//
// Flujo: POST /api/format/upload (archivos) → POST /api/format/process
// (reglas) → GET /api/format/download (un .docx o un .zip).
import { computed, onBeforeUnmount, ref } from 'vue';
import MenuToggle from '@/components/MenuToggle.vue';
import { apiFetch, errorMessage } from '@/lib/api';

interface FormatRule {
  keyword: string;
  style_bold: boolean;
  style_italic: boolean;
  style_underline: boolean;
  match_whole_word: boolean;
  case_sensitive: boolean;
}

type StatusType = 'listo' | 'loading' | 'success' | 'error';

const STATUS_ICONS: Record<StatusType, string> = { listo: '👋', loading: '⏳', success: '🎉', error: '❌' };
const MAX_FILE_SIZE = 20 * 1024 * 1024;
const INITIAL_MESSAGE = 'Sube archivos y define reglas para comenzar.';

const files = ref<File[]>([]);
const rules = ref<FormatRule[]>([]);
const status = ref<{ type: StatusType; message: string }>({ type: 'listo', message: INITIAL_MESSAGE });
const progress = ref(0);
const processing = ref(false);
const dragOver = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);

const totalSize = computed(() => files.value.reduce((sum, f) => sum + f.size, 0));

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function setStatus(type: StatusType, message: string) {
  status.value = { type, message };
}

// ── Archivos ──────────────────────────────────────────────────────────────
function addFiles(list: FileList | null | undefined) {
  const errors: string[] = [];
  for (const f of Array.from(list ?? [])) {
    if (!f.name.toLowerCase().endsWith('.docx')) errors.push(`${f.name}: debe ser un archivo .docx`);
    else if (f.size > MAX_FILE_SIZE) errors.push(`${f.name}: supera el límite de 20 MB`);
    else files.value.push(f);
  }
  if (errors.length) alert('Archivos no válidos:\n\n' + errors.join('\n'));
}

function onFilesChosen() {
  addFiles(fileInput.value?.files);
  if (fileInput.value) fileInput.value.value = '';
}

function onDrop(e: DragEvent) {
  dragOver.value = false;
  addFiles(e.dataTransfer?.files);
}

// ── Reglas ────────────────────────────────────────────────────────────────
const keyword = ref('');
const bold = ref(false);
const italic = ref(false);
const underline = ref(false);
const keywordInput = ref<HTMLInputElement | null>(null);

function addRule() {
  const kw = keyword.value.trim();
  if (!kw) {
    alert('Ingresa una palabra clave.');
    return;
  }
  if (!bold.value && !italic.value && !underline.value) {
    alert('Selecciona al menos un estilo.');
    return;
  }
  rules.value.push({
    keyword: kw,
    style_bold: bold.value,
    style_italic: italic.value,
    style_underline: underline.value,
    match_whole_word: true,
    case_sensitive: false,
  });
  keyword.value = '';
  bold.value = italic.value = underline.value = false;
  keywordInput.value?.focus();
  setStatus('listo', `${rules.value.length} regla(s) definida(s).`);
}

function removeRule(i: number) {
  rules.value.splice(i, 1);
  setStatus('listo', rules.value.length ? `${rules.value.length} regla(s) definida(s).` : INITIAL_MESSAGE);
}

// ── Proceso ───────────────────────────────────────────────────────────────
let hideProgressTimer: number | undefined;
onBeforeUnmount(() => clearTimeout(hideProgressTimer));

function showProgress(pct: number) {
  clearTimeout(hideProgressTimer);
  progress.value = pct;
  if (pct === 100) hideProgressTimer = window.setTimeout(() => (progress.value = 0), 2500);
}

/** Lanza la petición y, si falla, el error del servidor o `fallback`. */
async function step(path: string, init: RequestInit, fallback: string): Promise<Response> {
  const res = await apiFetch(path, init);
  if (!res.ok) throw new Error(errorMessage(await res.json().catch(() => ({})), `${fallback} (${res.status})`));
  return res;
}

async function processFiles() {
  if (!files.value.length || !rules.value.length) {
    alert('Sube archivos y define al menos una regla.');
    return;
  }

  setStatus('loading', 'Subiendo archivos...');
  showProgress(10);
  processing.value = true;

  try {
    const tempId = crypto.randomUUID();
    const form = new FormData();
    form.append('tempId', tempId);
    files.value.forEach((f) => form.append('files', f));
    await step('/api/format/upload', { method: 'POST', body: form }, 'Error al subir');

    showProgress(40);
    setStatus('loading', 'Procesando documentos...');
    await step(
      '/api/format/process',
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tempId, rules: rules.value }) },
      'Error al procesar',
    );

    showProgress(75);
    setStatus('loading', 'Preparando descarga...');
    const res = await step(`/api/format/download?tempId=${encodeURIComponent(tempId)}`, {}, 'Error al descargar');

    const blob = await res.blob();
    const contentType = res.headers.get('Content-Type') || '';
    let name = 'documento_formateado.docx';
    if (contentType.includes('zip')) {
      name = `documentos_formateados_${new Date().toISOString().slice(0, 10)}.zip`;
    } else {
      const m = (res.headers.get('Content-Disposition') || '').match(/filename="?([^";]+)"?/);
      if (m?.[1]) name = m[1];
    }
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(link.href);

    showProgress(100);
    setStatus('success', '¡Descarga lista! Los archivos se eliminan automáticamente en 1 hora.');
    files.value = [];
    rules.value = [];
  } catch (err) {
    console.error('[Format]', err);
    setStatus('error', `Error: ${err instanceof Error ? err.message : String(err)}`);
    showProgress(0);
  } finally {
    processing.value = false;
  }
}
</script>
