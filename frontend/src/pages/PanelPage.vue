<template>
  <header class="header">
    <MenuToggle />
    <div class="header-title">Panel Admin</div>
  </header>

  <div class="courses-container">
    <!-- Acceso denegado -->
    <div id="panel-denied" class="panel-denied" :style="{ display: access === 'denied' ? 'flex' : 'none' }">
      <div class="panel-denied-icon">🔒</div>
      <h2>Acceso Restringido</h2>
      <p>Este panel es exclusivo para administradores. Si crees que esto es un error, contacta al equipo.</p>
    </div>

    <!-- Contenido del panel (oculto hasta verificar rol) -->
    <div id="panel-content" :style="{ display: access === 'admin' ? 'block' : 'none' }">
      <div class="panel-hero">
        <h1>Panel de Administración</h1>
        <p>Busca usuarios y gestiona sus roles en la plataforma.</p>
        <p style="margin-top:0.6rem;">
          <AppLink to="api_usage_admin" style="color:var(--accent-color);font-weight:600;text-decoration:none;">📊 Consumo de APIs externas →</AppLink>
        </p>
      </div>

      <!-- Barra de búsqueda -->
      <div class="panel-toolbar">
        <div class="panel-search">
          <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"
            />
          </svg>
          <textarea
            id="user-search"
            v-model="searchInput"
            placeholder="Buscar por nombre, apellido o DNI..."
            rows="1"
            autocomplete="off"
            spellcheck="false"
            style="resize:none; overflow:hidden; line-height:1.5;"
          ></textarea>
        </div>
      </div>

      <!-- Contador -->
      <div id="panel-count" class="panel-count">{{ countLabel }}</div>

      <!-- Grid de usuarios -->
      <div id="users-grid" class="users-grid">
        <div v-if="state === 'loading'" class="panel-loading">
          <div class="panel-spinner"></div>
          <span>Cargando usuarios...</span>
        </div>
        <div v-else-if="state === 'error'" class="panel-empty">
          <div class="panel-empty-icon">⚠️</div>
          <p>No se pudieron cargar los usuarios. Verifica la conexión.</p>
        </div>
        <div v-else-if="!filtered.length" class="panel-empty">
          <div class="panel-empty-icon">🔍</div>
          <p>No hay usuarios que coincidan con la búsqueda</p>
        </div>
        <template v-else>
          <div v-for="u in filtered" :key="u.dni" class="user-card" :data-dni="u.dni">
            <div class="user-avatar">
              <img v-if="u.avatar_url && !brokenAvatars.has(u.dni)" :src="u.avatar_url" alt="Avatar" loading="lazy" @error="brokenAvatars.add(u.dni)">
              <template v-else>{{ initialOf(u) }}</template>
            </div>
            <p class="user-name">{{ fullName(u) }}</p>
            <p class="user-email">{{ censorEmail(u.email || '') }}</p>
            <span class="user-role-badge" :class="roleBadgeClass(u.role)">{{ roleLabel(u.role) }}</span>
            <span class="user-plan-badge" :class="`plan-${u.plan || 'basic'}`">{{ planLabel(u.plan) }}</span>
            <div class="role-select-wrapper">
              <select v-model="edits[u.dni]!.role" class="role-select" :data-dni="u.dni" :aria-label="`Cambiar rol de ${fullName(u)}`">
                <option value="student">🎓 Estudiante</option>
                <option value="teacher">🏫 Profesor</option>
                <option value="admin">🛡️ Admin</option>
              </select>
              <button
                class="role-save-btn"
                :class="{ saved: saving[`${u.dni}:role`] === 'saved' }"
                :data-dni="u.dni"
                :disabled="!!saving[`${u.dni}:role`]"
                :aria-label="`Guardar rol de ${fullName(u)}`"
                @click="save(u, 'role')"
              >
                {{ buttonLabel(u, 'role') }}
              </button>
            </div>
            <div class="role-select-wrapper">
              <select v-model="edits[u.dni]!.plan" class="plan-select" :data-dni="u.dni" :aria-label="`Cambiar plan de ${fullName(u)}`">
                <option v-for="(label, id) in PLAN_LABELS" :key="id" :value="id">{{ label }}</option>
              </select>
              <button
                class="plan-save-btn"
                :class="{ saved: saving[`${u.dni}:plan`] === 'saved' }"
                :data-dni="u.dni"
                :disabled="!!saving[`${u.dni}:plan`]"
                :aria-label="`Guardar plan de ${fullName(u)}`"
                @click="save(u, 'plan')"
              >
                {{ buttonLabel(u, 'plan') }}
              </button>
            </div>
          </div>
        </template>
      </div>
    </div>
  </div>

  <!-- Toast -->
  <div id="panel-toast" class="panel-toast" :class="{ show: toastVisible }">{{ toastText }}</div>
