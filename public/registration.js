/* ============================================
   MIRAI AI - Registration Logic
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {
    const registerForm = document.getElementById('register-form');
    const errorMsg = document.getElementById('error-msg');
    const successMsg = document.getElementById('success-msg');
    const registerBtn = document.getElementById('register-btn');
    const countrySelect = document.getElementById('country');
    const dniInput = document.getElementById('dni');
    const dniPrefix = document.getElementById('dni-prefix');

    // Actualizar prefijo visual al cambiar país
    countrySelect.addEventListener('change', () => {
        const prefix = countrySelect.value;
        if (prefix) {
            dniPrefix.textContent = prefix + '-';
            dniPrefix.style.display = 'flex';
            dniInput.placeholder = 'Solo el número, sin prefijo';
        } else {
            dniPrefix.style.display = 'none';
            dniInput.placeholder = 'Selecciona un país primero';
        }
    });

    // ============================================
    // REGISTRO
    // ============================================
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const first_name = document.getElementById('first_name').value.trim();
        const last_name  = document.getElementById('last_name').value.trim();
        const country    = countrySelect.value;
        const dniRaw     = dniInput.value.trim();
        const email      = document.getElementById('email').value.trim().toLowerCase();
        const password   = document.getElementById('password').value;
        const confirmPassword = document.getElementById('confirm-password').value;

        if (!country) {
            showError(errorMsg, 'Selecciona tu país');
            shakeElement(registerForm);
            return;
        }

        if (!dniRaw) {
            showError(errorMsg, 'Ingresa tu número de identificación');
            shakeElement(registerForm);
            return;
        }

        // Construir DNI compuesto: PREFIJO-NUMERO (ej: V-12345678, COL-123456789)
        const dni = `${country}-${dniRaw.replace(/\s/g, '')}`;

        if (password !== confirmPassword) {
            showError(errorMsg, 'Las contraseñas no coinciden');
            shakeElement(registerForm);
            return;
        }

        if (password.length < 8) {
            showError(errorMsg, 'La contraseña debe tener al menos 8 caracteres');
            shakeElement(registerForm);
            return;
        }

        setLoading(registerBtn, true);
        hideMessages();

        try {
            const res = await fetch('/api/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ dni, email, password, first_name, last_name })
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Error de registro');
            }

            showSuccess(successMsg, '✅ ¡Registro exitoso! Redirigiendo...');
            hideMessage(errorMsg);

            document.querySelector('.auth-card').animate([
                { transform: 'scale(1)' },
                { transform: 'scale(1.02)' },
                { transform: 'scale(1)' }
            ], { duration: 300 });

            setTimeout(() => {
                window.location.href = 'verify';
            }, 2000);

        } catch (err) {
            showError(errorMsg, err.message);
            shakeElement(registerForm);
        } finally {
            setLoading(registerBtn, false);
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

    function hideMessages() {
        hideMessage(errorMsg);
        hideMessage(successMsg);
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