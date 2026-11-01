<template>
  <header class="header">
    <MenuToggle />
    <div class="header-title">Juegos</div>
  </header>

  <div class="game-page">
    <div class="game-hero">
      <h1>{{ assignmentId ? 'Ludo de la tarea' : 'Ludo del aula' }}</h1>
      <p v-if="assignmentId">
        Entra a una sala con espacio o crea la tuya. Los puntos de la partida cuentan para la nota de la tarea.
      </p>
      <p v-else>Salas por turnos con resultados e historial. Entra con un código o crea una sala para tu sección.</p>
    </div>

    <div v-if="state === 'loading'" class="game-card muted" role="status">Cargando…</div>
    <div v-else-if="state === 'error'" class="game-card app-message app-message--error" role="alert">
      {{ error }}
      <button class="link-btn" type="button" @click="load">Reintentar</button>
    </div>

    <template v-else>
      <section v-if="!assignmentId" class="game-card">
        <label class="field">
          <span>Sección</span>
          <select v-model="selectedSection" class="select" @change="loadRooms">
            <option v-if="sections.length === 0" value="">Sin secciones disponibles</option>
            <option v-for="s in sections" :key="s.id" :value="s.id">
              {{ s.course_title ? `${s.course_title} · ${s.name}` : s.name }}
            </option>
          </select>
        </label>

        <div class="row-actions">
          <button class="btn-secondary" type="button" :disabled="!selectedSection || loadingRooms" @click="loadRooms">
            {{ loadingRooms ? 'Actualizando…' : 'Actualizar salas' }}
          </button>
          <AppLink to="classroom" class="link-btn">Volver al Aula</AppLink>
        </div>
      </section>

      <section v-if="canCreate" class="game-card">
        <h2>Crear sala</h2>
        <p class="muted small">Solo puedes tener una sala activa a la vez. Expira sola en 2 horas.</p>
        <div class="create-grid">
          <label class="field">
            <span>Jugadores</span>
            <select v-model.number="form.max_players" class="select">
              <option :value="2">2</option>
              <option :value="3">3</option>
              <option :value="4">4</option>
            </select>
          </label>
          <label class="field">
            <span>Segundos por turno</span>
            <select v-model.number="form.turn_seconds" class="select">
              <option :value="20">20</option>
              <option :value="40">40</option>
              <option :value="60">60</option>
              <option :value="90">90</option>
            </select>
          </label>
        </div>
        <div class="create-actions">
          <button class="btn-primary" type="button" :disabled="!(assignmentId || selectedSection) || creating" @click="createRoom">
            {{ creating ? 'Creando…' : 'Crear sala' }}
          </button>
          <button
            class="btn-icon"
            type="button"
            :disabled="loadingRooms"
            aria-label="Actualizar salas"
            title="Actualizar salas"
            @click="loadRooms"
          >
            <svg class="refresh-icon" :class="{ spinning: loadingRooms }" viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M17.65 6.35A7.95 7.95 0 0 0 12 4a8 8 0 1 0 8 8h-2a6 6 0 1 1-1.76-4.24L13 11h7V4l-2.35 2.35Z"
              />
            </svg>
          </button>
        </div>
        <p v-if="createdCode" class="created-code" role="status">
          Sala creada: <strong>{{ createdCode }}</strong>
          <button class="link-btn" type="button" @click="copy(createdCode)">Copiar código</button>
          <button class="link-btn" type="button" @click="openRoom(createdCode)">Entrar</button>
        </p>
      </section>

      <section class="game-card">
        <h2>Unirse con código</h2>
        <form class="join-row" @submit.prevent="joinByCode">
          <input
            v-model.trim="joinCode"
            class="input"
            type="text"
            inputmode="text"
            autocapitalize="characters"
            maxlength="12"
            placeholder="Código de sala"
            aria-label="Código de sala"
          />
          <button class="btn-primary" type="submit" :disabled="joinCode.length < 4">Entrar</button>
        </form>
      </section>

      <section class="game-card">
        <h2>Salas con espacio</h2>
        <div v-if="!assignmentId && !selectedSection" class="muted">Elige una sección para ver sus salas.</div>
        <div v-else-if="loadingRooms" class="muted" role="status">Cargando salas…</div>
        <div v-else-if="rooms.length === 0" class="muted">
          No hay salas con espacio ahora mismo. Puedes crear una.
        </div>
        <ul v-else class="room-list">
          <li v-for="room in rooms" :key="room.id" class="room-item">
            <div class="room-main">
              <div class="room-code">
                {{ room.code }}
                <span class="chip">{{ room.status === 'playing' ? 'En partida' : 'Lobby' }}</span>
              </div>
              <div class="muted small">
                {{ room.player_count }}/{{ room.max_players }} · {{ room.free_slots }} libre(s) ·
                {{ room.turn_seconds }} s/turno
              </div>
              <div class="players-line">
                <span class="muted small">Jugadores:</span>
                <template v-if="room.players.length">
                  <span v-for="name in room.players" :key="name" class="player-chip">{{ name }}</span>
                </template>
                <span v-else class="muted small">Nadie todavía</span>
              </div>
            </div>
            <div class="room-actions">
              <button class="btn-secondary" type="button" @click="openRoom(room.code)">Entrar</button>
              <template v-if="canManage(room)">
                <button
                  v-if="room.status === 'lobby'"
                  class="btn-primary"
                  type="button"
                  :disabled="busyCode === room.code || room.player_count < 2"
                  @click="startRoom(room.code)"
                >
                  Iniciar
                </button>
                <button
                  class="link-btn danger"
                  type="button"
                  :disabled="busyCode === room.code || room.player_count > 1"
                  :title="room.player_count > 1 ? 'Solo puedes cerrar la sala cuando quede un jugador' : 'Cerrar la sala'"
                  @click="cancelRoom(room.code)"
                >
                  Cancelar
                </button>
              </template>
            </div>
          </li>
        </ul>
        <p v-if="actionError" class="app-message app-message--error" role="alert">
          {{ actionError }}
          <button v-if="existingCode" class="link-btn" type="button" @click="openRoom(existingCode)">Entrar a mi sala</button>
        </p>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import MenuToggle from '@/components/MenuToggle.vue';
