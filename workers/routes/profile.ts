/* ============================================
   MIRAI AI - Perfil, ajustes, preferencias y avatar

   ============================================ */
import { callAI } from '../lib/ai';
import { AI_MODEL_NORMAL } from '../lib/ai-models';
import { requireAuth } from '../lib/auth';
import { jsonResponse } from '../lib/http';

// ── BLOQUE 2: handleGetProfile ────────────────────────────────
export async function handleGetProfile(request: Request, env: Env, corsHeaders: Record<string, string>) {
  try {
    const userDni = await requireAuth(request, env);
    if (!userDni) return jsonResponse({ error: 'No autorizado' }, 401, corsHeaders);

    const user = await env.MIRAI_AI_DB.prepare(
      "SELECT dni, first_name, last_name, email, avatar_r2_key FROM users WHERE dni = ?"
    ).bind(userDni).first<any>();

    if (!user) return jsonResponse({ error: 'Usuario no encontrado' }, 404, corsHeaders);

    // Construir URL del avatar si existe
    const avatarUrl = user.avatar_r2_key
      ? `/api/user/avatar/${userDni}`
      : null;

    return jsonResponse({
      success: true,
      profile: {
        dni: user.dni,
        firstName: user.first_name || '',
        lastName: user.last_name || '',
        email: user.email || '',
        avatarUrl: avatarUrl,
        hasAvatar: !!user.avatar_r2_key
      }
    }, 200, corsHeaders);

  } catch (error) {
    console.error('Error getProfile:', error);
    return jsonResponse({ error: 'Error interno' }, 500, corsHeaders);
  }
}

// ── Settings cross-device: GET ─────────────────────────────────
export async function handleGetUserSettings(request: Request, env: Env, corsHeaders: Record<string, string>) {
  try {
    const userDni = await requireAuth(request, env);
    if (!userDni) return jsonResponse({ error: 'No autorizado' }, 401, corsHeaders);

    const row = await env.MIRAI_AI_DB.prepare(
      "SELECT settings_json FROM users WHERE dni = ?"
    ).bind(userDni).first<any>();

    const settings = row?.settings_json ? JSON.parse(row.settings_json) : {};
    return jsonResponse({ success: true, settings }, 200, corsHeaders);
  } catch (error) {
    console.error('Error getUserSettings:', error);
    return jsonResponse({ error: 'Error interno' }, 500, corsHeaders);
  }
}

// ── Settings cross-device: PUT ─────────────────────────────────
export async function handleSaveUserSettings(request: Request, env: Env, corsHeaders: Record<string, string>) {
  try {
    const userDni = await requireAuth(request, env);
    if (!userDni) return jsonResponse({ error: 'No autorizado' }, 401, corsHeaders);

    const body = await request.json<any>();

    // Solo guardamos campos permitidos (whitelist)
    const allowed = ['accentColor', 'fontFamily', 'fontSize', 'reducedMotion', 'themeMode', 'aiModel', 'notifications', 'twoFactor', 'notifyGeneration', 'notifyClassroom', 'notifyInventory', 'notifyReport', 'notifyTask'];
    const clean: Record<string, unknown> = {};
    for (const key of allowed) {
      if (body[key] !== undefined) clean[key] = body[key];
    }

    await env.MIRAI_AI_DB.prepare(
      "UPDATE users SET settings_json = ? WHERE dni = ?"
    ).bind(JSON.stringify(clean), userDni).run();

    return jsonResponse({ success: true }, 200, corsHeaders);
  } catch (error) {
    console.error('Error saveUserSettings:', error);
    return jsonResponse({ error: 'Error interno' }, 500, corsHeaders);
  }
}

// ── Preferencias detectadas por IA: GET ──────────────────────
export async function handleGetUserPreferences(request: Request, env: Env, corsHeaders: Record<string, string>) {
  try {
    const userDni = await requireAuth(request, env);
    if (!userDni) return jsonResponse({ error: 'No autorizado' }, 401, corsHeaders);

    const row = await env.MIRAI_AI_DB.prepare(
      "SELECT ai_preferences_json FROM users WHERE dni = ?"
    ).bind(userDni).first<any>();

    const preferences = row?.ai_preferences_json ? JSON.parse(row.ai_preferences_json) : {};
    return jsonResponse({ success: true, preferences }, 200, corsHeaders);
  } catch (error) {
    console.error('Error getPreferences:', error);
    return jsonResponse({ error: 'Error interno' }, 500, corsHeaders);
  }
}

