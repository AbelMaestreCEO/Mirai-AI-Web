/* ============================================
   MIRAI AI - Generación de música

   ============================================ */
import { AI_MODEL_NORMAL } from '../lib/ai-models';
import { jsonResponse } from '../lib/http';
import { ensureConversationExists, saveMessage, updateConversationTimestamp } from './conversations';

// --- GENERAR MÚSICA CON MINIMAX 2.6 ---
export async function handleMusicGeneration(prompt: any, conversationId: string, userDni: string, env: Env, corsHeaders: Record<string, string>, skipHistory = false) {
  console.log('🎵 Iniciando handleMusicGeneration...');
  try {
    console.log('🎵 Iniciando generación de música con MiniMax 2.6');
    console.log('🎵 Prompt original:', prompt);

    if (!skipHistory) {
      await ensureConversationExists(conversationId, prompt, env, null, null, userDni, AI_MODEL_NORMAL);
      await saveMessage(conversationId, 'user', prompt, env, null, null, null, userDni);
    }

    // 2. Limpiar y simplificar el prompt para MiniMax
    const cleanPrompt = simplifyMusicPrompt(prompt);
    console.log('🎵 Prompt simplificado:', cleanPrompt);

    // 3. Preparar parámetros para MiniMax
    const musicParams = {
      prompt: cleanPrompt,
      is_instrumental: true,
    };

    console.log('🎵 Parámetros enviados:', JSON.stringify(musicParams));

    // 4. Llamar a Cloudflare AI
    const aiResponse: any = await env.AI.run('minimax/music-2.6', musicParams, {
      gateway: { id: 'default' },
    });

    console.log('🎵 Tipo de respuesta:', typeof aiResponse);
    console.log('🎵 Respuesta completa:', JSON.stringify(aiResponse).substring(0, 500));

    // 5. Extraer audio de la respuesta
    let audioBuffer: ArrayBuffer | null = null;

    if (aiResponse instanceof ArrayBuffer && aiResponse.byteLength > 0) {
      audioBuffer = aiResponse;
      console.log('✅ Audio recibido como ArrayBuffer directo:', audioBuffer.byteLength, 'bytes');
    }
    else if (aiResponse instanceof Uint8Array && aiResponse.byteLength > 0) {
      audioBuffer = aiResponse.buffer as ArrayBuffer;
      console.log('✅ Audio recibido como Uint8Array:', audioBuffer.byteLength, 'bytes');
    }
    else if (aiResponse?.result?.audio && typeof aiResponse.result.audio === 'string') {
      const audioData = aiResponse.result.audio;

      // CASO A: URL directa (formato nuevo de AI Gateway: state=Completed)
      if (audioData.startsWith('http')) {
        console.log('🔗 Audio como URL directa de AI Gateway:', audioData.substring(0, 80));
        try {
          const audioFetch = await fetch(audioData);
          if (!audioFetch.ok) throw new Error(`HTTP ${audioFetch.status} al descargar audio`);
          audioBuffer = await audioFetch.arrayBuffer();
          console.log('✅ Audio descargado desde URL:', audioBuffer.byteLength, 'bytes');
        } catch (fetchErr: any) {
          throw new Error('No se pudo descargar el audio: ' + fetchErr.message);
        }
      }
      // CASO B: Base64
      else {
        const binaryString = atob(audioData);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        audioBuffer = bytes.buffer;
        console.log('✅ Audio decodificado de base64:', audioBuffer.byteLength, 'bytes');
      }
    }
    else if (aiResponse?.error) {
      // ✨ MANEJO DE ERRORES DEL PROVEEDOR
      const errorMsg = aiResponse.error?.message || 'Error desconocido';
      const errorCode = aiResponse.error?.code || 'unknown';

      console.error(`❌ MiniMax API error: code=${errorCode}, message=${errorMsg}`);

      // Si el proveedor no está disponible, dar mensaje amigable
      if (errorMsg.includes('unavailable') || errorMsg.includes('provider')) {
        const fallbackMessage = "🎵 El servicio de generación de música está temporalmente no disponible. ¡Prueba en unos minutos! Mientras tanto, ¿quieres que genere una imagen o hablemos de algo?";

        if (!skipHistory) {
          await saveMessage(conversationId, 'assistant', fallbackMessage, env);
          await updateConversationTimestamp(conversationId, env);
        }

        return jsonResponse({
          type: 'music',
          response: fallbackMessage,
          status: 'service_unavailable'
        }, 200, corsHeaders);
      }

      throw new Error(`MiniMax error ${errorCode}: ${errorMsg}`);
    }
    else {
      console.error('❌ Formato de respuesta no reconocido');
      console.error('❌ Keys:', Object.keys(aiResponse || {}));
      throw new Error('Formato de respuesta de audio no reconocido');
    }

    if (!audioBuffer || audioBuffer.byteLength === 0) {
      throw new Error('No se recibió audio válido de MiniMax');
    }

    // 6. Guardar en R2
    const uniqueId = crypto.randomUUID();
    const filename = `music/${uniqueId}.mp3`;

    await env.MIRAI_AI_ASSETS.put(filename, audioBuffer, {
      httpMetadata: { contentType: 'audio/mpeg' },
      customMetadata: {
        prompt: prompt.substring(0, 200),
        conversation_id: conversationId,
        generated_at: new Date().toISOString(),
        model: 'minimax/music-2.6'
      }
    });

    console.log(`✅ Música guardada en R2: ${filename} (${audioBuffer.byteLength} bytes)`);
    const audioUrl = `/api/audio/${filename}`;

    // 7. Guardar respuesta en D1
    const assistantContent = `🎵 Aquí tienes la canción que pediste:`;
    if (!skipHistory) {
      await saveMessage(conversationId, 'assistant', assistantContent, env, audioUrl, null, null, userDni);
      await updateConversationTimestamp(conversationId, env);
    }

    return jsonResponse({
      type: 'music',
      audio_url: audioUrl,
      prompt: prompt
    }, 200, corsHeaders);

  } catch (error: any) {
    console.error('❌ handleMusicGeneration error:', error.message);

    // Si es error del proveedor, dar mensaje amigable
    if (error.message.includes('unavailable') || error.message.includes('provider')) {
      const fallbackMessage = "🎵 El servicio de generación de música está temporalmente no disponible. ¡Prueba en unos minutos!";

      return jsonResponse({
        type: 'music',
        response: fallbackMessage,
        status: 'service_unavailable'
      }, 200, corsHeaders);
    }

    return jsonResponse({
      error: 'Error generando música',
      details: error.message
    }, 500, corsHeaders);
  }
}

