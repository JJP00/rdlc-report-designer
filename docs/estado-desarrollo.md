# Estado de desarrollo

Historial de fases y sesiones del proyecto (movido desde el README).
Backlog y punto de retomada: [`RDLC Report Designer - Pendientes.md`](../RDLC%20Report%20Designer%20-%20Pendientes.md).

## Estado (Fase 0–3 cerradas funcionalmente · T1–T3 hechos — sesión 2026-10-02)

**Fase 0 (spike round-trip) — cerrada:**

- [x] Monorepo pnpm + turbo, TypeScript estricto.
- [x] `packages/contracts` v0: comandos, proyección completa, canales IPC, códigos de error.
- [x] Corpus de 10 ficheros + golden tests de round-trip **byte a byte** (10/10).
- [x] Decisión del parser: `xml-trueformat` ([ADR 0001](./adr/0001-parser-xml-lossless.md)).
- [x] Shell Electron + NestJS ([ADR 0002](./adr/0002-nest-en-electron-main.md)) + preload tipado.
- [x] File watching → re-parseo → snapshot nueva (recarga en vivo).
- [x] Benchmark de lienzo con 972 textboxes
      ([docs/perf/0001-baseline-lienzo.md](./perf/0001-baseline-lienzo.md)).

**Fase 1 (editor de layout) — en curso:**

- [x] Árbol de dominio lossless + comandos con inverso (undo byte-exacto) y journal.
- [x] **Validación XSD oficial RDL 2016/01** (avisa al importar, bloquea al guardar).
- [x] Lienzo: papel + márgenes + bandas, reglas mm/cm, selección, drag con imán,
      flechas 1pt/10pt, zoom Ctrl+rueda, placeholder de imágenes.
- [x] Insertar / duplicar / eliminar items; auto-crecimiento del contenedor.
- [x] **Insertar arrastrando desde la toolbar + menú contextual** (insertar, duplicar,
      copiar, cortar, pegar, eliminar) con portapapeles en el backend.
- [x] Paneles: propiedades, texto/expresión, imagen (origen/MIME/tamaño/padding),
      variables (búsqueda + colapsables), Propiedades del informe (página + Código VB).
- [x] **Editor de texto del Textbox**: panel simple inline; el texto mixto en un diálogo con
      **textarea del documento** (párrafos por línea y expresiones como marcadores `⟨…⟩` que
      muestran la **etiqueta de BC** o la expresión) + **bloque del párrafo activo** (runs,
      etiqueta `<Label>` y formato por run, añadir/quitar/duplicar/mover y **Monaco inline** con
      autocompletado). Un solo undo con `setParagraphs`.
- [x] **Lienzo fiel al estilo RDL**: el texto se pinta por run con la precedencia
      `run > párrafo > item` (fuente, tamaño, color, negrita/cursiva/subrayado) y la
      **alineación del párrafo**; el texto de diseño muestra la **etiqueta** `[X]`, el nombre
      del campo, `[exp]` o el texto. Marco y tiradores miden la caja del item.
- [x] Barra de formato con las **fuentes disponibles en Business Central** (lista oficial
      vía IPC).
- [x] **Paleta de comandos Ctrl+K** (elementos por nombre y contenido, variables, acciones)
      y **Monaco** para expresiones y bloque `<Code>` (resaltado + autocompletado;
      las variables se insertan en el cursor).
- [x] **Redimensionar con el cursor** (8 tiradores: mover + tamaño en un undo). Con la
      **multiselección**, los tiradores envuelven el bloque entero y escalan **todos** los
      miembros en proporción (un solo `batch` = un undo; los Tablix reparten su rejilla y las
      cabeceras de grupo no escalan). El redimensionado de columnas/filas de un Tablix vive
      en los **bordes de sus cabeceras estilo Report Builder** (desde 2026-09-18; antes eran
      separadores internos azules). Un click dentro de la tabla selecciona el **elemento de
      dentro**; **Esc** sube un nivel de jerarquía.