// ── Preferencias detectadas por IA: POST (análisis) ──────────
export async function handleAnalyzePreferences(request: Request, env: Env, corsHeaders: Record<string, string>) {
  try {
    const userDni = await requireAuth(request, env);
    if (!userDni) return jsonResponse({ error: 'No autorizado' }, 401, corsHeaders);

    let conversationId: any = null;
    try { conversationId = (await request.json<any>()).conversation_id; } catch (_) { }

    let query, binds;
    if (conversationId) {
      query = `SELECT content, role FROM messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 20`;
      binds = [conversationId];
    } else {
      query = `SELECT m.content, m.role FROM messages m
       JOIN conversations c ON m.conversation_id = c.id
       WHERE c.user_dni = ? AND c.course_id IS NULL AND c.project_id IS NULL
       ORDER BY m.created_at DESC LIMIT 20`;
      binds = [userDni];
    }

    const recentMessages = await env.MIRAI_AI_DB.prepare(query).bind(...binds).all<any>();

    if (!recentMessages.results || recentMessages.results.length < 6) {
      return jsonResponse({ success: true, skipped: true, reason: 'No hay suficientes mensajes' }, 200, corsHeaders);
    }

    const sample = recentMessages.results
      .reverse()
      .filter(m => m.role === 'user')
      .map(m => m.content.substring(0, 200))
      .join('\n');

    const existingRow = await env.MIRAI_AI_DB.prepare(
      "SELECT ai_preferences_json FROM users WHERE dni = ?"
    ).bind(userDni).first<any>();
    const existingPrefs = existingRow?.ai_preferences_json || '{}';

    const analysisPrompt = `Extrae preferencias del USUARIO de estos mensajes. Cada valor debe ser MUY CORTO (máximo 6 palabras), como "batido de fresa" o "rock alternativo". Si no hay dato claro, deja "".

Si ya existen preferencias previas, conserva las que sigan teniendo sentido y actualiza solo si hay evidencia clara en los mensajes nuevos.

Preferencias actuales: ${existingPrefs}

Mensajes del usuario:
${sample}

Responde SOLO con JSON válido:
{"colores_favoritos":"","colores_que_no_gustan":"","musica_favorita":"","musica_que_no_gusta":"","peliculas_series_favoritas":"","peliculas_series_que_no_gustan":"","temas_de_conversacion_favoritos":"","temas_que_evita":"","estudios_o_profesion":"","hobbies":"","comida_favorita":"","comida_que_no_gusta":"","deportes":"","videojuegos":"","estilo_comunicacion":"","personalidad_observada":"","otros_gustos":"","otros_disgustos":""}`;

    const aiResponse = await callAI(AI_MODEL_NORMAL, [
      { role: 'system', content: 'Eres un extractor de preferencias. Solo respondes con JSON válido. Valores cortos de máximo 6 palabras cada uno.' },
      { role: 'user', content: analysisPrompt }
    ], { temperature: 0.2, max_tokens: 800 }, env);

    let preferences = {};
    try {
      const cleaned = aiResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      preferences = JSON.parse(cleaned);
    } catch (parseErr) {
      console.error('Error parseando preferencias:', parseErr.message);
      return jsonResponse({ success: false, error: 'Error al parsear respuesta de IA' }, 500, corsHeaders);
    }

    const filtered: Record<string, string> = {};
    for (const [key, value] of Object.entries(preferences)) {
      if (value && typeof value === 'string' && value.trim()) {
        filtered[key] = value.trim().substring(0, 60);
      }
    }

    await env.MIRAI_AI_DB.prepare(
      "UPDATE users SET ai_preferences_json = ? WHERE dni = ?"
    ).bind(JSON.stringify(filtered), userDni).run();

    return jsonResponse({ success: true, preferences: filtered }, 200, corsHeaders);
  } catch (error) {
    console.error('Error analyzePreferences:', error);
    return jsonResponse({ error: 'Error interno' }, 500, corsHeaders);
  }
}

// ── BLOQUE 3: handleUpdateProfile ─────────────────────────────
export async function handleUpdateProfile(request: Request, env: Env, corsHeaders: Record<string, string>) {
  try {
    const userDni = await requireAuth(request, env);
    if (!userDni) return jsonResponse({ error: 'No autorizado' }, 401, corsHeaders);

    const { firstName, lastName } = await request.json<any>();

    if (!firstName || !firstName.trim()) {
      return jsonResponse({ error: 'El nombre es obligatorio' }, 400, corsHeaders);
    }

    await env.MIRAI_AI_DB.prepare(
      "UPDATE users SET first_name = ?, last_name = ? WHERE dni = ?"
    ).bind(
      firstName.trim().substring(0, 60),
      (lastName || '').trim().substring(0, 60),
      userDni
    ).run();

    return jsonResponse({
      success: true,
      message: 'Perfil actualizado correctamente',
      profile: { firstName: firstName.trim(), lastName: (lastName || '').trim() }
    }, 200, corsHeaders);

  } catch (error) {
    console.error('Error updateProfile:', error);
    return jsonResponse({ error: 'Error interno' }, 500, corsHeaders);
  }
}

