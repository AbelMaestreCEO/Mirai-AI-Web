<template>
  <header class="header">
    <MenuToggle />
    <div class="header-title">Aprender y Hacer</div>
  </header>

  <main id="detail-container" class="courses-container">
    <!-- Sin id, o tarea no disponible: el original sustituía todo el contenido. -->
    <div v-if="fatal" class="error-state">
      <div class="error-icon">⚠️</div>
      <h3>Error</h3>
      <p>{{ fatal }}</p>
      <AppLink to="classroom" class="btn btn-primary" style="margin-top: 15px; display:inline-block;">Volver a Tareas</AppLink>
    </div>

    <template v-else>
      <div class="courses-hero" style="animation: cardFadeIn 0.5s cubic-bezier(0.05,0.7,0.1,1) both;">
        <img class="module-hero-icon" src="/icons/ui/classroom-48.png" srcset="/icons/ui/classroom-48.png 1x, /icons/ui/classroom-96.png 2x" alt="" width="64" height="64" loading="lazy" decoding="async">
        <p id="detail-hero-subtitle">Aprende los conceptos y después entrega tu tarea como prefieras.</p>
      </div>

      <div class="learn-task-tabs" style="animation: cardFadeIn 0.5s cubic-bezier(0.05,0.7,0.1,1) 0.05s both;">
        <button class="learn-task-tab" :class="{ active: activeTab === 'learn' }" @click="activeTab = 'learn'">🧠 Aprender</button>
        <button class="learn-task-tab" :class="{ active: activeTab === 'do' }" @click="activeTab = 'do'">✍️ Hacer Tarea</button>
      </div>

      <div style="padding: 0 20px; animation: cardFadeIn 0.5s cubic-bezier(0.05,0.7,0.1,1) 0.05s both;">
        <button class="back-btn" @click="router.back()">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
            <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
          </svg>
          Volver al Aula
        </button>
      </div>

      <!-- ── MÓDULO APRENDER ── -->
      <section v-if="activeTab === 'learn'" class="learning-modes-section">
        <div class="courses-count">3 modos disponibles</div>
        <div class="courses-grid hub-modes-grid">
          <div class="course-card" style="--card-accent: linear-gradient(135deg, #6750A4, #9A82DB);">
            <span class="course-level principiante">Conceptual</span>
            <div class="course-icon">📖</div>
            <h3 class="course-title">Concepto</h3>
            <p class="course-description">Mirai te explicará los conceptos clave, definiciones y fundamentos necesarios para esta tarea. Aprende el «por qué» antes de ponerte a trabajar.</p>
            <div class="course-meta">
              <span class="course-meta-item"><span>🧠</span> Conceptos clave</span>
              <span class="course-meta-item"><span>📝</span> Explicaciones claras</span>
            </div>
            <button class="course-start-btn" @click="startLearning('theory')">Comenzar con Concepto</button>
          </div>
          <div class="course-card" style="--card-accent: linear-gradient(135deg, #009688, #4caf50);">
            <span class="course-level avanzado">Práctico</span>
            <div class="course-icon">💡</div>
            <h3 class="course-title">Ejemplos</h3>
            <p class="course-description">Ejemplos guiados y casos de estudio relacionados con la tarea. Mirai te guiará paso a paso sin darte la solución directa.</p>
            <div class="course-meta">
              <span class="course-meta-item"><span>🔧</span> Ejemplos reales</span>
              <span class="course-meta-item"><span>📌</span> Paso a paso</span>
            </div>
            <button class="course-start-btn" @click="startLearning('practice')">Comenzar con Ejemplos</button>
          </div>
          <div class="course-card" style="--card-accent: linear-gradient(135deg, #FF9F0A, #f5a623);">
            <span class="course-level intermedio">Interactivo</span>
            <div class="course-icon">❓</div>
            <h3 class="course-title">Prácticas</h3>
            <p class="course-description">Preguntas y respuestas para validar tu comprensión. Mirai lleva el puntaje y te da feedback en cada respuesta. ¡Aprende jugando!</p>
            <div class="course-meta">
              <span class="course-meta-item"><span>🎯</span> Preguntas guiadas</span>
              <span class="course-meta-item"><span>⭐</span> Feedback al instante</span>
            </div>
            <button class="course-start-btn" @click="startLearning('quiz')">Comenzar Prácticas</button>
          </div>
        </div>
      </section>

      <!-- ── MÓDULO HACER TAREA ── -->
      <template v-else>
      <div v-if="state === 'loading'" id="loading-state" class="loading-state" style="display: block;">
        <div class="loading-spinner"></div>
        <p>Cargando detalles de la tarea...</p>
      </div>

      <div v-else-if="state === 'error'" id="error-state" class="error-state">
        <div class="error-icon">⚠️</div>
        <h3>Error al cargar la tarea</h3>
        <p id="error-message">{{ error }}</p>
        <button class="course-start-btn" style="max-width:200px; margin:0 auto;" @click="load">
          Recargar
        </button>
      </div>

      <div v-else-if="assignment" id="task-content">
        <div class="course-detail-header" style="margin: 0 20px 0; animation: cardFadeIn 0.5s cubic-bezier(0.05,0.7,0.1,1) 0.05s both;">
          <div class="course-detail-icon">📝</div>
          <div class="course-detail-info">
            <h1 id="task-title" class="course-detail-title">{{ assignment.title || 'Sin título' }}</h1>
            <p id="task-course" class="course-detail-description">
              {{ assignment.course_title || 'General' }}
            </p>
          </div>
        </div>

        <br>
        <div class="task-meta-grid" style="padding: 0 20px; margin-bottom: 24px; animation: cardFadeIn 0.5s cubic-bezier(0.05,0.7,0.1,1) 0.15s both;">
          <div class="meta-item">
            <span class="meta-icon">📅</span>
            <div class="meta-content">
              <span class="meta-label">Fecha Límite</span>
              <span id="task-due" class="meta-value">{{ dueDate }}</span>
            </div>
          </div>
          <div class="meta-item">
            <span class="meta-icon">⭐</span>
            <div class="meta-content">
              <span class="meta-label">Puntuación Máxima</span>
              <span id="task-max-score" class="meta-value">{{ assignment.max_score || 'N/A' }}</span>
            </div>
          </div>
          <div class="meta-item">
            <span class="meta-icon">📊</span>
            <div class="meta-content">
              <span class="meta-label">Estado</span>
              <span id="task-status" class="status-badge" :class="status.cls">{{ status.text }}</span>
            </div>
          </div>
        </div>

        <div class="task-description-card" style="margin: 0 20px 24px; animation: cardFadeIn 0.5s cubic-bezier(0.05,0.7,0.1,1) 0.25s both;">
          <h2 class="section-title">Descripción</h2>
          <p id="task-description" class="task-desc-text">{{ assignment.description || 'Sin descripción' }}</p>
        </div>

        <!-- Cómo hacer la tarea: se puede cambiar de forma cuando quieras -->
        <div v-if="showMethods" class="task-methods" style="margin: 0 20px 24px; animation: cardFadeIn 0.5s cubic-bezier(0.05,0.7,0.1,1) 0.3s both;">
          <h2 class="section-title">¿Cómo quieres hacer tu tarea?</h2>
          <p class="section-subtitle">Puedes cambiar de forma cuando quieras. Si ya tenías una nota, la nueva la reemplazará.</p>
          <div class="task-methods-grid">
            <button class="method-card" @click="chooseMethod('document')">
              <span class="method-icon">📄</span>
              <span class="method-name">Documento o imagen</span>
              <span class="method-desc">Sube tu trabajo en PDF, DOCX o imagen.</span>
            </button>
            <button class="method-card" @click="chooseMethod('quiz4')">
              <span class="method-icon">🅰️</span>
              <span class="method-name">Quiz 4</span>
              <span class="method-desc">10 preguntas con 4 opciones (A, B, C y D).</span>
            </button>
            <button class="method-card" @click="chooseMethod('quiz_free')">
              <span class="method-icon">�o?��?</span>
              <span class="method-name">Quiz libre</span>
              <span class="method-desc">10 preguntas abiertas para escribir tu respuesta.</span>
            </button>
            <button class="method-card" @click="chooseMethod('flashcards')">
              <span class="method-icon">🃏</span>
              <span class="method-name">Flashcards</span>
              <span class="method-desc">Memoriza con repetición espaciada y comprueba tus aciertos.</span>
            </button>
            <button class="method-card" @click="chooseMethod('find_error')">
              <span class="method-icon">🔍</span>
              <span class="method-name">Detecta el error</span>
              <span class="method-desc">Encuentra las oraciones incorrectas y explica la corrección.</span>
            </button>
            <button class="method-card" @click="chooseMethod('recall')">
              <span class="method-icon">✍️</span>
              <span class="method-name">Recuerdo libre</span>
              <span class="method-desc">Explica el tema de memoria y descubre qué te faltó.</span>
            </button>
            <button class="method-card" @click="chooseMethod('summary')">
              <span class="method-icon">📝</span>
              <span class="method-name">Resumen con límite</span>
              <span class="method-desc">Sintetiza el texto fuente en un número exacto de palabras.</span>
            </button>
            <button class="method-card" @click="chooseMethod('concept_map')">
              <span class="method-icon">🗺️</span>
              <span class="method-name">Mapa conceptual</span>
              <span class="method-desc">Conecta los conceptos clave con relaciones correctas.</span>
            </button>
            <button class="method-card" @click="chooseMethod('predict_output')">
              <span class="method-icon">🔮</span>
              <span class="method-name">Predice la salida</span>
              <span class="method-desc">Lee un fragmento de código y elige qué imprimirá o mostrará.</span>
            </button>
            <button class="method-card" @click="chooseMethod('find_bug')">
              <span class="method-icon">🐞</span>
              <span class="method-name">Encuentra el bug</span>
              <span class="method-desc">Marca las líneas de código que contienen errores reales.</span>
            </button>
            <button class="method-card" @click="chooseMethod('order_code')">
              <span class="method-icon">🔀</span>
              <span class="method-name">Ordena el código</span>
              <span class="method-desc">Reordena las líneas para reconstruir el programa correcto.</span>
            </button>
            <button class="method-card method-card-ludo" @click="openLudo">
              <span class="method-icon">🎲</span>
              <span class="method-name">Ludo multijugador</span>
              <span class="method-desc">Juega con tu clase: las respuestas correctas suman a tu nota. No bloquea tu entrega.</span>
            </button>
          </div>
        </div>
        <div v-else class="method-locked-bar" style="margin: 0 20px 24px;">
          Forma elegida: <strong>{{ method ? METHOD_LABELS[method] : '' }}</strong>
          <button class="ludo-link" type="button" @click="showMethods = true">🔁 Cambiar forma</button>
          <button class="ludo-link" type="button" @click="openLudo">🎲 Jugar Ludo multijugador</button>
        </div>

        <!-- ══ ENTREGA: DOCUMENTO O IMAGEN ══ -->
        <template v-if="method === 'document'">
        <!-- Entrega (aún no entregada) -->
        <div v-if="phase === 'pending'" id="submit-section" class="card submit-section-card" style="margin: 0 20px 24px; animation: cardFadeIn 0.5s cubic-bezier(0.05,0.7,0.1,1) 0.35s both;">
          <h3 class="section-title">Entregar Tarea</h3>
          <p class="section-subtitle">{{ upload.icon }} Sube tu trabajo en formato {{ upload.label }} (máx. 10MB)</p>

          <div
            id="upload-area"
            class="upload-area"
            :class="{ 'drag-over': dragOver }"
            @dragenter.prevent.stop="dragOver = true"
            @dragover.prevent.stop="dragOver = true"
            @dragleave.prevent.stop="dragOver = false"
            @drop.prevent.stop="onDrop"
          >
            <div class="upload-icon">📤</div>
            <p class="upload-text">Arrastra y suelta archivos aquí</p>
            <p class="upload-hint">o</p>
            <div class="file-input-wrapper">
              <button class="btn btn-primary">Seleccionar Archivos</button>
              <input id="file-input" type="file" :accept="upload.accept" multiple @change="onPick">
            </div>
            <div id="file-list" class="file-list">
              <div v-for="(f, i) in files" :key="`${f.name}-${i}`" class="file-chip">
                <span class="attachment-icon">{{ isImageName(f.name) ? '🖼️' : '📄' }}</span>
                <span class="attachment-name">{{ f.name }}</span>
                <span class="attachment-remove" @click="files.splice(i, 1)">×</span>
              </div>
            </div>
          </div>

          <div class="response-textarea">
            <textarea id="task-response" v-model="responseText" placeholder="Escribe tu respuesta o comentarios adicionales..." rows="4"></textarea>
          </div>

          <div class="submit-actions">
            <button id="cancel-submit" class="btn btn-secondary" @click="cancelSubmit">Cancelar</button>
            <button id="submit-task" class="btn btn-primary" :disabled="submitting" @click="submit">{{ submitting ? '⏳ Procesando...' : 'Enviar Tarea' }}</button>
          </div>

          <div v-if="submitStatus" id="submit-status" class="status-message" :class="submitStatus.type" style="display: block;">{{ submitStatus.text }}</div>
        </div>

        <!-- Evaluación con IA (entregada, en revisión) -->
        <div v-if="phase === 'review'" id="evaluate-section" class="card evaluate-section-card" style="margin: 0 20px 24px; animation: cardFadeIn 0.5s cubic-bezier(0.05,0.7,0.1,1) 0.4s both;">
          <h3 class="section-title">¿Quieres una evaluación rápida?</h3>
          <p class="section-subtitle">{{ submittedImage ? 'La IA analizará tu imagen y la comparará con los requisitos de la tarea' : 'Usa nuestra IA para obtener una calificación preliminar' }}</p>
          <button id="ai-evaluate-btn" class="btn btn-primary" :disabled="evaluating" @click="confirmEvaluation">
            {{ evaluating ? '⏳ Evaluando...' : submittedImage ? '🖼️ Evaluar Imagen con IA' : '🤖 Evaluar con IA' }}
          </button>
        </div>

        <!-- Resultado (evaluada) -->
        <div v-if="phase === 'evaluated' && submission" id="feedback-section" class="card feedback-section-card" style="margin: 0 20px 60px; animation: cardFadeIn 0.5s cubic-bezier(0.05,0.7,0.1,1) 0.45s both;">
          <div class="feedback-header">
            <span class="feedback-icon">✅</span>
            <h2 class="section-title">Tarea Evaluada</h2>
          </div>

          <div v-if="submittedImage" style="margin:16px 0;text-align:center;">
            <img :src="submission.file_url ?? undefined" alt="Imagen entregada" style="max-width:100%;max-height:400px;border-radius:12px;border:1px solid var(--glass-border);object-fit:contain;">
          </div>

          <div class="feedback-score">
            <template v-if="isFormative">
              <span class="score-label">Práctica formativa</span>
              <span class="score-max">No cuenta para la nota</span>
            </template>
            <template v-else>
              <span class="score-label">Tu Puntuación</span>
              <span class="score-value">{{ finalScore }}</span>
              <span class="score-max">/ {{ assignment?.max_score }}</span>
            </template>
          </div>

          <div v-if="feedback.items" class="feedback-content">
            <div v-if="feedback.image" style="margin-bottom:16px;padding:8px 12px;background:var(--secondary-container);border-radius:8px;font-size:0.85rem;">🖼️ Evaluación de imagen</div>
            <div v-for="item in feedback.items" :key="item.label" style="margin-bottom:12px;">
              <strong style="color:var(--accent-primary);">{{ item.label }}:</strong>
              <span style="color:var(--text-secondary);">{{ item.value }}</span>
            </div>
            <p v-if="feedback.general" style="margin-top:16px;"><strong>Resumen General:</strong> {{ feedback.general }}</p>
          </div>
          <template v-else>{{ feedback.text }}</template>

          <div v-if="canDisagree" class="disagree-card">
            <p>¿No estás de acuerdo con tu nota?</p>
            <button class="course-start-btn" @click="disagreeWithGrade">Volver a hacer la tarea</button>
          </div>
          <p v-else class="disagree-used">Aún no hay una entrega calificada para volver a hacer.</p>
        </div>
        </template>

        <section v-else-if="method === 'quiz4' || method === 'quiz_free'" class="quiz-section quiz-card">
          <div v-if="quizState === 'loading'" class="loading-state">
            <div class="loading-spinner"></div>
            <p>Preparando tu quiz con 10 preguntas...</p>
          </div>

          <div v-else-if="quizState === 'error'" class="error-state">
            <div class="error-icon">⚠️</div>
            <h3>No se pudo preparar el quiz</h3>
            <p>{{ quizError }}</p>
            <button class="course-start-btn" style="max-width:220px;margin:0 auto;" @click="startQuiz(method)">Reintentar</button>
          </div>

          <template v-else-if="quizState === 'active' || quizState === 'grading'">
            <div class="quiz-header">
              <div>
                <span class="quiz-mode-badge">{{ method === 'quiz4' ? 'Quiz 4' : 'Quiz libre' }}</span>
                <span class="quiz-progress-label">{{ currentIndex + 1 }} / {{ questions.length }}</span>
              </div>
              <span class="quiz-total">{{ quizTotal }} pts</span>
            </div>
            <div class="quiz-progress"><div class="quiz-progress-fill" :style="{ width: `${((currentIndex + (currentAnswered ? 1 : 0)) / questions.length) * 100}%` }"></div></div>

            <!-- Una sola pregunta a la vez, sin scroll. -->
            <div class="quiz-current">
              <div class="quiz-msg ai">
                <div class="quiz-avatar">🤖</div>
                <div>
                  <div class="quiz-msg-bubble">{{ questions[currentIndex]?.question }}</div>
                  <div class="quiz-msg-meta">{{ levelLabel(questions[currentIndex]?.level || '') }} · {{ questions[currentIndex]?.points }} pts</div>
                </div>
              </div>

              <div v-if="currentAnswered" class="quiz-msg user">
                <div class="quiz-msg-bubble">{{ displayAnswer(currentIndex) }}</div>
              </div>

              <div v-if="quizFeedback[currentIndex]" class="quiz-msg feedback">
                <div class="quiz-msg-bubble" :class="quizFeedback[currentIndex]!.correct ? 'correct' : 'wrong'">{{ quizFeedback[currentIndex]!.text }}</div>
              </div>
            </div>

            <div v-if="!currentAnswered" class="quiz-interaction">
              <div v-if="method === 'quiz4'" class="quiz-options">
                <button
                  v-for="(opt, oi) in questions[currentIndex]?.options || []"
                  :key="oi"
                  class="quiz-option"
                  @click="selectOption(oi)"
                >
                  <span class="quiz-option-letter">{{ optionLetter(oi) }}</span>
                  <span>{{ opt }}</span>
                </button>
              </div>
              <div v-else class="quiz-free-row">
                <input v-model="freeAnswer" class="quiz-free-input" type="text" placeholder="Escribe tu respuesta..." @keyup.enter="submitFreeAnswer">
                <button class="btn btn-primary" :disabled="!freeAnswer.trim()" @click="submitFreeAnswer">Responder</button>
              </div>
            </div>

            <div v-else-if="currentIndex < questions.length - 1" class="quiz-nav">
              <button class="course-start-btn" @click="nextQuestion">Siguiente pregunta →</button>
            </div>
            <div v-else class="quiz-nav">
              <button class="course-start-btn" :disabled="quizState === 'grading'" @click="finishQuiz">
                {{ quizState === 'grading' ? 'Calificando y guardando...' : 'Finalizar y guardar nota' }}
              </button>
            </div>
          </template>

          <template v-else-if="quizState === 'done'">
            <div class="quiz-result">
              <div class="quiz-result-icon">{{ quizCorrect >= 6 ? '🎉' : '📚' }}</div>
              <div v-if="!isFormative" class="quiz-result-score">{{ quizScore }} <span>/ {{ quizTotal }} pts</span></div>
              <p v-else class="quiz-result-sub">Práctica formativa · no cuenta para la nota</p>
              <p class="quiz-result-sub">{{ quizCorrect }} de {{ questions.length }} respuestas correctas</p>
              <p class="quiz-result-sub">{{ isFormative ? '✅ Resultado guardado como práctica.' : '✅ Nota guardada automáticamente en la base de datos.' }}</p>

              <div class="quiz-result-list">
                <div v-for="(q, i) in questions" :key="q.index" class="quiz-result-item">
                  <div class="quiz-result-item-head">
                    <span class="quiz-result-index">#{{ i + 1 }}</span>
                    <span class="quiz-result-question">{{ q.question }}</span>
                    <span class="quiz-result-points" :class="answersCorrect[i] ? 'ok' : 'bad'">
                      {{ isFormative ? (answersCorrect[i] ? 'Bien' : 'Repasar') : (answersCorrect[i] ? `+${q.points}` : '0') + ' pts' }}
                    </span>
                  </div>
                  <div class="quiz-result-detail">Tu respuesta: <strong>{{ displayAnswer(i) }}</strong></div>
                  <div v-if="q.options && q.correct_index !== undefined" class="quiz-result-detail">
                    Respuesta correcta: <strong>{{ optionLetter(q.correct_index) }}. {{ q.options[q.correct_index] }}</strong>
                  </div>
                  <div v-else-if="q.expected_answer && !answersCorrect[i]" class="quiz-result-detail">
                    Respuesta esperada: <strong>{{ q.expected_answer }}</strong>
                  </div>
                  <div v-if="q.explanation" class="quiz-result-detail">💡 <strong>Por qué:</strong> {{ q.explanation }}</div>
                  <div v-if="!answersCorrect[i] && q.concept" class="quiz-result-detail">🎯 Concepto a repasar: <strong>{{ q.concept }}</strong></div>
                </div>
              </div>

              <div v-if="canDisagree" class="disagree-card">
                <p>¿No estás de acuerdo con tu nota?</p>
                <button class="course-start-btn" @click="disagreeWithGrade">Volver a hacer la tarea</button>
              </div>
              <p v-else class="disagree-used">Aún no hay una entrega calificada para volver a hacer.</p>
            </div>
          </template>

          <div v-else-if="quizSubmission && phase === 'evaluated'" class="quiz-result">
            <div class="quiz-result-icon">✅</div>
            <div v-if="!isFormative" class="quiz-result-score">{{ submission?.score }} <span>/ {{ assignment?.max_score }} pts</span></div>
            <p v-else class="quiz-result-sub">Práctica formativa · no cuenta para la nota</p>
            <p class="quiz-result-sub">{{ quizSubmission.attempt_type === 'quiz4' ? 'Quiz 4' : 'Quiz libre' }} completado</p>
            <div v-if="canDisagree" class="disagree-card">
              <p>¿No estás de acuerdo con tu nota?</p>
              <button class="course-start-btn" @click="disagreeWithGrade">Volver a hacer la tarea</button>
            </div>
            <p v-else class="disagree-used">Aún no hay una entrega calificada para volver a hacer.</p>
          </div>

          <div v-else class="quiz-result">
            <p class="quiz-result-sub">Puedes comenzar o repetir este quiz cuando quieras.</p>
            <button class="course-start-btn" @click="startQuiz(method)">Comenzar quiz</button>
          </div>
        </section>

        <section v-else-if="isActivityMethod(method)" class="quiz-section quiz-card">
          <div v-if="activitySubmission && phase === 'evaluated'" class="quiz-result">
            <div class="quiz-result-icon">🧠</div>
            <div v-if="!isFormative" class="quiz-result-score">{{ submission?.score }} <span>/ {{ assignment?.max_score }} pts</span></div>
            <p v-else class="quiz-result-sub">Práctica formativa · no cuenta para la nota</p>
            <p class="quiz-result-sub">{{ METHOD_LABELS[method] }} completada</p>
            <div v-if="feedback.items" class="feedback-content" style="text-align:left;margin-top:12px;">
              <div v-for="item in feedback.items" :key="item.label" style="margin-bottom:8px;">
                <strong style="color:var(--accent-primary);">{{ item.label }}:</strong>
                <span style="color:var(--text-secondary);">{{ item.value }}</span>
              </div>
              <p v-if="feedback.general" style="margin-top:10px;"><strong>Resumen:</strong> {{ feedback.general }}</p>
            </div>
            <div v-if="canDisagree" class="disagree-card">
              <p>¿No estás de acuerdo con tu nota?</p>
              <button class="course-start-btn" @click="disagreeWithGrade">Volver a hacer la tarea</button>
            </div>
            <p v-else class="disagree-used">Aún no hay una entrega calificada para volver a hacer.</p>
          </div>
          <div v-else class="quiz-result">
            <p class="quiz-result-sub">Tu actividad está lista. Vuelve a abrirla para continuar.</p>
            <button class="course-start-btn" @click="openActivity()">Abrir actividad</button>
          </div>
        </section>
      </div>
      </template>
    </template>
  </main>
