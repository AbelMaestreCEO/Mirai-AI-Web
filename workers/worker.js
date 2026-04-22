/* ============================================
   MIRAI AI - Cloudflare Worker
   Backend para integración con DeepSeek API
   ============================================ */

// --- CONFIGURACIÓN ---
const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';
const DEEPSEEK_MODEL = 'deepseek-chat';

// --- RUTAS ---
const ROUTES = {
  CHAT: '/api/chat',
  HISTORY: '/api/history',
  STATIC: '/'
};

// --- HANDLER PRINCIPAL ---
export default {
  async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url);
      const path = url.pathname;

      // Habilitar CORS para todas las rutas
      const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Content-Type': 'application/json'
      };

      // Manejar preflight CORS
      if (request.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
      }

      // Rutas de API
      if (path.startsWith('/api/')) {
        return handleApiRequest(request, env, corsHeaders);
      }

      // Servir archivos estáticos
      return serveStatic(url, env, corsHeaders);

    } catch (error) {
      console.error('Worker error:', error);
      return jsonResponse(
        { error: 'Error interno del servidor' },
        500,
        corsHeaders
      );
    }
  }
};

// --- MANEJO DE RUTAS API ---
async function handleApiRequest(request, env, corsHeaders) {
  const url = new URL(request.url);
  const path = url.pathname;

  try {
    // Ruta: POST /api/chat
    if (path === ROUTES.CHAT && request.method === 'POST') {
      return await handleChat(request, env, corsHeaders);
    }

    // Ruta: GET /api/history/:conversationId
    if (path.startsWith(ROUTES.HISTORY) && request.method === 'GET') {
      const conversationId = path.split('/').pop();
      return await handleHistory(conversationId, env, corsHeaders);
    }

    // Ruta no encontrada
    return jsonResponse(
      { error: 'Endpoint no encontrado' },
      404,
      corsHeaders
    );

  } catch (error) {
    console.error('API error:', error);
    return jsonResponse(
      { error: 'Error procesando solicitud API' },
      500,
      corsHeaders
    );
  }
}

// --- MANEJAR CHAT (DeepSeek API) ---
async function handleChat(request, env, corsHeaders) {
  try {
    const { message, conversation_id } = await request.json();

    // Validar entrada
    if (!message || typeof message !== 'string') {
      return jsonResponse(
        { error: 'El campo "message" es requerido y debe ser un string' },
        400,
        corsHeaders
      );
    }

    if (!conversation_id || typeof conversation_id !== 'string') {
      return jsonResponse(
        { error: 'El campo "conversation_id" es requerido' },
        400,
        corsHeaders
      );
    }

    // Obtener historial de la conversación para contexto
    const history = await getConversationHistory(conversation_id, env);

    // Construir mensajes para DeepSeek
    const deepseekMessages = buildDeepseekMessages(message, history);

    // Llamar a la API de DeepSeek
    const deepseekResponse = await fetch(DEEPSEEK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        messages: deepseekMessages,
        temperature: 0.7,
        max_tokens: 2000
      })
    });

    if (!deepseekResponse.ok) {
      const errorData = await deepseekResponse.text();
      console.error('DeepSeek API error:', errorData);
      return jsonResponse(
        { error: 'Error al comunicarse con DeepSeek API' },
        deepseekResponse.status,
        corsHeaders
      );
    }

    const deepseekData = await deepseekResponse.json();
    const aiResponse = deepseekData.choices?.[0]?.message?.content || '';

    // Guardar mensaje del usuario en D1
    await saveMessage(conversation_id, 'user', message, env);

    // Guardar respuesta de la IA en D1
    await saveMessage(conversation_id, 'assistant', aiResponse, env);

    // Actualizar timestamp de la conversación
    await updateConversationTimestamp(conversation_id, env);

    // Retornar respuesta al frontend
    return jsonResponse(
      { response: aiResponse },
      200,
      corsHeaders
    );

  } catch (error) {
    console.error('Chat handler error:', error);
    return jsonResponse(
      { error: 'Error procesando el mensaje' },
      500,
      corsHeaders
    );
  }
}

// --- MANEJAR HISTORIAL ---
async function handleHistory(conversationId, env, corsHeaders) {
  try {
    if (!conversationId) {
      return jsonResponse(
        { error: 'conversation_id es requerido' },
        400,
        corsHeaders
      );
    }

    const messages = await getConversationHistory(conversationId, env);

    return jsonResponse(
      messages,
      200,
      corsHeaders
    );

  } catch (error) {
    console.error('History handler error:', error);
    return jsonResponse(
      { error: 'Error obteniendo historial' },
      500,
      corsHeaders
    );
  }
}

// --- FUNCIONES DE BASE DE DATOS (D1) ---

// Obtener historial de una conversación
async function getConversationHistory(conversationId, env) {
  try {
    const stmt = env.MIRAI_AI_DB.prepare(`
      SELECT id, role, content, created_at
      FROM messages
      WHERE conversation_id = ?
      ORDER BY created_at ASC
    `);

    const { results } = await stmt.bind(conversationId).all();

    return results.map(row => ({
      id: row.id,
      role: row.role,
      content: row.content,
      created_at: row.created_at
    }));

  } catch (error) {
    console.error('Error getting conversation history:', error);
    throw error;
  }
}

