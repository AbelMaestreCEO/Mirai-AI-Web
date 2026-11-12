import {
  enabledTaskModes,
  parseTaskModes,
  REQUIRED_TASK_MODES,
  TaskMode,
} from './task-modes';

let taskModeTablesReady = false;

/** Tablas y columna de apoyo para el flujo de "4 modos por tarea". */
export async function ensureTaskModeTables(env: Env) {
  if (taskModeTablesReady) return;
  const statements = [
    `CREATE TABLE IF NOT EXISTS task_mode_selections (
      assignment_id TEXT NOT NULL,
      user_dni      TEXT NOT NULL,
      modes         TEXT NOT NULL,
      created_at    TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (assignment_id, user_dni)
    )`,
    `CREATE TABLE IF NOT EXISTS task_mode_results (
      assignment_id TEXT NOT NULL,
      user_dni      TEXT NOT NULL,
      mode          TEXT NOT NULL,
      score         REAL,
      max_score     REAL,
      status        TEXT DEFAULT 'completed',
      ref           TEXT,
      feedback      TEXT,
      created_at    TEXT DEFAULT (datetime('now')),
      updated_at    TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (assignment_id, user_dni, mode)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_task_mode_results_user
      ON task_mode_results (assignment_id, user_dni)`,
    'ALTER TABLE assignments ADD COLUMN activity_modes TEXT',
  ];
  for (const sql of statements) {
    try {
      await env.MIRAI_AI_DB.prepare(sql).run();
    } catch {
      // La tabla o la columna ya existen.
    }
  }
  taskModeTablesReady = true;
}

export interface TaskModeResult {
  score: number | null;
  max_score: number;
  status: string;
}

export interface TaskProgress {
  assignment_id: string;
  max_score: number;
  formative: boolean;
  enabled_modes: TaskMode[];
  selected_modes: TaskMode[];
  required: number;
  completed_count: number;
  total_points: number;
  current_average: number;
  final_score: number | null;
  complete: boolean;
  results: Record<string, TaskModeResult>;
  legacy_score: number | null;
}

interface AssignmentRow {
  max_score?: number | null;
  grading_mode?: string | null;
  activity_modes?: string | null;
}

async function loadAssignment(env: Env, assignmentId: string): Promise<AssignmentRow | null> {
  return env.MIRAI_AI_DB.prepare(
    'SELECT max_score, grading_mode, activity_modes FROM assignments WHERE id = ?',
  ).bind(assignmentId).first<AssignmentRow>();
}

export async function getSelectedTaskModes(
  env: Env,
  assignmentId: string,
  userDni: string,
): Promise<TaskMode[] | null> {
  await ensureTaskModeTables(env);
  const row = await env.MIRAI_AI_DB.prepare(
    'SELECT modes FROM task_mode_selections WHERE assignment_id = ? AND UPPER(user_dni) = UPPER(?)',
  ).bind(assignmentId, userDni).first<any>();
  if (!row) return null;
  return parseTaskModes(row.modes) ?? [];
}

export async function saveTaskModeSelection(
  env: Env,
  assignmentId: string,
  userDni: string,
  modes: TaskMode[],
) {
  await ensureTaskModeTables(env);
  const owner = userDni.toUpperCase();
  await env.MIRAI_AI_DB.prepare(
    `INSERT INTO task_mode_selections (assignment_id, user_dni, modes, created_at)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT (assignment_id, user_dni) DO UPDATE SET
       modes = excluded.modes, created_at = datetime('now')`,
  ).bind(assignmentId, owner, JSON.stringify(modes)).run();
}

export async function deleteTaskModeProgress(env: Env, assignmentId: string, userDni: string) {
  await ensureTaskModeTables(env);
  const owner = userDni.toUpperCase();
  await env.MIRAI_AI_DB.prepare(
    'DELETE FROM task_mode_results WHERE assignment_id = ? AND UPPER(user_dni) = UPPER(?)',
  ).bind(assignmentId, owner).run();
  await env.MIRAI_AI_DB.prepare(
    'DELETE FROM task_mode_selections WHERE assignment_id = ? AND UPPER(user_dni) = UPPER(?)',
  ).bind(assignmentId, owner).run();
}

