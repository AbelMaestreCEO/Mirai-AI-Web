// ============================================
// MIRAI MIRROR - worker.js (CORREGIDO v2)
// ============================================

// CSP centralizada — un solo lugar para cambiarla
const CSP =
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' " +
        "https://cdnjs.cloudflare.com " +
        "https://unpkg.com " +
        "https://static.cloudflareinsights.com; " +
    "script-src-elem 'self' 'unsafe-inline' " +
        "https://cdnjs.cloudflare.com " +
        "https://unpkg.com " +
        "https://static.cloudflareinsights.com; " +
    "style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data: blob: " +  // <-- 'blob:' y 'data:' son CRÍTICOS para FileReader
        "https://assets.aberumirai.com " +
        "https://*.r2.cloudflarestorage.com " +
        "https://*.cloudflare.com " +
        "https://unpkg.com; " +       // <-- Añadido para iconos Lucide si se cargan como img
    "connect-src 'self' " +
        "https://api.cloudflare.com " +
        "https://mirror.aberumirai.com " +
        "https://*.r2.cloudflarestorage.com " +
        "https://unpkg.com " +
        "https://cdnjs.cloudflare.com " +
        "https://static.cloudflareinsights.com " +
        "https://cloudflareinsights.com; " +
    "font-src 'self'; " +
    "frame-ancestors 'none'; " +
    "base-uri 'self'; " +
    "form-action 'self'";

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);

        const corsHeaders = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Max-Age': '86400'
        };

        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders });
        }

        try {
            // API routes
            if (request.method === 'POST' && url.pathname === '/api/process') {
                return await processImages(request, env, corsHeaders);
            }
            if (request.method === 'GET' && url.pathname === '/api/status') {
                return await getStatus(env, corsHeaders);
            }
            if (request.method === 'GET' && url.pathname === '/api/debug') {
                return await getDebug(env, corsHeaders);
            }

            // Todos los assets estáticos pasan por serveStatic para aplicar CSP
            return await serveStatic(env.ASSETS, request, corsHeaders);

        } catch (error) {
            console.error('Worker error:', error);
            return new Response(JSON.stringify({
                error: 'Internal Server Error',
                message: error.message
            }), {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }
    },

    // Cron de limpieza
    async scheduled(event, env, ctx) {
        console.log('Running cleanup...');
        try {
            await env.DB.prepare(
                "DELETE FROM photo_sessions WHERE created_at < datetime('now', '-7 days')"
            ).run();
            await env.DB.prepare(
                "DELETE FROM photos WHERE created_at < datetime('now', '-7 days')"
            ).run();
            console.log('Cleanup done');
        } catch (e) {
            console.error('Cleanup error:', e);
        }
    }
};

// ============================================
// SERVIR ARCHIVOS ESTÁTICOS CON CSP CORRECTA
// ============================================
async function serveStatic(assets, request, corsHeaders) {
    const response = await assets.fetch(request);
    const newHeaders = new Headers(response.headers);

    // Eliminar cualquier CSP previa (Cloudflare a veces inyecta la suya)
    newHeaders.delete('Content-Security-Policy');
    newHeaders.delete('Content-Security-Policy-Report-Only');
    newHeaders.delete('Cross-Origin-Embedder-Policy');
    newHeaders.delete('Cross-Origin-Opener-Policy');

    // Solo aplicar CSP a documentos HTML; para JS/CSS/img no hace falta
    const contentType = newHeaders.get('Content-Type') || '';
    if (contentType.includes('text/html')) {
        newHeaders.set('Content-Security-Policy', CSP);
    }

    // Sin caché en dev/staging
    newHeaders.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    newHeaders.set('Pragma', 'no-cache');
    newHeaders.set('Expires', '0');

    Object.entries(corsHeaders).forEach(([k, v]) => newHeaders.set(k, v));

    return new Response(response.body, {
        status: response.status,
        headers: newHeaders
    });
}













// ============================================
// PROCESAR IMÁGENES
// ============================================

