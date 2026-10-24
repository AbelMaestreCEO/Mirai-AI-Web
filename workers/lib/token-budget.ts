/* ============================================
   MIRAI AI - Presupuesto de tokens de entrada

   Recorta el historial más antiguo cuando la conversación crece demasiado.
   Nunca toca el prompt de sistema (la persona de Mirai) ni el mensaje actual,
   así que se ahorran tokens sin cambiar quién es ni lo que acaba de preguntar
   el usuario.
   ============================================ */

/** Tokens aproximados de un contenido de mensaje (texto, imágenes, archivos). */
function estimateContentTokens(content: any): number {
  if (typeof content === 'string') return Math.ceil(content.length / 4);
  if (!Array.isArray(content)) return 0;

  let total = 0;
  for (const part of content) {
    if (!part) continue;
    if (part.type === 'text') total += Math.ceil(String(part.text || '').length / 4);
    // Una imagen o un archivo inline cuesta bastante más que su texto base64.
    else if (part.type === 'image_url' || part.type === 'file') total += 1200;
    else total += 8;
  }
  return total;
}

export function estimateMessageTokens(message: any): number {
  return estimateContentTokens(message?.content) + 4;
}

/**
 * Conserva el prompt de sistema y el último mensaje, y va añadiendo turnos
 * anteriores desde el más reciente mientras quepan en `budget`.
 */
export function trimMessagesToBudget(messages: any[], budget = 32000): any[] {
  if (!Array.isArray(messages) || messages.length <= 1) return messages;

  const hasSystem = messages[0]?.role === 'system';
  const head = hasSystem ? messages[0] : null;
  const body = hasSystem ? messages.slice(1) : messages.slice();
  if (body.length <= 1) return messages;

  const last = body[body.length - 1];
  const older = body.slice(0, -1);

  let used = (head ? estimateMessageTokens(head) : 0) + estimateMessageTokens(last);
  const kept: any[] = [];

  for (let i = older.length - 1; i >= 0; i--) {
    const message = older[i];
    const cost = estimateMessageTokens(message);
    if (used + cost > budget) break;
    kept.unshift(message);
    used += cost;
  }

  const omitted = older.length - kept.length;
  if (omitted === 0) return messages;

  const note = `[CONTEXTO COMPRIMIDO] Se omitieron ${omitted} mensaje${omitted === 1 ? '' : 's'} antiguo${omitted === 1 ? '' : 's'} para ahorrar tokens. No inventes su contenido; si hace falta un dato de esos turnos, pídeselo al usuario.`;

  const trimmed = head
    ? [{ ...head, content: `${head.content}\n\n${note}` }, ...kept, last]
    : [{ role: 'system', content: note }, ...kept, last];

  console.log(`🪙 Historial recortado: ${omitted} mensaje(s) omitido(s), ~${used} tokens de entrada.`);
  return trimmed;
}

/**
 * Instrucción de concisión. Va junto a la persona, no la sustituye: ahorra
 * tokens de salida sin que Mirai deje de sonar como Mirai.
 */
export const TOKEN_SAVING_NOTE = `
[AHORRO DE TOKENS]
Responde con la extensión justa: ve al grano, no repitas la pregunta ni des explicaciones que nadie pidió. Mantén siempre tu voz, tu cercanía y tu personaje; ser breve no significa responder seco ni romper el rol. Si el usuario pide detalle, dalo.`;
