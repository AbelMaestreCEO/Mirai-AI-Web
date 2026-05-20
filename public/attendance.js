/**
 * attendance.js — Autoservicio de Asistencia (personal)
 * Mirai AI · Conectado a /api/attendance/*
 */
'use strict';

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
    return String(name).trim().split(' ').slice(0,2).map(w => w[0]).join('').toUpperCase();
}

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
    document.getElementById('att-user-name').textContent = dni || 'Usuario';
    document.getElementById('att-avatar').textContent    = initials(dni);

    try {
        const res  = await fetch(API.staff, { credentials: 'same-origin', headers: authHeaders() });
        if (!res.ok) return;
        const data = await res.json();
        document.getElementById('att-user-name').textContent = escHtml(data.name || dni);
        document.getElementById('att-user-meta').textContent = [data.department, data.position].filter(Boolean).join(' · ') || 'Personal';
        document.getElementById('att-avatar').textContent    = initials(data.name || dni);
    } catch (_) { /* offline – mostramos DNI */ }
}

// ── Historial personal ────────────────────────────────────────
async function loadHistory() {
    const list = document.getElementById('att-history-list');
    try {
        const res  = await fetch(API.history, { credentials: 'same-origin', headers: authHeaders() });
        const data = await res.json();
        const rows = data.records || [];
        if (!rows.length) {
            list.innerHTML = '<li style="text-align:center;color:var(--text-tertiary);padding:20px 0;font-size:0.85rem;">Sin registros aún.</li>';
            return;
        }
        list.innerHTML = rows.slice(0, 10).map(r => `
            <li class="att-history-item">
                <div class="att-hist-dot ${r.type}"></div>
                <div>
                    <div style="font-size:0.88rem;font-weight:600;color:var(--text-primary);">
                        ${r.type === 'entrada' ? '⬆️ Entrada' : '⬇️ Salida'}
                    </div>
                    <div class="att-hist-date" style="font-size:0.78rem;color:var(--text-secondary);">
                        ${escHtml(r.date)}
                    </div>
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
    document.getElementById('qr-video-wrap').style.display = 'none';
    document.getElementById('scan-status').textContent = 'Cámara detenida';
    document.getElementById('btn-start-scan').textContent  = '📷 Activar cámara';
}

async function startScan() {
    if (state.scanning) { stopScan(); return; }
    document.getElementById('scan-status').textContent = 'Activando cámara...';
    try {
        state.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        const video  = document.getElementById('qr-video');
        video.srcObject = state.stream;
        await video.play();
        state.scanning = true;
        document.getElementById('qr-video-wrap').style.display = 'block';
        document.getElementById('btn-start-scan').textContent  = '⏹ Detener cámara';
        document.getElementById('scan-status').textContent = 'Escaneando...';
        tick();
    } catch (err) {
        document.getElementById('scan-status').textContent = '❌ Sin acceso a la cámara';
    }
}

function tick() {
    const video  = document.getElementById('qr-video');
    const canvas = document.getElementById('qr-canvas');
    if (!state.scanning || video.readyState < 2) { state.rafId = requestAnimationFrame(tick); return; }
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
    document.getElementById('qr-scan-card').style.display   = 'none';
    document.getElementById('att-result-card').style.display = 'block';

    let token = raw;
    try {
        // El QR puede ser JSON { token, session_id } o un token directo
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
            showResult(data.type === 'entrada' ? '✅' : '✔️',
                `${tipo} registrada`, `${data.time || ''} · ${data.date || ''}`);
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
    document.getElementById('att-result-icon').textContent  = icon;
    document.getElementById('att-result-title').textContent = title;
    document.getElementById('att-result-sub').textContent   = sub;
}

// ── Init ──────────────────────────────────────────────────────
function init() {
    loadProfile();
    loadHistory();

    document.getElementById('btn-start-scan').addEventListener('click', startScan);

    document.getElementById('btn-scan-again').addEventListener('click', () => {
        document.getElementById('att-result-card').style.display = 'none';
        document.getElementById('qr-scan-card').style.display    = 'block';
    });
}

document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', init)
    : init();