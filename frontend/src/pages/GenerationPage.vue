<template>
  <header class="header">
    <MenuToggle />
    <div class="header-title">Generación con IA</div>
  </header>

  <div class="gen-page-content">
    <div class="gen-hero-zone">
      <span class="gen-hero-icon">✨</span>
      <h1 class="gen-hero-title">Generación con IA</h1>
      <p class="gen-hero-subtitle">Describe lo que necesitas y la IA lo creará por ti: texto, imágenes, vídeo o música.</p>
      <div class="gen-input-wrapper">
        <textarea
          id="gen-input"
          ref="inputEl"
          v-model="input"
          :placeholder="placeholder"
          rows="1"
          autocomplete="off"
          spellcheck="false"
          :disabled="loading.active"
          @input="autoResize"
          @keydown.enter.exact.prevent="generate"
        ></textarea>
        <button id="gen-send-btn" class="send-button" aria-label="Generar" :disabled="loading.active" @click="generate">
          <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
          </svg>
        </button>
      </div>
    </div>

    <div class="gen-body">
      <!-- ── PANEL TEXTO ── -->
      <div id="panel-texto" class="gen-panel" :class="{ active: tab === 'texto' }">
        <div class="gen-selects-grid">
          <div class="gen-select-group">
            <span class="gen-select-label">Tipo de texto</span>
            <select id="text-type-select" v-model="s.textType" class="gen-select" @change="onTextTypeChange">
              <option v-for="o in TEXT_TYPES" :key="o.val" :value="o.val">{{ o.label }}</option>
            </select>
          </div>
          <div id="tone-select-wrapper" class="gen-select-group">
            <span class="gen-select-label">Tono</span>
            <select id="tone-select" v-model="s.tone" class="gen-select">
              <option value="">— Ninguno —</option>
              <option v-for="o in TONES" :key="o.val" :value="o.val">{{ o.label }}</option>
            </select>
          </div>
          <div id="language-select-wrapper" class="gen-select-group" :style="{ display: s.textType === 'traduccion' ? 'flex' : 'none' }">
            <span class="gen-select-label">Idioma destino</span>
            <select id="language-select" v-model="s.language" class="gen-select">
              <option v-for="o in LANGUAGES" :key="o.val" :value="o.val">{{ o.label }}</option>
            </select>
          </div>
        </div>
      </div>

      <!-- ── PANEL IMAGEN ── -->
      <div id="panel-imagen" class="gen-panel" :class="{ active: tab === 'imagen' }">
        <p class="gen-options-label">Estilo de imagen</p>
        <div id="image-style-opts" class="gen-options-row">
          <button v-for="o in STYLE_OPTS" :key="o.val" class="filter-pill" :class="{ active: s.imageStyle === o.val }" :data-val="o.val" @click="s.imageStyle = o.val">{{ o.label }}</button>
        </div>
        <p class="gen-options-label">Motor</p>
        <div id="image-engine-opts" class="gen-options-row">
          <button v-for="o in ENGINE_OPTS" :key="o.val" class="filter-pill" :class="{ active: s.imageEngine === o.val }" :data-val="o.val" @click="s.imageEngine = o.val">{{ o.label }}</button>
        </div>
        <div id="gen-image-engine-hint" style="font-size:0.82rem;color:var(--text-secondary);margin:-8px 0 16px;">
          El motor de tipografía escribe texto legible dentro de la imagen (carteles, logos, portadas).
        </div>
        <p class="gen-options-label">Relación de aspecto</p>
        <div id="image-aspect-opts" class="gen-options-row">
          <button v-for="o in IMAGE_ASPECT_OPTS" :key="o.val" class="filter-pill" :class="{ active: s.imageAspect === o.val }" :data-val="o.val" @click="s.imageAspect = o.val">{{ o.label }}</button>
        </div>
        <!-- Calidad y tamaño solo existen en el motor de tipografía (son lo que fija su precio). -->
        <div id="gen-image-quality-wrap" :style="{ display: s.imageEngine === 'p-image-ideogram' ? 'block' : 'none' }">
          <p class="gen-options-label">Calidad tipográfica</p>
          <div id="image-quality-opts" class="gen-options-row">
            <button v-for="o in QUALITY_OPTS" :key="o.val" class="filter-pill" :class="{ active: s.imageQuality === o.val }" :data-val="o.val" @click="s.imageQuality = o.val">{{ o.label }}</button>
          </div>
          <p class="gen-options-label">Tamaño de salida</p>
          <div id="image-size-opts" class="gen-options-row">
            <button v-for="o in SIZE_OPTS" :key="o.val" class="filter-pill" :class="{ active: s.imageSize === o.val }" :data-val="o.val" @click="s.imageSize = o.val">{{ o.label }}</button>
          </div>
        </div>
      </div>

      <!-- ── PANEL ACTIVOS ── -->
      <div id="panel-activos" class="gen-panel" :class="{ active: tab === 'activos' }">
        <p class="gen-options-label">Estilo de activo</p>
        <div id="asset-style-opts" class="gen-options-row">
          <button v-for="o in ASSET_STYLE_OPTS" :key="o.val" class="filter-pill" :class="{ active: s.assetStyle === o.val }" :data-val="o.val" @click="s.assetStyle = o.val">{{ o.label }}</button>
        </div>
        <p class="gen-options-label">Motor</p>
        <div id="asset-engine-opts" class="gen-options-row">
          <button v-for="o in ENGINE_OPTS" :key="o.val" class="filter-pill" :class="{ active: s.assetEngine === o.val }" :data-val="o.val" @click="s.assetEngine = o.val">{{ o.label }}</button>
        </div>
        <p class="gen-options-label">Relación de aspecto</p>
        <div id="asset-aspect-opts" class="gen-options-row">
          <button v-for="o in IMAGE_ASPECT_OPTS.slice(0, 3)" :key="o.val" class="filter-pill" :class="{ active: s.assetAspect === o.val }" :data-val="o.val" @click="s.assetAspect = o.val">{{ o.label }}</button>
        </div>
      </div>

      <!-- ── PANEL EDICIÓN DE IMAGEN ── -->
      <div id="panel-editar" class="gen-panel" :class="{ active: tab === 'editar' }">
        <div id="gen-edit-source" class="gen-edit-source" :style="{ display: s.editImageUrl ? 'block' : 'none' }">
          <p class="gen-options-label">Imagen a editar</p>
          <div class="gen-edit-preview-wrap">
            <img id="gen-edit-preview-img" class="gen-edit-preview-img" :src="s.editImageUrl || undefined" alt="Imagen fuente">
            <button id="gen-edit-change-btn" class="gen-edit-change-btn" title="Cambiar imagen" @click="s.editImageUrl = ''">✕</button>
          </div>
        </div>
        <div id="gen-edit-upload" class="gen-edit-upload" :style="{ display: s.editImageUrl ? 'none' : 'block' }">
          <p class="gen-options-label">Sube o pega la URL de la imagen</p>
          <div
            id="gen-edit-drop-zone"
            class="gen-edit-upload-zone"
            :class="{ dragover: dragZone === 'edit' }"
            @click="editFileInput?.click()"
            @dragover.prevent="dragZone = 'edit'"
            @dragleave="dragZone = null"
            @drop.prevent="onDropSingle($event, 'image/', onEditFile)"
          >
            <span style="font-size:2rem;">📤</span>
            <p style="margin:6px 0 0;font-size:0.88rem;color:var(--text-secondary)">Arrastra una imagen aquí o haz clic para seleccionar</p>
            <input id="gen-edit-file-input" ref="editFileInput" type="file" accept="image/*" style="display:none" @change="onPicked($event, onEditFile)">
          </div>
          <div style="display:flex;gap:8px;margin-top:10px;align-items:center;">
            <input id="gen-edit-url-input" v-model="editUrlInput" type="text" class="gen-edit-url-input" placeholder="O pega la URL de la imagen...">
            <button id="gen-edit-url-load-btn" class="filter-pill" @click="editUrlInput.trim() && (s.editImageUrl = editUrlInput.trim())">Cargar</button>
          </div>
        </div>
        <p class="gen-options-label" style="margin-top:16px;">Opciones de edición</p>
        <div class="gen-selects-grid">
          <div class="gen-select-group">
            <span class="gen-select-label">🎨 Estilo artístico</span>
            <select id="gen-edit-style-select" v-model="s.editStyle" class="gen-select">
              <option value="">— Ninguno —</option>
              <option v-for="o in EDIT_STYLES" :key="o.label" :value="o.val">{{ o.label }}</option>
            </select>
          </div>
          <div class="gen-select-group">
            <span class="gen-select-label">🌄 Fondo</span>
            <select id="gen-edit-bg-select" v-model="s.editBackground" class="gen-select">
              <option value="">— Ninguno —</option>
              <option v-for="o in EDIT_BACKGROUNDS" :key="o.label" :value="o.val">{{ o.label }}</option>
            </select>
          </div>
          <div class="gen-select-group">
            <span class="gen-select-label">✨ Efectos</span>
            <select id="gen-edit-fx-select" v-model="s.editEffect" class="gen-select">
              <option value="">— Ninguno —</option>
              <option v-for="o in EDIT_EFFECTS" :key="o.label" :value="o.val">{{ o.label }}</option>
            </select>
          </div>
        </div>
        <p class="gen-options-label">Relación de aspecto</p>
        <div id="edit-aspect-opts" class="gen-options-row">
          <button v-for="o in EDIT_ASPECT_OPTS" :key="o.val" class="filter-pill" :class="{ active: s.editAspect === o.val }" :data-val="o.val" @click="s.editAspect = o.val">{{ o.label }}</button>
        </div>
      </div>

      <!-- ── PANEL VÍDEO ── -->
      <div id="panel-video" class="gen-panel" :class="{ active: tab === 'video' }">
        <p class="gen-options-label">Estilo de vídeo</p>
        <div id="video-style-opts" class="gen-options-row">
          <button v-for="o in STYLE_OPTS" :key="o.val" class="filter-pill" :class="{ active: s.videoStyle === o.val }" :data-val="o.val" @click="s.videoStyle = o.val">{{ o.label }}</button>
        </div>
        <p class="gen-options-label">Resolución</p>
        <div id="video-resolution-opts" class="gen-options-row">
          <button v-for="o in RESOLUTION_OPTS" :key="o.val" class="filter-pill" :class="{ active: s.videoResolution === o.val }" :data-val="o.val" @click="s.videoResolution = o.val">{{ o.label }}</button>
        </div>
        <p class="gen-options-label">Relación de aspecto</p>
        <div id="video-aspect-opts" class="gen-options-row">
          <button v-for="o in VIDEO_ASPECT_OPTS" :key="o.val" class="filter-pill" :class="{ active: s.videoAspect === o.val }" :data-val="o.val" @click="s.videoAspect = o.val">{{ o.label }}</button>
        </div>
        <p class="gen-options-label">Duración</p>
        <div id="video-duration-opts" class="gen-options-row">
          <button v-for="d in VIDEO_DURATIONS" :key="d" class="filter-pill" :class="{ active: s.videoDuration === d }" :data-val="d" @click="s.videoDuration = d">{{ d }} s</button>
        </div>
        <p class="gen-options-label">Modo</p>
        <div id="video-draft-opts" class="gen-options-row">
          <button class="filter-pill" :class="{ active: !s.videoDraft }" data-val="false" @click="s.videoDraft = false">💎 Calidad estándar</button>
          <button class="filter-pill" :class="{ active: s.videoDraft }" data-val="true" @click="s.videoDraft = true">⚡ Borrador (4x más barato)</button>
        </div>
        <div style="font-size:0.82rem;color:var(--text-secondary);margin:-8px 0 0;">
          El borrador genera más rápido y con menos calidad. Útil para probar un prompt antes de gastar en la versión final.
        </div>
      </div>

      <!-- ── PANEL VÍDEO AVANZADO (editar / animar / reemplazar) ── -->
      <div id="panel-videoedit" class="gen-panel" :class="{ active: tab === 'videoedit' }">
        <p class="gen-options-label">Qué quieres hacer</p>
        <div id="videoedit-mode-opts" class="gen-options-row">
          <button v-for="o in VID_EDIT_MODE_OPTS" :key="o.val" class="filter-pill" :class="{ active: s.vidEditMode === o.val }" :data-val="o.val" @click="setVidEditMode(o.val)">{{ o.label }}</button>
        </div>
        <div id="gen-videoedit-hint" style="font-size:0.82rem;color:var(--text-secondary);margin:-8px 0 16px;">{{ vidEditMode.hint }}</div>
        <div id="gen-videoedit-source" class="gen-edit-source" :style="{ display: s.vidEditVideo ? 'block' : 'none' }">
          <p class="gen-options-label">Vídeo de origen</p>
          <div class="gen-edit-preview-wrap">
            <video id="gen-videoedit-preview" class="gen-edit-preview-img" controls :src="s.vidEditVideo || undefined"></video>
            <button id="gen-videoedit-change-btn" class="gen-edit-change-btn" title="Cambiar vídeo" @click="s.vidEditVideo = ''">✕</button>
          </div>
        </div>
        <div id="gen-videoedit-upload" class="gen-edit-upload" :style="{ display: s.vidEditVideo ? 'none' : 'block' }">
          <p class="gen-options-label">Sube o pega la URL del vídeo de origen</p>
          <div
            id="gen-videoedit-drop-zone"
            class="gen-edit-upload-zone"
            :class="{ dragover: dragZone === 'videoedit' }"
            @click="vidEditFileInput?.click()"
            @dragover.prevent="dragZone = 'videoedit'"
            @dragleave="dragZone = null"
            @drop.prevent="onDropSingle($event, 'video/', onVidEditFile)"
          >
            <span style="font-size:2rem;">🎞️</span>
            <p style="margin:6px 0 0;font-size:0.88rem;color:var(--text-secondary)">Arrastra un vídeo .mp4 aquí o haz clic para seleccionar</p>
            <input id="gen-videoedit-file-input" ref="vidEditFileInput" type="file" accept="video/mp4,video/*" style="display:none" @change="onPicked($event, onVidEditFile)">
          </div>
          <div style="display:flex;gap:8px;margin-top:10px;align-items:center;">
            <input id="gen-videoedit-url-input" v-model="vidEditUrlInput" type="text" class="gen-edit-url-input" placeholder="O pega la URL del vídeo...">
            <button id="gen-videoedit-url-load-btn" class="filter-pill" @click="vidEditUrlInput.trim() && (s.vidEditVideo = vidEditUrlInput.trim())">Cargar</button>
          </div>
        </div>
        <div id="gen-videoedit-refs" :style="{ display: vidEditMode.needsImages ? 'block' : 'none' }">
          <div class="gen-avatar-char-section" style="margin-top:16px;">
            <p class="gen-options-label">Usar un personaje guardado</p>
            <div id="gen-videoedit-char-grid" class="gen-avatar-char-grid">
              <div v-if="!characters.length" class="gen-avatar-char-empty">Aún no tienes personajes guardados.</div>
              <div
                v-for="c in characters"
                :key="c.id"
                class="gen-avatar-char-item"
                :class="{ selected: s.vidEditCharacterId === c.id }"
                :data-char-id="c.id"
                @click="s.vidEditCharacterId = s.vidEditCharacterId === c.id ? null : c.id"
              >
                <img :src="c.image_url" :alt="c.name || 'Personaje'" loading="lazy">
                <span>{{ c.name || 'Personaje' }}</span>
              </div>
            </div>
          </div>
          <p id="gen-videoedit-refs-label" class="gen-options-label">{{ vidEditRefsLabel }}</p>
          <div
            id="gen-videoedit-img-drop-zone"
            class="gen-edit-upload-zone"
            :class="{ dragover: dragZone === 'videoedit-img' }"
            @click="vidEditImgInput?.click()"
            @dragover.prevent="dragZone = 'videoedit-img'"
            @dragleave="dragZone = null"
            @drop.prevent="onDropRefImages"
          >
            <span style="font-size:1.6rem;">🖼️</span>
            <p id="gen-videoedit-img-hint" style="margin:6px 0 0;font-size:0.85rem;color:var(--text-secondary)">{{ vidEditImgHint }}</p>
            <input id="gen-videoedit-img-input" ref="vidEditImgInput" type="file" accept="image/*" multiple style="display:none" @change="onPickRefImages">
          </div>
          <div id="gen-videoedit-img-preview" class="gen-avatar-char-grid" style="margin-top:10px;">
            <div v-for="(src, i) in s.vidEditImages" :key="i" class="gen-avatar-char-item">
              <img :src="src" :alt="`Referencia ${i + 1}`" loading="lazy">
              <span>Ref. {{ i + 1 }}</span>
              <button class="gen-avatar-char-del" title="Quitar" @click="s.vidEditImages.splice(i, 1)">✕</button>
            </div>
          </div>
        </div>
        <div id="gen-videoedit-resolution-wrap" :style="{ display: vidEditMode.supportsResolution ? 'block' : 'none' }">
          <p class="gen-options-label">Resolución</p>
          <div id="videoedit-resolution-opts" class="gen-options-row">
            <button v-for="o in RESOLUTION_OPTS" :key="o.val" class="filter-pill" :class="{ active: s.vidEditResolution === o.val }" :data-val="o.val" @click="s.vidEditResolution = o.val">{{ o.label }}</button>
          </div>
        </div>
        <div id="gen-videoedit-draft-wrap" :style="{ display: vidEditMode.supportsDraft ? 'block' : 'none' }">
          <p class="gen-options-label">Modo</p>
          <div id="videoedit-draft-opts" class="gen-options-row">
            <button class="filter-pill" :class="{ active: !s.vidEditDraft }" data-val="false" @click="s.vidEditDraft = false">💎 Calidad estándar</button>
            <button class="filter-pill" :class="{ active: s.vidEditDraft }" data-val="true" @click="s.vidEditDraft = true">⚡ Borrador</button>
          </div>
        </div>
      </div>

      <!-- ── PANEL VÍDEO AVATAR ── -->
      <div id="panel-avatar" class="gen-panel" :class="{ active: tab === 'avatar' }">
        <div class="gen-avatar-char-section">
          <p class="gen-options-label">Mis personajes</p>
          <div id="gen-avatar-char-grid" class="gen-avatar-char-grid">
            <div v-if="!characters.length" id="gen-avatar-char-empty" class="gen-avatar-char-empty">Aún no tienes personajes guardados.</div>
            <div
              v-for="c in characters"
              :key="c.id"
              class="gen-avatar-char-item"
              :class="{ selected: s.avatarCharacterId === c.id }"
              :data-char-id="c.id"
              @click="selectAvatarCharacter(c)"
            >
              <img :src="c.image_url" :alt="c.name || 'Personaje'" loading="lazy">
              <span>{{ c.name || 'Personaje' }}</span>
              <button class="gen-avatar-char-del" title="Eliminar" @click.stop="deleteAvatarCharacter(c.id)">✕</button>
            </div>
          </div>
        </div>
        <div id="gen-avatar-preview-wrap" class="gen-edit-source" :style="{ display: avatarPreview ? 'block' : 'none' }">
          <p class="gen-options-label">Personaje seleccionado</p>
          <div class="gen-edit-preview-wrap">
            <img id="gen-avatar-preview-img" class="gen-edit-preview-img" :src="avatarPreview?.url" :alt="avatarPreview?.name || 'Personaje'">
            <button id="gen-avatar-change-btn" class="gen-edit-change-btn" title="Cambiar imagen" @click="clearAvatar">✕</button>
          </div>
        </div>
        <div id="gen-avatar-upload" class="gen-edit-upload" :style="{ display: avatarPreview ? 'none' : 'block' }">
          <p class="gen-options-label">Sube una imagen de retrato (nuevo personaje)</p>
          <div
            id="gen-avatar-drop-zone"
            class="gen-edit-upload-zone"
            :class="{ dragover: dragZone === 'avatar' }"
            @click="avatarFileInput?.click()"
            @dragover.prevent="dragZone = 'avatar'"
            @dragleave="dragZone = null"
            @drop.prevent="onDropSingle($event, 'image/', onAvatarFile)"
          >
            <span style="font-size:2rem;">🧑‍🎤</span>
            <p style="margin:6px 0 0;font-size:0.88rem;color:var(--text-secondary)">Arrastra un retrato aquí o haz clic para seleccionar</p>
            <input id="gen-avatar-file-input" ref="avatarFileInput" type="file" accept="image/*" style="display:none" @change="onPicked($event, onAvatarFile)">
          </div>
          <div style="display:flex;gap:8px;margin-top:10px;align-items:center;">
            <input id="gen-avatar-name-input" v-model="s.avatarName" type="text" class="gen-edit-url-input" placeholder="Nombre del personaje (opcional)">
          </div>
        </div>
        <p class="gen-options-label" style="margin-top:16px;">Audio</p>
        <div id="avatar-audio-mode-opts" class="gen-options-row">
          <button class="filter-pill" :class="{ active: s.avatarAudioMode === 'script' }" data-val="script" @click="s.avatarAudioMode = 'script'">✍️ Texto a voz</button>
          <button class="filter-pill" :class="{ active: s.avatarAudioMode === 'audio' }" data-val="audio" @click="s.avatarAudioMode = 'audio'">🎙️ Subir audio</button>
        </div>
        <div id="gen-avatar-script-hint" style="font-size:0.82rem;color:var(--text-secondary);margin:-8px 0 16px;" :style="{ display: s.avatarAudioMode === 'script' ? 'block' : 'none' }">
          Escribe el guion que dirá el personaje en el campo de texto principal de arriba.
        </div>
        <div id="gen-avatar-audio-upload" style="margin-bottom:16px;" :style="{ display: s.avatarAudioMode === 'audio' ? 'block' : 'none' }">
          <div
            id="gen-avatar-audio-drop-zone"
            class="gen-edit-upload-zone"
            :class="{ dragover: dragZone === 'avatar-audio' }"
            @click="avatarAudioInput?.click()"
            @dragover.prevent="dragZone = 'avatar-audio'"
            @dragleave="dragZone = null"
            @drop.prevent="onDropSingle($event, 'audio/', onAvatarAudioFile)"
          >
            <span style="font-size:1.6rem;">🎧</span>
            <p id="gen-avatar-audio-filename" style="margin:6px 0 0;font-size:0.85rem;color:var(--text-secondary)">{{ s.avatarAudioName ? `✓ ${s.avatarAudioName}` : 'Arrastra un audio aquí o haz clic para seleccionar' }}</p>
            <input id="gen-avatar-audio-file-input" ref="avatarAudioInput" type="file" accept="audio/*" style="display:none" @change="onPicked($event, onAvatarAudioFile)">
          </div>
        </div>
        <div class="gen-selects-grid">
          <div class="gen-select-group">
            <span class="gen-select-label">🗣️ Voz</span>
            <select id="avatar-voice-select" v-model="s.avatarVoice" class="gen-select">
              <option v-for="v in VOICES" :key="v.name" :value="`${v.name} (${v.female ? 'Female' : 'Male'})`">{{ v.name }} ({{ v.female ? 'Femenina' : 'Masculina' }})</option>
            </select>
          </div>
          <div class="gen-select-group">
            <span class="gen-select-label">🌐 Idioma</span>
            <select id="avatar-language-select" v-model="s.avatarLanguage" class="gen-select">
              <option v-for="o in AVATAR_LANGUAGES" :key="o.val" :value="o.val">{{ o.label }}</option>
            </select>
          </div>
        </div>
        <p class="gen-options-label">Resolución</p>
        <div id="avatar-resolution-opts" class="gen-options-row">
          <button v-for="o in RESOLUTION_OPTS" :key="o.val" class="filter-pill" :class="{ active: s.avatarResolution === o.val }" :data-val="o.val" @click="s.avatarResolution = o.val">{{ o.label }}</button>
        </div>
        <details style="margin-top:8px;">
          <summary class="gen-options-label" style="cursor:pointer;display:inline-block;">⚙️ Opciones avanzadas</summary>
          <div class="gen-selects-grid" style="margin-top:12px;">
            <div class="gen-select-group">
              <span class="gen-select-label">🎬 Prompt de vídeo</span>
              <input id="avatar-video-prompt-input" v-model="s.avatarVideoPrompt" type="text" class="gen-select" placeholder="Ej: The person is talking with a friendly smile">
            </div>
            <div class="gen-select-group">
              <span class="gen-select-label">🎭 Estilo de voz</span>
              <input id="avatar-voice-prompt-input" v-model="s.avatarVoicePrompt" type="text" class="gen-select" placeholder="Ej: Say it calmly and warmly">
            </div>
            <div class="gen-select-group">
              <span class="gen-select-label">🚫 Prompt negativo</span>
              <input id="avatar-negative-prompt-input" v-model="s.avatarNegativePrompt" type="text" class="gen-select" placeholder="Ej: subtitles, watermark, blurry">
            </div>
          </div>
        </details>
      </div>

      <!-- ── PANEL MÚSICA ── -->
      <div id="panel-musica" class="gen-panel" :class="{ active: tab === 'musica' }">
        <p class="gen-options-label">Género musical</p>
        <div id="music-genre-opts" class="gen-options-row">
          <button v-for="o in GENRE_OPTS" :key="o.val" class="filter-pill" :class="{ active: s.musicGenre === o.val }" :data-val="o.val" @click="s.musicGenre = o.val">{{ o.label }}</button>
        </div>
      </div>

      <!-- ── COLUMNA DE SALIDA (resultado + historial) ── -->
      <div class="gen-output-col">
        <div id="gen-loading" class="gen-loading" :class="{ visible: loading.active }">
          <div class="gen-orb">
            <div id="gen-orb-icon" class="gen-orb-icon">{{ loading.icon }}</div>
          </div>
          <div class="gen-progress-bar">
            <div class="gen-progress-fill"></div>
          </div>
          <div id="gen-loading-text" class="gen-loading-text">{{ loading.text }}</div>
        </div>

        <div id="gen-error" class="gen-error" :class="{ visible: !!error }">{{ error }}</div>

        <div id="gen-result" class="gen-result-card" :class="{ visible: !!result }">
          <template v-if="result">
            <div class="gen-result-header">
              <div id="gen-result-title" class="gen-result-title">
                {{ result.title }} <span class="gen-result-badge">{{ result.badge }}</span>
              </div>
              <div id="gen-result-actions" style="display:flex; gap:8px; flex-wrap:wrap;">
                <button v-if="result.kind === 'text'" id="gen-copy-btn" class="gen-action-btn" :class="{ copied: copiedKey === 'result' }" @click="copyText('result', result.text ?? '')">
                  <template v-if="copiedKey === 'result'">✓ Copiado</template>
                  <template v-else>
                    <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor">
                      <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z" />
                    </svg>
                    Copiar texto
                  </template>
                </button>
                <template v-else>
                  <a class="gen-action-btn" :href="result.url" :download="result.filename" target="_blank">
                    <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor">
                      <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" />
                    </svg>
                    Descargar
                  </a>
                  <template v-if="result.kind === 'image'">
                    <button class="gen-action-btn" :class="{ copied: copiedKey === 'url' }" @click="copyText('url', result.url ?? '')">
                      <template v-if="copiedKey === 'url'">✓ URL copiada</template>
                      <template v-else>
                        <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor">
                          <path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z" />
                        </svg>
                        Copiar URL
                      </template>
                    </button>
                    <button class="gen-action-btn" @click="editImage(result.url ?? '')">
                      <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor">
                        <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
                      </svg>
                      Editar
                    </button>
                    <button class="gen-action-btn" title="Aumentar resolución y detalle" :disabled="busyKey === `upscale:${result.url}`" @click="upscale(result.url ?? '')">
                      <template v-if="busyKey === `upscale:${result.url}`">⏳ Mejorando...</template>
                      <template v-else>
                        <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor">
                          <path d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14zm.5-7H9v2H7v1h2v2h1v-2h2V9h-2V7z" />
                        </svg>
                        Mejorar calidad
                      </template>
                    </button>
                    <button class="gen-action-btn" title="Puntuar la imagen contra su prompt" :disabled="busyKey === 'judge'" @click="judge(result.url ?? '')">
                      <template v-if="busyKey === 'judge'">⏳ Evaluando...</template>
                      <template v-else>
                        <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor">
                          <path d="M12 3l1.5 4.5H18l-3.75 2.75L15.75 15 12 12.25 8.25 15l1.5-4.75L6 7.5h4.5L12 3zm-7 16h14v2H5v-2z" />
                        </svg>
                        Evaluar
                      </template>
                    </button>
                  </template>
                </template>
              </div>
            </div>
            <div id="gen-result-body">
              <div v-if="result.kind === 'text'" class="gen-text-output">{{ result.text }}</div>
              <img v-else-if="result.kind === 'image'" class="gen-image-output" :src="result.url" :alt="result.alt" loading="lazy">
              <video v-else-if="result.kind === 'video'" class="gen-video-output" controls :src="result.url"></video>
              <audio v-else-if="result.kind === 'audio'" class="gen-audio-output" controls :src="result.url"></audio>

              <!-- p-judger: total y desglose (los campos dependen del modelo) -->
              <div v-if="judgeResult" id="gen-judge-panel" style="margin-top:14px;padding:12px 14px;border-radius:10px;background:var(--bg-secondary,rgba(127,127,127,.08));">
                <div style="font-size:0.82rem;color:var(--text-secondary);margin-bottom:6px;">Evaluación de la imagen frente a su prompt (p-judger)</div>
                <div v-if="judgeResult.total != null" style="font-size:1.4rem;font-weight:700;margin-bottom:6px;">⚖️ {{ judgeResult.total }}</div>
                <table v-if="judgeRows.length" style="font-size:0.85rem;border-collapse:collapse;">
                  <tr v-for="[k, v] in judgeRows" :key="k">
                    <td style="padding:4px 12px 4px 0;color:var(--text-secondary)">{{ k }}</td>
                    <td style="padding:4px 0;font-weight:600">{{ v }}</td>
                  </tr>
                </table>
                <div v-else style="font-size:0.85rem;">Sin desglose disponible.</div>
              </div>
            </div>
          </template>
        </div>

        <!-- ── HISTORIAL ── -->
        <div id="gen-history-section" class="gen-history-section">
          <div class="gen-history-header">
            <h2 class="gen-history-title">🗂️ Mi historial</h2>
            <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
              <button id="gen-hist-clear-tab-btn" class="gen-action-btn" style="font-size:0.78rem;padding:6px 14px;" @click="clearHistory(histTab)">
                🗑️ Limpiar categoría
              </button>
              <button id="gen-hist-clear-all-btn" class="gen-action-btn" style="font-size:0.78rem;padding:6px 14px;border-color:#EF9A9A;color:#B71C1C;" @click="clearHistory(null)">
                🗑️ Limpiar todo
              </button>
            </div>
          </div>
          <div id="gen-history-list">
            <div v-if="history.state === 'loading'" class="gen-history-empty" style="padding:24px 0;">Cargando...</div>
            <div v-else-if="history.state === 'error'" class="gen-history-empty">Error al cargar historial.</div>
            <div v-else-if="history.state === 'empty'" class="gen-history-empty">No hay generaciones de este tipo aún.</div>
            <div v-else-if="history.items.length" class="gen-history-grid">
              <div v-for="item in history.items" :key="item.id" class="gen-hist-card">
                <div class="gen-hist-card-meta">
                  <span class="gen-hist-badge">{{ item.badge || item.type }}</span>
                  <span class="gen-hist-date">{{ formatDate(item.created_at) }}</span>
                </div>
                <div class="gen-hist-prompt">{{ item.prompt || '' }}</div>

                <div v-if="item.type === 'texto'" class="gen-hist-preview-text">{{ item.result || '' }}</div>
                <template v-else-if="item.result">
                  <img v-if="IMAGE_TYPES.includes(item.type)" class="gen-hist-img" :src="item.result" :alt="HIST_IMAGE_ALT[item.type]" loading="lazy">
                  <video v-else-if="VIDEO_TYPES.includes(item.type)" style="width:100%;border-radius:8px;max-height:160px" controls :src="item.result"></video>
                  <audio v-else-if="item.type === 'musica'" class="gen-hist-audio" controls :src="item.result"></audio>
                </template>

                <div class="gen-hist-actions">
                  <button
                    v-if="item.type === 'texto'"
                    class="gen-action-btn"
                    :class="{ copied: copiedKey === `hist:${item.id}` }"
                    style="font-size:0.78rem;padding:5px 12px"
                    @click="copyText(`hist:${item.id}`, item.result || '', 2000)"
                  >{{ copiedKey === `hist:${item.id}` ? '✓ Copiado' : 'Copiar' }}</button>
                  <template v-else-if="item.result && HIST_DOWNLOAD[item.type]">
                    <a class="gen-action-btn" style="font-size:0.78rem;padding:5px 12px" :href="item.result" :download="HIST_DOWNLOAD[item.type]" target="_blank">Descargar</a>
                    <template v-if="IMAGE_TYPES.includes(item.type)">
                      <button class="gen-action-btn" style="font-size:0.78rem;padding:5px 12px" @click="editImage(item.result)">{{ item.type === 'editar' ? 'Re-editar' : 'Editar' }}</button>
                      <button class="gen-action-btn" style="font-size:0.78rem;padding:5px 12px" :disabled="busyKey === `upscale:${item.result}`" @click="upscale(item.result, item.prompt)">
                        {{ busyKey === `upscale:${item.result}` ? '⏳ Mejorando...' : 'Mejorar' }}
                      </button>
                    </template>
                  </template>
                  <button class="gen-hist-del-btn" title="Eliminar" @click="deleteHistoryItem(item.id)">🗑️</button>
                </div>
              </div>
            </div>
          </div>
          <div id="gen-history-more" style="text-align:center;margin-top:20px;" :style="{ display: history.hasMore ? 'block' : 'none' }">
            <button id="gen-hist-load-more" class="gen-action-btn" @click="loadMoreHistory">Cargar más</button>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Módulos, en el panel de la barra lateral -->
  <Teleport to="#sidebar-page-section" defer>
    <h4>Generar</h4>
    <div class="sidebar-panel-section">
      <div id="gen-tabs" class="sidebar-filter-list filter-pills">
        <button v-for="t in TABS" :key="t.val" class="filter-pill" :class="{ active: tab === t.val }" :data-tab="t.val" @click="selectTab(t.val)">{{ t.label }}</button>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