export async function getTaskProgress(
  env: Env,
  assignmentId: string,
  userDni: string,
  assignment?: AssignmentRow | null,
): Promise<TaskProgress> {
  await ensureTaskModeTables(env);
  const row = assignment ?? await loadAssignment(env, assignmentId);
  const maxScore = Math.max(1, Math.round(Number(row?.max_score) || 100));
  const enabled = enabledTaskModes(row?.activity_modes);

  const selection = await env.MIRAI_AI_DB.prepare(
    'SELECT modes FROM task_mode_selections WHERE assignment_id = ? AND UPPER(user_dni) = UPPER(?)',
  ).bind(assignmentId, userDni).first<any>();
  const selected = (parseTaskModes(selection?.modes) ?? []).filter((mode) => enabled.includes(mode));

  const { results: resultRows } = await env.MIRAI_AI_DB.prepare(
    'SELECT mode, score, max_score, status FROM task_mode_results WHERE assignment_id = ? AND UPPER(user_dni) = UPPER(?)',
  ).bind(assignmentId, userDni).all<any>();

  const results: Record<string, TaskModeResult> = {};
  for (const result of resultRows || []) {
    results[String(result.mode)] = {
      score: result.score === null || result.score === undefined ? null : Number(result.score),
      max_score: Number(result.max_score) || maxScore,
      status: String(result.status || 'completed'),
    };
  }

  const completedModes = selected.filter((mode) => {
    const result = results[mode];
    return !!result && result.status === 'completed' && result.score !== null;
  });
  const totalPoints = completedModes.reduce((sum, mode) => sum + Number(results[mode]?.score || 0), 0);
  const completedCount = completedModes.length;
  const currentAverage = completedCount ? Math.round(totalPoints / completedCount) : 0;
  const complete = selected.length === REQUIRED_TASK_MODES && completedCount === REQUIRED_TASK_MODES;
  const finalScore = complete ? Math.round(totalPoints / REQUIRED_TASK_MODES) : null;

  const submission = await env.MIRAI_AI_DB.prepare(
    'SELECT score FROM submissions WHERE assignment_id = ? AND UPPER(user_dni) = UPPER(?)',
  ).bind(assignmentId, userDni).first<any>();

  return {
    assignment_id: assignmentId,
    max_score: maxScore,
    formative: row?.grading_mode === 'formative',
    enabled_modes: enabled,
    selected_modes: selected,
    required: REQUIRED_TASK_MODES,
    completed_count: completedCount,
    total_points: totalPoints,
    current_average: currentAverage,
    final_score: finalScore,
    complete,
    results,
    legacy_score: selected.length
      ? null
      : (submission?.score === null || submission?.score === undefined ? null : Number(submission.score)),
  };
}

/** Guarda el resultado de un modo y recalcula la nota compuesta de la tarea. */
export async function recordTaskModeResult(
  env: Env,
  assignmentId: string,
  userDni: string,
  mode: TaskMode,
  score: number | null,
  maxScore: number,
  ref: string | null,
  feedback?: unknown,
  status: 'completed' | 'pending' = 'completed',
): Promise<TaskProgress> {
  await ensureTaskModeTables(env);
  const owner = userDni.toUpperCase();
  const safeScore = score === null || score === undefined ? null : Math.max(0, Number(score));
  const feedbackJson = feedback === undefined || feedback === null ? null : JSON.stringify(feedback);

  await env.MIRAI_AI_DB.prepare(
    `INSERT INTO task_mode_results
       (assignment_id, user_dni, mode, score, max_score, status, ref, feedback, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
     ON CONFLICT (assignment_id, user_dni, mode) DO UPDATE SET
       score = CASE
         WHEN excluded.status = 'completed'
              AND (status != 'completed' OR COALESCE(excluded.score, 0) > COALESCE(score, 0))
         THEN excluded.score ELSE score END,
       status = CASE WHEN excluded.status = 'completed' THEN 'completed' ELSE status END,
       max_score = excluded.max_score,
       ref = COALESCE(excluded.ref, ref),
       feedback = COALESCE(excluded.feedback, feedback),
       updated_at = datetime('now')`,
  ).bind(assignmentId, owner, mode, safeScore, maxScore, status, ref, feedbackJson).run();

  return recomputeTaskSubmission(env, assignmentId, owner);
}

/** Cuando los 4 modos están completos, escribe la nota final en `submissions`. */
export async function recomputeTaskSubmission(
  env: Env,
  assignmentId: string,
  userDni: string,
): Promise<TaskProgress> {
  const progress = await getTaskProgress(env, assignmentId, userDni);
  if (!progress.complete) return progress;

  const owner = userDni.toUpperCase();
  const existing = await env.MIRAI_AI_DB.prepare(
    'SELECT id, file_url FROM submissions WHERE assignment_id = ? AND UPPER(user_dni) = UPPER(?)',
  ).bind(assignmentId, owner).first<any>();

  const total = progress.final_score ?? Math.round(progress.total_points / REQUIRED_TASK_MODES);
  const storedScore = progress.formative ? null : total;
  const keepFile = String(existing?.file_url || '').startsWith('/api/file/');
  const fileUrl = keepFile ? existing.file_url : 'composite://task';
  const feedback = JSON.stringify({
    general: progress.formative
      ? `Tarea completada con ${progress.completed_count} de ${REQUIRED_TASK_MODES} actividades. Práctica formativa: no afecta tu nota.`
      : `Tarea completada con ${progress.completed_count} de ${REQUIRED_TASK_MODES} actividades. Nota final: ${total}/${progress.max_score}.`,
    modes: progress.results,
    formative: progress.formative,
  });

  if (existing) {
    await env.MIRAI_AI_DB.prepare(
      `UPDATE submissions
          SET file_url = ?, status = 'evaluated', score = ?, feedback = ?,
              graded_at = datetime('now'), submitted_at = datetime('now'), attempt_type = 'mixed'
        WHERE id = ?`,
    ).bind(fileUrl, storedScore, feedback, existing.id).run();
  } else {
    await env.MIRAI_AI_DB.prepare(
      `INSERT INTO submissions
         (id, assignment_id, user_dni, file_url, status, score, feedback, graded_at,
          submitted_at, attempt_type, retry_used)
       VALUES (?, ?, ?, ?, 'evaluated', ?, ?, datetime('now'), datetime('now'), 'mixed', 0)`,
    ).bind(crypto.randomUUID(), assignmentId, owner, fileUrl, storedScore, feedback).run();
  }

  return {
    ...progress,
    final_score: total,
    legacy_score: storedScore,
  };
}
