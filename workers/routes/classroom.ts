/* ============================================
   MIRAI AI - Aula, Cursos y Asistencia
   Aula virtual (materias, secciones, tareas, entregas y notas), catálogo
   de cursos y asistencia por QR. router.ts le pasa cada petición /api/ a
   handleClassroomApi y sigue con sus propias rutas si devuelve null.
   ============================================ */
import { callAI } from '../lib/ai';
import { AI_MODEL_PRO } from '../lib/ai-models';
import { isAdminUser, normalizeDni, requireAuth } from '../lib/auth';
import { extractTextFromDocx, extractTextFromPDF } from '../lib/documents';
import { jsonResponse } from '../lib/http';

/**
 * Rutas del aula, los cursos y la asistencia.
 * @returns {Promise<Response|null>} null si la ruta no es de este módulo.
 */
export async function handleClassroomApi(request: Request, env: Env, url: URL, path: string, corsHeaders: Record<string, string>) {
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
    } catch (error) {
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
                u.first_name,
                u.last_name
            FROM submissions s
            JOIN assignments a ON s.assignment_id = a.id
            JOIN users u ON s.user_dni = u.dni
            WHERE s.dispute_status = 'pending'
            ORDER BY s.submitted_at DESC
        `).all<any>();

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

    const { results } = await env.MIRAI_AI_DB.prepare(`
    SELECT s.id, s.name, s.description, s.course_id, s.created_at,
           uc.title as course_title,
           COUNT(ss.user_dni) as student_count
    FROM sections s
    LEFT JOIN user_courses  uc ON s.course_id = uc.id
    LEFT JOIN section_students ss ON s.id = ss.section_id
    WHERE s.professor_dni = ?
    GROUP BY s.id
    ORDER BY s.created_at DESC
  `).bind(userDni).all<any>();

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

    const isProfessor = await isAuthorizedProfessor(userDni, env);
    return jsonResponse({ is_professor: isProfessor }, 200, corsHeaders);
  }
  // --- NUEVAS RUTAS PARA ADMIN ---

  // 1. Crear Tarea: POST /api/create-assignment
  if (path === '/api/create-assignment' && request.method === 'POST') {
    const userDni = await requireProfessorAuth(request, env, corsHeaders);
    if (!userDni || userDni instanceof Response) return userDni;

    const { title, description, course_id, due_date, section_id, max_score, submission_type } = await request.json<any>();

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
    await env.MIRAI_AI_DB.prepare(`
    INSERT INTO assignments (id, course_id, title, description, due_date, section_id, max_score, submission_type)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, course_id, title, description || '', due_date || null, section_id || null, safeMaxScore, safeSubmissionType).run();

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
            a.section_id, a.created_at, a.submission_type,
            c.title as course_title,
            s.name  as section_name
        FROM assignments a
        JOIN section_students ss ON ss.section_id = a.section_id
        LEFT JOIN user_courses c ON c.id = a.course_id
        LEFT JOIN sections s ON s.id = a.section_id
        WHERE UPPER(ss.user_dni) = UPPER(?)
        UNION
        SELECT DISTINCT
            a.id, a.title, a.description, a.due_date, a.max_score, a.course_id,
            a.section_id, a.created_at, a.submission_type,
            c.title as course_title,
            s.name  as section_name
        FROM assignments a
        JOIN assignment_students ast ON ast.assignment_id = a.id
        LEFT JOIN user_courses c ON c.id = a.course_id
        LEFT JOIN sections s ON s.id = a.section_id
        WHERE UPPER(ast.user_dni) = UPPER(?)
    )
    ORDER BY created_at DESC
`).bind(userDni.toUpperCase(), userDni.toUpperCase()).all<any>();

      // Obtener entregas del estudiante
      const { results: submissions } = await env.MIRAI_AI_DB.prepare(`
            SELECT * FROM submissions WHERE user_dni = ?
        `).bind(userDni.toUpperCase()).all<any>();

      return jsonResponse({ assignments, submissions }, 200, corsHeaders);

    } catch (error) {
      console.error('Error en my-submissions:', error);
      return jsonResponse({ error: 'Error interno' }, 500, corsHeaders);
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
        uc.title    as course_title,
        uc.user_dni as professor_dni,
        s.name      as section_name
    FROM assignments a
    LEFT JOIN user_courses uc ON a.course_id = uc.id
    LEFT JOIN sections     s  ON a.section_id = s.id
    INNER JOIN assignment_students ast ON a.id = ast.assignment_id
    WHERE a.id = ? AND ast.user_dni = ?
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

    } catch (error) {
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
        const imageBytes = new Uint8Array(imageBuffer);
        const imageArray = [...imageBytes];

        console.log(`🖼️ [DEBUG] Imagen cargada: ${imageBuffer.byteLength} bytes, extensión: ${fileExtension}`);

        // Paso 1: Llama 3.2 Vision describe la imagen
        let finalVisionText = '';

        try {
          console.log('🖼️ [DEBUG] Llamando a Llama 3.2 Vision...');
          const visionResponse = await env.AI.run('@cf/meta/llama-3.2-11b-vision-instruct', {
            image: imageArray,
            prompt: 'Describe this image in detail. What objects, colors, shapes, text, and elements do you see? Be very specific about colors, positions, and quantities.',
            max_tokens: 512,
            temperature: 0.3
          });
          console.log('🖼️ [DEBUG] Response completo:', JSON.stringify(visionResponse).substring(0, 500));
          finalVisionText = (visionResponse.response || '').trim();
          if (finalVisionText) {
            console.log(`✅ [DEBUG] Llama Vision respondió: ${finalVisionText.substring(0, 200)}`);
          }
        } catch (visionError) {
          console.error('❌ [DEBUG] Error con Llama Vision:', visionError.message);
        }

        if (!finalVisionText) {
          finalVisionText = 'No se pudo analizar la imagen con el modelo de visión.';
        }

        // Paso 2: DeepSeek evalúa basándose en la descripción del modelo de visión
        const refinePrompt = `Eres un profesor evaluador académico. Un sistema de visión artificial analizó la imagen entregada por un estudiante y generó esta descripción:

