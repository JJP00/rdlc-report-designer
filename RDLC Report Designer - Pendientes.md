# RDLC Report Designer — Puntos pendientes (gaps del plan)

> **Sesión 2026-09-23/24 · editor de texto del Textbox + fidelidad del lienzo** —
> **Editor de texto (rework)**: diálogo con **textarea** (el documento completo, un
> párrafo por línea; las expresiones como **marcadores editables** que muestran la
> **etiqueta de BC** cuando la tienen, `⟨BTCMyCompanyName⟩`, o la expresión) y,
> debajo, el **bloque del párrafo activo** (el del cursor): runs con su valor,
> **etiqueta `<Label>` editable**, formato por run (fuente, tamaño,
> negrita/cursiva/subrayado, color, resaltado), alineación del párrafo
> (izquierda/centro/derecha; se quita "justificar" como RB: no existe) y
> añadir/quitar/duplicar/mover. Las expresiones se editan **inline con Monaco**
> (resaltado y autocompletado) y el widget de sugerencias se monta fuera del
> diálogo (`overflowWidgetsDomNode`) para que no lo recorte. El borrador se monta
> al abrir y se aplica en **un comando** (`setParagraphs`, nuevo en el dominio:
> reemplaza el nodo `<Paragraphs>`, undo byte-exacto y XSD válido). El panel
> muestra el caso simple inline y el mixto con resumen + «Abrir editor de texto»;
> el menú contextual tiene «Editar texto…».
> **Lienzo fiel**: el texto se pinta **un nodo por run** con la precedencia
> `run > párrafo > item` (fuente, tamaño, color, negrita/cursiva/subrayado),
> **alineación por párrafo** (el `TextAlign` vive en el párrafo, donde lo pone BC)
> y el `VerticalAlign` del item; el texto de diseño es la **etiqueta** entre
> corchetes (`[BTCMyCompanyName]`), el **nombre del campo** si la expresión es
> simple (`=Fields!BTCDescriptionLbl.Value` → `BTCDescriptionLbl`), `[exp]` para
> el resto, y el texto plano tal cual.
> **Marco de selección**: mide la **caja** del item (`item-box`), no el grupo: con
> el texto repartido en runs sin `width`, `getClientRect` incluía lo que sobresale
> y el marco/tiradores se inflaban (el dibujado era correcto — el `clip` recorta —
> pero arrastrar y redimensionar se descuadraban). Cubierto con E2E.
>
> **Punto de retomada (próxima sesión)**:
>
> 1. **Probar en la app** lo de esta sesión: editor de texto con un informe grande
>    (10 párrafos/20+ runs), marcadores/etiquetas, alineación en el lienzo, marco
>    al arrastrar y redimensionar.
> 2. **`TablixCorner` + `TablixHeader`**: la proyección aún no los pinta (en
>    `Tablix7` de `SalesInvoiceESP` no se ven `Textbox72/73/75` ni las cabeceras
>    de grupo `VATIdentifier_…`). Recomendado antes de crear grupos nuevos, porque
>    BC los usa para las cabeceras.
> 3. **Grupos de fila con totales** (bloque 2 de F2): `addRowGroup`,
>    `deleteRowGroup`, `setGroupExpression`, `setGroupTotals`.
> 4. Menores: `moveItem` y `setName` (en el catálogo, sin comando), **insertar
>    Tablix** (no existe aún), empaquetado electron-builder y CI.
>
> Estado: **272 unit tests** (162 back + 110 front), `typecheck` limpio,
> `react-doctor` **100/100** y los **20 E2E** de Playwright verdes.