// Migración de public/generation.html y public/generation.js: generación de
// texto, imagen, activos, vídeo, vídeo avanzado, vídeo avatar y música, con
// historial guardado en D1 (/api/gen-history).
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import MenuToggle from '@/components/MenuToggle.vue';
import { api, apiFetch, errorMessage } from '@/lib/api';
import { ensureSubscribed } from '@/lib/push';

type Tab = 'texto' | 'imagen' | 'editar' | 'activos' | 'video' | 'videoedit' | 'avatar' | 'musica';
type VidEditMode = 'edit' | 'animate' | 'replace';
type Option = { val: string; label: string };

// ── Opciones ──────────────────────────────────────────────────────────────
const TABS: { val: Tab; label: string }[] = [
  { val: 'texto', label: '✍️ Texto' },
  { val: 'imagen', label: '🖼️ Imagen' },
  { val: 'editar', label: '✏️ Editar Imagen' },
  { val: 'activos', label: '🧩 Activos' },
  { val: 'video', label: '🎬 Vídeo' },
  { val: 'videoedit', label: '🎞️ Vídeo Avanzado' },
  { val: 'avatar', label: '🗣️ Vídeo Avatar' },
  { val: 'musica', label: '🎵 Música' },
];

const TEXT_TYPES: Option[] = [
  { val: 'correo', label: '📧 Correo electrónico' },
  { val: 'tono', label: '🎭 Cambio de tono' },
  { val: 'resumen', label: '📋 Resumen' },
  { val: 'traduccion', label: '🌐 Traducción' },
  { val: 'historia', label: '📖 Historia / Narrativa' },
  { val: 'poema', label: '🎶 Poema' },
  { val: 'eslogan', label: '💡 Eslogan / Lema' },
  { val: 'publicacion', label: '📱 Publicación para redes' },
  { val: 'carta', label: '✉️ Carta formal' },
  { val: 'descripcion', label: '🏷️ Descripción de producto' },
];

