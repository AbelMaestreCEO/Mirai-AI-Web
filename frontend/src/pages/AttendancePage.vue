<template>
  <header class="header">
    <MenuToggle />
    <div class="header-title">Control de Asistencia</div>
  </header>

  <div class="courses-container">
    <div class="courses-hero">
      <h1>Registrar Asistencia</h1>
      <p>Escanea el código QR del día para registrar tu entrada o salida.</p>
    </div>
    <div class="att-layout">
      <!-- ── Columna principal: identidad, escáner y resultado ── -->
      <div class="att-col">
        <div class="att-user-card">
          <div id="att-avatar" class="att-avatar">{{ initials(profile.name) }}</div>
          <div>
            <div id="att-user-name" class="att-user-name">{{ profile.name || 'Cargando...' }}</div>
            <div id="att-user-meta" class="att-user-meta">{{ profile.meta }}</div>
          </div>
        </div>

        <div v-show="!result" id="qr-scan-card" class="qr-scan-card">
          <h3 style="font-size:1rem;font-weight:700;color:var(--text-primary);margin-bottom:16px;">📷 Escanear QR
            de asistencia</h3>
          <div v-show="scanning" id="qr-video-wrap" class="qr-video-wrap">
            <video id="qr-video" ref="videoEl" playsinline autoplay muted></video>
            <div class="qr-scan-line"></div>
            <canvas id="qr-canvas" ref="canvasEl" style="display:none;"></canvas>
          </div>
          <p style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:20px;">
            Apunta la cámara al QR que el administrador generó para hoy.
          </p>
          <button id="btn-start-scan" class="course-start-btn" style="max-width:220px;margin:0 auto;" @click="toggleScan">
            {{ scanning ? '⏹ Detener cámara' : '📷 Activar cámara' }}
          </button>
          <p id="scan-status" style="font-size:0.78rem;color:var(--text-tertiary);margin-top:12px;">{{ scanStatus }}</p>
        </div>

        <div id="att-result-card" class="att-result-card" :style="result ? { display: 'block' } : undefined">
          <div id="att-result-icon" class="att-result-icon">{{ result?.icon ?? '✅' }}</div>
          <div id="att-result-title" class="att-result-title">{{ result?.title ?? '¡Asistencia registrada!' }}</div>
          <div id="att-result-sub" class="att-result-sub">{{ result?.sub ?? '—' }}</div>
          <button id="btn-scan-again" class="course-start-btn" style="max-width:200px;margin:20px auto 0;" @click="result = null">
            Escanear de nuevo
          </button>
        </div>

        <!-- Acceso al panel de administración (solo profesores/admin) -->
        <div v-if="isProfessor" id="admin-access-card">
          <div class="course-card" style="text-align:center;padding:20px 24px;">
            <div style="font-size:1.6rem;margin-bottom:8px;">🔐</div>
            <h3 class="course-title" style="margin-bottom:6px;">Panel Administrativo</h3>
            <p style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:16px;">
              Accede al gestor de QRs, registros y personal.
            </p>
            <AppLink to="attendance_admin" class="course-start-btn" style="display:block;max-width:220px;margin:0 auto;text-decoration:none;text-align:center;">
              Ir al Admin →
            </AppLink>
          </div>
        </div>
      </div>

      <!-- ── Columna lateral: historial de marcaciones ── -->
      <div class="att-col">
        <div class="course-card att-history-card">
          <h3 class="course-title" style="margin-bottom:16px;">📋 Mis marcaciones</h3>
          <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px;align-items:flex-end;">
            <div class="form-group" style="flex:1;min-width:120px;margin-bottom:0;">
              <label for="hist-date-from" style="font-size:0.78rem;">Desde</label>
              <input id="hist-date-from" v-model="filters.from" type="date" @change="onDateFrom">
            </div>
            <div class="form-group" style="flex:1;min-width:120px;margin-bottom:0;">
              <label for="hist-date-to" style="font-size:0.78rem;">Hasta</label>
              <input id="hist-date-to" v-model="filters.to" type="date" @change="loadHistory">
            </div>
            <button
              id="btn-clear-filters"
              style="padding:10px 14px;border:1px solid var(--glass-border);border-radius:var(--border-radius-pill);background:var(--glass-bg);color:var(--text-secondary);font-size:0.8rem;cursor:pointer;font-family:inherit;white-space:nowrap;"
              @click="clearFilters"
            >✕ Limpiar</button>
          </div>
          <div v-if="classes.length" id="hist-filter-row" style="display:flex;margin-bottom:14px;">
            <div class="form-group" style="margin-bottom:0;">
              <label for="hist-filter-class" style="font-size:0.78rem;">Filtrar por clase</label>
              <select id="hist-filter-class" v-model="filters.classId" @change="loadHistory">
                <option value="">Todas las clases</option>
                <option v-for="c in classes" :key="c.id" :value="String(c.id)">{{ c.name }}</option>
              </select>
            </div>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px;">
            <button
              id="btn-my-pdf"
              style="display:inline-flex;align-items:center;gap:6px;padding:8px 16px;border:1px solid var(--glass-border);border-radius:var(--border-radius-pill);background:var(--glass-bg);color:var(--text-primary);font-size:0.8rem;font-weight:600;cursor:pointer;font-family:inherit;transition:all var(--transition-fast);"
              @click="exportPdf"
            >📄 PDF</button>
            <button
              id="btn-my-excel"
              style="display:inline-flex;align-items:center;gap:6px;padding:8px 16px;border:1px solid var(--glass-border);border-radius:var(--border-radius-pill);background:var(--glass-bg);color:var(--text-primary);font-size:0.8rem;font-weight:600;cursor:pointer;font-family:inherit;transition:all var(--transition-fast);"
              @click="exportExcel"
            >📊 Excel</button>
          </div>
          <ul id="att-history-list" class="att-history-list">
            <li v-if="historyState === 'loading'" style="text-align:center;color:var(--text-tertiary);font-size:0.85rem;padding:20px 0;">
              <div class="att-spinner"></div>Cargando historial...
            </li>
            <li v-else-if="historyState === 'error'" style="text-align:center;color:var(--text-tertiary);padding:16px 0;font-size:0.85rem;">No se pudo cargar el historial.</li>
            <li v-else-if="!records.length" style="text-align:center;color:var(--text-tertiary);padding:20px 0;font-size:0.85rem;">Sin registros para este filtro.</li>
            <template v-else>
              <li v-for="(r, i) in records.slice(0, 50)" :key="i" class="att-history-item">
                <div class="att-hist-dot" :class="r.type === 'entrada' ? 'entrada' : 'salida'"></div>
                <div style="flex:1;min-width:0;">
                  <div style="font-size:0.88rem;font-weight:600;color:var(--text-primary);">
                    {{ r.type === 'entrada' ? '⬆️ Entrada' : '⬇️ Salida' }}
                  </div>
                  <div style="font-size:0.78rem;color:var(--text-secondary);">{{ r.date }}
                    <template v-if="r.class_name && r.class_name !== 'General'"> · <span style="color:var(--accent-color);">{{ r.class_name }}</span></template>
                  </div>
                </div>
                <div class="att-hist-time">{{ r.time }}</div>
              </li>
            </template>
          </ul>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// Migración de public/attendance.html y public/attendance.js: autoservicio de
