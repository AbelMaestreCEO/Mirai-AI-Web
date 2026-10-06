<template>
  <header class="header">
    <MenuToggle />
    <div class="header-title">Admin — Control de Asistencia</div>
  </header>

  <div class="courses-container">
    <div class="courses-hero">
      <h1>Admin — Control de Asistencia</h1>
      <p>Gestiona clases, genera QRs por clase, administra el personal y exporta los registros.</p>
    </div>

    <div id="att-stats" class="att-stats">
      <div class="stat-card">
        <div class="stat-icon">👥</div>
        <div class="stat-content"><span class="stat-label">Personal Registrado</span><span id="st-staff" class="stat-value">{{ stats.total_staff ?? '—' }}</span></div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">📅</div>
        <div class="stat-content"><span class="stat-label">Registros Hoy</span><span id="st-today" class="stat-value">{{ stats.total_today ?? '—' }}</span></div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">⬆️</div>
        <div class="stat-content"><span class="stat-label">Entradas Hoy</span><span id="st-entries" class="stat-value">{{ stats.total_entries ?? '—' }}</span></div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">⬇️</div>
        <div class="stat-content"><span class="stat-label">Salidas Hoy</span><span id="st-exits" class="stat-value">{{ stats.total_exits ?? '—' }}</span></div>
      </div>
    </div>

    <div class="att-tabs">
      <button id="tab-btn-records" class="att-tab-btn" :class="{ active: tab === 'records' }" @click="tab = 'records'">📋 Registros</button>
      <button id="tab-btn-classes" class="att-tab-btn" :class="{ active: tab === 'classes' }" @click="openClassesTab">🏫 Clases</button>
    </div>

    <!-- ══════════ TAB: REGISTROS ══════════ -->
    <div v-show="tab === 'records'" id="tab-pane-records">
      <div class="att-filters">
        <div style="display:flex;gap:12px;flex:1;min-width:0;flex-wrap:wrap;">
          <div class="form-group" style="flex:1;min-width:110px;margin-bottom:0;">
            <label for="f-date">Fecha exacta</label>
            <input id="f-date" v-model="filters.date" type="date" @change="onDateChange">
          </div>
          <div class="form-group" style="flex:1;min-width:110px;margin-bottom:0;">
            <label for="f-date-from">Desde</label>
            <input id="f-date-from" v-model="filters.from" type="date" @change="onRangeChange">
          </div>
          <div class="form-group" style="flex:1;min-width:110px;margin-bottom:0;">
            <label for="f-date-to">Hasta</label>
            <input id="f-date-to" v-model="filters.to" type="date" @change="onRangeChange">
          </div>
          <div class="form-group" style="flex:1;min-width:110px;margin-bottom:0;">
            <label for="f-type">Tipo</label>
            <select id="f-type" v-model="filters.type">
              <option value="todos">Todos</option>
              <option value="entrada">Entradas</option>
              <option value="salida">Salidas</option>
            </select>
          </div>
          <div class="form-group" style="flex:1;min-width:140px;margin-bottom:0;">
            <label for="f-class">Clase</label>
            <select id="f-class" v-model="filters.classId" @change="loadRecords">
              <option value="">{{ classes.length ? 'Todas las clases' : 'Todas' }}</option>
              <option v-for="c in classes" :key="c.id" :value="String(c.id)">{{ c.name }}</option>
            </select>
          </div>
        </div>
        <div class="form-group" style="flex:2;min-width:200px;margin-bottom:0;">
          <label for="f-search">Buscar personal</label>
          <div class="courses-search" style="min-width:unset;">
            <svg viewBox="0 0 24 24">
              <path
                d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"
              />
            </svg>
            <input id="f-search" v-model="searchInput" type="text" placeholder="Nombre o DNI..." autocomplete="off">
          </div>
        </div>
      </div>

      <div id="att-count" class="courses-count">Mostrando {{ visibleRecords.length }} registro{{ visibleRecords.length !== 1 ? 's' : '' }}</div>
      <div class="att-actions">
        <button id="btn-excel" class="btn-export primary" @click="exportExcel">📊 Excel</button>
        <button id="btn-csv" class="btn-export" @click="exportCsv">📄 CSV</button>
        <button id="btn-pdf" class="btn-export" @click="exportPdf">🖨️ PDF</button>
      </div>

      <div class="att-table-wrap">
        <table v-show="visibleRecords.length" id="att-table" class="att-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Personal</th>
              <th>DNI</th>
              <th>Tipo</th>
              <th>Hora</th>
              <th>Fecha</th>
              <th>Departamento</th>
              <th>Clase</th>
              <th>QR sesión</th>
            </tr>
          </thead>
          <tbody id="att-tbody">
            <tr v-for="(r, i) in visibleRecords" :key="i">
              <td style="color:var(--text-tertiary);font-size:0.8rem;">{{ i + 1 }}</td>
              <td>
                <div class="tbl-avatar">
                  <div class="tbl-av-circle">{{ initials(r.staff_name || r.staff_dni) }}</div>
                  <span>{{ r.staff_name || '—' }}</span>
                </div>
              </td>
              <td style="color:var(--text-secondary);font-size:0.83rem;">{{ r.staff_dni || '—' }}</td>
              <td><span class="type-badge" :class="r.type">{{ r.type === 'entrada' ? '⬆️ Entrada' : '⬇️ Salida' }}</span></td>
              <td style="font-size:0.83rem;">{{ r.time || '—' }}</td>
              <td style="font-size:0.83rem;color:var(--text-secondary);">{{ r.date || '—' }}</td>
              <td style="font-size:0.83rem;color:var(--text-secondary);">{{ r.department || '—' }}</td>
              <td style="font-size:0.83rem;color:var(--text-secondary);">{{ r.class_name || '—' }}</td>
              <td style="font-size:0.75rem;color:var(--text-tertiary);max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" :title="r.session_id || ''">
                {{ (r.session_id || '').slice(0, 12) }}...
              </td>
            </tr>
          </tbody>
        </table>
        <div id="att-empty" class="att-empty" :class="{ hidden: visibleRecords.length > 0 }">
          <div class="att-empty-icon">📋</div>
          <p>No hay registros para este filtro.</p>
        </div>
      </div>
    </div>

    <!-- ══════════ TAB: CLASES ══════════ -->
    <div v-show="tab === 'classes'" id="tab-pane-classes">
      <div style="padding:0 20px 16px;max-width:1200px;margin:0 auto;display:flex;justify-content:flex-end;">
        <button id="btn-new-class" class="course-start-btn" style="max-width:200px;" @click="openClassModal(null)">🏫 Nueva Clase</button>
      </div>
      <div id="classes-grid" class="classes-grid">
        <div v-if="classesState === 'loading'" class="att-empty">
          <div class="att-spinner"></div>
          <p>Cargando clases...</p>
        </div>
        <div v-else-if="classesState === 'error'" class="att-empty"><div class="att-empty-icon">⚠️</div><p>Sin conexión</p></div>
        <div v-else-if="!classes.length" class="att-empty">
          <div class="att-empty-icon">🏫</div>
          <p>No hay clases creadas.<br>Crea la primera con el botón "Nueva Clase".</p>
        </div>
        <template v-else>
          <div v-for="c in classes" :key="c.id" class="class-card">
            <div class="class-card-header">
              <div class="class-icon">🏫</div>
              <div style="flex:1;min-width:0;">
                <div class="class-name">{{ c.name }}</div>
                <div v-if="c.description" class="class-desc">{{ c.description }}</div>
              </div>
            </div>
            <div class="class-meta">
              <span>👤 {{ c.student_count ?? 0 }} estudiantes</span>
            </div>
            <div class="class-actions">
              <button class="btn-export" @click="openClassQr(c)">📷 QR</button>
              <button class="btn-export" @click="openClassStudents(c)">👥 Estudiantes</button>
              <button class="btn-export" @click="openClassModal(c)">✏️</button>
              <button class="btn-export" style="color:#D00000;" @click="deleteClass(c)">🗑️</button>
            </div>
          </div>
        </template>
      </div>
    </div>
  </div>

  <!-- MODAL: Nueva / Editar Clase -->
  <div id="class-modal" class="modal" :style="{ display: classModal.open ? 'flex' : 'none' }">
    <div class="modal-overlay" @click="classModal.open = false"></div>
    <div class="modal-content slide-up">
      <button id="class-modal-close" class="modal-close" @click="classModal.open = false">&times;</button>
      <div class="modal-header">
        <h2 id="class-modal-title">{{ classModal.editId ? '✏️ Editar Clase' : '🏫 Nueva Clase' }}</h2>
      </div>
      <div class="form-group">
        <label for="cls-name">Nombre de la clase *</label>
        <input id="cls-name" v-model="classModal.name" type="text" placeholder="Ej: Matemáticas 3°A">
      </div>
      <div class="form-group">
        <label for="cls-desc">Descripción (opcional)</label>
        <input id="cls-desc" v-model="classModal.description" type="text" placeholder="Ej: Turno mañana">
      </div>
      <div class="modal-actions">
        <button id="cls-cancel-btn" class="btn-secondary" @click="classModal.open = false">Cancelar</button>
        <button id="cls-save-btn" class="btn-primary" :disabled="classModal.saving" @click="saveClass">Guardar</button>
      </div>
      <div id="cls-status" class="status-message" style="color:#D00000;">{{ classModal.status }}</div>
    </div>
  </div>

  <!-- MODAL: QR de clase -->
  <div id="class-qr-modal" class="modal" :style="{ display: qrModal.open ? 'flex' : 'none' }">
    <div class="modal-overlay" @click="qrModal.open = false"></div>
    <div class="modal-content slide-up">
      <button id="class-qr-modal-close" class="modal-close" @click="qrModal.open = false">&times;</button>
      <div class="modal-header">
        <h2 id="class-qr-modal-title">📷 QR — {{ qrModal.className }}</h2>
      </div>
      <div class="qr-display-wrap">
        <div id="class-qr-img-box" class="qr-img-box" style="min-width:160px;min-height:160px;">
          <div v-if="qrModal.state === 'loading'" class="att-spinner"></div>
          <p v-else-if="qrModal.state === 'error'" style="color:#D00000;font-size:0.82rem;">{{ qrModal.error }}</p>
          <div v-show="qrModal.state === 'ready'" id="class-qr-canvas-wrap" ref="qrWrap"></div>
        </div>
        <div class="qr-info">
          <p class="qr-meta-row">📅 Fecha: <strong id="class-qr-date">{{ qrModal.data?.date || filters.date }}</strong></p>
          <p class="qr-meta-row">⏰ Válido hasta: <strong id="class-qr-expires">{{ qrModal.data?.expires_at || '23:59' }}</strong></p>
          <p class="qr-meta-row">🔢 Escaneos: <strong id="class-qr-scans">{{ qrModal.data?.scan_count ?? 0 }}</strong></p>
          <div id="class-qr-token" class="qr-token-box">{{ qrModal.data?.token || '—' }}</div>
          <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:16px;">
            <button id="btn-gen-class-qr" class="course-start-btn" style="flex:1;max-width:180px;" @click="generateClassQr">🔄 Nuevo
              QR</button>
            <button id="btn-download-class-qr" class="btn-export" @click="downloadClassQr">📥 Descargar</button>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- MODAL: Estudiantes de clase -->
  <div id="class-students-modal" class="modal" :style="{ display: studentsModal.open ? 'flex' : 'none' }">
    <div class="modal-overlay" @click="studentsModal.open = false"></div>
    <div class="modal-content slide-up">
      <button id="class-students-modal-close" class="modal-close" @click="studentsModal.open = false">&times;</button>
      <div class="modal-header">
        <h2 id="class-students-title">👥 Estudiantes — {{ studentsModal.className }}</h2>
      </div>
      <div style="display:flex;gap:6px;margin-bottom:14px;">
        <button id="add-mode-btn-dni" class="att-tab-btn" :class="{ active: studentsModal.mode === 'dni' }" style="font-size:0.8rem;padding:7px 16px;" @click="setAddMode('dni')">👤
          Por DNI</button>
        <button id="add-mode-btn-section" class="att-tab-btn" :class="{ active: studentsModal.mode === 'section' }" style="font-size:0.8rem;padding:7px 16px;" @click="setAddMode('section')">📚 Por
          Sección</button>
      </div>
      <div v-show="studentsModal.mode === 'dni'" id="add-mode-pane-dni">
        <div class="form-group" style="margin-bottom:8px;">
          <label for="add-student-dni">Agregar por DNI</label>
          <div style="display:flex;gap:10px;">
            <input id="add-student-dni" v-model="studentsModal.dni" type="text" placeholder="DNI del personal" style="flex:1;" @keydown.enter="addStudent">
            <button id="add-student-btn" class="btn-primary" style="white-space:nowrap;padding:12px 18px;" :disabled="studentsModal.busy" @click="addStudent">Agregar</button>
          </div>
        </div>
      </div>
      <div v-show="studentsModal.mode === 'section'" id="add-mode-pane-section">
        <div class="form-group" style="margin-bottom:8px;">
          <label for="add-section-select">Seleccionar Sección del Aula</label>
          <div style="display:flex;gap:10px;">
            <select id="add-section-select" v-model="studentsModal.sectionId" style="flex:1;">
              <option v-if="studentsModal.sections === null" value="">Cargando secciones...</option>
              <option v-else-if="studentsModal.sectionsError" value="">Error al cargar</option>
              <option v-else-if="!studentsModal.sections.length" value="">Sin secciones disponibles</option>
              <template v-else>
                <option value="">— Elige una sección —</option>
                <option v-for="s in studentsModal.sections" :key="s.id" :value="String(s.id)">{{ s.name }} ({{ s.student_count ?? 0 }} est.)</option>
              </template>
            </select>
            <button id="add-section-btn" class="btn-primary" style="white-space:nowrap;padding:12px 18px;" :disabled="studentsModal.busy" @click="addSection">Agregar</button>
          </div>
        </div>
      </div>
      <div id="add-student-status" class="status-message" style="margin-bottom:12px;font-size:0.83rem;" :style="{ color: studentsModal.status.color }">{{ studentsModal.status.text }}</div>
      <div id="class-students-list" style="max-height:300px;overflow-y:auto;">
        <div v-if="studentsModal.state === 'loading'" style="text-align:center;padding:20px;"><div class="att-spinner" style="margin:0 auto;"></div></div>
        <p v-else-if="studentsModal.state === 'error'" style="text-align:center;color:#D00000;font-size:0.85rem;padding:20px 0;">Error al cargar.</p>
        <p v-else-if="!studentsModal.students.length" style="text-align:center;color:var(--text-tertiary);font-size:0.85rem;padding:20px 0;">Sin estudiantes asignados.</p>
        <template v-else>
          <div v-for="s in studentsModal.students" :key="s.dni" class="student-item">
            <div class="tbl-av-circle" style="width:36px;height:36px;font-size:0.82rem;">{{ initials(s.name) }}</div>
            <div style="flex:1;min-width:0;">
              <div style="font-size:0.88rem;font-weight:600;color:var(--text-primary);">{{ s.name }}</div>
              <div style="font-size:0.78rem;color:var(--text-secondary);">{{ s.dni }} · {{ s.department || '—' }}</div>
            </div>
            <button class="btn-export" style="color:#D00000;padding:6px 12px;font-size:0.78rem;" @click="removeStudent(s.dni)">✕</button>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// Migración de public/attendance_admin.html y public/attendance_admin.js:
