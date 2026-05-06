// classroom_admin.js

// --- AUTH OVERRIDE ---
const originalFetch = window.fetch;
window.fetch = async function (url, options = {}) {
    if (url.startsWith('/api/') && !url.includes('login')) {
        const token = localStorage.getItem('mirai_auth_token');
        if (token) {
            options.headers = { ...options.headers, 'Authorization': `Bearer ${token}` };
        } else {
            window.location.href = 'login.html';
            return;
        }
    }
    return originalFetch.call(this, url, options);
};

let currentUserDni = null;

document.addEventListener('DOMContentLoaded', async () => {
    currentUserDni = localStorage.getItem('mirai_user_dni');
    if (!currentUserDni) {
        window.location.href = 'login.html';
        return;
    }

    // ✨ VERIFICAR SI ES PROFESOR AUTORIZADO (desde el backend)
    try {
        const checkResponse = await fetch('/api/check-professor-role');
        
        if (checkResponse.status === 401) {
            window.location.href = 'login.html';
            return;
        }
        
        const checkData = await checkResponse.json();
        
        if (!checkData.is_professor) {
            alert('⛔ Acceso denegado. Este panel es exclusivo para profesores autorizados.');
            window.location.href = 'index.html';
            return;
        }
    } catch (error) {
        console.error('Error verificando rol:', error);
        window.location.href = 'login.html';
        return;
    }

    document.getElementById('professor-greeting').textContent = `Hola, Profesor ${currentUserDni}`;
    
    setupMobileMenu();
    setupLogout();
    setupTabs();
    setupCreateCourseModal();
    setupCreateTaskForm();
    setupStudentManagement();
    
    await loadCourses();
    await loadTasksList();
    await loadStats();
});

// --- GESTIÓN DE CURSOS ---
async function loadCourses() {
    const select = document.getElementById('task-course-select');

    try {
        const res = await fetch(`/api/user-courses?user_dni=${currentUserDni}`);
        
        if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
        }
        
        const courses = await res.json();

        // Protección: si la respuesta no es un array, tratar como vacío
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
        select.appendChild(addOpt);
        
        updateStats();
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

    // Cerrar modal al hacer clic fuera
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
                await loadCourses(); // Recargar select
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

// --- GESTIÓN DE TAREAS ---
function setupCreateTaskForm() {
    const form = document.getElementById('create-task-form');
    const select = document.getElementById('task-course-select');

    select.addEventListener('change', (e) => {
        if (e.target.value === '__ADD_NEW__') {
            document.getElementById('modal-new-course').style.display = 'flex';
            setTimeout(() => document.getElementById('modal-new-course').classList.add('show'), 10);
            e.target.value = ''; // Resetear
        }
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const title = document.getElementById('task-title').value;
        const courseId = document.getElementById('task-course-select').value;
        const desc = document.getElementById('task-desc').value;
        const due = document.getElementById('task-due').value;
        const score = document.getElementById('task-score').value;

        if (!courseId) {
            alert('Por favor selecciona un curso');
            return;
        }

        try {
            const res = await fetch('/api/create-assignment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title, course_id: courseId, description: desc, due_date: due, max_score: score })
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

        // Protección
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
            await loadCourses(); // Recargar stats
        } else {
            alert('Error al eliminar');
        }
    } catch (error) {
        alert('Error de conexión');
    }
}

// --- GESTIÓN DE ESTUDIANTES ---
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
            await loadTasksList(); // Actualizar contador
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

// --- UTILIDADES ---
function switchTab(tabName) {
    // Ocultar todos los contenidos
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    // Desactivar todos los botones
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    
    // Activar el contenido y botón seleccionados
    const content = document.getElementById(`tab-${tabName}`);
    const btn = event ? event.target : document.querySelector(`.tab-btn[onclick="switchTab('${tabName}')"]`);
    
    if (content) content.classList.add('active');
    if (btn) btn.classList.add('active');

    // Acciones específicas al cambiar de pestaña
    if (tabName === 'list') {
        loadTasksList();
    } else if (tabName === 'students') {
        loadTasksList(); // Asegurar que el select de tareas esté lleno
        loadAssignedStudents();
    }
}

function updateStats() {
    const courses = window.userCourses || [];
    document.getElementById('stat-courses').textContent = courses.length;
    // Stats de tareas y estudiantes se calculan en loadTasksList y loadAssignedStudents
}

async function loadStats() {
    // Carga inicial de stats
    await loadTasksList();
}

function setupMobileMenu() {
    const menuToggle = document.querySelector('.mobile-menu-toggle');
    const closeMenu = document.querySelector('.close-menu');
    const sidebar = document.querySelector('.mobile-sidebar');
    const overlay = document.querySelector('.mobile-overlay');
    if (!menuToggle || !closeMenu || !sidebar || !overlay) return;

    function toggleMenu() {
        const isActive = sidebar.classList.contains('active');
        if (isActive) {
            sidebar.classList.remove('active'); overlay.classList.remove('active');
            menuToggle.classList.remove('active'); document.body.style.overflow = '';
        } else {
            sidebar.classList.add('active'); overlay.classList.add('active');
            menuToggle.classList.add('active'); document.body.style.overflow = 'hidden';
        }
    }
    menuToggle.addEventListener('click', toggleMenu);
    closeMenu.addEventListener('click', toggleMenu);
    overlay.addEventListener('click', toggleMenu);
}

function setupLogout() {
    const btn = document.getElementById('logout-btn');
    if (btn) btn.addEventListener('click', () => { localStorage.clear(); window.location.href = 'login.html'; });
}

function escapeHtml(text) { if(!text) return ''; const d=document.createElement('div'); d.textContent=text; return d.innerHTML; }

function setupTabs() {
    // Esta función inicializa los listeners si los necesitaras, 
    // pero como usamos onclick en el HTML, la lógica está en switchTab.
    // Sin embargo, para evitar el error, definimos una función vacía o de inicialización.
    console.log('Tabs system initialized');
}