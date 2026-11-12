<template>
  <header class="header">
    <MenuToggle />
    <div class="header-title">Panel Docente</div>
  </header>

  <main class="courses-container">
    <div class="courses-hero">
      <h1>Panel de Control</h1>
      <p id="professor-greeting">{{ authorized ? `Hola, Profesor ${dni}` : 'Gestiona tus cursos y tareas de forma eficiente' }}</p>
    </div>

    <!-- VISTA: Clases -->
    <div id="tab-classes" class="admin-tab-content" :class="{ active: tab === 'classes' }">
      <div class="course-detail-header" style="margin-bottom: 24px; padding: 24px;">
        <div class="course-detail-icon">🏫</div>
        <div class="course-detail-info">
          <h2 class="course-detail-title" style="font-size:1.3rem;">Mis Clases</h2>
          <p class="course-detail-description">Selecciona una clase para gestionar sus tareas, planes, estudiantes, trabajos y conceptos.</p>
        </div>
        <button class="btn-primary" style="margin-left:auto;" @click="courseModal = true">➕ Nueva Clase</button>
      </div>
      <p v-if="coursesFailed" style="padding: 0 8px; color: var(--error-color, #dc2626);">No se pudieron cargar tus clases.</p>
      <p v-else-if="!courses.length" style="padding: 0 8px; color: var(--text-secondary);">Todavía no tienes clases. Crea la primera con “Nueva Clase”.</p>
      <div v-else class="admin-class-grid">
        <button v-for="c in courses" :key="c.id" class="admin-class-card" @click="selectCourse(c)">
          <span class="admin-class-icon">📚</span>
          <strong class="admin-class-name">{{ c.title }}</strong>
          <span class="admin-class-meta">{{ c.description || 'Sin descripción' }}</span>
          <span class="admin-class-open">Abrir clase →</span>
        </button>
      </div>
    </div>

    <div v-if="tab === 'list'" class="courses-toolbar">
      <div class="courses-search">
        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"
          />
        </svg>
        <input id="dashboard-search" type="text" placeholder="Buscar tareas o estudiantes..." autocomplete="off">
      </div>
      <button class="btn-primary" @click="newTask">➕ Nueva Tarea</button>
    </div>

    <div v-if="tab === 'list'" class="inventory-stats" style="padding: 0 20px;">
      <div class="stat-card">
        <div class="stat-icon">📚</div>
        <div class="stat-content">
          <span class="stat-label">Mis Cursos</span>
          <span id="stat-courses" class="stat-value">{{ courses.length }}</span>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">📝</div>
        <div class="stat-content">
          <span class="stat-label">Tareas Activas</span>
          <span id="stat-tasks" class="stat-value">{{ filteredTasks.length }}</span>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">👥</div>
        <div class="stat-content">
          <span class="stat-label">Estudiantes Totales</span>
          <span id="stat-students" class="stat-value">{{ totalStudents }}</span>
        </div>
      </div>
    </div>

    <!-- Disputas -->
    <div v-if="tab === 'list'" class="courses-container" style="padding-top: 0;">
      <div class="course-detail-header" style="margin-bottom: 20px;">
        <div class="course-detail-icon">⚠️</div>
        <div class="course-detail-info">
          <h2 class="course-detail-title" style="font-size:1.3rem;">Disputas Pendientes</h2>
          <p class="course-detail-description">Revisión de calificaciones impugnadas por estudiantes</p>
        </div>
      </div>
      <div style="overflow-x: auto;">
        <table class="data-table">
          <thead>
            <tr>
              <th>Tarea</th>
              <th>Estudiante</th>
              <th>Nota Actual</th>
              <th>Fecha Entrega</th>
              <th>Motivo de Disputa</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody id="disputed-assignments-list">
            <tr v-if="disputes.state === 'loading'"><td colspan="6">Cargando disputas...</td></tr>
            <tr v-else-if="disputes.state === 'error'"><td colspan="6" style="text-align:center; color: var(--error-color);">Error al cargar disputas</td></tr>
            <tr v-else-if="!filteredDisputes.length"><td colspan="6" style="text-align:center; padding: 20px;">No hay disputas pendientes</td></tr>
            <tr v-for="d in filteredDisputes" v-else :key="d.id">
              <td><strong>{{ d.assignment_title }}</strong></td>
              <td>{{ d.first_name || '' }} {{ d.last_name || '' }}</td>
              <td><span class="badge badge-pending">{{ d.score }}/{{ d.max_score }}</span></td>
              <td>{{ new Date(d.submitted_at).toLocaleDateString() }}</td>
              <td style="max-width: 300px; overflow-wrap: break-word;">{{ d.dispute_reason || 'Sin motivo' }}</td>
              <td>
                <button class="action-btn btn-edit" @click="reviewDispute(d.id, d.max_score)">✏️ Revisar</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="tabs-container">
      <!-- TAB: Información de la clase -->
      <div id="tab-info" class="admin-tab-content" :class="{ active: tab === 'info' }">
        <div class="course-detail-header" style="margin-bottom: 24px; padding: 24px;">
          <div class="course-detail-icon">📚</div>
          <div class="course-detail-info">
            <h2 class="course-detail-title" style="font-size:1.3rem;">{{ selectedCourse?.title }}</h2>
            <p class="course-detail-description">
              {{ selectedCourse?.description || 'Información general de la clase y enlace para que se unan tus estudiantes.' }}
            </p>
          </div>
        </div>

        <div class="inventory-stats" style="padding: 0 8px 18px;">
          <div class="stat-card">
            <div class="stat-icon">👥</div>
            <div class="stat-content">
              <span class="stat-label">Estudiantes</span>
              <span class="stat-value">{{ classStudentCount }}</span>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-icon">📝</div>
            <div class="stat-content">
              <span class="stat-label">Tareas</span>
              <span class="stat-value">{{ classTasks.length }}</span>
            </div>
          </div>
        </div>

        <div style="padding: 0 8px 24px;">
          <h3 class="lessons-section-title">Secciones de la clase</h3>
          <p style="color: var(--text-secondary); font-size: .85rem; margin-bottom: 14px;">
            Crea una o varias secciones para esta clase. Cada sección tiene su propio enlace para que los estudiantes se registren; puedes repetir el nombre para distintos horarios.
          </p>

          <form
            class="section-create-form"
            style="border: 1px solid var(--glass-border); border-radius: 10px; padding: 14px; background: var(--glass-bg); margin-bottom: 18px;"
            @submit.prevent="createSection"
          >
            <div class="form-row">
              <div class="form-group">
                <label>Nombre de la sección</label>
                <input v-model="sectionForm.name" type="text" placeholder="Ej: Sección 1" required>
              </div>
              <div class="form-group">
                <label>Fecha de inicio</label>
                <input v-model="sectionForm.startDate" type="date" required>
              </div>
              <div class="form-group">
                <label>Aula (opcional)</label>
                <input v-model="sectionForm.classroom" type="text" placeholder="Ej: Aula 12">
              </div>
            </div>
            <button class="btn-primary" type="submit" :disabled="sectionForm.saving">
              {{ sectionForm.saving ? 'Creando…' : '➕ Crear sección' }}
            </button>
          </form>

          <p v-if="!courseSections.length" style="color: var(--text-secondary); font-size: .9rem;">
            Esta clase todavía no tiene secciones. Crea la primera para generar su enlace.
          </p>
          <div v-else style="display: flex; flex-direction: column; gap: 12px;">
            <div
              v-for="sec in courseSections"
              :key="sec.id"
              style="border: 1px solid var(--glass-border); border-radius: 10px; padding: 12px; background: var(--glass-bg);"
              :style="String(sec.id) === selectedSection ? 'border-color: var(--primary-color);' : ''"
            >
              <div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-bottom: 8px;">
                <strong style="font-size: .95rem;">{{ sec.name }}</strong>
                <span style="font-size: .78rem; color: var(--text-secondary);">Inicio: {{ formatDate(sec.start_date) }}</span>
                <span v-if="sec.classroom" style="font-size: .78rem; color: var(--text-secondary);">Aula: {{ sec.classroom }}</span>
                <span style="font-size: .78rem; color: var(--text-secondary);">{{ sec.student_count }} estudiante{{ Number(sec.student_count) !== 1 ? 's' : '' }}</span>
              </div>
              <div v-if="sec.invite_code" style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 8px;">
                <input :value="sectionLink(sec)" type="text" readonly style="flex: 1; min-width: 220px; font-size: .82rem;">
                <button class="btn-secondary" type="button" style="white-space: nowrap;" @click="copyLink(sectionLink(sec))">📋 Copiar</button>
              </div>
              <div v-else style="margin-bottom: 8px;">
                <button class="btn-secondary" type="button" @click="ensureSectionLink(sec)">🔗 Generar enlace</button>
              </div>
              <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                <button class="btn-secondary" type="button" @click="selectSection(sec)">👥 Ver estudiantes</button>
                <button class="action-btn btn-delete" type="button" style="max-width: 120px;" @click="deleteSection(sec)">🗑️ Eliminar</button>
              </div>
            </div>
          </div>
        </div>

        <div style="padding: 0 8px 24px;">
          <h3 class="lessons-section-title">Estudiantes de la clase</h3>
          <p v-if="currentSection" style="color: var(--text-secondary); font-size: .85rem; margin-bottom: 12px;">
            Sección: <strong>{{ currentSection.name }}</strong>
          </p>
          <div class="form-row">
            <div class="form-group">
              <label>Cédula del Estudiante</label>
              <input v-model="sectionStudentDni" type="text" placeholder="Ej: 30840119">
            </div>
          </div>
          <div style="display:flex;gap:10px;margin-bottom:24px;flex-wrap:wrap;">
            <button class="btn-primary" :disabled="!currentSection" @click="addStudentToSection">
              Agregar a la Clase
            </button>
            <button class="btn-secondary" :disabled="!currentSection" @click="openBatchModal">
              📂 Importar desde archivo
            </button>
          </div>
          <div ref="sectionStudentsEl" style="max-height: 400px; overflow-y: auto;">
            <p v-if="!currentSection" style="color: var(--text-secondary);">Selecciona o crea una sección para gestionar sus estudiantes.</p>
            <p v-else-if="sectionStudents.state === 'error'" style="color: red;">Error cargando estudiantes</p>
            <p v-else-if="sectionStudents.state === 'ready' && !sectionStudents.items.length" style="color: var(--text-secondary);">Aún no hay estudiantes en esta sección</p>
            <div
              v-for="s in sectionStudents.items"
              v-else
              :key="s.user_dni"
              style="background:var(--bg-color);padding:10px 12px;margin-bottom:8px;border-radius:8px;display:flex;justify-content:space-between;align-items:center;border-left:4px solid var(--primary-color);gap:10px;"
            >
              <div style="display:flex;align-items:center;gap:10px;min-width:0;flex:1;">
                <img
                  v-if="s.avatar_r2_key && !brokenAvatars.has(s.user_dni)"
                  :src="`/api/user/avatar/${encodeURIComponent(s.user_dni)}`"
                  :alt="initials(s)"
                  style="width:38px;height:38px;border-radius:50%;object-fit:cover;flex-shrink:0;"
                  @error="brokenAvatars.add(s.user_dni)"
                >
                <div
                  v-else
                  style="width:38px;height:38px;border-radius:50%;background:var(--glass-bg);border:1px solid var(--glass-border);display:flex;align-items:center;justify-content:center;flex-shrink:0;"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="opacity:.5;"><circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" /></svg>
                </div>
                <div style="min-width:0;">
                  <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                    <strong style="font-size:.9rem;">{{ s.user_dni }}</strong>
                    <span v-if="s.is_registered" style="background:#16a34a22;color:#16a34a;font-size:.72rem;padding:2px 8px;border-radius:20px;font-weight:600;white-space:nowrap;">✓ Registrado</span>
                    <span v-else style="background:#dc262622;color:#dc2626;font-size:.72rem;padding:2px 8px;border-radius:20px;font-weight:600;white-space:nowrap;">✗ Sin cuenta</span>
                  </div>
                  <div v-if="fullName(s)" style="color:var(--text-secondary);font-size:.85rem;margin-top:1px;">{{ fullName(s) }}</div>
                  <div v-if="censorEmail(s.email)" style="color:var(--text-secondary);font-size:.78rem;margin-top:1px;font-family:monospace;">{{ censorEmail(s.email) }}</div>
                </div>
              </div>
              <button class="action-btn btn-delete" style="flex-shrink:0;max-width:100px;" @click="removeStudentFromSection(s.user_dni)">🗑️ Eliminar</button>
            </div>
          </div>
        </div>
      </div>

      <!-- TAB: Crear Tarea -->
      <div id="tab-create" class="admin-tab-content" :class="{ active: tab === 'create' }">
        <div class="course-detail-header" style="margin-bottom: 24px; padding: 24px;">
          <div class="course-detail-icon">✏️</div>
          <div class="course-detail-info">
            <h2 class="course-detail-title" style="font-size:1.3rem;">Crear Nueva Tarea</h2>
            <p class="course-detail-description">Completa los campos para asignar una tarea a tus
              estudiantes</p>
          </div>
        </div>
        <form id="create-task-form" style="padding: 0 8px 8px;" @submit.prevent="createTask">
          <div class="form-row">
            <div class="form-group">
              <label>Título de la Tarea</label>
              <input id="task-title" v-model="taskForm.title" type="text" placeholder="Ej: Examen Final de JavaScript" required>
            </div>
            <div class="form-group">
              <label>Clase</label>
              <input v-if="selectedCourse" :value="selectedCourse.title" type="text" readonly style="opacity:.85;">
              <select v-else id="task-course-select" v-model="taskForm.courseId" required @change="onCourseSelect">
                <option value="">{{ coursesFailed ? 'Sin clases disponibles' : 'Selecciona una clase...' }}</option>
                <option v-for="c in courses" :key="c.id" :value="String(c.id)">{{ c.title }}</option>
              </select>
            </div>
          </div>
          <div class="form-group">
            <label>Descripción</label>
            <textarea id="task-desc" v-model="taskForm.description" rows="4" placeholder="Detalles de la tarea..."></textarea>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Fecha Límite</label>
              <input id="task-due" v-model="taskForm.due" type="datetime-local">
            </div>
            <div class="form-group">
              <label>Puntuación Máxima</label>
              <input id="task-score" v-model="taskForm.score" type="number" min="1" max="100" step="0.01">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Tipo de Entrega</label>
              <select id="task-submission-type" v-model="taskForm.submissionType">
                <option value="document">📄 Documento (PDF / DOCX)</option>
                <option value="image">🖼️ Imagen (PNG / JPG / WEBP)</option>
                <option value="any">📎 Cualquier formato</option>
              </select>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Modo de evaluación</label>
              <select id="task-grading-mode" v-model="taskForm.gradingMode">
                <option value="summative">Sumativa (cuenta para la nota)</option>
                <option value="formative">Formativa (practica sin nota)</option>
              </select>
              <small style="color: var(--text-secondary); font-size: 0.78rem;">En formativo la práctica no registra nota visible.</small>
            </div>
          </div>
          <p v-if="taskError" style="color: var(--error-color, #dc2626); font-size: 0.85rem; margin: 12px 0; text-align: center;">{{ taskError }}</p>
          <button type="submit" class="btn-primary" style="width: 100%; justify-content: center; padding: 14px;">
            Crear Tarea
          </button>
        </form>
      </div>

      <!-- TAB: Lista de Tareas -->
      <div id="tab-list" class="admin-tab-content" :class="{ active: tab === 'list' }">
        <div class="course-detail-header" style="margin-bottom: 24px; padding: 24px;">
          <div class="course-detail-icon">📋</div>
          <div class="course-detail-info">
            <h2 class="course-detail-title" style="font-size:1.3rem;">Tareas Creadas</h2>
            <p class="course-detail-description">Administra y monitorea todas tus tareas activas</p>
          </div>
        </div>
        <div style="overflow-x: auto; padding: 0 8px 8px;">
          <table class="data-table">
            <thead>
              <tr>
                <th>Título</th>
                <th>Curso</th>
                <th>Vence</th>
                <th>Estudiantes</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody id="tasks-list-body">
              <tr v-if="tasks.state === 'loading'"><td colspan="6">Cargando...</td></tr>
              <tr v-else-if="tasks.state === 'error'"><td colspan="6" style="text-align:center; color: var(--text-secondary);">Error al cargar tareas. Intenta de nuevo.</td></tr>
              <tr v-else-if="!filteredTasks.length"><td colspan="6" style="text-align:center; padding: 20px;">No hay tareas creadas</td></tr>
              <tr v-for="t in filteredTasks" v-else :key="t.id">
                <td>
                  <strong>{{ t.title }}</strong>
                  <div style="font-size:.75rem;color:var(--text-secondary);">
                    {{ t.grading_mode === 'formative' ? 'Formativa' : 'Sumativa' }}
                    · {{ taskModeCount(t) }} modos de evaluación
                  </div>
                </td>
                <td><span class="badge badge-pending">{{ t.course_title || t.course_id }}</span></td>
                <td>{{ t.due_date ? new Date(t.due_date).toLocaleDateString() : '-' }}</td>
                <td :id="`count-${t.id}`">{{ studentCounts[t.id] ?? 'Cargando...' }}</td>
                <td>
                  <span v-if="t.published_at" class="badge" style="background:#16a34a22;color:#16a34a;">Publicada</span>
                  <span v-else class="badge" style="background:#f59e0b22;color:#b45309;">Borrador</span>
                </td>
                <td>
                  <div style="display:flex;gap:6px;flex-wrap:wrap;">
                    <button class="action-btn btn-edit" @click="openTaskModes(t)">🧩 Evaluación</button>
                    <template v-if="!t.published_at">
                      <button class="action-btn btn-edit" @click="editTask(t)">✏️ Editar</button>
                      <button class="action-btn btn-edit" @click="publishTask(t)">📢 Publicar</button>
                    </template>
                    <button class="action-btn btn-delete" @click="deleteTask(t.id)">🗑️ Eliminar</button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- TAB: Planes de evaluación -->
      <div id="tab-plans" class="admin-tab-content" :class="{ active: tab === 'plans' }">
        <div class="course-detail-header" style="margin-bottom: 24px; padding: 24px;">
          <div class="course-detail-icon">📚</div>
          <div class="course-detail-info">
            <h2 class="course-detail-title" style="font-size:1.3rem;">Planes de Evaluación</h2>
            <p class="course-detail-description">Sube el material de la materia y la IA creará las evaluaciones con sus temas y contenido</p>
          </div>
        </div>

        <form style="padding: 0 8px 8px;" @submit.prevent="createEvaluationPlan">
          <div class="form-group">
            <label>Documento de la materia</label>
            <input
              type="file"
              accept=".doc,.docx,.docm,.xls,.xlsx,.xlsm"
              style="margin-top:6px;"
              @change="onPlanFileChange"
            >
            <small style="color: var(--text-secondary); font-size: .78rem; display:block; margin-top:6px;">
              Formatos permitidos: DOCX, DOC, DOCM, XLS, XLSX, XLSM (máx. 15 MB)
            </small>
            <small v-if="planState.fileName" style="color: var(--primary-color); font-size: .8rem; display:block; margin-top:6px;">
              Archivo seleccionado: {{ planState.fileName }}
            </small>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label>Clase</label>
              <input v-if="selectedCourse" :value="selectedCourse.title" type="text" readonly style="opacity:.85;">
              <select v-else v-model="planForm.courseId" required>
                <option value="">Selecciona una clase...</option>
                <option v-for="c in courses" :key="c.id" :value="String(c.id)">{{ c.title }}</option>
              </select>
            </div>
          </div>

          <div class="form-group">
            <label>Secciones para asignar las actividades *</label>
            <p v-if="!courseSections.length" style="color: var(--error-color, #dc2626); font-size: .85rem; margin-top: 6px;">
              Esta clase no tiene secciones. Créalas en la pestaña Información antes de generar un plan.
            </p>
            <div v-else>
              <div style="display: flex; flex-wrap: wrap; gap: 12px; margin-top: 6px;">
                <label
                  v-for="sec in courseSections"
                  :key="sec.id"
                  style="display: flex; align-items: center; gap: 6px; font-size: .88rem; cursor: pointer;"
                >
                  <input v-model="planForm.sectionIds" type="checkbox" :value="String(sec.id)">
                  <span>
                    {{ sec.name }}
                    <span v-if="sec.classroom" style="color: var(--text-secondary); font-size: .78rem;">({{ sec.classroom }})</span>
                  </span>
                </label>
              </div>
              <button type="button" class="btn-secondary" style="margin-top: 8px;" @click="toggleAllPlanSections">
                {{ allPlanSectionsSelected ? 'Quitar todas' : 'Seleccionar todas' }}
              </button>
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label>Puntuación máxima de la materia</label>
              <select v-model="planForm.maxScore" @change="onPlanMaxScoreChange">
                <option v-for="score in PLAN_SCORES" :key="score" :value="String(score)">{{ score }} puntos</option>
              </select>
            </div>
            <div class="form-group">
              <label>Cantidad de evaluaciones</label>
              <select v-model="planForm.count">
                <option v-for="count in planCountOptions" :key="count" :value="String(count)">
                  {{ count }} evaluación{{ count !== 1 ? 'es' : '' }}
                </option>
              </select>
            </div>
            <div class="form-group">
              <label>Puntuación por evaluación</label>
              <input :value="`${planPointsPerEvaluation} puntos`" type="text" readonly style="opacity:.8;">
              <small style="color: var(--text-secondary); font-size: .78rem;">
                Calculada automáticamente: {{ planForm.maxScore }} ÷ {{ planForm.count }}
              </small>
            </div>
          </div>

          <p v-if="planState.error" style="color: var(--error-color, #dc2626); font-size: .85rem; margin: 12px 0; text-align:center;">
            {{ planState.error }}
          </p>

          <button type="submit" class="btn-primary" style="width:100%; justify-content:center; padding:14px;" :disabled="planState.generating">
            {{ planState.generating ? 'Analizando documento con IA...' : '✨ Analizar y crear plan' }}
          </button>
        </form>

        <div v-if="planState.result" style="padding: 16px 8px;">
          <div style="background: var(--bg-color); padding: 18px; border-radius: 12px; border-left: 4px solid var(--primary-color);">
            <h3 style="margin:0 0 6px;">{{ planState.result.plan.title }}</h3>
            <p style="color: var(--text-secondary); font-size:.86rem; margin:0 0 10px;">
              {{ planState.result.assignments_created }} tareas creadas · {{ planState.result.plan.points_per_evaluation }} pts cada una · Total {{ planState.result.plan.max_score }}
            </p>
            <p v-if="planState.result.plan.strategy" style="font-size:.88rem; margin:0 0 14px;">{{ planState.result.plan.strategy }}</p>
            <div v-for="(e, i) in planState.result.evaluations" :key="e.id" style="background: var(--glass-bg); border:1px solid var(--glass-border); border-radius:10px; padding:12px; margin-bottom:10px;">
              <strong style="font-size:.92rem;">{{ e.title }}</strong>
              <div v-if="e.topics.length" style="font-size:.8rem; color: var(--text-secondary); margin-top:4px;">Temas: {{ e.topics.join(', ') }}</div>
              <details style="margin-top:8px;">
                <summary style="cursor:pointer; font-size:.82rem; color: var(--primary-color);">Ver contenido a evaluar</summary>
                <pre style="white-space:pre-wrap; font-family:inherit; font-size:.82rem; margin-top:8px;">{{ e.description }}</pre>
              </details>
              <div style="font-size:.75rem; color: var(--text-secondary); margin-top:6px;">
                {{ e.due_date ? `Vence: ${new Date(e.due_date).toLocaleDateString('es')}` : 'Sin fecha límite' }} · {{ e.max_score }} pts
              </div>
            </div>
            <button class="btn-secondary" @click="switchTab('list')">Ver todas las tareas</button>
          </div>
        </div>

        <div style="padding: 16px 8px;">
          <h3 class="lessons-section-title">Planes creados</h3>
          <p v-if="plans.state === 'loading'" style="color: var(--text-secondary);">Cargando...</p>
          <p v-else-if="plans.state === 'error'" style="color: var(--error-color, #dc2626);">Error al cargar los planes</p>
          <p v-else-if="!visiblePlans.length" style="color: var(--text-secondary);">Todavía no has creado planes de evaluación para esta clase</p>
          <div v-for="p in visiblePlans" v-else :key="p.id" style="background: var(--bg-color); padding: 14px; margin-bottom: 10px; border-radius: 10px; border-left: 4px solid var(--primary-color);">
            <strong>{{ p.title }}</strong>
            <div style="font-size:.82rem; color: var(--text-secondary); margin-top:3px;">
              {{ p.course_title || 'Sin materia' }} · {{ p.evaluation_count }} evaluaciones · {{ p.points_per_evaluation }} pts c/u · Total {{ p.max_score }}
            </div>
            <div style="font-size:.75rem; color: var(--text-secondary); margin-top:2px;">
              {{ p.source_filename }} · {{ new Date(p.created_at).toLocaleDateString('es') }}
            </div>
            <details style="margin-top:8px;">
              <summary style="cursor:pointer; font-size:.82rem; color: var(--primary-color);">Ver tareas ({{ p.assignments.length }})</summary>
              <ul style="margin:8px 0 0 18px; font-size:.82rem;">
                <li v-for="a in p.assignments" :key="a.id">{{ a.title }} — {{ a.max_score }} pts</li>
              </ul>
            </details>
            <button class="action-btn btn-delete" style="margin-top:10px;" @click="deletePlan(p)">🗑️ Eliminar plan y sus tareas</button>
          </div>
        </div>
      </div>

      <!-- TAB: Trabajos Entregados -->
      <div id="tab-submissions" class="admin-tab-content" :class="{ active: tab === 'submissions' }">
        <div class="course-detail-header" style="margin-bottom: 24px; padding: 24px;">
          <div class="course-detail-icon">📊</div>
          <div class="course-detail-info">
            <h2 class="course-detail-title" style="font-size:1.3rem;">Trabajos Entregados</h2>
            <p class="course-detail-description">Revisa las entregas, calificaciones IA y observaciones de tus estudiantes</p>
          </div>
        </div>
        <div style="padding: 0 8px 16px; display: flex; gap: 10px; flex-wrap: wrap; align-items: flex-end;">
          <div class="form-group" style="flex: 1; min-width: 200px; margin-bottom: 0;">
            <label style="font-size: 0.82rem;">Buscar por nombre o cédula</label>
            <div class="courses-search" style="margin-top: 6px;">
              <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path
                  d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"
                />
              </svg>
              <input id="sub-search" v-model="subSearch" type="text" placeholder="Nombre o cédula..." autocomplete="off">
            </div>
          </div>
          <button class="btn-primary" style="height: 42px; white-space: nowrap;" @click="loadSubmissions">🔄 Actualizar</button>
          <button class="btn-secondary" style="height: 42px; white-space: nowrap;" @click="exportExcel">📥 Excel</button>
          <button class="btn-secondary" style="height: 42px; white-space: nowrap;" @click="exportSectionExcel">📊 Excel de la clase</button>
          <button class="btn-secondary" style="height: 42px; white-space: nowrap;" @click="exportPdf">🖨️ PDF</button>
        </div>
        <p id="sub-result-count" style="padding: 0 8px 10px; font-size: 0.83rem; color: var(--text-secondary);">
          {{ submissions.state === 'ready' ? `${filteredSubmissions.length} resultado${filteredSubmissions.length !== 1 ? 's' : ''}` : '' }}
        </p>
        <div style="overflow-x: auto; padding: 0 8px 8px;">
          <table id="submissions-table" class="data-table">
            <thead>
              <tr>
                <th>Estudiante</th>
                <th>Cédula</th>
                <th>Tarea</th>
                <th>Nota IA</th>
                <th>Estado</th>
                <th>Fecha Entrega</th>
                <th>Observaciones</th>
              </tr>
            </thead>
            <tbody id="submissions-table-body">
              <tr v-if="submissions.state === 'idle'"><td colspan="7" style="text-align:center; padding:20px; color:var(--text-secondary);">Haz clic en "Actualizar" para cargar los trabajos</td></tr>
              <tr v-else-if="submissions.state === 'loading'"><td colspan="7" style="text-align:center;padding:20px;">Cargando...</td></tr>
              <tr v-else-if="submissions.state === 'error'"><td colspan="7" style="text-align:center;color:var(--error-color, red);">Error al cargar trabajos</td></tr>
              <tr v-else-if="!filteredSubmissions.length"><td colspan="7" style="text-align:center;padding:20px;color:var(--text-secondary);">Sin resultados</td></tr>
              <tr v-for="(s, i) in filteredSubmissions" v-else :key="`${s.user_dni}-${s.assignment_title}-${i}`">
                <td>{{ fullName(s) || '—' }}</td>
                <td><code style="font-size:.82rem;">{{ s.user_dni || '—' }}</code></td>
                <td>{{ s.assignment_title || '—' }}</td>
                <td><strong>{{ s.score !== null && s.score !== undefined ? `${s.score} / ${s.max_score}` : '—' }}</strong></td>
                <td>
                  <span v-if="s.status === 'completed' || s.status === 'evaluated'" class="badge" style="background:#16a34a22;color:#16a34a;">Calificado</span>
                  <span v-else class="badge badge-pending">Pendiente</span>
                </td>
                <td style="white-space:nowrap;">{{ s.submitted_at ? new Date(s.submitted_at).toLocaleDateString('es', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—' }}</td>
                <td style="font-size:.8rem;max-width:260px;white-space:normal;line-height:1.4;">{{ feedbackSummary(s.feedback, 180) || '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- TAB: Conceptos que falla la clase -->
      <div id="tab-concepts" class="admin-tab-content" :class="{ active: tab === 'concepts' }">
        <div class="course-detail-header" style="margin-bottom: 24px; padding: 24px;">
          <div class="course-detail-icon">📈</div>
          <div class="course-detail-info">
            <h2 class="course-detail-title" style="font-size:1.3rem;">Conceptos por reforzar</h2>
            <p class="course-detail-description">Qué temas falla más la clase, según quiz, actividades y Ludo</p>
          </div>
        </div>
        <div style="padding: 0 8px 16px; display: flex; gap: 10px; flex-wrap: wrap; align-items: flex-end;">
          <div class="form-group" style="flex: 1; min-width: 220px; margin-bottom: 0;">
            <label style="font-size: 0.82rem;">Tarea</label>
            <select id="concept-task-select" v-model="conceptAssignment" style="margin-top:6px;">
              <option value="">Todas las tareas de la clase</option>
              <option v-for="t in classTasks" :key="t.id" :value="String(t.id)">{{ t.title }}</option>
            </select>
          </div>
          <button class="btn-primary" style="height: 42px;" @click="loadConceptReport">🔄 Actualizar</button>
        </div>
        <p style="padding: 0 8px 10px; font-size: .83rem; color: var(--text-secondary);">
          {{ conceptReport.state === 'ready' ? `${conceptReport.concepts.length} concepto${conceptReport.concepts.length !== 1 ? 's' : ''} con fallos` : '' }}
        </p>
        <div style="padding: 0 8px 8px;">
          <p v-if="conceptReport.state === 'idle' || conceptReport.state === 'loading'" style="color: var(--text-secondary);">Cargando reporte...</p>
          <p v-else-if="conceptReport.state === 'error'" style="color: var(--error-color, #dc2626);">Error al cargar el reporte.</p>
          <p v-else-if="!conceptReport.concepts.length" style="color: var(--text-secondary);">Sin fallos registrados todavía.</p>
          <div
            v-for="item in conceptReport.concepts"
            :key="item.concept"
            style="background: var(--bg-color); padding: 12px 14px; margin-bottom: 8px; border-radius: 10px; display: flex; justify-content: space-between; gap: 12px; align-items: center; border-left: 4px solid var(--primary-color);"
          >
            <div style="min-width:0;">
              <strong style="font-size: .92rem;">{{ item.concept }}</strong>
              <div style="font-size: .78rem; color: var(--text-secondary); margin-top: 2px;">
                {{ item.students }} estudiante{{ item.students !== 1 ? 's' : '' }} · último fallo {{ item.last_failure ? new Date(item.last_failure).toLocaleDateString() : '—' }}
              </div>
            </div>
            <span class="badge badge-pending">{{ item.failures }} fallo{{ item.failures !== 1 ? 's' : '' }}</span>
          </div>
        </div>
      </div>
    </div>
  </main>

  <!-- Navegación del panel docente, en la barra lateral -->
  <Teleport to="#sidebar-page-section" defer>
    <h4>Panel Docente</h4>
    <div class="sidebar-panel-section">
      <p class="sidebar-panel-label">Navegación</p>
      <nav class="admin-sidebar-nav">
        <button class="admin-sidebar-btn" :class="{ active: tab === 'classes' }" @click="backToClasses">
          🏫 Clases
        </button>
        <div v-if="!selectedCourse" class="admin-sidebar-classes">
          <button
            v-for="c in courses"
            :key="c.id"
            type="button"
            class="admin-sidebar-class-item"
            @click="selectCourse(c)"
          >
            📚 {{ c.title }}
          </button>
          <p v-if="!courses.length" class="admin-sidebar-hint">Todavía no tienes clases.</p>
        </div>
        <template v-if="selectedCourse">
          <div class="admin-sidebar-class">
            <span class="admin-sidebar-class-label">Clase seleccionada</span>
            <strong>{{ selectedCourse.title }}</strong>
            <div v-if="currentSection?.invite_code" class="admin-sidebar-link">
              <span>Enlace de la clase</span>
              <button type="button" class="admin-sidebar-link-btn" @click="copyLink(currentSectionLink)">🔗 Copiar enlace</button>
            </div>
            <p v-else class="admin-sidebar-hint">Preparando el enlace de invitación…</p>
          </div>

          <p class="sidebar-panel-label" style="margin-top:14px;">Esta clase</p>
          <button
            v-for="t in CLASS_TABS"
            :key="t.id"
            class="admin-sidebar-btn"
            :class="{ active: tab === t.id }"
            :data-tab="t.id"
            @click="switchTab(t.id)"
          >
            {{ t.label }}
          </button>
          <button class="admin-sidebar-btn admin-sidebar-back" @click="backToClasses">← Cambiar de clase</button>
        </template>
      </nav>
    </div>
  </Teleport>

  <!-- MODAL: Crear Curso -->
  <div id="modal-new-course" class="modal" :class="{ show: courseModal }" :style="{ display: courseModal ? 'flex' : 'none' }" @click.self="courseModal = false">
    <div class="modal-overlay" @click="courseModal = false"></div>
    <div class="modal-content">
      <button class="modal-close" @click="courseModal = false">&times;</button>
      <div class="modal-header">
        <h2>Nuevo Curso</h2>
        <p class="modal-subtitle">Crea un nuevo curso para asignar tareas</p>
      </div>
      <form id="create-course-form" @submit.prevent="createCourse">
        <div class="form-group">
          <label>Nombre del Curso</label>
          <input id="new-course-name" v-model="courseForm.title" type="text" placeholder="Ej: Introducción a Python" required>
        </div>
        <div class="form-group">
          <label>Descripción (Opcional)</label>
          <textarea id="new-course-desc" v-model="courseForm.description" rows="3"></textarea>
        </div>
        <div style="display: flex; gap: 10px; justify-content: flex-end; margin-top: 20px;">
          <button type="button" class="btn-secondary" @click="courseModal = false">Cancelar</button>
          <button type="submit" class="btn-primary">Crear Curso</button>
        </div>
      </form>
    </div>
  </div>

  <!-- MODAL: Editar tarea en borrador -->
  <div id="modal-edit-task" class="modal" :class="{ show: editOpen }" :style="{ display: editOpen ? 'flex' : 'none' }" @click.self="editOpen = false">
    <div class="modal-overlay" @click="editOpen = false"></div>
    <div class="modal-content">
      <button class="modal-close" @click="editOpen = false">&times;</button>
      <div class="modal-header">
        <h2>Editar Tarea</h2>
        <p class="modal-subtitle">Solo se puede editar mientras siga en borrador</p>
      </div>
      <form @submit.prevent="saveTaskEdit">
        <div class="form-group">
          <label>Título</label>
          <input v-model="editForm.title" type="text" required>
        </div>
        <div class="form-group">
          <label>Descripción</label>
          <textarea v-model="editForm.description" rows="4"></textarea>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Fecha límite</label>
            <input v-model="editForm.due" type="datetime-local">
          </div>
          <div class="form-group">
            <label>Puntuación máxima</label>
            <input v-model="editForm.score" type="number" min="1" max="100" step="0.01">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Tipo de entrega</label>
            <select v-model="editForm.submissionType">
              <option value="document">📄 Documento (PDF / DOCX)</option>
              <option value="image">🖼️ Imagen (PNG / JPG / WEBP)</option>
              <option value="any">📎 Cualquier formato</option>
            </select>
          </div>
          <div class="form-group">
            <label>Modo de evaluación</label>
            <select v-model="editForm.gradingMode">
              <option value="summative">Sumativa (cuenta para la nota)</option>
              <option value="formative">Formativa (práctica sin nota)</option>
            </select>
          </div>
        </div>
        <p v-if="editError" style="color: var(--error-color, #dc2626); font-size: .85rem; margin: 12px 0; text-align: center;">{{ editError }}</p>
        <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:20px;">
          <button type="button" class="btn-secondary" @click="editOpen = false">Cancelar</button>
          <button type="submit" class="btn-primary">Guardar cambios</button>
        </div>
      </form>
    </div>
  </div>

  <!-- MODAL: Modos de evaluación de la tarea -->
  <div id="modal-task-modes" class="modal" :class="{ show: modesModal.open }" :style="{ display: modesModal.open ? 'flex' : 'none' }" @click.self="modesModal.open = false">
    <div class="modal-overlay" @click="modesModal.open = false"></div>
    <div class="modal-content">
      <button class="modal-close" @click="modesModal.open = false">&times;</button>
      <div class="modal-header">
        <h2>Evaluación de la tarea</h2>
        <p class="modal-subtitle">Elige qué modos de hacer la tarea estarán disponibles para el estudiante. Debe dejar activos al menos 4.</p>
      </div>
      <p v-if="modesModal.task" style="font-weight:600;margin-bottom:12px;">{{ modesModal.task.title }}</p>
      <div v-for="group in TASK_MODE_GROUPS" :key="group.id" class="task-mode-group">
        <h3 class="task-mode-group-title">{{ group.icon }} {{ group.label }}</h3>
        <div class="task-modes-grid">
          <label v-for="option in group.options" :key="option.value" class="task-mode-option" :class="{ selected: modesModal.selected.includes(option.value) }">
            <input type="checkbox" :checked="modesModal.selected.includes(option.value)" @change="toggleTaskMode(option.value)">
            <span class="task-mode-icon">{{ option.icon }}</span>
            <span class="task-mode-text">
              <strong>{{ option.label }}</strong>
              <small>{{ option.description }}</small>
            </span>
          </label>
        </div>
      </div>
      <p class="task-modes-count" :style="{ color: modesModal.selected.length < 4 ? 'var(--error-color, #dc2626)' : 'var(--text-secondary)' }">
        {{ modesModal.selected.length }} seleccionados · mínimo 4
      </p>
      <p v-if="modesModal.error" style="color: var(--error-color, #dc2626); font-size: .85rem;">{{ modesModal.error }}</p>
      <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:20px;">
        <button type="button" class="btn-secondary" @click="modesModal.open = false">Cancelar</button>
        <button type="button" class="btn-primary" :disabled="modesModal.selected.length < 4 || modesModal.saving" @click="saveTaskModes">
          {{ modesModal.saving ? 'Guardando…' : 'Guardar evaluación' }}
        </button>
      </div>
    </div>
  </div>

  <!-- MODAL: Importar estudiantes por lote -->
  <div id="modal-batch-students" class="modal" :class="{ show: batch.open }" :style="{ display: batch.open ? 'flex' : 'none' }">
    <div class="modal-overlay" @click="batch.open = false"></div>
    <div class="modal-content">
      <button class="modal-close" @click="batch.open = false">&times;</button>
      <div class="modal-header">
        <h2>Importar Estudiantes</h2>
        <p class="modal-subtitle">Sube un archivo .txt o .csv con un DNI por línea (o separados por comas/tabulaciones)</p>
      </div>
      <div class="form-group" style="margin-top:16px;">
        <label>Archivo (.txt o .csv)</label>
        <input id="batch-file-input" ref="batchFileInput" type="file" accept=".txt,.csv" style="margin-top:6px;" @change="parseBatchFile">
      </div>
      <div v-if="batch.dnis.length" id="batch-preview" style="margin-top:16px;">
        <div id="batch-preview-valid" style="background:var(--glass-bg);border:1px solid var(--glass-border);border-radius:8px;padding:12px;max-height:180px;overflow-y:auto;font-family:monospace;font-size:.82rem;">{{ batch.dnis.join('  ·  ') }}</div>
        <p id="batch-preview-count" style="margin-top:8px;font-size:.85rem;color:var(--text-secondary);">
          {{ batch.dnis.length }} DNI{{ batch.dnis.length !== 1 ? 's' : '' }} detectado{{ batch.dnis.length !== 1 ? 's' : '' }} (sin duplicados)
        </p>
      </div>
      <div v-if="batch.error" id="batch-error" style="margin-top:12px;color:#dc2626;font-size:.85rem;">{{ batch.error }}</div>
      <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:20px;">
        <button type="button" class="btn-secondary" @click="batch.open = false">Cancelar</button>
        <button id="batch-confirm-btn" type="button" class="btn-primary" :disabled="!batch.dnis.length || batch.importing" @click="confirmBatchImport">
          {{ batch.importing ? 'Importando...' : 'Importar' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// Migración de public/classroom_admin.html y public/classroom_admin.js: panel
// del docente (cursos, tareas, secciones y sus alumnos, disputas de notas y
// trabajos entregados con exportación a CSV y PDF).
import { computed, nextTick, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import MenuToggle from '@/components/MenuToggle.vue';
import { api, apiFetch, errorMessage } from '@/lib/api';
import { dialog } from '@/lib/dialog';
import { escapeHtml } from '@/lib/markdown';
import { goToPage } from '@/lib/pages';
import { useRealtime } from '@/lib/realtime';
import { currentUser } from '@/lib/session';

type Tab = 'classes' | 'info' | 'create' | 'list' | 'plans' | 'submissions' | 'concepts';
type Id = number | string;

interface Course {
  id: Id;
  title: string;
  description?: string | null;
  created_at?: string | null;
}

interface Task {
  id: Id;
  title: string;
  course_id?: Id;
  course_title?: string;
  section_id?: Id | null;
  section_name?: string | null;
  due_date?: string | null;
  grading_mode?: 'formative' | 'summative' | string | null;
  submission_type?: string | null;
  description?: string | null;
  max_score?: number | null;
  published_at?: string | null;
  activity_modes?: string | null;
}

interface Dispute {
  id: Id;
  course_id?: Id;
  assignment_title: string;
  first_name?: string;
  last_name?: string;
  score: number;
  max_score: number;
  submitted_at: string;
  dispute_reason?: string;
}

interface Section {
  id: Id;
  name: string;
  course_id?: Id;
  course_title?: string;
  student_count: number;
  invite_code?: string | null;
  start_date?: string | null;
  classroom?: string | null;
}

interface SectionStudent {
  user_dni: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  avatar_r2_key?: string | null;
  is_registered?: boolean;
}

interface SubmissionRow {
  user_dni?: string;
  first_name?: string;
  last_name?: string;
  assignment_title?: string;
  course_id?: Id;
  section_id?: Id | null;
  section_name?: string;
  score?: number | null;
  max_score?: number;
  status?: string;
  submitted_at?: string;
  feedback?: string | Record<string, unknown> | null;
  professor_feedback?: string;
}

const CLASS_TABS: { id: Tab; label: string }[] = [
  { id: 'info', label: 'ℹ️ Información' },
  { id: 'list', label: '📋 Mis Tareas' },
  { id: 'create', label: '➕ Crear Tarea' },
  { id: 'plans', label: '📚 Planes' },
  { id: 'concepts', label: '📈 Conceptos' },
  { id: 'submissions', label: '📊 Trabajos' },
];

const router = useRouter();
const dni = computed(() => currentUser.value?.dni ?? '');
const authorized = ref(false);
const tab = ref<Tab>('classes');
const selectedCourseId = ref('');

const selectedCourse = computed(() =>
  courses.value.find((c) => String(c.id) === selectedCourseId.value) ?? null,
);

const currentSection = ref<Section | null>(null);
const classTasks = computed(() =>
  selectedCourseId.value
    ? tasks.items.filter((t) => String(t.course_id) === selectedCourseId.value)
    : tasks.items,
);

const classStudentCount = computed(() => Number(currentSection.value?.student_count) || sectionStudents.items.length);

const filteredDisputes = computed(() =>
  selectedCourseId.value
    ? disputes.items.filter((d) => String(d.course_id) === selectedCourseId.value)
    : disputes.items,
);

const visiblePlans = computed(() =>
  selectedCourseId.value
    ? plans.items.filter((p) => String(p.course_id) === selectedCourseId.value)
    : plans.items,
);

function selectCourse(course: Course) {
  selectedCourseId.value = String(course.id);
  taskForm.courseId = String(course.id);
  planForm.courseId = String(course.id);
  planForm.sectionIds = [];
  conceptAssignment.value = '';
  selectedSection.value = '';
  currentSection.value = null;
  sectionStudents.items = [];
  sectionStudents.state = 'idle';
  tab.value = 'info';
  void loadTasks();
  void loadPlans();
  void refreshCourseSections();
}

function backToClasses() {
  selectedCourseId.value = '';
  conceptAssignment.value = '';
  currentSection.value = null;
  selectedSection.value = '';
  sectionStudents.items = [];
  tab.value = 'classes';
}

function sectionLink(section: Section): string {
  return `${window.location.origin}/classroom?join=${encodeURIComponent(section.invite_code || '')}`;
}

const currentSectionLink = computed(() =>
  currentSection.value ? sectionLink(currentSection.value) : '',
);

async function copyLink(link: string) {
  try {
    await navigator.clipboard.writeText(link);
    await dialog.alert(`🔗 Enlace copiado al portapapeles:\n\n${link}`);
  } catch {
    await dialog.prompt('Copia este enlace para invitar a tus estudiantes:', { defaultValue: link });
  }
}

// Al entrar a una clase se cargan sus secciones (la actual o la primera) y la
// lista de estudiantes de la sección elegida.
async function refreshCourseSections() {
  await loadSections();
  if (!selectedCourseId.value) return;
  const list = courseSections.value;
  const still = list.find((s) => String(s.id) === selectedSection.value);
  if (still) {
    currentSection.value = still;
    await loadSectionStudents();
    return;
  }
  const first = list[0];
  if (first) {
    await selectSection(first);
  } else {
    currentSection.value = null;
    selectedSection.value = '';
    sectionStudents.items = [];
    sectionStudents.state = 'idle';
  }
}

async function selectSection(section: Section) {
  selectedSection.value = String(section.id);
  currentSection.value = section;
  await loadSectionStudents();
}

// Resuelve la sección a la que se asignan tareas/planes: la actual si es de la
// misma clase; si no, la primera de la clase; si no hay, crea la de defecto.
async function resolveCourseSection(courseId: string): Promise<string | null> {
  if (currentSection.value && String(currentSection.value.course_id) === String(courseId)) {
    return String(currentSection.value.id);
  }
  const local = sections.value.find((s) => String(s.course_id) === String(courseId));
  if (local) return String(local.id);
  try {
    const { ok, data } = await api.post<Section>('/api/course-section', { course_id: courseId });
    if (ok && data?.id) {
      if (String(courseId) === selectedCourseId.value) {
        currentSection.value = data;
        selectedSection.value = String(data.id);
      }
      return String(data.id);
    }
  } catch {
    // Sin sección: la tarea se crea sin auto-asignar estudiantes.
  }
  return null;
}

function switchTab(t: Tab) {
  if (t !== 'classes' && !selectedCourseId.value) {
    tab.value = 'classes';
    return;
  }
  tab.value = t;
  if (t === 'list') void loadTasks();
  else if (t === 'plans') void loadPlans();
  else if (t === 'submissions') void loadSubmissions();
  else if (t === 'concepts') {
    if (!tasks.items.length) void loadTasks();
    void loadConceptReport();
  }
}

const reason = (err: unknown) => (err instanceof Error ? err.message : String(err));

// ── Cursos ────────────────────────────────────────────────────────────────
const courses = ref<Course[]>([]);
const coursesFailed = ref(false);
const courseModal = ref(false);
const courseForm = reactive({ title: '', description: '' });

async function loadCourses() {
  try {
    const { ok, status, data } = await api.get<Course[]>(`/api/user-courses?user_dni=${encodeURIComponent(dni.value)}`);
    if (!ok) throw new Error(`HTTP ${status}`);
    if (!Array.isArray(data)) throw new Error('Respuesta inválida del servidor');
    courses.value = data;
    coursesFailed.value = false;
  } catch (err) {
    console.error('Error cargando cursos:', err);
    courses.value = [];
    coursesFailed.value = true;
  }
}

async function createCourse() {
  try {
    const { ok, data } = await api.post('/api/create-course', { title: courseForm.title, description: courseForm.description, user_dni: dni.value });
    if (ok) {
      dialog.alert('✅ Curso creado con éxito');
      courseModal.value = false;
      Object.assign(courseForm, { title: '', description: '' });
      await loadCourses();
    } else {
      dialog.alert('❌ Error: ' + errorMessage(data, ''));
    }
  } catch {
    dialog.alert('Error de conexión');
  }
}

// ── Tareas ────────────────────────────────────────────────────────────────
const taskForm = reactive({ title: '', courseId: '', description: '', due: '', score: '100', submissionType: 'document', gradingMode: 'summative' });
const taskError = ref('');
const tasks = reactive({ state: 'loading' as 'loading' | 'ready' | 'error', items: [] as Task[] });
const filteredTasks = computed(() => classTasks.value);
const studentCounts = reactive<Record<string, number>>({});

interface TaskModeOption {
  value: string;
  label: string;
  icon: string;
  description: string;
}

interface TaskModeGroup {
  id: string;
  label: string;
  icon: string;
  options: TaskModeOption[];
}

const TASK_MODE_GROUPS: TaskModeGroup[] = [
  {
    id: 'conceptos',
    label: 'Conceptos',
    icon: '🧠',
    options: [
      { value: 'document', label: 'Documento o imagen', icon: '📄', description: 'Sube PDF, DOCX o imagen.' },
      { value: 'quiz4', label: 'Quiz 4', icon: '🅰️', description: '10 preguntas con 4 opciones.' },
      { value: 'quiz_free', label: 'Quiz libre', icon: '✍️', description: '10 preguntas de respuesta abierta.' },
      { value: 'flashcards', label: 'Flashcards', icon: '🃏', description: 'Memoriza con repetición espaciada.' },
      { value: 'find_error', label: 'Detecta el error', icon: '🔍', description: 'Encuentra las oraciones incorrectas.' },
      { value: 'recall', label: 'Recuerdo libre', icon: '🧠', description: 'Explica el tema de memoria.' },
      { value: 'summary', label: 'Resumen con límite', icon: '📝', description: 'Sintetiza el texto en pocas palabras.' },
      { value: 'concept_map', label: 'Mapa conceptual', icon: '🗺️', description: 'Conecta los conceptos clave.' },
    ],
  },
  {
    id: 'programacion',
    label: 'Programación',
    icon: '💻',
    options: [
      { value: 'predict_output', label: 'Predice la salida', icon: '🔮', description: 'Adivina qué imprimirá el código.' },
      { value: 'find_bug', label: 'Encuentra el bug', icon: '🐞', description: 'Marca las líneas con errores.' },
      { value: 'order_code', label: 'Ordena el código', icon: '🔀', description: 'Reordena las líneas del programa.' },
    ],
  },
  {
    id: 'multijugador',
    label: 'Multijugador',
    icon: '🎮',
    options: [
      { value: 'ludo', label: 'Ludo multijugador', icon: '🎲', description: 'Juega con la clase y suma puntos.' },
    ],
  },
];

const TASK_MODE_OPTIONS = TASK_MODE_GROUPS.flatMap((group) => group.options);

const ALL_TASK_MODES: string[] = TASK_MODE_OPTIONS.map((option) => option.value);

function parseTaskModeList(raw?: string | null): string[] {
  if (!raw) return [...ALL_TASK_MODES];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const valid = parsed.map((value) => String(value)).filter((value) => ALL_TASK_MODES.includes(value));
      if (valid.length) return valid;
    }
  } catch {
    // Se usa la lista completa.
  }
  return [...ALL_TASK_MODES];
}

const modesModal = reactive({
  open: false,
  task: null as Task | null,
  selected: [] as string[],
  error: '',
  saving: false,
});

function taskModeCount(task: Task): number {
  return parseTaskModeList(task.activity_modes).length;
}

function openTaskModes(task: Task) {
  modesModal.task = task;
  modesModal.selected = parseTaskModeList(task.activity_modes);
  modesModal.error = '';
  modesModal.saving = false;
  modesModal.open = true;
}

function toggleTaskMode(mode: string) {
  const index = modesModal.selected.indexOf(mode);
  if (index >= 0) modesModal.selected.splice(index, 1);
  else modesModal.selected.push(mode);
}

async function saveTaskModes() {
  if (!modesModal.task) return;
  modesModal.error = '';
  if (modesModal.selected.length < 4) {
    modesModal.error = 'Debes dejar activos al menos 4 modos.';
    return;
  }
  modesModal.saving = true;
  try {
    const { ok, data } = await api.post<{ modes?: string[]; error?: string }>('/api/set-assignment-modes', {
      id: modesModal.task.id,
      modes: modesModal.selected,
    });
    if (!ok) {
      modesModal.error = errorMessage(data, 'No se pudieron guardar los modos.');
      return;
    }
    modesModal.task.activity_modes = JSON.stringify(data.modes || modesModal.selected);
    modesModal.open = false;
    await loadTasks();
  } catch {
    modesModal.error = 'Error de conexión. Inténtalo de nuevo.';
  } finally {
    modesModal.saving = false;
  }
}


function onCourseSelect() {
  // La opción "+ Agregar Nuevo Curso" abre el modal en vez de quedarse elegida.
  if (taskForm.courseId === '__ADD_NEW__') {
    taskForm.courseId = '';
    courseModal.value = true;
  }
}

function resetTaskForm() {
  Object.assign(taskForm, { title: '', courseId: '', description: '', due: '', score: '100', submissionType: 'document', gradingMode: 'summative' });
  taskError.value = '';
}

// Edición de tareas en borrador y publicación.
const editOpen = ref(false);
const editError = ref('');
const editForm = reactive({
  id: '' as Id,
  title: '',
  description: '',
  due: '',
  score: '100',
  submissionType: 'document',
  gradingMode: 'summative',
});

function toDateTimeInput(value?: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function editTask(task: Task) {
  editError.value = '';
  Object.assign(editForm, {
    id: task.id,
    title: task.title,
    description: task.description || '',
    due: toDateTimeInput(task.due_date),
    score: String(task.max_score ?? 100),
    submissionType: task.submission_type || 'document',
    gradingMode: task.grading_mode === 'formative' ? 'formative' : 'summative',
  });
  editOpen.value = true;
}

async function saveTaskEdit() {
  editError.value = '';
  if (!editForm.title.trim()) {
    editError.value = 'El título es obligatorio.';
    return;
  }
  try {
    const { ok, data } = await api.post('/api/update-assignment', {
      id: editForm.id,
      title: editForm.title,
      description: editForm.description,
      due_date: editForm.due || null,
      max_score: editForm.score,
      submission_type: editForm.submissionType,
      grading_mode: editForm.gradingMode,
    });
    if (!ok) {
      editError.value = errorMessage(data, 'No se pudo guardar la tarea.');
      return;
    }
    editOpen.value = false;
    await loadTasks();
  } catch {
    editError.value = 'Error de conexión. Inténtalo de nuevo.';
  }
}

async function publishTask(task: Task) {
  if (!(await dialog.confirm(`¿Publicar "${task.title}"? Después de publicarla ya no podrás modificar su contenido.`))) return;
  try {
    const { ok, data } = await api.post('/api/publish-assignment', { id: task.id, publish: true });
    if (!ok) {
      dialog.alert('❌ ' + errorMessage(data, 'No se pudo publicar la tarea.'));
      return;
    }
    await loadTasks();
    dialog.alert('✅ Tarea publicada: ya es visible para los estudiantes.');
  } catch {
    dialog.alert('Error de conexión');
  }
}

function newTask() {
  switchTab('create');
  resetTaskForm();
  taskForm.courseId = selectedCourseId.value;
  void nextTick(() => {
    document.getElementById('create-task-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    (document.getElementById('task-title') as HTMLInputElement | null)?.focus();
  });
}

async function createTask() {
  taskError.value = '';
  if (!taskForm.title.trim()) {
    taskError.value = 'El título de la tarea es obligatorio.';
    return;
  }
  if (!taskForm.courseId) {
    taskError.value = 'Por favor selecciona un curso.';
    return;
  }
  try {
    const sectionId = await resolveCourseSection(taskForm.courseId);
    const { ok, data } = await api.post('/api/create-assignment', {
      title: taskForm.title,
      course_id: taskForm.courseId,
      description: taskForm.description,
      due_date: taskForm.due,
      max_score: taskForm.score,
      section_id: sectionId,
      submission_type: taskForm.submissionType,
      grading_mode: taskForm.gradingMode,
    });
    if (ok) {
      dialog.alert('✅ Tarea creada');
      resetTaskForm();
      switchTab('list');
    } else {
      taskError.value = errorMessage(data, 'No se pudo crear la tarea.');
    }
  } catch {
    taskError.value = 'Error de conexión. Inténtalo de nuevo.';
  }
}

async function loadTasks() {
  tasks.state = 'loading';
  try {
    const { ok, status, data } = await api.get<Task[]>('/api/admin-tasks');
    if (!ok) throw new Error(`HTTP ${status}`);
    if (!Array.isArray(data)) throw new Error('Respuesta inválida');
    tasks.items = data;
    tasks.state = 'ready';
    for (const t of data) void countStudents(t.id);
  } catch (err) {
    console.error('Error cargando tareas:', err);
    tasks.state = 'error';
  }
}

async function countStudents(taskId: Id) {
  try {
    const { data } = await api.get<unknown[]>(`/api/task-students?assignment_id=${encodeURIComponent(String(taskId))}`);
    if (Array.isArray(data)) studentCounts[String(taskId)] = data.length;
  } catch (e) {
    console.error(e);
  }
}

async function deleteTask(id: Id) {
  if (!(await dialog.confirm('¿Eliminar esta tarea? Se borrarán todas las entregas.'))) return;
  try {
    const { ok } = await api.delete(`/api/delete-assignment?id=${encodeURIComponent(String(id))}`);
    if (!ok) {
      dialog.alert('Error al eliminar');
      return;
    }
    await loadTasks();
    await loadCourses();
  } catch {
    dialog.alert('Error de conexión');
  }
}

// ── Planes de evaluación ─────────────────────────────────────────────────
const PLAN_SCORES = [10, 20, 25, 50, 100];

interface PlanAssignment {
  id: string;
  title: string;
  description: string;
  topics: string[];
  content?: string;
  due_date: string | null;
  max_score: number;
}

interface EvaluationPlanResult {
  plan: {
    id: string;
    title: string;
    strategy: string;
    max_score: number;
    points_per_evaluation: number;
    evaluation_count: number;
    source_filename: string;
  };
  evaluations: PlanAssignment[];
  assignments_created: number;
}

interface EvaluationPlanRow {
  id: string;
  title: string;
  strategy?: string;
  source_filename?: string;
  max_score: number;
  points_per_evaluation: number;
  evaluation_count: number;
  created_at: string;
  course_id?: string;
  course_title?: string;
  section_id?: string | null;
  assignments: { id: string; title: string; max_score: number }[];
}

const planForm = reactive({ courseId: '', maxScore: '20', count: '4', sectionIds: [] as string[] });
const planFile = ref<File | null>(null);
const planState = reactive({ generating: false, error: '', fileName: '', result: null as EvaluationPlanResult | null });
const plans = reactive({ state: 'idle' as 'idle' | 'loading' | 'ready' | 'error', items: [] as EvaluationPlanRow[] });

function divisorsOf(total: number): number[] {
  const list: number[] = [];
  for (let n = 1; n <= total; n++) if (total % n === 0) list.push(n);
  return list;
}

const planCountOptions = computed(() => divisorsOf(Number(planForm.maxScore) || 20));
const planPointsPerEvaluation = computed(() => {
  const score = Number(planForm.maxScore) || 0;
  const count = Number(planForm.count) || 1;
  return Math.round((score / count) * 100) / 100;
});

const allPlanSectionsSelected = computed(() =>
  courseSections.value.length > 0 && planForm.sectionIds.length === courseSections.value.length,
);

function toggleAllPlanSections() {
  planForm.sectionIds = allPlanSectionsSelected.value
    ? []
    : courseSections.value.map((s) => String(s.id));
}

function onPlanMaxScoreChange() {
  const options = planCountOptions.value;
  if (!options.includes(Number(planForm.count))) {
    planForm.count = String(options.includes(4) ? 4 : options[Math.min(2, options.length - 1)] || 1);
  }
}

function onPlanFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  planState.error = '';
  planState.result = null;
  const file = input.files?.[0] ?? null;
  planFile.value = file;
  planState.fileName = file?.name ?? '';
}

async function createEvaluationPlan() {
  planState.error = '';
  planState.result = null;
  if (!planFile.value) {
    planState.error = 'Selecciona un archivo del documento.';
    return;
  }
  if (!planForm.courseId) {
    planState.error = 'Selecciona una materia.';
    return;
  }
  if (!planForm.sectionIds.length) {
    planState.error = 'Selecciona al menos una sección para asignar las actividades.';
    return;
  }

  const form = new FormData();
  form.append('file', planFile.value);
  form.append('course_id', planForm.courseId);
  form.append('section_ids', planForm.sectionIds.join(','));
  form.append('max_score', planForm.maxScore);
  form.append('evaluation_count', planForm.count);

  planState.generating = true;
  try {
    const res = await apiFetch('/api/create-evaluation-plan', { method: 'POST', body: form });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      planState.error = errorMessage(data, 'No se pudo crear el plan de evaluación.');
      return;
    }
    planState.result = data as EvaluationPlanResult;
    await loadTasks();
    await loadPlans();
  } catch {
    planState.error = 'Error de conexión. Inténtalo de nuevo.';
  } finally {
    planState.generating = false;
  }
}

async function deletePlan(plan: EvaluationPlanRow) {
  const count = plan.assignments.length;
  const message = count
    ? `¿Eliminar el plan "${plan.title}" y sus ${count} tarea${count !== 1 ? 's' : ''}? Se borrarán también las entregas.`
    : `¿Eliminar el plan "${plan.title}"?`;
  if (!(await dialog.confirm(message))) return;
  try {
    const { ok } = await api.delete(`/api/delete-evaluation-plan?id=${encodeURIComponent(plan.id)}`);
    if (!ok) {
      dialog.alert('Error al eliminar el plan');
      return;
    }
    if (planState.result?.plan.id === plan.id) planState.result = null;
    await loadPlans();
    await loadTasks();
    await loadCourses();
  } catch {
    dialog.alert('Error de conexión');
  }
}

async function loadPlans() {
  plans.state = 'loading';
  try {
    const { ok, status, data } = await api.get<{ plans?: EvaluationPlanRow[] }>('/api/evaluation-plans');
    if (!ok) throw new Error(`HTTP ${status}`);
    plans.items = Array.isArray(data.plans) ? data.plans : [];
    plans.state = 'ready';
  } catch (err) {
    console.error('Error cargando planes:', err);
    plans.items = [];
    plans.state = 'error';
  }
}

// ── Disputas ──────────────────────────────────────────────────────────────
const disputes = reactive({ state: 'loading' as 'loading' | 'ready' | 'error', items: [] as Dispute[] });

async function loadDisputes() {
  disputes.state = 'loading';
  try {
    const { ok, status, data } = await api.get<Dispute[]>('/api/professor-disputes');
    if (!ok) throw new Error(`HTTP ${status}`);
    disputes.items = Array.isArray(data) ? data : [];
    disputes.state = 'ready';
  } catch (err) {
    console.error('Error cargando disputas:', err);
    disputes.state = 'error';
  }
}

async function reviewDispute(submissionId: Id, maxScore: number) {
  const input = await dialog.prompt(`Ingresa la nueva nota (0-${maxScore}):`);
  if (input === null) return;
  const note = parseInt(input, 10);
  if (Number.isNaN(note) || note < 0 || note > maxScore) {
    dialog.alert('Nota inválida. Debe ser un número entre 0 y ' + maxScore);
    return;
  }
  const feedback = await dialog.prompt('Ingresa tu retroalimentación para el estudiante (opcional):') || '';
  try {
    const { ok, data } = await api.post<{ new_score?: number; error?: string }>('/api/professor-update-grade', {
      submission_id: submissionId,
      new_score: note,
      feedback,
    });
    if (!ok) throw new Error(errorMessage(data, 'Error al actualizar nota'));
    dialog.alert(`✅ Nota actualizada a ${data.new_score}/${maxScore}. La disputa ha sido resuelta.`);
    await loadDisputes();
    await loadTasks();
  } catch (err) {
    console.error('Error:', err);
    dialog.alert('❌ Error al actualizar nota: ' + reason(err));
  }
}

// ── Estudiantes de la clase ───────────────────────────────────────────────
const sections = ref<Section[]>([]);
const sectionsState = ref<'loading' | 'ready' | 'error'>('loading');
const totalStudents = computed(() => sections.value.reduce((sum, s) => sum + (Number(s.student_count) || 0), 0));
const courseSections = computed(() =>
  selectedCourseId.value
    ? sections.value.filter((s) => String(s.course_id) === selectedCourseId.value)
    : [],
);
const sectionForm = reactive({ name: '', startDate: '', classroom: '', saving: false });
const selectedSection = ref('');
const sectionStudentDni = ref('');
const sectionStudents = reactive({ state: 'idle' as 'idle' | 'ready' | 'error', items: [] as SectionStudent[] });
const sectionStudentsEl = ref<HTMLElement | null>(null);
const brokenAvatars = reactive(new Set<string>());

function formatDate(value?: string | null): string {
  if (!value) return 'Sin definir';
  const date = new Date(value);
  if (isNaN(date.getTime())) return value;
  return date.toLocaleDateString();
}

async function createSection() {
  if (!selectedCourseId.value) return;
  const name = sectionForm.name.trim();
  if (!name) {
    dialog.alert('Escribe el nombre de la sección');
    return;
  }
  sectionForm.saving = true;
  try {
    const { ok, data } = await api.post<Section>('/api/create-section', {
      course_id: selectedCourseId.value,
      name,
      start_date: sectionForm.startDate || null,
      classroom: sectionForm.classroom.trim() || null,
    });
    if (!ok) {
      dialog.alert('❌ Error: ' + errorMessage(data, 'No se pudo crear la sección.'));
      return;
    }
    Object.assign(sectionForm, { name: '', startDate: '', classroom: '', saving: false });
    await loadSections();
    const created = data?.id
      ? sections.value.find((s) => String(s.id) === String(data.id))
      : undefined;
    if (created) await selectSection(created);
    dialog.alert('✅ Sección creada con su enlace de registro.');
  } catch {
    dialog.alert('Error de conexión');
  } finally {
    sectionForm.saving = false;
  }
}

async function ensureSectionLink(section: Section) {
  try {
    const { ok, data } = await api.post<{ code?: string }>('/api/section-invite', { section_id: section.id });
    if (!ok || !data.code) {
      dialog.alert('No se pudo generar el enlace de la sección.');
      return;
    }
    await loadSections();
    const updated = sections.value.find((s) => String(s.id) === String(section.id));
    if (updated && selectedSection.value === String(section.id)) currentSection.value = updated;
  } catch {
    dialog.alert('Error de conexión');
  }
}

async function deleteSection(section: Section) {
  if (!(await dialog.confirm(`¿Eliminar la sección "${section.name}"? Se quitarán sus estudiantes y enlace.`))) return;
  try {
    const { ok } = await api.delete(`/api/delete-section?id=${encodeURIComponent(String(section.id))}`);
    if (!ok) {
      dialog.alert('No se pudo eliminar la sección.');
      return;
    }
    if (selectedSection.value === String(section.id)) {
      selectedSection.value = '';
      currentSection.value = null;
      sectionStudents.items = [];
      sectionStudents.state = 'idle';
    }
    await refreshCourseSections();
  } catch {
    dialog.alert('Error de conexión');
  }
}

async function loadSections() {
  try {
    const { ok, status, data } = await api.get<Section[]>('/api/sections');
    if (!ok) throw new Error(`HTTP ${status}`);
    sections.value = Array.isArray(data) ? data : [];
    sectionsState.value = 'ready';
  } catch (err) {
    console.error('Error cargando estudiantes por clase:', err);
    sectionsState.value = 'error';
  }
}

async function loadSectionStudents() {
  const sectionId = selectedSection.value;
  if (!sectionId) return;
  try {
    const { data } = await api.get<SectionStudent[]>(`/api/section-students?section_id=${encodeURIComponent(sectionId)}`);
    if (!Array.isArray(data)) throw new Error('Respuesta inválida');
    sectionStudents.items = data;
    sectionStudents.state = 'ready';
    if (currentSection.value) currentSection.value.student_count = data.length;
  } catch {
    sectionStudents.items = [];
    sectionStudents.state = 'error';
  }
}

async function addStudentToSection() {
  const userDni = sectionStudentDni.value.trim();
  if (!selectedSection.value || !userDni) {
    dialog.alert('Escribe la cédula del estudiante');
    return;
  }
  try {
    const { ok, data } = await api.post('/api/section-add-student', { section_id: selectedSection.value, user_dni: userDni });
    if (ok) {
      sectionStudentDni.value = '';
      await loadSectionStudents();
      await loadSections();
    } else {
      dialog.alert('❌ Error: ' + errorMessage(data, ''));
    }
  } catch {
    dialog.alert('Error de conexión');
  }
}

async function removeStudentFromSection(userDni: string) {
  if (!(await dialog.confirm('¿Quitar a este estudiante de la clase?'))) return;
  try {
    const { ok } = await api.delete('/api/section-remove-student', { section_id: selectedSection.value, user_dni: userDni });
    if (ok) {
      await loadSectionStudents();
      await loadSections();
    }
  } catch {
    dialog.alert('Error de conexión');
  }
}

function fullName(s: { first_name?: string; last_name?: string }): string {
  return [s.first_name, s.last_name].filter(Boolean).join(' ');
}

function initials(s: SectionStudent): string {
  return (
    [s.first_name, s.last_name]
      .filter((n): n is string => !!n)
      .map((n) => n[0]!.toUpperCase())
      .join('')
      .slice(0, 2) || s.user_dni.slice(0, 2).toUpperCase()
  );
}

/** "ana.lopez@gmail.com" → "a*****z@g****.com" */
function censorEmail(email?: string): string | null {
  if (!email) return null;
  const [local, domain] = email.split('@');
  if (!local || !domain) return null;
  const [host = '', ...rest] = domain.split('.');
  const ext = rest.join('.');
  return `${local[0]}*****${local[local.length - 1]}@${host[0] ?? ''}****${ext ? `.${ext}` : ''}`;
}

// ── Importación por lote ──────────────────────────────────────────────────
const batch = reactive({ open: false, dnis: [] as string[], error: '', importing: false });
const batchFileInput = ref<HTMLInputElement | null>(null);

function openBatchModal() {
  if (!selectedSection.value) {
    dialog.alert('Abre una clase primero');
    return;
  }
  Object.assign(batch, { open: true, dnis: [], error: '', importing: false });
  if (batchFileInput.value) batchFileInput.value.value = '';
}

// Se acepta la cédula pelada ("30840119") o el formato canónico
// ("V-30840119"), y se normaliza al segundo, que es el que guarda users.dni.
function normalizeDni(raw: string): string | null {
  const value = raw.trim().toUpperCase().replace(/\s+/g, '');
  if (!value) return null;
  const candidate = /^\d+$/.test(value) ? `V-${value}` : value;
  return /^[A-Z]{1,5}-[A-Z0-9]{5,15}$/.test(candidate) ? candidate : null;
}

async function parseBatchFile() {
  batch.error = '';
  batch.dnis = [];
  const file = batchFileInput.value?.files?.[0];
  if (!file) return;
  const tokens = (await file.text())
    .split(/[\n\r,\t]+/)
    .map((t) => t.trim())
    .filter(Boolean);
  const invalid = tokens.filter((t) => !normalizeDni(t));
  if (invalid.length) {
    batch.error = `❌ El archivo contiene cédulas inválidas: ${invalid.slice(0, 5).join(', ')}${invalid.length > 5 ? '...' : ''}. Corrige el archivo e intenta de nuevo.`;
    return;
  }
  if (!tokens.length) {
    batch.error = '❌ El archivo está vacío o no contiene DNIs válidos.';
    return;
  }
  batch.dnis = [...new Set(tokens.map((t) => normalizeDni(t)!))];
}

async function confirmBatchImport() {
  if (!selectedSection.value || !batch.dnis.length) return;
  batch.importing = true;
  try {
    const { ok, data } = await api.post<{ inserted?: number; skipped?: number; error?: string }>('/api/section-add-students-batch', {
      section_id: selectedSection.value,
      dnis: batch.dnis,
    });
    if (ok) {
      batch.open = false;
      await loadSections();
      await loadSectionStudents();
      const inserted = data.inserted ?? 0;
      const skipped = data.skipped ?? 0;
      dialog.alert(`✅ Importación completa: ${inserted} agregado${inserted !== 1 ? 's' : ''}, ${skipped} ya existía${skipped !== 1 ? 'n' : ''}.`);
    } else {
      dialog.alert('❌ Error: ' + (data.error || 'Error desconocido'));
    }
  } catch {
    dialog.alert('Error de conexión');
  } finally {
    batch.importing = false;
  }
}

// ── Trabajos entregados ───────────────────────────────────────────────────
const submissions = reactive({ state: 'idle' as 'idle' | 'loading' | 'ready' | 'error', items: [] as SubmissionRow[] });
const subSearch = ref('');

async function loadSubmissions() {
  submissions.state = 'loading';
  try {
    const { ok, status, data } = await api.get<SubmissionRow[]>('/api/professor-submissions');
    if (!ok) throw new Error(`HTTP ${status}`);
    submissions.items = Array.isArray(data) ? data : [];
    submissions.state = 'ready';
  } catch (err) {
    console.error('Error cargando entregas:', err);
    submissions.state = 'error';
  }
}

const filteredSubmissions = computed(() => {
  const search = subSearch.value.toLowerCase().trim();
  return submissions.items.filter((s) => {
    const name = `${s.first_name || ''} ${s.last_name || ''}`.toLowerCase();
    const matchSearch = !search || name.includes(search) || (s.user_dni || '').toLowerCase().includes(search);
    const matchCourse = !selectedCourseId.value || String(s.course_id) === selectedCourseId.value;
    return matchSearch && matchCourse;
  });
});

/** Resumen de la retroalimentación de la IA (JSON { criterio: texto, general }). */
function feedbackSummary(raw: SubmissionRow['feedback'], max = Infinity): string {
  if (!raw) return '';
  try {
    const fb = (typeof raw === 'string' ? JSON.parse(raw) : raw) as Record<string, unknown>;
    const text = fb.general ? String(fb.general) : Object.values(fb).filter(Boolean).join(' | ').substring(0, max);
    return text;
  } catch {
    return String(raw).substring(0, max);
  }
}

interface SectionGradeReport {
  section: { id: string; name: string; course_title?: string };
  students: { dni: string; first_name?: string; last_name?: string }[];
  assignments: { id: string; title: string; max_score: number; due_date?: string | null }[];
  scores: Record<string, Record<string, { score: number | null; status?: string; submitted_at?: string }>>;
}

async function exportSectionExcel() {
  const sectionId = currentSection.value ? String(currentSection.value.id) : '';
  if (!sectionId) {
    dialog.alert('Abre una clase para descargar su reporte de notas.');
    return;
  }
  try {
    const { ok, data } = await api.get<SectionGradeReport & { error?: string }>(
      `/api/section-grade-report?section_id=${encodeURIComponent(sectionId)}`,
    );
    if (!ok) {
      dialog.alert('❌ ' + errorMessage(data, 'No se pudo generar el reporte.'));
      return;
    }
    if (!data.students.length) {
      dialog.alert('Esta clase todavía no tiene estudiantes.');
      return;
    }

    const cell = (v: unknown) => escapeHtml(String(v ?? ''));
    const headers = ['Estudiante', 'Cédula', ...data.assignments.map((a) => `${a.title} (/${a.max_score})`), 'Nota final'];
    const rows = data.students.map((student) => {
      const dni = String(student.dni || '').toUpperCase();
      const byAssignment = data.scores[dni] || {};
      let obtained = 0;
      let possible = 0;
      const cells = data.assignments.map((a) => {
        const entry = byAssignment[String(a.id)];
        possible += Number(a.max_score) || 0;
        if (!entry || entry.score === null || entry.score === undefined) return '';
        obtained += Number(entry.score) || 0;
        return String(entry.score);
      });
      const finalScore = possible > 0 ? `${obtained} / ${possible} (${((obtained / possible) * 100).toFixed(1)}%)` : '';
      return [fullName(student) || '—', student.dni || '—', ...cells, finalScore];
    });

    const html = `<!DOCTYPE html><html><head><meta http-equiv="Content-Type" content="text/html; charset=utf-8"></head><body>
      <h2>Notas — ${cell(data.section.name)}${data.section.course_title ? ` (${cell(data.section.course_title)})` : ''}</h2>
      <p>Exportado el ${new Date().toLocaleDateString('es')}</p>
      <table border="1"><thead><tr>${headers.map((h) => `<th>${cell(h)}</th>`).join('')}</tr></thead>
      <tbody>${rows.map((row) => `<tr>${row.map((v) => `<td>${cell(v)}</td>`).join('')}</tr>`).join('')}</tbody></table>
    </body></html>`;

    const blob = new Blob(['\ufeff', html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    const safeName = data.section.name.replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_|_$/g, '');
    link.download = `notas_${safeName || 'seccion'}_${new Date().toISOString().slice(0, 10)}.xls`;
    link.click();
    URL.revokeObjectURL(link.href);
  } catch {
    dialog.alert('Error de conexión');
  }
}

function exportExcel() {
  const list = filteredSubmissions.value;
  if (!list.length) {
    dialog.alert('No hay datos para exportar');
    return;
  }
  const headers = ['Estudiante', 'Cédula', 'Tarea', 'Nota IA', 'Nota Máxima', 'Estado', 'Fecha Entrega', 'Observaciones IA', 'Retroalimentación Profesor'];
  const rows = list.map((s) => [
    fullName(s),
    s.user_dni || '',
    s.assignment_title || '',
    s.score ?? '',
    s.max_score ?? '',
    s.status === 'completed' || s.status === 'evaluated' ? 'Calificado' : 'Pendiente',
    s.submitted_at ? new Date(s.submitted_at).toLocaleDateString('es') : '',
    feedbackSummary(s.feedback),
    s.professor_feedback || '',
  ]);
  const csv = [headers, ...rows].map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }));
  link.download = `trabajos_${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function exportPdf() {
  const list = filteredSubmissions.value;
  if (!list.length) {
    dialog.alert('No hay datos para exportar');
    return;
  }
  const cell = (v: unknown) => escapeHtml(String(v));
  const rows = list
    .map(
      (s) => `<tr>
            <td>${cell(fullName(s) || '—')}</td>
            <td>${cell(s.user_dni || '—')}</td>
            <td>${cell(s.assignment_title || '—')}</td>
            <td><b>${cell(s.score !== null && s.score !== undefined ? `${s.score} / ${s.max_score}` : '—')}</b></td>
            <td>${s.status === 'completed' || s.status === 'evaluated' ? 'Calificado' : 'Pendiente'}</td>
            <td>${cell(s.submitted_at ? new Date(s.submitted_at).toLocaleDateString('es') : '—')}</td>
            <td style="font-size:11px;">${cell(feedbackSummary(s.feedback) || '—')}</td>
        </tr>`,
    )
    .join('');
  const win = window.open('', '_blank');
  if (!win) return;
  win.document.write(`<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8">
<title>Trabajos Entregados</title>
<style>
  body { font-family: Arial, sans-serif; font-size: 13px; padding: 24px; color: #111; }
  h1 { font-size: 18px; margin-bottom: 4px; }
  p.subtitle { color: #555; font-size: 12px; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #1e1e2e; color: #fff; padding: 8px 6px; font-size: 11px; text-align: left; }
  td { padding: 7px 6px; border-bottom: 1px solid #e5e7eb; vertical-align: top; font-size: 12px; }
  tr:nth-child(even) td { background: #f9fafb; }
  @media print { @page { size: A4 landscape; margin: 1.5cm; } }
</style>
</head><body>
<h1>📊 Trabajos Entregados — Mirai AI</h1>
<p class="subtitle">Exportado el ${new Date().toLocaleDateString('es')} · ${list.length} registro${list.length !== 1 ? 's' : ''}</p>
<table>
  <thead><tr>
    <th>Estudiante</th><th>Cédula</th><th>Tarea</th>
    <th>Nota IA</th><th>Estado</th><th>Fecha</th><th>Observaciones IA</th>
  </tr></thead>
  <tbody>${rows}</tbody>
</table>
<script>window.onload = function(){ window.print(); }<\/script>
</body></html>`);
  win.document.close();
}

// ── Conceptos que falla la clase ──────────────────────────────────────────
interface ConceptRow {
  concept: string;
  failures: number;
  students: number;
  last_failure?: string | null;
}

const conceptAssignment = ref('');
const conceptReport = reactive({
  state: 'idle' as 'idle' | 'loading' | 'ready' | 'error',
  concepts: [] as ConceptRow[],
});

async function loadConceptReport() {
  conceptReport.state = 'loading';
  try {
    const params = new URLSearchParams();
    if (conceptAssignment.value) params.set('assignment_id', conceptAssignment.value);
    else if (selectedCourseId.value) params.set('course_id', selectedCourseId.value);
    const query = params.toString() ? `?${params.toString()}` : '';
    const { ok, status, data } = await api.get<{ concepts?: ConceptRow[] }>(`/api/professor-concept-report${query}`);
    if (!ok) throw new Error(`HTTP ${status}`);
    conceptReport.concepts = Array.isArray(data.concepts) ? data.concepts : [];
    conceptReport.state = 'ready';
  } catch (err) {
    console.error('Error cargando conceptos:', err);
    conceptReport.concepts = [];
    conceptReport.state = 'error';
  }
}

// ── Tiempo real: estudiantes o clases cambiadas ───────────────────────────
useRealtime('classroom', (raw) => {
  if ((raw as { sections?: unknown[] } | null)?.sections?.length) {
    void refreshCourseSections();
  }
});

// ── Arranque: solo docentes ───────────────────────────────────────────────
onMounted(async () => {
  try {
    const { status, data } = await api.get<{ is_professor?: boolean }>('/api/check-professor-role');
    if (status === 401) {
      goToPage(router, 'login');
      return;
    }
    if (!data.is_professor) {
      dialog.alert('⛔ Acceso denegado.');
      goToPage(router, '');
      return;
    }
  } catch (err) {
    console.error('Error verificando rol:', err);
    goToPage(router, 'login');
    return;
  }
  authorized.value = true;
  await loadCourses();
  await loadTasks();
  await loadDisputes();
  await loadSections();
});
</script>
