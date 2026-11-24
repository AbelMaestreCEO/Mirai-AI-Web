# Uno-like educativo — especificación y plan de implementación

Documento de requisitos y plan técnico para añadir un juego de cartas tipo Uno
("Uno-like") al Aula Virtual, reutilizando la infraestructura de salas del Ludo
descrita en `juego-cartas.md` y `multijugador.md`.

Complementa a `juego-cartas.md`: aquel documenta el análisis de viabilidad y la
infraestructura compartida; este fija las **reglas exactas** del juego, las
**modificaciones pedagógicas** solicitadas (preguntas por +2/+4 y por ronda par,
con 30 s de límite) y el **plan de implementación** sobre el código real.

No incluye código de producción: define qué hace falta, dónde se toca y con qué
contratos.

---

## 1. Resumen ejecutivo

- **Viable** reutilizando el `Durable Object` autoritativo, el lobby REST en D1,
  el banco de preguntas IA y la integración de nota con `submissions`.
- **Motor nuevo**: baraja, reparto, validación de jugadas, dirección de giro,
  bloqueos y resolución de preguntas. Debe ser puro y testeable, como el motor
  del Ludo (`legalMoves` / `applyMove` en `workers/durable/GameRoom.ts`).
- **Nuevo DO recomendado**: `UnoRoom` con binding `UNO_ROOM` y migración
  `new_sqlite_classes`. No se toca `GameRoom` (cero regresiones en Ludo).
- **Modificaciones del juego**:
  - `+2` → pregunta **fácil** a los demás jugadores; correcto = 0 cartas;
    incorrecto o sin responder = roban **2** cartas.
  - `+4` → pregunta **difícil**; correcto = 0 cartas; incorrecto/sin responder
    = roban **4** cartas.
  - Cada **2 rondas** completas → pregunta **media** a todos; correcto = 0
    cartas; incorrecto/sin responder = roban **1** carta.
  - Todas las preguntas: **30 s**; sin responder = incorrecta.
- **Nueva dificultad `medium`** en el banco de preguntas (D1 ya guarda
  `difficulty` como `TEXT`, no requiere migración de columna).
- **Nuevo modo de tarea `uno`** para que la partida cuente para la nota, junto
  a `ludo`.

---

## 2. Decisiones fijadas (interpretación de los requisitos)

| Tema | Decisión |
|---|---|
| Jugadores | 2 a 4, salas con el mismo lobby del Ludo. |
| Equipos | Opcional (2v2). MVP individual; ver §6. |
| Alcance de +2/+4 | "Los demás jugadores": **todos** los demás jugadores activos responden, cada uno su propia pregunta. Configurable a `next` (solo el siguiente). |
| Apilado de +2/+4 | **No** hay apilado. El efecto se resuelve con preguntas, no encadenando cartas. |
| Bloqueo (skip) | Salta el turno del siguiente jugador activo. |
| Voltear giro (reverse) | Invierte el sentido de los turnos. Con 2 jugadores actúa como bloqueo. |
| +4 | Comodín sin color: quien la juega **declara color**. Se puede jugar siempre. |
| Ronda | Una vuelta completa: todos los jugadores activos han tenido un turno (hayan jugado o robado). No se exige que todos "lancen" una carta para evitar bloqueos. |
| Pregunta de ronda par | Se dispara al cerrar la ronda 2, 4, 6…, después de resolver cualquier pregunta de carta de ese turno. |
| Límite de preguntas | 30 s por pregunta, autoridad del servidor (`alarm()`), igual que el Ludo (`ANSWER_SECONDS = 30`). |
| Fin de ronda | Gana la ronda quien se queda sin cartas. Los efectos de la última carta **no** se resuelven. |
| Fin de partida | Por defecto 1 ronda; si se configura, mejor de 3. Tope de tiempo de ronda (15 min) para evitar partidas eternas. |
| Nota | 70 % aciertos de quiz + 30 % posición final. Configurable. Ver §5.9. |

---

## 3. Reglas del juego

### 3.1 Baraja

Cuatro colores: `red`, `green`, `blue`, `yellow` (los mismos de `teams.ts`).
No hay cartas `0`; la numeración es **1–9** como pidió el requisito.