</template>

<script setup lang="ts">
// Migración de public/classroom_details.html y public/classroom_details.js:
// detalle de una tarea del aula, entrega (PDF/DOCX/imagen, con el texto
// extraído en el navegador), evaluación con IA y retroalimentación.
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import MenuToggle from '@/components/MenuToggle.vue';
import AppLink from '@/components/AppLink.vue';
import { api, apiFetch, errorMessage } from '@/lib/api';
import { dialog } from '@/lib/dialog';
import { extractText, fileExtension } from '@/lib/chat-files';
import { goToPage } from '@/lib/pages';

interface Submission {
  id: number | string;
  status?: string;
  score?: number | null;
  professor_note?: number | null;
  file_url?: string | null;
  feedback?: string | Record<string, unknown> | null;
  attempt_type?: string | null;
  retry_used?: number | null;
}

interface AssignmentDetails {
  id: number | string;
  title?: string;
  description?: string;
  course_title?: string | null;
  section_name?: string | null;
  due_date?: string | null;
  max_score?: number | null;
  submission_type?: string | null;
  grading_mode?: 'formative' | 'summative' | string | null;
  submission?: Submission | null;
}

const UPLOAD_TYPES: Record<string, { accept: string; label: string; icon: string }> = {
  document: { accept: '.pdf,.docx', label: 'PDF o DOCX', icon: '📄' },
  image: { accept: '.png,.jpg,.jpeg,.webp', label: 'imagen PNG, JPG o WEBP', icon: '🖼️' },
  any: { accept: '.pdf,.docx,.png,.jpg,.jpeg,.webp', label: 'PDF, DOCX o imagen PNG/JPG/WEBP', icon: '📎' },
};

