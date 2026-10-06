/// <reference types="google.maps" />
// Google Maps (mapas, Places y geocodificación) para tareas y ubicaciones.
//
// La clave la da el Worker (/api/maps-key) y el script se carga una sola vez,
// la primera vez que una página lo necesita.

let loading: Promise<boolean> | null = null;

/**
 * Carga la API de Google Maps. Devuelve false si no hay clave configurada o el
 * script no carga (el siguiente intento vuelve a probar).
 */
export function loadGoogleMaps(): Promise<boolean> {
  if (window.google?.maps) return Promise.resolve(true);
  loading ??= (async () => {
    const res = await fetch('/api/maps-key', { credentials: 'same-origin' });
    const { key } = (await res.json()) as { key?: string };
    if (!key) return false;
    return await new Promise<boolean>((resolve) => {
      const w = window as unknown as Record<string, unknown>;
      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=places,marker&loading=async&callback=__gmInit`;
      script.async = true;
      w.__gmInit = () => {
        delete w.__gmInit;
        trackMapsUsage('map_load');
        resolve(true);
      };
      script.onerror = () => {
        script.remove();
        resolve(false);
      };
      document.head.appendChild(script);
    });
  })()
    .catch(() => false)
    .then((ok) => {
      if (!ok) loading = null;
      return ok;
    });
  return loading;
}

/**
 * Aviso (best effort) para el panel de consumo de APIs: las llamadas a
 * Maps/Places/Geocoding van del navegador a Google, nunca pasan por el Worker.
 */
export function trackMapsUsage(type: 'map_load' | 'places_autocomplete' | 'geocode'): void {
  fetch('/api/track-maps-usage', {
    method: 'POST',
    credentials: 'same-origin',
    keepalive: true,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type }),
  }).catch(() => {});
}

/** Color de acento del tema, para los marcadores. */
export function accentColor(): string {
  return getComputedStyle(document.documentElement).getPropertyValue('--accent-color').trim() || '#6750A4';
}

export function mapColorScheme(): google.maps.ColorScheme {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? google.maps.ColorScheme.DARK : google.maps.ColorScheme.LIGHT;
}

/**
 * Marcador en forma de gota (SVG) para AdvancedMarkerElement: `d` es la gota
 * (cada página usa la suya, como antes) y `dot`, el punto central.
 */
export function pinSvg(opts: {
  width: number;
  height: number;
  d: string;
  fill: string;
  fillOpacity?: number;
  stroke: string;
  strokeWidth: number;
  strokeDash?: string;
  dot?: { cx: number; cy: number; r: number; fill: string; opacity?: number };
}): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('width', String(opts.width));
  svg.setAttribute('height', String(opts.height));
  svg.setAttribute('viewBox', `0 0 ${opts.width} ${opts.height}`);
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', opts.d);
  path.setAttribute('fill', opts.fill);
  if (opts.fillOpacity !== undefined) path.setAttribute('fill-opacity', String(opts.fillOpacity));
  path.setAttribute('stroke', opts.stroke);
  path.setAttribute('stroke-width', String(opts.strokeWidth));
  if (opts.strokeDash) path.setAttribute('stroke-dasharray', opts.strokeDash);
  svg.appendChild(path);
  if (opts.dot) {
    const circle = document.createElementNS(ns, 'circle');
    circle.setAttribute('cx', String(opts.dot.cx));
    circle.setAttribute('cy', String(opts.dot.cy));
    circle.setAttribute('r', String(opts.dot.r));
    circle.setAttribute('fill', opts.dot.fill);
    if (opts.dot.opacity !== undefined) circle.setAttribute('opacity', String(opts.dot.opacity));
    svg.appendChild(circle);
  }
  return svg;
}