| Carta | Copias por color | Total |
|---|---|---|
| Números `1`–`9` | 2 de cada una (18) | 72 |
| Bloqueo (`skip`) | 2 | 8 |
| Voltear giro (`reverse`) | 2 | 8 |
| `+2` | 2 | 8 |
| `+4` (comodín, sin color) | — | 4 |
| **Total** | 24 por color | **100** |

- `id` de carta único y estable (p. ej. `red-7-a`, `wild-plus4-3`) para que el
  cliente envíe `cardId` y el servidor nunca confíe en el índice.
- Barajado con `crypto.getRandomValues` en el servidor.
- Descarte visible: solo la carta superior y el `activeColor`.

### 3.2 Preparación

1. Se reparten **7 cartas** por jugador.
2. Se voltea la primera carta del mazo. Si es de acción (`skip`, `reverse`,
   `+2`, `+4`) se sigue volteando hasta que salga un número `1`–`9`; esas
   cartas van al fondo del mazo. Evita casos límite en el primer turno.
3. `activeColor` = color de esa primera carta.
4. Empieza un jugador al azar entre los activos (`turnIndex` aleatorio y
   `direction = 1`).

### 3.3 Turno

Estados del turno:

1. **Jugar**: si el jugador tiene al menos una carta legal, **debe** jugar una.
   El botón de robar está deshabilitado.
2. **Robar**: si no tiene ninguna carta legal, roba **una** carta.
   - Si la carta robada es legal, puede jugarla en ese mismo turno o plantarse.
   - Si no es legal, el turno termina.
3. **Pasar**: tras robar y decidir no jugar, termina el turno.
4. Temporizador de turno (`turn_seconds`, por defecto 40 s; recomendado 30 s
   para Uno). Al vencer: el servidor roba automáticamente y pasa el turno.

Reglas de obligatoriedad y de un solo robo por turno se validan en el servidor.

### 3.4 Coincidencia (qué carta es legal)

Una carta es legal si cumple **al menos una**:

- Mismo **color** que `activeColor`.
- Mismo **número** que la carta superior.
- Misma **acción** que la carta superior (`skip`, `reverse` o `+2`).
- Es `+4` (siempre legal), declarando color.

`activeColor` cambia a:
- El color de la carta jugada (números y acciones con color).
- El color declarado por el jugador (`+4`).

Tras jugar un `+4`, el color declarado cuenta para el siguiente turno.

### 3.5 Cartas especiales

| Carta | Efecto base | Efecto educativo |
|---|---|---|
| Bloqueo (`skip`) | El siguiente jugador activo pierde el turno. | — |
| Voltear giro (`reverse`) | `direction *= -1`. Con 2 jugadores, salta al otro (equivale a bloqueo). | — |
| `+2` | No roba automáticamente. | Dispara pregunta **fácil** a los demás activos (§3.6). |
| `+4` | No roba automáticamente. Declara color. | Dispara pregunta **difícil** a los demás activos (§3.6). |

El `+2`/`+4` **no** salta el turno por sí mismo: su único efecto es la ronda de
preguntas. Terminada la resolución, continúa el flujo normal de turnos.

### 3.6 Eventos de pregunta (núcleo pedagógico)

Un solo evento de pregunta activo a la vez. Mientras dura, `status = 'question'`
y el juego se pausa para todos.

| Evento | Disparador | Dificultad | Quién responde | Correcto | Incorrecto o timeout |
|---|---|---|---|---|---|
| `plus2` | Al jugar `+2` | `easy` | Todos los demás jugadores activos | 0 cartas + puntos de quiz | Roba **2** cartas |
| `plus4` | Al jugar `+4` (tras declarar color) | `hard` | Todos los demás jugadores activos | 0 cartas + puntos de quiz | Roba **4** cartas |
| `periodic` | Al cerrar una ronda **par** (`round % 2 === 0`) | `medium` | Todos los jugadores activos (incluido quien cerró) | 0 cartas + puntos de quiz | Roba **1** carta |

Detalles:

- Cada objetivo recibe **su propia pregunta** del mismo nivel (no se comparte la
  misma pregunta entre jugadores para evitar copia).
- Quien jugó la carta **no** responde su propio `+2`/`+4`.
- La resolución es individual: un jugador puede evitar sus cartas y otro no.
- El evento se resuelve cuando **todos** los objetivos responden o vence el
  temporizador de 30 s. Al vencer, quien no respondió cuenta como incorrecto.