const FEEDBACK_LABELS: Record<string, string> = {
  apa: 'Normas APA',
  tercera_persona: 'Tercera Persona',
  conectores: 'Conectores Lógicos',
  tablas_figuras: 'Tablas y Figuras',
  originalidad: 'Originalidad',
  coherencia: 'Coherencia',
  profundidad: 'Profundidad',
  pertinencia_tematica: 'Pertinencia Temática',
  cumplimiento_requisitos: 'Cumplimiento de Requisitos',
  calidad_visual: 'Calidad Visual',
  creatividad: 'Creatividad y Esfuerzo',
  precision: 'Precisión',
  presentacion: 'Presentación',
  pertinencia: 'Pertinencia',
};

const IMAGE_CRITERIA = [
  'Cumplimiento de requisitos de la tarea',
  'Calidad visual (claridad, resolución, enfoque)',
  'Creatividad y esfuerzo',
  'Precisión de los elementos representados',
  'Presentación (encuadre, limpieza)',
  'Pertinencia temática',
];

const DOCUMENT_CRITERIA = [
  'Pertinencia Temática',
  'Cumplimiento de normas APA 7ma edición',
  'Escrito en tercera persona',
  'Uso adecuado de conectores lógicos',
  'Tablas y figuras etiquetadas correctamente',
  'Originalidad del contenido',
  'Coherencia y estructura lógica',
  'Profundidad en el análisis',
];

