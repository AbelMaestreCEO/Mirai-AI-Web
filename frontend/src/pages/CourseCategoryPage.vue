<template>
  <header class="header">
    <MenuToggle />
    <div class="header-title">Categorías</div>
  </header>

  <div class="categories-container">
    <div class="categories-hero">
      <h1>Explora por Categorías</h1>
      <p>Encuentra el camino perfecto para tu aprendizaje. Desde programación hasta herramientas de oficina.</p>
    </div>

    <div class="category-search-bar">
      <svg class="category-search-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path
          d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"
        />
      </svg>
      <input id="category-search" v-model="search" type="text" placeholder="Buscar categoría (ej: Programación, Office...)">
    </div>

    <div id="categories-grid" class="categories-grid">
      <div v-if="state !== 'ready' || !filtered.length" class="no-categories" :style="state === 'loading' ? undefined : 'grid-column: 1/-1; text-align: center;'">
        <span class="no-categories-icon">{{ state === 'loading' ? '🔄' : state === 'error' ? '⚠️' : '🔍' }}</span>
        <p>{{ state === 'loading' ? 'Cargando categorías...' : state === 'error' ? 'Error cargando categorías. Verifica la conexión con D1.' : 'No se encontraron categorías.' }}</p>
      </div>
      <template v-else>
        <div
          v-for="c in filtered"
          :key="c.id"
          class="category-card"
          :data-id="c.id"
          :style="{ '--card-accent': c.color || 'linear-gradient(135deg, #667eea, #764ba2)' }"
          @click="goToPage(router, 'courses', `category=${encodeURIComponent(c.id)}`)"
        >
          <div class="category-icon">{{ c.icon || '📚' }}</div>
          <h3 class="category-title">{{ c.title }}</h3>
          <p class="category-desc">{{ c.description }}</p>
          <div class="category-stats">
            <span class="category-stat-item"><span>📚</span> {{ c.course_count || 0 }} curso{{ (c.course_count || 0) !== 1 ? 's' : '' }}</span>
            <span class="category-stat-item"><span>👥</span> -- alumnos</span>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
// Migración de public/course_category.html (lógica en courses.js).
import { computed, onMounted, ref } from 'vue';
import MenuToggle from '@/components/MenuToggle.vue';
import { useRouter } from 'vue-router';
import { goToPage } from '@/lib/legacy';
import { loadCategories, type Category } from '@/lib/courses';

const router = useRouter();
const categories = ref<Category[]>([]);
const state = ref<'loading' | 'ready' | 'error'>('loading');
const search = ref('');

const filtered = computed(() => {
  const q = search.value.toLowerCase().trim();
  return categories.value.filter((c) => c.title.toLowerCase().includes(q) || (c.description || '').toLowerCase().includes(q));
});

onMounted(async () => {
  try {
    categories.value = await loadCategories();
    state.value = 'ready';
  } catch (err) {
    console.error('Error cargando categorías:', err);
    state.value = 'error';
  }
});
</script>
