/* ============================================
   MIRAI AI - Investigación: búsqueda con Exa, scraping con Firecrawl y resumen

   ============================================ */
import { callAI } from '../lib/ai';
import { AI_MODEL_NORMAL } from '../lib/ai-models';
import { requireAuth } from '../lib/auth';
import { jsonResponse } from '../lib/http';
import { calcCost, logApiUsage } from '../lib/usage';

// ════════════════════════════════════════════════════════════
// INVESTIGADOR WEB — handler principal
// ════════════════════════════════════════════════════════════

/**
 * POST /api/investigation/search
 * Body: { question: string }
 *
 * Flujo:
 *  1. Autenticar usuario (cookie HttpOnly)
 *  2. 3 búsquedas en paralelo con Exa (web, news, research paper)
 *  3. Scrapeo en paralelo de hasta 12 URLs con Firecrawl
 *  4. DeepSeek genera el resumen parafraseado en tercera persona
 *  5. Devuelve { summary, sources[] }
 */
export async function handleInvestigationSearch(request, env, corsHeaders) {
  // ── 1. Autenticación ──
  const userDni = await requireAuth(request, env);
  if (!userDni) {
    return jsonResponse({ error: 'No autorizado. Inicia sesión.' }, 401, corsHeaders);
  }

  // ── 2. Leer cuerpo ──
  let question;
  try {
    const body = await request.json();
    question = (body.question || '').trim();
  } catch (_) {
    return jsonResponse({ error: 'Cuerpo de la solicitud inválido.' }, 400, corsHeaders);
  }

  if (!question) {
    return jsonResponse({ error: 'El campo "question" es requerido.' }, 400, corsHeaders);
  }

  if (question.length > 500) {
    return jsonResponse({ error: 'La pregunta es demasiado larga (máximo 500 caracteres).' }, 400, corsHeaders);
  }

  console.log(`🔭 [Investigation] Usuario: ${userDni} | Pregunta: ${question.substring(0, 80)}`);

  // ── 3. Búsquedas paralelas con Exa ──
  let exaResults = [];
  try {
    exaResults = await searchWithExa(question, env);
    console.log(`✅ [Investigation] Exa devolvió ${exaResults.length} URLs`);
  } catch (err) {
    console.error('❌ [Investigation] Error en Exa:', err.message);
    return jsonResponse({ error: 'No se pudo realizar la búsqueda. Intenta de nuevo.' }, 502, corsHeaders);
  }

  if (exaResults.length === 0) {
    return jsonResponse({ error: 'No se encontraron resultados para esa pregunta.' }, 404, corsHeaders);
  }

  // ── 4. Scrapeo en paralelo con Firecrawl ──
  let scrapedContents = new Map<string, string>();
  try {
    scrapedContents = await scrapeAllUrls(exaResults, env);
    console.log(`✅ [Investigation] Firecrawl obtuvo contenido de ${scrapedContents.size} páginas`);
  } catch (err) {
    console.error('❌ [Investigation] Error en Firecrawl:', err.message);
    // No es fatal: si falla el scraping usamos los highlights de Exa como fallback
  }

  // ── 5. Construir el contexto para DeepSeek ──
  const contextBlocks = buildContextBlocks(exaResults, scrapedContents);

  // Mapa de identificadores de cita para que DeepSeek use exactamente
  // el mismo texto que aparecerá en las referencias del frontend
  const citationIds = exaResults.map((r, i) => {
    let id = '';
    if (r.author) {
      // Usar apellido del primer autor
      const firstAuthor = r.author.split(',')[0].trim();
      const parts = firstAuthor.split(' ').filter(Boolean);
      id = parts.length >= 2 ? parts[parts.length - 1] : firstAuthor;
    } else if (r.title && !r.title.startsWith('http')) {
      // Primeras 3 palabras significativas del título
      id = r.title.split(' ').filter(w => w.length > 2).slice(0, 3).join(' ');
    } else {
      // Fallback: hostname limpio
      try { id = new URL(r.url).hostname.replace('www.', ''); } catch (_) { id = `Fuente ${i + 1}`; }
    }
    let year = 's.f.';
    if (r.publishedDate) {
      try { year = String(new Date(r.publishedDate).getFullYear()); } catch (_) { }
    }
    return `Fuente [${i + 1}] → citar como: (${id}, ${year})`;
  }).join('\n');

  if (contextBlocks.trim().length < 100) {
    return jsonResponse({ error: 'No se pudo extraer suficiente contenido de las fuentes encontradas.' }, 422, corsHeaders);
  }

  // ── 6. Generar resumen con DeepSeek ──
  let summary;
  try {
    summary = await generateResearchSummary(question, contextBlocks, citationIds, env);
    console.log(`✅ [Investigation] Resumen generado (${summary.length} caracteres)`);
  } catch (err) {
    console.error('❌ [Investigation] Error en DeepSeek:', err.message);
    return jsonResponse({ error: 'No se pudo generar el resumen. Intenta de nuevo.' }, 502, corsHeaders);
  }

  // ── 7. Construir lista de fuentes para el frontend ──
  const sources = exaResults.map(r => ({
    title: r.title || r.url,
    url: r.url,
    type: r.type,            // 'web' | 'news' | 'academic'
    author: r.author || null,
    publishedDate: r.publishedDate || null,
  }));

  // ── 8. Guardar en historial ──
  try {
    await env.MIRAI_AI_DB.prepare(`
      CREATE TABLE IF NOT EXISTS inv_history (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        user_dni   TEXT    NOT NULL,
        question   TEXT    NOT NULL,
        summary    TEXT    NOT NULL,
        sources    TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    await env.MIRAI_AI_DB.prepare(`
      INSERT INTO inv_history (user_dni, question, summary, sources)
      VALUES (?, ?, ?, ?)
    `).bind(
      userDni.toUpperCase(),
      question.substring(0, 500),
      summary.substring(0, 8000),
      JSON.stringify(sources).substring(0, 8000)
    ).run();
  } catch (err) {
    console.error('⚠️ [Investigation] Error al guardar historial:', err.message);
  }

  return jsonResponse({ summary, sources }, 200, corsHeaders);
}

// ════════════════════════════════════════════════════════════
// GET /api/investigation/history — listar historial del usuario
// ════════════════════════════════════════════════════════════

export async function handleInvestigationHistoryList(request, env, corsHeaders) {
  const userDni = await requireAuth(request, env);
  if (!userDni) {
    return jsonResponse({ error: 'No autorizado.' }, 401, corsHeaders);
  }

  try {
    await env.MIRAI_AI_DB.prepare(`
      CREATE TABLE IF NOT EXISTS inv_history (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        user_dni   TEXT    NOT NULL,
        question   TEXT    NOT NULL,
        summary    TEXT    NOT NULL,
        sources    TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    const { results } = await env.MIRAI_AI_DB.prepare(`
      SELECT id, question, summary, sources, created_at
      FROM inv_history
      WHERE user_dni = ?
      ORDER BY created_at DESC
      LIMIT 50
    `).bind(userDni.toUpperCase()).all();

    const items = (results || []).map(r => ({
      id: r.id,
      question: r.question,
      summary: r.summary,
      sources: r.sources ? JSON.parse(r.sources) : [],
      created_at: r.created_at,
    }));

    return jsonResponse({ history: items }, 200, corsHeaders);
  } catch (err) {
    console.error('❌ [Investigation] Error al listar historial:', err.message);
    return jsonResponse({ error: 'Error al cargar historial.' }, 500, corsHeaders);
  }
}

// ════════════════════════════════════════════════════════════
// DELETE /api/investigation/history — eliminar entrada del historial
// ════════════════════════════════════════════════════════════

export async function handleInvestigationHistoryDelete(request, env, corsHeaders) {
  const userDni = await requireAuth(request, env);
  if (!userDni) {
    return jsonResponse({ error: 'No autorizado.' }, 401, corsHeaders);
  }

  let id;
  try {
    const body = await request.json();
    id = body.id;
  } catch (_) {
    return jsonResponse({ error: 'Cuerpo inválido.' }, 400, corsHeaders);
  }

  if (!id) {
    return jsonResponse({ error: 'Se requiere el campo "id".' }, 400, corsHeaders);
  }

  try {
    await env.MIRAI_AI_DB.prepare(`
      DELETE FROM inv_history WHERE id = ? AND user_dni = ?
    `).bind(id, userDni.toUpperCase()).run();

    return jsonResponse({ success: true }, 200, corsHeaders);
  } catch (err) {
    console.error('❌ [Investigation] Error al eliminar historial:', err.message);
    return jsonResponse({ error: 'Error al eliminar.' }, 500, corsHeaders);
  }
}

// ════════════════════════════════════════════════════════════
// EXA — 3 búsquedas en paralelo
// ════════════════════════════════════════════════════════════

/**
 * Lanza 3 búsquedas en paralelo en Exa:
 *   - Resultados generales (web)
 *   - Noticias recientes (news)
 *   - Artículos académicos (research paper)
 *
 * Devuelve un array plano de hasta 12 resultados con su tipo.
 */
async function searchWithExa(question, env) {
  const EXA_API_KEY = env.EXA_API_KEY;
  if (!EXA_API_KEY) throw new Error('EXA_API_KEY no configurada en Cloudflare.');

  const EXA_URL = 'https://api.exa.ai/search';
  const NUM_RESULTS = 4;

  const searches = [
    { category: undefined, type: 'web' },
    { category: 'news', type: 'news' },
    { category: 'research paper', type: 'academic' },
  ];

  const fetchExa = async ({ category, type }) => {
    const body: Record<string, any> = {
      query: question,
      numResults: NUM_RESULTS,
      type: 'auto',
      contents: {
        highlights: true,   // fragmentos relevantes — token-efficient
      },
    };
    if (category) body.category = category;

    const res = await fetch(EXA_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': EXA_API_KEY,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => res.status);
      throw new Error(`Exa [${category || 'general'}] ${res.status}: ${err}`);
    }

    const data: any = await res.json();
    await logApiUsage(env, { provider: 'exa', unit_type: 'search', sub_type: type, cost_usd: calcCost('exa', null) });
    return (data.results || []).map(r => ({
      url: r.url,
      title: r.title || '',
      author: r.author || null,   // para APA 7
      publishedDate: r.publishedDate || null,   // para APA 7 (ISO 8601)
      highlights: r.highlights || [],
      type,
    }));
  };

  // Ejecutar en paralelo; si una falla no rompe todo
  const settled = await Promise.allSettled(searches.map(fetchExa));
  const results = [];
  settled.forEach(s => {
    if (s.status === 'fulfilled') results.push(...s.value);
    else console.warn('⚠️ [Exa] Búsqueda parcial fallida:', s.reason?.message);
  });

  // Deduplicar por URL
  const seen = new Set();
  return results.filter(r => {
    if (!r.url || seen.has(r.url)) return false;
    seen.add(r.url);
    return true;
  });
}

// ════════════════════════════════════════════════════════════
// FIRECRAWL — scraping en paralelo
// ════════════════════════════════════════════════════════════

/**
 * Scrapea todas las URLs en paralelo con Firecrawl /scrape.
 * Usa concurrencia limitada (4 a la vez) para no exceder rate limits.
 *
 * @param {Array}  exaResults — resultados de Exa con .url
 * @param {object} env
 * @returns {Map<url, markdown>}
 */
async function scrapeAllUrls(exaResults, env) {
  const FIRECRAWL_KEY = env.FIRECRAWL_API_KEY;
  if (!FIRECRAWL_KEY) {
    console.warn('⚠️ FIRECRAWL_API_KEY no configurada — se usarán solo los highlights de Exa.');
    return new Map();
  }

  const CONCURRENCY = 4;   // peticiones simultáneas a Firecrawl
  const TIMEOUT_MS = 12000;

  const scrapeOne = async (url) => {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

      const res = await fetch('https://api.firecrawl.dev/v1/scrape', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${FIRECRAWL_KEY}`,
        },
        body: JSON.stringify({
          url,
          formats: ['markdown'],
          onlyMainContent: true,          // descarta nav, footer, ads
          excludeTags: ['nav', 'footer', 'aside', 'script', 'style', 'form'],
        }),
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        console.warn(`⚠️ Firecrawl HTTP ${res.status} [${url}]: ${errBody.substring(0, 300)}`);
        return { url, markdown: null };
      }

      const data: any = await res.json();
      await logApiUsage(env, { provider: 'firecrawl', unit_type: 'scrape', cost_usd: calcCost('firecrawl', null) });
      return { url, markdown: data?.data?.markdown || null };
    } catch (err) {
      console.warn(`⚠️ Firecrawl error [${url}]:`, err.message);
      return { url, markdown: null };
    }
  };

  // Procesar en lotes de CONCURRENCY
  const urls = exaResults.map(r => r.url);
  const results = new Map();

  for (let i = 0; i < urls.length; i += CONCURRENCY) {
    const batch = urls.slice(i, i + CONCURRENCY);
    const settled = await Promise.all(batch.map(scrapeOne));
    settled.forEach(({ url, markdown }) => {
      if (markdown) results.set(url, markdown);
    });
  }

  return results;
}

// ════════════════════════════════════════════════════════════
// BUILDER — construye el bloque de contexto para DeepSeek
// ════════════════════════════════════════════════════════════

/**
 * Combina el contenido scrapeado (Firecrawl) con los highlights (Exa).
 * Prioriza el markdown de Firecrawl; cae en los highlights si no hay scraping.
 *
 * @param {Array}  exaResults       — resultados de Exa
 * @param {Map}    scrapedContents  — Map<url, markdown> de Firecrawl
 * @returns {string}                — bloque de texto listo para el prompt
 */
function buildContextBlocks(exaResults, scrapedContents) {
  const MAX_CHARS_PER_SOURCE = 3500;
  const blocks = [];

  exaResults.forEach((r, idx) => {
    const scraped = scrapedContents instanceof Map ? scrapedContents.get(r.url) : null;
    const highlights = (r.highlights || []).join(' ').trim();

    // Prioridad: markdown scrapeado → highlights de Exa → nada
    let content = scraped
      ? scraped.substring(0, MAX_CHARS_PER_SOURCE)
      : highlights.substring(0, MAX_CHARS_PER_SOURCE);

    if (!content) return; // fuente sin contenido útil

    const label = r.type === 'academic' ? 'Fuente académica'
      : r.type === 'news' ? 'Noticia'
        : 'Página web';

    blocks.push(
      `--- [${idx + 1}] ${label}: ${r.title || r.url} ---\n` +
      `URL: ${r.url}\n\n` +
      content
    );
  });

  return blocks.join('\n\n');
}

// ════════════════════════════════════════════════════════════
// DEEPSEEK — generación del resumen
// ════════════════════════════════════════════════════════════

/**
 * Llama a DeepSeek para generar un resumen académico
 * parafraseado en tercera persona.
 */
async function generateResearchSummary(question, contextBlocks, citationIds, env) {
  const systemPrompt = `Eres un asistente de investigación académica experto.
Tu tarea es leer múltiples fuentes web y generar un resumen de investigación riguroso y útil.
 
REGLAS OBLIGATORIAS:
1. Redacta SIEMPRE en tercera persona. Nunca uses "yo", "nosotros" ni te dirijas al lector con "tú".
2. Usa un lenguaje técnico y profesional, con terminología propia del área temática.
3. Usa conectivos lógicos entre oraciones y párrafos (por ejemplo: "asimismo", "no obstante", "en ese sentido", "por otro lado", "de igual manera", "cabe destacar que", "en relación con esto", etc.).
4. PROHIBIDO usar conectivos concluyentes: NO uses "finalmente", "en conclusión", "en síntesis", "para concluir", "en resumen", "en definitiva", ni ninguna expresión de cierre similar.
5. NO escribas una conclusión. El texto termina con el último párrafo de desarrollo, sin cierre ni síntesis final.
6. Parafrasea completamente todo el contenido. NUNCA copies frases textuales de las fuentes.
7. Descarta: publicidad, menús de navegación, pies de página, cookies, suscripciones y contenido sin relevancia a la pregunta.
8. Cita las fuentes al FINAL de cada PÁRRAFO (no al final de cada oración). Coloca todas las fuentes usadas en ese párrafo en una sola cita agrupada al final, antes del punto final. Formato: (Título de la fuente, Año). Si hay varias, sepáralas con punto y coma: (Fuente A, 2020; Fuente B, s.f.). NUNCA repitas citas dentro del mismo párrafo.
9. Para el título de la cita: usa el título del documento tal como aparece en el contexto, abreviado a las primeras 4-6 palabras significativas si es largo. Si no hay título usa el hostname de la URL sin "www." ni rutas. NUNCA uses la URL completa ni el hostname solo como cita.
10. Si una fuente no tiene información relevante para la pregunta, ignórala por completo.
11. El texto debe tener entre 400 y 700 palabras. Es OBLIGATORIO terminar todas las oraciones y párrafos completos. NUNCA dejes una oración a medias.
12. Estructura obligatoria:
    - Introducción (1 párrafo): presenta el tema, su contexto y su relevancia académica.
    - Desarrollo (2-3 párrafos): expone los hallazgos, conceptos y datos clave con citas al final de cada párrafo.
13. NO incluyas lista de referencias al final; las citas van únicamente al final de cada párrafo.
14. NO inventes información que no esté en las fuentes proporcionadas.
15. Cuando debas incluir fórmulas o expresiones matemáticas, escríbelas en Unicode matemático legible, NO en LaTeX. Ejemplo: e ≈ 1.6 × 10⁻¹⁹ C, F = k·q₁·q₂/r², E = mc².`;

  const userPrompt =
    `IDENTIFICADORES DE CITA OBLIGATORIOS (usa EXACTAMENTE este texto en cada cita, sin modificarlo):\n${citationIds}\n\n` +
    `A continuación están las fuentes que debes analizar:\n\n` + contextBlocks +
    `\n\nPregunta de investigación: "${question}"`;

  // Nota: los títulos de cada fuente ya aparecen en el encabezado de cada bloque
  // del contextBlocks con el formato: --- [N] Tipo: Título --- URL: ...
  // DeepSeek usará esos títulos para construir las citas (regla 9 del systemPrompt).

  const summary = await callAI(
    AI_MODEL_NORMAL,
    [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
    { temperature: 0.4, max_tokens: 3000 },
    env
  );

  if (!summary) throw new Error('DeepSeek devolvió una respuesta vacía.');

  return summary.trim();
}
