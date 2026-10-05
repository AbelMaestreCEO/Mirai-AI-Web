// Adjuntos del chat: extracción del texto de cada archivo en el navegador.
//
// Las librerías (pdf.js, mammoth, SheetJS, JSZip) son las mismas versiones que
// cargaba chat.html desde cdnjs, pero ahora solo se descargan la primera vez
// que se adjunta un archivo de ese tipo.

import { MAMMOTH_SRC, loadGlobal } from './cdn';

export const MAX_FILE_SIZE = 10 * 1024 * 1024;
export const SUPPORTED_FORMATS = ['txt', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'csv'];
export const FILE_ACCEPT = SUPPORTED_FORMATS.map((f) => `.${f}`).join(',');

const CDN = 'https://cdnjs.cloudflare.com/ajax/libs';
const PDFJS = `${CDN}/pdf.js/3.11.174/pdf.min.js`;
const PDFJS_WORKER = `${CDN}/pdf.js/3.11.174/pdf.worker.min.js`;
const XLSX_LIB = `${CDN}/xlsx/0.18.5/xlsx.full.min.js`;
const JSZIP = `${CDN}/jszip/3.10.1/jszip.min.js`;

// Lo mínimo que se usa de cada librería global.
interface PdfJs {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument(src: { data: ArrayBuffer }): {
    promise: Promise<{
      numPages: number;
      getPage(n: number): Promise<{ getTextContent(): Promise<{ items: { str?: string }[] }> }>;
    }>;
  };
}
interface Mammoth {
  extractRawText(input: { arrayBuffer: ArrayBuffer }): Promise<{ value: string }>;
}
interface SheetJs {
  read(data: ArrayBuffer, opts: { type: 'array' }): { SheetNames: string[]; Sheets: Record<string, unknown> };
  utils: { sheet_to_csv(sheet: unknown): string };
}
interface JsZipInstance {
  loadAsync(data: ArrayBuffer): Promise<{ files: Record<string, { async(type: 'string'): Promise<string> }> }>;
}
type JsZipCtor = new () => JsZipInstance;

async function lib<K extends 'pdfjsLib' | 'mammoth' | 'XLSX' | 'JSZip'>(name: K, src: string): Promise<LibTypes[K]> {
  return loadGlobal<LibTypes[K]>(name, src);
}

interface LibTypes {
  pdfjsLib: PdfJs;
  mammoth: Mammoth;
  XLSX: SheetJs;
  JSZip: JsZipCtor;
}

export function fileExtension(name: string): string {
  return (name.split('.').pop() ?? '').toLowerCase();
}

export function fileIcon(extension: string): string {
  const icons: Record<string, string> = {
    PDF: '📄',
    DOC: '📝',
    DOCX: '📝',
    XLS: '📊',
    XLSX: '📊',
    PPT: '📽️',
    PPTX: '📽️',
    TXT: '📃',
    CSV: '📋',
  };
  return icons[extension.toUpperCase()] || '📎';
}

async function textFromPdf(file: File): Promise<string> {
  const pdfjs = await lib('pdfjsLib', PDFJS);
  pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  let fullText = '';
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const content = await page.getTextContent();
    fullText += content.items.map((item) => item.str ?? '').join(' ') + '\n\n';
  }
  return fullText.trim();
}

async function textFromDocx(file: File): Promise<string> {
  const mammoth = await lib('mammoth', MAMMOTH_SRC);
  return (await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })).value;
}

async function textFromExcel(file: File): Promise<string> {
  const XLSX = await lib('XLSX', XLSX_LIB);
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  let fullText = '';
  for (const sheetName of workbook.SheetNames) {
    fullText += `Hoja: ${sheetName}\n${XLSX.utils.sheet_to_csv(workbook.Sheets[sheetName])}\n\n`;
  }
  return fullText.trim();
}

async function textFromPpt(file: File): Promise<string> {
  const JSZip = await lib('JSZip', JSZIP);
  try {
    const content = await new JSZip().loadAsync(await file.arrayBuffer());
    let fullText = '';
    for (const name of Object.keys(content.files).filter((n) => /ppt\/slides\/slide\d+\.xml$/.test(n))) {
      const xml = await content.files[name]!.async('string');
      fullText += xml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() + '\n\n';
    }
    return fullText.trim() || 'No se pudo extraer texto del PPT';
  } catch {
    throw new Error('Error extrayendo texto de PPT. Intenta convertir a PDF primero.');
  }
}

/** El texto de un archivo adjunto, según su extensión. */
export function extractText(file: File, extension: string): Promise<string> {
  switch (extension) {
    case 'txt':
    case 'csv':
      return file.text();
    case 'pdf':
      return textFromPdf(file);
    case 'docx':
      return textFromDocx(file);
    case 'xlsx':
    case 'xls':
      return textFromExcel(file);
    case 'pptx':
    case 'ppt':
      return textFromPpt(file);
    default:
      return Promise.reject(new Error(`Formato no soportado: ${extension}`));
  }
}