import AppLink from '@/components/AppLink.vue';
import { api } from '@/lib/api';
import { currentUser } from '@/lib/session';

interface SectionOption {
  id: string;
  name: string;
  course_title?: string | null;
}

interface StudentClass {
  section_id?: string | null;
  section_name?: string | null;
  course_title?: string | null;
}

interface RoomSummary {
  id: string;
  code: string;
  status: string;
  max_players: number;
  turn_seconds: number;
  player_count: number;
  free_slots: number;
  players: string[];
  is_creator: boolean;
}

const route = useRoute();
const router = useRouter();
const assignmentId = typeof route.query.assignment_id === 'string' ? route.query.assignment_id : '';

const state = ref<'loading' | 'ready' | 'error'>('loading');
const error = ref('');
const actionError = ref('');
const existingCode = ref('');
const isProfessor = ref(false);
const sections = ref<SectionOption[]>([]);
const selectedSection = ref('');
const rooms = ref<RoomSummary[]>([]);
const loadingRooms = ref(false);
const creating = ref(false);
const createdCode = ref('');
const joinCode = ref('');
const busyCode = ref('');
const form = reactive({ max_players: 4, turn_seconds: 40 });

const canCreate = computed(() => !!assignmentId || isProfessor.value);

onMounted(load);

async function load(): Promise<void> {
  state.value = 'loading';
  error.value = '';
  try {
    if (assignmentId) {
      // Sala ligada a la tarea: cualquier alumno con acceso puede crear y
      // unirse; el docente aquí solo publica la tarea.
      isProfessor.value = false;
      await loadRooms();
      state.value = 'ready';
      return;
    }

    const role = await api.get<{ is_professor?: boolean }>('/api/check-professor-role');
    if (role.status === 401) {
      error.value = 'Tu sesión expiró. Vuelve a iniciar sesión.';
      state.value = 'error';
      return;
    }
    isProfessor.value = role.data.is_professor === true;
    sections.value = isProfessor.value ? await loadProfessorSections() : await loadStudentSections();
    const first = sections.value[0];
    if (first) {
      selectedSection.value = first.id;
      await loadRooms();
    }
    state.value = 'ready';
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'No se pudieron cargar los datos.';
    state.value = 'error';
  }
}

async function loadProfessorSections(): Promise<SectionOption[]> {
  const res = await api.get<SectionOption[]>('/api/sections');
  if (!res.ok) throw new Error('No se pudieron cargar tus secciones.');
  return Array.isArray(res.data) ? res.data : [];
}

async function loadStudentSections(): Promise<SectionOption[]> {
  const dni = currentUser.value?.dni;
  if (!dni) return [];
  const res = await api.get<{ classes?: StudentClass[] }>(
    `/api/my-submissions?user_dni=${encodeURIComponent(dni)}`,
  );
  if (!res.ok) throw new Error('No se pudieron cargar tus clases.');
  const options = new Map<string, SectionOption>();
  for (const item of res.data.classes ?? []) {
    if (!item.section_id) continue;
    options.set(item.section_id, {
      id: item.section_id,
      name: item.section_name || 'Sección',
      course_title: item.course_title ?? null,
    });
  }
  return [...options.values()];
}

