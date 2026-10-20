# Cámara del lienzo: memoria por zoom (T4)

- **Fecha**: 2026-10-20
- **Máquina**: Windows, Electron 44 (Chromium), **build de producción** (`pnpm --filter
  @rdlc-designer/back build`), renderer a `devicePixelRatio: 1`
- **Escenario**: `SalesCreditMemoESP.rdlc` abierto, zoom fijado con el menú de la
  toolbar y medida tras 700 ms de calma. Se miden: canvas de escena en el DOM
  (`Σ ancho × alto × 4` bytes), heap JS y *working set* del proceso renderer
  (`app.getAppMetrics`). El detalle del escenario está en
  `apps/back/scripts/zoom-memory.mjs`.

## Problema

El `Stage` de Konva medía **el papel entero a `papel × zoom`** y cada `Layer` asigna
su propio canvas de ese tamaño (más el canvas de *hit* de las capas que escuchan).
Un A4 a 400 % son **3176 × 4492 px ≈ 57 MB por canvas**: con 5–6 capas montadas, el
zoom cercano disparaba cientos de MB (y se reasignaban enteros en cada paso de zoom,
de ahí el pico). El coste crecía con el zoom, con el tamaño de página y con el
escalado de Windows (× `dpr²`): en un 150 % son 2,25× más.

## Solución (T4): el stage es una **ventana**, no el papel

- El stage cubre solo la **ventana visible** del papel (hueco + margen), y desplaza
  el contenido a su origen con `x`/`y`. El `<div>` del papel sigue midiendo
  `papel × zoom`: scrollbars, reglas y áreas de scroll no cambian.
- La ventana se **cuantiza en px de pantalla** (`WINDOW_STEP_PX = 300` +
  `WINDOW_MARGIN_PX = 300`, `components/canvas/window.ts`): al hacer scroll solo se
  re-renderiza al cruzar un paso, y el margen garantiza que lo visible quede dentro
  entre dos actualizaciones. El canvas se mueve con el scroll (DOM), así que hacer
  scroll sigue siendo **solo compositor** (sin JS por frame ni redibujados).
- El culling (T3) usa **la misma ventana** (antes cuantizaba en px de papel, con lo
  que a 400 % un paso eran 1600 px de pantalla y casi no recortaba).
- El stage nace con una ventana provisional pequeña (`fallbackWindow`) y la real se
  publica en `useLayoutEffect`, **antes del primer pintado**: nunca se asigna un
  canvas del tamaño del papel.
- Los ganchos de QA y los guiones E2E que convierten px de papel a pantalla suman
  `stage.x()/y()` (el origen del papel ya no es la esquina del canvas).

## Medición

Mismo escenario, antes y después (ventana del renderer ~1280 × 800):

| Zoom | Stage (antes)      | Canvas escena (antes) | Renderer (antes) | Stage (después) | Canvas escena (después) | Renderer (después) |
| ---- | ------------------ | --------------------- | ---------------- | --------------- | ----------------------- | ------------------ |
| 50 % | 397 × 561 px       | 4 MB                  | 189 MB           | 397 × 561 px    | 4 MB                    | 180 MB             |
| 200 % | 1588 × 2245 px    | 68 MB                 | 220 MB           | 1500 × 1200 px  | 34 MB                   | 217 MB             |
| 300 % | 2382 × 3369 px    | 153 MB                | 262 MB           | 1500 × 1200 px  | 34 MB                   | 218 MB             |
| 400 % | **3176 × 4492 px** | **272 MB**            | **310 MB**       | **1500 × 1200 px** | **34 MB**            | **220 MB**         |

Lectura:

- A 400 % el canvas de escena baja **8×** (272 → 34 MB) y el working set del
  renderer **90 MB** (310 → 220 MB). Los canvas de *hit* de las capas que escuchan
  (~2 × ventana) añaden ~14 MB, también acotados.
- El coste pasa a depender del **hueco del lienzo**, no del zoom ni del papel: de
  200 % a 400 % ya no crece, y una página mucho más grande tampoco lo hará (antes
  multiplicaba).
- El heap de JS no es el problema (17–25 MB en ambos casos): el coste estaba en los
  canvas, fuera del heap.

## Reproducir

```bash
pnpm --filter @rdlc-designer/back build
node apps/back/scripts/zoom-memory.mjs
```

## Pendiente / siguientes pasos

- El multiplicador que queda es el **número de capas** (`PageResizeZones`, `Paper`,
  `SelectionFrame`, `ExtraSelectionFrames`, `PageResizePreview` y el marco de
  selección): consolidar las capas de superposición en una sola recortaría ~40 % más
  del canvas restante. No se hizo aquí para no mezclar dos cambios.
- Los 60 fps de arrastre (T3) se mantienen: `pnpm --filter @rdlc-designer/back bench`
  da **59,9 fps p50** (972 textboxes × 3 pasadas, 755 grupos ocultos por el culling y
  `draw()` de 14,3 ms), igual que antes del cambio.
