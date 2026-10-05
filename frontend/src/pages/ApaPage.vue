<template>
  <header class="header">
    <MenuToggle />
    <div class="header-title">Formato APA 7</div>
  </header>

  <div class="courses-container">
    <div class="courses-hero">
      <div style="margin-bottom: 12px;">
        <span class="apa-version-badge">✨ APA 7ª Edición</span>
      </div>
      <h1>Formato APA</h1>
      <p>Sube tu documento .DOCX y Mirai AI lo formateará automáticamente según las normas APA 7 en segundos.</p>
    </div>

    <input id="apa-file-input" ref="fileInput" type="file" accept=".docx" aria-hidden="true" @change="onFileChosen">

    <!-- ===== SECCIÓN 1: SUBIDA ===== -->
    <div class="apa-page-wrapper">
      <div class="apa-main-grid">
        <!-- Panel izquierdo: Dropzone + Metadatos -->
        <div>
          <div
            id="apa-dropzone"
            class="apa-dropzone"
            :class="{ 'drag-over': dragOver }"
            role="button"
            tabindex="0"
            aria-label="Zona de carga de archivo DOCX"
            @click="fileInput?.click()"
            @keydown.enter="fileInput?.click()"
            @keydown.space.prevent="fileInput?.click()"
            @dragover.prevent="dragOver = true"
            @dragleave="onDragLeave"
            @drop.prevent="onDrop"
          >
            <span class="apa-dropzone-icon">📄</span>
            <div class="apa-dropzone-title">Arrastra tu archivo aquí</div>
            <div class="apa-dropzone-hint">o haz clic para seleccionar un .DOCX · Máx. 25 MB</div>
            <button class="btn-primary" style="margin-top: 8px;" @click.stop="fileInput?.click()">
              Seleccionar archivo
            </button>
            <div v-if="file" id="apa-filename" style="margin-top: 14px; font-size: 0.85rem; color: var(--text-tertiary);">
              📎 {{ file.name }} ({{ formatSize(file.size) }})
            </div>
          </div>

          <div class="apa-card-panel" style="margin-top: 20px;">
            <div style="font-size: 0.8rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-secondary); margin-bottom: 16px;">
              Datos del documento (opcionales)
            </div>
            <div class="apa-metadata-grid">
              <div class="form-group" style="margin-bottom: 0;">
                <label for="apa-title">Título</label>
                <input id="apa-title" v-model="meta.title" type="text" placeholder="Título del trabajo">
              </div>
              <div class="form-group" style="margin-bottom: 0;">
                <label for="apa-author">Autor</label>
                <input id="apa-author" v-model="meta.author" type="text" placeholder="Nombre completo">
              </div>
              <div class="form-group" style="margin-bottom: 0;">
                <label for="apa-affiliation">Afiliación</label>
                <input id="apa-affiliation" v-model="meta.affiliation" type="text" placeholder="Universidad / Institución">
              </div>
              <div class="form-group" style="margin-bottom: 0;">
                <label for="apa-course">Curso</label>
                <input id="apa-course" v-model="meta.course" type="text" placeholder="Nombre del curso">
              </div>
              <div class="form-group" style="margin-bottom: 0;">
                <label for="apa-instructor">Instructor</label>
                <input id="apa-instructor" v-model="meta.instructor" type="text" placeholder="Nombre del profesor">
              </div>
              <div class="form-group" style="margin-bottom: 0;">
                <label for="apa-date">Fecha</label>
                <input id="apa-date" v-model="meta.date" type="date">
              </div>
            </div>
            <button id="apa-format-btn" class="btn-primary" style="width: 100%; margin-top: 4px;" :disabled="!file || phase !== 'idle'" @click="format">
              Formatear documento
            </button>
          </div>
        </div>

        <!-- Panel derecho: Procesamiento + Resultado + Historial -->
        <div>
          <div id="apa-processing" class="apa-processing" :class="{ visible: phase === 'processing' }">
            <div style="font-size: 0.8rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-secondary); margin-bottom: 12px;">
              Procesando…
            </div>
            <div v-for="step in STEPS" :id="step.id" :key="step.id" class="apa-step" :class="stepState[step.id]">
              <span class="apa-step-icon">{{ step.icon }}</span>
              <span class="apa-step-text">{{ step.text }}</span>
              <span class="apa-step-status">{{ STEP_STATUS[stepState[step.id] ?? 'pending'] }}</span>
            </div>
          </div>

          <div id="apa-result" class="apa-result-area" :class="{ visible: phase === 'done' }">
            <div class="apa-result-card">
              <div class="apa-result-header">
                <span class="apa-result-icon">✅</span>
                <div>
                  <div class="apa-result-title">¡Documento formateado!</div>
                  <div id="apa-result-filename" class="apa-result-filename">{{ outputName || 'documento_formateado_APA7.docx' }}</div>
                </div>
              </div>
              <p style="font-size: 0.88rem; color: var(--text-secondary); line-height: 1.6; margin-bottom: 0;">
                Tu documento ha sido procesado y cumple con todas las normas APA 7ª edición.
              </p>
              <div class="apa-result-actions">
                <button id="apa-download-btn" class="btn-primary" @click="download">
                  ⬇️ Descargar .DOCX
                </button>
                <button id="apa-reset-btn" class="btn-secondary" @click="reset">
                  🔄 Formatear otro
                </button>
              </div>
            </div>
          </div>

          <div v-if="phase === 'idle'" id="apa-idle-state" class="apa-card-panel" style="text-align: center;">
            <span style="font-size: 3rem; display: block; margin-bottom: 12px;">📝</span>
            <div style="font-size: 1rem; font-weight: 600; color: var(--text-primary); margin-bottom: 6px;">Listo para formatear</div>
            <div style="font-size: 0.85rem; color: var(--text-tertiary);">Sube un archivo .DOCX para comenzar el proceso de formateo APA 7</div>
          </div>

          <div class="apa-card-panel" style="margin-top: 20px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
              <div style="font-size: 0.8rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-secondary);">
                Historial reciente
              </div>
              <button id="apa-clear-history" class="btn-secondary" style="padding: 4px 12px; font-size: 0.75rem;" title="Limpiar historial" @click="clearHistory">Limpiar</button>
            </div>
            <div id="apa-history-list" class="apa-history-list">
              <div v-if="!history.length" class="apa-history-empty">
                <span class="apa-history-empty-icon">🕐</span>
                Ningún documento formateado aún
              </div>
              <div v-for="(item, i) in history" :key="i" class="apa-history-item">
                <span class="apa-history-icon">📄</span>
                <div class="apa-history-info">
                  <div class="apa-history-name" :title="item.formatted">{{ item.formatted }}</div>
                  <div class="apa-history-date">Desde: {{ item.original }} · {{ item.date }}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ===== SECCIÓN 2: REGLAS APA 7 ===== -->
    <div class="apa-rules-wrapper">
      <div class="courses-count" style="padding: 0 0 12px;">Reglas aplicadas automáticamente</div>
      <div class="apa-rules-grid">
        <div v-for="rule in RULES" :key="rule.title" class="apa-rule-card" :style="{ '--card-accent': rule.accent }">
          <span class="apa-rule-icon">{{ rule.icon }}</span>
          <div class="apa-rule-title">{{ rule.title }}</div>
          <div class="apa-rule-desc">{{ rule.desc }}</div>
        </div>
      </div>
    </div>
  </div>

  <!-- Aviso flotante -->
  <Teleport to="body">
    <div
      v-if="toast"
      id="__apa_notif"
      :style="{
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        padding: '12px 20px',
        borderRadius: '12px',
        background: TOAST_COLORS[toast.type],
        color: 'var(--text-primary)',
        fontSize: '0.9rem',
        fontWeight: '500',
        boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
        zIndex: '9999',
        border: '1px solid var(--glass-border)',
        backdropFilter: 'blur(12px)',
        maxWidth: '320px',
      }"
    >
      {{ toast.message }}
    </div>
  </Teleport>
