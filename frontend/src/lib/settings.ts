// Tema claro/oscuro y apariencia guardada por el usuario.
//
// Usa las mismas claves de localStorage que las páginas antiguas
// (mirai-boot.js y el <script> inline del <head> de cada HTML), así que un
// cambio hecho en una página vieja se ve en una nueva y al revés.

import { ref } from 'vue';

export const THEME_KEY = 'mirai-ai-theme';
export const THEME_MODE_KEY = 'mirai-ai-theme-mode';
export const SETTINGS_KEY = 'mirai-settings';

export type Theme = 'light' | 'dark';

export interface AppearanceSettings {
  accentColor?: string;
  fontFamily?: string;
  fontSize?: number | string;
  reducedMotion?: boolean;
  [key: string]: unknown;
}

interface AccentPalette {
  c: string; cD: string;
  g: string; gD: string;
  glow: string; glowD: string;
  sc: string; scD: string;
  gbg: string; gbgD: string;
  bg: string; bgG: string;
  bgD: string; bgGD: string;
  gb: string; gbD: string;
}

// Copia exacta de COLORS del <head> de las páginas antiguas.
export const ACCENT_COLORS: Record<string, AccentPalette> = {
  purple: { c: '#6750A4', cD: '#D0BCFF', g: 'linear-gradient(135deg,#6750A4,#7F67BE 50%,#9A82DB)', gD: 'linear-gradient(135deg,#D0BCFF,#B69DF8 50%,#9A82DB)', glow: 'rgba(103,80,164,0.18)', glowD: 'rgba(208,188,255,0.15)', sc: '#E8DEF8', scD: '#2A2438', gbg: 'rgba(255,255,255,0.94)', gbgD: 'rgba(30,27,36,0.96)', bg: '#F5F3F8', bgG: 'linear-gradient(145deg,#F5F3F8 0%,#EDE7F6 40%,#E8EAF6 100%)', bgD: '#141218', bgGD: 'linear-gradient(145deg,#141218 0%,#1D1A22 40%,#211F26 100%)', gb: 'rgba(103,80,164,0.12)', gbD: 'rgba(207,188,255,0.10)' },
  blue: { c: '#1565C0', cD: '#90CAF9', g: 'linear-gradient(135deg,#1565C0,#2196F3 50%,#42A5F5)', gD: 'linear-gradient(135deg,#90CAF9,#64B5F6 50%,#42A5F5)', glow: 'rgba(21,101,192,0.18)', glowD: 'rgba(144,202,249,0.15)', sc: '#E3F2FD', scD: '#0D1E35', gbg: 'rgba(255,255,255,0.94)', gbgD: 'rgba(18,21,32,0.96)', bg: '#F3F6FB', bgG: 'linear-gradient(145deg,#F3F6FB 0%,#E3F2FD 40%,#E8EAF6 100%)', bgD: '#121520', bgGD: 'linear-gradient(145deg,#121520 0%,#181E2E 40%,#1A1F30 100%)', gb: 'rgba(21,101,192,0.12)', gbD: 'rgba(144,202,249,0.10)' },
  teal: { c: '#00695C', cD: '#80CBC4', g: 'linear-gradient(135deg,#00695C,#009688 50%,#26C6DA)', gD: 'linear-gradient(135deg,#80CBC4,#4DB6AC 50%,#26C6DA)', glow: 'rgba(0,105,92,0.18)', glowD: 'rgba(128,203,196,0.15)', sc: '#E0F2F1', scD: '#0A1F1D', gbg: 'rgba(255,255,255,0.94)', gbgD: 'rgba(18,26,25,0.96)', bg: '#F2F9F8', bgG: 'linear-gradient(145deg,#F2F9F8 0%,#E0F2F1 40%,#E0F7FA 100%)', bgD: '#121A19', bgGD: 'linear-gradient(145deg,#121A19 0%,#172320 40%,#162527 100%)', gb: 'rgba(0,105,92,0.12)', gbD: 'rgba(128,203,196,0.10)' },
  green: { c: '#2E7D32', cD: '#A5D6A7', g: 'linear-gradient(135deg,#2E7D32,#388E3C 50%,#66BB6A)', gD: 'linear-gradient(135deg,#A5D6A7,#81C784 50%,#66BB6A)', glow: 'rgba(46,125,50,0.18)', glowD: 'rgba(165,214,167,0.15)', sc: '#E8F5E9', scD: '#0D1F0E', gbg: 'rgba(255,255,255,0.94)', gbgD: 'rgba(18,24,18,0.96)', bg: '#F3F9F3', bgG: 'linear-gradient(145deg,#F3F9F3 0%,#E8F5E9 40%,#F1F8E9 100%)', bgD: '#121812', bgGD: 'linear-gradient(145deg,#121812 0%,#182018 40%,#192218 100%)', gb: 'rgba(46,125,50,0.12)', gbD: 'rgba(165,214,167,0.10)' },
  orange: { c: '#E65100', cD: '#FFB74D', g: 'linear-gradient(135deg,#E65100,#F57C00 50%,#FFA726)', gD: 'linear-gradient(135deg,#FFB74D,#FFA726 50%,#FF8F00)', glow: 'rgba(230,81,0,0.18)', glowD: 'rgba(255,183,77,0.15)', sc: '#FFF3E0', scD: '#271A08', gbg: 'rgba(255,255,255,0.94)', gbgD: 'rgba(30,22,16,0.96)', bg: '#FBF6F0', bgG: 'linear-gradient(145deg,#FBF6F0 0%,#FFF3E0 40%,#FFF8E1 100%)', bgD: '#1E1610', bgGD: 'linear-gradient(145deg,#1E1610 0%,#271C12 40%,#281E14 100%)', gb: 'rgba(230,81,0,0.12)', gbD: 'rgba(255,183,77,0.10)' },
  pink: { c: '#AD1457', cD: '#F48FB1', g: 'linear-gradient(135deg,#AD1457,#D81B60 50%,#F06292)', gD: 'linear-gradient(135deg,#F48FB1,#F06292 50%,#EC407A)', glow: 'rgba(173,20,87,0.18)', glowD: 'rgba(244,143,177,0.15)', sc: '#FCE4EC', scD: '#250C18', gbg: 'rgba(255,255,255,0.94)', gbgD: 'rgba(28,18,24,0.96)', bg: '#FAF2F6', bgG: 'linear-gradient(145deg,#FAF2F6 0%,#FCE4EC 40%,#F8EAF6 100%)', bgD: '#1C1218', bgGD: 'linear-gradient(145deg,#1C1218 0%,#251520 40%,#261525 100%)', gb: 'rgba(173,20,87,0.12)', gbD: 'rgba(240,98,146,0.10)' },
  red: { c: '#B71C1C', cD: '#EF9A9A', g: 'linear-gradient(135deg,#B71C1C,#D32F2F 50%,#EF5350)', gD: 'linear-gradient(135deg,#EF9A9A,#E57373 50%,#EF5350)', glow: 'rgba(183,28,28,0.18)', glowD: 'rgba(239,154,154,0.15)', sc: '#FFEBEE', scD: '#250D0D', gbg: 'rgba(255,255,255,0.94)', gbgD: 'rgba(28,18,18,0.96)', bg: '#FAF2F2', bgG: 'linear-gradient(145deg,#FAF2F2 0%,#FFEBEE 40%,#FFEAEA 100%)', bgD: '#1C1212', bgGD: 'linear-gradient(145deg,#1C1212 0%,#251515 40%,#271616 100%)', gb: 'rgba(183,28,28,0.12)', gbD: 'rgba(239,83,80,0.10)' },
  indigo: { c: '#283593', cD: '#9FA8DA', g: 'linear-gradient(135deg,#283593,#3F51B5 50%,#7986CB)', gD: 'linear-gradient(135deg,#9FA8DA,#7986CB 50%,#5C6BC0)', glow: 'rgba(40,53,147,0.18)', glowD: 'rgba(159,168,218,0.15)', sc: '#E8EAF6', scD: '#0E1020', gbg: 'rgba(255,255,255,0.94)', gbgD: 'rgba(19,19,24,0.96)', bg: '#F3F3FA', bgG: 'linear-gradient(145deg,#F3F3FA 0%,#E8EAF6 40%,#EDE7F6 100%)', bgD: '#131318', bgGD: 'linear-gradient(145deg,#131318 0%,#191A25 40%,#1B1A28 100%)', gb: 'rgba(40,53,147,0.12)', gbD: 'rgba(121,134,203,0.10)' },
  yellow: { c: '#F57F17', cD: '#FFF176', g: 'linear-gradient(135deg,#F57F17,#FBC02D 50%,#FFEE58)', gD: 'linear-gradient(135deg,#FFF176,#FFEE58 50%,#FDD835)', glow: 'rgba(245,127,23,0.18)', glowD: 'rgba(255,238,88,0.15)', sc: '#FFFDE7', scD: '#1F1C08', gbg: 'rgba(255,255,255,0.94)', gbgD: 'rgba(29,28,16,0.96)', bg: '#FDFBF0', bgG: 'linear-gradient(145deg,#FDFBF0 0%,#FFFDE7 40%,#FFF9C4 100%)', bgD: '#1D1C10', bgGD: 'linear-gradient(145deg,#1D1C10 0%,#262512 40%,#282714 100%)', gb: 'rgba(245,127,23,0.12)', gbD: 'rgba(255,238,88,0.10)' },
  slate: { c: '#37474F', cD: '#B0BEC5', g: 'linear-gradient(135deg,#37474F,#546E7A 50%,#90A4AE)', gD: 'linear-gradient(135deg,#B0BEC5,#90A4AE 50%,#78909C)', glow: 'rgba(55,71,79,0.18)', glowD: 'rgba(176,190,197,0.15)', sc: '#ECEFF1', scD: '#131618', gbg: 'rgba(255,255,255,0.94)', gbgD: 'rgba(25,28,30,0.96)', bg: '#F3F5F6', bgG: 'linear-gradient(145deg,#F3F5F6 0%,#ECEFF1 40%,#E8EDF0 100%)', bgD: '#131618', bgGD: 'linear-gradient(145deg,#131618 0%,#1A1F22 40%,#1C2125 100%)', gb: 'rgba(55,71,79,0.12)', gbD: 'rgba(144,164,174,0.10)' },
};

function storageGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function storageSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Navegación privada / almacenamiento bloqueado: el cambio vale solo para esta visita.
  }
}

export function readSettings(): AppearanceSettings {
  try {
    return JSON.parse(storageGet(SETTINGS_KEY) || '{}') || {};
  } catch {
    return {};
  }
}

function systemPrefersDark(): boolean {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
}

/** Tema efectivo: modo 'auto' sigue al sistema (mirai-boot.js hacía lo mismo). */
export function resolveTheme(): Theme {
  const mode = storageGet(THEME_MODE_KEY) || 'auto';
  if (mode === 'auto') {
    const t: Theme = systemPrefersDark() ? 'dark' : 'light';
    storageSet(THEME_KEY, t);
    return t;
  }
  const saved = storageGet(THEME_KEY);
  if (saved === 'dark' || saved === 'light') return saved;
  return systemPrefersDark() ? 'dark' : 'light';
}

export const currentTheme = ref<Theme>('light');

/** Aplica tema, color de acento, fuente y movimiento reducido al documento. */
export function applyAppearance(theme: Theme = resolveTheme()): void {
  const root = document.documentElement;
  currentTheme.value = theme;
  root.setAttribute('data-theme', theme);

  const s = readSettings();
  const isDark = theme === 'dark';
  const c = s.accentColor ? ACCENT_COLORS[s.accentColor] : undefined;
  if (c) {
    root.style.setProperty('--accent-color', isDark ? c.cD : c.c);
    root.style.setProperty('--accent-gradient', isDark ? c.gD : c.g);
    root.style.setProperty('--accent-glow', isDark ? c.glowD : c.glow);
    root.style.setProperty('--secondary-container', isDark ? c.scD : c.sc);
    root.style.setProperty('--glass-bg', isDark ? c.gbgD : c.gbg);
    root.style.setProperty('--glass-border', isDark ? c.gbD : c.gb);
    root.style.setProperty('--message-user-bg', isDark ? c.glowD.replace('0.15', '0.10') : c.glow.replace('0.18', '0.08'));
    root.style.setProperty('--message-user-border', isDark ? c.glowD : c.glow);
    root.style.setProperty('--bg-primary', isDark ? c.bgD : c.bg);
    root.style.setProperty('--bg-gradient', isDark ? c.bgGD : c.bgG);
    root.style.background = isDark ? c.bgD : c.bg;
    root.style.backgroundImage = isDark ? c.bgGD : c.bgG;
  }
  if (s.fontFamily) root.style.setProperty('--font-family', String(s.fontFamily));
  if (s.fontSize) root.style.fontSize = `${s.fontSize}px`;
  root.classList.toggle('reduce-motion', !!s.reducedMotion);
}

/**
 * Botón sol/luna. Igual que mirai-boot.js: solo cambia mirai-ai-theme. Si en
 * Configuración el modo es "automático", la próxima carga vuelve a seguir al
 * sistema; el modo fijo se elige en Configuración.
 */
export function toggleTheme(): void {
  const next: Theme = currentTheme.value === 'dark' ? 'light' : 'dark';
  storageSet(THEME_KEY, next);
  applyAppearance(next);
}
