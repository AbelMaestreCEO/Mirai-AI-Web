/**
 * attendance.js — Módulo de Control de Asistencia
 * Mirai AI · Aberu & Mirai Company
 *
 * Responsabilidades:
 *  - Datos de alumnos y registros de asistencia (localStorage como persistencia local)
 *  - CRUD de alumnos
 *  - Marcado rápido de estado (presente / ausente / tardanza / justificado)
 *  - Filtros: fecha, grupo, estado, búsqueda de texto
 *  - Exportación a CSV (nativo) y Excel (SheetJS / XLSX)
 *  - Actualización de estadísticas en tiempo real
 */

'use strict';

// ============================================================
// CONSTANTES
// ============================================================
const STORAGE_KEY_STUDENTS   = 'att_students';
const STORAGE_KEY_RECORDS    = 'att_records';   // { "YYYY-MM-DD_ID": { status, time, justify } }

const STATUS_LABELS = {
    presente:    { emoji: '✅', label: 'Presente' },
    ausente:     { emoji: '❌', label: 'Ausente' },
    tardanza:    { emoji: '⏰', label: 'Tardanza' },
    justificado: { emoji: '📝', label: 'Justificado' },
};

// ============================================================
// ESTADO GLOBAL
// ============================================================
const state = {
    students:       [],   // Array<{ id, name, dni, group, email }>
    records:        {},   // { "date_id": { status, time, justify } }
    currentDate:    todayISO(),
    currentGroup:   'todos',
    currentFilter:  'todos',
    searchQuery:    '',
    justifyTarget:  null, // id del alumno al que se justifica
    editTarget:     null, // id del alumno que se edita
};

// ============================================================
// HELPERS
// ============================================================
function todayISO() {
    return new Date().toISOString().split('T')[0];
}

function nowTime() {
    return new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
}

function recordKey(date, id) {
    return `${date}_${id}`;
}

function escHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function initials(name) {
    return name.trim().split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// ============================================================
// PERSISTENCIA
// ============================================================
function loadFromStorage() {
    try {
        state.students = JSON.parse(localStorage.getItem(STORAGE_KEY_STUDENTS)) || [];
        state.records  = JSON.parse(localStorage.getItem(STORAGE_KEY_RECORDS))  || {};
    } catch {
        state.students = [];
        state.records  = {};
    }

    // Si no hay alumnos, cargar demo
    if (state.students.length === 0) seedDemoStudents();
}

function saveStudents() {
    localStorage.setItem(STORAGE_KEY_STUDENTS, JSON.stringify(state.students));
}

function saveRecords() {
    localStorage.setItem(STORAGE_KEY_RECORDS, JSON.stringify(state.records));
}

// ============================================================
// DATOS DE DEMO (primer uso)
// ============================================================
function seedDemoStudents() {
    state.students = [
        { id: uid(), name: 'Ana García López',      dni: '71234001', group: 'A', email: 'ana@demo.com' },
        { id: uid(), name: 'Carlos Mendoza Ríos',   dni: '71234002', group: 'A', email: 'carlos@demo.com' },
        { id: uid(), name: 'Lucía Herrera Ponce',   dni: '71234003', group: 'A', email: 'lucia@demo.com' },
        { id: uid(), name: 'Diego Vargas Torres',   dni: '71234004', group: 'B', email: 'diego@demo.com' },
        { id: uid(), name: 'Valentina Cruz Salas',  dni: '71234005', group: 'B', email: 'vale@demo.com' },
        { id: uid(), name: 'Mateo Flores Quispe',   dni: '71234006', group: 'B', email: 'mateo@demo.com' },
        { id: uid(), name: 'Sofía Chávez Paredes',  dni: '71234007', group: 'C', email: 'sofia@demo.com' },
        { id: uid(), name: 'Andrés Ramos Neyra',    dni: '71234008', group: 'C', email: 'andres@demo.com' },
    ];
    saveStudents();
}

// ============================================================
// FILTRADO
// ============================================================
function filteredStudents() {
    return state.students.filter(st => {
        const rec = state.records[recordKey(state.currentDate, st.id)];
        const status = rec ? rec.status : 'ausente';

        if (state.currentGroup !== 'todos' && st.group !== state.currentGroup) return false;
        if (state.currentFilter !== 'todos' && status !== state.currentFilter) return false;
        if (state.searchQuery) {
            const q = state.searchQuery.toLowerCase();
            if (!st.name.toLowerCase().includes(q) && !st.dni.includes(q)) return false;
        }
        return true;
    });
}

// ============================================================
// RENDER TABLA
// ============================================================
function render() {
    const tbody   = document.getElementById('attendance-tbody');
    const empty   = document.getElementById('att-empty');
    const table   = document.getElementById('attendance-table');
    const counter = document.getElementById('att-count');
    if (!tbody) return;

    const list = filteredStudents();

    tbody.innerHTML = '';
    counter.textContent = `Mostrando ${list.length} registro${list.length !== 1 ? 's' : ''}`;

    if (list.length === 0) {
        table.style.display = 'none';
        empty.classList.remove('hidden');
        updateStats();
        return;
    }

    table.style.display = '';
    empty.classList.add('hidden');

    list.forEach((st, idx) => {
        const key    = recordKey(state.currentDate, st.id);
        const rec    = state.records[key] || { status: 'ausente', time: '', justify: '' };
        const info   = STATUS_LABELS[rec.status] || STATUS_LABELS.ausente;
        const tr     = document.createElement('tr');

        tr.innerHTML = `
            <td style="color:var(--text-tertiary); font-size:0.8rem;">${idx + 1}</td>
            <td>
                <div class="student-avatar">
                    <div class="avatar-circle">${escHtml(initials(st.name))}</div>
                    <span>${escHtml(st.name)}</span>
                </div>
            </td>
            <td style="color:var(--text-secondary); font-size:0.83rem;">${escHtml(st.dni)}</td>
            <td><span class="course-level ${st.group === 'A' ? 'principiante' : st.group === 'B' ? 'intermedio' : 'avanzado'}">${escHtml(st.group)}</span></td>
            <td style="color:var(--text-secondary); font-size:0.83rem;">${rec.time || '—'}</td>
            <td><span class="status-badge ${rec.status}">${info.emoji} ${info.label}</span></td>
            <td style="font-size:0.82rem; color:var(--text-secondary); max-width:180px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                ${rec.justify ? escHtml(rec.justify) : '<span style="color:var(--text-tertiary)">—</span>'}
            </td>
            <td>
                <div class="row-actions">
                    <button class="btn-status" data-id="${st.id}" data-action="presente">✅</button>
                    <button class="btn-status" data-id="${st.id}" data-action="tardanza">⏰</button>
                    <button class="btn-status" data-id="${st.id}" data-action="ausente">❌</button>
                    <button class="btn-status" data-id="${st.id}" data-action="justify">📝</button>
                    <button class="btn-status" data-id="${st.id}" data-action="edit" title="Editar alumno">✏️</button>
                    <button class="btn-status" data-id="${st.id}" data-action="delete" title="Eliminar alumno" style="color:#D00000;">🗑️</button>
                </div>
            </td>
        `;

        tbody.appendChild(tr);
    });

    updateStats();
}

// ============================================================
// ESTADÍSTICAS
// ============================================================
function updateStats() {
    // Calcular sobre TODOS los alumnos del grupo seleccionado (sin filtro de estado)
    const base = state.students.filter(st =>
        state.currentGroup === 'todos' || st.group === state.currentGroup
    );

    let present = 0, absent = 0, late = 0, justified = 0;

    base.forEach(st => {
        const rec = state.records[recordKey(state.currentDate, st.id)];
        const status = rec ? rec.status : 'ausente';
        if (status === 'presente')    present++;
        else if (status === 'tardanza')  late++;
        else if (status === 'justificado') justified++;
        else absent++;
    });

    const total = base.length;
    const pct   = total > 0 ? Math.round(((present + late) / total) * 100) : 0;

    document.getElementById('stat-total').textContent   = total;
    document.getElementById('stat-present').textContent = present + late;
    document.getElementById('stat-absent').textContent  = absent;
    document.getElementById('stat-pct').textContent     = total > 0 ? pct + '%' : '—';
}

// ============================================================
// ACCIONES DE ASISTENCIA
// ============================================================
function setStatus(studentId, status) {
    const key = recordKey(state.currentDate, studentId);
    state.records[key] = {
        status,
        time:    nowTime(),
        justify: state.records[key]?.justify || '',
    };
    saveRecords();
    render();
}

function markAllPresent() {
    const targets = filteredStudents();
    targets.forEach(st => {
        const key = recordKey(state.currentDate, st.id);
        if (!state.records[key] || state.records[key].status === 'ausente') {
            state.records[key] = { status: 'presente', time: nowTime(), justify: '' };
        }
    });
    saveRecords();
    render();
}

// ============================================================
// EXPORTACIÓN CSV (sin librerías)
// ============================================================
function exportCSV() {
    const date    = state.currentDate;
    const targets = buildExportRows(date);

    const header = ['#', 'Nombre', 'DNI', 'Grupo', 'Fecha', 'Hora Entrada', 'Estado', 'Justificación'];
    const rows   = [header, ...targets.map((r, i) => [
        i + 1, r.name, r.dni, r.group, date, r.time, r.status, r.justify
    ])];

    const csv = rows.map(row =>
        row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
    ).join('\r\n');

    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    downloadBlob(blob, `asistencia_${date}.csv`);
}

// ============================================================
// EXPORTACIÓN EXCEL (SheetJS)
// ============================================================
function exportExcel() {
    if (typeof XLSX === 'undefined') {
        alert('La librería de Excel aún está cargando. Intenta en unos segundos.');
        return;
    }

    const date    = state.currentDate;
    const targets = buildExportRows(date);

    const wsData = [
        ['Control de Asistencia — ' + date],
        [],
        ['#', 'Nombre', 'DNI', 'Grupo', 'Fecha', 'Hora Entrada', 'Estado', 'Justificación'],
        ...targets.map((r, i) => [i + 1, r.name, r.dni, r.group, date, r.time, r.status, r.justify])
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // Anchos de columna
    ws['!cols'] = [
        { wch: 4 }, { wch: 28 }, { wch: 12 }, { wch: 8 },
        { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 36 }
    ];

    // Combinar celda del título
    ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 7 } }];

    XLSX.utils.book_append_sheet(wb, ws, 'Asistencia');
    XLSX.writeFile(wb, `asistencia_${date}.xlsx`);
}