async function loadRooms(): Promise<void> {
  const filter = assignmentId
    ? `assignment_id=${encodeURIComponent(assignmentId)}`
    : selectedSection.value
      ? `section_id=${encodeURIComponent(selectedSection.value)}`
      : '';
  if (!filter) {
    rooms.value = [];
    return;
  }
  loadingRooms.value = true;
  actionError.value = '';
  existingCode.value = '';
  try {
    const res = await api.get<RoomSummary[] | { error?: string }>(`/api/game/rooms?${filter}`);
    if (res.ok && Array.isArray(res.data)) {
      rooms.value = res.data;
    } else {
      rooms.value = [];
      if (!res.ok && !Array.isArray(res.data)) {
        actionError.value = res.data.error ?? 'No se pudieron cargar las salas.';
      }
    }
  } finally {
    loadingRooms.value = false;
  }
}

async function createRoom(): Promise<void> {
  if (creating.value) return;
  creating.value = true;
  actionError.value = '';
  existingCode.value = '';
  createdCode.value = '';
  try {
    const res = await api.post<{ code?: string; error?: string }>('/api/game/rooms', {
      assignment_id: assignmentId || undefined,
      section_id: assignmentId ? undefined : selectedSection.value || undefined,
      game_type: 'ludo',
      max_players: form.max_players,
      turn_seconds: form.turn_seconds,
    });
    if (!res.ok || !res.data.code) {
      actionError.value = res.data.error ?? 'No se pudo crear la sala.';
      if (res.status === 409 && res.data.code) {
        existingCode.value = res.data.code;
        createdCode.value = res.data.code;
      }
      return;
    }
    createdCode.value = res.data.code;
    await loadRooms();
    openRoom(res.data.code);
  } finally {
    creating.value = false;
  }
}

function joinByCode(): void {
  const code = joinCode.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length < 4) return;
  void router.push({ path: `/game/${code}`, query: assignmentId ? { assignment_id: assignmentId } : {} });
}

function openRoom(code: string): void {
  void router.push({ path: `/game/${code}`, query: assignmentId ? { assignment_id: assignmentId } : {} });
}

function canManage(room: RoomSummary): boolean {
  return room.is_creator || isProfessor.value;
}

async function startRoom(code: string): Promise<void> {
  busyCode.value = code;
  actionError.value = '';
  try {
    const res = await api.post<{ error?: string }>(`/api/game/rooms/${code}/start`, {});
    if (!res.ok) {
      actionError.value = res.data.error ?? 'No se pudo iniciar la partida.';
      return;
    }
    openRoom(code);
  } finally {
    busyCode.value = '';
  }
}

async function cancelRoom(code: string): Promise<void> {
  busyCode.value = code;
  actionError.value = '';
  try {
    const res = await api.post<{ error?: string }>(`/api/game/rooms/${code}/cancel`, {});
    if (!res.ok) actionError.value = res.data.error ?? 'No se pudo cancelar la sala.';
    else await loadRooms();
  } finally {
    busyCode.value = '';
  }
}

async function copy(code: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(code);
  } catch {
    // Portapapeles no disponible (http o permisos): el código ya está visible.
  }
}
</script>

<style scoped>
.game-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
  color: var(--text-primary);
  --bad: #b3261e;
}

[data-theme="dark"] .game-page {
  --bad: #ffb4ab;
}

.game-hero {
  position: relative;
  overflow: hidden;
  border-radius: 20px;
  padding: 22px 20px;
  border: 1px solid var(--glass-border);
  background:
    radial-gradient(120% 160% at 100% 0%, var(--accent-glow, rgba(103, 80, 164, 0.22)), transparent 55%),
    linear-gradient(135deg, rgba(103, 80, 164, 0.08), transparent 60%);
  animation: hero-in 0.45s ease-out both;
}

.game-hero::after {
  content: '';
  position: absolute;
  top: -55%;
  right: -10%;
  width: 220px;
  height: 220px;
  border-radius: 50%;
  background: radial-gradient(circle, var(--accent-glow, rgba(103, 80, 164, 0.35)), transparent 70%);
  animation: hero-float 9s ease-in-out infinite alternate;
  pointer-events: none;
}

.game-hero h1 {
  position: relative;
  font-size: 1.6rem;
  font-weight: 700;
  margin-bottom: 4px;
  background: linear-gradient(100deg, var(--accent-color), var(--text-primary) 55%, var(--accent-color));
  background-size: 220% 100%;
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  animation: hero-shine 6s linear infinite;
}

.game-hero p {
  position: relative;
  color: var(--text-secondary);
  max-width: 60ch;
}