// asistencia (lector de QR con la cámara, historial propio y exportación).
import { onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import MenuToggle from '@/components/MenuToggle.vue';
import AppLink from '@/components/AppLink.vue';
import { api } from '@/lib/api';
import { escapeHtml } from '@/lib/markdown';
import { currentUser } from '@/lib/session';
import { JSQR_SRC, loadGlobal, XLSX_SRC, type SheetJs } from '@/lib/cdn';

interface AttRecord {
  type: string;
  date: string;
  time: string;
  class_name?: string;
}

type JsQr = (data: Uint8ClampedArray, width: number, height: number, opts: { inversionAttempts: string }) => { data: string } | null;

const dni = currentUser.value?.dni || '';

function initials(name: string): string {
  return (
    String(name || '?')
      .trim()
      .split(' ')
      .slice(0, 2)
      .map((w) => w[0] || '')
      .join('')
      .toUpperCase() || '?'
  );
}

// ── Perfil ────────────────────────────────────────────────────────────────
const profile = reactive({ name: dni || 'Usuario', meta: 'Personal' });
const isProfessor = ref(false);
const classes = ref<{ id: number | string; name: string }[]>([]);

async function loadProfile() {
  try {
    const { ok, data } = await api.get<{ name?: string; department?: string; position?: string }>('/api/attendance/my-profile');
    if (ok) {
      profile.name = data.name || dni;
      profile.meta = [data.department, data.position].filter(Boolean).join(' · ') || 'Personal';
    }
  } catch {
    // Se queda con el DNI.
  }
  api
    .get<{ is_professor?: boolean }>('/api/check-professor-role')
    .then(({ ok, data }) => (isProfessor.value = ok && !!data.is_professor))
    .catch(() => undefined);
  api
    .get<{ classes?: { id: number | string; name: string }[] }>('/api/attendance/my-classes')
    .then(({ ok, data }) => {
      if (ok) classes.value = data.classes || [];
    })
    .catch(() => undefined);
}

// ── Historial ─────────────────────────────────────────────────────────────
const filters = reactive({ from: '', to: '', classId: '' });
const records = ref<AttRecord[]>([]);
const historyState = ref<'loading' | 'ready' | 'error'>('loading');

async function loadHistory() {
  try {
    const params = new URLSearchParams();
    if (filters.from && filters.to) {
      params.set('date_from', filters.from);
      params.set('date_to', filters.to);
    }
    if (filters.classId) params.set('class_id', filters.classId);
    const { ok, status, data } = await api.get<{ records?: AttRecord[] }>(`/api/attendance/my-history?${params}`);
    if (!ok) throw new Error(`HTTP ${status}`);
    records.value = data.records || [];
    historyState.value = 'ready';
  } catch {
    historyState.value = 'error';
  }
}

// Con solo "desde" no se filtra todavía (hace falta el rango completo).
function onDateFrom() {
  if (filters.to || !filters.from) void loadHistory();
}

function clearFilters() {
  Object.assign(filters, { from: '', to: '', classId: '' });
  void loadHistory();
}

const periodLabel = () => (filters.from && filters.to ? `${filters.from} al ${filters.to}` : 'Historial');

function exportPdf() {
  const rows = records.value;
  const label = periodLabel();
  const tbody = rows
    .map(
      (r, i) => `
        <tr>
            <td>${i + 1}</td>
            <td class="${r.type === 'entrada' ? 'entrada' : 'salida'}">${r.type === 'entrada' ? '↑ Entrada' : '↓ Salida'}</td>
            <td>${escapeHtml(r.date)}</td>
            <td>${escapeHtml(r.time)}</td>
            <td>${escapeHtml(r.class_name || 'General')}</td>
        </tr>`,
    )
    .join('');
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
        <title>Mi Asistencia ${escapeHtml(label)}</title>
        <style>
            body { font-family: Arial, sans-serif; font-size: 11px; color: #111; }
            h2 { font-size: 14px; margin-bottom: 4px; }
            p.sub { font-size: 10px; color: #555; margin: 0 0 12px; }
            table { width: 100%; border-collapse: collapse; }
            th { background: #E8DEF8; padding: 7px 8px; text-align: left; font-size: 9px; text-transform: uppercase; }
            td { padding: 6px 8px; border-bottom: 1px solid #e0e0e0; }
            tr:nth-child(even) td { background: #fafafa; }
            .entrada { color: #2E7D32; font-weight: 600; }
            .salida  { color: #B71C1C; font-weight: 600; }
        </style></head><body>
        <h2>Mi Historial de Asistencia</h2>
        <p class="sub">Período: ${escapeHtml(label)} · Total: ${rows.length} marcaciones · Generado: ${new Date().toLocaleString('es-PE')}</p>
        <table>
            <thead><tr><th>#</th><th>Tipo</th><th>Fecha</th><th>Hora</th><th>Clase</th></tr></thead>
            <tbody>${tbody}</tbody>
        </table></body></html>`;
  const win = window.open('', '_blank');
  if (!win) {
    alert('Activa las ventanas emergentes para exportar PDF.');
    return;
  }
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => {
    win.print();
    win.close();
  }, 400);
}

async function exportExcel() {
  let XLSX: SheetJs;
  try {
    XLSX = await loadGlobal<SheetJs>('XLSX', XLSX_SRC);
  } catch {
    alert('Librería cargando, reintenta.');
    return;
  }
  const label = periodLabel();
  const ws = XLSX.utils.aoa_to_sheet([
    [`Mi Asistencia — ${label}`],
    [],
    ['#', 'Tipo', 'Fecha', 'Hora', 'Clase'],
    ...records.value.map((r, i) => [i + 1, r.type, r.date, r.time, r.class_name || 'General']),
  ]);
  ws['!cols'] = [{ wch: 4 }, { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 22 }];
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 4 } }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Mi Asistencia');
  XLSX.writeFile(wb, `mi_asistencia_${filters.from && filters.to ? `${filters.from}_${filters.to}` : 'historial'}.xlsx`);
}

// ── Cámara y lectura del QR ───────────────────────────────────────────────
const videoEl = ref<HTMLVideoElement | null>(null);
const canvasEl = ref<HTMLCanvasElement | null>(null);
const scanning = ref(false);
const scanStatus = ref('Cámara inactiva');
const result = ref<{ icon: string; title: string; sub: string } | null>(null);
let stream: MediaStream | null = null;
let rafId: number | null = null;
let processing = false;
let jsQR: JsQr | null = null;

function stopScan() {
  if (rafId) cancelAnimationFrame(rafId);
  rafId = null;
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  if (scanning.value) scanStatus.value = 'Cámara detenida';
  scanning.value = false;
}

async function toggleScan() {
  if (scanning.value) {
    stopScan();
    return;
  }
  scanStatus.value = 'Activando cámara...';
  try {
    jsQR ??= await loadGlobal<JsQr>('jsQR', JSQR_SRC);
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    const video = videoEl.value;
    if (!video) return stopScan();
    video.srcObject = stream;
    await video.play();
    scanning.value = true;
    scanStatus.value = 'Escaneando... apunta al QR';
    tick();
  } catch {
    stopScan();
    scanStatus.value = '❌ Sin acceso a la cámara. Verifica los permisos.';
  }
}

function tick() {
  const video = videoEl.value;
  const canvas = canvasEl.value;
  if (!video || !canvas || !scanning.value || !jsQR) return;
  if (video.readyState < 2) {
    rafId = requestAnimationFrame(tick);
    return;
  }
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
  if (code?.data) {
    stopScan();
    void record(code.data);
  } else {
    rafId = requestAnimationFrame(tick);
  }
}

async function record(raw: string) {
  if (processing) return;
  processing = true;
  result.value = { icon: '⏳', title: 'Registrando...', sub: 'Por favor espera...' };
  // El QR trae el token tal cual o un JSON { token } / { session_id }.
  let token = raw;
  try {
    const parsed = JSON.parse(raw) as { token?: string; session_id?: string };
    token = parsed.token || parsed.session_id || raw;
  } catch {
    // No es JSON: es el token.
  }
  try {
    const { ok, data } = await api.post<{ success?: boolean; type?: string; time?: string; date?: string; error?: string }>('/api/attendance/record', {
      qr_token: token,
    });
    if (ok && data.success) {
      const tipo = data.type === 'entrada' ? '⬆️ Entrada' : '⬇️ Salida';
      result.value = { icon: data.type === 'entrada' ? '✅' : '✔️', title: `${tipo} registrada`, sub: `${data.time || ''} · ${data.date || ''}` };
      void loadHistory();
    } else {
      const notStaff = !!data.error?.includes('no estás registrado');
      result.value = notStaff
        ? {
            icon: '⚠️',
            title: 'No registrado como personal',
            sub: 'Tu usuario existe pero no has sido dado de alta en el sistema de asistencia. Contacta al administrador.',
          }
        : { icon: '❌', title: 'Error al registrar', sub: data.error || 'Token inválido o expirado' };
    }
  } catch {
    result.value = { icon: '⚠️', title: 'Sin conexión', sub: 'Verifica tu red e inténtalo de nuevo.' };
  } finally {
    processing = false;
  }
}

onMounted(() => {
  void loadProfile();
  void loadHistory();
});

onBeforeUnmount(stopScan);
</script>

<style>
/* CSS propio de la página antigua, limitado a ella (ver router: meta.page). */
/* ══════════════════════════════════════════════
 DISTRIBUCIÓN DE LA PÁGINA
 ══════════════════════════════════════════════
 En móvil todo va en una única columna. En escritorio la página se
 parte en dos: a la izquierda la identidad, el escáner y el resultado
 (bloques estrechos y de altura fija) y a la derecha el historial, que
 es el bloque que crece. Así se aprovecha el ancho y la página deja de
 ser una tira vertical de más de dos pantallas. */
:where(body[data-page="attendance"]) .att-layout {
  max-width: 560px;
  margin: 0 auto;
  padding: 0 20px 60px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

:where(body[data-page="attendance"]) .att-col {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}

@media (min-width: 1024px) {
  :where(body[data-page="attendance"]) .att-layout {
    max-width: 1120px;
    display: grid;
    grid-template-columns: minmax(0, 400px) minmax(0, 1fr);
    gap: 20px;
    align-items: start;
  }
}

/* Hero más discreto: en escritorio ocupaba casi media pantalla */
:where(body[data-page="attendance"]) .courses-hero {
  padding: 28px 20px 18px;
}

:where(body[data-page="attendance"]) .courses-hero h1 {
  font-size: clamp(1.6rem, 3.2vw, 2.1rem);
}

:where(body[data-page="attendance"]) .att-user-card {
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  border-radius: var(--border-radius-lg);
  padding: 16px 20px;
  display: flex;
  align-items: center;
  gap: 14px;
  box-shadow: var(--glass-shadow);
}

:where(body[data-page="attendance"]) .att-avatar {
  width: 46px;
  height: 46px;
  border-radius: 50%;
  background: var(--accent-gradient);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.3rem;
  font-weight: 700;
  color: white;
  flex-shrink: 0;
  text-transform: uppercase;
}

:where(body[data-page="attendance"]) .att-user-name {
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--text-primary);
}

:where(body[data-page="attendance"]) .att-user-meta {
  font-size: 0.82rem;
  color: var(--text-secondary);
  margin-top: 2px;
}

:where(body[data-page="attendance"]) .qr-scan-card {
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  border-radius: var(--border-radius-lg);
  padding: 22px;
  text-align: center;
  box-shadow: var(--glass-shadow);
}

:where(body[data-page="attendance"]) .qr-video-wrap {
  position: relative;
  width: 100%;
  max-width: 260px;
  margin: 0 auto 14px;
  border-radius: var(--border-radius-md);
  overflow: hidden;
  border: 2px solid var(--glass-border);
  background: #000;
  aspect-ratio: 1;
}

:where(body[data-page="attendance"]) #qr-video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

:where(body[data-page="attendance"]) .qr-scan-line {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: var(--accent-gradient);
  animation: scanLine 2s linear infinite;
  box-shadow: 0 0 8px var(--accent-glow);
}

@keyframes scanLine {
  0% {
    top: 0
  }

  50% {
    top: calc(100% - 3px)
  }

  100% {
    top: 0
  }
}

:where(body[data-page="attendance"]) .att-result-card {
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  border-radius: var(--border-radius-lg);
  padding: 22px;
  text-align: center;
  box-shadow: var(--glass-shadow);
  display: none;
}

:where(body[data-page="attendance"]) .att-result-icon {
  font-size: 2.8rem;
  margin-bottom: 10px;
}

:where(body[data-page="attendance"]) .att-result-title {
  font-size: 1.3rem;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 6px;
}

:where(body[data-page="attendance"]) .att-result-sub {
  font-size: 0.9rem;
  color: var(--text-secondary);
}

:where(body[data-page="attendance"]) .att-history-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

:where(body[data-page="attendance"]) .att-history-item {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 10px 0;
  border-bottom: 1px solid var(--glass-border);
}

/* El historial es el bloque alto de la columna derecha: se le limita la
 altura y se hace desplazable para que no estire la página entera. */
:where(body[data-page="attendance"]) .att-history-card {
  cursor: default;
}

:where(body[data-page="attendance"]) .att-history-card:hover {
  transform: none;
  border-color: var(--glass-border);
  box-shadow: var(--glass-shadow);
}

:where(body[data-page="attendance"]) .att-history-card::before {
  display: none;
}

@media (min-width: 1024px) {
  :where(body[data-page="attendance"]) .att-history-list {
    max-height: 46vh;
    overflow-y: auto;
    padding-right: 4px;
  }
}

:where(body[data-page="attendance"]) .att-history-item:last-child {
  border-bottom: none;
}

:where(body[data-page="attendance"]) .att-hist-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

:where(body[data-page="attendance"]) .att-hist-dot.entrada {
  background: #386A20;
}

:where(body[data-page="attendance"]) .att-hist-dot.salida {
  background: #D00000;
}

:where(body[data-page="attendance"]) .att-hist-time {
  font-size: 0.82rem;
  color: var(--text-tertiary);
  margin-left: auto;
  white-space: nowrap;
}

:where(body[data-page="attendance"]) .att-spinner {
  width: 28px;
  height: 28px;
  border: 3px solid var(--glass-border);
  border-top-color: var(--accent-color);
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
  margin: 0 auto 12px;
}

@keyframes spin {
  to {
    transform: rotate(360deg)
  }
}
</style>
