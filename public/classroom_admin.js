// classroom_admin.js - Versión Unificada de Tema

let currentUserDni = null;

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Auth Check (Sin redefinir fetch)
    currentUserDni = localStorage.getItem('mirai_user_dni');

    if (!currentUserDni) {
        window.location.href = 'login';
        return;
    }

    // 2. Verificar rol de profesor
    try {
        const checkResponse = await fetch('/api/check-professor-role', {
            credentials: 'same-origin'
        });
        if (checkResponse.status === 401) {
            window.location.href = 'login';
            return;
        }
        const checkData = await checkResponse.json();
        if (!checkData.is_professor) {
            alert('⛔ Acceso denegado.');
            window.location.href = '/';
            return;
        }
    } catch (error) {
        console.error('Error verificando rol:', error);
        window.location.href = 'login';
        return;
    }

    document.getElementById('professor-greeting').textContent = `Hola, Profesor ${currentUserDni}`;

    // 3. Inicializar UI (Tema y Menú delegados a MiraiApp)
    if (typeof MiraiApp !== 'undefined') {
        // MiraiApp ya inicializó el tema y el menú.
        // Solo aseguramos que el toggle funcione si no lo hizo MiraiApp completamente
        const themeToggle = document.getElementById('theme-toggle');
        if (themeToggle && !themeToggle.dataset.initialized) {
            themeToggle.addEventListener('click', () => {
                const current = document.documentElement.getAttribute('data-theme');
                const newTheme = current === 'light' ? 'dark' : 'light';
                document.documentElement.setAttribute('data-theme', newTheme);
                localStorage.setItem('mirai-ai-theme', newTheme);
                // Actualizar iconos
                const sun = document.querySelector('.sun-icon');
                const moon = document.querySelector('.moon-icon');
                if (sun && moon) {
                    if (newTheme === 'dark') { sun.classList.add('hidden'); moon.classList.remove('hidden'); }
                    else { sun.classList.remove('hidden'); moon.classList.add('hidden'); }
                }
                themeToggle.dataset.initialized = 'true';
            });
        }
    } else {
        // Fallback si MiraiApp no carga
        initLocalTheme();
    }

    // 4. Cargar datos
    setupLogout();
    setupTabs();
    setupCreateCourseModal();
    setupCreateTaskForm();
    setupStudentManagement();
    setupSectionManagement();

    await loadCourses();
    await loadTasksList();
    await loadStats();
    await loadDisputedAssignments();
    await loadSections();
});

// --- RESTO DE FUNCIONES (Sin cambios funcionales, solo limpieza) ---

async function loadCourses() {
    const select = document.getElementById('task-course-select');

    try {
        const res = await fetch(`/api/user-courses?user_dni=${currentUserDni}`);

        if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
        }

        const courses = await res.json();

        if (!Array.isArray(courses)) {
            throw new Error('Respuesta inválida del servidor');
        }

        window.userCourses = courses;

        select.innerHTML = '<option value="">Selecciona un curso...</option>';
        courses.forEach(course => {
            const opt = document.createElement('option');
            opt.value = course.id;
            opt.textContent = course.title;
            select.appendChild(opt);
        });

        const addOpt = document.createElement('option');
        addOpt.value = '__ADD_NEW__';
        addOpt.textContent = '+ Agregar Nuevo Curso';
        addOpt.style.fontWeight = 'bold';
        addOpt.style.color = 'var(--primary-color)';
        select.appendChild(addOpt);

        // Poblar select de materia en tab Secciones
        const secCourseSelect = document.getElementById('section-course-select');
        if (secCourseSelect) {
            secCourseSelect.innerHTML = '<option value="">Selecciona una materia...</option>';
            courses.forEach(course => {
                const opt = document.createElement('option');
                opt.value = course.id;
                opt.textContent = course.title;
                secCourseSelect.appendChild(opt);
            });
        }

        // Poblar select de sección en crear tarea
        const taskSectionSelect = document.getElementById('task-section-select');
        if (taskSectionSelect) {
            taskSectionSelect.innerHTML = '<option value="">Sin sección específica</option>';
            // Se llenará en loadSections()
        }

        updateStats();

    } catch (error) {
        console.error('Error cargando cursos:', error);
        window.userCourses = [];
        select.innerHTML = '<option value="">Sin cursos disponibles</option>';

        const addOpt = document.createElement('option');
        addOpt.value = '__ADD_NEW__';
        addOpt.textContent = '+ Agregar Nuevo Curso';
        addOpt.style.fontWeight = 'bold';
        addOpt.style.color = 'var(--primary-color)';
        addOpt.appendChild(addOpt);

        updateStats();
    }
}

