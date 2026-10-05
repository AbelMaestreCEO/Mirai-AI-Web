// Formateo de los mensajes del chat (port de formatMessageContent de app.js).
//
// Markdown propio y limitado: bloques de código con su lenguaje y botón de
// copiar, imágenes con botón de descarga, negrita, *acciones* de rol, código en
// línea, encabezados, listas, citas y tablas con botón de "Copiar tabla". Recibe el
// texto crudo del mensaje y lo escapa una sola vez; lo que devuelve es HTML
// seguro para v-html. Los botones no llevan listeners: el chat los atiende por
// delegación (ver ChatPage.vue).

import { detectLang, langLabel, normalizeLang } from './code-languages';

const ASSETS_ORIGIN = 'https://aiassets.aberumirai.com/';

export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Las imágenes de R2 se sirven a través del Worker (/api/image/<clave>). */
export function proxiedAssetUrl(url: string, route: 'image' | 'video'): string {
  return url.startsWith(ASSETS_ORIGIN) ? `/api/${route}/${url.slice(ASSETS_ORIGIN.length)}` : url;
}

/**
 * Un bloque de código a medio llegar deja el ``` sin cerrar y se pintaría como
 * texto suelto hasta que llegase el cierre. Se cierra en falso mientras dura
 * el streaming.
 */
