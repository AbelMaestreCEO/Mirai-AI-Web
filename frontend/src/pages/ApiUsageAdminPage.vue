<template>
  <header class="header">
    <MenuToggle />
    <div class="header-title">Consumo de APIs</div>
  </header>

  <div class="courses-container">
    <div id="panel-denied" class="panel-denied" :style="{ display: access === 'denied' ? 'flex' : 'none' }">
      <div class="panel-denied-icon">🔒</div>
      <h2>Acceso Restringido</h2>
      <p>Este panel es exclusivo para administradores. Si crees que esto es un error, contacta al equipo.</p>
    </div>

    <div id="panel-content" :style="{ display: access === 'admin' ? 'block' : 'none' }">
      <div class="panel-hero">
        <h1>📊 Consumo de APIs externas</h1>
        <p>Unidades usadas y costo estimado por proveedor, mes a mes.</p>
      </div>
      <div class="panel-toolbar">
        <label for="month-select">Mes:</label>
        <select id="month-select" :value="usage?.month" @change="loadUsage(($event.target as HTMLSelectElement).value)">
          <option v-for="m in months" :key="m" :value="m">{{ m }}</option>
        </select>
      </div>
      <div id="usage-total" class="usage-total">
        <template v-if="usage">
          <div class="amount">{{ fmtCost(grandTotal) }}</div>
          <div class="label">costo estimado total en {{ usage.month }}</div>
        </template>
      </div>
      <div id="usage-grid" class="usage-grid">
        <div v-if="state === 'loading'" class="panel-loading">
          <div class="panel-spinner"></div>
          <span>Cargando consumo...</span>
        </div>
        <div v-else-if="state === 'error'" class="panel-empty">
          <div class="panel-empty-icon">⚠️</div>
          <p>No se pudo cargar el consumo de APIs.</p>
        </div>
        <div v-else-if="usage && !Object.keys(usage.providers).length" class="panel-empty">
          <div class="panel-empty-icon">📭</div>
          <p>Todavía no hay consumo registrado para {{ usage.month }}.</p>
        </div>
        <template v-else>
          <div
            v-for="[key, p] in cards"
            :key="key"
            class="usage-card"
            :class="{ expanded: expanded === key }"
            :data-provider="key"
            @click="expanded = expanded === key ? null : key"
          >
            <div class="usage-card-header">
              <span class="usage-card-icon">{{ PROVIDER_META[key]!.icon }}</span>
              <span class="usage-card-name">{{ PROVIDER_META[key]!.label }}</span>
            </div>
            <div class="usage-card-cost">{{ fmtCost(p.total_cost_usd) }}</div>
            <div class="usage-card-units">{{ fmtUnits(p.total_units) }} unidades · {{ fmtUnits(p.total_calls) }} llamadas</div>
            <table class="usage-detail-table" :class="{ open: expanded === key }">
              <thead>
                <tr><th>Subtipo</th><th>Unidades</th><th>Tokens in/out</th><th>Costo</th></tr>
              </thead>
              <tbody>
                <tr v-for="(b, i) in p.breakdown ?? []" :key="i">
                  <td>{{ b.sub_type || '—' }}<span v-if="b.via_gateway" class="gateway-badge">vía Gateway</span></td>
                  <td>{{ fmtUnits(b.units) }}</td>
                  <td>{{ b.tokens_in != null ? `${fmtUnits(b.tokens_in)} / ${fmtUnits(b.tokens_out)}` : '—' }}</td>
                  <td>{{ fmtCost(b.cost_usd) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </template>
      </div>
    </div>
  </div>

  <div id="panel-toast" class="panel-toast" :class="{ show: toastVisible }">{{ toastText }}</div>
</template>

<script setup lang="ts">
// Migración de public/api_usage_admin.html (su JS iba dentro de la página):
// consumo mensual de las APIs externas de pago (/api/admin/api-usage), solo
// para administradores.
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import MenuToggle from '@/components/MenuToggle.vue';
import { api } from '@/lib/api';

interface Breakdown {
  sub_type?: string | null;
  via_gateway?: boolean;
  units?: number;
  tokens_in?: number | null;
  tokens_out?: number | null;
  cost_usd?: number;
}

interface Provider {
  total_units?: number;
  total_cost_usd?: number;
  total_calls?: number;
  breakdown?: Breakdown[];
}

interface Usage {
  month: string;
  providers: Record<string, Provider>;
  available_months?: string[];
}

// También fija el orden de las tarjetas; los proveedores que no están aquí
// cuentan en el total pero no tienen tarjeta, como antes.
const PROVIDER_META: Record<string, { icon: string; label: string }> = {
  deepseek: { icon: '🧠', label: 'DeepSeek (chat)' },
  deepseek_fallback_gateway: { icon: '🛟', label: 'DeepSeek — fallback (Gateway)' },
  pruna: { icon: '🎨', label: 'Pruna AI (imagen/video)' },
  cloudflare_email: { icon: '📧', label: 'Cloudflare Email' },
  exa: { icon: '🔎', label: 'Exa (búsqueda web)' },
  firecrawl: { icon: '🕸️', label: 'Firecrawl (scraping)' },
  youtube: { icon: '▶️', label: 'YouTube Data API' },
  google_maps: { icon: '🗺️', label: 'Google Maps / Places / Geocoding' },
};

function fmtCost(n?: number | null): string {
  const v = n || 0;
  return `$${v.toFixed(v > 0 && v < 0.01 ? 4 : 2)}`;
}

function fmtUnits(n?: number | null): string {
  return new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 }).format(n || 0);
}

