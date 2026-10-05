/* ============================================
   MIRAI AI - Reportes: gestión, entregas e imágenes

   ============================================ */
import { isAdminUser, requireAuth } from '../lib/auth';
import { jsonResponse, newId, safeJson, strLen } from '../lib/http';
import { isAuthorizedProfessor } from './classroom';

/**
 * Sube una imagen en base64 a R2 y devuelve la URL pública.
 * @param {string} base64DataUrl  - "data:image/jpeg;base64,..."
 * @param {string} reportId
 * @param {string} studentDni
 * @param {Object} env
 * @returns {Promise<string|null>}  URL pública o null si falla
 */
async function uploadReportImage(base64DataUrl, reportId, studentDni, env) {
  try {
    // Extraer mime type y datos
    const match = base64DataUrl.match(/^data:([a-zA-Z0-9+/]+\/[a-zA-Z0-9+/]+);base64,(.+)$/);
    if (!match) return null;

    const mimeType = match[1]; // e.g. "image/jpeg"
    const ext = mimeType.split('/')[1].replace('jpeg', 'jpg'); // jpg | png | webp | gif
    const raw = match[2];

    // Decodificar base64 → Uint8Array
    const binary = atob(raw);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

    // Límite de tamaño: 5 MB
    if (bytes.length > 5 * 1024 * 1024) {
      console.warn(`[Reports] Imagen descartada: ${bytes.length} bytes > 5 MB`);
      return null;
    }

    const imageId = newId();
    const r2Key = `report-images/${reportId}/${studentDni}/${imageId}.${ext}`;

    await env.MIRAI_AI_ASSETS.put(r2Key, bytes, {
      httpMetadata: { contentType: mimeType },
      customMetadata: { reportId, studentDni, uploadedAt: new Date().toISOString() },
    });

    // URL pública — ajusta el dominio a tu worker/R2 custom domain
    return `/api/report-images/${r2Key}`;

  } catch (err) {
    console.error('[Reports] uploadReportImage error:', err.message);
    return null;
  }
}

/**
 * Verifica que el usuario autenticado sea el profesor dueño del reporte.
 * @param {string} reportId
 * @param {string} teacherDni
 * @param {Object} env
 * @returns {Promise<Object|null>}  Row del reporte o null
 */
async function getOwnedReport(reportId, teacherDni, env) {
  return env.MIRAI_AI_DB
    .prepare('SELECT * FROM reports WHERE id = ? AND teacher_dni = ?')
    .bind(reportId, teacherDni)
    .first();
}

/**
 * Devuelve un reporte si el usuario puede gestionarlo:
 * el profesor que lo creó, o cualquier administrador.
 * @param {string} reportId
 * @param {string} userDni
 * @param {boolean} isAdmin
 * @param {Object} env
 * @returns {Promise<Object|null>}
 */
async function getManageableReport(reportId, userDni, isAdmin, env) {
  if (isAdmin) {
    return env.MIRAI_AI_DB.prepare('SELECT * FROM reports WHERE id = ?').bind(reportId).first();
  }
  return getOwnedReport(reportId, userDni, env);
}

/**
 * Autoriza la gestión de reportes: profesores activos o administradores (role='admin').
 * @returns {Promise<{dni:string,isAdmin:boolean}|Response>}
 */
export async function requireReportManagerAuth(request, env, corsHeaders) {
  const userDni = await requireAuth(request, env);
  if (!userDni) {
    return jsonResponse({ error: 'No autorizado. Inicia sesión.' }, 401, corsHeaders);
  }

  const dni = userDni.toUpperCase();
  const row = await env.MIRAI_AI_DB.prepare('SELECT role FROM users WHERE dni = ?').bind(dni).first();
  const isAdmin = row?.role === 'admin';
  const isProfessor = isAdmin ? false : await isAuthorizedProfessor(dni, env);

  if (!isAdmin && !isProfessor) {
    return jsonResponse({ error: 'Acceso denegado. Requiere rol de profesor o administrador.' }, 403, corsHeaders);
  }

  return { dni, isAdmin };
}

/**
 * Carga los DNIs de estudiantes de un conjunto de secciones, agrupados por section_id.
 * @param {string[]} sectionIds
 * @param {Object} env
 * @returns {Promise<Map<string,string[]>>}
 */
