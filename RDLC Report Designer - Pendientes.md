# RDLC Report Designer — Puntos pendientes (gaps del plan)

> **Sesión 2026-09-16 · 2.º bloque** — **Ctrl+K** (paleta de comandos: elementos,
> variables y acciones) y **Monaco** para las expresiones: resaltado VB-like,
> autocompletado con campos/parámetros/funciones de `<Code>`/Globals!/User! y
> funciones RDL, e inserción de variables **en la posición del cursor**.
> Verificado end-to-end con el modo QA (`RDLC_SHOT_SCRIPT` + captura).
> Lo siguiente: Tablix visual (F2) o los pendientes M1–M7; y de paso partir
> `App.tsx` (es el único aviso grande que deja `react-doctor`).

## ✨ Nuevo (3.er bloque, 2026-09-16): redimensionar con el cursor (F2, parte 1)

| Pieza | Detalle |
|---|---|
| **Tiradores de selección** | 8 tiradores (esquinas + lados) con su cursor, imán de 0,1 cm (Shift lo ignora) y vista previa del recuadro mientras se arrastra. Se ocultan para items desconocidos |
| **Items normales** | Un tirador mueve y redimensiona a la vez con **`setBounds`** (un solo paso de undo, aunque cambien posición y tamaño) |
| **Tablas (Tablix)** | Manda la **rejilla**: `resizeTable` reparte el cambio **proporcionalmente** entre columnas y filas, mueve el Tablix y sincroniza su `Width/Height` declarado. Igual que Report Builder, se coge la tabla entera y se estira desde cualquier tirador |
| **Primitivas** | `resizeColumn` / `resizeRow` (columna/fila exacta) listas para los **separadores internos** de la rejilla (siguiente paso) |
| **Byte-exactitud** | El dominio no inventa etiquetas: `Top/Left/Width/Height` que se crean al mover un item de una celda se **quitan** al deshacer, y los tags existentes vuelven a su **texto exacto** (`setNodeText`) |
| **QA** | `lib/resize.ts` con 8 tests, `setBounds` con 3 y `resizeTable` con 7 (incluye undo byte-exacto). Hooks de dev (`__rdlcSelection`, `__rdlcResizeHandle`) para guiones de captura: arrastre real verificado → `resizeTable aplicado` |

Pendiente de F2 (siguiente): **separadores internos** de la rejilla (resize de una columna/fila),
selección de celda + panel de estructura (añadir/quitar fila/columna) y **grupos de fila con totales**.

## ✨ Nuevo (2.º bloque, 2026-09-16): Ctrl+K + Monaco

| Pieza | Detalle |
|---|---|
| **Paleta Ctrl+K** | Busca **elementos del informe** (por nombre y por contenido: texto y expresiones), **variables** (campos, parámetros, funciones de `<Code>`, Globals!, User!) y **acciones** (abrir, guardar, deshacer, rehacer, insertar, propiedades, panel de variables). Al elegir un elemento lo selecciona y **lo trae a la vista** |
| **Datos de la paleta** | `lib/palette.ts` (elementos + acciones) y `lib/variables.ts` (variables, compartido con el panel). `lib/projection.ts` gana `flattenItems`/`findItemInList` y deja de triplicar recorridos |
| **Monaco** | `ExpressionEditor` (Monaco 0.56, worker empaquetado con Vite): los runs con expresión y el bloque `<Code>` VB se editan con resaltado y autocompletado; Enter/⌘⏎/blur hacen commit |
| **Lenguaje `rdlc-expr`** | Tokenizador Monarch VB-like (referencias `Fields!`, `Code.`, funciones, cadenas, comentarios) + catálogo de ~100 funciones RDL y palabras clave (`lib/expressionCatalog.ts`) |
| **Autocompletado** | Se alimenta de la proyección del informe (`setCompletionMeta`): campos, parámetros, funciones de `<Code>` (parámetros ya sin `ByVal`/`As`), Globals!, User! y funciones del estándar |
| **Inserción en el cursor** | `lib/expressionEditor.ts`: el editor registrado al enfocar (el último gana) recibe la expresión; si no hay editor, se copia al portapapeles. En un editor vacío se pega con `=`, en uno con contenido como fragmento |