</template>

<script setup lang="ts">
// Migración de public/apa.html: formatea un DOCX a APA 7 en el navegador
// (lib/apa-docx.ts) y guarda un historial local de los últimos 10.
import { onBeforeUnmount, reactive, ref } from 'vue';
import MenuToggle from '@/components/MenuToggle.vue';
import { buildApaDocx, readDocx } from '@/lib/apa-docx';

type StepState = 'pending' | 'active' | 'done';
type ToastType = 'success' | 'error' | 'info';

const STEPS = [
  { id: 'step-read', icon: '📖', text: 'Leyendo documento' },
  { id: 'step-margins', icon: '📐', text: 'Aplicando márgenes (2.54 cm)' },
  { id: 'step-typography', icon: '🔤', text: 'Times New Roman 12pt' },
  { id: 'step-spacing', icon: '↕️', text: 'Interlineado doble y sangrías' },
  { id: 'step-generate', icon: '⚙️', text: 'Generando archivo final' },
];

const STEP_STATUS: Record<StepState, string> = { pending: 'Pendiente', active: 'Procesando…', done: '✓ Listo' };

const RULES = [
  { icon: '📐', title: 'Márgenes uniformes', accent: 'linear-gradient(135deg, #6750A4, #9A82DB)', desc: '2.54 cm (1 pulgada) en los cuatro lados: superior, inferior, izquierdo y derecho.' },
  { icon: '🔤', title: 'Tipografía APA', accent: 'linear-gradient(135deg, #7D5260, #EFB8C8)', desc: 'Times New Roman 12pt como fuente principal. Negro puro en todo el cuerpo del texto.' },
  { icon: '↕️', title: 'Interlineado doble', accent: 'linear-gradient(135deg, #1976d2, #64b5f6)', desc: 'Doble espacio (2.0) en todo el documento, incluyendo referencias y notas.' },
  { icon: '➡️', title: 'Sangría de párrafos', accent: 'linear-gradient(135deg, #009688, #4caf50)', desc: 'Primera línea con sangría de 1.27 cm (0.5 pulgadas) en todos los párrafos del cuerpo.' },
  { icon: '🔢', title: 'Numeración de páginas', accent: 'linear-gradient(135deg, #f48120, #fbad41)', desc: 'Número de página en la esquina superior derecha de todas las páginas, empezando en 1.' },
  { icon: '📋', title: 'Portada APA', accent: 'linear-gradient(135deg, #e44d26, #f16529)', desc: 'Título en negrita centrado, autor, afiliación, curso, instructor y fecha correctamente posicionados.' },
  { icon: '📚', title: 'Lista de referencias', accent: 'linear-gradient(135deg, #5d4037, #a1887f)', desc: 'Sangría francesa (hanging indent) de 1.27 cm y orden alfabético en la sección de referencias.' },
  { icon: '📊', title: 'Títulos por niveles', accent: 'linear-gradient(135deg, #336791, #5ba0d0)', desc: '5 niveles de títulos con alineación, negrita, cursiva y sangría según la jerarquía APA 7.' },
];

