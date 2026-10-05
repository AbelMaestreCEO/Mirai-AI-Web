<template>
  <header class="header">
    <MenuToggle />
    <div class="header-title">Configuración</div>
    <div class="header-actions"></div>
  </header>
  <main class="settings-container">
    <div class="settings-hero">
      <div class="settings-hero-icon">⚙️</div>
      <div>
        <h1>Configuración</h1>
        <p>Personaliza la apariencia y el comportamiento de Mirai AI a tu gusto.</p>
      </div>
    </div>

    <!-- ══ PERFIL ══ -->
    <div class="settings-section">
      <div class="settings-section-header">
        <div class="settings-section-icon">👤</div>
        <div>
          <h2>Perfil de usuario</h2>
          <p>Foto y nombre guardados en tu cuenta</p>
        </div>
      </div>
      <div class="settings-section-body">
        <div class="avatar-wrap">
          <div class="avatar-preview" title="Clic para cambiar foto" @click="pickAvatar">
            <img v-if="avatarSrc" :src="avatarSrc" alt="Avatar" @error="avatarSrc = null">
            <span v-else>{{ avatarInitial }}</span>
            <div class="avatar-overlay">📷</div>
            <div class="avatar-spinner" :class="{ show: avatarBusy }"></div>
          </div>
          <div class="avatar-info">
            <h3>Foto de perfil</h3>
            <p>Se guarda en tu cuenta y aparece en el chat en lugar de la "U". Si no hay foto se usa la
              inicial de tu nombre.<br>Formatos: JPG, PNG, WEBP · Máx. 5 MB.</p>
            <div class="avatar-actions">
              <button class="btn-upload-av" :disabled="avatarBusy" @click="pickAvatar">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="white">
                  <path d="M9 16h6v-6h4l-7-7-7 7h4zm-4 2h14v2H5z" />
                </svg>
                Subir foto
              </button>
              <button class="btn-remove-av" :class="{ show: !!avatarSrc }" :disabled="avatarBusy" @click="deleteAvatar">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                  <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
                </svg>
                Eliminar foto
              </button>
            </div>
            <div class="avatar-status" :class="avatarStatus.type">{{ avatarStatus.msg }}</div>
          </div>
        </div>
        <input ref="avatarInput" type="file" accept="image/jpeg,image/png,image/webp" style="display:none;" @change="onAvatarFile">
        <hr class="settings-divider">
        <div style="margin-bottom:14px;">
          <div class="settings-row-info">
            <h3 style="font-size:0.9rem;font-weight:600;color:var(--text-primary);margin:0 0 2px;">Nombre y apellido</h3>
            <p style="font-size:0.78rem;color:var(--text-secondary);margin:0;">Si no tienes foto, se usará la primera letra de tu nombre como avatar</p>
          </div>
        </div>
        <div class="name-grid">
          <div class="settings-field">
            <label for="input-nombre">Nombre</label>
            <input id="input-nombre" ref="nameInput" v-model="firstName" type="text" class="settings-input"
              :placeholder="profileLoaded ? 'Tu nombre' : 'Cargando…'" autocomplete="given-name" maxlength="40">
          </div>
          <div class="settings-field">
            <label for="input-apellido">Apellido</label>
            <input id="input-apellido" v-model="lastName" type="text" class="settings-input"
              :placeholder="profileLoaded ? 'Tu apellido' : 'Cargando…'" autocomplete="family-name" maxlength="40">
          </div>
        </div>
        <button class="btn-settings-save" :disabled="savingProfile" @click="saveProfile">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
            <path d="M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z" />
          </svg>
          Guardar perfil
        </button>
        <div class="name-status" :class="nameStatus.type">{{ nameStatus.msg }}</div>
      </div>
    </div>

    <!-- ══ PREFERENCIAS IA ══ -->
    <div class="settings-section">
      <div class="settings-section-header">
        <div class="settings-section-icon">🧠</div>
        <div>
          <h2>Tus preferencias (detectadas por Mirai)</h2>
          <p>Mirai analiza tus conversaciones para personalizar las respuestas</p>
        </div>
      </div>
      <div class="settings-section-body">
        <div v-if="prefsState !== 'ready'" style="color:var(--text-secondary);font-size:0.85rem;padding:8px 0;">{{ prefsState }}</div>
        <template v-else>
          <p v-if="!preferences.length" style="color:var(--text-secondary);font-size:0.85rem;">Aún no hay preferencias detectadas. Sigue conversando con Mirai para que te conozca mejor.</p>
          <div v-else style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:10px;">
            <div v-for="pref in preferences" :key="pref.key" style="background:var(--secondary-container);border:1px solid var(--glass-border);border-radius:10px;padding:12px 14px;">
              <div style="font-size:0.78rem;color:var(--text-secondary);margin-bottom:4px;">{{ pref.label }}</div>
              <div style="font-size:0.88rem;color:var(--text-primary);font-weight:500;">{{ pref.value }}</div>
            </div>
          </div>
        </template>
        <p style="font-size:0.75rem;color:var(--text-secondary);margin-top:12px;opacity:0.7;">
          Estos datos se actualizan automáticamente cada 10 mensajes que envíes en el chat.
        </p>
      </div>
    </div>

    <!-- ══ MODELO IA ══ -->
    <div class="settings-section">
      <div class="settings-section-header">
        <div class="settings-section-icon">🤖</div>
        <div>
          <h2>Modelo de inteligencia artificial</h2>
          <p>Elige el motor que procesa tus conversaciones</p>
        </div>
      </div>
      <div class="settings-section-body">
        <div class="model-grid">
          <label v-for="m in MODELS" :key="m.value" class="model-option">
            <input v-model="aiModel" type="radio" name="ai-model" :value="m.value">
            <div class="model-card">
              <div class="model-check"><svg viewBox="0 0 24 24" width="12" height="12"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" /></svg></div>
              <span class="model-emoji">{{ m.emoji }}</span>
              <span class="model-name">{{ m.name }}</span>
              <span class="model-desc">{{ m.desc }}</span>
              <span class="model-badge" :class="{ alt: m.alt }">{{ m.badge }}</span>
            </div>
          </label>
        </div>
        <button class="btn-settings-save" style="margin-top:20px;" @click="saveModel">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
            <path d="M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z" />
          </svg>
          Guardar modelo
        </button>
      </div>
    </div>

    <!-- ══ COLORES ══ -->
    <div class="settings-section">
      <div class="settings-section-header">
        <div class="settings-section-icon">🎨</div>
        <div>
          <h2>Color de Acento</h2>
          <p>Elige el color principal de la interfaz</p>
        </div>
      </div>
      <div class="settings-section-body">
        <div class="color-palette" role="radiogroup" aria-label="Seleccionar color de acento">
          <label v-for="c in COLOR_OPTIONS" :key="c.name" class="color-option" :class="{ active: accent === c.name }" :data-color="c.name">
            <input v-model="accent" type="radio" name="accent-color" :value="c.name">
            <div class="color-swatch" :style="{ background: c.swatch }"></div>
            <span class="color-label">{{ c.label }}</span>
          </label>
        </div>
        <div class="settings-preview" style="margin-top:16px;">
          <div class="preview-label">Vista previa del acento</div>
          <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
            <button style="padding:8px 20px;border-radius:8px;border:none;font-size:0.88rem;font-weight:600;color:white;cursor:pointer;transition:all 0.25s;background:var(--accent-gradient);">Botón principal</button>
            <span style="font-size:0.9rem;font-weight:500;color:var(--accent-color);text-decoration:underline;cursor:pointer;">Enlace de ejemplo</span>
            <div style="width:10px;height:10px;border-radius:50%;background:var(--accent-color);"></div>
            <div style="height:4px;width:80px;border-radius:2px;background:var(--accent-gradient);"></div>
          </div>
        </div>
      </div>
    </div>

    <!-- ══ TIPOGRAFÍA ══ -->
    <div class="settings-section">
      <div class="settings-section-header">
        <div class="settings-section-icon">🔤</div>
        <div>
          <h2>Tipografía</h2>
          <p>Selecciona la fuente de la interfaz y el tamaño del texto</p>
        </div>
      </div>
      <div class="settings-section-body">
        <div class="font-grid" role="radiogroup" aria-label="Seleccionar fuente">
          <label v-for="f in FONT_OPTIONS" :key="f.value" class="font-card" :class="{ active: font === f.value }">
            <input v-model="font" type="radio" name="font-family" :value="f.value">
            <div class="font-badge">✓</div>
            <div class="font-preview" :style="{ fontFamily: f.css }">Aa Bb</div>
            <div class="font-name">{{ f.name }}</div>
            <div class="font-sample" :style="{ fontFamily: f.css }">{{ f.sample }}</div>
          </label>
        </div>
        <hr class="settings-divider">
        <!-- Seguridad: Verificación en dos pasos -->
        <div style="margin-bottom:8px;">
          <div class="settings-row-info">
            <h3 style="font-size:0.9rem;font-weight:600;color:var(--text-primary);margin:0 0 2px;">🔐 Verificación en dos pasos</h3>
            <p style="font-size:0.78rem;color:var(--text-secondary);margin:0;">Al iniciar sesión se te pedirá un código enviado a tu correo</p>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:14px;padding:12px 0;">
          <div role="switch" tabindex="0" aria-label="Verificación en dos pasos" :aria-checked="twoFactor"
            :style="{ width: '44px', height: '24px', borderRadius: '12px', background: twoFactor ? 'var(--accent-color)' : 'var(--glass-border)', cursor: 'pointer', position: 'relative', transition: 'background 0.25s', flexShrink: 0 }"
            @click="twoFactor = !twoFactor" @keydown.space.prevent="twoFactor = !twoFactor" @keydown.enter.prevent="twoFactor = !twoFactor">
            <div :style="{ width: '18px', height: '18px', borderRadius: '50%', background: 'white', position: 'absolute', top: '3px', left: '3px', transition: 'transform 0.25s', boxShadow: '0 1px 4px rgba(0,0,0,0.2)', transform: twoFactor ? 'translateX(20px)' : 'translateX(0)' }"></div>
          </div>
          <span style="font-size:0.85rem;color:var(--text-secondary);">{{ twoFactor ? 'Activada' : 'Desactivada' }}</span>
        </div>
        <hr class="settings-divider">
        <div class="settings-row-info" style="margin-bottom:14px;">
          <h3 style="font-size:0.9rem;font-weight:600;color:var(--text-primary);margin:0 0 2px;">Tamaño del texto</h3>
          <p style="font-size:0.78rem;color:var(--text-secondary);margin:0;">Ajusta el tamaño base del texto de la interfaz</p>
        </div>
        <div class="font-size-control">
          <div class="font-size-slider-wrap">
            <input v-model.number="fontSize" type="range" class="font-size-slider" min="12" max="20" step="1" aria-label="Tamaño de fuente" :style="{ background: sliderTrack }">
            <div class="font-size-labels"><span>Pequeño (12px)</span><span>Grande (20px)</span></div>
          </div>
          <div class="font-size-value">{{ fontSize }}px</div>
        </div>
        <div class="settings-preview" style="margin-top:16px;">
          <div class="preview-label">Vista previa del texto</div>
          <p class="preview-text" style="margin:0;" :style="{ fontFamily: previewFont }">Hola, soy <strong>Mirai AI</strong>. Estoy aquí para ayudarte con tus cursos, tareas y cualquier pregunta que tengas. ¿En qué puedo ayudarte hoy?</p>
        </div>
      </div>
    </div>

    <!-- ══ APARIENCIA ══ -->
    <div class="settings-section">
      <div class="settings-section-header">
        <div class="settings-section-icon">🌓</div>
        <div>
          <h2>Apariencia</h2>
          <p>Modo de color e interfaz general</p>
        </div>
      </div>
      <div class="settings-section-body">
        <div class="settings-row" style="flex-direction:column;align-items:flex-start;gap:12px;">
          <div class="settings-row-info">
            <h3>Tema de color</h3>
            <p>Elige entre claro, oscuro o seguir automáticamente el sistema (Android, iOS, Windows, macOS)</p>
          </div>
          <div style="display:flex;gap:10px;flex-wrap:wrap;">
            <button v-for="t in THEME_MODES" :key="t.mode" class="theme-mode-btn" :data-theme-mode="t.mode"
              :style="{ padding: '8px 18px', borderRadius: '20px', border: '2px solid', borderColor: themeMode === t.mode ? 'var(--accent-color)' : 'var(--glass-border)', background: themeMode === t.mode ? 'var(--accent-gradient)' : 'var(--secondary-container)', color: themeMode === t.mode ? 'white' : 'var(--text-primary)', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', transition: 'all 0.25s' }"
              @click="setThemeMode(t.mode)">{{ t.label }}</button>
          </div>
        </div>
        <div class="settings-row">
          <div class="settings-row-info">
            <h3>Animaciones reducidas</h3>
            <p>Minimiza las animaciones para mejor rendimiento</p>
          </div>
          <label style="position:relative;display:inline-block;width:44px;height:24px;cursor:pointer;">
            <input v-model="reducedMotion" type="checkbox" style="opacity:0;width:0;height:0;">
            <span :style="{ position: 'absolute', inset: 0, background: reducedMotion ? 'var(--accent-color)' : 'var(--glass-border)', borderRadius: '12px', transition: 'background 0.3s' }"></span>
            <span :style="{ position: 'absolute', left: '3px', top: '3px', width: '18px', height: '18px', background: 'white', borderRadius: '50%', transition: 'transform 0.3s', boxShadow: '0 1px 4px rgba(0,0,0,0.2)', transform: reducedMotion ? 'translateX(20px)' : 'translateX(0)' }"></span>
          </label>
        </div>
        <div class="settings-row">
          <div class="settings-row-info">
            <h3>Notificaciones push</h3>
            <p>Activa el permiso del navegador para recibir alertas importantes</p>
          </div>
          <label style="position:relative;display:inline-block;width:44px;height:24px;cursor:pointer;">
            <input type="checkbox" :checked="notifOn" style="opacity:0;width:0;height:0;" @change="onNotifToggle($event)">
            <span :style="{ position: 'absolute', inset: 0, background: notifOn ? 'var(--accent-color)' : 'var(--glass-border)', borderRadius: '12px', transition: 'background 0.3s' }"></span>
            <span :style="{ position: 'absolute', left: '3px', top: '3px', width: '18px', height: '18px', background: 'white', borderRadius: '50%', transition: 'transform 0.3s', boxShadow: '0 1px 4px rgba(0,0,0,0.2)', transform: notifOn ? 'translateX(20px)' : 'translateX(0)' }"></span>
          </label>
        </div>
        <div class="settings-row" style="flex-direction:column;align-items:stretch;gap:12px;" :style="{ opacity: notifOn ? '1' : '0.5' }">
          <div class="settings-row-info">
            <h3 style="font-size:0.92rem;">¿Dónde quieres recibir notificaciones?</h3>
            <p>Elige en qué secciones te avisamos con notificaciones push</p>
          </div>
          <div style="display:flex;flex-direction:column;gap:10px;padding-left:2px;">
            <label v-for="n in NOTIF_PAGES" :key="n.key" class="notif-page-option" style="display:flex;align-items:center;gap:10px;cursor:pointer;font-size:0.9rem;color:var(--text-primary);">
              <input v-model="notifPages[n.key]" type="checkbox" class="notif-page-checkbox" :disabled="!notifOn" style="width:18px;height:18px;accent-color:var(--accent-color);cursor:pointer;">
              <span>{{ n.label }}</span>
            </label>
          </div>
        </div>
      </div>
    </div>

    <div class="settings-actions">
      <button class="btn-settings-reset" @click="resetSettings">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
          <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z" />
        </svg>
        Restablecer
      </button>
      <button class="btn-settings-save" @click="saveAll">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
          <path d="M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z" />
        </svg>
        Guardar cambios
      </button>
    </div>
  </main>
  <div class="settings-toast" :class="{ show: toast.show }">
    <span class="settings-toast-icon">{{ toast.icon }}</span>
    <span class="settings-toast-text">{{ toast.msg }}</span>
  </div>