// registros de asistencia con filtros y exportación (Excel, CSV, PDF),
// clases con su QR del día y sus estudiantes. Se refresca cada 30 s.
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import MenuToggle from '@/components/MenuToggle.vue';
import { api, errorMessage } from '@/lib/api';
import { escapeHtml } from '@/lib/markdown';
import { QRCODE_SRC, XLSX_SRC, loadGlobal, type SheetJs } from '@/lib/cdn';

type Id = number | string;

interface AttRecord {
  staff_name?: string;
  staff_dni?: string;
  type?: string;
  time?: string;
  date?: string;
  department?: string;
  position?: string;
  class_name?: string;
  session_id?: string;
}

interface AttClass {
  id: Id;
  name: string;
  description?: string;
  student_count?: number;
}

interface QrData {
  token: string;
  session_id?: string;
  id?: Id;
  date?: string;
  expires_at?: string;
  scan_count?: number;
}

type QRCodeCtor = (new (el: HTMLElement, opts: object) => unknown) & { CorrectLevel: { H: number } };

const API_CLASSES = '/api/attendance/admin/classes';
const todayISO = () => new Date().toISOString().split('T')[0]!;

const tab = ref<'records' | 'classes'>('records');

function initials(name?: string): string {
  return (name || '?')
    .trim()
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0] ?? '')
    .join('')
    .toUpperCase();
}