const MAX_FILE_SIZE = 10 * 1024 * 1024;
// El texto que se manda a la IA se recorta a esta longitud.
const MAX_TEXT = 15000;

const route = useRoute();
const router = useRouter();
const assignmentId = computed(() => (typeof route.query.id === 'string' ? route.query.id : ''));

const assignment = ref<AssignmentDetails | null>(null);
const state = ref<'loading' | 'ready' | 'error'>('loading');
const error = ref('');
const fatal = ref('');

const isImageName = (name: string) => /\.(png|jpg|jpeg|webp)$/i.test(name);

// ── Módulos Aprender / Hacer ──────────────────────────────────────────────
type TaskMethod = 'document' | 'quiz4' | 'quiz_free' | 'flashcards' | 'find_error' | 'recall' | 'summary' | 'concept_map' | 'predict_output' | 'find_bug' | 'order_code';

const ACTIVITY_METHODS: TaskMethod[] = ['flashcards', 'find_error', 'recall', 'summary', 'concept_map', 'predict_output', 'find_bug', 'order_code'];

function isActivityMethod(value: TaskMethod | null): value is 'flashcards' | 'find_error' | 'recall' | 'summary' | 'concept_map' | 'predict_output' | 'find_bug' | 'order_code' {
  return !!value && ACTIVITY_METHODS.includes(value);
}

interface QuizQuestion {
  index: number;
  level: string;
  points: number;
  question: string;
  expected_answer?: string;
  explanation?: string;
  concept?: string;
  options?: string[];
  correct_index?: number;
}

const activeTab = ref<'learn' | 'do'>('learn');
const method = ref<TaskMethod | null>(null);
const showMethods = ref(true);
const retryUsed = ref(false);