> **Sesión 2026-09-22 · correcciones sobre F2 parte 3 (bloque 1)** —
> **Click derecho con selección de celdas**: si el click cae dentro de la
> selección (el rectángulo **o** las sueltas de Ctrl+click), el rango manda y no
> se pierde. Antes, al pinchar con el botón derecho sobre una celda fuera del
> rectángulo ancla→foco (p. ej. una añadida con Ctrl+click), la selección saltaba
> al textbox de debajo y el menú contextual mostraba sus acciones. El hit-test
> publica ahora la **cadena de celdas** que atraviesa el punto (`hit.cells`, de
> fuera a dentro) y la comprobación (`hitSelectionCell` + `isCellSelected`) mira
> toda la cadena: con **tablixes anidados** (`Tablix2 ⊃ Rectangle ⊃ LinesTable2`)
> el elemento más interno es de otra tabla y una sola celda no bastaba.
> **Regla de fusión**: `Combinar celdas` solo se ofrece para **tramos contiguos
> de una misma fila**; el dominio rechaza `mergeCells` con `rowSpan > 1` ("Solo se
> pueden combinar celdas contiguas de la misma fila") para no descartar el
> contenido de celdas de otras filas. Las fusiones verticales que ya traiga un
> fichero de BC se respetan y se pueden **Separar**.
> **Banner de error**: ya no muestra el código (`E_COMMAND_REJECTED: …`) sino solo
> el motivo (`apiErrorMessage`, sin `code`), y se cierra solo a los 6 s (o con la
> X); un aviso nuevo re-arma el temporizador. El conflicto de fichero sigue siendo
> manual (exige decisión del usuario).
> **Fusión con Ctrl+click**: la elegibilidad se calcula sobre **el conjunto de
> celdas seleccionadas** (las sueltas incluidas): si forman un tramo contiguo de
> una fila se pueden combinar, vinieran de Shift+click (rango) o de Ctrl+click
> (una a una). El tramo a fusionar sale de `selectionBounds`; antes
> `canMergeSelection` miraba solo el rectángulo ancla→foco y las sueltas de
> Ctrl+click no contaban como candidatas.
> **Separar celdas desde el menú**: la opción aparece aunque no haya selección de
> celdas cuando el click derecho cae sobre una celda combinada (manda la celda
> del hit); antes solo se ofrecía si el ancla estaba en la selección.
> **Esc con una celda seleccionada**: `hasSelection` no contaba las celdas, así
> que el atajo no subía al Tablix (documentado como "Esc sube un nivel").
> Al fusionar, las celdas cubiertas se eliminan y su contenido se descarta (como
> en RB); el ancla conserva el suyo y hereda el ancho fusionado.
> **Separar crea textbox**: la celda recreada nace con un **Textbox vacío** (sin
> longitudes: el tamaño lo pone la celda) en vez de quedar muerta, y el
> documento sigue validando el XSD.
> **Insertar en una celda**: el item nace con el **tamaño de la celda** y en su
> origen (antes: tamaño por defecto en el punto del cursor).
> **Proyección de celdas con fusiones**: el ancho/alto heredado usa la **columna
> acumulada** (suma de `ColSpan`), no el índice del array — al fusionar, las
> celdas de la derecha conservaban mal su tamaño (bug detectado con
> `SalesInvoiceESP`: la celda de un textbox pasaba de 3.35 a 3.53 cm). Las filas
> que desbordan las columnas declaradas (ficheros tolerantes de BC) usan la
> última columna como referencia en vez de dibujarse 0×0.
> **Rejilla segmentada**: las fronteras que cruza una celda fusionada ya no se
> dibujan (`lib/grid.ts`): una celda con `ColSpan`/`RowSpan` se ve como una caja
> continua en vez de parecer partida (caso `TextboxVATClauseDesc` en
> `SalesCreditMemoESP`: una celda con `ColSpan 2` mostraba la línea en medio).
> **`react-doctor` 100/100** tras el refactor de la sesión: `App` (335 → 291
> líneas) delega el click derecho en `useItemEditing`, los diálogos en
> `DocumentDialogs` y los ganchos de QA en `useQaHooks`; la rejilla usa claves
> estables por segmento.
> **Editor de texto del Textbox** (rework del panel): el caso **simple** (un
> párrafo, un run) se sigue editando inline; el **texto mixto** se edita en un
> diálogo que abre el panel o el menú contextual del item ("Editar texto…"):
> un **textarea** con el documento (un párrafo por línea; las expresiones como
> **marcadores editables** que muestran la **etiqueta de BC** cuando la tienen,
> `⟨BTCMyCompanyName⟩`, o la expresión si no, `⟨=Code.GetData(13, 1)⟩`) y,
> debajo, el **bloque del párrafo donde está el cursor** con sus runs: valor,
> **etiqueta `<Label>` editable**, formato por run (fuente, tamaño,
> negrita/cursiva/subrayado, color, resaltado), alineación del párrafo,
> añadir/quitar/duplicar/mover y el editor Monaco de la expresión (una única
> instancia, bajo demanda). Al pasar texto ↔ párrafos se conservan las etiquetas
> `<Label>` y el formato por coincidencia de contenido (etiqueta o expresión).
> Todo se aplica en **un comando** (`setParagraphs`, nuevo en el dominio:
> reemplaza el nodo `<Paragraphs>`, undo byte-exacto y XSD válido).
> **Rendimiento**: con textboxes grandes (10 párrafos, 20+ runs) el diálogo
> bloqueaba porque montaba un Monaco por run y pedía las fuentes del sistema por
> run; ahora los valores son inputs, el Monaco se monta solo al pedirlo y las
> fuentes se cargan una vez (`datalist`).
> **Teclado con diálogos abiertos**: `useGlobalKeys` no actúa mientras hay un
> diálogo o menú **abierto** (`data-state="open"`): el Escape que cierra el
> diálogo ya no cambia además la selección del lienzo (y un Ctrl+Z justo al
> cerrar sí deshace).
> Estado: **267 unit tests** (162 back + 105 front), `typecheck` limpio y los
> **18 E2E** de Playwright verdes (incluye el editor de texto: marcadores de
> expresión en el textarea, bloque del párrafo activo y undo).

> **Sesión 2026-09-18 · F2 parte 3 (bloque 1) + E2E con Playwright** —
> **Estructura del Tablix**: la proyección ya trae las **jerarquías** de
> fila/columna (grupos con expresión, visibilidad y **totales inferidos**: una
> fila con agregados pegada a un grupo), el lienzo tiene **selección de celda**
> (click en una celda vacía; el contenido sigue ganando el click) y el panel
> derecho muestra el **árbol de estructura** con añadir/quitar fila y columna:
> `addRow`/`deleteRow`/`addColumn`/`deleteColumn` sincronizan `TablixBody` **y**
> las jerarquías, respetan `ColSpan`/`RowSpan` (crecen/decrecen con las celdas
> fusionadas) y su undo es **byte-exacto**. El toolbox y el menú contextual ya
> insertan **dentro de la celda seleccionada** (el hit-test de celdas llega a
> `tablixCell`). El **menú contextual de una celda** agrupa en el submenú _Insertar fila o
> columna_ las cuatro acciones (fila encima/debajo, columna izquierda/derecha), borra
> **filas/columnas en lote** de las celdas seleccionadas y ofrece **Combinar/Separar celdas**.
> La selección de celdas es **estilo Report Builder**: cabeceras grises numeradas arriba y a
> la izquierda (click selecciona la fila/columna, **Shift+click** rango, **Ctrl+click** añade
> celdas sueltas) y el redimensionado va en los **bordes de las cabeceras** (se quitaron las
> líneas azules internas). La fusión solo se ofrece cuando la selección forma un rectángulo
> contiguo; con celdas separadas no hay merge (como RB). El **contenido de una celda queda
> anclado**: no se arrastra ni con flechas (y el panel de propiedades desactiva X/Y/tamaño con
> un aviso), se **recorta** a la celda y el marco de la tabla se mide de su **borde/rejilla**.
> Además, los **colores que son expresiones RDL** (`=IIF(..., "LightGray", …)`, frecuentes como
> fondo por fila en BC) ya **no se pintan en negro**: en diseño no se evalúan (RB tampoco) y
> caen al color por defecto; la barra de formato normaliza los colores con nombre (`Silver`) a
> hex para sus selectores.
> Verificado con E2E de Playwright sobre la app real (selección, cabeceras, borrado en lote,
> fusión/separación, anclaje, recorte, refresco de rejilla, colores y undo), con reset del
> documento entre tests.
>
> Además: **E2E con Playwright** (`pnpm e2e`, `_electron` sobre `out/` con
> `--mode e2e`), que sustituye a los guiones `RDLC_SHOT` para los tests de
> interacción (el modo QA queda para capturas manuales). Bug de diagnóstico
> corregido: `__rdlcTablixSeparator` no se publicaba nunca (el efecto corría
> antes de que `SelectionFrame` montara los separadores) y Konva disparaba
> `click` con el botón derecho (limpiaba la selección de celdas antes del menú).
> Estado: **233 unit tests** (156 back + 77 front) + **14 E2E**, `typecheck` limpio y
> `react-doctor` **100/100 con 0 issues**.
>
> **Lo siguiente (F2 parte 3, bloque 2)**: **grupos de fila con totales**
> (`addRowGroup`, `deleteRowGroup`, `setGroupExpression`, `setGroupTotals`:
> crear/borrar grupo, total before/after con las celdas de agregado) y después
> **Matrix** (F3, grupos de columna).
>
> **Punto de retomada (2026-09-18)**: probar en la app las novedades (cabeceras
> RB: click/Shift/Ctrl, redimensionar por el borde de la cabecera, borrado en
> lote y combinar/separar celdas); al validar, empezar el bloque 2 por
> `addRowGroup` (proyección `TablixMemberDto` ya lista, `total` inferido) y
> cerrar con `setGroupTotals`. Nada de esta sesión está commiteado: el working
> tree tiene los cambios listos para revisar/commitear.

> **Sesión 2026-09-16 · 4.º bloque (cierre)** — **F2 parte 2**: redimensionar con el
> cursor (8 tiradores, `setBounds`/`resizeTable` en un solo undo), **separadores
> internos** de columna/fila de la rejilla, y arreglo del **click dentro de las
> tablas**: ahora un click selecciona el elemento más anidado a la primera (el borde
> del Tablix se llevaba todos los clicks porque en Konva el área de hit por defecto
> de un `Rect` es toda su superficie). Además **Esc sube un nivel** de jerarquía
> (tablas internas) y el menú contextual tiene _Seleccionar contenedor_.
> Verificado con el modo QA y `stage.getIntersection()` sobre `SalesCreditMemoESP.rdlc`.
> Estado: **199 tests** verdes (136 back + 63 front), `typecheck` limpio y
> `react-doctor` **82/100 con 0 errores**.
> **Lo siguiente (F2, parte 3)**: selección de **celda**, panel/árbol de **estructura**
> (añadir/quitar fila y columna sincronizando `TablixBody` **y** `TablixRowHierarchy`)
> y **grupos de fila con totales**.

## 🧠 Lecciones de Konva (para no repetirlas)

| Regla                           | Detalle                                                                                                                                                                                                              |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Área de hit de un `Rect`**    | Por defecto es **toda su superficie**, no solo el trazo: un rect envolvente para «pinchar el borde» se traga los clicks del interior. Para un anillo hace falta un `hitFunc` propio (4 `rect()` + `fillStrokeShape`) |
| **Parámetros del hitFunc**      | `fillStrokeShape` rellena con el _color de hit_ aunque no haya `fill`: en el lienzo de hit todo lo dibujado es hitable                                                                                               |
| **Capa de selección**           | Los tiradores y separadores viven en una capa encima: mientras hay algo seleccionado, tapan los clicks de lo que hay debajo (igual que RB)                                                                           |
| **Medir el marco**              | `getClientRect()` incluye **todos** los descendientes: cualquier adorno que sobresalga (anillos, sombras) infla el marco y desalinea tiradores/separadores                                                           |
| **No re-renderizar en un drag** | Re-renderizar un componente mientras Konva arrastra uno de sus nodos lo desmonta y mata el drag (las vistas previas van por refs)                                                                                    |
| **Hooks de QA (solo dev)**      | `__rdlcSelection` (rect en px de papel + zoom), `__rdlcResizeHandle`, `__rdlcTablixSeparator` y `__rdlcStage` (para `getIntersection` y para trazar eventos parcheando `_fireAndBubble`)                             |

## ✨ Nuevo (3.er bloque, 2026-09-16): redimensionar con el cursor (F2, parte 1)

| Pieza                      | Detalle                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Tiradores de selección** | 8 tiradores (esquinas + lados) con su cursor, imán de 0,1 cm (Shift lo ignora) y vista previa del recuadro mientras se arrastra. Se ocultan para items desconocidos                                                                                                                                                                                                                                                                         |
| **Items normales**         | Un tirador mueve y redimensiona a la vez con **`setBounds`** (un solo paso de undo, aunque cambien posición y tamaño)                                                                                                                                                                                                                                                                                                                       |
| **Tablas (Tablix)**        | Manda la **rejilla**: `resizeTable` reparte el cambio **proporcionalmente** entre columnas y filas, mueve el Tablix y sincroniza su `Width/Height` declarado. Igual que Report Builder, se coge la tabla entera y se estira desde cualquier tirador                                                                                                                                                                                         |
| **Primitivas**             | `resizeColumn` / `resizeRow` (columna/fila exacta) listas para los **separadores internos** de la rejilla (siguiente paso)                                                                                                                                                                                                                                                                                                                  |
| **Separadores internos**   | ⚠️ **Sustituido (2026-09-18)**: el redimensionado vive ahora en los **bordes de las cabeceras estilo Report Builder**; las líneas azules internas se quitaron (además arrancaban desde el borde del lienzo). Se conservaba `resizeColumn`/`resizeRow` como primitivas                                                                                                                                                                       |
| **Seleccionar la tabla**   | Pinchar su **borde** (anillo de 4 px por fuera + 1 dentro) la selecciona. El **interior** es de las celdas: un click dentro selecciona **el elemento de dentro a la primera** (antes lo cogía la tabla, porque el área de hit por defecto de un `Rect` de Konva es toda su superficie; ahora el borde usa un `hitFunc` de anillo). El contenido de una celda **no muestra tiradores**: ahí manda la celda (se redimensiona la columna/fila) |
| **Tablas internas**        | Si una tabla anidada comparte borde con su contenedor, el borde exterior gana y no se puede pinchar la de dentro. Para eso: **Esc sube un nivel** (contenido de celda → rectángulo → tabla → …) y el menú contextual tiene **«Seleccionar contenedor»**; la paleta **Ctrl+K** llega a cualquier item por nombre                                                                                                                             |
| **Byte-exactitud**         | El dominio no inventa etiquetas: `Top/Left/Width/Height` que se crean al mover un item de una celda se **quitan** al deshacer, y los tags existentes vuelven a su **texto exacto** (`setNodeText`)                                                                                                                                                                                                                                          |
| **QA**                     | `lib/resize.ts` con 8 tests, `setBounds` con 3 y `resizeTable` con 7 (incluye undo byte-exacto). Hooks de dev (`__rdlcSelection`, `__rdlcResizeHandle`, `__rdlcStage`) para guiones de captura: arrastre real verificado → `resizeTable aplicado`; y verificado con `getIntersection` que un click dentro de una tabla llega al elemento más anidado                                                                                        |

Pendiente de F2 (parte 3, siguiente): **selección de celda** + panel/árbol de
**estructura** (añadir/quitar fila y columna, sincronizando `TablixBody` **y**
`TablixRowHierarchy`) y **grupos de fila con totales**.

## ✨ Nuevo (2.º bloque, 2026-09-16): Ctrl+K + Monaco

| Pieza                      | Detalle                                                                                                                                                                                                                                                                                                                   |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Paleta Ctrl+K**          | Busca **elementos del informe** (por nombre y por contenido: texto y expresiones), **variables** (campos, parámetros, funciones de `<Code>`, Globals!, User!) y **acciones** (abrir, guardar, deshacer, rehacer, insertar, propiedades, panel de variables). Al elegir un elemento lo selecciona y **lo trae a la vista** |
| **Datos de la paleta**     | `lib/palette.ts` (elementos + acciones) y `lib/variables.ts` (variables, compartido con el panel). `lib/projection.ts` gana `flattenItems`/`findItemInList` y deja de triplicar recorridos                                                                                                                                |
| **Monaco**                 | `ExpressionEditor` (Monaco 0.56, worker empaquetado con Vite): los runs con expresión y el bloque `<Code>` VB se editan con resaltado y autocompletado; Enter/⌘⏎/blur hacen commit                                                                                                                                        |
| **Lenguaje `rdlc-expr`**   | Tokenizador Monarch VB-like (referencias `Fields!`, `Code.`, funciones, cadenas, comentarios) + catálogo de ~100 funciones RDL y palabras clave (`lib/expressionCatalog.ts`)                                                                                                                                              |
| **Autocompletado**         | Se alimenta de la proyección del informe (`setCompletionMeta`): campos, parámetros, funciones de `<Code>` (parámetros ya sin `ByVal`/`As`), Globals!, User! y funciones del estándar                                                                                                                                      |
| **Inserción en el cursor** | `lib/expressionEditor.ts`: el editor registrado al enfocar (el último gana) recibe la expresión; si no hay editor, se copia al portapapeles. En un editor vacío se pega con `=`, en uno con contenido como fragmento                                                                                                      |

Desviación consciente: el dominio `expression` vive de momento en el **front**
(`lib/expressionCatalog.ts`, `lib/monacoSetup.ts`) porque solo lo consume Monaco;
si el backend necesita validar sintaxis, el catálogo se moverá a `contracts`.

## ✨ Nuevo (1.er bloque, 2026-09-16): insertar arrastrando + menú contextual

| Pieza                                      | Detalle                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Toolbox con drag&drop real**             | Los botones de la toolbar son arrastrables (`application/x-rdlc-item`): al soltar en el lienzo el item nace **en el punto donde se suelta** (y dentro del rectángulo si se suelta sobre uno). El click sigue insertando al principio del cuerpo                                                                               |
| **Hit-test del lienzo** (`lib/hit.ts`)     | Función pura sobre la proyección: devuelve el item de arriba, el contenedor de inserción (rectángulo más interno) y el punto en cm relativo a ese contenedor. 7 tests                                                                                                                                                         |
| **Menú contextual** (radix `context-menu`) | Click derecho en el lienzo: _Insertar → Textbox/Rectángulo/Línea/Imagen_ (en el punto), _Duplicar_, _Copiar_, _Cortar_, _Pegar_, _Eliminar_. El click derecho también selecciona lo que hay debajo                                                                                                                            |
| **Portapapeles en el backend**             | `copy`/`cut`/`paste` como **métodos de la API** (no comandos: copiar no muta el documento). El portapapeles guarda un **clon desprendido** con el XML exacto; cada pegado clona y **renombra** el subárbol (mismo helper que duplicar). `cut` = copiar + `deleteItem` (un solo undo). La recarga externa lo descarta. 6 tests |
| **Atajos**                                 | Ctrl+C / Ctrl+X / Ctrl+V (pegar en el cuerpo) además de los existentes Ctrl+D / Supr / flechas                                                                                                                                                                                                                                |
| **Posición normalizada al insertar**       | `insertItem` clampa la posición a la banda (un item soltado fuera del cuerpo entra en él), igual que hace el drag                                                                                                                                                                                                             |

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
página/código, _nudge_) y `useGlobalKeys` (atajos), más `EditorToolbar`, `CanvasArea`,
`ItemPanels` y `StatusBar`. El lienzo se parte en `Paper` (papel + bandas + items),
`SelectionFrame` (marco y tiradores), `Ruler`, `ItemView` (nodo Konva y contenido por
tipo) y `bands.ts` (geometría de bandas, compartida con el hit-test). El panel de
imagen se divide en secciones y la paleta ejecuta acciones por tabla
(`paletteRunner`), sin `switch`.

