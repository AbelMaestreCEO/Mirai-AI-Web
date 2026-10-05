// Resaltado de sintaxis de los bloques de código del chat.
//
// Excel y CSV/TSV se resaltan aquí mismo. El resto, con highlight.js, que se
// carga bajo demanda la primera vez que aparece un bloque. Hasta entonces
// highlightCode devuelve null y el bloque se pinta sin colores; como lee una
// ref reactiva, el computed/render que lo llamó se vuelve a evaluar solo cuando
// la librería termina de cargar.

import { shallowRef } from 'vue';
import type { HLJSApi } from 'highlight.js';

const hljs = shallowRef<HLJSApi | null>(null);
let loading: Promise<void> | null = null;

function load() {
  loading ??= import('./highlight-languages')
    .then((m) => {
      hljs.value = m.default;
    })
    .catch(() => {
      // Sin red o chunk caído: se sigue sin colores y se reintenta en el próximo bloque.
      loading = null;
    });
}

// Clave canónica (code-languages.ts) → nombre en highlight.js, cuando difieren.
const HLJS_NAMES: Record<string, string> = {
  vba: 'vbscript',
  jsx: 'javascript',
  tsx: 'typescript',
  html: 'xml',
  svg: 'xml',
  vue: 'xml',
  svelte: 'xml',
  sass: 'scss',
  toml: 'ini',
  env: 'ini',
  batch: 'dos',
  pascal: 'delphi',
  assembly: 'x86asm',
};

// Durante el streaming el mismo bloque se vuelve a formatear con cada token;
// los que ya están cerrados salen de aquí.
const cache = new Map<string, string>();
const CACHE_MAX = 200;

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * CSV/TSV (highlight.js no los trae): la cabecera, los separadores, los textos
 * entre comillas y los números, cada uno con su color.
 */
function highlightDelimited(code: string, lang: 'csv' | 'tsv'): string {
  const first = code.split('\n', 1)[0] ?? '';
  const sep = lang === 'tsv' ? '\t' : first.split(';').length > first.split(',').length ? ';' : ',';
  const token = new RegExp(`("(?:[^"]|"")*"?)|([${sep}])|(\\r?\\n)|([^${sep}"\\r\\n]+)`, 'g');
  let header = true;
  return code.replace(token, (m, quoted?: string, delim?: string, newline?: string) => {
    if (newline) {
      header = false;
      return m;
    }
    if (delim) return `<span class="hljs-punctuation">${escapeHtml(m)}</span>`;
    const cls = header ? 'hljs-title' : quoted ? 'hljs-string' : /^\s*-?\d+([.,]\d+)?%?\s*$/.test(m) ? 'hljs-number' : '';
    return cls ? `<span class="${cls}">${escapeHtml(m)}</span>` : escapeHtml(m);
  });
}

// Fórmulas de Excel. La gramática de highlight.js solo conoce las funciones en
// inglés; aquí cualquier nombre seguido de "(" es una función (SI.ERROR, ENCOL,
// APILARV…), así que vale para cualquier idioma de Excel.
const EXCEL_TOKEN = new RegExp(
  [
    '("(?:[^"]|"")*"?)', // 1 texto
    "('(?:[^']|'')*'!?)", // 2 nombre de hoja entre comillas
    '(\\$?[A-Za-z]{1,3}\\$?\\d+(?::\\$?[A-Za-z]{1,3}\\$?\\d+)?)(?![\\p{L}\\d_.(])', // 3 celda o rango
    '([\\p{L}_][\\p{L}\\d_.]*)(?=\\s*\\()', // 4 función
    '([\\p{L}_][\\p{L}\\d_.]*!)', // 5 hoja sin comillas (Hoja1!)
    '(\\b(?:TRUE|FALSE|VERDADERO|FALSO)\\b|#[\\p{L}/0!?¡]+)', // 6 lógicos y errores
    '([\\p{L}_][\\p{L}\\d_.]*)', // 7 nombre (variables de LET, rangos con nombre)
    '(\\d+(?:[.,]\\d+)?(?:[eE][+-]?\\d+)?%?)', // 8 número
    '([=+\\-*/^&<>%:@])', // 9 operador
    '([;,(){}])', // 10 puntuación
  ].join('|'),
  'gu',
);
const EXCEL_CLASSES = [
  '',
  'hljs-string',
  'hljs-attr',
  'hljs-attr',
  'hljs-built_in',
  'hljs-attr',
  'hljs-literal',
  '',
  'hljs-number',
  'hljs-operator',
  'hljs-punctuation',
];

function highlightExcel(code: string): string {
  let out = '';
  let last = 0;
  for (const m of code.matchAll(EXCEL_TOKEN)) {
    const i = m.index;
    out += escapeHtml(code.slice(last, i));
    const group = m.findIndex((g, n) => n > 0 && g !== undefined);
    const cls = EXCEL_CLASSES[group] ?? '';
    out += cls ? `<span class="${cls}">${escapeHtml(m[0])}</span>` : escapeHtml(m[0]);
    last = i + m[0].length;
  }
  return out + escapeHtml(code.slice(last));
}

/**
 * HTML resaltado (y escapado) del código, o null si no hay resaltado para ese
 * lenguaje o la librería aún no ha cargado.
 */
export function highlightCode(code: string, lang: string): string | null {
  if (lang === 'csv' || lang === 'tsv') return highlightDelimited(code, lang);
  if (lang === 'excel') return highlightExcel(code);
  const h = hljs.value;
  if (!h) {
    load();
    return null;
  }
  const name = HLJS_NAMES[lang] ?? lang;
  if (!h.getLanguage(name)) return null;

  const key = `${name}\u0000${code}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;

  let html: string;
  try {
    html = h.highlight(code, { language: name, ignoreIllegals: true }).value;
  } catch {
    return null;
  }
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
  cache.set(key, html);
  return html;
}