const METHOD_LABELS: Record<TaskMethod, string> = {
  document: 'Documento o imagen',
  quiz4: 'Quiz 4',
  quiz_free: 'Quiz libre',
  flashcards: 'Flashcards',
  find_error: 'Detecta el error',
  recall: 'Recuerdo libre',
  summary: 'Resumen con límite',
  concept_map: 'Mapa conceptual',
  predict_output: 'Predice la salida',
  find_bug: 'Encuentra el bug',
  order_code: 'Ordena el código',
};

const METHOD_STORAGE_PREFIX = 'mirai-task-method:';

async function chooseMethod(next: TaskMethod) {
  if (!(await dialog.confirm(`Vas a hacer esta tarea con "${METHOD_LABELS[next]}". Si ya tenías una nota, la nueva la reemplazará. ¿Continuar?`))) {
    return;
  }
  method.value = next;
  showMethods.value = false;
  try {
    localStorage.setItem(`${METHOD_STORAGE_PREFIX}${assignmentId.value}`, next);
  } catch {
    // Sin almacenamiento local: la elección dura solo esta visita.
  }
  if (isActivityMethod(next)) {
    openActivity(next);
    return;
  }
  if (next !== 'document') void startQuiz(next);
}

function openActivity(next: TaskMethod | null = method.value) {
  if (!isActivityMethod(next)) return;
  goToPage(router, 'activity', `id=${encodeURIComponent(assignmentId.value)}&type=${encodeURIComponent(next)}`);
}

function openLudo(): void {
  goToPage(router, 'game', `assignment_id=${encodeURIComponent(assignmentId.value)}`);
}

function startLearning(mode: 'theory' | 'quiz' | 'practice') {
  // El prompt de la tutora lo arma el servidor (buildLearningTaskPrompt).
  goToPage(router, 'chat', `context_task=${encodeURIComponent(assignmentId.value)}&context_mode=${encodeURIComponent(mode)}`);
}

// ── Quiz 4 / Quiz libre ───────────────────────────────────────────────────
const LEVEL_LABELS: Record<string, string> = {
  facil: 'Nivel fácil',
  intermedio: 'Nivel intermedio',
  dificil: 'Nivel difícil',
};

const optionLetter = (i: number) => 'ABCD'[i] ?? '?';
const levelLabel = (level: string) => LEVEL_LABELS[level] || level;

const quizState = ref<'idle' | 'loading' | 'active' | 'grading' | 'done' | 'error'>('idle');
const quizError = ref('');
const questions = ref<QuizQuestion[]>([]);
const currentIndex = ref(0);
const answers = ref<(number | string | null)[]>([]);
const quizFeedback = ref<({ correct: boolean; text: string } | null)[]>([]);
const answersCorrect = ref<boolean[]>([]);
const freeAnswer = ref('');
const quizScore = ref(0);
const quizTotal = ref(0);
const quizCorrect = ref(0);

const currentAnswered = computed(() => answers.value[currentIndex.value] !== null);

function resetQuizState() {
  questions.value = [];
  answers.value = [];
  quizFeedback.value = [];
  answersCorrect.value = [];
  currentIndex.value = 0;
  freeAnswer.value = '';
  quizScore.value = 0;
  quizTotal.value = 0;
  quizCorrect.value = 0;
}

async function startQuiz(mode: TaskMethod | null) {
  if (mode !== 'quiz4' && mode !== 'quiz_free') return;
  method.value = mode;
  resetQuizState();
  quizState.value = 'loading';
  quizError.value = '';
  try {
    const { ok, status, data } = await api.post<{
      questions?: QuizQuestion[];
      total_points?: number;
      error?: string;
    }>('/api/assignment-quiz/start', { assignment_id: assignmentId.value, mode });
    if (!ok) throw new Error(errorMessage(data, `Error ${status}`));
    const list = data.questions || [];
    if (list.length < 10) throw new Error('No se generaron las 10 preguntas. Inténtalo de nuevo.');
    questions.value = list;
    quizTotal.value = Number(data.total_points) || list.reduce((sum, q) => sum + (q.points || 0), 0);
    answers.value = Array(list.length).fill(null);
    quizFeedback.value = Array(list.length).fill(null);
    answersCorrect.value = Array(list.length).fill(false);
    quizState.value = 'active';
  } catch (err) {
    quizError.value = err instanceof Error ? err.message : String(err);
    quizState.value = 'error';
  }
}

function selectOption(optionIndex: number) {
  if (currentAnswered.value) return;
  const q = questions.value[currentIndex.value];
  if (!q) return;
  answers.value[currentIndex.value] = optionIndex;
  const correct = optionIndex === q.correct_index;
  answersCorrect.value[currentIndex.value] = correct;
  const correctText = q.options?.[q.correct_index ?? 0];
  const base = correct
    ? `✅ ¡Correcto! +${q.points} pts`
    : `❌ Incorrecto. La respuesta correcta era ${optionLetter(q.correct_index ?? 0)}${correctText ? `: ${correctText}` : ''}`;
  quizFeedback.value[currentIndex.value] = {
    correct,
    text: q.explanation ? `${base} — ${q.explanation}` : base,
  };
}

function submitFreeAnswer() {
  const text = freeAnswer.value.trim();
  if (!text || currentAnswered.value) return;
  answers.value[currentIndex.value] = text;
  freeAnswer.value = '';
}

function nextQuestion() {
  if (currentIndex.value < questions.value.length - 1) {
    currentIndex.value++;
    freeAnswer.value = '';
  }
}

function displayAnswer(i: number): string {
  const answer = answers.value[i];
  if (answer === null || answer === '') return 'Sin respuesta';
  if (method.value === 'quiz4' && typeof answer === 'number') {
    return `${optionLetter(answer)}. ${questions.value[i]?.options?.[answer] ?? ''}`;
  }
  return String(answer);
}

function applyResults() {
  quizScore.value = questions.value.reduce((sum, q, i) => sum + (answersCorrect.value[i] ? q.points : 0), 0);
  quizCorrect.value = answersCorrect.value.filter(Boolean).length;
}

async function saveQuizResult() {
  if (method.value !== 'quiz4' && method.value !== 'quiz_free') return;
  try {
    const { ok, status, data } = await api.post<{
      score?: number | null;
      formative?: boolean;
      retry_used?: boolean;
      error?: string;
    }>('/api/assignment-quiz/submit', {
      assignment_id: assignmentId.value,
      mode: method.value,
      score: quizScore.value,
      correct: quizCorrect.value,
      max_score: quizTotal.value,
      failures: questions.value
        .map((q, i) => (answersCorrect.value[i] ? null : { concept: q.concept || q.question }))
        .filter(Boolean),
    });
    if (!ok) throw new Error(errorMessage(data, `Error ${status}`));
    retryUsed.value = data.retry_used === true;
    quizState.value = 'done';
    void load();
  } catch (err) {
    quizError.value = err instanceof Error ? err.message : String(err);
    quizState.value = 'error';
  }
}

async function finishQuiz() {
  if (method.value === 'quiz4') {
    applyResults();
    quizState.value = 'grading';
    await saveQuizResult();
    return;
  }
  quizState.value = 'grading';
  try {
    const payload = questions.value.map((q, i) => ({
      question: q.question,
      expected_answer: q.expected_answer || '',
      answer: String(answers.value[i] ?? ''),
      points: q.points,
    }));
    const { ok, status, data } = await api.post<{
      results?: { index: number; correct: boolean; feedback?: string }[];
      error?: string;
    }>('/api/assignment-quiz/grade', { assignment_id: assignmentId.value, answers: payload });
    if (!ok) throw new Error(errorMessage(data, `Error ${status}`));
    for (const result of data.results || []) {
      const i = Number(result.index);
      if (i < 0 || i >= questions.value.length) continue;
      answersCorrect.value[i] = result.correct === true;
      quizFeedback.value[i] = {
        correct: result.correct === true,
        text: result.feedback || (result.correct ? '✅ Respuesta correcta' : '❌ Respuesta incorrecta'),
      };
    }
    applyResults();
    await saveQuizResult();
  } catch (err) {
    quizError.value = err instanceof Error ? err.message : String(err);
    quizState.value = 'error';
  }
}

