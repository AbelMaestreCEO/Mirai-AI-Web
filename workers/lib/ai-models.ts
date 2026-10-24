// Modelos de DeepSeek que usan el chat, el aula y el resto de rutas con IA.
//
// Ojo: nada de esto puede exportarse desde worker.ts. El módulo principal del
// Worker solo puede exportar handlers y funciones: workerd se niega a arrancar
// si exporta un string ("Incorrect type for map entry 'AI_MODEL_PRO'").
//
// `deepseek-flash` es DeepSeek-V4.1-Flash-1017 (nombre oficial; los alias
// deepseek-v4-flash y deepseek-v4-flash-vision-exp siguen aceptándose). Es el
// modelo por defecto y el único que ve imágenes.
export const AI_MODEL_NORMAL = 'deepseek-flash';
export const AI_MODEL_PRO = 'deepseek-v4-pro';
export const AI_MODEL_VISION = 'deepseek-flash';
