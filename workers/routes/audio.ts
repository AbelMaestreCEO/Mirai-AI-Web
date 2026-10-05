/* ============================================
   MIRAI AI - Audio: TTS, transcripción y audios del usuario

   ============================================ */
import { jsonResponse } from '../lib/http';
import { saveMessage } from './conversations';

// --- GENERAR TTS Y GUARDAR EN R2 (CORREGIDO) ---
export async function generateAndStoreTTS(text: any, conversationId: any, env: Env) {
  try {
    if (!env.AI) {
      console.error('❌ CRÍTICO: env.AI no está definido.');
      return null;
    }

    const cleanedText = cleanTextForTTS(text);
    if (!cleanedText || cleanedText.length < 10) {
      console.log('⚠️ Texto muy corto para TTS');
      return null;
    }

    const segments = segmentTextForTTS(cleanedText);
    console.log(`🎤 Generando TTS: ${segments.length} segmento(s)`);

    const audioBuffers: any[] = [];

    for (const segment of segments) {
      try {
        const ttsResult: any = await env.AI.run('inworld/tts-1.5-mini', {
          text: segment,
          voice_id: 'Serena',
          output_format: 'mp3',
          temperature: 0.8,
          speaking_rate: 1.1,
          timestamp_type: 'none',
        }, {
          gateway: { id: 'default' },
        });

        console.log('🔍 ttsResult tipo:', typeof ttsResult);
        console.log('🔍 ttsResult completo:', JSON.stringify(ttsResult, null, 2));

        let audioBuffer: any = null;

        // CASO 1: La API devuelve una URL en result.audio (Lo que está pasando ahora)
        if (ttsResult?.result?.audio && typeof ttsResult.result.audio === 'string') {
          console.log('🔗 Detectada URL de audio:', ttsResult.result.audio);

          try {
            // Descargar el audio desde la URL
            const downloadResponse = await fetch(ttsResult.result.audio);

            if (!downloadResponse.ok) {
              throw new Error(`Error descargando audio: ${downloadResponse.status}`);
            }

            audioBuffer = await downloadResponse.arrayBuffer();
            console.log('✅ Audio descargado y convertido a ArrayBuffer:', audioBuffer.byteLength, 'bytes');
          } catch (downloadError: any) {
            console.error('❌ Error descargando audio desde URL:', downloadError.message);
          }
        }
        // CASO 2: ArrayBuffer directo (caso antiguo)
        else if (ttsResult instanceof ArrayBuffer && ttsResult.byteLength > 0) {
          audioBuffer = ttsResult;
          console.log('✅ ArrayBuffer directo capturado');
        }
        // CASO 3: Propiedad .audio directa (si la API cambia)
        else if (ttsResult?.audio instanceof ArrayBuffer) {
          audioBuffer = ttsResult.audio;
          console.log('✅ Propiedad .audio capturada');
        }
        // CASO 4: ReadableStream
        else if (ttsResult && typeof ttsResult === 'object' && typeof ttsResult.getReader === 'function') {
          console.log('🔍 ttsResult es un ReadableStream, consumiendo...');
          const reader = ttsResult.getReader();
          const chunks: any[] = [];
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
          }
          const totalLength = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
          const combined = new Uint8Array(totalLength);
          let offset = 0;
          for (const chunk of chunks) {
            combined.set(new Uint8Array(chunk), offset);
            offset += chunk.byteLength;
          }
          audioBuffer = combined.buffer;
          console.log('✅ Audio extraído del ReadableStream:', audioBuffer.byteLength, 'bytes');
        }
        else {
          console.error('❌ Formato no reconocido');
          console.error('❌ Estructura:', JSON.stringify(ttsResult, null, 2));
        }

        if (audioBuffer && audioBuffer.byteLength > 0) {
          audioBuffers.push(audioBuffer);
        } else {
          console.warn('⚠️ Segmento sin audio válido');
        }

      } catch (segError: any) {
        console.error('❌ Error en segmento TTS:', segError.message);
      }
    }

    if (audioBuffers.length === 0) {
      console.error('❌ TTS no generó audio válido');
      return null;
    }

    // Combinar buffers si hay múltiples segmentos
    let finalBuffer;
    if (audioBuffers.length === 1) {
      finalBuffer = audioBuffers[0];
    } else {
      const totalLength = audioBuffers.reduce((sum, buf) => sum + buf.byteLength, 0);
      const combined = new Uint8Array(totalLength);
      let offset = 0;
      for (const buf of audioBuffers) {
        combined.set(new Uint8Array(buf), offset);
        offset += buf.byteLength;
      }
      finalBuffer = combined.buffer;
    }

    // Subir a R2
    const audioId = crypto.randomUUID();
    const r2Key = `tts/${conversationId}/${audioId}.mp3`;

    await env.MIRAI_AI_ASSETS.put(r2Key, finalBuffer, {
      httpMetadata: { contentType: 'audio/mpeg' },
      customMetadata: { conversation_id: conversationId }
    });

    console.log(`✅ Audio guardado en R2: ${r2Key}`);
    return `/api/audio/${r2Key}`;

  } catch (error: any) {
    console.error('❌ Error en generateAndStoreTTS:', error.message);
    console.error('Stack:', error.stack);
    return null;
  }
}