function initLocalTheme() {
    const savedTheme = localStorage.getItem('mirai-ai-theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', savedTheme);
    const sun = document.querySelector('.sun-icon');
    const moon = document.querySelector('.moon-icon');
    if (sun && moon) {
        if (savedTheme === 'dark') { sun.classList.add('hidden'); moon.classList.remove('hidden'); }
        else { sun.classList.remove('hidden'); moon.classList.add('hidden'); }
    }
}

function setupCreateCourseModal() {
    const modal = document.getElementById('modal-new-course');
    const btnAdd = document.getElementById('btn-add-course');
    const form = document.getElementById('create-course-form');

    btnAdd.addEventListener('click', () => {
        modal.style.display = 'flex';
        setTimeout(() => modal.classList.add('show'), 10);
    });

    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const title = document.getElementById('new-course-name').value;
        const desc = document.getElementById('new-course-desc').value;

        try {
            const res = await fetch('/api/create-course', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title, description: desc, user_dni: currentUserDni })
            });

            if (res.ok) {
                const data = await res.json();
                alert('✅ Curso creado con éxito');
                closeModal();
                form.reset();
                await loadCourses();
            } else {
                const err = await res.json();
                alert('❌ Error: ' + err.error);
            }
        } catch (error) {
            alert('Error de conexión');
        }
    });
}

function closeModal() {
    const modal = document.getElementById('modal-new-course');
    modal.classList.remove('show');
    setTimeout(() => modal.style.display = 'none', 300);
}

function setupCreateTaskForm() {
    const form = document.getElementById('create-task-form');
    const select = document.getElementById('task-course-select');

    select.addEventListener('change', (e) => {
        if (e.target.value === '__ADD_NEW__') {
            document.getElementById('modal-new-course').style.display = 'flex';
            setTimeout(() => document.getElementById('modal-new-course').classList.add('show'), 10);
            e.target.value = '';
        }
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const title = document.getElementById('task-title').value;
        const courseId = document.getElementById('task-course-select').value;
        const desc = document.getElementById('task-desc').value;
        const due = document.getElementById('task-due').value;
        const score = document.getElementById('task-score').value;
        const sectionId = document.getElementById('task-section-select')?.value || '';

        if (!courseId) {
            alert('Por favor selecciona un curso');
            return;
        }

        try {
            const res = await fetch('/api/create-assignment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title, course_id: courseId, description: desc, due_date: due, max_score: score, section_id: sectionId || null })
            });

            if (res.ok) {
                alert('✅ Tarea creada');
                form.reset();
                switchTab('list');
                await loadTasksList();
            } else {
                const err = await res.json();
                alert('❌ Error: ' + err.error);
            }
        } catch (error) {
            alert('Error de conexión');
        }
    });
}

async function loadTasksList() {
    const tbody = document.getElementById('tasks-list-body');
    const studentSelect = document.getElementById('student-task-select');

    tbody.innerHTML = '<tr><td colspan="5">Cargando...</td></tr>';
    studentSelect.innerHTML = '<option value="">Selecciona una tarea...</option>';

    try {
        const res = await fetch('/api/admin-tasks');

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const tasks = await res.json();

        if (!Array.isArray(tasks)) throw new Error('Respuesta inválida');

        tbody.innerHTML = '';
        studentSelect.innerHTML = '<option value="">Selecciona una tarea...</option>';

        if (tasks.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 20px;">No hay tareas creadas</td></tr>';
            return;
        }

        tasks.forEach(task => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${escapeHtml(task.title)}</strong></td>
                <td><span class="badge badge-pending">${escapeHtml(task.course_title || task.course_id)}</span></td>
                <td>${task.due_date ? new Date(task.due_date).toLocaleDateString() : '-'}</td>
                <td id="count-${task.id}">Cargando...</td>
                <td>
                    <button class="action-btn btn-delete" onclick="deleteTask('${task.id}')">🗑️ Eliminar</button>
                </td>
            `;
            tbody.appendChild(tr);

            const opt = document.createElement('option');
            opt.value = task.id;
            opt.textContent = task.title;
            studentSelect.appendChild(opt);

            countStudents(task.id);
        });

    } catch (error) {
        console.error('Error cargando tareas:', error);
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color: var(--text-secondary);">Error al cargar tareas. Intenta de nuevo.</td></tr>';
    }
}

async function loadDisputedAssignments() {
    const container = document.getElementById('disputed-assignments-list');

    if (!container) {
        console.warn('Contenedor de disputas no encontrado en HTML');
        return;
    }

    container.innerHTML = '<tr><td colspan="6">Cargando disputas...</td></tr>';

    try {
        const response = await fetch('/api/professor-disputes');

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const disputes = await response.json();

        if (!Array.isArray(disputes) || disputes.length === 0) {
            container.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 20px;">No hay disputas pendientes</td></tr>';
            return;
        }

        container.innerHTML = '';

        disputes.forEach(dispute => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${escapeHtml(dispute.assignment_title)}</strong></td>
                <td>${escapeHtml(dispute.first_name || '')} ${escapeHtml(dispute.last_name || '')}</td>
                <td><span class="badge badge-pending">${dispute.score}/${dispute.max_score}</span></td>
                <td>${new Date(dispute.submitted_at).toLocaleDateString()}</td>
                <td style="max-width: 300px; overflow-wrap: break-word;">${escapeHtml(dispute.dispute_reason || 'Sin motivo')}</td>
                <td>
                    <button class="action-btn btn-edit" onclick="reviewDispute('${dispute.id}', ${dispute.max_score})">
                        ✏️ Revisar
                    </button>
                </td>
            `;
            container.appendChild(tr);
        });

    } catch (error) {
        console.error('Error cargando disputas:', error);
        container.innerHTML = '<tr><td colspan="6" style="text-align:center; color: var(--error-color);">Error al cargar disputas</td></tr>';
    }
}