const TONES: Option[] = [
  { val: 'alegre', label: '😄 Alegre' },
  { val: 'dramatico', label: '🎭 Dramático' },
  { val: 'triste', label: '😢 Triste' },
  { val: 'profesional', label: '💼 Profesional' },
  { val: 'casual', label: '😎 Casual' },
  { val: 'sentimental', label: '💖 Sentimental' },
  { val: 'educado', label: '🎩 Educado' },
  { val: 'divertido', label: '😂 Divertido' },
  { val: 'rrss', label: '📱 Redes Sociales' },
  { val: 'emotivo', label: '🥹 Emotivo' },
  { val: 'ingenioso', label: '🧠 Ingenioso' },
  { val: 'misterioso', label: '🔮 Misterioso' },
  { val: 'sarcastico', label: '😏 Sarcástico' },
  { val: 'motivacional', label: '💪 Motivacional' },
  { val: 'romantico', label: '💕 Romántico' },
];

const LANGUAGES: Option[] = [
  { val: 'ingles', label: '🇺🇸 Inglés' },
  { val: 'español', label: '🇪🇸 Español' },
  { val: 'frances', label: '🇫🇷 Francés' },
  { val: 'portugues', label: '🇧🇷 Portugués' },
  { val: 'aleman', label: '🇩🇪 Alemán' },
  { val: 'italiano', label: '🇮🇹 Italiano' },
  { val: 'japones', label: '🇯🇵 Japonés' },
  { val: 'coreano', label: '🇰🇷 Coreano' },
  { val: 'chino', label: '🇨🇳 Chino' },
];

