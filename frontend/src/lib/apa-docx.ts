// Formato APA 7 de documentos DOCX, todo en el navegador (migración de
// public/js/processors/docxReader.js y docxWriter.js).
//
// 1. readDocx: mammoth convierte el DOCX a HTML y de ahí se sacan párrafos
//    (con negrita/cursiva), tablas e imágenes.
// 2. buildApaDocx: con la librería docx (v8) se escribe un documento nuevo con
//    portada, márgenes de 2.54 cm, Times New Roman 12, interlineado doble,
//    sangrías y número de página.
//
// mammoth y docx son las mismas versiones UMD que cargaba apa.html; se
// descargan la primera vez que se formatea un documento.

import { MAMMOTH_SRC, loadGlobal } from './cdn';

const DOCX_SRC = 'https://cdn.jsdelivr.net/npm/docx@8.5.0/build/index.umd.min.js';

interface Mammoth {
  convertToHtml(input: { arrayBuffer: ArrayBuffer }): Promise<{ value: string; messages: unknown[] }>;
}

// Lo que se usa de la librería docx. Sus constructores reciben objetos de
// opciones que se pasan tal cual.
type DocxNode = object;
type DocxCtor = new (options: object) => DocxNode;
interface DocxLib {
  Document: DocxCtor;
  Paragraph: DocxCtor;
  TextRun: DocxCtor;
  Header: DocxCtor;
  Footer: DocxCtor;
  Table: DocxCtor;
  TableRow: DocxCtor;
  TableCell: DocxCtor;
  ImageRun: DocxCtor;
  AlignmentType: Record<'LEFT' | 'CENTER' | 'RIGHT', string>;
  BorderStyle: Record<'SINGLE' | 'NONE', string>;
  WidthType: Record<'PERCENTAGE', string>;
  PageNumber: Record<'CURRENT', string>;
  Packer: { toBlob(doc: DocxNode): Promise<Blob> };
}

// ── Lectura ───────────────────────────────────────────────────────────────

interface Run {
  text: string;
  bold: boolean;
  italic: boolean;
}

export interface DocParagraph {
  type: 'body' | 'heading' | 'reference';
  level: number;
  text: string;
  isBold: boolean;
  isItalic: boolean;
}

interface DocCell {
  text: string;
  isHeader: boolean;
}

interface DocImage {
  src: string;
  width: number;
  height: number;
}

export interface DocContent {
  paragraphs: DocParagraph[];
  tables: DocCell[][][];
  images: DocImage[];
}

const HEADING_TAGS: Record<string, number> = { h1: 1, h2: 2, h3: 3, h4: 4, h5: 5, h6: 6 };

/** Fragmentos de texto con su formato, recorriendo el formato inline de mammoth. */
function runsOf(el: Element): Run[] {
  const runs: Run[] = [];
  const walk = (node: Node, bold: boolean, italic: boolean) => {
    if (node.nodeType === Node.TEXT_NODE) {
      if (node.textContent) runs.push({ text: node.textContent, bold, italic });
      return;
    }
    if (!(node instanceof Element)) return;
    const tag = node.tagName.toLowerCase();
    // <br> pasa a espacio para no pegar las palabras.
    if (tag === 'br') {
      runs.push({ text: ' ', bold, italic });
      return;
    }
    const b = bold || tag === 'strong' || tag === 'b';
    const i = italic || tag === 'em' || tag === 'i';
    node.childNodes.forEach((child) => walk(child, b, i));
  };
  // Los títulos son negrita implícita.
  const rootBold = el.tagName.toLowerCase() in HEADING_TAGS;
  el.childNodes.forEach((child) => walk(child, rootBold, false));
  return runs;
}

function headingLevel(el: Element): number {
  const byTag = HEADING_TAGS[el.tagName.toLowerCase()];
  if (byTag) return byTag;
  // Clases que mammoth puede poner en un <p>.
  for (let level = 1; level <= 5; level++) {
    if (el.classList.contains(`Heading${level}`) || el.classList.contains(`heading-${level}`)) return level;
  }
  return 0;
}

const REFERENCE_PATTERN = /^[A-Z][a-záéíóúü]+,\s+[A-Z]\.\s+\(\d{4}\)/i;

function paragraphsOf(doc: Document): DocParagraph[] {
  const paragraphs: DocParagraph[] = [];
  doc.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li').forEach((el) => {
    // El texto de las celdas va con su tabla, no como párrafos sueltos.
    if (el.closest('table')) return;
    const runs = runsOf(el);
    const text = runs.map((r) => r.text).join('');
    if (!text.trim()) return;
    const level = headingLevel(el);
    paragraphs.push({
      type: level > 0 ? 'heading' : REFERENCE_PATTERN.test(text.trim()) ? 'reference' : 'body',
      level,
      text,
      isBold: runs.some((r) => r.bold),
      isItalic: runs.length > 0 && runs.every((r) => r.italic),
    });
  });
  return paragraphs;
}

function tablesOf(doc: Document): DocCell[][][] {
  return Array.from(doc.querySelectorAll('table')).map((table) =>
    Array.from(table.querySelectorAll('tr')).map((tr) =>
      Array.from(tr.querySelectorAll('td, th')).map((td) => ({ text: td.textContent ?? '', isHeader: td.tagName === 'TH' })),
    ),
  );
}

function imagesOf(doc: Document): DocImage[] {
  return Array.from(doc.querySelectorAll('img')).map((img) => ({ src: img.src, width: img.width, height: img.height }));
}

