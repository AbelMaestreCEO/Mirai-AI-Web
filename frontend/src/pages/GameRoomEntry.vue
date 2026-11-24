<template>
  <div v-if="kind === 'loading'" class="entry-loading" role="status">Cargando sala…</div>
  <div v-else-if="kind === 'error'" class="entry-error">
    <p>{{ error }}</p>
    <button class="entry-btn" type="button" @click="goLobby">Volver al lobby</button>
  </div>
  <UnoRoomPage v-else-if="kind === 'uno'" />
  <GameRoomPage v-else />
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '@/lib/api';
import GameRoomPage from '@/pages/GameRoomPage.vue';
import UnoRoomPage from '@/pages/UnoRoomPage.vue';

const route = useRoute();
const router = useRouter();
const code = String(route.params.code ?? '').toUpperCase();
const kind = ref<'loading' | 'ludo' | 'uno' | 'error'>('loading');
const error = ref('');

onMounted(async () => {
  try {
    const res = await api.get<{ game_type?: string; error?: string }>(
      `/api/game/rooms/${encodeURIComponent(code)}/info`,
    );
    if (!res.ok) {
      error.value = res.data.error ?? 'No se pudo abrir la sala.';
      kind.value = 'error';
      return;
    }
    kind.value = res.data.game_type === 'uno' ? 'uno' : 'ludo';
  } catch {
    error.value = 'No se pudo abrir la sala.';
    kind.value = 'error';
  }
});

function goLobby(): void {
  const assignmentId = typeof route.query.assignment_id === 'string' ? route.query.assignment_id : '';
  void router.replace({ path: '/game', query: assignmentId ? { assignment_id: assignmentId } : {} });
}
</script>

<style scoped>
.entry-loading,
.entry-error {
  max-width: 480px;
  margin: 48px auto;
  padding: 20px;
  border-radius: 16px;
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  text-align: center;
  color: var(--text-primary);
}

.entry-btn {
  margin-top: 12px;
  font: inherit;
  font-weight: 600;
  border-radius: 999px;
  padding: 10px 20px;
  min-height: 44px;
  border: none;
  cursor: pointer;
  background: var(--accent-gradient);
  color: #fff;
}
</style>
