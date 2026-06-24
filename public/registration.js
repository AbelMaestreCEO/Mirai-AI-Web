/* ============================================
   MIRAI AI - Registration Logic
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {
    const registerForm = document.getElementById('register-form');
    const errorMsg = document.getElementById('error-msg');
    const successMsg = document.getElementById('success-msg');
    const registerBtn = document.getElementById('register-btn');
    const countryInput = document.getElementById('country');
    const dniInput = document.getElementById('dni');
    const dniPrefix = document.getElementById('dni-prefix');

    // ============================================
    // CUSTOM COUNTRY SELECTOR
    // ============================================
    const selector   = document.getElementById('country-selector');
    const trigger    = document.getElementById('country-trigger');
    const triggerFlag = document.getElementById('country-trigger-flag');
    const triggerText = document.getElementById('country-trigger-text');
    const dropdown   = document.getElementById('country-dropdown');
    const searchInput = document.getElementById('country-search');
    const options    = Array.from(document.querySelectorAll('.country-option'));

    triggerText.classList.add('placeholder');

    function openDropdown() {
        selector.classList.add('open');
        trigger.setAttribute('aria-expanded', 'true');
        searchInput.value = '';
        filterOptions('');
        searchInput.focus();
    }

    function closeDropdown() {
        selector.classList.remove('open');
        trigger.setAttribute('aria-expanded', 'false');
    }

    function selectCountry(option) {
        const value = option.dataset.value;
        const flag  = option.querySelector('.co-flag').textContent;
        const name  = option.querySelector('.co-name').textContent;
        const prefix = option.querySelector('.co-prefix').textContent;

        countryInput.value = value;
        triggerFlag.textContent = flag;
        triggerText.textContent = name;
        triggerText.classList.remove('placeholder');

        options.forEach(o => o.classList.remove('selected'));
        option.classList.add('selected');

        dniPrefix.textContent = prefix;
        dniPrefix.style.display = 'flex';
        dniInput.placeholder = 'Solo el número, sin prefijo';

        closeDropdown();
        trigger.focus();
    }

    function filterOptions(query) {
        const q = query.toLowerCase();
        options.forEach(opt => {
            const label = opt.dataset.label.toLowerCase();
            opt.style.display = label.includes(q) ? '' : 'none';
        });
    }

    trigger.addEventListener('click', () => selector.classList.contains('open') ? closeDropdown() : openDropdown());
    trigger.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDropdown(); }
        if (e.key === 'Escape') closeDropdown();
    });

    searchInput.addEventListener('input', () => filterOptions(searchInput.value));

    options.forEach(opt => {
        opt.addEventListener('click', () => selectCountry(opt));
        opt.addEventListener('keydown', e => {
            if (e.key === 'Enter') selectCountry(opt);
        });
    });

    document.addEventListener('mousedown', e => {
        if (!selector.contains(e.target)) closeDropdown();
    });

    // ============================================
    // REGISTRO
    // ============================================
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const first_name = document.getElementById('first_name').value.trim();
        const last_name  = document.getElementById('last_name').value.trim();
        const country    = countryInput.value;
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

            sessionStorage.setItem('pending_dni', dni);

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