Desviación consciente: el dominio `expression` vive de momento en el **front**
(`lib/expressionCatalog.ts`, `lib/monacoSetup.ts`) porque solo lo consume Monaco;
si el backend necesita validar sintaxis, el catálogo se moverá a `contracts`.

## ✨ Nuevo (1.er bloque, 2026-09-16): insertar arrastrando + menú contextual

| Pieza | Detalle |
|---|---|
| **Toolbox con drag&drop real** | Los botones de la toolbar son arrastrables (`application/x-rdlc-item`): al soltar en el lienzo el item nace **en el punto donde se suelta** (y dentro del rectángulo si se suelta sobre uno). El click sigue insertando al principio del cuerpo |
| **Hit-test del lienzo** (`lib/hit.ts`) | Función pura sobre la proyección: devuelve el item de arriba, el contenedor de inserción (rectángulo más interno) y el punto en cm relativo a ese contenedor. 7 tests |
| **Menú contextual** (radix `context-menu`) | Click derecho en el lienzo: *Insertar → Textbox/Rectángulo/Línea/Imagen* (en el punto), *Duplicar*, *Copiar*, *Cortar*, *Pegar*, *Eliminar*. El click derecho también selecciona lo que hay debajo |
| **Portapapeles en el backend** | `copy`/`cut`/`paste` como **métodos de la API** (no comandos: copiar no muta el documento). El portapapeles guarda un **clon desprendido** con el XML exacto; cada pegado clona y **renombra** el subárbol (mismo helper que duplicar). `cut` = copiar + `deleteItem` (un solo undo). La recarga externa lo descarta. 6 tests |
| **Atajos** | Ctrl+C / Ctrl+X / Ctrl+V (pegar en el cuerpo) además de los existentes Ctrl+D / Supr / flechas |
| **Posición normalizada al insertar** | `insertItem` clampa la posición a la banda (un item soltado fuera del cuerpo entra en él), igual que hace el drag |

### 🧹 Pasadas de `react-doctor` (51 → 81, 0 errores)

Corregido: refs mutadas durante el render (contadores de debug), listener global de
teclado con `useEffectEvent` (sin re-suscripción), borradores de los paneles derivados
del item en vez de efectos prop→state (ya no se pierde lo que se escribe si llega una
proyección nueva; también arregla el borrador del código VB), `aria-label` en botones
de icono y controles, `useState(() => …)` perezosos, claves por identidad en reglas y
tiradores, los `*Variants` de shadcn ya no se exportan (rompían Fast Refresh) y
**Monaco se carga en diferido** (el host se importa con `import()`; el bundle inicial
baja de 9,2 MB a 1,9 MB y Monaco vive en su chunk de 7,2 MB, además con su CSS aparte).

**Refactor estructural** (para los avisos de tamaño/complejidad, ya resueltos):
`App.tsx` pasa de ~1.100 a ~250 líneas y ahora es composición de
`useDocumentCore` (ciclo de vida del fichero: abrir/guardar/cerrar/undo/redo, eventos),
`useItemEditing` (selección, geometría, estilo, insertar/duplicar/borrar, portapapeles,
página/código, *nudge*) y `useGlobalKeys` (atajos), más `EditorToolbar`, `CanvasArea`,
`ItemPanels` y `StatusBar`. El lienzo se parte en `Paper` (papel + bandas + items),
`SelectionFrame` (marco y tiradores), `Ruler`, `ItemView` (nodo Konva y contenido por
tipo) y `bands.ts` (geometría de bandas, compartida con el hit-test). El panel de
imagen se divide en secciones y la paleta ejecuta acciones por tabla
(`paletteRunner`), sin `switch`.

**Pendiente del doctor** (2 avisos, ambos revisados y aceptados):
- `no-adjust-state-on-prop-change` en el marco de selección del lienzo: se mide del
  nodo Konva real **a propósito** (un item dentro de una celda de Tablix no declara
  geometría propia; el modelo no puede dar su rect sin duplicar la disposición).
- `prefer-dynamic-import` sobre `lib/monacoSetup.ts:2`: falso positivo; el módulo
  **es** diferido y el build lo deja en `monacoSetup-*.js` (7,2 MB) aparte del
  `index-*.js` (1,9 MB).

