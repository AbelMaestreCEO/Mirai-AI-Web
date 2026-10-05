/* ============================================
   MIRAI AI - Formato de documentos DOCX

   ============================================ */
import { requireAuth } from '../lib/auth';
import { isValidDocx, processDocxFile } from '../lib/docx-parser';
import { jsonResponse } from '../lib/http';
import { createZipArchive, generateZipName } from '../lib/zip-builder';

/**
 * Borra de R2 los ficheros de format/ cuyo customMetadata.expiresAt ya pasó.
 * list() devuelve como máximo 1000 objetos por página: sin recorrer el cursor,
 * todo lo que pasara de ahí no se borraba nunca.
 */
export async function cleanupExpiredFormatFiles(env: Env) {
  const now = Date.now();
  let deleted = 0;
  let cursor;

  do {
    const listed = await env.MIRAI_AI_ASSETS.list({ prefix: 'format/', cursor });

    for (const obj of listed.objects) {
      const exp = obj.customMetadata?.expiresAt;
      if (exp && now > new Date(exp).getTime()) {
        await env.MIRAI_AI_ASSETS.delete(obj.key);
        deleted++;
      }
    }

    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);

  console.log(`[Scheduled] Format cleanup: ${deleted} archivos eliminados.`);
}

// El tempId lo genera el cliente y viaja en cada petición, así que por sí solo
// no identifica a nadie: el prefijo de R2 se namespacea con el DNI de la sesión
// para que un tempId ajeno no dé acceso a los documentos de otro usuario.
function formatPrefix(kind: string, userDni: string, tempId: string) {
  // El tempId también entra en la clave: se restringe a UUID/alfanumérico para
  // que no pueda escaparse del prefijo con "/" o "..".
  const safeTempId = String(tempId).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
  return `format/${kind}/${userDni.toUpperCase()}/${safeTempId}/`;
}

const FORMAT_MAX_FILES = 30;

const FORMAT_MAX_FILE_SIZE = 25 * 1024 * 1024;

export async function handleFormatUpload(request: Request, env: Env, corsHeaders: Record<string, string>) {
  const userDni = await requireAuth(request, env);
  if (!userDni) return jsonResponse({ error: 'No autorizado' }, 401, corsHeaders);

  const formData = await request.formData();
  const tempId = (formData.get('tempId') as string | null) || crypto.randomUUID();
  const files = formData.getAll('files') as File[];

  if (!files || files.length === 0)
    return jsonResponse({ error: 'No se enviaron archivos.' }, 400, corsHeaders);

  if (files.length > FORMAT_MAX_FILES)
    return jsonResponse({ error: `Máximo ${FORMAT_MAX_FILES} archivos por lote.` }, 400, corsHeaders);

  const prefix = formatPrefix('temp', userDni, tempId);
  const keys: any[] = [];
  for (const file of files) {
    if (file.size > FORMAT_MAX_FILE_SIZE) continue;
    const buf = await file.arrayBuffer();
    if (!isValidDocx(buf)) continue;
    // El nombre original entra en la clave: se sanea para no salirse del prefijo.
    const safeName = (file.name || 'documento.docx').replace(/[^\w\-. ]/g, '_').slice(0, 120);
    const key = `${prefix}${safeName}`;
    await env.MIRAI_AI_ASSETS.put(key, buf, {
      httpMetadata: { contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
      customMetadata: { tempId, expiresAt: new Date(Date.now() + 3_600_000).toISOString() }
    });
    keys.push(key);
  }

  if (keys.length === 0)
    return jsonResponse({ error: 'Ningún archivo DOCX válido.' }, 400, corsHeaders);

  return jsonResponse({ success: true, tempId, count: keys.length }, 200, corsHeaders);
}

export async function handleFormatProcess(request: Request, env: Env, corsHeaders: Record<string, string>) {
  const userDni = await requireAuth(request, env);
  if (!userDni) return jsonResponse({ error: 'No autorizado' }, 401, corsHeaders);

  const { tempId, rules } = await request.json<any>();

  if (!tempId || !Array.isArray(rules) || rules.length === 0)
    return jsonResponse({ error: 'Faltan tempId o rules.' }, 400, corsHeaders);

  const listed = await env.MIRAI_AI_ASSETS.list({ prefix: formatPrefix('temp', userDni, tempId) });
  if (listed.objects.length === 0)
    return jsonResponse({ error: 'Archivos no encontrados.' }, 404, corsHeaders);

  const results: any[] = [];
  for (const obj of listed.objects) {
    try {
      const fileObj = await env.MIRAI_AI_ASSETS.get(obj.key);
      // Puede haberlo borrado el cron de limpieza entre el list() y el get().
      if (!fileObj) throw new Error(`Archivo no encontrado en R2: ${obj.key}`);
      const buf = await fileObj.arrayBuffer();
      const result = await processDocxFile(buf, rules);
      const modKey = `${formatPrefix('modified', userDni, tempId)}${obj.key.split('/').pop()}`;
      const modBuf = await result.blob.arrayBuffer();

      await env.MIRAI_AI_ASSETS.put(modKey, modBuf, {
        httpMetadata: { contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
        customMetadata: { tempId, expiresAt: new Date(Date.now() + 3_600_000).toISOString() }
      });

      results.push({ original: obj.key, modified: modKey, matches: result.matches });
    } catch (err: any) {
      results.push({ original: obj.key, error: err.message });
    }
  }

  return jsonResponse({ success: true, tempId, results }, 200, corsHeaders);
}

export async function handleFormatDownload(request: Request, env: Env, corsHeaders: Record<string, string>) {
  const userDni = await requireAuth(request, env);
  if (!userDni) return jsonResponse({ error: 'No autorizado' }, 401, corsHeaders);

  const url = new URL(request.url);
  const tempId = url.searchParams.get('tempId');
  if (!tempId) return jsonResponse({ error: 'Falta tempId.' }, 400, corsHeaders);

  const listed = await env.MIRAI_AI_ASSETS.list({ prefix: formatPrefix('modified', userDni, tempId) });
  if (listed.objects.length === 0)
    return jsonResponse({ error: 'Sin archivos procesados.' }, 404, corsHeaders);

  if (listed.objects.length === 1) {
    const obj = listed.objects[0];
    const file = await env.MIRAI_AI_ASSETS.get(obj.key);
    // Puede haberlo borrado el cron de limpieza entre el list() y el get().
    if (!file) return jsonResponse({ error: 'Archivos no encontrados.' }, 404, corsHeaders);
    return new Response(file.body, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${obj.key.split('/').pop()}"`,
        ...corsHeaders
      }
    });
  }

  const zipFiles: any[] = [];
  for (const obj of listed.objects) {
    const file = await env.MIRAI_AI_ASSETS.get(obj.key);
    if (!file) return jsonResponse({ error: 'Archivos no encontrados.' }, 404, corsHeaders);
    zipFiles.push({ filename: obj.key.split('/').pop(), data: new Uint8Array(await file.arrayBuffer()) });
  }

  const zipData = createZipArchive(zipFiles);
  return new Response(zipData, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${generateZipName(zipFiles.length)}"`,
      ...corsHeaders
    }
  });
}
