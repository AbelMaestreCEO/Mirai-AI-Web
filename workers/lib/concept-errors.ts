/* ============================================
   MIRAI AI - Errores conceptuales del aula
   Cada fallo detectado (quiz, actividades, Ludo) registra el concepto que el
   estudiante no dominó. El docente consulta qué temas falla la clase.

   El docente solo ve agregados; nunca se expone a quién pertenece cada fila
   más allá de la sección/tarea que ya administra (falta-pedagogia.md §3.3).
   ============================================ */

const CONCEPT_DDL = `CREATE TABLE IF NOT EXISTS concept_errors (
  id            TEXT PRIMARY KEY,
  assignment_id TEXT NOT NULL,
  concept       TEXT NOT NULL,
  user_dni      TEXT NOT NULL,
  source        TEXT,
  created_at    TEXT DEFAULT (datetime('now'))
)`;

const CONCEPT_INDEXES = [
  `CREATE INDEX IF NOT EXISTS idx_concept_errors_assignment
     ON concept_errors (assignment_id, concept)`,
  `CREATE INDEX IF NOT EXISTS idx_concept_errors_user
     ON concept_errors (assignment_id, user_dni)`,
];

let conceptTableReady = false;

export async function ensureConceptErrorsTable(env: Env) {
  if (conceptTableReady) return;
  try {
    await env.MIRAI_AI_DB.prepare(CONCEPT_DDL).run();
    for (const sql of CONCEPT_INDEXES) {
      await env.MIRAI_AI_DB.prepare(sql).run();
    }
  } catch (error: any) {
    // Si la tabla ya existe con otra forma, no se rompe la evaluación.
    console.warn('concept_errors no disponible —', error?.message ?? error);
  }
  conceptTableReady = true;
}

/**
 * Registra uno o varios conceptos fallados. Los conceptos vienen etiquetados
 * por la generación (quiz/Ludo) o por el detalle de la actividad.
 */
export async function recordConceptErrors(
  env: Env,
  assignmentId: string | null | undefined,
  userDni: string,
  source: string,
  concepts: unknown[],
) {
  if (!assignmentId || !userDni) return;
  const clean = [
    ...new Set(
      concepts
        .map((value) => String(value ?? '').trim())
        .filter(Boolean)
        .map((value) => value.slice(0, 120)),
    ),
  ].slice(0, 20);
  if (!clean.length) return;

  await ensureConceptErrorsTable(env);
  const ownerDni = userDni.toUpperCase();
  for (const concept of clean) {
    try {
      await env.MIRAI_AI_DB.prepare(
        `INSERT INTO concept_errors (id, assignment_id, concept, user_dni, source)
         VALUES (?, ?, ?, ?, ?)`,
      )
        .bind(crypto.randomUUID(), assignmentId, concept, ownerDni, source)
        .run();
    } catch (error: any) {
      console.warn('No se pudo registrar el concepto fallado —', error?.message ?? error);
    }
  }
}
