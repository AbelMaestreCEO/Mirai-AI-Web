/* ============================================
   MIRAI AI - Inventario

   ============================================ */
import { callAI } from '../lib/ai';
import { AI_MODEL_NORMAL } from '../lib/ai-models';
import { requireAuth } from '../lib/auth';
import { jsonResponse } from '../lib/http';
import { sendPushNotification } from '../lib/push';

// ============================================
// Listar Productos
// ============================================

export async function handleInventoryList(request, env, corsHeaders) {
  try {
    // 1. Obtener usuario autenticado
    const userDni = await requireAuth(request, env);
    if (!userDni) {
      return jsonResponse({ error: 'No autorizado' }, 401, corsHeaders);
    }

    // 2. Consultar SOLO productos de este usuario
    const result = await env.MIRAI_AI_DB.prepare(`
      SELECT 
        id, name, sku, category, quantity, unit_price,
        ai_description, ai_tags, ai_confidence,
        photo_r2_key, demand_score, predicted_restock_date,
        created_at, updated_at
      FROM inventory_products
      WHERE user_dni = ?
      ORDER BY created_at DESC
    `).bind(userDni).all();

    return jsonResponse({
      success: true,
      count: result.results.length,
      products: result.results
    }, 200, corsHeaders);

  } catch (error) {
    console.error('Error listing inventory:', error);
    return jsonResponse({ error: 'Error al obtener inventario', details: error.message }, 500, corsHeaders);
  }
}

// ============================================
// Subir Producto (con IA) - CORREGIDO
// ============================================

export async function handleInventoryUpload(request, env, ctx, corsHeaders) {
  try {
    // 1. Autenticar
    const userDni = await requireAuth(request, env);
    if (!userDni) {
      return jsonResponse({ error: 'No autorizado' }, 401, corsHeaders);
    }

    const formData = await request.formData();
    const file = formData.get('photo');
    const name = formData.get('name');
    let sku = formData.get('sku') || '';
    const category = formData.get('category') || 'general';
    const quantity = parseInt(formData.get('quantity')) || 0;
    const specs = formData.get('specs') || '';
    const unit_price = parseFloat(formData.get('unit_price')) || 0;

    if (!file || !name) {
      return jsonResponse({ error: 'Foto y nombre son obligatorios' }, 400, corsHeaders);
    }

    // Validar tipo de archivo
    if (!file.type.startsWith('image/')) {
      return jsonResponse({ error: 'El archivo debe ser una imagen' }, 400, corsHeaders);
    }

    // Validar tamaño (10MB máximo)
    if (file.size > 10 * 1024 * 1024) {
      return jsonResponse({ error: 'La imagen no puede exceder 10MB' }, 400, corsHeaders);
    }

    if (!sku || sku.trim() === '') {
      const namePrefix = name.substring(0, 3).toUpperCase().replace(/[^A-Z0-9]/g, '');
      const timestamp = Date.now().toString().slice(-6);
      const random = Math.random().toString(36).substring(2, 5).toUpperCase();
      sku = `${namePrefix || 'PRD'}-${timestamp}-${random}`;
    } else {
      // Verificar duplicado SOLO para este usuario
      const existing = await env.MIRAI_AI_DB.prepare(
        "SELECT id FROM inventory_products WHERE sku = ? AND user_dni = ?"
      ).bind(sku.toUpperCase().trim(), userDni).first();

      if (existing) {
        return jsonResponse({ error: 'Ya existe un producto con ese SKU en tu inventario.' }, 409, corsHeaders);
      }
    }

    const productId = crypto.randomUUID();
    const r2Key = `inventory/${productId}.jpg`;

    await env.MIRAI_AI_ASSETS.put(r2Key, file.stream(), {
      httpMetadata: { contentType: file.type }
    });

    // 3. Insertar con user_dni
    await env.MIRAI_AI_DB.prepare(`
      INSERT INTO inventory_products (
        id, name, sku, category, quantity, unit_price,
        ai_description, ai_tags, photo_r2_key, demand_score, user_dni,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, '', '', ?, 50, ?, datetime('now'), datetime('now'))
    `).bind(
      productId, name, sku.toUpperCase().trim(), category, quantity, unit_price, r2Key, userDni
    ).run();

    ctx.waitUntil(processInventoryAI(productId, r2Key, specs, env));

    return jsonResponse({
      success: true,
      product_id: productId,
      sku: sku,
      message: 'Producto registrado. La IA está analizando...'
    }, 201, corsHeaders);

  } catch (error) {
    console.error('Error uploading inventory:', error);

    // inventory_products.sku es UNIQUE a nivel global en el esquema, pero el
    // código valida el duplicado solo dentro del inventario del usuario: dos
    // usuarios con el mismo SKU chocaban con un 500 genérico e incomprensible.
    // Ver db/inventory_sku_per_user.sql para migrar la constraint a (user_dni, sku).
    if (String(error.message || '').includes('UNIQUE constraint failed')) {
      return jsonResponse({
        error: 'Ese SKU ya está en uso. Prueba con otro código o deja el campo vacío para generarlo automáticamente.'
      }, 409, corsHeaders);
    }

    return jsonResponse({ error: 'Error al registrar producto', details: error.message }, 500, corsHeaders);
  }
}

