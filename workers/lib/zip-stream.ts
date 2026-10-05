/* ============================================
   MIRAI AI - ZIP en streaming
   CRC32 y cabeceras ZIP/ZIP64 para generar archivos sin tenerlos en memoria.
   ============================================ */

// CRC-32. Ocho tablas en vez de una: el ZIP unico pasa por aqui cada byte del
// archivo entero, y byte a byte el CRC era el que se comia el tiempo de CPU del
// Worker. "Slicing-by-8" procesa 8 bytes por vuelta con el mismo resultado.
const CRC_TABLES = (() => {
  const t0 = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t0[i] = c >>> 0;
  }
  const tables = [t0];
  for (let k = 1; k < 8; k++) {
    const prev = tables[k - 1];
    const cur = new Uint32Array(256);
    for (let i = 0; i < 256; i++) cur[i] = (t0[prev[i] & 0xFF] ^ (prev[i] >>> 8)) >>> 0;
    tables.push(cur);
  }
  return tables;
})();

const CRC_T0 = CRC_TABLES[0], CRC_T1 = CRC_TABLES[1], CRC_T2 = CRC_TABLES[2],
      CRC_T3 = CRC_TABLES[3], CRC_T4 = CRC_TABLES[4], CRC_T5 = CRC_TABLES[5],
      CRC_T6 = CRC_TABLES[6], CRC_T7 = CRC_TABLES[7];

/**
 * Acumula el CRC de un trozo. `crc` es el estado en curso (empieza en
 * 0xFFFFFFFF y se invierte al final), asi que se puede llamar trozo a trozo
 * sobre un stream sin tener el archivo entero en memoria.
 */
export function crc32Update(crc: number, buf: any) {
  let c = crc >>> 0;
  const n = buf.length;
  const n8 = n - (n % 8);
  let i = 0;

  while (i < n8) {
    c = (c ^ (buf[i] | (buf[i + 1] << 8) | (buf[i + 2] << 16) | (buf[i + 3] << 24))) >>> 0;
    c = (CRC_T7[c & 0xFF]
       ^ CRC_T6[(c >>> 8) & 0xFF]
       ^ CRC_T5[(c >>> 16) & 0xFF]
       ^ CRC_T4[(c >>> 24) & 0xFF]
       ^ CRC_T3[buf[i + 4]]
       ^ CRC_T2[buf[i + 5]]
       ^ CRC_T1[buf[i + 6]]
       ^ CRC_T0[buf[i + 7]]) >>> 0;
    i += 8;
  }
  for (; i < n; i++) c = (CRC_T0[(c ^ buf[i]) & 0xFF] ^ (c >>> 8)) >>> 0;
  return c >>> 0;
}

export function crc32(data: Uint8Array) {
  return (crc32Update(0xFFFFFFFF, data) ^ 0xFFFFFFFF) >>> 0;
}

// Centinela de ZIP64: un campo de 32 bits a todo unos significa "el valor de
// verdad esta en el registro extendido".
const ZIP64_SENTINEL = 0xFFFFFFFF;

// Bit 3 de los flags: las medidas del archivo no van en la cabecera local sino
// en un descriptor detras de los datos. Es lo que permite emitir el ZIP en
// streaming sin conocer el CRC por adelantado.
export const ZIP_FLAG_DATA_DESCRIPTOR = 0x08;

// Bit 11: los nombres van en UTF-8. Sin esto el descompresor los interpreta en
// CP437 y cualquier foto con ñ o tilde salia con el nombre destrozado
// ("mamá.jpg" -> "mamÃ¡.jpg"). Los nombres ya se codifican con TextEncoder, o
// sea UTF-8: solo faltaba decirlo.
const ZIP_FLAG_UTF8 = 0x0800;

/** Escribe un entero de 64 bits little-endian sin depender de BigInt. */
function writeUint64(view: DataView, offset: number, value: number) {
  view.setUint32(offset, value >>> 0, true);
  view.setUint32(offset + 4, Math.floor(value / 0x100000000), true);
}

export function buildLocalHeader(nameBytes: Uint8Array, crc: number, size: number, flags: number) {
  const out = new Uint8Array(30 + nameBytes.length);
  const v = new DataView(out.buffer);
  v.setUint32(0, 0x04034b50, true); // signature
  v.setUint16(4, 20, true);         // version needed
  v.setUint16(6, flags | ZIP_FLAG_UTF8, true);
  v.setUint16(8, 0, true);          // compression (stored)
  v.setUint16(10, 0, true);         // mod time
  v.setUint16(12, 0, true);         // mod date
  v.setUint32(14, crc, true);
  v.setUint32(18, size, true);      // compressed
  v.setUint32(22, size, true);      // uncompressed
  v.setUint16(26, nameBytes.length, true);
  v.setUint16(28, 0, true);         // extra len
  out.set(nameBytes, 30);
  return out;
}

