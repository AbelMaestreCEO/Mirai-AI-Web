# Requisitos para juegos multijugador en tiempo real (Ludo y derivados)

Documento de requisitos y plan técnico. No incluye código: define qué hace falta, cómo encaja en la infraestructura actual y qué decisiones hay que tomar antes de implementar.

---

## 1. Objetivo y alcance

Implementar juegos multijugador por turnos dentro del ecosistema Mirai, empezando por **Ludo** para secciones del Aula Virtual, con competitividad entre estudiantes y automatización con IA.

Alcance de la primera versión:

- Partidas de 2 a 4 jugadores por sala.
- Juego por turnos (no requiere latencia de videojuego de acción).
- Sala creada por un docente o por un estudiante habilitado, asociada a una sección.
- Ingreso por código o QR.
- Estado autoritativo en servidor (sin trampas de dados ni movimientos).
- Reconexión y espectadores.
- Resultados e historial; opción de alimentar participación/nota.
- Banco de preguntas generado por IA una sola vez por tarea o tema.

Fuera de alcance inicial:

- Voz/video en vivo (no se necesita WebRTC ni Cloudflare Calls).
- Juegos en tiempo real continuo (tipo shooter o carreras).
- Chat libre sin moderación para menores.
- Torneos masivos o matchmaking global.

---

## 2. Situación actual de la infraestructura

| Pieza | Estado actual | Implicación para el juego |
|---|---|---|
| Worker principal | `workers/worker.ts` con `fetch` + `scheduled` | Hay que exportar además la clase del Durable Object |
| Router | `workers/router.ts` | Se añaden rutas REST de lobby y resultados |
| D1 | `MIRAI_AI_DB` | Lobby, historial y resultados; no debe usarse como bus de estado en vivo |
| R2 | `MIRAI_AI_ASSETS`, `MIRAI_PHOTOS` | Avatares o assets opcionales |
| KV | `KV_RATE` | Rate limiting |
| IA | DeepSeek vía `workers/lib/ai.ts` (`AI_MODEL_NORMAL`) | Solo para banco de preguntas, no por jugada |
| Realtime actual | Polling a `/api/sync/poll` cada 5 s (`frontend/src/lib/realtime.ts`) | No sirve para el juego: latencia y consumo de D1 |
| Durable Objects | **No configurados** (`wrangler.toml` lo indica expresamente) | Es la pieza que hay que añadir |
| WebSockets | No usados | Se implementan dentro del Durable Object |
| Auth | Cookie de sesión + `requireAuth` | Se valida antes de abrir el WebSocket |
| Roles | `student`, `teacher`, `admin`; tabla `professors` | El docente crea/administra salas |
| Aula | `sections`, `section_students`, `assignments`, `submissions` | Integración de salas y resultados |

Conclusión: la plataforma **sí permite** el multijugador, pero requiere incorporar **Durable Objects con WebSocket Hibernation API**. No hace falta contratar otro servicio.

---

## 3. Arquitectura propuesta

### 3.1 Piezas

- **`GameRoom` (Durable Object)**: una instancia por partida. Guarda tablero, turnos, dados, jugadores, estado de conexión y reglas. Es la única autoridad.
- **WebSocket Hibernation API**: canal de push hacia los clientes. Sin hibernación, la duración del DO se cobra durante toda la conexión.
- **D1**: fuente de verdad del lobby, miembros, configuración de sala, historial, resultados y banco de preguntas.
- **KV**: límites de creación de salas y de ingreso.
- **R2**: avatares o imágenes de sala (opcional).
- **IA**: generación y cacheo del banco de preguntas.

### 3.2 Flujo

1. El docente crea una sala desde una sección; D1 guarda `game_rooms`.
2. El estudiante ingresa con código/QR; D1 valida pertenencia a la sección.
3. El Worker autentica y enruta al `GameRoom` de esa partida.
4. El DO mantiene el estado y difunde cada jugada por WebSocket.
5. Al terminar, el DO escribe el resultado en D1 y se puede cerrar la instancia.
6. Si se usa como actividad, el resultado puede registrarse en `submissions` o en una tabla de participación.

