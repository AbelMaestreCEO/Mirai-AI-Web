<template>
  <header class="header">
    <MenuToggle />
    <div class="header-title">{{ heading.header }}</div>
  </header>

  <div class=" courses-container">
    <div class="courses-hero">
      <h1>{{ heading.hero }}</h1>
      <p>{{ heading.description }}</p>
    </div>

    <div class="courses-toolbar">
      <div class="courses-search">
        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"
          />
        </svg>
        <input id="course-search" v-model="searchInput" type="text" placeholder="Buscar cursos..." autocomplete="off">
      </div>
      <div id="filter-pills" class="filter-pills">
        <button class="filter-pill" :class="{ active: activeSub === 'todos' }" data-category="todos" @click="activeSub = 'todos'">Todos</button>
        <button v-for="sub in subcategories" :key="sub.id" class="filter-pill" :class="{ active: activeSub === sub.id }" :data-category="sub.id" @click="activeSub = sub.id">
          {{ sub.icon || '📚' }} {{ sub.title }}
        </button>
      </div>
    </div>

    <div id="courses-count" class="courses-count">{{ countLabel }}</div>

    <div id="courses-grid" ref="gridEl" class="courses-grid">
      <div v-if="state === 'error'" class="empty-state" style="grid-column: 1/-1; text-align: center;">
        <span style="font-size: 3rem;">⚠️</span>
        <h3>Error cargando cursos</h3>
        <p>Verifica la conexión con la base de datos.</p>
      </div>
      <template v-else>
        <div
          v-for="(course, index) in categoryCourses"
          v-show="visible(course)"
          :key="course.id"
          class="course-card"
          :data-category="course.subcategory || 'general'"
          :data-main-category="course.category || 'general'"
          :data-level="course.level"
          :data-course-id="course.id"
          :style="{ '--card-accent': SUBCATEGORY_GRADIENTS[course.subcategory ?? ''] || 'var(--accent-gradient)', animationDelay: `${index * 0.05}s` }"
        >
          <span class="course-level" :class="course.level">{{ capitalizeFirst(course.level) }}</span>
          <div class="course-icon">{{ course.icon || '📚' }}</div>
          <h3 class="course-title">{{ course.title }}</h3>
          <p class="course-description">{{ course.description }}</p>
          <div class="course-meta">
            <span class="course-meta-item"><span>📚</span> {{ course.lessons }} lecciones</span>
            <span class="course-meta-item"><span>⏱️</span> {{ course.duration }}</span>
          </div>
          <button class="course-start-btn" :data-course="course.id" :disabled="starting === course.id" @click.stop="start(course.id)">
            {{ starting === course.id ? 'Redirigiendo...' : 'Comenzar' }}
          </button>
        </div>
        <div v-if="state === 'ready' && visibleCount === 0" id="no-results" class="no-results">
          <div class="no-results-icon">🔍</div>
          <p>No se encontraron cursos con ese filtro</p>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
// Migración de public/courses.html (lógica en courses.js). ?category=<id>
// limita la lista a una categoría principal; las píldoras filtran por
// subcategoría.
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import MenuToggle from '@/components/MenuToggle.vue';
import { goToPage } from '@/lib/pages';
import { flashElement, useRealtime } from '@/lib/realtime';
import {
  CATEGORY_DESCRIPTIONS,
  SUBCATEGORY_GRADIENTS,
  capitalizeFirst,
  loadCategories,
  loadCourses,
  loadSubcategories,
  type Category,
  type Course,
  type Subcategory,
} from '@/lib/courses';

const route = useRoute();
const router = useRouter();

const courses = ref<Course[]>([]);
const subcategories = ref<Subcategory[]>([]);
const categories = ref<Category[]>([]);
const state = ref<'loading' | 'ready' | 'error'>('loading');
const gridEl = ref<HTMLElement | null>(null);