- [x] **Estructura del Tablix (F2 parte 3, bloque 1)**: proyección de las jerarquías de
      fila/columna (grupos, visibilidad y totales inferidos), **selección de celdas** con
      **cabeceras estilo Report Builder** (barras grises numeradas arriba y a la izquierda:
      click selecciona la columna/fila, **Shift+click** hace rango, **Ctrl+click** añade celdas
      sueltas; el redimensionado va en los **bordes de las cabeceras**, sin líneas azules
      internas), panel de **estructura** (árbol de filas/columnas con añadir/quitar fila y
      columna, sincronizando `TablixBody` **y** las jerarquías; las celdas fusionadas se
      respetan y el undo es byte-exacto), **menú contextual de celda** (submenú _Insertar fila
      o columna_; eliminar filas/columnas en lote de las celdas seleccionadas) y
      **combinar/separar celdas** (solo si la selección forma un tramo contiguo de
      una misma fila; las fusiones verticales que ya traiga el fichero se pueden
      separar).
      El **contenido de una celda está anclado**: no se arrastra, se recorta a la celda y el
      marco de la tabla mide la **rejilla**. Además, las celdas nuevas de fila/columna nacen
      con un **Textbox vacío** (no celdas muertas) y los «+» por fila/columna se quitaron
      (queda el de la cabecera, que añade al final). Queda pendiente la conveniencia de
      **totales** (F2.c, opcional: hoy ya se hacen a mano, son filas estáticas con agregados).
- [x] **Cabeceras del Tablix · F2.a (sesión 2026-09-28)**: proyección y lienzo de
      **`TablixHeader`** (bandas de cabecera de columna/fila: grosor = `Size` del miembro,
      largo = filas/columnas que cubre) y **`TablixCorner`** (esquina), con un `offset` que
      desplaza la rejilla del body; el marco mide cabeceras + rejilla y las cabeceras se
      seleccionan como contenido anclado. En `Tablix7` ya se ven `Textbox72/73/75` y
      `VATIdentifier_VatAmountLine`.
- [x] **Grupos de fila del Tablix · F2.b (sesión 2026-09-29)**: `setGroupExpression`
      (edita la expresión del grupo y sincroniza su ordenación si la espejaba),
      `addRowGroup` (envuelve una fila en un grupo nuevo — `Group` + orden por la
      expresión + `TablixMembers` — sin tocar el body) y `deleteRowGroup` (quita el
      grupo: un grupo hoja deja la fila estática; un grupo con hijos **eleva las
      filas** al padre; con cabecera con contenido se rechaza). Los **grupos hoja**
      de BC (`Tablix2 · Details`, `Tablix7`) se clasifican por `expression` y se
      pintan como grupos en el árbol; cada fila estática tiene un botón para
      **agruparla**. El undo es byte-exacto (se recuerda la indentación al
      desprender nodos).
- [x] **Propiedades del grupo · F2.b.2 (sesión 2026-09-29)**: el lápiz de cada grupo
      abre un diálogo con **General** (nombre + expresiones con desplegable de
      variables y `fx`), **Saltos de página** (`Between`/`Start`/`End`),
      **Ordenación** (lista con A→Z/Z→A y mover/eliminar) y **Visibilidad**
      (Mostrar/Ocultar/expresión + `ToggleItem`). «Aplicar» manda **solo las
      secciones cambiadas** (un comando por sección, un paso de undo cada una):
      `setGroupExpressions`, `setGroupPageBreaks`, `setGroupSorting`,
      `setMemberVisibility` y `setMemberToggleItem`.