export function balanceCodeFences(text: string): string {
  const fences = (text.match(/```/g) || []).length;
  return fences % 2 === 1 ? `${text}\n\`\`\`` : text;
}

const COPY_ICON =
  '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>';
const CODE_ICON =
  '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M9.4 16.6 4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0 4.6-4.6-4.6-4.6L16 6l6 6-6 6-1.4-1.4z"/></svg>';

/**
 * Algunos modelos devuelven el código ya escapado (&amp;, &lt;…) y se vería y
 * copiaría así. Solo se deshace si el bloque no trae ningún <, > o & suelto:
 * un ejemplo de HTML que enseña entidades siempre lleva alguna etiqueta.
 */
function unescapeIfEscaped(code: string): string {
  if (!/&(amp|lt|gt|quot|#0?39|#x27);/.test(code)) return code;
  if (/[<>]|&(?!(amp|lt|gt|quot|#0?39|#x27);)/.test(code)) return code;
  return code
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&#x27;/g, "'")
    .replace(/&amp;/g, '&');
}

function codeBlockHtml(rawLang: string, rawCode: string): string {
  const code = unescapeIfEscaped(rawCode.replace(/\r?\n$/, ''));
  const lang = normalizeLang(rawLang) || detectLang(code) || 'plaintext';
  const safeLang = lang.replace(/[^\w-]/g, '');
  return `<div class="code-block-wrapper">
      <div class="code-header">
        <span class="code-lang">${CODE_ICON}<span>${escapeHtml(langLabel(lang))}</span></span>
        <button class="copy-code-btn" data-code="${encodeURIComponent(code)}" title="Copiar todo el código">
          ${COPY_ICON}
          <span>Copiar</span>
        </button>
      </div>
      <pre class="code-block"><code class="language-${safeLang}">${escapeHtml(code)}</code></pre>
    </div>`;
}

function imageHtml(alt: string, url: string): string {
  // alt y url ya vienen escapados.
  const displayUrl = proxiedAssetUrl(url, 'image');
  return `
      <div class="image-container">
        <div class="image-toolbar">
          <button class="image-download-btn" data-image-url="${displayUrl}" title="Descargar imagen">
            <svg viewBox="0 0 24 24" width="18" height="18" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 15V3"/>
              <path d="M7 10l5 5 5-5"/>
              <path d="M3 18h18v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1z"/>
            </svg>
          </button>
        </div>
        <img src="${displayUrl}" alt="${alt}" class="md-image lightbox-trigger">
      </div>
    `;
}

function tableHtml(tableBlock: string): string | null {
  const rows = tableBlock.trim().split('\n').filter((r) => r.trim());
  if (rows.length < 2) return null;

  const sepIdx = rows.findIndex((r) => /^\|[\s\-:|]+\|$/.test(r.trim()));
  if (sepIdx === -1) return null;

  const parseRow = (row: string) =>
    row
      .trim()
      .replace(/^\||\|$/g, '')
      .split('|')
      .map((cell) => cell.trim());

  const thHTML = parseRow(rows[0] ?? '')
    .map((h) => `<th>${h}</th>`)
    .join('');
  const tbodyHTML = rows
    .slice(sepIdx + 1)
    .map((row) => `<tr>${parseRow(row).map((c) => `<td>${c}</td>`).join('')}</tr>`)
    .join('');

  return `<div class="md-table-wrapper">
      <table class="md-table">
        <thead><tr>${thHTML}</tr></thead>
        <tbody>${tbodyHTML}</tbody>
      </table>
      <button class="copy-table-btn" title="Copiar tabla para Word">
        <svg viewBox="0 0 24 24" width="14" height="14"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
        Copiar tabla
      </button>
    </div>`;
}

/** Convierte el texto crudo de un mensaje en HTML seguro. */
export function formatMessageContent(content: string): string {
  // 1. Los bloques de código se apartan antes de escapar: su contenido se
  //    escapa por separado y no debe pasar por el resto de reglas.
  const codeBlocks: string[] = [];
  let formatted = content.replace(/```([^\n`]*)\r?\n([\s\S]*?)```/g, (_m, lang: string, code: string) => {
    codeBlocks.push(codeBlockHtml(lang, code));
    return `__CODEHTML_${codeBlocks.length - 1}__`;
  });

  // 2. Todo lo demás se escapa y luego se sustituyen los patrones de markdown.
  formatted = escapeHtml(formatted);

  // Las imágenes también se apartan: su HTML no debe recibir los <br> de los
  // saltos de línea (dentro del <svg> lo rompían).
  const images: string[] = [];
  formatted = formatted.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_m, alt: string, url: string) => {
    images.push(imageHtml(alt, url));
    return `__IMAGE_${images.length - 1}__`;
  });

  formatted = formatted.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  formatted = formatted.replace(/\*(.+?)\*/g, '<br><em class="roleplay-action">$1</em><br>');
  formatted = formatted.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');

  formatted = formatted.replace(/^###### (.+)$/gm, '<h6 class="md-heading">$1</h6>');
  formatted = formatted.replace(/^##### (.+)$/gm, '<h5 class="md-heading">$1</h5>');
  formatted = formatted.replace(/^#### (.+)$/gm, '<h4 class="md-heading">$1</h4>');
  formatted = formatted.replace(/^### (.+)$/gm, '<h3 class="md-heading">$1</h3>');
  formatted = formatted.replace(/^## (.+)$/gm, '<h2 class="md-heading">$1</h2>');
  formatted = formatted.replace(/^# (.+)$/gm, '<h1 class="md-heading">$1</h1>');

  formatted = formatted.replace(/^- (.+)$/gm, '<li class="md-list-item">$1</li>');
  formatted = formatted.replace(/(<li class="md-list-item">.*<\/li>\n?)+/g, '<ul class="md-list">$&</ul>');
  formatted = formatted.replace(/^&gt; (.+)$/gm, '<blockquote class="md-blockquote">$1</blockquote>');

  // 3. Las tablas se apartan antes de convertir los saltos de línea en <br>.
  const tableBlocks: string[] = [];
  formatted = formatted.replace(/((?:^\|[^\n]+\|\n?)+)/gm, (block: string) => {
    const html = tableHtml(block);
    if (html === null) return block;
    tableBlocks.push(html);
    return `__TABLE_BLOCK_${tableBlocks.length - 1}__`;
  });

  formatted = formatted.replace(/\n/g, '<br>');

  tableBlocks.forEach((html, i) => {
    formatted = formatted.replace(`<br>__TABLE_BLOCK_${i}__<br>`, html).replace(`__TABLE_BLOCK_${i}__`, html);
  });
  codeBlocks.forEach((html, i) => {
    formatted = formatted.replace(`<br>__CODEHTML_${i}__<br>`, html).replace(`__CODEHTML_${i}__`, html);
  });
  images.forEach((html, i) => {
    formatted = formatted.replace(`__IMAGE_${i}__`, html);
  });

  return formatted.replace(/<\/(h[1-6]|ul|ol|blockquote|pre|div)>[ ]*<br>/g, '</$1>');
}