async function loadSectionMembersMap(sectionIds, env) {
  const map = new Map();
  if (!sectionIds || sectionIds.length === 0) return map;

  const placeholders = sectionIds.map(() => '?').join(',');
  const { results } = await env.MIRAI_AI_DB
    .prepare(`SELECT section_id, user_dni FROM section_students WHERE section_id IN (${placeholders})`)
    .bind(...sectionIds)
    .all();

  for (const row of results) {
    if (!map.has(row.section_id)) map.set(row.section_id, []);
    map.get(row.section_id).push(row.user_dni);
  }
  return map;
}

/**
 * Determina si un estudiante tiene acceso a un reporte: acceso individual
 * explícito o pertenencia a la sección asignada al reporte.
 * @param {{access_json:string, section_id:string|null}} report
 * @param {string} studentDni
 * @param {Object} env
 * @returns {Promise<boolean>}
 */
async function studentHasReportAccess(report, studentDni, env) {
  const access = safeJson(report.access_json, []);
  if (access.includes(studentDni)) return true;

  if (report.section_id) {
    const row = await env.MIRAI_AI_DB
      .prepare('SELECT 1 FROM section_students WHERE section_id = ? AND user_dni = ?')
      .bind(report.section_id, studentDni)
      .first();
    if (row) return true;
  }

  return false;
}

/**
 * Valida que una sección exista y sea utilizable por el usuario actual
 * (el profesor dueño de la sección, o cualquier administrador).
 * @returns {Promise<string|null>} el section_id validado, o null si no se envió ninguno
 * @throws {Error} si se envió un sectionId pero no es válido/autorizado
 */
async function resolveReportSectionId(sectionId, teacherDni, isAdmin, env) {
  if (!sectionId) return null;

  const query = isAdmin
    ? 'SELECT id FROM sections WHERE id = ?'
    : 'SELECT id FROM sections WHERE id = ? AND professor_dni = ?';
  const params = isAdmin ? [sectionId] : [sectionId, teacherDni];

  const sec = await env.MIRAI_AI_DB.prepare(query).bind(...params).first();
  if (!sec) throw new Error('Sección inválida o no autorizada.');

  return sectionId;
}

// ════════════════════════════════════════════════════════════
// ENDPOINTS — PROFESOR
// ════════════════════════════════════════════════════════════

/**
 * GET /api/reports
 * Lista todos los reportes creados por el profesor autenticado.
 * Respuesta: Report[]
 */
export async function handleReportList(request, env, corsHeaders) {
  // Profesores o administradores
  const auth = await requireReportManagerAuth(request, env, corsHeaders);
  if (auth instanceof Response) return auth;
  const { dni, isAdmin } = auth;

  try {
    const baseQuery = `
      SELECT
        r.id, r.title, r.description, r.icon, r.deadline,
        r.active, r.questions_json, r.access_json, r.section_id, r.teacher_dni,
        s.name AS section_name,
        r.created_at, r.updated_at
      FROM reports r
      LEFT JOIN sections s ON s.id = r.section_id
    `;

    const { results } = isAdmin
      ? await env.MIRAI_AI_DB.prepare(`${baseQuery} ORDER BY r.created_at DESC`).all()
      : await env.MIRAI_AI_DB
          .prepare(`${baseQuery} WHERE r.teacher_dni = ? ORDER BY r.created_at DESC`)
          .bind(dni)
          .all();

    // Resolver acceso efectivo (individual ∪ miembros de la sección asignada)
    const sectionIds = [...new Set(results.map(r => r.section_id).filter(Boolean))];
    const sectionMembers = await loadSectionMembersMap(sectionIds, env);

    // Deserializar campos JSON
    const reports = results.map(r => {
      const individualAccess = safeJson(r.access_json, []);
      const members = r.section_id ? (sectionMembers.get(r.section_id) || []) : [];
      const effectiveAccess = [...new Set([...individualAccess, ...members])];

      return {
        id: r.id,
        title: r.title,
        description: r.description || '',
        icon: r.icon || '📋',
        deadline: r.deadline,
        active: r.active === 1,
        questions: safeJson(r.questions_json, []),
        access: effectiveAccess,
        individualAccess,
        sectionId: r.section_id || null,
        sectionName: r.section_name || null,
        teacherDni: r.teacher_dni,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      };
    });

    return jsonResponse(reports, 200, corsHeaders);

  } catch (err) {
    console.error('[Reports] handleReportList error:', err.message);
    return jsonResponse({ error: 'Error al obtener reportes.' }, 500, corsHeaders);
  }
}

