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
        el.uploadZone   = document.getElementById('fmt-upload-zone');
        el.fileInput    = document.getElementById('fmt-file-input');
        el.fileList     = document.getElementById('fmt-file-list');
        el.fileCount    = document.getElementById('fmt-file-count');
        el.totalSize    = document.getElementById('fmt-total-size');
        el.keyword      = document.getElementById('fmt-keyword');
        el.bold         = document.getElementById('fmt-bold');
        el.italic       = document.getElementById('fmt-italic');
        el.underline    = document.getElementById('fmt-underline');
        el.addRuleBtn   = document.getElementById('fmt-add-rule-btn');
        el.rulesBody    = document.getElementById('fmt-rules-body');
        el.ruleCount    = document.getElementById('fmt-rule-count');
        el.processBtn   = document.getElementById('fmt-process-btn');
        el.statusIcon   = document.getElementById('fmt-status-icon');
        el.statusMsg    = document.getElementById('fmt-status-msg');
        el.progressWrap = document.getElementById('progress-wrap');
        el.progressBar  = document.getElementById('fmt-progress-bar');
        el.progressText = document.getElementById('fmt-progress-text');

        // Mostrar nombre de usuario en sidebar
        const dni = localStorage.getItem('mirai_user_dni');
        const sidebarUser = document.getElementById('sidebar-username');
        if (sidebarUser && dni) sidebarUser.textContent = dni;

        bindEvents();
        setStatus('listo', 'Sube archivos y define reglas.');
    });

    // ── Eventos ──
    function bindEvents() {
        el.uploadZone.addEventListener('click', (e) => {
            if (!e.target.closest('.btn-remove-file')) el.fileInput.click();
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
            el.fileList.innerHTML = '<li class="empty-state-row">No hay archivos seleccionados</li>';
        } else {
            el.fileList.innerHTML = files.map((f, i) => `
                <li class="file-item">
                    <span><strong>${f.name}</strong><span class="file-size">${fmtSize(f.size)}</span></span>
                    <button class="btn-remove-file" onclick="FMT.removeFile(${i})" title="Eliminar">✕</button>
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
            keyword: kw,
            style_bold: el.bold.checked,
            style_italic: el.italic.checked,
            style_underline: el.underline.checked,
            match_whole_word: true,
            case_sensitive: false
        });
        el.keyword.value = '';
        el.bold.checked = el.italic.checked = el.underline.checked = false;
        el.keyword.focus();
        renderRules();
    }

    function renderRules() {
        el.ruleCount.textContent = rules.length;
        if (rules.length === 0) {
            el.rulesBody.innerHTML = '<tr><td colspan="3" class="empty-state-row">Sin reglas definidas.</td></tr>';
            return;
        }
        el.rulesBody.innerHTML = rules.map((r, i) => `
            <tr>
                <td>${r.keyword}</td>
                <td>
                    ${r.style_bold      ? '<span class="badge badge-b">B</span>' : ''}
                    ${r.style_italic    ? '<span class="badge badge-i">I</span>' : ''}
                    ${r.style_underline ? '<span class="badge badge-u">U</span>' : ''}
                </td>
                <td><button class="btn-remove-file" onclick="FMT.removeRule(${i})">✕</button></td>
            </tr>
        `).join('');
    }

    function removeRule(i) {
        rules.splice(i, 1);
        renderRules();
    }

    // ── Proceso ──
    async function process() {
        if (files.length === 0 || rules.length === 0) {
            alert('Sube archivos y define al menos una regla.');
            return;
        }

        setStatus('loading', 'Subiendo archivos...');
        showProgress(10);

        try {
            // 1. Subir
            const formData = new FormData();
            const tempId = crypto.randomUUID();
            formData.append('tempId', tempId);
            files.forEach(f => formData.append('files', f));

            const upRes = await fetch('/api/format/upload', { method: 'POST', body: formData });
            if (!upRes.ok) throw new Error(`Error al subir (${upRes.status})`);

            showProgress(40);
            setStatus('loading', 'Procesando documentos...');

            // 2. Procesar
            const prRes = await fetch('/api/format/process', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tempId, rules })
            });
            if (!prRes.ok) throw new Error(`Error al procesar (${prRes.status})`);

            showProgress(75);
            setStatus('loading', 'Preparando descarga...');

            // 3. Descargar
            const dlRes = await fetch(`/api/format/download?tempId=${tempId}`);
            if (!dlRes.ok) throw new Error(`Error al descargar (${dlRes.status})`);

            const blob = await dlRes.blob();
            const ct   = dlRes.headers.get('Content-Type') || '';
            const cd   = dlRes.headers.get('Content-Disposition') || '';

            let name = 'documento_formateado.docx';
            if (ct.includes('zip')) {
                name = `documentos_formateados_${new Date().toISOString().slice(0,10)}.zip`;
            } else {
                const m = cd.match(/filename="?([^";]+)"?/);
                if (m) name = m[1];
            }

            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = name;
            a.click();
            URL.revokeObjectURL(a.href);

            showProgress(100);
            setStatus('success', '¡Descarga lista! Los archivos se eliminan en 1 hora.');

            // Reset
            files = []; rules = [];
            renderFiles(); renderRules();
            el.processBtn.disabled = true;

        } catch (err) {
            console.error('[Format]', err);
            setStatus('error', `Error: ${err.message}`);
            showProgress(0);
        }
    }

    // ── Helpers ──
    function setStatus(type, msg) {
        const icons = { listo: '👋', loading: '⏳', success: '🎉', error: '❌' };
        el.statusIcon.textContent = icons[type] || 'ℹ️';
        el.statusMsg.textContent  = msg;
    }

    function showProgress(pct) {
        el.progressWrap.style.display = pct > 0 ? 'flex' : 'none';
        el.progressBar.style.width    = `${pct}%`;
        el.progressText.textContent   = `${pct}%`;
        if (pct === 100) setTimeout(() => { el.progressWrap.style.display = 'none'; }, 2500);
    }

    function fmtSize(bytes) {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }

    // API pública para los onclick inline
    return { removeFile, removeRule };
})();

window.FMT = FMT;