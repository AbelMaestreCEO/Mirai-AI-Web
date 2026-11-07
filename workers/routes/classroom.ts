/* ============================================
   MIRAI AI - Aula, Cursos y Asistencia
   Aula virtual (materias, secciones, tareas, entregas y notas), catálogo
   de cursos y asistencia por QR. router.ts le pasa cada petición /api/ a
   handleClassroomApi y sigue con sus propias rutas si devuelve null.
   ============================================ */
import { callAI } from '../lib/ai';
import { AI_MODEL_NORMAL, AI_MODEL_PRO } from '../lib/ai-models';
import { isAdminUser, normalizeDni, requireAuth } from '../lib/auth';
import { extractTextFromDocx, extractTextFromPDF } from '../lib/documents';
import { extractTextFromOffice } from '../lib/office-text';
import { jsonResponse } from '../lib/http';
import { callVision } from '../lib/vision';
import { recordConceptErrors, ensureConceptErrorsTable } from '../lib/concept-errors';
import { getAssignmentForStudent } from './chat-context';

// ── QUIZ DE UNA TAREA ─────────────────────────────────────────
// Diez preguntas fijas por evaluación, ordenadas de fácil a difícil:
// 4 fáciles (20% del puntaje), 3 intermedias (30%) y 3 difíciles (50%).
// El puntaje total es el max_score que puso el profesor en la tarea.
const QUIZ_LEVELS = [
  { level: 'facil', count: 4, share: 0.2 },
  { level: 'intermedio', count: 3, share: 0.3 },
  { level: 'dificil', count: 3, share: 0.5 },
];

function buildQuizPoints(maxScore: number): number[] {
  const points: number[] = [];
  let assigned = 0;
  QUIZ_LEVELS.forEach((plan, planIndex) => {
    const levelTotal = planIndex === QUIZ_LEVELS.length - 1
      ? maxScore - assigned
      : Math.round(maxScore * plan.share);
    const base = Math.floor(levelTotal / plan.count);
    let remainder = levelTotal - base * plan.count;
    for (let i = 0; i < plan.count; i++) {
      points.push(base + (remainder > 0 ? 1 : 0));
      if (remainder > 0) remainder--;
    }
    assigned += levelTotal;
  });
  return points;
}

// Columnas de apoyo para registrar qué método eligió el alumno y si ya usó
// su único reinicio. Se crean al vuelo para no depender de una migración.
let quizSubmissionColumnsReady = false;

async function ensureQuizSubmissionColumns(env: Env) {
  if (quizSubmissionColumnsReady) return;
  for (const sql of [
    'ALTER TABLE submissions ADD COLUMN attempt_type TEXT',
    'ALTER TABLE submissions ADD COLUMN retry_used INTEGER DEFAULT 0',
    // Formativo vs sumativo: las tareas viejas quedan como sumativas.
    "ALTER TABLE assignments ADD COLUMN grading_mode TEXT DEFAULT 'summative'",
  ]) {
    try {
      await env.MIRAI_AI_DB.prepare(sql).run();
    } catch {
      // La columna ya existe.
    }
  }
  quizSubmissionColumnsReady = true;
}

// Planes de evaluación: agrupan varias tareas creadas por la IA a partir de un
// documento del profesor. Se crean de forma perezosa para no exigir migración.
let evaluationPlanTablesReady = false;

