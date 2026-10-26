# Memoria por proceso (RAM) — medida y primeras reducciones

- **Fecha**: 2026-10-26
- **Máquina**: Windows, Electron 44, **build de producción**, ventana maximizada en un
  monitor de 3440×1440 (`devicePixelRatio` 1; 1,5 y 2 forzados con
  `--force-device-scale-factor`).
- **Escenario**: `fixtures/corpus/SalesShipment.rdlc` abierto (`report-max`). Memoria =
  `privateBytes` de `app.getAppMetrics()` por proceso, media de 2 pasadas.
- **Reproducir**: `pnpm --filter @rdlc-designer/back build` y
  `node apps/back/scripts/measure-memory.mjs [--variants …] [--scenarios …]`.

## Dónde está la memoria

Con el informe abierto y la ventana maximizada (antes de los cambios):

| Proceso            | MB      |
| ------------------ | ------- |
| GPU                | ≈ 182   |
| Renderer           | ≈ 106   |
| Main (Node + Nest) | ≈ 127   |
| Red (utility)      | ≈ 16    |
| **Total**          | **≈ 433** |

- El proceso GPU crece con el **tamaño de la ventana y el dpr²** (≈ 150 MB en 1500×950,
  ≈ 280 MB a dpr 2): son las superficies de composición de Chromium, **no** los canvas
  de Konva (6 MB en total a dpr 1).
- Rejillas de Tablix cacheadas (`cache({ pixelRatio: 2 })`): **0 en todo el corpus**
  (el umbral de 120 segmentos no se alcanza), así que no se tocaron.

## Experimento de flags de Chromium (1a)

`report-max`, dpr 1, total en MB:

| Variante                      | Total | GPU | Renderer |
| ----------------------------- | ----- | --- | -------- |
| baseline                      | 433   | 182 | 106      |
| `--disable-gpu`               | 312   | 39  | 131      |
| `--disable-gpu-compositing`   | 359   | 89  | 126      |
| `--disable-gpu-rasterization` | 453   | 200 | 107      |
| `--in-process-gpu`            | 429   | 0   | 106 (main 307) |

`--disable-gpu` ahorra ≈ 120 MB y es la única flag que lo hace de verdad. El benchmark
de arrastre (972 textboxes, ventana maximizada) sigue en **59,9 fps p50**, pero está
limitado por vsync y **no distingue** si el renderizado por CPU deja menos margen:
hay que probarlo a mano con un informe grande (zoom, scroll, arrastre) antes de
adoptarla. **No está aplicada.**

## Cambios aplicados (1b, 1c)

- **1b** — `Konva.pixelRatio` limitado a 1,5 (`lib/canvasPixelRatio.ts`, se aplica en
  `main.tsx`). Solo afecta a dpr > 1,5 (escalado de Windows 175–200 %).
- **1c** — 5 capas de Konva → 2 (`CanvasPreview`): *contenido* (zonas de página +
  papel) y *superposiciones* (marco de selección, multiselección, previsualización de
  redimensionado y marco de arrastre). Los antiguos `Layer` pasan a `Group`.

| `report-max`, total MB    | antes | después | Δ    |
| ------------------------- | ----- | ------- | ---- |
| dpr 1                     | 433   | 419     | −14  |
| dpr 1,5                   | 477   | 464     | −13  |
| dpr 2                     | 528   | 476     | −52  |
| dpr 1 + `--disable-gpu`   | 312   | 306     | −6   |
| dpr 2 + `--disable-gpu`   | 365   | 326     | −39  |

Canvas de Konva en el DOM: 6,1 → 2,4 MB (dpr 1) y 24,5 → 5,5 MB (dpr 2).

## Verificación

- `front`: typecheck, lint y 397 tests unitarios en verde.
- e2e (Playwright): 121 de 122. El que falla, «multiselección: los tiradores escalan
  todo el bloque y un undo lo revierte», **falla igual en `main` sin estos cambios**
  (el arrastre del tirador SE del bloque no redimensiona); es anterior a este trabajo.

## Sin aceleración por hardware (1a, aplicada)

`app.disableHardwareAcceleration()` en `main.ts` (se desactiva con `RDLC_ENABLE_GPU=1`).
GPU ≈ 180 → 25–38 MB; informe abierto y ventana maximizada: ≈ 419 → 304 MB.

## Fase 2 — Monaco a medida y tope del heap de V8

Escenarios (build de producción, GPU desactivada, ventana 1500×950, media de 3 pasadas;
`editor` = informe abierto + paleta Ctrl+K → `Textbox37` + Ctrl+Espacio con el
desplegable de sugerencias visible):

