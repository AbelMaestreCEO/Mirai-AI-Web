/* ============================================
   MIRAI AI - Proyectos y sus archivos

   ============================================ */
import { requireAuth } from '../lib/auth';
import { jsonResponse, safeJsonParse } from '../lib/http';

// ─────────────────────────────────────────────────────────────
// GET /api/projects
// Devuelve todos los proyectos del usuario autenticado
// ─────────────────────────────────────────────────────────────
export async function handleProjectList(request, env, corsHeaders) {
  const userDni = await requireAuth(request, env);
  if (!userDni) return jsonResponse({ error: 'No autorizado' }, 401, corsHeaders);

  try {
    const { results } = await env.MIRAI_AI_DB.prepare(`
      SELECT
        id, name, description, tech_stack, category,
        file_count, created_at, updated_at
      FROM projects
      WHERE user_dni = ?
      ORDER BY updated_at DESC
    `).bind(userDni.toUpperCase()).all();

    // tech_stack viene como texto JSON; lo parseamos para el cliente
    const projects = results.map(p => ({
      ...p,
      tech_stack: safeJsonParse(p.tech_stack, []),
    }));

    return jsonResponse({ projects }, 200, corsHeaders);
  } catch (error) {
    console.error('[Projects] Error al listar:', error);
    return jsonResponse({ error: 'Error al obtener proyectos' }, 500, corsHeaders);
  }
}

// ─────────────────────────────────────────────────────────────
// POST /api/projects
// Body JSON: { name, description?, tech_stack?: string[], category? }
// ─────────────────────────────────────────────────────────────
export async function handleProjectCreate(request, env, corsHeaders) {
  const userDni = await requireAuth(request, env);
  if (!userDni) return jsonResponse({ error: 'No autorizado' }, 401, corsHeaders);

  let body;
  try { body = await request.json(); } catch {
    return jsonResponse({ error: 'JSON inválido' }, 400, corsHeaders);
  }

  const { name, description = '', tech_stack = [], category = 'otros' } = body;

  if (!name || typeof name !== 'string' || !name.trim()) {
    return jsonResponse({ error: 'El nombre del proyecto es obligatorio' }, 400, corsHeaders);
  }

  if (name.trim().length > 80) {
    return jsonResponse({ error: 'El nombre no puede superar los 80 caracteres' }, 400, corsHeaders);
  }

  try {
    const id = crypto.randomUUID();
    const techStackJson = JSON.stringify(Array.isArray(tech_stack) ? tech_stack : []);
    const now = new Date().toISOString();

    await env.MIRAI_AI_DB.prepare(`
      INSERT INTO projects (id, user_dni, name, description, tech_stack, category, file_count, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)
    `).bind(
      id,
      userDni.toUpperCase(),
      name.trim(),
      description.trim().substring(0, 500),
      techStackJson,
      category,
      now,
      now
    ).run();

    const project = await env.MIRAI_AI_DB.prepare(
      'SELECT * FROM projects WHERE id = ?'
    ).bind(id).first();

    return jsonResponse({
      success: true,
      project: { ...project, tech_stack: safeJsonParse(project.tech_stack, []) },
    }, 201, corsHeaders);
  } catch (error) {
    console.error('[Projects] Error al crear:', error);
    return jsonResponse({ error: 'Error al crear proyecto' }, 500, corsHeaders);
  }
}

// ─────────────────────────────────────────────────────────────
// GET /api/projects/:id
// Devuelve un proyecto por ID (solo si pertenece al usuario)
// ─────────────────────────────────────────────────────────────
export async function handleProjectGet(request, env, corsHeaders, projectId) {
  const userDni = await requireAuth(request, env);
  if (!userDni) return jsonResponse({ error: 'No autorizado' }, 401, corsHeaders);

  try {
    const project = await env.MIRAI_AI_DB.prepare(`
      SELECT id, name, description, tech_stack, category, file_count, created_at, updated_at
      FROM projects
      WHERE id = ? AND user_dni = ?
    `).bind(projectId, userDni.toUpperCase()).first();

    if (!project) {
      return jsonResponse({ error: 'Proyecto no encontrado o sin permiso' }, 404, corsHeaders);
    }

    return jsonResponse({
      project: {
        ...project,
        tech_stack: safeJsonParse(project.tech_stack, []),
      }
    }, 200, corsHeaders);
  } catch (error) {
    console.error('[Projects] Error al obtener proyecto:', error);
    return jsonResponse({ error: 'Error al obtener proyecto' }, 500, corsHeaders);
  }
}

