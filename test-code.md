# Reto con tests

Especificación del cuarto tipo de actividad para el módulo "Hacer Tarea": un reto de código que se ejecuta y se califica con pruebas automatizadas.

> Es el único tipo que **ejecuta código**, y por eso es el que cambia la arquitectura.

---

## 1. Modelo de datos

Ya existen `assignments`, `submissions` (`attempt_type`, `score`, `feedback`) y `activity_sets` / `activity_attempts`. Faltaría:

- Guardar el enunciado + código inicial + casos de prueba **ocultos** (nunca enviarlos al frontend).
- Guardar por intento: código enviado, resultado por test, errores de compilación y tiempos.
- Versionar el reto (si cambian los tests, no romper intentos previos).

---

## 2. Ejecución: el punto crítico

Un Worker **no puede** ejecutar código arbitrario de forma segura. Hay tres caminos:

### HTML / CSS / JS (el más fácil)

- Renderizar en un `iframe sandbox` (`srcdoc`) sin acceso a red ni al host.
- Validar con asserts de DOM/JS vía `postMessage`.
- Si se corre en el navegador es barato pero **hackeable** (el alumno ve los tests). Para sumativo, la validación debe ocurrir en un entorno confiable (servicio con navegador headless), no en el cliente.

### Python

- **Pyodide (WASM en el navegador)**: ejecuta sin backend, latencia baja, costo cero. Igual que HTML: apto para formativo, no para examen anti-fraude.
- **Contenedor / sandbox remoto**: confiable, permite tests ocultos. Aquí entra **Cloudflare Containers/Sandbox** o un juez externo.

### C++

- Obligatoriamente contenedor con `g++` / `clang` (build + run), límites de tiempo y memoria.
- Opciones: Cloudflare Containers, o un juez tipo **Judge0 / Piston**.
- Es el de mayor costo, cold starts y complejidad.

---

## 3. Seguridad del sandbox

Si se usa contenedor, se necesita sí o sí:

- Sin red, sin acceso al filesystem del host, usuario no-root.
- Límite de CPU, memoria, tiempo y tamaño de salida.
- Aislamiento efímero por ejecución y limpieza.
- Nunca montar secretos ni la base de datos.
- Timeout de compilación separado del de ejecución.

---

## 4. Calificación

- Tests **ocultos** con puntos por caso (parcial) o todo-o-nada.
- Distinguir: error de compilación / timeout / salida incorrecta / excepción.
- Feedback al alumno solo al entregar (no exponer los casos).
- Anti-abuso: límite de intentos, bloqueo de método, tests aleatorizados por alumno.

---

## 5. Frontend

- Editor de código (CodeMirror o Monaco) con resaltado por lenguaje.
- Selector de lenguaje (según la tarea).
- Panel de ejecución/salida, estado "compilando/ejecutando", errores legibles.
- Resultado por test (visible) sin revelar el input completo.
- Autoguardado del borrador.

---

## 6. Generación de contenido

- La IA puede generar enunciado, esqueleto y casos de prueba.
- Los tests deben ser **deterministas** y, idealmente, revisados por el docente.
- Para ejercicios de predicción de salida, ejecutar el código de referencia para obtener la respuesta canónica, no preguntársela al modelo.

---

## 7. Costos y operación

- Workers gratis no alcanza para ejecución arbitraria; contenedores tienen costo por tiempo y cold start.
- Se necesita cola/timeout y límites por usuario para evitar abuso.
- Latencia de compilación C++ puede ser de segundos.

---

## 8. Recomendación de implementación por fases

1. **HTML con iframe sandbox** (rápido, sin infraestructura) — modo formativo.
2. **Python con Pyodide** (sin backend) — formativo.
3. **Sandbox confiable** (Cloudflare Containers o Judge0) para Python y C++ en modo sumativo.

---

## 9. Decisiones pendientes

- ¿Los retos serán **formativos** (reintentos, ejecución en cliente) o **sumativos** (sandbox confiable)?
- ¿Empezar por **HTML** o por **Python**?
- ¿Se acepta el costo/operación de un sandbox (Containers / Judge0) o solo ejecución en navegador por ahora?

Con esas tres respuestas se define exactamente qué piezas tocarían en el backend y el frontend.
