/* ============================================
   MIRAI AI - Extracción de texto de documentos de Office

   Soporta OOXML (DOCX, DOCM, XLSX, XLSM) descomprimiendo el ZIP con fflate y
   los formatos binarios antiguos (DOC, XLS) con una extracción de cadenas
   legibles de mejor esfuerzo.
   ============================================ */
import { unzipSync } from 'fflate';

const MAX_TEXT = 15000;

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

function cleanText(value: string): string {
  return decodeXml(value)
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function xmlParagraphs(xml: string): string {
  return xml
    .replace(/<w:tab[^>]*\/>/g, '\t')
    .replace(/<w:br[^>]*\/>/g, '\n')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<[^>]+>/g, '');
}

function extractDocx(bytes: Uint8Array): string {
  const files = unzipSync(bytes);
  const documentXml = files['word/document.xml'];
  if (!documentXml) throw new Error('El documento no contiene word/document.xml');

  const xml = new TextDecoder('utf-8').decode(documentXml);
  const paragraphs = xml.match(/<w:p[\s\S]*?<\/w:p>/g) || [xml];
  return paragraphs.map((p) => cleanText(xmlParagraphs(p))).filter(Boolean).join('\n');
}

function extractXlsx(bytes: Uint8Array): string {
  const files = unzipSync(bytes);
  const decoder = new TextDecoder('utf-8');
  const sharedXml = files['xl/sharedStrings.xml'];
  const shared: string[] = [];

  if (sharedXml) {
    const xml = decoder.decode(sharedXml);
    for (const match of xml.match(/<si[\s\S]*?<\/si>/g) || []) {
      const text = (match.match(/<t[^>]*>([\s\S]*?)<\/t>/g) || [])
        .map((t) => cleanText(t.replace(/<[^>]+>/g, '')))
        .filter(Boolean)
        .join(' ');
      shared.push(text);
    }
  }

  const sheetNames = Object.keys(files).filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name));
  const lines: string[] = [];

  for (const sheetName of sheetNames) {
    const xml = decoder.decode(files[sheetName]);
    for (const row of xml.match(/<row[\s\S]*?<\/row>/g) || []) {
      const cells: string[] = [];
      for (const cell of row.match(/<c[\s\S]*?<\/c>/g) || []) {
        const type = (cell.match(/\bt="([^"]+)"/) || [])[1] || '';
        let value = '';

        if (type === 's') {
          const index = Number((cell.match(/<v>([\s\S]*?)<\/v>/) || [])[1]);
          value = Number.isInteger(index) ? shared[index] || '' : '';
        } else if (type === 'inlineStr') {
          value = (cell.match(/<is>[\s\S]*?<\/is>/) || [''])
            .map((is) => (is.match(/<t[^>]*>([\s\S]*?)<\/t>/g) || [])
              .map((t) => cleanText(t.replace(/<[^>]+>/g, '')))
              .filter(Boolean)
              .join(' '))
            .join(' ');
        } else {
          const raw = (cell.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
          value = raw ? cleanText(raw) : '';
        }

        if (value) cells.push(value);
      }
      if (cells.length) lines.push(cells.join(' | '));
    }
  }

  if (lines.length) return lines.join('\n');
  return shared.join('\n');
}

function extractLegacyBinary(bytes: Uint8Array): string {
  let zeroBytes = 0;
  const sample = Math.min(bytes.length, 4096);
  for (let i = 0; i < sample; i++) if (bytes[i] === 0) zeroBytes++;

  const label = zeroBytes > sample / 4 ? 'utf-16le' : 'utf-8';
  let raw = '';
  try {
    raw = new TextDecoder(label).decode(bytes);
  } catch {
    raw = new TextDecoder('utf-8').decode(bytes);
  }

  return (raw.match(/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9][\x20-\x7E\xA0-\xFF]{3,}/g) || [])
    .map((span) => span.trim())
    .filter((span) => span.length >= 4)
    .join(' ');
}

/**
 * Devuelve el texto plano de un archivo DOCX, DOCM, XLSX, XLSM, DOC o XLS.
 * Lanza un error legible si no se puede recuperar contenido suficiente.
 */
export async function extractTextFromOffice(buffer: ArrayBuffer, filename: string): Promise<string> {
  const ext = (filename.split('.').pop() || '').toLowerCase();
  const bytes = new Uint8Array(buffer);
  let text = '';

  if (ext === 'docx' || ext === 'docm') {
    text = extractDocx(bytes);
  } else if (ext === 'xlsx' || ext === 'xlsm') {
    text = extractXlsx(bytes);
  } else if (ext === 'doc' || ext === 'xls') {
    text = extractLegacyBinary(bytes);
  } else {
    throw new Error('Formato no soportado. Usa DOCX, DOC, DOCM, XLS, XLSX o XLSM.');
  }

  text = cleanText(text);
  if (text.length < 40) {
    throw new Error('No se pudo extraer texto suficiente del archivo. Verifica que no esté vacío o protegido.');
  }
  return text.slice(0, MAX_TEXT);
}