// ── Estadísticas ──────────────────────────────────────────────────────────
const stats = reactive<{ total_staff?: number; total_today?: number; total_entries?: number; total_exits?: number }>({});

async function loadStats() {
  try {
    const { data } = await api.get<typeof stats>(`/api/attendance/admin/stats?date=${encodeURIComponent(filters.date)}`);
    Object.assign(stats, data);
  } catch {
    // Sin conexión: se mantiene lo anterior.
  }
}

// ── Registros ─────────────────────────────────────────────────────────────
const filters = reactive({ date: todayISO(), from: '', to: '', type: 'todos', classId: '' });
const records = ref<AttRecord[]>([]);
const searchInput = ref('');
const query = ref('');
let searchTimer: number | undefined;
watch(searchInput, (v) => {
  clearTimeout(searchTimer);
  searchTimer = window.setTimeout(() => (query.value = v.trim().toLowerCase()), 200);
});

async function loadRecords() {
  try {
    const params = new URLSearchParams();
    if (filters.from && filters.to) {
      params.set('date_from', filters.from);
      params.set('date_to', filters.to);
    } else {
      params.set('date', filters.date);
    }
    if (filters.type !== 'todos') params.set('type', filters.type);
    if (filters.classId) params.set('class_id', filters.classId);
    const { data } = await api.get<{ records?: AttRecord[] }>(`/api/attendance/admin/records?${params}`);
    records.value = data.records || [];
  } catch {
    records.value = [];
  }
}

