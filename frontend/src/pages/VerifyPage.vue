<template>
  <q-page class="auth-page flex flex-center">
    <div class="auth-wrapper">
      <div class="auth-card">
        <div class="auth-header">
          <div class="logo-container"><span class="logo-icon">📧</span></div>
          <h1>Verifica tu cuenta</h1>
          <p class="subtitle">Hemos enviado un código a tu correo</p>
        </div>

        <div v-if="message" :key="messageKey" class="app-message q-mb-md" :class="`app-message--${message.kind}`">
          {{ message.text }}
        </div>

        <q-form class="auth-form" @submit="onVerify">
          <div class="input-group">
            <label for="otp">Código de Verificación</label>
            <q-input
              v-model="code"
              for="otp"
              outlined
              hide-bottom-space
              class="app-input otp-input"
              :class="{ 'app-shake': shaking }"
              placeholder="123456"
              maxlength="6"
              inputmode="numeric"
              autocomplete="one-time-code"
              :rules="[required]"
              lazy-rules="ondemand"
            >
              <template #prepend><span class="app-input-icon">🔢</span></template>
            </q-input>
          </div>

          <q-btn type="submit" unelevated no-caps color="primary" class="app-btn-primary full-width" label="Verificar" :loading="busy">
            <template #loading>⏳</template>
          </q-btn>
        </q-form>

        <div class="auth-footer">
          <span>¿No recibiste el correo? <a href="#" class="app-link" @click.prevent="onResend">Reenviar código</a></span>
        </div>
      </div>
    </div>
  </q-page>
</template>

<script setup lang="ts">
// Migración de public/verify.html + verify.js. El reto OTP lo identifica el
// Worker por la cookie HttpOnly otp_pending, que viaja sola.
import { onBeforeUnmount, ref } from 'vue';
import { api, errorMessage, type ApiErrorBody } from '@/lib/api';
import { goToLegacy, pageHref } from '@/lib/legacy';

interface Message {
  kind: 'error' | 'success';
  text: string;
}

const required = (v: string) => !!v || 'Campo requerido';

const code = ref('');
const busy = ref(false);
const message = ref<Message | null>(null);
const messageKey = ref(0);
const shaking = ref(false);

const timers: number[] = [];
const later = (fn: () => void, ms: number) => timers.push(window.setTimeout(fn, ms));
onBeforeUnmount(() => timers.forEach((t) => clearTimeout(t)));

function show(kind: Message['kind'], text: string) {
  message.value = { kind, text };
  messageKey.value++;
}

async function onVerify() {
  const value = code.value.trim();
  if (value.length !== 6) return show('error', 'El código debe tener 6 dígitos');

  busy.value = true;
  message.value = null;
  try {
    const { ok, data } = await api.post<ApiErrorBody>('/api/verify', { code: value });
    if (!ok) throw new Error(errorMessage(data, 'Error de verificación'));

    // La cookie de sesión ya la ha puesto el Worker.
    show('success', '✅ ¡Verificación exitosa! Redirigiendo a tu panel...');
    code.value = '';
    later(() => goToLegacy(pageHref('')), 1500);
  } catch (err) {
    show('error', '❌ ' + (err instanceof Error && err.message !== 'Failed to fetch' ? err.message : 'No se pudo conectar.'));
    shaking.value = false;
    requestAnimationFrame(() => {
      shaking.value = true;
      later(() => (shaking.value = false), 400);
    });
  } finally {
    busy.value = false;
  }
}

async function onResend() {
  busy.value = true;
  message.value = null;
  try {
    const { ok, data } = await api.post<ApiErrorBody>('/api/resend-otp', {});
    if (!ok) throw new Error(errorMessage(data, 'Error al reenviar'));
    show('success', '✅ Nuevo código enviado a tu correo. Revisa tu bandeja (y spam).');
  } catch (err) {
    show('error', '❌ ' + (err instanceof Error && err.message !== 'Failed to fetch' ? err.message : 'No se pudo conectar.'));
  } finally {
    busy.value = false;
  }
}
</script>
