<template>
  <header class="header">
    <MenuToggle />
    <div class="header-title">Investigador Web</div>
  </header>

  <div class="inv-page-content">
    <!-- Hero + barra de búsqueda -->
    <div class="inv-hero-zone">
      <span class="inv-hero-icon">🔭</span>
      <h1 class="inv-hero-title">Investigador Web con IA</h1>
      <p class="inv-hero-subtitle">Escribe tu pregunta y la IA buscará en la web, noticias y fuentes académicas para redactar un resumen para ti</p>
      <div class="inv-search-wrapper">
        <textarea
          id="inv-input"
          ref="inputEl"
          v-model="question"
          class="welcome-textarea"
          placeholder="¿Qué quieres investigar?"
          rows="1"
          autocomplete="off"
          spellcheck="false"
          :disabled="busy"
          @input="autoResize"
          @keydown.enter.exact.prevent="startInvestigation"
        ></textarea>
        <button id="inv-send-btn" class="send-button" aria-label="Investigar" :disabled="busy" :style="{ opacity: busy ? '0.5' : '1' }" @click="startInvestigation">
          <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
          </svg>
        </button>
      </div>
      <p class="inv-disclaimer">
        ⚠️ El resumen es generado por IA a partir de fuentes públicas. Verifica la información antes de usarla en trabajos académicos.
      </p>

      <!-- Historial de búsquedas -->
      <div class="inv-history-section">
        <button id="inv-history-toggle" class="inv-history-toggle" :class="{ active: historyOpen }" @click="toggleHistory">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor">
            <path d="M13 3a9 9 0 0 0-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42A8.954 8.954 0 0 0 13 21a9 9 0 0 0 0-18zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z" />
          </svg>
          Historial de búsquedas
        </button>
        <div id="inv-history-list" class="inv-history-list" :class="{ visible: historyOpen }">
          <div v-for="item in history" :key="item.id" class="inv-history-item">
            <div class="inv-history-item-body" @click="openHistoryItem(item)">
              <div class="inv-history-item-question">{{ item.question }}</div>
              <div class="inv-history-item-date">{{ formatHistoryDate(item.created_at) }}</div>
            </div>
            <button class="inv-history-delete" title="Eliminar" @click.stop="deleteHistoryItem(item.id)">&times;</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Zona de resultados -->
    <div class="inv-results-zone">
      <div id="inv-error" ref="errorEl" class="inv-error-box" :class="{ visible: !!error }">{{ error ? `⚠️ ${error}` : '' }}</div>

      <!-- Animación de carga -->
      <div id="inv-loading" class="inv-loading" :class="{ visible: busy }">
        <div class="inv-orb"></div>
        <div class="inv-progress-bar">
          <div class="inv-progress-fill"></div>
        </div>
        <div id="inv-step-text" class="inv-step-text" :style="{ opacity: stepVisible ? '1' : '0' }">{{ stepText }}</div>
        <div class="inv-step-sub">Esto puede tardar unos segundos</div>
        <div class="inv-chips">
          <span v-for="(chip, i) in CHIPS" :id="chip.id" :key="chip.id" class="inv-chip" :class="chipClass(i)">{{ chip.label }}</span>
        </div>
      </div>

      <!-- Resultado -->
      <div id="inv-result" ref="resultEl" class="inv-result" :class="{ visible: !!result }">
        <div class="inv-result-header">
          <div class="inv-result-title">
            📋 Resumen de investigación
            <span id="inv-sources-count" class="inv-result-badge">{{ sourcesLabel }}</span>
          </div>
          <button id="inv-copy-btn" class="inv-copy-btn" :class="{ copied: copied === 'summary' }" @click="copy('summary')">
            <svg v-if="copied === 'summary'" viewBox="0 0 24 24" width="15" height="15" fill="currentColor">
              <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
            </svg>
            <svg v-else viewBox="0 0 24 24" width="15" height="15" fill="currentColor">
              <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z" />
            </svg>
            {{ copied === 'summary' ? '¡Copiado!' : 'Copiar todo' }}
          </button>
        </div>
        <div id="inv-summary-text" class="inv-summary-box">{{ result?.summary }}</div>
        <p class="inv-sources-label">Fuentes consultadas</p>
        <div id="inv-sources-grid" class="inv-sources-grid">
          <a v-for="(src, i) in result?.sources ?? []" :key="i" :href="safeUrl(src.url)" target="_blank" rel="noopener noreferrer" class="inv-source-card">
            <span class="inv-source-type" :class="src.type || 'web'">{{ typeLabel(src.type) }}</span>
            <span class="inv-source-name">{{ src.title || src.url || 'Fuente' }}</span>
            <span class="inv-source-url">{{ src.url || '' }}</span>
          </a>
        </div>

        <!-- Bibliografía APA 7 -->
        <div class="inv-apa-section">
          <div class="inv-apa-header">
            <div class="inv-apa-title">
              📚 Bibliografía
              <span class="inv-apa-badge">APA 7</span>
            </div>
            <button id="inv-copy-apa-btn" class="inv-copy-btn" :class="{ copied: copied === 'apa' }" @click="copy('apa')">
              <svg v-if="copied === 'apa'" viewBox="0 0 24 24" width="15" height="15" fill="currentColor">
                <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
              </svg>
              <svg v-else viewBox="0 0 24 24" width="15" height="15" fill="currentColor">
                <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z" />
              </svg>
              {{ copied === 'apa' ? '¡Bibliografía copiada!' : 'Copiar bibliografía' }}
            </button>
          </div>
          <div id="inv-apa-box" class="inv-apa-box">{{ apaText }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// Migración de public/investigation.html y public/investigation.js: la IA
// busca en la web (POST /api/investigation/search) y redacta un resumen con
// sus fuentes y la bibliografía en APA 7.
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import MenuToggle from '@/components/MenuToggle.vue';
import { api, apiFetch, errorMessage } from '@/lib/api';

interface Source {
  title?: string;
  url?: string;
  type?: string;
  author?: string;
  publishedDate?: string;
}

interface InvestigationResult {
  summary: string;
  sources: Source[];
}

interface HistoryItem {
  id: number;
  question: string;
  summary: string;
  sources?: Source[];
  created_at?: string;
}

const STEP_INTERVAL = 2200;
const COPY_RESET = 2500;

const CHIPS = [
  { id: 'chip-search', label: '🌐 Buscando' },
  { id: 'chip-read', label: '📄 Leyendo páginas' },
  { id: 'chip-filter', label: '🧹 Filtrando' },
  { id: 'chip-write', label: '✍️ Redactando' },
];

// Mensajes de la animación de carga y la fase (chip) a la que corresponden.
const LOADING_STEPS: { text: string; chip: number }[] = [
  { text: 'Buscando en la web...', chip: 0 },
  { text: 'Buscando noticias recientes...', chip: 0 },
  { text: 'Buscando artículos académicos...', chip: 0 },
  { text: 'Consultando fuentes especializadas...', chip: 0 },
  { text: 'Leyendo las páginas encontradas...', chip: 1 },
  { text: 'Extrayendo el contenido relevante...', chip: 1 },
  { text: 'Analizando cada fuente en detalle...', chip: 1 },
  { text: 'Preparando la investigación para ti...', chip: 2 },
  { text: 'Filtrando información innecesaria...', chip: 2 },
  { text: 'Descartando contenido sin relevancia...', chip: 2 },
  { text: 'La IA está redactando el resumen...', chip: 3 },
  { text: 'Parafraseando en tercera persona...', chip: 3 },
  { text: 'Organizando las fuentes citadas...', chip: 3 },
  { text: 'Revisando coherencia del texto...', chip: 3 },
  { text: 'Casi listo, últimos ajustes...', chip: 3 },
];

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const SHORT_MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

const question = ref('');
const busy = ref(false);
const error = ref('');
const result = ref<InvestigationResult | null>(null);
const inputEl = ref<HTMLTextAreaElement | null>(null);
const errorEl = ref<HTMLElement | null>(null);
const resultEl = ref<HTMLElement | null>(null);

function autoResize() {
  const el = inputEl.value;
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
}

// ── Animación de carga ────────────────────────────────────────────────────
// activeChip: -1 sin empezar, 0..3 en curso, 4 todo terminado.
const activeChip = ref(-1);
const stepText = ref('Iniciando búsqueda...');
const stepVisible = ref(true);
let stepTimer: number | undefined;
let fadeTimer: number | undefined;

function chipClass(i: number) {
  return { done: i < activeChip.value, active: i === activeChip.value };
}

function startLoading() {
  let index = 0;
  const tick = () => {
    const step = LOADING_STEPS[index % LOADING_STEPS.length]!;
    stepVisible.value = false;
    fadeTimer = window.setTimeout(() => {
      stepText.value = step.text;
      stepVisible.value = true;
      activeChip.value = step.chip;
    }, 200);
    index++;
  };
  tick();
  stepTimer = window.setInterval(tick, STEP_INTERVAL);
}

function stopLoading() {
  clearInterval(stepTimer);
  clearTimeout(fadeTimer);
  stepVisible.value = true;
  activeChip.value = CHIPS.length;
}

onBeforeUnmount(() => {
  clearInterval(stepTimer);
  clearTimeout(fadeTimer);
  clearTimeout(copyTimer);
});

// ── Resultado ─────────────────────────────────────────────────────────────
const sourcesLabel = computed(() => {
  const n = result.value?.sources.length ?? 0;
  return n === 0 ? 'sin fuentes' : n === 1 ? '1 fuente' : `${n} fuentes`;
});

const apaText = computed(() => buildApaBlock(result.value?.sources ?? []));

function typeLabel(type?: string): string {
  return type === 'academic' ? 'Académico' : type === 'news' ? 'Noticia' : 'Web';
}

/** Solo enlaces http(s): las fuentes vienen de resultados de búsqueda. */
function safeUrl(url?: string): string {
  return url && /^https?:\/\//i.test(url) ? url : '#';
}

async function showResult(data: InvestigationResult) {
  result.value = { summary: (data.summary || '').trim(), sources: Array.isArray(data.sources) ? data.sources : [] };
  await nextTick();
  resultEl.value?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function startInvestigation() {
  const q = question.value.trim();
  if (!q) {
    inputEl.value?.focus();
    return;
  }
  if (busy.value) return;

  error.value = '';
  result.value = null;
  activeChip.value = -1;
  busy.value = true;
  startLoading();

  try {
    let res: Response;
    try {
      res = await apiFetch('/api/investigation/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q }),
      });
    } catch {
      throw new Error('No se pudo conectar con el servidor. Verifica tu conexión a internet.');
    }
    stopLoading();
    const data = (await res.json().catch(() => ({}))) as Partial<InvestigationResult> & { error?: string };
    if (!res.ok) throw new Error(errorMessage(data, `Error del servidor (${res.status})`));
    if (typeof data.summary !== 'string') throw new Error('La respuesta del servidor no tiene el formato esperado.');

    await showResult({ summary: data.summary, sources: data.sources ?? [] });
    if (historyOpen.value) void loadHistory();
  } catch (err) {
    stopLoading();
    error.value = err instanceof Error ? err.message : String(err);
    console.error('[investigation] Error:', err);
    await nextTick();
    errorEl.value?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  } finally {
    busy.value = false;
    await nextTick();
    inputEl.value?.focus();
  }
}

// ── Copiar ────────────────────────────────────────────────────────────────
const copied = ref<'summary' | 'apa' | null>(null);
let copyTimer: number | undefined;

async function copy(what: 'summary' | 'apa') {
  const text = what === 'summary' ? result.value?.summary : apaText.value;
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
  } catch (err) {
    console.error('[investigation] Error al copiar:', err);
    return;
  }
  copied.value = what;
  clearTimeout(copyTimer);
  copyTimer = window.setTimeout(() => (copied.value = null), COPY_RESET);
}