**Pendiente del doctor**: resuelto el 2026-09-18 — la medición del marco de
selección se consolidó en un solo `setState` (ya no dispara
`no-adjust-state-on-prop-change`), y el falso positivo de
`prefer-dynamic-import` sobre `lib/monacoSetup.ts` (el módulo **es** diferido y
el build lo deja en `monacoSetup-*.js` aparte) queda acotado en
`apps/front/doctor.config.json`. `react-doctor`: **100/100, 0 issues**.

## ✅ Corrección de bugs (sesión 2026-09-16)

| #   | Fallo                                                                                                                                                                                                                | Arreglo                                                                                                                                                                                                  |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| H1  | **Padding de imagen era un no-op mudo**: el contrato manda `padding` anidado (`{left: Length}`) y el comando solo miraba claves planas `paddingLeft…`                                                                | `setStyle` escribe/lee el padding anidado (y `border` se **rechaza explícitamente**: no está implementado ni proyectado)                                                                                 |
| H2  | **Cambio externo + cambios sin guardar = ediciones perdidas en silencio** (se recargaba y se limpiaba `dirty`)                                                                                                       | Ya no se recarga: se emite `conflictDetected` y el front avisa en una banda ámbar (guardar = sobrescribir, cerrar = descartar). El diálogo completo (Recargar/Sobrescribir/Guardar como) sigue pendiente |
| H3  | **Duplicar un contenedor repetía los nombres de los hijos** (dos nodos con el mismo `Name`; el índice se quedaba con uno)                                                                                            | `duplicateItem` renombra todo el subárbol clonado a nombres libres y sincroniza `rd:DefaultName`                                                                                                         |
| H4  | **`createElement` no escapaba**: una expresión/URL con `&` o `<` en un nodo nuevo (p. ej. el `<Value>` de una imagen) generaba XML inválido y rompía el guardado                                                     | El texto nuevo se escapa en `createElement` (igual que `setText`)                                                                                                                                        |
| H5  | **El journal sobrevivía a una recarga**: el undo aplicaba inversos con nodos del árbol viejo y podía reescribir el documento nuevo con valores antiguos                                                              | El journal se ata al documento: si la sesión recarga, se descarta (undo = no-op)                                                                                                                         |
| H6  | **La precedencia RDL (run > párrafo > item) se ignoraba**: el lienzo y la barra de formato leían solo el estilo del item, y un cambio se escribía solo en el item (BC lo ignoraba si el run/párrafo ya lo declaraba) | El front resuelve el **estilo efectivo** (`lib/style.ts`) y `setStyle` **sincroniza** el valor en los overrides de párrafos/runs (con inverso byte-exacto)                                               |
| —   | Extra: `TextDecoration` no se proyectaba (el subrayado «se apagaba» al reconstruir la instantánea) y la conversión de tamaño no-`pt` de la barra estaba mal (×2,54 en vez de ×28,35)                                 | Proyectado y convertido en `lib/style.ts` (`toPt`)                                                                                                                                                       |

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