// ─────────────────────────────────────────────────────────────
// PUT /api/projects/:id
// Body JSON: { name?, description?, tech_stack?, category? }
// Solo el dueño puede editar (WHERE user_dni = ?)
// ─────────────────────────────────────────────────────────────
export async function handleProjectUpdate(request, env, corsHeaders, projectId) {
  const userDni = await requireAuth(request, env);
  if (!userDni) return jsonResponse({ error: 'No autorizado' }, 401, corsHeaders);

  // Verificar propiedad
  const existing = await env.MIRAI_AI_DB.prepare(
    'SELECT id FROM projects WHERE id = ? AND user_dni = ?'
  ).bind(projectId, userDni.toUpperCase()).first();

  if (!existing) {
    return jsonResponse({ error: 'Proyecto no encontrado o sin permiso' }, 404, corsHeaders);
  }

  let body;
  try { body = await request.json(); } catch {
    return jsonResponse({ error: 'JSON inválido' }, 400, corsHeaders);
  }

  const { name, description, tech_stack, category } = body;

  if (name !== undefined && (!name || !name.trim())) {
    return jsonResponse({ error: 'El nombre no puede estar vacío' }, 400, corsHeaders);
  }

  try {
    // Construir SET dinámico solo con los campos que llegaron
    const fields = [];
    const values = [];

    if (name !== undefined) {
      fields.push('name = ?');
      values.push(name.trim().substring(0, 80));
    }
    if (description !== undefined) {
      fields.push('description = ?');
      values.push(description.trim().substring(0, 500));
    }
    if (tech_stack !== undefined) {
      fields.push('tech_stack = ?');
      values.push(JSON.stringify(Array.isArray(tech_stack) ? tech_stack : []));
    }
    if (category !== undefined) {
      fields.push('category = ?');
      values.push(category);
    }

    fields.push('updated_at = ?');
    values.push(new Date().toISOString());

    // WHERE
    values.push(projectId, userDni.toUpperCase());

    await env.MIRAI_AI_DB.prepare(
      `UPDATE projects SET ${fields.join(', ')} WHERE id = ? AND user_dni = ?`
    ).bind(...values).run();

    const updated = await env.MIRAI_AI_DB.prepare(
      'SELECT * FROM projects WHERE id = ?'
    ).bind(projectId).first();

    return jsonResponse({
      success: true,
      project: { ...updated, tech_stack: safeJsonParse(updated.tech_stack, []) },
    }, 200, corsHeaders);
  } catch (error) {
    console.error('[Projects] Error al actualizar:', error);
    return jsonResponse({ error: 'Error al actualizar proyecto' }, 500, corsHeaders);
  }
}

