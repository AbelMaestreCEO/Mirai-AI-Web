// public/format.js — Módulo Mirai Format integrado en Mirai AI

const FMT = (() => {
    'use strict';

    // ── Estado ──
    let files = [];
    let rules = [];

    // ── Elementos ──
    const el = {};

    // ── Init ──
    document.addEventListener('DOMContentLoaded', () => {
        el.uploadZone    = document.getElementById('fmt-upload-zone');
        el.fileInput     = document.getElementById('fmt-file-input');
        el.fileList      = document.getElementById('fmt-file-list');
        el.fileCount     = document.getElementById('fmt-file-count');
        el.totalSize     = document.getElementById('fmt-total-size');
        el.keyword       = document.getElementById('fmt-keyword');
        el.bold          = document.getElementById('fmt-bold');
        el.italic        = document.getElementById('fmt-italic');
        el.underline     = document.getElementById('fmt-underline');
        el.addRuleBtn    = document.getElementById('fmt-add-rule-btn');
        el.rulesBody     = document.getElementById('fmt-rules-body');
        el.ruleCount     = document.getElementById('fmt-rule-count');
        el.processBtn    = document.getElementById('fmt-process-btn');
        el.statusIcon    = document.getElementById('fmt-status-icon');
        el.statusMsg     = document.getElementById('fmt-status-msg');
        el.progressRow   = document.getElementById('fmt-progress-row');
        el.progressFill  = document.getElementById('fmt-progress-fill');
        el.progressLabel = document.getElementById('fmt-progress-label');

        bindEvents();
        setStatus('listo', 'Sube archivos y define reglas para comenzar.');

        // Marcar enlace activo en la nav
        if (typeof MiraiApp !== 'undefined' && MiraiApp.setActiveNavByURL) {
            MiraiApp.setActiveNavByURL();
        }
    });

    // ── Eventos ──
    function bindEvents() {
        // Click en zona de subida (ignorar si viene de botón quitar)
        el.uploadZone.addEventListener('click', (e) => {
            if (!e.target.closest('.btn-fmt-remove')) el.fileInput.click();
        });

        el.uploadZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            el.uploadZone.classList.add('drag-over');
        });

        el.uploadZone.addEventListener('dragleave', () => {
            el.uploadZone.classList.remove('drag-over');
        });

        el.uploadZone.addEventListener('drop', (e) => {
            e.preventDefault();
            el.uploadZone.classList.remove('drag-over');
            handleFiles(e.dataTransfer.files);
        });

        el.fileInput.addEventListener('change', (e) => {
            handleFiles(e.target.files);
            el.fileInput.value = '';
        });

        el.addRuleBtn.addEventListener('click', addRule);
        el.processBtn.addEventListener('click', process);

        el.keyword.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); addRule(); }
        });
    }

    // ── Archivos ──
    function handleFiles(fileList) {
        const errors = [];
        for (const f of fileList) {
            if (!f.name.toLowerCase().endsWith('.docx')) {
                errors.push(`${f.name}: debe ser un archivo .docx`);
                continue;
            }
            if (f.size > 20 * 1024 * 1024) {
                errors.push(`${f.name}: supera el límite de 20 MB`);
                continue;
            }
            files.push(f);
        }
        if (errors.length) alert('Archivos no válidos:\n\n' + errors.join('\n'));
        renderFiles();
        el.processBtn.disabled = files.length === 0;
    }

    function renderFiles() {
        if (files.length === 0) {
            el.fileList.innerHTML = `
                <li class="empty-state" style="padding:12px; text-align:center; font-size:0.85rem; color:var(--text-tertiary);">
                    No hay archivos seleccionados
                </li>`;
        } else {
            el.fileList.innerHTML = files.map((f, i) => `
                <li class="fmt-file-item">
                    <span>
                        <strong>${escHtml(f.name)}</strong>
                        <span class="fmt-file-size">${fmtSize(f.size)}</span>
                    </span>
                    <button class="btn-fmt-remove" onclick="FMT.removeFile(${i})" title="Eliminar">✕</button>
                </li>
            `).join('');
        }
        el.fileCount.textContent = files.length;
        el.totalSize.textContent = fmtSize(files.reduce((s, f) => s + f.size, 0));
    }

    function removeFile(i) {
        files.splice(i, 1);
        renderFiles();
        if (files.length === 0) el.processBtn.disabled = true;
    }

    // ── Reglas ──
    function addRule() {
        const kw = el.keyword.value.trim();
        if (!kw) { alert('Ingresa una palabra clave.'); return; }
        if (!el.bold.checked && !el.italic.checked && !el.underline.checked) {
            alert('Selecciona al menos un estilo.');
            return;
        }
        rules.push({
            keyword:       kw,
            style_bold:      el.bold.checked,
            style_italic:    el.italic.checked,
            style_underline: el.underline.checked,
            match_whole_word: true,
            case_sensitive:   false
        });
        el.keyword.value = '';
        el.bold.checked = el.italic.checked = el.underline.checked = false;
        el.keyword.focus();
        renderRules();
        setStatus('listo', `${rules.length} regla(s) definida(s).`);
    }

    function renderRules() {
        el.ruleCount.textContent = rules.length;
        if (rules.length === 0) {
            el.rulesBody.innerHTML = `
                <tr>
                    <td colspan="3" style="text-align:center; color:var(--text-tertiary); font-size:0.85rem; padding:14px;">
                        Sin reglas definidas.
                    </td>
                </tr>`;
            return;
        }
        el.rulesBody.innerHTML = rules.map((r, i) => `
            <tr>
                <td>${escHtml(r.keyword)}</td>
                <td>
                    ${r.style_bold      ? '<span class="fmt-badge fmt-badge-b">B</span>' : ''}
                    ${r.style_italic    ? '<span class="fmt-badge fmt-badge-i">I</span>'  : ''}
                    ${r.style_underline ? '<span class="fmt-badge fmt-badge-u">U</span>'  : ''}
                </td>
                <td>
                    <button class="btn-fmt-remove" onclick="FMT.removeRule(${i})" title="Eliminar regla">✕</button>
                </td>
            </tr>
        `).join('');
    }

    function removeRule(i) {
        rules.splice(i, 1);
        renderRules();
        setStatus('listo', rules.length > 0 ? `${rules.length} regla(s) definida(s).` : 'Sube archivos y define reglas para comenzar.');
    }

    // ── Proceso principal ──
    async function process() {
        if (files.length === 0 || rules.length === 0) {
            alert('Sube archivos y define al menos una regla.');
            return;
        }

        setStatus('loading', 'Subiendo archivos...');
        showProgress(10);
        el.processBtn.disabled = true;

        try {
            // 1. Subir
            const formData = new FormData();
            const tempId = crypto.randomUUID();
            formData.append('tempId', tempId);
            files.forEach(f => formData.append('files', f));

            const upRes = await fetch('/api/format/upload', { method: 'POST', body: formData });
            if (!upRes.ok) {
                const err = await upRes.json().catch(() => ({}));
                throw new Error(err.error || `Error al subir (${upRes.status})`);
            }

            showProgress(40);
            setStatus('loading', 'Procesando documentos...');

            // 2. Procesar
            const prRes = await fetch('/api/format/process', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tempId, rules })
            });
            if (!prRes.ok) {
                const err = await prRes.json().catch(() => ({}));
                throw new Error(err.error || `Error al procesar (${prRes.status})`);
            }

            showProgress(75);
            setStatus('loading', 'Preparando descarga...');

            // 3. Descargar
            const dlRes = await fetch(`/api/format/download?tempId=${tempId}`);
            if (!dlRes.ok) {
                const err = await dlRes.json().catch(() => ({}));
                throw new Error(err.error || `Error al descargar (${dlRes.status})`);
            }

            const blob = await dlRes.blob();
            const ct   = dlRes.headers.get('Content-Type') || '';
            const cd   = dlRes.headers.get('Content-Disposition') || '';

            let name = 'documento_formateado.docx';
            if (ct.includes('zip')) {
                name = `documentos_formateados_${new Date().toISOString().slice(0, 10)}.zip`;
            } else {
                const m = cd.match(/filename="?([^";]+)"?/);
                if (m) name = m[1];
            }

            // Disparar descarga
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = name;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(a.href);

            showProgress(100);
            setStatus('success', '¡Descarga lista! Los archivos se eliminan automáticamente en 1 hora.');

            // Limpiar estado
            files = []; rules = [];
            renderFiles();
            renderRules();
            el.processBtn.disabled = true;

        } catch (err) {
            console.error('[Format]', err);
            setStatus('error', `Error: ${err.message}`);
            showProgress(0);
            el.processBtn.disabled = false;
        }
    }

    // ── Helpers UI ──
    function setStatus(type, msg) {
        const icons = { listo: '👋', loading: '⏳', success: '🎉', error: '❌' };
        el.statusIcon.textContent = icons[type] || 'ℹ️';
        el.statusMsg.textContent  = msg;
    }

    function showProgress(pct) {
        if (pct <= 0) {
            el.progressRow.style.display = 'none';
            return;
        }
        el.progressRow.style.display = 'flex';
        el.progressFill.style.width  = `${pct}%`;
        el.progressLabel.textContent = `${pct}%`;
        if (pct === 100) {
            setTimeout(() => { el.progressRow.style.display = 'none'; }, 2500);
        }
    }

    function fmtSize(bytes) {
        if (bytes < 1024)           return `${bytes} B`;
        if (bytes < 1024 * 1024)    return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }

    function escHtml(str) {
        return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }

    // API pública para los onclick inline
    return { removeFile, removeRule };
})();

window.FMT = FMT;