// --- MANEJAR SUBIDA DE AUDIO DE USUARIO ---
export async function handleUploadUserAudio(request: Request, env: Env, corsHeaders: Record<string, string>) {
  try {
    const formData = await request.formData();
    const audioFile = formData.get('audio') as File | null;
    const conversationId = formData.get('conversation_id') as string | null;

    if (!audioFile || !conversationId) {
      return jsonResponse({ error: 'Faltan el audio o conversation_id' }, 400, corsHeaders);
    }

    // Generar nombre único
    const uniqueId = crypto.randomUUID();
    const filename = `user-audio/${conversationId}/${uniqueId}.webm`;

    // Subir a R2
    await env.MIRAI_AI_ASSETS.put(filename, audioFile.stream(), {
      httpMetadata: { contentType: audioFile.type },
      customMetadata: {
        conversation_id: conversationId,
        uploaded_at: new Date().toISOString()
      }
    });

    // Construir URL relativa
    const audioUrl = `/api/audio/${filename}`;

    return jsonResponse({
      success: true,
      audio_url: audioUrl,
      r2_key: filename
    }, 200, corsHeaders);

  } catch (error: any) {
    console.error('Error subiendo audio de usuario:', error);
    return jsonResponse({ error: 'Error al subir audio', details: error.message }, 500, corsHeaders);
  }
}

// --- MANEJAR TRANSCRIPCIÓN CON WHISPER (ACTUALIZADO) ---
export async function handleTranscribeAudio(request: Request, env: Env, corsHeaders: Record<string, string>) {
  try {
    const formData = await request.formData();
    const audioFile = formData.get('audio') as File | null;
    const conversationId = formData.get('conversation_id') as string | null;

    if (!audioFile) {
      return jsonResponse({ error: 'Falta el archivo de audio' }, 400, corsHeaders);
    }

    // 1. Subir el audio a R2 PRIMERO (igual que antes)
    const uniqueId = crypto.randomUUID();
    const filename = `user-audio/${conversationId}/${uniqueId}.webm`;

    await env.MIRAI_AI_ASSETS.put(filename, audioFile.stream(), {
      httpMetadata: { contentType: audioFile.type },
      customMetadata: {
        // Mismo valor que ya va en la ruta del archivo (user-audio/<id>/...).
        conversation_id: String(conversationId),
        uploaded_at: new Date().toISOString()
      }
    });

    const audioUrl = `/api/audio/${filename}`; // URL relativa para guardar en DB

    // 2. Transcribir el audio (para procesar la intención, pero NO guardar el texto como mensaje principal)
    const arrayBuffer = await audioFile.arrayBuffer();
    const base64Audio = arrayBufferToBase64(arrayBuffer);

    const whisperResult = await env.AI.run("@cf/openai/whisper-large-v3-turbo", {
      audio: base64Audio,
      language: "es",
      task: "transcribe"
    });

    const transcription = whisperResult.text || '';

    if (!transcription || transcription.trim().length === 0) {
      return jsonResponse({
        success: false,
        error: 'No se detectó voz en el audio'
      }, 200, corsHeaders);
    }

    // 3. Guardar el mensaje en D1 con la URL del audio
    // NOTA: Guardamos el texto transcrito en 'content' para referencia, 
    // pero la URL del audio es lo importante para la reproducción.
    if (conversationId) {
      // Usamos saveMessage para guardar tanto el texto (como metadata) como la URL del audio
      await saveMessage(conversationId, 'user', transcription, env, audioUrl);
    }

    // 4. Devolver la respuesta al frontend
    // El frontend usará 'audio_url' para mostrar el reproductor
    return jsonResponse({
      success: true,
      transcription: transcription.trim(),
      audio_url: audioUrl // ← DEVOLVER LA URL DEL AUDIO AL FRONTEND
    }, 200, corsHeaders);

  } catch (error: any) {
    console.error('❌ Error en handleTranscribeAudio:', error.message);
    return jsonResponse({
      error: 'Error en transcripción',
      details: error.message
    }, 500, corsHeaders);
  }
}

