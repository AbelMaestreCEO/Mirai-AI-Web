/* ============================================
   MIRAI AI - Cloudflare Worker (entrada)
   fetch y scheduled. Las rutas /api/ las resuelve router.ts; los ficheros
   de public/ los sirve la plataforma antes de llegar aquí, y el resto de
   rutas reciben la app Quasar (frontend/).
   ============================================ */
import { jsonResponse } from './lib/http';
import { handleApiRequest } from './router';
import { cleanupExpiredFormatFiles } from './routes/format';
import { finalizePendingVideoAvatarJobs } from './routes/video';
import { getSeo, injectSeo, renderRobotsTxt, renderSitemapXml } from './lib/seo';

// --- APP ANDROID (TWA) ---
// Huellas SHA-256 de android/mirai-release.keystore (APK instalado a mano) y de
// la llave con que Google Play re-firma la app (Play Console > Integridad de la app).
const ANDROID_ASSET_LINKS = [{
  relation: ['delegate_permission/common.handle_all_urls'],
  target: {
    namespace: 'android_app',
    package_name: 'com.aberumirai.ai',
    sha256_cert_fingerprints: [
      '16:F1:31:A6:E9:6B:E9:F1:62:26:39:D7:79:50:5D:30:3F:68:B6:57:CA:93:91:22:75:20:CD:25:8B:68:50:37',
      // Llave de firma de Google Play (Play App Signing)
      'D3:AA:54:B7:C7:66:25:80:BA:6F:B2:50:B4:AE:3A:F1:84:F8:D1:7B:8F:E3:ED:8C:93:56:9D:63:25:2B:29:6F'
    ]
  }
}];

// --- HANDLER PRINCIPAL ---
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    try {
      const url = new URL(request.url);
      const path = url.pathname;

      // Digital Asset Links de la app Android (TWA en android/). Va antes del
      // bloqueo de rutas '/.' porque Android la pide en /.well-known/. Sin ella
      // la app abre la web con barra de URL en vez de a pantalla completa.
      if (path === '/.well-known/assetlinks.json') {
        return new Response(JSON.stringify(ANDROID_ASSET_LINKS), {
          headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' }
        });
      }

      // ✅ VERIFICACIÓN DE SEGURIDAD (AHORA DESPUÉS DE DEFINIR url)
      if (path.startsWith('/.') ||
        path.includes('.env') ||
        path.includes('.aws') ||
        path.includes('.git')) {
        return new Response('Not Found', { status: 404 });
      }

      // Indexación: robots.txt y sitemap.xml se generan desde la misma tabla
      // de módulos que los metadatos, para que no se desincronicen.
      if (path === '/robots.txt' || path === '/sitemap.xml') {
        const isRobots = path === '/robots.txt';
        const headers = new Headers({
          'Content-Type': isRobots ? 'text/plain; charset=utf-8' : 'application/xml; charset=utf-8',
          'Cache-Control': 'public, max-age=3600',
          'X-Content-Type-Options': 'nosniff',
        });
        const body = isRobots ? renderRobotsTxt() : renderSitemapXml();
        return new Response(request.method === 'HEAD' ? null : body, { status: 200, headers });
      }

      // App Quasar (frontend/, compilada a public/app/). Workers Assets ya ha
      // servido cualquier archivo que exista, así que una petición que llega
      // aquí sin ser de la API es una ruta de la app (/chat, /login...) o algo
      // que no existe.
      if ((request.method === 'GET' || request.method === 'HEAD') && !path.startsWith('/api/')) {
        // URLs de las antiguas páginas .html (correos ya enviados, marcadores):
        // a su ruta sin .html, conservando la query (/reset-password?token=...).
        if (/\.html$/i.test(path) || path === '/index') {
          const target = path.replace(/\.html$/i, '').replace(/^\/index$/, '/');
          return Response.redirect(new URL(`${target}${url.search}`, url).toString(), 302);
        }
        // Cualquier ruta que no parezca un archivo recibe el index.html de la
        // app, también las de /app/... de antes: la propia app les quita el
        // prefijo (ver frontend/src/router/index.ts). Sin redirección, porque
        // el service worker antiguo no sabe seguirlas en una navegación.
        // El HTML se sirve con los metadatos de la ruta (título, descripción,
        // canonical, OG y JSON-LD) y las rutas desconocidas con estado 404.
        if (!/\.[a-z0-9]+$/i.test(path)) {
          const assetResponse = await env.ASSETS.fetch(new Request(new URL('/app/', url), request));
          const seo = getSeo(path);
          const status = seo.known ? assetResponse.status : 404;

          if (request.method === 'HEAD') {
            return new Response(null, { status, headers: seoHtmlHeaders(assetResponse.headers, seo) });
          }

          const html = await assetResponse.text();
          return new Response(injectSeo(html, path), {
            status,
            headers: seoHtmlHeaders(assetResponse.headers, seo),
          });
        }
      }

      // Habilitar CORS para todas las rutas
      const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://static.cloudflareinsights.com; connect-src 'self' https://api.deepseek.com;",
        'X-Frame-Options': 'DENY',
        'X-Content-Type-Options': 'nosniff',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Content-Type': 'application/json'
      };

      // Manejar preflight CORS
      if (request.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
      }

      // Rutas de API
      if (path.startsWith('/api/')) {
        return handleApiRequest(request, env, ctx, corsHeaders);
      }

      // Servir archivos estáticos
      return serveStatic(url, env, corsHeaders);


    } catch (error) {
      console.error('Worker error:', error);
      // ✅ Definir corsHeaders mínimos para el catch
      const fallbackCorsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      };
      return jsonResponse(
        { error: 'Error interno del servidor' },
        500,
        fallbackCorsHeaders
      );
    }
  },
  async scheduled(event: ScheduledController, env: Env) {
    // Los dos crons de wrangler.toml entraban por aquí sin mirar event.cron, así
    // que la "limpieza horaria" de format/ corría en realidad cada 2 minutos.
    // Además, un fallo del list() de R2 impedía que llegase a ejecutarse
    // finalizePendingVideoAvatarJobs, que es la red de seguridad de los vídeos.
    const HOURLY_CRON = '0 * * * *';

    if (event.cron === HOURLY_CRON) {
      try {
        await cleanupExpiredFormatFiles(env);
      } catch (error: any) {
        console.error('❌ [Scheduled] Format cleanup falló:', error.message);
      }
    }

    try {
      await finalizePendingVideoAvatarJobs(env);
    } catch (error: any) {
      console.error('❌ [Scheduled] finalizePendingVideoAvatarJobs falló:', error.message);
    }
  }
};