async function reviewDispute(submissionId, maxScore) {
    const newNote = prompt(`Ingresa la nueva nota (0-${maxScore}):`);

    if (newNote === null) return;

    const parsedNote = parseInt(newNote);

    if (isNaN(parsedNote) || parsedNote < 0 || parsedNote > maxScore) {
        alert('Nota inválida. Debe ser un número entre 0 y ' + maxScore);
        return;
    }

    const feedback = prompt('Ingresa tu retroalimentación para el estudiante (opcional):') || '';

    try {
        const response = await fetch('/api/professor-update-grade', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                submission_id: submissionId,
                new_score: parsedNote,
                feedback: feedback
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Error al actualizar nota');
        }

        alert(`✅ Nota actualizada a ${data.new_score}/${maxScore}. La disputa ha sido resuelta.`);
        await loadDisputedAssignments();
        await loadTasksList();

    } catch (error) {
        console.error('Error:', error);
        alert('❌ Error al actualizar nota: ' + error.message);
    }
}

async function countStudents(taskId) {
    try {
        const res = await fetch(`/api/task-students?assignment_id=${taskId}`);
        const students = await res.json();
        const cell = document.getElementById(`count-${taskId}`);
        if (cell) cell.textContent = students.length;
    } catch (e) {
        console.error(e);
    }
}

async function deleteTask(id) {
    if (!confirm('¿Eliminar esta tarea? Se borrarán todas las entregas.')) return;
    try {
        const res = await fetch(`/api/delete-assignment?id=${id}`, { method: 'DELETE' });
        if (res.ok) {
            await loadTasksList();
            await loadCourses();
        } else {
            alert('Error al eliminar');
        }
    } catch (error) {
        alert('Error de conexión');
    }
}

function setupStudentManagement() {
    document.getElementById('student-task-select').addEventListener('change', loadAssignedStudents);
}

async function addStudent() {
    const taskId = document.getElementById('student-task-select').value;
    const dni = document.getElementById('student-dni').value.trim();

    if (!taskId || !dni) {
        alert('Selecciona una tarea y escribe un DNI');
        return;
    }

    try {
        const res = await fetch('/api/assign-student', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ assignment_id: taskId, user_dni: dni })
        });

        if (res.ok) {
            alert('✅ Estudiante asignado');
            document.getElementById('student-dni').value = '';
            await loadAssignedStudents();
            await loadTasksList();
        } else {
            const err = await res.json();
            alert('❌ Error: ' + err.error);
        }
    } catch (error) {
        alert('Error de conexión');
    }
}

async function loadAssignedStudents() {
    const taskId = document.getElementById('student-task-select').value;
    const list = document.getElementById('assigned-students-list');

    if (!taskId) {
        list.innerHTML = '<p style="padding:10px; color:var(--text-secondary)">Selecciona una tarea primero</p>';
        return;
    }

    try {
        const res = await fetch(`/api/task-students?assignment_id=${taskId}`);
        const students = await res.json();

        list.innerHTML = '';
        if (students.length === 0) {
            list.innerHTML = '<p style="padding:10px">No hay estudiantes asignados</p>';
            return;
        }

        students.forEach(s => {
            const div = document.createElement('div');
            div.style.cssText = 'background: var(--bg-color); padding: 12px; margin-bottom: 8px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; border-left: 4px solid var(--primary-color);';
            div.innerHTML = `
                <span><strong>${escapeHtml(s.user_dni)}</strong></span>
                <button class="action-btn btn-delete" onclick="removeStudent('${s.assignment_id}', '${s.user_dni}')">Quitar</button>
            `;
            list.appendChild(div);
        });
    } catch (error) {
        list.innerHTML = '<p style="color:red">Error cargando estudiantes</p>';
    }
}