const STYLE_OPTS: Option[] = [
  { val: 'cinematografico', label: '🎬 Cinematográfico' },
  { val: 'cartoon', label: '🎨 Cartoon' },
  { val: 'anime', label: '🌸 Anime' },
  { val: 'fotorrealista', label: '📷 Fotorrealista' },
];

const ENGINE_OPTS: Option[] = [
  { val: 'p-image', label: '✨ Estándar' },
  { val: 'p-image-ideogram', label: '🔤 Tipografía' },
];

const IMAGE_ASPECT_OPTS: Option[] = [
  { val: '1:1', label: '⬜ 1:1' },
  { val: '16:9', label: '🖥️ 16:9' },
  { val: '9:16', label: '📱 9:16' },
  { val: '4:3', label: '🖼️ 4:3' },
  { val: '3:4', label: '📄 3:4' },
];

const QUALITY_OPTS: Option[] = [
  { val: 'very low', label: '⚡ Rápida' },
  { val: 'medium', label: '⚖️ Media' },
  { val: 'high', label: '💎 Alta' },
  { val: 'very high', label: '🏆 Máxima' },
];

const SIZE_OPTS: Option[] = [
  { val: '1K', label: '1K' },
  { val: '2K', label: '2K' },
];

const ASSET_STYLE_OPTS: Option[] = [
  { val: 'pixelart', label: '🕹️ Pixel Art' },
  { val: 'cartoon2d', label: '🖍️ 2D Cartoon' },
  { val: 'anime2d', label: '🌸 2D Animé' },
  { val: 'animechibi', label: '🧸 2D Anime Chibi' },
];

const EDIT_STYLES: Option[] = [
  { val: 'Transform into a watercolor painting style with vibrant colors', label: 'Acuarela' },
  { val: 'Convert to oil painting style, rich textures, classical art', label: 'Pintura al óleo' },
  { val: 'Render in anime style, clean linework, expressive, manga aesthetic', label: 'Anime' },
  { val: 'Make it look like a pixel art retro video game sprite', label: 'Pixel Art' },
  { val: 'Apply pop art style, bold colors, halftone dots, Andy Warhol inspired', label: 'Pop Art' },
  { val: 'Sketch pencil drawing style, detailed crosshatching, graphite', label: 'Dibujo a lápiz' },
  { val: 'Convert to cartoon style, bold outlines, vibrant flat colors', label: 'Cartoon' },
  { val: 'Render as a 3D clay figure, smooth surfaces, Pixar style', label: 'Arcilla 3D' },
];

const EDIT_BACKGROUNDS: Option[] = [
  { val: 'Place the subject on a tropical beach with palm trees and sunset', label: 'Playa tropical' },
  { val: 'Set in a futuristic cyberpunk city with neon lights at night', label: 'Ciudad cyberpunk' },
  { val: 'Place in a magical enchanted forest with glowing lights', label: 'Bosque encantado' },
  { val: 'Set the scene in outer space with stars and nebulas', label: 'Espacio exterior' },
  { val: 'Place in a cozy coffee shop with warm lighting', label: 'Cafetería acogedora' },
  { val: 'Set in a snowy mountain landscape with northern lights', label: 'Montaña nevada' },
  { val: 'Place on a clean white studio background with soft shadows', label: 'Estudio blanco' },
  { val: 'Set in an ancient Japanese temple garden with cherry blossoms', label: 'Jardín japonés' },
];

const EDIT_EFFECTS: Option[] = [
  { val: 'Add dramatic cinematic lighting with lens flare and bokeh', label: 'Iluminación cinematográfica' },
  { val: 'Apply vintage retro film filter with grain and faded colors', label: 'Filtro vintage' },
  { val: 'Make it black and white with high contrast noir style', label: 'Blanco y negro noir' },
  { val: 'Add golden hour warm sunset lighting', label: 'Hora dorada' },
  { val: 'Add neon glow effects with vibrant electric colors', label: 'Neón brillante' },
  { val: 'Apply dreamy soft focus with pastel color toning', label: 'Efecto soñado' },
  { val: 'Add rain and reflections with moody atmospheric lighting', label: 'Lluvia atmosférica' },
];

const EDIT_ASPECT_OPTS: Option[] = [
  { val: 'match_input_image', label: '📐 Original' },
  { val: '1:1', label: '⬜ 1:1' },
  { val: '16:9', label: '🖥️ 16:9' },
  { val: '9:16', label: '📱 9:16' },
];

const RESOLUTION_OPTS: Option[] = [
  { val: '720p', label: '📺 720p' },
  { val: '1080p', label: '🎞️ 1080p' },
];

const VIDEO_ASPECT_OPTS: Option[] = [
  { val: '16:9', label: '🖥️ 16:9' },
  { val: '9:16', label: '📱 9:16' },
  { val: '1:1', label: '⬜ 1:1' },
];

const VIDEO_DURATIONS = ['3', '5', '8', '10'];

const VID_EDIT_MODE_OPTS: { val: VidEditMode; label: string }[] = [
  { val: 'edit', label: '✂️ Editar con prompt' },
  { val: 'animate', label: '🕺 Animar personaje' },
  { val: 'replace', label: '🔁 Reemplazar personas' },
];

const VOICES = [
  ['Zephyr', true], ['Puck', false], ['Charon', false], ['Kore', true], ['Fenrir', false], ['Leda', true],
  ['Orus', false], ['Aoede', true], ['Callirrhoe', true], ['Autonoe', true], ['Enceladus', false], ['Iapetus', false],
  ['Umbriel', false], ['Algenib', false], ['Despina', true], ['Erinome', true], ['Laomedeia', true], ['Achernar', true],
  ['Algieba', false], ['Schedar', false], ['Gacrux', true], ['Pulcherrima', true], ['Achird', false],
  ['Zubenelgenubi', false], ['Vindemiatrix', true], ['Sadachbia', false], ['Sadaltager', false], ['Sulafat', true],
  ['Alnilam', false], ['Rasalgethi', false],
].map(([name, female]) => ({ name: name as string, female: female as boolean }));

const AVATAR_LANGUAGES: Option[] = [
  { val: 'English (US)', label: 'Inglés (EE. UU.)' },
  { val: 'English (UK)', label: 'Inglés (Reino Unido)' },
  { val: 'Spanish', label: 'Español' },
  { val: 'French', label: 'Francés' },
  { val: 'German', label: 'Alemán' },
  { val: 'Italian', label: 'Italiano' },
  { val: 'Portuguese (Brazil)', label: 'Portugués (Brasil)' },
  { val: 'Japanese', label: 'Japonés' },
  { val: 'Korean', label: 'Coreano' },
  { val: 'Hindi', label: 'Hindi' },
];

const GENRE_OPTS: Option[] = [
  { val: 'pop', label: '🎤 Pop' },
  { val: 'rock', label: '🎸 Rock' },
  { val: 'balada', label: '🎹 Balada' },
  { val: 'orquestal', label: '🎻 Orquestal' },
  { val: 'electronica', label: '🎧 Electrónica' },
  { val: 'videojuego', label: '🕹️ Videojuego' },
];

// ── Prompts y etiquetas ───────────────────────────────────────────────────
const TEXT_TYPE_LABELS: Record<string, string> = {
  correo: 'Correo',
  tono: 'Cambio de tono',
  resumen: 'Resumen',
  traduccion: 'Traducción',
  historia: 'Historia',
  poema: 'Poema',
  eslogan: 'Eslogan',
  publicacion: 'Publicación',
  carta: 'Carta formal',
  descripcion: 'Descripción',
};

const TONE_LABELS: Record<string, string> = {
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
  romantico: 'Romántico',
};

const STYLE_LABELS: Record<string, string> = { cinematografico: 'Cinematográfico', cartoon: 'Cartoon', anime: 'Anime', fotorrealista: 'Fotorrealista' };
const ASSET_STYLE_LABELS: Record<string, string> = { pixelart: 'Pixel Art', cartoon2d: '2D Cartoon', anime2d: '2D Animé', animechibi: '2D Anime Chibi' };
const GENRE_LABELS: Record<string, string> = { pop: 'Pop', rock: 'Rock', balada: 'Balada', orquestal: 'Orquestal', electronica: 'Electrónica', videojuego: 'Videojuego' };

const IMAGE_STYLE_PROMPTS: Record<string, string> = {
  cinematografico: 'cinematic style, dramatic lighting, wide angle, film grain, movie still, high contrast, epic composition',
  cartoon: 'cartoon style, colorful, flat design, bold outlines, vibrant colors, animated look, fun illustration',
  anime: 'anime style, detailed, Japanese animation, expressive eyes, clean linework, soft colors, manga aesthetic',
  fotorrealista: 'photorealistic, ultra detailed, 8K resolution, real photography, natural lighting, lifelike textures, DSLR quality',
};

const ASSET_STYLE_PROMPTS: Record<string, string> = {
  pixelart: 'pixel art style, retro video game sprite, crisp pixel edges, limited color palette, clean silhouette',
  cartoon2d: '2D cartoon style, bold clean outlines, flat vibrant colors, simple cel shading, game asset illustration',
  anime2d: '2D anime style, clean linework, cel-shaded coloring, expressive character design',
  animechibi: '2D chibi anime style, super deformed proportions, big expressive eyes, cute rounded features',
};

const ASSET_QUALITY_SUFFIX =
  'isolated on a solid pure white background, no shadows, no extra elements, professional game asset quality, ultra high resolution, sharp clean details';

const MUSIC_GENRE_PROMPTS: Record<string, string> = {
  pop: 'upbeat pop song, catchy melody, modern production, synth and guitar, radio-friendly, 120 BPM',
  rock: 'energetic rock, electric guitar riffs, powerful drums, bass driven, stadium sound, 130 BPM',
  balada: 'emotional ballad, slow tempo, piano and strings, heartfelt melody, soft vocals vibe, 70 BPM',
  orquestal: 'full orchestral composition, strings, brass, woodwinds, epic and cinematic, classical arrangement',
  electronica: 'electronic dance music, synthesizers, deep bass, four-on-the-floor beat, futuristic sound, 128 BPM',
  videojuego: '8-bit and chiptune game soundtrack, retro synth, heroic theme, loopable, adventure mood',
};

const PLACEHOLDERS: Record<Tab, string> = {
  texto: '¿Qué quieres escribir? Ej: "Escribe un correo solicitando vacaciones"',
  imagen: 'Describe la imagen que quieres generar...',
  editar: 'Describe la edición que quieres aplicar...',
  activos: 'Describe el activo que quieres generar (personaje, objeto, ícono...)...',
  video: 'Describe el vídeo que quieres generar...',
  videoedit: 'Describe la edición del vídeo...',
  avatar: 'Escribe el guion que dirá el personaje (guion de voz)...',
  musica: 'Describe la música que quieres generar...',
};

// Los tres modelos de vídeo avanzado de Pruna comparten pantalla y polling;
// cambian el endpoint, qué campos exigen y cómo se etiqueta el resultado.
const VID_EDIT_MODES: Record<
  VidEditMode,
  {
    endpoint: string;
    badge: string;
    title: string;
    loading: string;
    icon: string;
    needsPrompt: boolean;
    needsImages: boolean;
    maxImages: number;
    supportsDraft: boolean;
    supportsResolution: boolean;
    hint: string;
  }
> = {
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
    hint: 'Describe el cambio y se aplica sobre el vídeo de origen. Máximo 15 segundos de vídeo.',
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
    hint: 'El personaje de la imagen se mueve copiando el movimiento, el ritmo y la cámara del vídeo de origen.',
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
    hint: 'Las personas del vídeo de origen se sustituyen por las identidades de las imágenes de referencia (hasta 4).',
  },
};

// Un vídeo viaja como data URI dentro del JSON (~33% más que el fichero): se
// corta aquí con un mensaje claro antes de que el Worker rechace el body.
const VID_EDIT_MAX_BYTES = 25 * 1024 * 1024;

