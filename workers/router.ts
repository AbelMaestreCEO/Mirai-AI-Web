/* ============================================
   MIRAI AI - Router de /api/
   Despacha cada petición /api/ a su handler en routes/.
   ============================================ */
import { clearSessionCookie, getTokenFromRequest, requireAdminAuth, requireAuth } from './lib/auth';
import { jsonResponse } from './lib/http';
import { calcCost, ensureApiUsageTable, logApiUsage } from './lib/usage';
import {
  handleForgotPassword,
  handleLogin,
  handleRegister,
  handleResendOTP,
  handleResetPassword,
  handleVerify,
} from './routes/account';
import { handleApaDelete, handleApaDownload, handleApaHistory, handleApaUpload } from './routes/apa';
import { handleServeAudio, handleTranscribeAudio, handleUploadUserAudio } from './routes/audio';
import { handleChat } from './routes/chat';
import { handleClassroomApi } from './routes/classroom';
import {
  handleCodeChatCreate,
  handleCodeChatDelete,
  handleCodeChatList,
  handleCodeChatMessage,
} from './routes/code-chat';
import {
  getOrCreateEducationConversation,
  handleDeleteConversation,
  handleGetOrCreateLearningChat,
  handleHistory,
  handleListConversations,
  handleRenameConversation,
  handleUpload,
} from './routes/conversations';
import {
  handleDietDeleteKey,
  handleDietDeleteLog,
  handleDietGetHistory,
  handleDietGetState,
  handleDietPostHistory,
  handleDietPutKey,
  handleDietPutLog,
} from './routes/diet';
import { handleFormatDownload, handleFormatProcess, handleFormatUpload } from './routes/format';
import { handleGenHistoryDelete, handleGenHistoryGet, handleGenHistorySave } from './routes/gen-history';
import { handleImageEdit, handleImageJudge, handleImageUpscale, handleServeImage } from './routes/image';
import {
  handleInventoryDelete,
  handleInventoryList,
  handleInventoryUpdate,
  handleInventoryUpload,
} from './routes/inventory';
import {
  handleInvestigationHistoryDelete,
  handleInvestigationHistoryList,
  handleInvestigationSearch,
} from './routes/investigation';
import { handleLocCreate, handleLocDelete, handleLocList } from './routes/location';
import {
  mirrorCleanupSession,
  mirrorCreateSession,
  mirrorDownloadAll,
  mirrorPackageSession,
  mirrorPlanSession,
  mirrorUploadImage,
} from './routes/mirror';
import { ensurePlanColumn, handleGetTokens, handleGetTokensMonthly } from './routes/plans';
import {
  handleAnalyzePreferences,
  handleDeleteAvatar,
  handleGetProfile,
  handleGetUserPreferences,
  handleGetUserSettings,
  handleSaveUserSettings,
  handleServeAvatar,
  handleUpdateProfile,
  handleUploadAvatar,
} from './routes/profile';
import {
  handleProjectContext,
  handleProjectCreate,
  handleProjectDelete,
  handleProjectFileDelete,
  handleProjectFileList,
  handleProjectFileUpload,
  handleProjectGet,
  handleProjectList,
  handleProjectUpdate,
} from './routes/projects';
import { handleSubscribe, handleTriggerNotification } from './routes/push';
import {
  handleMyReports,
  handleMySubmission,
  handleReportCreate,
  handleReportDelete,
  handleReportImageServe,
  handleReportList,
  handleReportSections,
  handleReportSubmissions,
  handleReportSubmit,
  handleReportUpdate,
  handleStudentList,
  requireReportManagerAuth,
} from './routes/reports';
import {
  handleSaleBuyerCreate,
  handleSaleBuyerDelete,
  handleSaleBuyerUpdate,
  handleSaleBuyersList,
  handleSaleInvoicePdf,
  handleSaleInvoicesList,
  handleSaleListingCreate,
  handleSaleListingDelete,
  handleSaleListingUpdate,
  handleSaleListingsList,
  handleSaleTransactionCreate,
  handleSaleTransactionUpdate,
  handleSaleTransactionsList,
} from './routes/sales';
import { handleSyncPoll } from './routes/sync';
import {
  handleTaskAISuggest,
  handleTaskCreate,
  handleTaskDelete,
  handleTaskList,
  handleTaskUpdate,
} from './routes/tasks';
import {
  handleAdvancedVideoGeneration,
  handleDeleteVideoAvatarCharacter,
  handleGetVideoAvatarJob,
  handleListVideoAvatarCharacters,
  handleSaveVideoAvatarCharacter,
  handleServeVideo,
  handleVideoAvatarGeneration,
} from './routes/video';

// --- RUTAS ---
const ROUTES = {
  CHAT: '/api/chat',
  HISTORY: '/api/history',
  STATIC: '/'
};

