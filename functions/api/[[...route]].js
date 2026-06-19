// functions/api/[[...route]].js
// Cloudflare Pages Functions - maneja /api/* cuando se despliega en Pages

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname;

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };

  // Preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (!path.startsWith('/api/')) {
    return new Response('Not Found', { status: 404 });
  }

  try {
    // Re-usar la misma lógica del worker
    // En Pages Functions, los bindings tienen los mismos nombres que en wrangler.toml
    const method = request.method;

    // Health
    if (path === '/api/health' && method === 'GET') {
      return json({ status: 'ok', service: 'Mirai APA Backend' }, 200, corsHeaders);
    }

    // Mirror: process images
    if (path === '/api/process' && method === 'POST') {
      return await handleProcessImages(request, corsHeaders);
    }

    // Upload
    if (path === '/api/upload' && method === 'POST') {
      return await handleUpload(request, env, corsHeaders);
    }

    // Download
    if (path.startsWith('/api/download/') && method === 'GET') {
      const fileId = path.replace('/api/download/', '');
      return await handleDownload(fileId, env, corsHeaders);
    }

    // History
    if (path === '/api/history' && method === 'GET') {
      return await handleHistory(request, env, corsHeaders);
    }

    // Delete
    if (path.startsWith('/api/delete/') && method === 'DELETE') {
      const fileId = path.replace('/api/delete/', '');
      return await handleDelete(fileId, env, corsHeaders);
    }

    return json({ error: 'Not Found' }, 404, corsHeaders);

  } catch (error) {
    console.error('Function error:', error);
    // corsHeaders ya está en scope aquí — este era el bug original
    return json({ error: 'Internal Server Error', message: error.message }, 500, corsHeaders);
  }
}

// ─── Helpers ────────────────────────────────────────────────