DESCRIPCIÓN DE LA IMAGEN: "${finalVisionText}"

TAREA ASIGNADA: ${submissionData.title}
REQUISITOS DE LA TAREA: ${submissionData.description}
PUNTUACIÓN MÁXIMA: ${submissionData.max_score}

INSTRUCCIONES:
1. Compara la descripción de la imagen con los requisitos de la tarea.
2. Si la descripción indica que la imagen NO cumple los requisitos, penaliza fuertemente.
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

        aiContent = await callAI(
          AI_MODEL_PRO,
          [{ role: 'user', content: refinePrompt }],
          { temperature: 0.3, max_tokens: 5000 },
          env
        );

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
          } catch (extractError) {
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

        // 8. Guardar la evaluación en la DB
        await env.MIRAI_AI_DB.prepare(`
          UPDATE submissions 
          SET score = ?, status = 'completed', reviewed_at = datetime('now'), feedback = ?
          WHERE id = ?
      `).bind(finalScore, JSON.stringify(evaluation.feedback), submission_id).run();

        // 9. Devolver la respuesta al frontend
        return jsonResponse({
          success: true,
          score: finalScore,
          max_score: submissionData.max_score,
          feedback: evaluation.feedback,
          reasoning: evaluation.reasoning
        }, 200, corsHeaders);

      } catch (error) {
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

      } catch (error) {
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
        // professor_note recibía finalScore por un copy-paste: es el comentario
        // del profesor (lo que lee /api/professor-disputes), no la nota.
        await env.MIRAI_AI_DB.prepare(`
          UPDATE submissions
          SET score = ?, professor_note = ?, professor_feedback = ?, dispute_status = 'resolved'
          WHERE id = ?
      `).bind(finalScore, feedback || null, feedback || null, submission_id).run();

        return jsonResponse({ success: true, new_score: finalScore }, 200, corsHeaders);

      } catch (error) {
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
          'SELECT id, submission_type FROM assignments WHERE id = ?'
        ).bind(assignmentId).first<any>();
        if (!assignmentData) {
          return jsonResponse({ error: 'Tarea no encontrada' }, 404, corsHeaders);
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

        // Una entrega por alumno y tarea: antes se acumulaban duplicados sin límite.
        const alreadySubmitted = await env.MIRAI_AI_DB.prepare(
          'SELECT id FROM submissions WHERE assignment_id = ? AND UPPER(user_dni) = UPPER(?)'
        ).bind(assignmentId, userDni).first<any>();

        if (alreadySubmitted) {
          return jsonResponse({ error: 'Ya entregaste esta tarea' }, 409, corsHeaders);
        }

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
        const submissionId = crypto.randomUUID();
        await env.MIRAI_AI_DB.prepare(`
          INSERT INTO submissions (id, assignment_id, user_dni, file_url, status, submitted_at)
          VALUES (?, ?, ?, ?, 'pending', datetime('now'))
      `).bind(submissionId, assignmentId, ownerDni, `/api/file/${r2Key}`).run();

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
  } catch (e) {
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
  } catch (e) {
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
  } catch (e) {
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
  } catch (e) {
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
  } catch (e) {
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
  } catch (e) {
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
  } catch (e) {
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
  } catch (e) {
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
  } catch (e) {
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
  } catch (e) {
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
  } catch (e) {
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
  } catch (e) { return jsonResponse({ error: e.message }, 500, corsHeaders); }
}

async function handleAttClassDelete(request: Request, env: Env, corsHeaders: Record<string, string>, classId: string) {
  const { errorResponse } = await attRequireAdmin(request, env, corsHeaders);
  if (errorResponse) return errorResponse;
  try {
    await env.MIRAI_AI_DB.prepare("UPDATE att_classes SET is_active=0 WHERE id=?").bind(classId).run();
    return jsonResponse({ success: true }, 200, corsHeaders);
  } catch (e) { return jsonResponse({ error: e.message }, 500, corsHeaders); }
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
  } catch (e) { return jsonResponse({ error: e.message }, 500, corsHeaders); }
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
    } catch (e) { return jsonResponse({ error: e.message }, 500, corsHeaders); }
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
  } catch (e) { return jsonResponse({ error: e.message }, 500, corsHeaders); }
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
  } catch (e) { return jsonResponse({ error: e.message }, 500, corsHeaders); }
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
  } catch (e) { return jsonResponse({ error: e.message }, 500, corsHeaders); }
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
  } catch (e) { return jsonResponse({ error: e.message }, 500, corsHeaders); }
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
  } catch (e) {
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
  } catch (e) {
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
  } catch (e) {
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

  } catch (error) {
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

  } catch (error) {
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

  } catch (error) {
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