// La fecha exacta anula el rango.
function onDateChange() {
  filters.from = '';
  filters.to = '';
  void loadRecords();
  void loadStats();
}

function onRangeChange() {
  if (filters.from && filters.to) void loadRecords();
}

const visibleRecords = computed(() => {
  const q = query.value;
  return records.value.filter((r) => {
    if (filters.type !== 'todos' && r.type !== filters.type) return false;
    if (q && !String(r.staff_name || '').toLowerCase().includes(q) && !String(r.staff_dni || '').includes(q)) return false;
    return true;
  });
});

const periodLabel = () => (filters.from && filters.to ? `${filters.from} al ${filters.to}` : filters.date);
const fileLabel = () => (filters.from && filters.to ? `${filters.from}_${filters.to}` : filters.date);

function exportCsv() {
  const head = ['#', 'Nombre', 'DNI', 'Tipo', 'Hora', 'Fecha', 'Departamento', 'Cargo', 'Clase', 'QR Sesión'];
  const lines = [
    head,
    ...visibleRecords.value.map((r, i) => [
      i + 1,
      r.staff_name || '',
      r.staff_dni || '',
      r.type || '',
      r.time || '',
      r.date || '',
      r.department || '',
      r.position || '',
      r.class_name || '',
      r.session_id || '',
    ]),
  ];
  const csv = lines.map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `asistencia_${fileLabel()}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function exportExcel() {
  let XLSX: SheetJs;
  try {
    XLSX = await loadGlobal<SheetJs>('XLSX', XLSX_SRC);
  } catch {
    alert('Librería de Excel cargando, reintenta.');
    return;
  }
  const ws = XLSX.utils.aoa_to_sheet([
    [`Reporte de Asistencia — ${periodLabel()}`],
    [],
    ['#', 'Nombre', 'DNI', 'Tipo', 'Hora', 'Fecha', 'Departamento', 'Cargo', 'Clase', 'QR Sesión'],
    ...visibleRecords.value.map((r, i) => [i + 1, r.staff_name, r.staff_dni, r.type, r.time, r.date, r.department, r.position, r.class_name || '', r.session_id]),
  ]);
  ws['!cols'] = [{ wch: 4 }, { wch: 28 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 20 }, { wch: 18 }, { wch: 20 }, { wch: 16 }];
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 9 } }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Asistencia');
  XLSX.writeFile(wb, `asistencia_${fileLabel()}.xlsx`);
}

function exportPdf() {
  const rows = visibleRecords.value;
  const label = periodLabel();
  const cell = (v?: string) => escapeHtml(v || '—');
  const tbody = rows
    .map(
      (r, i) => `
        <tr>
            <td>${i + 1}</td>
            <td>${cell(r.staff_name)}</td>
            <td>${cell(r.staff_dni)}</td>
            <td>${r.type === 'entrada' ? '↑ Entrada' : '↓ Salida'}</td>
            <td>${cell(r.time)}</td>
            <td>${cell(r.date)}</td>
            <td>${cell(r.department)}</td>
            <td>${cell(r.class_name)}</td>
        </tr>`,
    )
    .join('');
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
        <title>Asistencia ${escapeHtml(label)}</title>
        <style>
            body { font-family: Arial, sans-serif; font-size: 11px; color: #111; }
            h2 { font-size: 14px; margin-bottom: 4px; }
            p.sub { font-size: 10px; color: #555; margin: 0 0 12px; }
            table { width: 100%; border-collapse: collapse; }
            th { background: #E8DEF8; padding: 7px 8px; text-align: left; font-size: 9px; text-transform: uppercase; letter-spacing: 0.04em; }
            td { padding: 6px 8px; border-bottom: 1px solid #e0e0e0; }
            tr:nth-child(even) td { background: #fafafa; }
            .entrada { color: #2E7D32; font-weight: 600; }
            .salida  { color: #B71C1C; font-weight: 600; }
        </style></head><body>
        <h2>Reporte de Asistencia — ${escapeHtml(label)}</h2>
        <p class="sub">Generado: ${new Date().toLocaleString('es-PE')} · Total: ${rows.length} registros</p>
        <table><thead><tr><th>#</th><th>Nombre</th><th>DNI</th><th>Tipo</th><th>Hora</th><th>Fecha</th><th>Departamento</th><th>Clase</th></tr></thead><tbody>${tbody}</tbody></table>
        </body></html>`;
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

// ── Clases ────────────────────────────────────────────────────────────────
const classes = ref<AttClass[]>([]);
const classesState = ref<'loading' | 'ready' | 'error'>('loading');

async function loadClasses() {
  try {
    const { data } = await api.get<{ classes?: AttClass[] }>(API_CLASSES);
    classes.value = data.classes || [];
    classesState.value = 'ready';
  } catch {
    classesState.value = 'error';
  }
}

function openClassesTab() {
  tab.value = 'classes';
  classesState.value = 'loading';
  void loadClasses();
}

const classModal = reactive({ open: false, editId: null as Id | null, name: '', description: '', status: '', saving: false });

function openClassModal(c: AttClass | null) {
  Object.assign(classModal, { open: true, editId: c?.id ?? null, name: c?.name ?? '', description: c?.description ?? '', status: '' });
}

async function saveClass() {
  const name = classModal.name.trim();
  if (!name) {
    classModal.status = '⚠️ El nombre es obligatorio';
    return;
  }
  classModal.saving = true;
  try {
    const body = { name, description: classModal.description.trim() };
    const { ok, data } = classModal.editId
      ? await api.put<{ success?: boolean; id?: Id; error?: string }>(`${API_CLASSES}/${classModal.editId}`, body)
      : await api.post<{ success?: boolean; id?: Id; error?: string }>(API_CLASSES, body);
    if (ok && (data.success || data.id)) {
      classModal.open = false;
      void loadClasses();
    } else {
      classModal.status = `❌ ${errorMessage(data, 'Error al guardar')}`;
    }
  } catch {
    classModal.status = '❌ Sin conexión';
  } finally {
    classModal.saving = false;
  }
}

async function deleteClass(c: AttClass) {
  if (!confirm(`¿Eliminar la clase "${c.name}"? Los registros de asistencia se conservarán.`)) return;
  try {
    const { ok } = await api.delete(`${API_CLASSES}/${c.id}`);
    if (ok) void loadClasses();
  } catch {
    alert('Sin conexión.');
  }
}

// ── QR de clase ───────────────────────────────────────────────────────────
const qrModal = reactive({ open: false, classId: null as Id | null, className: '', state: 'loading' as 'loading' | 'ready' | 'error', error: '', data: null as QrData | null });
const qrWrap = ref<HTMLElement | null>(null);

async function drawQr(data: QrData) {
  qrModal.data = data;
  qrModal.state = 'ready';
  await nextTick();
  const wrap = qrWrap.value;
  if (!wrap) return;
  wrap.innerHTML = '';
  try {
    const QRCode = await loadGlobal<QRCodeCtor>('QRCode', QRCODE_SRC);
    new QRCode(wrap, {
      text: JSON.stringify({ token: data.token, session_id: data.session_id || data.id }),
      width: 180,
      height: 180,
      colorDark: '#000000',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.H,
    });
  } catch {
    // Sin la librería se queda el token visible, como en el original.
  }
}

async function openClassQr(c: AttClass) {
  Object.assign(qrModal, { open: true, classId: c.id, className: c.name, state: 'loading', data: null });
  try {
    const { ok, data } = await api.get<QrData>(`${API_CLASSES}/${c.id}/qr?date=${encodeURIComponent(filters.date)}`);
    // Si aún no hay QR para hoy, se genera.
    if (ok && data.token) await drawQr(data);
    else await generateClassQr();
  } catch {
    Object.assign(qrModal, { state: 'error', error: 'Sin conexión' });
  }
}

async function generateClassQr() {
  if (!qrModal.classId) return;
  qrModal.state = 'loading';
  try {
    const { ok, data } = await api.post<QrData & { error?: string }>(`${API_CLASSES}/${qrModal.classId}/qr`, { date: filters.date });
    if (ok && data.token) await drawQr(data);
    else Object.assign(qrModal, { state: 'error', error: `Error: ${data.error || 'No se pudo generar'}` });
  } catch {
    Object.assign(qrModal, { state: 'error', error: 'Sin conexión' });
  }
}

function downloadClassQr() {
  const canvas = qrWrap.value?.querySelector('canvas');
  if (!canvas || qrModal.state !== 'ready') {
    alert('Genera el QR primero.');
    return;
  }
  const link = document.createElement('a');
  link.download = `qr-clase-${qrModal.classId}-${filters.date}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
}

// ── Estudiantes de clase ──────────────────────────────────────────────────
interface ClassStudent {
  dni: string;
  name: string;
  department?: string;
}

const studentsModal = reactive({
  open: false,
  classId: null as Id | null,
  className: '',
  mode: 'dni' as 'dni' | 'section',
  dni: '',
  sectionId: '',
  sections: null as { id: Id; name: string; student_count?: number }[] | null,
  sectionsError: false,
  state: 'loading' as 'loading' | 'ready' | 'error',
  students: [] as ClassStudent[],
  status: { text: '', color: '' },
  busy: false,
});

function setStatus(text: string, color = '#D00000') {
  studentsModal.status = { text, color };
}

function setAddMode(mode: 'dni' | 'section') {
  studentsModal.mode = mode;
  setStatus('');
}

async function loadClassStudents() {
  studentsModal.state = 'loading';
  try {
    const { data } = await api.get<{ students?: ClassStudent[] }>(`${API_CLASSES}/${studentsModal.classId}/students`);
    studentsModal.students = data.students || [];
    studentsModal.state = 'ready';
  } catch {
    studentsModal.state = 'error';
  }
}

async function loadSections() {
  studentsModal.sections = null;
  studentsModal.sectionsError = false;
  try {
    const { data } = await api.get<unknown>('/api/attendance/admin/sections');
    const list = Array.isArray(data) ? data : ((data as { sections?: unknown[] }).sections ?? []);
    studentsModal.sections = list as { id: Id; name: string; student_count?: number }[];
  } catch {
    studentsModal.sections = [];
    studentsModal.sectionsError = true;
  }
}

async function openClassStudents(c: AttClass) {
  Object.assign(studentsModal, { open: true, classId: c.id, className: c.name, dni: '', sectionId: '', students: [] });
  setAddMode('dni');
  await loadClassStudents();
  await loadSections();
}

async function addStudent() {
  const dni = studentsModal.dni.trim().toUpperCase();
  if (!dni) return setStatus('⚠️ Ingresa un DNI');
  if (!studentsModal.classId) return;
  studentsModal.busy = true;
  try {
    const { ok, data } = await api.post<{ success?: boolean; name?: string; error?: string }>(`${API_CLASSES}/${studentsModal.classId}/students`, { dni });
    if (ok && data.success) {
      studentsModal.dni = '';
      setStatus(`✅ ${data.name} agregado`, '#2E7D32');
      await loadClassStudents();
      void loadClasses();
    } else {
      setStatus(`❌ ${data.error || 'Error'}`);
    }
  } catch {
    setStatus('❌ Sin conexión');
  } finally {
    studentsModal.busy = false;
  }
}

async function addSection() {
  const sectionId = studentsModal.sectionId.trim();
  if (!sectionId) return setStatus('⚠️ Selecciona una sección');
  if (!studentsModal.classId) return;
  studentsModal.busy = true;
  setStatus('⏳ Agregando estudiantes...', 'var(--text-secondary)');
  try {
    const { ok, data } = await api.post<{ success?: boolean; added?: number; error?: string }>(`${API_CLASSES}/${studentsModal.classId}/students`, {
      section_id: sectionId,
    });
    if (ok && (data.success || data.added !== undefined)) {
      setStatus(`✅ ${data.added ?? '?'} estudiante(s) agregados desde la sección`, '#2E7D32');
      await loadClassStudents();
      void loadClasses();
    } else {
      setStatus(`❌ ${data.error || 'Error al agregar sección'}`);
    }
  } catch {
    setStatus('❌ Sin conexión');
  } finally {
    studentsModal.busy = false;
  }
}

async function removeStudent(dni: string) {
  if (!confirm(`¿Quitar a ${dni} de esta clase?`)) return;
  try {
    await api.delete(`${API_CLASSES}/${studentsModal.classId}/students/${encodeURIComponent(dni)}`);
    await loadClassStudents();
    void loadClasses();
  } catch {
    alert('Sin conexión.');
  }
}

// ── Arranque y refresco ───────────────────────────────────────────────────
let refreshTimer: number | undefined;

onMounted(() => {
  void loadStats();
  void loadRecords();
  void loadClasses();
  refreshTimer = window.setInterval(() => {
    void loadStats();
    void loadRecords();
    void loadClasses();
  }, 30_000);
});

onBeforeUnmount(() => {
  clearInterval(refreshTimer);
  clearTimeout(searchTimer);
});
</script>

<style>
/* CSS propio de la página antigua, limitado a ella (ver router: meta.page). */
/* ── Admin: estilos exclusivos ── */
/* Tabla de registros */
:where(body[data-page="attendance_admin"]) .att-table-wrap {
  overflow-x: auto;
  border-radius: var(--border-radius-lg);
  border: 1px solid var(--glass-border);
  box-shadow: var(--glass-shadow);
  margin: 0 20px 60px;
  max-width: 1200px;
  margin-left: auto;
  margin-right: auto;
}

:where(body[data-page="attendance_admin"]) .att-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.88rem;
  background: var(--glass-bg);
}

:where(body[data-page="attendance_admin"]) .att-table thead tr {
  background: var(--secondary-container);
  border-bottom: 2px solid var(--glass-border);
}

:where(body[data-page="attendance_admin"]) .att-table th {
  padding: 13px 16px;
  text-align: left;
  font-weight: 700;
  color: var(--text-primary);
  white-space: nowrap;
  font-size: 0.78rem;
  letter-spacing: 0.03em;
  text-transform: uppercase;
}

:where(body[data-page="attendance_admin"]) .att-table td {
  padding: 11px 16px;
  border-bottom: 1px solid var(--glass-border);
  color: var(--text-primary);
  vertical-align: middle;
}

:where(body[data-page="attendance_admin"]) .att-table tbody tr:last-child td {
  border-bottom: none;
}

:where(body[data-page="attendance_admin"]) .att-table tbody tr:hover {
  background: var(--surface-hover);
}

/* Stats cards — mismas que inventory */
:where(body[data-page="attendance_admin"]) .att-stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  padding: 0 20px 20px;
  max-width: 1200px;
  margin: 0 auto;
}

@media(max-width:900px) {
  :where(body[data-page="attendance_admin"]) .att-stats {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media(max-width:480px) {
  :where(body[data-page="attendance_admin"]) .att-stats {
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }
}

/* Badges de tipo */
:where(body[data-page="attendance_admin"]) .type-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 12px;
  border-radius: var(--border-radius-pill);
  font-size: 0.75rem;
  font-weight: 600;
}

:where(body[data-page="attendance_admin"]) .type-badge.entrada {
  background: rgba(56, 106, 32, 0.15);
  color: #386A20;
  border: 1px solid rgba(56, 106, 32, 0.25);
}

:where(body[data-page="attendance_admin"]) .type-badge.salida {
  background: rgba(208, 0, 0, 0.15);
  color: #D00000;
  border: 1px solid rgba(208, 0, 0, 0.25);
}

[data-theme="dark"] :where(body[data-page="attendance_admin"]) .type-badge.entrada {
  background: rgba(168, 216, 140, 0.15);
  color: #A8D88C;
}

[data-theme="dark"] :where(body[data-page="attendance_admin"]) .type-badge.salida {
  background: rgba(240, 149, 149, 0.12);
  color: #F09595;
}

/* Barra de acciones */
:where(body[data-page="attendance_admin"]) .att-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  align-items: center;
  padding: 0 20px 16px;
  max-width: 1200px;
  margin: 0 auto;
}

:where(body[data-page="attendance_admin"]) .btn-export {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  border: 1px solid var(--glass-border);
  border-radius: var(--border-radius-pill);
  background: var(--glass-bg);
  color: var(--text-primary);
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--transition-fast);
  font-family: inherit;
}

:where(body[data-page="attendance_admin"]) .btn-export:hover {
  border-color: var(--accent-color);
  color: var(--accent-color);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px var(--accent-glow);
}

:where(body[data-page="attendance_admin"]) .btn-export.primary {
  background: var(--accent-gradient);
  color: white;
  border-color: transparent;
  box-shadow: 0 4px 15px var(--accent-glow);
}

:where(body[data-page="attendance_admin"]) .btn-export.primary:hover {
  color: white;
  transform: translateY(-2px) scale(1.02);
}

/* QR Card */
:where(body[data-page="attendance_admin"]) .qr-admin-card {
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  border-radius: var(--border-radius-lg);
  padding: 28px;
  box-shadow: var(--glass-shadow);
  margin: 0 20px 20px;
  max-width: 1200px;
  margin-left: auto;
  margin-right: auto;
}

:where(body[data-page="attendance_admin"]) .qr-display-wrap {
  display: flex;
  align-items: flex-start;
  gap: 28px;
  flex-wrap: wrap;
}

/* AGREGAR: */
:where(body[data-page="attendance_admin"]) .qr-img-box {
  background: white;
  padding: 16px;
  border-radius: var(--border-radius-md);
  border: 1px solid var(--glass-border);
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 180px;
  min-height: 180px;
}

@media(max-width:600px) {
  :where(body[data-page="attendance_admin"]) .qr-display-wrap {
    justify-content: center;
  }

  :where(body[data-page="attendance_admin"]) .qr-img-box {
    margin: 0 auto;
  }
}

:where(body[data-page="attendance_admin"]) .qr-info {
  flex: 1;
  min-width: 220px;
}

:where(body[data-page="attendance_admin"]) .qr-info h3 {
  font-size: 1rem;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 8px;
}

:where(body[data-page="attendance_admin"]) .qr-meta-row {
  font-size: 0.83rem;
  color: var(--text-secondary);
  margin-bottom: 6px;
}

:where(body[data-page="attendance_admin"]) .qr-token-box {
  font-size: 0.72rem;
  word-break: break-all;
  background: var(--secondary-container);
  border-radius: var(--border-radius-sm);
  padding: 8px 12px;
  color: var(--text-tertiary);
  margin: 12px 0;
}

/* Filtros inline — reutiliza .courses-toolbar + .form-group */
/* AGREGAR: */
:where(body[data-page="attendance_admin"]) .att-filters {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  padding: 0 20px 12px;
  max-width: 1200px;
  margin: 0 auto;
  align-items: flex-end;
}

@media(max-width:600px) {
  :where(body[data-page="attendance_admin"]) .att-filters {
    flex-direction: column;
  }

  :where(body[data-page="attendance_admin"]) .att-filters>div:first-child {
    width: 100%;
  }
}

/* Avatar en tabla */
:where(body[data-page="attendance_admin"]) .tbl-avatar {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}

:where(body[data-page="attendance_admin"]) .tbl-av-circle {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--secondary-container);
  border: 1px solid var(--glass-border);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--accent-color);
  flex-shrink: 0;
  text-transform: uppercase;
}

/* Personal list */
:where(body[data-page="attendance_admin"]) .staff-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 14px;
  padding: 0 20px 24px;
  max-width: 1200px;
  margin: 0 auto;
}

/* Empty state */
:where(body[data-page="attendance_admin"]) .att-empty {
  text-align: center;
  padding: 48px 20px;
  color: var(--text-tertiary);
}

:where(body[data-page="attendance_admin"]) .att-empty-icon {
  font-size: 2.8rem;
  margin-bottom: 12px;
}

/* Spinner */
:where(body[data-page="attendance_admin"]) .att-spinner {
  width: 24px;
  height: 24px;
  border: 3px solid var(--glass-border);
  border-top-color: var(--accent-color);
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
  margin: 0 auto 8px;
}

@keyframes spin {
  to {
    transform: rotate(360deg)
  }
}

/* Responsive */
@media(max-width:768px) {
  :where(body[data-page="attendance_admin"]) .qr-display-wrap {
    flex-direction: column;
  }

  :where(body[data-page="attendance_admin"]) .att-filters {
    flex-direction: column;
  }
}

/* ── Tabs ── */
:where(body[data-page="attendance_admin"]) .att-tabs {
  display: flex;
  gap: 4px;
  padding: 0 20px 16px;
  max-width: 1200px;
  margin: 0 auto;
}

:where(body[data-page="attendance_admin"]) .att-tab-btn {
  padding: 9px 22px;
  border: 1px solid var(--glass-border);
  border-radius: var(--border-radius-pill);
  background: var(--glass-bg);
  color: var(--text-secondary);
  font-size: 0.86rem;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--transition-fast);
  font-family: inherit;
}

:where(body[data-page="attendance_admin"]) .att-tab-btn.active {
  background: var(--accent-gradient);
  color: white;
  border-color: transparent;
  box-shadow: 0 4px 12px var(--accent-glow);
}

/* ── Clase cards ── */
:where(body[data-page="attendance_admin"]) .classes-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
  padding: 0 20px 60px;
  max-width: 1200px;
  margin: 0 auto;
}

:where(body[data-page="attendance_admin"]) .class-card {
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  border-radius: var(--border-radius-lg);
  padding: 20px;
  box-shadow: var(--glass-shadow);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

:where(body[data-page="attendance_admin"]) .class-card-header {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

:where(body[data-page="attendance_admin"]) .class-icon {
  font-size: 1.8rem;
  flex-shrink: 0;
}

:where(body[data-page="attendance_admin"]) .class-name {
  font-size: 1rem;
  font-weight: 700;
  color: var(--text-primary);
  word-break: break-word;
}

:where(body[data-page="attendance_admin"]) .class-desc {
  font-size: 0.8rem;
  color: var(--text-secondary);
  margin-top: 3px;
}

:where(body[data-page="attendance_admin"]) .class-meta {
  font-size: 0.82rem;
  color: var(--text-tertiary);
}

:where(body[data-page="attendance_admin"]) .class-actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

:where(body[data-page="attendance_admin"]) .class-actions .btn-export {
  padding: 7px 12px;
  font-size: 0.78rem;
}

/* ── Student item ── */
:where(body[data-page="attendance_admin"]) .student-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid var(--glass-border);
}

:where(body[data-page="attendance_admin"]) .student-item:last-child {
  border-bottom: none;
}
</style>