const toastText = ref('');
const toastVisible = ref(false);
let toastTimer: number | undefined;
onBeforeUnmount(() => clearTimeout(toastTimer));

function showToast(msg: string, duration = 2800) {
  toastText.value = msg;
  toastVisible.value = true;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (toastVisible.value = false), duration);
}

const access = ref<'checking' | 'admin' | 'denied'>('checking');
const usage = ref<Usage | null>(null);
const state = ref<'loading' | 'ready' | 'error'>('loading');
const expanded = ref<string | null>(null);

const months = computed(() => {
  if (!usage.value) return [];
  return [...new Set([...(usage.value.available_months ?? []), usage.value.month])].sort().reverse();
});

const grandTotal = computed(() => Object.values(usage.value?.providers ?? {}).reduce((sum, p) => sum + (p.total_cost_usd || 0), 0));

const cards = computed(() => {
  const providers = usage.value?.providers ?? {};
  return Object.keys(PROVIDER_META)
    .filter((key) => providers[key])
    .map((key) => [key, providers[key]!] as const);
});

async function loadUsage(month?: string) {
  state.value = 'loading';
  expanded.value = null;
  try {
    const { ok, status, data } = await api.get<Usage>(month ? `/api/admin/api-usage?month=${encodeURIComponent(month)}` : '/api/admin/api-usage');
    if (!ok) throw new Error(`HTTP ${status}`);
    usage.value = { ...data, providers: data.providers ?? {} };
    state.value = 'ready';
  } catch (err) {
    console.error('[ApiUsage] Error cargando consumo:', err);
    state.value = 'error';
    showToast(`Error: ${err instanceof Error ? err.message : String(err)}`);
  }
}

onMounted(async () => {
  try {
    const { ok, data } = await api.get<{ is_admin?: boolean }>('/api/check-admin-role');
    access.value = ok && data.is_admin === true ? 'admin' : 'denied';
  } catch {
    access.value = 'denied';
  }
  if (access.value === 'admin') await loadUsage();
});
</script>

<style>
/* CSS propio de la página antigua, limitado a ella (ver router: meta.page). */
:where(body[data-page="api_usage_admin"]) .panel-hero {
  text-align: center;
  padding: 2.5rem 1.5rem 1.5rem;
}

:where(body[data-page="api_usage_admin"]) .panel-hero h1 {
  font-size: clamp(1.6rem, 4vw, 2.4rem);
  font-weight: 700;
  background: var(--accent-gradient);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  margin-bottom: 0.4rem;
}

:where(body[data-page="api_usage_admin"]) .panel-hero p {
  color: var(--text-secondary, #666);
  font-size: 0.95rem;
}

:where(body[data-page="api_usage_admin"]) .panel-toolbar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  padding: 0 1.5rem 1.2rem;
  flex-wrap: wrap;
}