/**
 * POST /api/reports
 * Crea un nuevo reporte.
 * Body: { title, description?, icon?, deadline?, active?, questions[], access[] }
 * Respuesta: { id, ...reporte }
 */
export async function handleReportCreate(request, env, corsHeaders) {
  const auth = await requireReportManagerAuth(request, env, corsHeaders);
  if (auth instanceof Response) return auth;
  const { dni: teacherDni, isAdmin } = auth;

  let body;
  try { body = await request.json(); }
  catch { return jsonResponse({ error: 'JSON inválido.' }, 400, corsHeaders); }

  const { title, description, icon, deadline, active, questions, access, sectionId } = body;

  // Validaciones
  if (!strLen(title, 1, 120)) {
    return jsonResponse({ error: 'El título es obligatorio (máx. 120 caracteres).' }, 400, corsHeaders);
  }

  const parsedQuestions = Array.isArray(questions) ? questions : [];
  if (parsedQuestions.length === 0) {
    return jsonResponse({ error: 'El reporte debe tener al menos una pregunta.' }, 400, corsHeaders);
  }

  // Validar cada pregunta
  const validTypes = ['text', 'select', 'time', 'date', 'image'];
  for (const q of parsedQuestions) {
    if (!validTypes.includes(q.type)) {
      return jsonResponse({ error: `Tipo de pregunta inválido: "${q.type}".` }, 400, corsHeaders);
    }
    if (!strLen(q.label, 1, 300)) {
      return jsonResponse({ error: 'Cada pregunta debe tener un texto (máx. 300 chars).' }, 400, corsHeaders);
    }
    if (q.type === 'select' && (!Array.isArray(q.options) || q.options.filter(Boolean).length < 2)) {
      return jsonResponse({ error: `La pregunta "${q.label}" requiere al menos 2 opciones.` }, 400, corsHeaders);
    }
  }

  // Validar sección de asignación (opcional)
  let validSectionId = null;
  try {
    validSectionId = await resolveReportSectionId(sectionId, teacherDni, isAdmin, env);
  } catch (err) {
    return jsonResponse({ error: err.message }, 403, corsHeaders);
  }

  const parsedAccess = Array.isArray(access) ? access : [];
  const id = newId();
  const now = new Date().toISOString();
  const activeValue = active === false ? 0 : 1;

  try {
    await env.MIRAI_AI_DB
      .prepare(`
        INSERT INTO reports
          (id, teacher_dni, title, description, icon, deadline, active,
           questions_json, access_json, section_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        id,
        teacherDni,
        title.trim(),
        (description || '').trim(),
        icon || '📋',
        deadline || null,
        activeValue,
        JSON.stringify(parsedQuestions),
        JSON.stringify(parsedAccess),
        validSectionId,
        now,
        now,
      )
      .run();

    return jsonResponse({
      id,
      title: title.trim(),
      description: (description || '').trim(),
      icon: icon || '📋',
      deadline: deadline || null,
      active: activeValue === 1,
      questions: parsedQuestions,
      access: parsedAccess,
      individualAccess: parsedAccess,
      sectionId: validSectionId,
      createdAt: now,
      updatedAt: now,
    }, 201, corsHeaders);

  } catch (err) {
    console.error('[Reports] handleReportCreate error:', err.message);
    return jsonResponse({ error: 'Error al crear el reporte.' }, 500, corsHeaders);
  }
}

/**
 * PUT /api/reports/:id
 * Actualiza un reporte existente (cualquier campo es opcional).
 * Body: Partial<{ title, description, icon, deadline, active, questions[], access[] }>
 * Respuesta: { ok: true }
 */
export async function handleReportUpdate(request, env, corsHeaders, reportId) {
  const auth = await requireReportManagerAuth(request, env, corsHeaders);
  if (auth instanceof Response) return auth;
  const { dni: userDni, isAdmin } = auth;

  if (!reportId) return jsonResponse({ error: 'ID de reporte requerido.' }, 400, corsHeaders);

  // Verificar que puede gestionarlo (dueño, o administrador)
  const existing = await getManageableReport(reportId, userDni, isAdmin, env);
  if (!existing) return jsonResponse({ error: 'Reporte no encontrado o acceso denegado.' }, 404, corsHeaders);

  let body;
  try { body = await request.json(); }
  catch { return jsonResponse({ error: 'JSON inválido.' }, 400, corsHeaders); }

  // Construir SET dinámico con solo los campos enviados
  const fields = [];
  const values = [];

  if (body.title !== undefined) {
    if (!strLen(body.title, 1, 120)) {
      return jsonResponse({ error: 'El título es obligatorio (máx. 120 caracteres).' }, 400, corsHeaders);
    }
    fields.push('title = ?');
    values.push(body.title.trim());
  }

  if (body.description !== undefined) {
    fields.push('description = ?');
    values.push((body.description || '').trim());
  }

  if (body.icon !== undefined) {
    fields.push('icon = ?');
    values.push(body.icon || '📋');
  }

  if (body.deadline !== undefined) {
    fields.push('deadline = ?');
    values.push(body.deadline || null);
  }

  if (body.active !== undefined) {
    fields.push('active = ?');
    values.push(body.active ? 1 : 0);
  }

  if (body.questions !== undefined) {
    const qs = Array.isArray(body.questions) ? body.questions : [];
    if (qs.length === 0) {
      return jsonResponse({ error: 'El reporte debe tener al menos una pregunta.' }, 400, corsHeaders);
    }
    fields.push('questions_json = ?');
    values.push(JSON.stringify(qs));
  }

  if (body.access !== undefined) {
    fields.push('access_json = ?');
    values.push(JSON.stringify(Array.isArray(body.access) ? body.access : []));
  }

  if (body.sectionId !== undefined) {
    let validSectionId = null;
    try {
      validSectionId = await resolveReportSectionId(body.sectionId, existing.teacher_dni, isAdmin, env);
    } catch (err) {
      return jsonResponse({ error: err.message }, 403, corsHeaders);
    }
    fields.push('section_id = ?');
    values.push(validSectionId);
  }

  if (fields.length === 0) {
    return jsonResponse({ error: 'No se enviaron campos para actualizar.' }, 400, corsHeaders);
  }

  fields.push('updated_at = ?');
  values.push(new Date().toISOString());
  values.push(reportId);

  try {
    await env.MIRAI_AI_DB
      .prepare(`UPDATE reports SET ${fields.join(', ')} WHERE id = ?`)
      .bind(...values)
      .run();

    return jsonResponse({ ok: true }, 200, corsHeaders);

  } catch (err) {
    console.error('[Reports] handleReportUpdate error:', err.message);
    return jsonResponse({ error: 'Error al actualizar el reporte.' }, 500, corsHeaders);
  }
}

/**
 * DELETE /api/reports/:id
 * Elimina un reporte y todas sus respuestas (ON DELETE CASCADE en D1).
 * Respuesta: { ok: true }
 */
export async function handleReportDelete(request, env, corsHeaders, reportId) {
  const auth = await requireReportManagerAuth(request, env, corsHeaders);
  if (auth instanceof Response) return auth;
  const { dni: teacherDni, isAdmin } = auth;

  if (!reportId) return jsonResponse({ error: 'ID de reporte requerido.' }, 400, corsHeaders);

  const existing = await getManageableReport(reportId, teacherDni, isAdmin, env);
  if (!existing) return jsonResponse({ error: 'Reporte no encontrado o acceso denegado.' }, 404, corsHeaders);

  try {
    // Las submissions se eliminan en cascada por FK (ON DELETE CASCADE)
    // Si D1 no lo soporta en tu versión, descomenta la línea de abajo:
    // await env.MIRAI_AI_DB.prepare('DELETE FROM report_submissions WHERE report_id = ?').bind(reportId).run();

    await env.MIRAI_AI_DB
      .prepare('DELETE FROM reports WHERE id = ?')
      .bind(reportId)
      .run();

    // Limpiar imágenes en R2 (best-effort, no bloquea la respuesta)
    try {
      const listed = await env.MIRAI_AI_ASSETS.list({ prefix: `report-images/${reportId}/` });
      for (const obj of listed.objects) {
        await env.MIRAI_AI_ASSETS.delete(obj.key);
      }
    } catch (r2Err) {
      console.warn('[Reports] R2 cleanup parcial:', r2Err.message);
    }

    return jsonResponse({ ok: true }, 200, corsHeaders);

  } catch (err) {
    console.error('[Reports] handleReportDelete error:', err.message);
    return jsonResponse({ error: 'Error al eliminar el reporte.' }, 500, corsHeaders);
  }
}

/**
 * GET /api/reports/:id/submissions
 * Devuelve todas las respuestas enviadas para un reporte,
 * incluyendo nombre del estudiante.
 * Respuesta: Submission[]
 */
export async function handleReportSubmissions(request, env, corsHeaders, reportId) {
  const auth = await requireReportManagerAuth(request, env, corsHeaders);
  if (auth instanceof Response) return auth;
  const { dni: teacherDni, isAdmin } = auth;

  if (!reportId) return jsonResponse({ error: 'ID de reporte requerido.' }, 400, corsHeaders);

  const existing = await getManageableReport(reportId, teacherDni, isAdmin, env);
  if (!existing) return jsonResponse({ error: 'Reporte no encontrado o acceso denegado.' }, 404, corsHeaders);

  try {
    const { results } = await env.MIRAI_AI_DB
      .prepare(`
        SELECT
          rs.id,
          rs.report_id  AS reportId,
          rs.student_dni AS studentId,
          u.first_name || ' ' || u.last_name AS studentName,
          rs.answers_json,
          rs.submitted_at AS submittedAt
        FROM report_submissions rs
        JOIN users u ON rs.student_dni = u.dni
        WHERE rs.report_id = ?
        ORDER BY rs.submitted_at DESC
      `)
      .bind(reportId)
      .all();

    const submissions = results.map(s => ({
      id: s.id,
      reportId: s.reportId,
      studentId: s.studentId,
      studentName: s.studentName,
      answers: safeJson(s.answers_json, {}),
      submittedAt: s.submittedAt,
    }));

    return jsonResponse(submissions, 200, corsHeaders);

  } catch (err) {
    console.error('[Reports] handleReportSubmissions error:', err.message);
    return jsonResponse({ error: 'Error al obtener respuestas.' }, 500, corsHeaders);
  }
}

/**
 * GET /api/report-images/:key*
 * Sirve una imagen almacenada en R2 bajo el prefijo report-images/.
 * Añadir también en handleApiRequest():
 *   if (path.startsWith('/api/report-images/') && request.method === 'GET')
 *     return handleReportImageServe(request, env, corsHeaders, path.replace('/api/report-images/', ''));
 */
export async function handleReportImageServe(request, env, corsHeaders, r2Key) {
  if (!r2Key) return jsonResponse({ error: 'Clave de imagen requerida.' }, 400, corsHeaders);

  try {
    const key = decodeURIComponent(r2Key);

    // Antes esta ruta servía cualquier clave bajo report-images/ sin sesión, así
    // que las fotos que los alumnos suben en sus reportes eran públicas.
    const requesterDni = await requireAuth(request, env);
    if (!requesterDni) return jsonResponse({ error: 'No autorizado.' }, 401, corsHeaders);

    // Las claves tienen la forma report-images/<reportId>/<studentDni>/<id>.<ext>
    const parts = key.split('/');
    if (parts[0] !== 'report-images' || parts.length < 4) {
      return jsonResponse({ error: 'Clave de imagen inválida.' }, 400, corsHeaders);
    }
    const [, reportId, ownerDni] = parts;

    let allowed = ownerDni.toUpperCase() === requesterDni.toUpperCase();
    if (!allowed) {
      // El profesor dueño del reporte (o un admin) también puede verla.
      const isAdmin = await isAdminUser(requesterDni, env);
      const report = await getManageableReport(reportId, requesterDni.toUpperCase(), isAdmin, env);
      allowed = !!report;
    }
    if (!allowed) return jsonResponse({ error: 'No tienes acceso a esta imagen.' }, 403, corsHeaders);

    const obj = await env.MIRAI_AI_ASSETS.get(key);
    if (!obj) return jsonResponse({ error: 'Imagen no encontrada.' }, 404, corsHeaders);

    const headers = new Headers();
    obj.writeHttpMetadata(headers);
    // Contenido con permisos: cacheable solo en el navegador del usuario.
    headers.set('Cache-Control', 'private, max-age=3600');

    return new Response(obj.body, { headers });

  } catch (err) {
    console.error('[Reports] handleReportImageServe error:', err.message);
    return jsonResponse({ error: 'Error al servir la imagen.' }, 500, corsHeaders);
  }
}

// ════════════════════════════════════════════════════════════
// ENDPOINT — LISTA DE ESTUDIANTES (para el panel de acceso)
// ════════════════════════════════════════════════════════════

/**
 * GET /api/students
 * Devuelve todos los usuarios verificados (estudiantes, profesores y admins),
 * ya que cualquiera de los 3 roles puede recibir acceso individual a un reporte.
 * Solo accesible para profesores o administradores.
 * Respuesta: { id, name, email }[]
 */
export async function handleStudentList(request, env, corsHeaders) {
  const auth = await requireReportManagerAuth(request, env, corsHeaders);
  if (auth instanceof Response) return auth;

  try {
    const { results } = await env.MIRAI_AI_DB
      .prepare(`
        SELECT
          u.dni        AS id,
          u.first_name || ' ' || u.last_name AS name,
          u.email
        FROM users u
        WHERE u.is_verified = 1
        ORDER BY u.last_name, u.first_name
      `)
      .all();

    return jsonResponse(results, 200, corsHeaders);

  } catch (err) {
    console.error('[Reports] handleStudentList error:', err.message);
    return jsonResponse({ error: 'Error al obtener estudiantes.' }, 500, corsHeaders);
  }
}

/**
 * GET /api/report-sections
 * Devuelve las secciones disponibles para asignar un reporte completo:
 * el profesor ve solo las suyas, el administrador las ve todas.
 * Respuesta: { id, name, course_id, course_title, student_count }[]
 */
export async function handleReportSections(request, env, corsHeaders) {
  const auth = await requireReportManagerAuth(request, env, corsHeaders);
  if (auth instanceof Response) return auth;
  const { dni, isAdmin } = auth;

  try {
    const baseQuery = `
      SELECT s.id, s.name, s.course_id, uc.title AS course_title,
             COUNT(ss.user_dni) AS student_count
      FROM sections s
      LEFT JOIN user_courses uc ON s.course_id = uc.id
      LEFT JOIN section_students ss ON s.id = ss.section_id
    `;

    const { results } = isAdmin
      ? await env.MIRAI_AI_DB.prepare(`${baseQuery} GROUP BY s.id ORDER BY s.name`).all()
      : await env.MIRAI_AI_DB
          .prepare(`${baseQuery} WHERE s.professor_dni = ? GROUP BY s.id ORDER BY s.name`)
          .bind(dni)
          .all();

    return jsonResponse(results, 200, corsHeaders);

  } catch (err) {
    console.error('[Reports] handleReportSections error:', err.message);
    return jsonResponse({ error: 'Error al obtener secciones.' }, 500, corsHeaders);
  }
}

// ════════════════════════════════════════════════════════════
// ENDPOINTS — ESTUDIANTE
// ════════════════════════════════════════════════════════════

/**
 * GET /api/my-reports
 * Devuelve los reportes activos a los que el estudiante autenticado tiene acceso,
 * junto con el estado de envío.
 * Respuesta: (Report & { submitted: boolean, submittedAt?: string })[]
 */
export async function handleMyReports(request, env, corsHeaders) {
  const studentDni = await requireAuth(request, env);
  if (!studentDni) return jsonResponse({ error: 'No autorizado.' }, 401, corsHeaders);

  try {
    // Obtener todos los reportes activos
    const { results } = await env.MIRAI_AI_DB
      .prepare(`
        SELECT
          r.id, r.title, r.description, r.icon,
          r.deadline, r.questions_json, r.access_json, r.section_id
        FROM reports r
        WHERE r.active = 1
        ORDER BY r.created_at DESC
      `)
      .all();

    // Secciones a las que pertenece el estudiante (acceso por sección)
    const { results: mySections } = await env.MIRAI_AI_DB
      .prepare('SELECT section_id FROM section_students WHERE user_dni = ?')
      .bind(studentDni)
      .all();
    const mySectionIds = new Set(mySections.map(s => s.section_id));

    // Filtrar los reportes donde el estudiante tiene acceso individual o por sección
    const accessible = results.filter(r => {
      const access = safeJson(r.access_json, []);
      if (access.includes(studentDni)) return true;
      return !!(r.section_id && mySectionIds.has(r.section_id));
    });

    if (accessible.length === 0) {
      return jsonResponse([], 200, corsHeaders);
    }

    // Obtener envíos del estudiante en batch
    const reportIds = accessible.map(r => `'${r.id.replace(/'/g, "''")}'`).join(',');
    const { results: subs } = await env.MIRAI_AI_DB
      .prepare(`
        SELECT report_id, submitted_at
        FROM report_submissions
        WHERE student_dni = ?
          AND report_id IN (${reportIds})
      `)
      .bind(studentDni)
      .all();

    const submissionMap = new Map(subs.map(s => [s.report_id, s.submitted_at]));

    const myReports = accessible.map(r => ({
      id: r.id,
      title: r.title,
      description: r.description || '',
      icon: r.icon || '📋',
      deadline: r.deadline,
      questions: safeJson(r.questions_json, []),
      submitted: submissionMap.has(r.id),
      submittedAt: submissionMap.get(r.id) || null,
    }));

    return jsonResponse(myReports, 200, corsHeaders);

  } catch (err) {
    console.error('[Reports] handleMyReports error:', err.message);
    return jsonResponse({ error: 'Error al obtener tus reportes.' }, 500, corsHeaders);
  }
}

