// Modos con los que un estudiante puede "hacer tarea". El profesor activa un
// subconjunto por tarea y el estudiante completa exactamente cuatro distintos.
export const TASK_MODES = [
  'document',
  'quiz4',
  'quiz_free',
  'flashcards',
  'find_error',
  'recall',
  'summary',
  'concept_map',
  'predict_output',
  'find_bug',
  'order_code',
  'ludo',
] as const;

export type TaskMode = (typeof TASK_MODES)[number];

export const REQUIRED_TASK_MODES = 4;

export function isTaskMode(value: unknown): value is TaskMode {
  return TASK_MODES.includes(String(value) as TaskMode);
}

/** Acepta un arreglo, un JSON o una lista separada por comas. Devuelve null si no hay nada. */
export function parseTaskModes(raw: unknown): TaskMode[] | null {
  if (raw === null || raw === undefined || raw === '') return null;
  let list: unknown = raw;
  if (typeof raw === 'string') {
    try {
      list = JSON.parse(raw);
    } catch {
      list = raw.split(',');
    }
  }
  if (!Array.isArray(list)) return null;
  const modes: TaskMode[] = [];
  for (const item of list) {
    const value = String(item ?? '').trim();
    if (isTaskMode(value) && !modes.includes(value)) modes.push(value);
  }
  return modes.length ? modes : null;
}

/** Modos que el profesor dejó activos. Sin configuración = todos (compatibilidad). */
export function enabledTaskModes(raw: unknown): TaskMode[] {
  return parseTaskModes(raw) ?? [...TASK_MODES];
}

export const TASK_MODE_LABELS: Record<TaskMode, string> = {
  document: 'Documento o imagen',
  quiz4: 'Quiz 4',
  quiz_free: 'Quiz libre',
  flashcards: 'Flashcards',
  find_error: 'Detecta el error',
  recall: 'Recuerdo libre',
  summary: 'Resumen con límite',
  concept_map: 'Mapa conceptual',
  predict_output: 'Predice la salida',
  find_bug: 'Encuentra el bug',
  order_code: 'Ordena el código',
  ludo: 'Ludo multijugador',
};
