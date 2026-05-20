/**
 * attendance_admin.js — Panel Administrativo de Asistencia
 * Mirai AI · Conectado a /api/attendance/admin/*
 */
'use strict';

const API = {
    activeQr: '/api/attendance/admin/active-qr',
    generateQr: '/api/attendance/admin/generate-qr',
    records: '/api/attendance/admin/records',
    stats: '/api/attendance/admin/stats',
    staff: '/api/attendance/admin/staff',
    addStaff: '/api/attendance/admin/staff',
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

// ── Estado global ─────────────────────────────────────────────
const state = {
    records: [],
    staff: [],
    activeQr: null,
    editStaff: null,
    date: todayISO(),
    typeFilter: 'todos',
    query: '',
};

// ── Auth headers ──────────────────────────────────────────────

// ═══════════════════════════════════════════════════════════════
// QR
// ═══════════════════════════════════════════════════════════════
async function loadActiveQr() {
    const box = document.getElementById('qr-img-box');
    try {
        const res = await fetch(API.activeQr, { credentials: 'same-origin', headers: authHeaders() });
        const data = await res.json();
        if (res.ok && data.token) {
            state.activeQr = data;
            renderQr(data);
        } else {
            // No hay QR activo para hoy — generar automáticamente
            await generateQr();
        }
    } catch (_) {
        box.innerHTML = '<p style="color:var(--text-tertiary);font-size:0.82rem;text-align:center;">Sin conexión</p>';
    }
}

async function generateQr() {
    const box = document.getElementById('qr-img-box');
    box.innerHTML = '<div class="att-spinner"></div>';
    document.getElementById('btn-gen-qr').disabled = true;
    try {
        const res = await fetch(API.generateQr, {
            method: 'POST',
            credentials: 'same-origin',
            headers: authHeaders(),
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
        document.getElementById('btn-gen-qr').disabled = false;
    }
}

function renderQr(data) {
    const box = document.getElementById('qr-img-box');
    box.innerHTML = '<div id="qr-canvas-wrap"></div>';

    // El QR codifica JSON con token + session_id para que el cliente pueda procesarlo
    const qrPayload = JSON.stringify({ token: data.token, session_id: data.session_id || data.id });

    if (window.QRCode) {
        new QRCode(document.getElementById('qr-canvas-wrap'), {
            text: qrPayload,
            width: 180,
            height: 180,
            colorDark: '#000000',
            colorLight: '#ffffff',
            correctLevel: QRCode.CorrectLevel.H,
        });
    } else {
        box.innerHTML = `<p style="font-size:0.75rem;word-break:break-all;color:var(--text-tertiary);">${esc(qrPayload)}</p>`;
    }

    // Metadatos
    document.getElementById('qr-session-label').textContent = `Sesión ${esc(data.date || state.date)}`;
    document.getElementById('qr-date').textContent = esc(data.date || state.date);
    document.getElementById('qr-expires').textContent = esc(data.expires_at || '23:59');
    document.getElementById('qr-scans').textContent = data.scan_count ?? 0;
    document.getElementById('qr-token-box').textContent = data.token;
}

function downloadQr() {
    const wrap = document.getElementById('qr-canvas-wrap');
    if (!wrap) return;
    const canvas = wrap.querySelector('canvas');
    if (!canvas) { alert('Genera el QR primero.'); return; }
    const link = document.createElement('a');
    link.download = `qr-asistencia-${state.date}.png`;
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
        document.getElementById('st-staff').textContent = data.total_staff ?? '—';
        document.getElementById('st-today').textContent = data.total_today ?? '—';
        document.getElementById('st-entries').textContent = data.total_entries ?? '—';
        document.getElementById('st-exits').textContent = data.total_exits ?? '—';
    } catch (_) { /* offline */ }
}

// ═══════════════════════════════════════════════════════════════
// TABLA DE REGISTROS
// ═══════════════════════════════════════════════════════════════
async function loadRecords() {
    try {
        const params = new URLSearchParams({ date: state.date });
        if (state.typeFilter !== 'todos') params.set('type', state.typeFilter);
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
    const tbody = document.getElementById('att-tbody');
    const table = document.getElementById('att-table');
    const empty = document.getElementById('att-empty');
    const count = document.getElementById('att-count');
    const rows = filteredRecords();

    count.textContent = `Mostrando ${rows.length} registro${rows.length !== 1 ? 's' : ''}`;
    tbody.innerHTML = '';

    if (!rows.length) {
        table.style.display = 'none';
        empty.classList.remove('hidden');
        return;
    }
    table.style.display = '';
    empty.classList.add('hidden');

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
    const head = ['#', 'Nombre', 'DNI', 'Tipo', 'Hora', 'Fecha', 'Departamento', 'Cargo', 'QR Sesión'];
    const lines = [head, ...rows.map((r, i) => [
        i + 1, r.staff_name || '', r.staff_dni || '', r.type || '',
        r.time || '', r.date || '', r.department || '', r.position || '', r.session_id || ''
    ])];
    const csv = lines.map(l => l.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `asistencia_${state.date}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function exportExcel() {
    if (typeof XLSX === 'undefined') { alert('Librería de Excel cargando, reintenta.'); return; }
    const rows = filteredRecords();
    const wsData = [
        [`Reporte de Asistencia — ${state.date}`], [],
        ['#', 'Nombre', 'DNI', 'Tipo', 'Hora', 'Fecha', 'Departamento', 'Cargo', 'QR Sesión'],
        ...rows.map((r, i) => [i + 1, r.staff_name, r.staff_dni, r.type, r.time, r.date, r.department, r.position, r.session_id])
    ];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = [{ wch: 4 }, { wch: 28 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 20 }, { wch: 18 }, { wch: 16 }];
    ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 8 } }];
    XLSX.utils.book_append_sheet(wb, ws, 'Asistencia');
    XLSX.writeFile(wb, `asistencia_${state.date}.xlsx`);
}

// ═══════════════════════════════════════════════════════════════
// PERSONAL (STAFF CRUD)
// ═══════════════════════════════════════════════════════════════

function openStaffModal() {
    state.editStaff = null;
    // Resetear paso 1
    const dniInput = el('sf-dni');
    if (dniInput) dniInput.value = '';
    const preview = el('sf-user-preview');
    if (preview) preview.style.display = 'none';
    const step2 = el('staff-step-2');
    if (step2) step2.style.display = 'none';
    const saveBtn = el('staff-save');
    if (saveBtn) saveBtn.style.display = 'none';
    const status = el('staff-status');
    if (status) status.textContent = '';
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
            el('sf-preview-name').textContent = data.full_name;
            el('sf-preview-email').textContent = data.email_hint;
            el('sf-user-preview').style.display = 'block';
            el('staff-step-2').style.display = 'block';
            el('staff-save').style.display = 'inline-flex';
            if (status) status.textContent = '';
        } else {
            el('sf-user-preview').style.display = 'none';
            el('staff-step-2').style.display = 'none';
            el('staff-save').style.display = 'none';
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
    // Fecha por defecto
    const fDate = document.getElementById('f-date');
    fDate.value = state.date;

    // Cargar todo en paralelo
    loadActiveQr();
    loadStats();
    loadRecords();

    // AGREGAR junto a los demás listeners de personal:
    const sfLookup = el('sf-lookup-btn');
    if (sfLookup) sfLookup.addEventListener('click', lookupStaffDni);

    // También buscar al presionar Enter en el campo DNI:
    const sfDni = el('sf-dni');
    if (sfDni) sfDni.addEventListener('keydown', e => { if (e.key === 'Enter') lookupStaffDni(); });

    // ── Filtros ──
    fDate.addEventListener('change', e => {
        state.date = e.target.value;
        loadRecords();
        loadStats();
        loadActiveQr();
    });

    document.getElementById('f-type').addEventListener('change', e => {
        state.typeFilter = e.target.value;
        renderTable();
    });

    let debounce;
    document.getElementById('f-search').addEventListener('input', e => {
        clearTimeout(debounce);
        debounce = setTimeout(() => { state.query = e.target.value.trim().toLowerCase(); renderTable(); }, 200);
    });

    // ── QR ──
    document.getElementById('btn-gen-qr').addEventListener('click', generateQr);
    document.getElementById('btn-download-qr').addEventListener('click', downloadQr);

    // ── Exportación ──
    document.getElementById('btn-excel').addEventListener('click', exportExcel);
    document.getElementById('btn-csv').addEventListener('click', exportCSV);

    // ── Personal ──
    document.getElementById('btn-add-staff').addEventListener('click', () => openStaffModal());
    document.getElementById('staff-modal-close').addEventListener('click', closeStaffModal);
    document.getElementById('staff-cancel').addEventListener('click', closeStaffModal);
    document.getElementById('staff-save').addEventListener('click', saveStaff);
    document.querySelector('#staff-modal .modal-overlay').addEventListener('click', closeStaffModal);

    // Auto-refresh de escaneos cada 30s (actualiza el contador del QR y la tabla)
    setInterval(() => {
        loadStats();
        loadRecords();
        if (state.activeQr) {
            fetch(`${API.activeQr}`, { credentials: 'same-origin', headers: authHeaders() })
                .then(r => r.json())
                .then(d => { if (d.scan_count !== undefined) document.getElementById('qr-scans').textContent = d.scan_count; })
                .catch(() => { });
        }
    }, 30_000);
}

document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', init)
    : init();