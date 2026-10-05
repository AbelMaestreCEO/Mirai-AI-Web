/* ============================================
   MIRAI AI - Sincronización por polling (/api/sync/poll)

   ============================================ */
import { requireAuth } from '../lib/auth';
import { jsonResponse } from '../lib/http';

export async function handleSyncPoll(request, env, corsHeaders) {
  try {
    const userDni = await requireAuth(request, env);
    if (!userDni) {
      return jsonResponse({ error: 'No autorizado' }, 401, corsHeaders);
    }

    const url = new URL(request.url);
    const sinceRaw = url.searchParams.get('since') || new Date(0).toISOString();
    // D1/SQLite guarda fechas sin T ni Z ("2026-06-06 03:56:28").
    // El cliente envía ISO 8601 con T y Z — la T rompe la comparación de strings en SQLite.
    const since = sinceRaw.replace('T', ' ').replace('Z', '').split('.')[0];
    const modules = (url.searchParams.get('modules') || '').split(',').filter(Boolean);
    const newTs = new Date().toISOString();

    // Leer el rol real desde la DB (no confiar en el cliente)
    const userRow = await env.MIRAI_AI_DB.prepare(
      "SELECT role FROM users WHERE dni = ?"
    ).bind(userDni).first();
    const role = userRow?.role || 'student';

    // También verificar si es profesor aunque su rol sea 'student'
    const isProfRow = await env.MIRAI_AI_DB.prepare(
      "SELECT dni FROM professors WHERE dni = ? AND is_active = 1"
    ).bind(userDni).first();
    const effectiveRole = isProfRow ? 'teacher' : role;

    const changes: Record<string, any> = {};

    // ── INVENTORY ──────────────────────────────────────────────
    // Tablas: inventory_products, inventory_logs
    // updated_at existe en inventory_products ✓
    if (modules.includes('inventory')) {
      const products = await env.MIRAI_AI_DB.prepare(`
        SELECT id, name, sku, category, quantity, unit_price,
               ai_description, ai_tags, ai_confidence, photo_r2_key,
               demand_score, predicted_restock_date,
               created_at, updated_at, user_dni
        FROM   inventory_products
        WHERE  updated_at > ? AND user_dni = ?
        ORDER  BY updated_at DESC
        LIMIT  50
      `).bind(since, userDni).all();

      // Logs recientes de inventario
      const logs = await env.MIRAI_AI_DB.prepare(`
        SELECT il.id, il.product_id, il.type, il.quantity_change,
               il.notes, il.created_at, ip.name as product_name
        FROM   inventory_logs il
        JOIN   inventory_products ip ON ip.id = il.product_id
        WHERE  il.created_at > ? AND ip.user_dni = ?
        ORDER  BY il.created_at DESC
        LIMIT  20
      `).bind(since, userDni).all();

      changes.inventory = {
        products: products.results || [],
        logs: logs.results || []
      };
    }

    // ── CLASSROOM ──────────────────────────────────────────────
    // Tablas: sections (sin updated_at → usar created_at),
    //         section_students, assignments, submissions
    if (modules.includes('classroom')) {
      const isTeacherOrAdmin = effectiveRole === 'teacher' || effectiveRole === 'admin';

      if (isTeacherOrAdmin) {
        // Profesor: secciones que creó.
        // Antes esta consulta era una copia de la del estudiante (JOIN contra
        // section_students con ss.user_dni = ?), así que devolvía las secciones
        // donde el PROFESOR estuviera inscrito como alumno — es decir, ninguna.
        const sections = await env.MIRAI_AI_DB.prepare(`
          SELECT s.id, s.name, s.course_id, s.description, s.created_at,
                 p.full_name AS professor_name
          FROM   sections s
          LEFT JOIN professors p ON p.dni = s.professor_dni
          WHERE  s.professor_dni = ? AND s.created_at > ?
          ORDER  BY s.created_at DESC
          LIMIT  20
        `).bind(userDni, since).all();

        // Tareas nuevas/modificadas
        const assignments = await env.MIRAI_AI_DB.prepare(`
          SELECT a.id, a.course_id, a.title, a.description,
                 a.file_url, a.due_date, a.max_score,
                 a.created_at, a.section_id
          FROM   assignments a
          JOIN   sections s ON s.id = a.section_id
          WHERE  s.professor_dni = ? AND a.created_at > ?
          ORDER  BY a.created_at DESC
          LIMIT  20
        `).bind(userDni, since).all();

        // Entregas nuevas para calificar.
        // Igual que arriba, el filtro era sub.user_dni = ? (las entregas DEL
        // profesor) en vez de las entregas de sus alumnos. Se resuelve subiendo
        // por la tarea hasta el curso del profesor.
        const submissions = await env.MIRAI_AI_DB.prepare(`
          SELECT sub.id, sub.assignment_id, sub.status,
                 sub.submitted_at, sub.score,
                 sub.feedback, sub.dispute_status,
                 sub.user_dni AS student_dni,
                 a.title AS assignment_title
          FROM   submissions sub
          JOIN   assignments a   ON a.id = sub.assignment_id
          JOIN   user_courses uc ON uc.id = a.course_id
          WHERE  uc.user_dni = ? AND sub.submitted_at > ?
          ORDER  BY sub.submitted_at DESC
          LIMIT  20
        `).bind(userDni, since).all();

        changes.classroom = {
          sections: sections.results || [],
          assignments: assignments.results || [],
          submissions: submissions.results || []
        };

      } else {
        // Estudiante: secciones donde está inscrito
        const sections = await env.MIRAI_AI_DB.prepare(`
          SELECT s.id, s.name, s.course_id, s.description, s.created_at,
                 p.full_name AS professor_name
          FROM   sections s
          JOIN   section_students ss ON ss.section_id = s.id
          LEFT JOIN professors p     ON p.dni = s.professor_dni
          WHERE  ss.user_dni = ? AND s.created_at > ?
          ORDER  BY s.created_at DESC
          LIMIT  20
        `).bind(userDni, since).all();

        const assignments = await env.MIRAI_AI_DB.prepare(`
          SELECT a.id, a.title, a.description, a.file_url,
                 a.due_date, a.max_score, a.created_at, a.section_id
          FROM   assignments a
          JOIN   section_students ss ON ss.section_id = a.section_id
          WHERE  ss.user_dni = ? AND a.created_at > ?
          ORDER  BY a.created_at DESC
          LIMIT  20
        `).bind(userDni, since).all();

        const submissions = await env.MIRAI_AI_DB.prepare(`
          SELECT sub.id, sub.assignment_id, sub.status,
                 sub.submitted_at, sub.score,
                 sub.feedback, sub.dispute_status,
                 a.title AS assignment_title
          FROM   submissions sub
          JOIN   assignments a ON a.id = sub.assignment_id
          WHERE  sub.user_dni = ? AND sub.submitted_at > ?
          ORDER  BY sub.submitted_at DESC
          LIMIT  20
        `).bind(userDni, since).all();

        changes.classroom = {
          sections: sections.results || [],
          assignments: assignments.results || [],
          submissions: submissions.results || []
        };
      }
    }

    // ── ATTENDANCE ─────────────────────────────────────────────
    // Tablas: att_records, att_qr_sessions, att_classes, att_staff
    if (modules.includes('attendance')) {
      const isAdmin = effectiveRole === 'admin' || effectiveRole === 'teacher';

      if (isAdmin) {
        // Admin/profesor: todos los registros de sus clases
        const records = await env.MIRAI_AI_DB.prepare(`
          SELECT ar.id, ar.session_id, ar.staff_id, ar.type,
                 ar.date, ar.time, ar.created_at,
                 ast.name AS staff_name, ast.department,
                 ac.name AS class_name
          FROM   att_records ar
          JOIN   att_staff   ast ON ast.id   = ar.staff_id
          JOIN   att_qr_sessions qs ON qs.id = ar.session_id
          JOIN   att_classes ac  ON ac.id    = qs.class_id
          WHERE  ar.created_at > ? AND ac.created_by = ?
          ORDER  BY ar.created_at DESC
          LIMIT  100
        `).bind(since, userDni).all();

        // Sesiones QR activas
        const sessions = await env.MIRAI_AI_DB.prepare(`
          SELECT qs.id, qs.token, qs.date, qs.expires_at,
                 qs.scan_count, qs.class_id, qs.created_at,
                 ac.name AS class_name
          FROM   att_qr_sessions qs
          JOIN   att_classes ac ON ac.id = qs.class_id
          WHERE  qs.created_at > ? AND qs.created_by = ?
          ORDER  BY qs.created_at DESC
          LIMIT  20
        `).bind(since, userDni).all();

        changes.attendance = {
          records: records.results || [],
          sessions: sessions.results || []
        };

      } else {
        // Estudiante/staff: sus propios registros
        // Buscar por DNI en att_staff
        const staffRow = await env.MIRAI_AI_DB.prepare(
          `SELECT id FROM att_staff WHERE dni = ? LIMIT 1`
        ).bind(userDni).first();

        if (staffRow) {
          const records = await env.MIRAI_AI_DB.prepare(`
            SELECT ar.id, ar.session_id, ar.type, ar.date,
                   ar.time, ar.created_at, ac.name AS class_name
            FROM   att_records ar
            JOIN   att_qr_sessions qs ON qs.id = ar.session_id
            JOIN   att_classes ac     ON ac.id  = qs.class_id
            WHERE  ar.staff_id = ? AND ar.created_at > ?
            ORDER  BY ar.created_at DESC
            LIMIT  50
          `).bind(staffRow.id, since).all();
          changes.attendance = { records: records.results || [], sessions: [] };
        } else {
          changes.attendance = { records: [], sessions: [] };
        }
      }
    }

    // ── DIET ───────────────────────────────────────────────────
    // Tablas: diet_data (kv), diet_history
    if (modules.includes('diet')) {
      // diet_data: registros clave-valor del usuario actualizados
      const data = await env.MIRAI_AI_DB.prepare(`
        SELECT data_key, data_json, updated_at
        FROM   diet_data
        WHERE  user_dni = ? AND updated_at > ?
        ORDER  BY updated_at DESC
      `).bind(userDni, since).all();

      // diet_history: entradas de días recientes
      const history = await env.MIRAI_AI_DB.prepare(`
        SELECT id, date, total_kcal, total_prot,
               total_carb, total_fat, entries_json, created_at
        FROM   diet_history
        WHERE  user_dni = ? AND created_at > ?
        ORDER  BY created_at DESC
        LIMIT  7
      `).bind(userDni, since).all();

      changes.diet = {
        data: data.results || [],
        history: history.results || []
      };
    }

    // ── TASKS ──────────────────────────────────────────────────
    // Tabla: tasks (tiene updated_at ✓, lat/lng para mapa)
    if (modules.includes('tasks')) {
      const tasks = await env.MIRAI_AI_DB.prepare(`
        SELECT id, title, description, status, priority,
               assignee, tag, due_date, estimated_time,
               progress, project, done,
               lat, lng, location_label,
               created_at, updated_at
        FROM   tasks
        WHERE  user_dni = ? AND updated_at > ?
        ORDER  BY updated_at DESC
        LIMIT  50
      `).bind(userDni, since).all();

      changes.tasks = tasks.results || [];
    }

    // ── LOCATION ───────────────────────────────────────────────
    // Tabla: location_markers
    if (modules.includes('location')) {
      const isAdmin = effectiveRole === 'admin';
      let markers;

      if (isAdmin) {
        // Admin ve todos los marcadores
        markers = await env.MIRAI_AI_DB.prepare(`
          SELECT lm.id, lm.user_dni, lm.title, lm.description,
                 lm.lat, lm.lng, COALESCE(lm.images, '[]') AS images, lm.created_at,
                 u.first_name, u.last_name
          FROM   location_markers lm
          JOIN   users u ON u.dni = lm.user_dni
          WHERE  lm.created_at > ?
          ORDER  BY lm.created_at DESC
          LIMIT  100
        `).bind(since).all();
      } else {
        markers = await env.MIRAI_AI_DB.prepare(`
          SELECT id, user_dni, title, description,
                 lat, lng, COALESCE(images, '[]') AS images, created_at
          FROM   location_markers
          WHERE  user_dni = ? AND created_at > ?
          ORDER  BY created_at DESC
          LIMIT  50
        `).bind(userDni, since).all();
      }

      changes.location = markers.results || [];
    }

    // ── COURSES ────────────────────────────────────────────────
    // Tablas: courses, lessons, categories, subcategories
    if (modules.includes('courses')) {
      const courses = await env.MIRAI_AI_DB.prepare(`
        SELECT id, title, description, subcategory, language,
               level, lessons, duration, icon, category,
               created_at, updated_at
        FROM   courses
        WHERE  updated_at > ?
        ORDER  BY updated_at DESC
        LIMIT  30
      `).bind(since).all();

      const lessons = await env.MIRAI_AI_DB.prepare(`
        SELECT l.id, l.course_id, l.title, l.order_index, l.created_at
        FROM   lessons l
        WHERE  l.created_at > ?
        ORDER  BY l.created_at DESC
        LIMIT  30
      `).bind(since).all();

      changes.courses = {
        courses: courses.results || [],
        lessons: lessons.results || []
      };
    }

    // ── REPORTS ────────────────────────────────────────────────
    // Tablas: reports, report_submissions
    if (modules.includes('reports')) {
      const isTeacher = effectiveRole === 'teacher' || effectiveRole === 'admin';

      if (isTeacher) {
        // Profesor: reportes que creó + nuevas entregas
        const reports = await env.MIRAI_AI_DB.prepare(`
          SELECT id, title, description, icon, deadline,
                 active, created_at, updated_at
          FROM   reports
          WHERE  teacher_dni = ? AND updated_at > ?
          ORDER  BY updated_at DESC
          LIMIT  20
        `).bind(userDni, since).all();

        const submissions = await env.MIRAI_AI_DB.prepare(`
          SELECT rs.id, rs.report_id, rs.student_dni,
                 rs.submitted_at, r.title AS report_title
          FROM   report_submissions rs
          JOIN   reports r ON r.id = rs.report_id
          WHERE  r.teacher_dni = ? AND rs.submitted_at > ?
          ORDER  BY rs.submitted_at DESC
          LIMIT  30
        `).bind(userDni, since).all();

        changes.reports = {
          reports: reports.results || [],
          submissions: submissions.results || []
        };

      } else {
        // Estudiante: reportes activos con acceso, y sus propias entregas
        const submissions = await env.MIRAI_AI_DB.prepare(`
          SELECT rs.id, rs.report_id, rs.submitted_at,
                 r.title AS report_title
          FROM   report_submissions rs
          JOIN   reports r ON r.id = rs.report_id
          WHERE  rs.student_dni = ? AND rs.submitted_at > ?
          ORDER  BY rs.submitted_at DESC
          LIMIT  20
        `).bind(userDni, since).all();

        changes.reports = {
          reports: [],
          submissions: submissions.results || []
        };
      }
    }

    // ── CHAT ───────────────────────────────────────────────────
    // Tablas: conversations, messages
    if (modules.includes('chat')) {
      const conversations = await env.MIRAI_AI_DB.prepare(`
        SELECT id, title, model, updated_at, created_at,
               course_id, lesson_id, learning_context, project_id
        FROM   conversations
        WHERE  user_dni = ? AND updated_at > ?
        ORDER  BY updated_at DESC
        LIMIT  20
      `).bind(userDni, since).all();

      // Mensajes nuevos en conversaciones activas
      const messages = await env.MIRAI_AI_DB.prepare(`
        SELECT m.id, m.conversation_id, m.role,
               m.content, m.created_at,
               m.audio_url, m.video_url, m.thumbnail_url
        FROM   messages m
        JOIN   conversations c ON c.id = m.conversation_id
        WHERE  c.user_dni = ? AND m.created_at > ?
        ORDER  BY m.created_at DESC
        LIMIT  30
      `).bind(userDni, since).all();

      changes.chat = {
        conversations: conversations.results || [],
        messages: messages.results || []
      };
    }

    // ── GENERATION ─────────────────────────────────────────────
    // Tabla: gen_history (images, videos, music)
    if (modules.includes('generation')) {
      const gen = await env.MIRAI_AI_DB.prepare(`
        SELECT id, type, badge, prompt, result, created_at
        FROM   gen_history
        WHERE  user_dni = ? AND created_at > ?
        ORDER  BY created_at DESC
        LIMIT  20
      `).bind(userDni, since).all();

      changes.generation = gen.results || [];
    }

    return jsonResponse(
      { ts: newTs, changes },
      200,
      { ...corsHeaders, 'Cache-Control': 'no-store, no-cache' }
    );

  } catch (error) {
    console.error('[SyncPoll] Error:', error);
    return jsonResponse(
      { error: 'Error en sync poll', ts: new Date().toISOString(), changes: {} },
      500,
      corsHeaders
    );
  }
}
