/* ============================================
   MIRAI AI - Imágenes en el chat
   El navegador reduce la foto, la sube con /api/upload (queda en R2 bajo
   attachments/<dni>/<conversación>/…) y manda sus claves en `images` de
   /api/chat. Aquí se comprueban, se leen de R2 y se convierten en las
   partes `image_url` que entiende deepseek-flash (ver lib/vision.ts).

   Solo valen claves del propio usuario: la misma regla que /api/attachment
   para servirlas, así que nadie puede enseñarle al modelo la foto de otro.
   ============================================ */
import { aBase64, mimeDeImagen } from './vision';

/** Cuántas imágenes puede llevar un mensaje. */
export const MAX_CHAT_IMAGES = 4;

/**
 * Cuántas imágenes de la conversación (contando las de este mensaje) ve el
 * modelo. Cada una son hasta 1024 tokens, y una foto de hace diez mensajes
 * ya está descrita en la respuesta que se dio entonces.
 */
export const IMAGES_TO_MODEL = 4;

const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'gif'];

/** La URL con la que se pinta una imagen guardada (con la sesión). */
export function attachmentUrl(key: string): string {
  return `/api/attachment/${key}`;
}

/**
 * Las claves de imagen de un mensaje, comprobadas. Lanza con un motivo
 * legible si alguna no es del usuario o no es una imagen.
 */
export function validateImageKeys(raw: unknown, userDni: string): string[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) throw new Error('Las imágenes tienen que ir en una lista');
  if (raw.length > MAX_CHAT_IMAGES) throw new Error(`Como mucho ${MAX_CHAT_IMAGES} imágenes por mensaje`);
  const prefix = `attachments/${userDni.toUpperCase()}/`;
  return raw.map((key) => {
    if (typeof key !== 'string' || !key.startsWith(prefix) || key.includes('..')) {
      throw new Error('Imagen no válida');
    }
    const extension = (key.split('.').pop() || '').toLowerCase();
    if (!IMAGE_EXTENSIONS.includes(extension)) throw new Error('Solo se pueden enviar imágenes JPEG, PNG, GIF o WebP');
    return key;
  });
}

/** Las claves guardadas en la columna `images` de un mensaje (JSON). */
export function parseImageKeys(column: unknown): string[] {
  if (typeof column !== 'string' || !column) return [];
  try {
    const parsed = JSON.parse(column);
    return Array.isArray(parsed) ? parsed.filter((k): k is string => typeof k === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * Las imágenes como partes `image_url` (URL `data:`). Las que ya no estén en
 * R2 o no sean una imagen de verdad se saltan: el texto del mensaje sigue.
 */
export async function imageParts(env: Env, keys: string[]) {
  const parts: { type: 'image_url'; image_url: { url: string } }[] = [];
  for (const key of keys) {
    try {
      const object = await env.MIRAI_AI_ASSETS.get(key);
      if (!object) continue;
      const bytes = new Uint8Array(await object.arrayBuffer());
      const mime = mimeDeImagen(bytes);
      if (!mime) continue;
      parts.push({ type: 'image_url', image_url: { url: `data:${mime};base64,${aBase64(bytes)}` } });
    } catch (error: any) {
      console.warn(`⚠️ No se pudo leer la imagen ${key}:`, error.message);
    }
  }
  return parts;
}

/** Si algún mensaje lleva una imagen: entonces solo vale el modelo que ve. */
export function hasImages(messages: any[]): boolean {
  return messages.some((m) => Array.isArray(m.content) && m.content.some((p: any) => p?.type === 'image_url'));
}

/**
 * Los mensajes sin sus imágenes, para un modelo que no ve (el respaldo): cada
 * imagen se cambia por una nota y el contenido vuelve a ser texto.
 */
export function withoutImages(messages: any[]): any[] {
  return messages.map((m) => {
    if (!Array.isArray(m.content)) return m;
    const text = m.content
      .map((p: any) => (p?.type === 'text' ? p.text : '[Aquí el usuario adjuntó una imagen que ahora mismo no puedes ver.]'))
      .join('\n\n');
    return { ...m, content: text };
  });
}