async function removeStudent(assignmentId, userDni) {
    if (!confirm('¿Quitar a este estudiante?')) return;
    try {
        const res = await fetch('/api/unassign-student', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ assignment_id: assignmentId, user_dni: userDni })
        });
        if (res.ok) {
            await loadAssignedStudents();
            await loadTasksList();
        }
    } catch (error) {
        alert('Error');
    }
}

function switchTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));

    const content = document.getElementById(`tab-${tabName}`);
    const btn = event ? event.target : document.querySelector(`.tab-btn[onclick="switchTab('${tabName}')"]`);

    if (content) content.classList.add('active');
    if (btn) btn.classList.add('active');

    if (tabName === 'list') {
        loadTasksList();
    } else if (tabName === 'students') {
        loadTasksList();
        loadAssignedStudents();
    }
}

function updateStats() {
    const courses = window.userCourses || [];
    document.getElementById('stat-courses').textContent = courses.length;
}

async function loadStats() {
    await loadTasksList();
}

function setupLogout() {
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            if (confirm('¿Estás seguro de que deseas cerrar sesión?')) {
                try {
                    await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' });
                } catch (e) { }
                localStorage.removeItem('mirai_user_dni');
                localStorage.removeItem('mirai_user_name');
                localStorage.removeItem('mirai_user_role');
                localStorage.removeItem('mirai-ai-conversation-id');
                localStorage.removeItem('mirai-ai-course-id');
                localStorage.removeItem('mirai-ai-lesson-id');
                window.location.href = 'login';
            }
        });
    }
}

function escapeHtml(text) { if (!text) return ''; const d = document.createElement('div'); d.textContent = text; return d.innerHTML; }

// ── SECCIONES ─────────────────────────────────────────────────────────────

function setupSectionManagement() {
    // Nada especial que inicializar, los botones usan onclick directamente
}

async function loadSections() {
    const list = document.getElementById('sections-list');
    const sectionStudentSelect = document.getElementById('section-student-select');
    const taskSectionSelect = document.getElementById('task-section-select');

    try {
        const res = await fetch('/api/sections', { credentials: 'same-origin' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const sections = await res.json();

        window.userSections = sections;

        // Renderizar lista
        if (list) {
            if (sections.length === 0) {
                list.innerHTML = '<p style="color: var(--text-secondary);">No hay secciones creadas todavía</p>';
            } else {
                list.innerHTML = '';
                sections.forEach(sec => {
                    const div = document.createElement('div');
                    div.style.cssText = 'background: var(--bg-color); padding: 14px; margin-bottom: 10px; border-radius: 10px; display: flex; justify-content: space-between; align-items: center; border-left: 4px solid var(--primary-color);';
                    div.innerHTML = `
                        <div>
                            <strong>${escapeHtml(sec.name)}</strong>
                            <span style="color: var(--text-secondary); font-size: 0.85rem; margin-left: 8px;">📚 ${escapeHtml(sec.course_title || '')}</span>
                            <br><small style="color: var(--text-secondary);">${sec.student_count} estudiante${sec.student_count !== 1 ? 's' : ''}</small>
                        </div>
                        <div style="display: flex; gap: 8px; flex-shrink: 0;">
                            <button class="action-btn btn-edit" onclick="selectSectionForStudents('${sec.id}')">👥 Ver</button>
                            <button class="action-btn btn-delete" onclick="deleteSection('${sec.id}')">🗑️ Eliminar</button>
                        </div>
                    `;
                    list.appendChild(div);
                });
            }
        }

        // Poblar selects de sección
        // Poblar selects de sección (preservando la selección actual)
        const opts = sections.map(s => `<option value="${s.id}">${escapeHtml(s.name)} — ${escapeHtml(s.course_title || '')}</option>`).join('');

        if (sectionStudentSelect) {
            const prevSectionVal = sectionStudentSelect.value;
            sectionStudentSelect.innerHTML = '<option value="">Selecciona una sección...</option>' + opts;
            if (prevSectionVal) sectionStudentSelect.value = prevSectionVal;
        }
        if (taskSectionSelect) {
            const prevTaskSectionVal = taskSectionSelect.value;
            taskSectionSelect.innerHTML = '<option value="">Sin sección específica</option>' + opts;
            if (prevTaskSectionVal) taskSectionSelect.value = prevTaskSectionVal;
        }

    } catch (error) {
        console.error('Error cargando secciones:', error);
        if (list) list.innerHTML = '<p style="color: red;">Error al cargar secciones</p>';
    }
}

async function createSection() {
    const name = document.getElementById('section-name').value.trim();
    const courseId = document.getElementById('section-course-select').value;
    const desc = document.getElementById('section-desc').value.trim();

    if (!name || !courseId) {
        alert('El nombre y la materia son obligatorios');
        return;
    }

    try {
        const res = await fetch('/api/create-section', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ name, course_id: courseId, description: desc })
        });

        if (res.ok) {
            alert('✅ Sección creada');
            document.getElementById('section-name').value = '';
            document.getElementById('section-desc').value = '';
            document.getElementById('section-course-select').value = '';
            await loadSections();
        } else {
            const err = await res.json();
            alert('❌ Error: ' + err.error);
        }
    } catch (error) {
        alert('Error de conexión');
    }
}

