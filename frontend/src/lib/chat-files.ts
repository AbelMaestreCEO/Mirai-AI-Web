// Adjuntos del chat: extracción del texto de cada archivo en el navegador.
//
// Las librerías (pdf.js, mammoth, SheetJS, JSZip) son las mismas versiones que
// cargaba chat.html desde cdnjs, pero ahora solo se descargan la primera vez
// que se adjunta un archivo de ese tipo.

import { MAMMOTH_SRC, XLSX_SRC, loadGlobal, type SheetJs } from './cdn';

export const MAX_FILE_SIZE = 10 * 1024 * 1024;
/** Las imágenes no se leen aquí: las ve el modelo (deepseek-flash). Ver prepareImage. */
export const IMAGE_FORMATS = ['jpg', 'jpeg', 'png', 'webp', 'gif'];
export const SUPPORTED_FORMATS = ['txt', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'csv', ...IMAGE_FORMATS];
export const FILE_ACCEPT = SUPPORTED_FORMATS.map((f) => `.${f}`).join(',');
/** Cuántas imágenes admite un mensaje (MAX_CHAT_IMAGES del Worker). */
export const MAX_CHAT_IMAGES = 4;

/**
 * DeepSeek reduce cada imagen a una superficie de unos 1300×1300 antes de
 * mirarla, así que se reduce aquí y se sube ya en JPEG: una foto del móvil de
 * 4 MB pasa a unos cientos de KB sin perder nada de lo que el modelo ve. Lo
 * transparente de un PNG se pinta sobre blanco (en JPEG saldría negro, justo
 * donde suele estar el texto oscuro de una captura).
 */
export async function prepareImage(file: Blob): Promise<Blob> {
  const MAX_PIXELS = 1300 * 1300;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error('No se ha podido abrir la imagen');
  }
  try {
    const scale = Math.min(1, Math.sqrt(MAX_PIXELS / (bitmap.width * bitmap.height)));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No se ha podido preparar la imagen');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    if (!blob) throw new Error('No se ha podido preparar la imagen');
    return blob;
  } finally {
    bitmap.close();
  }
}

const CDN = 'https://cdnjs.cloudflare.com/ajax/libs';
const PDFJS = `${CDN}/pdf.js/3.11.174/pdf.min.js`;
const PDFJS_WORKER = `${CDN}/pdf.js/3.11.174/pdf.worker.min.js`;
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
    JPG: '🖼️',
    JPEG: '🖼️',
    PNG: '🖼️',
    WEBP: '🖼️',
    GIF: '🖼️',
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
  const XLSX = await lib('XLSX', XLSX_SRC);
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