// Mejora de calidad con p-image-upscale: 4 MP es el tramo más barato de Pruna
// y ya cuadruplica una salida típica de 1 MP.
const UPSCALE_TARGET_MEGAPIXELS = 4;

// Los vídeos con job asíncrono (avatar, editar, animar, reemplazar) tardan
// minutos: el backend responde con un job_id y aquí se consulta su estado.
const VIDEO_POLL_INTERVAL_MS = 5000;
const VIDEO_POLL_MAX_ATTEMPTS = 96; // ~8 minutos

// ── Estado ────────────────────────────────────────────────────────────────
const tab = ref<Tab>('texto');
const input = ref('');
const inputEl = ref<HTMLTextAreaElement | null>(null);

const s = reactive({
  textType: 'correo',
  tone: '',
  language: 'ingles',
  imageStyle: 'cinematografico',
  imageEngine: 'p-image',
  imageAspect: '1:1',
  imageQuality: 'high',
  imageSize: '1K',
  assetStyle: 'pixelart',
  assetEngine: 'p-image',
  assetAspect: '1:1',
  editImageUrl: '',
  editStyle: '',
  editBackground: '',
  editEffect: '',
  editAspect: 'match_input_image',
  videoStyle: 'cinematografico',
  videoResolution: '720p',
  videoAspect: '16:9',
  videoDuration: '5',
  videoDraft: false,
  vidEditMode: 'edit' as VidEditMode,
  vidEditVideo: '',
  vidEditImages: [] as string[],
  vidEditCharacterId: null as number | null,
  vidEditResolution: '720p',
  vidEditDraft: false,
  avatarCharacterId: null as number | null,
  avatarImage: '',
  avatarName: '',
  avatarAudioMode: 'script' as 'script' | 'audio',
  avatarAudio: '',
  avatarAudioName: '',
  avatarVoice: 'Zephyr (Female)',
  avatarLanguage: 'English (US)',
  avatarResolution: '720p',
  avatarVideoPrompt: '',
  avatarVoicePrompt: '',
  avatarNegativePrompt: '',
  musicGenre: 'pop',
});

const editUrlInput = ref('');
const vidEditUrlInput = ref('');
const dragZone = ref<string | null>(null);
const editFileInput = ref<HTMLInputElement | null>(null);
const vidEditFileInput = ref<HTMLInputElement | null>(null);
const vidEditImgInput = ref<HTMLInputElement | null>(null);
const avatarFileInput = ref<HTMLInputElement | null>(null);
const avatarAudioInput = ref<HTMLInputElement | null>(null);

// Último texto enviado: es el prompt que se guarda en el historial y con el
// que p-judger evalúa la imagen en pantalla.
let lastUserText = '';
let disposed = false;

const vidEditMode = computed(() => VID_EDIT_MODES[s.vidEditMode]);

// En vídeo avanzado el campo cambia de significado: en "editar" es la
// instrucción obligatoria; en los otros dos, una indicación opcional.
const placeholder = computed(() => {
  if (tab.value === 'videoedit') {
    return s.vidEditMode === 'edit' ? 'Describe la edición: "Cambia el cielo por un atardecer"...' : 'Instrucción opcional sobre el personaje y el movimiento...';
  }
  return PLACEHOLDERS[tab.value];
});

const vidEditRefsLabel = computed(() => {
  const max = vidEditMode.value.maxImages;
  return max === 1 ? 'Imagen del personaje a animar' : max > 1 ? `Imágenes de identidad (hasta ${max})` : 'Imágenes de referencia';
});

const vidEditImgHint = computed(() =>
  vidEditMode.value.maxImages > 1 ? 'Arrastra hasta 4 imágenes aquí o haz clic para seleccionar' : 'Arrastra una imagen aquí o haz clic para seleccionar',
);

