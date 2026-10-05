/* ============================================
   MIRAI AI - Consumo de APIs externas de pago
   Precios de referencia y registro en api_usage_log (/api/admin/api-usage).
   ============================================ */

// 💵 Precios de referencia en USD para el panel de consumo de APIs externas (/api/admin/api-usage).
// Verificado 2026-07-16. Fuentes: DeepSeek https://api-docs.deepseek.com/quick_start/pricing/ (oficial),
// Exa https://exa.ai/pricing, Firecrawl https://firecrawl.dev/pricing (plan Hobby),
// Pruna https://docs.pruna.ai — cada familia de modelos se cobra distinto, así
// que los precios están agrupados por forma de cobro en vez de por un único
// número por modelo:
//   flat/imagen            → precio fijo por imagen de salida (o de entrada, en p-judger)
//   ideogram               → $ por imagen según nivel de "thinking" y tamaño (1K/2K)
//   upscale_by_megapixels  → $ por imagen según los MP del objetivo, por tramos
//   video_per_second       → $ por segundo de vídeo generado, por resolución y
//                            modo draft (ver getMp4DurationSeconds())
// Google Maps https://developers.google.com/maps/billing-and-pricing/pricing.
// Actualizar manualmente cuando cambien los precios oficiales de cada proveedor.
const API_PRICING = {
  deepseek: {
    'deepseek-v4-flash': { input_cache_miss_per_1m: 0.14, input_cache_hit_per_1m: 0.0028, output_per_1m: 0.28 },
    'deepseek-v4-pro': { input_cache_miss_per_1m: 0.435, input_cache_hit_per_1m: 0.003625, output_per_1m: 0.87 },
  },
  pruna: {
    // Precio fijo por unidad. p-judger cobra por imagen *de entrada* evaluada.
    flat: {
      'p-image': 0.005,
      'p-image-edit': 0.01,
      'p-judger': 0.005,
    },
    // p-image-ideogram: $/imagen = f(thinking, image_size).
    ideogram: {
      'very low': { '1K': 0.003, '2K': 0.006 },
      'low': { '1K': 0.0075, '2K': 0.015 },
      'medium': { '1K': 0.01, '2K': 0.02 },
      'high': { '1K': 0.015, '2K': 0.03 },
      'very high': { '1K': 0.033, '2K': 0.066 },
    },
    // p-image-upscale: tramos por megapíxeles del objetivo (`target`, 1–128 MP).
    // Se busca el primer tramo cuyo max_mp cubra el objetivo pedido.
    upscale_by_megapixels: [
      { max_mp: 4, price: 0.005 },
      { max_mp: 8, price: 0.01 },
      { max_mp: 16, price: 0.02 },
      { max_mp: 32, price: 0.04 },
      { max_mp: 64, price: 0.06 },
      { max_mp: 128, price: 0.12 },
    ],
    // $ por segundo de vídeo generado. `draft` solo existe en los modelos que
    // lo soportan (p-video, p-video-edit); en el resto se ignora.
    // p-video-edit cobra igual en 720p y 1080p: su precio no depende de la
    // resolución sino del modo, pero se deja la misma forma para no tener dos
    // caminos distintos de cálculo.
    video_per_second: {
      'p-video': {
        standard: { '720p': 0.02, '1080p': 0.04 },
        draft: { '720p': 0.005, '1080p': 0.01 },
      },
      'p-video-avatar': {
        standard: { '720p': 0.025, '1080p': 0.045 },
      },
      'p-video-animate': {
        standard: { '720p': 0.03, '1080p': 0.06 },
      },
      'p-video-replace': {
        standard: { '720p': 0.03, '1080p': 0.06 },
      },
      'p-video-edit': {
        standard: { '720p': 0.045, '1080p': 0.045 },
        draft: { '720p': 0.025, '1080p': 0.025 },
      },
    },
  },
  cloudflare_email: { email: 0 }, // Email Sending: incluido en el plan Workers de pago
  exa: { search: 0.007 }, // Standard Search, $7 por 1000
  firecrawl: { scrape: 0.0032 }, // referencia plan Hobby
  youtube: { call: 0 }, // cuota gratuita de Google
  google_maps: { map_load: 0.007, places_autocomplete: 0, geocode: 0.005 },
};

// Precio por imagen de p-image-upscale según los megapíxeles pedidos.
function upscalePriceForMegapixels(targetMp) {
  const mp = Number(targetMp);
  if (!Number.isFinite(mp) || mp <= 0) return 0;
  const tier = API_PRICING.pruna.upscale_by_megapixels.find(t => mp <= t.max_mp);
  // Por encima del último tramo (128 MP) Pruna ya rechaza la petición, así que
  // si llegara algo mayor se cobra al tramo más caro en vez de devolver 0.
  return tier ? tier.price : API_PRICING.pruna.upscale_by_megapixels[API_PRICING.pruna.upscale_by_megapixels.length - 1].price;
}

