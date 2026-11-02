# Pedagogía del Ludo y las actividades

Documento de orientación para que los juegos y actividades de Mirai AI enseñen de
verdad, no solo entretengan. No es una lista de deseos: es un orden de prioridad
con criterios para decidir qué construir y qué no.

---

## 0. Regla de oro

"Educativo" es el **objetivo**. "Dinámico / personalizable" es solo un **medio**.

No son dos enfoques rivales. El error es tratarlos como caminos separados: eso
termina financiando decoración y llamándola pedagogía.

La pregunta que manda sobre todas las demás:

> **¿Qué evidencia tendrás de que el estudiante aprendió?**

Si no se puede responder, ninguna funcionalidad nueva sirve, por vistosa que sea.

---

## 1. Enfoque educativo

### A favor
- Tiene retorno real y medible.
- El Ludo ya usa *recuperación activa* (una pregunta por turno), una de las
  técnicas con mejor evidencia en aprendizaje.
- Generar preguntas desde la tarea real del curso
  (`workers/lib/game-questions.ts`) es una base sólida: las preguntas no son
  genéricas, salen del contenido que se está viendo.

### Crítica: el ciclo educativo está incompleto
Hoy, al responder:
- se suma o resta un porcentaje (`EASY_PERCENT = 10`, `HARD_PERCENT = 20` en
  `workers/durable/GameRoom.ts`),
- se mueve o no la ficha,
- **no se explica por qué la respuesta fue incorrecta.**

Sin ese eslabón el juego es un examen disfrazado, no una herramienta de
aprendizaje. Un estudiante que falla aprende que perdió puntos, no *qué concepto*
no entendió. "Educar de distintas maneras" se reduce a repetir la misma trivia
con otro color.

### Prioridades que sí mueven la aguja (en orden)
1. **Feedback inmediato con explicación** de la respuesta correcta (1-2 líneas
   por pregunta). Es el cambio de mayor impacto y menor costo.
2. **Repaso final**: lista de preguntas falladas por jugador/equipo al terminar
   la partida, con la explicación correspondiente.
3. **Variedad de demanda cognitiva** (no de estética): recordar, aplicar,
   inferir. Mezclar niveles dentro de una misma partida.
4. **Visibilidad para el docente**: qué tema falla toda la clase, para
   reajustar la siguiente sesión.

### Riesgo principal: mezclar formativo con sumativo
El juego reparte porcentaje de nota. Eso convierte una práctica en un examen y
cambia la motivación del estudiante: optimiza puntos, no comprensión. Elegirá la
pregunta fácil para asegurar +10 antes que arriesgar y razonar la difícil por
+20. El incentivo pelea contra el aprendizaje.

**Decisión obligatoria:** ¿la partida es **formativa** (practicar sin miedo a
equivocarse) o **sumativa** (cuenta para la nota)?

- Si es formativa: quitar el % de nota (o hacerlo interno, no visible como
  calificación).
- Si es sumativa: eliminar la elección de dificultad, para que no se pueda
  "negociar" la nota.

Hoy el sistema permite ambas a la vez y compiten entre sí.

---

## 2. Enfoque dinámico / personalización

### A favor
- Identidad y pertenencia (personaje, equipo, tablero) sí aumentan el
  engagement, sobre todo en secundaria.
- `frontend/src/lib/teams.ts` ya lo hace bien: el personaje no es adorno, es
  identidad de equipo y se refleja en las fichas.

### Crítica: "muchas opciones" escala de forma multiplicativa
Temas × tableros × personajes × músicas = un costo de arte, assets, QA y peso de
descarga por cada combinación. A partir de ~4 variantes el costo crece más rápido
que la motivación. Es rendimiento decreciente aplicado a skins.

### Crítica pedagógica concreta: el audio durante el razonamiento
La música ambiental con letra o melodía activa **compite con la lectura** de la
pregunta. Menos comprensión y más errores, sobre todo en estudiantes con
dificultades de atención.

Regla: el sonido es válido en lobby, dados y celebraciones; **se silencia
automáticamente durante la fase de pregunta**.

### El engaño de la personalización decorativa
Se puede medir fácil ("¿eligió su tablero?") pero no dice nada de aprendizaje.
Es fácil de construir y fácil de vender; por eso seduce.
**No confundir lo que entretiene con lo que enseña.**

---

## 3. Jerarquía recomendada

No elegir entre enfoque 1 y 2. Ponerlos en jerarquía y exigir que la
personalización **sea pedagógica**.

### P0 — Sin esto no hay producto educativo
- Explicación tras cada respuesta.
- Repaso final de errores por jugador/equipo.
- Reporte docente por tema/concepto.
- Calidad y alineación de las preguntas con la tarea del curso.
- Decidir y aplicar: formativo **o** sumativo (no ambos).

### P1 — Personalización con efecto en el aprendizaje
- Dificultad elegible (solo si la partida es formativa).
- Foco temático de la sesión.
- Avatar que da pistas o ventajas pedagógicas, no solo cosméticas.
- Tablero temático por materia, ligado al contenido.

### P2 — Cosmético (opcional, por defecto apagado)
- Música ambiental.
- Tableros y personajes extra.
- Debe ser configurable y silenciarse durante las preguntas.

---

## 4. Reglas de UX para el audio

- Un solo elemento `Audio` por sala.
- Atado al ciclo de vida del componente de sala: `fade-out` y `pause()` en
  `onBeforeUnmount`, y limpieza también en `pagehide` y cambio de ruta. Así, al
  cerrar la sala la música muere con ella y no queda sonando en otra pantalla.
- **Sonido opt-in** o, como mínimo, botón visible de mute.
- Respetar políticas de autoplay: el audio solo arranca tras una interacción del
  usuario (por ejemplo, el clic en "Iniciar partida").
- Respetar `prefers-reduced-motion` / preferencias de accesibilidad.
- Si la precarga de la música falla o tarda demasiado: empezar la partida igual,
  sin música. Nunca bloquear el juego por un adorno.

---

## 5. Cómo decidir una funcionalidad nueva

Antes de construir cualquier cosa, responder:

1. ¿Qué evidencia de aprendizaje produce? (si no produce ninguna, es P2).
2. ¿Afecta el ciclo de pregunta-respuesta-feedback, o solo la presentación?
3. ¿El costo crece de forma lineal o multiplicativa con cada opción nueva?
4. ¿Compite con la tarea cognitiva del estudiante (lectura, atención, tiempo)?
5. ¿Es formativa o sumativa? ¿Refuerza o contradice esa decisión?

Si las respuestas no justifican el costo, no se construye.