// --- SER ARCHIVOS ESTÁTICOS ---
/**
 * Cabeceras del HTML de la app: SEO (canonical y X-Robots-Tag) más el resto de
 * cabeceras de Workers Assets (tipo de contenido, compresión, etc.).
 */
function seoHtmlHeaders(source: Headers, seo: ReturnType<typeof getSeo>): Headers {
  const headers = new Headers(source);
  headers.set('Content-Type', 'text/html; charset=utf-8');
  headers.set('Cache-Control', 'public, max-age=0, s-maxage=3600');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Link', `<${seo.canonical}>; rel="canonical"`);
  headers.set('X-Robots-Tag', seo.robots);
  return headers;
}

/**
 * Fallback para rutas que no son /api/ y que Workers Assets no resolvió.
 *
 * Antes esta función buscaba la ruta pedida como clave en el bucket R2
 * MIRAI_AI_ASSETS. Ese bucket NO es el de los ficheros públicos: contiene
 * submissions/, invoices/, apa/, report-images/, inventory/ y videos/, así que
 * un GET a /invoices/<dni>/<uuid>.pdf devolvía el PDF sin pedir sesión — una
 * segunda puerta al almacenamiento privado que ni siquiera pasaba por
 * /api/file/. Los ficheros de public/ los sirve la plataforma (assets = {
 * directory = "./public" } en wrangler.toml) antes de ejecutar este Worker, así
 * que llegar aquí significa que la ruta simplemente no existe.
 *
 * Todo contenido de R2 se sirve exclusivamente por sus rutas /api/... que sí
 * comprueban permisos.
 */
async function serveStatic(url: URL, env: Env, corsHeaders: Record<string, string>) {
  return jsonResponse({ error: 'Recurso no encontrado' }, 404, {
    ...corsHeaders,
    'Cache-Control': 'no-store',
  });
}