async function disagreeWithGrade() {
  if (!(await dialog.confirm('Puedes volver a hacer esta tarea. La nueva nota reemplazará a la anterior. ¿Continuar?'))) {
    return;
  }
  try {
    const { ok, status, data } = await api.post<{ error?: string }>('/api/assignment-quiz/reset', {
      assignment_id: assignmentId.value,
    });
    if (!ok) throw new Error(errorMessage(data, `Error ${status}`));
    retryUsed.value = true;
    if (isActivityMethod(method.value)) {
      openActivity(method.value);
    } else if (method.value === 'quiz4' || method.value === 'quiz_free') {
      await startQuiz(method.value);
    } else {
      await load();
    }
  } catch (err) {
    dialog.alert(err instanceof Error ? err.message : String(err));
  }
}

// ── Carga ─────────────────────────────────────────────────────────────────
async function load() {
  const id = assignmentId.value;
  fatal.value = id ? '' : `ID de tarea no proporcionado. URL: ${location.href}`;
  if (!id) return;
  state.value = 'loading';
  try {
    const { ok, status, data } = await api.get<AssignmentDetails & { error?: string }>(`/api/assignment-details?id=${encodeURIComponent(id)}`);
    if (!ok) {
      if (status === 404) fatal.value = 'Esta tarea no está disponible para ti o no existe.';
      else if (status === 401) goToPage(router, 'login');
      else fatal.value = errorMessage(data, 'Error al cargar los detalles');
      return;
    }
    assignment.value = data;
    state.value = 'ready';
    syncMethodFromSubmission();
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
    state.value = 'error';
  }
}

// Se recarga también si cambia ?id= sin salir de la página (atrás/adelante).
watch(assignmentId, () => void load(), { immediate: true });

const submission = computed(() => assignment.value?.submission ?? null);
const submittedImage = computed(() => !!submission.value?.file_url && isImageName(submission.value.file_url));
const finalScore = computed(() => submission.value?.score);
const isFormative = computed(() => assignment.value?.grading_mode === 'formative');

const quizSubmission = computed(() => {
  const s = submission.value;
  if (!s) return null;
  const type = s.attempt_type || (s.file_url?.startsWith('quiz://') ? s.file_url.slice('quiz://'.length) : '');
  return type === 'quiz4' || type === 'quiz_free' ? s : null;
});

const activitySubmission = computed<TaskMethod | null>(() => {
  const s = submission.value;
  if (!s) return null;
  const type = s.attempt_type || (s.file_url?.startsWith('activity://') ? s.file_url.slice('activity://'.length) : '');
  return isActivityMethod(type as TaskMethod) ? (type as TaskMethod) : null;
});

const canDisagree = computed(() => {
  if (quizState.value === 'done') return true;
  const s = submission.value;
  return !!s && s.status !== 'reset' && (s.status === 'evaluated' || s.status === 'completed');
});

function syncMethodFromSubmission() {
  const s = submission.value;
  if (!s) {
    try {
      const stored = localStorage.getItem(`${METHOD_STORAGE_PREFIX}${assignmentId.value}`);
      const allowed: TaskMethod[] = ['document', 'quiz4', 'quiz_free', ...ACTIVITY_METHODS];
      if (stored && allowed.includes(stored as TaskMethod)) {
        method.value = stored as TaskMethod;
        showMethods.value = false;
        activeTab.value = 'do';
      }
    } catch {
      // Sin almacenamiento local.
    }
    return;
  }
  retryUsed.value = Number(s.retry_used) === 1;
  const activity = activitySubmission.value;
  if (activity) {
    method.value = activity;
    showMethods.value = false;
    activeTab.value = 'do';
    return;
  }
  const quiz = quizSubmission.value;
  const type = quiz ? (s.attempt_type || s.file_url?.slice('quiz://'.length)) : '';
  if (type === 'quiz4' || type === 'quiz_free') {
    method.value = type;
    showMethods.value = false;
    activeTab.value = 'do';
    if (s.status === 'reset') void startQuiz(type);
    return;
  }
  if (s.file_url && !s.file_url.startsWith('quiz://') && !s.file_url.startsWith('activity://')) {
    method.value = 'document';
    showMethods.value = false;
    activeTab.value = 'do';
  }
}

const dueDate = computed(() =>
  assignment.value?.due_date
    ? new Date(assignment.value.due_date).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })
    : 'Sin fecha límite',
);

// pending: sin entregar · review: entregada sin evaluar · evaluated: con nota.
const phase = computed<'pending' | 'review' | 'evaluated' | 'none'>(() => {
  const s = submission.value;
  if (!s) return 'pending';
  if (s.status === 'reset') return 'pending';
  if (s.status === 'evaluated' || s.status === 'completed') return 'evaluated';
  if (s.status === 'submitted' || s.status === 'pending') return 'review';
  return 'none';
});

const status = computed(() => {
  switch (phase.value) {
    case 'evaluated':
      return isFormative.value
        ? { cls: 'status-evaluated', text: 'Práctica completada' }
        : { cls: 'status-evaluated', text: `Revisado ${finalScore.value}/${assignment.value?.max_score}` };
    case 'review':
      return { cls: 'status-submitted', text: 'En revisión' };
    case 'pending':
      return { cls: 'status-pending', text: 'Pendiente' };
    default:
      return { cls: 'status-pending', text: 'Cargando...' };
  }
});

// La retroalimentación de la IA es un JSON { criterio: texto, general }.
const feedback = computed(() => {
  const raw = submission.value?.feedback;
  if (!raw) return { text: 'Sin retroalimentación.' };
  try {
    const fb = (typeof raw === 'string' ? JSON.parse(raw) : raw) as Record<string, unknown>;
    const items = Object.entries(fb)
      .filter(([key, value]) => key !== 'general' && key !== 'formative' && value)
      .map(([key, value]) => ({ label: FEEDBACK_LABELS[key] || key.replace(/_/g, ' ').toUpperCase(), value: String(value) }));
    return { items, image: !!(fb.cumplimiento_requisitos || fb.calidad_visual), general: fb.general ? String(fb.general) : '' };
  } catch {
    return { text: String(raw) };
  }
});

// ── Entrega ───────────────────────────────────────────────────────────────
const upload = computed(() => UPLOAD_TYPES[assignment.value?.submission_type || 'document'] ?? UPLOAD_TYPES.any!);
const files = ref<File[]>([]);
const responseText = ref('');
const dragOver = ref(false);
const submitting = ref(false);
const submitStatus = ref<{ text: string; type: 'success' | 'error' } | null>(null);

function addFile(file: File) {
  const allowed = upload.value.accept.split(',').map((e) => e.replace('.', ''));
  if (!allowed.includes(fileExtension(file.name))) {
    dialog.alert(`El archivo ${file.name} no es válido. Esta tarea solo acepta: ${upload.value.label}.`);
    return;
  }
  if (file.size > MAX_FILE_SIZE) {
    dialog.alert(`El archivo ${file.name} supera los 10MB`);
    return;
  }
  files.value.push(file);
}

function onPick(e: Event) {
  const input = e.target as HTMLInputElement;
  Array.from(input.files ?? []).forEach(addFile);
  input.value = '';
}