const MAX_SIZE = 25 * 1024 * 1024;
const HISTORY_KEY = 'apa_history';

const file = ref<File | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);
const dragOver = ref(false);
const phase = ref<'idle' | 'processing' | 'done'>('idle');
const stepState = reactive<Record<string, StepState>>({});
const outputName = ref('');
let processedBlob: Blob | null = null;

const meta = reactive({ title: '', author: '', affiliation: '', course: '', instructor: '', date: '' });

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Aviso flotante ────────────────────────────────────────────────────────
const TOAST_COLORS: Record<ToastType, string> = {
  success: 'rgba(56,106,32,0.15)',
  error: 'rgba(208,0,0,0.15)',
  info: 'rgba(103,80,164,0.15)',
};
const toast = ref<{ message: string; type: ToastType } | null>(null);
let toastTimer: number | undefined;

function notify(message: string, type: ToastType = 'info') {
  toast.value = { message, type };
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (toast.value = null), 3500);
}

onBeforeUnmount(() => clearTimeout(toastTimer));

// ── Archivo ───────────────────────────────────────────────────────────────
function setFile(f: File) {
  if (!f.name.toLowerCase().endsWith('.docx')) return notify('Solo se aceptan archivos .DOCX', 'error');
  if (f.size > MAX_SIZE) return notify('El archivo supera el límite de 25 MB', 'error');
  file.value = f;
  notify(`Archivo listo: ${f.name}`, 'success');
}