| #   | Fallo                                                                                                                        | Arreglo                                                                                                                                                                                                         |
| --- | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1  | `duplicateItem` no devolvía el `id` nuevo → Ctrl+D dejaba seleccionado el original                                           | El dominio marca `createdId` (insert/duplicate/paste) y `CommandService` lo devuelve como `id`: el front selecciona el clon                                                                                     |
| M2  | **Cerrar no avisaba** de cambios sin guardar (el contrato `needsConfirmation`/`force` era código muerto)                     | `close(sessionId, force?)`: con `dirty` devuelve `{ closed: false, reason: 'dirty' }`, el IPC lo mapea al contrato y el front pregunta antes de forzar                                                          |
| M3  | Flechas + Supr en <400 ms → banner `E_COMMAND_REJECTED`                                                                      | `deleteSelected`/`cutSelected` vacían la ráfaga pendiente antes de borrar                                                                                                                                       |
| M4  | El contador «N recarga(s) externa(s)» contaba también snapshots internos                                                     | El evento `documentChanged` lleva `reason: 'external' \| 'internal'`; el front solo cuenta/avisa las externas                                                                                                   |
| M5  | El lienzo ignoraba `zIndex` (orden del XML)                                                                                  | `sortByZIndex` (estable) ordena pintado y hit-test; el mayor queda encima                                                                                                                                       |
| M6  | El diálogo «Informe…» perdía el borrador de código VB                                                                        | El formulario se monta al abrir el diálogo: los borradores ya no se resetean con cada proyección                                                                                                                |
| M7  | `setReportCode('')` dejaba `<Code></Code>`; doble inserción rápida podía chocar de nombre; selección fantasma tras undo/redo | Vaciar el código **quita** el bloque (undo byte-exacto); el nombre lo elige el **backend** (su índice está al día) y el front selecciona por `id`; si el id seleccionado desaparece de la proyección, se limpia |

