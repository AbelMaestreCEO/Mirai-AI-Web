/**
 * ============================================
 * MIRAI AI - generation.js
 * Módulo de Generación con IA
 * Maneja: texto (correo, tono, resumen, etc.), imagen, vídeo, música
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
        tone: '',
        language: 'ingles',
        imageStyle: 'cinematografico',
        videoStyle: 'cinematografico',
        musicGenre: 'pop',
        assetStyle: 'pixelart',
        editAspect: 'match_input_image',
        editImageUrl: '',
        // Motor y formato de imagen (p-image vs p-image-ideogram). El aspecto
        // ya no está fijo en 1:1 en el backend, así que se elige aquí.
        imageEngine: 'p-image',
        imageAspect: '1:1',
        imageQuality: 'high',
        imageSize: '1K',
        assetEngine: 'p-image',
        assetAspect: '1:1',
        // Opciones de p-video. `videoDraft` llega como string desde los pills.
        videoResolution: '720p',
        videoAspect: '16:9',
        videoDuration: '5',
        videoDraft: 'false',
        // Vídeo avanzado: p-video-edit / p-video-animate / p-video-replace
        vidEditMode: 'edit',
        vidEditVideoDataUrl: '',
        vidEditImages: [],
        vidEditCharacterId: null,
        vidEditCharacterUrl: '',
        vidEditResolution: '720p',
        vidEditDraft: 'false',
        avatarAudioMode: 'script',
        avatarVoice: 'Zephyr (Female)',
        avatarLanguage: 'English (US)',
        avatarResolution: '720p',
        avatarImageDataUrl: '',
        avatarCharacterId: null,
        avatarAudioDataUrl: '',
        isLoading: false
    };

    // ============================================
    // MAPAS DE ETIQUETAS
    // ============================================
    const TAB_LABELS = {
        texto: { icon: '✍️', label: 'Texto' },
        imagen: { icon: '🖼️', label: 'Imagen' },
        activos: { icon: '🧩', label: 'Activos' },
        videoedit: { icon: '🎞️', label: 'Vídeo Avanzado' },
        video: { icon: '🎬', label: 'Vídeo' },
        avatar: { icon: '🗣️', label: 'Vídeo Avatar' },
        musica: { icon: '🎵', label: 'Música' }
    };

    const TEXT_TYPE_LABELS = {
        correo: 'Correo',
        tono: 'Cambio de tono',
        resumen: 'Resumen',
        traduccion: 'Traducción',
        historia: 'Historia',
        poema: 'Poema',
        eslogan: 'Eslogan',
        publicacion: 'Publicación',
        carta: 'Carta formal',
        descripcion: 'Descripción'
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
        ingenioso: 'Ingenioso',
        misterioso: 'Misterioso',
        sarcastico: 'Sarcástico',
        motivacional: 'Motivacional',
        romantico: 'Romántico'
    };

    const STYLE_LABELS = {
        cinematografico: 'Cinematográfico',
        cartoon: 'Cartoon',
        anime: 'Anime',
        fotorrealista: 'Fotorrealista'
    };

    const ASSET_STYLE_LABELS = {
        pixelart: 'Pixel Art',
        cartoon2d: '2D Cartoon',
        anime2d: '2D Animé',
        animechibi: '2D Anime Chibi'
    };

    const GENRE_LABELS = {
        pop: 'Pop',
        rock: 'Rock',
        balada: 'Balada',
        orquestal: 'Orquestal',
        electronica: 'Electrónica',
        videojuego: 'Videojuego'
    };

    const IMAGE_STYLE_PROMPTS = {
        cinematografico: 'cinematic style, dramatic lighting, wide angle, film grain, movie still, high contrast, epic composition',
        cartoon: 'cartoon style, colorful, flat design, bold outlines, vibrant colors, animated look, fun illustration',
        anime: 'anime style, detailed, Japanese animation, expressive eyes, clean linework, soft colors, manga aesthetic',
        fotorrealista: 'photorealistic, ultra detailed, 8K resolution, real photography, natural lighting, lifelike textures, DSLR quality'
    };

    const ASSET_STYLE_PROMPTS = {
        pixelart: 'pixel art style, retro video game sprite, crisp pixel edges, limited color palette, clean silhouette',
        cartoon2d: '2D cartoon style, bold clean outlines, flat vibrant colors, simple cel shading, game asset illustration',
        anime2d: '2D anime style, clean linework, cel-shaded coloring, expressive character design',
        animechibi: '2D chibi anime style, super deformed proportions, big expressive eyes, cute rounded features'
    };

    const ASSET_QUALITY_SUFFIX = 'isolated on a solid pure white background, no shadows, no extra elements, professional game asset quality, ultra high resolution, sharp clean details';

    // Los tres modelos de vídeo avanzado de Pruna. Comparten pantalla y polling;
    // solo cambian el endpoint, qué campos exigen y cómo se etiqueta el resultado.
    const VID_EDIT_MODES = {
        edit: {
            endpoint: '/api/video-edit',
            badge: '✂️ Edición de vídeo',
            title: '✂️ Vídeo editado',
            loading: 'Editando vídeo...',
            icon: '✂️',
            needsPrompt: true,
            needsImages: false,
            maxImages: 0,
            supportsDraft: true,
            supportsResolution: false,
            hint: 'Describe el cambio y se aplica sobre el vídeo de origen. Máximo 15 segundos de vídeo.'
        },
        animate: {
            endpoint: '/api/video-animate',
            badge: '🕺 Animación',
            title: '🕺 Personaje animado',
            loading: 'Animando personaje...',
            icon: '🕺',
            needsPrompt: false,
            needsImages: true,
            maxImages: 1,
            supportsDraft: false,
            supportsResolution: true,
            hint: 'El personaje de la imagen se mueve copiando el movimiento, el ritmo y la cámara del vídeo de origen.'
        },
        replace: {
            endpoint: '/api/video-replace',
            badge: '🔁 Reemplazo',
            title: '🔁 Personas reemplazadas',
            loading: 'Reemplazando personas...',
            icon: '🔁',
            needsPrompt: false,
            needsImages: true,
            maxImages: 4,
            supportsDraft: false,
            supportsResolution: true,
            hint: 'Las personas del vídeo de origen se sustituyen por las identidades de las imágenes de referencia (hasta 4).'
        }
    };

    // Un vídeo se manda como data URI dentro del JSON, así que pesa ~33% más
    // que el fichero. Se corta en el cliente con un mensaje claro en vez de
    // dejar que el Worker rechace el body con un error opaco.
    const VID_EDIT_MAX_BYTES = 25 * 1024 * 1024;

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

                document.querySelectorAll('#gen-tabs .filter-pill').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                document.querySelectorAll('.gen-panel').forEach(p => p.style.display = 'none');
                const panel = document.getElementById('panel-' + tab);
                if (panel) panel.style.display = 'block';

                hideResult();
                $('gen-error').classList.remove('visible');
                updatePlaceholder();

                _activeHistTab = tab;
                _histPage = 1;
                renderHistory();
            });
        });
    }

    function updatePlaceholder() {
        const placeholders = {
            texto: '¿Qué quieres escribir? Ej: "Escribe un correo solicitando vacaciones"',
            imagen: 'Describe la imagen que quieres generar...',
            editar: 'Describe la edición que quieres aplicar...',
            activos: 'Describe el activo que quieres generar (personaje, objeto, ícono...)...',
            video: 'Describe el vídeo que quieres generar...',
            videoedit: 'Describe la edición del vídeo...',
            avatar: 'Escribe el guion que dirá el personaje (guion de voz)...',
            musica: 'Describe la música que quieres generar...'
        };
        // En vídeo avanzado el campo cambia de significado según el modo:
        // en "editar" es la instrucción obligatoria, en los otros dos es una
        // indicación opcional sobre cómo colocar al personaje.
        if (genState.activeTab === 'videoedit') {
            $('gen-input').placeholder = genState.vidEditMode === 'edit'
                ? 'Describe la edición: "Cambia el cielo por un atardecer"...'
                : 'Instrucción opcional sobre el personaje y el movimiento...';
            return;
        }
        $('gen-input').placeholder = placeholders[genState.activeTab] || '¿Qué quieres generar?';
    }

    // ============================================
    // OPCIONES DE TEXTO (dropdowns)
    // ============================================
    function initTextOpts() {
        const typeSelect = $('text-type-select');
        const toneWrapper = $('tone-select-wrapper');
        const langWrapper = $('language-select-wrapper');
        const toneSelect = $('tone-select');
        const langSelect = $('language-select');

        typeSelect.addEventListener('change', () => {
            genState.textType = typeSelect.value;
            toneWrapper.style.display = (genState.textType === 'tono') ? 'none' : 'flex';
            langWrapper.style.display = (genState.textType === 'traduccion') ? 'flex' : 'none';
            if (genState.textType === 'tono') {
                toneSelect.value = 'alegre';
                genState.tone = 'alegre';
                toneWrapper.style.display = 'flex';
            }
        });

        toneSelect.addEventListener('change', () => {
            genState.tone = toneSelect.value;
        });

        langSelect.addEventListener('change', () => {
            genState.language = langSelect.value;
        });
    }

    // ============================================
    // OPCIONES IMAGEN, VÍDEO, MÚSICA (pills)
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

    // El selector de calidad y tamaño solo aplica a p-image-ideogram (es lo que
    // determina su precio); con el motor estándar no tiene ningún efecto, así
    // que se oculta en vez de dejarlo ahí sin hacer nada.
    function initImageEngineOpts() {
        initStyleOpts('image-engine-opts', 'imageEngine');
        initStyleOpts('asset-engine-opts', 'assetEngine');

        const qualityWrap = $('gen-image-quality-wrap');
        document.querySelectorAll('#image-engine-opts .filter-pill').forEach(btn => {
            btn.addEventListener('click', () => {
                if (qualityWrap) {
                    qualityWrap.style.display = btn.dataset.val === 'p-image-ideogram' ? 'block' : 'none';
                }
            });
        });
    }

    // ============================================
    // CONSTRUIR PROMPT FINAL
    // ============================================
    function buildPrompt(userText) {
        switch (genState.activeTab) {
            case 'texto': {
                const toneLabel = genState.tone ? (TONE_LABELS[genState.tone] || genState.tone) : '';
                const toneInstruction = toneLabel ? ` Usa un tono ${toneLabel}.` : '';

                switch (genState.textType) {
                    case 'correo':
                        return `Redacta un correo electrónico profesional y completo (con asunto, saludo, cuerpo y despedida) basado en la siguiente solicitud del usuario.${toneInstruction} Responde SOLO con el correo, sin explicaciones adicionales:\n\n"${userText}"`;
                    case 'tono':
                        return `Reescribe el siguiente texto con un tono ${toneLabel || 'profesional'}. Conserva el significado original pero adapta el estilo, vocabulario y estructura al tono indicado. Responde SOLO con el texto reescrito, sin explicaciones:\n\n"${userText}"`;
                    case 'resumen':
                        return `Haz un resumen claro y conciso del siguiente texto.${toneInstruction} Responde SOLO con el resumen, sin explicaciones adicionales:\n\n"${userText}"`;
                    case 'traduccion': {
                        const lang = genState.language || 'inglés';
                        return `Traduce el siguiente texto al ${lang}. Responde SOLO con la traducción, sin explicaciones:\n\n"${userText}"`;
                    }
                    case 'historia':
                        return `Escribe una historia creativa basada en la siguiente idea.${toneInstruction} Responde SOLO con la historia:\n\n"${userText}"`;
                    case 'poema':
                        return `Escribe un poema basado en la siguiente idea.${toneInstruction} Responde SOLO con el poema:\n\n"${userText}"`;
                    case 'eslogan':
                        return `Genera 5 opciones de eslogan o lema creativos basados en lo siguiente.${toneInstruction} Responde SOLO con los eslóganes numerados:\n\n"${userText}"`;
                    case 'publicacion':
                        return `Escribe una publicación atractiva para redes sociales basada en lo siguiente. Incluye hashtags relevantes.${toneInstruction} Responde SOLO con la publicación:\n\n"${userText}"`;
                    case 'carta':
                        return `Redacta una carta formal completa (con fecha, destinatario, saludo, cuerpo y despedida) basada en lo siguiente.${toneInstruction} Responde SOLO con la carta:\n\n"${userText}"`;
                    case 'descripcion':
                        return `Escribe una descripción atractiva de producto para e-commerce o catálogo basada en lo siguiente.${toneInstruction} Responde SOLO con la descripción:\n\n"${userText}"`;
                    default:
                        return `${userText}${toneInstruction ? '\n\n' + toneInstruction : ''}`;
                }
            }
            case 'imagen': {
                const stylePrompt = IMAGE_STYLE_PROMPTS[genState.imageStyle] || '';
                return `${userText}, ${stylePrompt}`;
            }
            case 'activos': {
                const stylePrompt = ASSET_STYLE_PROMPTS[genState.assetStyle] || '';
                return `${userText}, ${stylePrompt}, ${ASSET_QUALITY_SUFFIX}`;
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
        const map = { texto: 1, imagen: 2, activos: 2, video: 3, musica: 4 };
        return map[genState.activeTab] || 1;
    }

    // ============================================
    // ETIQUETA DE RESULTADO
    // ============================================
    function getResultBadge() {
        const tab = TAB_LABELS[genState.activeTab];
        if (!tab) return 'Generado';
        if (genState.activeTab === 'texto') {
            const typeLabel = TEXT_TYPE_LABELS[genState.textType] || genState.textType;
            if (genState.textType === 'tono' && genState.tone) {
                return `🎭 ${TONE_LABELS[genState.tone] || genState.tone}`;
            }
            return `✍️ ${typeLabel}`;
        }
        if (genState.activeTab === 'imagen') return `🖼️ ${STYLE_LABELS[genState.imageStyle] || ''}`;
        if (genState.activeTab === 'activos') return `🧩 ${ASSET_STYLE_LABELS[genState.assetStyle] || ''}`;
        if (genState.activeTab === 'video') return `🎬 ${STYLE_LABELS[genState.videoStyle] || ''}`;
        if (genState.activeTab === 'videoedit') return VID_EDIT_MODES[genState.vidEditMode].badge;
        if (genState.activeTab === 'avatar') return '🗣️ Vídeo Avatar';
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
                body: { html: `<img class="gen-image-output" src="${escAttr(url)}" alt="Imagen generada" loading="lazy">`, actions: buildImageActions(url, 'imagen-mirai.png') }
            });
            apiSaveHistory('imagen', badge, _lastUserText, url).then(() => {
                $('gen-history-section').style.display = 'block';
                _histPage = 1; _activeHistTab = 'imagen';
                renderHistory();
            });
        }
        else if (tab === 'activos') {
            const url = data.image_url || data.url || '';
            if (!url) { showError('No se recibió URL de imagen.'); return; }
            showResult({
                title: '🧩 Activo generado', badge,
                body: { html: `<img class="gen-image-output" src="${escAttr(url)}" alt="Activo generado" loading="lazy">`, actions: buildImageActions(url, 'activo-mirai.png') }
            });
            apiSaveHistory('activos', badge, _lastUserText, url).then(() => {
                $('gen-history-section').style.display = 'block';
                _histPage = 1; _activeHistTab = 'activos';
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

        if (tab === 'avatar') {
            return generateAvatar(userText);
        }

        if (tab === 'videoedit') {
            return generateAdvancedVideo(userText);
        }

        if (!userText.trim()) {
            showError('Escribe algo antes de generar.');
            return;
        }

        hideResult();
        $('gen-error').classList.remove('visible');

        const icons = { texto: '✍️', imagen: '🖼️', activos: '🧩', video: '🎬', musica: '🎵' };
        const loadMsgs = { texto: 'Redactando texto...', imagen: 'Generando imagen...', activos: 'Generando activo...', video: 'Generando vídeo...', musica: 'Componiendo música...' };
        setLoading(true, loadMsgs[tab] || 'Generando...', icons[tab] || '✨');

        _lastUserText = userText;
        const prompt = buildPrompt(userText);
        const forceType = getForceType();

        const conversationId = `gen_${Date.now()}`;

        const payload = {
            message: prompt,
            conversation_id: conversationId,
            force_type: forceType,
            skip_history: true
        };

        // Motor, aspecto y calidad de imagen: los valida el backend contra su
        // propia lista blanca, aquí solo se mandan los de la pestaña activa.
        if (tab === 'imagen') {
            payload.image_options = {
                engine: genState.imageEngine,
                aspect_ratio: genState.imageAspect,
                thinking: genState.imageQuality,
                image_size: genState.imageSize,
            };
        } else if (tab === 'activos') {
            payload.image_options = {
                engine: genState.assetEngine,
                aspect_ratio: genState.assetAspect,
            };
        } else if (tab === 'video') {
            payload.video_options = {
                resolution: genState.videoResolution,
                aspect_ratio: genState.videoAspect,
                duration: parseInt(genState.videoDuration, 10),
                draft: genState.videoDraft === 'true',
            };
        }

        try {
            const res = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify(payload)
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

        const stylePrompt = ($('gen-edit-style-select') || {}).value || '';
        const bgPrompt = ($('gen-edit-bg-select') || {}).value || '';
        const fxPrompt = ($('gen-edit-fx-select') || {}).value || '';
        const combinedPrompt = [userText.trim(), stylePrompt, bgPrompt, fxPrompt].filter(Boolean).join('. ');

        if (!combinedPrompt) {
            showError('Escribe una instrucción de edición o selecciona al menos una opción.');
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
                    actions: buildImageActions(url, 'editada-mirai.jpg')
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

    // Acciones comunes a cualquier imagen resultante (generada, activo o editada):
    // descargar, copiar URL, reeditar, mejorar calidad (p-image-upscale) y
    // evaluar contra su prompt (p-judger).
    function buildImageActions(url, filename) {
        return buildDownloadBtn(url, filename)
            + buildCopyUrlBtn(url)
            + buildEditBtn(url)
            + buildUpscaleBtn(url)
            + buildJudgeBtn(url);
    }

    function buildUpscaleBtn(imageUrl) {
        return `<button class="gen-action-btn" title="Aumentar resolución y detalle" onclick="window._genUpscale(this,'${escAttr(imageUrl)}')">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor">
                <path d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14zm.5-7H9v2H7v1h2v2h1v-2h2V9h-2V7z"/>
            </svg>
            Mejorar calidad
        </button>`;
    }

    function buildJudgeBtn(imageUrl) {
        return `<button class="gen-action-btn" title="Puntuar la imagen contra su prompt" onclick="window._genJudge(this,'${escAttr(imageUrl)}')">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor">
                <path d="M12 3l1.5 4.5H18l-3.75 2.75L15.75 15 12 12.25 8.25 15l1.5-4.75L6 7.5h4.5L12 3zm-7 16h14v2H5v-2z"/>
            </svg>
            Evaluar
        </button>`;
    }

    // Mejora de calidad con p-image-upscale. 4 MP es el tramo más barato de
    // Pruna ($0.005) y ya cuadruplica una salida típica de 1 MP.
    const UPSCALE_TARGET_MEGAPIXELS = 4;

    // `promptText` lo pasan las tarjetas del historial, que conocen el prompt
    // original de esa imagen; desde el resultado en pantalla basta el último.
    window._genUpscale = async function (btn, imageUrl, promptText) {
        if (genState.isLoading) return;
        const original = btn.innerHTML;
        btn.disabled = true;
        btn.textContent = '⏳ Mejorando...';
        try {
            const res = await fetch('/api/image-upscale', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({ image_url: imageUrl, target: UPSCALE_TARGET_MEGAPIXELS })
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || `Error ${res.status}`);
            }
            const data = await res.json();
            const url = data.image_url;
            if (!url) throw new Error('No se recibió la imagen mejorada.');

            showResult({
                title: '🔍 Imagen mejorada', badge: `🔍 ${data.target_megapixels || UPSCALE_TARGET_MEGAPIXELS} MP`,
                body: {
                    html: `<img class="gen-image-output" src="${escAttr(url)}" alt="Imagen mejorada" loading="lazy">`,
                    actions: buildImageActions(url, 'mejorada-mirai.jpg')
                }
            });

            // Se archiva como 'editar' porque es una imagen derivada de otra:
            // así aparece en una pestaña del historial que el usuario ya visita.
            apiSaveHistory('editar', '🔍 Mejorada', promptText || _lastUserText || 'Mejora de calidad', url).then(() => {
                $('gen-history-section').style.display = 'block';
                _histPage = 1; _activeHistTab = 'editar';
                renderHistory();
            });
        } catch (err) {
            console.error('❌ upscale error:', err);
            showError('Error al mejorar la imagen: ' + (err.message || 'Inténtalo de nuevo.'));
            btn.disabled = false;
            btn.innerHTML = original;
        }
    };

    window._genJudge = async function (btn, imageUrl) {
        const prompt = (_lastUserText || '').trim();
        if (!prompt) {
            showError('No hay un prompt asociado a esta imagen para evaluarla.');
            return;
        }
        const original = btn.innerHTML;
        btn.disabled = true;
        btn.textContent = '⏳ Evaluando...';
        try {
            const res = await fetch('/api/image-judge', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({ image_url: imageUrl, prompt })
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || `Error ${res.status}`);
            }
            const data = await res.json();
            renderJudgeScores(data);
            btn.disabled = false;
            btn.innerHTML = original;
        } catch (err) {
            console.error('❌ judge error:', err);
            showError('Error al evaluar la imagen: ' + (err.message || 'Inténtalo de nuevo.'));
            btn.disabled = false;
            btn.innerHTML = original;
        }
    };

    // p-judger devuelve un total y un desglose por niveles cuyo detalle exacto
    // depende del modelo, así que se pinta lo que venga en vez de asumir campos.
    function renderJudgeScores(data) {
        const body = $('gen-result-body');
        if (!body) return;

        const rows = Object.entries(data.scores || {})
            .filter(([, v]) => typeof v === 'number' || typeof v === 'string')
            .map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:var(--text-secondary)">${escAttr(k)}</td><td style="padding:4px 0;font-weight:600">${escAttr(v)}</td></tr>`)
            .join('');

        const totalLine = data.total != null
            ? `<div style="font-size:1.4rem;font-weight:700;margin-bottom:6px;">⚖️ ${escAttr(data.total)}</div>`
            : '';

        const existing = body.querySelector('#gen-judge-panel');
        if (existing) existing.remove();

        body.insertAdjacentHTML('beforeend', `
            <div id="gen-judge-panel" style="margin-top:14px;padding:12px 14px;border-radius:10px;background:var(--bg-secondary,rgba(127,127,127,.08));">
                <div style="font-size:0.82rem;color:var(--text-secondary);margin-bottom:6px;">Evaluación de la imagen frente a su prompt (p-judger)</div>
                ${totalLine}
                ${rows ? `<table style="font-size:0.85rem;border-collapse:collapse;">${rows}</table>` : '<div style="font-size:0.85rem;">Sin desglose disponible.</div>'}
            </div>
        `);
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
    // VÍDEO AVATAR (Pruna P-Video-Avatar) + PERSONAJES
    // ============================================
    async function generateAvatar(userText) {
        const audioMode = genState.avatarAudioMode;

        if (!genState.avatarCharacterId && !genState.avatarImageDataUrl) {
            showError('Sube o selecciona un personaje primero.');
            return;
        }
        if (audioMode === 'script' && !userText.trim()) {
            showError('Escribe el guion que dirá el personaje.');
            return;
        }
        if (audioMode === 'audio' && !genState.avatarAudioDataUrl) {
            showError('Sube un archivo de audio.');
            return;
        }

        hideResult();
        $('gen-error').classList.remove('visible');
        setLoading(true, 'Generando vídeo avatar...', '🗣️');
        _lastUserText = audioMode === 'script' ? userText.trim() : '(audio subido)';

        const payload = {
            voice: genState.avatarVoice,
            voice_language: genState.avatarLanguage,
            resolution: genState.avatarResolution,
        };

        if (genState.avatarCharacterId) {
            payload.character_id = genState.avatarCharacterId;
        } else {
            payload.image = genState.avatarImageDataUrl;
            const nameInput = $('gen-avatar-name-input');
            if (nameInput && nameInput.value.trim()) payload.character_name = nameInput.value.trim();
        }

        if (audioMode === 'audio') {
            payload.audio = genState.avatarAudioDataUrl;
        } else {
            payload.voice_script = userText.trim();
        }

        const videoPromptVal = ($('avatar-video-prompt-input') || {}).value || '';
        const voicePromptVal = ($('avatar-voice-prompt-input') || {}).value || '';
        const negPromptVal = ($('avatar-negative-prompt-input') || {}).value || '';
        if (videoPromptVal.trim()) payload.video_prompt = videoPromptVal.trim();
        if (voicePromptVal.trim()) payload.voice_prompt = voicePromptVal.trim();
        if (negPromptVal.trim()) payload.negative_prompt = negPromptVal.trim();

        try {
            const res = await fetch('/api/generate-video-avatar', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify(payload)
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || `Error ${res.status}`);
            }

            const data = await res.json();
            if (!data.job_id) { showError('No se pudo iniciar la generación del vídeo.'); setLoading(false); return; }

            if (data.character && data.character.id) {
                genState.avatarCharacterId = data.character.id;
                genState.avatarImageDataUrl = '';
                setAvatarPreview(data.character.image_url, data.character.name);
                loadAvatarCharacters();
            }

            await pollVideoJob(data.job_id, {
                title: '🗣️ Vídeo avatar generado',
                badge: '🗣️ Avatar',
                loading: 'Generando vídeo avatar...',
                icon: '🗣️',
                filename: 'avatar-mirai.mp4',
                historyTab: 'avatar',
                errorLabel: 'el vídeo avatar',
            });

        } catch (err) {
            console.error('❌ video-avatar error:', err);
            showError('Error al generar el vídeo avatar: ' + (err.message || 'Inténtalo de nuevo.'));
            setLoading(false);
        }
    }

    // Los modelos de vídeo con job asíncrono (avatar, editar, animar,
    // reemplazar) pueden tardar varios minutos, así que el backend responde de
    // inmediato con un job_id y aquí se consulta su estado periódicamente en vez
    // de esperar una única petición larga (que Cloudflare no puede mantener
    // abierta tanto tiempo). Los cuatro comparten este bucle: solo cambian las
    // etiquetas y la pestaña del historial donde aterriza el resultado.
    const VIDEO_POLL_INTERVAL_MS = 5000;
    const VIDEO_POLL_MAX_ATTEMPTS = 96; // ~8 minutos

    function pollVideoJob(jobId, opts) {
        const { title, badge, loading, icon, filename, historyTab, errorLabel } = opts;

        return new Promise((resolve) => {
            let attempts = 0;
            const startedAt = Date.now();

            const tick = async () => {
                attempts++;
                const elapsed = Math.round((Date.now() - startedAt) / 1000);
                setLoading(true, `${loading} (${elapsed}s, esto puede tardar varios minutos)`, icon);

                try {
                    const res = await fetch(`/api/video-jobs?id=${encodeURIComponent(jobId)}`, {
                        credentials: 'same-origin'
                    });
                    if (!res.ok) throw new Error(`Error ${res.status}`);
                    const data = await res.json();

                    if (data.status === 'done' && data.video_url) {
                        const url = data.video_url;
                        showResult({
                            title, badge,
                            body: {
                                html: `<video class="gen-video-output" controls src="${escAttr(url)}"></video>`,
                                actions: buildDownloadBtn(url, filename)
                            }
                        });
                        // El backend ya guarda esta generación en el historial al terminar el job.
                        $('gen-history-section').style.display = 'block';
                        _histPage = 1; _activeHistTab = historyTab;
                        renderHistory();
                        setLoading(false);
                        resolve();
                        return;
                    }

                    if (data.status === 'error') {
                        showError(`Error al generar ${errorLabel}: ` + (data.error || 'Inténtalo de nuevo.'));
                        setLoading(false);
                        resolve();
                        return;
                    }

                    if (attempts >= VIDEO_POLL_MAX_ATTEMPTS) {
                        showError('La generación está tardando más de lo esperado. Sigue procesándose en segundo plano; revisa tu historial en unos minutos.');
                        setLoading(false);
                        resolve();
                        return;
                    }

                    setTimeout(tick, VIDEO_POLL_INTERVAL_MS);
                } catch (e) {
                    if (attempts >= VIDEO_POLL_MAX_ATTEMPTS) {
                        showError('No se pudo confirmar el estado del vídeo. Revisa tu historial en unos minutos.');
                        setLoading(false);
                        resolve();
                        return;
                    }
                    setTimeout(tick, VIDEO_POLL_INTERVAL_MS);
                }
            };

            tick();
        });
    }

    // ============================================
    // VÍDEO AVANZADO (P-Video-Edit / P-Video-Animate / P-Video-Replace)
    // ============================================
    async function generateAdvancedVideo(userText) {
        const mode = VID_EDIT_MODES[genState.vidEditMode];

        if (!genState.vidEditVideoDataUrl) {
            showError('Sube o pega la URL del vídeo de origen primero.');
            return;
        }
        if (mode.needsPrompt && !userText.trim()) {
            showError('Escribe la edición que quieres aplicar al vídeo.');
            return;
        }
        if (mode.needsImages && !genState.vidEditCharacterId && genState.vidEditImages.length === 0) {
            showError('Selecciona un personaje guardado o sube al menos una imagen de referencia.');
            return;
        }

        hideResult();
        $('gen-error').classList.remove('visible');
        setLoading(true, mode.loading, mode.icon);
        _lastUserText = userText.trim() || mode.badge;

        const payload = { video: genState.vidEditVideoDataUrl };

        if (mode.needsPrompt) {
            payload.prompt = userText.trim();
        } else if (userText.trim()) {
            payload.instruction_prompt = userText.trim();
        }

        if (genState.vidEditCharacterId) payload.character_id = genState.vidEditCharacterId;
        if (genState.vidEditImages.length) payload.images = genState.vidEditImages.slice(0, mode.maxImages);
        if (mode.supportsResolution) payload.resolution = genState.vidEditResolution;
        if (mode.supportsDraft) payload.draft = genState.vidEditDraft === 'true';

        try {
            const res = await fetch(mode.endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify(payload)
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || `Error ${res.status}`);
            }

            const data = await res.json();
            if (!data.job_id) { showError('No se pudo iniciar la generación del vídeo.'); setLoading(false); return; }

            await pollVideoJob(data.job_id, {
                title: mode.title,
                badge: mode.badge,
                loading: mode.loading,
                icon: mode.icon,
                filename: `${genState.vidEditMode}-mirai.mp4`,
                historyTab: 'videoedit',
                errorLabel: 'el vídeo',
            });

        } catch (err) {
            console.error('❌ video avanzado error:', err);
            showError('Error al generar el vídeo: ' + (err.message || 'Inténtalo de nuevo.'));
            setLoading(false);
        }
    }

    function setVideoEditPreview(url) {
        const preview = $('gen-videoedit-preview');
        const sourceWrap = $('gen-videoedit-source');
        const uploadWrap = $('gen-videoedit-upload');
        if (!preview || !sourceWrap || !uploadWrap) return;
        if (url) {
            preview.src = url;
            sourceWrap.style.display = 'block';
            uploadWrap.style.display = 'none';
            genState.vidEditVideoDataUrl = url;
        } else {
            preview.removeAttribute('src');
            sourceWrap.style.display = 'none';
            uploadWrap.style.display = 'block';
            genState.vidEditVideoDataUrl = '';
        }
    }

    // Muestra u oculta las secciones del panel según lo que acepta cada modelo:
    // solo "editar" tiene modo borrador, y solo "animar"/"reemplazar" piden
    // imágenes de referencia y dejan elegir resolución.
    function applyVideoEditMode() {
        const mode = VID_EDIT_MODES[genState.vidEditMode];
        $('gen-videoedit-hint').textContent = mode.hint;
        $('gen-videoedit-refs').style.display = mode.needsImages ? 'block' : 'none';
        $('gen-videoedit-resolution-wrap').style.display = mode.supportsResolution ? 'block' : 'none';
        $('gen-videoedit-draft-wrap').style.display = mode.supportsDraft ? 'block' : 'none';

        const refsLabel = $('gen-videoedit-refs-label');
        const imgHint = $('gen-videoedit-img-hint');
        if (mode.maxImages === 1) {
            if (refsLabel) refsLabel.textContent = 'Imagen del personaje a animar';
            if (imgHint) imgHint.textContent = 'Arrastra una imagen aquí o haz clic para seleccionar';
        } else if (mode.maxImages > 1) {
            if (refsLabel) refsLabel.textContent = `Imágenes de identidad (hasta ${mode.maxImages})`;
            if (imgHint) imgHint.textContent = 'Arrastra hasta 4 imágenes aquí o haz clic para seleccionar';
        }

        // Al pasar de "reemplazar" (4 imágenes) a "animar" (1) hay que recortar
        // la selección o se mandarían referencias que el modelo ignora.
        if (genState.vidEditImages.length > mode.maxImages) {
            genState.vidEditImages = genState.vidEditImages.slice(0, mode.maxImages);
            renderVideoEditImages();
        }

        updatePlaceholder();
    }

    function renderVideoEditImages() {
        const grid = $('gen-videoedit-img-preview');
        if (!grid) return;
        grid.innerHTML = genState.vidEditImages.map((src, i) => `
            <div class="gen-avatar-char-item">
                <img src="${escAttr(src)}" alt="Referencia ${i + 1}" loading="lazy">
                <span>Ref. ${i + 1}</span>
                <button class="gen-avatar-char-del" onclick="window._genVidEditDelImage(${i})" title="Quitar">✕</button>
            </div>
        `).join('');
    }

    window._genVidEditDelImage = function (index) {
        genState.vidEditImages.splice(index, 1);
        renderVideoEditImages();
    };

    window._genVidEditSelectChar = function (id, imageUrl) {
        // Volver a pulsar el personaje ya elegido lo deselecciona.
        const deselect = genState.vidEditCharacterId === id;
        genState.vidEditCharacterId = deselect ? null : id;
        genState.vidEditCharacterUrl = deselect ? '' : imageUrl;
        document.querySelectorAll('#gen-videoedit-char-grid .gen-avatar-char-item').forEach(el => {
            el.classList.toggle('selected', !deselect && el.dataset.charId === String(id));
        });
    };

    function handleVideoEditFile(file) {
        if (file.size > VID_EDIT_MAX_BYTES) {
            showError(`El vídeo pesa ${(file.size / 1024 / 1024).toFixed(1)} MB; el máximo admitido es ${VID_EDIT_MAX_BYTES / 1024 / 1024} MB. Recórtalo o bájale la resolución.`);
            return;
        }
        const reader = new FileReader();
        reader.onload = (e) => setVideoEditPreview(e.target.result);
        reader.readAsDataURL(file);
    }

    function handleVideoEditImageFiles(files) {
        const mode = VID_EDIT_MODES[genState.vidEditMode];
        const room = mode.maxImages - genState.vidEditImages.length;
        if (room <= 0) {
            showError(`Este modo admite como máximo ${mode.maxImages} imagen(es) de referencia.`);
            return;
        }
        Array.from(files).slice(0, room).forEach(file => {
            if (!file.type.startsWith('image/')) return;
            const reader = new FileReader();
            reader.onload = (e) => {
                genState.vidEditImages.push(e.target.result);
                renderVideoEditImages();
            };
            reader.readAsDataURL(file);
        });
    }

    function initVideoEditPanel() {
        initStyleOpts('videoedit-resolution-opts', 'vidEditResolution');
        initStyleOpts('videoedit-draft-opts', 'vidEditDraft');

        document.querySelectorAll('#videoedit-mode-opts .filter-pill').forEach(btn => {
            btn.addEventListener('click', () => {
                genState.vidEditMode = btn.dataset.val;
                document.querySelectorAll('#videoedit-mode-opts .filter-pill').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                applyVideoEditMode();
            });
        });

        const changeBtn = $('gen-videoedit-change-btn');
        if (changeBtn) changeBtn.addEventListener('click', () => setVideoEditPreview(''));

        const dropZone = $('gen-videoedit-drop-zone');
        const fileInput = $('gen-videoedit-file-input');
        if (dropZone && fileInput) {
            dropZone.addEventListener('click', () => fileInput.click());
            dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
            dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
            dropZone.addEventListener('drop', (e) => {
                e.preventDefault();
                dropZone.classList.remove('dragover');
                const file = e.dataTransfer.files[0];
                if (file && file.type.startsWith('video/')) handleVideoEditFile(file);
            });
            fileInput.addEventListener('change', () => {
                if (fileInput.files[0]) handleVideoEditFile(fileInput.files[0]);
            });
        }

        const urlLoadBtn = $('gen-videoedit-url-load-btn');
        if (urlLoadBtn) {
            urlLoadBtn.addEventListener('click', () => {
                const url = $('gen-videoedit-url-input').value.trim();
                if (url) setVideoEditPreview(url);
            });
        }

        const imgDropZone = $('gen-videoedit-img-drop-zone');
        const imgInput = $('gen-videoedit-img-input');
        if (imgDropZone && imgInput) {
            imgDropZone.addEventListener('click', () => imgInput.click());
            imgDropZone.addEventListener('dragover', (e) => { e.preventDefault(); imgDropZone.classList.add('dragover'); });
            imgDropZone.addEventListener('dragleave', () => imgDropZone.classList.remove('dragover'));
            imgDropZone.addEventListener('drop', (e) => {
                e.preventDefault();
                imgDropZone.classList.remove('dragover');
                handleVideoEditImageFiles(e.dataTransfer.files);
            });
            imgInput.addEventListener('change', () => handleVideoEditImageFiles(imgInput.files));
        }

        applyVideoEditMode();
    }

    async function loadAvatarCharacters() {
        try {
            const res = await fetch('/api/video-avatar/characters', { credentials: 'same-origin' });
            if (!res.ok) return;
            const data = await res.json();
            renderAvatarCharGrid(data.characters || []);
            // Los mismos personajes sirven como referencia de identidad en
            // animar/reemplazar, así que se pintan también en ese panel.
            renderVideoEditCharGrid(data.characters || []);
        } catch (e) { console.warn('No se pudieron cargar los personajes:', e); }
    }

    function renderVideoEditCharGrid(characters) {
        const grid = $('gen-videoedit-char-grid');
        if (!grid) return;
        if (!characters.length) {
            grid.innerHTML = `<div class="gen-avatar-char-empty">Aún no tienes personajes guardados.</div>`;
            return;
        }
        grid.innerHTML = characters.map(c => `
            <div class="gen-avatar-char-item ${genState.vidEditCharacterId === c.id ? 'selected' : ''}" data-char-id="${c.id}" onclick="window._genVidEditSelectChar(${c.id},'${escAttr(c.image_url)}')">
                <img src="${escAttr(c.image_url)}" alt="${escAttr(c.name || 'Personaje')}" loading="lazy">
                <span>${escAttr(c.name || 'Personaje')}</span>
            </div>
        `).join('');
    }

    function renderAvatarCharGrid(characters) {
        const grid = $('gen-avatar-char-grid');
        if (!grid) return;
        if (!characters.length) {
            grid.innerHTML = `<div class="gen-avatar-char-empty" id="gen-avatar-char-empty">Aún no tienes personajes guardados.</div>`;
            return;
        }
        grid.innerHTML = characters.map(c => `
            <div class="gen-avatar-char-item ${genState.avatarCharacterId === c.id ? 'selected' : ''}" data-char-id="${c.id}" onclick="window._genSelectAvatarChar(${c.id},'${escAttr(c.image_url)}','${escAttr(c.name || '')}')">
                <img src="${escAttr(c.image_url)}" alt="${escAttr(c.name || 'Personaje')}" loading="lazy">
                <span>${escAttr(c.name || 'Personaje')}</span>
                <button class="gen-avatar-char-del" onclick="event.stopPropagation();window._genDeleteAvatarChar(${c.id})" title="Eliminar">✕</button>
            </div>
        `).join('');
    }

    window._genSelectAvatarChar = function (id, imageUrl, name) {
        genState.avatarCharacterId = id;
        genState.avatarImageDataUrl = '';
        setAvatarPreview(imageUrl, name);
        document.querySelectorAll('.gen-avatar-char-item').forEach(el => {
            el.classList.toggle('selected', el.dataset.charId === String(id));
        });
    };

    window._genDeleteAvatarChar = async function (id) {
        if (!confirm('¿Eliminar este personaje guardado?')) return;
        await fetch(`/api/video-avatar/characters?id=${id}`, { method: 'DELETE', credentials: 'same-origin' });
        if (genState.avatarCharacterId === id) {
            genState.avatarCharacterId = null;
            setAvatarPreview('');
        }
        loadAvatarCharacters();
    };

    function setAvatarPreview(url, name) {
        const preview = $('gen-avatar-preview-img');
        const wrap = $('gen-avatar-preview-wrap');
        const uploadWrap = $('gen-avatar-upload');
        if (!preview || !wrap || !uploadWrap) return;
        if (url) {
            preview.src = url;
            preview.alt = name || 'Personaje';
            wrap.style.display = 'block';
            uploadWrap.style.display = 'none';
        } else {
            preview.src = '';
            wrap.style.display = 'none';
            uploadWrap.style.display = 'block';
        }
    }

    function initAvatarPanel() {
        initStyleOpts('avatar-resolution-opts', 'avatarResolution');

        document.querySelectorAll('#avatar-audio-mode-opts .filter-pill').forEach(btn => {
            btn.addEventListener('click', () => {
                genState.avatarAudioMode = btn.dataset.val;
                document.querySelectorAll('#avatar-audio-mode-opts .filter-pill').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                $('gen-avatar-script-hint').style.display = genState.avatarAudioMode === 'script' ? 'block' : 'none';
                $('gen-avatar-audio-upload').style.display = genState.avatarAudioMode === 'audio' ? 'block' : 'none';
            });
        });

        const voiceSelect = $('avatar-voice-select');
        if (voiceSelect) voiceSelect.addEventListener('change', () => { genState.avatarVoice = voiceSelect.value; });

        const langSelect = $('avatar-language-select');
        if (langSelect) langSelect.addEventListener('change', () => { genState.avatarLanguage = langSelect.value; });

        const changeBtn = $('gen-avatar-change-btn');
        if (changeBtn) changeBtn.addEventListener('click', () => {
            genState.avatarCharacterId = null;
            genState.avatarImageDataUrl = '';
            setAvatarPreview('');
            document.querySelectorAll('.gen-avatar-char-item').forEach(el => el.classList.remove('selected'));
        });

        const dropZone = $('gen-avatar-drop-zone');
        const fileInput = $('gen-avatar-file-input');
        if (dropZone && fileInput) {
            dropZone.addEventListener('click', () => fileInput.click());
            dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
            dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
            dropZone.addEventListener('drop', (e) => {
                e.preventDefault();
                dropZone.classList.remove('dragover');
                const file = e.dataTransfer.files[0];
                if (file && file.type.startsWith('image/')) handleAvatarFile(file);
            });
            fileInput.addEventListener('change', () => {
                if (fileInput.files[0]) handleAvatarFile(fileInput.files[0]);
            });
        }

        const audioDropZone = $('gen-avatar-audio-drop-zone');
        const audioFileInput = $('gen-avatar-audio-file-input');
        if (audioDropZone && audioFileInput) {
            audioDropZone.addEventListener('click', () => audioFileInput.click());
            audioDropZone.addEventListener('dragover', (e) => { e.preventDefault(); audioDropZone.classList.add('dragover'); });
            audioDropZone.addEventListener('dragleave', () => audioDropZone.classList.remove('dragover'));
            audioDropZone.addEventListener('drop', (e) => {
                e.preventDefault();
                audioDropZone.classList.remove('dragover');
                const file = e.dataTransfer.files[0];
                if (file && file.type.startsWith('audio/')) handleAvatarAudioFile(file);
            });
            audioFileInput.addEventListener('change', () => {
                if (audioFileInput.files[0]) handleAvatarAudioFile(audioFileInput.files[0]);
            });
        }
    }

    function handleAvatarFile(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            genState.avatarImageDataUrl = e.target.result;
            genState.avatarCharacterId = null;
            setAvatarPreview(e.target.result, 'Nuevo personaje');
            document.querySelectorAll('.gen-avatar-char-item').forEach(el => el.classList.remove('selected'));
        };
        reader.readAsDataURL(file);
    }

    function handleAvatarAudioFile(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            genState.avatarAudioDataUrl = e.target.result;
            const label = $('gen-avatar-audio-filename');
            if (label) label.textContent = `✓ ${file.name}`;
        };
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
            actions = item.result ? `<a class="gen-action-btn" style="font-size:0.78rem;padding:5px 12px" href="${escAttr(item.result)}" download="imagen-mirai.png" target="_blank">Descargar</a><button class="gen-action-btn" style="font-size:0.78rem;padding:5px 12px" onclick="window._genEditImage('${escAttr(item.result)}')">Editar</button><button class="gen-action-btn" style="font-size:0.78rem;padding:5px 12px" onclick="window._genUpscale(this,'${escAttr(item.result)}','${escAttr(item.prompt || '')}')">Mejorar</button>` : '';
        } else if (type === 'activos') {
            preview = item.result ? `<img class="gen-hist-img" src="${escAttr(item.result)}" alt="Activo" loading="lazy">` : '';
            actions = item.result ? `<a class="gen-action-btn" style="font-size:0.78rem;padding:5px 12px" href="${escAttr(item.result)}" download="activo-mirai.png" target="_blank">Descargar</a><button class="gen-action-btn" style="font-size:0.78rem;padding:5px 12px" onclick="window._genEditImage('${escAttr(item.result)}')">Editar</button><button class="gen-action-btn" style="font-size:0.78rem;padding:5px 12px" onclick="window._genUpscale(this,'${escAttr(item.result)}','${escAttr(item.prompt || '')}')">Mejorar</button>` : '';
        } else if (type === 'editar') {
            preview = item.result ? `<img class="gen-hist-img" src="${escAttr(item.result)}" alt="Editada" loading="lazy">` : '';
            actions = item.result ? `<a class="gen-action-btn" style="font-size:0.78rem;padding:5px 12px" href="${escAttr(item.result)}" download="editada-mirai.jpg" target="_blank">Descargar</a><button class="gen-action-btn" style="font-size:0.78rem;padding:5px 12px" onclick="window._genEditImage('${escAttr(item.result)}')">Re-editar</button><button class="gen-action-btn" style="font-size:0.78rem;padding:5px 12px" onclick="window._genUpscale(this,'${escAttr(item.result)}','${escAttr(item.prompt || '')}')">Mejorar</button>` : '';
        } else if (type === 'video') {
            preview = item.result ? `<video style="width:100%;border-radius:8px;max-height:160px" controls src="${escAttr(item.result)}"></video>` : '';
            actions = item.result ? `<a class="gen-action-btn" style="font-size:0.78rem;padding:5px 12px" href="${escAttr(item.result)}" download="video-mirai.mp4" target="_blank">Descargar</a>` : '';
        } else if (type === 'avatar') {
            preview = item.result ? `<video style="width:100%;border-radius:8px;max-height:160px" controls src="${escAttr(item.result)}"></video>` : '';
            actions = item.result ? `<a class="gen-action-btn" style="font-size:0.78rem;padding:5px 12px" href="${escAttr(item.result)}" download="avatar-mirai.mp4" target="_blank">Descargar</a>` : '';
        } else if (type === 'videoedit') {
            preview = item.result ? `<video style="width:100%;border-radius:8px;max-height:160px" controls src="${escAttr(item.result)}"></video>` : '';
            actions = item.result ? `<a class="gen-action-btn" style="font-size:0.78rem;padding:5px 12px" href="${escAttr(item.result)}" download="video-avanzado-mirai.mp4" target="_blank">Descargar</a>` : '';
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

    window._genHistDel = async function (id) {
        await apiDeleteHistory(id);
        _histPage = 1;
        renderHistory();
    };

    window._genHistCopy = function (btn, id) {
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
        initTextOpts();
        initStyleOpts('image-style-opts', 'imageStyle');
        initStyleOpts('asset-style-opts', 'assetStyle');
        initStyleOpts('video-style-opts', 'videoStyle');
        initStyleOpts('music-genre-opts', 'musicGenre');
        initStyleOpts('image-aspect-opts', 'imageAspect');
        initStyleOpts('image-quality-opts', 'imageQuality');
        initStyleOpts('image-size-opts', 'imageSize');
        initStyleOpts('asset-aspect-opts', 'assetAspect');
        initStyleOpts('video-resolution-opts', 'videoResolution');
        initStyleOpts('video-aspect-opts', 'videoAspect');
        initStyleOpts('video-duration-opts', 'videoDuration');
        initStyleOpts('video-draft-opts', 'videoDraft');
        initImageEngineOpts();
        initEditPanel();
        initAvatarPanel();
        initVideoEditPanel();
        initHistoryTabs();
        updatePlaceholder();
        loadAvatarCharacters();

        document.querySelectorAll('.gen-panel').forEach(p => p.style.display = 'none');
        const firstPanel = document.getElementById('panel-' + genState.activeTab);
        if (firstPanel) firstPanel.style.display = 'block';

        (async () => {
            try {
                const data = await apiLoadHistory(_activeHistTab, 1);
                if ((data.items || []).length > 0) {
                    $('gen-history-section').style.display = 'block';
                    renderHistory();
                }
            } catch (e) { }
        })();

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
