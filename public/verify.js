/* ============================================
   MIRAI AI - Verification Logic
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {
    const verifyForm = document.getElementById('verify-form');
    const errorMsg = document.getElementById('error-msg');
    const successMsg = document.getElementById('success-msg');
    const verifyBtn = document.getElementById('verify-btn');
    const resendLink = document.getElementById('resend-link');
    const dniInput = document.getElementById('dni');

    // Opcional: Pre-rellenar DNI si viene de la sesión anterior (si lo guardaste)
    // const savedDni = localStorage.getItem('pending_dni');
    // if (savedDni) dniInput.value = savedDni;

    // ============================================
    // VERIFICAR CÓDIGO
    // ============================================
    verifyForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const dni = dniInput.value;
        const code = document.getElementById('otp').value;
        
        if (code.length !== 6) {
            showError(errorMsg, 'El código debe tener 6 dígitos');
            return;
        }

        setLoading(verifyBtn, true);
        hideMessage(errorMsg);
        hideMessage(successMsg);
        
        try {
            const res = await fetch('/api/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ dni, code })
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Error de verificación');
            }

            // Éxito
            showSuccess(successMsg, '✅ ¡Cuenta verificada! Redirigiendo al login...');
            hideMessage(errorMsg);
            
            // Limpiar formulario
            verifyForm.reset();
            
            // Redirigir al login después de 2 segundos
            setTimeout(() => {
                window.location.href = 'login.html';
            }, 2000);

        } catch (err) {
            showError(errorMsg, '❌ ' + err.message);
            // Efecto de vibración en el input de código
            document.getElementById('otp').animate([
                { transform: 'translateX(0)' },
                { transform: 'translateX(-5px)' },
                { transform: 'translateX(5px)' },
                { transform: 'translateX(0)' }
            ], { duration: 300 });
        } finally {
            setLoading(verifyBtn, false);
        }
    });

    // ============================================
    // REENVIAR CÓDIGO
    // ============================================
    resendLink.addEventListener('click', async (e) => {
        e.preventDefault();
        
        const dni = dniInput.value;
        if (!dni) {
            showError(errorMsg, 'Por favor, ingresa tu DNI primero para reenviar el código.');
            return;
        }

        setLoading(verifyBtn, true); // Usamos el mismo botón o podríamos crear uno específico
        hideMessage(errorMsg);
        hideMessage(successMsg);

        try {
            const res = await fetch('/api/resend-otp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ dni })
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Error al reenviar');
            }

            showSuccess(successMsg, '✅ Nuevo código enviado a tu correo. Revisa tu bandeja (y spam).');
            
        } catch (err) {
            showError(errorMsg, '❌ ' + err.message);
        } finally {
            setLoading(verifyBtn, false);
        }
    });

    // ============================================
    // UTILIDADES (Mismas que en login.js)
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
});