/**
 * GET /api/my-reports/:id/submission
 * Devuelve la respuesta previa del estudiante para un reporte (borrador o enviado).
 * Útil para pre-rellenar el formulario.
 * Respuesta: { answers: { [qId]: any } } | 404
 */
export async function handleMySubmission(request, env, corsHeaders, reportId) {
  const studentDni = await requireAuth(request, env);
  if (!studentDni) return jsonResponse({ error: 'No autorizado.' }, 401, corsHeaders);

  if (!reportId) return jsonResponse({ error: 'ID de reporte requerido.' }, 400, corsHeaders);

  try {
    // Verificar que el estudiante tiene acceso al reporte
    const report = await env.MIRAI_AI_DB
      .prepare('SELECT access_json, section_id FROM reports WHERE id = ? AND active = 1')
      .bind(reportId)
      .first();

    if (!report) return jsonResponse({ error: 'Reporte no encontrado.' }, 404, corsHeaders);

    if (!(await studentHasReportAccess(report, studentDni, env))) {
      return jsonResponse({ error: 'No tienes acceso a este reporte.' }, 403, corsHeaders);
    }

    // Buscar respuesta previa
    const submission = await env.MIRAI_AI_DB
      .prepare(`
        SELECT answers_json, submitted_at
        FROM report_submissions
        WHERE report_id = ? AND student_dni = ?
      `)
      .bind(reportId, studentDni)
      .first();

    if (!submission) return jsonResponse({ error: 'Sin respuesta previa.' }, 404, corsHeaders);

    return jsonResponse({
      answers: safeJson(submission.answers_json, {}),
      submittedAt: submission.submitted_at,
    }, 200, corsHeaders);

  } catch (err) {
    console.error('[Reports] handleMySubmission error:', err.message);
    return jsonResponse({ error: 'Error al obtener tu respuesta.' }, 500, corsHeaders);
  }
}