- Si el banco se queda sin preguntas de ese nivel, se reintenta reciclando
  (`used = 0`) y, si aun así no hay, se degrada a otro nivel; si no hay ninguna,
  el evento se cierra sin penalizar (no rompe la partida).
- Los aciertos suman al `quizStats` del jugador y alimentan la nota (§5.9).
- Las preguntas falladas se guardan en `review` para el repaso final, igual que
  en el Ludo (`ReviewItem`).
- Tras resolver, se aplican las tiradas de cartas y se continúa el turno. Si al
  cerrar la vuelta toca pregunta `periodic`, se dispara después de la de carta.

### 3.7 Temporizador

- **Pregunta**: 30 s fijos (`ANSWER_SECONDS`), servidor autoritativo con
  `storage.setAlarm(deadline)`. El cliente solo dibuja la cuenta atrás desde
  `deadline`; nunca decide el resultado.
- **Turno**: `turn_seconds` de la sala. Al vencer, robo automático y pase.
- Si el jugador se desconecta en su turno, el temporizador sigue; al vencer se
  roba y pasa. Reconectado antes del vencimiento, retoma su turno.

### 3.8 Fin de ronda y de partida

- **Fin de ronda**: cuando la mano de un jugador queda en 0 cartas. La carta
  final se aplica visualmente pero **sus efectos no se resuelven**.
- **Fin de partida**:
  - `roundsToWin` por defecto **1** (una sola ronda por tarea). Configurable a
    2 o 3 (mejor de N).
  - Tope `roundMaxMinutes` (por defecto 15). Al alcanzarse, gana la ronda quien
    tenga **menos cartas**; empate → mayor porcentaje de quiz; luego orden de
    asiento.
- Empate de rondas: desempata el `quizPercent`.

### 3.9 Puntuación y nota

Los puntos de la partida no deben premiar solo la suerte de las cartas. Fórmula
por defecto (configurable):

```
pesoPregunta = { easy: 1, medium: 2, hard: 3 }
quizPercent  = 100 * sumaPesoAcertado / sumaPesoServido     (0 si no hubo)
placementPercent = 100 * (n - rank) / (n - 1)               (n>=2; 1 jugador = 100)
finalPercent = clamp(round(0.7 * quizPercent + 0.3 * placementPercent), 0, 100)
score        = round(maxScore * finalPercent / 100)
```

- `rank` = posición por cartas restantes al final (menos cartas = mejor).
- `formative`: se guarda sin nota numérica (score `null`), igual que en Ludo.
- `summative`: se conserva la **mejor marca**, como ya hace `applyGrades`.
- Se escribe en dos sitios, replicando `GameRoom.applyGrades`:
  - `recordTaskModeResult(..., mode: 'uno', score, maxScore, 'game://uno', ...)`
  - `submissions` con `file_url = 'game://uno'`, `attempt_type = 'uno'`.
- No se pisa una entrega de otro método (`document`, `quiz4`, …): mismo criterio
  que `GameRoom.ts:1147`.
- Errores de concepto: `recordConceptErrors(..., 'uno', [concept])`.

### 3.10 Modo equipos (opcional, fase posterior)

- 4 jugadores, 2 equipos (2 y 2), asientos alternos.
- `teamId` en el jugador; color/identidad visual reutilizando `teams.ts`.
- Gana el equipo del jugador que se queda sin cartas.
- `placementPercent` de equipo = promedio de sus miembros; nota igual para los
  dos (configurable `teamGrade: 'same' | 'individual'`).
- El MVP puede ser individual; el modelo de estado ya incluye `teamId` para no
  rehacerlo después.

---

## 4. Máquina de estados

```
lobby ──start──▶ playing ──jugar +2/+4──▶ question ──resolver──▶ playing
                    │                        ▲
                    ├──robar/pasar───────────┘
                    ├──ronda par (fin de vuelta)──▶ question (periodic)
                    └──mano vacía / tope de tiempo──▶ finished
```

- `lobby`: sala abierta, jugadores se marcan `ready`, eligen color/asiento.
- `playing`: hay un turno activo, `turnDeadline` vigente.
- `question`: fase de preguntas, `questionDeadline` vigente, juego pausado.
- `finished`: resultados, repaso y nota persistidos.

Orden de resolución de un turno:

