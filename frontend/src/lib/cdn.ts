// Carga diferida de librerías UMD desde un CDN (las mismas versiones que
// usaban las páginas antiguas con <script src>): solo se descargan la primera
// vez que hacen falta y dejan su global en window.

/** mammoth 1.6.0 (DOCX → texto/HTML): lo usan el chat y la página APA. */
export const MAMMOTH_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js';

const loading = new Map<string, Promise<void>>();

export function loadScript(src: string): Promise<void> {
  let p = loading.get(src);
  if (!p) {
    p = new Promise<void>((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => {
        loading.delete(src);
        s.remove();
        reject(new Error(`No se pudo cargar ${src}`));
      };
      document.head.appendChild(s);
    });
    loading.set(src, p);
  }
  return p;
}

/** El global `name` de una librería UMD, cargándola desde `src` si aún no está. */
export async function loadGlobal<T>(name: string, src: string): Promise<T> {
  const w = window as unknown as Record<string, unknown>;
  if (!w[name]) await loadScript(src);
  const value = w[name];
  if (!value) throw new Error(`${name} no disponible`);
  return value as T;
}
