/* ============================================================
   invoice-pdf.js — Generación de facturas PDF para el módulo de Ventas
   Usa pdf-lib (pura JS, sin dependencias de Node) para poder correr
   dentro del runtime de Cloudflare Workers.
   ============================================================ */
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const PAGE_WIDTH = 595.28;  // A4 en puntos
const PAGE_HEIGHT = 841.89;
const MARGIN = 40;

const ACCENT = rgb(0.404, 0.314, 0.643);
const TEXT_DARK = rgb(0.12, 0.12, 0.14);
const TEXT_GRAY = rgb(0.45, 0.45, 0.48);
const LINE_GRAY = rgb(0.85, 0.85, 0.87);

/**
 * Extrae el PNG embebido de un .ico que contiene una sola imagen PNG
 * (formato usado por navegadores modernos para favicons de alta resolución).
 * Devuelve null si el ico no tiene el formato esperado.
 */
export function extractPngFromIco(icoBytes) {
  try {
    const view = new DataView(icoBytes.buffer, icoBytes.byteOffset, icoBytes.byteLength);
    const count = view.getUint16(4, true);
    if (!count) return null;

    let best = null;
    for (let i = 0; i < count; i++) {
      const entryOffset = 6 + i * 16;
      const bytesInRes = view.getUint32(entryOffset + 8, true);
      const imageOffset = view.getUint32(entryOffset + 12, true);
      if (!best || bytesInRes > best.bytesInRes) best = { bytesInRes, imageOffset };
    }
    if (!best) return null;

    const png = icoBytes.slice(best.imageOffset, best.imageOffset + best.bytesInRes);
    const isPng = png[0] === 0x89 && png[1] === 0x50 && png[2] === 0x4e && png[3] === 0x47;
    return isPng ? png : null;
  } catch {
    return null;
  }
}

function drawWrappedText(page, text, x, y, maxWidth, size, font, color, lineHeight) {
  const words = text.split(' ');
  let line = '';
  let cursorY = y;
  for (const word of words) {
    const testLine = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(testLine, size) > maxWidth && line) {
      page.drawText(line, { x, y: cursorY, size, font, color });
      line = word;
      cursorY -= lineHeight;
    } else {
      line = testLine;
    }
  }
  if (line) page.drawText(line, { x, y: cursorY, size, font, color });
  return cursorY;
}

/**
 * Genera el PDF de una factura de venta.
 * @returns {Promise<Uint8Array>}
 */