// Guardar un mensaje
async function saveMessage(conversationId, role, content, env) {
  try {
    const messageId = crypto.randomUUID();

    const stmt = env.MIRAI_AI_DB.prepare(`
      INSERT INTO messages (id, conversation_id, role, content, created_at)
      VALUES (?, ?, ?, ?, datetime('now'))
    `);

    await stmt.bind(messageId, conversationId, role, content).run();

    // Si es el primer mensaje de una conversación, crearla
    await ensureConversationExists(conversationId, content, env);

    return messageId;

  } catch (error) {
    console.error('Error saving message:', error);
    throw error;
  }
}

// Asegurar que la conversación existe
async function ensureConversationExists(conversationId, firstMessage, env) {
  try {
    const checkStmt = env.MIRAI_AI_DB.prepare(`
      SELECT id FROM conversations WHERE id = ?
    `);

    const { results } = await checkStmt.bind(conversationId).all();

    if (results.length === 0) {
      // Crear conversación con título basado en el primer mensaje
      const title = firstMessage.substring(0, 50) + (firstMessage.length > 50 ? '...' : '');
      
      const createStmt = env.MIRAI_AI_DB.prepare(`
        INSERT INTO conversations (id, title, model, created_at, updated_at)
        VALUES (?, ?, ?, datetime('now'), datetime('now'))
      `);

      await createStmt.bind(conversationId, title, DEEPSEEK_MODEL).run();
    }

  } catch (error) {
    console.error('Error ensuring conversation exists:', error);
    // No lanzar error aquí para no romper el flujo
  }
}

// Actualizar timestamp de conversación
async function updateConversationTimestamp(conversationId, env) {
  try {
    const stmt = env.MIRAI_AI_DB.prepare(`
      UPDATE conversations
      SET updated_at = datetime('now')
      WHERE id = ?
    `);

    await stmt.bind(conversationId).run();

  } catch (error) {
    console.error('Error updating conversation timestamp:', error);
  }
}

// --- CONSTRUCCIÓN DE MENSAJES PARA DEEPSEEK ---
function buildDeepseekMessages(userMessage, history) {
  // Mensaje del sistema (instrucciones base)
  const systemMessage = {
    role: 'system',
    content: `Eres Mirai AI, un asistente inteligente creado por Proton. 
    Ayuda al usuario de manera clara, precisa y útil.
    Si el usuario pide código, proporciona ejemplos bien comentados.
    Si el usuario hace preguntas técnicas, responde con precisión.`
  };

  // Conversión del historial a formato DeepSeek
  const historyMessages = history.map(msg => ({
    role: msg.role,
    content: msg.content
  }));

  // Mensaje del usuario actual
  const userMsg = {
    role: 'user',
    content: userMessage
  };

  // Construir array completo
  return [systemMessage, ...historyMessages, userMsg];
}

// --- SER ARCHIVOS ESTÁTICOS ---
async function serveStatic(url, env, corsHeaders) {
  const path = url.pathname;

  // Ruta raíz: servir index.html
  if (path === '/' || path === '') {
    try {
      const object = await env.MIRAI_AI_ASSETS.get('../public/index.html');
      
      if (object === null) {
        // Fallback: intentar leer desde el bundle del Worker
        return new Response(await import('../public/index.html').then(m => m.default), {
          headers: {
            ...corsHeaders,
            'Content-Type': 'text/html'
          }
        });
      }

      const headers = new Headers(object.httpHeaders);
      headers.set('Content-Type', 'text/html');
      headers.set('Cache-Control', 'public, max-age=3600');

      return new Response(object.body, {
        headers: headers
      });

    } catch (error) {
      console.error('Error serving index.html:', error);
      return jsonResponse(
        { error: 'Error cargando página principal' },
        500,
        corsHeaders
      );
    }
  }

  // Otras rutas estáticas (CSS, JS, imágenes)
  try {
    // Eliminar slash inicial para buscar en R2
    const assetPath = path.startsWith('/') ? path.slice(1) : path;
    
    const object = await env.MIRAI_AI_ASSETS.get(assetPath);

    if (object === null) {
      return jsonResponse(
        { error: 'Archivo no encontrado' },
        404,
        corsHeaders
      );
    }

    const headers = new Headers(object.httpHeaders);
    headers.set('Cache-Control', 'public, max-age=3600');

    return new Response(object.body, { headers });

  } catch (error) {
    console.error('Error serving static file:', error);
    return jsonResponse(
      { error: 'Error cargando archivo estático' },
      500,
      corsHeaders
    );
  }
}

// --- UTILIDADES ---
function jsonResponse(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...headers
    }
  });
}

// --- DEBUGGING (Solo en desarrollo) ---
if (import.meta?.env?.DEV) {
  console.log('🤖 Mirai AI Worker - Modo Desarrollo activado');
}