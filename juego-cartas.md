# Juego de cartas multijugador por equipos (análisis de viabilidad)

Documento de requisitos y plan técnico para añadir un juego de cartas 4 jugadores / 2 equipos, con el mismo sistema de salas del Ludo, e integrarlo en el Aula Virtual como método de "Hacer tarea". No incluye código: define qué hace falta, qué se reutiliza y qué decisiones hay que tomar antes de implementar.

---

## 1. Veredicto

**Viable y con alto reaprovechamiento (~70-80%)**. La infraestructura de salas ya existe y funciona; lo que falta es el motor del nuevo juego, el modelo de equipos y una pantalla de partida. No hay que añadir servicios ni plan de Cloudflare.

---

## 2. Lo que ya se puede reutilizar

| Pieza | Ubicación |
|---|---|
| Durable Object autoritativo, WebSocket Hibernation, `alarm()`, reconexión, espectadores, timeout de turno | `workers/durable/GameRoom.ts` |
| Lobby REST, códigos de sala, rate limit, validación de sección/tarea, D1 | `workers/routes/game.ts` |
| Tablas `game_rooms`, `game_players`, `game_matches`, `game_results`, `game_moves`, `game_question_bank` | se crean en `game.ts:42-107` |
| Integración con Aula: `/game?assignment_id=...` y nota vía `submissions` | `ClassroomDetailsPage.vue:615`, `GameRoom.ts:1117-1145` |
| Banco de preguntas IA por tarea | `workers/lib/game-questions.ts` + `game_question_bank` |
| Binding DO + migración SQLite | `wrangler.toml:53-59` |
| Auth, sección, apodos, equipos visuales | `workers/lib/auth.ts`, `frontend/src/lib/teams.ts` |

La sala es agnóstica al juego: guarda `game_type`, `assignment_id`, `max_players`, `turn_seconds`. Eso es exactamente lo que se necesita.

---

## 3. Lo que hay que construir (y no se reutiliza)

1. **Motor de reglas de cartas** (lo más grande). Hoy `GameRoom.ts` tiene Ludo embebido (`legalMoves`, `applyMove`, `nextTurn`). Hay que escribir el equivalente: baraja, reparto, validación de jugadas, bazas/combinaciones, puntuación. Debe ser puro y testeable, igual que Ludo.
2. **Modelo de equipos.** El estado actual no tiene equipos; `teams.ts` es solo color/identidad. Para 4 jugadores / 2 equipos se necesita: `teamId`, asiento, orden de turnos por asiento, puntaje compartido y condición de victoria por equipo.
3. **Registro de tipo de juego.** `GAME_TYPES` hoy solo acepta `'ludo'` (`game.ts:19`). Hay que añadir el nuevo tipo y validar `max_players = 4` + equipos.
4. **Enrutado del DO.** Al crear el stub se usa siempre `env.GAME_ROOM` (`game.ts:657,948`). Opciones:
   - **Recomendada:** nueva clase `CardRoom` + binding y `[[migrations]] new_sqlite_classes` (Ludo no se toca, cero regresiones).
   - Alternativa: generalizar `GameRoom` con un motor plug-in por `game_type` (más limpio a futuro, más riesgo para Ludo).
5. **Frontend de partida.** `GameRoomPage.vue` tiene 2358 líneas acopladas a Ludo. Recomendación: una página/componente nuevo (`CardRoomPage.vue`) y parametrizar la ruta por `game_type`, reutilizando el lobby con selector.
6. **Generalizar notas.** Cambiar `game://ludo` por `game://<tipo>` y definir cómo una nota de equipo se escribe en `submissions` (¿misma nota para los 2? ¿proporcional?).
7. **Tests** del motor, de turnos de equipo y de reconexión a mitad de baza.

---

## 4. Esfuerzo estimado (1 dev)

- Reutilizar infraestructura + añadir tipo/equipos en backend: ~1 semana.
- Motor + DO del juego: ~2-3 semanas (depende de la complejidad de reglas).
- Frontend de partida: ~1-2 semanas.
- **MVP total: ~4-6 semanas**; un juego simple (tipo Uno/Brisca básica) puede bajar a 2-3 semanas.

---

## 5. Riesgos reales

- **El riesgo #1 es la especificación de las reglas**: "cartas" no define nada. Sin reglas exactas no se puede estimar ni implementar.
- Trampas: el motor debe vivir en el DO, nunca en el cliente.
- Nota de equipo: hay que decidir si ambos reciben la misma calificación.
- Reconexión dentro de una baza/turno de equipo.

---

## 6. Decisiones necesarias antes de implementar

1. **¿Qué juego de cartas exacto?** (Brisca, Escoba de 15, Uno-like, baraja española, etc.) y sus reglas.
2. **¿Cómo ganan los equipos y cómo se traduce a nota?**
3. **¿Siempre 4 jugadores / 2 equipos fijos o configurable?**
4. **¿Reemplaza al Ludo en "Hacer tarea" o se suma como otra opción** en "¿Cómo quieres hacer tu tarea?" (`ClassroomDetailsPage.vue:135-200`)?

Si se confirma el juego y las reglas, el siguiente paso es el plan de fases y empezar por el motor puro + el tipo `game_type` en el backend.