export function calcCost(provider: string, subType: string | null, {
  units = 1, tokensIn = 0, tokensOut = 0, cacheHitTokens = 0,
  durationSeconds = null, resolution = '720p', draft = false,
  targetMegapixels = null, thinking = 'high', imageSize = '1K',
}: {
  units?: number;
  tokensIn?: number;
  tokensOut?: number;
  cacheHitTokens?: number;
  durationSeconds?: number | null;
  resolution?: string;
  draft?: boolean;
  targetMegapixels?: number | null;
  thinking?: string;
  imageSize?: string;
} = {}) {
  // Las tablas de precios se indexan con la clave tal cual llega: un subType
  // null busca 'null', que no existe, igual que hacía el JS implícitamente.
  const key = String(subType);
  try {
    switch (provider) {
      case 'deepseek': {
        const p = API_PRICING.deepseek[key];
        if (!p) return 0;
        const cacheMissTokens = Math.max(0, tokensIn - cacheHitTokens);
        return (cacheMissTokens / 1e6) * p.input_cache_miss_per_1m
          + (cacheHitTokens / 1e6) * p.input_cache_hit_per_1m
          + (tokensOut / 1e6) * p.output_per_1m;
      }
      case 'pruna': {
        const perSecond = API_PRICING.pruna.video_per_second[key];
        if (perSecond) {
          if (durationSeconds == null) return 0; // no se pudo determinar la duración real, no inventar un costo
          // Un modelo sin tarifa de draft (avatar, animate, replace) siempre
          // cobra la estándar, aunque llegue draft=true por error.
          const table = (draft && perSecond.draft) ? perSecond.draft : perSecond.standard;
          const rate = table[resolution] ?? table['720p'];
          return durationSeconds * rate;
        }

        if (subType === 'p-image-ideogram') {
          const byThinking = API_PRICING.pruna.ideogram[thinking] || API_PRICING.pruna.ideogram['high'];
          return (byThinking[imageSize] ?? byThinking['1K']) * units;
        }

        if (subType === 'p-image-upscale') {
          return upscalePriceForMegapixels(targetMegapixels) * units;
        }

        const flat = API_PRICING.pruna.flat[key];
        if (flat === undefined) {
          // Antes cualquier sub_type desconocido se registraba con costo 0 en
          // silencio, así que un modelo nuevo parecía gratis en el panel de
          // consumo hasta que alguien cuadraba la factura a mano.
          console.warn(`⚠️ calcCost: sub_type de Pruna sin precio configurado: ${subType}`);
          return 0;
        }
        return flat * units;
      }
      case 'cloudflare_email':
        return API_PRICING.cloudflare_email.email * units;
      case 'exa':
        return API_PRICING.exa.search * units;
      case 'firecrawl':
        return API_PRICING.firecrawl.scrape * units;
      case 'youtube':
        return API_PRICING.youtube.call * units;
      case 'google_maps':
        return (API_PRICING.google_maps[key] ?? 0) * units;
      default:
        return 0;
    }
  } catch {
    return 0;
  }
}

// --- CONSUMO DE APIs EXTERNAS (panel de administración) ---
export async function ensureApiUsageTable(env) {
  await env.MIRAI_AI_DB.prepare(`
    CREATE TABLE IF NOT EXISTS api_usage_log (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      provider      TEXT    NOT NULL,
      unit_type     TEXT    NOT NULL,
      sub_type      TEXT,
      units         REAL    NOT NULL DEFAULT 1,
      tokens_in     INTEGER,
      tokens_out    INTEGER,
      cost_usd      REAL    NOT NULL DEFAULT 0,
      user_dni      TEXT,
      via_gateway   INTEGER NOT NULL DEFAULT 0,
      usage_date    TEXT    NOT NULL,
      usage_month   TEXT    NOT NULL,
      created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
  await env.MIRAI_AI_DB.prepare(
    `CREATE INDEX IF NOT EXISTS idx_api_usage_month_provider ON api_usage_log (usage_month, provider)`
  ).run();
  await env.MIRAI_AI_DB.prepare(
    `CREATE INDEX IF NOT EXISTS idx_api_usage_month_provider_sub ON api_usage_log (usage_month, provider, sub_type)`
  ).run();
}

// Best-effort: un fallo al loguear consumo nunca debe romper la respuesta al usuario.
export async function logApiUsage(env, {
  provider, unit_type, sub_type = null, units = 1,
  tokens_in = null, tokens_out = null, cost_usd = 0,
  user_dni = null, via_gateway = false
}: {
  provider: string;
  unit_type: string;
  sub_type?: string | null;
  units?: number;
  tokens_in?: number | null;
  tokens_out?: number | null;
  cost_usd?: number;
  user_dni?: string | null;
  via_gateway?: boolean;
}) {
  try {
    await ensureApiUsageTable(env);
    const usage_date = new Date().toISOString().slice(0, 10);
    await env.MIRAI_AI_DB.prepare(`
      INSERT INTO api_usage_log
        (provider, unit_type, sub_type, units, tokens_in, tokens_out, cost_usd, user_dni, via_gateway, usage_date, usage_month)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      provider, unit_type, sub_type, units, tokens_in, tokens_out, cost_usd,
      user_dni ? user_dni.toUpperCase() : null, via_gateway ? 1 : 0,
      usage_date, usage_date.slice(0, 7)
    ).run();
  } catch (e) {
    console.warn('⚠️ logApiUsage falló (no crítico):', e.message);
  }
}
