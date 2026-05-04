// classroom_details.js

document.addEventListener('DOMContentLoaded', async () => {
    if (!checkAuth()) return;

    const urlParams = new URLSearchParams(window.location.search);
    const assignmentId = urlParams.get('id');

    if (!assignmentId) {
        alert('ID de tarea no válido');
        window.location.href = 'classroom.html';
        return;
    }

    await loadAssignmentDetails(assignmentId);
    setupFileUpload(assignmentId);
});

function checkAuth() {
    const token = localStorage.getItem('mirai_auth_token');
    if (!token) {
        window.location.href = 'login.html';
        return false;
    }
    return true;
}

async function loadAssignmentDetails(id) {
    try {
        const response = await fetch(`/api/assignment-details?id=${id}`);
        if (!response.ok) throw new Error('Error cargando detalles');
        
        const data = await response.json();
        
        document.getElementById('task-title').textContent = data.title;
        document.getElementById('task-desc').textContent = data.description || 'Sin descripción adicional.';
        
        // Si ya está entregado, deshabilitar subida
        if (data.submission) {
            document.getElementById('upload-section').innerHTML = `
                <div style="padding: 20px; background: #e8f5e9; border-radius: 8px; text-align: center;">
                    <h3>✅ Tarea Entregada</h3>
                    <p>Fecha: ${new Date(data.submission.submitted_at).toLocaleString()}</p>
                    ${data.submission.score ? `<p><strong>Nota: ${data.submission.score}</strong></p>` : ''}
                    ${data.submission.feedback ? `<p><em>Feedback: ${data.submission.feedback}</em></p>` : ''}
                </div>
            `;
        }
    } catch (error) {
        console.error(error);
        alert('Error cargando la tarea');
    }
}

function setupFileUpload(assignmentId) {
    const fileInput = document.getElementById('file-input');
    const fileNameDisplay = document.getElementById('file-name-display');
    const statusMsg = document.getElementById('upload-status');

    fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (file.type !== 'application/pdf') {
            alert('Solo se permiten archivos PDF');
            fileInput.value = '';
            return;
        }

        if (file.size > 10 * 1024 * 1024) {
            alert('El archivo no puede superar los 10MB');
            fileInput.value = '';
            return;
        }

        fileNameDisplay.textContent = `Archivo seleccionado: ${file.name}`;
        statusMsg.style.display = 'none';

        // Subir
        const formData = new FormData();
        formData.append('file', file);
        formData.append('assignment_id', assignmentId);

        try {
            statusMsg.textContent = 'Subiendo...';
            statusMsg.className = 'status-message';
            statusMsg.style.display = 'block';

            const response = await fetch('/api/submit-assignment', {
                method: 'POST',
                body: formData
            });

            const result = await response.json();

            if (response.ok) {
                statusMsg.textContent = '✅ ¡Entrega exitosa!';
                statusMsg.className = 'status-message status-success';
                setTimeout(() => window.location.reload(), 2000);
            } else {
                throw new Error(result.error || 'Error al entregar');
            }
        } catch (error) {
            console.error(error);
            statusMsg.textContent = `❌ Error: ${error.message}`;
            statusMsg.className = 'status-message status-error';
        }
    });
}