// ─────────────────────────────────────────────────────────────
// DELETE /api/projects/:id
// Elimina el proyecto, sus registros en D1 y todos los objetos
// de R2 bajo el prefix projects/{userDni}/{projectId}/
// ─────────────────────────────────────────────────────────────
export async function handleProjectDelete(request, env, corsHeaders, projectId) {
  const userDni = await requireAuth(request, env);
  if (!userDni) return jsonResponse({ error: 'No autorizado' }, 401, corsHeaders);

  // Verificar propiedad
  const project = await env.MIRAI_AI_DB.prepare(
    'SELECT id FROM projects WHERE id = ? AND user_dni = ?'
  ).bind(projectId, userDni.toUpperCase()).first();

  if (!project) {
    return jsonResponse({ error: 'Proyecto no encontrado o sin permiso' }, 404, corsHeaders);
  }

  try {
    // 1. Obtener todas las r2_key de los archivos del proyecto
    const { results: files } = await env.MIRAI_AI_DB.prepare(
      'SELECT r2_key FROM project_files WHERE project_id = ?'
    ).bind(projectId).all();

    // 2. Eliminar archivos de R2 en paralelo
    if (files.length > 0) {
      await Promise.all(
        files.map(f => env.MIRAI_AI_ASSETS.delete(f.r2_key))
      );
    }

    // 3. Eliminar registros de D1
    //    ON DELETE CASCADE se encarga de project_files si lo definiste,
    //    pero lo hacemos explícito por seguridad
    await env.MIRAI_AI_DB.prepare(
      'DELETE FROM project_files WHERE project_id = ?'
    ).bind(projectId).run();

    await env.MIRAI_AI_DB.prepare(
      'DELETE FROM projects WHERE id = ? AND user_dni = ?'
    ).bind(projectId, userDni.toUpperCase()).run();

    return jsonResponse({ success: true }, 200, corsHeaders);
  } catch (error) {
    console.error('[Projects] Error al eliminar:', error);
    return jsonResponse({ error: 'Error al eliminar proyecto' }, 500, corsHeaders);
  }
}

// ─────────────────────────────────────────────────────────────
// GET /api/projects/:id/files
// Devuelve la lista de archivos de un proyecto
// ─────────────────────────────────────────────────────────────
export async function handleProjectFileList(request, env, corsHeaders, projectId) {
  const userDni = await requireAuth(request, env);
  if (!userDni) return jsonResponse({ error: 'No autorizado' }, 401, corsHeaders);

  // Verificar que el proyecto pertenece al usuario
  const project = await env.MIRAI_AI_DB.prepare(
    'SELECT id FROM projects WHERE id = ? AND user_dni = ?'
  ).bind(projectId, userDni.toUpperCase()).first();

  if (!project) {
    return jsonResponse({ error: 'Proyecto no encontrado o sin permiso' }, 404, corsHeaders);
  }

  try {
    const { results } = await env.MIRAI_AI_DB.prepare(`
      SELECT id, name, size, mime_type, uploaded_at
      FROM project_files
      WHERE project_id = ?
      ORDER BY uploaded_at ASC
    `).bind(projectId).all();

    return jsonResponse({ files: results }, 200, corsHeaders);
  } catch (error) {
    console.error('[Projects] Error al listar archivos:', error);
    return jsonResponse({ error: 'Error al obtener archivos' }, 500, corsHeaders);
  }
}