### 3.3 Regla de oro

Cliente propone, servidor decide. Dados, movimientos legales, capturas, turnos y condición de victoria se calculan en el DO. El cliente solo dibuja el estado recibido.

---

## 4. Prerrequisitos técnicos (lo que hay que añadir)

### 4.1 Configuración de Cloudflare

- [ ] Añadir binding de Durable Objects en `wrangler.toml`.
- [ ] Añadir migración con `new_sqlite_classes` (en plan Free solo se permite SQLite).
- [ ] Exportar la clase del DO desde `workers/worker.ts` (el módulo principal debe exportarla).
- [ ] Verificar que `compatibility_date` actual (`2024-01-01`) es compatible; no se requiere `nodejs_compat`.
- [ ] Actualizar tipos (`workers/env.d.ts` o `worker-configuration.d.ts` regenerado) con el namespace del DO.
- [ ] Confirmar que el despliegue de `mirai-assistant` sigue funcionando (binding de servicio existente).

Ejemplo conceptual de configuración (no es código final):

```toml
[[durable_objects.bindings]]
name = "GAME_ROOM"
class_name = "GameRoom"

[[migrations]]
tag = "v1-game-room"
new_sqlite_classes = ["GameRoom"]
```

### 4.2 Backend

- [ ] Clase `GameRoom` con estado en memoria + SQLite del DO.
- [ ] WebSocket Hibernation API (`acceptWebSocket`, `webSocketMessage`, `webSocketClose`, `webSocketError`).
- [ ] `alarm()` para timeout de turno, expulsión por desconexión y limpieza.
- [ ] Rutas REST: crear sala, listar salas, unirse, salir, iniciar, consultar resultado.
- [ ] Validación de sesión antes de aceptar el upgrade a WebSocket.
- [ ] Escritura de resultados en D1.
- [ ] Rate limiting con `KV_RATE`.
- [ ] Registro de auditoría de jugadas (opcional pero recomendado).

### 4.3 Frontend

- [ ] Página de lobby (crear/unirse, listar salas de la sección).
- [ ] Página de partida con tablero, turnos, dados, jugadores y chat moderado (opcional).
- [ ] Cliente WebSocket con reconexión exponencial y snapshot completo al reconectar.
- [ ] Indicador de conexión y de turno.
- [ ] Soporte móvil y de teclado.
- [ ] Ruta nueva en `frontend/src/router/routes.ts`.
- [ ] **No usar el polling de 5 s dentro del juego.**

### 4.4 Pruebas y operación

- [ ] Pruebas unitarias del motor de reglas (puro, sin DO).
- [ ] Pruebas de integración del DO (varias conexiones simultáneas).
- [ ] Prueba de reconexión y de caída de un jugador.
- [ ] Prueba de carga con varias salas concurrentes.
- [ ] Prueba de trampas (dados manipulados, movimientos ilegales, doble turno).
- [ ] Verificación de consumo real en el panel de Cloudflare.

---

## 5. Requisitos funcionales

### 5.1 Lobby y salas

- [ ] Crear sala desde una sección del Aula Virtual.
- [ ] Código de sala corto, no adivinable, con expiración.
- [ ] Ingreso por código o QR.
- [ ] Validar que el estudiante pertenece a la sección (o que el docente lo autorizó).
- [ ] Configurar: número de jugadores (2-4), tiempo por turno, preguntas sí/no, modo de victoria.
- [ ] Lista de jugadores con estado listo/no listo.
- [ ] Inicio solo cuando todos estén listos o cuando el docente lo ordene.
- [ ] Espectadores (docente y estudiantes no jugadores).
- [ ] Cancelar sala y expulsar jugadores (docente).

### 5.2 Partida de Ludo

