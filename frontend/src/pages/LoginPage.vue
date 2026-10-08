<template>
  <q-page class="auth-page flex flex-center">
    <div class="auth-wrapper">
      <div class="auth-card">
        <div class="auth-header">
          <div class="logo-container"><span class="logo-icon">🔐</span></div>
          <h1>Bienvenido de nuevo</h1>
          <p class="subtitle">Ingresa tus credenciales para continuar</p>
        </div>

        <div v-if="loginMessage" :key="messageKey" class="app-message q-mb-md" :class="`app-message--${loginMessage.kind}`">
          {{ loginMessage.text }}
        </div>

        <q-form class="auth-form" :class="{ 'app-shake': shaking }" @submit="onLogin">
          <div class="input-group">
            <label for="email">Correo Electrónico</label>
            <q-input
              v-model="email"
              for="email"
              type="email"
              outlined
              hide-bottom-space
              class="app-input"
              placeholder="tu@email.com"
              autocomplete="email"
              :rules="[required]"
              lazy-rules="ondemand"
            >
              <template #prepend><span class="app-input-icon">📧</span></template>
            </q-input>
          </div>

          <div class="input-group">
            <label for="password">Contraseña</label>
            <q-input
              v-model="password"
              for="password"
              type="password"
              outlined
              hide-bottom-space
              class="app-input"
              placeholder="••••••••"
              autocomplete="current-password"
              :rules="[required]"
              lazy-rules="ondemand"
            >
              <template #prepend><span class="app-input-icon">🔒</span></template>
            </q-input>
          </div>

          <q-btn
            type="submit"
            unelevated
            no-caps
            color="primary"
            class="app-btn-primary full-width"
            label="Iniciar Sesión"
            :loading="loggingIn"
          >
            <template #loading>⏳</template>
          </q-btn>
        </q-form>

        <div class="auth-footer">
          <a class="app-link" href="#" @click.prevent="openRecovery">¿Olvidaste tu contraseña?</a>
          <span class="divider">|</span>
          <span>¿No tienes cuenta? <AppLink to="registration" class="app-link">Regístrate</AppLink></span>
        </div>
      </div>
    </div>

    <!-- Recuperación de contraseña -->
    <q-dialog v-model="recoveryOpen" @hide="resetRecovery">
      <div class="auth-dialog">
        <button type="button" class="modal-close" aria-label="Cerrar" @click="recoveryOpen = false">&times;</button>
        <div class="modal-header">
          <span class="modal-icon">📧</span>
          <h2>Recuperar Contraseña</h2>
          <p>Te enviaremos un enlace para restablecer tu acceso</p>
        </div>

        <div v-if="recoveryMessage" class="app-message q-mb-md" :class="`app-message--${recoveryMessage.kind}`">
          {{ recoveryMessage.text }}
        </div>

        <q-form class="auth-form" @submit="onRecovery">
          <div class="input-group">
            <label for="recovery-email">Correo Electrónico</label>
            <q-input
              v-model="recoveryEmail"
              for="recovery-email"
              type="email"
              outlined
              hide-bottom-space
              class="app-input"
              placeholder="tu@email.com"
              :rules="[required]"
              lazy-rules="ondemand"
            >
              <template #prepend><span class="app-input-icon">📧</span></template>
            </q-input>
          </div>

          <q-btn
            type="submit"
            unelevated
            no-caps
            color="primary"
            class="app-btn-primary full-width"
            label="Enviar Enlace"
            :loading="recovering"
          >
            <template #loading>⏳</template>
          </q-btn>
        </q-form>
      </div>
    </q-dialog>
  </q-page>
</template>

<script setup lang="ts">
// Migración de public/login.html + login.js + login-guard.js, con el mismo
// comportamiento: si ya hay sesión se va al inicio; si el usuario tiene 2FA,
// se le manda a /verify (página antigua) tras avisar.
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import AppLink from '@/components/AppLink.vue';
import { api, errorMessage, isNeedsVerification, type ApiErrorBody, type LoginResponse } from '@/lib/api';
import { fullNavigate, pageHref } from '@/lib/pages';

interface Message {
  kind: 'error' | 'success';
  text: string;
}

const router = useRouter();
const required = (v: string) => !!v || 'Campo requerido';

const email = ref('');
const password = ref('');
const loggingIn = ref(false);
const loginMessage = ref<Message | null>(null);
// Cambia en cada mensaje para que la animación de sacudida se repita.
const messageKey = ref(0);
const shaking = ref(false);

const recoveryOpen = ref(false);
const recoveryEmail = ref('');
const recovering = ref(false);
const recoveryMessage = ref<Message | null>(null);

const timers: number[] = [];
const later = (fn: () => void, ms: number) => timers.push(window.setTimeout(fn, ms));
onBeforeUnmount(() => timers.forEach((t) => clearTimeout(t)));

function showLoginMessage(kind: Message['kind'], text: string) {
  loginMessage.value = { kind, text };
  messageKey.value++;
}

function shake() {
  shaking.value = false;
  requestAnimationFrame(() => {
    shaking.value = true;
    later(() => (shaking.value = false), 400);
  });
}

// login-guard.js: con sesión activa no tiene sentido quedarse en el login.
onMounted(async () => {
  try {
    const { ok } = await api.get('/api/me');
    if (ok) fullNavigate(pageHref(''), { replace: true });
  } catch {
    // Sin conexión o sin sesión: se queda en el login.
  }
});

async function onLogin() {
  loggingIn.value = true;
  loginMessage.value = null;
  try {
    const { ok, data } = await api.post<LoginResponse>('/api/login', {
      email: email.value.trim().toLowerCase(),
      password: password.value,
    });

    if (ok) {
      // La cookie de sesión ya la ha puesto el Worker.
      fullNavigate(pageHref(''));
      return;
    }

    if (isNeedsVerification(data)) {
      showLoginMessage(
        'error',
        data.message_sent ? '🔐 Verificación necesaria. Hemos enviado un código a tu correo.' : data.error,
      );
      later(() => void router.push({ name: 'verify' }), 2500);
      return;
    }

    showLoginMessage('error', errorMessage(data, 'Error de login'));
    shake();
  } catch {
    showLoginMessage('error', 'No se pudo conectar. Revisa tu conexión e inténtalo de nuevo.');
    shake();
  } finally {
    loggingIn.value = false;
  }
}

function openRecovery() {
  recoveryOpen.value = true;
}

function resetRecovery() {
  recoveryEmail.value = '';
  recoveryMessage.value = null;
}

async function onRecovery() {
  recovering.value = true;
  recoveryMessage.value = null;
  try {
    const { ok, data } = await api.post<ApiErrorBody>('/api/forgot-password', { email: recoveryEmail.value });
    if (!ok) throw new Error(errorMessage(data, 'Error al solicitar recuperación'));

    recoveryMessage.value = {
      kind: 'success',
      text: '✅ Si el correo existe, recibirás instrucciones de recuperación en breve.',
    };
    later(() => (recoveryOpen.value = false), 4000);
  } catch (err) {
    const text = err instanceof Error && err.message !== 'Failed to fetch' ? err.message : 'No se pudo conectar.';
    recoveryMessage.value = { kind: 'error', text: '❌ ' + text };
  } finally {
    recovering.value = false;
  }
}
</script>
