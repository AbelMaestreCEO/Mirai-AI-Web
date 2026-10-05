<template>
  <q-page class="auth-page flex flex-center">
    <div class="auth-wrapper">
      <div ref="cardRef" class="auth-card">
        <div class="auth-header">
          <div class="logo-container"><span class="logo-icon">🚀</span></div>
          <h1>Crea tu cuenta</h1>
          <p class="subtitle">Únete a Mirai AI en segundos</p>
        </div>

        <div v-if="message" :key="messageKey" class="app-message q-mb-md" :class="`app-message--${message.kind}`">
          {{ message.text }}
        </div>

        <q-form class="auth-form" :class="{ 'app-shake': shaking }" @submit="onSubmit">
          <div class="input-row">
            <div class="input-group">
              <label for="first_name">Nombre</label>
              <q-input v-model="firstName" for="first_name" outlined hide-bottom-space class="app-input" placeholder="Tu nombre" :rules="[required]" lazy-rules="ondemand">
                <template #prepend><span class="app-input-icon">👤</span></template>
              </q-input>
            </div>
            <div class="input-group">
              <label for="last_name">Apellido</label>
              <q-input v-model="lastName" for="last_name" outlined hide-bottom-space class="app-input" placeholder="Tu apellido" :rules="[required]" lazy-rules="ondemand">
                <template #prepend><span class="app-input-icon">👤</span></template>
              </q-input>
            </div>
          </div>

          <div class="input-group">
            <label for="country">País</label>
            <q-select
              v-model="country"
              for="country"
              outlined
              hide-bottom-space
              class="app-input"
              :options="countryOptions"
              option-value="value"
              option-label="label"
              use-input
              fill-input
              hide-selected
              input-debounce="0"
              placeholder="— Selecciona tu país —"
              popup-content-class="auth-select-menu"
              @filter="filterCountries"
            >
              <template #prepend>
                <span class="app-input-icon">{{ country?.flag ?? '🌎' }}</span>
              </template>
              <template #option="{ itemProps, opt }">
                <q-item v-bind="itemProps">
                  <q-item-section avatar class="country-flag">{{ opt.flag }}</q-item-section>
                  <q-item-section>{{ opt.label }}</q-item-section>
                  <q-item-section side class="country-prefix">{{ opt.prefix }}</q-item-section>
                </q-item>
              </template>
              <template #no-option>
                <q-item><q-item-section class="text-grey">Sin resultados</q-item-section></q-item>
              </template>
            </q-select>
          </div>

          <div class="input-group">
            <label for="dni">DNI / Número de Identificación</label>
            <q-input
              v-model="dni"
              for="dni"
              outlined
              hide-bottom-space
              class="app-input"
              autocomplete="off"
              :placeholder="country ? 'Solo el número, sin prefijo' : 'Selecciona primero tu país'"
            >
              <template #prepend>
                <span class="app-input-icon">🆔</span>
                <span v-if="country" class="dni-prefix q-ml-sm">{{ country.prefix }}</span>
              </template>
            </q-input>
          </div>

          <div class="input-group">
            <label for="email">Correo Electrónico</label>
            <q-input v-model="email" for="email" type="email" outlined hide-bottom-space class="app-input" placeholder="tu@email.com" :rules="[required]" lazy-rules="ondemand">
              <template #prepend><span class="app-input-icon">📧</span></template>
            </q-input>
          </div>

          <div class="input-group">
            <label for="password">Contraseña</label>
            <q-input v-model="password" for="password" type="password" outlined hide-bottom-space class="app-input" placeholder="Mínimo 8 caracteres" autocomplete="new-password" :rules="[required]" lazy-rules="ondemand">
              <template #prepend><span class="app-input-icon">🔒</span></template>
            </q-input>
          </div>

          <div class="input-group">
            <label for="confirm-password">Confirmar Contraseña</label>
            <q-input v-model="confirmPassword" for="confirm-password" type="password" outlined hide-bottom-space class="app-input" placeholder="Repite tu contraseña" autocomplete="new-password" :rules="[required]" lazy-rules="ondemand">
              <template #prepend><span class="app-input-icon">🔒</span></template>
            </q-input>
          </div>

          <q-btn type="submit" unelevated no-caps color="primary" class="app-btn-primary full-width" label="Crear Cuenta" :loading="sending">
            <template #loading>⏳</template>
          </q-btn>
        </q-form>

        <div class="auth-footer">
          <span>¿Ya tienes cuenta? <AppLink to="login" class="app-link">Inicia sesión</AppLink></span>
        </div>
      </div>
    </div>
  </q-page>