// ============================================
// Procesamiento IA (Background) - CORREGIDO
// ============================================

async function processInventoryAI(productId, r2Key, specs, env) {
  try {
    // 1. Obtener imagen de R2
    const object = await env.MIRAI_AI_ASSETS.get(r2Key);
    if (!object) {
      console.error(`Imagen no encontrada para producto ${productId}`);
      return;
    }

    const imageBuffer = await object.arrayBuffer();

    const imageBytes = new Uint8Array(imageBuffer);
    const imageArray = [...imageBytes];

    // 2. Llamada a Workers AI para visión (Llama 3.2 Vision)
    const visionResponse = await env.AI.run('@cf/meta/llama-3.2-11b-vision-instruct', {
      image: imageArray,
      prompt: "Identifica el producto en esta imagen. Devuelve SOLO un JSON válido con: { 'tags': ['tag1', 'tag2'], 'category': 'categoria', 'description': 'breve descripción' }. No incluyas texto extra.",
      max_tokens: 256
    });

    let aiTags: any[] = [];
    let aiDescription = '';
    let aiCategory = 'general';

    try {
      const content = visionResponse.response || '';
      console.log(`🤖 Respuesta Llama Vision raw: ${content.substring(0, 200)}...`);

      // Intentar extraer JSON (a veces el modelo incluye texto antes/después)
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        aiTags = parsed.tags || [];
        aiDescription = parsed.description || '';
        aiCategory = parsed.category || 'general';
      } else {
        // Fallback si no encuentra JSON limpio
        aiTags = ['producto'];
        aiDescription = content;
      }
    } catch (e) {
      console.warn('Error parsing vision output:', e);
      aiTags = ['producto'];
      aiDescription = 'Descripción generada por IA (error de parseo)';
    }

    // 3. Llamada a DeepSeek para refinar descripción (Opcional pero recomendado)
    // Si LLaVA ya dio una buena descripción, podemos saltarnos esto o usarla para mejorarla
    if (env.DEEPSEEK_API_KEY && (!aiDescription || aiDescription.length < 10)) {
      const deepseekPrompt = `
        Eres un experto en inventarios. Genera una descripción técnica breve y atractiva para:
        Producto: ${specs || 'Producto genérico'}
        Etiquetas detectadas: ${aiTags.join(', ')}
        Categoría: ${aiCategory}
        
        Responde EXACTAMENTE en JSON: { "description": "descripción técnica en español, máx 150 palabras" }
      `;

      try {
        const content = await callAI(
          AI_MODEL_NORMAL,
          [{ role: 'user', content: deepseekPrompt }],
          { temperature: 0.3, max_tokens: 200 },
          env
        );
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          aiDescription = parsed.description || aiDescription;
        }
      } catch (deepErr) {
        console.warn('Error llamando a AI Gateway:', deepErr);
      }
    }

    // 4. Calcular demanda (simple)
    const demandScore = 50;

    // 5. Actualizar producto en D1
    await env.MIRAI_AI_DB.prepare(`
            UPDATE inventory_products 
            SET ai_description = ?, ai_tags = ?, category = ?, demand_score = ?, updated_at = datetime('now')
            WHERE id = ?
        `).bind(
      aiDescription,
      JSON.stringify(aiTags),
      aiCategory,
      demandScore,
      productId
    ).run();

    console.log(`✅ Producto ${productId} procesado por IA. Tags: ${aiTags.join(', ')}`);

  } catch (error) {
    console.error(`❌ Error procesando IA para producto ${productId}:`, error);
    // No lanzamos error para no romper el flujo principal, solo logueamos
  }
}