1. Validar y aplicar la carta.
2. Si es `+2`/`+4` → abrir `question` (kind `plus2`/`plus4`) y pausar.
3. Al resolver → aplicar robos → `endTurn()`.
4. `endTurn()` avanza el turno (aplicando skip/reverse) e incrementa
   `actionsThisRound`.
5. Si `actionsThisRound === activePlayers.length` → `round++`,
   `actionsThisRound = 0`; si `round % 2 === 0` → abrir `question` (`periodic`).
6. Si la mano de alguien llegó a 0 → `finished`.
7. Si no, `turn_started` con nuevo `turnDeadline`.

---

## 5. Backend

### 5.1 Lo que se reutiliza tal cual

| Pieza | Archivo |
|---|---|
| Lobby REST, códigos, rate limit, permisos, D1 | `workers/routes/game.ts` |
| WebSocket, hibernación, reconexión, espectadores | `workers/durable/GameRoom.ts` (patrón) |
| Banco de preguntas IA y caché | `workers/lib/game-questions.ts` |
| Integración de nota/modo de tarea | `workers/lib/task-progress.ts`, `task-modes.ts` |
| Tablas `game_*` | `db/game.sql` |
| Cliente WebSocket genérico | `frontend/src/lib/game.ts` |

### 5.2 Registro del tipo de juego y enrutado

1. `workers/routes/game.ts:19`: `GAME_TYPES = new Set(['ludo', 'uno'])`.
2. `RoomRow` y `getRoom()` (`game.ts:690-698`) **no** seleccionan `game_type`
   hoy. Añadirlo al `SELECT` y a la interfaz.
3. Elegir DO por tipo, tanto en `handleWebSocket` (`game.ts:657`) como en
   `callRoomAction` (`game.ts:948`):

```ts
const ns = room.game_type === 'uno' ? env.UNO_ROOM : env.GAME_ROOM;
const stub = ns.get(ns.idFromName(room.code));
```

4. Validaciones de creación (`createRoom`, `game.ts:179`):
   - `max_players` 2–4 (por defecto 4).
   - `turn_seconds` 15–120 (sugerido 30 para Uno).
   - Guardar configuración extra del Uno en una columna `config TEXT` (JSON):
     `{ roundsToWin, roundMaxMinutes, plusScope: 'others'|'next', teams: false,
     teamGrade: 'same', weights: { easy:1, medium:2, hard:3 }, grading:
     'quiz_placement' }`. Alternativa: columnas sueltas; se prefiere JSON para
     no encadenar migraciones.

### 5.3 Nuevo Durable Object `UnoRoom`

- Clase en `workers/durable/UnoRoom.ts`, exportada desde `workers/worker.ts`.
- `wrangler.toml`:

```toml
[[durable_objects.bindings]]
name = "UNO_ROOM"
class_name = "UnoRoom"

[[migrations]]
tag = "v2-uno-room"
new_sqlite_classes = ["UnoRoom"]
```

- Persistencia igual que `GameRoom`: SQLite del DO con `game_state(id=1, state)`
  y `question_pool`. El estado en vivo **nunca** va a D1.
- Reusar el patrón de `alarm()`, `webSocketMessage`, `webSocketClose`,
  `closeDuplicateSockets`, `snapshotFor`, `broadcastRoomState`.
- El motor puro (baraja, `legalPlays`, `applyPlay`, `resolvePenalties`) debe
  vivir en un módulo aparte (`workers/lib/uno-engine.ts`) sin dependencias de
  `cloudflare:workers` para poder testearlo en Node/Vitest.

### 5.4 Modelo de estado del DO

