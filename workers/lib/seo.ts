// Metadatos de indexaciÃ³n que el Worker inyecta en el HTML de la SPA antes de
// enviarlo. AsÃ­ los buscadores y las redes sociales no dependen de ejecutar
// JavaScript para leer el tÃ­tulo, la descripciÃ³n, el canonical o el JSON-LD.
import { buildStructuredData, getSeo, SITE, SITEMAP_MODULES } from '../../frontend/src/lib/seo-data';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeXml(value: string): string {
  return escapeHtml(value);
}

/** Etiquetas <head> de una ruta: tÃ­tulo, descripciÃ³n, canonical, redes y JSON-LD. */
export function renderSeoHead(pathname: string): string {
  const seo = getSeo(pathname);
  const jsonLd = seo.known
    ? JSON.stringify(buildStructuredData(seo)).replace(/</g, '\\u003c')
    : '';

  const tags = [
    `<title>${escapeHtml(seo.title)}</title>`,
    `<meta name="description" content="${escapeHtml(seo.description)}">`,
    `<meta name="robots" content="${escapeHtml(seo.robots)}">`,
    `<meta name="author" content="${escapeHtml(SITE.legalName)}">`,
    `<meta name="application-name" content="${escapeHtml(SITE.name)}">`,
    `<link rel="canonical" href="${escapeHtml(seo.canonical)}">`,
    `<link rel="alternate" hreflang="${SITE.language}" href="${escapeHtml(seo.canonical)}">`,
    `<link rel="alternate" hreflang="x-default" href="${escapeHtml(seo.canonical)}">`,
    `<meta property="og:type" content="${seo.path === '/' ? 'website' : 'article'}">`,
    `<meta property="og:site_name" content="${escapeHtml(SITE.name)}">`,
    `<meta property="og:locale" content="${SITE.locale}">`,
    `<meta property="og:title" content="${escapeHtml(seo.title)}">`,
    `<meta property="og:description" content="${escapeHtml(seo.description)}">`,
    `<meta property="og:url" content="${escapeHtml(seo.canonical)}">`,
    `<meta property="og:image" content="${escapeHtml(SITE.image)}">`,
    `<meta property="og:image:alt" content="${escapeHtml(SITE.name)}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:site" content="${escapeHtml(SITE.twitter)}">`,
    `<meta name="twitter:title" content="${escapeHtml(seo.title)}">`,
    `<meta name="twitter:description" content="${escapeHtml(seo.description)}">`,
    `<meta name="twitter:image" content="${escapeHtml(SITE.image)}">`,
    jsonLd ? `<script type="application/ld+json">${jsonLd}</script>` : '',
  ];

  return tags.filter(Boolean).join('');
}

/** Enlaces de mÃ³dulos para navegadores sin JavaScript (y para rastreadores). */
function renderNoScript(pathname: string): string {
  const seo = getSeo(pathname);
  const links = SITEMAP_MODULES.map(
    (module) => `<a href="${escapeHtml(module.path)}">${escapeHtml(module.title.split('|')[0].trim())}</a>`,
  ).join(' Â· ');

  return (
    '<noscript><main>' +
    `<h1>${escapeHtml(seo.title)}</h1>` +
    `<p>${escapeHtml(seo.description)}</p>` +
    '<p>Mirai AI necesita JavaScript para funcionar. Mientras tanto, puedes explorar sus mÃ³dulos:</p>' +
    `<nav>${links}</nav>` +
    '</main></noscript>'
  );
}

/**
 * Reemplaza los metadatos por defecto de public/app/index.html por los de la
 * ruta pedida y aÃ±ade el fallback sin JavaScript.
 */
export function injectSeo(html: string, pathname: string): string {
  const withoutDefaults = html
    .replace(/<title[^>]*>[\s\S]*?<\/title>/gi, '')
    .replace(/<meta[^>]*name=["']?description["']?[^>]*>/gi, '')
    .replace(/<meta[^>]*name=["']?robots["']?[^>]*>/gi, '')
    .replace(/<meta[^>]*name=["']?author["']?[^>]*>/gi, '')
    .replace(/<meta[^>]*name=["']?application-name["']?[^>]*>/gi, '')
    .replace(/<meta[^>]*name=["']?twitter:[^"'\s>]+["']?[^>]*>/gi, '')
    .replace(/<meta[^>]*property=["']?og:[^"'\s>]+["']?[^>]*>/gi, '')
    .replace(/<link[^>]*rel=["']?(?:canonical|alternate)["']?[^>]*>/gi, '')
    .replace(/<script[^>]*id=["']?mirai-seo-jsonld["']?[^>]*>[\s\S]*?<\/script>/gi, '');

  const withHead = withoutDefaults.replace('</head>', `${renderSeoHead(pathname)}</head>`);
  return withHead.replace('</body>', `${renderNoScript(pathname)}</body>`);
}

/** robots.txt: bloquea API, administraciÃ³n y pÃ¡ginas de cuenta. */
export function renderRobotsTxt(): string {
  return [
    'User-agent: *',
    'Allow: /',
    'Disallow: /api/',
    'Disallow: /app/',
    'Disallow: /panel',
    'Disallow: /api_usage_admin',
    'Disallow: /classroom_admin',
    'Disallow: /attendance_admin',
    'Disallow: /report_admin',
    'Disallow: /settings',
    'Disallow: /login',
    'Disallow: /registration',
    'Disallow: /verify',
    'Disallow: /reset-password',
    '',
    `Sitemap: ${SITE.origin}/sitemap.xml`,
    '',
  ].join('\n');
}

/** sitemap.xml: solo mÃ³dulos indexables, sin panel de administraciÃ³n. */
export function renderSitemapXml(): string {
  const urls = SITEMAP_MODULES.map((module) => {
    const loc = `${SITE.origin}${module.path === '/' ? '/' : module.path}`;
    const extras = [
      module.changefreq ? `<changefreq>${module.changefreq}</changefreq>` : '',
      module.priority ? `<priority>${module.priority}</priority>` : '',
    ]
      .filter(Boolean)
      .join('');
    return `  <url><loc>${escapeXml(loc)}</loc>${extras}</url>`;
  }).join('\n');

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    urls,
    '</urlset>',
    '',
  ].join('\n');
}

export { getSeo } from '../../frontend/src/lib/seo-data';