async function processImages(request, env, corsHeaders) {
    const formData = await request.formData();
    const files = formData.getAll('images');

    if (!files.length) {
        return jsonResponse({ error: 'No images provided' }, 400, corsHeaders);
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
            if (tag === 0x9003 || tag === 0x9004 || tag === 0x0132) {
                const valOffset = r32(entry + 8);
                const strStart = tiffStart + valOffset;
                if (strStart + 19 > bytes.length) return null;
                let s = '';
                for (let j = 0; j < 19; j++) s += String.fromCharCode(bytes[strStart + j]);
                return exifStringToDate(s);
            }
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
    const m = s.match(/^(\d{4}):(\d{2}):(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/);
    if (!m) return null;
    const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
    return isNaN(d.getTime()) ? null : d;
}

function parseDateFromFilename(name) {
    let m = name.match(/(?:IMG|VID|PHOTO|STK)-(\d{4})(\d{2})(\d{2})-/i);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]);

    m = name.match(/photo_(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})/i);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);

    m = name.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]);

    m = name.match(/(\d{4})(\d{2})(\d{2})/);
    if (m) {
        const d = new Date(+m[1], +m[2] - 1, +m[3]);
        if (d.getFullYear() >= 2000 && d.getFullYear() <= 2099) return d;
    }

    m = name.match(/Screenshot[_-](\d{4})(\d{2})(\d{2})[_-](\d{2})(\d{2})(\d{2})/i);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);

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
    const mo = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${mo}-${d}`;
}

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

    const localHeaders = [];
    const centralHeaders = [];
    let localOffset = 0;

    for (const entry of entries) {
        const pathBytes = new TextEncoder().encode(entry.path);
        const crc = crc32(entry.data);
        const dataLen = entry.data.length;

        const local = new Uint8Array(30 + pathBytes.length);
        const lv = new DataView(local.buffer);
        lv.setUint32(0, 0x04034b50, true);
        lv.setUint16(4, 20, true);
        lv.setUint16(8, 0, true);
        lv.setUint32(14, crc, true);
        lv.setUint32(18, dataLen, true);
        lv.setUint32(22, dataLen, true);
        lv.setUint16(26, pathBytes.length, true);
        local.set(pathBytes, 30);

        const central = new Uint8Array(46 + pathBytes.length);
        const cv = new DataView(central.buffer);
        cv.setUint32(0, 0x02014b50, true);
        cv.setUint16(4, 20, true);
        cv.setUint16(6, 20, true);
        cv.setUint16(10, 0, true);
        cv.setUint32(16, crc, true);
        cv.setUint32(20, dataLen, true);
        cv.setUint32(24, dataLen, true);
        cv.setUint16(28, pathBytes.length, true);
        cv.setUint32(42, localOffset, true);
        central.set(pathBytes, 46);

        localHeaders.push({ header: local, data: entry.data });
        centralHeaders.push(central);
        localOffset += local.length + dataLen;
    }

    const centralDirOffset = localOffset;
    let centralDirSize = 0;
    for (const c of centralHeaders) centralDirSize += c.length;

    const eocd = new Uint8Array(22);
    const ev = new DataView(eocd.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(8, entries.length, true);
    ev.setUint16(10, entries.length, true);
    ev.setUint32(12, centralDirSize, true);
    ev.setUint32(16, centralDirOffset, true);

    const totalSize = localOffset + centralDirSize + 22;
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

// ============================================
// ENDPOINTS DE MONITOREO
// ============================================
async function getStatus(env, corsHeaders) {
    try {
        const sessions = await env.DB.prepare(
            "SELECT COUNT(*) as count FROM photo_sessions WHERE created_at > datetime('now', '-24 hours')"
        ).all();
        const photos = await env.DB.prepare(
            "SELECT COUNT(*) as count FROM photos WHERE created_at > datetime('now', '-24 hours')"
        ).all();
        return jsonResponse({
            success: true,
            data: {
                sessionsLast24h: sessions.results[0]?.count || 0,
                photosLast24h: photos.results[0]?.count || 0,
                version: '2.0.0'
            }
        }, 200, corsHeaders);
    } catch (e) {
        return jsonResponse({ success: false, error: e.message }, 500, corsHeaders);
    }
}

async function getDebug(env, corsHeaders) {
    return jsonResponse({
        success: true,
        bindings: {
            hasDB: !!env.DB,
            hasR2: !!env.MIRAI_PHOTOS,
            hasAssets: !!env.ASSETS
        },
        timestamp: new Date().toISOString()
    }, 200, corsHeaders);
}

function jsonResponse(data, status = 200, headers = {}) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { ...headers, 'Content-Type': 'application/json' }
    });
}