function onDrop(e: DragEvent) {
  dragOver.value = false;
  Array.from(e.dataTransfer?.files ?? []).forEach(addFile);
}

function cancelSubmit() {
  files.value = [];
  responseText.value = '';
  submitStatus.value = null;
}

/** Texto del PDF/DOCX para que la IA lo evalúe (las imágenes las ve la IA de visión). */
async function documentText(file: File): Promise<string> {
  const ext = fileExtension(file.name);
  if (ext === 'pdf' || file.type.includes('pdf')) {
    try {
      return (await extractText(file, 'pdf')).substring(0, MAX_TEXT);
    } catch {
      throw new Error('No se pudo extraer texto del PDF. Asegúrate de que no esté protegido.');
    }
  }
  if (ext === 'docx' || file.type.includes('word')) {
    let text: string;
    try {
      text = await extractText(file, 'docx');
    } catch {
      throw new Error('No se pudo extraer texto del DOCX. Asegúrate de que no esté corrupto.');
    }
    if (text.length < 50) throw new Error('No se pudo extraer texto del DOCX. Asegúrate de que no esté corrupto.');
    return text.substring(0, MAX_TEXT);
  }
  throw new Error('Formato no soportado. Solo PDF y DOCX.');
}

async function submit() {
  // Se entrega el primer archivo de la lista, como hacía la página antigua.
  const file = files.value[0];
  if (!file) {
    submitStatus.value = { text: 'Debes seleccionar al menos un archivo', type: 'error' };
    return;
  }
  submitting.value = true;
  try {
    const extracted = isImageName(file.name) ? '' : await documentText(file);

    const form = new FormData();
    form.append('assignment_id', String(assignment.value?.id ?? assignmentId.value));
    form.append('file', file);
    if (extracted) form.append('extracted_text', extracted);
    const res = await apiFetch('/api/submit-assignment', { method: 'POST', body: form });
    const data = (await res.json().catch(() => ({}))) as { submission_id?: number | string; error?: string };
    if (!res.ok) throw new Error(errorMessage(data, 'Error al entregar'));

    if (extracted) await api.post('/api/save-extracted-text', { submission_id: data.submission_id, extracted_text: extracted });

    submitStatus.value = { text: '✅ Trabajo entregado correctamente', type: 'success' };
    setTimeout(() => {
      files.value = [];
      submitStatus.value = null;
      submitting.value = false;
      void load();
    }, 1500);
  } catch (err) {
    console.error('Error entregando la tarea:', err);
    submitStatus.value = { text: `❌ Error: ${err instanceof Error ? err.message : String(err)}`, type: 'error' };
    submitting.value = false;
  }
}

// ── Evaluación con IA ─────────────────────────────────────────────────────
const evaluating = ref(false);

async function confirmEvaluation() {
  const s = submission.value;
  if (!s) return;
  const criteria = submittedImage.value ? IMAGE_CRITERIA : DOCUMENT_CRITERIA;
  const intro = submittedImage.value ? '🖼️ La IA analizará tu imagen' : 'La IA evaluará tu trabajo';
  const message = `${intro} basándose en los siguientes criterios:\n\n${criteria.map((c, i) => `${i + 1}. ${c}`).join('\n')}\n\n¿Deseas proceder?`;
  if (!(await dialog.confirm(message))) return;

  evaluating.value = true;
  try {
    const { ok, data } = await api.post<{ score?: number; max_score?: number; error?: string }>('/api/evaluate-submission', { submission_id: s.id });
    if (!ok) throw new Error(errorMessage(data, 'Error al evaluar'));
    dialog.alert(`✅ Evaluación completada: ${data.score}/${data.max_score}`);
    await load();
  } catch (err) {
    console.error('Error evaluando:', err);
    dialog.alert('❌ Error al evaluar: ' + (err instanceof Error ? err.message : String(err)));
  } finally {
    evaluating.value = false;
  }
}
</script>

<style>
/* M�dulos �Aprender y Hacer� de una tarea del aula. */
:where(body[data-page="classroom_details"]) .learn-task-tabs {
  display: flex;
  gap: .5rem;
  max-width: 560px;
  margin: 0 auto 24px;
  padding: 4px;
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  border-radius: 14px;
}

:where(body[data-page="classroom_details"]) .learn-task-tab {
  flex: 1;
  padding: 12px 16px;
  border: none;
  border-radius: 11px;
  background: transparent;
  color: var(--text-secondary);
  font-size: .95rem;
  font-weight: 700;
  cursor: pointer;
  transition: all .2s;
}

:where(body[data-page="classroom_details"]) .learn-task-tab.active {
  background: var(--accent-gradient);
  color: #fff;
  box-shadow: 0 4px 14px var(--accent-glow);
}

:where(body[data-page="classroom_details"]) .learning-modes-section {
  padding: 0 20px 40px;
}

:where(body[data-page="classroom_details"]) .task-methods-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
  gap: 12px;
}

:where(body[data-page="classroom_details"]) .method-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  padding: 16px;
  text-align: left;
  background: var(--glass-bg);
  border: 2px solid var(--glass-border);
  border-radius: 14px;
  cursor: pointer;
  color: var(--text-primary);
  transition: all .2s;
}

:where(body[data-page="classroom_details"]) .method-card:hover {
  border-color: var(--accent-color);
  transform: translateY(-2px);
}

:where(body[data-page="classroom_details"]) .method-card.active {
  border-color: var(--accent-color);
  background: var(--secondary-container);
  box-shadow: 0 6px 20px var(--accent-glow);
}

:where(body[data-page="classroom_details"]) .method-card-ludo {
  border-color: var(--accent-color);
  box-shadow: 0 2px 10px var(--accent-glow);
}

:where(body[data-page="classroom_details"]) .method-card-ludo:hover {
  background: var(--secondary-container);
}

:where(body[data-page="classroom_details"]) .method-card-ludo .method-name {
  color: var(--accent-color);
}

:where(body[data-page="classroom_details"]) .ludo-link {
  font: inherit;
  font-weight: 600;
  background: none;
  border: none;
  padding: 4px 8px;
  margin-left: 8px;
  cursor: pointer;
  text-decoration: underline;
  color: var(--accent-color);
}

:where(body[data-page="classroom_details"]) .method-icon {
  font-size: 1.6rem;
}

:where(body[data-page="classroom_details"]) .method-name {
  font-weight: 800;
  font-size: .95rem;
}

:where(body[data-page="classroom_details"]) .method-desc {
  font-size: .78rem;
  color: var(--text-secondary);
  line-height: 1.35;
}

/* -- Quiz -- */
:where(body[data-page="classroom_details"]) .quiz-card {
  margin: 0 20px 60px;
  padding: 20px;
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  border-radius: 18px;
  box-shadow: var(--glass-shadow);
}

:where(body[data-page="classroom_details"]) .quiz-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

:where(body[data-page="classroom_details"]) .quiz-mode-badge {
  display: inline-block;
  padding: 4px 12px;
  border-radius: 999px;
  background: var(--accent-gradient);
  color: #fff;
  font-size: .75rem;
  font-weight: 800;
}

:where(body[data-page="classroom_details"]) .quiz-progress-label {
  margin-left: 10px;
  font-size: .82rem;
  color: var(--text-secondary);
  font-weight: 600;
}

:where(body[data-page="classroom_details"]) .quiz-total {
  font-size: .82rem;
  font-weight: 700;
  color: var(--accent-color);
}

:where(body[data-page="classroom_details"]) .quiz-progress {
  height: 6px;
  border-radius: 999px;
  background: var(--glass-border);
  overflow: hidden;
  margin-bottom: 16px;
}

