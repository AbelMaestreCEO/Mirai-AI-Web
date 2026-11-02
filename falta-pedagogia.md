# Falta Pedagogía — Diagnóstico y plan de resolución

Estado actual del ciclo educativo en "Aula virtual → hacer tarea" comparado con
los requisitos de `pedagogia.md`. Qué falta y cómo resolverlo.

---

## 1. Formas de evaluar hoy

Al elegir "¿Cómo quieres hacer tu tarea?" hay 9 métodos
(`frontend/src/pages/ClassroomDetailsPage.vue:138-182`):

| # | Método | Tipo | Cómo evalúa |
|---|--------|------|-------------|
| 1 | Documento o imagen | `document` | IA (visión para imagen, texto para PDF/DOCX) da puntaje + feedback |
| 2 | Quiz 4 | `quiz4` | 10 preguntas opción múltiple, `correct_index` client-side |
| 3 | Quiz libre | `quiz_free` | 10 abiertas, IA decide correct/incorrect |
| 4 | Flashcards | `flashcards` | coincidencia de texto + repetición espaciada (SM-2) |
| 5 | Detecta el error | `find_error` | aciertos − 0.5 × falsos positivos |
| 6 | Recuerdo libre | `recall` | IA compara cobertura de conceptos clave |
| 7 | Resumen con límite | `summary` | coverage·0.5 + fidelity·0.3 + synthesis·0.2, × factor longitud |
| 8 | Mapa conceptual | `concept_map` | % de relaciones correctas vs referencia |
| 9 | Ludo multijugador | — | respuestas correctas suman % a la nota (no bloquea entrega) |

Todos guardan nota en `submissions` con un único reinicio (`retry_used`).

**Conclusión:** la capa de *métodos* ya está construida y es variada. Lo que falta
es el **ciclo educativo** que `pedagogia.md` exige en su P0.

---

## 2. Qué falta (mapeo con pedagogia.md)

### P0 — Sin esto no hay producto educativo

| Requisito (P0) | Estado | Detalle |
|----------------|--------|---------|
| Explicación tras cada respuesta | ❌ No se cumple | Quiz 4 solo dice "la correcta era B" (`ClassroomDetailsPage.vue:663`); Ludo suma/resta % sin explicar (`GameRoom.ts`) |
| Repaso final de errores | ⚠️ Parcial | Quiz muestra lista con respuesta esperada, sin explicación; actividades y Ludo sin repaso |
| Reporte docente por tema/concepto | ❌ No existe | Solo hay `professor-submissions` (listado) y `professor-disputes`; no hay analítica conceptual |
| Calidad/alineación de preguntas | ✅ Se cumple | Preguntas generadas desde la tarea (`game-questions.ts`, quiz/actividades) |
| Decidir formativo vs sumativo | ❌ No resuelto | Todo suma nota; Ludo mezcla dificultad elegible + % de nota (combinación prohibida) |

### P1 / P2 — pendientes menores (no bloquean)

- **P1**: avatar con pistas pedagógicas (hoy es cosmético), tablero temático ligado a contenido.
- **P2**: audio configurable, debe silenciarse durante preguntas (ya hay reglas en `pedagogia.md §4`).

---

## 3. Cómo lo resolvería

### 3.1 Explicación tras cada respuesta (mayor impacto, menor costo)

**Problema:** el feedback actual es "correcto/incorrecto" sin el *por qué*.

**Solución:**
1. Añadir al prompt de generación de preguntas un campo `explanation` (1–2 líneas)
   que explique el concepto, tanto en quiz como en Ludo.
   - `workers/routes/classroom.ts` (`assignment-quiz/start`): sumar `"explanation":"..."` al schema.
   - `workers/lib/game-questions.ts`: sumar `explanation` a cada pregunta del Ludo.
2. Devolver `explanation` en cada respuesta (correcta o incorrecta) y mostrarla en el
   frontend justo después de responder (no solo al final).

**Archivos:** `classroom.ts`, `game-questions.ts`, `ClassroomDetailsPage.vue`, pantalla de Ludo.