// --- SIMPLIFICAR PROMPT PARA MINIMAX ---
function simplifyMusicPrompt(prompt: any) {
  // Si el prompt es corto, usarlo tal cual
  if (prompt.length <= 200) return prompt;

  // Extraer palabras clave: género, mood, instrumentos
  const genreKeywords = ['jazz', 'pop', 'rock', 'classical', 'electronic', 'hip hop', 'r&b',
    'country', 'blues', 'reggae', 'latin', 'folk', 'metal', 'punk', 'soul', 'funk',
    'ballad', 'waltz', 'techno', 'house', 'ambient', 'lo-fi', 'lofi', 'edm', 'trap',
    'orchestral', 'acoustic', 'romantic', 'melancholic', 'upbeat', 'chill', 'dark'];

  const instrumentKeywords = ['piano', 'guitar', 'violin', 'saxophone', 'drums', 'bass',
    'flute', 'cello', 'trumpet', 'synth', 'strings', 'orchestra', 'horn', 'clarinet'];

  const lowerPrompt = prompt.toLowerCase();

  const foundGenres = genreKeywords.filter(g => lowerPrompt.includes(g));
  const foundInstruments = instrumentKeywords.filter(i => lowerPrompt.includes(i));

  // Construir prompt simplificado
  let simplified = '';
  if (foundGenres.length > 0) {
    simplified += foundGenres.join(' ') + ' ';
  }

  // Extraer mood si existe
  const moodMatch = prompt.match(/mood\s*(?:is|:)\s*([\w\s,]+)/i) ||
    prompt.match(/(tender|nostalgic|elegant|romantic|upbeat|dark|chill|happy|sad|energetic)/i);
  if (moodMatch) {
    simplified += (moodMatch[1] || moodMatch[0]).trim() + ' ';
  }

  if (foundInstruments.length > 0) {
    simplified += 'with ' + foundInstruments.join(' and ') + ' ';
  }

  // Si no pudimos extraer nada útil, truncar
  if (!simplified || simplified.trim().length < 10) {
    simplified = prompt.substring(0, 180);
  }

  return simplified.trim().substring(0, 500); // Límite seguro
}