- [x] **Extender grupos y filas dentro/fuera · F2.b.3 (sesión 2026-09-29)**:
      `addRowToGroup` mueve una fila **contigua** al grupo (botones ↑/↓ en su
      cabecera: «Añadir la fila N al grupo»; los grupos hoja lo rechazan),
      `addRowInsideGroup` añade una fila **dentro** del grupo pegada a la fila
      (convierte los grupos hoja en contenedor conservando su fila) y
      `addRowOutsideGroup` la añade pegada al borde exterior, desde el **menú
      contextual de celda** estilo RB (_Dentro del grupo_ / _Fuera del grupo_ +
      **Propiedades del grupo…**).
- [x] **Visibilidad (F2)**: de **items** (`setVisibility`: Visible / Oculta / Expresión…;
      la predeterminada es visible; la proyección lee `Visibility > Hidden` y los ocultos se
      pintan **atenuados** en el lienzo) y de **filas/columnas/grupos** del Tablix
      (`setMemberVisibility` con **ojo** y **Σ** en el árbol de Estructura). Undo byte-exacto.
- [x] **Panel de propiedades editable**: **nombre** (`setName`, único, sincroniza
      `rd:DefaultName`), **etiqueta `<Label>`** del run (inline en el caso simple) y **color de
      fondo** literal o **expresión** (diálogo Monaco con números de línea). El selector de color
      agrupa la ráfaga del arrastre en **un solo comando** (commit diferido).
      Los botones de **color de texto/resaltado** (barra de formato y editor de runs, componente
      `ColorButton`) muestran la «A» **legible en ambos temas** —barra inferior con el color en el
      texto, tesela con la letra en color de contraste en el resaltado—, centrados y con anillo en
      la muestra (antes la «A» se pintaba con el color elegido y en modo oscuro desaparecía).
- [x] **Fixes de lienzo/edición (sesión 2026-09-25/28)**: **autocompletado** visible (host de
      overflow con la clase `monaco-editor`, `pointer-events` y z-index), **marco de selección**
      por adorno propio (un Tablix ya no mide el borde de su anidado) y **autocerrados**
      (`<X />`) que recuperan su formato tras el undo.
- [x] **E2E con Playwright sobre Electron** (`pnpm e2e`, `e2e:run` sin recompilar): selección
      por borde y por celda, arrastre real de cabeceras con undo, click interno + Esc, estructura
      (añadir/quitar filas y columnas), menú contextual, anclaje/recorte del contenido, refresco
      de la rejilla, cabeceras (Shift/Ctrl), borrado en lote, fusión/separación, colores-expresión,
      autocompletado (panel y diálogo), visibilidad (items y miembros), renombrado, etiqueta,
      cabeceras del Tablix y **grupos** (propiedades del grupo, agrupar, extender, filas
      dentro/fuera del grupo —también grupos hoja—, quitar, con undo; de **columna** en
      F3: agrupar y extender con undo; con reset del documento entre tests).
- [x] **Tablix visual completo** (F2): [x] celdas y filas/columnas · [x] visibilidad (items y
      miembros) · [x] `TablixCorner`/`TablixHeader` · [x] grupos de fila · [x] grupos de
      columna (Matrix, F3: agrupar/extender/quitar con undo) · [x] totales del grupo (F2.c:
      `addTotalRow` con `Sum`/`First` por columna y el submenú «Total del grupo»).
- [x] **Bloque de gaps · G1–G13 (sesión 2026-09-29)**: **insertar Tablix**
      (rejilla 1×1 con celda y ambas jerarquías), **bordes por lado** (genérico
      `Border` + overrides de BC con la herencia resuelta propiedad a propiedad,
      panel de 4 lados y pintado en el lienzo), **`moveItem`** (reparentar/
      reordenar con validación de ciclos, `Top/Left` opcionales, crecimiento del
      destino y drag&drop que conserva el punto agarrado; undo byte-exacto),
      **opciones del item** (`CanGrow`/`KeepTogether` con checkboxes), **z-order**
      («Traer al frente»/«Enviar atrás» con rebase de hermanos), **bandas de
      página** (`setRegionHeight`/`setHeaderFooterOptions` + campos en
      «Informe…»), el hook `moveItem` renombrado a `moveTo`, **insertar en
      cabeceras/esquina del Tablix** (scopes `tablixHeader`/`tablixCorner` y
      hit-test de huecos vacíos), **saltos de página de items**
      (`setItemPageBreak`), **filtros del Tablix** (diálogo «Filtros…» en la
      estructura), **renombrar grupo**, **padding por item** y **catálogo de
      imágenes embebidas** con desplegable en el panel de imagen.