async function ensureEvaluationPlanTables(env: Env) {
  if (evaluationPlanTablesReady) return;
  const statements = [
    `CREATE TABLE IF NOT EXISTS evaluation_plans (
      id TEXT PRIMARY KEY,
      professor_dni TEXT NOT NULL,
      course_id TEXT NOT NULL,
      title TEXT NOT NULL,
      strategy TEXT,
      source_filename TEXT,
      max_score REAL NOT NULL,
      points_per_evaluation REAL NOT NULL,
      evaluation_count INTEGER NOT NULL,
      section_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    'ALTER TABLE evaluation_plans ADD COLUMN section_id TEXT',
    'ALTER TABLE assignments ADD COLUMN plan_id TEXT',
  ];
  for (const sql of statements) {
    try {
      await env.MIRAI_AI_DB.prepare(sql).run();
    } catch {
      // La tabla o columna ya existe.
    }
  }
  evaluationPlanTablesReady = true;
}

// Columna de enlaces de invitación: se garantiza aquí (además de la migración
// de router.ts) para que /api/sections nunca falle si el ALTER quedó pendiente.
let sectionInviteColumnReady = false;

async function ensureSectionInviteColumn(env: Env) {
  if (sectionInviteColumnReady) return;
  try {
    await env.MIRAI_AI_DB.prepare('ALTER TABLE sections ADD COLUMN invite_code TEXT').run();
  } catch {
    // La columna ya existe (o la tabla la crea la migración de router.ts).
  }
  sectionInviteColumnReady = true;
}

function quizLevelAt(index: number): string {
  let cursor = 0;
  for (const plan of QUIZ_LEVELS) {
    cursor += plan.count;
    if (index < cursor) return plan.level;
  }
  return 'dificil';
}

function normalizeQuizText(text: string): string {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function quizAnswerMatches(answer: string, expected: string): boolean {
  const a = normalizeQuizText(answer);
  const e = normalizeQuizText(expected);
  if (!a || !e) return false;
  if (a.includes(e) || e.includes(a)) return true;
  const expectedWords = e.split(' ').filter((w) => w.length > 3);
  if (!expectedWords.length) return false;
  const hits = expectedWords.filter((w) => a.includes(w)).length;
  return hits / expectedWords.length >= 0.6;
}

function parseQuizJson(raw: string): any {
  const cleaned = raw
    .replace(/^\uFEFF/, '')
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('La IA no devolvió un JSON válido');
  return JSON.parse(cleaned.slice(start, end + 1));
}

/**
 * Rutas del aula, los cursos y la asistencia.
 * @returns {Promise<Response|null>} null si la ruta no es de este módulo.
 */
export async function handleClassroomApi(request: Request, env: Env, url: URL, path: string, corsHeaders: Record<string, string>) {
  // Migraciones perezosas: las columnas de apoyo (attempt_type, retry_used y
  // grading_mode) deben existir antes de cualquier lectura de assignments.
  await ensureQuizSubmissionColumns(env);
  await ensureEvaluationPlanTables(env);
  await ensureSectionInviteColumn(env);

  // ── ASISTENCIA: Empleado ──────────────────────────────────
  if (path === '/api/attendance/my-profile' && request.method === 'GET')
    return handleAttMyProfile(request, env, corsHeaders);
  if (path === '/api/attendance/my-history' && request.method === 'GET')
    return handleAttMyHistory(request, env, corsHeaders);
  if (path === '/api/attendance/my-classes' && request.method === 'GET')
    return handleAttMyClasses(request, env, corsHeaders);
  if (path === '/api/attendance/record' && request.method === 'POST')
    return handleAttRecord(request, env, corsHeaders);
  if (path === '/api/attendance/admin/active-qr' && request.method === 'GET')
    return handleAttActiveQr(request, env, corsHeaders);
  if (path === '/api/attendance/admin/generate-qr' && request.method === 'POST')
    return handleAttGenerateQr(request, env, corsHeaders);
  if (path === '/api/attendance/admin/records' && request.method === 'GET')
    return handleAttAdminRecords(request, env, corsHeaders);
  if (path === '/api/attendance/admin/stats' && request.method === 'GET')
    return handleAttAdminStats(request, env, corsHeaders);
  if (path === '/api/attendance/admin/staff' && request.method === 'GET')
    return handleAttStaffList(request, env, corsHeaders);
  if (path === '/api/attendance/admin/staff' && request.method === 'POST')
    return handleAttStaffCreate(request, env, corsHeaders);
  if (path === '/api/attendance/admin/staff' && request.method === 'PUT')
    return handleAttStaffUpdate(request, env, corsHeaders);
  if (path === '/api/attendance/admin/lookup-user' && request.method === 'GET')
    return handleAttLookupUser(request, env, corsHeaders);

  // ── ASISTENCIA: Clases ────────────────────────────────────
  // GET /api/attendance/admin/sections — todas las secciones (para agregar a clase)
  if (path === '/api/attendance/admin/sections' && request.method === 'GET')
    return handleAttSectionList(request, env, corsHeaders);
  if (path === '/api/attendance/admin/classes' && request.method === 'GET')
    return handleAttClassList(request, env, corsHeaders);
  if (path === '/api/attendance/admin/classes' && request.method === 'POST')
    return handleAttClassCreate(request, env, corsHeaders);

  const attClassMatch = path.match(/^\/api\/attendance\/admin\/classes\/([^/]+)$/);
  if (attClassMatch) {
    const classId = attClassMatch[1];
    if (request.method === 'PUT')
      return handleAttClassUpdate(request, env, corsHeaders, classId);
    if (request.method === 'DELETE')
      return handleAttClassDelete(request, env, corsHeaders, classId);
  }
  const attClassStudentsMatch = path.match(/^\/api\/attendance\/admin\/classes\/([^/]+)\/students$/);
  if (attClassStudentsMatch) {
    const classId = attClassStudentsMatch[1];
    if (request.method === 'GET')
      return handleAttClassStudents(request, env, corsHeaders, classId);
    if (request.method === 'POST')
      return handleAttClassAddStudent(request, env, corsHeaders, classId);
  }
  const attClassStudentRemoveMatch = path.match(/^\/api\/attendance\/admin\/classes\/([^/]+)\/students\/([^/]+)$/);
  if (attClassStudentRemoveMatch) {
    const [, classId, studentDni] = attClassStudentRemoveMatch;
    if (request.method === 'DELETE')
      return handleAttClassRemoveStudent(request, env, corsHeaders, classId, studentDni);
  }
  const attClassQrMatch = path.match(/^\/api\/attendance\/admin\/classes\/([^/]+)\/qr$/);
  if (attClassQrMatch) {
    const classId = attClassQrMatch[1];
    if (request.method === 'GET')
      return handleAttClassActiveQr(request, env, corsHeaders, classId);
    if (request.method === 'POST')
      return handleAttClassGenerateQr(request, env, corsHeaders, classId);
  }

  if (path === '/api/user-courses' && request.method === 'GET') {
    const userDni = url.searchParams.get('user_dni');

    // ✨ Usar requireProfessorAuth en lugar de requireAuth
    const authenticatedDni = await requireProfessorAuth(request, env, corsHeaders);
    if (!authenticatedDni || authenticatedDni instanceof Response) return authenticatedDni; // Already returned error

    if (userDni && userDni !== authenticatedDni) {
      return jsonResponse({ error: 'Acceso denegado' }, 403, corsHeaders);
    }

    try {
      const { results } = await env.MIRAI_AI_DB.prepare(`
            SELECT id, title, description, created_at 
            FROM user_courses 
            WHERE user_dni = ? 
            ORDER BY created_at DESC
        `).bind(authenticatedDni).all<any>();

      return jsonResponse(results, 200, corsHeaders);
    } catch (error) {
      console.error('Error listando cursos:', error);
      return jsonResponse({ error: 'Error al obtener cursos' }, 500, corsHeaders);
    }
  }

  if (path === '/api/create-course' && request.method === 'POST') {
    // ✨ requireProfessorAuth en lugar de requireAuth
    const userDni = await requireProfessorAuth(request, env, corsHeaders);
    if (!userDni || userDni instanceof Response) return userDni;

    const { title, description } = await request.json<any>();

    if (!title) return jsonResponse({ error: 'El nombre del curso es obligatorio' }, 400, corsHeaders);

    const id = crypto.randomUUID();

    try {
      await env.MIRAI_AI_DB.prepare(`
            INSERT INTO user_courses (id, user_dni, title, description)
            VALUES (?, ?, ?, ?)
        `).bind(id, userDni, title, description || '').run();

      return jsonResponse({ success: true, id }, 201, corsHeaders);
    } catch (error: any) {
      console.error('Error creando curso:', error);
      if (error.message.includes('UNIQUE constraint failed')) {
        return jsonResponse({ error: 'Ya existe un curso con ese nombre para tu perfil' }, 409, corsHeaders);
      }
      return jsonResponse({ error: 'Error al crear el curso' }, 500, corsHeaders);
    }
  }

  // Ruta: GET /api/professor-disputes
  if (path === '/api/professor-disputes' && request.method === 'GET') {
    const userDni = await requireProfessorAuth(request, env, corsHeaders);
    if (!userDni || userDni instanceof Response) return userDni;

    try {
      const { results } = await env.MIRAI_AI_DB.prepare(`
            SELECT 
                s.id, 
                s.score, 
                s.professor_note, 
                s.dispute_status, 
                s.dispute_reason,
                s.submitted_at,
                a.title as assignment_title,
                a.max_score,
                a.course_id,
                u.first_name,
                u.last_name
            FROM submissions s
            JOIN assignments a ON s.assignment_id = a.id
            JOIN user_courses uc ON uc.id = a.course_id
            JOIN users u ON s.user_dni = u.dni
            WHERE s.dispute_status = 'pending' AND uc.user_dni = ?
            ORDER BY s.submitted_at DESC
        `).bind(userDni).all<any>();

      return jsonResponse(results, 200, corsHeaders);
    } catch (error) {
      console.error('Error obteniendo disputas:', error);
      return jsonResponse({ error: 'Error al obtener disputas' }, 500, corsHeaders);
    }
  }
  // Ruta: GET /api/professor-submissions
  if (path === '/api/professor-submissions' && request.method === 'GET') {
    const userDni = await requireProfessorAuth(request, env, corsHeaders);
    if (!userDni || userDni instanceof Response) return userDni;

    const search = (url.searchParams.get('search') || '').trim();
    const sectionId = url.searchParams.get('section_id') || '';

    try {
      let query = `
          SELECT
            s.id,
            s.user_dni,
            u.first_name,
            u.last_name,
            a.title      AS assignment_title,
            a.max_score,
            s.score,
            s.feedback,
            s.status,
            s.submitted_at,
            s.professor_feedback,
            a.course_id  AS course_id,
            a.section_id AS section_id,
            sec.name     AS section_name
          FROM submissions s
          JOIN assignments a   ON s.assignment_id = a.id
          JOIN user_courses uc ON a.course_id = uc.id
          LEFT JOIN users u    ON s.user_dni = u.dni
          LEFT JOIN sections sec ON a.section_id = sec.id
          WHERE uc.user_dni = ?
        `;
      const bindings = [userDni];

      if (sectionId) {
        query += ' AND a.section_id = ?';
        bindings.push(sectionId);
      }
      if (search) {
        query += ' AND (s.user_dni LIKE ? OR u.first_name LIKE ? OR u.last_name LIKE ?)';
        const like = `%${search}%`;
        bindings.push(like, like, like);
      }

      query += ' ORDER BY s.submitted_at DESC LIMIT 500';

      const stmt = env.MIRAI_AI_DB.prepare(query);
      const { results } = await stmt.bind(...bindings).all<any>();
      return jsonResponse(results, 200, corsHeaders);
    } catch (error) {
      console.error('Error obteniendo entregas:', error);
      return jsonResponse({ error: 'Error al obtener entregas' }, 500, corsHeaders);
    }
  }

  // Ruta: GET /api/section-grade-report?section_id=...
  // Matriz de notas de una sección: alumnos × tareas, para el reporte Excel.
  if (path === '/api/section-grade-report' && request.method === 'GET') {
    const userDni = await requireProfessorAuth(request, env, corsHeaders);
    if (!userDni || userDni instanceof Response) return userDni;

    const sectionId = (url.searchParams.get('section_id') || '').trim();
    if (!sectionId) return jsonResponse({ error: 'section_id requerido' }, 400, corsHeaders);

    try {
      const section = await env.MIRAI_AI_DB.prepare(`
        SELECT s.id, s.name, s.course_id, uc.title AS course_title
          FROM sections s
          LEFT JOIN user_courses uc ON uc.id = s.course_id
         WHERE s.id = ? AND s.professor_dni = ?
      `).bind(sectionId, userDni).first<any>();
      if (!section) return jsonResponse({ error: 'Sección no encontrada o no autorizada' }, 403, corsHeaders);

      const { results: students } = await env.MIRAI_AI_DB.prepare(`
        SELECT ss.user_dni AS dni,
               u.first_name, u.last_name
          FROM section_students ss
          LEFT JOIN users u ON UPPER(u.dni) = UPPER(ss.user_dni)
         WHERE ss.section_id = ?
         ORDER BY u.last_name, u.first_name, ss.user_dni
      `).bind(sectionId).all<any>();

      const { results: assignments } = await env.MIRAI_AI_DB.prepare(`
        SELECT id, title, max_score, due_date, published_at
          FROM assignments
         WHERE section_id = ?
         ORDER BY created_at ASC, title ASC
      `).bind(sectionId).all<any>();

      const { results: submissions } = await env.MIRAI_AI_DB.prepare(`
        SELECT s.user_dni, s.assignment_id, s.score, s.status, s.submitted_at
          FROM submissions s
          JOIN assignments a ON a.id = s.assignment_id
         WHERE a.section_id = ?
      `).bind(sectionId).all<any>();

      const scores: Record<string, Record<string, any>> = {};
      for (const sub of submissions || []) {
        const dni = String(sub.user_dni || '').toUpperCase();
        if (!scores[dni]) scores[dni] = {};
        scores[dni][String(sub.assignment_id)] = {
          score: sub.score,
          status: sub.status,
          submitted_at: sub.submitted_at,
        };
      }

      return jsonResponse({
        section,
        students: students || [],
        assignments: assignments || [],
        scores,
      }, 200, corsHeaders);
    } catch (error) {
      console.error('Error en reporte por sección:', error);
      return jsonResponse({ error: 'No se pudo generar el reporte por sección' }, 500, corsHeaders);
    }
  }

  // Ruta: GET /api/professor-concept-report
  // Agrupa los conceptos que más falla la clase en una tarea (o en todas las
  // tareas del profesor si no se envía assignment_id).
  if (path === '/api/professor-concept-report' && request.method === 'GET') {
    const userDni = await requireProfessorAuth(request, env, corsHeaders);
    if (!userDni || userDni instanceof Response) return userDni;

    const assignmentId = (url.searchParams.get('assignment_id') || '').trim();
    const courseId = (url.searchParams.get('course_id') || '').trim();
    if (assignmentId && !(await canManageAssignment(assignmentId, userDni, env))) {
      return jsonResponse({ error: 'Tarea no encontrada o no autorizada' }, 403, corsHeaders);
    }
    if (courseId) {
      const ownCourse = await env.MIRAI_AI_DB.prepare(
        'SELECT id FROM user_courses WHERE id = ? AND user_dni = ?'
      ).bind(courseId, userDni).first<any>();
      if (!ownCourse) return jsonResponse({ error: 'Materia no encontrada o no autorizada' }, 403, corsHeaders);
    }

    try {
      await ensureConceptErrorsTable(env);
      const where = assignmentId ? 'AND ce.assignment_id = ?' : courseId ? 'AND a.course_id = ?' : '';
      const bindings: string[] = [userDni.toUpperCase()];
      if (assignmentId) bindings.push(assignmentId);
      else if (courseId) bindings.push(courseId);

      const { results } = await env.MIRAI_AI_DB.prepare(`
        SELECT ce.concept,
               COUNT(*) AS failures,
               COUNT(DISTINCT ce.user_dni) AS students,
               MAX(ce.created_at) AS last_failure
          FROM concept_errors ce
          JOIN assignments a   ON a.id = ce.assignment_id
          JOIN user_courses uc ON uc.id = a.course_id
         WHERE uc.user_dni = ? ${where}
         GROUP BY ce.concept
         ORDER BY failures DESC, students DESC
         LIMIT 25
      `).bind(...bindings).all<any>();

      return jsonResponse({
        assignment_id: assignmentId || null,
        total_concepts: results.length,
        concepts: results,
      }, 200, corsHeaders);
    } catch (error: any) {
      console.error('Error en reporte de conceptos:', error);
      return jsonResponse({ error: 'No se pudo generar el reporte de conceptos' }, 500, corsHeaders);
    }
  }

  if (path === '/api/categories' && request.method === 'GET') {
    return await handleGetCategories(env, corsHeaders);
  }

  if (path === '/api/subcategories' && request.method === 'GET') {
    return await handleGetSubcategories(url, env, corsHeaders);
  }

  if (path === '/api/admin-tasks' && request.method === 'GET') {
    const userDni = await requireProfessorAuth(request, env, corsHeaders);
    if (!userDni || userDni instanceof Response) return userDni;

    try {
      const { results } = await env.MIRAI_AI_DB.prepare(`
    SELECT 
        a.*,
        uc.title as course_title,
        s.name   as section_name
    FROM assignments a
    LEFT JOIN user_courses uc ON a.course_id = uc.id
    LEFT JOIN sections     s  ON a.section_id = s.id
    WHERE uc.user_dni = ?
    ORDER BY a.created_at DESC
`).bind(userDni).all<any>();

      return jsonResponse(results, 200, corsHeaders);
    } catch (error) {
      console.error('Error listando tareas:', error);
      return jsonResponse({ error: 'Error al obtener tareas' }, 500, corsHeaders);
    }
  }

  if (path === '/api/courses' && request.method === 'GET') {
    return await handleGetCourses(env, corsHeaders);
  }

  if (path === '/api/categories-with-count' && request.method === 'GET') {
    return await handleGetCategoriesWithCount(env, corsHeaders);
  }

  // --- RUTAS COMPLETADAS PARA ADMIN (Continuación) ---

  // 4. Eliminar Tarea: DELETE /api/delete-assignment
  if (path === '/api/delete-assignment' && request.method === 'DELETE') {
    const userDni = await requireProfessorAuth(request, env, corsHeaders);
    if (!userDni || userDni instanceof Response) return userDni;

    const id = url.searchParams.get('id');
    if (!id) return jsonResponse({ error: 'ID requerido' }, 400, corsHeaders);

    // La tarea tiene que ser de un curso del profesor: antes cualquier profesor
    // activo podía borrar las tareas (y las entregas) de cualquier otro.
    if (!await canManageAssignment(id, userDni, env)) {
      return jsonResponse({ error: 'Tarea no encontrada o no autorizada' }, 403, corsHeaders);
    }

    try {
      // Eliminación en cascada manual
      await env.MIRAI_AI_DB.prepare("DELETE FROM assignment_students WHERE assignment_id = ?").bind(id).run();
      await env.MIRAI_AI_DB.prepare("DELETE FROM submissions WHERE assignment_id = ?").bind(id).run();
      await env.MIRAI_AI_DB.prepare("DELETE FROM assignments WHERE id = ?").bind(id).run();

      return jsonResponse({ success: true }, 200, corsHeaders);
    } catch (error) {
      console.error('Error eliminando tarea:', error);
      return jsonResponse({ error: 'Error al eliminar la tarea' }, 500, corsHeaders);
    }
  }

  // 5. Asignar Estudiante: POST /api/assign-student
  if (path === '/api/assign-student' && request.method === 'POST') {
    const userDni = await requireProfessorAuth(request, env, corsHeaders);
    if (!userDni || userDni instanceof Response) return userDni;

    const { assignment_id, user_dni } = await request.json<any>();

    if (!assignment_id || !user_dni) {
      return jsonResponse({ error: 'Faltan datos' }, 400, corsHeaders);
    }

    const studentDni = normalizeDni(user_dni);
    if (!studentDni) return jsonResponse({ error: 'DNI inválido' }, 400, corsHeaders);

    // La tarea tiene que pertenecer a un curso del profesor.
    if (!await canManageAssignment(assignment_id, userDni, env)) {
      return jsonResponse({ error: 'Tarea no encontrada o no autorizada' }, 403, corsHeaders);
    }

    try {
      // Insertar en tabla intermedia (ignora duplicados)
      await env.MIRAI_AI_DB.prepare(`
            INSERT OR IGNORE INTO assignment_students (assignment_id, user_dni) VALUES (?, ?)
        `).bind(assignment_id, studentDni).run();

      return jsonResponse({ success: true }, 200, corsHeaders);
    } catch (error) {
      console.error('Error asignando estudiante:', error);
      return jsonResponse({ error: 'Error al asignar estudiante' }, 500, corsHeaders);
    }
  }

  // 6. Listar Estudiantes de una Tarea: GET /api/task-students
  if (path === '/api/task-students' && request.method === 'GET') {
    const userDni = await requireProfessorAuth(request, env, corsHeaders);
    if (!userDni || userDni instanceof Response) return userDni;

    const assignmentId = url.searchParams.get('assignment_id');
    if (!assignmentId) return jsonResponse({ error: 'Falta ID de tarea' }, 400, corsHeaders);

    if (!await canManageAssignment(assignmentId, userDni, env)) {
      return jsonResponse({ error: 'Tarea no encontrada o no autorizada' }, 403, corsHeaders);
    }

    try {
      const { results } = await env.MIRAI_AI_DB.prepare(`
            SELECT * FROM assignment_students WHERE assignment_id = ?
        `).bind(assignmentId).all<any>();
      return jsonResponse(results, 200, corsHeaders);
    } catch (error) {
      console.error('Error listando estudiantes:', error);
      return jsonResponse({ error: 'Error al obtener estudiantes' }, 500, corsHeaders);
    }
  }

  // 7. Quitar Estudiante: DELETE /api/unassign-student
  if (path === '/api/unassign-student' && request.method === 'DELETE') {
    const userDni = await requireProfessorAuth(request, env, corsHeaders);
    if (!userDni || userDni instanceof Response) return userDni;

    const { assignment_id, user_dni } = await request.json<any>();
    if (!assignment_id || !user_dni) {
      return jsonResponse({ error: 'Faltan datos' }, 400, corsHeaders);
    }

    const studentDni = normalizeDni(user_dni);
    if (!studentDni) return jsonResponse({ error: 'DNI inválido' }, 400, corsHeaders);

    if (!await canManageAssignment(assignment_id, userDni, env)) {
      return jsonResponse({ error: 'Tarea no encontrada o no autorizada' }, 403, corsHeaders);
    }

    try {
      await env.MIRAI_AI_DB.prepare(`
            DELETE FROM assignment_students WHERE assignment_id = ? AND user_dni = ?
        `).bind(assignment_id, studentDni).run();

      return jsonResponse({ success: true }, 200, corsHeaders);
    } catch (error) {
      console.error('Error quitando estudiante:', error);
      return jsonResponse({ error: 'Error al quitar estudiante' }, 500, corsHeaders);
    }
  }

  // ── SECCIONES ─────────────────────────────────────────────────────────────

  // GET /api/sections — lista las secciones del profesor autenticado
  if (path === '/api/sections' && request.method === 'GET') {
    const userDni = await requireProfessorAuth(request, env, corsHeaders);
    if (!userDni || userDni instanceof Response) return userDni;

    const baseQuery = (withInviteCode: boolean) => `
    SELECT s.id, s.name, s.description, s.course_id, s.created_at${withInviteCode ? ', s.invite_code' : ''},
           uc.title as course_title,
           COUNT(ss.user_dni) as student_count
    FROM sections s
    LEFT JOIN user_courses  uc ON s.course_id = uc.id
    LEFT JOIN section_students ss ON s.id = ss.section_id
    WHERE UPPER(s.professor_dni) = UPPER(?)
    GROUP BY s.id
    ORDER BY s.created_at DESC
  `;

    let results: any[] = [];
    try {
      const res = await env.MIRAI_AI_DB.prepare(baseQuery(true)).bind(userDni).all<any>();
      results = res.results || [];
    } catch {
      // Base de datos antigua sin invite_code: se listan las secciones igual.
      const res = await env.MIRAI_AI_DB.prepare(baseQuery(false)).bind(userDni).all<any>();
      results = (res.results || []).map((row: any) => ({ ...row, invite_code: null }));
    }

    return jsonResponse(results, 200, corsHeaders);
  }

  // POST /api/create-section
  if (path === '/api/create-section' && request.method === 'POST') {
    const userDni = await requireProfessorAuth(request, env, corsHeaders);
    if (!userDni || userDni instanceof Response) return userDni;

    const { name, description, course_id } = await request.json<any>();
    if (!name || !course_id) {
      return jsonResponse({ error: 'Nombre y Materia son requeridos' }, 400, corsHeaders);
    }

    // Verificar que el curso pertenece al profesor
    const course = await env.MIRAI_AI_DB.prepare(
      'SELECT id FROM user_courses WHERE id = ? AND user_dni = ?'
    ).bind(course_id, userDni).first<any>();
    if (!course) return jsonResponse({ error: 'Materia no encontrada o no autorizada' }, 403, corsHeaders);

    const id = crypto.randomUUID();
    await env.MIRAI_AI_DB.prepare(`
    INSERT INTO sections (id, professor_dni, course_id, name, description)
    VALUES (?, ?, ?, ?, ?)
  `).bind(id, userDni, course_id, name, description || '').run();

    return jsonResponse({ success: true, id }, 201, corsHeaders);
  }

  // POST /api/section-invite — genera (o devuelve) el código del enlace de la sección.
  if (path === '/api/section-invite' && request.method === 'POST') {
    const userDni = await requireProfessorAuth(request, env, corsHeaders);
    if (!userDni || userDni instanceof Response) return userDni;

    const { section_id } = await request.json<any>().catch(() => ({}));
    if (!section_id) return jsonResponse({ error: 'section_id requerido' }, 400, corsHeaders);

    const sec = await env.MIRAI_AI_DB.prepare(
      'SELECT id, invite_code FROM sections WHERE id = ? AND professor_dni = ?'
    ).bind(section_id, userDni).first<any>();
    if (!sec) return jsonResponse({ error: 'Sección no encontrada o no autorizada' }, 403, corsHeaders);

    let code = sec.invite_code ? String(sec.invite_code) : '';
    if (!code) {
      code = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
      await env.MIRAI_AI_DB.prepare('UPDATE sections SET invite_code = ? WHERE id = ?')
        .bind(code, section_id).run();
    }

    return jsonResponse({ success: true, code, invite_code: code }, 200, corsHeaders);
  }

  // POST /api/join-section — el estudiante se une con el código del enlace.
  if (path === '/api/join-section' && request.method === 'POST') {
    const userDni = await requireAuth(request, env);
    if (!userDni) return jsonResponse({ error: 'No autorizado' }, 401, corsHeaders);

    const { code } = await request.json<any>().catch(() => ({}));
    const inviteCode = String(code || '').trim();
    if (!inviteCode) return jsonResponse({ error: 'Enlace inválido' }, 400, corsHeaders);

    const sec = await env.MIRAI_AI_DB.prepare(`
      SELECT s.id, s.name, s.course_id, uc.title AS course_title
        FROM sections s
        LEFT JOIN user_courses uc ON uc.id = s.course_id
       WHERE s.invite_code = ? COLLATE NOCASE
    `).bind(inviteCode).first<any>();
    if (!sec) return jsonResponse({ error: 'El enlace no es válido o la sección ya no existe' }, 404, corsHeaders);

    const ownerDni = userDni.toUpperCase();
    const before = await env.MIRAI_AI_DB.prepare(
      'SELECT 1 AS ok FROM section_students WHERE section_id = ? AND UPPER(user_dni) = UPPER(?)'
    ).bind(sec.id, ownerDni).first<any>();

    await env.MIRAI_AI_DB.prepare(
      'INSERT OR IGNORE INTO section_students (section_id, user_dni) VALUES (?, ?)'
    ).bind(sec.id, ownerDni).run();

    // Las tareas ya creadas para la sección también se asignan al alumno.
    await env.MIRAI_AI_DB.prepare(`
      INSERT OR IGNORE INTO assignment_students (assignment_id, user_dni)
      SELECT id, ? FROM assignments WHERE section_id = ?
    `).bind(ownerDni, sec.id).run();

    return jsonResponse({
      success: true,
      already_member: !!before,
      section: {
        id: sec.id,
        name: sec.name,
        course_id: sec.course_id,
        course_title: sec.course_title,
      },
    }, 200, corsHeaders);
  }

  // DELETE /api/delete-section?id=xxx
  if (path === '/api/delete-section' && request.method === 'DELETE') {
    const userDni = await requireProfessorAuth(request, env, corsHeaders);
    if (!userDni || userDni instanceof Response) return userDni;

    const id = url.searchParams.get('id');
    if (!id) return jsonResponse({ error: 'ID requerido' }, 400, corsHeaders);

    // Verificar propiedad
    const sec = await env.MIRAI_AI_DB.prepare(
      'SELECT id FROM sections WHERE id = ? AND professor_dni = ?'
    ).bind(id, userDni).first<any>();
    if (!sec) return jsonResponse({ error: 'No autorizado' }, 403, corsHeaders);

    await env.MIRAI_AI_DB.prepare('DELETE FROM section_students WHERE section_id = ?').bind(id).run();
    await env.MIRAI_AI_DB.prepare('UPDATE assignments SET section_id = NULL WHERE section_id = ?').bind(id).run();
    await env.MIRAI_AI_DB.prepare('DELETE FROM sections WHERE id = ?').bind(id).run();

    return jsonResponse({ success: true }, 200, corsHeaders);
  }

  // GET /api/section-students?section_id=xxx
  if (path === '/api/section-students' && request.method === 'GET') {
    const userDni = await requireProfessorAuth(request, env, corsHeaders);
    if (!userDni || userDni instanceof Response) return userDni;

    const sectionId = url.searchParams.get('section_id');
    if (!sectionId) return jsonResponse({ error: 'section_id requerido' }, 400, corsHeaders);

    // Verificar propiedad
    const sec = await env.MIRAI_AI_DB.prepare(
      'SELECT id FROM sections WHERE id = ? AND professor_dni = ?'
    ).bind(sectionId, userDni).first<any>();
    if (!sec) return jsonResponse({ error: 'No autorizado' }, 403, corsHeaders);

    const { results } = await env.MIRAI_AI_DB.prepare(`
    SELECT ss.user_dni,
       u.first_name, u.last_name, u.email, u.avatar_r2_key,
       CASE WHEN u.password_hash IS NOT NULL AND u.password_hash != '' THEN 1 ELSE 0 END AS is_registered
FROM section_students ss
LEFT JOIN users u ON ss.user_dni = u.dni
WHERE ss.section_id = ?
ORDER BY u.last_name, u.first_name
  `).bind(sectionId).all<any>();

    return jsonResponse(results, 200, corsHeaders);
  }

  // POST /api/section-add-students-batch
  if (path === '/api/section-add-students-batch' && request.method === 'POST') {
    const userDni = await requireProfessorAuth(request, env, corsHeaders);
    if (!userDni || userDni instanceof Response) return userDni;

    const { section_id, dnis } = await request.json<any>();
    if (!section_id || !Array.isArray(dnis) || dnis.length === 0)
      return jsonResponse({ error: 'Faltan parámetros' }, 400, corsHeaders);

    // Se normalizan al formato canónico (V-30840119). Antes se exigía
    // /^\d+$/ y se insertaba el número pelado, que nunca casaba con users.dni.
    const normalized: any[] = [];
    const invalid: any[] = [];
    for (const raw of dnis) {
      const dni = normalizeDni(raw);
      if (dni) normalized.push(dni);
      else invalid.push(String(raw));
    }

    if (invalid.length > 0) {
      return jsonResponse({
        error: `DNIs inválidos detectados: ${invalid.slice(0, 5).join(', ')}${invalid.length > 5 ? '…' : ''}`
      }, 400, corsHeaders);
    }

    const sec = await env.MIRAI_AI_DB.prepare(
      'SELECT id FROM sections WHERE id = ? AND professor_dni = ?'
    ).bind(section_id, userDni).first<any>();
    if (!sec) return jsonResponse({ error: 'No autorizado' }, 403, corsHeaders);

    // Obtener tareas existentes de la sección antes del loop
    const { results: sectionTasks } = await env.MIRAI_AI_DB.prepare(
      'SELECT id FROM assignments WHERE section_id = ?'
    ).bind(section_id).all<any>();

    let inserted = 0, skipped = 0;
    for (const dni of [...new Set(normalized)]) {
      const result = await env.MIRAI_AI_DB.prepare(
        'INSERT OR IGNORE INTO section_students (section_id, user_dni) VALUES (?, ?)'
      ).bind(section_id, dni).run();
      if (result.meta?.changes > 0) {
        inserted++;
        // Auto-asignar tareas existentes al nuevo estudiante
        for (const task of sectionTasks) {
          await env.MIRAI_AI_DB.prepare(
            'INSERT OR IGNORE INTO assignment_students (assignment_id, user_dni) VALUES (?, ?)'
          ).bind(task.id, dni).run();
        }
      } else {
        skipped++;
      }
    }

    return jsonResponse({ success: true, inserted, skipped }, 200, corsHeaders);
  }

  // POST /api/section-add-student
  if (path === '/api/section-add-student' && request.method === 'POST') {
    const userDni = await requireProfessorAuth(request, env, corsHeaders);
    if (!userDni || userDni instanceof Response) return userDni;

    const { section_id, user_dni } = await request.json<any>();
    if (!section_id || !user_dni) return jsonResponse({ error: 'Faltan parámetros' }, 400, corsHeaders);

    // Misma normalización que la importación por lotes, para que ambos caminos
    // guarden el DNI en el mismo formato que users.dni.
    const studentDni = normalizeDni(user_dni);
    if (!studentDni) return jsonResponse({ error: 'DNI inválido' }, 400, corsHeaders);

    const sec = await env.MIRAI_AI_DB.prepare(
      'SELECT id FROM sections WHERE id = ? AND professor_dni = ?'
    ).bind(section_id, userDni).first<any>();
    if (!sec) return jsonResponse({ error: 'No autorizado' }, 403, corsHeaders);

    await env.MIRAI_AI_DB.prepare(
      'INSERT OR IGNORE INTO section_students (section_id, user_dni) VALUES (?, ?)'
    ).bind(section_id, studentDni).run();

    // Auto-asignar tareas existentes de esta sección al nuevo estudiante
    const { results: sectionTasks } = await env.MIRAI_AI_DB.prepare(
      'SELECT id FROM assignments WHERE section_id = ?'
    ).bind(section_id).all<any>();
    for (const task of sectionTasks) {
      await env.MIRAI_AI_DB.prepare(
        'INSERT OR IGNORE INTO assignment_students (assignment_id, user_dni) VALUES (?, ?)'
      ).bind(task.id, studentDni).run();
    }

    return jsonResponse({ success: true }, 200, corsHeaders);
  }

  // DELETE /api/section-remove-student
  if (path === '/api/section-remove-student' && request.method === 'DELETE') {
    const userDni = await requireProfessorAuth(request, env, corsHeaders);
    if (!userDni || userDni instanceof Response) return userDni;

    const { section_id, user_dni } = await request.json<any>();
    if (!section_id || !user_dni) return jsonResponse({ error: 'Faltan parámetros' }, 400, corsHeaders);

    const sec = await env.MIRAI_AI_DB.prepare(
      'SELECT id FROM sections WHERE id = ? AND professor_dni = ?'
    ).bind(section_id, userDni).first<any>();
    if (!sec) return jsonResponse({ error: 'No autorizado' }, 403, corsHeaders);

    await env.MIRAI_AI_DB.prepare(
      'DELETE FROM section_students WHERE section_id = ? AND user_dni = ?'
    ).bind(section_id, user_dni.toUpperCase()).run();

    return jsonResponse({ success: true }, 200, corsHeaders);
  }

  // Ruta: GET /api/check-professor-role
  if (path === '/api/check-professor-role' && request.method === 'GET') {
    const userDni = await requireAuth(request, env);
    if (!userDni) {
      return jsonResponse({ is_professor: false }, 401, corsHeaders);
    }

    const isProfessor = await isAdminUser(userDni, env) || await isAuthorizedProfessor(userDni, env);
    return jsonResponse({ is_professor: isProfessor }, 200, corsHeaders);
  }
  // --- NUEVAS RUTAS PARA ADMIN ---

  // 1. Crear Tarea: POST /api/create-assignment
  if (path === '/api/create-assignment' && request.method === 'POST') {
    const userDni = await requireProfessorAuth(request, env, corsHeaders);
    if (!userDni || userDni instanceof Response) return userDni;

    const { title, description, course_id, due_date, section_id, max_score, submission_type, grading_mode } = await request.json<any>();

    if (!title || !course_id) {
      return jsonResponse({ error: 'Título y Curso requeridos' }, 400, corsHeaders);
    }

    // El curso tiene que ser del profesor. Se validaba section_id pero NO
    // course_id, así que se podían colgar tareas del curso de otro profesor.
    const ownCourse = await env.MIRAI_AI_DB.prepare(
      'SELECT id FROM user_courses WHERE id = ? AND user_dni = ?'
    ).bind(course_id, userDni).first<any>();
    if (!ownCourse) {
      return jsonResponse({ error: 'Materia inválida o no autorizada' }, 403, corsHeaders);
    }

    // Si viene section_id, validar que pertenece al profesor
    if (section_id) {
      const sec = await env.MIRAI_AI_DB.prepare(
        'SELECT id FROM sections WHERE id = ? AND professor_dni = ?'
      ).bind(section_id, userDni).first<any>();
      if (!sec) return jsonResponse({ error: 'Sección inválida o no autorizada' }, 403, corsHeaders);
    }

    const id = crypto.randomUUID();
    const parsedMaxScore = parseFloat(max_score);
    const safeMaxScore = (!isNaN(parsedMaxScore) && parsedMaxScore >= 1 && parsedMaxScore <= 100) ? parsedMaxScore : 100;
    const safeSubmissionType = ['document', 'image', 'any'].includes(submission_type) ? submission_type : 'document';
    const safeGradingMode = grading_mode === 'formative' ? 'formative' : 'summative';
    await ensureQuizSubmissionColumns(env);
    await env.MIRAI_AI_DB.prepare(`
    INSERT INTO assignments (id, course_id, title, description, due_date, section_id, max_score, submission_type, grading_mode)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, course_id, title, description || '', due_date || null, section_id || null, safeMaxScore, safeSubmissionType, safeGradingMode).run();

    // Auto-asignar todos los estudiantes de la sección
    if (section_id) {
      const { results: secStudents } = await env.MIRAI_AI_DB.prepare(
        'SELECT user_dni FROM section_students WHERE section_id = ?'
      ).bind(section_id).all<any>();

      for (const st of secStudents) {
        await env.MIRAI_AI_DB.prepare(
          'INSERT OR IGNORE INTO assignment_students (assignment_id, user_dni) VALUES (?, ?)'
        ).bind(id, st.user_dni).run();
      }
    }

    return jsonResponse({ success: true, id }, 201, corsHeaders);
  }

  // 1b. Editar tarea: POST /api/update-assignment
  // Solo mientras siga en borrador. Una vez publicada, su contenido es inmutable.
  if (path === '/api/update-assignment' && request.method === 'POST') {
    const userDni = await requireProfessorAuth(request, env, corsHeaders);
    if (!userDni || userDni instanceof Response) return userDni;

    const { id, title, description, due_date, max_score, submission_type, grading_mode } = await request.json<any>();
    if (!id) return jsonResponse({ error: 'ID requerido' }, 400, corsHeaders);
    if (!await canManageAssignment(String(id), userDni, env)) {
      return jsonResponse({ error: 'Tarea no encontrada o no autorizada' }, 403, corsHeaders);
    }

    const current = await env.MIRAI_AI_DB.prepare(
      'SELECT published_at FROM assignments WHERE id = ?'
    ).bind(id).first<any>();
    if (!current) return jsonResponse({ error: 'Tarea no encontrada' }, 404, corsHeaders);
    if (current.published_at) {
      return jsonResponse({ error: 'La tarea ya está publicada: su contenido no se puede modificar.' }, 409, corsHeaders);
    }
    if (!String(title || '').trim()) {
      return jsonResponse({ error: 'El título es obligatorio.' }, 400, corsHeaders);
    }

    const parsedMaxScore = parseFloat(max_score);
    const safeMaxScore = (!isNaN(parsedMaxScore) && parsedMaxScore >= 1 && parsedMaxScore <= 100) ? parsedMaxScore : 100;
    const safeSubmissionType = ['document', 'image', 'any'].includes(submission_type) ? submission_type : 'document';
    const safeGradingMode = grading_mode === 'formative' ? 'formative' : 'summative';

    await env.MIRAI_AI_DB.prepare(`
      UPDATE assignments
         SET title = ?, description = ?, due_date = ?, max_score = ?,
             submission_type = ?, grading_mode = ?
       WHERE id = ?
    `).bind(String(title).trim(), description || '', due_date || null, safeMaxScore, safeSubmissionType, safeGradingMode, id).run();

    return jsonResponse({ success: true }, 200, corsHeaders);
  }

  // 1c. Publicar tarea: POST /api/publish-assignment
  // El profesor decide cuándo la tarea deja de ser borrador y pasa a los alumnos.
  if (path === '/api/publish-assignment' && request.method === 'POST') {
    const userDni = await requireProfessorAuth(request, env, corsHeaders);
    if (!userDni || userDni instanceof Response) return userDni;

    const { id, publish } = await request.json<any>();
    if (!id) return jsonResponse({ error: 'ID requerido' }, 400, corsHeaders);
    if (!await canManageAssignment(String(id), userDni, env)) {
      return jsonResponse({ error: 'Tarea no encontrada o no autorizada' }, 403, corsHeaders);
    }

    // Un borrador puede publicarse; una tarea publicada no se puede ocultar de
    // nuevo (así su contenido ya entregado no cambia bajo los pies del alumno).
    if (publish === false) {
      return jsonResponse({ error: 'Una tarea publicada no se puede volver a borrador.' }, 409, corsHeaders);
    }

    await env.MIRAI_AI_DB.prepare(
      "UPDATE assignments SET published_at = COALESCE(published_at, datetime('now')) WHERE id = ?"
    ).bind(id).run();

    return jsonResponse({ success: true }, 200, corsHeaders);
  }

  // ── Planes de evaluación ─────────────────────────────────────────────────
  // GET /api/evaluation-plans — lista los planes del profesor con sus tareas.
  if (path === '/api/evaluation-plans' && request.method === 'GET') {
    const userDni = await requireProfessorAuth(request, env, corsHeaders);
    if (!userDni || userDni instanceof Response) return userDni;

    const { results: plans } = await env.MIRAI_AI_DB.prepare(`
      SELECT p.id, p.title, p.strategy, p.source_filename, p.max_score,
             p.points_per_evaluation, p.evaluation_count, p.created_at,
             p.course_id,
             COALESCE(p.section_id, (
               SELECT a.section_id FROM assignments a
                WHERE a.plan_id = p.id AND a.section_id IS NOT NULL
                LIMIT 1
             )) AS section_id,
             c.title AS course_title
        FROM evaluation_plans p
        LEFT JOIN user_courses c ON c.id = p.course_id
       WHERE p.professor_dni = ?
       ORDER BY p.created_at DESC
       LIMIT 50
    `).bind(userDni).all<any>();

    const detailed: any[] = [];
    for (const plan of plans || []) {
      const { results: assignments } = await env.MIRAI_AI_DB.prepare(`
        SELECT id, title, description, due_date, max_score
          FROM assignments
         WHERE plan_id = ?
         ORDER BY created_at ASC, title ASC
      `).bind(plan.id).all<any>();
      detailed.push({ ...plan, assignments: assignments || [] });
    }

    return jsonResponse({ plans: detailed }, 200, corsHeaders);
  }

  // POST /api/create-evaluation-plan — analiza un documento y crea las tareas.
  if (path === '/api/create-evaluation-plan' && request.method === 'POST') {
    const userDni = await requireProfessorAuth(request, env, corsHeaders);
    if (!userDni || userDni instanceof Response) return userDni;

    try {
      const contentType = request.headers.get('content-type') || '';
      if (!contentType.includes('multipart/form-data')) {
        return jsonResponse({ error: 'Se esperaba un formulario con el archivo.' }, 400, corsHeaders);
      }

      const form = await request.formData();
      const file = form.get('file');
      if (!(file instanceof File)) {
        return jsonResponse({ error: 'Sube un archivo DOCX, DOC, DOCM, XLS, XLSX o XLSM.' }, 400, corsHeaders);
      }

      const ext = (file.name.split('.').pop() || '').toLowerCase();
      if (!['docx', 'doc', 'docm', 'xlsx', 'xls', 'xlsm'].includes(ext)) {
        return jsonResponse({ error: 'Formato no soportado. Usa DOCX, DOC, DOCM, XLS, XLSX o XLSM.' }, 400, corsHeaders);
      }
      if (file.size > 15 * 1024 * 1024) {
        return jsonResponse({ error: 'El archivo supera el límite de 15 MB.' }, 400, corsHeaders);
      }

      const courseId = String(form.get('course_id') || '');
      const sectionId = String(form.get('section_id') || '') || null;
      const maxScore = Number(form.get('max_score'));
      const evaluationCount = Math.floor(Number(form.get('evaluation_count')));
      const startDate = String(form.get('start_date') || '');
      const intervalDays = Math.max(1, Math.min(60, Math.floor(Number(form.get('interval_days')) || 7)));

      if (!courseId) return jsonResponse({ error: 'Selecciona una materia.' }, 400, corsHeaders);
      if (!Number.isFinite(maxScore) || maxScore <= 0 || maxScore > 100) {
        return jsonResponse({ error: 'Puntuación máxima inválida (1-100).' }, 400, corsHeaders);
      }
      if (!Number.isFinite(evaluationCount) || evaluationCount < 1 || evaluationCount > 30) {
        return jsonResponse({ error: 'Cantidad de evaluaciones inválida (1-30).' }, 400, corsHeaders);
      }
      const pointsPerEvaluation = maxScore / evaluationCount;
      if (Math.abs(pointsPerEvaluation - Math.round(pointsPerEvaluation * 100) / 100) > 1e-6) {
        return jsonResponse({ error: 'La cantidad de evaluaciones debe dividir exactamente la puntuación máxima.' }, 400, corsHeaders);
      }

      const course = await env.MIRAI_AI_DB.prepare(
        'SELECT id, title FROM user_courses WHERE id = ? AND user_dni = ?'
      ).bind(courseId, userDni).first<any>();
      if (!course) return jsonResponse({ error: 'Materia inválida o no autorizada.' }, 403, corsHeaders);

      if (sectionId) {
        const sec = await env.MIRAI_AI_DB.prepare(
          'SELECT id FROM sections WHERE id = ? AND professor_dni = ?'
        ).bind(sectionId, userDni).first<any>();
        if (!sec) return jsonResponse({ error: 'Sección inválida o no autorizada.' }, 403, corsHeaders);
      }

      const buffer = await file.arrayBuffer();
      const documentText = await extractTextFromOffice(buffer, file.name);

      const systemPrompt = `Eres un diseñador instruccional experto. Analizas el material de una materia y propones un plan de evaluación coherente.
Reglas:
- Divide el contenido del documento en exactamente ${evaluationCount} evaluaciones, en orden pedagógico.
- Cada evaluación debe cubrir temas concretos del documento y describir qué contenido se evaluará.
- No inventes temas que no aparezcan en el documento; si falta detalle, evalúa lo que sí está.
- Distribuye los temas sin repetirlos entre evaluaciones.
- Devuelve SOLO un JSON válido, sin bloques de código ni texto adicional.`;

      const userPrompt = `Materia: ${course.title}
Puntuación máxima: ${maxScore}
Cantidad de evaluaciones: ${evaluationCount}
Puntaje por evaluación: ${pointsPerEvaluation}

Contenido del documento:
"""
${documentText}
"""

Formato exacto:
{"plan_title":"...","strategy":"...","evaluations":[{"title":"...","description":"...","topics":["..."],"content":"..."}]}`;

      const raw = await callAI(
        AI_MODEL_PRO,
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        { temperature: 0.4, max_tokens: 6000 },
        env,
      );

      const parsed = parseQuizJson(raw);
      const planTitle = String(parsed?.plan_title || `Plan de evaluación — ${course.title}`).trim().slice(0, 160);
      const strategy = String(parsed?.strategy || '').trim().slice(0, 2000);
      const rawEvaluations = Array.isArray(parsed?.evaluations) ? parsed.evaluations : [];
      const evaluations = rawEvaluations.slice(0, evaluationCount);
      if (evaluations.length < evaluationCount) {
        return jsonResponse({ error: 'La IA no generó todas las evaluaciones. Inténtalo de nuevo.' }, 502, corsHeaders);
      }

      const planId = crypto.randomUUID();
      await env.MIRAI_AI_DB.prepare(`
        INSERT INTO evaluation_plans
          (id, professor_dni, course_id, title, strategy, source_filename, max_score, points_per_evaluation, evaluation_count, section_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(planId, userDni, courseId, planTitle, strategy, file.name.slice(0, 200), maxScore, pointsPerEvaluation, evaluationCount, sectionId).run();

      const collectedStudents = sectionId
        ? (await env.MIRAI_AI_DB.prepare('SELECT user_dni FROM section_students WHERE section_id = ?').bind(sectionId).all<any>()).results
        : [];

      const start = startDate ? new Date(startDate) : null;
      const startValid = !!start && !Number.isNaN(start.getTime());
      const created: any[] = [];

      for (let index = 0; index < evaluations.length; index++) {
        const item = evaluations[index] || {};
        const topics = Array.isArray(item.topics) ? item.topics.map((t: any) => String(t || '').trim()).filter(Boolean) : [];
        const content = String(item.content || '').trim();
        const description = String(item.description || '').trim();
        const assignmentTitle = `Evaluación ${index + 1}: ${String(item.title || 'Evaluación').trim()}`.slice(0, 180);
        const assignmentDescription = [
          `Plan de evaluación: ${planTitle}`,
          strategy ? `Estrategia: ${strategy}` : '',
          topics.length ? `Temas: ${topics.join(', ')}` : '',
          content ? `Contenido a evaluar:\n${content}` : '',
          description ? `Instrucciones:\n${description}` : '',
        ].filter(Boolean).join('\n\n').slice(0, 5000);

        const assignmentId = crypto.randomUUID();
        const dueDate = startValid
          ? new Date(start!.getTime() + index * intervalDays * 86400000).toISOString()
          : null;

        await env.MIRAI_AI_DB.prepare(`
          INSERT INTO assignments
            (id, course_id, title, description, due_date, section_id, max_score, submission_type, grading_mode, plan_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'document', 'summative', ?)
        `).bind(assignmentId, courseId, assignmentTitle, assignmentDescription, dueDate, sectionId, pointsPerEvaluation, planId).run();

        for (const st of collectedStudents || []) {
          await env.MIRAI_AI_DB.prepare(
            'INSERT OR IGNORE INTO assignment_students (assignment_id, user_dni) VALUES (?, ?)'
          ).bind(assignmentId, st.user_dni).run();
        }

        created.push({
          id: assignmentId,
          title: assignmentTitle,
          description: assignmentDescription,
          topics,
          content,
          due_date: dueDate,
          max_score: pointsPerEvaluation,
        });
      }

      return jsonResponse({
        success: true,
        plan: {
          id: planId,
          title: planTitle,
          strategy,
          max_score: maxScore,
          points_per_evaluation: pointsPerEvaluation,
          evaluation_count: evaluationCount,
          source_filename: file.name,
        },
        evaluations: created,
        assignments_created: created.length,
      }, 201, corsHeaders);
    } catch (err) {
      console.error('Error creando plan de evaluación:', err);
      return jsonResponse({ error: (err as Error)?.message || 'No se pudo crear el plan de evaluación.' }, 500, corsHeaders);
    }
  }

  // POST /api/update-evaluation-plan-section — asigna o quita la clase de un plan.
  if (path === '/api/update-evaluation-plan-section' && request.method === 'POST') {
    const userDni = await requireProfessorAuth(request, env, corsHeaders);
    if (!userDni || userDni instanceof Response) return userDni;

    try {
      const body = await request.json<any>().catch(() => ({}));
      const planId = String(body?.plan_id || '');
      const sectionId = body?.section_id ? String(body.section_id) : null;
      if (!planId) return jsonResponse({ error: 'plan_id requerido' }, 400, corsHeaders);

      const plan = await env.MIRAI_AI_DB.prepare(
        'SELECT id, course_id FROM evaluation_plans WHERE id = ? AND professor_dni = ?'
      ).bind(planId, userDni).first<any>();
      if (!plan) return jsonResponse({ error: 'Plan no encontrado o no autorizado' }, 403, corsHeaders);

      if (sectionId) {
        const section = await env.MIRAI_AI_DB.prepare(
          'SELECT id FROM sections WHERE id = ? AND professor_dni = ? AND course_id = ?'
        ).bind(sectionId, userDni, plan.course_id).first<any>();
        if (!section) {
          return jsonResponse({ error: 'La clase no pertenece a la materia del plan' }, 403, corsHeaders);
        }
      }

      await env.MIRAI_AI_DB.prepare(
        'UPDATE evaluation_plans SET section_id = ? WHERE id = ?'
      ).bind(sectionId, planId).run();
      await env.MIRAI_AI_DB.prepare(
        'UPDATE assignments SET section_id = ? WHERE plan_id = ?'
      ).bind(sectionId, planId).run();

      const { results: planAssignments } = await env.MIRAI_AI_DB.prepare(
        'SELECT id FROM assignments WHERE plan_id = ?'
      ).bind(planId).all<any>();

      for (const assignment of planAssignments || []) {
        await env.MIRAI_AI_DB.prepare(
          'DELETE FROM assignment_students WHERE assignment_id = ?'
        ).bind(assignment.id).run();
      }

      if (sectionId && planAssignments?.length) {
        const { results: students } = await env.MIRAI_AI_DB.prepare(
          'SELECT user_dni FROM section_students WHERE section_id = ?'
        ).bind(sectionId).all<any>();

        for (const assignment of planAssignments) {
          for (const student of students || []) {
            await env.MIRAI_AI_DB.prepare(
              'INSERT OR IGNORE INTO assignment_students (assignment_id, user_dni) VALUES (?, ?)'
            ).bind(assignment.id, student.user_dni).run();
          }
        }
      }

      return jsonResponse({ success: true, section_id: sectionId }, 200, corsHeaders);
    } catch (err) {
      console.error('Error actualizando clase del plan:', err);
      return jsonResponse({ error: 'No se pudo actualizar la clase del plan.' }, 500, corsHeaders);
    }
  }

  // Ruta: GET /api/my-submissions (para ESTUDIANTES)
  if (path === '/api/my-submissions' && request.method === 'GET') {
    const userDni = await requireAuth(request, env);
    if (!userDni) return jsonResponse({ error: 'No autorizado' }, 401, corsHeaders);

    try {
      // Obtener tareas de las secciones donde el estudiante está inscrito
      // UNION con tareas asignadas individualmente (assignment_students)
      const { results: assignments } = await env.MIRAI_AI_DB.prepare(`
    SELECT * FROM (
        SELECT DISTINCT
            a.id, a.title, a.description, a.due_date, a.max_score, a.course_id,
            a.section_id, a.created_at, a.submission_type, a.plan_id,
            c.title as course_title,
            s.name  as section_name,
            ep.title as plan_title,
            ep.strategy as plan_strategy,
            ep.max_score as plan_max_score,
            ep.points_per_evaluation,
            ep.evaluation_count
        FROM assignments a
        JOIN section_students ss ON ss.section_id = a.section_id
        LEFT JOIN user_courses c ON c.id = a.course_id
        LEFT JOIN sections s ON s.id = a.section_id
        LEFT JOIN evaluation_plans ep ON ep.id = a.plan_id
        WHERE UPPER(ss.user_dni) = UPPER(?) AND a.published_at IS NOT NULL
        UNION
        SELECT DISTINCT
            a.id, a.title, a.description, a.due_date, a.max_score, a.course_id,
            a.section_id, a.created_at, a.submission_type, a.plan_id,
            c.title as course_title,
            s.name  as section_name,
            ep.title as plan_title,
            ep.strategy as plan_strategy,
            ep.max_score as plan_max_score,
            ep.points_per_evaluation,
            ep.evaluation_count
        FROM assignments a
        JOIN assignment_students ast ON ast.assignment_id = a.id
        LEFT JOIN user_courses c ON c.id = a.course_id
        LEFT JOIN sections s ON s.id = a.section_id
        LEFT JOIN evaluation_plans ep ON ep.id = a.plan_id
        WHERE UPPER(ast.user_dni) = UPPER(?) AND a.published_at IS NOT NULL
    )
    ORDER BY created_at DESC
`).bind(userDni.toUpperCase(), userDni.toUpperCase()).all<any>();

      // Obtener entregas del estudiante
      const { results: submissions } = await env.MIRAI_AI_DB.prepare(`
            SELECT * FROM submissions WHERE user_dni = ?
        `).bind(userDni.toUpperCase()).all<any>();

      // Clases (secciones) a las que está unido, aunque todavía no tengan tareas.
      const { results: classes } = await env.MIRAI_AI_DB.prepare(`
            SELECT s.id AS section_id, s.name AS section_name,
                   s.course_id, c.title AS course_title
              FROM sections s
              JOIN section_students ss ON ss.section_id = s.id
              LEFT JOIN user_courses c ON c.id = s.course_id
             WHERE UPPER(ss.user_dni) = UPPER(?)
             ORDER BY c.title, s.name
        `).bind(userDni.toUpperCase()).all<any>();

      return jsonResponse({ assignments, submissions, classes }, 200, corsHeaders);

    } catch (error) {
      console.error('Error en my-submissions:', error);
      return jsonResponse({ error: 'Error interno' }, 500, corsHeaders);
    }
  }

  // Ruta: POST /api/assignment-quiz/start
  // Genera las 10 preguntas del quiz de una tarea (modo «quiz4» o «quiz_free»).
  if (path === '/api/assignment-quiz/start' && request.method === 'POST') {
    const userDni = await requireAuth(request, env);
    if (!userDni) return jsonResponse({ error: 'No autorizado' }, 401, corsHeaders);

    try {
      const body = await request.json<any>().catch(() => ({}));
      const assignmentId = body?.assignment_id != null ? String(body.assignment_id) : '';
      const mode = body?.mode === 'quiz4' ? 'quiz4' : body?.mode === 'quiz_free' ? 'quiz_free' : '';
      if (!assignmentId || !mode) {
        return jsonResponse({ error: 'Faltan assignment_id o un modo válido (quiz4, quiz_free)' }, 400, corsHeaders);
      }

      const assignment = await getAssignmentForStudent(assignmentId, userDni, env);
      if (!assignment) return jsonResponse({ error: 'Tarea no encontrada o sin acceso' }, 404, corsHeaders);

      const maxScore = Math.max(1, Math.round(Number(assignment.max_score) || 100));
      const points = buildQuizPoints(maxScore);
      const descripcion = String(assignment.description || '').trim().slice(0, 2500);

      const schema = mode === 'quiz4'
        ? '{"questions":[{"question":"...","options":["...","...","...","..."],"correct_index":0,"expected_answer":"...","explanation":"...","concept":"..."}]}'
        : '{"questions":[{"question":"...","expected_answer":"...","explanation":"...","concept":"..."}]}';

      const systemPrompt = `Eres la tutora académica de Mirai. Creas evaluaciones cortas y claras sobre la tarea de un estudiante.
Reglas:
- Genera EXACTAMENTE 10 preguntas sobre el tema y el enunciado de la tarea.
- Ordénalas de fácil a difícil: las 4 primeras fáciles, las 3 siguientes de dificultad intermedia y las 3 últimas difíciles.
- Las preguntas deben ser breves (máximo 25 palabras) y sin ambigüedad.
${mode === 'quiz4'
  ? '- Cada pregunta tiene 4 opciones cortas (máximo 8 palabras) y una sola respuesta correcta.\n- "correct_index" es el índice 0-3 de la opción correcta.'
  : '- No incluyas opciones: el estudiante escribirá su respuesta.\n- "expected_answer" es una respuesta modelo breve (máximo 20 palabras).'}
- "explanation": 1-2 frases que expliquen por qué la respuesta correcta lo es (máximo 30 palabras).
- "concept": el concepto o tema evaluado, en 2-5 palabras.
- Devuelve SOLO el JSON, sin texto adicional ni bloques de código.`;

      const userPrompt = `Tarea: ${assignment.title}\n${descripcion ? `Enunciado:\n${descripcion}\n` : ''}
Formato exacto de respuesta:\n${schema}`;

      const raw = await callAI(
        AI_MODEL_NORMAL,
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        { temperature: 0.7, max_tokens: 6000 },
        env,
      );

      const parsed = parseQuizJson(raw);
      const rawQuestions = Array.isArray(parsed?.questions) ? parsed.questions.slice(0, 10) : [];
      if (rawQuestions.length < 10) {
        return jsonResponse({ error: 'La IA no generó las 10 preguntas. Inténtalo de nuevo.' }, 502, corsHeaders);
      }

      const questions = rawQuestions.map((q: any, index: number) => {
        const question = String(q?.question || '').trim();
        if (!question) throw new Error('Pregunta vacía');
        const base: any = {
          index,
          level: quizLevelAt(index),
          points: points[index],
          question,
          expected_answer: String(q?.expected_answer || '').trim(),
          explanation: String(q?.explanation || '').trim().slice(0, 240),
          concept: String(q?.concept || '').trim().slice(0, 80),
        };
        if (mode === 'quiz4') {
          const options = Array.isArray(q?.options)
            ? q.options.map((o: any) => String(o || '').trim()).filter(Boolean).slice(0, 4)
            : [];
          if (options.length !== 4) throw new Error('Opciones incompletas');
          const correctIndex = Math.min(3, Math.max(0, Number(q?.correct_index) || 0));
          base.options = options;
          base.correct_index = correctIndex;
        }
        return base;
      });

      return jsonResponse({
        assignment_id: assignmentId,
        mode,
        max_score: maxScore,
        total_points: maxScore,
        questions,
      }, 200, corsHeaders);
    } catch (error: any) {
      console.error('Error generando quiz:', error);
      return jsonResponse({ error: 'No se pudo generar el quiz en este momento. Inténtalo de nuevo.' }, 502, corsHeaders);
    }
  }

  // Ruta: POST /api/assignment-quiz/grade
  // Califica las respuestas abiertas del Quiz libre con la IA.
  if (path === '/api/assignment-quiz/grade' && request.method === 'POST') {
    const userDni = await requireAuth(request, env);
    if (!userDni) return jsonResponse({ error: 'No autorizado' }, 401, corsHeaders);

    try {
      const body = await request.json<any>().catch(() => ({}));
      const assignmentId = body?.assignment_id != null ? String(body.assignment_id) : '';
      const answers = Array.isArray(body?.answers) ? body.answers.slice(0, 10) : [];
      if (!assignmentId || !answers.length) {
        return jsonResponse({ error: 'Faltan assignment_id o respuestas' }, 400, corsHeaders);
      }

      const assignment = await getAssignmentForStudent(assignmentId, userDni, env);
      if (!assignment) return jsonResponse({ error: 'Tarea no encontrada o sin acceso' }, 404, corsHeaders);

      type QuizGradeItem = {
        index: number;
        question: string;
        expected_answer: string;
        answer: string;
        points: number;
      };
      const items: QuizGradeItem[] = answers.map((a: any, index: number) => ({
        index,
        question: String(a?.question || '').slice(0, 500),
        expected_answer: String(a?.expected_answer || '').slice(0, 500),
        answer: String(a?.answer || '').slice(0, 800),
        points: Math.max(0, Number(a?.points) || 0),
      }));

      const systemPrompt = `Eres un profesor que califica respuestas abiertas de un quiz.
Para cada respuesta decide si el estudiante acertó ("correct": true) o no ("correct": false).
Sé flexible con la redacción: vale una respuesta equivalente con otras palabras.
Devuelve SOLO un JSON con este formato:
{"results":[{"index":0,"correct":true,"feedback":"frase breve"}]}
Incluye todos los índices recibidos y no agregues texto fuera del JSON.`;

      const userPrompt = items.map((item) =>
        `#${item.index}\nPregunta: ${item.question}\nRespuesta esperada: ${item.expected_answer}\nRespuesta del estudiante: ${item.answer}`,
      ).join('\n\n');

      let results: { index: number; correct: boolean; feedback: string }[];
      try {
        const raw = await callAI(
          AI_MODEL_NORMAL,
          [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          { temperature: 0.2, max_tokens: 2000 },
          env,
        );
        const parsed = parseQuizJson(raw);
        const aiResults = Array.isArray(parsed?.results) ? parsed.results : [];
        results = items.map((item) => {
          const found = aiResults.find((r: any) => Number(r?.index) === item.index);
          return {
            index: item.index,
            correct: found ? found.correct === true : quizAnswerMatches(item.answer, item.expected_answer),
            feedback: String(found?.feedback || '').trim(),
          };
        });
      } catch (aiError) {
        console.warn('⚠️ Calificación con IA falló, usando comparación simple:', aiError);
        results = items.map((item) => ({
          index: item.index,
          correct: quizAnswerMatches(item.answer, item.expected_answer),
          feedback: '',
        }));
      }

      const score = items.reduce((sum, item, index) =>
        sum + (results[index]?.correct ? item.points : 0), 0);

      return jsonResponse({ results, score }, 200, corsHeaders);
    } catch (error: any) {
      console.error('Error calificando quiz:', error);
      return jsonResponse({ error: 'No se pudo calificar el quiz. Inténtalo de nuevo.' }, 502, corsHeaders);
    }
  }

  // Ruta: POST /api/assignment-quiz/submit
  // Guarda la nota del quiz en la base de datos (una sola entrega por tarea).
  if (path === '/api/assignment-quiz/submit' && request.method === 'POST') {
    const userDni = await requireAuth(request, env);
    if (!userDni) return jsonResponse({ error: 'No autorizado' }, 401, corsHeaders);

    try {
      const body = await request.json<any>().catch(() => ({}));
      const assignmentId = body?.assignment_id != null ? String(body.assignment_id) : '';
      const mode = body?.mode === 'quiz4' ? 'quiz4' : body?.mode === 'quiz_free' ? 'quiz_free' : '';
      if (!assignmentId || !mode) {
        return jsonResponse({ error: 'Faltan assignment_id o modo' }, 400, corsHeaders);
      }

      const assignment = await getAssignmentForStudent(assignmentId, userDni, env);
      if (!assignment) return jsonResponse({ error: 'Tarea no encontrada o sin acceso' }, 404, corsHeaders);

      const maxScore = Math.max(1, Math.round(Number(assignment.max_score) || 100));
      const score = Math.max(0, Math.min(maxScore, Math.round(Number(body?.score) || 0)));
      const correct = Math.max(0, Math.min(10, Math.round(Number(body?.correct) || 0)));
      const formative = assignment.grading_mode === 'formative';
      const failures = Array.isArray(body?.failures)
        ? body.failures.map((item: any) => String(item?.concept ?? item ?? '').trim()).filter(Boolean)
        : [];
      const modeLabel = mode === 'quiz4' ? 'Quiz 4' : 'Quiz libre';
      const feedback = JSON.stringify({
        general: formative
          ? `${modeLabel} completado: ${correct} de 10 respuestas correctas. Práctica formativa: no afecta tu nota.`
          : `${modeLabel} completado: ${correct} de 10 respuestas correctas. Nota registrada automáticamente.`,
        formative,
      });

      await ensureQuizSubmissionColumns(env);
      const ownerDni = userDni.toUpperCase();
      const existing = await env.MIRAI_AI_DB.prepare(
        'SELECT id FROM submissions WHERE assignment_id = ? AND UPPER(user_dni) = UPPER(?)'
      ).bind(assignmentId, ownerDni).first<any>();

      let submissionId = existing?.id;
      const storedScore = formative ? null : score;
      if (existing) {
        await env.MIRAI_AI_DB.prepare(`
          UPDATE submissions
             SET file_url = ?, status = 'evaluated', score = ?, feedback = ?,
                 graded_at = datetime('now'), attempt_type = ?, submitted_at = datetime('now')
           WHERE id = ?
        `).bind(`quiz://${mode}`, storedScore, feedback, mode, submissionId).run();
      } else {
        submissionId = crypto.randomUUID();
        await env.MIRAI_AI_DB.prepare(`
          INSERT INTO submissions
            (id, assignment_id, user_dni, file_url, status, score, feedback, graded_at,
             submitted_at, attempt_type, retry_used)
          VALUES (?, ?, ?, ?, 'evaluated', ?, ?, datetime('now'), datetime('now'), ?, 0)
        `).bind(submissionId, assignmentId, ownerDni, `quiz://${mode}`, storedScore, feedback, mode).run();
      }

      if (failures.length) {
        void recordConceptErrors(env, assignmentId, ownerDni, mode, failures);
      }

      const saved = await env.MIRAI_AI_DB.prepare(
        'SELECT retry_used FROM submissions WHERE id = ?'
      ).bind(submissionId).first<any>();

      return jsonResponse({
        success: true,
        submission_id: submissionId,
        score: storedScore,
        max_score: maxScore,
        formative,
        retry_used: Number(saved?.retry_used) === 1,
      }, 200, corsHeaders);
    } catch (error: any) {
      console.error('Error guardando quiz:', error);
      return jsonResponse({ error: 'No se pudo guardar la nota del quiz' }, 500, corsHeaders);
    }
  }

  // Ruta: POST /api/assignment-quiz/reset
  // Único reinicio disponible: deja la tarea pendiente para volver a hacerla.
  if (path === '/api/assignment-quiz/reset' && request.method === 'POST') {
    const userDni = await requireAuth(request, env);
    if (!userDni) return jsonResponse({ error: 'No autorizado' }, 401, corsHeaders);

    try {
      const body = await request.json<any>().catch(() => ({}));
      const assignmentId = body?.assignment_id != null ? String(body.assignment_id) : '';
      if (!assignmentId) return jsonResponse({ error: 'Falta assignment_id' }, 400, corsHeaders);

      const assignment = await getAssignmentForStudent(assignmentId, userDni, env);
      if (!assignment) return jsonResponse({ error: 'Tarea no encontrada o sin acceso' }, 404, corsHeaders);

      await ensureQuizSubmissionColumns(env);
      const row = await env.MIRAI_AI_DB.prepare(
        'SELECT id, retry_used FROM submissions WHERE assignment_id = ? AND UPPER(user_dni) = UPPER(?)'
      ).bind(assignmentId, userDni.toUpperCase()).first<any>();

      if (!row) return jsonResponse({ error: 'No hay una tarea finalizada para reiniciar' }, 404, corsHeaders);

      await env.MIRAI_AI_DB.prepare(`
        UPDATE submissions
           SET status = 'reset', score = NULL, graded_at = NULL, feedback = NULL, retry_used = 1
         WHERE id = ?
      `).bind(row.id).run();

      return jsonResponse({ success: true, retry_used: true }, 200, corsHeaders);
    } catch (error: any) {
      console.error('Error reiniciando tarea:', error);
      return jsonResponse({ error: 'No se pudo reiniciar la tarea' }, 500, corsHeaders);
    }
  }

  // Ruta: GET /api/assignment-details (CORREGIDA)
  if (path === '/api/assignment-details' && request.method === 'GET') {
    const userDni = await requireAuth(request, env);
    if (!userDni) return jsonResponse({ error: 'No autorizado' }, 401, corsHeaders);

    const id = url.searchParams.get('id');
    if (!id) return jsonResponse({ error: 'ID requerido' }, 400, corsHeaders);

    try {
      // 1. Obtener datos de la tarea + curso (usando user_courses)
      // 2. Verificar que el estudiante esté asignado a esta tarea
      const assignStmt = env.MIRAI_AI_DB.prepare(`
    SELECT
        a.id,
        a.title,
        a.description,
        a.due_date,
        a.max_score,
        a.course_id,
        a.section_id,
        a.created_at,
        a.submission_type,
        a.grading_mode,
        uc.title    as course_title,
        uc.user_dni as professor_dni,
        s.name      as section_name
    FROM assignments a
    LEFT JOIN user_courses uc ON a.course_id = uc.id
    LEFT JOIN sections     s  ON a.section_id = s.id
    INNER JOIN assignment_students ast ON a.id = ast.assignment_id
    WHERE a.id = ? AND ast.user_dni = ? AND a.published_at IS NOT NULL
`);

      const assignment = await assignStmt.bind(id, userDni.toUpperCase()).first<any>();

      if (!assignment) {
        // Puede ser que:
        // 1. La tarea no existe
        // 2. El estudiante no está asignado a esta tarea
        return jsonResponse({ error: 'Tarea no encontrada o no tienes acceso a ella' }, 404, corsHeaders);
      }

      // 3. Verificar si el usuario ya entregó
      const subStmt = env.MIRAI_AI_DB.prepare(`
            SELECT * FROM submissions WHERE assignment_id = ? AND user_dni = ?
        `);
      const submission = await subStmt.bind(id, userDni.toUpperCase()).first<any>();

      return jsonResponse({ ...assignment, submission }, 200, corsHeaders);

    } catch (error: any) {
      console.error('Error en assignment-details:', error);
      return jsonResponse({ error: 'Error interno', details: error.message }, 500, corsHeaders);
    }
  }

  if (path === '/api/evaluate-submission' && request.method === 'POST') {
    const userDni = await requireAuth(request, env);
    if (!userDni) return jsonResponse({ error: 'No autorizado' }, 401, corsHeaders);

    try {
      const { submission_id } = await request.json<any>();

      if (!submission_id) {
        return jsonResponse({ error: 'ID de entrega requerido' }, 400, corsHeaders);
      }

      // 1. Obtener datos de la entrega y la tarea
      const submissionData = await env.MIRAI_AI_DB.prepare(`
  SELECT 
    s.id as submission_id,
    s.assignment_id,
    s.file_url,
    s.user_dni,
    s.extracted_text,
    a.max_score,
    a.grading_mode,
    a.title,
    a.description,
    a.id as assignment_id_db
  FROM submissions s
  JOIN assignments a ON s.assignment_id = a.id
  WHERE s.id = ?
`).bind(submission_id).first<any>();

      if (!submissionData) {
        return jsonResponse({ error: 'Entrega no encontrada' }, 404, corsHeaders);
      }

      // Solo el dueño de la entrega, el profesor del curso o un admin pueden
      // lanzar la evaluación: esta ruta SOBRESCRIBE la nota en BD, así que sin
      // esta comprobación cualquier usuario logueado podía recalificar (o
      // arruinar) la entrega de otro, o repetir la suya hasta que le gustara.
      const evalAccess = await canAccessSubmission(submission_id, userDni, env);
      if (!evalAccess.allowed) {
        return jsonResponse({ error: 'No tienes acceso a esta entrega' }, 403, corsHeaders);
      }

      if (!submissionData.file_url) {
        return jsonResponse({ error: 'La entrega no tiene un archivo asociado' }, 422, corsHeaders);
      }

      const r2Key = submissionData.file_url.replace('/api/file/', '');
      const filename = r2Key.split('/').pop();
      const fileExtension = (filename.split('.').pop() ?? '').toLowerCase();
      const isImage = ['png', 'jpg', 'jpeg', 'webp'].includes(fileExtension);

      let aiContent;

      if (isImage) {
        // ── EVALUACIÓN DE IMAGEN VÍA MODELO DE VISIÓN ──
        console.log('🖼️ [DEBUG] Evaluando imagen con modelo de visión...');

        const r2Object = await env.MIRAI_AI_ASSETS.get(r2Key);
        if (!r2Object) {
          return jsonResponse({ error: 'Archivo no encontrado' }, 404, corsHeaders);
        }

        const imageBuffer = await r2Object.arrayBuffer();

        console.log(`🖼️ [DEBUG] Imagen cargada: ${imageBuffer.byteLength} bytes, extensión: ${fileExtension}`);

        // DeepSeek Flash VE la imagen y la califica en la misma llamada (ver
        // lib/vision.ts). Antes Llama 3.2 Vision la describía y DeepSeek
        // calificaba la descripción: lo que esta no contara no se evaluaba.
        const gradePrompt = `Eres un profesor evaluador académico. Esta es la imagen entregada por un estudiante.

TAREA ASIGNADA: ${submissionData.title}
REQUISITOS DE LA TAREA: ${submissionData.description}
PUNTUACIÓN MÁXIMA: ${submissionData.max_score}

INSTRUCCIONES:
1. Mira la imagen con atención (objetos, colores, formas, textos, posiciones y cantidades) y compárala con los requisitos de la tarea.
2. Si la imagen NO cumple los requisitos, penaliza fuertemente.
3. Si cumple, califica según calidad y esfuerzo visible.
4. Devuelve EXCLUSIVAMENTE un JSON con este formato:
{
  "score": <número entero de 0 a ${submissionData.max_score}>,
  "feedback": {
    "cumplimiento_requisitos": "<qué requisitos cumple y cuáles no>",
    "calidad_visual": "<evaluación de calidad>",
    "creatividad": "<evaluación de creatividad y esfuerzo>",
    "precision": "<evaluación de precisión>",
    "presentacion": "<evaluación de presentación>",
    "pertinencia": "<relación con la tarea>",
    "general": "<resumen general>"
  },
  "reasoning": "<razonamiento breve>"
}
NO agregues texto fuera del JSON.`;

        try {
          // Pensando, como el modelo Pro con el que se califican los documentos:
          // max_tokens cubre también el razonamiento.
          aiContent = await callVision(gradePrompt, imageBuffer, { thinking: true, max_tokens: 8000 }, env);
        } catch (visionError: any) {
          // Sin ver la imagen no se califica: antes se ponía nota sobre «no se
          // pudo analizar», y el estudiante pagaba un fallo que no era suyo.
          console.error('❌ [DEBUG] Error con DeepSeek (visión):', visionError.message);
          return jsonResponse({
            error: 'No se pudo analizar la imagen ahora mismo. Vuelve a intentarlo en unos minutos.'
          }, 502, corsHeaders);
        }

      } else {
        // ── EVALUACIÓN DE DOCUMENTO (PDF/DOCX) ──
        let textContent = submissionData.extracted_text;

        if (!textContent || textContent.length < 50) {
          console.log('⚠️ [DEBUG] No hay texto extraído, intentando extracción del archivo...');

          const r2Object = await env.MIRAI_AI_ASSETS.get(r2Key);
          if (!r2Object) {
            return jsonResponse({ error: 'Archivo no encontrado' }, 404, corsHeaders);
          }

          const fileBuffer = await r2Object.arrayBuffer();

          try {
            if (fileExtension === 'pdf') {
              textContent = await extractTextFromPDF(fileBuffer);
            } else if (fileExtension === 'docx') {
              textContent = await extractTextFromDocx(fileBuffer);
            }
          } catch (extractError: any) {
            console.error('❌ [DEBUG] Extracción del archivo falló:', extractError.message);
            return jsonResponse({
              error: 'No se pudo extraer texto del archivo. Por favor, vuelve a subir el documento.'
            }, 500, corsHeaders);
          }
        }
        console.log(`🔍 [DEBUG] Usando texto extraído: ${textContent.length} caracteres`);

        const systemPrompt = `Eres un profesor experto evaluador académico. Tu tarea es evaluar un trabajo estudiantil basado en criterios rigurosos.

TAREA: ${submissionData.title}
DESCRIPCIÓN Y PUNTOS A EVALUAR: ${submissionData.description}
PUNTUACIÓN MÁXIMA: ${submissionData.max_score}

CRITERIOS DE EVALUACIÓN OBLIGATORIOS:
1. Normas APA 7ma edición (citas, referencias, formato).
2. Redacción en tercera persona.
3. Uso correcto de conectores lógicos.
4. Inclusión y correcta etiquetado de tablas y figuras.
5. Originalidad (no parece generado por IA).
6. Coherencia y estructura lógica.
7. Profundidad del análisis.
8. Pertinencia temática: el trabajo debe responder directamente a los puntos indicados en la descripción de la tarea ("${submissionData.title}"). Si el contenido es completamente ajeno al tema, la puntuación máxima es 20% independientemente del formato.

INSTRUCCIONES:
1. Analiza el contenido del trabajo.
2. Verifica primero si el trabajo responde a los puntos indicados en la descripción. Si no corresponde, penaliza fuertemente.
3. Evalúa cada criterio (1-8) y asigna una puntuación parcial.
4. Suma las puntuaciones parciales para obtener la nota final (0-${submissionData.max_score}).
5. Devuelve la respuesta EXACTAMENTE en este formato JSON:
{
  "score": <número entero>,
  "feedback": {
    "apa": "<texto>",
    "tercera_persona": "<texto>",
    "conectores": "<texto>",
    "tablas_figuras": "<texto>",
    "originalidad": "<texto>",
    "coherencia": "<texto>",
    "profundidad": "<texto>",
    "pertinencia_tematica": "<texto>",
    "general": "<resumen general>"
  },
  "reasoning": "<razonamiento breve>"
}

NO agregues texto adicional fuera del JSON.`;

        const userPrompt = `Aquí está el trabajo del estudiante:\n\n${textContent.substring(0, 15000)}`;

        aiContent = await callAI(
          AI_MODEL_PRO,
          [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
          { temperature: 0.3, max_tokens: 5000 },
          env
        );
      }
      console.log('🤖 [DEBUG] aiContent raw:', aiContent?.substring(0, 300));

      // 6. Parsear la respuesta JSON
      let evaluation;
      try {
        // Limpiar posibles bloques de código markdown que envuelvan el JSON
        const cleaned = aiContent
          .replace(/^```json\s*/i, '')
            .replace(/^```\s*/i, '')
          .replace(/```\s*$/i, '')
            .trim();

          // Extraer el primer objeto JSON válido
          const start = cleaned.indexOf('{');
          const end = cleaned.lastIndexOf('}');
          if (start === -1 || end === -1) throw new Error('No se encontró JSON en la respuesta');
          evaluation = JSON.parse(cleaned.slice(start, end + 1));
        } catch (parseError) {
          console.error('Error parseando respuesta de IA:', parseError);
          console.error('🤖 [DEBUG] aiContent completo:', aiContent);
          evaluation = {
            score: Math.floor(submissionData.max_score * 0.8),
            feedback: { general: 'Error al evaluar automáticamente. Se asignó una puntuación provisional.' },
            reasoning: 'Error de parseo'
          };
        }

        // 7. Validar la puntuación
        const finalScore = Math.min(Math.max(evaluation.score, 0), submissionData.max_score);
        const formative = submissionData.grading_mode === 'formative';
        if (formative) evaluation.feedback.formative = true;

        // 8. Guardar la evaluación en la DB (formativo: sin nota visible)
        await env.MIRAI_AI_DB.prepare(`
          UPDATE submissions 
          SET score = ?, status = 'completed', reviewed_at = datetime('now'), feedback = ?
          WHERE id = ?
      `).bind(formative ? null : finalScore, JSON.stringify(evaluation.feedback), submission_id).run();

        // 9. Devolver la respuesta al frontend
        return jsonResponse({
          success: true,
          score: formative ? null : finalScore,
          max_score: submissionData.max_score,
          formative,
          feedback: evaluation.feedback,
          reasoning: evaluation.reasoning
        }, 200, corsHeaders);

      } catch (error: any) {
        console.error('Error evaluando entrega:', error);
        return jsonResponse({ error: 'Error al evaluar', details: error.message }, 500, corsHeaders);
      }
    }

    // Ruta: POST /api/dispute-grade
    if (path === '/api/dispute-grade' && request.method === 'POST') {
      const userDni = await requireAuth(request, env);
      if (!userDni) return jsonResponse({ error: 'No autorizado' }, 401, corsHeaders);

      try {
        const { submission_id, reason } = await request.json<any>();

        if (!submission_id || !reason) {
          return jsonResponse({ error: 'ID de entrega y motivo requeridos' }, 400, corsHeaders);
        }

        // Verificar que el estudiante es el dueño de la entrega
        const submission = await env.MIRAI_AI_DB.prepare(`
          SELECT id FROM submissions WHERE id = ? AND user_dni = ?
      `).bind(submission_id, userDni).first<any>();

        if (!submission) {
          return jsonResponse({ error: 'Entrega no encontrada o no tienes acceso' }, 404, corsHeaders);
        }

        // Marcar como disputado
        await env.MIRAI_AI_DB.prepare(`
          UPDATE submissions 
          SET dispute_status = 'pending', dispute_reason = ?
          WHERE id = ?
      `).bind(reason, submission_id).run();

        return jsonResponse({ success: true, message: 'Disputa registrada. El profesor revisará tu caso.' }, 200, corsHeaders);

      } catch (error: any) {
        console.error('Error registrando disputa:', error);
        return jsonResponse({ error: 'Error al registrar disputa', details: error.message }, 500, corsHeaders);
      }
    }

    // Ruta: POST /api/professor-update-grade
    if (path === '/api/professor-update-grade' && request.method === 'POST') {
      const userDni = await requireProfessorAuth(request, env, corsHeaders);
      if (!userDni || userDni instanceof Response) return userDni;

      try {
        const { submission_id, new_score, feedback } = await request.json<any>();

        if (!submission_id || new_score === undefined) {
          return jsonResponse({ error: 'ID de entrega y nueva nota requeridos' }, 400, corsHeaders);
        }

        // Verificar que la entrega existe
        const submission = await env.MIRAI_AI_DB.prepare(`
          SELECT id, assignment_id FROM submissions WHERE id = ?
      `).bind(submission_id).first<any>();

        if (!submission) {
          return jsonResponse({ error: 'Entrega no encontrada' }, 404, corsHeaders);
        }

        // Ser profesor activo no basta: la tarea tiene que colgar de un curso
        // suyo. Sin esto cualquier profesor podía cambiar las notas de otro.
        if (!await canManageAssignment(submission.assignment_id, userDni, env)) {
          return jsonResponse({ error: 'Esta entrega no pertenece a un curso tuyo' }, 403, corsHeaders);
        }

        // Obtener max_score de la tarea
        const assignment = await env.MIRAI_AI_DB.prepare(`
          SELECT max_score FROM assignments WHERE id = ?
      `).bind(submission.assignment_id).first<any>();

        if (!assignment) {
          return jsonResponse({ error: 'Tarea no encontrada' }, 404, corsHeaders);
        }

        // Validar nota. Number() explícito: con un string o un valor no numérico,
        // Math.min/Math.max devolvían NaN y se guardaba una nota corrupta.
        const parsedScore = Number(new_score);
        if (!Number.isFinite(parsedScore)) {
          return jsonResponse({ error: 'La nota debe ser un número' }, 400, corsHeaders);
        }
        const finalScore = Math.min(Math.max(parsedScore, 0), assignment.max_score);

        // Actualizar nota y resolver disputa si existe.
        // professor_note es INTEGER (la nota manual del profesor); el comentario
        // va en professor_feedback (TEXT). Ver db/classroom.sql.
        await env.MIRAI_AI_DB.prepare(`
          UPDATE submissions
          SET score = ?, professor_note = ?, professor_feedback = ?, dispute_status = 'resolved'
          WHERE id = ?
      `).bind(finalScore, finalScore, feedback || null, submission_id).run();

        return jsonResponse({ success: true, new_score: finalScore }, 200, corsHeaders);

      } catch (error: any) {
        console.error('Error actualizando nota:', error);
        return jsonResponse({ error: 'Error al actualizar nota', details: error.message }, 500, corsHeaders);
      }
    }

    // Ruta: POST /api/submit-assignment
    if (path === '/api/submit-assignment' && request.method === 'POST') {
      const userDni = await requireAuth(request, env);
      if (!userDni) return jsonResponse({ error: 'No autorizado' }, 401, corsHeaders);

      try {
        const formData = await request.formData();
        const file = formData.get('file') as File | null;
        const assignmentId = formData.get('assignment_id') as string | null;

        if (!file || !assignmentId) {
          return jsonResponse({ error: 'Faltan datos' }, 400, corsHeaders);
        }

        // Obtener el tipo de entrega configurado por el profesor
        const assignmentData = await env.MIRAI_AI_DB.prepare(
          'SELECT id, submission_type, published_at FROM assignments WHERE id = ?'
        ).bind(assignmentId).first<any>();
        if (!assignmentData) {
          return jsonResponse({ error: 'Tarea no encontrada' }, 404, corsHeaders);
        }
        if (!assignmentData.published_at) {
          return jsonResponse({ error: 'Esta tarea todavía no está publicada' }, 403, corsHeaders);
        }
        const submissionType = assignmentData.submission_type || 'document';

        // El alumno tiene que estar asignado a la tarea (individualmente o vía
        // sección). Sin esto, cualquier usuario logueado podía entregar contra
        // cualquier assignment_id.
        const isAssigned = await env.MIRAI_AI_DB.prepare(`
        SELECT 1 FROM assignment_students
         WHERE assignment_id = ? AND UPPER(user_dni) = UPPER(?)
        UNION
        SELECT 1 FROM assignments a
          JOIN section_students ss ON ss.section_id = a.section_id
         WHERE a.id = ? AND UPPER(ss.user_dni) = UPPER(?)
      `).bind(assignmentId, userDni, assignmentId, userDni).first<any>();

        if (!isAssigned) {
          return jsonResponse({ error: 'No tienes esta tarea asignada' }, 403, corsHeaders);
        }

        // Una sola fila por alumno y tarea: si vuelve a entregar, la nueva
        // entrega (y su nueva nota) reemplaza a la anterior.
        const alreadySubmitted = await env.MIRAI_AI_DB.prepare(
          'SELECT id, status FROM submissions WHERE assignment_id = ? AND UPPER(user_dni) = UPPER(?)'
        ).bind(assignmentId, userDni).first<any>();

        const extension = (file.name.split('.').pop() ?? '').toLowerCase();
        const isImageExt = ['png', 'jpg', 'jpeg', 'webp'].includes(extension);
        const isDocExt = ['pdf', 'docx'].includes(extension);

        if (submissionType === 'document' && !isDocExt) {
          return jsonResponse({ error: 'Esta tarea solo acepta documentos (PDF o DOCX)' }, 400, corsHeaders);
        }
        if (submissionType === 'image' && !isImageExt) {
          return jsonResponse({ error: 'Esta tarea solo acepta imágenes (PNG, JPG o WEBP)' }, 400, corsHeaders);
        }
        if (!isDocExt && !isImageExt) {
          return jsonResponse({ error: 'Solo se permiten archivos PDF, DOCX, PNG, JPG y WEBP' }, 400, corsHeaders);
        }

        // Validar tamaño máximo (10MB)
        if (file.size > 10 * 1024 * 1024) {
          return jsonResponse({ error: 'El archivo excede el límite de 10MB' }, 400, corsHeaders);
        }
        // 1. Subir a R2
        // El DNI se normaliza a mayúsculas tanto en la clave R2 como en la fila:
        // canReadSubmissionKey() deduce el dueño del segundo segmento de la clave.
        const ownerDni = userDni.toUpperCase();
        const uniqueId = crypto.randomUUID();
        const fileExtension = (file.name.split('.').pop() ?? '').toLowerCase();
        const r2Key = `submissions/${ownerDni}/${assignmentId}/${uniqueId}.${fileExtension}`;

        await env.MIRAI_AI_ASSETS.put(r2Key, file.stream(), {
          httpMetadata: { contentType: file.type },
          customMetadata: {
            user_dni: ownerDni,
            assignment_id: assignmentId,
            original_filename: file.name,
            file_extension: fileExtension
          }
        });

        // 2. Guardar en D1
        await ensureQuizSubmissionColumns(env);
        let submissionId = alreadySubmitted?.id;
        if (alreadySubmitted) {
          await env.MIRAI_AI_DB.prepare(`
            UPDATE submissions
               SET file_url = ?, status = 'pending', score = NULL, feedback = NULL,
                   graded_at = NULL, extracted_text = NULL, attempt_type = 'document',
                   submitted_at = datetime('now')
             WHERE id = ?
          `).bind(`/api/file/${r2Key}`, submissionId).run();
        } else {
          submissionId = crypto.randomUUID();
          await env.MIRAI_AI_DB.prepare(`
            INSERT INTO submissions
              (id, assignment_id, user_dni, file_url, status, submitted_at, attempt_type, retry_used)
            VALUES (?, ?, ?, ?, 'pending', datetime('now'), 'document', 0)
        `).bind(submissionId, assignmentId, ownerDni, `/api/file/${r2Key}`).run();
        }

        return jsonResponse({ success: true, submission_id: submissionId }, 200, corsHeaders);

      } catch (error) {
        console.error(error);
        return jsonResponse({ error: 'Error al entregar' }, 500, corsHeaders);
      }
    }

    // Ruta: GET /api/file/:path (Para descargar trabajos)
    // Solo el estudiante que entregó el archivo, el profesor dueño del curso de
    // la tarea, o un admin. Antes esta ruta servía CUALQUIER clave del bucket a
    // cualquiera, con lo que todas las entregas eran públicas para quien
    // conociese (o adivinase) la clave.
    if (path.startsWith('/api/file/') && request.method === 'GET') {
      const r2Key = decodeURIComponent(path.replace('/api/file/', ''));

      const requesterDni = await requireAuth(request, env);
      if (!requesterDni) return jsonResponse({ error: 'No autorizado' }, 401, corsHeaders);

      if (!await canReadSubmissionKey(r2Key, requesterDni, env)) {
        return jsonResponse({ error: 'No tienes acceso a este archivo' }, 403, corsHeaders);
      }

      const object = await env.MIRAI_AI_ASSETS.get(r2Key);

      if (!object) return new Response('Archivo no encontrado', { status: 404 });

      const headers = new Headers();
      const contentType = object.httpMetadata?.contentType || 'application/octet-stream';
      headers.set('Content-Type', contentType);
      const isInlineType = contentType.startsWith('image/');
      headers.set('Content-Disposition', `${isInlineType ? 'inline' : 'attachment'}; filename="${r2Key.split('/').pop()}"`);
      // Contenido con permisos: nunca en cachés compartidas.
      headers.set('Cache-Control', 'private, no-store');

      return new Response(object.body, { headers });
    }

  // NUEVA RUTA: Guardar texto extraído del documento
  // Solo el dueño de la entrega (o el profesor del curso). Sin esta comprobación
  // cualquiera podía reescribir el texto que la IA evalúa en la entrega de otro.
  if (path === '/api/save-extracted-text' && request.method === 'POST') {
    try {
      const requesterDni = await requireAuth(request, env);
      if (!requesterDni) return jsonResponse({ error: 'No autorizado' }, 401, corsHeaders);

      const { submission_id, extracted_text } = await request.json<any>();

      if (!submission_id || !extracted_text) {
        return jsonResponse({ error: 'Faltan datos' }, 400, corsHeaders);
      }

      const access = await canAccessSubmission(submission_id, requesterDni, env);
      if (!access.submission) {
        return jsonResponse({ error: 'Entrega no encontrada' }, 404, corsHeaders);
      }
      if (!access.allowed) {
        return jsonResponse({ error: 'No tienes acceso a esta entrega' }, 403, corsHeaders);
      }

      // Actualizar la entrega con el texto extraído
      await env.MIRAI_AI_DB.prepare(`
      UPDATE submissions
      SET extracted_text = ?, status = 'submitted'
      WHERE id = ?
    `).bind(extracted_text.substring(0, 15000), submission_id).run();

      console.log(`✅ [DEBUG] Texto extraído guardado para entrega: ${submission_id}`);

      return jsonResponse({ success: true }, 200, corsHeaders);

    } catch (error) {
      console.error('Error guardando texto extraído:', error);
      return jsonResponse({ error: 'Error interno' }, 500, corsHeaders);
    }
  }

  if (path === '/api/course-details' && request.method === 'GET') {
    return await handleGetCourseDetails(request, env, corsHeaders);
  }

  return null;
}

/**
 * ¿`userDni` es el profesor dueño del curso al que pertenece la tarea, o un admin?
 * Se usa para cerrar los IDOR entre profesores: ser profesor activo no basta,
 * la tarea tiene que colgar de un curso suyo.
 */
async function canManageAssignment(assignmentId: string, userDni: string, env: Env) {
  if (await isAdminUser(userDni, env)) return true;
  const row = await env.MIRAI_AI_DB.prepare(`
    SELECT a.id
    FROM assignments a
    JOIN user_courses uc ON uc.id = a.course_id
    WHERE a.id = ? AND uc.user_dni = ?
  `).bind(assignmentId, userDni.toUpperCase()).first<any>();
  return !!row;
}

/**
 * ¿`userDni` puede ver/gestionar esta entrega? El estudiante que la hizo,
 * el profesor dueño del curso de la tarea, o un admin.
 * @returns {Promise<{allowed:boolean, isOwner:boolean, submission:Object|null}>}
 */
async function canAccessSubmission(submissionId: any, userDni: string, env: Env) {
  const dni = userDni.toUpperCase();
  const submission = await env.MIRAI_AI_DB.prepare(
    'SELECT id, assignment_id, user_dni, file_url FROM submissions WHERE id = ?'
  ).bind(submissionId).first<any>();

  if (!submission) return { allowed: false, isOwner: false, submission: null };

  const isOwner = (submission.user_dni || '').toUpperCase() === dni;
  if (isOwner) return { allowed: true, isOwner: true, submission };

  const canManage = await canManageAssignment(submission.assignment_id, dni, env);
  return { allowed: canManage, isOwner: false, submission };
}

/**
 * Autoriza la lectura de una clave de R2 concreta bajo el prefijo submissions/.
 * Las claves tienen la forma submissions/<dni>/<assignmentId>/<uuid>.<ext>, así que
 * el dueño se deduce de la propia clave sin tocar D1.
 */
async function canReadSubmissionKey(r2Key: string, userDni: string, env: Env) {
  const parts = r2Key.split('/');
  if (parts[0] !== 'submissions' || parts.length < 3) return false;

  const ownerDni = (parts[1] || '').toUpperCase();
  const assignmentId = parts[2];
  if (ownerDni === userDni.toUpperCase()) return true;

  return canManageAssignment(assignmentId, userDni, env);
}


// ════════════════════════════════════════════════════════════
// HELPER: autenticación normalizada para rutas admin
// requireProfessorAuth() retorna la Response directamente cuando falla,
// por lo que NO se puede usar el patrón `if (!userDni) return`.
// Este wrapper devuelve { dni, errorResponse } para un manejo limpio.
// ════════════════════════════════════════════════════════════
// AGREGAR esto en su lugar:
// ── FECHA Y HORA LOCALES DEL MÓDULO DE ASISTENCIA ────────────────────────
// Los Workers corren en UTC, así que new Date().toISOString() daba ya el día
// siguiente a partir de las 19:00 hora local, y los QR "válidos hasta las
// 23:59:59" caducaban de hecho a las 19:00. Venezuela (VET) y Perú (PET) están
// ambos en UTC-5 fijo y sin horario de verano, así que basta un desplazamiento
// constante.
const ATT_UTC_OFFSET_HOURS = -5;

/** Fecha local (YYYY-MM-DD) del instante dado. */
function attLocalDate(date = new Date()) {
  const shifted = new Date(date.getTime() + ATT_UTC_OFFSET_HOURS * 3600 * 1000);
  return shifted.toISOString().slice(0, 10);
}

/**
 * Hora local en HH:MM de 24 horas.
 * Antes se usaba toLocaleTimeString('es-PE', ...), que devuelve formato de 12h
 * ("03:45 p. m."). Como att_records.time es TEXT y el tipo entrada/salida se
 * decide con ORDER BY time DESC, ese formato ordenaba mal ("01:00 p. m." va
 * antes que "11:00 a. m."): el registro alternaba de forma impredecible.
 */
function attLocalTime(date = new Date()) {
  const shifted = new Date(date.getTime() + ATT_UTC_OFFSET_HOURS * 3600 * 1000);
  return shifted.toISOString().slice(11, 16);
}

/**
 * Instante UTC (formato de datetime() de SQLite) en el que termina el día local
 * `localDate`, para comparar contra datetime('now') sin desfase.
 */
function attLocalEndOfDayUtc(localDate: any) {
  const endLocal = Date.parse(`${localDate}T23:59:59Z`) - ATT_UTC_OFFSET_HOURS * 3600 * 1000;
  return new Date(endLocal).toISOString().slice(0, 19).replace('T', ' ');
}

async function attRequireAdmin(request: Request, env: Env, corsHeaders: Record<string, string>) {
  const userDni = await requireAuth(request, env);
  if (!userDni || typeof userDni !== 'string') {
    return { dni: null, errorResponse: jsonResponse({ error: 'No autorizado' }, 401, corsHeaders) };
  }
  // Verificar rol directamente en la tabla professors (igual que isAuthorizedProfessor, más abajo)
  try {
    const professor = await env.MIRAI_AI_DB.prepare(
      'SELECT dni FROM professors WHERE dni = ? AND is_active = 1'
    ).bind(userDni.toUpperCase()).first<any>();
    if (!professor) {
      return { dni: null, errorResponse: jsonResponse({ error: 'Acceso restringido a administradores' }, 403, corsHeaders) };
    }
  } catch (e) {
    return { dni: null, errorResponse: jsonResponse({ error: 'Error verificando permisos' }, 500, corsHeaders) };
  }
  return { dni: userDni.toUpperCase(), errorResponse: null };
}

// ════════════════════════════════════════════════════════════
// HANDLERS — Empleado
// ════════════════════════════════════════════════════════════

async function handleAttMyProfile(request: Request, env: Env, corsHeaders: Record<string, string>) {
  const userDni = await requireAuth(request, env);
  if (!userDni || typeof userDni !== 'string') {
    return jsonResponse({ error: 'No autorizado' }, 401, corsHeaders);
  }
  try {
    const staff = await env.MIRAI_AI_DB.prepare(
      'SELECT name, dni, department, position, email FROM att_staff WHERE dni = ? AND is_active = 1'
    ).bind(userDni.toUpperCase()).first<any>();
    if (!staff) return jsonResponse({ error: 'Personal no registrado' }, 404, corsHeaders);
    return jsonResponse(staff, 200, corsHeaders);
  } catch (e: any) {
    return jsonResponse({ error: e.message }, 500, corsHeaders);
  }
}

async function handleAttMyHistory(request: Request, env: Env, corsHeaders: Record<string, string>) {
  const userDni = await requireAuth(request, env);
  if (!userDni || typeof userDni !== 'string') {
    return jsonResponse({ error: 'No autorizado' }, 401, corsHeaders);
  }
  const url = new URL(request.url);
  const dateFrom = url.searchParams.get('date_from');
  const dateTo = url.searchParams.get('date_to');
  const classId = url.searchParams.get('class_id');

  try {
    const staff = await env.MIRAI_AI_DB.prepare(
      'SELECT id FROM att_staff WHERE dni = ? AND is_active = 1'
    ).bind(userDni.toUpperCase()).first<any>();
    if (!staff) return jsonResponse({ records: [] }, 200, corsHeaders);

    let query = `
      SELECT r.type, r.date, r.time, COALESCE(c.name, 'General') AS class_name
      FROM att_records r
      LEFT JOIN att_qr_sessions q ON r.session_id = q.id
      LEFT JOIN att_classes c ON q.class_id = c.id
      WHERE r.staff_id = ?`;
    const bindings = [staff.id];

    if (dateFrom && dateTo) {
      query += ' AND r.date BETWEEN ? AND ?';
      bindings.push(dateFrom, dateTo);
    }
    if (classId) {
      query += ' AND q.class_id = ?';
      bindings.push(classId);
    }
    query += ' ORDER BY r.date DESC, r.time DESC LIMIT 50';

    const { results } = await env.MIRAI_AI_DB.prepare(query).bind(...bindings).all<any>();
    return jsonResponse({ records: results }, 200, corsHeaders);
  } catch (e: any) {
    return jsonResponse({ error: e.message }, 500, corsHeaders);
  }
}

async function handleAttMyClasses(request: Request, env: Env, corsHeaders: Record<string, string>) {
  const userDni = await requireAuth(request, env);
  if (!userDni || typeof userDni !== 'string') {
    return jsonResponse({ error: 'No autorizado' }, 401, corsHeaders);
  }
  try {
    const staff = await env.MIRAI_AI_DB.prepare(
      'SELECT id FROM att_staff WHERE dni = ? AND is_active = 1'
    ).bind(userDni.toUpperCase()).first<any>();
    if (!staff) return jsonResponse({ classes: [] }, 200, corsHeaders);
    const { results } = await env.MIRAI_AI_DB.prepare(`
      SELECT c.id, c.name FROM att_classes c
      JOIN att_class_students cs ON cs.class_id = c.id
      WHERE cs.staff_id = ? AND c.is_active = 1 ORDER BY c.name
    `).bind(staff.id).all<any>();
    return jsonResponse({ classes: results }, 200, corsHeaders);
  } catch (e) {
    return jsonResponse({ classes: [] }, 200, corsHeaders);
  }
}

async function handleAttRecord(request: Request, env: Env, corsHeaders: Record<string, string>) {
  const userDni = await requireAuth(request, env);
  if (!userDni || typeof userDni !== 'string') {
    return jsonResponse({ error: 'No autorizado' }, 401, corsHeaders);
  }

  let body;
  try { body = await request.json<any>(); } catch (_) { body = {}; }
  const { qr_token } = body;
  if (!qr_token) return jsonResponse({ error: 'Token QR requerido' }, 400, corsHeaders);

  try {
    // 1. Validar sesión QR (no expirada)
    const session = await env.MIRAI_AI_DB.prepare(`
            SELECT id, date, class_id FROM att_qr_sessions
            WHERE token = ? AND expires_at > datetime('now')
        `).bind(qr_token).first<any>();
    if (!session) return jsonResponse({ error: 'QR inválido o expirado' }, 400, corsHeaders);

    // 2. Buscar al empleado
    const staff = await env.MIRAI_AI_DB.prepare(
      'SELECT id FROM att_staff WHERE dni = ? AND is_active = 1'
    ).bind(userDni.toUpperCase()).first<any>();
    if (!staff) return jsonResponse({ error: 'No estás registrado como personal activo' }, 403, corsHeaders);

    // 2b. Si el QR es de una clase, verificar que el empleado esté inscrito
    if (session.class_id) {
      const enrolled = await env.MIRAI_AI_DB.prepare(
        'SELECT 1 FROM att_class_students WHERE class_id = ? AND staff_id = ?'
      ).bind(session.class_id, staff.id).first<any>();
      if (!enrolled) return jsonResponse({ error: 'No estás inscrito en esta clase' }, 403, corsHeaders);
    }

    // 3. Determinar si es entrada o salida
    const lastRecord = await env.MIRAI_AI_DB.prepare(`
            SELECT type FROM att_records
            WHERE staff_id = ? AND date = ?
            ORDER BY time DESC LIMIT 1
        `).bind(staff.id, session.date).first<any>();
    const type = (!lastRecord || lastRecord.type === 'salida') ? 'entrada' : 'salida';

    const time = attLocalTime();

    // 4. Insertar registro
    await env.MIRAI_AI_DB.prepare(`
            INSERT INTO att_records (id, session_id, staff_id, type, date, time)
            VALUES (?, ?, ?, ?, ?, ?)
        `).bind(crypto.randomUUID(), session.id, staff.id, type, session.date, time).run();

    // 5. Incrementar scan_count
    await env.MIRAI_AI_DB.prepare(
      'UPDATE att_qr_sessions SET scan_count = scan_count + 1 WHERE id = ?'
    ).bind(session.id).run();

    return jsonResponse({ success: true, type, date: session.date, time }, 200, corsHeaders);
  } catch (e: any) {
    return jsonResponse({ error: e.message }, 500, corsHeaders);
  }
}


// ════════════════════════════════════════════════════════════
// HANDLERS — Admin
// ════════════════════════════════════════════════════════════

async function handleAttActiveQr(request: Request, env: Env, corsHeaders: Record<string, string>) {
  const { dni, errorResponse } = await attRequireAdmin(request, env, corsHeaders);
  if (errorResponse) return errorResponse;

  const url = new URL(request.url);
  const date = url.searchParams.get('date') || attLocalDate();
  try {
    const session = await env.MIRAI_AI_DB.prepare(
      'SELECT id, token, date, expires_at, scan_count FROM att_qr_sessions WHERE date = ? AND class_id IS NULL'
    ).bind(date).first<any>();
    if (!session) return jsonResponse({ error: 'Sin QR activo para esta fecha' }, 404, corsHeaders);
    return jsonResponse(session, 200, corsHeaders);
  } catch (e: any) {
    return jsonResponse({ error: e.message }, 500, corsHeaders);
  }
}

async function handleAttGenerateQr(request: Request, env: Env, corsHeaders: Record<string, string>) {
  const { dni, errorResponse } = await attRequireAdmin(request, env, corsHeaders);
  if (errorResponse) return errorResponse;

  let body;
  try { body = await request.json<any>(); } catch (_) { body = {}; }
  const targetDate = body.date || attLocalDate();
  const token = crypto.randomUUID();
  const expiresAt = attLocalEndOfDayUtc(targetDate);

  try {
    // Reemplazar sesión previa del mismo día (solo QR general, sin clase)
    await env.MIRAI_AI_DB.prepare('DELETE FROM att_qr_sessions WHERE date = ? AND class_id IS NULL').bind(targetDate).run();
    await env.MIRAI_AI_DB.prepare(`
            INSERT INTO att_qr_sessions (id, token, date, expires_at, scan_count, created_by, class_id)
            VALUES (?, ?, ?, ?, 0, ?, NULL)
        `).bind(crypto.randomUUID(), token, targetDate, expiresAt, dni).run();

    return jsonResponse({
      success: true,
      token,
      date: targetDate,
      expires_at: expiresAt,
      scan_count: 0,
    }, 200, corsHeaders);
  } catch (e: any) {
    return jsonResponse({ error: e.message }, 500, corsHeaders);
  }
}

async function handleAttAdminRecords(request: Request, env: Env, corsHeaders: Record<string, string>) {
  const { dni, errorResponse } = await attRequireAdmin(request, env, corsHeaders);
  if (errorResponse) return errorResponse;

  const url = new URL(request.url);
  const date = url.searchParams.get('date') || attLocalDate();
  const type = url.searchParams.get('type');
  const classId = url.searchParams.get('class_id');
  const dateFrom = url.searchParams.get('date_from');
  const dateTo = url.searchParams.get('date_to');

  try {
    let query = `
            SELECT r.id, r.type, r.date, r.time, r.session_id,
                   s.name AS staff_name, s.dni AS staff_dni,
                   s.department, s.position,
                   COALESCE(c.name, '—') AS class_name
            FROM att_records r
            JOIN att_staff s ON r.staff_id = s.id
            LEFT JOIN att_qr_sessions q ON r.session_id = q.id
            LEFT JOIN att_classes c ON q.class_id = c.id
            WHERE 1=1`;
    const bindings: any[] = [];

    if (dateFrom && dateTo) {
      query += ' AND r.date BETWEEN ? AND ?';
      bindings.push(dateFrom, dateTo);
    } else {
      query += ' AND r.date = ?';
      bindings.push(date);
    }

    if (type && type !== 'todos') { query += ' AND r.type = ?'; bindings.push(type); }
    if (classId) { query += ' AND q.class_id = ?'; bindings.push(classId); }
    query += ' ORDER BY r.date DESC, r.time DESC';

    const { results } = await env.MIRAI_AI_DB.prepare(query).bind(...bindings).all<any>();
    return jsonResponse({ records: results }, 200, corsHeaders);
  } catch (e: any) {
    return jsonResponse({ error: e.message }, 500, corsHeaders);
  }
}

async function handleAttAdminStats(request: Request, env: Env, corsHeaders: Record<string, string>) {
  const { dni, errorResponse } = await attRequireAdmin(request, env, corsHeaders);
  if (errorResponse) return errorResponse;

  const url = new URL(request.url);
  const date = url.searchParams.get('date') || attLocalDate();

  try {
    const totalStaff = await env.MIRAI_AI_DB.prepare(
      'SELECT COUNT(*) AS c FROM att_staff WHERE is_active = 1'
    ).first<any>();
    const { results } = await env.MIRAI_AI_DB.prepare(
      'SELECT type, COUNT(*) AS c FROM att_records WHERE date = ? GROUP BY type'
    ).bind(date).all<any>();

    const entries = results.find(r => r.type === 'entrada')?.c ?? 0;
    const exits = results.find(r => r.type === 'salida')?.c ?? 0;

    return jsonResponse({
      total_staff: totalStaff?.c ?? 0,
      total_today: entries + exits,
      total_entries: entries,
      total_exits: exits,
    }, 200, corsHeaders);
  } catch (e: any) {
    return jsonResponse({ error: e.message }, 500, corsHeaders);
  }
}

async function handleAttStaffList(request: Request, env: Env, corsHeaders: Record<string, string>) {
  const { dni, errorResponse } = await attRequireAdmin(request, env, corsHeaders);
  if (errorResponse) return errorResponse;
  try {
    const { results } = await env.MIRAI_AI_DB.prepare(
      'SELECT id, name, dni, department, position, email, is_active FROM att_staff ORDER BY name'
    ).all<any>();
    return jsonResponse({ staff: results }, 200, corsHeaders);
  } catch (e: any) {
    return jsonResponse({ error: e.message }, 500, corsHeaders);
  }
}

// AGREGAR:
// GET /api/attendance/admin/lookup-user?dni=XXX
// Busca en users y devuelve nombre censurado para confirmar antes de registrar

// ════════════════════════════════════════════════════════════
// HANDLERS — Clases
// ════════════════════════════════════════════════════════════
async function handleAttSectionList(request: Request, env: Env, corsHeaders: Record<string, string>) {
  const { dni, errorResponse } = await attRequireAdmin(request, env, corsHeaders);
  if (errorResponse) return errorResponse;
  try {
    const { results } = await env.MIRAI_AI_DB.prepare(`
      SELECT s.id, s.name, s.description,
             uc.title AS course_title,
             COUNT(ss.user_dni) AS student_count
      FROM sections s
      LEFT JOIN user_courses uc ON s.course_id = uc.id
      LEFT JOIN section_students ss ON s.id = ss.section_id
      GROUP BY s.id
      ORDER BY s.name
    `).all<any>();
    return jsonResponse(results, 200, corsHeaders);
  } catch (e: any) {
    return jsonResponse({ error: e.message }, 500, corsHeaders);
  }
}
async function handleAttClassList(request: Request, env: Env, corsHeaders: Record<string, string>) {
  const { dni, errorResponse } = await attRequireAdmin(request, env, corsHeaders);
  if (errorResponse) return errorResponse;
  try {
    await env.MIRAI_AI_DB.prepare(`
      CREATE TABLE IF NOT EXISTS att_classes (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        created_by TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        is_active INTEGER DEFAULT 1
      )
    `).run();
    await env.MIRAI_AI_DB.prepare(`
      CREATE TABLE IF NOT EXISTS att_class_students (
        id TEXT PRIMARY KEY,
        class_id TEXT NOT NULL,
        staff_id TEXT NOT NULL,
        added_at TEXT DEFAULT (datetime('now')),
        UNIQUE(class_id, staff_id)
      )
    `).run();
    const { results } = await env.MIRAI_AI_DB.prepare(
      `SELECT c.id, c.name, c.description, c.created_at,
              (SELECT COUNT(*) FROM att_class_students cs WHERE cs.class_id = c.id) AS student_count
       FROM att_classes c WHERE c.is_active = 1 ORDER BY c.name`
    ).all<any>();
    return jsonResponse({ classes: results }, 200, corsHeaders);
  } catch (e: any) {
    return jsonResponse({ error: e.message }, 500, corsHeaders);
  }
}

async function handleAttClassCreate(request: Request, env: Env, corsHeaders: Record<string, string>) {
  const { dni, errorResponse } = await attRequireAdmin(request, env, corsHeaders);
  if (errorResponse) return errorResponse;
  let body; try { body = await request.json<any>(); } catch (_) { body = {}; }
  const { name, description } = body;
  if (!name || !name.trim()) return jsonResponse({ error: 'Nombre de clase requerido' }, 400, corsHeaders);
  try {
    await env.MIRAI_AI_DB.prepare(`
      CREATE TABLE IF NOT EXISTS att_classes (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT,
        created_by TEXT, created_at TEXT DEFAULT (datetime('now')), is_active INTEGER DEFAULT 1
      )
    `).run();
    await env.MIRAI_AI_DB.prepare(`
      CREATE TABLE IF NOT EXISTS att_class_students (
        id TEXT PRIMARY KEY, class_id TEXT NOT NULL, staff_id TEXT NOT NULL,
        added_at TEXT DEFAULT (datetime('now')), UNIQUE(class_id, staff_id)
      )
    `).run();
    const id = crypto.randomUUID();
    await env.MIRAI_AI_DB.prepare(
      'INSERT INTO att_classes (id, name, description, created_by) VALUES (?,?,?,?)'
    ).bind(id, name.trim(), description || null, dni).run();
    return jsonResponse({ success: true, id, name: name.trim() }, 200, corsHeaders);
  } catch (e: any) {
    return jsonResponse({ error: e.message }, 500, corsHeaders);
  }
}

async function handleAttClassUpdate(request: Request, env: Env, corsHeaders: Record<string, string>, classId: string) {
  const { errorResponse } = await attRequireAdmin(request, env, corsHeaders);
  if (errorResponse) return errorResponse;
  let body; try { body = await request.json<any>(); } catch (_) { body = {}; }
  const { name, description } = body;
  if (!name) return jsonResponse({ error: 'Nombre requerido' }, 400, corsHeaders);
  try {
    await env.MIRAI_AI_DB.prepare('UPDATE att_classes SET name=?, description=? WHERE id=?')
      .bind(name.trim(), description || null, classId).run();
    return jsonResponse({ success: true }, 200, corsHeaders);
  } catch (e: any) { return jsonResponse({ error: e.message }, 500, corsHeaders); }
}

async function handleAttClassDelete(request: Request, env: Env, corsHeaders: Record<string, string>, classId: string) {
  const { errorResponse } = await attRequireAdmin(request, env, corsHeaders);
  if (errorResponse) return errorResponse;
  try {
    await env.MIRAI_AI_DB.prepare("UPDATE att_classes SET is_active=0 WHERE id=?").bind(classId).run();
    return jsonResponse({ success: true }, 200, corsHeaders);
  } catch (e: any) { return jsonResponse({ error: e.message }, 500, corsHeaders); }
}

async function handleAttClassStudents(request: Request, env: Env, corsHeaders: Record<string, string>, classId: string) {
  const { errorResponse } = await attRequireAdmin(request, env, corsHeaders);
  if (errorResponse) return errorResponse;
  try {
    const { results } = await env.MIRAI_AI_DB.prepare(`
      SELECT s.id, s.name, s.dni, s.department, s.position
      FROM att_class_students cs
      JOIN att_staff s ON cs.staff_id = s.id
      WHERE cs.class_id = ? AND s.is_active = 1
      ORDER BY s.name
    `).bind(classId).all<any>();
    return jsonResponse({ students: results }, 200, corsHeaders);
  } catch (e: any) { return jsonResponse({ error: e.message }, 500, corsHeaders); }
}

// Helper: garantiza que un DNI exista en att_staff (lo crea si no está)
async function ensureAttStaff(env: Env, dni: any) {
  const upper = dni.toUpperCase();
  const existing = await env.MIRAI_AI_DB.prepare(
    'SELECT id, name FROM att_staff WHERE dni = ?'
  ).bind(upper).first<any>();
  if (existing) return existing;

  const user = await env.MIRAI_AI_DB.prepare(
    'SELECT first_name, last_name, email FROM users WHERE dni = ?'
  ).bind(upper).first<any>();
  if (!user) return null;

  const fullName = `${user.first_name} ${user.last_name}`.trim();
  const newId = crypto.randomUUID();
  await env.MIRAI_AI_DB.prepare(
    'INSERT OR IGNORE INTO att_staff (id, dni, name, email, is_active) VALUES (?,?,?,?,1)'
  ).bind(newId, upper, fullName, user.email || '').run();

  return { id: newId, name: fullName };
}

async function handleAttClassAddStudent(request: Request, env: Env, corsHeaders: Record<string, string>, classId: string) {
  const { errorResponse } = await attRequireAdmin(request, env, corsHeaders);
  if (errorResponse) return errorResponse;
  let body; try { body = await request.json<any>(); } catch (_) { body = {}; }
  const { dni, section_id } = body;

  // ── Modo sección: agregar todos los estudiantes de una sección ──
  if (section_id) {
    try {
      const { results: sectionMembers } = await env.MIRAI_AI_DB.prepare(
        'SELECT user_dni FROM section_students WHERE section_id = ?'
      ).bind(section_id).all<any>();
      if (!sectionMembers.length) return jsonResponse({ error: 'La sección no tiene estudiantes', added: 0 }, 200, corsHeaders);

      let added = 0;
      for (const member of sectionMembers) {
        const staff = await ensureAttStaff(env, member.user_dni);
        if (!staff) continue;
        const { meta } = await env.MIRAI_AI_DB.prepare(
          'INSERT OR IGNORE INTO att_class_students (id, class_id, staff_id) VALUES (?,?,?)'
        ).bind(crypto.randomUUID(), classId, staff.id).run();
        if (meta.changes > 0) added++;
      }
      return jsonResponse({ success: true, added }, 200, corsHeaders);
    } catch (e: any) { return jsonResponse({ error: e.message }, 500, corsHeaders); }
  }

  // ── Modo DNI individual ──
  if (!dni) return jsonResponse({ error: 'DNI o section_id requerido' }, 400, corsHeaders);
  try {
    const staff = await ensureAttStaff(env, dni);
    if (!staff) return jsonResponse({ error: 'Usuario no encontrado en el sistema' }, 404, corsHeaders);
    await env.MIRAI_AI_DB.prepare(
      'INSERT OR IGNORE INTO att_class_students (id, class_id, staff_id) VALUES (?,?,?)'
    ).bind(crypto.randomUUID(), classId, staff.id).run();
    return jsonResponse({ success: true, name: staff.name }, 200, corsHeaders);
  } catch (e: any) { return jsonResponse({ error: e.message }, 500, corsHeaders); }
}

async function handleAttClassRemoveStudent(request: Request, env: Env, corsHeaders: Record<string, string>, classId: string, studentDni: string) {
  const { errorResponse } = await attRequireAdmin(request, env, corsHeaders);
  if (errorResponse) return errorResponse;
  try {
    const staff = await env.MIRAI_AI_DB.prepare(
      'SELECT id FROM att_staff WHERE dni = ?'
    ).bind(studentDni.toUpperCase()).first<any>();
    if (!staff) return jsonResponse({ error: 'Personal no encontrado' }, 404, corsHeaders);
    await env.MIRAI_AI_DB.prepare(
      'DELETE FROM att_class_students WHERE class_id = ? AND staff_id = ?'
    ).bind(classId, staff.id).run();
    return jsonResponse({ success: true }, 200, corsHeaders);
  } catch (e: any) { return jsonResponse({ error: e.message }, 500, corsHeaders); }
}

async function handleAttClassActiveQr(request: Request, env: Env, corsHeaders: Record<string, string>, classId: string) {
  const { errorResponse } = await attRequireAdmin(request, env, corsHeaders);
  if (errorResponse) return errorResponse;
  const url = new URL(request.url);
  const date = url.searchParams.get('date') || attLocalDate();
  try {
    const session = await env.MIRAI_AI_DB.prepare(
      'SELECT id, token, date, expires_at, scan_count, class_id FROM att_qr_sessions WHERE date = ? AND class_id = ?'
    ).bind(date, classId).first<any>();
    if (!session) return jsonResponse({ error: 'Sin QR activo para esta clase/fecha' }, 404, corsHeaders);
    return jsonResponse(session, 200, corsHeaders);
  } catch (e: any) { return jsonResponse({ error: e.message }, 500, corsHeaders); }
}

async function handleAttClassGenerateQr(request: Request, env: Env, corsHeaders: Record<string, string>, classId: string) {
  const { dni, errorResponse } = await attRequireAdmin(request, env, corsHeaders);
  if (errorResponse) return errorResponse;
  let body; try { body = await request.json<any>(); } catch (_) { body = {}; }
  const targetDate = body.date || attLocalDate();
  const token = crypto.randomUUID();
  const expiresAt = attLocalEndOfDayUtc(targetDate);
  try {
    await env.MIRAI_AI_DB.prepare('DELETE FROM att_qr_sessions WHERE date = ? AND class_id = ?').bind(targetDate, classId).run();
    await env.MIRAI_AI_DB.prepare(`
      INSERT INTO att_qr_sessions (id, token, date, expires_at, scan_count, created_by, class_id)
      VALUES (?, ?, ?, ?, 0, ?, ?)
    `).bind(crypto.randomUUID(), token, targetDate, expiresAt, dni, classId).run();
    return jsonResponse({ success: true, token, date: targetDate, expires_at: expiresAt, scan_count: 0, class_id: classId }, 200, corsHeaders);
  } catch (e: any) { return jsonResponse({ error: e.message }, 500, corsHeaders); }
}

async function handleAttLookupUser(request: Request, env: Env, corsHeaders: Record<string, string>) {
  const { dni: adminDni, errorResponse } = await attRequireAdmin(request, env, corsHeaders);
  if (errorResponse) return errorResponse;

  const url = new URL(request.url);
  const dni = (url.searchParams.get('dni') || '').toUpperCase().trim();
  if (!dni) return jsonResponse({ error: 'DNI requerido' }, 400, corsHeaders);

  try {
    const user = await env.MIRAI_AI_DB.prepare(
      'SELECT first_name, last_name, email FROM users WHERE dni = ?'
    ).bind(dni).first<any>();

    if (!user) return jsonResponse({ error: 'Usuario no encontrado o no verificado' }, 404, corsHeaders);

    // Censurar email: a****m@g***.com
    function censorEmail(email: any) {
      const [local, domain] = email.split('@');
      const cLocal = local[0] + '****' + local[local.length - 1];
      const [dName, dExt] = domain.split('.');
      const cDomain = dName[0] + '***';
      return `${cLocal}@${cDomain}.${dExt}`;
    }

    return jsonResponse({
      found: true,
      full_name: `${user.first_name} ${user.last_name}`,
      email_hint: censorEmail(user.email),
    }, 200, corsHeaders);
  } catch (e: any) {
    return jsonResponse({ error: e.message }, 500, corsHeaders);
  }
}

async function handleAttStaffCreate(request: Request, env: Env, corsHeaders: Record<string, string>) {
  const { dni: adminDni, errorResponse } = await attRequireAdmin(request, env, corsHeaders);
  if (errorResponse) return errorResponse;

  let body;
  try { body = await request.json<any>(); } catch (_) { body = {}; }
  const { dni, department, position } = body;
  if (!dni) return jsonResponse({ error: 'DNI requerido' }, 400, corsHeaders);

  try {
    // Obtener nombre y email reales desde users
    const user = await env.MIRAI_AI_DB.prepare(
      'SELECT first_name, last_name, email FROM users WHERE dni = ?'
    ).bind(dni.toUpperCase()).first<any>();
    if (!user) return jsonResponse({ error: 'Usuario no encontrado o no verificado' }, 404, corsHeaders);

    const name = `${user.first_name} ${user.last_name}`.trim();

    await env.MIRAI_AI_DB.prepare(`
            INSERT INTO att_staff (id, name, dni, department, position, email)
            VALUES (?, ?, ?, ?, ?, ?)
        `).bind(crypto.randomUUID(), name, dni.toUpperCase(), department || null, position || null, user.email).run();

    return jsonResponse({ success: true, name }, 200, corsHeaders);
  } catch (e: any) {
    const msg = e.message.includes('UNIQUE') ? 'Este empleado ya está registrado' : e.message;
    return jsonResponse({ error: msg }, 400, corsHeaders);
  }
}

async function handleAttStaffUpdate(request: Request, env: Env, corsHeaders: Record<string, string>) {
  const { dni: adminDni, errorResponse } = await attRequireAdmin(request, env, corsHeaders);
  if (errorResponse) return errorResponse;

  let body;
  try { body = await request.json<any>(); } catch (_) { body = {}; }
  const { id, name, dni, department, position, email } = body;
  if (!id || !name || !dni) return jsonResponse({ error: 'Datos incompletos' }, 400, corsHeaders);

  try {
    await env.MIRAI_AI_DB.prepare(`
            UPDATE att_staff
            SET name=?, dni=?, department=?, position=?, email=?, updated_at=datetime('now')
            WHERE id=?
        `).bind(name, dni.toUpperCase(), department || null, position || null, email || null, id).run();
    return jsonResponse({ success: true }, 200, corsHeaders);
  } catch (e: any) {
    return jsonResponse({ error: e.message }, 500, corsHeaders);
  }
}


async function handleGetSubcategories(url: any, env: Env, corsHeaders: Record<string, string>) {
  try {
    const category = url.searchParams.get('category');

    let stmt;
    if (category) {
      // Filtrar por categoría principal
      stmt = env.MIRAI_AI_DB.prepare(`
                SELECT id, title, icon, category, sort_order
                FROM subcategories
                WHERE category = ?
                ORDER BY sort_order ASC
            `);
      const { results } = await stmt.bind(category).all();
      return jsonResponse(results, 200, corsHeaders);
    } else {
      // Devolver todas
      stmt = env.MIRAI_AI_DB.prepare(`
                SELECT id, title, icon, category, sort_order
                FROM subcategories
                ORDER BY category, sort_order ASC
            `);
      const { results } = await stmt.all();
      return jsonResponse(results, 200, corsHeaders);
    }

  } catch (error: any) {
    console.error('Error getting subcategories:', error);
    return jsonResponse({ error: 'Error interno', details: error.message }, 500, corsHeaders);
  }
}

async function handleGetCategoriesWithCount(env: Env, corsHeaders: Record<string, string>) {
  try {
    // Consulta que une categorías con conteo de cursos
    const stmt = env.MIRAI_AI_DB.prepare(`
            SELECT 
                c.id,
                c.title,
                c.description,
                c.icon,
                c.color,
                COUNT(co.id) as course_count
            FROM categories c
            LEFT JOIN courses co ON c.id = co.category
            GROUP BY c.id, c.title, c.description, c.icon, c.color
            ORDER BY c.title ASC
        `);

    const { results } = await stmt.all<any>();
    return jsonResponse(results, 200, corsHeaders);

  } catch (error: any) {
    console.error('Error getting categories with count:', error);
    return jsonResponse({ error: 'Error interno', details: error.message }, 500, corsHeaders);
  }
}


async function handleGetCourses(env: Env, corsHeaders: Record<string, string>) {
  const stmt = env.MIRAI_AI_DB.prepare(`
    SELECT 
      id, 
      title, 
      description, 
      category,      -- Categoría principal (programacion, ofimatica, historia)
      subcategory,   -- Subcategoría (web, backend, datos, movil, etc.)
      level, 
      lessons, 
      duration, 
      icon
    FROM courses
    ORDER BY category, subcategory, level
  `);

  const { results } = await stmt.all<any>();
  return jsonResponse(results, 200, corsHeaders);
}

async function handleGetCategories(env: Env, corsHeaders: Record<string, string>) {
  const stmt = env.MIRAI_AI_DB.prepare(`
    SELECT id, title, description, icon, color
    FROM categories
    ORDER BY title ASC
  `);

  const { results } = await stmt.all<any>();
  return jsonResponse(results, 200, corsHeaders);
}

async function handleGetCourseDetails(request: Request, env: Env, corsHeaders: Record<string, string>) {
  const url = new URL(request.url);
  const courseId = url.searchParams.get('id');

  if (!courseId) {
    return jsonResponse({ error: 'Falta el ID del curso' }, 400, corsHeaders);
  }

  try {
    console.log('📡 Buscando curso:', courseId);

    // 1. Obtener datos del curso
    const courseStmt = env.MIRAI_AI_DB.prepare(`
      SELECT id, title, description, category, level, lessons, duration, icon
      FROM courses
      WHERE id = ?
    `);
    const courseResult = await courseStmt.bind(courseId).first<any>();

    if (!courseResult) {
      console.warn('⚠️ Curso no encontrado:', courseId);
      return jsonResponse({ error: 'Curso no encontrado' }, 404, corsHeaders);
    }

    // 2. Obtener lecciones ordenadas
    const lessonsStmt = env.MIRAI_AI_DB.prepare(`
      SELECT id, title, content, order_index
      FROM lessons
      WHERE course_id = ?
      ORDER BY order_index ASC
    `);
    const lessonsResult = await lessonsStmt.bind(courseId).all<any>();

    const lessonsList = lessonsResult.results || [];

    // 3. Construir respuesta
    const responseData = {
      ...courseResult,
      lessons_list: lessonsList,
      // ✅ Asegurar que 'lessons' tenga el valor correcto (conteo real)
      // Si la columna 'lessons' en DB es NULL o no coincide, usamos el conteo real
      lessons: courseResult.lessons !== undefined ? courseResult.lessons : lessonsList.length
    };

    console.log('✅ Curso encontrado:', responseData.title, '| Lecciones:', lessonsList.length);

    return jsonResponse(responseData, 200, corsHeaders);

  } catch (error: any) {
    console.error('❌ Error en course-details:', error.message);
    return jsonResponse({ error: 'Error interno', details: error.message }, 500, corsHeaders);
  }
}


async function requireProfessorAuth(request: Request, env: Env, corsHeaders: Record<string, string>) {
  const userDni = await requireAuth(request, env);
  if (!userDni) {
    return jsonResponse({ error: 'No autorizado. Inicia sesión.' }, 401, corsHeaders);
  }

  const isProfessor = await isAuthorizedProfessor(userDni, env);
  if (!isProfessor) {
    return jsonResponse({ error: 'Acceso denegado. Requiere rol de profesor.' }, 403, corsHeaders);
  }

  return userDni; // Retorna el DNI si todo OK
}

export async function isAuthorizedProfessor(userDni: string, env: Env) {
  try {
    const professor = await env.MIRAI_AI_DB.prepare(
      "SELECT dni FROM professors WHERE dni = ? AND is_active = 1"
    ).bind(userDni.toUpperCase()).first<any>();

    return !!professor;
  } catch (error) {
    console.error('Error verificando profesor:', error);
    return false;
  }
}