// ============================================
// ACTUALIZAR PRODUCTO (EDITAR)
// ============================================
export async function handleInventoryUpdate(request, env, corsHeaders) {
  try {
    const userDni = await requireAuth(request, env);
    if (!userDni) {
      return jsonResponse({ error: 'No autorizado' }, 401, corsHeaders);
    }

    const { id, name, sku, category, quantity, unit_price, ai_description, ai_tags, demand_score } = await request.json();

    if (!id) {
      return jsonResponse({ error: 'ID requerido' }, 400, corsHeaders);
    }

    // Verificar que el producto existe Y pertenece a este usuario
    const existing = await env.MIRAI_AI_DB.prepare(
      "SELECT id FROM inventory_products WHERE id = ? AND user_dni = ?"
    ).bind(id, userDni).first();

    if (!existing) {
      return jsonResponse({ error: 'Producto no encontrado o no tienes permiso para editarlo' }, 404, corsHeaders);
    }

    // Construir la consulta dinámica
    const fields: any[] = [];
    const values: any[] = [];

    if (name !== undefined) { fields.push("name = ?"); values.push(name); }
    if (sku !== undefined) { fields.push("sku = ?"); values.push(sku.toUpperCase().trim()); }
    if (category !== undefined) { fields.push("category = ?"); values.push(category); }
    if (quantity !== undefined) { fields.push("quantity = ?"); values.push(quantity); }
    if (unit_price !== undefined) { fields.push("unit_price = ?"); values.push(unit_price); }
    if (ai_description !== undefined) { fields.push("ai_description = ?"); values.push(ai_description); }
    if (ai_tags !== undefined) { fields.push("ai_tags = ?"); values.push(typeof ai_tags === 'object' ? JSON.stringify(ai_tags) : ai_tags); }
    if (demand_score !== undefined) { fields.push("demand_score = ?"); values.push(demand_score); }

    fields.push("updated_at = datetime('now')");
    values.push(id);

    const sql = `UPDATE inventory_products SET ${fields.join(', ')} WHERE id = ? AND user_dni = ?`;
    values.push(id); // El WHERE ya tiene user_dni

    await env.MIRAI_AI_DB.prepare(sql).bind(...values).run();

    // Después de actualizar el stock
    if (quantity <= 3) {
      await sendPushNotification(env, userDni, '⚠️ Stock Crítico', `El producto ${name} tiene solo ${quantity} unidades.`, { category: 'inventory', url: '/inventory', tag: 'inventory-stock' });
    }

    return jsonResponse({ success: true, message: 'Producto actualizado' }, 200, corsHeaders);

  } catch (error) {
    console.error('Error updating inventory:', error);
    return jsonResponse({ error: 'Error al actualizar', details: error.message }, 500, corsHeaders);
  }
}

// ============================================
// ELIMINAR PRODUCTO
// ============================================
export async function handleInventoryDelete(request, env, corsHeaders) {
  try {
    const userDni = await requireAuth(request, env);
    if (!userDni) {
      return jsonResponse({ error: 'No autorizado' }, 401, corsHeaders);
    }

    const url = new URL(request.url);
    const id = url.searchParams.get('id');

    if (!id) {
      return jsonResponse({ error: 'ID requerido' }, 400, corsHeaders);
    }

    // Verificar propiedad
    const existing = await env.MIRAI_AI_DB.prepare(
      "SELECT photo_r2_key FROM inventory_products WHERE id = ? AND user_dni = ?"
    ).bind(id, userDni).first();

    if (!existing) {
      return jsonResponse({ error: 'Producto no encontrado o no tienes permiso para eliminarlo' }, 404, corsHeaders);
    }

    // Eliminar imagen de R2
    if (existing.photo_r2_key) {
      try { await env.MIRAI_AI_ASSETS.delete(existing.photo_r2_key); } catch (e) { console.warn(e); }
    }

    // Eliminar registro
    await env.MIRAI_AI_DB.prepare("DELETE FROM inventory_products WHERE id = ? AND user_dni = ?").bind(id, userDni).run();

    return jsonResponse({ success: true, message: 'Producto eliminado' }, 200, corsHeaders);

  } catch (error) {
    console.error('Error deleting inventory:', error);
    return jsonResponse({ error: 'Error al eliminar', details: error.message }, 500, corsHeaders);
  }
}