/**
 * POST /api/my-reports/:id/submit
 * Envía las respuestas de un estudiante para un reporte.
 * Body: { answers: { [questionId]: string | string[] } }
 *
 * Las imágenes deben viajar como array de base64 data URLs:
 *   answers["q5"] = ["data:image/jpeg;base64,...", "data:image/png;base64,..."]
 * El worker las sube a R2 y reemplaza los valores por URLs públicas.
 *
 * Respuesta: { ok: true, submittedAt: string }
 */
export async function handleReportSubmit(request, env, corsHeaders, reportId) {
  const studentDni = await requireAuth(request, env);
  if (!studentDni) return jsonResponse({ error: 'No autorizado.' }, 401, corsHeaders);

  if (!reportId) return jsonResponse({ error: 'ID de reporte requerido.' }, 400, corsHeaders);

  let body;
  try { body = await request.json(); }
  catch { return jsonResponse({ error: 'JSON inválido.' }, 400, corsHeaders); }

  const { answers } = body;
  if (!answers || typeof answers !== 'object') {
    return jsonResponse({ error: 'El campo "answers" es requerido.' }, 400, corsHeaders);
  }

  try {
    // ── 1. Verificar que el reporte existe, está activo y el alumno tiene acceso ──
    const report = await env.MIRAI_AI_DB
      .prepare('SELECT id, questions_json, access_json, section_id, deadline FROM reports WHERE id = ? AND active = 1')
      .bind(reportId)
      .first();

    if (!report) {
      return jsonResponse({ error: 'Reporte no encontrado o inactivo.' }, 404, corsHeaders);
    }

    if (!(await studentHasReportAccess(report, studentDni, env))) {
      return jsonResponse({ error: 'No tienes acceso a este reporte.' }, 403, corsHeaders);
    }

    // La fecha límite se guardaba y se pintaba en la tarjeta, pero nunca se
    // comprobaba al enviar: se podía entregar semanas después de vencida.
    // deadline es YYYY-MM-DD e incluye el día entero.
    if (report.deadline) {
      const today = new Date().toISOString().slice(0, 10);
      if (today > report.deadline) {
        return jsonResponse({
          error: `El plazo para este reporte venció el ${report.deadline}.`
        }, 403, corsHeaders);
      }
    }

    // ── 2. Verificar que no lo haya enviado ya ─────────────────────────────────
    const existing = await env.MIRAI_AI_DB
      .prepare('SELECT id FROM report_submissions WHERE report_id = ? AND student_dni = ?')
      .bind(reportId, studentDni)
      .first();

    if (existing) {
      return jsonResponse({ error: 'Ya enviaste este reporte.' }, 409, corsHeaders);
    }

    // ── 3. Validar que todas las preguntas estén respondidas ───────────────────
    const questions = safeJson(report.questions_json, []);
    const missingLabels = [];

    for (const q of questions) {
      const val = answers[q.id];
      const isEmpty = val === undefined
        || val === null
        || val === ''
        || (Array.isArray(val) && val.length === 0);

      if (isEmpty) missingLabels.push(q.label || q.id);
    }

    if (missingLabels.length > 0) {
      return jsonResponse({
        error: `Faltan respuestas para: ${missingLabels.join(', ')}`,
      }, 422, corsHeaders);
    }

    // ── 4. Procesar imágenes: subir a R2 y reemplazar base64 por URLs ──────────
    const processedAnswers = { ...answers };

    for (const q of questions) {
      if (q.type !== 'image') continue;

      const raw = answers[q.id];
      const dataUrls = Array.isArray(raw) ? raw : (raw ? [raw] : []);

      if (dataUrls.length === 0) continue;

      const urls = [];
      for (const dataUrl of dataUrls) {
        if (typeof dataUrl !== 'string') continue;

        // Si ya es una URL (no base64), pasarla tal cual
        if (!dataUrl.startsWith('data:')) {
          urls.push(dataUrl);
          continue;
        }

        const publicUrl = await uploadReportImage(dataUrl, reportId, studentDni, env);
        if (publicUrl) urls.push(publicUrl);
      }

      processedAnswers[q.id] = urls;
    }

    // ── 5. Guardar en D1 ───────────────────────────────────────────────────────
    const submissionId = newId();
    const submittedAt = new Date().toISOString();

    await env.MIRAI_AI_DB
      .prepare(`
        INSERT INTO report_submissions (id, report_id, student_dni, answers_json, submitted_at)
        VALUES (?, ?, ?, ?, ?)
      `)
      .bind(
        submissionId,
        reportId,
        studentDni,
        JSON.stringify(processedAnswers),
        submittedAt,
      )
      .run();

    return jsonResponse({ ok: true, submittedAt }, 201, corsHeaders);

  } catch (err) {
    // Manejo de UNIQUE constraint si ya existe una fila (race condition)
    if (err.message?.includes('UNIQUE constraint failed')) {
      return jsonResponse({ error: 'Ya enviaste este reporte.' }, 409, corsHeaders);
    }
    console.error('[Reports] handleReportSubmit error:', err.message);
    return jsonResponse({ error: 'Error al enviar el reporte.' }, 500, corsHeaders);
  }
}