</template>

<script setup lang="ts">
// Migración de public/settings.html.
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import MenuToggle from '@/components/MenuToggle.vue';
import { api, errorMessage, type ApiErrorBody } from '@/lib/api';
import { notificationPermission, requestNotifications } from '@/lib/push';
import { SETTINGS_KEY, THEME_KEY, THEME_MODE_KEY, applyAppearance, readSettings, type AppearanceSettings } from '@/lib/settings';

// Caché local que usa el chat (no es la fuente de verdad: la cuenta sí).
const MODEL_KEY = 'mirai-ai-model';
const LS_NOMBRE = 'mirai-user-nombre';
const LS_APELLIDO = 'mirai-user-apellido';
const LS_AVATAR_URL = 'mirai-user-avatar-url';

function store(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Almacenamiento bloqueado: la caché del chat no se actualiza.
  }
}
function stored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function saveLocalSettings(d: AppearanceSettings) {
  store(SETTINGS_KEY, JSON.stringify({ ...readSettings(), ...d }));
}

// ── Datos de las opciones ─────────────────────────────────────────────────
const MODELS = [
  { value: 'deepseek', emoji: '🌸', name: 'Mirai', desc: 'Modelo por defecto. Excelente para conversación general, análisis y creatividad.', badge: 'Recomendado', alt: false },
  { value: 'llama', emoji: '⚡', name: 'Mirai Pro', desc: 'Motor avanzado con razonamiento profundo. Ideal para código, lógica compleja y análisis técnico.', badge: 'Pro', alt: true },
];
const MODEL_LABELS: Record<string, string> = { deepseek: '🌸 Mirai', llama: '⚡ Mirai Pro' };

