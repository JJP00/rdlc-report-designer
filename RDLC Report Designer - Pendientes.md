# RDLC Report Designer — Puntos pendientes (gaps del plan)

> **Sesión 2026-09-16** — pasada de corrección sobre Fase 1: se cerraron **6 fallos
> silenciosos** (el comando devolvía `ok` pero el efecto se perdía). Siguiente bloque:
> **insertar arrastrando desde la toolbar** y **menú contextual** en el lienzo
> (Insertar / Cortar / Copiar / Pegar / Duplicar / Eliminar). Los pendientes menores
> que quedaron abiertos están al final de esta sección.

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

### 🟠 Bugs detectados y **no** corregidos todavía (siguiente pasada)

| # | Fallo | Nota |
|---|---|---|
| M1 | `duplicateItem` no devuelve el `id` nuevo → Ctrl+D deja seleccionado el original | `CommandResult.id` nunca se rellena |
| M2 | **Cerrar no avisa** de cambios sin guardar (`close` ignora `dirty`; el contrato `needsConfirmation`/`force` es código muerto) | |
| M3 | Flechas + Supr en menos de 400 ms → banner `E_COMMAND_REJECTED` (el `setLocation` pendiente se vacía después del borrado) | `deleteSelected`/`duplicate` deben vaciar la ráfaga antes |
| M4 | El contador «N recarga(s) externa(s)» cuenta también las instantáneas internas (insert/undo) | Cualquier `documentChanged` lo incrementa |
| M5 | El lienzo ignora `zIndex` (pinta y hace hit-test por orden del XML) | |
| M6 | El diálogo «Informe…» pierde el borrador de código VB si llega una proyección nueva | Dependencia `[open, projection]` |
| M7 | `setReportCode('')` deja `<Code></Code>`; inserción rápida doble puede chocar de nombre; la selección no se actualiza al deshacer insert/delete | Menores |

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