- [x] **Ajustes de las pruebas manuales (2026-09-29, 2.ª parte)**: mover un
      rectángulo/Tablix ya no intenta reparentarlo dentro de sí mismo; el
      **Tablix se puede borrar** desde el menú contextual (hit del borde +
      acciones de la selección cuando el click cae en vacío); **«Orden»** también
      para items dentro de celdas de Tablix; y el **Tablix nuevo nace 2×3**
      (2 filas × 3 columnas, celdas de 2,5 × 0,6 cm con Textbox en las 6 celdas).

**Calidad (sesiones 2026-09-16 a 2026-09-29):**

- [x] **Pendientes M1–M7** cerrados (id al duplicar, aviso al cerrar, motivo de recarga,
      zIndex en pintado y hit-test, `<Code>` vacío, nombres elegidos por el backend,
      limpieza de la selección tras undo/redo).
- [x] **`react-doctor` 100/100 con 0 issues** (el único falso positivo — `prefer-dynamic-import`
      sobre `monacoSetup.ts`, que ya se carga en diferido — queda acotado en
      `apps/front/doctor.config.json`).
- [x] **`react-doctor` 51 → 82 → 100**: `App` partido en
      `useDocumentCore`/`useItemEditing`/`useGlobalKeys` + `EditorToolbar`, `CanvasArea`,
      `ItemPanels`, `StatusBar`; el lienzo en `Paper`/`SelectionFrame`/`Ruler`/`ItemView`.
- [x] **Ajustes de la sesión 2026-09-22**: el click derecho conserva la selección de celdas
      (cadena de celdas del hit, con tablixes anidados), la fusión solo aplica a tramos
      contiguos de una misma fila (también con celdas sueltas de Ctrl+click), separar crea un
      textbox vacío, insertar en una celda toma su tamaño y el banner de error pierde el código
      y se cierra solo (6 s). Corregida la herencia de tamaño en celdas con fusiones (columna
      acumulada por `ColSpan`) y la rejilla (segmentada: sin líneas dentro de celdas fusionadas).
- [x] **Sesión 2026-09-23/24**: editor de texto del Textbox (textarea del documento con
      marcadores de etiqueta/expresión, bloque del párrafo activo con formato por run y Monaco
      inline), lienzo fiel al estilo RDL (texto por run con alineación de párrafo y texto de
      diseño `[etiqueta]` / campo / `[exp]`) y marco de selección medido por la caja del item.
- [x] **Sesión 2026-09-29**: grupos de fila (F2.b: propiedades, extender, dentro/fuera del
      grupo, grupos hoja) y undo byte-exacto al reinsertar/mover nodos (indentación recordada) ·
      **bloque de gaps (G1–G13)** con un commit por gap · **400 unit tests**
      (266 back + 134 front) + **50 E2E** de Playwright y `typecheck` limpio.
- [x] **Sesión 2026-10-02 · T1–T3**: **CI** (`.github/workflows/ci.yml`: typecheck + unit en
      ubuntu y E2E en windows) y **empaquetado** ([doc](./release/0001-empaquetado-windows.md):
      electron-builder NSIS+MSI, XSD fuera del asar, firma opcional por secretos y `release.yml`
      en tags) · **endurecimiento de Electron** (sandbox con preload CJS bundleado,
      navegación/ventanas/permisos bloqueados, 3 E2E de seguridad) · **rendimiento del lienzo**
      (culling por ventana visible, `perfectDrawEnabled:false` y rejilla cacheada;
      **59,5–59,9 fps p50** con 972 textboxes, [perf](./perf/0001-baseline-lienzo.md)).
      Estado: **306 back + 189 front** unit + **78 E2E** verdes.