### 3.2 Repaso final de errores

**Problema:** no hay lista consolidada de fallos con su explicación.

**Solución:**
1. Quiz ya acumula `answersCorrect`; en el `quizState === 'done'` ya lista preguntas.
   Añadir la `explanation` por pregunta fallada.
2. Para actividades, `grade*` ya devuelve `details` con lo fallado (`missing`,
   `falsePositives`, etc.). Persistirlo ya se hace en `activity_attempts`. Falta solo
   renderizar un bloque "Repaso" en `ActivityPage.vue`.
3. Para Ludo: al terminar la partida, persistir las preguntas falladas por
   jugador/equipo (`GameRoom.ts` ya guarda `state_summary`) y mostrar pantalla de repaso.

### 3.3 Reporte docente por tema/concepto

**Problema:** el profesor ve entregas sueltas, no qué tema falla la clase.

**Solución:**
1. Nueva tabla `concept_errors` (o reutilizar `activity_attempts`/`submissions`):
   ```sql
   CREATE TABLE concept_errors (
     id            TEXT PRIMARY KEY,
     assignment_id TEXT NOT NULL,
     concept       TEXT NOT NULL,
     user_dni      TEXT NOT NULL,
     source        TEXT,          -- quiz4 | quiz_free | ludo | recall | summary ...
     created_at    TEXT DEFAULT (datetime('now'))
   );
   ```
2. Cada vez que se detecta un fallo, registrar el `concept` asociado (que debe venir
   etiquetado desde la generación, ver 3.1).
3. Nuevo endpoint `GET /api/professor-concept-report?assignment_id=...` que agrupe
   `concept` por frecuencia y devuelva los temas que más falla la sección.
4. Nueva vista en `ClassroomAdminPage.vue` con un resumen tipo "Estos conceptos fallan
   en tu clase: [top N]".

**Archivos:** `classroom.ts`, `activities.ts`, `db/` (DDL), `ClassroomAdminPage.vue`.

### 3.4 Decidir formativo vs sumativo

**Problema:** hoy todo es sumativo (suma nota) y el Ludo además permite elegir
dificultad, que optimiza puntos en vez de comprensión.

**Solución (la decisión obligatoria del doc):**
1. Añadir un campo `grading_mode` a la tarea (`assignments`): `formative` | `summative`.
   Default `summative` para no romper lo existente; el profesor lo elige al crear la tarea.
2. Si `summative`: **eliminar la elección de dificultad** en Ludo (preguntas fijas
   ordenadas, sin `EASY_PERCENT`/`HARD_PERCENT` negociables).
3. Si `formative`: el % no se registra como nota visible (`submissions.score` queda
   `NULL` o se guarda un flag `formative=true`), y se habilita la elección de dificultad.

**Archivos:** `classroom.ts` (`create-assignment`), `ClassroomAdminPage.vue` (selector),
`GameRoom.ts` (regla de dificultad), `ClassroomDetailsPage.vue` (ocultar nota si formativo).

### 3.5 Orden de implementación (jerarquía del doc)

1. **3.1 Explicación** — mayor impacto, menor costo. Base para todo lo demás.
2. **3.4 Formativo/sumativo** — decisión de diseño que condiciona al resto.
3. **3.2 Repaso final** — depende de 3.1 (reutiliza la explicación).
4. **3.3 Reporte docente** — depende de etiquetar conceptos en 3.1.

---

## 4. Notas de riesgo

- No introducir `explanation` en el prompt sin validar tamaño: un quiz de 10 preguntas
  con explicaciones largas aumenta `max_tokens`. Mantener 1–2 líneas por pregunta.
- El reporte docente expone datos agregados de la clase; respetar los checks de
  `requireProfessorAuth` ya existentes (no filtrar por `course.user_dni`).
- La columna `grading_mode` requiere migración con default (`ALTER TABLE ... ADD
  COLUMN grading_mode TEXT DEFAULT 'summative'`) para no romper tareas viejas.