// ─────────────────────────────────────────────────────────────
// POST /api/projects/:id/files
// FormData: file (File), project_id (string)
// Sube el archivo a R2 y registra en D1
// ─────────────────────────────────────────────────────────────
export async function handleProjectFileUpload(request, env, corsHeaders, projectId) {
  const userDni = await requireAuth(request, env);
  if (!userDni) return jsonResponse({ error: 'No autorizado' }, 401, corsHeaders);

  // Verificar propiedad del proyecto
  const project = await env.MIRAI_AI_DB.prepare(
    'SELECT id, file_count FROM projects WHERE id = ? AND user_dni = ?'
  ).bind(projectId, userDni.toUpperCase()).first();

  if (!project) {
    return jsonResponse({ error: 'Proyecto no encontrado o sin permiso' }, 404, corsHeaders);
  }

  let formData;
  try {
    formData = await request.formData();
  } catch {
    return jsonResponse({ error: 'FormData inválido' }, 400, corsHeaders);
  }

  const file = formData.get('file');
  if (!file || typeof file === 'string') {
    return jsonResponse({ error: 'Se requiere un archivo' }, 400, corsHeaders);
  }

  // Validar extensión permitida
  const ALLOWED_EXTENSIONS = new Set([
    'js', 'ts', 'jsx', 'tsx', 'py', 'rs', 'go', 'html', 'css', 'json',
    'md', 'txt', 'env', 'toml', 'yaml', 'yml', 'sql', 'sh', 'bat',
    'vue', 'svelte', 'astro', 'php', 'java', 'c', 'cpp', 'h', 'cs',
    'rb', 'swift', 'kt', 'dart', 'graphql', 'prisma', 'lock', 'gitignore',
  ]);
  const ext = file.name.split('.').pop().toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return jsonResponse({ error: `Extensión .${ext} no permitida` }, 400, corsHeaders);
  }

  // Límite de tamaño: 5 MB por archivo
  const MAX_SIZE = 5 * 1024 * 1024;
  if (file.size > MAX_SIZE) {
    return jsonResponse({ error: 'El archivo supera el límite de 5 MB' }, 413, corsHeaders);
  }

  try {
    const fileId = crypto.randomUUID();
    // Sanitizar nombre: quitar caracteres problemáticos
    const safeName = file.name.replace(/[^a-zA-Z0-9._\-]/g, '_');
    const r2Key = `projects/${userDni.toUpperCase()}/${projectId}/${fileId}-${safeName}`;

    // Subir a R2
    await env.MIRAI_AI_ASSETS.put(r2Key, file.stream(), {
      httpMetadata: { contentType: file.type || 'text/plain' },
      customMetadata: {
        project_id: projectId,
        user_dni: userDni.toUpperCase(),
        original_name: file.name,
      },
    });

    const now = new Date().toISOString();

    // Registrar en D1
    await env.MIRAI_AI_DB.prepare(`
      INSERT INTO project_files (id, project_id, name, r2_key, size, mime_type, uploaded_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(fileId, projectId, file.name, r2Key, file.size, file.type || 'text/plain', now).run();

    // Incrementar contador de archivos en el proyecto
    await env.MIRAI_AI_DB.prepare(`
      UPDATE projects
      SET file_count = file_count + 1, updated_at = ?
      WHERE id = ?
    `).bind(now, projectId).run();

    return jsonResponse({
      success: true,
      file: {
        id: fileId,
        name: file.name,
        size: file.size,
        mime_type: file.type || 'text/plain',
        uploaded_at: now,
      },
    }, 201, corsHeaders);
  } catch (error) {
    console.error('[Projects] Error al subir archivo:', error);
    return jsonResponse({ error: 'Error al subir archivo' }, 500, corsHeaders);
  }
}

// ─────────────────────────────────────────────────────────────
// DELETE /api/projects/:id/files/:fileId
// Elimina un archivo de R2 y su registro en D1
// ─────────────────────────────────────────────────────────────
export async function handleProjectFileDelete(request, env, corsHeaders, projectId, fileId) {
  const userDni = await requireAuth(request, env);
  if (!userDni) return jsonResponse({ error: 'No autorizado' }, 401, corsHeaders);

  // Verificar propiedad del proyecto (JOIN implícito: si el proyecto no es del usuario,
  // el archivo tampoco es accesible)
  const project = await env.MIRAI_AI_DB.prepare(
    'SELECT id FROM projects WHERE id = ? AND user_dni = ?'
  ).bind(projectId, userDni.toUpperCase()).first();

  if (!project) {
    return jsonResponse({ error: 'Proyecto no encontrado o sin permiso' }, 404, corsHeaders);
  }

  // Obtener el archivo
  const file = await env.MIRAI_AI_DB.prepare(
    'SELECT id, r2_key FROM project_files WHERE id = ? AND project_id = ?'
  ).bind(fileId, projectId).first();

  if (!file) {
    return jsonResponse({ error: 'Archivo no encontrado' }, 404, corsHeaders);
  }

  try {
    // 1. Eliminar de R2
    await env.MIRAI_AI_ASSETS.delete(file.r2_key);

    // 2. Eliminar registro de D1
    await env.MIRAI_AI_DB.prepare(
      'DELETE FROM project_files WHERE id = ? AND project_id = ?'
    ).bind(fileId, projectId).run();

    // 3. Decrementar contador (mínimo 0)
    await env.MIRAI_AI_DB.prepare(`
      UPDATE projects
      SET file_count = MAX(0, file_count - 1), updated_at = ?
      WHERE id = ?
    `).bind(new Date().toISOString(), projectId).run();

    return jsonResponse({ success: true }, 200, corsHeaders);
  } catch (error) {
    console.error('[Projects] Error al eliminar archivo:', error);
    return jsonResponse({ error: 'Error al eliminar archivo' }, 500, corsHeaders);
  }
}

// ─────────────────────────────────────────────────────────────
// GET /api/projects/:id/context
// Devuelve el contenido de texto de todos los archivos del proyecto
// concatenados. Usado por code.html para darle contexto a la IA.
// Los archivos binarios o demasiado grandes se omiten con una nota.
// ─────────────────────────────────────────────────────────────
export async function handleProjectContext(request, env, corsHeaders, projectId) {
  const userDni = await requireAuth(request, env);
  if (!userDni) return jsonResponse({ error: 'No autorizado' }, 401, corsHeaders);

  // Verificar propiedad
  const project = await env.MIRAI_AI_DB.prepare(
    'SELECT id, name, tech_stack FROM projects WHERE id = ? AND user_dni = ?'
  ).bind(projectId, userDni.toUpperCase()).first();

  if (!project) {
    return jsonResponse({ error: 'Proyecto no encontrado o sin permiso' }, 404, corsHeaders);
  }

  try {
    const { results: files } = await env.MIRAI_AI_DB.prepare(
      'SELECT id, name, r2_key, size, mime_type FROM project_files WHERE project_id = ? ORDER BY uploaded_at ASC'
    ).bind(projectId).all();

    if (files.length === 0) {
      return jsonResponse({ context: '', files: [], project_name: project.name }, 200, corsHeaders);
    }

    const MAX_FILE_SIZE = 200 * 1024; // 200 KB por archivo
    const MAX_TOTAL_CHARS = 80_000;    // ~20k tokens de contexto total

    const parts = [];
    const fileIndex = [];
    let totalChars = 0;

    for (const f of files) {
      fileIndex.push({ id: f.id, name: f.name, size: f.size });

      if (f.size > MAX_FILE_SIZE) {
        parts.push(`\n\n### ${f.name}\n[Archivo omitido: supera el límite de 200 KB (${Math.round(f.size / 1024)} KB)]`);
        continue;
      }

      const obj = await env.MIRAI_AI_ASSETS.get(f.r2_key);
      if (!obj) {
        parts.push(`\n\n### ${f.name}\n[Archivo no encontrado en almacenamiento]`);
        continue;
      }

      const text = await obj.text();

      if (totalChars + text.length > MAX_TOTAL_CHARS) {
        const remaining = MAX_TOTAL_CHARS - totalChars;
        parts.push(`\n\n### ${f.name}\n\`\`\`\n${text.substring(0, remaining)}\n[... truncado]\n\`\`\``);
        totalChars = MAX_TOTAL_CHARS;
        break;
      }

      const lang = f.name.split('.').pop().toLowerCase();
      parts.push(`\n\n### ${f.name}\n\`\`\`${lang}\n${text}\n\`\`\``);
      totalChars += text.length;
    }

    const techStack = safeJsonParse(project.tech_stack, []);
    const header = `# Proyecto: ${project.name}\nStack: ${techStack.join(', ') || 'No especificado'}\nArchivos: ${files.length}\n`;

    return jsonResponse({
      context: header + parts.join(''),
      files: fileIndex,
      project_name: project.name,
      tech_stack: techStack,
    }, 200, corsHeaders);
  } catch (error) {
    console.error('[Projects] Error al construir contexto:', error);
    return jsonResponse({ error: 'Error al obtener contexto del proyecto' }, 500, corsHeaders);
  }
}