@keyframes hero-in {
  from { opacity: 0; transform: translateY(-8px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes hero-shine {
  from { background-position: 0% 50%; }
  to { background-position: 220% 50%; }
}

@keyframes hero-float {
  from { transform: translate3d(0, 0, 0) scale(1); }
  to { transform: translate3d(-18px, 14px, 0) scale(1.12); }
}

.game-card {
  animation: card-rise 0.4s ease-out backwards;
  transition: transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
}

.game-card:nth-of-type(1) { animation-delay: 0.04s; }
.game-card:nth-of-type(2) { animation-delay: 0.09s; }
.game-card:nth-of-type(3) { animation-delay: 0.14s; }
.game-card:nth-of-type(4) { animation-delay: 0.19s; }

.game-card:hover {
  transform: translateY(-2px);
  border-color: var(--accent-color);
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.08);
}

@keyframes card-rise {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

.room-item {
  transition: transform 0.18s ease, background 0.18s ease;
}

.room-item:hover {
  transform: translateX(4px);
}

@media (prefers-reduced-motion: reduce) {
  .game-hero,
  .game-hero::after,
  .game-hero h1,
  .game-card {
    animation: none;
  }

  .game-card:hover,
  .room-item:hover {
    transform: none;
  }
}

.game-card {
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  border-radius: 16px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.game-card h2 {
  font-size: 1.1rem;
  font-weight: 600;
}

.muted {
  color: var(--text-secondary);
}

.small {
  font-size: 0.85rem;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 0.9rem;
  font-weight: 600;
}

.select,
.input {
  font: inherit;
  padding: 10px 12px;
  border: 2px solid var(--glass-border);
  border-radius: 12px;
  background: var(--glass-bg);
  color: inherit;
  min-height: 44px;
}

.select:focus-visible,
.input:focus-visible {
  outline: 3px solid var(--accent-color);
  outline-offset: 1px;
}

.row-actions,
.room-actions,
.join-row,
.create-grid {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}

.create-actions {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}

.btn-icon {
  width: 44px;
  height: 44px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border-radius: 999px;
  border: 2px solid var(--glass-border);
  background: var(--secondary-container);
  color: var(--text-primary);
  cursor: pointer;
  transition: border-color 0.15s ease, filter 0.15s ease;
}

.btn-icon:hover:not(:disabled) {
  border-color: var(--accent-color);
}

.btn-icon:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.refresh-icon {
  width: 20px;
  height: 20px;
  fill: currentColor;
}

.refresh-icon.spinning {
  animation: spin 0.9s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.create-grid .field {
  flex: 1 1 140px;
}

.join-row .input {
  flex: 1 1 180px;
  text-transform: uppercase;
  letter-spacing: 0.15em;
}

.btn-primary,
.btn-secondary {
  font: inherit;
  font-weight: 600;
  border-radius: 999px;
  padding: 10px 20px;
  min-height: 44px;
  cursor: pointer;
  border: 2px solid transparent;
  transition: filter 0.15s ease;
}

.btn-primary {
  background: var(--accent-gradient);
  color: #fff;
}

.btn-secondary {
  background: var(--secondary-container);
  color: var(--text-primary);
}

.btn-primary:hover,
.btn-secondary:hover {
  filter: brightness(1.05);
}

.btn-primary:disabled,
.btn-secondary:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.link-btn {
  font: inherit;
  font-weight: 600;
  background: none;
  border: none;
  padding: 6px;
  color: var(--accent-color);
  cursor: pointer;
  text-decoration: underline;
}

.link-btn.danger {
  color: var(--bad, #b3261e);
}

.created-code {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.room-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.room-item {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  border-radius: 12px;
  background: var(--secondary-container);
}

.room-main {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.room-code {
  font-weight: 700;
  letter-spacing: 0.12em;
  font-size: 1.05rem;
  display: flex;
  align-items: center;
  gap: 8px;
}

.chip {
  font-size: 0.7rem;
  letter-spacing: normal;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--glass-bg);
}

.players-line {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}

.player-chip {
  font-size: 0.8rem;
  padding: 2px 10px;
  border-radius: 999px;
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
}

@media (max-width: 560px) {
  .room-actions {
    width: 100%;
    align-items: stretch;
  }

  .room-actions > * {
    flex: 1;
  }
}
</style>

<style>
/* El hueco del sidebar y el centrado los resuelve la regla compartida del final
   de styles.css (familia A). Aquí solo se declaran ancho y relleno. */
:where(body[data-page="game"]) .game-page {
  --page-max: 900px;
  --page-pad: 16px;
  max-width: var(--page-max);
  margin: 0 auto;
  padding: 16px 16px 64px;
}
</style>
