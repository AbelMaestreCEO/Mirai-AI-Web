/* ============================================
   MIRAI AI - Ver imágenes con DeepSeek
   La foto y la pregunta van JUNTAS a deepseek-flash, que ve la imagen.

   Sustituye al camino anterior en dos pasos (Llama 3.2 Vision de Workers AI
   describía la imagen en inglés y luego DeepSeek trabajaba sobre esa
   descripción): lo que la descripción no contaba —un detalle, un texto
   pequeño, el color exacto— se perdía antes de llegar a quien decidía.

   Sin respaldo a propósito: si DeepSeek no responde, se lanza y quien llama
   hace lo que ya hacía cuando fallaba la visión (el aula pone nota
   provisional; el inventario deja el producto sin etiquetas).
   ============================================ */
import { AI_MODEL_VISION } from './ai-models';
import { calcCost, logApiUsage } from './usage';

const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';

/** Lo más que se acepta inline (base64): el límite de DeepSeek por imagen. */
const MAX_BYTES = 32 * 1024 * 1024;

/** El formato sale de los bytes, como hace DeepSeek, y no del nombre del archivo. */
export function mimeDeImagen(bytes: Uint8Array): string | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return 'image/gif';
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
      bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return 'image/webp';
  return null;
}

function aBase64(bytes: Uint8Array): string {
  let binario = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binario += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binario);
}

export interface VisionOptions {
  /** Pensar antes de contestar (calificar sí; etiquetar un producto no). */
  thinking?: boolean;
  max_tokens?: number;
  /** Solo sin pensar: en modo pensamiento DeepSeek la ignora. */
  temperature?: number;
  /** 'low' reduce la imagen a 512×512: más rápido, para cuando el detalle no importa. */
  detail?: 'low' | 'high' | 'auto';
}

/**
 * Le enseña la imagen a deepseek-flash con `prompt` y devuelve lo que contesta.
 * Lanza si la imagen no es JPEG/PNG/GIF/WebP o si DeepSeek falla.
 */
export async function callVision(
  prompt: string,
  imagen: ArrayBuffer,
  options: VisionOptions,
  env: Env
): Promise<string> {
  const bytes = new Uint8Array(imagen);
  const mime = mimeDeImagen(bytes);
  if (!mime) throw new Error('La imagen tiene que ser JPEG, PNG, GIF o WebP');
  if (bytes.byteLength > MAX_BYTES) throw new Error('La imagen pasa de 32 MB');

  const thinking = options.thinking === true;
  const cuerpo: Record<string, unknown> = {
    model: AI_MODEL_VISION,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          {
            type: 'image_url',
            image_url: {
              url: `data:${mime};base64,${aBase64(bytes)}`,
              ...(options.detail ? { detail: options.detail } : {})
            }
          }
        ]
      }
    ],
    // deepseek-flash piensa por defecto: se apaga salvo que se pida.
    thinking: { type: thinking ? 'enabled' : 'disabled' },
    max_tokens: options.max_tokens ?? 1024,
    stream: false
  };
  if (!thinking) cuerpo.temperature = options.temperature ?? 0.3;

  console.log(`👁️ Llamando DeepSeek con imagen: ${AI_MODEL_VISION} (${mime}, ${bytes.byteLength} bytes)`);

  const response = await fetch(DEEPSEEK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${env.DEEPSEEK_API_KEY}`
    },
    body: JSON.stringify(cuerpo)
  });

  if (!response.ok) {
    throw new Error(`DeepSeek (visión) error ${response.status}: ${(await response.text()).slice(0, 300)}`);
  }

  const datos = await response.json<{
    choices?: { message?: { content?: string | null } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_cache_hit_tokens?: number };
  }>();

  await logApiUsage(env, {
    provider: 'deepseek',
    unit_type: 'tokens',
    sub_type: AI_MODEL_VISION,
    tokens_in: datos.usage?.prompt_tokens ?? null,
    tokens_out: datos.usage?.completion_tokens ?? null,
    cost_usd: calcCost('deepseek', AI_MODEL_VISION, {
      tokensIn: datos.usage?.prompt_tokens ?? 0,
      tokensOut: datos.usage?.completion_tokens ?? 0,
      cacheHitTokens: datos.usage?.prompt_cache_hit_tokens ?? 0
    })
  });

  const texto = (datos.choices?.[0]?.message?.content ?? '').trim();
  if (!texto) throw new Error('DeepSeek (visión) respondió vacío');
  return texto;
}
