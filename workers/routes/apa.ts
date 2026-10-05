/* ============================================
   MIRAI AI - Documentos APA

   ============================================ */
import { isAdminUser, requireAuth } from '../lib/auth';
import { jsonResponse } from '../lib/http';

export async function handleApaUpload(request: Request, env: Env, corsHeaders: Record<string, string>) {
  try {
    // El módulo APA guardaba y servía documentos sin ninguna autenticación, y el
    // dueño salía de metadata.userId enviado por el cliente (falsificable). Ahora
    // el dueño es siempre el DNI de la sesión.
    const userDni = await requireAuth(request, env);
    if (!userDni) return jsonResponse({ error: 'No autorizado' }, 401, corsHeaders);

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const metadataRaw = formData.get('metadata') as string | null;

    if (!file) {
      return jsonResponse({ error: 'No file provided' }, 400, corsHeaders);
    }

    if (!file.name.toLowerCase().endsWith('.docx')) {
      return jsonResponse({ error: 'Invalid file type. Only .DOCX allowed.' }, 400, corsHeaders);
    }

    const MAX_SIZE = 25 * 1024 * 1024; // 25 MB
    if (file.size > MAX_SIZE) {
      return jsonResponse({ error: 'File too large. Maximum 25MB.' }, 413, corsHeaders);
    }

    const fileId = crypto.randomUUID();
    const timestamp = new Date().toISOString();
    const ownerDni = userDni.toUpperCase();
    let metadata = {};
    try { metadata = JSON.parse(metadataRaw || '{}'); } catch (_) { }

    // customMetadata de R2 solo admite valores string: un objeto anidado dentro
    // de `metadata` hacía fallar el put(). Se aplanan a string y se descarta
    // cualquier intento del cliente de sobreescribir owner/originalName.
    const safeCustomMetadata: Record<string, string> = { originalName: file.name, uploadedAt: timestamp, ownerDni };
    for (const [key, value] of Object.entries(metadata)) {
      if (key === 'originalName' || key === 'uploadedAt' || key === 'ownerDni') continue;
      if (value == null) continue;
      safeCustomMetadata[key] = typeof value === 'string' ? value : JSON.stringify(value);
    }

    // Guardar en R2 (bucket MIRAI_AI_ASSETS, prefijo apa/)
    await env.MIRAI_AI_ASSETS.put(`apa/${fileId}`, file.stream(), {
      httpMetadata: {
        contentType: file.type || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      },
      customMetadata: safeCustomMetadata
    });

    // Registrar en D1 — user_id sale de la sesión, no del cuerpo de la petición.
    await env.MIRAI_AI_DB
      .prepare(`INSERT INTO apa_files (id, original_name, file_type, size, uploaded_at, user_id, metadata_json)
                VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .bind(fileId, file.name, file.type, file.size, timestamp, ownerDni, JSON.stringify(metadata))
      .run();

    return jsonResponse({
      success: true,
      fileId,
      message: 'Archivo guardado correctamente',
      downloadUrl: `/api/apa/download/${fileId}`,
      fileName: file.name
    }, 200, corsHeaders);

  } catch (error) {
    console.error('[APA Upload] Error:', error);
    return jsonResponse({ error: 'Upload failed', message: error.message }, 500, corsHeaders);
  }
}

/** Devuelve la fila apa_files si pertenece al usuario (o si es admin); si no, null. */
async function getOwnedApaFile(fileId: string, userDni: string, env: Env) {
  const row = await env.MIRAI_AI_DB.prepare(
    'SELECT id, user_id, original_name FROM apa_files WHERE id = ?'
  ).bind(fileId).first<any>();
  if (!row) return null;

  const dni = userDni.toUpperCase();
  if ((row.user_id || '').toUpperCase() === dni) return row;
  return (await isAdminUser(dni, env)) ? row : null;
}

export async function handleApaDownload(fileId: string, request: Request, env: Env, corsHeaders: Record<string, string>) {
  if (!fileId) return jsonResponse({ error: 'File ID required' }, 400, corsHeaders);

  try {
    const userDni = await requireAuth(request, env);
    if (!userDni) return jsonResponse({ error: 'No autorizado' }, 401, corsHeaders);

    // Sin esta comprobación, conocer un fileId bastaba para descargar el
    // documento de cualquier usuario.
    const owned = await getOwnedApaFile(fileId, userDni, env);
    if (!owned) return jsonResponse({ error: 'File not found' }, 404, corsHeaders);

    const object = await env.MIRAI_AI_ASSETS.get(`apa/${fileId}`);
    if (!object) return jsonResponse({ error: 'File not found' }, 404, corsHeaders);

    const headers = new Headers(corsHeaders);
    object.writeHttpMetadata(headers);
    headers.set('Content-Disposition', `attachment; filename="${object.customMetadata?.originalName || 'documento.docx'}"`);
    headers.set('Cache-Control', 'private, no-store');

    return new Response(object.body, { headers });
  } catch (error) {
    console.error('[APA Download] Error:', error);
    return jsonResponse({ error: 'Download failed', message: error.message }, 500, corsHeaders);
  }
}

export async function handleApaHistory(request: Request, env: Env, corsHeaders: Record<string, string>) {
  try {
    const userDni = await requireAuth(request, env);
    if (!userDni) return jsonResponse({ error: 'No autorizado' }, 401, corsHeaders);

    const url = new URL(request.url);
    // El historial siempre se acota al usuario de la sesión. Antes, llamar sin
    // ?userId devolvía los documentos de TODOS los usuarios con su downloadUrl,
    // y el parámetro userId permitía leer el historial de cualquier otro.
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '10', 10) || 10));
    const offset = Math.max(0, parseInt(url.searchParams.get('offset') || '0', 10) || 0);

    const { results } = await env.MIRAI_AI_DB.prepare(
      `SELECT id, original_name, file_type, size, uploaded_at
         FROM apa_files WHERE user_id = ?
        ORDER BY uploaded_at DESC LIMIT ? OFFSET ?`
    ).bind(userDni.toUpperCase(), limit, offset).all<any>();

    return jsonResponse({
      files: results.map(r => ({
        id: r.id,
        fileName: r.original_name,
        fileType: r.file_type,
        size: r.size,
        uploadedAt: r.uploaded_at,
        downloadUrl: `/api/apa/download/${r.id}`
      }))
    }, 200, corsHeaders);

  } catch (error) {
    console.error('[APA History] Error:', error);
    return jsonResponse({ error: 'History fetch failed', message: error.message }, 500, corsHeaders);
  }
}

export async function handleApaDelete(fileId: string, request: Request, env: Env, corsHeaders: Record<string, string>) {
  if (!fileId) return jsonResponse({ error: 'File ID required' }, 400, corsHeaders);

  try {
    const userDni = await requireAuth(request, env);
    if (!userDni) return jsonResponse({ error: 'No autorizado' }, 401, corsHeaders);

    // Antes cualquiera podía borrar el archivo de cualquiera con solo su ID.
    const owned = await getOwnedApaFile(fileId, userDni, env);
    if (!owned) return jsonResponse({ error: 'File not found' }, 404, corsHeaders);

    await env.MIRAI_AI_ASSETS.delete(`apa/${fileId}`);
    await env.MIRAI_AI_DB.prepare('DELETE FROM apa_files WHERE id = ?').bind(fileId).run();
    return jsonResponse({ success: true, message: 'Archivo eliminado correctamente' }, 200, corsHeaders);
  } catch (error) {
    console.error('[APA Delete] Error:', error);
    return jsonResponse({ error: 'Delete failed', message: error.message }, 500, corsHeaders);
  }
}
