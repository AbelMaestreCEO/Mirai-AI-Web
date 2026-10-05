// Botones que van dentro del HTML de formatMessageContent (copiar código,
// copiar tabla, descargar imagen). No llevan listeners propios: la lista de
// mensajes los atiende por delegación con handleMarkdownClick.

import { downloadImage } from './chat';

const CHECK_16 = '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>';
const CHECK_14 = '<svg viewBox="0 0 24 24" width="14" height="14"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>';

/** Cambia el contenido de un botón un momento y lo devuelve a como estaba. */
function flash(btn: HTMLElement, html: string, cls: string, ms: number) {
  const original = btn.innerHTML;
  btn.innerHTML = html;
  btn.classList.add(cls);
  setTimeout(() => {
    btn.innerHTML = original;
    btn.classList.remove(cls);
  }, ms);
}

async function copyCode(btn: HTMLButtonElement) {
  try {
    await navigator.clipboard.writeText(decodeURIComponent(btn.dataset.code || ''));
    flash(btn, `${CHECK_16}<span>¡Copiado!</span>`, 'copied', 2000);
  } catch {
    flash(btn, '<span>Error</span>', 'error', 2000);
  }
}

// Copia la tabla como HTML con formato (para pegarla en Word); si el
// navegador no deja, como texto tabulado.
async function copyTable(btn: HTMLButtonElement) {
  const table = btn.closest('.md-table-wrapper')?.querySelector<HTMLTableElement>('.md-table');
  if (!table) return;
  const tableHTML = `
        <html><body>
        <style>
          table { border-collapse: collapse; font-family: Calibri, Arial, sans-serif; font-size: 11pt; }
          th { background: #5c4a9e; color: white; padding: 6px 12px; border: 1px solid #999; font-weight: bold; }
          td { padding: 5px 12px; border: 1px solid #ccc; }
          tr:nth-child(even) td { background: #f5f2ff; }
        </style>
        ${table.outerHTML}
        </body></html>`;
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([tableHTML], { type: 'text/html' }) })]);
    flash(btn, `${CHECK_14} ¡Copiado!`, 'copied', 2500);
  } catch {
    const text = Array.from(table.querySelectorAll('tr'))
      .map((r) => Array.from(r.querySelectorAll<HTMLElement>('th,td')).map((c) => c.innerText).join('\t'))
      .join('\n');
    try {
      await navigator.clipboard.writeText(text);
      flash(btn, `${CHECK_14} Copiado (texto)`, 'copied', 2500);
    } catch {
      // Sin acceso al portapapeles.
    }
  }
}

async function downloadFromButton(btn: HTMLButtonElement) {
  const original = btn.innerHTML;
  btn.innerHTML =
    '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="width:16px;height:16px;"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg><span class="download-label">¡Listo!</span>';
  btn.style.borderColor = '#34c759';
  btn.style.color = '#34c759';
  await downloadImage(btn.dataset.imageUrl || '', `mirai-image-${Date.now()}.png`);
  setTimeout(() => {
    btn.innerHTML = original;
    btn.style.borderColor = '';
    btn.style.color = '';
  }, 2000);
}

/** Atiende un clic en la lista de mensajes. Devuelve true si era uno de estos botones. */
export function handleMarkdownClick(e: MouseEvent): boolean {
  const target = e.target as HTMLElement;
  const button = target.closest<HTMLButtonElement>('.copy-code-btn, .copy-table-btn, .image-download-btn');
  if (!button) return false;
  e.preventDefault();
  e.stopPropagation();
  if (button.classList.contains('copy-code-btn')) void copyCode(button);
  else if (button.classList.contains('copy-table-btn')) void copyTable(button);
  else void downloadFromButton(button);
  return true;
}