```ts
type UnoStatus = 'lobby' | 'playing' | 'question' | 'finished';
type Direction = 1 | -1;
type CardValue = '1'|'2'|'3'|'4'|'5'|'6'|'7'|'8'|'9'|'skip'|'reverse'|'plus2'|'plus4';

interface UnoCard {
  id: string;
  color: Color | null;       // null solo en +4
  value: CardValue;
}

interface UnoPlayer {
  dni: string;
  nickname: string;
  role: 'player' | 'spectator';
  teamId: string | null;
  seat: number;
  ready: boolean;
  connected: boolean;
  hand: UnoCard[];
  points: number;            // puntos mostrados (peso de quiz acertado)
  answered: boolean;
  roundWins: number;
}

interface QuestionEvent {
  kind: 'plus2' | 'plus4' | 'periodic';
  sourceDni: string | null;
  targets: string[];
  drawCount: 2 | 4 | 1;
  difficulty: 'easy' | 'medium' | 'hard';
  deadline: number;
}

interface UnoState {
  roomId: string;
  code: string;
  sectionId: string | null;
  assignmentId: string | null;
  matchId: string | null;
  gameType: 'uno';
  maxPlayers: number;
  turnSeconds: number;
  gradingMode: 'formative' | 'summative';
  status: UnoStatus;
  players: UnoPlayer[];
  deck: UnoCard[];
  discard: UnoCard[];
  activeColor: Color;
  direction: Direction;
  turnIndex: number;
  turnDeadline: number | null;
  questionDeadline: number | null;
  round: number;             // 1-based
  actionsThisRound: number;
  roundStartedAt: number;
  roundsToWin: number;
  roundMaxMinutes: number;
  config: Record<string, unknown>;
  questionEvent: QuestionEvent | null;
  pendingQuestions: Record<string, PendingQuestion>;   // por dni
  answers: Record<string, number>;                     // por dni
  quizStats: Record<string, { earned: number; possible: number; correct: number; total: number }>;
  review: Record<string, ReviewItem[]>;
  winnerDni: string | null;
  seq: number;
  version: number;
}
```

Regla de privacidad: `publicState()` **no** incluye `deck` ni `hand`; expone
`handCount` por jugador y `discardTop`. La mano completa solo se envía al dueño
en su snapshot/mensaje privado.

### 5.5 Banco de preguntas con dificultad media

Cambios en `workers/lib/game-questions.ts`:

- `export type Difficulty = 'easy' | 'medium' | 'hard';`
- Añadir `MEDIUM_TARGET` (sugerido 18), `MEDIUM_BATCH` (10) y prompt de nivel
  medio ("comprensión y aplicación directa, distractores plausibles").
- `ensureQuestionBank` devuelve `{ easy, medium, hard }` y genera el nivel que
  falte. Cambiar el único consumidor `workers/routes/game.ts:453` para sumar los
  tres niveles.
- `normalizeQuestions` no cambia; el nivel se guarda en la fila (`difficulty`).
- El `question_pool` del DO ya filtra por `difficulty` por texto; añadir el
  fallback `medium` en `takeQuestion` y **reciclar** preguntas usadas cuando el
  pool se agote (`UPDATE question_pool SET used = 0`).

Objetivos recomendados (más altos que en Ludo porque varias preguntas se
sirven a la vez):
`EASY_TARGET = 32`, `MEDIUM_TARGET = 24`, `HARD_TARGET = 20`.

### 5.6 Contrato WebSocket

Cliente → servidor:

| `type` | Payload | Validación |
|---|---|---|
| `join` | `{ nickname }` | sesión y sala ya validadas por el Worker |
| `ready` | `{}` | solo en `lobby` |
| `pick_seat` | `{ seat }` | opcional; solo en `lobby` |
| `play` | `{ cardId, color? }` | propiedad de la carta, turno, legalidad, color en `+4` |
| `draw` | `{}` | solo si no hay jugada legal o tras robar |
| `answer` | `{ id, choice }` | `status === 'question'`, pregunta del jugador, no respondida, `choice` 0–3 |
| `ping` | `{}` | — |

Servidor → cliente:

| `type` | Destino | Contenido |
|---|---|---|
| `state_snapshot` | privado | `you`, `youRole`, `youManage`, `hand`, `question?`, `state` público |
| `room_state` | broadcast | estado público (sin manos) |
| `turn_started` | broadcast | `dni`, `deadline`, `direction` |
| `card_played` | broadcast | `dni`, `card`, `activeColor`, `handCount` |
| `drew_card` | privado + público | `dni`, `card` (solo dueño), `handCount` |
| `direction_changed` | broadcast | `direction` |
| `skipped` | broadcast | `dni` |
| `question_phase_started` | broadcast | `kind`, `sourceDni`, `deadline`, `drawCount`, `difficulty` |
| `question` | privado | `id`, `question`, `options`, `difficulty`, `deadline` |
| `question_result` | privado | `correct`, `correctIndex`, `delta`, `explanation`, `concept`, `timeout?` |
| `penalty_applied` | privado + broadcast | `dni`, `drawCount`, `handCount` |
| `question_phase_end` | broadcast | `kind` |
| `round_completed` | broadcast | `round` |
| `game_over` | privado | `winner`, `review`, `stats` |
| `error` | privado | `code` (`not_your_turn`, `illegal_play`, `not_question_phase`, `already_answered`, `bad_color`, `no_questions`, `turn_timeout`, `question_timeout`, …) |