## ✅ Corrección de bugs (sesión 2026-09-16)

| # | Fallo | Arreglo |
|---|---|---|
| H1 | **Padding de imagen era un no-op mudo**: el contrato manda `padding` anidado (`{left: Length}`) y el comando solo miraba claves planas `paddingLeft…` | `setStyle` escribe/lee el padding anidado (y `border` se **rechaza explícitamente**: no está implementado ni proyectado) |
| H2 | **Cambio externo + cambios sin guardar = ediciones perdidas en silencio** (se recargaba y se limpiaba `dirty`) | Ya no se recarga: se emite `conflictDetected` y el front avisa en una banda ámbar (guardar = sobrescribir, cerrar = descartar). El diálogo completo (Recargar/Sobrescribir/Guardar como) sigue pendiente |
| H3 | **Duplicar un contenedor repetía los nombres de los hijos** (dos nodos con el mismo `Name`; el índice se quedaba con uno) | `duplicateItem` renombra todo el subárbol clonado a nombres libres y sincroniza `rd:DefaultName` |
| H4 | **`createElement` no escapaba**: una expresión/URL con `&` o `<` en un nodo nuevo (p. ej. el `<Value>` de una imagen) generaba XML inválido y rompía el guardado | El texto nuevo se escapa en `createElement` (igual que `setText`) |
| H5 | **El journal sobrevivía a una recarga**: el undo aplicaba inversos con nodos del árbol viejo y podía reescribir el documento nuevo con valores antiguos | El journal se ata al documento: si la sesión recarga, se descarta (undo = no-op) |
| H6 | **La precedencia RDL (run > párrafo > item) se ignoraba**: el lienzo y la barra de formato leían solo el estilo del item, y un cambio se escribía solo en el item (BC lo ignoraba si el run/párrafo ya lo declaraba) | El front resuelve el **estilo efectivo** (`lib/style.ts`) y `setStyle` **sincroniza** el valor en los overrides de párrafos/runs (con inverso byte-exacto) |
| — | Extra: `TextDecoration` no se proyectaba (el subrayado «se apagaba» al reconstruir la instantánea) y la conversión de tamaño no-`pt` de la barra estaba mal (×2,54 en vez de ×28,35) | Proyectado y convertido en `lib/style.ts` (`toPt`) |

Trade-offs documentados:
- Al usar la barra de formato sobre un textbox con formato por run, el valor se
  **sincroniza** en esos runs (se aplanan las diferencias): es la única forma de
  que el cambio se vea en BC con una barra que edita «el textbox entero». El editor
  rich-text por párrafos/runs llegará con el bloque de texto mixto.
- `setStyle` con `border` devuelve `E_COMMAND_REJECTED` a propósito (principio del
  proyecto: nunca ignorar en silencio); implementar bordes es un bloque aparte.
- Los comandos que quitan un `<Style>`/tag (`null`) reinsertan el nodo en su índice
  original para que el undo siga siendo byte-exacto aunque el fichero no siga el
  orden canónico.

### 🟠 Bugs detectados y corregidos después (M1–M7) ✅

| # | Fallo | Arreglo |
|---|---|---|
| M1 | `duplicateItem` no devolvía el `id` nuevo → Ctrl+D dejaba seleccionado el original | El dominio marca `createdId` (insert/duplicate/paste) y `CommandService` lo devuelve como `id`: el front selecciona el clon |
| M2 | **Cerrar no avisaba** de cambios sin guardar (el contrato `needsConfirmation`/`force` era código muerto) | `close(sessionId, force?)`: con `dirty` devuelve `{ closed: false, reason: 'dirty' }`, el IPC lo mapea al contrato y el front pregunta antes de forzar |
| M3 | Flechas + Supr en <400 ms → banner `E_COMMAND_REJECTED` | `deleteSelected`/`cutSelected` vacían la ráfaga pendiente antes de borrar |
| M4 | El contador «N recarga(s) externa(s)» contaba también snapshots internos | El evento `documentChanged` lleva `reason: 'external' \| 'internal'`; el front solo cuenta/avisa las externas |
| M5 | El lienzo ignoraba `zIndex` (orden del XML) | `sortByZIndex` (estable) ordena pintado y hit-test; el mayor queda encima |
| M6 | El diálogo «Informe…» perdía el borrador de código VB | El formulario se monta al abrir el diálogo: los borradores ya no se resetean con cada proyección |
| M7 | `setReportCode('')` dejaba `<Code></Code>`; doble inserción rápida podía chocar de nombre; selección fantasma tras undo/redo | Vaciar el código **quita** el bloque (undo byte-exacto); el nombre lo elige el **backend** (su índice está al día) y el front selecciona por `id`; si el id seleccionado desaparece de la proyección, se limpia |