## ✅ Hecho en la sesión (2026-09-14)

| Área                                                                                                   | Estado        |
| ------------------------------------------------------------------------------------------------------ | ------------- |
| Monorepo pnpm + turbo, TS estricto, prettier                                                           | ✅            |
| `packages/contracts` (comandos, proyección, IPC, errores, `RdlcApi`)                                   | ✅            |
| Golden round-trip **byte a byte** sobre el corpus (10/10) + ADR 0001                                   | ✅            |
| Shell Electron + NestJS en el main (`createApplicationContext`) + preload tipado                       | ✅ (ADR 0002) |
| File watching → re-parseo → recarga en vivo (filtra el eco por mtime)                                  | ✅            |
| Lienzo Konva: papel + márgenes + bandas, reglas en mm/cm, zoom Ctrl+rueda, placeholder de imagen       | ✅            |
| Selección (marco + tiradores), drag con imán (Shift lo ignora), flechas 1pt/10pt                       | ✅            |
| Edición de anidados (drag determinista por delta del puntero; `dragend` que burbujea)                  | ✅            |
| **Validación XSD oficial RDL 2016/01** (libxml2-wasm): avisa al importar, **bloquea al guardar**       | ✅            |
| Panel de propiedades (geometría), panel de texto/expresión por runs                                    | ✅            |
| **Barra de formato** (fuente del sistema, tamaño, N/I/S, color, resaltado, alineación, listas, valign) | ✅            |
| Variables (Fields/Parameters/Code./Globals/User) con búsqueda y grupos colapsables                     | ✅            |
| Propiedades del informe (Configurar página + Código VB en Monaco-like textarea)                        | ✅            |
| Panel de imagen: origen, campo/expresión (fx), MIME desplegable (fx), tamaño (radios), padding         | ✅            |
| Insertar / duplicar / eliminar items (botones, Ctrl+D, Supr) con undo byte-exacto                      | ✅            |
| Auto-crecimiento del contenedor al sacar un hijo fuera (solo rectángulos con tamaño explícito)         | ✅            |
| Undo/redo con journal (inversos múltiples por comando)                                                 | ✅            |
| Tests: 94 back + 10 front (golden, comandos, invariantes, integración, fuentes, XSD)                   | ✅            |