function json(data, status = 200, corsHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

// ─── Handlers (duplicados aquí para Pages Functions) ────────

async function handleUpload(request, env, corsHeaders) {
  const formData = await request.formData();
  const file = formData.get('file');
  const metadataRaw = formData.get('metadata');

  if (!file) return json({ error: 'No file provided' }, 400, corsHeaders);
  if (!file.name.toLowerCase().endsWith('.docx')) {
    return json({ error: 'Invalid file type. Only .DOCX allowed.' }, 400, corsHeaders);
  }

  const MAX_SIZE = 25 * 1024 * 1024;
  if (file.size > MAX_SIZE) return json({ error: 'File too large. Maximum 25MB.' }, 413, corsHeaders);

  const fileId = crypto.randomUUID();
  const timestamp = new Date().toISOString();
  let metadata = {};
  try { metadata = JSON.parse(metadataRaw || '{}'); } catch (_) {}

  await env.R2_BUCKET.put(fileId, file.stream(), {
    httpMetadata: { contentType: file.type || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
    customMetadata: { originalName: file.name, uploadedAt: timestamp }
  });

  await env.DB
    .prepare('INSERT INTO files (id, original_name, file_type, size, uploaded_at, user_id, metadata_json) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(fileId, file.name, file.type, file.size, timestamp, metadata.userId || null, JSON.stringify(metadata))
    .run();

  return json({ success: true, fileId, downloadUrl: `/api/download/${fileId}`, fileName: file.name }, 200, corsHeaders);
}

async function handleDownload(fileId, env, corsHeaders) {
  if (!fileId) return json({ error: 'File ID required' }, 400, corsHeaders);
  const object = await env.R2_BUCKET.get(fileId);
  if (!object) return json({ error: 'File not found' }, 404, corsHeaders);

  const headers = new Headers(corsHeaders);
  object.writeHttpMetadata(headers);
  headers.set('Content-Disposition', `attachment; filename="${object.customMetadata?.originalName || 'documento.docx'}"`);
  headers.set('Cache-Control', 'no-cache');
  return new Response(object.body, { headers });
}

async function handleHistory(request, env, corsHeaders) {
  const url = new URL(request.url);
  const userId = url.searchParams.get('userId');
  const limit = parseInt(url.searchParams.get('limit') || '10');
  const offset = parseInt(url.searchParams.get('offset') || '0');

  let query, bindings;
  if (userId) {
    query = 'SELECT id, original_name, file_type, size, uploaded_at FROM files WHERE user_id = ? ORDER BY uploaded_at DESC LIMIT ? OFFSET ?';
    bindings = [userId, limit, offset];
  } else {
    query = 'SELECT id, original_name, file_type, size, uploaded_at FROM files ORDER BY uploaded_at DESC LIMIT ? OFFSET ?';
    bindings = [limit, offset];
  }

  const { results } = await env.DB.prepare(query).bind(...bindings).all();
  return json({ files: results.map(r => ({ ...r, downloadUrl: `/api/download/${r.id}` })) }, 200, corsHeaders);
}

async function handleDelete(fileId, env, corsHeaders) {
  if (!fileId) return json({ error: 'File ID required' }, 400, corsHeaders);
  await env.R2_BUCKET.delete(fileId);
  await env.DB.prepare('DELETE FROM files WHERE id = ?').bind(fileId).run();
  return json({ success: true, message: 'Archivo eliminado correctamente' }, 200, corsHeaders);
}

// ─── Mirror: Process Images ───────────────────────────────

async function handleProcessImages(request, corsHeaders) {
  const formData = await request.formData();
  const files = formData.getAll('images');

  if (!files.length) {
    return json({ error: 'No images provided' }, 400, corsHeaders);
  }

  const items = [];
  for (const file of files) {
    const buffer = await file.arrayBuffer();
    const date = extractImageDate(new Uint8Array(buffer), file.name, file.lastModified);
    items.push({ name: file.name, buffer: new Uint8Array(buffer), date });
  }

  items.sort((a, b) => a.date - b.date);

  const folders = {};
  for (const item of items) {
    const key = formatDateFolder(item.date);
    if (!folders[key]) folders[key] = [];
    folders[key].push(item);
  }

  const zipBytes = buildZip(folders);

  return new Response(zipBytes, {
    status: 200,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/zip',
      'Content-Disposition': 'attachment; filename="mirai-mirror.zip"'
    }
  });
}

function extractImageDate(bytes, filename, lastModified) {
  const exifDate = parseExifDate(bytes);
  if (exifDate) return exifDate;

  const fnDate = parseDateFromFilename(filename);
  if (fnDate) return fnDate;

  if (lastModified && lastModified > 0) return new Date(lastModified);

  return new Date();
}

// ─── EXIF Parser (minimal, JPEG only) ─────────────────────

function parseExifDate(bytes) {
  if (bytes.length < 14 || bytes[0] !== 0xFF || bytes[1] !== 0xD8) return null;

  let offset = 2;
  while (offset < bytes.length - 4) {
    if (bytes[offset] !== 0xFF) break;
    const marker = bytes[offset + 1];
    if (marker === 0xE1) {
      const len = (bytes[offset + 2] << 8) | bytes[offset + 3];
      return parseApp1(bytes, offset + 4, len - 2);
    }
    if (marker === 0xDA) break;
    const segLen = (bytes[offset + 2] << 8) | bytes[offset + 3];
    offset += 2 + segLen;
  }
  return null;
}

function parseApp1(bytes, start, len) {
  if (start + 6 > bytes.length) return null;
  const exifStr = String.fromCharCode(bytes[start], bytes[start+1], bytes[start+2], bytes[start+3]);
  if (exifStr !== 'Exif') return null;

  const tiffStart = start + 6;
  if (tiffStart + 8 > bytes.length) return null;

  const le = bytes[tiffStart] === 0x49;
  const r16 = (o) => le ? (bytes[o] | (bytes[o+1] << 8)) : ((bytes[o] << 8) | bytes[o+1]);
  const r32 = (o) => le
    ? (bytes[o] | (bytes[o+1] << 8) | (bytes[o+2] << 16) | ((bytes[o+3] << 24) >>> 0))
    : (((bytes[o] << 24) >>> 0) | (bytes[o+1] << 16) | (bytes[o+2] << 8) | bytes[o+3]);

  const ifdOffset = r32(tiffStart + 4);
  const ifd0 = tiffStart + ifdOffset;

  const dateFromIfd = (ifdStart) => {
    if (ifdStart + 2 > bytes.length) return null;
    const count = r16(ifdStart);
    for (let i = 0; i < count; i++) {
      const entry = ifdStart + 2 + i * 12;
      if (entry + 12 > bytes.length) return null;
      const tag = r16(entry);
      // 0x9003 = DateTimeOriginal, 0x9004 = DateTimeDigitized, 0x0132 = DateTime
      if (tag === 0x9003 || tag === 0x9004 || tag === 0x0132) {
        const valOffset = r32(entry + 8);
        const strStart = tiffStart + valOffset;
        if (strStart + 19 > bytes.length) return null;
        let s = '';
        for (let j = 0; j < 19; j++) s += String.fromCharCode(bytes[strStart + j]);
        return exifStringToDate(s);
      }
      // 0x8769 = ExifIFD pointer
      if (tag === 0x8769) {
        const exifIfdOffset = r32(entry + 8);
        const result = dateFromIfd(tiffStart + exifIfdOffset);
        if (result) return result;
      }
    }
    return null;
  };

  return dateFromIfd(ifd0);
}

function exifStringToDate(s) {
  // "YYYY:MM:DD HH:MM:SS"
  const m = s.match(/^(\d{4}):(\d{2}):(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  return isNaN(d.getTime()) ? null : d;
}

// ─── Filename date patterns ──────────────────────────────

function parseDateFromFilename(name) {
  // WhatsApp: IMG-20240115-WA0001.jpg, VID-20240115-WA0001.mp4
  let m = name.match(/(?:IMG|VID|PHOTO|STK)-(\d{4})(\d{2})(\d{2})-/i);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);

  // Telegram: photo_2024-01-15_14-30-22.jpg
  m = name.match(/photo_(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})/i);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);

  // Generic: 2024-01-15 or 20240115 anywhere in filename
  m = name.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);

  m = name.match(/(\d{4})(\d{2})(\d{2})/);
  if (m) {
    const d = new Date(+m[1], +m[2] - 1, +m[3]);
    if (d.getFullYear() >= 2000 && d.getFullYear() <= 2099) return d;
  }

  // Screenshot patterns: Screenshot_20240115-143022.png
  m = name.match(/Screenshot[_-](\d{4})(\d{2})(\d{2})[_-](\d{2})(\d{2})(\d{2})/i);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);

  // Spanish month pattern: 24-may.-20-02-02-06-25 → DD-MMM.-YY-HH-MM-SS-##
  m = name.match(/(\d{1,2})-(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)\.?-(\d{2,4})-(\d{2})-(\d{2})-(\d{2})/i);
  if (m) {
    const monthMap = { ene:0, feb:1, mar:2, abr:3, may:4, jun:5, jul:6, ago:7, sep:8, oct:9, nov:10, dic:11 };
    const mon = monthMap[m[2].toLowerCase()];
    let yr = +m[3];
    if (yr < 100) yr += 2000;
    if (mon !== undefined) return new Date(yr, mon, +m[1], +m[4], +m[5], +m[6]);
  }

  return null;
}