async function deleteSection(id) {
    if (!confirm('¿Eliminar esta sección? No se eliminarán las tareas ni los estudiantes ya asignados.')) return;

    try {
        const res = await fetch(`/api/delete-section?id=${id}`, {
            method: 'DELETE',
            credentials: 'same-origin'
        });
        if (res.ok) {
            await loadSections();
        } else {
            const err = await res.json();
            alert('❌ Error: ' + err.error);
        }
    } catch (error) {
        alert('Error de conexión');
    }
}

async function loadSectionStudents() {
    const sectionId = document.getElementById('section-student-select').value;
    const list = document.getElementById('section-students-list');

    if (!sectionId) {
        list.innerHTML = '<p style="color: var(--text-secondary);">Selecciona una sección primero</p>';
        return;
    }

    try {
        const res = await fetch(`/api/section-students?section_id=${sectionId}`, { credentials: 'same-origin' });
        const students = await res.json();

        list.innerHTML = '';
        if (!students.length) {
            list.innerHTML = '<p style="color: var(--text-secondary);">No hay estudiantes en esta sección</p>';
            return;
        }

        students.forEach(s => {
            const fullName = [s.first_name, s.last_name].filter(Boolean).join(' ');
            const div = document.createElement('div');
            div.style.cssText = 'background: var(--bg-color); padding: 12px; margin-bottom: 8px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; border-left: 4px solid var(--primary-color);';
            div.innerHTML = `
                <div>
                    <strong>${escapeHtml(s.user_dni)}</strong>
                    ${fullName ? `<span style="color: var(--text-secondary); font-size: 0.88rem; margin-left: 8px;">${escapeHtml(fullName)}</span>` : ''}
                </div>
                <button class="action-btn btn-delete" style="flex-shrink:0; width:auto;" onclick="removeStudentFromSection('${sectionId}', '${s.user_dni}')">🗑️</button>
            `;
            list.appendChild(div);
        });
    } catch (error) {
        list.innerHTML = '<p style="color: red;">Error cargando estudiantes</p>';
    }
}

async function addStudentToSection() {
    const sectionId = document.getElementById('section-student-select').value;
    const dni = document.getElementById('section-student-dni').value.trim();

    if (!sectionId || !dni) {
        alert('Selecciona una sección y escribe un DNI');
        return;
    }

    try {
        const res = await fetch('/api/section-add-student', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ section_id: sectionId, user_dni: dni })
        });

        if (res.ok) {
            document.getElementById('section-student-dni').value = '';
            await loadSections();          // Actualiza contadores y preserva selección
            await loadSectionStudents();   // Recarga la lista del select activo
        } else {
            const err = await res.json();
            alert('❌ Error: ' + err.error);
        }
    } catch (error) {
        alert('Error de conexión');
    }
}

async function removeStudentFromSection(sectionId, userDni) {
    if (!confirm('¿Quitar a este estudiante de la sección?')) return;

    try {
        const res = await fetch('/api/section-remove-student', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ section_id: sectionId, user_dni: userDni })
        });
        if (res.ok) {
            await loadSectionStudents();
            await loadSections();
        }
    } catch (error) {
        alert('Error de conexión');
    }
}

function selectSectionForStudents(sectionId) {
    const select = document.getElementById('section-student-select');
    if (select) {
        select.value = sectionId;
        loadSectionStudents();
        // Scroll suave hacia la sección de estudiantes
        setTimeout(() => {
            document.getElementById('section-students-list')
                ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
    }
}

function setupTabs() {
    console.log('Tabs system initialized');
}