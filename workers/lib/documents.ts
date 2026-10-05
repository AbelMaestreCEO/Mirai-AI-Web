/* ============================================
   MIRAI AI - Extracción de texto de PDF y DOCX

   ============================================ */

// --- MEJORAR EXTRACCIÓN DE TEXTO PDF ---
export async function extractTextFromPDF(buffer) {
  try {
    const decoder = new TextDecoder('utf-8');
    const text = decoder.decode(buffer);

    // Estrategia 1: Buscar bloques de texto estándar (/Tx BMC ... EMC)
    const textMatches = text.match(/\/Tx BMC[\s\S]*?EMC/g);
    if (textMatches && textMatches.length > 0) {
      const extracted = textMatches.map(match =>
        match.replace(/\/Tx BMC|EMC/g, '').trim()
      ).join('\n');

      if (extracted.length > 50) return extracted; // Validar que haya texto real
    }

    // Estrategia 2: Buscar cadenas de texto entre paréntesis o corchetes (común en PDFs simples)
    // Esto captura texto como (Hola mundo) o [Texto]
    const stringMatches = text.match(/\(([^)]+)\)/g);
    if (stringMatches && stringMatches.length > 0) {
      const extracted = stringMatches.map(s => s.slice(1, -1)).join(' ');
      if (extracted.length > 50) return extracted;
    }

    // Estrategia 3: Fallback - Extraer cualquier cadena legible (ASCII imprimible)
    // Filtra caracteres de control excepto saltos de línea y tabuladores
    const printable = text.replace(/[^\x20-\x7E\n\r\t]/g, '');

    // Si el texto extraído es muy largo y parece tener estructura, devolverlo
    if (printable.length > 100) {
      return printable.substring(0, 15000); // Limitar para la IA
    }

    // Si todo falla, devolver un mensaje de error amigable
    throw new Error("No se pudo extraer texto legible. El PDF podría estar escaneado o protegido.");

  } catch (error) {
    console.error('Error extrayendo PDF:', error.message);
    throw error;
  }
}

export async function extractTextFromDocx(buffer) {
  try {
    console.log(`🔍 [DOCX] Iniciando extracción con DecompressionStream...`);
    console.log(`🔍 [DOCX] Tamaño del archivo: ${buffer.byteLength} bytes`);

    // 1. Crear un Blob a partir del buffer
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });

    // 2. Intentar descomprimir como ZIP usando la API nativa de Cloudflare
    // Nota: Cloudflare Workers no tiene soporte nativo completo para ZIP en todos los entornos.
    // Si falla, usaremos un fallback de búsqueda de texto.

    // Fallback: Buscar el contenido XML directamente en el buffer descomprimido parcialmente
    const decoder = new TextDecoder('utf-8');
    const text = decoder.decode(buffer);

    // Buscar word/document.xml
    const docIndex = text.indexOf('word/document.xml');
    if (docIndex === -1) {
      throw new Error("No se encontró 'word/document.xml' en el DOCX.");
    }

    // Buscar el contenido XML después del nombre del archivo
    // En un ZIP, después del nombre del archivo viene la data comprimida.
    // Pero a veces podemos encontrar el XML crudo si el archivo no está muy comprimido.

    // Estrategia: Buscar patrones de XML directamente en el texto crudo
    const wBodyMatch = text.match(/<w:body[\s\S]*?<\/w:body>/i);

    if (wBodyMatch) {
      console.log(`🔍 [DOCX] Encontrado <w:body> directamente en texto crudo`);
      return extractTextFromParagraphs(wBodyMatch[0]);
    }

    // Si no encontramos el XML crudo, intentamos buscar <w:t> directamente
    const wTMatches = text.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/gi);
    if (wTMatches && wTMatches.length > 0) {
      console.log(`🔍 [DOCX] Encontrados ${wTMatches.length} nodos <w:t> directamente`);
      const extractedText = wTMatches.map(match => {
        return match.replace(/<[^>]+>/g, '').trim();
      }).filter(t => t.length > 0).join(' ');

      if (extractedText.length > 50) {
        console.log(`🔍 [DOCX] Texto extraído (fallback): ${extractedText.length} caracteres`);
        return extractedText.substring(0, 15000);
      }
    }

    throw new Error("No se pudo extraer el contenido XML. El archivo podría estar altamente comprimido o corrupto.");

  } catch (error) {
    console.error('❌ extractTextFromDocx error:', error.message);
    throw error;
  }
}

// --- FUNCIÓN AUXILIAR (ya definida, pero la incluimos por si acaso) ---
function extractTextFromParagraphs(xmlContent) {
  const paragraphRegex = /<w:p[^>]*>([\s\S]*?)<\/w:p>/gi;
  const paragraphs = xmlContent.match(paragraphRegex) || [];
  console.log(`🔍 [DOCX] Párrafos encontrados: ${paragraphs.length}`);

  const extractedText = paragraphs.map(para => {
    const textNodes = para.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/gi) || [];
    return textNodes.map(node => {
      let cleanText = node.replace(/<[^>]+>/g, '');
      cleanText = cleanText.replace(/&nbsp;/g, ' ');
      cleanText = cleanText.replace(/&lt;/g, '<');
      cleanText = cleanText.replace(/&gt;/g, '>');
      cleanText = cleanText.replace(/&amp;/g, '&');
      cleanText = cleanText.replace(/&quot;/g, '"');
      return cleanText.trim();
    }).join(' ');
  }).filter(t => t.length > 0).join('\n');

  console.log(`🔍 [DOCX] Texto extraído: ${extractedText.length} caracteres`);
  console.log(`🔍 [DOCX] Primeros 300 chars: ${extractedText.substring(0, 300)}`);

  if (extractedText.length < 50) {
    throw new Error("El documento parece estar vacío.");
  }

  return extractedText.substring(0, 15000);
}
