// Metadatos de la página al navegar dentro de la SPA.
//
// El Worker ya entrega el HTML con estos metadatos para que los buscadores y
// las redes sociales los lean sin ejecutar JavaScript. Aquí se mantienen
// sincronizados cuando el usuario cambia de módulo sin recargar.
import { buildStructuredData, getSeo, SITE } from './seo-data';

function upsertMeta(attribute: 'name' | 'property', key: string, content: string): void {
  let element = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`);
  if (!element) {
    element = document.createElement('meta');
    element.setAttribute(attribute, key);
    document.head.appendChild(element);
  }
  element.setAttribute('content', content);
}

function upsertLink(rel: string, href: string, hreflang?: string): void {
  const selector = hreflang
    ? `link[rel="${rel}"][hreflang="${hreflang}"]`
    : `link[rel="${rel}"]:not([hreflang])`;
  let element = document.head.querySelector<HTMLLinkElement>(selector);
  if (!element) {
    element = document.createElement('link');
    element.rel = rel;
    if (hreflang) element.hreflang = hreflang;
    document.head.appendChild(element);
  }
  element.href = href;
}

/** Aplica título, descripción, canonical, Open Graph, Twitter y JSON-LD. */
export function applySeo(pathname: string): void {
  const seo = getSeo(pathname);

  document.title = seo.title;
  upsertMeta('name', 'description', seo.description);
  upsertMeta('name', 'robots', seo.robots);
  upsertMeta('name', 'author', SITE.legalName);

  upsertMeta('property', 'og:type', seo.path === '/' ? 'website' : 'article');
  upsertMeta('property', 'og:site_name', SITE.name);
  upsertMeta('property', 'og:locale', SITE.locale);
  upsertMeta('property', 'og:title', seo.title);
  upsertMeta('property', 'og:description', seo.description);
  upsertMeta('property', 'og:url', seo.canonical);
  upsertMeta('property', 'og:image', SITE.image);
  upsertMeta('property', 'og:image:alt', SITE.name);

  upsertMeta('name', 'twitter:card', 'summary_large_image');
  upsertMeta('name', 'twitter:site', SITE.twitter);
  upsertMeta('name', 'twitter:title', seo.title);
  upsertMeta('name', 'twitter:description', seo.description);
  upsertMeta('name', 'twitter:image', SITE.image);

  upsertLink('canonical', seo.canonical);
  upsertLink('alternate', seo.canonical, SITE.language);
  upsertLink('alternate', seo.canonical, 'x-default');

  const existing = document.getElementById('mirai-seo-jsonld');
  if (!seo.known) {
    existing?.remove();
    return;
  }

  const script = (existing as HTMLScriptElement | null) ?? document.createElement('script');
  script.id = 'mirai-seo-jsonld';
  script.type = 'application/ld+json';
  script.textContent = JSON.stringify(buildStructuredData(seo));
  if (!existing) document.head.appendChild(script);
}