const COLOR_OPTIONS = [
  { name: 'purple', label: 'Violeta', swatch: 'linear-gradient(135deg,#6750A4,#9A82DB)' },
  { name: 'blue', label: 'Azul', swatch: 'linear-gradient(135deg,#1565C0,#42A5F5)' },
  { name: 'teal', label: 'Teal', swatch: 'linear-gradient(135deg,#00695C,#26C6DA)' },
  { name: 'green', label: 'Verde', swatch: 'linear-gradient(135deg,#2E7D32,#66BB6A)' },
  { name: 'orange', label: 'Naranja', swatch: 'linear-gradient(135deg,#E65100,#FFA726)' },
  { name: 'pink', label: 'Rosa', swatch: 'linear-gradient(135deg,#AD1457,#F06292)' },
  { name: 'red', label: 'Rojo', swatch: 'linear-gradient(135deg,#B71C1C,#EF5350)' },
  { name: 'indigo', label: 'Índigo', swatch: 'linear-gradient(135deg,#283593,#7986CB)' },
  { name: 'yellow', label: 'Amarillo', swatch: 'linear-gradient(135deg,#F57F17,#FFEE58)' },
  { name: 'slate', label: 'Pizarra', swatch: 'linear-gradient(135deg,#37474F,#90A4AE)' },
];

// `value` es lo que se guarda (sin comillas); `css` lo que se aplica.
const FONT_OPTIONS = [
  { value: 'Inter', name: 'Inter', css: "'Inter',sans-serif", sample: 'El rápido zorro marrón' },
  { value: 'Roboto', name: 'Roboto', css: "'Roboto',sans-serif", sample: 'El rápido zorro marrón' },
  { value: 'Poppins', name: 'Poppins', css: "'Poppins',sans-serif", sample: 'El rápido zorro marrón' },
  { value: 'Playfair Display', name: 'Playfair', css: "'Playfair Display',serif", sample: 'El rápido zorro marrón' },
  { value: 'Roboto Mono', name: 'Mono', css: "'Roboto Mono',monospace", sample: 'El rápido zorro' },
  { value: 'Nunito', name: 'Nunito', css: "'Nunito',sans-serif", sample: 'El rápido zorro marrón' },
];

const THEME_MODES = [
  { mode: 'light', label: '☀️ Claro' },
  { mode: 'dark', label: '🌙 Oscuro' },
  { mode: 'auto', label: '🖥️ Automático' },
] as const;
type ThemeMode = (typeof THEME_MODES)[number]['mode'];

const NOTIF_PAGES = [
  { key: 'notifyGeneration', label: '🎨 Generación de contenido' },
  { key: 'notifyClassroom', label: '🎓 Aula virtual' },
  { key: 'notifyInventory', label: '📦 Inventario' },
  { key: 'notifyReport', label: '📊 Reportes' },
  { key: 'notifyTask', label: '✅ Tareas' },
] as const;
type NotifKey = (typeof NOTIF_PAGES)[number]['key'];

const PREF_LABELS: Record<string, string> = {
  colores_favoritos: '🎨 Colores favoritos',
  colores_que_no_gustan: '🚫🎨 Colores que no gustan',
  musica_favorita: '🎵 Música favorita',
  musica_que_no_gusta: '🚫🎵 Música que no gusta',
  peliculas_series_favoritas: '🎬 Películas/Series favoritas',
  peliculas_series_que_no_gustan: '🚫🎬 Películas/Series que no gustan',
  temas_de_conversacion_favoritos: '💬 Temas favoritos',
  temas_que_evita: '🚫💬 Temas que evita',
  estudios_o_profesion: '🎓 Estudios/Profesión',
  hobbies: '🎯 Hobbies',
  comida_favorita: '🍽️ Comida favorita',
  comida_que_no_gusta: '🚫🍽️ Comida que no gusta',
  deportes: '⚽ Deportes',
  videojuegos: '🎮 Videojuegos',
  estilo_comunicacion: '🗣️ Estilo de comunicación',
  personalidad_observada: '🧩 Personalidad observada',
  otros_gustos: '✨ Otros gustos',
  otros_disgustos: '👎 Otros disgustos',
};

// ── Aviso flotante ────────────────────────────────────────────────────────
const toast = reactive({ show: false, msg: '¡Configuración guardada correctamente!', icon: '✅' });
let toastTimer = 0;
function showToast(msg: string, icon = '✅') {
  toast.msg = msg;
  toast.icon = icon;
  toast.show = true;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (toast.show = false), 3200);
}
onBeforeUnmount(() => clearTimeout(toastTimer));

// ── Perfil y avatar ───────────────────────────────────────────────────────
const firstName = ref('');
const lastName = ref('');
const profileLoaded = ref(false);
const savingProfile = ref(false);
const nameStatus = reactive({ msg: '', type: '' });
const avatarSrc = ref<string | null>(null);
const avatarBusy = ref(false);
const avatarStatus = reactive({ msg: '', type: '' });
const avatarInput = ref<HTMLInputElement | null>(null);
const nameInput = ref<HTMLInputElement | null>(null);

const avatarInitial = computed(() => (firstName.value.trim()[0] || 'U').toUpperCase());

function setAvatarUrl(url: string | null) {
  // El timestamp evita ver la foto anterior desde la caché tras cambiarla.
  avatarSrc.value = url ? `${url}?t=${Date.now()}` : null;
  store(LS_AVATAR_URL, url);
}

async function loadProfile() {
  try {
    const { ok, data } = await api.get<{ profile?: { firstName?: string; lastName?: string; hasAvatar?: boolean; avatarUrl?: string } }>('/api/user/profile');
    const profile = ok ? data.profile : undefined;
    if (profile) {
      firstName.value = profile.firstName || '';
      lastName.value = profile.lastName || '';
      if (profile.firstName) store(LS_NOMBRE, profile.firstName);
      if (profile.lastName) store(LS_APELLIDO, profile.lastName);
      if (profile.hasAvatar && profile.avatarUrl) setAvatarUrl(profile.avatarUrl);
    }
  } catch (err) {
    console.warn('loadProfileFromAPI:', err);
  } finally {
    profileLoaded.value = true;
  }
}

function pickAvatar() {
  avatarInput.value?.click();
}

/** Redimensiona a JPEG (máx. maxPx de lado) antes de subir. */
function resizeToBlob(file: File, maxPx: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let w = img.width;
      let h = img.height;
      if (w > h) {
        if (w > maxPx) { h = Math.round((h * maxPx) / w); w = maxPx; }
      } else if (h > maxPx) {
        w = Math.round((w * maxPx) / h); h = maxPx;
      }
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      c.getContext('2d')?.drawImage(img, 0, 0, w, h);
      c.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('No se pudo procesar la imagen'))), 'image/jpeg', 0.88);
    };
    img.onerror = () => reject(new Error('No se pudo leer la imagen'));
    img.src = url;
  });
}

async function onAvatarFile(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return showToast('Usa JPG, PNG o WEBP', '❌');
  if (file.size > 5 * 1024 * 1024) return showToast('La imagen supera los 5 MB', '❌');

  avatarBusy.value = true;
  Object.assign(avatarStatus, { msg: 'Subiendo foto…', type: '' });
  try {
    const blob = await resizeToBlob(file, 300);
    const fd = new FormData();
    fd.append('avatar', blob, 'avatar.jpg');
    const res = await fetch('/api/user/avatar', { method: 'POST', body: fd, credentials: 'same-origin' });
    const data = (await res.json().catch(() => ({}))) as ApiErrorBody & { avatarUrl?: string };
    if (!res.ok || !data.avatarUrl) throw new Error(errorMessage(data, 'Error al subir'));
    setAvatarUrl(data.avatarUrl);
    Object.assign(avatarStatus, { msg: 'Foto actualizada ✓', type: 'ok' });
    showToast('Foto de perfil actualizada');
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error al subir';
    Object.assign(avatarStatus, { msg, type: 'err' });
    showToast(msg, '❌');
  } finally {
    avatarBusy.value = false;
  }
}

