/* ============================================
   MIRAI AI - Verification Logic
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {
    const verifyForm = document.getElementById('verify-form');
    const errorMsg = document.getElementById('error-msg');
    const successMsg = document.getElementById('success-msg');
    const verifyBtn = document.getElementById('verify-btn');
    const resendLink = document.getElementById('resend-link');

    // Opcional: Pre-rellenar DNI si viene de la sesión anterior (si lo guardaste)
    // const savedDni = localStorage.getItem('pending_dni');
    // if (savedDni) dniInput.value = savedDni;

    // ============================================
    // VERIFICAR CÓDIGO
    // ============================================
    verifyForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const dni = localStorage.getItem('pending_dni') || '';
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

            // 🆕 ÉXITO: Guardar token y redirigir a INDEX
            showSuccess(successMsg, '✅ ¡Verificación exitosa! Redirigiendo a tu panel...');
            hideMessage(errorMsg);

            // La cookie de sesión llega automáticamente desde el servidor (HttpOnly)
            // Solo guardamos datos no sensibles para la UI
            if (data.dni) localStorage.setItem('mirai_user_dni', data.dni);
            if (data.first_name && data.last_name) localStorage.setItem('mirai_user_name', `${data.first_name} ${data.last_name}`);
            if (data.role) localStorage.setItem('mirai_user_role', data.role);

            // Limpiar formulario y DNI pendiente
            verifyForm.reset();
            localStorage.removeItem('pending_dni');

            // Redirigir a INDEX (NO a login)
            setTimeout(() => {
                window.location.href = '/';
            }, 1500); // 1.5s es suficiente para ver el mensaje de éxito

        } catch (err) {
            showError(errorMsg, '❌ ' + err.message);
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

        const dni = localStorage.getItem('pending_dni') || '';
        if (!dni) {
            showError(errorMsg, 'No se encontró tu sesión. Vuelve a iniciar sesión.');
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