## ✅ Hecho en la sesión (2026-09-14)

| Área | Estado |
|---|---|
| Monorepo pnpm + turbo, TS estricto, prettier | ✅ |
| `packages/contracts` (comandos, proyección, IPC, errores, `RdlcApi`) | ✅ |
| Golden round-trip **byte a byte** sobre el corpus (10/10) + ADR 0001 | ✅ |
| Shell Electron + NestJS en el main (`createApplicationContext`) + preload tipado | ✅ (ADR 0002) |
| File watching → re-parseo → recarga en vivo (filtra el eco por mtime) | ✅ |
| Lienzo Konva: papel + márgenes + bandas, reglas en mm/cm, zoom Ctrl+rueda, placeholder de imagen | ✅ |
| Selección (marco + tiradores), drag con imán (Shift lo ignora), flechas 1pt/10pt | ✅ |
| Edición de anidados (drag determinista por delta del puntero; `dragend` que burbujea) | ✅ |
| **Validación XSD oficial RDL 2016/01** (libxml2-wasm): avisa al importar, **bloquea al guardar** | ✅ |
| Panel de propiedades (geometría), panel de texto/expresión por runs | ✅ |
| **Barra de formato** (fuente del sistema, tamaño, N/I/S, color, resaltado, alineación, listas, valign) | ✅ |
| Variables (Fields/Parameters/Code./Globals/User) con búsqueda y grupos colapsables | ✅ |
| Propiedades del informe (Configurar página + Código VB en Monaco-like textarea) | ✅ |
| Panel de imagen: origen, campo/expresión (fx), MIME desplegable (fx), tamaño (radios), padding | ✅ |
| Insertar / duplicar / eliminar items (botones, Ctrl+D, Supr) con undo byte-exacto | ✅ |
| Auto-crecimiento del contenedor al sacar un hijo fuera (solo rectángulos con tamaño explícito) | ✅ |
| Undo/redo con journal (inversos múltiples por comando) | ✅ |
| Tests: 94 back + 10 front (golden, comandos, invariantes, integración, fuentes, XSD) | ✅ |

## 🔴 Gaps funcionales (MVP)

1. **Buscador / command palette (Ctrl+K)** — ⬜ siguiente bloque.
   Buscar por nombre de elemento y por contenido de expresión; acciones (abrir, guardar,
   undo/redo, insertar). shadcn `Command` en un `Dialog`.
2. **Monaco para expresiones** — ⬜ siguiente bloque.
   Highlight VB-like + autocompletado alimentado por el dominio `expression`
   (`Fields!`, `Parameters!`, `Globals!`, `User!`, `ReportItems!` y funciones de `<Code>`).
   Hoy el panel de texto es un `<Input>` y el bloque `<Code>` un `<Textarea>`.
3. **Texto mixto (varios TextRuns por párrafo)** — 🔶 se edita por run; falta el mini
   editor rich-text por párrafos para añadir/quitar runs y estilos por run.
4. **Tablix visual (Fase 2)** — ⬜ rejilla editable, resize de filas/columnas, grupos de
   fila con totales (`addRowGroup`, `resizeColumn`… ya definidos en el catálogo).
   El modelo ya se proyecta completo (body + jerarquías) y las celdas heredan tamaño
   (ColSpan/RowSpan) — ver hallazgos.
5. **Matrix (Fase 3)** — ⬜ grupos de columna.
6. **`moveItem`** (reparentar/reordenar) — ⬜ implementado hasta `insertItem`/`deleteItem`/
   `duplicateItem`; `moveItem` sigue rechazándose explícitamente.