:where(body[data-page="api_usage_admin"]) .panel-toolbar label {
  font-size: 0.85rem;
  color: var(--text-secondary, #888);
  font-weight: 600;
}

:where(body[data-page="api_usage_admin"]) .panel-toolbar select,
:where(body[data-page="api_usage_admin"]) .panel-toolbar input[type="month"] {
  padding: 0.6rem 0.9rem;
  border-radius: 10px;
  border: 1.5px solid var(--glass-border, rgba(0, 0, 0, 0.1));
  background: var(--glass-bg, #fff);
  color: var(--text-primary, #1a1a1a);
  font-size: 0.9rem;
  outline: none;
}

:where(body[data-page="api_usage_admin"]) .panel-toolbar select:focus,
:where(body[data-page="api_usage_admin"]) .panel-toolbar input[type="month"]:focus {
  border-color: var(--accent-color);
  box-shadow: 0 0 0 3px var(--accent-glow, rgba(103, 80, 164, 0.12));
}

:where(body[data-page="api_usage_admin"]) .usage-total {
  text-align: center;
  padding: 0 1.5rem 1.5rem;
}

:where(body[data-page="api_usage_admin"]) .usage-total .amount {
  font-size: clamp(1.8rem, 5vw, 2.6rem);
  font-weight: 800;
  color: var(--accent-color);
}

:where(body[data-page="api_usage_admin"]) .usage-total .label {
  font-size: 0.85rem;
  color: var(--text-secondary, #888);
  margin-top: 0.2rem;
}

:where(body[data-page="api_usage_admin"]) .usage-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 1.2rem;
  padding: 0 1.5rem 2rem;
}

:where(body[data-page="api_usage_admin"]) .usage-card {
  background: var(--glass-bg, rgba(255, 255, 255, 0.92));
  border: 1.5px solid var(--glass-border, rgba(0, 0, 0, 0.07));
  border-radius: 16px;
  padding: 1.3rem 1.2rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  cursor: pointer;
  transition: transform 0.18s, box-shadow 0.18s;
  position: relative;
  overflow: hidden;
}

:where(body[data-page="api_usage_admin"]) .usage-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: var(--accent-gradient);
  opacity: 0;
  transition: opacity 0.2s;
}

:where(body[data-page="api_usage_admin"]) .usage-card:hover {
  transform: translateY(-3px);
  box-shadow: 0 8px 24px var(--accent-glow, rgba(103, 80, 164, 0.14));
}

:where(body[data-page="api_usage_admin"]) .usage-card:hover::before {
  opacity: 1;
}

:where(body[data-page="api_usage_admin"]) .usage-card.expanded::before {
  opacity: 1;
}

:where(body[data-page="api_usage_admin"]) .usage-card-header {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

:where(body[data-page="api_usage_admin"]) .usage-card-icon {
  font-size: 1.6rem;
}

:where(body[data-page="api_usage_admin"]) .usage-card-name {
  font-size: 1rem;
  font-weight: 700;
  color: var(--text-primary, #1a1a1a);
}

:where(body[data-page="api_usage_admin"]) .usage-card-cost {
  font-size: 1.7rem;
  font-weight: 800;
  color: var(--accent-color);
}

:where(body[data-page="api_usage_admin"]) .usage-card-units {
  font-size: 0.82rem;
  color: var(--text-secondary, #888);
}

:where(body[data-page="api_usage_admin"]) .usage-card-empty {
  font-size: 0.82rem;
  color: var(--text-secondary, #888);
  font-style: italic;
}

:where(body[data-page="api_usage_admin"]) .usage-detail-table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 0.6rem;
  font-size: 0.82rem;
  display: none;
}

:where(body[data-page="api_usage_admin"]) .usage-detail-table.open {
  display: table;
}

:where(body[data-page="api_usage_admin"]) .usage-detail-table th,
:where(body[data-page="api_usage_admin"]) .usage-detail-table td {
  text-align: left;
  padding: 0.4rem 0.3rem;
  border-bottom: 1px solid var(--glass-border, rgba(0, 0, 0, 0.06));
}

:where(body[data-page="api_usage_admin"]) .usage-detail-table th {
  color: var(--text-secondary, #888);
  font-weight: 600;
}

:where(body[data-page="api_usage_admin"]) .gateway-badge {
  display: inline-block;
  font-size: 0.68rem;
  font-weight: 700;
  padding: 0.1rem 0.5rem;
  border-radius: 10px;
  background: var(--secondary-container, #E8DEF8);
  color: var(--accent-color);
  margin-left: 0.4rem;
}

:where(body[data-page="api_usage_admin"]) .panel-empty {
  grid-column: 1 / -1;
  text-align: center;
  padding: 3rem 1rem;
  color: var(--text-secondary, #888);
}

:where(body[data-page="api_usage_admin"]) .panel-empty-icon {
  font-size: 2.8rem;
  margin-bottom: 0.6rem;
}

:where(body[data-page="api_usage_admin"]) .panel-loading {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.8rem;
  padding: 3rem;
  color: var(--text-secondary, #888);
}

:where(body[data-page="api_usage_admin"]) .panel-spinner {
  width: 24px;
  height: 24px;
  border: 3px solid var(--glass-border, rgba(0, 0, 0, 0.1));
  border-top-color: var(--accent-color);
  border-radius: 50%;
  animation: panelSpin 0.8s linear infinite;
}

@keyframes panelSpin {
  to {
    transform: rotate(360deg);
  }
}

:where(body[data-page="api_usage_admin"]) .panel-denied {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  padding: 4rem 2rem;
  text-align: center;
}

:where(body[data-page="api_usage_admin"]) .panel-denied-icon {
  font-size: 3.5rem;
}

:where(body[data-page="api_usage_admin"]) .panel-denied h2 {
  color: var(--text-primary, #1a1a1a);
}

:where(body[data-page="api_usage_admin"]) .panel-denied p {
  color: var(--text-secondary, #888);
  font-size: 0.95rem;
}
</style>