function autoResize() {
  const el = inputEl.value;
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${Math.min(el.scrollHeight, 100)}px`;
}

// ── Carga, error y resultado ──────────────────────────────────────────────
const loading = reactive({ active: false, text: 'Generando...', icon: '✨' });
const error = ref('');
let errorTimer: number | undefined;

function setLoading(active: boolean, text = 'Generando...', icon = '✨') {
  loading.active = active;
  loading.text = text;
  loading.icon = icon;
}

function showError(msg: string) {
  error.value = msg;
  clearTimeout(errorTimer);
  errorTimer = window.setTimeout(() => (error.value = ''), 6000);
}

interface Result {
  kind: 'text' | 'image' | 'video' | 'audio';
  title: string;
  badge: string;
  text?: string;
  url?: string;
  filename?: string;
  alt?: string;
}

const result = ref<Result | null>(null);
const judgeResult = ref<{ total?: unknown; scores?: Record<string, unknown> } | null>(null);
const judgeRows = computed(() =>
  Object.entries(judgeResult.value?.scores ?? {}).filter((e): e is [string, string | number] => typeof e[1] === 'number' || typeof e[1] === 'string'),
);

function showResult(r: Result) {
  result.value = r;
  judgeResult.value = null;
}

function clearOutput() {
  result.value = null;
  error.value = '';
}

// ── Pestañas ──────────────────────────────────────────────────────────────
function selectTab(t: Tab) {
  if (t === tab.value) return;
  tab.value = t;
  clearOutput();
  void loadHistory(t);
}

function onTextTypeChange() {
  // "Cambio de tono" necesita un tono: se propone uno.
  if (s.textType === 'tono') s.tone = 'alegre';
}

function setVidEditMode(mode: VidEditMode) {
  s.vidEditMode = mode;
  // Al pasar de "reemplazar" (4 imágenes) a "animar" (1) se recorta la selección.
  const max = VID_EDIT_MODES[mode].maxImages;
  if (s.vidEditImages.length > max) s.vidEditImages = s.vidEditImages.slice(0, max);
}

// ── Prompt y etiqueta de resultado ────────────────────────────────────────
function buildPrompt(userText: string): string {
  switch (tab.value) {
    case 'texto': {
      const toneLabel = s.tone ? TONE_LABELS[s.tone] || s.tone : '';
      const tone = toneLabel ? ` Usa un tono ${toneLabel}.` : '';
      switch (s.textType) {
        case 'correo':
          return `Redacta un correo electrónico profesional y completo (con asunto, saludo, cuerpo y despedida) basado en la siguiente solicitud del usuario.${tone} Responde SOLO con el correo, sin explicaciones adicionales:\n\n"${userText}"`;
        case 'tono':
          return `Reescribe el siguiente texto con un tono ${toneLabel || 'profesional'}. Conserva el significado original pero adapta el estilo, vocabulario y estructura al tono indicado. Responde SOLO con el texto reescrito, sin explicaciones:\n\n"${userText}"`;
        case 'resumen':
          return `Haz un resumen claro y conciso del siguiente texto.${tone} Responde SOLO con el resumen, sin explicaciones adicionales:\n\n"${userText}"`;
        case 'traduccion':
          return `Traduce el siguiente texto al ${s.language || 'inglés'}. Responde SOLO con la traducción, sin explicaciones:\n\n"${userText}"`;
        case 'historia':
          return `Escribe una historia creativa basada en la siguiente idea.${tone} Responde SOLO con la historia:\n\n"${userText}"`;
        case 'poema':
          return `Escribe un poema basado en la siguiente idea.${tone} Responde SOLO con el poema:\n\n"${userText}"`;
        case 'eslogan':
          return `Genera 5 opciones de eslogan o lema creativos basados en lo siguiente.${tone} Responde SOLO con los eslóganes numerados:\n\n"${userText}"`;
        case 'publicacion':
          return `Escribe una publicación atractiva para redes sociales basada en lo siguiente. Incluye hashtags relevantes.${tone} Responde SOLO con la publicación:\n\n"${userText}"`;
        case 'carta':
          return `Redacta una carta formal completa (con fecha, destinatario, saludo, cuerpo y despedida) basada en lo siguiente.${tone} Responde SOLO con la carta:\n\n"${userText}"`;
        case 'descripcion':
          return `Escribe una descripción atractiva de producto para e-commerce o catálogo basada en lo siguiente.${tone} Responde SOLO con la descripción:\n\n"${userText}"`;
        default:
          return `${userText}${tone ? '\n\n' + tone : ''}`;
      }
    }
    case 'imagen':
      return `${userText}, ${IMAGE_STYLE_PROMPTS[s.imageStyle] || ''}`;
    case 'activos':
      return `${userText}, ${ASSET_STYLE_PROMPTS[s.assetStyle] || ''}, ${ASSET_QUALITY_SUFFIX}`;
    case 'video':
      return `${userText}, ${IMAGE_STYLE_PROMPTS[s.videoStyle] || ''}`;
    case 'musica':
      return `${userText ? userText + ', ' : ''}${MUSIC_GENRE_PROMPTS[s.musicGenre] || ''}`;
    default:
      return userText;
  }
}

function resultBadge(): string {
  switch (tab.value) {
    case 'texto':
      if (s.textType === 'tono' && s.tone) return `🎭 ${TONE_LABELS[s.tone] || s.tone}`;
      return `✍️ ${TEXT_TYPE_LABELS[s.textType] || s.textType}`;
    case 'imagen':
      return `🖼️ ${STYLE_LABELS[s.imageStyle] || ''}`;
    case 'activos':
      return `🧩 ${ASSET_STYLE_LABELS[s.assetStyle] || ''}`;
    case 'video':
      return `🎬 ${STYLE_LABELS[s.videoStyle] || ''}`;
    case 'musica':
      return `🎵 ${GENRE_LABELS[s.musicGenre] || ''}`;
    default:
      return 'Generado';
  }
}

// ── Peticiones ────────────────────────────────────────────────────────────
/** POST JSON; si falla, lanza el error del servidor. */
async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await apiFetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = (await res.json().catch(() => ({}))) as T;
  if (!res.ok) throw new Error(errorMessage(data, `Error ${res.status}`));
  return data;
}

const reason = (err: unknown) => (err instanceof Error && err.message) || 'Inténtalo de nuevo.';

function generate() {
  if (loading.active) return;
  const userText = input.value.trim();
  if (tab.value === 'editar') return void generateEdit(userText);
  if (tab.value === 'avatar') return void generateAvatar(userText);
  if (tab.value === 'videoedit') return void generateAdvancedVideo(userText);
  if (!userText) {
    showError('Escribe algo antes de generar.');
    return;
  }
  void generateBasic(userText);
}

const BASIC_LOADING: Partial<Record<Tab, { icon: string; text: string }>> = {
  texto: { icon: '✍️', text: 'Redactando texto...' },
  imagen: { icon: '🖼️', text: 'Generando imagen...' },
  activos: { icon: '🧩', text: 'Generando activo...' },
  video: { icon: '🎬', text: 'Generando vídeo...' },
  musica: { icon: '🎵', text: 'Componiendo música...' },
};

const FORCE_TYPE: Partial<Record<Tab, number>> = { texto: 1, imagen: 2, activos: 2, video: 3, musica: 4 };

/** Texto, imagen, activos, vídeo y música van por /api/chat con force_type. */
async function generateBasic(userText: string) {
  const current = tab.value;
  clearOutput();
  const l = BASIC_LOADING[current];
  setLoading(true, l?.text, l?.icon);
  lastUserText = userText;
  const badge = resultBadge();

  const payload: Record<string, unknown> = {
    message: buildPrompt(userText),
    conversation_id: `gen_${Date.now()}`,
    force_type: FORCE_TYPE[current] || 1,
    skip_history: true,
  };
  // El backend valida motor, aspecto y calidad contra su propia lista blanca.
  if (current === 'imagen') {
    payload.image_options = { engine: s.imageEngine, aspect_ratio: s.imageAspect, thinking: s.imageQuality, image_size: s.imageSize };
  } else if (current === 'activos') {
    payload.image_options = { engine: s.assetEngine, aspect_ratio: s.assetAspect };
  } else if (current === 'video') {
    payload.video_options = { resolution: s.videoResolution, aspect_ratio: s.videoAspect, duration: parseInt(s.videoDuration, 10), draft: s.videoDraft };
  }

  try {
    const data = await postJson<Record<string, string | undefined>>('/api/chat', payload);
    if (current === 'texto') {
      const text = data.response || data.reply || data.text || data.content || '';
      showResult({ kind: 'text', title: '✍️ Texto generado', badge, text });
      await saveHistory('texto', badge, userText, text);
    } else if (current === 'imagen' || current === 'activos') {
      const url = data.image_url || data.url || '';
      if (!url) return showError('No se recibió URL de imagen.');
      const asset = current === 'activos';
      showResult({
        kind: 'image',
        title: asset ? '🧩 Activo generado' : '🖼️ Imagen generada',
        badge,
        url,
        filename: asset ? 'activo-mirai.png' : 'imagen-mirai.png',
        alt: asset ? 'Activo generado' : 'Imagen generada',
      });
      await saveHistory(current, badge, userText, url);
    } else if (current === 'video') {
      const url = data.video_url || data.url || '';
      if (!url) return showError('No se recibió URL de vídeo.');
      showResult({ kind: 'video', title: '🎬 Vídeo generado', badge, url, filename: 'video-mirai.mp4' });
      await saveHistory('video', badge, userText, url);
    } else if (current === 'musica') {
      const url = data.audio_url || data.url || '';
      if (!url) return showError('No se recibió URL de audio.');
      showResult({ kind: 'audio', title: '🎵 Música generada', badge, url, filename: 'musica-mirai.mp3' });
      await saveHistory('musica', badge, userText, url);
    }
  } catch (err) {
    console.error('generation error:', err);
    showError('Error al generar: ' + reason(err));
  } finally {
    setLoading(false);
  }
}

// ── Edición, mejora y evaluación de imagen ────────────────────────────────
async function generateEdit(userText: string) {
  if (!s.editImageUrl) return showError('Primero selecciona una imagen para editar.');
  const prompt = [userText, s.editStyle, s.editBackground, s.editEffect].filter(Boolean).join('. ');
  if (!prompt) return showError('Escribe una instrucción de edición o selecciona al menos una opción.');

  clearOutput();
  setLoading(true, 'Editando imagen...', '✏️');
  lastUserText = prompt;
  try {
    const data = await postJson<{ image_url?: string }>('/api/image-edit', { prompt, image_url: s.editImageUrl, aspect_ratio: s.editAspect });
    const url = data.image_url || '';
    if (!url) return showError('No se recibió la imagen editada.');
    showResult({ kind: 'image', title: '✏️ Imagen editada', badge: '✏️ Edición', url, filename: 'editada-mirai.jpg', alt: 'Imagen editada' });
    await saveHistory('editar', '✏️ Edición', prompt, url);
  } catch (err) {
    console.error('image-edit error:', err);
    showError('Error al editar: ' + reason(err));
  } finally {
    setLoading(false);
  }
}

/** Lleva una imagen (del resultado o del historial) a la pestaña de edición. */
function editImage(url: string) {
  s.editImageUrl = url;
  tab.value = 'editar';
  result.value = null;
  inputEl.value?.focus();
}

// Botón ocupado (mejorar o evaluar): una sola acción a la vez.
const busyKey = ref<string | null>(null);

// `promptText` llega desde el historial, que conoce el prompt de esa imagen.
async function upscale(imageUrl: string, promptText?: string) {
  if (loading.active || busyKey.value) return;
  busyKey.value = `upscale:${imageUrl}`;
  try {
    const data = await postJson<{ image_url?: string; target_megapixels?: number }>('/api/image-upscale', {
      image_url: imageUrl,
      target: UPSCALE_TARGET_MEGAPIXELS,
    });
    const url = data.image_url;
    if (!url) throw new Error('No se recibió la imagen mejorada.');
    const badge = `🔍 ${data.target_megapixels || UPSCALE_TARGET_MEGAPIXELS} MP`;
    showResult({ kind: 'image', title: '🔍 Imagen mejorada', badge, url, filename: 'mejorada-mirai.jpg', alt: 'Imagen mejorada' });
    // Se archiva como 'editar': es una imagen derivada de otra.
    await saveHistory('editar', '🔍 Mejorada', promptText || lastUserText || 'Mejora de calidad', url);
  } catch (err) {
    console.error('upscale error:', err);
    showError('Error al mejorar la imagen: ' + reason(err));
  } finally {
    busyKey.value = null;
  }
}

async function judge(imageUrl: string) {
  const prompt = lastUserText.trim();
  if (!prompt) return showError('No hay un prompt asociado a esta imagen para evaluarla.');
  if (busyKey.value) return;
  busyKey.value = 'judge';
  try {
    judgeResult.value = await postJson<{ total?: unknown; scores?: Record<string, unknown> }>('/api/image-judge', { image_url: imageUrl, prompt });
  } catch (err) {
    console.error('judge error:', err);
    showError('Error al evaluar la imagen: ' + reason(err));
  } finally {
    busyKey.value = null;
  }
}

// ── Archivos ──────────────────────────────────────────────────────────────
function readDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('No se pudo leer el archivo'));
    reader.readAsDataURL(file);
  });
}

function onPicked(e: Event, handler: (file: File) => void) {
  const inputFile = e.target as HTMLInputElement;
  const file = inputFile.files?.[0];
  if (file) handler(file);
  inputFile.value = '';
}

function onDropSingle(e: DragEvent, typePrefix: string, handler: (file: File) => void) {
  dragZone.value = null;
  const file = e.dataTransfer?.files[0];
  if (file && file.type.startsWith(typePrefix)) handler(file);
}

async function onEditFile(file: File) {
  s.editImageUrl = await readDataUrl(file);
}

async function onVidEditFile(file: File) {
  if (file.size > VID_EDIT_MAX_BYTES) {
    showError(
      `El vídeo pesa ${(file.size / 1024 / 1024).toFixed(1)} MB; el máximo admitido es ${VID_EDIT_MAX_BYTES / 1024 / 1024} MB. Recórtalo o bájale la resolución.`,
    );
    return;
  }
  s.vidEditVideo = await readDataUrl(file);
}

async function addRefImages(files: FileList | null | undefined) {
  const max = vidEditMode.value.maxImages;
  const room = max - s.vidEditImages.length;
  if (room <= 0) {
    showError(`Este modo admite como máximo ${max} imagen(es) de referencia.`);
    return;
  }
  for (const file of Array.from(files ?? []).slice(0, room)) {
    if (file.type.startsWith('image/')) s.vidEditImages.push(await readDataUrl(file));
  }
}

function onDropRefImages(e: DragEvent) {
  dragZone.value = null;
  void addRefImages(e.dataTransfer?.files);
}

function onPickRefImages(e: Event) {
  const el = e.target as HTMLInputElement;
  void addRefImages(el.files).then(() => (el.value = ''));
}

// ── Vídeo con job asíncrono ───────────────────────────────────────────────
interface PollOptions {
  title: string;
  badge: string;
  loading: string;
  icon: string;
  filename: string;
  historyTab: Tab;
  errorLabel: string;
}

async function pollVideoJob(jobId: string, o: PollOptions) {
  const startedAt = Date.now();
  for (let attempt = 1; !disposed; attempt++) {
    const elapsed = Math.round((Date.now() - startedAt) / 1000);
    setLoading(true, `${o.loading} (${elapsed}s, esto puede tardar varios minutos)`, o.icon);
    const last = attempt >= VIDEO_POLL_MAX_ATTEMPTS;
    try {
      const { ok, status, data } = await api.get<{ status?: string; video_url?: string; error?: string }>(`/api/video-jobs?id=${encodeURIComponent(jobId)}`);
      if (!ok) throw new Error(`Error ${status}`);
      if (data.status === 'done' && data.video_url) {
        showResult({ kind: 'video', title: o.title, badge: o.badge, url: data.video_url, filename: o.filename });
        // El backend ya guardó la generación en el historial al terminar el job.
        void loadHistory(o.historyTab);
        return;
      }
      if (data.status === 'error') return showError(`Error al generar ${o.errorLabel}: ` + (data.error || 'Inténtalo de nuevo.'));
      if (last) {
        return showError('La generación está tardando más de lo esperado. Sigue procesándose en segundo plano; revisa tu historial en unos minutos.');
      }
    } catch {
      if (last) return showError('No se pudo confirmar el estado del vídeo. Revisa tu historial en unos minutos.');
    }
    await new Promise((r) => setTimeout(r, VIDEO_POLL_INTERVAL_MS));
  }
}

async function generateAdvancedVideo(userText: string) {
  const mode = vidEditMode.value;
  if (!s.vidEditVideo) return showError('Sube o pega la URL del vídeo de origen primero.');
  if (mode.needsPrompt && !userText) return showError('Escribe la edición que quieres aplicar al vídeo.');
  if (mode.needsImages && !s.vidEditCharacterId && !s.vidEditImages.length) {
    return showError('Selecciona un personaje guardado o sube al menos una imagen de referencia.');
  }

  clearOutput();
  setLoading(true, mode.loading, mode.icon);
  lastUserText = userText || mode.badge;

  const payload: Record<string, unknown> = { video: s.vidEditVideo };
  if (mode.needsPrompt) payload.prompt = userText;
  else if (userText) payload.instruction_prompt = userText;
  if (s.vidEditCharacterId) payload.character_id = s.vidEditCharacterId;
  if (s.vidEditImages.length) payload.images = s.vidEditImages.slice(0, mode.maxImages);
  if (mode.supportsResolution) payload.resolution = s.vidEditResolution;
  if (mode.supportsDraft) payload.draft = s.vidEditDraft;

  try {
    const data = await postJson<{ job_id?: string }>(mode.endpoint, payload);
    if (!data.job_id) return showError('No se pudo iniciar la generación del vídeo.');
    await pollVideoJob(data.job_id, {
      title: mode.title,
      badge: mode.badge,
      loading: mode.loading,
      icon: mode.icon,
      filename: `${s.vidEditMode}-mirai.mp4`,
      historyTab: 'videoedit',
      errorLabel: 'el vídeo',
    });
  } catch (err) {
    console.error('video avanzado error:', err);
    showError('Error al generar el vídeo: ' + reason(err));
  } finally {
    setLoading(false);
  }
}

// ── Vídeo avatar y personajes ─────────────────────────────────────────────
interface Character {
  id: number;
  name?: string;
  image_url: string;
}

const characters = ref<Character[]>([]);

/** Personaje elegido o retrato nuevo que se muestra en el panel. */
const avatarPreview = ref<{ url: string; name: string } | null>(null);

async function loadCharacters() {
  try {
    const { ok, data } = await api.get<{ characters?: Character[] }>('/api/video-avatar/characters');
    if (ok) characters.value = data.characters || [];
  } catch (e) {
    console.warn('No se pudieron cargar los personajes:', e);
  }
}

function selectAvatarCharacter(c: Character) {
  s.avatarCharacterId = c.id;
  s.avatarImage = '';
  avatarPreview.value = { url: c.image_url, name: c.name || '' };
}

function clearAvatar() {
  s.avatarCharacterId = null;
  s.avatarImage = '';
  avatarPreview.value = null;
}

async function deleteAvatarCharacter(id: number) {
  if (!confirm('¿Eliminar este personaje guardado?')) return;
  await api.delete(`/api/video-avatar/characters?id=${id}`).catch(() => undefined);
  if (s.avatarCharacterId === id) clearAvatar();
  void loadCharacters();
}

async function onAvatarFile(file: File) {
  s.avatarImage = await readDataUrl(file);
  s.avatarCharacterId = null;
  avatarPreview.value = { url: s.avatarImage, name: 'Nuevo personaje' };
}

async function onAvatarAudioFile(file: File) {
  s.avatarAudio = await readDataUrl(file);
  s.avatarAudioName = file.name;
}

async function generateAvatar(userText: string) {
  if (!s.avatarCharacterId && !s.avatarImage) return showError('Sube o selecciona un personaje primero.');
  if (s.avatarAudioMode === 'script' && !userText) return showError('Escribe el guion que dirá el personaje.');
  if (s.avatarAudioMode === 'audio' && !s.avatarAudio) return showError('Sube un archivo de audio.');

  clearOutput();
  setLoading(true, 'Generando vídeo avatar...', '🗣️');
  lastUserText = s.avatarAudioMode === 'script' ? userText : '(audio subido)';

  const payload: Record<string, unknown> = { voice: s.avatarVoice, voice_language: s.avatarLanguage, resolution: s.avatarResolution };
  if (s.avatarCharacterId) {
    payload.character_id = s.avatarCharacterId;
  } else {
    payload.image = s.avatarImage;
    if (s.avatarName.trim()) payload.character_name = s.avatarName.trim();
  }
  if (s.avatarAudioMode === 'audio') payload.audio = s.avatarAudio;
  else payload.voice_script = userText;
  if (s.avatarVideoPrompt.trim()) payload.video_prompt = s.avatarVideoPrompt.trim();
  if (s.avatarVoicePrompt.trim()) payload.voice_prompt = s.avatarVoicePrompt.trim();
  if (s.avatarNegativePrompt.trim()) payload.negative_prompt = s.avatarNegativePrompt.trim();

  try {
    const data = await postJson<{ job_id?: string; character?: Character }>('/api/generate-video-avatar', payload);
    if (!data.job_id) return showError('No se pudo iniciar la generación del vídeo.');
    // Un retrato nuevo se guarda como personaje: pasa a estar seleccionado.
    if (data.character?.id) {
      selectAvatarCharacter(data.character);
      void loadCharacters();
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
    console.error('video-avatar error:', err);
    showError('Error al generar el vídeo avatar: ' + reason(err));
  } finally {
    setLoading(false);
  }
}

// ── Copiar ────────────────────────────────────────────────────────────────
const copiedKey = ref<string | null>(null);
let copyTimer: number | undefined;

async function copyText(key: string, text: string, ms = 2200) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    return;
  }
  copiedKey.value = key;
  clearTimeout(copyTimer);
  copyTimer = window.setTimeout(() => (copiedKey.value = null), ms);
}

// ── Historial (D1) ────────────────────────────────────────────────────────
interface HistoryItem {
  id: number;
  type: Tab;
  badge?: string;
  prompt?: string;
  result?: string;
  created_at?: string;
}

const IMAGE_TYPES: Tab[] = ['imagen', 'activos', 'editar'];
const VIDEO_TYPES: Tab[] = ['video', 'avatar', 'videoedit'];
const HIST_IMAGE_ALT: Partial<Record<Tab, string>> = { imagen: 'Imagen', activos: 'Activo', editar: 'Editada' };
const HIST_DOWNLOAD: Partial<Record<Tab, string>> = {
  imagen: 'imagen-mirai.png',
  activos: 'activo-mirai.png',
  editar: 'editada-mirai.jpg',
  video: 'video-mirai.mp4',
  avatar: 'avatar-mirai.mp4',
  videoedit: 'video-avanzado-mirai.mp4',
  musica: 'musica-mirai.mp3',
};

const history = reactive({
  state: 'idle' as 'idle' | 'loading' | 'empty' | 'error' | 'ready',
  items: [] as HistoryItem[],
  page: 1,
  hasMore: false,
});
// Pestaña cuyo historial se muestra (la del último resultado o la elegida).
const histTab = ref<Tab>('texto');

async function fetchHistory(type: Tab, page: number) {
  const { ok, data } = await api.get<{ items?: HistoryItem[]; limit?: number }>(`/api/gen-history?type=${type}&page=${page}`);
  if (!ok) throw new Error('Error cargando historial');
  return { items: data.items || [], limit: data.limit };
}

async function loadHistory(type: Tab = histTab.value) {
  histTab.value = type;
  history.page = 1;
  history.state = 'loading';
  try {
    const { items, limit } = await fetchHistory(type, 1);
    if (histTab.value !== type) return;
    history.items = items;
    history.hasMore = items.length === limit;
    history.state = items.length ? 'ready' : 'empty';
  } catch {
    history.state = 'error';
    history.hasMore = false;
  }
}

async function loadMoreHistory() {
  const type = histTab.value;
  try {
    const { items, limit } = await fetchHistory(type, history.page + 1);
    if (histTab.value !== type) return;
    history.page++;
    history.items.push(...items);
    history.hasMore = items.length === limit;
  } catch {
    history.state = 'error';
  }
}

async function saveHistory(type: Tab, badge: string, prompt: string, value: string) {
  try {
    await api.post('/api/gen-history', { type, badge, prompt, result: value });
  } catch (e) {
    console.warn('No se pudo guardar en historial:', e);
  }
  await loadHistory(type);
}

async function deleteHistoryItem(id: number) {
  await api.delete(`/api/gen-history?id=${id}`).catch(() => undefined);
  await loadHistory();
}

async function clearHistory(type: Tab | null) {
  if (!confirm(type ? `¿Borrar todo el historial de ${type}?` : '¿Borrar TODO el historial de generación?')) return;
  await api.delete(type ? `/api/gen-history?type=${type}` : '/api/gen-history').catch(() => undefined);
  await loadHistory();
}

function formatDate(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' })} ${d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}`;
}

