// Modelos de DeepSeek que usan el chat, el aula y el resto de rutas con IA.
//
// Ojo: nada de esto puede exportarse desde worker.ts. El módulo principal del
// Worker solo puede exportar handlers y funciones: workerd se niega a arrancar
// si exporta un string ("Incorrect type for map entry 'AI_MODEL_PRO'").
export const AI_MODEL_NORMAL = 'deepseek-v4-flash';
export const AI_MODEL_PRO = 'deepseek-v4-pro';
// El único que VE imágenes. Lo usa lib/vision.ts (aula e inventario).
export const AI_MODEL_VISION = 'deepseek-flash';