// --- Utilidad: ArrayBuffer a Base64 (SIN window) ---
function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary); // btoa() es global en Workers, NO usar window.btoa()
}

// --- LIMPIAR TEXTO PARA TTS ---
function cleanTextForTTS(text: any) {
  let cleaned = text;
  // Remover bloques de código
  cleaned = cleaned.replace(/```[\s\S]*?```/g, '');
  // Código inline
  cleaned = cleaned.replace(/`([^`]+)`/g, '$1');
  // Markdown
  cleaned = cleaned.replace(/\*\*(.+?)\*\*/g, '$1');
  cleaned = cleaned.replace(/\*(.+?)\*/g, '$1');
  cleaned = cleaned.replace(/^#{1,6}\s+(.+)$/gm, '$1');
  cleaned = cleaned.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1');
  cleaned = cleaned.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '');
  cleaned = cleaned.replace(/^---+$/gm, '');
  cleaned = cleaned.replace(/^>\s+/gm, '');
  cleaned = cleaned.replace(/^[-*+]\s+/gm, '');
  cleaned = cleaned.replace(/^\d+\.\s+/gm, '');
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
  cleaned = cleaned.replace(/  +/g, ' ');
  return cleaned.trim();
}

function segmentTextForTTS(text: any, maxLength = 2000) {
  if (text.length <= maxLength) return [text];

  const segments: any[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      segments.push(remaining);
      break;
    }

    let cutIndex = maxLength;
    const naturalBreaks = ['. ', '.\n', '! ', '? ', '。\n', '\n\n'];

    for (const breaker of naturalBreaks) {
      const lastIndex = remaining.lastIndexOf(breaker, maxLength);
      if (lastIndex > maxLength * 0.5) {
        cutIndex = lastIndex + breaker.length;
        break;
      }
    }

    segments.push(remaining.substring(0, cutIndex).trim());
    remaining = remaining.substring(cutIndex).trim();
  }

  return segments.filter(s => s.length > 0);
}

// --- SERVIR AUDIO DESDE R2 ---
export async function handleServeAudio(path: string, env: Env) {
  try {
    const r2Key = path.replace('/api/audio/', '');

    const object = await env.MIRAI_AI_ASSETS.get(r2Key);

    if (object === null) {
      return new Response('Audio no encontrado', { status: 404 });
    }

    const headers = new Headers();
    headers.set('Content-Type', 'audio/mpeg');
    headers.set('Cache-Control', 'public, max-age=86400');
    headers.set('Accept-Ranges', 'bytes');
    headers.set('Access-Control-Allow-Origin', '*');

    return new Response(object.body, { headers });

  } catch (error) {
    console.error('Error sirviendo audio:', error);
    return new Response('Error interno', { status: 500 });
  }
}