</template>

<script setup lang="ts">
// Migración de public/panel.html (su JS iba dentro de la página): usuarios de
// la plataforma con su rol y su plan, solo para administradores.
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import AppLink from '@/components/AppLink.vue';
import MenuToggle from '@/components/MenuToggle.vue';
import { api, errorMessage } from '@/lib/api';

interface AdminUser {
  dni: string;
  first_name?: string | null;
  last_name?: string | null;
  name?: string | null;
  email?: string | null;
  role?: string | null;
  plan?: string | null;
  avatar_url?: string | null;
}

type Field = 'role' | 'plan';

const PLAN_LABELS: Record<string, string> = {
  basic: '⭐ Basic',
  students: '🎓 Students',
  development: '💻 Development',
  designer: '🎨 Designer',
  max: '🚀 Max',
};
const ROLE_LABELS: Record<string, string> = { admin: 'Admin', teacher: 'Profesor', profesor: 'Profesor', professor: 'Profesor', student: 'Estudiante' };

/** a*****e@g***.com */
function censorEmail(email: string): string {
  if (!email.includes('@')) return '***@***.***';
  const [local = '', domain = ''] = email.split('@');
  const cLocal = local.length <= 2 ? `${local[0]}*` : `${local[0]}${'*'.repeat(Math.min(local.length - 2, 5))}${local[local.length - 1]}`;
  const dot = domain.lastIndexOf('.');
  if (dot <= 0) return `${cLocal}@${domain}`;
  const name = domain.substring(0, dot);
  return `${cLocal}@${name[0]}${'*'.repeat(Math.min(name.length - 1, 3))}.${domain.substring(dot + 1)}`;
}

function roleBadgeClass(role?: string | null): string {
  const r = (role || '').toLowerCase();
  if (!r) return 'role-usuario';
  if (r === 'admin') return 'role-admin';
  if (r === 'teacher' || r === 'profesor' || r === 'professor') return 'role-profesor';
  return 'role-student';
}

function roleLabel(role?: string | null): string {
  if (!role) return 'Usuario';
  return ROLE_LABELS[role.toLowerCase()] || role;
}

function planLabel(plan?: string | null): string {
  return PLAN_LABELS[plan ?? ''] || '⭐ Basic';
}

function fullName(u: AdminUser): string {
  return [u.first_name, u.last_name].filter(Boolean).join(' ') || u.name || 'Sin nombre';
}

function initialOf(u: AdminUser): string {
  return (u.first_name || fullName(u) || '?')[0]!.toUpperCase();
}

// ── Toast ─────────────────────────────────────────────────────────────────
const toastText = ref('');
const toastVisible = ref(false);
let toastTimer: number | undefined;

function showToast(msg: string, duration = 2800) {
  toastText.value = msg;
  toastVisible.value = true;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (toastVisible.value = false), duration);
}

// ── Acceso y carga ────────────────────────────────────────────────────────
const access = ref<'checking' | 'admin' | 'denied'>('checking');
const users = ref<AdminUser[]>([]);
const state = ref<'loading' | 'ready' | 'error'>('loading');
const brokenAvatars = reactive(new Set<string>());
/** Rol y plan elegidos en los desplegables, por DNI (aún sin guardar). */
const edits = reactive<Record<string, { role: string; plan: string }>>({});

