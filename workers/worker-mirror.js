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









function buildCentralHeader(nameBytes, crc, compSize, uncompSize, extAttr, localOffset) {
    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0,  0x02014b50,   true); // signature
    cv.setUint16(4,  20,           true); // version made by
    cv.setUint16(6,  20,           true); // version needed
    cv.setUint16(8,  0,            true); // flags
    cv.setUint16(10, 0,            true); // compression
    cv.setUint16(12, 0,            true); // mod time
    cv.setUint16(14, 0,            true); // mod date
    cv.setUint32(16, crc,          true);
    cv.setUint32(20, compSize,     true);
    cv.setUint32(24, uncompSize,   true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0,            true); // extra len
    cv.setUint16(32, 0,            true); // comment len
    cv.setUint16(34, 0,            true); // disk start
    cv.setUint16(36, 0,            true); // internal attr
    cv.setUint32(38, extAttr,      true); // external attr
    cv.setUint32(42, localOffset,  true); // offset of local header
    central.set(nameBytes, 46);
    return central;
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