function onFileChosen() {
  const f = fileInput.value?.files?.[0];
  if (f) setFile(f);
  if (fileInput.value) fileInput.value.value = '';
}

function onDragLeave(e: DragEvent) {
  if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node | null)) dragOver.value = false;
}

function onDrop(e: DragEvent) {
  dragOver.value = false;
  const f = e.dataTransfer?.files[0];
  if (f) setFile(f);
}

// ── Formateo ──────────────────────────────────────────────────────────────
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function resetSteps() {
  for (const s of STEPS) stepState[s.id] = 'pending';
}

function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_\-áéíóúüñÁÉÍÓÚÜÑ\s]/g, '').replace(/\s+/g, '_');
}

async function format() {
  const f = file.value;
  if (!f) return;
  const titlePage = {
    title: meta.title || 'Título del Documento',
    author: meta.author || 'Autor',
    affiliation: meta.affiliation || 'Afiliación',
    course: meta.course,
    instructor: meta.instructor,
    date: (meta.date ? new Date(meta.date) : new Date()).toLocaleDateString('es-ES'),
  };

  phase.value = 'processing';
  resetSteps();
  try {
    stepState['step-read'] = 'active';
    const content = await readDocx(f);
    stepState['step-read'] = 'done';

    // Márgenes, tipografía e interlineado se aplican al generar el documento;
    // los pasos intermedios solo marcan el progreso.
    for (const id of ['step-margins', 'step-typography', 'step-spacing']) {
      stepState[id] = 'active';
      await sleep(300);
      stepState[id] = 'done';
    }

    stepState['step-generate'] = 'active';
    processedBlob = await buildApaDocx(content, titlePage);
    stepState['step-generate'] = 'done';
    await sleep(400);

    outputName.value = `${sanitizeName(f.name.replace(/\.docx$/i, ''))}_APA7.docx`;
    phase.value = 'done';
    addToHistory(f.name, outputName.value, processedBlob.size);
    notify('¡Documento formateado exitosamente!', 'success');
  } catch (err) {
    console.error('[APA] Error al formatear:', err);
    phase.value = 'idle';
    notify('Error: ' + (err instanceof Error ? err.message : String(err)), 'error');
  }
}

function download() {
  if (!processedBlob) return;
  const url = URL.createObjectURL(processedBlob);
  const link = document.createElement('a');
  link.href = url;
  link.download = outputName.value || 'documento_APA7.docx';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  notify('Descarga iniciada', 'success');
}

function reset() {
  file.value = null;
  processedBlob = null;
  outputName.value = '';
  phase.value = 'idle';
  resetSteps();
  Object.assign(meta, { title: '', author: '', affiliation: '', course: '', instructor: '', date: '' });
}

// ── Historial (localStorage) ──────────────────────────────────────────────
interface HistoryItem {
  original: string;
  formatted: string;
  date: string;
  size: number;
}

function readHistory(): HistoryItem[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    return Array.isArray(parsed) ? (parsed as HistoryItem[]) : [];
  } catch {
    return [];
  }
}

const history = ref<HistoryItem[]>(readHistory());

function addToHistory(original: string, formatted: string, size: number) {
  history.value = [{ original, formatted, date: new Date().toLocaleString('es-ES'), size }, ...history.value].slice(0, 10);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history.value));
}

function clearHistory() {
  localStorage.removeItem(HISTORY_KEY);
  history.value = [];
  notify('Historial limpiado', 'info');
}

resetSteps();
</script>
