/**
 * attendance.js — Autoservicio de Asistencia (personal)
 * Mirai AI · Conectado a /api/attendance/*
 * v2: filtros por fecha/clase, exportación PDF y Excel
 */
'use strict';

if (!document.getElementById('btn-start-scan')) {
    throw new Error('[attendance.js] Página incorrecta, abortando init.');
}

const API = {
    record:  '/api/attendance/record',
    history: '/api/attendance/my-history',
    staff:   '/api/attendance/my-profile',
    classes: '/api/attendance/my-classes',
};

function authHeaders() {
    return { 'Content-Type': 'application/json' };
}

function escHtml(s) {
    return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function initials(name) {
    return String(name || '?').trim().split(' ').slice(0, 2).map(w => w[0] || '').join('').toUpperCase() || '?';
}

function el(id) { return document.getElementById(id); }

const state = {
    scanning:   false,
    stream:     null,
    rafId:      null,
    processing: false,
    records:    [],
    dateFrom:   '',
    dateTo:     '',
    classFilter:'',
};

// ── Cargar perfil del usuario ──────────────────────────────────
async function loadProfile() {
    const dni = window.miraiUser?.dni || '';
    if (el('att-user-name')) el('att-user-name').textContent = dni || 'Usuario';
    if (el('att-avatar'))    el('att-avatar').textContent    = initials(dni);
    try {
        const res = await fetch(API.staff, { credentials: 'same-origin', headers: authHeaders() });
        if (res.ok) {
            const data = await res.json();
            if (el('att-user-name')) el('att-user-name').textContent = escHtml(data.name || dni);
            if (el('att-user-meta')) el('att-user-meta').textContent = [data.department, data.position].filter(Boolean).join(' · ') || 'Personal';
            if (el('att-avatar'))    el('att-avatar').textContent    = initials(data.name || dni);
        }
    } catch (_) {}
    checkAdminAccess();
    loadMyClasses();
}

async function checkAdminAccess() {
    try {
        const res  = await fetch('/api/check-professor-role', { credentials: 'same-origin', headers: authHeaders() });
        if (!res.ok) return;
        const data = await res.json();
        if (data.is_professor) {
            const card = el('admin-access-card');
            if (card) card.style.display = 'block';
        }
    } catch (_) {}
}

async function loadMyClasses() {
    try {
        const res  = await fetch(API.classes, { credentials: 'same-origin', headers: authHeaders() });
        if (!res.ok) return;
        const data = await res.json();
        const sel  = el('hist-filter-class');
        if (!sel) return;
        const classes = data.classes || [];
        if (!classes.length) return;
        sel.innerHTML = '<option value="">Todas las clases</option>' +
            classes.map(c => `<option value="${c.id}">${escHtml(c.name)}</option>`).join('');
        const filterRow = el('hist-filter-row');
        if (filterRow) filterRow.style.display = 'flex';
    } catch (_) {}
}

// ── Historial personal ────────────────────────────────────────
async function loadHistory() {
    const list = el('att-history-list');
    if (!list) return;
    try {
        const params = new URLSearchParams();
        if (state.dateFrom && state.dateTo) {
            params.set('date_from', state.dateFrom);
            params.set('date_to',   state.dateTo);
        }
        if (state.classFilter) params.set('class_id', state.classFilter);

        const res  = await fetch(`${API.history}?${params}`, { credentials: 'same-origin', headers: authHeaders() });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        state.records = data.records || [];
        renderHistory();
    } catch (_) {
        list.innerHTML = '<li style="text-align:center;color:var(--text-tertiary);padding:16px 0;font-size:0.85rem;">No se pudo cargar el historial.</li>';
    }
}

function renderHistory() {
    const list = el('att-history-list');
    if (!list) return;
    const rows = state.records;
    if (!rows.length) {
        list.innerHTML = '<li style="text-align:center;color:var(--text-tertiary);padding:20px 0;font-size:0.85rem;">Sin registros para este filtro.</li>';
        return;
    }
    list.innerHTML = rows.slice(0, 50).map(r => `
        <li class="att-history-item">
            <div class="att-hist-dot ${r.type === 'entrada' ? 'entrada' : 'salida'}"></div>
            <div style="flex:1;min-width:0;">
                <div style="font-size:0.88rem;font-weight:600;color:var(--text-primary);">
                    ${r.type === 'entrada' ? '⬆️ Entrada' : '⬇️ Salida'}
                </div>
                <div style="font-size:0.78rem;color:var(--text-secondary);">${escHtml(r.date)}
                    ${r.class_name && r.class_name !== 'General' ? ` · <span style="color:var(--accent-color);">${escHtml(r.class_name)}</span>` : ''}
                </div>
            </div>
            <div class="att-hist-time">${escHtml(r.time)}</div>
        </li>
    `).join('');
}

// ── Exportación personal ──────────────────────────────────────
function exportMyPDF() {
    const rows  = state.records;
    const label = state.dateFrom && state.dateTo ? `${state.dateFrom} al ${state.dateTo}` : 'Historial';
    const tbody = rows.map((r, i) => `
        <tr>
            <td>${i + 1}</td>
            <td class="${r.type}">${r.type === 'entrada' ? '↑ Entrada' : '↓ Salida'}</td>
            <td>${r.date}</td>
            <td>${r.time}</td>
            <td>${r.class_name || 'General'}</td>
        </tr>`).join('');
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
        <title>Mi Asistencia ${label}</title>
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
        <p class="sub">Período: ${label} · Total: ${rows.length} marcaciones · Generado: ${new Date().toLocaleString('es-PE')}</p>
        <table>
            <thead><tr><th>#</th><th>Tipo</th><th>Fecha</th><th>Hora</th><th>Clase</th></tr></thead>
            <tbody>${tbody}</tbody>
        </table></body></html>`;
    const win = window.open('', '_blank');
    if (!win) { alert('Activa las ventanas emergentes para exportar PDF.'); return; }
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); win.close(); }, 400);
}

function exportMyExcel() {
    if (typeof XLSX === 'undefined') { alert('Librería cargando, reintenta.'); return; }
    const rows  = state.records;
    const label = state.dateFrom && state.dateTo ? `${state.dateFrom} al ${state.dateTo}` : 'Historial';
    const wsData = [
        [`Mi Asistencia — ${label}`], [],
        ['#', 'Tipo', 'Fecha', 'Hora', 'Clase'],
        ...rows.map((r, i) => [i + 1, r.type, r.date, r.time, r.class_name || 'General'])
    ];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = [{ wch: 4 }, { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 22 }];
    ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 4 } }];
    XLSX.utils.book_append_sheet(wb, ws, 'Mi Asistencia');
    const fileLabel = state.dateFrom && state.dateTo ? `${state.dateFrom}_${state.dateTo}` : 'historial';
    XLSX.writeFile(wb, `mi_asistencia_${fileLabel}.xlsx`);
}

// ── Cámara QR ────────────────────────────────────────────────
function stopScan() {
    if (state.rafId)  { cancelAnimationFrame(state.rafId); state.rafId = null; }
    if (state.stream) { state.stream.getTracks().forEach(t => t.stop()); state.stream = null; }
    state.scanning = false;
    const wrap = el('qr-video-wrap');
    const btn  = el('btn-start-scan');
    const st   = el('scan-status');
    if (wrap) wrap.style.display = 'none';
    if (btn)  btn.textContent    = '📷 Activar cámara';
    if (st)   st.textContent     = 'Cámara detenida';
}

async function startScan() {
    if (state.scanning) { stopScan(); return; }
    const st = el('scan-status');
    if (st) st.textContent = 'Activando cámara...';
    try {
        state.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        const video = el('qr-video');
        if (!video) { stopScan(); return; }
        video.srcObject = state.stream;
        await video.play();
        state.scanning = true;
        const wrap = el('qr-video-wrap');
        const btn  = el('btn-start-scan');
        if (wrap) wrap.style.display = 'block';
        if (btn)  btn.textContent    = '⏹ Detener cámara';
        if (st)   st.textContent     = 'Escaneando... apunta al QR';
        tick();
    } catch (err) {
        if (st) st.textContent = '❌ Sin acceso a la cámara. Verifica los permisos.';
    }
}

function tick() {
    const video  = el('qr-video');
    const canvas = el('qr-canvas');
    if (!video || !canvas || !state.scanning) return;
    if (video.readyState < 2) { state.rafId = requestAnimationFrame(tick); return; }
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code    = window.jsQR && window.jsQR(imgData.data, imgData.width, imgData.height, { inversionAttempts: 'dontInvert' });
    if (code && code.data) {
        stopScan();
        handleQrData(code.data);
    } else {
        state.rafId = requestAnimationFrame(tick);
    }
}

async function handleQrData(raw) {
    if (state.processing) return;
    state.processing = true;
    showResult('⏳', 'Registrando...', 'Por favor espera...');
    const scanCard   = el('qr-scan-card');
    const resultCard = el('att-result-card');
    if (scanCard)   scanCard.style.display   = 'none';
    if (resultCard) resultCard.style.display = 'block';
    let token = raw;
    try {
        const parsed = JSON.parse(raw);
        token = parsed.token || parsed.session_id || raw;
    } catch (_) {}
    try {
        const res  = await fetch(API.record, {
            method: 'POST', credentials: 'same-origin', headers: authHeaders(),
            body: JSON.stringify({ qr_token: token }),
        });
        const data = await res.json();
        if (res.ok && data.success) {
            const tipo = data.type === 'entrada' ? '⬆️ Entrada' : '⬇️ Salida';
            showResult(data.type === 'entrada' ? '✅' : '✔️', `${tipo} registrada`, `${data.time || ''} · ${data.date || ''}`);
            loadHistory();
        } else {
            const isNotStaff = data.error && data.error.includes('no estás registrado');
            showResult(
                isNotStaff ? '⚠️' : '❌',
                isNotStaff ? 'No registrado como personal' : 'Error al registrar',
                isNotStaff
                    ? 'Tu usuario existe pero no has sido dado de alta en el sistema de asistencia. Contacta al administrador.'
                    : escHtml(data.error || 'Token inválido o expirado')
            );
        }
    } catch (_) {
        showResult('⚠️', 'Sin conexión', 'Verifica tu red e inténtalo de nuevo.');
    } finally {
        state.processing = false;
    }
}

function showResult(icon, title, sub) {
    if (el('att-result-icon'))  el('att-result-icon').textContent  = icon;
    if (el('att-result-title')) el('att-result-title').textContent = title;
    if (el('att-result-sub'))   el('att-result-sub').textContent   = sub;
}

// ── Init ──────────────────────────────────────────────────────
async function init() {
    if (window.miraiUserReady) await window.miraiUserReady;
    loadProfile();
    loadHistory();

    el('btn-start-scan')?.addEventListener('click', startScan);
    el('btn-scan-again')?.addEventListener('click', () => {
        const resultCard = el('att-result-card');
        const scanCard   = el('qr-scan-card');
        if (resultCard) resultCard.style.display = 'none';
        if (scanCard)   scanCard.style.display   = 'block';
    });

    // Filtros del historial
    el('hist-date-from')?.addEventListener('change', e => {
        state.dateFrom = e.target.value;
        if (state.dateTo || !state.dateFrom) loadHistory();
    });
    el('hist-date-to')?.addEventListener('change', e => {
        state.dateTo = e.target.value;
        loadHistory();
    });
    el('hist-filter-class')?.addEventListener('change', e => {
        state.classFilter = e.target.value;
        loadHistory();
    });
    el('btn-clear-filters')?.addEventListener('click', () => {
        state.dateFrom = ''; state.dateTo = ''; state.classFilter = '';
        if (el('hist-date-from'))    el('hist-date-from').value    = '';
        if (el('hist-date-to'))      el('hist-date-to').value      = '';
        if (el('hist-filter-class')) el('hist-filter-class').value = '';
        loadHistory();
    });

    // Exportar historial propio
    el('btn-my-pdf')?.addEventListener('click',   exportMyPDF);
    el('btn-my-excel')?.addEventListener('click', exportMyExcel);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}