- [ ] Tablero de 4 colores, 4 fichas por jugador.
- [ ] Dados generados exclusivamente en el servidor.
- [ ] Validación de movimientos legales (salida de base, avance, captura, seguro, meta).
- [ ] Turnos estrictos; no se puede jugar fuera de turno.
- [ ] Captura y reglas de casa/seguro.
- [ ] Condición de victoria y ranking de los demás jugadores.
- [ ] Timeout de turno configurable (p. ej. 30-45 s) con jugada automática o pase.
- [ ] Abandono: el jugador queda inactivo y la partida continúa o finaliza según configuración.
- [ ] Pausa/reanudación por el docente.
- [ ] Reinicio de partida con confirmación.

### 5.3 IA y preguntas

- [ ] Banco de preguntas generado una sola vez por tarea/tema y cacheado.
- [ ] Preguntas con dificultad, respuesta correcta y explicación.
- [ ] Casillas de pregunta opcionales: acertar da bonus, fallar no bloquea la partida.
- [ ] Si la IA falla, la partida debe continuar sin preguntas (degradación elegante).
- [ ] No llamar a la IA por jugada ni por turno.

### 5.4 Social y competitividad

- [ ] Apodo y avatar por jugador.
- [ ] Chat de sala moderado o desactivado por defecto.
- [ ] Emotes predefinidos (opcional).
- [ ] Marcador, racha y XP.
- [ ] Historial de partidas por estudiante y por sección.
- [ ] Ranking de sección (opcional).
- [ ] Integración con participación o nota (decisión pendiente).

### 5.5 Integración con el Aula Virtual

- [ ] Sala ligada a `section_id` y `professor_dni`.
- [ ] Resultados visibles para el docente.
- [ ] Opción de registrar el resultado como participación o como `submission` de una tarea.
- [ ] Notificaciones push al iniciar una sala o al ser invitado (reutilizar `workers/lib/push.ts`).

---

## 6. Requisitos no funcionales

| Requisito | Objetivo |
|---|---|
| Latencia por jugada | < 300 ms en red normal; p95 < 1 s |
| Jugadores por sala | 2-4 jugadores + espectadores |
| Salas concurrentes | Definir objetivo (recomendado: 50-200 por institución) |
| Disponibilidad | La partida sobrevive a desconexiones de clientes; el DO mantiene el estado |
| Reconexión | Recuperar estado en menos de 2 s con snapshot |
| Seguridad | Servidor autoritativo, sin confianza en el cliente |
| Privacidad | Sin datos personales en el estado público; apodos |
| Menores | Chat moderado/desactivado, sin geolocalización ni datos sensibles |
| Accesibilidad | Navegación por teclado, contraste, textos alternativos |
| Móvil | Tablero usable en pantallas pequeñas y en la app Android |
| Idiomas | Español inicial; textos centralizados |

---

## 7. Modelo de datos propuesto (D1)

Tablas nuevas, idempotentes, sin tocar las existentes:

| Tabla | Campos principales | Uso |
|---|---|---|
| `game_rooms` | `id`, `code`, `section_id`, `professor_dni`, `game_type`, `max_players`, `turn_seconds`, `status`, `created_at`, `expires_at` | Lobby y configuración |
| `game_players` | `room_id`, `user_dni`, `nickname`, `avatar_key`, `role`, `status`, `joined_at` | Miembros y espectadores |
| `game_matches` | `id`, `room_id`, `status`, `started_at`, `finished_at`, `winner_dni`, `state_summary` | Partida y resumen |
| `game_results` | `match_id`, `user_dni`, `position`, `score`, `xp`, `created_at` | Resultados y ranking |
| `game_moves` | `id`, `match_id`, `user_dni`, `move_index`, `payload`, `created_at` | Auditoría y repetición |
| `game_question_bank` | `id`, `assignment_id`, `topic`, `payload`, `created_at` | Preguntas generadas por IA |

Estado interno del DO (no en D1):