export async function generateInvoicePdf({
  invoiceNumber, transactionId, createdAt,
  sellerName, sellerDni,
  buyer,          // { first_name, last_name, cedula, phone, has_account }
  product,        // { name, unit_price, quantity }
  subtotal, taxAmount, total,
  logoPngBytes,          // logo de Mirai AI (extraído del favicon)
  companyLogoPngBytes,   // logo de Aberu & Mirai
  productImageBytes,
  productImageIsPng,
}) {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const dateStr = new Date(createdAt).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });

  let y = PAGE_HEIGHT - MARGIN;

  // ── Encabezado ──────────────────────────────────────────────
  let headerTextX = MARGIN;
  if (logoPngBytes) {
    try {
      const logo = await pdfDoc.embedPng(logoPngBytes);
      const dim = logo.scale(40 / logo.width);
      page.drawImage(logo, { x: MARGIN, y: y - dim.height, width: dim.width, height: dim.height });
      headerTextX = MARGIN + dim.width + 12;
    } catch { /* si falla el embed, seguimos sin logo */ }
  }
  page.drawText('Mirai AI Sales', { x: headerTextX, y: y - 16, size: 20, font: fontBold, color: ACCENT });
  page.drawText('Factura de Venta', { x: headerTextX, y: y - 34, size: 10, font: fontRegular, color: TEXT_GRAY });

  const metaX = PAGE_WIDTH - MARGIN - 190;
  page.drawText(`Factura N.º ${invoiceNumber}`, { x: metaX, y: y - 6, size: 11, font: fontBold, color: TEXT_DARK });
  page.drawText(`Fecha: ${dateStr}`, { x: metaX, y: y - 22, size: 9, font: fontRegular, color: TEXT_GRAY });
  page.drawText(`Ref: ${transactionId}`, { x: metaX, y: y - 36, size: 8, font: fontRegular, color: TEXT_GRAY });

  y -= 66;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y }, thickness: 1, color: LINE_GRAY });
  y -= 24;

  // ── Vendedor / Comprador ────────────────────────────────────
  const colWidth = (PAGE_WIDTH - MARGIN * 2 - 20) / 2;
  const col2X = MARGIN + colWidth + 20;

  page.drawText('VENDEDOR', { x: MARGIN, y, size: 9, font: fontBold, color: ACCENT });
  page.drawText('COMPRADOR', { x: col2X, y, size: 9, font: fontBold, color: ACCENT });
  y -= 16;

  page.drawText(sellerName || sellerDni, { x: MARGIN, y, size: 11, font: fontBold, color: TEXT_DARK });
  page.drawText(`${buyer.first_name} ${buyer.last_name}`, { x: col2X, y, size: 11, font: fontBold, color: TEXT_DARK });
  y -= 14;

  page.drawText(`Identificación: ${sellerDni}`, { x: MARGIN, y, size: 9, font: fontRegular, color: TEXT_GRAY });
  page.drawText(`Cédula: ${buyer.cedula}`, { x: col2X, y, size: 9, font: fontRegular, color: TEXT_GRAY });
  y -= 14;

  if (buyer.phone) {
    page.drawText(`Teléfono: ${buyer.phone}`, { x: col2X, y, size: 9, font: fontRegular, color: TEXT_GRAY });
    y -= 14;
  }
  page.drawText(`Cuenta en Mirai AI: ${buyer.has_account ? 'Sí' : 'No'}`, { x: col2X, y, size: 9, font: fontRegular, color: TEXT_GRAY });

  y -= 32;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y }, thickness: 1, color: LINE_GRAY });
  y -= 24;

  // ── Tabla de artículo ───────────────────────────────────────
  const colImgX = MARGIN, colImgW = 55;
  const colNameX = colImgX + colImgW + 10, colNameW = 190;
  const colQtyX = colNameX + colNameW, colQtyW = 45;
  const colPriceX = colQtyX + colQtyW, colPriceW = 85;
  const colSubtotalX = colPriceX + colPriceW;

  page.drawRectangle({ x: MARGIN, y: y - 6, width: PAGE_WIDTH - MARGIN * 2, height: 22, color: rgb(0.96, 0.95, 0.98) });
  page.drawText('Imagen', { x: colImgX + 5, y: y, size: 9, font: fontBold, color: TEXT_DARK });
  page.drawText('Producto', { x: colNameX, y: y, size: 9, font: fontBold, color: TEXT_DARK });
  page.drawText('Cant.', { x: colQtyX, y: y, size: 9, font: fontBold, color: TEXT_DARK });
  page.drawText('Precio Unit.', { x: colPriceX, y: y, size: 9, font: fontBold, color: TEXT_DARK });
  page.drawText('Subtotal', { x: colSubtotalX, y: y, size: 9, font: fontBold, color: TEXT_DARK });

  y -= 12;
  const rowHeight = 64;
  const rowTop = y;

  if (productImageBytes) {
    try {
      const img = productImageIsPng ? await pdfDoc.embedPng(productImageBytes) : await pdfDoc.embedJpg(productImageBytes);
      const dim = img.scaleToFit(colImgW - 10, rowHeight - 14);
      page.drawImage(img, { x: colImgX + 5, y: rowTop - dim.height - 6, width: dim.width, height: dim.height });
    } catch { /* si falla el embed de la imagen del producto, se omite */ }
  }

  const rowTextY = rowTop - rowHeight / 2;
  const productName = product.name.length > 32 ? `${product.name.slice(0, 32)}…` : product.name;
  page.drawText(productName, { x: colNameX, y: rowTextY, size: 10, font: fontRegular, color: TEXT_DARK });
  page.drawText(String(product.quantity), { x: colQtyX, y: rowTextY, size: 10, font: fontRegular, color: TEXT_DARK });
  page.drawText(`$${product.unit_price.toFixed(2)}`, { x: colPriceX, y: rowTextY, size: 10, font: fontRegular, color: TEXT_DARK });
  page.drawText(`$${(product.unit_price * product.quantity).toFixed(2)}`, { x: colSubtotalX, y: rowTextY, size: 10, font: fontRegular, color: TEXT_DARK });

  y = rowTop - rowHeight;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y }, thickness: 1, color: LINE_GRAY });

  // ── Totales ─────────────────────────────────────────────────
  y -= 22;
  const totalsLabelX = PAGE_WIDTH - MARGIN - 200;

  function totalRow(label, value, bold) {
    const size = bold ? 12 : 10;
    const font = bold ? fontBold : fontRegular;
    const color = bold ? ACCENT : TEXT_DARK;
    page.drawText(label, { x: totalsLabelX, y, size, font: bold ? fontBold : fontRegular, color: bold ? TEXT_DARK : TEXT_GRAY });
    const valueWidth = font.widthOfTextAtSize(value, size);
    page.drawText(value, { x: PAGE_WIDTH - MARGIN - valueWidth, y, size, font, color });
    y -= bold ? 20 : 16;
  }

  totalRow('Subtotal', `$${subtotal.toFixed(2)}`, false);
  totalRow('IVA (16%)', `$${taxAmount.toFixed(2)}`, false);
  y -= 2;
  page.drawLine({ start: { x: totalsLabelX, y: y + 12 }, end: { x: PAGE_WIDTH - MARGIN, y: y + 12 }, thickness: 1, color: rgb(0.75, 0.75, 0.8) });
  totalRow('MONTO TOTAL', `$${total.toFixed(2)}`, true);

  // ── Pie de página: legitimidad ──────────────────────────────
  const footerTop = 120;
  page.drawLine({ start: { x: MARGIN, y: footerTop }, end: { x: PAGE_WIDTH - MARGIN, y: footerTop }, thickness: 1, color: LINE_GRAY });

  let footerTextX = MARGIN;
  let footerY = footerTop - 26;
  if (companyLogoPngBytes) {
    try {
      const companyLogo = await pdfDoc.embedPng(companyLogoPngBytes);
      const dim = companyLogo.scale(26 / companyLogo.width);
      page.drawImage(companyLogo, { x: MARGIN, y: footerTop - 32, width: dim.width, height: dim.height });
      footerTextX = MARGIN + dim.width + 10;
    } catch { /* sin logo de empresa si falla el embed */ }
  }
  page.drawText('Aberu & Mirai Company', { x: footerTextX, y: footerTop - 22, size: 11, font: fontBold, color: TEXT_DARK });

  const legitText = `Esta factura fue generada electrónicamente por el sistema Mirai AI Sales, propiedad de Aberu & Mirai Company, y constituye un comprobante válido de la transacción de venta descrita anteriormente. Folio único: ${invoiceNumber} · Referencia de transacción: ${transactionId}. Documento emitido automáticamente el ${dateStr} y almacenado de forma segura para su verificación.`;
  drawWrappedText(page, legitText, MARGIN, footerTop - 42, PAGE_WIDTH - MARGIN * 2, 7.5, fontRegular, TEXT_GRAY, 11);

  return pdfDoc.save();
}