function setUsers(list: AdminUser[]) {
  users.value = list;
  for (const u of list) edits[u.dni] = { role: u.role || 'student', plan: u.plan || 'basic' };
  state.value = 'ready';
}

/** Si /api/admin/users falla, al menos los estudiantes de /api/students. */
async function loadFromStudents() {
  try {
    const { ok, status, data } = await api.get<{ id?: string; dni?: string; name?: string; email?: string }[]>('/api/students');
    if (!ok) throw new Error(`HTTP ${status}`);
    setUsers(
      (Array.isArray(data) ? data : []).map((s) => ({
        dni: String(s.id || s.dni || ''),
        first_name: (s.name || '').split(' ')[0] || '',
        last_name: (s.name || '').split(' ').slice(1).join(' ') || '',
        email: s.email || '',
        role: 'student',
        avatar_url: null,
      })),
    );
  } catch (err) {
    console.error('[Panel] Error cargando usuarios:', err);
    state.value = 'error';
  }
}

async function loadUsers() {
  try {
    const { ok, status, data } = await api.get<AdminUser[] | { users?: AdminUser[] }>('/api/admin/users');
    if (!ok) throw new Error(`HTTP ${status}`);
    setUsers(Array.isArray(data) ? data : (data.users ?? []));
  } catch (err) {
    console.warn('[Panel] /api/admin/users no disponible, usando fallback:', err);
    await loadFromStudents();
  }
}

// ── Búsqueda ──────────────────────────────────────────────────────────────
const searchInput = ref('');
const search = ref('');
let searchTimer: number | undefined;
watch(searchInput, (v) => {
  clearTimeout(searchTimer);
  searchTimer = window.setTimeout(() => (search.value = v.trim().toLowerCase()), 250);
});

const filtered = computed(() => {
  const q = search.value;
  if (!q) return users.value;
  return users.value.filter((u) => [u.first_name, u.last_name, u.name, u.email, u.dni, u.role].filter(Boolean).join(' ').toLowerCase().includes(q));
});

const countLabel = computed(() => {
  if (state.value === 'loading') return 'Cargando usuarios...';
  if (state.value === 'error') return 'Error al cargar usuarios';
  const n = filtered.value.length;
  return n === 0 ? 'No se encontraron usuarios' : `Mostrando ${n} usuario${n !== 1 ? 's' : ''}`;
});

// ── Guardar rol / plan ────────────────────────────────────────────────────
const saving = reactive<Record<string, 'saving' | 'saved' | undefined>>({});
const savedTimers: number[] = [];

function buttonLabel(u: AdminUser, field: Field): string {
  const s = saving[`${u.dni}:${field}`];
  if (s === 'saving') return 'Guardando...';
  if (s === 'saved') return '✓ Guardado';
  return field === 'role' ? 'Guardar rol' : 'Guardar plan';
}

async function save(u: AdminUser, field: Field) {
  const key = `${u.dni}:${field}`;
  const value = edits[u.dni]![field];
  const current = field === 'role' ? u.role || 'student' : u.plan || 'basic';
  if (value === current) {
    showToast(field === 'role' ? 'El rol ya es el mismo, no hay cambios.' : 'El plan ya es el mismo, no hay cambios.');
    return;
  }
  saving[key] = 'saving';
  const { ok, status, data } = await api.post(field === 'role' ? '/api/admin/set-role' : '/api/admin/set-plan', { dni: u.dni, [field]: value });
  if (!ok) {
    const message = errorMessage(data, `HTTP ${status}`);
    console.error(`[Panel] Error actualizando ${field}:`, message);
    showToast(`Error: ${message}`);
    saving[key] = undefined;
    return;
  }
  u[field] = value;
  saving[key] = 'saved';
  showToast(
    field === 'role' ? `Rol de ${fullName(u)} actualizado a "${roleLabel(value)}"` : `Plan de ${fullName(u)} actualizado a "${planLabel(value)}"`,
  );
  savedTimers.push(window.setTimeout(() => (saving[key] = undefined), 2500));
}