function formatDateFolder(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// ─── ZIP Builder (store method, no compression) ───────────

function buildZip(folders) {
  const entries = [];
  for (const [folder, items] of Object.entries(folders)) {
    const nameCount = {};
    for (const item of items) {
      let baseName = item.name;
      if (nameCount[baseName]) {
        const dot = baseName.lastIndexOf('.');
        const ext = dot >= 0 ? baseName.slice(dot) : '';
        const stem = dot >= 0 ? baseName.slice(0, dot) : baseName;
        baseName = `${stem}_${nameCount[baseName]}${ext}`;
      }
      nameCount[item.name] = (nameCount[item.name] || 0) + 1;
      entries.push({ path: `${folder}/${baseName}`, data: item.buffer });
    }
  }

  let totalSize = 0;
  const localHeaders = [];
  const centralHeaders = [];
  let localOffset = 0;

  for (const entry of entries) {
    const pathBytes = new TextEncoder().encode(entry.path);
    const crc = crc32(entry.data);
    const dataLen = entry.data.length;

    // Local file header: 30 + pathLen + dataLen
    const local = new Uint8Array(30 + pathBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);   // signature
    lv.setUint16(4, 20, true);            // version needed
    lv.setUint16(6, 0, true);             // flags
    lv.setUint16(8, 0, true);             // compression: store
    lv.setUint16(10, 0, true);            // mod time
    lv.setUint16(12, 0, true);            // mod date
    lv.setUint32(14, crc, true);          // crc32
    lv.setUint32(18, dataLen, true);      // compressed size
    lv.setUint32(22, dataLen, true);      // uncompressed size
    lv.setUint16(26, pathBytes.length, true); // filename length
    lv.setUint16(28, 0, true);            // extra field length
    local.set(pathBytes, 30);

    // Central directory header: 46 + pathLen
    const central = new Uint8Array(46 + pathBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);    // signature
    cv.setUint16(4, 20, true);            // version made by
    cv.setUint16(6, 20, true);            // version needed
    cv.setUint16(8, 0, true);             // flags
    cv.setUint16(10, 0, true);            // compression: store
    cv.setUint16(12, 0, true);            // mod time
    cv.setUint16(14, 0, true);            // mod date
    cv.setUint32(16, crc, true);          // crc32
    cv.setUint32(20, dataLen, true);      // compressed size
    cv.setUint32(24, dataLen, true);      // uncompressed size
    cv.setUint16(28, pathBytes.length, true); // filename length
    cv.setUint16(30, 0, true);            // extra field length
    cv.setUint16(32, 0, true);            // comment length
    cv.setUint16(34, 0, true);            // disk number
    cv.setUint16(36, 0, true);            // internal attrs
    cv.setUint32(38, 0, true);            // external attrs
    cv.setUint32(42, localOffset, true);  // local header offset
    central.set(pathBytes, 46);

    localHeaders.push({ header: local, data: entry.data });
    centralHeaders.push(central);
    localOffset += local.length + dataLen;
  }

  const centralDirOffset = localOffset;
  let centralDirSize = 0;
  for (const c of centralHeaders) centralDirSize += c.length;

  // End of central directory: 22 bytes
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralDirSize, true);
  ev.setUint32(16, centralDirOffset, true);
  ev.setUint16(20, 0, true);

  totalSize = localOffset + centralDirSize + 22;
  const result = new Uint8Array(totalSize);
  let pos = 0;

  for (const { header, data } of localHeaders) {
    result.set(header, pos); pos += header.length;
    result.set(data, pos);   pos += data.length;
  }
  for (const c of centralHeaders) {
    result.set(c, pos); pos += c.length;
  }
  result.set(eocd, pos);

  return result.buffer;
}

function crc32(data) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}