// --- MANEJO DE RUTAS API ---
export async function handleApiRequest(request, env, ctx, corsHeaders) {
  const url = new URL(request.url);
  const path = url.pathname;

  // Migración: agregar columna submission_type a assignments si no existe
  if (!globalThis._migratedSubmissionType) {
    try {
      await env.MIRAI_AI_DB.prepare(
        "ALTER TABLE assignments ADD COLUMN submission_type TEXT DEFAULT 'document'"
      ).run();
    } catch (_) { /* columna ya existe */ }
    globalThis._migratedSubmissionType = true;
  }

  // Migración: agregar columna section_id a reports (asignación de reportes por sección)
  if (!globalThis._migratedReportsSection) {
    try {
      await env.MIRAI_AI_DB.prepare(
        "ALTER TABLE reports ADD COLUMN section_id TEXT"
      ).run();
    } catch (_) { /* columna ya existe */ }
    globalThis._migratedReportsSection = true;
  }

  // Migración: columna reasoning en messages (cadena de pensamiento del modelo,
  // que se muestra plegada encima de la respuesta)
  if (!globalThis._migratedMessagesReasoning) {
    try {
      await env.MIRAI_AI_DB.prepare(
        "ALTER TABLE messages ADD COLUMN reasoning TEXT"
      ).run();
    } catch (_) { /* columna ya existe */ }
    globalThis._migratedMessagesReasoning = true;
  }

  try {

    // Ruta: POST /api/chat
    if (path === ROUTES.CHAT && request.method === 'POST') {
      return await handleChat(request, env, corsHeaders, ctx);
    }

    if (url.pathname === '/api/get-or-create-learning-chat' && request.method === 'GET') {
      return handleGetOrCreateLearningChat(request, env, corsHeaders);
    }

    // ── AULA, CURSOS Y ASISTENCIA (workers/classroom.ts) ────────────
    const classroomResponse = await handleClassroomApi(request, env, url, path, corsHeaders);
    if (classroomResponse) return classroomResponse;

    // ── PROYECTOS ────────────────────────────────────────────────

    // GET  /api/projects           → Listar proyectos del usuario
    // POST /api/projects           → Crear proyecto
    if (path === '/api/projects') {
      if (request.method === 'GET')
        return handleProjectList(request, env, corsHeaders);
      if (request.method === 'POST')
        return handleProjectCreate(request, env, corsHeaders);
    }

    // PUT    /api/projects/:id     → Actualizar nombre/descripción/stack
    // DELETE /api/projects/:id     → Eliminar proyecto y sus archivos de R2
    const projectMatch = path.match(/^\/api\/projects\/([^/]+)$/);
    if (projectMatch) {
      const projectId = projectMatch[1];
      if (request.method === 'GET')
        return handleProjectGet(request, env, corsHeaders, projectId);
      if (request.method === 'PUT')
        return handleProjectUpdate(request, env, corsHeaders, projectId);
      if (request.method === 'DELETE')
        return handleProjectDelete(request, env, corsHeaders, projectId);
    }

    // GET  /api/projects/:id/files     → Listar archivos del proyecto
    // POST /api/projects/:id/files     → Subir archivo al proyecto (FormData)
    const projectFilesMatch = path.match(/^\/api\/projects\/([^/]+)\/files$/);
    if (projectFilesMatch) {
      const projectId = projectFilesMatch[1];
      if (request.method === 'GET')
        return handleProjectFileList(request, env, corsHeaders, projectId);
      if (request.method === 'POST')
        return handleProjectFileUpload(request, env, corsHeaders, projectId);
    }

    // DELETE /api/projects/:id/files/:fileId → Eliminar un archivo concreto
    const projectFileDeleteMatch = path.match(/^\/api\/projects\/([^/]+)\/files\/([^/]+)$/);
    if (projectFileDeleteMatch) {
      const [, projectId, fileId] = projectFileDeleteMatch;
      if (request.method === 'DELETE')
        return handleProjectFileDelete(request, env, corsHeaders, projectId, fileId);
    }

    // GET /api/projects/:id/context → Texto concatenado de todos los archivos
    //     (usado por code.html para enviar contexto al chat de IA)
    const projectContextMatch = path.match(/^\/api\/projects\/([^/]+)\/context$/);
    if (projectContextMatch) {
      const projectId = projectContextMatch[1];
      if (request.method === 'GET')
        return handleProjectContext(request, env, corsHeaders, projectId);
    }

    if (path === '/api/investigation/search' && request.method === 'POST') {
      return await handleInvestigationSearch(request, env, corsHeaders);
    }

    if (path === '/api/investigation/history' && request.method === 'GET') {
      return await handleInvestigationHistoryList(request, env, corsHeaders);
    }

    if (path === '/api/investigation/history' && request.method === 'DELETE') {
      return await handleInvestigationHistoryDelete(request, env, corsHeaders);
    }

    // Ruta: /api/inventory/list
    if (path === '/api/inventory/list' && request.method === 'GET') {
      return await handleInventoryList(request, env, corsHeaders);
    }

    // Ruta: /api/inventory/upload
    if (path === '/api/inventory/upload' && request.method === 'POST') {
      return await handleInventoryUpload(request, env, ctx, corsHeaders);
    }

    // Ruta: PUT /api/inventory/update
    if (path === '/api/inventory/update' && request.method === 'PUT') {
      return await handleInventoryUpdate(request, env, corsHeaders);
    }

    if (request.method === 'GET' && url.pathname === '/api/sync/poll') {
      return await handleSyncPoll(request, env, corsHeaders);
    }

    // Ruta: DELETE /api/inventory/delete
    if (path === '/api/inventory/delete' && request.method === 'DELETE') {
      return await handleInventoryDelete(request, env, corsHeaders);
    }

    // RUTA: /api/education-conversation (MODIFICADA)
    if (path === '/api/education-conversation' && request.method === 'GET') {
      const courseId = url.searchParams.get('course');

      // 1. AUTENTICAR (CRÍTICO)
      const userDni = await requireAuth(request, env);
      if (!userDni) {
        return jsonResponse({ error: 'No autorizado' }, 401, corsHeaders);
      }

      if (!courseId) {
        return jsonResponse({ error: 'course ID required' }, 400, corsHeaders);
      }

      try {
        // 2. Usar la nueva función que garantiza aislamiento por usuario
        const convId = await getOrCreateEducationConversation(courseId, null, userDni, env);

        return jsonResponse({ conversation_id: convId }, 200, corsHeaders);

      } catch (error) {
        console.error('❌ [Education] Error:', error.message);
        return jsonResponse({ error: error.message }, 500, corsHeaders);
      }
    }

    // RUTA: /api/enrolled-courses (MODIFICADA PARA FILTRAR POR USUARIO)
    if (path === '/api/enrolled-courses' && request.method === 'GET') {
      // 1. AUTENTICAR
      const userDni = await requireAuth(request, env);
      if (!userDni) {
        return jsonResponse({ error: 'No autorizado' }, 401, corsHeaders);
      }

      try {
        console.log('📚 [Enrolled] Obteniendo lista para usuario:', userDni);

        // 2. Consultar SOLO conversaciones donde user_dni coincida
        const result = await env.MIRAI_AI_DB.prepare(
          `SELECT DISTINCT c.course_id, c.title as course_title, c.created_at as started_at
           FROM conversations c
           WHERE c.course_id IS NOT NULL AND c.user_dni = ?` // <-- FILTRO CRÍTICO
        ).bind(userDni).all();

        const enrolled = await Promise.all(
          result.results.map(async (row) => {
            // Opcional: Obtener detalles del curso si los tienes en otra tabla
            // Por ahora usamos los datos de la conversación
            return {
              course_id: row.course_id,
              title: row.course_title,
              started_at: row.started_at
            };
          })
        );

        console.log('✅ [Enrolled] Lista obtenida:', enrolled.length);
        return jsonResponse(enrolled, 200, corsHeaders);

      } catch (error) {
        console.error('❌ [Enrolled] Error:', error.message);
        return jsonResponse({ error: error.message }, 500, corsHeaders);
      }
    }

    if (url.pathname === '/api/verify' && request.method === 'POST') {
      return handleVerify(request, env, corsHeaders);
    }

    // Ruta: POST /api/notifications/subscribe
    if (path === '/api/notifications/subscribe' && request.method === 'POST') {
      return await handleSubscribe(request, env, corsHeaders);
    }

    // Ruta: POST /api/notifications/trigger
    if (path === '/api/notifications/trigger' && request.method === 'POST') {
      return await handleTriggerNotification(request, env, corsHeaders);
    }

    if (url.pathname === '/api/resend-otp' && request.method === 'POST') {
      return handleResendOTP(request, env, corsHeaders);
    }

    if (path === '/api/transcribe' && request.method === 'POST') {
      return await handleTranscribeAudio(request, env, corsHeaders);
    }

    if (path === '/api/register' && request.method === 'POST') {
      return await handleRegister(request, env, corsHeaders);
    }

    // ── DIETA & NUTRICIÓN ─────────────────────────────────────────────────
    if (path === '/api/diet/state' && request.method === 'GET')
      return handleDietGetState(request, env, corsHeaders);
    if (path === '/api/diet/goals' && request.method === 'PUT')
      return handleDietPutKey(request, env, corsHeaders, 'goals');
    if (path === '/api/diet/planner' && request.method === 'PUT')
      return handleDietPutKey(request, env, corsHeaders, 'planner');
    if (path === '/api/diet/planner' && request.method === 'DELETE')
      return handleDietDeleteKey(request, env, corsHeaders, 'planner');
    if (path === '/api/diet/log' && request.method === 'PUT')
      return handleDietPutLog(request, env, corsHeaders);
    if (path === '/api/diet/log' && request.method === 'DELETE')
      return handleDietDeleteLog(request, env, corsHeaders);
    if (path === '/api/diet/shopping' && request.method === 'PUT')
      return handleDietPutKey(request, env, corsHeaders, 'shopping');
    if (path === '/api/diet/history' && request.method === 'GET')
      return handleDietGetHistory(request, env, corsHeaders);
    if (path === '/api/diet/history' && request.method === 'POST')
      return handleDietPostHistory(request, env, corsHeaders);

    // GET /api/users/search?dni=V-30840119
    // Solo profesores/administradores: es la búsqueda para asignar alumnos a una
    // sección. Sin autenticación era enumeración de usuarios y fuga de correos
    // para cualquier visitante anónimo.
    if (url.pathname === '/api/users/search' && request.method === 'GET') {
      const auth = await requireReportManagerAuth(request, env, corsHeaders);
      if (auth instanceof Response) return auth;

      const dni = url.searchParams.get('dni');
      if (!dni) return jsonResponse({ error: 'dni requerido' }, 400, corsHeaders);

      const user = await env.MIRAI_AI_DB
        .prepare('SELECT dni, first_name, last_name, email FROM users WHERE dni = ?')
        .bind(dni.toUpperCase().trim())
        .first();

      if (!user) return jsonResponse({ error: 'Usuario no encontrado' }, 404, corsHeaders);

      return jsonResponse(user, 200, corsHeaders);
    }

    if (path === '/api/me' && request.method === 'GET') {
      const userDni = await requireAuth(request, env);
      if (!userDni) return jsonResponse({ error: 'No autorizado' }, 401, { ...corsHeaders, 'Cache-Control': 'no-store' });
      const user = await env.MIRAI_AI_DB.prepare(
        "SELECT dni, first_name, last_name, role FROM users WHERE dni = ?"
      ).bind(userDni).first();
      if (!user) return jsonResponse({ error: 'Usuario no encontrado' }, 404, corsHeaders);
      return jsonResponse({ dni: user.dni, name: `${user.first_name || ''} ${user.last_name || ''}`.trim(), role: user.role }, 200, { ...corsHeaders, 'Cache-Control': 'no-store' });
    }

    if (path === '/api/logout' && request.method === 'POST') {
      const token = getTokenFromRequest(request);
      if (token) {
        await env.MIRAI_AI_DB.prepare("DELETE FROM sessions WHERE token = ?").bind(token).run();
      }
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Set-Cookie': clearSessionCookie() }
      });
    }

    if (path === '/api/login' && request.method === 'POST') {
      return await handleLogin(request, env, corsHeaders);
    }

    if (path === '/api/forgot-password' && request.method === 'POST') {
      return await handleForgotPassword(request, env, corsHeaders);
    }

    if (path === '/api/reset-password' && request.method === 'POST') {
      return await handleResetPassword(request, env, corsHeaders);
    }

    if (path === '/api/mirror/session' && request.method === 'POST') {
      return await mirrorCreateSession(request, env, corsHeaders);
    }
    if (path === '/api/mirror/upload' && request.method === 'POST') {
      return await mirrorUploadImage(request, env, corsHeaders);
    }
    if (path === '/api/mirror/plan' && request.method === 'POST') {
      return await mirrorPlanSession(request, env, corsHeaders);
    }
    if (path === '/api/mirror/package' && request.method === 'POST') {
      return await mirrorPackageSession(request, env, corsHeaders);
    }
    if (path === '/api/mirror/download-all' && request.method === 'GET') {
      return await mirrorDownloadAll(request, env, corsHeaders);
    }
    if (path === '/api/mirror/cleanup' && request.method === 'POST') {
      return await mirrorCleanupSession(request, env, corsHeaders);
    }
    // NUEVA RUTA: Subida de archivos
    if (path === '/api/upload' && request.method === 'POST') {
      return await handleUpload(request, env, corsHeaders);
    }

    // ── TAREAS DE USUARIO ─────────────────────────────────────────
    // GET  /api/tasks           → listar tareas del usuario
    // POST /api/tasks           → crear tarea
    if (path === '/api/tasks') {
      if (request.method === 'GET')
        return handleTaskList(request, env, corsHeaders);
      if (request.method === 'POST')
        return handleTaskCreate(request, env, corsHeaders);
    }

    // POST /api/tasks/ai-suggest → sugerencia IA para una tarea (usa AI Gateway interno)
    if (path === '/api/tasks/ai-suggest' && request.method === 'POST') {
      return handleTaskAISuggest(request, env, corsHeaders);
    }

    // PUT    /api/tasks/:id     → actualizar tarea
    // DELETE /api/tasks/:id     → eliminar tarea
    const taskMatch = path.match(/^\/api\/tasks\/([^/]+)$/);
    if (taskMatch) {
      const taskId = taskMatch[1];
      if (request.method === 'PUT')
        return handleTaskUpdate(request, env, corsHeaders, taskId);
      if (request.method === 'DELETE')
        return handleTaskDelete(request, env, corsHeaders, taskId);
    }

    // ── VENTAS (uso interno, aislado por usuario) ───────────────────
    // GET  /api/sales/listings        → listar artículos puestos a la venta
    // POST /api/sales/listings        → poner un artículo del inventario a la venta
    if (path === '/api/sales/listings') {
      if (request.method === 'GET')
        return handleSaleListingsList(request, env, corsHeaders);
      if (request.method === 'POST')
        return handleSaleListingCreate(request, env, corsHeaders);
    }
    // PUT    /api/sales/listings/:id  → actualizar (precio, cantidad, retirar)
    // DELETE /api/sales/listings/:id  → eliminar listing
    const saleListingMatch = path.match(/^\/api\/sales\/listings\/([^/]+)$/);
    if (saleListingMatch) {
      const listingId = saleListingMatch[1];
      if (request.method === 'PUT')
        return handleSaleListingUpdate(request, env, corsHeaders, listingId);
      if (request.method === 'DELETE')
        return handleSaleListingDelete(request, env, corsHeaders, listingId);
    }

    // GET  /api/sales/buyers          → listar compradores registrados
    // POST /api/sales/buyers          → registrar comprador
    if (path === '/api/sales/buyers') {
      if (request.method === 'GET')
        return handleSaleBuyersList(request, env, corsHeaders);
      if (request.method === 'POST')
        return handleSaleBuyerCreate(request, env, corsHeaders);
    }
    // PUT    /api/sales/buyers/:id    → actualizar comprador / favorito
    // DELETE /api/sales/buyers/:id    → eliminar comprador
    const saleBuyerMatch = path.match(/^\/api\/sales\/buyers\/([^/]+)$/);
    if (saleBuyerMatch) {
      const buyerId = saleBuyerMatch[1];
      if (request.method === 'PUT')
        return handleSaleBuyerUpdate(request, env, corsHeaders, buyerId);
      if (request.method === 'DELETE')
        return handleSaleBuyerDelete(request, env, corsHeaders, buyerId);
    }

    // GET  /api/sales/transactions    → listar compras/pagos
    // POST /api/sales/transactions    → registrar compra (descuenta inventario)
    if (path === '/api/sales/transactions') {
      if (request.method === 'GET')
        return handleSaleTransactionsList(request, env, corsHeaders);
      if (request.method === 'POST')
        return handleSaleTransactionCreate(request, env, corsHeaders);
    }
    // PUT /api/sales/transactions/:id → cambiar estado (pagado / cancelado)
    const saleTxMatch = path.match(/^\/api\/sales\/transactions\/([^/]+)$/);
    if (saleTxMatch) {
      const txId = saleTxMatch[1];
      if (request.method === 'PUT')
        return handleSaleTransactionUpdate(request, env, corsHeaders, txId);
    }

    // GET /api/sales/invoices        → listar facturas generadas
    if (path === '/api/sales/invoices' && request.method === 'GET') {
      return handleSaleInvoicesList(request, env, corsHeaders);
    }
    // GET /api/sales/invoices/:id/pdf → ver/descargar el PDF de una factura
    const saleInvoicePdfMatch = path.match(/^\/api\/sales\/invoices\/([^/]+)\/pdf$/);
    if (saleInvoicePdfMatch && request.method === 'GET') {
      return handleSaleInvoicePdf(request, env, corsHeaders, saleInvoicePdfMatch[1]);
    }

    // ── RUTAS APA 7 ────────────────────────────────────────────
    if (path === '/api/apa/upload' && request.method === 'POST') {
      return await handleApaUpload(request, env, corsHeaders);
    }

    if (path.startsWith('/api/apa/download/') && request.method === 'GET') {
      const fileId = path.replace('/api/apa/download/', '');
      return await handleApaDownload(fileId, request, env, corsHeaders);
    }

    if (path === '/api/apa/history' && request.method === 'GET') {
      return await handleApaHistory(request, env, corsHeaders);
    }

    if (path.startsWith('/api/apa/delete/') && request.method === 'DELETE') {
      const fileId = path.replace('/api/apa/delete/', '');
      return await handleApaDelete(fileId, request, env, corsHeaders);
    }
    // ── FIN RUTAS APA ──────────────────────────────────────────

    if (path === '/api/format/upload' && request.method === 'POST')
      return handleFormatUpload(request, env, corsHeaders);

    if (path === '/api/format/process' && request.method === 'POST')
      return handleFormatProcess(request, env, corsHeaders);

    if (path === '/api/format/download' && request.method === 'GET')
      return handleFormatDownload(request, env, corsHeaders);

    if (path === '/api/upload-audio' && request.method === 'POST') {
      return await handleUploadUserAudio(request, env, corsHeaders);
    }

    // GET /api/check-admin-role
    if (path === '/api/check-admin-role' && request.method === 'GET') {
      const userDni = await requireAuth(request, env);
      if (!userDni) return jsonResponse({ is_admin: false }, 401, corsHeaders);

      try {
        const row = await env.MIRAI_AI_DB.prepare(
          "SELECT role FROM users WHERE dni = ?"
        ).bind(userDni.toUpperCase()).first();

        return jsonResponse({ is_admin: row?.role === 'admin' }, 200, corsHeaders);
      } catch {
        return jsonResponse({ is_admin: false }, 500, corsHeaders);
      }
    }

    // GET /api/admin/users
    if (path === '/api/admin/users' && request.method === 'GET') {
      const userDni = await requireAdminAuth(request, env, corsHeaders);
      if (!userDni || userDni instanceof Response) return userDni;

      try {
        await ensurePlanColumn(env);
        const { results } = await env.MIRAI_AI_DB.prepare(`
      SELECT
        dni,
        first_name,
        last_name,
        email,
        role,
        COALESCE(plan, 'basic') AS plan,
        CASE WHEN avatar_r2_key IS NOT NULL
             THEN '/api/user/avatar/' || dni
             ELSE NULL END AS avatar_url
      FROM users
      ORDER BY last_name, first_name
    `).all();

        return jsonResponse(results, 200, corsHeaders);
      } catch (error) {
        return jsonResponse({ error: 'Error al obtener usuarios' }, 500, corsHeaders);
      }
    }

    // POST /api/admin/set-role
    if (path === '/api/admin/set-role' && request.method === 'POST') {
      const userDni = await requireAdminAuth(request, env, corsHeaders);
      if (!userDni || userDni instanceof Response) return userDni;

      try {
        const { dni, role } = await request.json();

        if (!dni || !role) {
          return jsonResponse({ error: 'Faltan campos: dni y role' }, 400, corsHeaders);
        }

        const validRoles = ['student', 'teacher', 'admin'];
        if (!validRoles.includes(role)) {
          return jsonResponse({ error: 'Rol inválido' }, 400, corsHeaders);
        }

        await env.MIRAI_AI_DB.prepare(
          "UPDATE users SET role = ? WHERE dni = ?"
        ).bind(role, dni.toUpperCase().trim()).run();

        return jsonResponse({ success: true, dni: dni.toUpperCase(), role }, 200, corsHeaders);
      } catch (error) {
        return jsonResponse({ error: 'Error al cambiar rol', details: error.message }, 500, corsHeaders);
      }
    }

    // POST /api/admin/set-plan
    if (path === '/api/admin/set-plan' && request.method === 'POST') {
      const userDni = await requireAdminAuth(request, env, corsHeaders);
      if (!userDni || userDni instanceof Response) return userDni;

      try {
        const { dni, plan } = await request.json();
        if (!dni || !plan) {
          return jsonResponse({ error: 'Faltan campos: dni y plan' }, 400, corsHeaders);
        }
        const validPlans = ['basic', 'students', 'development', 'designer', 'max'];
        if (!validPlans.includes(plan)) {
          return jsonResponse({ error: 'Plan inválido' }, 400, corsHeaders);
        }
        await ensurePlanColumn(env);
        await env.MIRAI_AI_DB.prepare(
          "UPDATE users SET plan = ? WHERE dni = ?"
        ).bind(plan, dni.toUpperCase().trim()).run();

        return jsonResponse({ success: true, dni: dni.toUpperCase(), plan }, 200, corsHeaders);
      } catch (error) {
        return jsonResponse({ error: 'Error al cambiar plan', details: error.message }, 500, corsHeaders);
      }
    }

    // GET /api/admin/api-usage — consumo mensual de APIs externas de pago
    if (path === '/api/admin/api-usage' && request.method === 'GET') {
      const userDni = await requireAdminAuth(request, env, corsHeaders);
      if (!userDni || userDni instanceof Response) return userDni;

      try {
        await ensureApiUsageTable(env);
        const url = new URL(request.url);
        const month = url.searchParams.get('month') || new Date().toISOString().slice(0, 7);

        const { results } = await env.MIRAI_AI_DB.prepare(`
          SELECT provider, sub_type, via_gateway,
                 SUM(units) as total_units, SUM(tokens_in) as total_tokens_in,
                 SUM(tokens_out) as total_tokens_out, SUM(cost_usd) as total_cost_usd,
                 COUNT(*) as calls
          FROM api_usage_log WHERE usage_month = ?
          GROUP BY provider, sub_type, via_gateway
          ORDER BY provider, sub_type
        `).bind(month).all();

        const { results: monthRows } = await env.MIRAI_AI_DB.prepare(
          `SELECT DISTINCT usage_month FROM api_usage_log ORDER BY usage_month DESC`
        ).all();

        const providers = {};
        for (const row of results) {
          if (!providers[row.provider]) {
            providers[row.provider] = { total_units: 0, total_cost_usd: 0, total_calls: 0, breakdown: [] };
          }
          const p = providers[row.provider];
          p.total_units += row.total_units || 0;
          p.total_cost_usd += row.total_cost_usd || 0;
          p.total_calls += row.calls || 0;
          p.breakdown.push({
            sub_type: row.sub_type,
            via_gateway: !!row.via_gateway,
            units: row.total_units || 0,
            tokens_in: row.total_tokens_in || null,
            tokens_out: row.total_tokens_out || null,
            cost_usd: row.total_cost_usd || 0,
            calls: row.calls || 0,
          });
        }

        return jsonResponse({
          month,
          providers,
          available_months: monthRows.map(m => m.usage_month)
        }, 200, corsHeaders);
      } catch (error) {
        return jsonResponse({ error: 'Error al obtener consumo de APIs', details: error.message }, 500, corsHeaders);
      }
    }

    if (path.startsWith('/api/audio/') && request.method === 'GET') {
      return await handleServeAudio(path, env);
    }

    // La clave de Google Maps solo se entrega a usuarios con sesión: antes
    // cualquier visitante anónimo podía pedirla y consumir la cuota facturable.
    if (path === '/api/maps-key' && request.method === 'GET') {
      const userDni = await requireAuth(request, env);
      if (!userDni) return jsonResponse({ error: 'No autorizado' }, 401, corsHeaders);

      const key = env.GOOGLE_MAPS_KEY || '';
      return jsonResponse({ key }, 200, { ...corsHeaders, 'Cache-Control': 'no-store' });
    }

    // POST /api/track-maps-usage — beacon desde el frontend (public/location.js) para
    // aproximar consumo real de Google Maps/Places/Geocoding, que ocurre en el navegador
    // y nunca pasa por este Worker.
    if (path === '/api/track-maps-usage' && request.method === 'POST') {
      const userDni = await requireAuth(request, env);
      if (!userDni) return jsonResponse({ error: 'No autorizado' }, 401, corsHeaders);

      try {
        const { type } = await request.json();
        const validTypes = ['map_load', 'places_autocomplete', 'geocode'];
        if (!validTypes.includes(type)) {
          return jsonResponse({ error: 'type inválido' }, 400, corsHeaders);
        }
        await logApiUsage(env, {
          provider: 'google_maps',
          unit_type: type,
          user_dni: userDni,
          cost_usd: calcCost('google_maps', type)
        });
        return new Response(null, { status: 204, headers: corsHeaders });
      } catch (error) {
        return jsonResponse({ error: 'Error registrando uso de Maps', details: error.message }, 500, corsHeaders);
      }
    }

    if (path === '/api/locations' && request.method === 'GET')
      return handleLocList(request, env, corsHeaders);

    if (path === '/api/locations' && request.method === 'POST')
      return handleLocCreate(request, env, corsHeaders);

    if (path.startsWith('/api/locations/') && request.method === 'DELETE') {
      const markerId = path.replace('/api/locations/', '');
      return handleLocDelete(markerId, request, env, corsHeaders);
    }

    if (path.startsWith('/api/location-img/') && request.method === 'GET') {
      const r2Key = path.replace('/api/location-img/', '');
      try {
        const object = await env.MIRAI_AI_ASSETS.get(r2Key);
        if (!object) return new Response('Not found', { status: 404, headers: corsHeaders });
        return new Response(object.body, {
          headers: { ...corsHeaders, 'Content-Type': object.httpMetadata?.contentType || 'image/jpeg', 'Cache-Control': 'public, max-age=31536000' },
        });
      } catch { return new Response('Error', { status: 500, headers: corsHeaders }); }
    }

    // ── REPORTES (profesor) ───────────────────────────────────
    if (path === '/api/reports' && request.method === 'GET')
      return handleReportList(request, env, corsHeaders);
    if (path === '/api/reports' && request.method === 'POST')
      return handleReportCreate(request, env, corsHeaders);
    if (path.match(/^\/api\/reports\/[^/]+$/) && request.method === 'PUT')
      return handleReportUpdate(request, env, corsHeaders, path.split('/')[3]);
    if (path.match(/^\/api\/reports\/[^/]+$/) && request.method === 'DELETE')
      return handleReportDelete(request, env, corsHeaders, path.split('/')[3]);
    if (path.match(/^\/api\/reports\/[^/]+\/submissions$/) && request.method === 'GET')
      return handleReportSubmissions(request, env, corsHeaders, path.split('/')[3]);
    // GET /api/report-sections — secciones disponibles para asignar un reporte
    // (profesor: solo las suyas · admin: todas)
    if (path === '/api/report-sections' && request.method === 'GET')
      return handleReportSections(request, env, corsHeaders);
    // ── ESTUDIANTES ───────────────────────────────────────────
    if (path === '/api/students' && request.method === 'GET')
      return handleStudentList(request, env, corsHeaders);

    // ── REPORTES (estudiante) ─────────────────────────────────
    if (path === '/api/my-reports' && request.method === 'GET')
      return handleMyReports(request, env, corsHeaders);
    if (path.match(/^\/api\/my-reports\/[^/]+\/submission$/) && request.method === 'GET')
      return handleMySubmission(request, env, corsHeaders, path.split('/')[3]);
    if (path.match(/^\/api\/my-reports\/[^/]+\/submit$/) && request.method === 'POST')
      return handleReportSubmit(request, env, corsHeaders, path.split('/')[3]);

    // ── IMÁGENES (sirve desde R2) ─────────────────────────────
    if (path.startsWith('/api/report-images/') && request.method === 'GET')
      return handleReportImageServe(request, env, corsHeaders, path.replace('/api/report-images/', ''));
    // Ruta: GET /api/conversations
    if (path === '/api/conversations' && request.method === 'GET') {
      return await handleListConversations(request, env, corsHeaders);
    }
    if (path.startsWith('/api/image/') && request.method === 'GET') {
      return await handleServeImage(path, env);
    }

    // ── CHATS DE CÓDIGO ──────────────────────────────────────────

    // GET  /api/code-chats?project_id=xxx  → listar chats de un proyecto
    // POST /api/code-chats                 → crear nuevo chat de código
    if (path === '/api/code-chats') {
      if (request.method === 'GET')
        return handleCodeChatList(request, env, corsHeaders, url);
      if (request.method === 'POST')
        return handleCodeChatCreate(request, env, corsHeaders);
    }

    // DELETE /api/code-chats/:id           → eliminar un chat de código
    const codeChatMatch = path.match(/^\/api\/code-chats\/([^/]+)$/);
    if (codeChatMatch) {
      const chatId = codeChatMatch[1];
      if (request.method === 'DELETE')
        return handleCodeChatDelete(request, env, corsHeaders, chatId);
    }

    // POST /api/code-chat/message          → enviar mensaje en un chat de código
    if (path === '/api/code-chat/message' && request.method === 'POST')
      return handleCodeChatMessage(request, env, corsHeaders);

    // Ruta: GET /api/attachment/:key — adjunto de chat subido con /api/upload.
    // Las claves son attachments/<dni>/<conversationId>/<uuid>.<ext>, así que el
    // dueño se deduce del segundo segmento.
    if (path.startsWith('/api/attachment/') && request.method === 'GET') {
      const r2Key = decodeURIComponent(path.replace('/api/attachment/', ''));

      const requesterDni = await requireAuth(request, env);
      if (!requesterDni) return jsonResponse({ error: 'No autorizado' }, 401, corsHeaders);

      const parts = r2Key.split('/');
      if (parts[0] !== 'attachments' || parts.length < 3
        || parts[1].toUpperCase() !== requesterDni.toUpperCase()) {
        return jsonResponse({ error: 'No tienes acceso a este archivo' }, 403, corsHeaders);
      }

      const object = await env.MIRAI_AI_ASSETS.get(r2Key);
      if (!object) return jsonResponse({ error: 'Archivo no encontrado' }, 404, corsHeaders);

      const headers = new Headers();
      headers.set('Content-Type', object.httpMetadata?.contentType || 'application/octet-stream');
      headers.set('Content-Disposition',
        `attachment; filename="${object.customMetadata?.original_name || r2Key.split('/').pop()}"`);
      headers.set('Cache-Control', 'private, no-store');

      return new Response(object.body, { headers });
    }

    // Ruta: GET /api/video/:key — Servir videos desde R2
    if (path.startsWith('/api/video/') && request.method === 'GET') {
      return await handleServeVideo(path, env);
    }

    // Perfil de usuario
    if (path === '/api/user/profile' && request.method === 'GET')
      return await handleGetProfile(request, env, corsHeaders);

    if (path === '/api/user/profile' && request.method === 'PUT')
      return await handleUpdateProfile(request, env, corsHeaders);

    if (path === '/api/user/avatar' && request.method === 'POST')
      return await handleUploadAvatar(request, env, corsHeaders);

    if (path === '/api/user/avatar' && request.method === 'DELETE')
      return await handleDeleteAvatar(request, env, corsHeaders);

    // Configuraciones del usuario (sincronización cross-device)
    if (path === '/api/user/settings' && request.method === 'GET')
      return await handleGetUserSettings(request, env, corsHeaders);

    if (path === '/api/user/settings' && request.method === 'PUT')
      return await handleSaveUserSettings(request, env, corsHeaders);

    // Preferencias detectadas por IA
    if (path === '/api/user/preferences' && request.method === 'GET')
      return await handleGetUserPreferences(request, env, corsHeaders);

    if (path === '/api/user/preferences/analyze' && request.method === 'POST')
      return await handleAnalyzePreferences(request, env, corsHeaders);

    // Servir avatar desde R2 (URL pública sin auth, para usar en <img>)
    if (path.startsWith('/api/user/avatar/') && request.method === 'GET')
      return await handleServeAvatar(request, env, corsHeaders);

    if (path === '/api/vapid-key' && request.method === 'GET') {
      return jsonResponse({ publicKey: env.VAPID_PUBLIC_KEY || '' }, 200, corsHeaders);
    }

    // Ruta: PUT /api/conversations/rename
    if (path === '/api/conversations/rename' && request.method === 'PUT') {
      return await handleRenameConversation(request, env, corsHeaders);
    }

    // Ruta: GET /api/history/:conversationId
    if (path.startsWith(ROUTES.HISTORY) && request.method === 'GET') {
      const conversationId = path.split('/').pop();
      return await handleHistory(request, conversationId, env, corsHeaders);
    }

    // Ruta: DELETE /api/chat/clear
    if (path === ROUTES.CHAT + '/clear' && request.method === 'DELETE') {
      const { conversation_id } = await request.json();
      return await handleDeleteConversation(request, conversation_id, env, corsHeaders);
    }

    // ── Historial de Generación ──
    if (path === '/api/gen-history' && request.method === 'POST')
      return await handleGenHistorySave(request, env, corsHeaders);
    if (path === '/api/gen-history' && request.method === 'GET')
      return await handleGenHistoryGet(request, env, corsHeaders);
    if (path === '/api/gen-history' && request.method === 'DELETE')
      return await handleGenHistoryDelete(request, env, corsHeaders);

    // ── Edición de imagen con Pruna P-Image-Edit ──
    if (path === '/api/image-edit' && request.method === 'POST')
      return await handleImageEdit(request, env, corsHeaders);

    // ── Mejora de calidad con Pruna P-Image-Upscale ──
    if (path === '/api/image-upscale' && request.method === 'POST')
      return await handleImageUpscale(request, env, corsHeaders);

    // ── Evaluación de imagen contra su prompt con Pruna P-Judger ──
    if (path === '/api/image-judge' && request.method === 'POST')
      return await handleImageJudge(request, env, corsHeaders);

    // ── Vídeo avanzado: P-Video-Edit / P-Video-Animate / P-Video-Replace ──
    if (path === '/api/video-edit' && request.method === 'POST')
      return await handleAdvancedVideoGeneration(request, env, corsHeaders, 'edit');
    if (path === '/api/video-animate' && request.method === 'POST')
      return await handleAdvancedVideoGeneration(request, env, corsHeaders, 'animate');
    if (path === '/api/video-replace' && request.method === 'POST')
      return await handleAdvancedVideoGeneration(request, env, corsHeaders, 'replace');

    // Estado de cualquier job de vídeo asíncrono (avatar incluido).
    // /api/video-avatar/jobs se mantiene más abajo como alias porque es el que
    // usa el cliente ya desplegado.
    if (path === '/api/video-jobs' && request.method === 'GET')
      return await handleGetVideoAvatarJob(request, env, corsHeaders);

    // ── Vídeo Avatar con Pruna P-Video-Avatar ──
    if (path === '/api/video-avatar/characters' && request.method === 'POST')
      return await handleSaveVideoAvatarCharacter(request, env, corsHeaders);
    if (path === '/api/video-avatar/characters' && request.method === 'GET')
      return await handleListVideoAvatarCharacters(request, env, corsHeaders);
    if (path === '/api/video-avatar/characters' && request.method === 'DELETE')
      return await handleDeleteVideoAvatarCharacter(request, env, corsHeaders);
    if (path === '/api/generate-video-avatar' && request.method === 'POST')
      return await handleVideoAvatarGeneration(request, env, corsHeaders);
    if (path === '/api/video-avatar/jobs' && request.method === 'GET')
      return await handleGetVideoAvatarJob(request, env, corsHeaders);

    // ── Tokens / Cuotas diarias ──
    if (path === '/api/user/tokens' && request.method === 'GET')
      return await handleGetTokens(request, env, corsHeaders);

    if (path === '/api/user/tokens/monthly' && request.method === 'GET')
      return await handleGetTokensMonthly(request, env, corsHeaders, url);

    // Ruta no encontrada
    return jsonResponse(
      { error: 'Endpoint no encontrado' },
      404,
      corsHeaders
    );

  } catch (error) {
    console.error('API error:', error);
    return jsonResponse(
      { error: 'Error procesando solicitud API' },
      500,
      corsHeaders
    );
  }
}