// ============================================================
// HELPERS DE EXPORTACIÓN
// ============================================================
function buildExportRows(date) {
    // Exporta siempre todos los alumnos (respetando filtro de grupo),
    // independiente del filtro de estado activo en pantalla
    const base = state.students.filter(st =>
        state.currentGroup === 'todos' || st.group === state.currentGroup
    );

    return base.map(st => {
        const rec  = state.records[recordKey(date, st.id)] || {};
        return {
            name:    st.name,
            dni:     st.dni,
            group:   st.group,
            time:    rec.time    || '',
            status:  STATUS_LABELS[rec.status]?.label || 'Ausente',
            justify: rec.justify || '',
        };
    });
}

function downloadBlob(blob, filename) {
    const url  = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href  = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

// ============================================================
// MODAL: ALUMNO
// ============================================================
function openStudentModal(student = null) {
    const modal = document.getElementById('student-modal');
    const title = document.getElementById('student-modal-title');

    document.getElementById('st-name').value  = student ? student.name  : '';
    document.getElementById('st-dni').value   = student ? student.dni   : '';
    document.getElementById('st-email').value = student ? student.email : '';
    document.getElementById('st-group').value = student ? student.group : 'A';
    document.getElementById('student-status').textContent = '';

    title.textContent    = student ? '✏️ Editar Alumno' : '👤 Nuevo Alumno';
    state.editTarget     = student ? student.id : null;

    modal.classList.remove('hidden');
}

function closeStudentModal() {
    document.getElementById('student-modal').classList.add('hidden');
    state.editTarget = null;
}

function saveStudent() {
    const name  = document.getElementById('st-name').value.trim();
    const dni   = document.getElementById('st-dni').value.trim();
    const group = document.getElementById('st-group').value;
    const email = document.getElementById('st-email').value.trim();
    const status = document.getElementById('student-status');

    if (!name || !dni) {
        status.textContent = '⚠️ Nombre y DNI son obligatorios.';
        status.style.color = '#D00000';
        return;
    }

    if (state.editTarget) {
        const idx = state.students.findIndex(s => s.id === state.editTarget);
        if (idx > -1) state.students[idx] = { ...state.students[idx], name, dni, group, email };
    } else {
        state.students.push({ id: uid(), name, dni, group, email });
    }

    saveStudents();
    closeStudentModal();
    render();
}

function deleteStudent(id) {
    if (!confirm('¿Eliminar este alumno? Se borrarán también sus registros de asistencia.')) return;
    state.students = state.students.filter(s => s.id !== id);
    // Borrar registros del alumno
    Object.keys(state.records).forEach(k => { if (k.endsWith('_' + id)) delete state.records[k]; });
    saveStudents();
    saveRecords();
    render();
}

// ============================================================
// MODAL: JUSTIFICACIÓN
// ============================================================
function openJustifyModal(studentId) {
    const st   = state.students.find(s => s.id === studentId);
    if (!st) return;
    state.justifyTarget = studentId;

    const key  = recordKey(state.currentDate, studentId);
    document.getElementById('justify-student-name').textContent = st.name;
    document.getElementById('justify-text').value = state.records[key]?.justify || '';
    document.getElementById('justify-modal').classList.remove('hidden');
}

function closeJustifyModal() {
    document.getElementById('justify-modal').classList.add('hidden');
    state.justifyTarget = null;
}

function saveJustification() {
    const text = document.getElementById('justify-text').value.trim();
    const key  = recordKey(state.currentDate, state.justifyTarget);

    state.records[key] = {
        status:  'justificado',
        time:    state.records[key]?.time || nowTime(),
        justify: text,
    };
    saveRecords();
    closeJustifyModal();
    render();
}

// ============================================================
// INICIALIZACIÓN
// ============================================================
function init() {
    loadFromStorage();

    // Fecha por defecto = hoy
    const dateInput = document.getElementById('att-date');
    dateInput.value = state.currentDate;

    render();

    // ── Filtros ──────────────────────────────────────────────
    dateInput.addEventListener('change', e => {
        state.currentDate = e.target.value;
        render();
    });

    document.getElementById('att-group').addEventListener('change', e => {
        state.currentGroup = e.target.value;
        render();
    });

    document.getElementById('att-filter').addEventListener('change', e => {
        state.currentFilter = e.target.value;
        render();
    });

    let debounce;
    document.getElementById('att-search').addEventListener('input', e => {
        clearTimeout(debounce);
        debounce = setTimeout(() => {
            state.searchQuery = e.target.value.trim().toLowerCase();
            render();
        }, 200);
    });

    // ── Exportación ──────────────────────────────────────────
    document.getElementById('btn-export-excel').addEventListener('click', exportExcel);
    document.getElementById('btn-export-csv').addEventListener('click', exportCSV);

    // ── Marcar todos presentes ────────────────────────────────
    document.getElementById('btn-mark-all-present').addEventListener('click', markAllPresent);

    // ── Agregar alumno ────────────────────────────────────────
    document.getElementById('btn-add-student').addEventListener('click', () => openStudentModal());

    // ── Acciones en tabla (event delegation) ─────────────────
    document.getElementById('attendance-tbody').addEventListener('click', e => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        const id     = btn.dataset.id;
        const action = btn.dataset.action;

        if (action === 'presente' || action === 'tardanza' || action === 'ausente') {
            setStatus(id, action);
        } else if (action === 'justify') {
            openJustifyModal(id);
        } else if (action === 'edit') {
            const st = state.students.find(s => s.id === id);
            if (st) openStudentModal(st);
        } else if (action === 'delete') {
            deleteStudent(id);
        }
    });

    // ── Modal: Alumno ─────────────────────────────────────────
    document.getElementById('modal-close-student').addEventListener('click', closeStudentModal);
    document.getElementById('cancel-student').addEventListener('click', closeStudentModal);
    document.getElementById('save-student').addEventListener('click', saveStudent);
    document.querySelector('#student-modal .modal-overlay').addEventListener('click', closeStudentModal);

    // ── Modal: Justificación ──────────────────────────────────
    document.getElementById('modal-close-justify').addEventListener('click', closeJustifyModal);
    document.getElementById('cancel-justify').addEventListener('click', closeJustifyModal);
    document.getElementById('save-justify').addEventListener('click', saveJustification);
    document.querySelector('#justify-modal .modal-overlay').addEventListener('click', closeJustifyModal);
}

// Esperar al DOM
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}