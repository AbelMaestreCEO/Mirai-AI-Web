// classroom_admin.js

// --- AUTH OVERRIDE (Igual que antes) ---
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

document.addEventListener('DOMContentLoaded', () => {
    setupAuthCheck();
    setupTabs();
    setupCreateForm();
    loadTasksList();
    setupStudentManagement();
    setupMobileMenu();
    setupLogout();
});

function setupAuthCheck() {
    const token = localStorage.getItem('mirai_auth_token');
    const dni = localStorage.getItem('mirai_user_dni');
    if (!token || !dni) {
        window.location.href = 'login.html';
        return;
    }
    // Opcional: Verificar si el usuario es realmente profesor
    // if (!dni.startsWith('PROF')) { window.location.href = 'classroom.html'; }
}

function switchTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(`tab-${tabName}`).classList.add('active');
    event.target.classList.add('active');

    if (tabName === 'list') loadTasksList();
    if (tabName === 'students') loadTaskSelect();
}

function setupCreateForm() {
    document.getElementById('create-task-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const title = document.getElementById('task-title').value;
        const desc = document.getElementById('task-desc').value;
        const course = document.getElementById('task-course').value;
        const due = document.getElementById('task-due').value;

        try {
            const res = await fetch('/api/create-assignment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title, description: desc, course_id: course, due_date: due })
            });

            if (res.ok) {
                alert('✅ Tarea creada con éxito');
                e.target.reset();
                switchTab('list');
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
    tbody.innerHTML = '<tr><td colspan="4">Cargando...</td></tr>';

    try {
        const res = await fetch('/api/admin-tasks');
        const tasks = await res.json();

        tbody.innerHTML = '';
        if (tasks.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center">No hay tareas creadas</td></tr>';
            return;
        }

        tasks.forEach(task => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${escapeHtml(task.title)}</td>
                <td>${escapeHtml(task.course_id)}</td>
                <td>${task.due_date ? new Date(task.due_date).toLocaleString() : '-'}</td>
                <td>
                    <button class="action-btn btn-delete" onclick="deleteTask('${task.id}')">🗑️</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (error) {
        tbody.innerHTML = '<tr><td colspan="4" style="color:red">Error cargando tareas</td></tr>';
    }
}

async function deleteTask(id) {
    if (!confirm('¿Eliminar esta tarea? Se borrarán todas las entregas asociadas.')) return;

    try {
        const res = await fetch(`/api/delete-assignment?id=${id}`, { method: 'DELETE' });
        if (res.ok) {
            loadTasksList();
        } else {
            alert('Error al eliminar');
        }
    } catch (error) {
        alert('Error de conexión');
    }
}

// --- GESTIÓN DE ESTUDIANTES ---
async function loadTaskSelect() {
    const select = document.getElementById('student-task-select');
    select.innerHTML = '<option>Cargando...</option>';

    try {
        const res = await fetch('/api/admin-tasks');
        const tasks = await res.json();
        select.innerHTML = '';
        tasks.forEach(task => {
            const opt = document.createElement('option');
            opt.value = task.id;
            opt.textContent = task.title;
            select.appendChild(opt);
        });
        loadAssignedStudents(); // Cargar lista inicial
    } catch (error) {
        select.innerHTML = '<option>Error</option>';
    }
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
            loadAssignedStudents();
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
        list.innerHTML = '<p style="padding:10px">Selecciona una tarea primero</p>';
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
            div.className = 'student-item';
            div.innerHTML = `
                <span>${escapeHtml(s.user_dni)}</span>
                <button class="action-btn btn-delete" style="margin-left:auto" onclick="removeStudent('${s.assignment_id}', '${s.user_dni}')">Quitar</button>
            `;
            list.appendChild(div);
        });
    } catch (error) {
        list.innerHTML = '<p style="color:red">Error cargando estudiantes</p>';
    }
}

async function removeStudent(assignmentId, userDni) {
    if (!confirm('¿Quitar a este estudiante de la tarea?')) return;
    try {
        const res = await fetch('/api/unassign-student', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ assignment_id: assignmentId, user_dni: userDni })
        });
        if (res.ok) loadAssignedStudents();
    } catch (error) {
        alert('Error');
    }
}

function setupStudentManagement() {
    document.getElementById('student-task-select').addEventListener('change', loadAssignedStudents);
}

// --- UTILIDADES ---
function setupTabs() { /* Ya manejado en switchTab */ }
function setupMobileMenu() { /* Igual que classroom.js */ }
function setupLogout() { /* Igual que classroom.js */ }
function escapeHtml(text) { if(!text) return ''; const d=document.createElement('div'); d.textContent=text; return d.innerHTML; }