async function deleteAvatar() {
  avatarBusy.value = true;
  Object.assign(avatarStatus, { msg: 'Eliminando…', type: '' });
  try {
    const res = await fetch('/api/user/avatar', { method: 'DELETE', credentials: 'same-origin' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(errorMessage(data, 'Error al eliminar'));
    setAvatarUrl(null);
    Object.assign(avatarStatus, { msg: 'Foto eliminada', type: 'ok' });
    showToast('Foto eliminada');
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error al eliminar';
    Object.assign(avatarStatus, { msg, type: 'err' });
    showToast(msg, '❌');
  } finally {
    avatarBusy.value = false;
  }
}

async function saveProfile() {
  const f = firstName.value.trim();
  const l = lastName.value.trim();
  if (!f) {
    Object.assign(nameStatus, { msg: 'El nombre es obligatorio', type: 'err' });
    nameInput.value?.focus();
    return;
  }
  savingProfile.value = true;
  Object.assign(nameStatus, { msg: 'Guardando…', type: '' });
  try {
    const res = await fetch('/api/user/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ firstName: f, lastName: l }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(errorMessage(data, 'Error al guardar'));
    store(LS_NOMBRE, f);
    store(LS_APELLIDO, l);
    Object.assign(nameStatus, { msg: `Guardado: ${f} ${l}`, type: 'ok' });
    showToast(`Perfil actualizado: ${f} ${l}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error al guardar';
    Object.assign(nameStatus, { msg, type: 'err' });
    showToast(msg, '❌');
  } finally {
    savingProfile.value = false;
  }
}

// ── Preferencias detectadas por la IA ─────────────────────────────────────
const prefsState = ref<'Cargando preferencias…' | 'No se pudieron cargar' | 'Error al cargar preferencias' | 'ready'>('Cargando preferencias…');
const preferences = ref<{ key: string; label: string; value: string }[]>([]);

async function loadPreferences() {
  try {
    const { ok, data } = await api.get<{ preferences?: Record<string, unknown> }>('/api/user/preferences');
    if (!ok) {
      prefsState.value = 'No se pudieron cargar';
      return;
    }
    // Antes se pintaban con innerHTML; ahora como texto (los valores los
    // escribe la IA a partir de lo que dice el usuario).
    preferences.value = Object.entries(data.preferences ?? {})
      .filter(([, v]) => !!v)
      .map(([key, v]) => ({ key, label: PREF_LABELS[key] ?? key.replace(/_/g, ' '), value: String(v) }));
    prefsState.value = 'ready';
  } catch {
    prefsState.value = 'Error al cargar preferencias';
  }
}

// ── Modelo ────────────────────────────────────────────────────────────────
const aiModel = ref(stored(MODEL_KEY) || 'deepseek');

function saveModel() {
  store(MODEL_KEY, aiModel.value);
  showToast(`Modelo cambiado a ${MODEL_LABELS[aiModel.value] ?? aiModel.value}`, '✅');
}

// ── Apariencia (se aplica al momento, como vista previa) ──────────────────
interface AccentPalette {
  color: string; colorD: string; gradient: string; gradientD: string; glow: string; glowD: string;
  container: string; containerD: string; glassBg: string; glassBgD: string; bg: string; bgGrad: string;
  bgDark: string; bgGradDark: string; glassBorder: string; glassBorderDark: string;
  orb1: string; orb2: string; orb3: string; orb1Dark: string; orb2Dark: string; orb3Dark: string;
}
// Copia de ACCENT_COLORS de settings.html: además de lo que aplica el resto de
// páginas (lib/settings.ts) incluye el borde de cristal y los orbes del fondo.
const ACCENT: Record<string, AccentPalette> = {
  purple: { color: '#6750A4', colorD: '#D0BCFF', gradient: 'linear-gradient(135deg,#6750A4,#7F67BE 50%,#9A82DB)', gradientD: 'linear-gradient(135deg,#D0BCFF,#B69DF8 50%,#9A82DB)', glow: 'rgba(103,80,164,0.18)', glowD: 'rgba(208,188,255,0.15)', container: '#E8DEF8', containerD: '#2A2438', glassBg: 'rgba(255,255,255,0.94)', glassBgD: 'rgba(30,27,36,0.96)', bg: '#F5F3F8', bgGrad: 'linear-gradient(145deg,#F5F3F8 0%,#EDE7F6 40%,#E8EAF6 100%)', bgDark: '#141218', bgGradDark: 'linear-gradient(145deg,#141218 0%,#1D1A22 40%,#211F26 100%)', glassBorder: 'rgba(103,80,164,0.12)', glassBorderDark: 'rgba(207,188,255,0.10)', orb1: 'rgba(103,80,164,0.12)', orb2: 'rgba(125,82,96,0.08)', orb3: 'rgba(98,91,113,0.06)', orb1Dark: 'rgba(208,188,255,0.06)', orb2Dark: 'rgba(239,184,200,0.04)', orb3Dark: 'rgba(204,194,220,0.03)' },
  blue: { color: '#1565C0', colorD: '#90CAF9', gradient: 'linear-gradient(135deg,#1565C0,#2196F3 50%,#42A5F5)', gradientD: 'linear-gradient(135deg,#90CAF9,#64B5F6 50%,#42A5F5)', glow: 'rgba(21,101,192,0.18)', glowD: 'rgba(144,202,249,0.15)', container: '#E3F2FD', containerD: '#0D1E35', glassBg: 'rgba(255,255,255,0.94)', glassBgD: 'rgba(18,21,32,0.96)', bg: '#F3F6FB', bgGrad: 'linear-gradient(145deg,#F3F6FB 0%,#E3F2FD 40%,#E8EAF6 100%)', bgDark: '#121520', bgGradDark: 'linear-gradient(145deg,#121520 0%,#181E2E 40%,#1A1F30 100%)', glassBorder: 'rgba(21,101,192,0.12)', glassBorderDark: 'rgba(144,202,249,0.10)', orb1: 'rgba(21,101,192,0.12)', orb2: 'rgba(66,165,245,0.08)', orb3: 'rgba(30,136,229,0.06)', orb1Dark: 'rgba(144,202,249,0.07)', orb2Dark: 'rgba(66,165,245,0.04)', orb3Dark: 'rgba(30,136,229,0.03)' },
  teal: { color: '#00695C', colorD: '#80CBC4', gradient: 'linear-gradient(135deg,#00695C,#009688 50%,#26C6DA)', gradientD: 'linear-gradient(135deg,#80CBC4,#4DB6AC 50%,#26C6DA)', glow: 'rgba(0,105,92,0.18)', glowD: 'rgba(128,203,196,0.15)', container: '#E0F2F1', containerD: '#0A1F1D', glassBg: 'rgba(255,255,255,0.94)', glassBgD: 'rgba(18,26,25,0.96)', bg: '#F2F9F8', bgGrad: 'linear-gradient(145deg,#F2F9F8 0%,#E0F2F1 40%,#E0F7FA 100%)', bgDark: '#121A19', bgGradDark: 'linear-gradient(145deg,#121A19 0%,#172320 40%,#162527 100%)', glassBorder: 'rgba(0,105,92,0.12)', glassBorderDark: 'rgba(128,203,196,0.10)', orb1: 'rgba(0,150,136,0.12)', orb2: 'rgba(38,198,218,0.08)', orb3: 'rgba(0,105,92,0.06)', orb1Dark: 'rgba(128,203,196,0.07)', orb2Dark: 'rgba(38,198,218,0.04)', orb3Dark: 'rgba(0,105,92,0.03)' },
  green: { color: '#2E7D32', colorD: '#A5D6A7', gradient: 'linear-gradient(135deg,#2E7D32,#388E3C 50%,#66BB6A)', gradientD: 'linear-gradient(135deg,#A5D6A7,#81C784 50%,#66BB6A)', glow: 'rgba(46,125,50,0.18)', glowD: 'rgba(165,214,167,0.15)', container: '#E8F5E9', containerD: '#0D1F0E', glassBg: 'rgba(255,255,255,0.94)', glassBgD: 'rgba(18,24,18,0.96)', bg: '#F3F9F3', bgGrad: 'linear-gradient(145deg,#F3F9F3 0%,#E8F5E9 40%,#F1F8E9 100%)', bgDark: '#121812', bgGradDark: 'linear-gradient(145deg,#121812 0%,#182018 40%,#192218 100%)', glassBorder: 'rgba(46,125,50,0.12)', glassBorderDark: 'rgba(165,214,167,0.10)', orb1: 'rgba(46,125,50,0.12)', orb2: 'rgba(102,187,106,0.08)', orb3: 'rgba(56,142,60,0.06)', orb1Dark: 'rgba(165,214,167,0.07)', orb2Dark: 'rgba(102,187,106,0.04)', orb3Dark: 'rgba(56,142,60,0.03)' },
  orange: { color: '#E65100', colorD: '#FFB74D', gradient: 'linear-gradient(135deg,#E65100,#F57C00 50%,#FFA726)', gradientD: 'linear-gradient(135deg,#FFB74D,#FFA726 50%,#FF8F00)', glow: 'rgba(230,81,0,0.18)', glowD: 'rgba(255,183,77,0.15)', container: '#FFF3E0', containerD: '#271A08', glassBg: 'rgba(255,255,255,0.94)', glassBgD: 'rgba(30,22,16,0.96)', bg: '#FBF6F0', bgGrad: 'linear-gradient(145deg,#FBF6F0 0%,#FFF3E0 40%,#FFF8E1 100%)', bgDark: '#1E1610', bgGradDark: 'linear-gradient(145deg,#1E1610 0%,#271C12 40%,#281E14 100%)', glassBorder: 'rgba(230,81,0,0.12)', glassBorderDark: 'rgba(255,183,77,0.10)', orb1: 'rgba(230,81,0,0.12)', orb2: 'rgba(255,167,38,0.08)', orb3: 'rgba(245,124,0,0.06)', orb1Dark: 'rgba(255,183,77,0.07)', orb2Dark: 'rgba(255,167,38,0.04)', orb3Dark: 'rgba(245,124,0,0.03)' },
  pink: { color: '#AD1457', colorD: '#F48FB1', gradient: 'linear-gradient(135deg,#AD1457,#D81B60 50%,#F06292)', gradientD: 'linear-gradient(135deg,#F48FB1,#F06292 50%,#EC407A)', glow: 'rgba(173,20,87,0.18)', glowD: 'rgba(244,143,177,0.15)', container: '#FCE4EC', containerD: '#250C18', glassBg: 'rgba(255,255,255,0.94)', glassBgD: 'rgba(28,18,24,0.96)', bg: '#FAF2F6', bgGrad: 'linear-gradient(145deg,#FAF2F6 0%,#FCE4EC 40%,#F8EAF6 100%)', bgDark: '#1C1218', bgGradDark: 'linear-gradient(145deg,#1C1218 0%,#251520 40%,#261525 100%)', glassBorder: 'rgba(173,20,87,0.12)', glassBorderDark: 'rgba(240,98,146,0.10)', orb1: 'rgba(173,20,87,0.12)', orb2: 'rgba(240,98,146,0.08)', orb3: 'rgba(216,27,96,0.06)', orb1Dark: 'rgba(240,98,146,0.07)', orb2Dark: 'rgba(216,27,96,0.04)', orb3Dark: 'rgba(173,20,87,0.03)' },
  red: { color: '#B71C1C', colorD: '#EF9A9A', gradient: 'linear-gradient(135deg,#B71C1C,#D32F2F 50%,#EF5350)', gradientD: 'linear-gradient(135deg,#EF9A9A,#E57373 50%,#EF5350)', glow: 'rgba(183,28,28,0.18)', glowD: 'rgba(239,154,154,0.15)', container: '#FFEBEE', containerD: '#250D0D', glassBg: 'rgba(255,255,255,0.94)', glassBgD: 'rgba(28,18,18,0.96)', bg: '#FAF2F2', bgGrad: 'linear-gradient(145deg,#FAF2F2 0%,#FFEBEE 40%,#FFEAEA 100%)', bgDark: '#1C1212', bgGradDark: 'linear-gradient(145deg,#1C1212 0%,#251515 40%,#271616 100%)', glassBorder: 'rgba(183,28,28,0.12)', glassBorderDark: 'rgba(239,83,80,0.10)', orb1: 'rgba(183,28,28,0.12)', orb2: 'rgba(239,83,80,0.08)', orb3: 'rgba(211,47,47,0.06)', orb1Dark: 'rgba(239,83,80,0.07)', orb2Dark: 'rgba(211,47,47,0.04)', orb3Dark: 'rgba(183,28,28,0.03)' },
  indigo: { color: '#283593', colorD: '#9FA8DA', gradient: 'linear-gradient(135deg,#283593,#3F51B5 50%,#7986CB)', gradientD: 'linear-gradient(135deg,#9FA8DA,#7986CB 50%,#5C6BC0)', glow: 'rgba(40,53,147,0.18)', glowD: 'rgba(159,168,218,0.15)', container: '#E8EAF6', containerD: '#0E1020', glassBg: 'rgba(255,255,255,0.94)', glassBgD: 'rgba(19,19,24,0.96)', bg: '#F3F3FA', bgGrad: 'linear-gradient(145deg,#F3F3FA 0%,#E8EAF6 40%,#EDE7F6 100%)', bgDark: '#131318', bgGradDark: 'linear-gradient(145deg,#131318 0%,#191A25 40%,#1B1A28 100%)', glassBorder: 'rgba(40,53,147,0.12)', glassBorderDark: 'rgba(121,134,203,0.10)', orb1: 'rgba(40,53,147,0.12)', orb2: 'rgba(121,134,203,0.08)', orb3: 'rgba(63,81,181,0.06)', orb1Dark: 'rgba(121,134,203,0.07)', orb2Dark: 'rgba(63,81,181,0.04)', orb3Dark: 'rgba(40,53,147,0.03)' },
  yellow: { color: '#F57F17', colorD: '#FFF176', gradient: 'linear-gradient(135deg,#F57F17,#FBC02D 50%,#FFEE58)', gradientD: 'linear-gradient(135deg,#FFF176,#FFEE58 50%,#FDD835)', glow: 'rgba(245,127,23,0.18)', glowD: 'rgba(255,238,88,0.15)', container: '#FFFDE7', containerD: '#1F1C08', glassBg: 'rgba(255,255,255,0.94)', glassBgD: 'rgba(29,28,16,0.96)', bg: '#FDFBF0', bgGrad: 'linear-gradient(145deg,#FDFBF0 0%,#FFFDE7 40%,#FFF9C4 100%)', bgDark: '#1D1C10', bgGradDark: 'linear-gradient(145deg,#1D1C10 0%,#262512 40%,#282714 100%)', glassBorder: 'rgba(245,127,23,0.12)', glassBorderDark: 'rgba(255,238,88,0.10)', orb1: 'rgba(245,127,23,0.12)', orb2: 'rgba(255,238,88,0.08)', orb3: 'rgba(251,192,45,0.06)', orb1Dark: 'rgba(255,238,88,0.07)', orb2Dark: 'rgba(251,192,45,0.04)', orb3Dark: 'rgba(245,127,23,0.03)' },
  slate: { color: '#37474F', colorD: '#B0BEC5', gradient: 'linear-gradient(135deg,#37474F,#546E7A 50%,#90A4AE)', gradientD: 'linear-gradient(135deg,#B0BEC5,#90A4AE 50%,#78909C)', glow: 'rgba(55,71,79,0.18)', glowD: 'rgba(176,190,197,0.15)', container: '#ECEFF1', containerD: '#131618', glassBg: 'rgba(255,255,255,0.94)', glassBgD: 'rgba(25,28,30,0.96)', bg: '#F3F5F6', bgGrad: 'linear-gradient(145deg,#F3F5F6 0%,#ECEFF1 40%,#E8EDF0 100%)', bgDark: '#131618', bgGradDark: 'linear-gradient(145deg,#131618 0%,#1A1F22 40%,#1C2125 100%)', glassBorder: 'rgba(55,71,79,0.12)', glassBorderDark: 'rgba(144,164,174,0.10)', orb1: 'rgba(55,71,79,0.12)', orb2: 'rgba(144,164,174,0.08)', orb3: 'rgba(84,110,122,0.06)', orb1Dark: 'rgba(144,164,174,0.07)', orb2Dark: 'rgba(84,110,122,0.04)', orb3Dark: 'rgba(55,71,79,0.03)' },
};

const saved = readSettings();
const accent = ref(typeof saved.accentColor === 'string' && ACCENT[saved.accentColor] ? saved.accentColor : 'purple');
const font = ref(String(saved.fontFamily || 'Inter').replace(/'/g, '').trim());
const fontSize = ref(Number(saved.fontSize) || 15);
const reducedMotion = ref(!!saved.reducedMotion);
const twoFactor = ref(saved.twoFactor !== false); // activada por defecto
const themeMode = ref<ThemeMode>((['light', 'dark', 'auto'] as const).find((m) => m === stored(THEME_MODE_KEY)) ?? 'auto');
const notifOn = ref(notificationPermission() === 'granted');
const notifPages = reactive<Record<NotifKey, boolean>>({
  notifyGeneration: true, notifyClassroom: true, notifyInventory: true, notifyReport: true, notifyTask: true,
});

function applyNotifPagePrefs(settings: AppearanceSettings) {
  // Activadas por defecto: solo se desmarca lo que el usuario desactivó.
  for (const n of NOTIF_PAGES) notifPages[n.key] = settings[n.key] !== false;
}

const previewFont = computed(() => {
  const f = FONT_OPTIONS.find((o) => o.value === font.value);
  return `${f ? f.css : font.value}, system-ui, sans-serif`;
});
const sliderTrack = computed(() => {
  const pct = ((fontSize.value - 12) / (20 - 12)) * 100;
  return `linear-gradient(to right,var(--accent-color) ${pct}%,var(--glass-border) ${pct}%)`;
});

function applyAccent(name: string) {
  const c = ACCENT[name];
  if (!c) return;
  const root = document.documentElement;
  const isDark = root.getAttribute('data-theme') === 'dark';
  root.style.setProperty('--accent-color', isDark ? c.colorD : c.color);
  root.style.setProperty('--accent-gradient', isDark ? c.gradientD : c.gradient);
  root.style.setProperty('--accent-glow', isDark ? c.glowD : c.glow);
  root.style.setProperty('--secondary-container', isDark ? c.containerD : c.container);
  root.style.setProperty('--glass-bg', isDark ? c.glassBgD : c.glassBg);
  root.style.setProperty('--message-user-bg', isDark ? c.glowD.replace('0.15', '0.10') : c.glow.replace('0.18', '0.08'));
  root.style.setProperty('--message-user-border', isDark ? c.glowD : c.glow);
  root.style.setProperty('--bg-primary', isDark ? c.bgDark : c.bg);
  root.style.setProperty('--bg-gradient', isDark ? c.bgGradDark : c.bgGrad);
  root.style.setProperty('--glass-border', isDark ? c.glassBorderDark : c.glassBorder);
  root.style.setProperty('--orb-1', isDark ? c.orb1Dark : c.orb1);
  root.style.setProperty('--orb-2', isDark ? c.orb2Dark : c.orb2);
  root.style.setProperty('--orb-3', isDark ? c.orb3Dark : c.orb3);
  document.body.style.background = isDark ? c.bgDark : c.bg;
  document.body.style.backgroundImage = isDark ? c.bgGradDark : c.bgGrad;
}

function applyFont(value: string) {
  const f = FONT_OPTIONS.find((o) => o.value === value);
  const family = f ? f.css.split(',')[0]! : value;
  document.documentElement.style.setProperty('--font-family', family);
  document.body.style.fontFamily = `${family}, system-ui, sans-serif`;
}

// Tema: claro/oscuro fijo o siguiendo al sistema.
const darkQuery = window.matchMedia?.('(prefers-color-scheme: dark)');
function onSystemTheme() {
  if (themeMode.value !== 'auto') return;
  applyAppearance();
  applyAccent(accent.value);
}

function setThemeMode(mode: ThemeMode) {
  themeMode.value = mode;
  const effective = mode === 'auto' ? (darkQuery?.matches ? 'dark' : 'light') : mode;
  store(THEME_KEY, effective);
  store(THEME_MODE_KEY, mode);
  document.documentElement.setAttribute('data-theme', effective);
  applyAccent(accent.value);
}

watch(accent, (name) => applyAccent(name));
watch(font, (value) => applyFont(value));
watch(fontSize, (px) => (document.documentElement.style.fontSize = `${px}px`));
watch(reducedMotion, (on) => document.documentElement.classList.toggle('reduce-motion', on));

// ── Notificaciones push ───────────────────────────────────────────────────
async function onNotifToggle(e: Event) {
  const input = e.target as HTMLInputElement;
  if (!input.checked) {
    // El permiso no se puede retirar desde JS.
    input.checked = true;
    showToast('Para desactivar, ve a los ajustes del navegador/sistema', 'ℹ️');
    return;
  }
  const alreadyGranted = notificationPermission() === 'granted';
  const result = await requestNotifications();
  if (result === 'granted' || (alreadyGranted && result === 'subscribe-failed')) {
    notifOn.value = true;
    showToast('Notificaciones activadas', '✅');
  } else if (result === 'subscribe-failed') {
    notifOn.value = true;
    showToast('Permiso concedido pero falló el registro', '⚠️');
  } else {
    input.checked = false;
    notifOn.value = false;
    if (result === 'unsupported') showToast('Tu navegador no soporta notificaciones', '❌');
    else if (result === 'blocked') showToast('Permiso bloqueado — actívalo en los ajustes del navegador', '⚠️');
    else showToast('Permiso denegado', '❌');
  }
}

// ── Guardar / restablecer ─────────────────────────────────────────────────
async function saveAll() {
  const payload: AppearanceSettings = {
    accentColor: accent.value,
    fontFamily: font.value,
    fontSize: fontSize.value,
    reducedMotion: reducedMotion.value,
    themeMode: themeMode.value,
    aiModel: stored(MODEL_KEY) || 'deepseek',
    notifications: notificationPermission() === 'granted',
    twoFactor: twoFactor.value,
    ...notifPages,
  };
  saveLocalSettings(payload);
  try {
    await fetch('/api/user/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.warn('[Settings] No se pudo guardar en DB:', err);
  }
  showToast('¡Configuración guardada correctamente!', '✅');
}

function resetSettings() {
  store(SETTINGS_KEY, null);
  document.documentElement.removeAttribute('style');
  document.body.style.fontFamily = '';
  location.reload();
}

// ── Carga inicial ─────────────────────────────────────────────────────────
onMounted(async () => {
  // Fuentes de la vista previa de tipografía.
  if (!document.getElementById('settings-fonts')) {
    const link = document.createElement('link');
    link.id = 'settings-fonts';
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&family=Playfair+Display:wght@400;600;700&family=Nunito:wght@400;500;600;700&family=Roboto:wght@400;500;700&display=swap';
    document.head.appendChild(link);
  }

  applyAccent(accent.value);
  applyFont(font.value);
  document.documentElement.style.fontSize = `${fontSize.value}px`;
  if (reducedMotion.value) document.documentElement.classList.add('reduce-motion');
  setThemeMode(themeMode.value);
  darkQuery?.addEventListener('change', onSystemTheme);
  applyNotifPagePrefs(saved);

  void loadProfile();
  void loadPreferences();

  // Lo guardado en la cuenta manda sobre la caché local.
  try {
    const { ok, data } = await api.get<{ settings?: AppearanceSettings & { themeMode?: ThemeMode; aiModel?: string; twoFactor?: boolean } }>('/api/user/settings');
    const db = ok ? data.settings : undefined;
    if (!db || !Object.keys(db).length) return;
    if (typeof db.accentColor === 'string' && ACCENT[db.accentColor]) accent.value = db.accentColor;
    if (db.fontFamily) font.value = String(db.fontFamily).replace(/'/g, '').trim();
    if (db.fontSize) fontSize.value = Number(db.fontSize);
    if (db.themeMode) setThemeMode(db.themeMode);
    if (db.aiModel) {
      store(MODEL_KEY, db.aiModel);
      aiModel.value = db.aiModel;
    }
    if (db.twoFactor !== undefined) twoFactor.value = db.twoFactor;
    applyNotifPagePrefs(db);
    saveLocalSettings(db);
  } catch {
    // Sin conexión: se queda lo de la caché local.
  }

});

onBeforeUnmount(() => darkQuery?.removeEventListener('change', onSystemTheme));
</script>

<style>
/* CSS propio de la página antigua, limitado a ella (ver router: meta.page). */
/* ============================================
 SETTINGS PAGE - ESTILOS ESPECÍFICOS
 ============================================ */
:where(body[data-page="settings"]) .settings-container {
  --page-max: 1180px;
  --page-pad: 28px;
  max-width: 860px;
  margin: 0 auto;
  padding: 28px 20px 80px;
}

:where(body[data-page="settings"]) .settings-hero {
  margin-bottom: 32px;
  padding: 32px 28px;
  background: var(--secondary-container);
  border-radius: var(--border-radius-lg);
  border: 1px solid var(--glass-border);
  box-shadow: var(--glass-shadow);
  display: flex;
  align-items: center;
  gap: 20px;
}

:where(body[data-page="settings"]) .settings-hero-icon {
  width: 56px;
  height: 56px;
  background: var(--accent-gradient);
  border-radius: var(--border-radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.6rem;
  flex-shrink: 0;
  box-shadow: 0 4px 16px var(--accent-glow);
}

:where(body[data-page="settings"]) .settings-hero h1 {
  font-size: 1.6rem;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0 0 4px;
  letter-spacing: -0.02em;
}

:where(body[data-page="settings"]) .settings-hero p {
  font-size: 0.9rem;
  color: var(--text-secondary);
  margin: 0;
}

:where(body[data-page="settings"]) .settings-section {
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  border-radius: var(--border-radius-lg);
  box-shadow: var(--glass-shadow);
  margin-bottom: 20px;
  overflow: hidden;
}

:where(body[data-page="settings"]) .settings-section-header {
  padding: 20px 24px 16px;
  border-bottom: 1px solid var(--glass-border);
  display: flex;
  align-items: center;
  gap: 12px;
}

:where(body[data-page="settings"]) .settings-section-icon {
  width: 36px;
  height: 36px;
  background: var(--secondary-container);
  border-radius: var(--border-radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.1rem;
  flex-shrink: 0;
}

:where(body[data-page="settings"]) .settings-section-header h2 {
  font-size: 1rem;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0 0 2px;
  letter-spacing: -0.01em;
}

:where(body[data-page="settings"]) .settings-section-header p {
  font-size: 0.8rem;
  color: var(--text-secondary);
  margin: 0;
}

:where(body[data-page="settings"]) .settings-section-body {
  padding: 20px 24px;
}

/* COLOR */
:where(body[data-page="settings"]) .color-palette {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(68px, 1fr));
  gap: 10px;
}

:where(body[data-page="settings"]) .color-option {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  position: relative;
}

:where(body[data-page="settings"]) .color-swatch {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  border: 3px solid transparent;
  transition: all 0.25s cubic-bezier(0.05, 0.7, 0.1, 1);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  outline: 2px solid transparent;
  outline-offset: 2px;
}

:where(body[data-page="settings"]) .color-option:hover .color-swatch {
  transform: scale(1.12);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.22);
}

:where(body[data-page="settings"]) .color-option.active .color-swatch {
  outline-color: var(--accent-color);
  box-shadow: 0 0 0 4px var(--accent-glow), 0 4px 16px rgba(0, 0, 0, 0.22);
}

:where(body[data-page="settings"]) .color-option input[type="radio"] {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
}

:where(body[data-page="settings"]) .color-label {
  font-size: 0.7rem;
  font-weight: 500;
  color: var(--text-secondary);
  text-align: center;
}

/* FUENTES */
:where(body[data-page="settings"]) .font-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 12px;
}

:where(body[data-page="settings"]) .font-card {
  border: 2px solid var(--glass-border);
  border-radius: var(--border-radius-md);
  padding: 16px;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.05, 0.7, 0.1, 1);
  position: relative;
  overflow: hidden;
  background: var(--glass-bg);
}

:where(body[data-page="settings"]) .font-card::after {
  content: '';
  position: absolute;
  inset: 0;
  background: var(--accent-color);
  opacity: 0;
  transition: opacity 0.25s;
  pointer-events: none;
}

:where(body[data-page="settings"]) .font-card:hover {
  border-color: var(--accent-color);
  transform: translateY(-2px);
  box-shadow: 0 4px 16px var(--accent-glow);
}

:where(body[data-page="settings"]) .font-card:hover::after {
  opacity: 0.04;
}

:where(body[data-page="settings"]) .font-card.active {
  border-color: var(--accent-color);
  background: var(--secondary-container);
  box-shadow: 0 2px 12px var(--accent-glow);
}

:where(body[data-page="settings"]) .font-card.active::after {
  opacity: 0.06;
}

:where(body[data-page="settings"]) .font-card input[type="radio"] {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
}

:where(body[data-page="settings"]) .font-preview {
  font-size: 1.35rem;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 4px;
  line-height: 1.2;
  transition: color 0.25s;
}

:where(body[data-page="settings"]) .font-card.active .font-preview {
  color: var(--accent-color);
}

:where(body[data-page="settings"]) .font-name {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 2px;
}

:where(body[data-page="settings"]) .font-sample {
  font-size: 0.78rem;
  color: var(--text-tertiary);
  line-height: 1.4;
}

:where(body[data-page="settings"]) .font-badge {
  position: absolute;
  top: 10px;
  right: 10px;
  background: var(--accent-color);
  color: white;
  border-radius: 50%;
  width: 18px;
  height: 18px;
  display: none;
  align-items: center;
  justify-content: center;
  font-size: 0.65rem;
}

:where(body[data-page="settings"]) .font-card.active .font-badge {
  display: flex;
}

/* SLIDER */
:where(body[data-page="settings"]) .font-size-control {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}

:where(body[data-page="settings"]) .font-size-slider-wrap {
  flex: 1;
  min-width: 200px;
}

:where(body[data-page="settings"]) .font-size-slider {
  width: 100%;
  -webkit-appearance: none;
  appearance: none;
  height: 6px;
  border-radius: 3px;
  background: var(--glass-border);
  outline: none;
  cursor: pointer;
}

:where(body[data-page="settings"]) .font-size-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--accent-color);
  cursor: pointer;
  box-shadow: 0 2px 8px var(--accent-glow);
  transition: transform 0.2s;
}

:where(body[data-page="settings"]) .font-size-slider::-webkit-slider-thumb:hover {
  transform: scale(1.2);
}

:where(body[data-page="settings"]) .font-size-slider::-moz-range-thumb {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--accent-color);
  cursor: pointer;
  box-shadow: 0 2px 8px var(--accent-glow);
  border: none;
}

:where(body[data-page="settings"]) .font-size-value {
  font-size: 1rem;
  font-weight: 700;
  color: var(--accent-color);
  min-width: 48px;
  text-align: center;
  background: var(--secondary-container);
  border-radius: var(--border-radius-sm);
  padding: 6px 10px;
}

:where(body[data-page="settings"]) .font-size-labels {
  display: flex;
  justify-content: space-between;
  margin-top: 6px;
}

:where(body[data-page="settings"]) .font-size-labels span {
  font-size: 0.7rem;
  color: var(--text-tertiary);
}

/* PREVIEW */
:where(body[data-page="settings"]) .settings-preview {
  background: var(--message-ai-bg);
  border: 1px solid var(--glass-border);
  border-radius: var(--border-radius-md);
  padding: 20px 24px;
  margin-top: 8px;
}

:where(body[data-page="settings"]) .preview-label {
  font-size: 0.72rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.6px;
  color: var(--text-tertiary);
  margin-bottom: 10px;
}

:where(body[data-page="settings"]) .preview-text {
  color: var(--text-primary);
  line-height: 1.6;
}

:where(body[data-page="settings"]) .settings-divider {
  border: none;
  border-top: 1px solid var(--glass-border);
  margin: 16px 0;
}

/* BOTONES */
:where(body[data-page="settings"]) .settings-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 28px;
}

:where(body[data-page="settings"]) .btn-settings-save {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 28px;
  background: var(--accent-gradient);
  color: white;
  border: none;
  border-radius: var(--border-radius-sm);
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.05, 0.7, 0.1, 1);
  box-shadow: 0 2px 12px var(--accent-glow);
  font-family: inherit;
}

:where(body[data-page="settings"]) .btn-settings-save:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px var(--accent-glow);
}

:where(body[data-page="settings"]) .btn-settings-save:active {
  transform: translateY(0);
}

:where(body[data-page="settings"]) .btn-settings-save:disabled {
  opacity: 0.6;
  pointer-events: none;
}

:where(body[data-page="settings"]) .btn-settings-reset {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 20px;
  background: transparent;
  color: var(--text-secondary);
  border: 1px solid var(--glass-border);
  border-radius: var(--border-radius-sm);
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.25s;
  font-family: inherit;
}

:where(body[data-page="settings"]) .btn-settings-reset:hover {
  border-color: var(--accent-color);
  color: var(--accent-color);
}

/* TOAST */
:where(body[data-page="settings"]) .settings-toast {
  position: fixed;
  bottom: 32px;
  right: 32px;
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  border-left: 4px solid var(--accent-color);
  border-radius: var(--border-radius-md);
  padding: 14px 20px;
  display: flex;
  align-items: center;
  gap: 12px;
  box-shadow: var(--glass-shadow);
  z-index: 9999;
  transform: translateY(20px);
  opacity: 0;
  transition: all 0.35s cubic-bezier(0.05, 0.7, 0.1, 1);
  pointer-events: none;
}

:where(body[data-page="settings"]) .settings-toast.show {
  transform: translateY(0);
  opacity: 1;
}

:where(body[data-page="settings"]) .settings-toast-icon {
  font-size: 1.2rem;
}

:where(body[data-page="settings"]) .settings-toast-text {
  font-size: 0.88rem;
  font-weight: 500;
  color: var(--text-primary);
}

/* ROWS */
:where(body[data-page="settings"]) .settings-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 0;
}

:where(body[data-page="settings"]) .settings-row+.settings-row {
  border-top: 1px solid var(--glass-border);
}

:where(body[data-page="settings"]) .settings-row-info h3 {
  font-size: 0.92rem;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 2px;
}

:where(body[data-page="settings"]) .settings-row-info p {
  font-size: 0.78rem;
  color: var(--text-secondary);
  margin: 0;
}

/* ── AVATAR ── */
:where(body[data-page="settings"]) .avatar-wrap {
  display: flex;
  align-items: center;
  gap: 24px;
  flex-wrap: wrap;
}

:where(body[data-page="settings"]) .avatar-preview {
  width: 88px;
  height: 88px;
  border-radius: var(--border-radius-md);
  background: var(--accent-gradient);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 2rem;
  font-weight: 800;
  color: white;
  overflow: hidden;
  box-shadow: 0 4px 16px var(--accent-glow);
  cursor: pointer;
  flex-shrink: 0;
  position: relative;
  transition: box-shadow 0.25s;
}

:where(body[data-page="settings"]) .avatar-preview:hover {
  box-shadow: 0 6px 24px var(--accent-glow);
}

:where(body[data-page="settings"]) .avatar-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.5rem;
  opacity: 0;
  transition: opacity 0.25s;
  border-radius: inherit;
}

:where(body[data-page="settings"]) .avatar-preview:hover .avatar-overlay {
  opacity: 1;
}

:where(body[data-page="settings"]) .avatar-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: inherit;
}

/* Spinner dentro del avatar */
:where(body[data-page="settings"]) .avatar-spinner {
  display: none;
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.50);
  align-items: center;
  justify-content: center;
  border-radius: inherit;
}

:where(body[data-page="settings"]) .avatar-spinner.show {
  display: flex;
}

:where(body[data-page="settings"]) .avatar-spinner::after {
  content: '';
  width: 24px;
  height: 24px;
  border: 3px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: _spin 0.7s linear infinite;
}

@keyframes _spin {
  to {
    transform: rotate(360deg);
  }
}

:where(body[data-page="settings"]) .avatar-info {
  flex: 1;
  min-width: 180px;
}

:where(body[data-page="settings"]) .avatar-info h3 {
  font-size: 0.92rem;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 4px;
}

:where(body[data-page="settings"]) .avatar-info p {
  font-size: 0.78rem;
  color: var(--text-secondary);
  margin: 0 0 14px;
  line-height: 1.5;
}

:where(body[data-page="settings"]) .avatar-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

:where(body[data-page="settings"]) .btn-upload-av {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 9px 18px;
  background: var(--accent-gradient);
  border: none;
  border-radius: var(--border-radius-sm);
  color: white;
  font-size: 0.85rem;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  transition: all 0.25s;
  box-shadow: 0 2px 8px var(--accent-glow);
}

:where(body[data-page="settings"]) .btn-upload-av:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 14px var(--accent-glow);
}

:where(body[data-page="settings"]) .btn-upload-av:disabled {
  opacity: 0.6;
  pointer-events: none;
}

:where(body[data-page="settings"]) .btn-remove-av {
  display: none;
  align-items: center;
  gap: 6px;
  padding: 9px 18px;
  background: transparent;
  border: 1px solid var(--glass-border);
  border-radius: var(--border-radius-sm);
  color: var(--text-secondary);
  font-size: 0.85rem;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  transition: all 0.25s;
}

:where(body[data-page="settings"]) .btn-remove-av:hover {
  border-color: #D32F2F;
  color: #D32F2F;
}

:where(body[data-page="settings"]) .btn-remove-av.show {
  display: inline-flex;
}

:where(body[data-page="settings"]) .btn-remove-av:disabled {
  opacity: 0.6;
  pointer-events: none;
}

/* Texto de estado debajo del avatar */
:where(body[data-page="settings"]) .avatar-status {
  font-size: 0.75rem;
  color: var(--text-tertiary);
  margin-top: 8px;
  min-height: 16px;
  transition: color 0.2s;
}

:where(body[data-page="settings"]) .avatar-status.ok {
  color: #2E7D32;
}

:where(body[data-page="settings"]) .avatar-status.err {
  color: #D32F2F;
}

[data-theme="dark"] :where(body[data-page="settings"]) .avatar-status.ok {
  color: #A5D6A7;
}

[data-theme="dark"] :where(body[data-page="settings"]) .avatar-status.err {
  color: #EF9A9A;
}

/* ── NOMBRE ── */
:where(body[data-page="settings"]) .name-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
  margin-bottom: 20px;
}

:where(body[data-page="settings"]) .settings-field label {
  display: block;
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 8px;
}

:where(body[data-page="settings"]) .settings-input {
  width: 100%;
  padding: 11px 14px;
  background: var(--secondary-container);
  border: 1.5px solid var(--glass-border);
  border-radius: var(--border-radius-sm);
  color: var(--text-primary);
  font-size: 0.92rem;
  font-family: inherit;
  transition: border-color 0.25s, box-shadow 0.25s;
  box-sizing: border-box;
}

:where(body[data-page="settings"]) .settings-input:focus {
  outline: none;
  border-color: var(--accent-color);
  box-shadow: 0 0 0 3px var(--accent-glow);
}

:where(body[data-page="settings"]) .settings-input::placeholder {
  color: var(--text-tertiary);
}

/* Estado debajo del botón guardar nombre */
:where(body[data-page="settings"]) .name-status {
  font-size: 0.75rem;
  color: var(--text-tertiary);
  margin-top: 10px;
  min-height: 16px;
}

:where(body[data-page="settings"]) .name-status.ok {
  color: #2E7D32;
}

:where(body[data-page="settings"]) .name-status.err {
  color: #D32F2F;
}

[data-theme="dark"] :where(body[data-page="settings"]) .name-status.ok {
  color: #A5D6A7;
}

[data-theme="dark"] :where(body[data-page="settings"]) .name-status.err {
  color: #EF9A9A;
}

/* ── MODELO IA ── */
:where(body[data-page="settings"]) .model-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}

:where(body[data-page="settings"]) .model-option {
  position: relative;
  cursor: pointer;
}

:where(body[data-page="settings"]) .model-option input[type="radio"] {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
}

:where(body[data-page="settings"]) .model-card {
  border: 2px solid var(--glass-border);
  border-radius: var(--border-radius-md);
  padding: 20px 18px;
  background: var(--glass-bg);
  transition: all 0.25s cubic-bezier(0.05, 0.7, 0.1, 1);
  display: flex;
  flex-direction: column;
  gap: 8px;
  position: relative;
  overflow: hidden;
  cursor: pointer;
}

:where(body[data-page="settings"]) .model-card::before {
  content: '';
  position: absolute;
  inset: 0;
  background: var(--accent-gradient);
  opacity: 0;
  transition: opacity 0.25s;
  pointer-events: none;
}

:where(body[data-page="settings"]) .model-option:hover .model-card {
  border-color: var(--accent-color);
  transform: translateY(-2px);
  box-shadow: 0 4px 16px var(--accent-glow);
}

:where(body[data-page="settings"]) .model-option input:checked+.model-card {
  border-color: var(--accent-color);
  background: var(--secondary-container);
  box-shadow: 0 2px 12px var(--accent-glow);
}

:where(body[data-page="settings"]) .model-option input:checked+.model-card::before {
  opacity: 0.06;
}

:where(body[data-page="settings"]) .model-check {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 2px solid var(--glass-border);
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.25s;
}

:where(body[data-page="settings"]) .model-option input:checked+.model-card .model-check {
  background: var(--accent-gradient);
  border-color: transparent;
}

:where(body[data-page="settings"]) .model-check svg {
  opacity: 0;
  transition: opacity 0.2s;
  fill: white;
}

:where(body[data-page="settings"]) .model-option input:checked+.model-card .model-check svg {
  opacity: 1;
}

:where(body[data-page="settings"]) .model-emoji {
  font-size: 1.8rem;
  line-height: 1;
}

:where(body[data-page="settings"]) .model-name {
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--text-primary);
  position: relative;
}

:where(body[data-page="settings"]) .model-desc {
  font-size: 0.78rem;
  color: var(--text-secondary);
  line-height: 1.5;
  position: relative;
}

:where(body[data-page="settings"]) .model-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 0.68rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  background: var(--accent-gradient);
  color: white;
  width: fit-content;
  position: relative;
}

:where(body[data-page="settings"]) .model-badge.alt {
  background: linear-gradient(135deg, #FF6B35, #FF9F0A);
}

/* RESPONSIVE */
@media (max-width:768px) {
  :where(body[data-page="settings"]) .settings-hero {
    flex-direction: column;
    text-align: center;
    padding: 24px 20px;
  }

  :where(body[data-page="settings"]) .color-palette {
    grid-template-columns: repeat(auto-fill, minmax(56px, 1fr));
  }

  :where(body[data-page="settings"]) .font-grid {
    grid-template-columns: 1fr 1fr;
  }

  :where(body[data-page="settings"]) .settings-actions {
    flex-direction: column-reverse;
  }

  :where(body[data-page="settings"]) .btn-settings-save,
  :where(body[data-page="settings"]) .btn-settings-reset {
    width: 100%;
    justify-content: center;
  }

  :where(body[data-page="settings"]) .settings-toast {
    bottom: 80px;
    right: 16px;
    left: 16px;
  }

  :where(body[data-page="settings"]) .avatar-wrap {
    flex-direction: column;
    align-items: flex-start;
  }

  :where(body[data-page="settings"]) .name-grid {
    grid-template-columns: 1fr;
  }

  :where(body[data-page="settings"]) .model-grid {
    grid-template-columns: 1fr;
  }
}

[data-theme="dark"] :where(body[data-page="settings"]) .settings-hero {
  background: #4A4458 !important;
}

[data-theme="dark"] :where(body[data-page="settings"]) .settings-input {
  background: #4A4458 !important;
  color: #E6E1E5 !important;
  border-color: rgba(207, 188, 255, 0.15) !important;
}

[data-theme="dark"] :where(body[data-page="settings"]) .settings-input::placeholder {
  color: #938F99 !important;
}

[data-theme="dark"] :where(body[data-page="settings"]) .font-card {
  background: rgba(30, 27, 36, 0.96) !important;
}

[data-theme="dark"] :where(body[data-page="settings"]) .font-card.active {
  background: #4A4458 !important;
}

[data-theme="dark"] :where(body[data-page="settings"]) .model-card {
  background: rgba(30, 27, 36, 0.96) !important;
}

[data-theme="dark"] :where(body[data-page="settings"]) .model-option input:checked+.model-card {
  background: #4A4458 !important;
}

[data-theme="dark"] :where(body[data-page="settings"]) .font-size-value {
  background: #4A4458 !important;
  color: #D0BCFF !important;
}

[data-theme="dark"] :where(body[data-page="settings"]) .settings-preview {
  background: rgba(33, 30, 38, 0.96) !important;
}

[data-theme="dark"] :where(body[data-page="settings"]) .settings-section-icon {
  background: #4A4458 !important;
}

/* ══════════════════════════════════════════════════════════════
 DISEÑO EN ESCRITORIO — MÁS COMPACTO
 ══════════════════════════════════════════════════════════════
 El hueco del sidebar y el centrado los resuelve la regla compartida
 del final de styles.css a partir de `--page-max` / `--page-pad`. */
@media (min-width: 769px) {
  :where(body[data-page="settings"]) .mobile-sidebar~.settings-container {
    padding-top: 22px;
    padding-bottom: 56px;
  }

  /* Hero: ocupaba un tercio de la pantalla sin aportar información */
  :where(body[data-page="settings"]) .settings-hero {
    margin-bottom: 20px;
    padding: 20px 24px;
    gap: 16px;
  }

  :where(body[data-page="settings"]) .settings-hero-icon {
    width: 44px;
    height: 44px;
    font-size: 1.3rem;
  }

  :where(body[data-page="settings"]) .settings-hero h1 {
    font-size: 1.3rem;
  }

  :where(body[data-page="settings"]) .settings-section-header {
    padding: 14px 20px 12px;
  }

  :where(body[data-page="settings"]) .settings-section-body {
    padding: 16px 20px;
  }

  :where(body[data-page="settings"]) .settings-section {
    margin-bottom: 0;
  }
}

/* Dos columnas tipo mosaico. Se usa multicolumna en vez de grid porque
 las secciones tienen alturas muy distintas: con grid cada fila se
 igualaría a la sección más alta y quedarían huecos enormes. */
@media (min-width: 1080px) {
  :where(body[data-page="settings"]) .mobile-sidebar~.settings-container {
    column-count: 2;
    column-gap: 18px;
  }

  :where(body[data-page="settings"]) .settings-section {
    break-inside: avoid;
    margin: 0 0 18px;
    display: inline-block;
    width: 100%;
  }

  /* El encabezado y los botones cruzan las dos columnas */
  :where(body[data-page="settings"]) .settings-hero,
  :where(body[data-page="settings"]) .settings-actions {
    column-span: all;
  }

  :where(body[data-page="settings"]) .settings-actions {
    margin-top: 10px;
  }

  /* Con la mitad de ancho, estas rejillas necesitan celdas menores */
  :where(body[data-page="settings"]) .font-grid {
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  }

  :where(body[data-page="settings"]) .color-palette {
    grid-template-columns: repeat(auto-fill, minmax(58px, 1fr));
  }
}
</style>