- Tablero y posiciones.
- Turno actual y orden.
- Dados y última jugada.
- Estado de conexión por jugador.
- Temporizador del turno.
- Semilla/versión del estado para idempotencia.

---

## 8. Contratos de API

### 8.1 REST (lobby y resultados)

| Método | Ruta | Función |
|---|---|---|
| `POST` | `/api/game/rooms` | Crear sala (docente o autorizado) |
| `GET` | `/api/game/rooms?section_id=` | Listar salas de una sección |
| `POST` | `/api/game/rooms/:code/join` | Unirse a una sala |
| `POST` | `/api/game/rooms/:code/leave` | Salir de la sala |
| `POST` | `/api/game/rooms/:code/start` | Iniciar partida (docente) |
| `POST` | `/api/game/rooms/:code/cancel` | Cancelar sala |
| `GET` | `/api/game/matches/:id` | Consultar resultado e historial |
| `GET` | `/api/game/my-history` | Historial del estudiante |

### 8.2 WebSocket

Endpoint: `/api/game/rooms/:code/ws` (autenticado por cookie; el Worker valida y reenvía al DO).

Mensajes cliente → servidor:

- `join` (si no se hizo por REST)
- `ready`
- `roll` (pedir dado)
- `move` (ficha y destino)
- `chat` (si está habilitado)
- `ping`

Mensajes servidor → cliente:

- `state_snapshot` (estado completo al conectar/reconectar)
- `room_state` (jugadores, listos, espectadores)
- `turn_started`
- `dice_result`
- `move_applied`
- `question` / `question_result` (si aplica)
- `game_over`
- `error`
- `pong`

Reglas del protocolo:

- Cada mensaje lleva `seq` o `version` para descartar duplicados.
- El servidor ignora mensajes de jugadores que no están en turno.
- El cliente nunca envía el resultado del dado.
- Reconexión: el servidor envía `state_snapshot` completo, no un delta.

---

## 9. Seguridad y anti-trampas

- [ ] Validación de sesión antes del upgrade a WebSocket.
- [ ] Verificación de pertenencia a la sección en cada ingreso.
- [ ] Dados y reglas solo en el servidor.
- [ ] Validación de legalidad de cada movimiento.
- [ ] Límite de mensajes por jugador (rate limit).
- [ ] Códigos de sala con suficiente entropía y expiración.
- [ ] Una sala activa por usuario (configurable).
- [ ] Registro de jugadas para auditoría y disputas.
- [ ] Sin chat libre para menores; lista de palabras y moderación si se habilita.
- [ ] Sin exponer DNI en el estado público (usar apodo o id interno).
- [ ] Protección contra reconexión duplicada (una conexión activa por jugador).

---

## 10. Costos y límites en Cloudflare

Tarifas oficiales vigentes (referencia):

| Recurso | Free | Paid ($5/mes mínimo) |
|---|---|---|
| Workers | 100k peticiones/día | 10M/mes + $0.30/M |
| Durable Objects (peticiones) | 100k/día | 1M/mes + $0.15/M |
| Durable Objects (duración) | 13,000 GB-s/día | 400k GB-s/mes + $12.50/M |
| D1 | 5M filas leídas/día, 100k escritas/día, 5 GB | 25B leídas/mes, 50M escritas/mes, 5 GB |
| DO storage SQLite | 5 GB total | 5 GB incluidos + $0.20/GB-mes |

Puntos clave:

- Los mensajes WebSocket **entrantes** se cobran con ratio 20:1; los **salientes** son gratis.
- La **hibernación es obligatoria** para que el costo sea bajo: sin ella se paga duración durante toda la conexión.
- El polling actual de 5 s es el mayor consumidor de cuota; el juego debe usar WebSocket y no polling.
- Estimación realista (200 estudiantes, 50 partidas de 20 min al día): cientos de peticiones y decenas de GB-s diarios. Cabe en el plan Free si el resto de la app no agota la cuota; en Paid queda dentro del mínimo de $5/mes.
- El costo variable real será la IA (DeepSeek), no la infraestructura del juego, y solo si se generan preguntas nuevas.