El cliente **nunca** recibe: mazo, manos ajenas, la respuesta correcta antes de
responder, ni puede elegir su pregunta. Todo se valida en el DO.

### 5.7 Seguridad y anti-trampas

- Autoridad única del DO; el motor del cliente es solo presentación.
- `play` valida: es tu turno, la carta está en tu mano, `status === 'playing'`,
  legalidad contra `activeColor`/superior, color declarado en `+4`.
- `answer` valida: fase activa, pregunta asignada a tu DNI, no respondida,
  índice 0–3.
- Sin DNI en el estado público (`p0`, `p1`… como en Ludo).
- Barajado y reparto solo en servidor (`crypto`), nunca reproducibles desde el
  cliente.
- Rate limit del Worker y cierre de sockets duplicados (`4001`) reutilizados.

### 5.8 Alarmas y reconexión

- `ensureAlarm` usa `turnDeadline` o `questionDeadline` según el estado.
- Pregunta vencida → resolver como incorrecta y aplicar robos.
- Turno vencido → robar automáticamente (si no robó) y pasar.
- Reconexión a mitad de pregunta: `snapshotFor` incluye la pregunta pendiente y
  su `deadline`; si ya respondió, incluye el resultado y espera al resto.
- Jugador que abandona: se conserva su mano; sus turnos se saltan y, si vuelve,
  retoma. Si no vuelve, se le asigna el peor `placement` pero se conserva su
  `quizPercent` para la nota.

### 5.9 Persistencia de resultados

Replicar `GameRoom.persistResults` y `applyGrades`:

- `game_matches`: `status='finished'`, `winner_dni`, `state_summary` con rondas,
  cartas y `quizPercent`.
- `game_results`: posición, `score` = `finalPercent`, `xp=0`.
- `game_rooms.status = 'finished'`.
- Si hay `assignment_id`: `recordTaskModeResult` + `submissions` con
  `game://uno` y `attempt_type='uno'`.

---

## 6. Modelo de datos (D1)

`db/game.sql` y `GAME_DDL` de `workers/routes/game.ts`:

- `game_rooms.game_type` ya existe; solo se añade `'uno'` al set permitido.
- Nueva columna idempotente `config TEXT` en `game_rooms` (JSON de opciones).
  Incluir el `ALTER TABLE` en la lista de `ensureGameTables`.
- `game_question_bank.difficulty` ya es `TEXT`: admite `medium` sin migración.
- No se necesitan tablas nuevas: se reutilizan `game_players`, `game_matches`,
  `game_results`, `game_moves` (si se quiere registrar cada jugada) y
  `game_question_bank`.

Modo de tarea (`workers/lib/task-modes.ts`):

- Añadir `'uno'` a `TASK_MODES` y a `TASK_MODE_LABELS`
  (`'Uno educativo'`).
- `ClassroomDetailsPage.vue`: incluir `uno` en `TaskMethod`, en el grupo
  `Multijugador` (`modes: ['ludo', 'uno']`) y en la tarjeta/acción
  `openUno()` análoga a `openLudo()` (`ClassroomDetailsPage.vue:896-911`).
- Decisión: `uno` es un modo distinto de `ludo`, así que cuenta por separado en
  los 4 modos obligatorios. Si se prefiere que ambos juegos cuenten como un solo
  "multijugador", usar un solo modo y distinguir por `attempt_type`; documentar
  la elección final.

---

## 7. Frontend

### 7.1 Lobby (`frontend/src/pages/GameLobbyPage.vue`)

- Selector de juego (`Ludo` / `Uno-like`) y título dinámico.
- Enviar `game_type` en `POST /api/game/rooms` (`GameLobbyPage.vue:318`).
- Mostrar el tipo en la lista de salas y ajustar textos de configuración
  (`max_players`, `turn_seconds`).