// ── Arranque ──────────────────────────────────────────────────────────────
onMounted(async () => {
  void ensureSubscribed();
  void loadCharacters();
  // El historial solo se pinta al entrar si ya hay algo de la primera pestaña.
  try {
    const { items, limit } = await fetchHistory('texto', 1);
    if (items.length && !disposed && history.state === 'idle') {
      history.items = items;
      history.hasMore = items.length === limit;
      history.state = 'ready';
    }
  } catch {
    // Sin historial al entrar.
  }
});

onBeforeUnmount(() => {
  disposed = true;
  clearTimeout(errorTimer);
  clearTimeout(copyTimer);
});
</script>

<style>
/* CSS propio de la página antigua, limitado a ella (ver router: meta.page). */
/* ── Estilos exclusivos de generation ── */

/* El desplazamiento respecto al sidebar lo aplica la regla compartida
 del final de styles.css (familia B), que sigue `--sidebar-w`. */
:where(body[data-page="generation"]) .gen-page-content {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

/* ── Hero + input superior ── */
:where(body[data-page="generation"]) .gen-hero-zone {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 52px 24px 28px;
  text-align: center;
}

:where(body[data-page="generation"]) .gen-hero-icon {
  font-size: 3rem;
  margin-bottom: 12px;
  display: block;
  animation: gen-icon-in 0.6s cubic-bezier(0.16, 1, 0.3, 1) both;
}

@keyframes gen-icon-in {
  from { opacity: 0; transform: scale(0.7) translateY(10px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}

:where(body[data-page="generation"]) .gen-hero-title {
  font-size: clamp(1.6rem, 4vw, 2.2rem);
  font-weight: 700;
  background: var(--accent-gradient, linear-gradient(135deg, #6750A4, #9A82DB));
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  margin: 0 0 6px;
}

:where(body[data-page="generation"]) .gen-hero-subtitle {
  font-size: 0.93rem;
  color: var(--text-secondary, #888);
  margin: 0 0 26px;
  max-width: 520px;
}

/* ── Barra de input superior ── */
:where(body[data-page="generation"]) .gen-input-wrapper {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  max-width: 720px;
  background: var(--gen-input-bg, #ffffff);
  border: 2px solid var(--glass-border, rgba(103, 80, 164, 0.2));
  border-radius: 999px;
  padding: 10px 10px 10px 22px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.06);
  transition: border-color 0.2s, box-shadow 0.2s;
  box-sizing: border-box;
}

:root :where(body[data-page="generation"]) .gen-input-wrapper { --gen-input-bg: #ffffff; }
[data-theme="dark"] :where(body[data-page="generation"]) .gen-input-wrapper { --gen-input-bg: #1e1b26; }

:where(body[data-page="generation"]) .gen-input-wrapper:hover { border-color: var(--accent-color, #6750A4); }
:where(body[data-page="generation"]) .gen-input-wrapper:focus-within {
  border-color: var(--accent-color, #6750A4);
  box-shadow: 0 2px 16px rgba(0, 0, 0, 0.08), 0 0 0 3px var(--accent-glow, rgba(103, 80, 164, 0.18));
}

:where(body[data-page="generation"]) .gen-input-wrapper textarea {
  flex: 1;
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
  border-radius: 0 !important;
  padding: 0 !important;
  margin: 0 !important;
  outline: none !important;
  resize: none;
  font-size: 1rem;
  line-height: 1.5;
  color: var(--text-primary, #333);
  min-height: 24px;
  max-height: 100px;
  font-family: inherit;
}

:where(body[data-page="generation"]) .gen-input-wrapper textarea::placeholder { color: var(--text-secondary, #aaa); }

:where(body[data-page="generation"]) .gen-input-wrapper .send-button {
  flex-shrink: 0;
  width: 42px;
  height: 42px;
  border-radius: 50%;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* ── Área principal ── */
:where(body[data-page="generation"]) .gen-body {
  flex: 1;
  width: 100%;
  max-width: 920px;
  margin: 0 auto;
  padding: 0 24px 64px;
  box-sizing: border-box;
}

/* ── Tabs de módulo — wrap en vez de scroll ── */
:where(body[data-page="generation"]) .gen-tabs {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 20px;
}

:where(body[data-page="generation"]) .gen-tabs .filter-pill {
  flex: 1 1 0;
  min-width: 0;
  text-align: center;
  justify-content: center;
  white-space: nowrap;
}

/* ── Paneles ── */
:where(body[data-page="generation"]) .gen-panel { display: none; }
:where(body[data-page="generation"]) .gen-panel.active { display: block; }

/* ── Sección de opciones ── */
:where(body[data-page="generation"]) .gen-options-label {
  font-size: 0.78rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: var(--text-secondary, #999);
  margin: 0 0 10px;
}

/* Filas de opciones: wrap en vez de scroll */
:where(body[data-page="generation"]) .gen-options-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 20px;
  padding-bottom: 4px;
}

:where(body[data-page="generation"]) .gen-options-row .filter-pill {
  flex: 1 1 0;
  min-width: 0;
  text-align: center;
  justify-content: center;
  white-space: nowrap;
}

/* ── Dropdowns (select) ── */
:where(body[data-page="generation"]) .gen-select {
  width: 100%;
  padding: 10px 14px;
  border-radius: 12px;
  border: 1.5px solid var(--glass-border, rgba(103, 80, 164, 0.2));
  background: var(--gen-input-bg, #fff);
  color: var(--text-primary, #333);
  font-size: 0.88rem;
  font-family: inherit;
  outline: none;
  cursor: pointer;
  transition: border-color 0.2s;
  margin-bottom: 14px;
  -webkit-appearance: none;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24'%3E%3Cpath fill='%23888' d='M7 10l5 5 5-5z'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 12px center;
  padding-right: 32px;
}

[data-theme="dark"] :where(body[data-page="generation"]) .gen-select { background-color: #1e1b26; }
:where(body[data-page="generation"]) .gen-select:focus { border-color: var(--accent-color, #6750A4); }

/* Grid de dropdowns */
:where(body[data-page="generation"]) .gen-selects-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 12px;
  margin-bottom: 16px;
}

:where(body[data-page="generation"]) .gen-selects-grid .gen-select-group { display: flex; flex-direction: column; }
:where(body[data-page="generation"]) .gen-selects-grid .gen-select { margin-bottom: 0; }
:where(body[data-page="generation"]) .gen-selects-grid .gen-select-label {
  font-size: 0.72rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-secondary, #999);
  margin-bottom: 6px;
}

/* ── Tarjeta de resultado ── */
:where(body[data-page="generation"]) .gen-result-card {
  display: none;
  background: var(--glass-bg, rgba(255, 255, 255, 0.94));
  border: 1px solid var(--glass-border, rgba(103, 80, 164, 0.12));
  border-radius: 18px;
  padding: 28px;
  box-shadow: 0 2px 16px var(--accent-glow, rgba(103, 80, 164, 0.06));
  animation: gen-fade-up 0.45s ease both;
}

:where(body[data-page="generation"]) .gen-result-card.visible { display: block; }

@keyframes gen-fade-up {
  from { opacity: 0; transform: translateY(16px); }
  to { opacity: 1; transform: translateY(0); }
}

:where(body[data-page="generation"]) .gen-result-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 18px;
}

:where(body[data-page="generation"]) .gen-result-title {
  font-size: 1rem;
  font-weight: 700;
  color: var(--text-primary, #333);
  display: flex;
  align-items: center;
  gap: 8px;
}

:where(body[data-page="generation"]) .gen-result-badge {
  font-size: 0.7rem;
  padding: 3px 11px;
  border-radius: 999px;
  background: var(--secondary-container, #E8DEF8);
  color: var(--accent-color, #6750A4);
  font-weight: 600;
}

:where(body[data-page="generation"]) .gen-text-output {
  font-size: 0.95rem;
  line-height: 1.78;
  color: var(--text-primary, #333);
  white-space: pre-wrap;
  word-break: break-word;
}

:where(body[data-page="generation"]) .gen-image-output { width: 100%; border-radius: 12px; display: block; margin: 0 auto; }
:where(body[data-page="generation"]) .gen-video-output { width: 100%; border-radius: 12px; display: block; }
:where(body[data-page="generation"]) .gen-audio-output { width: 100%; margin-top: 8px; }

/* ── Botón copiar/descargar ── */
:where(body[data-page="generation"]) .gen-action-btn {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 8px 20px;
  border-radius: 999px;
  border: 1.5px solid var(--accent-color, #6750A4);
  background: transparent;
  color: var(--accent-color, #6750A4);
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s, color 0.2s;
  font-family: inherit;
  text-decoration: none;
}

:where(body[data-page="generation"]) .gen-action-btn:hover { background: var(--accent-color, #6750A4); color: #fff; }
:where(body[data-page="generation"]) .gen-action-btn.copied { background: #34c759; border-color: #34c759; color: #fff; }

/* ── Loading ── */
:where(body[data-page="generation"]) .gen-loading {
  display: none;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 36px 0 44px;
  text-align: center;
}

:where(body[data-page="generation"]) .gen-loading.visible { display: flex; }

:where(body[data-page="generation"]) .gen-orb {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: var(--accent-gradient, linear-gradient(135deg, #6750A4, #9A82DB));
  box-shadow: 0 0 0 0 var(--accent-glow, rgba(103, 80, 164, 0.4));
  animation: gen-pulse 1.8s ease-in-out infinite;
  position: relative;
}

@keyframes gen-pulse {
  0% { transform: scale(1); box-shadow: 0 0 0 0 var(--accent-glow, rgba(103, 80, 164, 0.35)); }
  50% { transform: scale(1.08); box-shadow: 0 0 0 16px transparent; }
  100% { transform: scale(1); box-shadow: 0 0 0 0 transparent; }
}

:where(body[data-page="generation"]) .gen-orb-icon {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.5rem;
}

:where(body[data-page="generation"]) .gen-progress-bar {
  width: min(340px, 80vw);
  height: 4px;
  border-radius: 999px;
  background: var(--glass-border, rgba(103, 80, 164, 0.15));
  overflow: hidden;
}

:where(body[data-page="generation"]) .gen-progress-fill {
  height: 100%;
  width: 38%;
  border-radius: 999px;
  background: var(--accent-gradient, linear-gradient(135deg, #6750A4, #9A82DB));
  animation: gen-slide 1.5s ease-in-out infinite;
}

@keyframes gen-slide {
  0% { transform: translateX(-120%); }
  100% { transform: translateX(380%); }
}

:where(body[data-page="generation"]) .gen-loading-text {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--text-primary, #333);
}

/* ── Error ── */
:where(body[data-page="generation"]) .gen-error {
  display: none;
  padding: 14px 18px;
  border-radius: 12px;
  background: #FFEBEE;
  border: 1px solid #EF9A9A;
  color: #B71C1C;
  font-size: 0.88rem;
  margin-bottom: 16px;
}

:where(body[data-page="generation"]) .gen-error.visible { display: block; }

/* ── Historial ── */
:where(body[data-page="generation"]) .gen-history-section {
  margin-top: 36px;
  border-top: 1px solid var(--glass-border, rgba(103, 80, 164, 0.12));
  padding-top: 28px;
}

:where(body[data-page="generation"]) .gen-history-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 18px;
}

:where(body[data-page="generation"]) .gen-history-title {
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--text-primary, #333);
  margin: 0;
}

:where(body[data-page="generation"]) .gen-history-empty {
  text-align: center;
  padding: 36px 0;
  color: var(--text-secondary, #aaa);
  font-size: 0.92rem;
}

:where(body[data-page="generation"]) .gen-history-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 16px;
}

:where(body[data-page="generation"]) .gen-hist-card {
  background: var(--glass-bg, rgba(255, 255, 255, 0.94));
  border: 1px solid var(--glass-border, rgba(103, 80, 164, 0.12));
  border-radius: 14px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  box-shadow: 0 1px 8px var(--accent-glow, rgba(103, 80, 164, 0.05));
  animation: gen-fade-up 0.3s ease both;
}

:where(body[data-page="generation"]) .gen-hist-card-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}

:where(body[data-page="generation"]) .gen-hist-badge {
  font-size: 0.68rem;
  padding: 2px 9px;
  border-radius: 999px;
  background: var(--secondary-container, #E8DEF8);
  color: var(--accent-color, #6750A4);
  font-weight: 600;
  white-space: nowrap;
}

:where(body[data-page="generation"]) .gen-hist-date {
  font-size: 0.7rem;
  color: var(--text-secondary, #aaa);
  white-space: nowrap;
}

:where(body[data-page="generation"]) .gen-hist-prompt {
  font-size: 0.82rem;
  color: var(--text-secondary, #888);
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  line-height: 1.5;
}

:where(body[data-page="generation"]) .gen-hist-preview-text {
  font-size: 0.88rem;
  color: var(--text-primary, #333);
  line-height: 1.6;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 4;
  -webkit-box-orient: vertical;
  white-space: pre-wrap;
}

:where(body[data-page="generation"]) .gen-hist-img {
  width: 100%;
  border-radius: 8px;
  display: block;
  max-height: 180px;
  object-fit: cover;
}

:where(body[data-page="generation"]) .gen-hist-audio { width: 100%; }

:where(body[data-page="generation"]) .gen-hist-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 2px;
}

:where(body[data-page="generation"]) .gen-hist-del-btn {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text-secondary, #aaa);
  font-size: 0.8rem;
  padding: 4px 8px;
  border-radius: 6px;
  transition: color 0.2s, background 0.2s;
  font-family: inherit;
}

:where(body[data-page="generation"]) .gen-hist-del-btn:hover { color: #B71C1C; background: #FFEBEE; }

/* ── Edición de imagen ── */
:where(body[data-page="generation"]) .gen-edit-preview-wrap {
  position: relative;
  display: inline-block;
  margin-bottom: 12px;
}

:where(body[data-page="generation"]) .gen-edit-preview-img {
  max-width: 280px;
  max-height: 200px;
  border-radius: 12px;
  border: 2px solid var(--glass-border, rgba(103, 80, 164, 0.15));
  object-fit: cover;
}

:where(body[data-page="generation"]) .gen-edit-change-btn {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: none;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  font-size: 0.9rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}

:where(body[data-page="generation"]) .gen-edit-upload-zone {
  border: 2px dashed var(--glass-border, rgba(103, 80, 164, 0.25));
  border-radius: 14px;
  padding: 28px 20px;
  text-align: center;
  cursor: pointer;
  transition: border-color 0.2s, background 0.2s;
}

:where(body[data-page="generation"]) .gen-edit-upload-zone:hover,
:where(body[data-page="generation"]) .gen-edit-upload-zone.dragover {
  border-color: var(--accent-color, #6750A4);
  background: var(--accent-glow, rgba(103, 80, 164, 0.06));
}

:where(body[data-page="generation"]) .gen-edit-url-input {
  flex: 1;
  padding: 8px 14px;
  border-radius: 999px;
  border: 1.5px solid var(--glass-border, rgba(103, 80, 164, 0.2));
  background: var(--gen-input-bg, #fff);
  color: var(--text-primary, #333);
  font-size: 0.88rem;
  font-family: inherit;
  outline: none;
  transition: border-color 0.2s;
}

[data-theme="dark"] :where(body[data-page="generation"]) .gen-edit-url-input { background: #1e1b26; }
:where(body[data-page="generation"]) .gen-edit-url-input:focus { border-color: var(--accent-color, #6750A4); }

/* ── Vídeo Avatar: personajes guardados ── */
:where(body[data-page="generation"]) .gen-avatar-char-section { margin-bottom: 18px; }

:where(body[data-page="generation"]) .gen-avatar-char-grid {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

:where(body[data-page="generation"]) .gen-avatar-char-empty {
  font-size: 0.85rem;
  color: var(--text-secondary, #999);
}

:where(body[data-page="generation"]) .gen-avatar-char-item {
  position: relative;
  width: 76px;
  cursor: pointer;
  text-align: center;
}

:where(body[data-page="generation"]) .gen-avatar-char-item img {
  width: 76px;
  height: 76px;
  object-fit: cover;
  border-radius: 12px;
  border: 2.5px solid var(--glass-border, rgba(103, 80, 164, 0.15));
  display: block;
  transition: border-color 0.2s;
}

:where(body[data-page="generation"]) .gen-avatar-char-item.selected img {
  border-color: var(--accent-color, #6750A4);
}

:where(body[data-page="generation"]) .gen-avatar-char-item span {
  display: block;
  font-size: 0.68rem;
  color: var(--text-secondary, #999);
  margin-top: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

:where(body[data-page="generation"]) .gen-avatar-char-del {
  position: absolute;
  top: -6px;
  right: -6px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: none;
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  font-size: 0.7rem;
  cursor: pointer;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

@media (max-width: 480px) {
  :where(body[data-page="generation"]) .gen-hero-zone { padding: 36px 16px 20px; }
  :where(body[data-page="generation"]) .gen-result-card { padding: 18px; }
  :where(body[data-page="generation"]) .gen-result-header { flex-direction: column; align-items: flex-start; }
  :where(body[data-page="generation"]) .gen-history-grid { grid-template-columns: 1fr; }
  :where(body[data-page="generation"]) .gen-selects-grid { grid-template-columns: 1fr; }
}

/* ══════════════════════════════════════════════════════════════
 ESCRITORIO — VISTA COMPACTA A DOS COLUMNAS
 ══════════════════════════════════════════════════════════════ */

/* Hero: el icono pasa a la misma línea que el título y se recortan los
 espaciados, que ocupaban casi la mitad de la primera pantalla. */
@media (min-width: 900px) {

  /* La zona hero es un flex en columna; al pasarla a fila con salto,
   el icono y el título comparten línea y el subtítulo y el campo de
   texto ocupan el ancho completo debajo. */
  :where(body[data-page="generation"]) .gen-hero-zone {
    flex-flow: row wrap;
    justify-content: center;
    align-items: center;
    column-gap: 12px;
    padding: 24px 24px 16px;
  }

  :where(body[data-page="generation"]) .gen-hero-icon {
    font-size: 1.9rem;
    margin: 0;
  }

  :where(body[data-page="generation"]) .gen-hero-title {
    font-size: 1.75rem;
    margin: 0;
  }

  /* `max-width: 520px` limitaba la base flexible e impedía el salto
   de línea, así que el subtítulo se colocaba junto al título. */
  :where(body[data-page="generation"]) .gen-hero-subtitle {
    flex-basis: 100%;
    max-width: none;
    margin: 6px 0 16px;
    font-size: 0.88rem;
  }

  :where(body[data-page="generation"]) .gen-input-wrapper {
    flex-basis: 100%;
    margin: 0 auto;
  }
}

/* Dos columnas: a la izquierda los ajustes del módulo activo, a la
 derecha el resultado y el historial. Sólo hay un `.gen-panel` visible
 a la vez (el resto está en `display: none`, así que no genera celda),
 de modo que el panel activo ocupa siempre la fila 1 de la columna 1 y
 los bloques de la derecha se apilan en la columna 2. */
@media (min-width: 1100px) {
  :where(body[data-page="generation"]) .gen-body {
    max-width: 1240px;
    display: flex;
    align-items: flex-start;
    gap: 28px;
  }

  /* generation.js alterna los paneles con `style.display`, no con la
   clase `active`, así que la regla se aplica a todos: el que está
   oculto no genera caja flex y sólo cuenta el visible. */
  :where(body[data-page="generation"]) .gen-panel {
    flex: 0 0 360px;
    /* 84px = alto del `.header` sticky (68px) + un respiro */
    position: sticky;
    top: 84px;
    max-height: calc(100vh - 100px);
    overflow-y: auto;
  }

  :where(body[data-page="generation"]) .gen-output-col {
    flex: 1 1 auto;
    min-width: 0;
  }

  /* El historial ya no necesita el separador superior: la columna
   propia lo separa visualmente del resto. */
  :where(body[data-page="generation"]) .gen-history-section {
    margin-top: 0;
    border-top: none;
    padding-top: 0;
  }

  /* En una columna de 360px las píldoras no deben estirarse a partes
   iguales: se dejan a su ancho natural para que ajusten mejor. */
  :where(body[data-page="generation"]) .gen-options-row .filter-pill {
    flex: 0 1 auto;
  }

  :where(body[data-page="generation"]) .gen-selects-grid {
    grid-template-columns: 1fr;
  }

  :where(body[data-page="generation"]) .gen-history-grid {
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  }
}

/* ── Módulos en el panel lateral ── */
:where(body[data-page="generation"]) .sidebar-panel-section {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}

:where(body[data-page="generation"]) .sidebar-filter-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

:where(body[data-page="generation"]) .sidebar-filter-list .filter-pill {
  width: 100%;
  box-sizing: border-box;
  text-align: left;
  justify-content: flex-start;
}
</style>
