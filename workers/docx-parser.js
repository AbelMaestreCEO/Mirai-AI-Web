// ============================================
// docx-parser.js - Manipulación de Documentos DOCX
// ============================================
// Estrategia correcta: operar sobre <w:r> completos, NO sobre <w:t> aislados.
//
// Un run OOXML tiene esta estructura:
//   <w:r>
//     <w:rPr>          ← propiedades opcionales (fuente, tamaño, color…)
//       <w:b/>         ← negrita
//       <w:i/>         ← cursiva
//       <w:u …/>       ← subrayado
//     </w:rPr>
//     <w:t>texto</w:t> ← contenido
//   </w:r>
//
// Para formatear una coincidencia:
//   1. Localizamos el <w:r> que la contiene.
//   2. Extraemos su <w:rPr> original (para heredar fuente/tamaño/color).
//   3. Dividimos en ≤3 runs: [antes] [coincidencia con estilos nuevos] [después].
//   4. Los runs "antes" y "después" conservan el <w:rPr> original.
//   5. El run de la coincidencia fusiona el <w:rPr> original + los estilos nuevos.

import { unzipSync, zipSync } from 'fflate';

// ============================================
// 1. Descompresión / Compresión
// ============================================

export const decompressDocx = (docxBuffer) => {
  const buffer = docxBuffer instanceof Uint8Array
    ? docxBuffer
    : new Uint8Array(docxBuffer);

  const unzipped = unzipSync(buffer);
  const files = new Map();
  for (const [path, data] of Object.entries(unzipped)) {
    files.set(path, data);
  }

  const required = [
    '[Content_Types].xml',
    '_rels/.rels',
    'word/document.xml',
    'word/_rels/document.xml.rels'
  ];
  for (const f of required) {
    if (!files.has(f)) throw new Error(`Archivo DOCX inválido: falta "${f}"`);
  }
  return files;
};

export const extractDocumentXml = (files) => {
  const raw = files.get('word/document.xml');
  if (!raw) throw new Error('No se encontró word/document.xml');
  return new TextDecoder('utf-8').decode(raw);
};

export const xmlToUint8Array = (xmlString) =>
  new TextEncoder().encode(xmlString);

// ============================================
// 2. Helpers XML
// ============================================

function escapeXml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Fusiona el <w:rPr> original del run con los estilos nuevos.
 * Devuelve el bloque <w:rPr>…</w:rPr> completo listo para insertar.
 */
export const buildRunProperties = (originalRpr, styles) => {
  let inner = '';
  if (originalRpr) {
    const m = originalRpr.match(/^<w:rPr>([\s\S]*)<\/w:rPr>$/);
    inner = m ? m[1] : '';
  }

  if (styles.bold && !/<w:b[\s/>]/.test(inner)) {
    inner += '<w:b/><w:bCs/>';
  }
  if (styles.italic && !/<w:i[\s/>]/.test(inner)) {
    inner += '<w:i/><w:iCs/>';
  }
  if (styles.underline && !/<w:u[\s/>]/.test(inner)) {
    inner += '<w:u w:val="single"/>';
  }

  return `<w:rPr>${inner}</w:rPr>`;
};

/**
 * Construye un <w:r> completo con el bloque rPr y el texto indicados.
 * Agrega xml:space="preserve" cuando el texto tiene espacios en extremos.
 */
function buildRun(rPrBlock, text) {
  const needsPreserve = /^\s|\s$/.test(text);
  const tAttr = needsPreserve ? ' xml:space="preserve"' : '';
  return `<w:r>${rPrBlock}<w:t${tAttr}>${escapeXml(text)}</w:t></w:r>`;
}

// ============================================
// 3. Extracción de runs con posiciones
// ============================================

/**
 * Devuelve todos los <w:r>…</w:r> del XML con:
 *   start / end  → posiciones absolutas en la cadena XML
 *   rPr          → bloque <w:rPr>…</w:rPr> completo (o '' si no había)
 *   text         → texto plano del <w:t>
 *   raw          → cadena completa del run
 *
 * Se omiten runs sin <w:t> (bookmarks, proofErr, instrText…).
 */
function extractRuns(xmlContent) {
  const runs = [];
  const runRe = /<w:r(?:\s[^>]*)?>[\s\S]*?<\/w:r>/g;
  let m;

  while ((m = runRe.exec(xmlContent)) !== null) {
    const raw   = m[0];
    const start = m.index;
    const end   = start + raw.length;

    // <w:rPr>…</w:rPr> (opcional)
    const rPrM = raw.match(/<w:rPr>[\s\S]*?<\/w:rPr>/);
    const rPr  = rPrM ? rPrM[0] : '';

    // <w:t …>texto</w:t>  — ignorar runs sin w:t
    const tM = raw.match(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/);
    if (!tM) continue;

    runs.push({ start, end, rPr, text: tM[1], raw });
  }

  return runs;
}

// ============================================
// 4. Procesamiento principal
// ============================================