- Mantener el mismo flujo de crear/unirse/iniciar/cancelar.

### 7.2 Página de partida

- Nueva `frontend/src/pages/UnoRoomPage.vue` (no reescribir las 2358 líneas de
  `GameRoomPage.vue`).
- Enrutado: la ruta `game/:code` recibe primero el `state_snapshot`; si
  `state.gameType === 'uno'`, renderizar/cargar `UnoRoomPage`; si es `ludo`,
  seguir con `GameRoomPage`. Alternativa: preflight `GET` al DO para decidir el
  componente antes de montar.
- Reutilizar `GameSocket` de `frontend/src/lib/game.ts` y ampliar los tipos
  (`UnoState`, `UnoCard`, `QuestionEvent`, mensajes nuevos, y
  `Difficulty` con `'medium'`).

Elementos de la interfaz:

- Mesa con los rivales: apodo, `handCount`, indicador de turno, conexión.
- Descarte superior grande con color activo visible.
- Mazo con contador; botón **Robar** (deshabilitado si hay jugada legal).
- Mano del jugador en abanico; cartas legales resaltadas.
- Selector de color al jugar `+4`.
- Indicador de sentido de giro (flechas).
- Contador de ronda y aviso "pregunta en la ronda 2".
- Temporizador de turno.
- Modal de pregunta con cuenta atrás de 30 s, 4 opciones y feedback con
  explicación y concepto.
- Pantalla de fin con repaso de falladas (`ReviewItem`) y nota/porcentaje.
- Vista de espectador: sin mano, sin preguntas, solo mesa y resultados.

Accesibilidad y estilo:

- Color + símbolo/texto en cada carta (no depender solo del color).
- `aria-live` para cambios de turno y resultados.
- Reutilizar `teams.ts` para colores/avatares y el tema visual existente.
- Responsive: mano con scroll horizontal en móvil.

---

## 8. Casos borde (obligatorio cubrirlos)

1. **Sin jugadas legales** y mazo vacío: barajar el descarte (menos la superior);
   si sigue vacío, el turno pasa sin robar.
2. **`reverse` con 2 jugadores**: equivale a `skip`.
3. **`+4` sin color declarado**: el servidor rechaza (`bad_color`).
4. **Última carta es `+2`/`+4`**: la ronda termina; no se abren preguntas.
5. **Pregunta de carta seguida de pregunta de ronda par**: primero la de carta,
   luego la periódica; nunca simultáneas.
6. **Timeout de pregunta**: incorrecta; aplica robo y sigue.
7. **Desconexión en turno/pregunta**: el `alarm` resuelve; al volver, snapshot
   con mano y pregunta/deadline.
8. **Sala llena o partida iniciada**: mismas respuestas 409 del lobby actual.
9. **Banco de preguntas insuficiente**: reciclar; si no hay ninguna, cerrar el
   evento sin penalizar y avisar (`no_questions`).
10. **Jugador expulsado a mitad**: su mano vuelve al fondo del mazo, se saltan
    sus turnos; conserva estadísticas de quiz ya obtenidas.
11. **Dos pestañas**: cierre del socket anterior con `4001`.
12. **Reloj del cliente desfasado**: la cuenta atrás usa el `deadline` del
    servidor, nunca `Date.now()` local como autoridad.

---

## 9. Plan de implementación por fases

| Fase | Entregable | Estimación |
|---|---|---|
| 0 | Cerrar decisiones de §10 y crear el tipo `game_type='uno'` | 0.5 día |
| 1 | `uno-engine.ts` puro + tests (baraja, legalidad, efectos, rondas) | 3–4 días |
| 2 | `UnoRoom` DO + protocolo WS + alarmas + reconexión | 4–5 días |
| 3 | `medium` en `game-questions.ts` y reciclado del pool | 1 día |
| 4 | `UnoRoomPage.vue` + lobby con selector | 4–6 días |
| 5 | Nota: modo `uno`, `recordTaskModeResult`, `submissions`, repaso | 1–2 días |
| 6 | Equipos 2v2, pulido, accesibilidad, pruebas E2E | 3–5 días |

**MVP (fases 0–5): ~3–4 semanas** para 1 dev. Equipos y pulido, +1 semana.

### Criterios de aceptación