---

## 11. Plan de implementación por fases

### Fase 0: decisiones y preparación

- [ ] Confirmar plan Cloudflare (Free o Paid).
- [ ] Confirmar número de jugadores y salas concurrentes objetivo.
- [ ] Confirmar si el chat estará habilitado.
- [ ] Confirmar si los resultados cuentan para nota o solo participación.
- [ ] Confirmar origen de las preguntas (tarea, tema libre o banco fijo).
- [ ] Definir retención de datos y consentimiento para menores.

### Fase 1: MVP de Ludo

- [ ] Durable Object con estado y reglas.
- [ ] WebSocket con snapshot y reconexión.
- [ ] Lobby mínimo (crear, unirse por código, iniciar).
- [ ] Tablero 2-4 jugadores.
- [ ] Resultado guardado en D1.
- [ ] Pruebas de reglas y de trampas.

### Fase 2: integración con Aula Virtual

- [ ] Salas por sección y QR.
- [ ] Panel del docente (crear, ver, cancelar, espectar).
- [ ] Historial y participación.
- [ ] Notificaciones push.

### Fase 3: IA y competitividad

- [ ] Banco de preguntas generado y cacheado.
- [ ] Casillas de pregunta.
- [ ] XP, rachas y ranking.
- [ ] Modos de juego adicionales reutilizando el mismo motor.

### Fase 4: endurecimiento

- [ ] Rate limiting y límites de sala.
- [ ] Auditoría y repetición de partidas.
- [ ] Pruebas de carga y de caos.
- [ ] Accesibilidad y pulido móvil.

---

## 12. Criterios de aceptación

- [ ] Un docente crea una sala y 4 estudiantes ingresan sin errores.
- [ ] Una partida completa termina y el resultado queda en D1.
- [ ] Un jugador que pierde conexión puede volver y continuar.
- [ ] Es imposible manipular dados o jugar fuera de turno desde el cliente.
- [ ] Dos partidas simultáneas no comparten estado.
- [ ] El polling de 5 s no se usa en la página de juego.
- [ ] El consumo diario medido entra en el plan contratado.
- [ ] `npm run typecheck`, build de frontend y despliegue en dry-run pasan.
- [ ] Documentación de la API y del protocolo WS disponible.

---

## 13. Decisiones pendientes (necesarias antes de programar)

1. ¿Plan Cloudflare actual y disposición a subir a Paid ($5/mes) si hace falta?
2. ¿Cuántos jugadores por sala y cuántas salas simultáneas se esperan?
3. ¿El chat estará habilitado? ¿Moderado por IA o solo emotes?
4. ¿Los resultados cuentan para nota, participación o solo diversión?
5. ¿Las preguntas salen de una tarea del Aula, de un tema libre o de un banco fijo?
6. ¿El docente puede espectar y pausar la partida?
7. ¿Qué pasa si un jugador abandona: se reemplaza por IA, se salta o termina la partida?
8. ¿Se requiere ranking por sección o global?
9. ¿Retención de historial y política de privacidad para menores?
10. ¿Se reutiliza el mismo motor para otros juegos por turnos?

---

## 14. Resumen ejecutivo

El multijugador con Ludo es viable en la infraestructura actual de Cloudflare. Lo que falta no es un servicio nuevo ni un plan caro, sino añadir **Durable Objects con WebSocket Hibernation API** y mover el estado en vivo fuera de D1. El costo esperado es prácticamente cero dentro del plan Free o del mínimo de $5/mes en Paid; el gasto variable relevante será la generación de preguntas con IA, que se puede cachear y ejecutar una sola vez por tarea. El mayor riesgo no es económico: es de diseño, si se intenta reutilizar el polling actual o si el cliente tiene autoridad sobre dados y movimientos.
