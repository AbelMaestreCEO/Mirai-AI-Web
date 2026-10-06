<template>
  <header class="header">
    <MenuToggle />
    <div class="header-title">Lecciones</div>
  </header>

  <div class="course-details-container">
    <div v-if="state === 'loading'" id="loading-state" class="loading-state">
      <div class="loading-spinner"></div>
      <p>Cargando curso...</p>
    </div>

    <div v-else-if="course" id="course-content">
      <AppLink to="courses" class="back-btn">
        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
        </svg>
        Volver a Cursos
      </AppLink>

      <div class="course-detail-header">
        <div id="detail-icon" class="course-detail-icon">{{ course.icon || '📚' }}</div>
        <div class="course-detail-info">
          <h1 id="detail-title" class="course-detail-title">{{ course.title }}</h1>
          <p id="detail-description" class="course-detail-description">{{ course.description }}</p>
          <div class="course-detail-meta">
            <span id="detail-level" class="course-detail-level" :class="course.level">{{ capitalizeFirst(course.level) }}</span>
            <span class="course-detail-meta-item"><span>📚</span> <span id="detail-lessons-count">{{ course.lessons || lessons.length }}</span>
              lecciones</span>
            <span class="course-detail-meta-item"><span>⏱️</span> <span id="detail-duration">{{ course.duration }}</span></span>
          </div>
        </div>
      </div>

      <h2 class="lessons-section-title">Lecciones <span id="lessons-count-label" class="lessons-count">({{ lessons.length }})</span>
      </h2>
      <div id="lessons-grid" class="lessons-grid">
        <div v-if="!lessons.length" class="empty-state" style="grid-column:1/-1;text-align:center;padding:60px;">📭 Sin lecciones</div>
        <div v-for="(lesson, idx) in lessons" :key="lesson.id" class="lesson-card" :style="{ animationDelay: `${idx * 0.06}s` }">
          <div class="lesson-number">{{ idx + 1 }}</div>
          <h3 class="lesson-title">{{ lesson.title }}</h3>
          <p class="lesson-description">{{ lesson.content || '' }}</p>
          <button class="lesson-start-btn" :data-course="course.id" :data-lesson="lesson.id" @click.stop="openModeModal(lesson)">Comenzar</button>
        </div>
      </div>
    </div>

    <div v-else id="error-state" class="error-state">
      <div class="error-state-icon">⚠️</div>
      <p>Error cargando el curso</p>
      <small id="error-message">
        <template v-if="missingId">No se especificó un curso. <AppLink to="courses">Volver</AppLink></template>
        <template v-else>{{ error }}</template>
      </small>
      <br><br>
      <AppLink to="courses" class="back-btn">← Volver a Cursos</AppLink>
    </div>
  </div>

  <!-- Modal selección de modo de aprendizaje -->
  <div id="mode-modal-overlay" class="mode-modal-overlay" :class="{ active: !!pendingLesson }" @click.self="pendingLesson = null">
    <div class="mode-modal">
      <div class="mode-modal-header">
        <div>
          <p id="mode-modal-lesson-title" class="mode-modal-title">{{ pendingLesson?.title || 'Elige cómo aprender' }}</p>
          <p class="mode-modal-subtitle">Selecciona un modo para esta lección</p>
        </div>
        <button id="mode-modal-close" class="mode-modal-close" aria-label="Cerrar" @click="pendingLesson = null">&times;</button>
      </div>
      <div class="mode-cards-grid">
        <div v-for="m in MODES" :key="m.mode" class="mode-card" @click="confirmMode(m.mode)">
          <div class="mode-card-icon">{{ m.icon }}</div>
          <div class="mode-card-title">{{ m.title }}</div>
          <div class="mode-card-desc">{{ m.desc }}</div>
          <button class="mode-card-btn">{{ m.button }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// Migración de public/course_details.html (lógica en courses.js y en su
// script propio del modal de modos). ?id=<curso> (o ?course=).
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import MenuToggle from '@/components/MenuToggle.vue';
import AppLink from '@/components/AppLink.vue';
import { goToPage } from '@/lib/legacy';
import { capitalizeFirst, loadCourseDetails, type CourseDetails, type Lesson } from '@/lib/courses';

const MODES = [
  { mode: 'theory', icon: '📖', title: 'Teoría', desc: 'Mirai te explica los conceptos clave y fundamentos de esta lección.', button: 'Comenzar con Teoría' },
  { mode: 'quiz', icon: '❓', title: 'Quiz Interactivo', desc: 'Preguntas y respuestas para validar tu comprensión. ¡Aprende jugando!', button: 'Comenzar Quiz' },
  { mode: 'practice', icon: '💻', title: 'Práctica con Ejemplos', desc: 'Ejercicios guiados paso a paso sin darte la solución directa.', button: 'Comenzar Práctica' },
];

const route = useRoute();
const router = useRouter();

const courseId = computed(() => {
  const v = route.query.id ?? route.query.course;
  return typeof v === 'string' ? v : '';
});

const course = ref<CourseDetails | null>(null);
const lessons = ref<Lesson[]>([]);
const state = ref<'loading' | 'ready' | 'error'>('loading');
const missingId = computed(() => !courseId.value);
const error = ref('');

// Lección cuyo modo se está eligiendo (abre el modal).
const pendingLesson = ref<Lesson | null>(null);

function openModeModal(lesson: Lesson) {
  pendingLesson.value = lesson;
}

// Solo qué lección y qué modo: las instrucciones de la tutora las arma el
// servidor.
function confirmMode(mode: string) {
  const lesson = pendingLesson.value;
  if (!course.value || !lesson) return;
  goToPage(
    router,
    'chat',
    `course=${encodeURIComponent(course.value.id)}&lesson=${encodeURIComponent(lesson.id)}&mode=${encodeURIComponent(mode)}`,
  );
}

// Se recarga también si cambia ?id= sin salir de la página (atrás/adelante).
watch(
  courseId,
  async (id) => {
    course.value = null;
    pendingLesson.value = null;
    if (!id) {
      state.value = 'error';
      return;
    }
    state.value = 'loading';
    try {
      const data = await loadCourseDetails(id);
      if (id !== courseId.value) return;
      course.value = data;
      lessons.value = data.lessons_list || [];
      document.title = `${data.title} - Mirai AI`;
      state.value = 'ready';
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
      state.value = 'error';
    }
  },
  { immediate: true },
);
</script>

<style>
/* CSS propio de la página antigua (el <style> del modal, dentro del <body>), limitado a ella. */
:where(body[data-page="course_details"]) .mode-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.55);
  backdrop-filter: blur(4px);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.25s ease;
}
:where(body[data-page="course_details"]) .mode-modal-overlay.active {
  opacity: 1;
  pointer-events: all;
}
:where(body[data-page="course_details"]) .mode-modal {
  background: var(--glass-bg, #fff);
  border: 1px solid var(--glass-border, rgba(0,0,0,0.1));
  border-radius: 20px;
  padding: 28px 24px;
  max-width: 700px;
  width: 100%;
  max-height: 90vh;
  overflow-y: auto;
  transform: translateY(20px) scale(0.97);
  transition: transform 0.25s ease;
  box-shadow: 0 20px 60px rgba(0,0,0,0.2);
}
:where(body[data-page="course_details"]) .mode-modal-overlay.active .mode-modal {
  transform: translateY(0) scale(1);
}
:where(body[data-page="course_details"]) .mode-modal-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 4px;
}
:where(body[data-page="course_details"]) .mode-modal-title {
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0 0 4px;
}
:where(body[data-page="course_details"]) .mode-modal-subtitle {
  font-size: 0.83rem;
  color: var(--text-secondary);
  margin: 0 0 20px;
}
:where(body[data-page="course_details"]) .mode-modal-close {
  background: none;
  border: none;
  font-size: 1.6rem;
  cursor: pointer;
  color: var(--text-secondary);
  line-height: 1;
  padding: 0 4px;
  flex-shrink: 0;
}
:where(body[data-page="course_details"]) .mode-cards-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 14px;
}
@media (max-width: 600px) {
  :where(body[data-page="course_details"]) .mode-cards-grid { grid-template-columns: 1fr; }
}
:where(body[data-page="course_details"]) .mode-card {
  border: 1.5px solid var(--glass-border, rgba(0,0,0,0.1));
  border-radius: 14px;
  padding: 20px 16px;
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
  background: var(--bg-secondary, rgba(255,255,255,0.6));
  text-align: center;
}
:where(body[data-page="course_details"]) .mode-card:hover { transform: translateY(-3px); box-shadow: 0 8px 24px rgba(0,0,0,0.12); }
:where(body[data-page="course_details"]) .mode-card-icon { font-size: 2rem; margin-bottom: 8px; }
:where(body[data-page="course_details"]) .mode-card-title { font-weight: 700; font-size: 0.95rem; color: var(--text-primary); margin-bottom: 6px; }
:where(body[data-page="course_details"]) .mode-card-desc { font-size: 0.78rem; color: var(--text-secondary); line-height: 1.4; }
:where(body[data-page="course_details"]) .mode-card-btn {
  margin-top: 14px;
  padding: 8px 16px;
  border: none;
  border-radius: 20px;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  background: var(--accent-gradient, linear-gradient(135deg,#6750A4,#9A82DB));
  color: #fff;
  width: 100%;
  transition: opacity 0.2s;
}
:where(body[data-page="course_details"]) .mode-card-btn:hover { opacity: 0.88; }
</style>