</template>

<script setup lang="ts">
// Migración de public/registration.html + registration.js.
import { onBeforeUnmount, ref } from 'vue';
import { useRouter } from 'vue-router';
import AppLink from '@/components/AppLink.vue';
import { api, errorMessage, type ApiErrorBody } from '@/lib/api';
import { COUNTRIES, type Country } from '@/lib/countries';

interface Message {
  kind: 'error' | 'success';
  text: string;
}

const router = useRouter();
const required = (v: string) => !!v || 'Campo requerido';

const firstName = ref('');
const lastName = ref('');
const country = ref<Country | null>(null);
const dni = ref('');
const email = ref('');
const password = ref('');
const confirmPassword = ref('');
const sending = ref(false);
const message = ref<Message | null>(null);
const messageKey = ref(0);
const shaking = ref(false);
const cardRef = ref<HTMLElement | null>(null);

const timers: number[] = [];
const later = (fn: () => void, ms: number) => timers.push(window.setTimeout(fn, ms));
onBeforeUnmount(() => timers.forEach((t) => clearTimeout(t)));

// Buscador de países: sin distinguir acentos ni mayúsculas, como registration.js.
const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const countryOptions = ref<Country[]>(COUNTRIES);
function filterCountries(query: string, update: (fn: () => void) => void) {
  update(() => {
    const q = normalize(query);
    countryOptions.value = q ? COUNTRIES.filter((c) => normalize(c.label).includes(q)) : COUNTRIES;
  });
}

function showError(text: string) {
  message.value = { kind: 'error', text };
  messageKey.value++;
  shaking.value = false;
  requestAnimationFrame(() => {
    shaking.value = true;
    later(() => (shaking.value = false), 400);
  });
}

async function onSubmit() {
  const dniRaw = dni.value.trim();

  if (!country.value) return showError('Selecciona tu país');
  if (!dniRaw) return showError('Ingresa tu número de identificación');
  if (password.value !== confirmPassword.value) return showError('Las contraseñas no coinciden');
  if (password.value.length < 8) return showError('La contraseña debe tener al menos 8 caracteres');

  // DNI compuesto: PREFIJO-NUMERO (V-12345678, COL-123456789).
  const fullDni = `${country.value.value}-${dniRaw.replace(/\s/g, '')}`;

  sending.value = true;
  message.value = null;
  try {
    const { ok, data } = await api.post<ApiErrorBody>('/api/register', {
      dni: fullDni,
      email: email.value.trim().toLowerCase(),
      password: password.value,
      first_name: firstName.value.trim(),
      last_name: lastName.value.trim(),
    });
    if (!ok) return showError(errorMessage(data, 'Error de registro'));

    message.value = { kind: 'success', text: '✅ ¡Registro exitoso! Redirigiendo...' };
    cardRef.value?.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.02)' }, { transform: 'scale(1)' }], { duration: 300 });
    later(() => void router.push({ name: 'verify' }), 2000);
  } catch {
    showError('No se pudo conectar. Revisa tu conexión e inténtalo de nuevo.');
  } finally {
    sending.value = false;
  }
}
</script>

<style scoped lang="scss">
.country-flag {
  min-width: 32px;
  font-size: 18px;
}

.country-prefix {
  font-size: 12px;
  font-weight: 600;
  color: #6750A4;
}
</style>
