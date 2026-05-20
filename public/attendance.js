/**
 * attendance.js — Autoservicio de Asistencia (personal)
 * Mirai AI · Conectado a /api/attendance/*
 *
 * CORRECCIÓN: guard de IDs antes de cualquier querySelector/getElementById
 * para que no rompa si se carga en una página que no tenga estos elementos.
 */
'use strict';

// ── Salir inmediatamente si no es la página correcta ─────────
if (!document.getElementById('btn-start-scan')) {
    // Este script fue cargado en una página que no es attendance.html
    // (por caché o error de configuración). No hacer nada.
    throw new Error('[attendance.js] Página incorrecta, abortando init.');
}

const API = {
    record:  '/api/attendance/record',
    history: '/api/attendance/my-history',
    staff:   '/api/attendance/my-profile',
};

function authHeaders() {
    const token = localStorage.getItem('mirai_auth_token');
    return {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    };
}

function escHtml(s) {
    return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function initials(name) {
    return String(name || '?').trim().split(' ').slice(0, 2).map(w => w[0] || '').join('').toUpperCase() || '?';
}

// ── Helper: obtener elemento o null sin romper ─────────────────
function el(id) { return document.getElementById(id); }

// ── Estado ────────────────────────────────────────────────────
const state = {
    scanning:   false,
    stream:     null,
    rafId:      null,
    processing: false,
};

// ── Cargar perfil del usuario ──────────────────────────────────
async function loadProfile() {
    const dni = localStorage.getItem('mirai_user_dni') || '';
    if (el('att-user-name')) el('att-user-name').textContent = dni || 'Usuario';
    if (el('att-avatar'))    el('att-avatar').textContent    = initials(dni);

    try {
        const res = await fetch(API.staff, { credentials: 'same-origin', headers: authHeaders() });
        if (!res.ok) return;
        const data = await res.json();
        if (el('att-user-name')) el('att-user-name').textContent = escHtml(data.name || dni);
        if (el('att-user-meta')) el('att-user-meta').textContent = [data.department, data.position].filter(Boolean).join(' · ') || 'Personal';
        if (el('att-avatar'))    el('att-avatar').textContent    = initials(data.name || dni);
    } catch (_) { /* offline – mostramos DNI */ }

    // Mostrar acceso al admin si el usuario tiene rol de profesor/administrador
    checkAdminAccess();
}

async function checkAdminAccess() {
    try {
        const res  = await fetch('/api/check-professor-role', { credentials: 'same-origin', headers: authHeaders() });
        const data = await res.json();
        if (res.ok && data.is_professor) {
            const card = el('admin-access-card');
            if (card) card.style.display = 'block';
        }
    } catch (_) { /* sin conexión o sin rol — no mostrar el botón */ }
}

// ── Historial personal ────────────────────────────────────────
async function loadHistory() {
    const list = el('att-history-list');
    if (!list) return;

    try {
        const res  = await fetch(API.history, { credentials: 'same-origin', headers: authHeaders() });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        const rows = data.records || [];

        if (!rows.length) {
            list.innerHTML = '<li style="text-align:center;color:var(--text-tertiary);padding:20px 0;font-size:0.85rem;">Sin registros aún.</li>';
            return;
        }

        list.innerHTML = rows.slice(0, 10).map(r => `
            <li class="att-history-item">
                <div class="att-hist-dot ${r.type === 'entrada' ? 'entrada' : 'salida'}"></div>
                <div>
                    <div style="font-size:0.88rem;font-weight:600;color:var(--text-primary);">
                        ${r.type === 'entrada' ? '⬆️ Entrada' : '⬇️ Salida'}
                    </div>
                    <div style="font-size:0.78rem;color:var(--text-secondary);">${escHtml(r.date)}</div>
                </div>
                <div class="att-hist-time">${escHtml(r.time)}</div>
            </li>
        `).join('');
    } catch (_) {
        list.innerHTML = '<li style="text-align:center;color:var(--text-tertiary);padding:16px 0;font-size:0.85rem;">No se pudo cargar el historial.</li>';
    }
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
        console.warn('[attendance] Cámara denegada:', err.message);
    }
}

function tick() {
    const video  = el('qr-video');
    const canvas = el('qr-canvas');
    if (!video || !canvas || !state.scanning) return;

    if (video.readyState < 2) { state.rafId = requestAnimationFrame(tick); return; }

    const ctx = canvas.getContext('2d');
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

// ── Procesar QR escaneado ─────────────────────────────────────
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
    } catch (_) { /* token plano */ }

    try {
        const res  = await fetch(API.record, {
            method: 'POST',
            credentials: 'same-origin',
            headers: authHeaders(),
            body: JSON.stringify({ qr_token: token }),
        });
        const data = await res.json();
        if (res.ok && data.success) {
            const tipo = data.type === 'entrada' ? '⬆️ Entrada' : '⬇️ Salida';
            showResult(data.type === 'entrada' ? '✅' : '✔️', `${tipo} registrada`, `${data.time || ''} · ${data.date || ''}`);
            loadHistory();
        } else {
            showResult('❌', 'Error al registrar', escHtml(data.error || 'Token inválido o expirado'));
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
function init() {
    loadProfile();
    loadHistory();

    const btnScan  = el('btn-start-scan');
    const btnAgain = el('btn-scan-again');
    if (btnScan)  btnScan.addEventListener('click', startScan);
    if (btnAgain) btnAgain.addEventListener('click', () => {
        const resultCard = el('att-result-card');
        const scanCard   = el('qr-scan-card');
        if (resultCard) resultCard.style.display = 'none';
        if (scanCard)   scanCard.style.display   = 'block';
    });
}

// Esperar al DOM con seguridad
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}