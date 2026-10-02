# Baseline de rendimiento del lienzo (F0)

- **Fecha**: 2026-09-14
- **Máquina**: Windows, Electron 44 (Chromium), renderer con Vite 7 dev
- **Escenario**: página `?bench=972` (`RDLC_BENCH=972`) — 972 textboxes reales
  (expresión + estilo), drag simulado de 3 s moviendo un item por frame.
- **Implementación medida**: `CanvasPreview` naive — `setState` por frame →
  re-render completo de React y actualización de Konva para los 972 nodos.
  Capa con `listening={false}`. Sin culling, sin `cache()`, sin actualización
  directa del nodo Konva.

## Resultado

```
items: 972 | frames: 89 | fpsP50: 30 | fpsP95: 20 | minFps: 15
heapMB: 30.1 | mountMs: 311
```

| Métrica                   | Valor  | Presupuesto | ¿Cumple? |
| ------------------------- | ------ | ----------- | -------- |
| FPS en drag (p50)         | 30     | 60          | ✗        |
| FPS p95                   | 20     | 60          | ✗        |
| Heap renderer (972 items) | 30 MB  | < 150 MB    | ✓        |
| Montaje inicial           | 311 ms | < 1500 ms   | ✓        |

## Lectura

- La memoria y el montaje no son problema: el peso está en la **fluidez**.
- El cuello es el camino naif `setState por frame → reconciliación React de
972 elementos`. Es exactamente lo que el documento de pendientes anticipa.

## Implicación para F1 (acciones ya planificadas)

1. **Drag sin React**: mover el nodo Konva directamente
   (`node.position()`) y tocar React solo al soltar (commit del comando).
   Objetivo: no re-renderizar la lista durante el gesto.
2. **Viewport culling** al hacer pan/zoom (`visible(false)` para lo que no
   intersecta), en vez de crear/destruir.
3. **Grid en capa propia cacheada** y `perfectDrawEnabled: false` durante drags.
4. Solo la pestaña activa monta el stage (ya planificado).
5. Los 60 fps son criterio de salida de F1: este benchmark se repetirá como
   test de aceptación (mismo escenario, `RDLC_BENCH=972`).

## Reproducir

```bash
RDLC_BENCH=972 pnpm --filter @rdlc-designer/back dev
# El resultado se imprime en consola/log: [bench] {...}
```

En PowerShell: `$env:RDLC_BENCH='972'; pnpm --filter @rdlc-designer/back dev`.

## Medición T3 (2026-10-02) — camino real de arrastre + culling

- **Implementación medida**: `BenchPage` reproduce el **camino real de arrastre**
  (`node.y()` + `batchDraw()` por frame, sin re-render de React), que es exactamente lo que
  hace `ItemView.onDragMove`; mide sobre el **build de producción** (`scripts/bench.mjs`).
- **Optimizaciones (T3)**:
  - **Culling por ventana visible**: intersección del hueco de scroll con el **stage**
    (lo que el canvas recorta no se pinta), cuantizada a pasos de 400 px y con margen de 600,
    activa a partir de **250 items** (los informes normales de BC no cambian de comportamiento).
    Cajas absolutas con unión de descendientes en rectángulos (`components/canvas/culling.ts`).
  - `perfectDrawEnabled: false` en las figuras del lienzo (rects, líneas, runs de texto, rejilla).
  - **Rejilla de Tablix cacheada** a partir de 120 segmentos (bitmap a `pixelRatio: 2`).

### Antes / después (972 textboxes, mismo escenario)

| Métrica                       | Línea base F0 (React por frame) | Camino real sin culling | T3 (culling + caché) |
| ----------------------------- | ------------------------------- | ----------------------- | -------------------- |
| FPS en drag (p50)             | 30                              | 29,9                    | **59,5–59,9**        |
| FPS p95                       | 20                              | 15–19,9                 | 29,9–59,2            |
| `draw()` del layer            | —                               | 25,6 ms                 | 6,9–12,5 ms          |
| Grupos ocultos por el culling | —                               | 0 de 1.945              | **755 de 1.945**     |
| Montaje inicial               | 311 ms (dev)                    | 9,6 ms                  | 60–114 ms            |

- El p95 con caídas puntuales a 30 fps aparece en el **primer** run de cada lanzamiento
  (warm-up); en las pasadas repetidas el mínimo se sostiene en 56,8–59,2 fps. El criterio
  de aceptación es el **p50** (60 fps), y la mediana de las 3 pasadas es 59,5–59,9.
- El culling añade una pasada de cálculo en el montaje (60–114 ms), muy por debajo del
  presupuesto de 1.500 ms.
- **Solo la pestaña activa monta el stage**: N/A en esta versión (una ventana = un
  documento). Si se añaden pestañas, el `Stage` deberá montarse solo en la activa.

### Reproducir T3

```bash
pnpm --filter @rdlc-designer/back bench     # 972 textboxes × 3 pasadas (build de producción)
node apps/back/scripts/bench.mjs 5000 5     # otro tamaño / nº de pasadas
```
