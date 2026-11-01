# Análisis del tablero Ludo (`ludo.jpg`)

## Estructura detectada en la imagen
- Tablero de **15 × 15** casillas.
- 4 bases (patios) de **6 × 6** en las esquinas: verde (arriba-izq.), amarillo (arriba-der.), rojo (abajo-izq.), azul (abajo-der.).
- Cada base tiene un patio interior de 2 × 2 casillas blancas donde esperan las fichas.
- Centro de 3 × 3 dividido en 4 triángulos (uno por color) = la **meta**.

## Casillas del recorrido
| Zona | Casillas |
|---|---|
| Circuito común (anillo exterior, compartido por los 4 jugadores) | **52** |
| Pasillo de meta de cada color (columna/colored row) | **5** |
| Centro / meta (triángulo de color) | 1 |

## Respuesta
- El **circuito común** por el que avanzan todas las fichas tiene **52 casillas**.
- Cada ficha recorre **57 casillas** en total antes de llegar a la meta:
  **52** del circuito + **5** del pasillo de su color.
- Si se cuenta también la casilla de salida como ocupada y el triángulo central como meta, el camino completo son **58 posiciones** (57 movimientos).

> Nota: el tablero de la imagen es un Ludo estándar (15×15, bases 6×6, 5 casillas de pasillo), por lo que el total de 52 + 5 = 57 coincide con el recorrido clásico.