## 🔴 Gaps funcionales (MVP)

1. **Buscador / command palette (Ctrl+K)** — ✅ hecho (sesión 2026-09-16): busca
   elementos por nombre y contenido, variables y acciones; shadcn `Command` en `Dialog`.
2. **Monaco para expresiones** — ✅ hecho: resaltado VB-like + autocompletado
   (`Fields!`, `Parameters!`, `Globals!`, `User!`, `ReportItems!` y funciones de `<Code>`)
   en el panel, el bloque `<Code>` y el editor de texto (inline por run). El widget de
   sugerencias se monta fuera del contenedor del editor (`overflowWidgetsDomNode`), que
   dentro de un diálogo quedaba recortado.
3. **Texto mixto (varios TextRuns por párrafo)** — ✅ hecho (sesión 2026-09-23/24): editor
   de texto con textarea del documento (marcadores de expresión con la etiqueta de BC),
   bloque del párrafo activo (runs, etiqueta `<Label>` editable, formato por run,
   añadir/quitar/duplicar/mover) y comando `setParagraphs` (undo byte-exacto).
4. **Tablix visual (Fase 2)** — 🔶 rejilla editable, estructura (bloque 1), rejilla
   segmentada, fusión por tramos y proyección de anchos por columna acumulada ✅; falta:
   **cabeceras de grupo (`TablixMember/TablixHeader`) y esquina (`TablixCorner`)** — hoy
   **no se proyectan ni se pintan**: en informes como `Tablix7` de `SalesInvoiceESP.rdlc` los
   textboxes de la esquina y de las cabeceras (p. ej. `Textbox72/73/75`, `VATIdentifier_…`)
   existen en el XML pero no en el lienzo, y el layout no cuenta sus columnas/filas.
   Después: **grupos de fila con totales** (`addRowGroup`, `setGroupTotals`… ya en el plan).
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
9. **Arquitectura del lienzo** — 🔶 hay base (capas, selección, drag, snap, **toolbox con
   drag&drop real**); faltan multi-selección, alineación/distribución y guías inteligentes.
10. **Lista de variables → inserción en Monaco** — ✅ hecho: inserta en la posición del
    cursor del editor registrado (y copia al portapapeles si no hay editor).
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
   - `MIMEType=image/png` + `Sizing=FitProportional`. En diseño: placeholder.
