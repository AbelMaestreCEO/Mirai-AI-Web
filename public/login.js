/* ============================================
   MIRAI AI - Login Logic
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {
    // Elementos del DOM
    const loginForm = document.getElementById('login-form');
    const errorMsg = document.getElementById('error-msg');
    const loginBtn = document.getElementById('login-btn');
    const forgotLink = document.getElementById('forgot-link');
    const recoveryModal = document.getElementById('recovery-modal');
    const closeModal = document.getElementById('close-modal');
    const recoveryForm = document.getElementById('recovery-form');
    const recoveryMsg = document.getElementById('recovery-msg');
    const recoveryBtn = document.getElementById('recovery-btn');

    // ============================================
    // LOGIN
    // ============================================
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const dni = document.getElementById('dni').value;
        const password = document.getElementById('password').value;
        
        // Estado de carga
        setLoading(loginBtn, true);
        hideMessage(errorMsg);
        
        try {
            const res = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ dni, password })
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Error de login');
            }

            // Guardar token
            localStorage.setItem('mirai_auth_token', data.token);
            localStorage.setItem('mirai_user_dni', data.dni);
            
            // Redirigir
            window.location.href = 'index.html';
            
        } catch (err) {
            showError(errorMsg, err.message);
            shakeElement(loginForm);
        } finally {
            setLoading(loginBtn, false);
        }
    });

    // ============================================
    // RECUPERACIÓN DE CONTRASEÑA
    // ============================================
    forgotLink.addEventListener('click', (e) => {
        e.preventDefault();
        recoveryModal.classList.add('active');
    });

    closeModal.addEventListener('click', () => {
        recoveryModal.classList.remove('active');
        hideMessage(recoveryMsg);
        recoveryForm.reset();
    });

    window.addEventListener('click', (e) => {
        if (e.target === recoveryModal) {
            recoveryModal.classList.remove('active');
            hideMessage(recoveryMsg);
            recoveryForm.reset();
        }
    });

    recoveryForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const email = document.getElementById('recovery-email').value;
        
        setLoading(recoveryBtn, true);
        hideMessage(recoveryMsg);
        
        try {
            const res = await fetch('/api/forgot-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email })
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Error al solicitar recuperación');
            }

            // Éxito
            showSuccess(recoveryMsg, '✅ Si el correo existe, recibirás instrucciones de recuperación en breve.');
            
            // Cerrar modal después de 4 segundos
            setTimeout(() => {
                recoveryModal.classList.remove('active');
                hideMessage(recoveryMsg);
                recoveryForm.reset();
            }, 4000);

        } catch (err) {
            showError(recoveryMsg, '❌ ' + err.message);
        } finally {
            setLoading(recoveryBtn, false);
        }
    });

    // ============================================
    // UTILIDADES
    // ============================================
    function setLoading(button, isLoading) {
        const btnText = button.querySelector('.btn-text');
        const btnLoader = button.querySelector('.btn-loader');
        
        if (isLoading) {
            button.disabled = true;
            btnText.classList.add('hidden');
            btnLoader.classList.remove('hidden');
        } else {
            button.disabled = false;
            btnText.classList.remove('hidden');
            btnLoader.classList.add('hidden');
        }
    }

    function showError(element, message) {
        element.textContent = message;
        element.style.display = 'block';
        element.classList.remove('success-message');
        element.classList.add('error-message');
    }

    function showSuccess(element, message) {
        element.textContent = message;
        element.style.display = 'block';
        element.classList.remove('error-message');
        element.classList.add('success-message');
    }

    function hideMessage(element) {
        element.style.display = 'none';
        element.textContent = '';
    }

    function shakeElement(element) {
        element.animate([
            { transform: 'translateX(0)' },
            { transform: 'translateX(-10px)' },
            { transform: 'translateX(10px)' },
            { transform: 'translateX(-10px)' },
            { transform: 'translateX(10px)' },
            { transform: 'translateX(0)' }
        ], { duration: 400 });
    }
});