- Una partida completa de 2–4 jugadores termina sin estados inconsistentes.
- `+2`/`+4`/ronda par abren preguntas de la dificultad correcta y solo a quien
  corresponde; el acierto evita las cartas y el fallo/timeout las aplica.
- 30 s respetados en servidor; sin respuesta = incorrecta.
- Reconexión a mitad de turno o de pregunta restaura mano, estado y deadline.
- El cliente no puede ver manos ajenas ni la respuesta correcta antes de tiempo.
- La nota se guarda con `game://uno` y no pisa otros métodos.
- Ludo sigue funcionando sin cambios (regresión cero).

---

## 10. Pruebas

- **Unitarias del motor** (`uno-engine`):
  - baraja con 100 cartas y composición exacta;
  - `legalPlays` por color, número, acción y `+4`;
  - `reverse` en 2 y 4 jugadores; `skip`;
  - resolución de `plus2`/`plus4`/`periodic` (acierto, fallo, timeout);
  - conteo de ronda par;
  - reciclado de mazo.
- **Integración del DO**:
  - snapshot con mano privada y estado público sin manos;
  - reconexión con pregunta pendiente y ya respondida;
  - sockets duplicados;
  - espectador no recibe preguntas ni mano;
  - timeout de turno y de pregunta vía `alarm`.
- **Nota**: formativo sin score; sumativo conserva la mejor marca; no pisa otros
  `attempt_type`.

---

## 11. Decisiones abiertas (con valor por defecto ya elegido)

1. **Alcance de +2/+4**: por defecto `others` (todos los demás), configurable a
   `next`. Si se busca un Uno más clásico, cambiar a `next`.
2. **Modo de tarea**: por defecto `uno` como modo independiente de `ludo`.
   Alternativa: un único modo "multijugador".
3. **Nota**: por defecto 70 % quiz + 30 % posición. Alternativa: solo quiz.
4. **Equipos**: MVP individual; equipos en fase 6. Si el aula exige 2v2 desde el
   inicio, adelantar el modelo `teamId` (ya previsto en el estado).
5. **Duración**: 1 ronda por defecto para que quepa en una sesión de clase; tope
   de 15 min.

Si alguna de estas cinco se cambia, afecta sobre todo a §3.9, §3.10 y §6; el
resto del plan se mantiene.

---

## 12. Checklist de archivos a tocar

| Archivo | Cambio |
|---|---|
| `workers/routes/game.ts` | `GAME_TYPES += 'uno'`; `getRoom`/`RoomRow` con `game_type`; enrutar a `UNO_ROOM`; `config` en `createRoom`; validar banco con 3 niveles |
| `workers/durable/UnoRoom.ts` | **nuevo** DO del juego |
| `workers/lib/uno-engine.ts` | **nuevo** motor puro testeable |
| `workers/lib/game-questions.ts` | `Difficulty += 'medium'`; targets/batches; `ensureQuestionBank` con 3 niveles |
| `workers/lib/task-modes.ts` | `'uno'` en `TASK_MODES` y etiqueta |
| `workers/worker.ts` | exportar `UnoRoom` |
| `wrangler.toml` | binding `UNO_ROOM` + migración `v2-uno-room` |
| `db/game.sql` | columna `config TEXT` en `game_rooms` (idempotente) |
| `frontend/src/lib/game.ts` | tipos Uno, `Difficulty` con `medium`, mensajes nuevos |
| `frontend/src/pages/UnoRoomPage.vue` | **nuevo** tablero de Uno |
| `frontend/src/pages/GameLobbyPage.vue` | selector de juego y `game_type` |
| `frontend/src/pages/ClassroomDetailsPage.vue` | acción/tarjeta `uno` (junto a `ludo`) |
| `frontend/src/router/routes.ts` | reutiliza `game/:code`; ramifica por `gameType` |
| Tests | `uno-engine` puro + integración DO + nota |

---

## 13. Relación con los documentos existentes

- `juego-cartas.md`: viabilidad, reutilización y riesgos. Este documento
  concreta el "Uno-like" que allí se menciona como opción.
- `multijugador.md`: protocolo, seguridad, costos y fases. El Uno-like sigue sus
  reglas de oro (DO autoritativo, estado en vivo fuera de D1, cliente sin
  autoridad).
- `ludo.md` / `GameRoom.ts`: referencia de motor puro, preguntas, repaso y
  calificación que se replica aquí.