:where(body[data-page="classroom_details"]) .quiz-progress-fill {
  height: 100%;
  background: var(--accent-gradient);
  transition: width .35s ease;
}

:where(body[data-page="classroom_details"]) .quiz-chat-log {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: 52vh;
  overflow-y: auto;
  padding-right: 4px;
}

:where(body[data-page="classroom_details"]) .quiz-msg {
  display: flex;
  gap: 8px;
  align-items: flex-start;
}

:where(body[data-page="classroom_details"]) .quiz-msg.user {
  justify-content: flex-end;
}

:where(body[data-page="classroom_details"]) .quiz-avatar {
  width: 30px;
  height: 30px;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--secondary-container);
  font-size: .95rem;
}

:where(body[data-page="classroom_details"]) .quiz-msg-bubble {
  padding: 11px 14px;
  border-radius: 14px 14px 14px 4px;
  background: var(--secondary-container);
  color: var(--text-primary);
  font-size: .9rem;
  line-height: 1.45;
}

:where(body[data-page="classroom_details"]) .quiz-msg.user .quiz-msg-bubble {
  background: var(--accent-gradient);
  color: #fff;
  border-radius: 14px 14px 4px 14px;
  font-weight: 600;
}

:where(body[data-page="classroom_details"]) .quiz-msg.feedback .quiz-msg-bubble {
  border-radius: 12px;
  font-size: .82rem;
  font-weight: 600;
}

:where(body[data-page="classroom_details"]) .quiz-msg.feedback .correct {
  background: rgba(76, 175, 80, .15);
  color: #2e7d32;
}

:where(body[data-page="classroom_details"]) .quiz-msg.feedback .wrong {
  background: rgba(229, 57, 53, .12);
  color: #c62828;
}

:where(body[data-page="classroom_details"]) .quiz-msg-meta {
  margin-top: 4px;
  padding-left: 2px;
  font-size: .7rem;
  color: var(--text-secondary);
}

:where(body[data-page="classroom_details"]) .quiz-interaction {
  margin-top: 16px;
}

:where(body[data-page="classroom_details"]) .quiz-options {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 10px;
}

:where(body[data-page="classroom_details"]) .quiz-option {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border: 2px solid var(--glass-border);
  border-radius: 12px;
  background: var(--glass-bg);
  color: var(--text-primary);
  font-size: .88rem;
  font-weight: 600;
  text-align: left;
  cursor: pointer;
  transition: all .18s;
}

:where(body[data-page="classroom_details"]) .quiz-option:hover {
  border-color: var(--accent-color);
  background: var(--secondary-container);
}

:where(body[data-page="classroom_details"]) .quiz-option-letter {
  width: 26px;
  height: 26px;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--accent-gradient);
  color: #fff;
  font-size: .78rem;
  font-weight: 800;
}

:where(body[data-page="classroom_details"]) .quiz-free-row {
  display: flex;
  gap: 10px;
}

:where(body[data-page="classroom_details"]) .quiz-free-input {
  flex: 1;
  min-width: 0;
  padding: 12px 14px;
  border: 1px solid var(--glass-border);
  border-radius: 12px;
  background: var(--glass-bg);
  color: var(--text-primary);
  font-size: .9rem;
  outline: none;
}

:where(body[data-page="classroom_details"]) .quiz-free-input:focus {
  border-color: var(--accent-color);
}

:where(body[data-page="classroom_details"]) .quiz-nav {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}

:where(body[data-page="classroom_details"]) .quiz-nav .course-start-btn {
  max-width: 280px;
}

:where(body[data-page="classroom_details"]) .quiz-result {
  text-align: center;
}

:where(body[data-page="classroom_details"]) .quiz-result-icon {
  font-size: 2.4rem;
}

:where(body[data-page="classroom_details"]) .quiz-result-score {
  font-size: 2.2rem;
  font-weight: 900;
  background: var(--accent-gradient);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}

:where(body[data-page="classroom_details"]) .quiz-result-score span {
  font-size: 1rem;
  color: var(--text-secondary);
  -webkit-text-fill-color: var(--text-secondary);
}

:where(body[data-page="classroom_details"]) .quiz-result-sub {
  margin: 4px 0 18px;
  color: var(--text-secondary);
  font-size: .9rem;
}

:where(body[data-page="classroom_details"]) .quiz-result-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  text-align: left;
  max-height: 48vh;
  overflow-y: auto;
}

:where(body[data-page="classroom_details"]) .quiz-result-item {
  padding: 12px 14px;
  border: 1px solid var(--glass-border);
  border-radius: 12px;
  background: var(--surface);
}

:where(body[data-page="classroom_details"]) .quiz-result-item-head {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

:where(body[data-page="classroom_details"]) .quiz-result-index {
  font-weight: 800;
  color: var(--accent-color);
  font-size: .8rem;
}

:where(body[data-page="classroom_details"]) .quiz-result-question {
  flex: 1;
  font-size: .86rem;
  font-weight: 600;
}

:where(body[data-page="classroom_details"]) .quiz-result-points {
  font-size: .78rem;
  font-weight: 800;
  white-space: nowrap;
}

:where(body[data-page="classroom_details"]) .quiz-result-points.ok { color: #2e7d32; }
:where(body[data-page="classroom_details"]) .quiz-result-points.bad { color: #c62828; }

:where(body[data-page="classroom_details"]) .quiz-result-detail {
  margin-top: 5px;
  font-size: .78rem;
  color: var(--text-secondary);
  line-height: 1.4;
}

:where(body[data-page="classroom_details"]) .quiz-result-actions {
  display: flex;
  gap: 10px;
  justify-content: center;
  flex-wrap: wrap;
  margin-top: 20px;
}

@media (max-width: 640px) {
  :where(body[data-page="classroom_details"]) .quiz-free-row { flex-direction: column; }
  :where(body[data-page="classroom_details"]) .learn-task-tab { font-size: .85rem; padding: 10px 8px; }
}
</style>

<style>
/* Ajustes: m�todo bloqueado, una pregunta a la vez y reinicio �nico. */
:where(body[data-page="classroom_details"]) .method-locked-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  padding: 12px 16px;
  border-radius: 12px;
  background: var(--secondary-container);
  border: 1px solid var(--glass-border);
  font-size: .85rem;
  color: var(--text-secondary);
}

:where(body[data-page="classroom_details"]) .method-locked-bar strong {
  color: var(--accent-color);
}

:where(body[data-page="classroom_details"]) .method-locked-bar span {
  margin-left: auto;
  font-size: .72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: .03em;
}

:where(body[data-page="classroom_details"]) .quiz-current {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 8px;
}

:where(body[data-page="classroom_details"]) .quiz-current .quiz-msg.feedback {
  margin-top: -4px;
}

:where(body[data-page="classroom_details"]) .disagree-card {
  margin-top: 18px;
  padding: 14px 16px;
  border-radius: 12px;
  background: rgba(239, 68, 68, .08);
  border: 1px solid rgba(239, 68, 68, .25);
  text-align: center;
}

:where(body[data-page="classroom_details"]) .disagree-card p {
  margin-bottom: 10px;
  font-size: .88rem;
  font-weight: 600;
}

:where(body[data-page="classroom_details"]) .disagree-card .course-start-btn {
  max-width: 320px;
  margin: 0 auto;
}

:where(body[data-page="classroom_details"]) .disagree-used {
  margin-top: 14px;
  font-size: .8rem;
  color: var(--text-secondary);
  font-style: italic;
}
</style>
