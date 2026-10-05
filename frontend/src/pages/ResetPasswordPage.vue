<template>
  <q-page class="auth-page flex flex-center">
    <div class="auth-wrapper">
      <div class="auth-card">
        <div class="auth-header">
          <div class="logo-container"><span class="logo-icon">🔑</span></div>
          <h1>Restablecer Contraseña</h1>
          <p class="subtitle">Ingresa tu nueva contraseña</p>
        </div>

        <div v-if="message" :key="messageKey" class="app-message q-mb-md" :class="`app-message--${message.kind}`">
          {{ message.text }}
        </div>

        <q-form v-if="showForm" class="auth-form" @submit="onSubmit">
          <div class="input-group">
            <label for="new-password">Nueva Contraseña</label>
            <q-input v-model="newPassword" for="new-password" type="password" outlined hide-bottom-space class="app-input" placeholder="Mínimo 8 caracteres" autocomplete="new-password" :rules="[required]" lazy-rules="ondemand">
              <template #prepend><span class="app-input-icon">🔒</span></template>
            </q-input>
          </div>
          <div class="input-group">
            <label for="confirm-password">Confirmar Contraseña</label>
            <q-input v-model="confirmPassword" for="confirm-password" type="password" outlined hide-bottom-space class="app-input" placeholder="Repite tu contraseña" autocomplete="new-password" :rules="[required]" lazy-rules="ondemand">
              <template #prepend><span class="app-input-icon">🔒</span></template>
            </q-input>
          </div>

          <q-btn type="submit" unelevated no-caps color="primary" class="app-btn-primary full-width" label="Cambiar Contraseña" :loading="sending">
            <template #loading>⏳</template>
          </q-btn>
        </q-form>

        <div class="auth-footer">
          <AppLink to="login" class="app-link">Volver al inicio de sesión</AppLink>
        </div>
      </div>
    </div>
  </q-page>
</template>

<script setup lang="ts">
// Migración de public/reset-password.html. El enlace llega por correo con
// ?token=... (también desde la URL antigua /reset-password.html, que el Worker
// redirige aquí conservando la query).
import { onBeforeUnmount, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AppLink from '@/components/AppLink.vue';
import { api, type ApiErrorBody } from '@/lib/api';

interface Message {
  kind: 'error' | 'success';
  text: string;
}

const route = useRoute();
const router = useRouter();
const required = (v: string) => !!v || 'Campo requerido';

const token = typeof route.query.token === 'string' ? route.query.token : '';
const newPassword = ref('');
const confirmPassword = ref('');
const sending = ref(false);
const showForm = ref(!!token);
const messageKey = ref(0);
const message = ref<Message | null>(
  token ? null : { kind: 'error', text: 'Enlace inválido. Solicita un nuevo enlace de recuperación.' },
);

const timers: number[] = [];
onBeforeUnmount(() => timers.forEach((t) => clearTimeout(t)));

function show(kind: Message['kind'], text: string) {
  message.value = { kind, text };
  messageKey.value++;
}

async function onSubmit() {
  message.value = null;
  if (newPassword.value !== confirmPassword.value) return show('error', 'Las contraseñas no coinciden.');
  if (newPassword.value.length < 8) return show('error', 'La contraseña debe tener al menos 8 caracteres.');

  sending.value = true;
  try {
    const { data } = await api.post<ApiErrorBody & { success?: boolean }>('/api/reset-password', {
      token,
      new_password: newPassword.value,
    });
    if (data.success) {
      show('success', '¡Contraseña actualizada! Redirigiendo al login...');
      showForm.value = false;
      timers.push(window.setTimeout(() => void router.push({ name: 'login' }), 2500));
    } else {
      show('error', typeof data.error === 'string' && data.error ? data.error : 'Error al restablecer la contraseña.');
    }
  } catch {
    show('error', 'Error de conexión. Inténtalo de nuevo.');
  } finally {
    sending.value = false;
  }
}
</script>