| Cambio                                    | Renderer `editor` | Total `editor` |
| ----------------------------------------- | ----------------- | -------------- |
| antes (`import 'monaco-editor'`)          | 193 MB            | 364 MB         |
| Monaco a medida                           | 174 MB            | 343 MB         |
| + `--max-old-space-size=256` (renderer)   | 152 MB            | 323 MB         |

- **Monaco a medida** (`lib/monacoSetup.ts`): `monaco-editor/editor/editor.api` + 15
  contribuciones elegidas a mano (sugerencias, snippets, búsqueda, plegado, multicursor,
  operaciones de línea/palabra, portapapeles, menú contextual, etc.) en lugar de
  `import 'monaco-editor'`, que registra ~80 lenguajes, los servicios de TS/CSS/HTML/JSON
  y todas las contribuciones. `out/renderer`: 28 MB / 102 ficheros → 9,5 MB / 11. Sin
  hover, parameter hints, comentar línea, enlaces, paleta F1 ni ir a línea: ningún
  proveedor los alimenta. Los CSS de codicon se importan por ruta relativa porque el
  `exports` de monaco solo mapea `*.js`. Tiempo hasta ver el editor: ≈ 400–500 ms,
  igual que antes.
- **Tope del heap** (`main.ts`, `js-flags`): llega al renderer (límite 368 MB) pero **no
  al main** (sigue en 4 GB; usa ≈ 30 MB de heap, no hay nada que acotar). En el
  benchmark de 972 textboxes maximizado: renderer ≈ 280–380 → 150–165 MB (total ≈
  500 → 330 MB); con 5000 textboxes sigue en 59,9 fps, 427 MB de renderer y 54 MB de heap
  JS, sin cierres. El heap de JS real es 20–55 MB, así que el ahorro no es del heap en sí;
  la explicación más probable (no verificada) es que con un límite menor V8 recolecta antes
  y se libera antes la memoria externa que cuelga de objetos JS (canvas, buffers).

### Verificación de la Fase 2

- `front`: lint (1 aviso previo), 397 tests unitarios en verde.
- e2e: 120 de 122 en la primera pasada. Fallos: el de multiselección (anterior, ver arriba)
  y «la alineación del párrafo se refleja en el lienzo», que leía la posición del texto
  justo tras pulsar «Aplicar» sin esperar. Sin GPU el lienzo tarda algo más en actualizarse
  (con `RDLC_ENABLE_GPU=1` pasaba 4/4; sin ella, 2/4). Se cambió esa lectura a `expect.poll`
  (8/8 después).

## Fase 2b — «las expresiones tardan en cargar»: el desenfoque del fondo de los diálogos

Síntoma: tras desactivar la GPU, los diálogos (editor de texto/expresiones, paleta) se
abren a tirones. Se midió con el diálogo «Abrir editor de texto» (6 aperturas, ventana
maximizada en 3440×1440; el tiempo hasta que el editor pinta su texto es ≈ 150–200 ms en
todos los casos, lo que cambia es la fluidez de los fotogramas durante la apertura):

| Variante                                   | Fotogramas > 33 ms | Peor fotograma | Total  |
| ------------------------------------------ | ------------------ | -------------- | ------ |
| GPU off (Monaco a medida + tope de heap)   | ≈ 45 % (de ≈ 55)   | 167–200 ms     | 365 MB |
| GPU on                                     | ≈ 6 % (de ≈ 200)   | 34–50 ms       | 697 MB |
| GPU off, **sin `backdrop-blur`**           | ≈ 10 % (de ≈ 172)  | 50–67 ms       | 364 MB |
| GPU on, **sin `backdrop-blur`**            | ≈ 3 % (de ≈ 195)   | 34–50 ms       | 585 MB |

- **No es Monaco ni el tope del heap**: con el import original de Monaco, con y sin tope,
  con GPU o sin ella, el tiempo hasta pintar el editor es el mismo (≈ 120–145 ms a
  1500×950).
- **Causa**: el fondo de los diálogos (`ui/dialog.tsx`) llevaba `backdrop-blur-xs`. Un
  desenfoque de fondo sobre toda la ventana es muy caro de componer por software, y con
  GPU asigna superficies enormes (el proceso GPU pasaba de ≈ 270 a ≈ 380 MB con un diálogo
  abierto). Se quitó el blur y se dejó el oscurecimiento (`bg-black/10`).
- Compositar por software sin más (`--disable-gpu-compositing`) tartamudea igual que
  `--disable-gpu`; la rasterización por software con compositor GPU (`--disable-gpu-rasterization`)
  fluye bien pero gasta ≈ 780 MB: no sirven como término medio.
- Flags de diagnóstico: `RDLC_ENABLE_GPU=1` (activa la GPU) y `RDLC_NO_HEAP_CAP=1` (quita el
  tope del heap).