/** Va detras de los datos cuando la cabecera local salio con las medidas a 0. */
export function buildDataDescriptor(crc: number, size: number) {
  const out = new Uint8Array(16);
  const v = new DataView(out.buffer);
  v.setUint32(0, 0x08074b50, true);
  v.setUint32(4, crc, true);
  v.setUint32(8, size, true);
  v.setUint32(12, size, true);
  return out;
}

export function buildCentralHeader(nameBytes: Uint8Array, crc: number, compSize: number, uncompSize: number, extAttr: number, localOffset: number, flags = 0) {
  // Ningun archivo suelto llega a 4 GB (el tope de subida son 25 MB), pero el
  // DESPLAZAMIENTO si se pasa en un ZIP unico de varios GB. En ese caso el
  // campo de 32 bits lleva el centinela y el valor real viaja en el extra
  // ZIP64; sin esto el indice del ZIP apuntaria a sitios equivocados y las
  // ultimas fotos saldrian corruptas.
  const needsZip64 = localOffset >= ZIP64_SENTINEL;
  const extraLen = needsZip64 ? 12 : 0;

  const central = new Uint8Array(46 + nameBytes.length + extraLen);
  const cv = new DataView(central.buffer);
  cv.setUint32(0, 0x02014b50, true); // signature
  cv.setUint16(4, needsZip64 ? 45 : 20, true); // version made by
  cv.setUint16(6, needsZip64 ? 45 : 20, true); // version needed
  cv.setUint16(8, flags | ZIP_FLAG_UTF8, true);
  cv.setUint16(10, 0, true); // compression
  cv.setUint16(12, 0, true); // mod time
  cv.setUint16(14, 0, true); // mod date
  cv.setUint32(16, crc, true);
  cv.setUint32(20, compSize, true);
  cv.setUint32(24, uncompSize, true);
  cv.setUint16(28, nameBytes.length, true);
  cv.setUint16(30, extraLen, true);
  cv.setUint16(32, 0, true); // comment len
  cv.setUint16(34, 0, true); // disk start
  cv.setUint16(36, 0, true); // internal attr
  cv.setUint32(38, extAttr, true); // external attr
  cv.setUint32(42, needsZip64 ? ZIP64_SENTINEL : localOffset, true);
  central.set(nameBytes, 46);

  if (needsZip64) {
    const eo = 46 + nameBytes.length;
    cv.setUint16(eo, 0x0001, true); // header id ZIP64
    cv.setUint16(eo + 2, 8, true);  // solo lleva el desplazamiento
    writeUint64(cv, eo + 4, localOffset);
  }
  return central;
}

/**
 * Cierre del ZIP. Devuelve una o tres piezas: si el archivo pasa de 4 GB o de
 * 65535 entradas hacen falta ademas el registro y el localizador ZIP64.
 */
export function buildEndOfCentralDirectory(entryCount: number, cdSize: number, cdStart: number) {
  const needsZip64 = entryCount >= 0xFFFF || cdSize >= ZIP64_SENTINEL || cdStart >= ZIP64_SENTINEL;
  const parts: any[] = [];

  if (needsZip64) {
    const rec = new Uint8Array(56);
    const rv = new DataView(rec.buffer);
    rv.setUint32(0, 0x06064b50, true);
    writeUint64(rv, 4, 44); // tamanio del registro sin contar los 12 primeros
    rv.setUint16(12, 45, true); // version made by
    rv.setUint16(14, 45, true); // version needed
    rv.setUint32(16, 0, true);  // disco
    rv.setUint32(20, 0, true);  // disco donde empieza el CD
    writeUint64(rv, 24, entryCount);
    writeUint64(rv, 32, entryCount);
    writeUint64(rv, 40, cdSize);
    writeUint64(rv, 48, cdStart);
    parts.push(rec);

    const loc = new Uint8Array(20);
    const lv = new DataView(loc.buffer);
    lv.setUint32(0, 0x07064b50, true);
    lv.setUint32(4, 0, true);
    writeUint64(lv, 8, cdStart + cdSize); // donde empieza el registro ZIP64
    lv.setUint32(16, 1, true);
    parts.push(loc);
  }

  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, needsZip64 ? 0xFFFF : entryCount, true);
  ev.setUint16(10, needsZip64 ? 0xFFFF : entryCount, true);
  ev.setUint32(12, needsZip64 ? ZIP64_SENTINEL : cdSize, true);
  ev.setUint32(16, needsZip64 ? ZIP64_SENTINEL : cdStart, true);
  ev.setUint16(20, 0, true);
  parts.push(eocd);

  return parts;
}