7. **`setName`** (renombrar elemento) — ⬜ está en el catálogo; falta el comando y el
   campo editable en el panel de propiedades.

## 🟡 Gaps técnicos de frontend

8. **Rendimiento del lienzo** — 🔶 línea base medida (972 textboxes ≈ 30 fps p50,
   [docs/perf/0001-baseline-lienzo.md](docs/perf/0001-baseline-lienzo.md)); faltan las
   optimizaciones: drag sin re-render de React, viewport culling, grid cacheado,
   solo la pestaña activa monta el stage, batching de comandos.
9. **Arquitectura del lienzo** — 🔶 hay base (capas, selección, drag, snap); faltan
   multi-selección, alineación/distribución, guías inteligentes y toolbox con drag&drop
   real (hoy los items se insertan con botones).
10. **Lista de variables → inserción en Monaco** — 🔶 hoy copia al portapapeles; con
    Monaco debe insertar en la posición del cursor.
11. **Renombrar en el panel** (doble clic en el nombre), breadcrumb de contenedor
    (Rectángulo/Celda) y panel de jerarquía del informe (árbol de elementos).

## 🟠 Proceso y operativa

12. **Empaquetado** — ⬜ electron-builder (MSI/NSIS), decisión de firma, recursos del
    renderer (el XSD viaja en `apps/back/resources/`).
13. **Seguridad Electron** — 🔶 `contextIsolation`, `nodeIntegration:false`, CSP y zod en
    el borde ya están; falta revisar el checklist antes de abrir el repo.
14. **XML corrupto / inválido** — ✅ resuelto: parse error → no se abre; XSD inválido →
    aviso al importar y **bloqueo al guardar** con lista de problemas.
15. **Flujo BC** — ⬜ documentar el ciclo exportar layout (página 9650) → editar →
    reimportar; evolutivo: desplegar a BC.
16. **Testing más allá del golden** — 🔶 104 tests (94 back + 10 front); faltan property
    tests de comandos aleatorios, E2E Playwright del lienzo y CI.

## ⚪ Decisiones menores

- **i18n**: por ahora solo español con strings centralizadas.
- **CRLF/BOM**: preservados y verificados en golden tests.
- **Logging**: `electron-log` + consola del renderer al log del main (útil para soporte).
- **Modo QA**: `RDLC_OPEN` (abrir fichero), `RDLC_SHOT`/`RDLC_SHOT_SCRIPT`/`RDLC_SHOT_DRAG`
  (capturas y drag simulado con eventos reales), `RDLC_BENCH` (benchmark del lienzo).
- **No-goals del MVP**: charts/gauges/maps, subreports, multi-dataset, preview real,
  drillthrough/bookmarks, compilador VB.

## 🔍 Hallazgos del corpus (importantes para no romper BC)

1. **`<Label>` en los TextRun**: el diseñador de BC/RB muestra esa etiqueta
   (`[BTCClientName]`) en lugar de la expresión. Se parsea y se pinta entre corchetes.
2. **Contenido de celdas de Tablix sin `Width/Height`**: el tamaño lo pone la celda
   (con `ColSpan`/`RowSpan`). Distinguir “longitud ausente” de “0cm” es clave; si no,
   las celdas se dibujan 0×0 (bug real que tuvimos).
3. **Rectángulos 0×0 dentro de celdas**: son contenedores implícitos (manda la celda).
   **No deben crecer** al sacar un hijo fuera; solo crecen los de tamaño explícito.
4. **Eventos de Konva que burbujean**: `dragend`/`dragmove` llegan también al grupo
   padre; hay que filtrar por `event.target === event.currentTarget`. Y la posición en
   anidados se calcula con el **delta del puntero**, no con `setAbsolutePosition`.
5. **Escapado de texto propio** (deja `"` y `'` crudas): el escaper de la librería
   rompía el undo byte-exacto del bloque `<Code>` (comillas de VB).
6. **Unidad y representación**: el clamp solo debe reescribir la longitud si realmente
   recorta (si no, `20pt` se convertía en `0.705556cm`).
7. **Imágenes de BC**: siempre `Source=Database` + `=First(Fields!CompanyPicture.Value, …)`
   + `MIMEType=image/png` + `Sizing=FitProportional`. En diseño: placeholder.