const mainCategory = computed(() => (typeof route.query.category === 'string' && route.query.category) || null);

// ── Títulos según la categoría ────────────────────────────────────────────
const heading = computed(() => {
  if (state.value === 'loading') return { header: 'Lecciones', hero: 'Cursos', description: 'Explora junto a Mirai AI nuestro catálogo completo de cursos.' };
  const id = mainCategory.value;
  if (!id) {
    return {
      header: 'Cursos',
      hero: 'Todos los Cursos',
      description: 'Explora nuestro catálogo completo de cursos. Aprende a tu ritmo con Mirai AI como tu tutor personal.',
      title: 'Cursos - Mirai AI',
    };
  }
  const cat = categories.value.find((c) => c.id === id);
  if (!cat) {
    const fallback = `Cursos de ${capitalizeFirst(id)}`;
    return { header: fallback, hero: fallback, description: 'Explora junto a Mirai AI nuestro catálogo completo de cursos.' };
  }
  const title = `Cursos de ${cat.title}`;
  return {
    header: title,
    hero: `${cat.icon || '📚'} ${title}`,
    description: CATEGORY_DESCRIPTIONS[id] || cat.description || 'Explora nuestros cursos disponibles.',
    title: `${title} - Mirai AI`,
  };
});

watch(
  () => heading.value.title,
  (title) => {
    if (title) document.title = title;
  },
);

// ── Filtros ───────────────────────────────────────────────────────────────
const activeSub = ref('todos');
const searchInput = ref('');
const search = ref('');
let searchTimer: number | undefined;
watch(searchInput, (v) => {
  clearTimeout(searchTimer);
  searchTimer = window.setTimeout(() => (search.value = v.trim().toLowerCase()), 200);
});
onBeforeUnmount(() => clearTimeout(searchTimer));

const categoryCourses = computed(() => (mainCategory.value ? courses.value.filter((c) => c.category === mainCategory.value) : courses.value));

function visible(course: Course): boolean {
  const matchesSub = activeSub.value === 'todos' || String(course.subcategory || '') === activeSub.value;
  const q = search.value;
  const matchesSearch = !q || course.title.toLowerCase().includes(q) || (course.description || '').toLowerCase().includes(q);
  return matchesSub && matchesSearch;
}

const visibleCount = computed(() => categoryCourses.value.filter(visible).length);
const countLabel = computed(() => (state.value === 'ready' ? `Mostrando ${visibleCount.value} curso${visibleCount.value !== 1 ? 's' : ''}` : ''));

// ── Comenzar ──────────────────────────────────────────────────────────────
const starting = ref<string | null>(null);
let startTimer: number | undefined;
onBeforeUnmount(() => clearTimeout(startTimer));

function start(courseId: string) {
  starting.value = courseId;
  startTimer = window.setTimeout(() => goToPage(router, 'chat', `course=${encodeURIComponent(courseId)}&mode=education`), 300);
}

// ── Carga ─────────────────────────────────────────────────────────────────
async function load() {
  try {
    const [c, s, cats] = await Promise.all([loadCourses(), loadSubcategories(), loadCategories()]);
    courses.value = c;
    subcategories.value = s;
    categories.value = cats;
    state.value = 'ready';
  } catch (err) {
    console.error('Error cargando cursos:', err);
    state.value = 'error';
  }
}

onMounted(load);

// Cambios de otro dispositivo (un curso editado o nuevo): se recarga la lista
// y se resaltan las tarjetas afectadas.
useRealtime('courses', (data) => {
  const changed = ((data as { courses?: { id: string }[] } | null)?.courses ?? []).map((c) => String(c.id));
  if (!changed.length) return;
  void (async () => {
    courses.value = await loadCourses().catch(() => courses.value);
    await nextTick();
    for (const id of changed) flashElement(gridEl.value?.querySelector(`[data-course-id="${CSS.escape(id)}"]`));
  })();
});
</script>