- [x] **Sesión 2026-10-02 (2.ª parte) · `.rdl`**: Abrir/Guardar, argumento CLI y
      drag&drop aceptan `.rdlc` y `.rdl`; RDL y RDLC comparten el esquema 2016/01
      (misma edición y round-trip) y un RDL anterior a 2016 se rechaza al abrir con un
      motivo accionable (`E_UNSUPPORTED_SCHEMA`). **309 back + 189 front** unit y
      **80 E2E** verdes.

- [x] **Sesión 2026-10-02 (3.ª parte) · fusión SSRS/BC**: BC/SSRS escriben **una
      celda por columna** y dejan celdas de relleno vacías bajo cada `ColSpan`;
      la proyección y el lienzo las contaban como columnas y todo lo posterior a
      una fusión se desplazaba (p. ej. `Cust_Vend_Name` de
      `VendorPrePaymentJournal.rdl` caía en la columna 9 en vez de la 8, y el
      `TextBox` de 4 columnas desbordaba la rejilla). Ahora `positionedCells`
      detecta la convención (índice = columna; sin rellenos → acumulación) y el
      adaptador proyecta solo las anclas. Los comandos mantienen la convención
      (fusionar vacía el relleno sin quitarlo, separar lo rellena, añadir/quitar
      columna crea/elimina su relleno) y el scope de una celda usa la columna de
      rejilla. Además, el `DocumentIndex` solo indexa **items de informe**: BC
      reutiliza `Name` en campos de DataSet y un campo llamado como un textbox
      pisaba su entrada (al editar borde/color el `<Style>` acababa en el
      `<Field>` y el padding del item se «reseteaba» en el lienzo).
      **316 back + 190 front** unit y **80 E2E** verdes.

- [x] **Sesión 2026-10-02 (4.ª parte) · compatibilidad con Report Builder**: RB
      exige **una `TablixCell` por columna**; si una fila tiene menos (o más),
      lanza «El índice estaba fuera del intervalo» al abrir el `.rdl`. Ahora
      `mergeCells` **vacía** las celdas cubiertas en vez de quitarlas, y
      `addColumn` decide el destino de cada fila **antes** de tocarla (antes leía
      la fila mutada con el recuento de columnas viejo y duplicaba celda:
      `TextboxN` + relleno). `ListStyle` (viñetas/numeración) se escribe y lee
      como **hijo directo de `<Paragraph>`** (el XSD no lo admite en `<Style>`:
      el guardado fallaba con `E_VALIDATION`); el comando limpia además los
      nodos legados de versiones anteriores. La edición en lote de **celdas**
      mapea el rango por columna de rejilla (`selectedCellContents`), no por el
      índice del array: con fusiones editaba otros textboxes. Y las fuentes se
      replican en los **runs** (BC/RB las resuelven ahí; con solo el `<Style>`
      del item, un textbox nuevo se veía a Arial 10 en Report Builder), también
      al reemplazar párrafos. **323 back + 192 front** unit y **80 E2E** verdes.