export async function readDocx(file: File): Promise<DocContent> {
  if (!file.name.toLowerCase().endsWith('.docx')) throw new Error('El archivo debe ser un documento .DOCX.');
  const mammoth = await loadGlobal<Mammoth>('mammoth', MAMMOTH_SRC);
  try {
    const result = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
    if (result.messages.length) console.warn('[APA] Advertencias al leer el DOCX:', result.messages);
    const doc = new DOMParser().parseFromString(result.value, 'text/html');
    return { paragraphs: paragraphsOf(doc), tables: tablesOf(doc), images: imagesOf(doc) };
  } catch (error) {
    throw new Error(`Error al procesar el archivo: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// ── Escritura ─────────────────────────────────────────────────────────────

export interface TitlePage {
  title: string;
  author: string;
  affiliation: string;
  course: string;
  instructor: string;
  date: string;
}

const FONT = 'Times New Roman';
const SIZE = 24; // medios puntos: 12 pt
const DOUBLE = 480; // interlineado doble
const HALF_INCH = 720; // 0.5" = 1.27 cm en twips
const INCH = 1440; // 1" = 2.54 cm

export async function buildApaDocx(content: DocContent, meta: TitlePage): Promise<Blob> {
  const d = await loadGlobal<DocxLib>('docx', DOCX_SRC);

  const run = (text: string, extra: object = {}) => new d.TextRun({ text, font: FONT, size: SIZE, ...extra });
  const blankLine = () => new d.Paragraph({ spacing: { before: 0, after: 0, line: DOUBLE }, children: [] });
  const centered = (text: string) =>
    new d.Paragraph({ alignment: d.AlignmentType.CENTER, spacing: { before: 200, after: 200, line: DOUBLE }, children: [run(text)] });

  // Portada: unas líneas en blanco para bajarla, título en negrita y datos.
  const titlePage: DocxNode[] = Array.from({ length: 5 }, blankLine);
  if (meta.title) {
    titlePage.push(
      new d.Paragraph({ alignment: d.AlignmentType.CENTER, spacing: { before: 0, after: 200, line: DOUBLE }, children: [run(meta.title, { bold: true })] }),
    );
  }
  for (const line of [meta.author, meta.affiliation, meta.course, meta.instructor, meta.date]) {
    if (line) titlePage.push(centered(line));
  }
  titlePage.push(blankLine(), blankLine());

  // Cuerpo: sangría de primera línea en el texto, francesa en las referencias
  // y el título de nivel 1 centrado.
  const body: DocxNode[] = content.paragraphs.map((p) => {
    const heading = p.type === 'heading';
    const indent = p.type === 'body' ? { firstLine: HALF_INCH } : p.type === 'reference' ? { hanging: HALF_INCH } : undefined;
    return new d.Paragraph({
      alignment: heading && p.level === 1 ? d.AlignmentType.CENTER : d.AlignmentType.LEFT,
      spacing: { before: heading ? 240 : 0, after: heading ? 120 : 0, line: DOUBLE },
      ...(indent ? { indent } : {}),
      children: [run(p.text, { bold: p.isBold, italics: p.isItalic })],
    });
  });

  for (const rows of content.tables) {
    body.push(
      new d.Table({
        width: { size: 100, type: d.WidthType.PERCENTAGE },
        rows: rows.map(
          (cells) =>
            new d.TableRow({
              children: cells.map(
                (cell) =>
                  new d.TableCell({
                    children: [
                      new d.Paragraph({
                        alignment: d.AlignmentType.LEFT,
                        // Tablas a 10 pt.
                        children: [new d.TextRun({ text: cell.text, size: 20, bold: cell.isHeader, font: FONT })],
                      }),
                    ],
                    borders: {
                      top: { style: cell.isHeader ? d.BorderStyle.SINGLE : d.BorderStyle.NONE, size: 1 },
                      bottom: { style: d.BorderStyle.SINGLE, size: 1 },
                      left: { style: d.BorderStyle.NONE, size: 0 },
                      right: { style: d.BorderStyle.NONE, size: 0 },
                    },
                  }),
              ),
            }),
        ),
      }),
    );
  }

  for (const img of content.images) {
    if (!img.src) continue;
    body.push(
      new d.Paragraph({
        alignment: d.AlignmentType.CENTER,
        children: [new d.ImageRun({ data: dataUriBytes(img.src), transformation: { width: img.width || 400, height: img.height || 300 } })],
      }),
    );
  }

  const doc = new d.Document({
    sections: [
      {
        properties: { page: { margin: { top: INCH, right: INCH, bottom: INCH, left: INCH } } },
        // Número de página arriba a la derecha.
        headers: {
          default: new d.Header({
            children: [new d.Paragraph({ alignment: d.AlignmentType.RIGHT, children: [new d.TextRun({ children: [d.PageNumber.CURRENT], font: FONT, size: SIZE })] })],
          }),
        },
        footers: { default: new d.Footer({ children: [] }) },
        children: [...titlePage, ...body],
      },
    ],
    styles: { default: { document: { run: { font: FONT, size: SIZE } } } },
  });

  return d.Packer.toBlob(doc);
}

/** Las imágenes de mammoth llegan como data URI; docx quiere los bytes. */
function dataUriBytes(src: string): Uint8Array | string {
  if (!src.startsWith('data:')) return src;
  const binary = atob(src.split(',')[1] ?? '');
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}
