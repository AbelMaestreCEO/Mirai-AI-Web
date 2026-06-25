/**
 * ============================================
 * MIRAI AI - generation.js
 * Módulo de Generación con IA
 * Maneja: texto (correo, tono), imagen, vídeo, música
 * ============================================
 */

(function () {
    'use strict';

    // ============================================
    // ESTADO
    // ============================================
    const genState = {
        activeTab: 'texto',
        textType: 'correo',
        tone: 'alegre',
        imageStyle: 'cinematografico',
        videoStyle: 'cinematografico',
        musicGenre: 'pop',
        editAspect: 'match_input_image',
        editImageUrl: '',
        isLoading: false
    };

    // ============================================
    // MAPAS DE ETIQUETAS
    // ============================================
    const TAB_LABELS = {
        texto: { icon: '✍️', label: 'Texto' },
        imagen: { icon: '🖼️', label: 'Imagen' },
        video: { icon: '🎬', label: 'Vídeo' },
        musica: { icon: '🎵', label: 'Música' }
    };

    const TONE_LABELS = {
        alegre: 'Alegre',
        dramatico: 'Dramático',
        triste: 'Triste',
        profesional: 'Profesional',
        casual: 'Casual',
        sentimental: 'Sentimental',
        educado: 'Educado',
        divertido: 'Divertido',
        rrss: 'Redes Sociales',
        emotivo: 'Emotivo',
        ingenioso: 'Ingenioso'
    };

    const STYLE_LABELS = {
        cinematografico: 'Cinematográfico',
        cartoon: 'Cartoon',
        anime: 'Anime',
        fotorrealista: 'Fotorrealista'
    };

    const GENRE_LABELS = {
        pop: 'Pop',
        rock: 'Rock',
        balada: 'Balada',
        orquestal: 'Orquestal',
        electronica: 'Electrónica',
        videojuego: 'Videojuego'
    };

    // ── PROMPTS de estilo para imagen/vídeo ──
    const IMAGE_STYLE_PROMPTS = {
        cinematografico: 'cinematic style, dramatic lighting, wide angle, film grain, movie still, high contrast, epic composition',
        cartoon: 'cartoon style, colorful, flat design, bold outlines, vibrant colors, animated look, fun illustration',
        anime: 'anime style, detailed, Japanese animation, expressive eyes, clean linework, soft colors, manga aesthetic',
        fotorrealista: 'photorealistic, ultra detailed, 8K resolution, real photography, natural lighting, lifelike textures, DSLR quality'
    };

    // ── PROMPTS de género musical ──
    const MUSIC_GENRE_PROMPTS = {
        pop: 'upbeat pop song, catchy melody, modern production, synth and guitar, radio-friendly, 120 BPM',
        rock: 'energetic rock, electric guitar riffs, powerful drums, bass driven, stadium sound, 130 BPM',
        balada: 'emotional ballad, slow tempo, piano and strings, heartfelt melody, soft vocals vibe, 70 BPM',
        orquestal: 'full orchestral composition, strings, brass, woodwinds, epic and cinematic, classical arrangement',
        electronica: 'electronic dance music, synthesizers, deep bass, four-on-the-floor beat, futuristic sound, 128 BPM',
        videojuego: '8-bit and chiptune game soundtrack, retro synth, heroic theme, loopable, adventure mood'
    };

    // ============================================
    // HELPERS
    // ============================================
    function $(id) { return document.getElementById(id); }

    function showError(msg) {
        const el = $('gen-error');
        el.textContent = msg;
        el.classList.add('visible');
        setTimeout(() => el.classList.remove('visible'), 6000);
    }

    function setLoading(active, text = 'Generando...', icon = '✨') {
        genState.isLoading = active;
        const el = $('gen-loading');
        $('gen-orb-icon').textContent = icon;
        $('gen-loading-text').textContent = text;
        if (active) { el.classList.add('visible'); }
        else { el.classList.remove('visible'); }
        $('gen-send-btn').disabled = active;
        $('gen-input').disabled = active;
    }

    function hideResult() {
        $('gen-result').classList.remove('visible');
    }

    function showResult({ title, badge, body }) {
        $('gen-result-title').innerHTML = `${title} <span class="gen-result-badge">${badge}</span>`;
        $('gen-result-body').innerHTML = body.html || '';
        $('gen-result-actions').innerHTML = body.actions || '';
        $('gen-result').classList.add('visible');
    }

    // Auto-resize textarea
    function autoResize(el) {
        el.style.height = 'auto';
        el.style.height = Math.min(el.scrollHeight, 100) + 'px';
    }

    // ============================================
    // TABS
    // ============================================
    function initTabs() {
        document.querySelectorAll('#gen-tabs .filter-pill').forEach(btn => {
            btn.addEventListener('click', () => {
                const tab = btn.dataset.tab;
                if (tab === genState.activeTab) return;
                genState.activeTab = tab;

                // Activar pill
                document.querySelectorAll('#gen-tabs .filter-pill').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                // Mostrar panel correcto
                document.querySelectorAll('.gen-panel').forEach(p => p.style.display = 'none');
                const panel = document.getElementById('panel-' + tab);
                if (panel) panel.style.display = 'block';

                hideResult();
                $('gen-error').classList.remove('visible');
                updatePlaceholder();
            });
        });
    }

    function updatePlaceholder() {
        const placeholders = {
            texto: '¿Qué quieres escribir? Ej: "Escribe un correo solicitando vacaciones"',
            imagen: 'Describe la imagen que quieres generar...',
            editar: 'Describe la edición que quieres aplicar...',
            video: 'Describe el vídeo que quieres generar...',
            musica: 'Describe la música que quieres generar...'
        };
        $('gen-input').placeholder = placeholders[genState.activeTab] || '¿Qué quieres generar?';
    }

    // ============================================
    // OPCIONES DE TEXTO (correo / tono)
    // ============================================
    function initTextTypeOpts() {
        document.querySelectorAll('#text-type-opts .filter-pill').forEach(btn => {
            btn.addEventListener('click', () => {
                genState.textType = btn.dataset.val;
                document.querySelectorAll('#text-type-opts .filter-pill').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                $('tone-opts-wrapper').style.display = (genState.textType === 'tono') ? 'block' : 'none';
            });
        });

        document.querySelectorAll('#tone-opts .filter-pill').forEach(btn => {
            btn.addEventListener('click', () => {
                genState.tone = btn.dataset.val;
                document.querySelectorAll('#tone-opts .filter-pill').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });
    }

    // ============================================
    // OPCIONES IMAGEN, VÍDEO, MÚSICA
    // ============================================
    function initStyleOpts(containerId, stateKey) {
        document.querySelectorAll(`#${containerId} .filter-pill`).forEach(btn => {
            btn.addEventListener('click', () => {
                genState[stateKey] = btn.dataset.val;
                document.querySelectorAll(`#${containerId} .filter-pill`).forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });
    }

    // ============================================
    // CONSTRUIR PROMPT FINAL
    // ============================================
    function buildPrompt(userText) {
        switch (genState.activeTab) {
            case 'texto': {
                if (genState.textType === 'correo') {
                    return `Redacta un correo electrónico profesional y completo (con asunto, saludo, cuerpo y despedida) basado en la siguiente solicitud del usuario. Responde SOLO con el correo, sin explicaciones adicionales:\n\n"${userText}"`;
                } else {
                    const toneLabel = TONE_LABELS[genState.tone] || genState.tone;
                    return `Reescribe el siguiente texto con un tono ${toneLabel}. Conserva el significado original pero adapta el estilo, vocabulario y estructura al tono indicado. Responde SOLO con el texto reescrito, sin explicaciones:\n\n"${userText}"`;
                }
            }
            case 'imagen': {
                const stylePrompt = IMAGE_STYLE_PROMPTS[genState.imageStyle] || '';
                return `${userText}, ${stylePrompt}`;
            }
            case 'video': {
                const stylePrompt = IMAGE_STYLE_PROMPTS[genState.videoStyle] || '';
                return `${userText}, ${stylePrompt}`;
            }
            case 'musica': {
                const genrePrompt = MUSIC_GENRE_PROMPTS[genState.musicGenre] || '';
                return `${userText ? userText + ', ' : ''}${genrePrompt}`;
            }
            default:
                return userText;
        }
    }

    // ============================================
    // FORCE_TYPE SEGÚN TAB
    // ============================================
    function getForceType() {
        const map = { texto: 1, imagen: 2, video: 3, musica: 4 };
        return map[genState.activeTab] || 1;
    }

    // ============================================
    // ETIQUETA DE RESULTADO
    // ============================================
    function getResultBadge() {
        const tab = TAB_LABELS[genState.activeTab];
        if (!tab) return 'Generado';
        if (genState.activeTab === 'texto') {
            if (genState.textType === 'correo') return '📧 Correo';
            return `🎭 ${TONE_LABELS[genState.tone] || genState.tone}`;
        }
        if (genState.activeTab === 'imagen') return `🖼️ ${STYLE_LABELS[genState.imageStyle] || ''}`;
        if (genState.activeTab === 'video') return `🎬 ${STYLE_LABELS[genState.videoStyle] || ''}`;
        if (genState.activeTab === 'musica') return `🎵 ${GENRE_LABELS[genState.musicGenre] || ''}`;
        return tab.label;
    }

    // ============================================
    // RENDERIZAR RESULTADO
    // ============================================
    function renderResult(data) {
        const badge = getResultBadge();
        const tab = genState.activeTab;

        if (tab === 'texto') {
            const text = data.response || data.reply || data.text || data.content || '';
            const escaped = text.replace(/</g, '&lt;').replace(/>/g, '&gt;');
            showResult({
                title: '✍️ Texto generado', badge,
                body: { html: `<div class="gen-text-output">${escaped}</div>`, actions: buildCopyBtn(text) }
            });
            apiSaveHistory('texto', badge, _lastUserText, text).then(() => {
                $('gen-history-section').style.display = 'block';
                _histPage = 1; _activeHistTab = 'texto';
                renderHistory();
            });
        }
        else if (tab === 'imagen') {
            const url = data.image_url || data.url || '';
            if (!url) { showError('No se recibió URL de imagen.'); return; }
            showResult({
                title: '🖼️ Imagen generada', badge,
                body: { html: `<img class="gen-image-output" src="${escAttr(url)}" alt="Imagen generada" loading="lazy">`, actions: buildDownloadBtn(url, 'imagen-mirai.png') + buildCopyUrlBtn(url) + buildEditBtn(url) }
            });
            apiSaveHistory('imagen', badge, _lastUserText, url).then(() => {
                $('gen-history-section').style.display = 'block';
                _histPage = 1; _activeHistTab = 'imagen';
                renderHistory();
            });
        }
        else if (tab === 'video') {
            const url = data.video_url || data.url || '';
            if (!url) { showError('No se recibió URL de vídeo.'); return; }
            showResult({
                title: '🎬 Vídeo generado', badge,
                body: { html: `<video class="gen-video-output" controls src="${escAttr(url)}"></video>`, actions: buildDownloadBtn(url, 'video-mirai.mp4') }
            });
            apiSaveHistory('video', badge, _lastUserText, url).then(() => {
                $('gen-history-section').style.display = 'block';
                _histPage = 1; _activeHistTab = 'video';
                renderHistory();
            });
        }
        else if (tab === 'musica') {
            const url = data.audio_url || data.url || '';
            if (!url) { showError('No se recibió URL de audio.'); return; }
            showResult({
                title: '🎵 Música generada', badge,
                body: { html: `<audio class="gen-audio-output" controls src="${escAttr(url)}"></audio>`, actions: buildDownloadBtn(url, 'musica-mirai.mp3') }
            });
            apiSaveHistory('musica', badge, _lastUserText, url).then(() => {
                $('gen-history-section').style.display = 'block';
                _histPage = 1; _activeHistTab = 'musica';
                renderHistory();
            });
        }
    }

    // ============================================
    // BOTONES DE ACCIÓN
    // ============================================
    function buildCopyBtn(text) {
        return `<button class="gen-action-btn" id="gen-copy-btn" onclick="window._genCopy(this)">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor">
                <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
            </svg>
            Copiar texto
        </button>`;
    }

    function buildDownloadBtn(url, filename) {
        return `<a class="gen-action-btn" href="${escAttr(url)}" download="${filename}" target="_blank">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor">
                <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
            </svg>
            Descargar
        </a>`;
    }

    function buildCopyUrlBtn(url) {
        return `<button class="gen-action-btn" onclick="window._genCopyUrl(this,'${escAttr(url)}')">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor">
                <path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/>
            </svg>
            Copiar URL
        </button>`;
    }

    function escAttr(str) {
        return String(str).replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    // Funciones globales para botones inline
    window._genCopy = function (btn) {
        const output = document.querySelector('.gen-text-output');
        if (!output) return;
        navigator.clipboard.writeText(output.textContent).then(() => {
            btn.classList.add('copied');
            btn.textContent = '✓ Copiado';
            setTimeout(() => {
                btn.classList.remove('copied');
                btn.innerHTML = `<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg> Copiar texto`;
            }, 2200);
        });
    };

    window._genCopyUrl = function (btn, url) {
        navigator.clipboard.writeText(url).then(() => {
            btn.classList.add('copied');
            btn.textContent = '✓ URL copiada';
            setTimeout(() => { btn.classList.remove('copied'); btn.textContent = 'Copiar URL'; }, 2200);
        });
    };

    // ============================================
    // LLAMADA A LA API
    // ============================================
    async function generate(userText) {
        if (genState.isLoading) return;

        const tab = genState.activeTab;

        if (tab === 'editar') {
            return generateEdit(userText);
        }

        if (!userText.trim()) {
            showError('Escribe algo antes de generar.');
            return;
        }

        hideResult();
        $('gen-error').classList.remove('visible');

        const icons = { texto: '✍️', imagen: '🖼️', video: '🎬', musica: '🎵' };
        const loadMsgs = { texto: 'Redactando texto...', imagen: 'Generando imagen...', video: 'Generando vídeo...', musica: 'Componiendo música...' };
        setLoading(true, loadMsgs[tab] || 'Generando...', icons[tab] || '✨');

        _lastUserText = userText;
        const prompt = buildPrompt(userText);
        const forceType = getForceType();

        const conversationId = `gen_${Date.now()}`;

        try {
            const res = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({
                    message: prompt,
                    conversation_id: conversationId,
                    force_type: forceType,
                    skip_history: true
                })
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || `Error ${res.status}`);
            }

            const data = await res.json();
            renderResult(data);

        } catch (err) {
            console.error('❌ generation.js error:', err);
            showError('Error al generar: ' + (err.message || 'Inténtalo de nuevo.'));
        } finally {
            setLoading(false);
        }
    }

    // ============================================
    // EDICIÓN DE IMAGEN
    // ============================================
    async function generateEdit(userText) {
        if (!genState.editImageUrl) {
            showError('Primero selecciona una imagen para editar.');
            return;
        }

        const styleSelect = $('gen-edit-style-select');
        const stylePrompt = styleSelect ? styleSelect.value : '';
        const combinedPrompt = [userText.trim(), stylePrompt].filter(Boolean).join('. ');

        if (!combinedPrompt) {
            showError('Escribe una instrucción de edición o selecciona un estilo predefinido.');
            return;
        }

        hideResult();
        $('gen-error').classList.remove('visible');
        setLoading(true, 'Editando imagen...', '✏️');
        _lastUserText = combinedPrompt;

        try {
            const res = await fetch('/api/image-edit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({
                    prompt: combinedPrompt,
                    image_url: genState.editImageUrl,
                    aspect_ratio: genState.editAspect,
                })
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || `Error ${res.status}`);
            }

            const data = await res.json();
            const url = data.image_url || '';
            if (!url) { showError('No se recibió la imagen editada.'); return; }

            showResult({
                title: '✏️ Imagen editada', badge: '✏️ Edición',
                body: {
                    html: `<img class="gen-image-output" src="${escAttr(url)}" alt="Imagen editada" loading="lazy">`,
                    actions: buildDownloadBtn(url, 'editada-mirai.jpg') + buildCopyUrlBtn(url) + buildEditBtn(url)
                }
            });

            apiSaveHistory('editar', '✏️ Edición', _lastUserText, url).then(() => {
                $('gen-history-section').style.display = 'block';
                _histPage = 1; _activeHistTab = 'editar';
                renderHistory();
            });

        } catch (err) {
            console.error('❌ image-edit error:', err);
            showError('Error al editar: ' + (err.message || 'Inténtalo de nuevo.'));
        } finally {
            setLoading(false);
        }
    }

    function buildEditBtn(imageUrl) {
        const safe = escAttr(imageUrl);
        return `<button class="gen-action-btn" onclick="window._genEditImage('${safe}')">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor">
                <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
            </svg>
            Editar
        </button>`;
    }

    window._genEditImage = function (imageUrl) {
        genState.editImageUrl = imageUrl;
        genState.activeTab = 'editar';

        document.querySelectorAll('#gen-tabs .filter-pill').forEach(b => b.classList.toggle('active', b.dataset.tab === 'editar'));
        document.querySelectorAll('.gen-panel').forEach(p => p.style.display = 'none');
        const panel = document.getElementById('panel-editar');
        if (panel) panel.style.display = 'block';

        setEditPreview(imageUrl);
        updatePlaceholder();
        hideResult();
        $('gen-input').focus();
    };

    function setEditPreview(url) {
        const preview = $('gen-edit-preview-img');
        const sourceWrap = $('gen-edit-source');
        const uploadWrap = $('gen-edit-upload');
        if (url) {
            preview.src = url;
            sourceWrap.style.display = 'block';
            uploadWrap.style.display = 'none';
            genState.editImageUrl = url;
        } else {
            preview.src = '';
            sourceWrap.style.display = 'none';
            uploadWrap.style.display = 'block';
            genState.editImageUrl = '';
        }
    }

    function initEditPanel() {
        initStyleOpts('edit-aspect-opts', 'editAspect');

        const changeBtn = $('gen-edit-change-btn');
        if (changeBtn) changeBtn.addEventListener('click', () => setEditPreview(''));

        const dropZone = $('gen-edit-drop-zone');
        const fileInput = $('gen-edit-file-input');

        if (dropZone && fileInput) {
            dropZone.addEventListener('click', () => fileInput.click());
            dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
            dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
            dropZone.addEventListener('drop', (e) => {
                e.preventDefault();
                dropZone.classList.remove('dragover');
                const file = e.dataTransfer.files[0];
                if (file && file.type.startsWith('image/')) handleEditFile(file);
            });
            fileInput.addEventListener('change', () => {
                if (fileInput.files[0]) handleEditFile(fileInput.files[0]);
            });
        }

        const urlLoadBtn = $('gen-edit-url-load-btn');
        if (urlLoadBtn) {
            urlLoadBtn.addEventListener('click', () => {
                const url = $('gen-edit-url-input').value.trim();
                if (url) setEditPreview(url);
            });
        }
    }

    function handleEditFile(file) {
        const reader = new FileReader();
        reader.onload = (e) => setEditPreview(e.target.result);
        reader.readAsDataURL(file);
    }

    // ============================================
    // HISTORIAL — API D1
    // ============================================
    let _lastUserText = '';
    let _activeHistTab = 'texto';
    let _histPage = 1;
    let _histHasMore = false;

    async function apiSaveHistory(type, badge, prompt, result) {
        try {
            await fetch('/api/gen-history', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({ type, badge, prompt, result })
            });
        } catch (e) { console.warn('No se pudo guardar en historial:', e); }
    }

    async function apiLoadHistory(type, page = 1) {
        const res = await fetch(`/api/gen-history?type=${type}&page=${page}`, {
            credentials: 'same-origin'
        });
        if (!res.ok) throw new Error('Error cargando historial');
        return await res.json();
    }

    async function apiDeleteHistory(id = null, type = null) {
        let url = '/api/gen-history';
        if (id) url += `?id=${id}`;
        else if (type) url += `?type=${type}`;
        await fetch(url, { method: 'DELETE', credentials: 'same-origin' });
    }

    function formatDate(iso) {
        try {
            const d = new Date(iso);
            return d.toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' })
                + ' ' + d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
        } catch { return ''; }
    }

    function buildHistCard(item) {
        const type = item.type;
        const del = `<button class="gen-hist-del-btn" onclick="window._genHistDel(${item.id})" title="Eliminar">🗑️</button>`;
        let preview = '', actions = '';

        if (type === 'texto') {
            const safe = (item.result || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            preview = `<div class="gen-hist-preview-text">${safe}</div>`;
            actions = `<button class="gen-action-btn" style="font-size:0.78rem;padding:5px 12px" onclick="window._genHistCopy(this,${item.id})">Copiar</button>`;
        } else if (type === 'imagen') {
            preview = item.result ? `<img class="gen-hist-img" src="${escAttr(item.result)}" alt="Imagen" loading="lazy">` : '';
            actions = item.result ? `<a class="gen-action-btn" style="font-size:0.78rem;padding:5px 12px" href="${escAttr(item.result)}" download="imagen-mirai.png" target="_blank">Descargar</a><button class="gen-action-btn" style="font-size:0.78rem;padding:5px 12px" onclick="window._genEditImage('${escAttr(item.result)}')">Editar</button>` : '';
        } else if (type === 'editar') {
            preview = item.result ? `<img class="gen-hist-img" src="${escAttr(item.result)}" alt="Editada" loading="lazy">` : '';
            actions = item.result ? `<a class="gen-action-btn" style="font-size:0.78rem;padding:5px 12px" href="${escAttr(item.result)}" download="editada-mirai.jpg" target="_blank">Descargar</a><button class="gen-action-btn" style="font-size:0.78rem;padding:5px 12px" onclick="window._genEditImage('${escAttr(item.result)}')">Re-editar</button>` : '';
        } else if (type === 'video') {
            preview = item.result ? `<video style="width:100%;border-radius:8px;max-height:160px" controls src="${escAttr(item.result)}"></video>` : '';
            actions = item.result ? `<a class="gen-action-btn" style="font-size:0.78rem;padding:5px 12px" href="${escAttr(item.result)}" download="video-mirai.mp4" target="_blank">Descargar</a>` : '';
        } else if (type === 'musica') {
            preview = item.result ? `<audio class="gen-hist-audio" controls src="${escAttr(item.result)}"></audio>` : '';
            actions = item.result ? `<a class="gen-action-btn" style="font-size:0.78rem;padding:5px 12px" href="${escAttr(item.result)}" download="musica-mirai.mp3" target="_blank">Descargar</a>` : '';
        }

        return `<div class="gen-hist-card">
            <div class="gen-hist-card-meta">
                <span class="gen-hist-badge">${escAttr(item.badge || type)}</span>
                <span class="gen-hist-date">${formatDate(item.created_at)}</span>
            </div>
            <div class="gen-hist-prompt">${(item.prompt || '').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
            ${preview}
            <div class="gen-hist-actions">${actions}${del}</div>
        </div>`;
    }

    async function renderHistory(append = false) {
        const list = $('gen-history-list');
        if (!append) list.innerHTML = `<div class="gen-history-empty" style="padding:24px 0;">Cargando...</div>`;

        try {
            const data = await apiLoadHistory(_activeHistTab, _histPage);
            const items = data.items || [];
            _histHasMore = items.length === data.limit;

            if (!append && items.length === 0) {
                list.innerHTML = `<div class="gen-history-empty">No hay generaciones de este tipo aún.</div>`;
                $('gen-history-more').style.display = 'none';
                return;
            }

            if (append) {
                // Asegurar que hay un grid
                let grid = list.querySelector('.gen-history-grid');
                if (!grid) { grid = document.createElement('div'); grid.className = 'gen-history-grid'; list.appendChild(grid); }
                grid.insertAdjacentHTML('beforeend', items.map(buildHistCard).join(''));
            } else {
                list.innerHTML = `<div class="gen-history-grid">${items.map(buildHistCard).join('')}</div>`;
            }

            $('gen-history-more').style.display = _histHasMore ? 'block' : 'none';
        } catch (e) {
            list.innerHTML = `<div class="gen-history-empty">Error al cargar historial.</div>`;
        }
    }

    function initHistoryTabs() {
        document.querySelectorAll('#gen-history-tabs .filter-pill').forEach(btn => {
            btn.addEventListener('click', () => {
                _activeHistTab = btn.dataset.htab;
                _histPage = 1;
                document.querySelectorAll('#gen-history-tabs .filter-pill').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                renderHistory();
            });
        });

        $('gen-hist-clear-tab-btn').addEventListener('click', async () => {
            if (!confirm(`¿Borrar todo el historial de ${_activeHistTab}?`)) return;
            await apiDeleteHistory(null, _activeHistTab);
            _histPage = 1;
            renderHistory();
        });

        $('gen-hist-clear-all-btn').addEventListener('click', async () => {
            if (!confirm('¿Borrar TODO el historial de generación?')) return;
            await apiDeleteHistory();
            _histPage = 1;
            renderHistory();
        });

        $('gen-hist-load-more').addEventListener('click', () => {
            _histPage++;
            renderHistory(true);
        });
    }

    // Funciones globales para tarjetas del historial
    window._genHistDel = async function (id) {
        await apiDeleteHistory(id);
        // Quitar card del DOM sin recargar
        const grid = document.querySelector('.gen-history-grid');
        if (!grid) return;
        const cards = grid.querySelectorAll('.gen-hist-card');
        // No tenemos referencia directa al id en el DOM, recargamos
        _histPage = 1;
        renderHistory();
    };

    window._genHistCopy = function (btn, id) {
        // Buscar el texto en el preview del card padre
        const card = btn.closest('.gen-hist-card');
        const preview = card && card.querySelector('.gen-hist-preview-text');
        if (!preview) return;
        navigator.clipboard.writeText(preview.textContent).then(() => {
            btn.textContent = '✓ Copiado';
            btn.classList.add('copied');
            setTimeout(() => { btn.textContent = 'Copiar'; btn.classList.remove('copied'); }, 2000);
        });
    };

    // ============================================
    // LOGOUT
    // ============================================
    function setupLogout() {
        const btn = document.getElementById('logout-btn');
        if (!btn) return;
        btn.addEventListener('click', async () => {
            if (!confirm('¿Deseas cerrar sesión?')) return;
            try { await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' }); } catch (e) { }
            localStorage.removeItem('mirai-ai-conversation-id');
            window.location.href = 'login';
        });
    }

    // ============================================
    // INICIALIZACIÓN
    // ============================================
    document.addEventListener('DOMContentLoaded', () => {
        console.log('✨ generation.js iniciado');

        setupLogout();
        initTabs();
        initTextTypeOpts();
        initStyleOpts('image-style-opts', 'imageStyle');
        initStyleOpts('video-style-opts', 'videoStyle');
        initStyleOpts('music-genre-opts', 'musicGenre');
        initEditPanel();
        initHistoryTabs();
        updatePlaceholder();

        // Mostrar solo el panel activo al inicio
        document.querySelectorAll('.gen-panel').forEach(p => p.style.display = 'none');
        const firstPanel = document.getElementById('panel-' + genState.activeTab);
        if (firstPanel) firstPanel.style.display = 'block';

        // Cargar historial al abrir
        (async () => {
            try {
                const data = await apiLoadHistory(_activeHistTab, 1);
                if ((data.items || []).length > 0) {
                    $('gen-history-section').style.display = 'block';
                    renderHistory();
                }
            } catch (e) { }
        })();

        // Textarea auto-resize
        const input = $('gen-input');
        input.addEventListener('input', () => autoResize(input));
        $('gen-send-btn').addEventListener('click', () => { generate(input.value.trim()); });
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                generate(input.value.trim());
            }
        });
        initRealtimeGeneration();
    });

    function initRealtimeGeneration() {
        const rt = window.MiraiRealtime.getInstance();

        rt.subscribe('generation', (items) => {
            items.forEach(item => {
                const exists = document.querySelector(`[data-gen-id="${item.id}"]`);
                if (!exists && typeof prependGenItem === 'function') {
                    prependGenItem(item);
                } else if (!exists && typeof loadHistory === 'function') {
                    loadHistory();
                    return;
                }
            });
        });

        rt.start();
    }

})();