// ── BLOQUE 4: handleUploadAvatar ──────────────────────────────
export async function handleUploadAvatar(request: Request, env: Env, corsHeaders: Record<string, string>) {
  try {
    const userDni = await requireAuth(request, env);
    if (!userDni) return jsonResponse({ error: 'No autorizado' }, 401, corsHeaders);

    const formData = await request.formData();
    const file = formData.get('avatar') as File | null;

    if (!file) return jsonResponse({ error: 'No se recibió ninguna imagen' }, 400, corsHeaders);

    // Validar tipo
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.type)) {
      return jsonResponse({ error: 'Formato no soportado. Usa JPG, PNG o WEBP' }, 400, corsHeaders);
    }

    // Validar tamaño (2 MB máximo — ya viene comprimido desde el frontend)
    if (file.size > 2 * 1024 * 1024) {
      return jsonResponse({ error: 'La imagen supera los 2 MB' }, 400, corsHeaders);
    }

    // Eliminar avatar anterior si existe
    const existing = await env.MIRAI_AI_DB.prepare(
      "SELECT avatar_r2_key FROM users WHERE dni = ?"
    ).bind(userDni).first<any>();

    if (existing?.avatar_r2_key) {
      await env.MIRAI_AI_ASSETS.delete(existing.avatar_r2_key).catch(() => null);
    }

    // Guardar en R2: avatars/{dni}.jpg (sobreescribe siempre)
    const r2Key = `avatars/${userDni.toLowerCase()}.jpg`;
    const imageBuffer = await file.arrayBuffer();

    await env.MIRAI_AI_ASSETS.put(r2Key, imageBuffer, {
      httpMetadata: {
        contentType: 'image/jpeg',
        cacheControl: 'public, max-age=86400'
      },
      customMetadata: {
        userDni: userDni,
        uploadedAt: new Date().toISOString()
      }
    });

    // Guardar clave R2 en la tabla users
    await env.MIRAI_AI_DB.prepare(
      "UPDATE users SET avatar_r2_key = ? WHERE dni = ?"
    ).bind(r2Key, userDni).run();

    return jsonResponse({
      success: true,
      message: 'Avatar actualizado correctamente',
      avatarUrl: `/api/user/avatar/${userDni}`
    }, 200, corsHeaders);

  } catch (error) {
    console.error('Error uploadAvatar:', error);
    return jsonResponse({ error: 'Error al subir el avatar', details: error.message }, 500, corsHeaders);
  }
}

// ── BLOQUE 5: handleDeleteAvatar ──────────────────────────────
export async function handleDeleteAvatar(request: Request, env: Env, corsHeaders: Record<string, string>) {
  try {
    const userDni = await requireAuth(request, env);
    if (!userDni) return jsonResponse({ error: 'No autorizado' }, 401, corsHeaders);

    const user = await env.MIRAI_AI_DB.prepare(
      "SELECT avatar_r2_key FROM users WHERE dni = ?"
    ).bind(userDni).first<any>();

    if (user?.avatar_r2_key) {
      await env.MIRAI_AI_ASSETS.delete(user.avatar_r2_key).catch(() => null);
      await env.MIRAI_AI_DB.prepare(
        "UPDATE users SET avatar_r2_key = NULL WHERE dni = ?"
      ).bind(userDni).run();
    }

    return jsonResponse({ success: true, message: 'Avatar eliminado' }, 200, corsHeaders);

  } catch (error) {
    console.error('Error deleteAvatar:', error);
    return jsonResponse({ error: 'Error al eliminar avatar' }, 500, corsHeaders);
  }
}

// ── BLOQUE 6: handleServeAvatar (sirve la imagen desde R2) ────
export async function handleServeAvatar(request: Request, env: Env, corsHeaders: Record<string, string>) {
  try {
    // Extraer DNI de la URL: /api/user/avatar/{dni}
    const url = new URL(request.url);
    const parts = url.pathname.split('/');
    const dni = parts[parts.length - 1]?.toUpperCase();

    if (!dni) return new Response('Not found', { status: 404 });

    const user = await env.MIRAI_AI_DB.prepare(
      "SELECT avatar_r2_key FROM users WHERE dni = ?"
    ).bind(dni).first<any>();

    if (!user?.avatar_r2_key) {
      return new Response('No avatar', { status: 404 });
    }

    const object = await env.MIRAI_AI_ASSETS.get(user.avatar_r2_key);
    if (!object) return new Response('Not found', { status: 404 });

    const headers = new Headers({
      ...corsHeaders,
      'Content-Type': 'image/jpeg',
      'Cache-Control': 'public, max-age=86400',  // cache 24h en navegador
      'ETag': object.httpEtag || '"avatar"'
    });

    // Soporte para 304 Not Modified
    const ifNoneMatch = request.headers.get('If-None-Match');
    if (ifNoneMatch && ifNoneMatch === object.httpEtag) {
      return new Response(null, { status: 304, headers });
    }

    return new Response(object.body, { status: 200, headers });

  } catch (error) {
    console.error('Error serveAvatar:', error);
    return new Response('Error', { status: 500 });
  }
}
