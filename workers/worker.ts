/* ============================================
   MIRAI AI - Cloudflare Worker (entrada)
   fetch y scheduled. Las rutas /api/ las resuelve router.ts; los ficheros
   de public/ los sirve la plataforma antes de llegar aquí.
   ============================================ */
import { jsonResponse } from './lib/http';
import { handleApiRequest } from './router';
import { cleanupExpiredFormatFiles } from './routes/format';
import { finalizePendingVideoAvatarJobs } from './routes/video';

// --- APP ANDROID (TWA) ---
// Huella SHA-256 de android/mirai-release.keystore. Si se publica en Play Store
// con "Play App Signing", añadir también la huella de la llave de Google
// (Play Console > Integridad de la app) a sha256_cert_fingerprints.
const ANDROID_ASSET_LINKS = [{
  relation: ['delegate_permission/common.handle_all_urls'],
  target: {
    namespace: 'android_app',
    package_name: 'com.aberumirai.ai',
    sha256_cert_fingerprints: [
      '16:F1:31:A6:E9:6B:E9:F1:62:26:39:D7:79:50:5D:30:3F:68:B6:57:CA:93:91:22:75:20:CD:25:8B:68:50:37'
    ]
  }
}];

// --- PÁGINAS MIGRADAS A LA APP QUASAR ---
// Slugs de public/<slug>.html que ya viven en /app/<slug>. Mantener en sincronía
// con MIGRATED de frontend/src/lib/legacy.ts.
const MIGRATED_PAGES = new Set([
  'login', 'registration', 'verify', 'reset-password',
  'about', 'documentation', 'purchase', 'learning_hub',
  'index', 'settings',
]);

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

      // Páginas ya migradas a la app Quasar: la URL antigua (/login,
      // /reset-password.html?token=..., enlaces de las páginas que aún no se
      // han migrado) se redirige a la nueva conservando la query. Su .html se
      // ha borrado de public/, así que estas peticiones llegan al Worker.
      const legacySlug = path.replace(/^\/+/, '').replace(/\.html$/, '') || 'index';
      if (MIGRATED_PAGES.has(legacySlug)) {
        const target = legacySlug === 'index' ? '/app/' : `/app/${legacySlug}`;
        return Response.redirect(new URL(`${target}${url.search}`, url).toString(), 302);
      }

      // App Quasar (frontend/, compilada a public/app/). Workers Assets ya ha
      // servido cualquier archivo que exista; si una ruta /app/... llega aquí
      // es una ruta del router de Vue (p. ej. /app/login) y se devuelve el
      // index.html de la app. Las que parecen archivo (/app/x.js) siguen al 404.
      if ((path === '/app' || path.startsWith('/app/')) && !/\.[a-z0-9]+$/i.test(path)) {
        return env.ASSETS.fetch(new Request(new URL('/app/', url), request));
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
