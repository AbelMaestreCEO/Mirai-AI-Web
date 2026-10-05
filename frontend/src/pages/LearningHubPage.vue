<template>
  <!-- Header -->
  <header class="header">
    <MenuToggle />
    <div class="header-title">Hub de Aprendizaje</div>
  </header>
  <!-- Contenedor Principal -->
  <div class="courses-container">
    <!-- Hero -->
    <div class="courses-hero">
      <h1>{{ heading }}</h1>
      <p>Elige cómo quieres prepararte antes de entregar tu trabajo.</p>
    </div>
    <!-- Contador -->
    <div class="courses-count">3 modos disponibles</div>
    <!-- Grid de Modos -->
    <div class="courses-grid hub-modes-grid" id="modes-grid">
      <div class="course-card" style="--card-accent: linear-gradient(135deg, #6750A4, #9A82DB);">
        <span class="course-level principiante">Conceptual</span>
        <div class="course-icon">📖</div>
        <h3 class="course-title">Teoría</h3>
        <p class="course-description">Mirai te explicará los conceptos clave, definiciones y fundamentos necesarios para esta tarea. Aprende el «por qué» antes de ponerte a trabajar.</p>
        <div class="course-meta">
          <span class="course-meta-item"><span>🧠</span> Conceptos clave</span>
          <span class="course-meta-item"><span>📝</span> Explicaciones claras</span>
        </div>
        <button class="course-start-btn" @click="startLearning('theory')">Comenzar con Teoría</button>
      </div>
      <div class="course-card" style="--card-accent: linear-gradient(135deg, #FF9F0A, #f5a623);">
        <span class="course-level intermedio">Interactivo</span>
        <div class="course-icon">❓</div>
        <h3 class="course-title">Quiz Interactivo</h3>
        <p class="course-description">Preguntas y respuestas para validar tu comprensión. Mirai lleva el puntaje y te da feedback en cada respuesta. ¡Aprende jugando!</p>
        <div class="course-meta">
          <span class="course-meta-item"><span>🎯</span> Preguntas guiadas</span>
          <span class="course-meta-item"><span>⭐</span> Feedback al instante</span>
        </div>
        <button class="course-start-btn" @click="startLearning('quiz')">Comenzar Quiz</button>
      </div>
      <div class="course-card" style="--card-accent: linear-gradient(135deg, #009688, #4caf50);">
        <span class="course-level avanzado">Práctico</span>
        <div class="course-icon">💻</div>
        <h3 class="course-title">Práctica con Ejemplos</h3>
        <p class="course-description">Ejercicios guiados y ejemplos de código o casos de estudio relacionados con la tarea. Mirai te guiará paso a paso sin darte la solución directa.</p>
        <div class="course-meta">
          <span class="course-meta-item"><span>🔧</span> Ejercicios reales</span>
          <span class="course-meta-item"><span>📌</span> Paso a paso</span>
        </div>
        <button class="course-start-btn" @click="startLearning('practice')">Comenzar Práctica</button>
      </div>
    </div><!-- /courses-grid -->
    <!-- Volver -->
    <div style="text-align: center; padding: 20px 0 60px;">
      <AppLink to="classroom" class="back-btn">
        <svg viewBox="0 0 24 24"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
        Volver a mis tareas
      </AppLink>
    </div>
  </div><!-- /courses-container -->
</template>

<script setup lang="ts">
// Migración de public/learning_hub.html: el alumno elige cómo prepararse para
// una tarea del aula y abre el chat en modo aprendizaje.
import { onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import MenuToggle from '@/components/MenuToggle.vue';
import AppLink from '@/components/AppLink.vue';
import { goToPage } from '@/lib/legacy';

const route = useRoute();
const router = useRouter();
const taskId = typeof route.query.task_id === 'string' ? route.query.task_id : '';
const taskTitle = typeof route.query.task_title === 'string' ? route.query.task_title : '';

function decode(s: string): string {
  // La página antigua decodificaba otra vez el título ya decodificado.
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

const heading = taskTitle ? `Preparación: ${decode(taskTitle)}` : 'Preparando tu aprendizaje';

onMounted(() => {
  if (!taskId) goToPage(router, 'classroom');
});

function startLearning(mode: 'theory' | 'quiz' | 'practice') {
  // Solo qué tarea y qué modo: las instrucciones de la tutora las arma el
  // servidor (buildLearningTaskPrompt en workers/routes/chat-context.ts).
  const query = `context_task=${encodeURIComponent(taskId)}&context_mode=${encodeURIComponent(mode)}`;
  goToPage(router, 'chat', query);
}
</script>
