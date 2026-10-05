/* ============================================
   MIRAI AI - Ubicaciones

   ============================================ */
import { requireAuth } from '../lib/auth';
import { jsonResponse } from '../lib/http';

async function ensureLocImagesColumn(env) {
  try {
    await env.MIRAI_AI_DB.prepare(
      `ALTER TABLE location_markers ADD COLUMN images TEXT DEFAULT '[]'`
    ).run();
  } catch (_) { }
}

export async function handleLocList(request, env, corsHeaders) {
  const userDni = await requireAuth(request, env);
  if (!userDni) return jsonResponse({ error: 'No autorizado' }, 401, corsHeaders);

  try {
    await ensureLocImagesColumn(env);
    const { results } = await env.MIRAI_AI_DB.prepare(`
      SELECT id, title, description, lat, lng, COALESCE(images, '[]') AS images, created_at
      FROM location_markers
      WHERE user_dni = ?
      ORDER BY created_at DESC
    `).bind(userDni).all();

    const markers = results.map(m => ({
      ...m,
      images: JSON.parse(m.images || '[]'),
    }));

    return jsonResponse({ markers }, 200, corsHeaders);
  } catch (err) {
    console.error('[Locations] List error:', err);
    return jsonResponse({ error: 'Error al obtener marcadores' }, 500, corsHeaders);
  }
}

export async function handleLocCreate(request, env, corsHeaders) {
  const userDni = await requireAuth(request, env);
  if (!userDni) return jsonResponse({ error: 'No autorizado' }, 401, corsHeaders);

  try {
    await ensureLocImagesColumn(env);
    const formData = await request.formData();
    const title = (formData.get('title') || '').toString().trim();
    const description = (formData.get('description') || '').toString().trim();
    const lat = parseFloat(formData.get('lat'));
    const lng = parseFloat(formData.get('lng'));

    if (!title || isNaN(lat) || isNaN(lng)) {
      return jsonResponse({ error: 'Faltan campos: title, lat, lng' }, 400, corsHeaders);
    }

    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();

    const imageFiles = formData.getAll('images');
    const imageUrls = [];
    for (let i = 0; i < Math.min(imageFiles.length, 5); i++) {
      const file = imageFiles[i];
      if (!file || !file.size) continue;
      const ext = (file.name || 'img').split('.').pop().toLowerCase();
      const r2Key = `locations/${id}/${crypto.randomUUID()}.${ext}`;
      await env.MIRAI_AI_ASSETS.put(r2Key, file.stream(), {
        httpMetadata: { contentType: file.type || 'image/jpeg' },
      });
      imageUrls.push(`/api/location-img/${r2Key}`);
    }

    await env.MIRAI_AI_DB.prepare(`
      INSERT INTO location_markers (id, user_dni, title, description, lat, lng, images, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(id, userDni, title.slice(0, 60), description.slice(0, 120), lat, lng, JSON.stringify(imageUrls), createdAt).run();

    return jsonResponse({ success: true, marker: { id, title, description, lat, lng, images: imageUrls, created_at: createdAt } }, 201, corsHeaders);
  } catch (err) {
    console.error('[Locations] Create error:', err);
    return jsonResponse({ error: 'Error al guardar marcador' }, 500, corsHeaders);
  }
}

export async function handleLocDelete(markerId, request, env, corsHeaders) {
  const userDni = await requireAuth(request, env);
  if (!userDni) return jsonResponse({ error: 'No autorizado' }, 401, corsHeaders);

  if (!markerId) return jsonResponse({ error: 'ID requerido' }, 400, corsHeaders);

  try {
    // Solo puede eliminar sus propios marcadores
    const result = await env.MIRAI_AI_DB.prepare(`
      DELETE FROM location_markers WHERE id = ? AND user_dni = ?
    `).bind(markerId, userDni).run();

    if (result.rowsAffected === 0) {
      return jsonResponse({ error: 'Marcador no encontrado o no autorizado' }, 404, corsHeaders);
    }

    return jsonResponse({ success: true }, 200, corsHeaders);
  } catch (err) {
    console.error('[Locations] Delete error:', err);
    return jsonResponse({ error: 'Error al eliminar marcador' }, 500, corsHeaders);
  }
}