export const processDocument = (xmlContent, rules) => {
  let totalMatches = 0;
  const errors = [];

  const runs = extractRuns(xmlContent);

  // hitsByRun: índice de run → array de coincidencias
  const hitsByRun = new Map();

  for (const rule of rules) {
    const {
      keyword,
      style_bold,
      style_italic,
      style_underline,
      match_whole_word = 1,
      case_sensitive = 0
    } = rule;

    if (!keyword || keyword.trim().length === 0) continue;

    const styles = {
      bold:      style_bold      === true || style_bold      === 1,
      italic:    style_italic    === true || style_italic    === 1,
      underline: style_underline === true || style_underline === 1
    };

    if (!styles.bold && !styles.italic && !styles.underline) {
      errors.push({ keyword, error: 'Se requiere al menos un estilo.' });
      continue;
    }

    const needle   = case_sensitive ? keyword.trim() : keyword.trim().toLowerCase();
    const wordChar = /[a-zA-Z0-9áéíóúÁÉÍÓÚàèìòùÀÈÌÒÙñÑüÜ]/;

    for (let ri = 0; ri < runs.length; ri++) {
      const run      = runs[ri];
      const haystack = case_sensitive ? run.text : run.text.toLowerCase();

      let pos = 0;
      while (pos < haystack.length) {
        const idx = haystack.indexOf(needle, pos);
        if (idx === -1) break;

        // Límite de palabra
        if (match_whole_word === 1 || match_whole_word === true) {
          const before = idx > 0 ? haystack[idx - 1] : ' ';
          const after  = idx + needle.length < haystack.length
            ? haystack[idx + needle.length]
            : ' ';
          if (wordChar.test(before) || wordChar.test(after)) {
            pos = idx + 1;
            continue;
          }
        }

        if (!hitsByRun.has(ri)) hitsByRun.set(ri, []);
        hitsByRun.get(ri).push({
          textStart:   idx,
          textEnd:     idx + needle.length,
          matchedText: run.text.substring(idx, idx + needle.length),
          styles
        });

        totalMatches++;
        pos = idx + needle.length;
      }
    }
  }

  if (hitsByRun.size === 0) {
    return { xml: xmlContent, matches: 0, errors };
  }

  // Procesar de atrás hacia adelante para no desplazar índices
  let result  = xmlContent;
  const idxList = Array.from(hitsByRun.keys()).sort((a, b) => b - a);

  for (const ri of idxList) {
    const run  = runs[ri];
    const hits = hitsByRun.get(ri).sort((a, b) => a.textStart - b.textStart);

    let replacement = '';
    let cursor = 0;

    for (const hit of hits) {
      // Fragmento ANTES del hit → conserva rPr original
      if (hit.textStart > cursor) {
        replacement += buildRun(run.rPr, run.text.substring(cursor, hit.textStart));
      }

      // Fragmento del HIT → rPr original + estilos nuevos
      const newRpr = buildRunProperties(run.rPr, hit.styles);
      replacement += buildRun(newRpr, hit.matchedText);

      cursor = hit.textEnd;
    }

    // Fragmento DESPUÉS del último hit → conserva rPr original
    if (cursor < run.text.length) {
      replacement += buildRun(run.rPr, run.text.substring(cursor));
    }

    result =
      result.substring(0, run.start) +
      replacement +
      result.substring(run.end);
  }

  return { xml: result, matches: totalMatches, errors };
};

// ============================================
// 5. Reconstrucción del DOCX
// ============================================

export const recompressDocx = (files, modifiedXml) => {
  const updated = new Map(files);
  updated.set('word/document.xml', xmlToUint8Array(modifiedXml));

  const obj = {};
  for (const [path, data] of updated) obj[path] = data;

  return zipSync(obj, { level: 6 });
};

// ============================================
// 6. Función pública principal
// ============================================

export const processDocxFile = async (docxBuffer, rules) => {
  const t0 = performance.now();

  const files      = decompressDocx(docxBuffer);
  const xmlContent = extractDocumentXml(files);
  const { xml: modifiedXml, matches, errors } = processDocument(xmlContent, rules);
  const modifiedBuffer = recompressDocx(files, modifiedXml);

  const blob = new Blob([modifiedBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  });

  const duration = performance.now() - t0;
  console.log(`[DocxParser] ${duration.toFixed(1)}ms · ${matches} coincidencia(s)`);

  return { blob, matches, errors, duration };
};

// ============================================
// 7. Validación
// ============================================

export const isValidDocx = (buffer) => {
  try {
    const b = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    return (
      b.length >= 4 &&
      b[0] === 0x50 && b[1] === 0x4B &&
      b[2] === 0x03 && b[3] === 0x04
    );
  } catch {
    return false;
  }
};

export const getDocxMetadata = async (docxBuffer) => {
  try {
    const files  = decompressDocx(docxBuffer);
    const xml    = extractDocumentXml(files);
    const tNodes = xml.match(/<w:t[^>]*>([^<]*)<\/w:t>/gi) || [];
    const text   = tNodes.map(n => n.replace(/<[^>]+>/g, '')).join(' ');
    return {
      fileNameCount: files.size,
      hasImages: Array.from(files.keys()).some(p => p.startsWith('word/media/')),
      wordCount: text.trim().split(/\s+/).filter(w => w.length > 0).length
    };
  } catch {
    return { fileNameCount: 0, hasImages: false, wordCount: 0 };
  }
};

export default {
  decompressDocx,
  extractDocumentXml,
  xmlToUint8Array,
  buildRunProperties,
  processDocument,
  recompressDocx,
  processDocxFile,
  isValidDocx,
  getDocxMetadata
};