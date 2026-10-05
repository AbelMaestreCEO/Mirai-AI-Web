// Modelos de DeepSeek que usan worker.ts y classroom.ts.
//
// Viven aquí y no en worker.ts porque el módulo principal del Worker solo puede
// exportar handlers y funciones: workerd se niega a arrancar si exporta un
// string ("Incorrect type for map entry 'AI_MODEL_PRO'").
export const AI_MODEL_NORMAL = 'deepseek-v4-flash';
export const AI_MODEL_PRO = 'deepseek-v4-pro';