// ── APA 7 ─────────────────────────────────────────────────────────────────
// Página web: Apellido, N. (Año, Día de Mes). Título. Sitio. URL
// Sin autor:  Título. (Año, Día de Mes). Sitio. URL

/** "Ana María López" → "López, A. M." */
function apaName(name: string): string {
  const parts = name.trim().split(' ').filter(Boolean);
  if (parts.length < 2) return name.trim();
  const last = parts[parts.length - 1];
  const initials = parts
    .slice(0, -1)
    .map((p) => `${p[0]}.`)
    .join(' ');
  return `${last}, ${initials}`;
}

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace('www.', '');
  } catch {
    return '';
  }
}

function buildApaReference(src: Source, index: number): string {
  const url = src.url || '';
  // Exa a veces devuelve la URL como título.
  let rawTitle = src.title || '';
  if (/^https?:\/\//.test(rawTitle)) rawTitle = hostname(rawTitle);
  const siteName = hostname(url);
  const title = rawTitle || siteName || `Fuente ${index + 1}`;

  let author = '';
  if (src.author) {
    const names = src.author.split(',').map((s) => s.trim());
    author = names.length >= 2 ? names.map(apaName).join(', & ') : apaName(src.author);
  }

  let date = 's.f.';
  if (src.publishedDate) {
    const d = new Date(src.publishedDate);
    if (!Number.isNaN(d.getTime())) date = `${d.getFullYear()}, ${d.getDate()} de ${MONTHS[d.getMonth()]}`;
  }

  const site = siteName ? `${siteName}. ` : '';
  return author ? `${author}. (${date}). ${title}. ${site}${url}` : `${title}. (${date}). ${site}${url}`;
}

function buildApaBlock(sources: Source[]): string {
  if (!sources.length) return '';
  return 'Referencias\n\n' + sources.map(buildApaReference).join('\n\n');
}

// ── Historial ─────────────────────────────────────────────────────────────
const history = ref<HistoryItem[]>([]);
const historyOpen = ref(false);

async function loadHistory() {
  try {
    const { ok, data } = await api.get<{ history?: HistoryItem[] }>('/api/investigation/history');
    if (ok) history.value = data.history || [];
  } catch {
    // Sin historial: no es imprescindible.
  }
}

function toggleHistory() {
  historyOpen.value = !historyOpen.value;
  if (historyOpen.value) void loadHistory();
}

async function openHistoryItem(item: HistoryItem) {
  question.value = item.question;
  historyOpen.value = false;
  await showResult({ summary: item.summary, sources: item.sources || [] });
  autoResize();
}

async function deleteHistoryItem(id: number) {
  try {
    await api.delete('/api/investigation/history', { id: Number(id) });
    history.value = history.value.filter((h) => h.id !== id);
  } catch {
    // Se queda en la lista; se puede reintentar.
  }
}

function formatHistoryDate(iso?: string): string {
  if (!iso) return '';
  const d = new Date(`${iso}Z`);
  if (Number.isNaN(d.getTime())) return iso;
  const hh = d.getHours().toString().padStart(2, '0');
  const mm = d.getMinutes().toString().padStart(2, '0');
  return `${d.getDate()} ${SHORT_MONTHS[d.getMonth()]} ${d.getFullYear()}, ${hh}:${mm}`;
}

onMounted(() => inputEl.value?.focus());
</script>

<style>
/* CSS propio de la página antigua, limitado a ella (ver router: meta.page). */
/* ── Estilos exclusivos de investigation ── */

/* El margen para el sidebar lo aplica la regla compartida del final de
 styles.css (familia B). Antes se usaba `var(--sidebar-width, 260px)`, una
 variable que no existe en ninguna hoja, así que el margen nunca coincidía
 con el ancho real del menú. */
:where(body[data-page="investigation"]) .inv-page-content {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

/* Zona central estilo Google: hero + barra de búsqueda */
:where(body[data-page="investigation"]) .inv-hero-zone {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 24px 32px;
  text-align: center;
}
:where(body[data-page="investigation"]) .inv-hero-icon {
  font-size: 3.2rem;
  margin-bottom: 14px;
  display: block;
  animation: inv-icon-in 0.6s cubic-bezier(0.16,1,0.3,1) both;
}
@keyframes inv-icon-in {
  from { opacity:0; transform: scale(0.7) translateY(10px); }
  to   { opacity:1; transform: scale(1)   translateY(0); }
}
:where(body[data-page="investigation"]) .inv-hero-title {
  font-size: clamp(1.7rem, 4vw, 2.4rem);
  font-weight: 700;
  background: var(--accent-gradient, linear-gradient(135deg,#6750A4,#9A82DB));
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  margin: 0 0 8px;
}
:where(body[data-page="investigation"]) .inv-hero-subtitle {
  font-size: 0.95rem;
  color: var(--text-secondary, #888);
  margin: 0 0 32px;
  max-width: 480px;
}

/* ── Barra de búsqueda estilo Google ── */
:where(body[data-page="investigation"]) .inv-search-wrapper {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  max-width: 680px;
  background: var(--inv-input-bg, #ffffff);
  border: 2px solid var(--glass-border, rgba(103,80,164,0.2));
  border-radius: 999px;
  padding: 10px 10px 10px 22px;
  box-shadow: 0 2px 10px rgba(0,0,0,0.06), 0 0 0 0 var(--accent-color, #6750A4);
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
  box-sizing: border-box;
}
/* Fondo blanco en light, oscuro en dark */
:root :where(body[data-page="investigation"]) .inv-search-wrapper { --inv-input-bg: #ffffff; }
[data-theme="dark"] :where(body[data-page="investigation"]) .inv-search-wrapper { --inv-input-bg: #1e1b26; }

/* Hover: borde de acento suave */
:where(body[data-page="investigation"]) .inv-search-wrapper:hover {
  border-color: var(--accent-color, #6750A4);
}

/* Focus-within: borde de acento sólido + glow */
:where(body[data-page="investigation"]) .inv-search-wrapper:focus-within {
  border-color: var(--accent-color, #6750A4);
  box-shadow: 0 2px 16px rgba(0,0,0,0.08),
        0 0 0 3px var(--accent-glow, rgba(103,80,164,0.18));
}

/* Ícono de lupa a la izquierda */
:where(body[data-page="investigation"]) .inv-search-wrapper::before {
  content: '';
  display: block;
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  background-color: var(--accent-color, #6750A4);
  -webkit-mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z'/%3E%3C/svg%3E");
  mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z'/%3E%3C/svg%3E");
  -webkit-mask-size: contain;
  mask-size: contain;
  -webkit-mask-repeat: no-repeat;
  mask-repeat: no-repeat;
  opacity: 0.55;
  transition: opacity 0.2s;
}
:where(body[data-page="investigation"]) .inv-search-wrapper:focus-within::before {
  opacity: 1;
}

/* Textarea sin borde propio — el wrapper es el "input" */
:where(body[data-page="investigation"]) .inv-search-wrapper .welcome-textarea {
  flex: 1;
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
  border-radius: 0 !important;
  padding: 0 !important;
  margin: 0 !important;
  outline: none !important;
  resize: none;
  font-size: 1rem;
  line-height: 1.5;
  color: var(--text-primary, #333);
  min-height: 24px;
  max-height: 120px;
}
:where(body[data-page="investigation"]) .inv-search-wrapper .welcome-textarea::placeholder {
  color: var(--text-secondary, #aaa);
}
:where(body[data-page="investigation"]) .inv-search-wrapper .welcome-textarea:focus {
  outline: none !important;
  box-shadow: none !important;
}

/* Botón enviar dentro del wrapper — pill compacto */
:where(body[data-page="investigation"]) .inv-search-wrapper .send-button {
  flex-shrink: 0;
  width: 42px;
  height: 42px;
  border-radius: 50%;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
:where(body[data-page="investigation"]) .inv-disclaimer {
  font-size: 0.76rem;
  color: var(--text-secondary, #aaa);
  margin-top: 12px;
  max-width: 520px;
}

/* ── Zona de resultados (debajo del hero) ── */
:where(body[data-page="investigation"]) .inv-results-zone {
  width: 100%;
  max-width: 860px;
  margin: 0 auto;
  padding: 0 24px 64px;
  box-sizing: border-box;
}

/* ── Animación de carga ── */
:where(body[data-page="investigation"]) .inv-loading {
  display: none;
  flex-direction: column;
  align-items: center;
  gap: 18px;
  padding: 40px 0 48px;
  text-align: center;
}
:where(body[data-page="investigation"]) .inv-loading.visible { display: flex; }

:where(body[data-page="investigation"]) .inv-orb {
  width: 68px;
  height: 68px;
  border-radius: 50%;
  background: var(--accent-gradient, linear-gradient(135deg,#6750A4,#9A82DB));
  box-shadow: 0 0 0 0 var(--accent-glow, rgba(103,80,164,0.4));
  animation: inv-pulse 1.8s ease-in-out infinite;
  position: relative;
}
:where(body[data-page="investigation"]) .inv-orb::after {
  content: '🔍';
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.5rem;
}
@keyframes inv-pulse {
  0%   { transform: scale(1);    box-shadow: 0 0 0 0   var(--accent-glow, rgba(103,80,164,0.35)); }
  50%  { transform: scale(1.08); box-shadow: 0 0 0 18px transparent; }
  100% { transform: scale(1);    box-shadow: 0 0 0 0   transparent; }
}

:where(body[data-page="investigation"]) .inv-progress-bar {
  width: min(360px, 80vw);
  height: 4px;
  border-radius: 999px;
  background: var(--glass-border, rgba(103,80,164,0.15));
  overflow: hidden;
}
:where(body[data-page="investigation"]) .inv-progress-fill {
  height: 100%;
  width: 38%;
  border-radius: 999px;
  background: var(--accent-gradient, linear-gradient(135deg,#6750A4,#9A82DB));
  animation: inv-slide 1.5s ease-in-out infinite;
}
@keyframes inv-slide {
  0%   { transform: translateX(-120%); }
  100% { transform: translateX(380%); }
}

:where(body[data-page="investigation"]) .inv-step-text {
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-primary, #333);
  min-height: 1.4em;
  transition: opacity 0.35s ease;
}
:where(body[data-page="investigation"]) .inv-step-sub {
  font-size: 0.82rem;
  color: var(--text-secondary, #888);
  margin-top: -10px;
}

/* Chips de etapa */
:where(body[data-page="investigation"]) .inv-chips {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: center;
}
:where(body[data-page="investigation"]) .inv-chip {
  font-size: 0.74rem;
  padding: 4px 13px;
  border-radius: 999px;
  border: 1.5px solid var(--glass-border, rgba(103,80,164,0.2));
  color: var(--text-secondary, #999);
  background: transparent;
  transition: all 0.3s;
  white-space: nowrap;
}
:where(body[data-page="investigation"]) .inv-chip.done {
  background: var(--secondary-container, #E8DEF8);
  color: var(--accent-color, #6750A4);
  border-color: var(--accent-color, #6750A4);
}
:where(body[data-page="investigation"]) .inv-chip.active {
  background: var(--accent-color, #6750A4);
  color: #fff;
  border-color: var(--accent-color, #6750A4);
  animation: inv-blink 1s ease-in-out infinite;
}
@keyframes inv-blink {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.6; }
}

/* ── Resultado ── */
:where(body[data-page="investigation"]) .inv-result {
  display: none;
  animation: inv-fade-up 0.5s ease both;
}
:where(body[data-page="investigation"]) .inv-result.visible { display: block; }
@keyframes inv-fade-up {
  from { opacity:0; transform: translateY(18px); }
  to   { opacity:1; transform: translateY(0); }
}

:where(body[data-page="investigation"]) .inv-result-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 14px;
}
:where(body[data-page="investigation"]) .inv-result-title {
  font-size: 1rem;
  font-weight: 700;
  color: var(--text-primary, #333);
  display: flex;
  align-items: center;
  gap: 8px;
}
:where(body[data-page="investigation"]) .inv-result-badge {
  font-size: 0.71rem;
  padding: 3px 11px;
  border-radius: 999px;
  background: var(--secondary-container, #E8DEF8);
  color: var(--accent-color, #6750A4);
  font-weight: 600;
}

:where(body[data-page="investigation"]) .inv-copy-btn {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 8px 20px;
  border-radius: 999px;
  border: 1.5px solid var(--accent-color, #6750A4);
  background: transparent;
  color: var(--accent-color, #6750A4);
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s, color 0.2s;
  font-family: inherit;
}
:where(body[data-page="investigation"]) .inv-copy-btn:hover { background: var(--accent-color, #6750A4); color: #fff; }
:where(body[data-page="investigation"]) .inv-copy-btn.copied { background: #34c759; border-color: #34c759; color: #fff; }

:where(body[data-page="investigation"]) .inv-summary-box {
  background: var(--glass-bg, rgba(255,255,255,0.94));
  border: 1px solid var(--glass-border, rgba(103,80,164,0.12));
  border-radius: 16px;
  padding: 28px;
  font-size: 0.95rem;
  line-height: 1.78;
  color: var(--text-primary, #333);
  white-space: pre-wrap;
  word-break: break-word;
  box-shadow: 0 2px 16px var(--accent-glow, rgba(103,80,164,0.06));
}

:where(body[data-page="investigation"]) .inv-sources-label {
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--text-secondary, #999);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin: 24px 0 12px;
}
:where(body[data-page="investigation"]) .inv-sources-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
  gap: 10px;
}
:where(body[data-page="investigation"]) .inv-source-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px 14px;
  border-radius: 12px;
  border: 1px solid var(--glass-border, rgba(103,80,164,0.12));
  background: var(--glass-bg, rgba(255,255,255,0.8));
  text-decoration: none;
  transition: border-color 0.2s, box-shadow 0.2s;
}
:where(body[data-page="investigation"]) .inv-source-card:hover {
  border-color: var(--accent-color, #6750A4);
  box-shadow: 0 2px 12px var(--accent-glow, rgba(103,80,164,0.12));
}
:where(body[data-page="investigation"]) .inv-source-type {
  font-size: 0.68rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: 2px 9px;
  border-radius: 999px;
  width: fit-content;
}
:where(body[data-page="investigation"]) .inv-source-type.web { background:#E3F2FD; color:#1565C0; }
:where(body[data-page="investigation"]) .inv-source-type.news { background:#FFF3E0; color:#E65100; }
:where(body[data-page="investigation"]) .inv-source-type.academic { background:#E8F5E9; color:#2E7D32; }
:where(body[data-page="investigation"]) .inv-source-name {
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--text-primary, #333);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
:where(body[data-page="investigation"]) .inv-source-url {
  font-size: 0.71rem;
  color: var(--text-secondary, #aaa);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Error */
:where(body[data-page="investigation"]) .inv-error-box {
  display: none;
  padding: 14px 18px;
  border-radius: 12px;
  background: #FFEBEE;
  border: 1px solid #EF9A9A;
  color: #B71C1C;
  font-size: 0.88rem;
  margin-bottom: 20px;
}
:where(body[data-page="investigation"]) .inv-error-box.visible { display: block; }

@media (max-width: 480px) {
  :where(body[data-page="investigation"]) .inv-summary-box { padding: 18px; }
  :where(body[data-page="investigation"]) .inv-result-header { flex-direction: column; align-items: flex-start; }
  :where(body[data-page="investigation"]) .inv-hero-zone { padding: 40px 16px 24px; }
  :where(body[data-page="investigation"]) .inv-apa-box { padding: 16px; font-size: 0.82rem; }
  :where(body[data-page="investigation"]) .inv-apa-header { flex-direction: column; align-items: flex-start; }
}

/* ── Sección bibliografía APA 7 ── */
:where(body[data-page="investigation"]) .inv-apa-section {
  margin-top: 28px;
  border-top: 1px solid var(--glass-border, rgba(103,80,164,0.12));
  padding-top: 20px;
}
:where(body[data-page="investigation"]) .inv-apa-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 14px;
}
:where(body[data-page="investigation"]) .inv-apa-title {
  font-size: 1rem;
  font-weight: 700;
  color: var(--text-primary, #333);
  display: flex;
  align-items: center;
  gap: 8px;
}
:where(body[data-page="investigation"]) .inv-apa-badge {
  font-size: 0.71rem;
  padding: 3px 11px;
  border-radius: 999px;
  background: var(--secondary-container, #E8DEF8);
  color: var(--accent-color, #6750A4);
  font-weight: 700;
  letter-spacing: 0.04em;
}
:where(body[data-page="investigation"]) .inv-apa-box {
  background: var(--glass-bg, rgba(255,255,255,0.94));
  border: 1px solid var(--glass-border, rgba(103,80,164,0.12));
  border-radius: 14px;
  padding: 22px 24px;
  font-size: 0.875rem;
  line-height: 1.9;
  color: var(--text-primary, #333);
  white-space: pre-wrap;
  word-break: break-word;
  font-family: 'Georgia', 'Times New Roman', serif;
}

/* ── Historial de búsquedas ── */
:where(body[data-page="investigation"]) .inv-history-section {
  width: 100%;
  max-width: 680px;
  margin: 28px auto 0;
}
:where(body[data-page="investigation"]) .inv-history-toggle {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 8px 20px;
  border-radius: 999px;
  border: 1.5px solid var(--glass-border, rgba(103,80,164,0.2));
  background: var(--glass-bg, rgba(255,255,255,0.8));
  color: var(--text-secondary, #888);
  font-size: 0.84rem;
  font-weight: 600;
  cursor: pointer;
  transition: border-color 0.2s, color 0.2s, background 0.2s;
  font-family: inherit;
}
:where(body[data-page="investigation"]) .inv-history-toggle:hover {
  border-color: var(--accent-color, #6750A4);
  color: var(--accent-color, #6750A4);
}
:where(body[data-page="investigation"]) .inv-history-toggle.active {
  border-color: var(--accent-color, #6750A4);
  color: var(--accent-color, #6750A4);
  background: var(--secondary-container, #E8DEF8);
}
:where(body[data-page="investigation"]) .inv-history-list {
  display: none;
  flex-direction: column;
  gap: 8px;
  margin-top: 14px;
  max-height: 360px;
  overflow-y: auto;
  padding-right: 4px;
}
:where(body[data-page="investigation"]) .inv-history-list.visible { display: flex; }
:where(body[data-page="investigation"]) .inv-history-list:empty::after {
  content: 'Aún no tienes búsquedas guardadas.';
  font-size: 0.84rem;
  color: var(--text-secondary, #aaa);
  text-align: center;
  padding: 18px 0;
}
:where(body[data-page="investigation"]) .inv-history-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 11px 14px;
  border-radius: 12px;
  border: 1px solid var(--glass-border, rgba(103,80,164,0.12));
  background: var(--glass-bg, rgba(255,255,255,0.8));
  cursor: pointer;
  transition: border-color 0.2s, box-shadow 0.2s;
}
:where(body[data-page="investigation"]) .inv-history-item:hover {
  border-color: var(--accent-color, #6750A4);
  box-shadow: 0 2px 10px var(--accent-glow, rgba(103,80,164,0.1));
}
:where(body[data-page="investigation"]) .inv-history-item-body {
  flex: 1;
  min-width: 0;
}
:where(body[data-page="investigation"]) .inv-history-item-question {
  font-size: 0.88rem;
  font-weight: 600;
  color: var(--text-primary, #333);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
:where(body[data-page="investigation"]) .inv-history-item-date {
  font-size: 0.72rem;
  color: var(--text-secondary, #aaa);
  margin-top: 2px;
}
:where(body[data-page="investigation"]) .inv-history-delete {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: none;
  background: transparent;
  color: var(--text-secondary, #bbb);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s, color 0.2s;
  font-size: 1rem;
}
:where(body[data-page="investigation"]) .inv-history-delete:hover {
  background: #FFEBEE;
  color: #B71C1C;
}
</style>