- [x] **Sesión 2026-10-02 (5.ª parte) · informes «en blanco» en Report Builder
      (split+merge)**: dos bugs de compatibilidad RB. (1) Los items que entran en
      una banda (cuerpo/cabecera/pie) ya **materializan `Top/Left/Width/Height`**
      (`bandGeometry.ts` en `moveItem`/pegar/duplicar): RB estiraba al tamaño de
      la banda el item sin longitudes (contenido de celda movido o pegado al
      cuerpo) y su fondo blanco tapaba el `list1` entero → parecía vacío.
      (2) La unicidad de nombres es **sin distinguir mayúsculas** (RB resuelve con
      VB): `Textbox3`/`textbox3`, `Textbox6`/`textbox6`… invalidaban el informe.
      Fix en `DocumentIndex.has`, `nextItemName`/`freeName`, `setName` (permite
      cambiar solo la caja del propio nombre) y nombres de grupo. **+4 tests**:
      **327 back** unit y `typecheck` limpios. Diagnóstico con **Report Builder 15**
      y capturas de ventana; reparación de ficheros ya rotos documentada en
      Pendientes.

- [x] **Pestañas (una por informe)** y **resiliencia del ciclo de vida** (2026-10-08/09):
      varios informes abiertos a la vez con undo, `dirty`, conflicto y watcher
      independientes; reordenar por arrastre o teclado, menú contextual de cierre
      (otras / derecha / guardadas / todas) y guarda «Guardar todas»; recuperación tras
      una caída de la interfaz, conflicto al guardar, fichero borrado por fuera y
      operaciones de fichero por sesión. Detalle en
      [`docs/bugs/0002-resiliencia-2026-10-08.md`](./bugs/0002-resiliencia-2026-10-08.md).

- [x] **CI por PR (2026-10-13)**: el pipeline
      ([`ci.yml`](../.github/workflows/ci.yml)) pasa a ejecutarse **solo en pull requests
      hacia `main`** y separa los checks: **Format** (`pnpm format:check`, Prettier),
      **Lint** (ESLint con config plana en la raíz; hooks de React en el renderer),
      **Typecheck** (`tsc --noEmit`), **Unit tests** (Vitest) y **E2E** (Playwright sobre
      Electron en Windows, con trazas si falla). Repo formateado una vez con Prettier y
      resuelta la deuda real que destapó ESLint (imports y variables sin usar, escapes
      innecesarios, asignaciones muertas).

- [x] **Cámara del lienzo — memoria del zoom (2026-10-20)**: el `Stage` medía el
      papel entero a `papel × zoom` y cada capa asigna un canvas de ese tamaño (un A4 a
      400 % son 3176 × 4492 px, ~57 MB por canvas): el renderer llegaba a **310 MB** de
      working set y el pico se repetía en cada paso de zoom. Ahora el stage cubre la
      **ventana visible** (hueco + margen, cuantizada en px de pantalla) y desplaza el
      contenido con `x`/`y`; el scroll sigue siendo solo compositor (sin JS por frame).
      A 400 %: **272 → 34 MB** de canvas de escena y **310 → 220 MB** de renderer, y ya
      no crece con el zoom ni con el tamaño de página. Detalle y medición en
      [`docs/perf/0002-camara-lienzo-zoom.md`](./perf/0002-camara-lienzo-zoom.md); los
      ganchos de QA y los guiones E2E suman `stage.x()/y()` al pasar de px de papel a
      pantalla.

- [x] **Menú contextual del Tablix (2026-10-21)**: el click derecho dentro de una tabla
      caía siempre en la celda o en el contenido de esta, así que «Orden» (Traer al
      frente / Enviar atrás) solo se alcanzaba por atajo tras seleccionar la tabla por su
      borde. Ahora el **borde** de la tabla (el mismo anillo de 4 px del click izquierdo)
      y las **cabeceras de fila/columna y esquina** del marco mandan la tabla en el menú
      contextual, con sus acciones (Orden incluido). Además, un click derecho **fuera del
      papel** limpia el destino del menú: quedan las acciones de la selección, sin
      Insertar/Pegar (antes se colaba el hit del click derecho anterior).

Estado detallado, **backlog de gaps auditado** (G/U/T, 2026-09-29) y punto de retomada: [`RDLC Report Designer - Pendientes.md`](../RDLC%20Report%20Designer%20-%20Pendientes.md).