onMounted(async () => {
  try {
    const { ok, data } = await api.get<{ is_admin?: boolean }>('/api/check-admin-role');
    access.value = ok && data.is_admin === true ? 'admin' : 'denied';
  } catch {
    access.value = 'denied';
  }
  if (access.value === 'admin') await loadUsers();
});

onBeforeUnmount(() => {
  clearTimeout(toastTimer);
  clearTimeout(searchTimer);
  savedTimers.forEach(clearTimeout);
});
</script>

<style>
/* CSS propio de la página antigua, limitado a ella (ver router: meta.page). */
/* ── Estilos específicos del panel admin ── */
:where(body[data-page="panel"]) .panel-hero {
  text-align: center;
  padding: 2.5rem 1.5rem 1.5rem;
}

:where(body[data-page="panel"]) .panel-hero h1 {
  font-size: clamp(1.6rem, 4vw, 2.4rem);
  font-weight: 700;
  background: var(--accent-gradient);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  margin-bottom: 0.4rem;
}

:where(body[data-page="panel"]) .panel-hero p {
  color: var(--text-secondary, #666);
  font-size: 0.95rem;
}

:where(body[data-page="panel"]) .panel-toolbar {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0 1.5rem 1rem;
  flex-wrap: wrap;
}

:where(body[data-page="panel"]) .panel-search {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  background: var(--glass-bg, rgba(255, 255, 255, 0.9));
  border: 1.5px solid var(--glass-border, rgba(0, 0, 0, 0.08));
  border-radius: 12px;
  padding: 0.85rem 1rem;
  min-height: 52px;
  flex: 1;
  min-width: 220px;
  transition: border-color 0.2s, box-shadow 0.2s;
}

:where(body[data-page="panel"]) .panel-search:focus-within {
  border-color: var(--accent-color);
  box-shadow: 0 0 0 3px var(--accent-glow, rgba(103, 80, 164, 0.12));
}

:where(body[data-page="panel"]) .panel-search svg {
  width: 18px;
  height: 18px;
  fill: var(--text-secondary, #888);
  flex-shrink: 0;
}

:where(body[data-page="panel"]) .panel-search input {
  border: none;
  outline: none;
  background: transparent;
  color: var(--text-primary, #1a1a1a);
  font-size: 1rem;
  width: 100%;
}

:where(body[data-page="panel"]) .panel-search input::placeholder {
  color: var(--text-secondary, #aaa);
}

:where(body[data-page="panel"]) .panel-count {
  padding: 0 1.5rem 0.8rem;
  color: var(--text-secondary, #888);
  font-size: 0.85rem;
}

/* Grid de usuarios */
:where(body[data-page="panel"]) .users-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 1.2rem;
  padding: 0 1.5rem 2rem;
}

:where(body[data-page="panel"]) .user-card {
  background: var(--glass-bg, rgba(255, 255, 255, 0.92));
  border: 1.5px solid var(--glass-border, rgba(0, 0, 0, 0.07));
  border-radius: 16px;
  padding: 1.4rem 1.2rem 1.1rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.65rem;
  transition: transform 0.18s, box-shadow 0.18s;
  position: relative;
  overflow: hidden;
}

:where(body[data-page="panel"]) .user-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: var(--accent-gradient);
  opacity: 0;
  transition: opacity 0.2s;
}

:where(body[data-page="panel"]) .user-card:hover {
  transform: translateY(-3px);
  box-shadow: 0 8px 24px var(--accent-glow, rgba(103, 80, 164, 0.14));
}

:where(body[data-page="panel"]) .user-card:hover::before {
  opacity: 1;
}

/* Avatar */
:where(body[data-page="panel"]) .user-avatar {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  object-fit: cover;
  border: 2.5px solid var(--glass-border, rgba(0, 0, 0, 0.1));
  background: var(--secondary-container, #E8DEF8);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.8rem;
  font-weight: 700;
  color: var(--accent-color);
  flex-shrink: 0;
}

:where(body[data-page="panel"]) .user-avatar img {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  object-fit: cover;
}

:where(body[data-page="panel"]) .user-name {
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-primary, #1a1a1a);
  text-align: center;
  margin: 0;
  line-height: 1.3;
}

:where(body[data-page="panel"]) .user-email {
  font-size: 0.8rem;
  color: var(--text-secondary, #888);
  text-align: center;
  word-break: break-all;
  margin: 0;
}

/* Badge de rol */
:where(body[data-page="panel"]) .user-role-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.25rem 0.75rem;
  border-radius: 20px;
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: capitalize;
}

:where(body[data-page="panel"]) .user-role-badge.role-admin {
  background: linear-gradient(135deg, #6750A4, #7F67BE);
  color: #fff;
}

:where(body[data-page="panel"]) .user-role-badge.role-profesor {
  background: linear-gradient(135deg, #1565C0, #2196F3);
  color: #fff;
}

:where(body[data-page="panel"]) .user-role-badge.role-student,
:where(body[data-page="panel"]) .user-role-badge.role-usuario {
  background: var(--secondary-container, #E8DEF8);
  color: var(--accent-color);
}

/* Plan badge */
:where(body[data-page="panel"]) .user-plan-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.25rem 0.75rem;
  border-radius: 20px;
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  transition: transform 0.2s, box-shadow 0.2s;
}
:where(body[data-page="panel"]) .user-plan-badge.plan-basic { background: #E8E8E8; color: #555; }
:where(body[data-page="panel"]) .user-plan-badge.plan-students { background: #E3F2FD; color: #1565C0; }
:where(body[data-page="panel"]) .user-plan-badge.plan-development { background: #E8F5E9; color: #2E7D32; }
:where(body[data-page="panel"]) .user-plan-badge.plan-designer { background: #FFF3E0; color: #E65100; }
:where(body[data-page="panel"]) .user-plan-badge.plan-max { background: linear-gradient(135deg, #6750A4, #9A82DB); color: #fff; box-shadow: 0 2px 8px rgba(103,80,164,0.25); }

/* Plan selector */
:where(body[data-page="panel"]) .plan-select {
  width: 100%;
  padding: 0.5rem 0.8rem;
  border-radius: 10px;
  border: 1.5px solid var(--glass-border, rgba(0, 0, 0, 0.1));
  background: var(--bg-primary, #f5f5f5);
  color: var(--text-primary, #1a1a1a);
  font-size: 0.88rem;
  cursor: pointer;
  outline: none;
  transition: border-color 0.2s, box-shadow 0.2s;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' width='16' height='16'%3E%3Cpath d='M7 10l5 5 5-5z' fill='%23888'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 0.6rem center;
  padding-right: 2rem;
}

:where(body[data-page="panel"]) .plan-select:focus {
  border-color: var(--accent-color);
  box-shadow: 0 0 0 3px var(--accent-glow, rgba(103, 80, 164, 0.12));
}

:where(body[data-page="panel"]) .plan-save-btn {
  width: 100%;
  padding: 0.5rem;
  border-radius: 10px;
  border: 1.5px solid var(--accent-color, #6750A4);
  background: transparent;
  color: var(--accent-color, #6750A4);
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  margin-top: 0.2rem;
}

:where(body[data-page="panel"]) .plan-save-btn:hover:not(:disabled) {
  background: var(--accent-gradient);
  color: #fff;
  border-color: transparent;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px var(--accent-glow, rgba(103,80,164,0.18));
}

:where(body[data-page="panel"]) .plan-save-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

:where(body[data-page="panel"]) .plan-save-btn.saved {
  background: linear-gradient(135deg, #2E7D32, #66BB6A);
  color: #fff;
  border-color: transparent;
}

/* Separador visual entre rol y plan */
:where(body[data-page="panel"]) .role-select-wrapper + .role-select-wrapper {
  margin-top: 0.5rem;
  padding-top: 0.5rem;
  border-top: 1px solid var(--glass-border, rgba(103, 80, 164, 0.08));
}

/* Selector de rol */
:where(body[data-page="panel"]) .role-select-wrapper {
  width: 100%;
  margin-top: 0.3rem;
}

:where(body[data-page="panel"]) .role-select {
  width: 100%;
  padding: 0.5rem 0.8rem;
  border-radius: 10px;
  border: 1.5px solid var(--glass-border, rgba(0, 0, 0, 0.1));
  background: var(--bg-primary, #f5f5f5);
  color: var(--text-primary, #1a1a1a);
  font-size: 0.88rem;
  cursor: pointer;
  outline: none;
  transition: border-color 0.2s, box-shadow 0.2s;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' width='16' height='16'%3E%3Cpath d='M7 10l5 5 5-5z' fill='%23888'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 0.6rem center;
  padding-right: 2rem;
}

:where(body[data-page="panel"]) .role-select:focus {
  border-color: var(--accent-color);
  box-shadow: 0 0 0 3px var(--accent-glow, rgba(103, 80, 164, 0.12));
}

:where(body[data-page="panel"]) .role-save-btn {
  width: 100%;
  padding: 0.5rem;
  border-radius: 10px;
  border: none;
  background: var(--accent-gradient);
  color: #fff;
  font-size: 0.88rem;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.15s, transform 0.15s;
  margin-top: 0.2rem;
}

:where(body[data-page="panel"]) .role-save-btn:hover:not(:disabled) {
  opacity: 0.88;
  transform: translateY(-1px);
}

:where(body[data-page="panel"]) .role-save-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

:where(body[data-page="panel"]) .role-save-btn.saved {
  background: linear-gradient(135deg, #2E7D32, #66BB6A);
}

/* Estado vacío / error */
:where(body[data-page="panel"]) .panel-empty {
  grid-column: 1 / -1;
  text-align: center;
  padding: 3rem 1rem;
  color: var(--text-secondary, #888);
}

:where(body[data-page="panel"]) .panel-empty-icon {
  font-size: 2.8rem;
  margin-bottom: 0.6rem;
}

/* Toast de notificación */
:where(body[data-page="panel"]) .panel-toast {
  position: fixed;
  bottom: 1.5rem;
  left: 50%;
  transform: translateX(-50%) translateY(6rem);
  background: var(--glass-bg, rgba(30, 30, 30, 0.95));
  color: var(--text-primary, #fff);
  padding: 0.7rem 1.4rem;
  border-radius: 12px;
  font-size: 0.9rem;
  font-weight: 500;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
  z-index: 9999;
  transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  pointer-events: none;
  backdrop-filter: blur(12px);
}

:where(body[data-page="panel"]) .panel-toast.show {
  transform: translateX(-50%) translateY(0);
}

/* Spinner de carga */
:where(body[data-page="panel"]) .panel-loading {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.8rem;
  padding: 3rem;
  color: var(--text-secondary, #888);
}

:where(body[data-page="panel"]) .panel-spinner {
  width: 24px;
  height: 24px;
  border: 3px solid var(--glass-border, rgba(0, 0, 0, 0.1));
  border-top-color: var(--accent-color);
  border-radius: 50%;
  animation: panelSpin 0.8s linear infinite;
}

@keyframes panelSpin {
  to {
    transform: rotate(360deg);
  }
}

/* Acceso denegado */
:where(body[data-page="panel"]) .panel-denied {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  padding: 4rem 2rem;
  text-align: center;
}

:where(body[data-page="panel"]) .panel-denied-icon {
  font-size: 3.5rem;
}

:where(body[data-page="panel"]) .panel-denied h2 {
  color: var(--text-primary, #1a1a1a);
}

:where(body[data-page="panel"]) .panel-denied p {
  color: var(--text-secondary, #888);
  font-size: 0.95rem;
}
</style>
