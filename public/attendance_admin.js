/**
 * attendance_admin.js — Panel Administrativo de Asistencia
 * Mirai AI · Conectado a /api/attendance/admin/*
 * v2: QR por clase, gestión de clases+estudiantes, exportación PDF/Excel con filtros
 */
'use strict';

const API = {
    activeQr: '/api/attendance/admin/active-qr',
    generateQr: '/api/attendance/admin/generate-qr',
    records: '/api/attendance/admin/records',
    stats: '/api/attendance/admin/stats',
    staff: '/api/attendance/admin/staff',
    addStaff: '/api/attendance/admin/staff',
    classes: '/api/attendance/admin/classes',
    sections: '/api/sections',
};

function authHeaders() {
    const token = localStorage.getItem('mirai_auth_token');
    return {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    };
}

function esc(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function todayISO() { return new Date().toISOString().split('T')[0]; }
function el(id) { return document.getElementById(id); }

// ── Estado global ─────────────────────────────────────────────
const state = {
    records: [],
    staff: [],
    classes: [],
    activeQr: null,
    editStaff: null,
    editClass: null,
    date: todayISO(),
    typeFilter: 'todos',
    query: '',
    classFilter: '',
    dateFrom: '',
    dateTo: '',
    activeClassId: null,   // clase actualmente abierta para ver estudiantes/QR
};

// ═══════════════════════════════════════════════════════════════
// TABS (Records / Classes)
// ═══════════════════════════════════════════════════════════════
function switchTab(tab) {
    const tabs = ['records', 'classes'];
    tabs.forEach(t => {
        const btn = el(`tab-btn-${t}`);
        const pane = el(`tab-pane-${t}`);
        if (!btn || !pane) return;
        if (t === tab) {
            btn.classList.add('active');
            pane.style.display = 'block';
        } else {
            btn.classList.remove('active');
            pane.style.display = 'none';
        }
    });
}

// ═══════════════════════════════════════════════════════════════
// QR GENERAL
// ═══════════════════════════════════════════════════════════════
async function loadActiveQr() {
    const box = el('qr-img-box');
    if (!box) return;
    try {
        const res = await fetch(API.activeQr, { credentials: 'same-origin', headers: authHeaders() });
        const data = await res.json();
        if (res.ok && data.token) {
            state.activeQr = data;
            renderQr(data);
        } else {
            await generateQr();
        }
    } catch (_) {
        box.innerHTML = '<p style="color:var(--text-tertiary);font-size:0.82rem;text-align:center;">Sin conexión</p>';
    }
}

async function generateQr() {
    const box = el('qr-img-box');
    const genBtn = el('btn-gen-qr');
    if (!box) return;
    box.innerHTML = '<div class="att-spinner"></div>';
    if (genBtn) genBtn.disabled = true;
    try {
        const res = await fetch(API.generateQr, {
            method: 'POST', credentials: 'same-origin', headers: authHeaders(),
            body: JSON.stringify({ date: state.date }),
        });
        const data = await res.json();
        if (res.ok && data.token) {
            state.activeQr = data;
            renderQr(data);
        } else {
            box.innerHTML = `<p style="color:#D00000;font-size:0.82rem;">Error: ${esc(data.error || 'No se pudo generar')}</p>`;
        }
    } catch (_) {
        box.innerHTML = '<p style="color:#D00000;font-size:0.82rem;">Sin conexión al servidor</p>';
    } finally {
        if (genBtn) genBtn.disabled = false;
    }
}

function renderQr(data, wrapperId = 'qr-img-box', labelId = 'qr-session-label',
    dateId = 'qr-date', expiresId = 'qr-expires', scansId = 'qr-scans', tokenId = 'qr-token-box') {
    const box = el(wrapperId);
    if (!box) return;
    box.innerHTML = '<div id="qr-canvas-wrap"></div>';
    const qrPayload = JSON.stringify({ token: data.token, session_id: data.session_id || data.id });
    const wrap = el('qr-canvas-wrap');
    if (window.QRCode && wrap) {
        new QRCode(wrap, {
            text: qrPayload, width: 180, height: 180,
            colorDark: '#000000', colorLight: '#ffffff',
            correctLevel: QRCode.CorrectLevel.H,
        });
    } else if (wrap) {
        wrap.innerHTML = `<p style="font-size:0.75rem;word-break:break-all;color:var(--text-tertiary);">${esc(qrPayload)}</p>`;
    }
    if (el(labelId)) el(labelId).textContent = `Sesión ${esc(data.date || state.date)}`;
    if (el(dateId)) el(dateId).textContent = esc(data.date || state.date);
    if (el(expiresId)) el(expiresId).textContent = esc(data.expires_at || '23:59');
    if (el(scansId)) el(scansId).textContent = data.scan_count ?? 0;
    if (el(tokenId)) el(tokenId).textContent = data.token;
}

function downloadQr(canvasWrapId = 'qr-canvas-wrap', label = state.date) {
    const wrap = el(canvasWrapId);
    if (!wrap) return;
    const canvas = wrap.querySelector('canvas');
    if (!canvas) { alert('Genera el QR primero.'); return; }
    const link = document.createElement('a');
    link.download = `qr-asistencia-${label}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
}

// ═══════════════════════════════════════════════════════════════
// ESTADÍSTICAS
// ═══════════════════════════════════════════════════════════════
async function loadStats() {
    try {
        const res = await fetch(`${API.stats}?date=${state.date}`, { credentials: 'same-origin', headers: authHeaders() });
        const data = await res.json();
        if (el('st-staff')) el('st-staff').textContent = data.total_staff ?? '—';
        if (el('st-today')) el('st-today').textContent = data.total_today ?? '—';
        if (el('st-entries')) el('st-entries').textContent = data.total_entries ?? '—';
        if (el('st-exits')) el('st-exits').textContent = data.total_exits ?? '—';
    } catch (_) { /* offline */ }
}

// ═══════════════════════════════════════════════════════════════
// TABLA DE REGISTROS
// ═══════════════════════════════════════════════════════════════
async function loadRecords() {
    try {
        const params = new URLSearchParams();
        if (state.dateFrom && state.dateTo) {
            params.set('date_from', state.dateFrom);
            params.set('date_to', state.dateTo);
        } else {
            params.set('date', state.date);
        }
        if (state.typeFilter !== 'todos') params.set('type', state.typeFilter);
        if (state.classFilter) params.set('class_id', state.classFilter);

        const res = await fetch(`${API.records}?${params}`, { credentials: 'same-origin', headers: authHeaders() });
        const data = await res.json();
        state.records = data.records || [];
        renderTable();
    } catch (_) {
        state.records = [];
        renderTable();
    }
}

function filteredRecords() {
    const q = state.query.toLowerCase();
    return state.records.filter(r => {
        if (state.typeFilter !== 'todos' && r.type !== state.typeFilter) return false;
        if (q && !String(r.staff_name || '').toLowerCase().includes(q) &&
            !String(r.staff_dni || '').includes(q)) return false;
        return true;
    });
}

function renderTable() {
    const tbody = el('att-tbody');
    const table = el('att-table');
    const empty = el('att-empty');
    const count = el('att-count');
    const rows = filteredRecords();

    if (count) count.textContent = `Mostrando ${rows.length} registro${rows.length !== 1 ? 's' : ''}`;
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!rows.length) {
        if (table) table.style.display = 'none';
        if (empty) empty.classList.remove('hidden');
        return;
    }
    if (table) table.style.display = '';
    if (empty) empty.classList.add('hidden');

    rows.forEach((r, i) => {
        const tr = document.createElement('tr');
        const ini = (r.staff_name || r.staff_dni || '?').trim().split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
        tr.innerHTML = `
            <td style="color:var(--text-tertiary);font-size:0.8rem;">${i + 1}</td>
            <td>
                <div class="tbl-avatar">
                    <div class="tbl-av-circle">${esc(ini)}</div>
                    <span>${esc(r.staff_name || '—')}</span>
                </div>
            </td>
            <td style="color:var(--text-secondary);font-size:0.83rem;">${esc(r.staff_dni || '—')}</td>
            <td><span class="type-badge ${r.type}">${r.type === 'entrada' ? '⬆️ Entrada' : '⬇️ Salida'}</span></td>
            <td style="font-size:0.83rem;">${esc(r.time || '—')}</td>
            <td style="font-size:0.83rem;color:var(--text-secondary);">${esc(r.date || '—')}</td>
            <td style="font-size:0.83rem;color:var(--text-secondary);">${esc(r.department || '—')}</td>
            <td style="font-size:0.83rem;color:var(--text-secondary);">${esc(r.class_name || '—')}</td>
            <td style="font-size:0.75rem;color:var(--text-tertiary);max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${esc(r.session_id || '')}">
                ${esc((r.session_id || '').slice(0, 12))}...
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// ═══════════════════════════════════════════════════════════════
// EXPORTACIÓN
// ═══════════════════════════════════════════════════════════════
function exportCSV() {
    const rows = filteredRecords();
    const head = ['#', 'Nombre', 'DNI', 'Tipo', 'Hora', 'Fecha', 'Departamento', 'Cargo', 'Clase', 'QR Sesión'];
    const lines = [head, ...rows.map((r, i) => [
        i + 1, r.staff_name || '', r.staff_dni || '', r.type || '',
        r.time || '', r.date || '', r.department || '', r.position || '', r.class_name || '', r.session_id || ''
    ])];
    const csv = lines.map(l => l.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const label = state.dateFrom && state.dateTo ? `${state.dateFrom}_${state.dateTo}` : state.date;
    a.href = url; a.download = `asistencia_${label}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function exportExcel() {
    if (typeof XLSX === 'undefined') { alert('Librería de Excel cargando, reintenta.'); return; }
    const rows = filteredRecords();
    const label = state.dateFrom && state.dateTo ? `${state.dateFrom} al ${state.dateTo}` : state.date;
    const wsData = [
        [`Reporte de Asistencia — ${label}`], [],
        ['#', 'Nombre', 'DNI', 'Tipo', 'Hora', 'Fecha', 'Departamento', 'Cargo', 'Clase', 'QR Sesión'],
        ...rows.map((r, i) => [i + 1, r.staff_name, r.staff_dni, r.type, r.time, r.date, r.department, r.position, r.class_name || '', r.session_id])
    ];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = [{ wch: 4 }, { wch: 28 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 20 }, { wch: 18 }, { wch: 20 }, { wch: 16 }];
    ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 9 } }];
    XLSX.utils.book_append_sheet(wb, ws, 'Asistencia');
    const fileLabel = state.dateFrom && state.dateTo ? `${state.dateFrom}_${state.dateTo}` : state.date;
    XLSX.writeFile(wb, `asistencia_${fileLabel}.xlsx`);
}

function exportPDF() {
    const rows = filteredRecords();
    const label = state.dateFrom && state.dateTo ? `${state.dateFrom} al ${state.dateTo}` : state.date;

    // Construir HTML para imprimir como PDF
    const thead = `<tr><th>#</th><th>Nombre</th><th>DNI</th><th>Tipo</th><th>Hora</th><th>Fecha</th><th>Departamento</th><th>Clase</th></tr>`;
    const tbody = rows.map((r, i) => `
        <tr>
            <td>${i + 1}</td>
            <td>${r.staff_name || '—'}</td>
            <td>${r.staff_dni || '—'}</td>
            <td>${r.type === 'entrada' ? '↑ Entrada' : '↓ Salida'}</td>
            <td>${r.time || '—'}</td>
            <td>${r.date || '—'}</td>
            <td>${r.department || '—'}</td>
            <td>${r.class_name || '—'}</td>
        </tr>`).join('');

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
        <title>Asistencia ${label}</title>
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
        <h2>Reporte de Asistencia — ${label}</h2>
        <p class="sub">Generado: ${new Date().toLocaleString('es-PE')} · Total: ${rows.length} registros</p>
        <table><thead>${thead}</thead><tbody>${tbody}</tbody></table>
        </body></html>`;

    const win = window.open('', '_blank');
    if (!win) { alert('Activa las ventanas emergentes para exportar PDF.'); return; }
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); win.close(); }, 400);
}

// ═══════════════════════════════════════════════════════════════
// CLASES
// ═══════════════════════════════════════════════════════════════
async function loadClasses() {
    const grid = el('classes-grid');
    if (!grid) return;
    grid.innerHTML = '<div class="att-empty"><div class="att-spinner"></div><p>Cargando clases...</p></div>';
    try {
        const res = await fetch(API.classes, { credentials: 'same-origin', headers: authHeaders() });
        const data = await res.json();
        state.classes = data.classes || [];
        renderClassesGrid();
        populateClassFilter();
    } catch (_) {
        grid.innerHTML = '<div class="att-empty"><div class="att-empty-icon">⚠️</div><p>Sin conexión</p></div>';
    }
}

function renderClassesGrid() {
    const grid = el('classes-grid');
    if (!grid) return;
    if (!state.classes.length) {
        grid.innerHTML = `<div class="att-empty"><div class="att-empty-icon">🏫</div>
            <p>No hay clases creadas.<br>Crea la primera con el botón "Nueva Clase".</p></div>`;
        return;
    }
    grid.innerHTML = state.classes.map(c => `
        <div class="class-card">
            <div class="class-card-header">
                <div class="class-icon">🏫</div>
                <div style="flex:1;min-width:0;">
                    <div class="class-name">${esc(c.name)}</div>
                    ${c.description ? `<div class="class-desc">${esc(c.description)}</div>` : ''}
                </div>
            </div>
            <div class="class-meta">
                <span>👤 ${c.student_count ?? 0} estudiantes</span>
            </div>
            <div class="class-actions">
                <button class="btn-export" onclick="openClassQr('${c.id}','${esc(c.name)}')">📷 QR</button>
                <button class="btn-export" onclick="openClassStudents('${c.id}','${esc(c.name)}')">👥 Estudiantes</button>
                <button class="btn-export" onclick="openEditClass('${c.id}','${esc(c.name)}','${esc(c.description || '')}')">✏️</button>
                <button class="btn-export" onclick="deleteClass('${c.id}','${esc(c.name)}')" style="color:#D00000;">🗑️</button>
            </div>
        </div>
    `).join('');
}

function populateClassFilter() {
    const sel = el('f-class');
    if (!sel) return;
    const current = sel.value;
    sel.innerHTML = '<option value="">Todas las clases</option>' +
        state.classes.map(c => `<option value="${c.id}"${c.id === current ? ' selected' : ''}>${esc(c.name)}</option>`).join('');
}

// ── Modal nueva/editar clase ──
function openNewClassModal() {
    state.editClass = null;
    if (el('cls-name')) el('cls-name').value = '';
    if (el('cls-desc')) el('cls-desc').value = '';
    if (el('cls-status')) el('cls-status').textContent = '';
    if (el('class-modal-title')) el('class-modal-title').textContent = '🏫 Nueva Clase';
    const m = el('class-modal');
    if (m) m.style.display = 'flex';
}

function openEditClass(id, name, desc) {
    state.editClass = id;
    if (el('cls-name')) el('cls-name').value = name;
    if (el('cls-desc')) el('cls-desc').value = desc;
    if (el('cls-status')) el('cls-status').textContent = '';
    if (el('class-modal-title')) el('class-modal-title').textContent = '✏️ Editar Clase';
    const m = el('class-modal');
    if (m) m.style.display = 'flex';
}

function closeClassModal() {
    const m = el('class-modal');
    if (m) m.style.display = 'none';
}

async function saveClass() {
    const name = (el('cls-name')?.value || '').trim();
    const desc = (el('cls-desc')?.value || '').trim();
    const status = el('cls-status');
    if (!name) {
        if (status) { status.textContent = '⚠️ El nombre es obligatorio'; status.style.color = '#D00000'; }
        return;
    }
    const btn = el('cls-save-btn');
    if (btn) btn.disabled = true;
    try {
        const url = state.editClass ? `${API.classes}/${state.editClass}` : API.classes;
        const method = state.editClass ? 'PUT' : 'POST';
        const res = await fetch(url, {
            method, credentials: 'same-origin', headers: authHeaders(),
            body: JSON.stringify({ name, description: desc }),
        });
        const data = await res.json();
        if (res.ok && (data.success || data.id)) {
            closeClassModal();
            loadClasses();
        } else {
            if (status) { status.textContent = `❌ ${esc(data.error || 'Error al guardar')}`; status.style.color = '#D00000'; }
        }
    } catch (_) {
        if (status) { status.textContent = '❌ Sin conexión'; status.style.color = '#D00000'; }
    } finally {
        if (btn) btn.disabled = false;
    }
}

async function deleteClass(id, name) {
    if (!confirm(`¿Eliminar la clase "${name}"? Los registros de asistencia se conservarán.`)) return;
    try {
        const res = await fetch(`${API.classes}/${id}`, { method: 'DELETE', credentials: 'same-origin', headers: authHeaders() });
        if (res.ok) loadClasses();
    } catch (_) { alert('Sin conexión.'); }
}

// ── Modal QR por clase ──
async function openClassQr(classId, className) {
    state.activeClassId = classId;
    const m = el('class-qr-modal');
    if (!m) return;
    if (el('class-qr-modal-title')) el('class-qr-modal-title').textContent = `📷 QR — ${className}`;
    const box = el('class-qr-img-box');
    if (box) box.innerHTML = '<div class="att-spinner"></div>';
    m.style.display = 'flex';

    try {
        const res = await fetch(`${API.classes}/${classId}/qr?date=${state.date}`, { credentials: 'same-origin', headers: authHeaders() });
        const data = await res.json();
        if (res.ok && data.token) {
            renderClassQr(data);
        } else {
            // generar automáticamente
            await generateClassQr(classId, false);
        }
    } catch (_) {
        if (el('class-qr-img-box')) el('class-qr-img-box').innerHTML = '<p style="color:#D00000;font-size:0.82rem;">Sin conexión</p>';
    }
}

async function generateClassQr(classId, showConfirm = true) {
    if (showConfirm && !state.activeClassId) return;
    const id = classId || state.activeClassId;
    const box = el('class-qr-img-box');
    if (box) box.innerHTML = '<div class="att-spinner"></div>';
    try {
        const res = await fetch(`${API.classes}/${id}/qr`, {
            method: 'POST', credentials: 'same-origin', headers: authHeaders(),
            body: JSON.stringify({ date: state.date }),
        });
        const data = await res.json();
        if (res.ok && data.token) {
            renderClassQr(data);
        } else {
            if (box) box.innerHTML = `<p style="color:#D00000;font-size:0.82rem;">Error: ${esc(data.error || 'No se pudo generar')}</p>`;
        }
    } catch (_) {
        if (box) box.innerHTML = '<p style="color:#D00000;font-size:0.82rem;">Sin conexión</p>';
    }
}

function renderClassQr(data) {
    const box = el('class-qr-img-box');
    if (!box) return;
    box.innerHTML = '<div id="class-qr-canvas-wrap"></div>';
    const qrPayload = JSON.stringify({ token: data.token, session_id: data.session_id || data.id });
    const wrap = el('class-qr-canvas-wrap');
    if (window.QRCode && wrap) {
        new QRCode(wrap, {
            text: qrPayload, width: 180, height: 180,
            colorDark: '#000000', colorLight: '#ffffff',
            correctLevel: QRCode.CorrectLevel.H,
        });
    }
    if (el('class-qr-date')) el('class-qr-date').textContent = esc(data.date || state.date);
    if (el('class-qr-expires')) el('class-qr-expires').textContent = esc(data.expires_at || '23:59');
    if (el('class-qr-scans')) el('class-qr-scans').textContent = data.scan_count ?? 0;
    if (el('class-qr-token')) el('class-qr-token').textContent = data.token;
}

function downloadClassQr() {
    const wrap = el('class-qr-canvas-wrap');
    if (!wrap) return;
    const canvas = wrap.querySelector('canvas');
    if (!canvas) { alert('Genera el QR primero.'); return; }
    const link = document.createElement('a');
    link.download = `qr-clase-${state.activeClassId}-${state.date}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
}

function closeClassQrModal() {
    const m = el('class-qr-modal');
    if (m) m.style.display = 'none';
}

// ── Modal estudiantes de clase ──
async function openClassStudents(classId, className) {
    state.activeClassId = classId;
    const m = el('class-students-modal');
    if (!m) return;
    if (el('class-students-title')) el('class-students-title').textContent = `👥 Estudiantes — ${className}`;
    m.style.display = 'flex';
    // Activar tab DNI por defecto
    switchAddMode('dni');
    await loadClassStudents(classId);
    await loadSectionsForSelect();
}

function switchAddMode(mode) {
    ['dni', 'section'].forEach(m => {
        const btn = el(`add-mode-btn-${m}`);
        const pane = el(`add-mode-pane-${m}`);
        if (btn) btn.classList.toggle('active', m === mode);
        if (pane) pane.style.display = m === mode ? 'block' : 'none';
    });
    const status = el('add-student-status');
    if (status) status.textContent = '';
}

async function loadSectionsForSelect() {
    const sel = el('add-section-select');
    if (!sel) return;
    sel.innerHTML = '<option value="">Cargando secciones...</option>';
    try {
        const res = await fetch(API.sections, { credentials: 'same-origin', headers: authHeaders() });
        const data = await res.json();
        const sections = Array.isArray(data) ? data : (data.sections || []);
        if (!sections.length) {
            sel.innerHTML = '<option value="">Sin secciones disponibles</option>';
            return;
        }
        sel.innerHTML = '<option value="">— Elige una sección —</option>' +
            sections.map(s => `<option value="${s.id}">${esc(s.name)} (${s.student_count ?? 0} est.)</option>`).join('');
    } catch (_) {
        sel.innerHTML = '<option value="">Error al cargar</option>';
    }
}

async function loadClassStudents(classId) {
    const list = el('class-students-list');
    if (!list) return;
    list.innerHTML = '<div style="text-align:center;padding:20px;"><div class="att-spinner" style="margin:0 auto;"></div></div>';
    try {
        const res = await fetch(`${API.classes}/${classId}/students`, { credentials: 'same-origin', headers: authHeaders() });
        const data = await res.json();
        const students = data.students || [];
        if (!students.length) {
            list.innerHTML = '<p style="text-align:center;color:var(--text-tertiary);font-size:0.85rem;padding:20px 0;">Sin estudiantes asignados.</p>';
            return;
        }
        list.innerHTML = students.map(s => `
            <div class="student-item">
                <div class="tbl-av-circle" style="width:36px;height:36px;font-size:0.82rem;">${esc((s.name || '?').split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase())}</div>
                <div style="flex:1;min-width:0;">
                    <div style="font-size:0.88rem;font-weight:600;color:var(--text-primary);">${esc(s.name)}</div>
                    <div style="font-size:0.78rem;color:var(--text-secondary);">${esc(s.dni)} · ${esc(s.department || '—')}</div>
                </div>
                <button class="btn-export" onclick="removeStudentFromClass('${classId}','${esc(s.dni)}')" style="color:#D00000;padding:6px 12px;font-size:0.78rem;">✕</button>
            </div>
        `).join('');
    } catch (_) {
        list.innerHTML = '<p style="text-align:center;color:#D00000;font-size:0.85rem;padding:20px 0;">Error al cargar.</p>';
    }
}

async function addStudentToClass() {
    const dni = (el('add-student-dni')?.value || '').trim().toUpperCase();
    const status = el('add-student-status');
    if (!dni) {
        if (status) { status.textContent = '⚠️ Ingresa un DNI'; status.style.color = '#D00000'; }
        return;
    }
    if (!state.activeClassId) return;
    const btn = el('add-student-btn');
    if (btn) btn.disabled = true;
    try {
        const res = await fetch(`${API.classes}/${state.activeClassId}/students`, {
            method: 'POST', credentials: 'same-origin', headers: authHeaders(),
            body: JSON.stringify({ dni }),
        });
        const data = await res.json();
        if (res.ok && data.success) {
            if (el('add-student-dni')) el('add-student-dni').value = '';
            if (status) { status.textContent = `✅ ${esc(data.name)} agregado`; status.style.color = '#2E7D32'; }
            await loadClassStudents(state.activeClassId);
            loadClasses(); // actualizar contador
        } else {
            if (status) { status.textContent = `❌ ${esc(data.error || 'Error')}`; status.style.color = '#D00000'; }
        }
    } catch (_) {
        if (status) { status.textContent = '❌ Sin conexión'; status.style.color = '#D00000'; }
    } finally {
        if (btn) btn.disabled = false;
    }
}
async function addSectionToClass() {
    const sectionId = (el('add-section-select')?.value || '').trim();
    const status = el('add-student-status');
    if (!sectionId) {
        if (status) { status.textContent = '⚠️ Selecciona una sección'; status.style.color = '#D00000'; }
        return;
    }
    if (!state.activeClassId) return;
    const btn = el('add-section-btn');
    if (btn) btn.disabled = true;
    if (status) { status.textContent = '⏳ Agregando estudiantes...'; status.style.color = 'var(--text-secondary)'; }
    try {
        const res = await fetch(`${API.classes}/${state.activeClassId}/students`, {
            method: 'POST', credentials: 'same-origin', headers: authHeaders(),
            body: JSON.stringify({ section_id: sectionId }),
        });
        const data = await res.json();
        if (res.ok && (data.success || data.added !== undefined)) {
            const added = data.added ?? '?';
            if (status) { status.textContent = `✅ ${added} estudiante(s) agregados desde la sección`; status.style.color = '#2E7D32'; }
            await loadClassStudents(state.activeClassId);
            loadClasses();
        } else {
            if (status) { status.textContent = `❌ ${esc(data.error || 'Error al agregar sección')}`; status.style.color = '#D00000'; }
        }
    } catch (_) {
        if (status) { status.textContent = '❌ Sin conexión'; status.style.color = '#D00000'; }
    } finally {
        if (btn) btn.disabled = false;
    }
}
async function removeStudentFromClass(classId, dni) {
    if (!confirm(`¿Quitar a ${dni} de esta clase?`)) return;
    try {
        await fetch(`${API.classes}/${classId}/students/${encodeURIComponent(dni)}`, {
            method: 'DELETE', credentials: 'same-origin', headers: authHeaders(),
        });
        await loadClassStudents(classId);
        loadClasses();
    } catch (_) { alert('Sin conexión.'); }
}

function closeClassStudentsModal() {
    const m = el('class-students-modal');
    if (m) m.style.display = 'none';
}

// ═══════════════════════════════════════════════════════════════
// PERSONAL (STAFF CRUD)
// ═══════════════════════════════════════════════════════════════
function openStaffModal() {
    state.editStaff = null;
    if (el('sf-dni')) el('sf-dni').value = '';
    if (el('sf-user-preview')) el('sf-user-preview').style.display = 'none';
    if (el('staff-step-2')) el('staff-step-2').style.display = 'none';
    if (el('staff-save')) el('staff-save').style.display = 'none';
    if (el('staff-status')) el('staff-status').textContent = '';
    const modal = el('staff-modal');
    if (modal) modal.classList.remove('hidden');
}

function closeStaffModal() {
    const modal = el('staff-modal');
    if (modal) modal.classList.add('hidden');
    state.editStaff = null;
}

async function lookupStaffDni() {
    const dni = (el('sf-dni')?.value || '').trim();
    const status = el('staff-status');
    if (!dni) { if (status) { status.textContent = '⚠️ Ingresa un DNI'; status.style.color = '#D00000'; } return; }
    const btn = el('sf-lookup-btn');
    if (btn) { btn.textContent = '⏳'; btn.disabled = true; }
    try {
        const res = await fetch(`/api/attendance/admin/lookup-user?dni=${encodeURIComponent(dni)}`, {
            credentials: 'same-origin', headers: authHeaders()
        });
        const data = await res.json();
        if (res.ok && data.found) {
            if (el('sf-preview-name')) el('sf-preview-name').textContent = data.full_name;
            if (el('sf-preview-email')) el('sf-preview-email').textContent = data.email_hint;
            if (el('sf-user-preview')) el('sf-user-preview').style.display = 'block';
            if (el('staff-step-2')) el('staff-step-2').style.display = 'block';
            if (el('staff-save')) el('staff-save').style.display = 'inline-flex';
            if (status) status.textContent = '';
        } else {
            if (el('sf-user-preview')) el('sf-user-preview').style.display = 'none';
            if (el('staff-step-2')) el('staff-step-2').style.display = 'none';
            if (el('staff-save')) el('staff-save').style.display = 'none';
            if (status) { status.textContent = `❌ ${esc(data.error || 'No encontrado')}`; status.style.color = '#D00000'; }
        }
    } catch (_) {
        if (status) { status.textContent = '❌ Sin conexión'; status.style.color = '#D00000'; }
    } finally {
        if (btn) { btn.textContent = 'Buscar'; btn.disabled = false; }
    }
}

async function saveStaff() {
    const dni = (el('sf-dni')?.value || '').trim();
    const dept = (el('sf-dept')?.value || '').trim();
    const position = (el('sf-position')?.value || '').trim();
    const status = el('staff-status');
    if (!dni) return;
    try {
        const res = await fetch(API.addStaff, {
            method: 'POST', credentials: 'same-origin', headers: authHeaders(),
            body: JSON.stringify({ dni, department: dept, position }),
        });
        const data = await res.json();
        if (res.ok && data.success) {
            closeStaffModal();
            loadStats();
        } else {
            if (status) { status.textContent = `❌ ${esc(data.error || 'Error al guardar')}`; status.style.color = '#D00000'; }
        }
    } catch (_) {
        if (status) { status.textContent = '❌ Sin conexión al servidor.'; status.style.color = '#D00000'; }
    }
}

// ═══════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════
function init() {
    const fDate = el('f-date');
    if (fDate) fDate.value = state.date;

    // Cargar datos iniciales
    loadStats();
    loadRecords();
    loadClasses();

    // Tabs
    el('tab-btn-records')?.addEventListener('click', () => switchTab('records'));
    el('tab-btn-classes')?.addEventListener('click', () => { switchTab('classes'); loadClasses(); });

    // Filtros de tabla
    if (fDate) fDate.addEventListener('change', e => {
        state.date = e.target.value;
        if (el('f-date-from')) el('f-date-from').value = '';
        if (el('f-date-to')) el('f-date-to').value = '';
        state.dateFrom = ''; state.dateTo = '';
        loadRecords(); loadStats(); loadActiveQr();
    });

    el('f-date-from')?.addEventListener('change', e => {
        state.dateFrom = e.target.value;
        if (state.dateFrom && state.dateTo) loadRecords();
    });
    el('f-date-to')?.addEventListener('change', e => {
        state.dateTo = e.target.value;
        if (state.dateFrom && state.dateTo) loadRecords();
    });

    el('f-type')?.addEventListener('change', e => { state.typeFilter = e.target.value; renderTable(); });
    el('f-class')?.addEventListener('change', e => { state.classFilter = e.target.value; loadRecords(); });

    let debounce;
    el('f-search')?.addEventListener('input', e => {
        clearTimeout(debounce);
        debounce = setTimeout(() => { state.query = e.target.value.trim().toLowerCase(); renderTable(); }, 200);
    });

    // Exportar
    el('btn-excel')?.addEventListener('click', exportExcel);
    el('btn-csv')?.addEventListener('click', exportCSV);
    el('btn-pdf')?.addEventListener('click', exportPDF);

    // Clases
    el('btn-new-class')?.addEventListener('click', openNewClassModal);
    el('class-modal-close')?.addEventListener('click', closeClassModal);
    el('cls-cancel-btn')?.addEventListener('click', closeClassModal);
    el('cls-save-btn')?.addEventListener('click', saveClass);
    document.querySelector('#class-modal .modal-overlay')?.addEventListener('click', closeClassModal);

    // QR por clase
    el('class-qr-modal-close')?.addEventListener('click', closeClassQrModal);
    el('btn-gen-class-qr')?.addEventListener('click', () => generateClassQr(state.activeClassId));
    el('btn-download-class-qr')?.addEventListener('click', downloadClassQr);
    document.querySelector('#class-qr-modal .modal-overlay')?.addEventListener('click', closeClassQrModal);

    el('class-students-modal-close')?.addEventListener('click', closeClassStudentsModal);
    el('add-student-btn')?.addEventListener('click', addStudentToClass);
    el('add-student-dni')?.addEventListener('keydown', e => { if (e.key === 'Enter') addStudentToClass(); });
    el('add-section-btn')?.addEventListener('click', addSectionToClass);
    el('add-mode-btn-dni')?.addEventListener('click', () => switchAddMode('dni'));
    el('add-mode-btn-section')?.addEventListener('click', () => switchAddMode('section'));
    document.querySelector('#class-students-modal .modal-overlay')?.addEventListener('click', closeClassStudentsModal);

    // Auto-refresh
    setInterval(() => {
        loadStats();
        loadRecords();
        loadClasses();
    }, 30_000);
}

document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', init)
    : init();