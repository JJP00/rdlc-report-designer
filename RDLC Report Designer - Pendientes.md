# RDLC Report Designer — Puntos pendientes (gaps del plan)

> **Sesión 2026-10-01 (3.ª parte) · pruebas manuales: dos arreglos de U10** —
> feedback del uso real sobre el redimensionado de página:
>
> - **Previsualización del pie**: la guía se pintaba en `footerBase` (pegada al
>   margen inferior) en vez de en el **nuevo borde superior** del pie. El
>   comando era correcto; solo fallaba la posición de la línea. El E2E ahora
>   asevera también la **posición de la línea** (encabezado: margen superior +
>   alto; pie: fondo − alto), así que el bug no pasaría.
> - **El ancho de sección no baja del contenido**: el cuerpo nunca queda a la
>   izquierda de sus items. El dominio clampa `setSectionWidth` al borde derecho
>   más lejano de los items de **primer nivel** de las tres bandas (si el
>   contenido sobresale, la sección crece; clamp visible en el arrastre con
>   `sectionContentMinCm`, y no-op byte-exacto si el valor no cambia). Es la
>   misma regla que el crecimiento de rectángulos: colocar items ya está clampado
>   al cuerpo, así que la única vía de fuga era encoger.
> - **Estabilización E2E**: el test del menú de celda clicaba un item de submenú
>   Radix que se re-monta («element is not stable»); ahora usa
>   `clickMenuItem` (espera visible + `dispatchEvent('click')`), espera al cierre
>   del menú antes de reabrirlo y **recalcula el punto** (el lienzo se
>   re-encuadra tras la interacción). `undoAll` tolera outcomes **sin inversos**
>   (comandos no-op).
>
> Verificación: **300 back + 180 front**, typecheck limpio; E2E dirigidos verdes
> (bandas, márgenes, clamp de sección y menú con `--repeat-each=3`). **Pendiente:
> pasada completa de la suite E2E** (75 tests) en la próxima sesión + commit de
> cierre si todo está verde.
>
> **Punto de retomada**: ① pasada completa de E2E; ② sigue **T1** (CI +
> empaquetado); ③ abiertos el bug de `Maximum update depth exceeded` y los
> P2/P3 de 0002. **Nota**: `docs/features/0001-capas.md` (y su línea del README)
> siguen siendo trabajo del usuario, sin tocar.

> **Sesión 2026-10-01 (2.ª parte) · F2.c · fila de totales del grupo** — el
> «Añadir total» del plan: insertar la fila de agregados **antes o después del
> grupo** con las expresiones ya precargadas por columna.
>
> - **Contrato**: `addTotalRow` (fila estática pegada al grupo, como
>   `addRowOutsideGroup`; encima = antes de su primera hoja, debajo = después
>   de la última).
> - **Dominio**: el comando infiere el agregado de cada columna desde el
>   **detalle del grupo** (la última fila de su rango con una expresión de **un
>   solo campo** — vale `=Fields!X.Value`, `=Sum(Fields!X.Value)` o
>   `=Format(Fields!X.Value)`; las de varios campos se ignoran) y desde el
>   propio informe: si el campo aparece en algún `Sum(` del documento →
>   `=Sum(Fields!X.Value, "Grupo")`; si no → `=First(..., "Grupo")` (totales de
>   campos no aditivos). Undo byte-exacto: la fila entera se crea y se quita.
> - **Front**: submenú **«Total del grupo»** en el menú contextual de una celda
>   (solo si su fila está dentro de un grupo) con «Fila de total encima» y
>   «Fila de total debajo».
> - **Fix de proceso**: los comandos que crean celdas con **textbox con
>   nombre** (`addRow`, `addRowOutsideGroup`, `addRowInsideGroup`,
>   `addTotalRow`, `addColumn`) fuerzan la **reconstrucción del índice**: sin
>   ella, dos inserciones seguidas podían reutilizar el mismo `TextboxN` (test
>   de regresión a nivel de servicio).
>
> Verificación: **5 tests back nuevos** (`tablix-totals.spec.ts` +
> unicidad de nombres), **E2E de totales** desde el menú (Sum/First reales de
> `LinesTable2`) y React Doctor **100/100**. **Suite completa: 75 E2E verdes**.
>
> **Punto de retomada**: F2.c **cerrado**; lo siguiente del plan es **T1** (CI +
> empaquetado). Quedan abiertos el bug de `Maximum update depth exceeded` y los
> P2/P3 de 0002.

> **Sesión 2026-10-01 · U10 · redimensionado de página en el lienzo** — pedido
> en las pruebas manuales: además de los altos de encabezado/pie, poder
> **arrastrar los límites** en el lienzo (cuerpo, bandas, márgenes y ancho del
> informe) con la misma previsualización que el redimensionado de celdas
> (línea discontinua + cm), y **marcas en la regla** estilo Word/Report Builder.
>
> - **Contrato/dominio**: `setRegionHeight` acepta `body`
>   (`ReportSection > Body > Height`, con orden canónico `ReportItems, Height,
Style`) y nuevo **`setSectionWidth`** (`ReportSection > Width`, estructural:
>   manda en el ancho de las tres bandas). Undo byte-exacto y XSD válido.
> - **Lienzo** (`PageResizeLayer`): zonas en el borde inferior del encabezado y
>   del cuerpo, el superior del pie y el derecho de la sección. Al soltar, **un
>   comando por gesto**; imán de 0,1 cm (Shift lo desactiva) y la
>   previsualización usa **la misma matemática** (`lib/pageResize`) que el
>   commit.
> - **Reglas estilo Word**: marcadores de margen **arrastrables** (izq/der en
>   la horizontal; sup/inf en la vertical, también con flechas del teclado) con
>   previsualización en el lienzo, y **tramos resaltados**: área imprimible en
>   ambas reglas y bandas de **encabezado/pie delimitadas en la vertical**
>   (como la regla de Report Builder).
> - **«Informe…»** gana el campo «Alto del cuerpo (cm)».
> - **Fix de sensibilidad**: el delta de las zonas Konva se medía desde
>   `dragstart`, que en Konva llega **después de su umbral de 3 px**; ahora se
>   ancla en `mousedown` (el gesto no pierde ese tramo). Aplicado también al
>   redimensionado de cabeceras del Tablix, que arrastraba el mismo defecto.
> - **Fix de capas (lo destapó la pasada completa)**: las zonas de página,
>   estando **encima del papel**, se comían clics donde el contenido toca el
>   borde de una banda (14 tests de selección fallaban). Ahora las zonas van
>   **bajo el papel** (el contenido siempre gana el clic; la línea se agarra en
>   los tramos libres) y la previsualización vive en una capa superior sin
>   `listening`. El E2E busca el punto libre con `getIntersection` muestreando
>   desde los extremos libres (margen izquierdo en las bandas, inferior en la
>   sección).
> - **Verificación**: **294 back + 178 front**, typecheck limpio, React Doctor
>   **100/100** y **5 E2E nuevos** (bandas, ancho de sección, márgenes y tramos
>   de regla). **Suite completa: 75 E2E verdes** (los 14 fallos de la primera
>   pasada quedaron cerrados con el fix de capas).
>
> **Nota**: `docs/features/0001-capas.md` y su línea en el README son trabajo
> del usuario: **no se han tocado**.

> **Sesión 2026-09-30 (5.ª parte) · F3 · Matrix — grupos de columna** — el
> grueso funcional que quedaba de la fase 3: la edición visual de la
> `TablixColumnHierarchy` (el corpus trae un grupo hoja real en
> `BTCLoadingOrder.rdlc · Tablix2`). Todo el trabajo es **espejo del de filas**:
>
> - **Contrato**: `addColumnGroup` (envuelve una columna del body en un grupo
>   nuevo con su expresión) y `addColumnToGroup` (mueve al grupo una columna
>   **contigua** a su rango de hojas), con la misma forma que `addRowGroup`/
>   `addRowToGroup`.
> - **Dominio**: los cuatro comandos se apoyan ahora en helpers por eje
>   (`addLeafGroup`/`addLeafToGroup` + `leafLabels`, con mensajes
>   «fila/columna»); la rejilla (`TablixBody > TablixColumns`) no cambia — la
>   hoja se anida en el grupo — y el undo es byte-exacto. Se conservan las
>   decisiones de F2.b: un grupo hoja se envuelve **por fuera** sin tocar su
>   fila/columna, los grupos hoja no admiten más hojas (se rechaza con motivo) y
>   `addColumnGroup` **no crea cabecera** (BC las pone en `TablixHeader`).
> - **Front**: en el panel de Estructura, la columna estática ofrece «Agrupar la
>   columna N…» (diálogo de expresión con Monaco) y los grupos de columna
>   ofrecen las flechas ↑/↓ («Añadir la columna N al grupo») igual que los de
>   fila; «Propiedades del grupo» y el árbol ya eran por eje desde F2.b/F3 de
>   lectura.
> - **Refactor de acabado**: el cableado del panel derecho sale de `App` a
>   `InspectorColumn` (mismo patrón que `CanvasColumn`/`LeftPanels`): el cuerpo
>   de `App` había cruzado el umbral de 300 líneas de
>   `react-doctor/no-giant-component` y vuelve a **100/100, 0 issues**.
>
> Verificación: **6 tests back nuevos** (`tablix-column-groups.spec.ts`:
> envolver una columna estática y un grupo hoja, extender con la contigua +
> rechazos de no contigua/ya incluida/grupo hoja, y `setGroupExpression` en el
> eje columna con su ordenación sincronizada), **2 E2E nuevos** (agrupar una
> columna y extender el grupo, ambos con undo) y la **suite completa: 69 E2E
> verdes**. `typecheck` limpio.
>
> Estado: **291 back + 168 front**, React Doctor **100/100** y **69 E2E**.
>
> **Punto de retomada**: F3 queda **cerrado** salvo la inserción de columnas
> «dentro/fuera del grupo» (el equivalente del menú de celdas de las filas; con
> un solo grupo de columna en el corpus, no se pide). Lo siguiente del plan:
> **F2.c** (conveniencia de totales, opcional) y cerrar con **T1**
> (CI/empaquetado). Siguen abiertos el bug de `Maximum update depth exceeded`
> al mover Tablix anidados y los P2/P3 de la re-evaluación 0002.

> **Sesión 2026-09-30 · pase UX U1–U5 (vida de fichero, conflicto, multiselección, jerarquía y z-order) + re-evaluación `intent`** —
> en paralelo con la 4.ª parte (U6–U9), sobre el mismo árbol. **U1–U5 hechos**:
>
> - **U1 · Guardar como / Nuevo / recientes / drag&drop + guardas**: contrato y backend
>   (`createNew` con **plantilla en blanco XSD-válida**, `saveAs`, `reload`, diálogo de
>   guardado, **recientes** persistidos en `userData` podando los que ya no existen) y
>   front (`useDocumentCore` con **intenciones pendientes** y diálogo propio
>   «Guardar y abrir / Abrir sin guardar / Cancelar»; `useFileDrop`). La sesión anterior se
>   **cierra al abrir otra** (sin fuga de watcher). **Ctrl+S / Ctrl+Shift+S / Ctrl+N / Ctrl+O**.
>   El cierre de ventana (X/Alt+F4/quit) pasa por el **main** y decide el front; si el
>   documento volvió a su estado en disco (`refreshDirty` al deshacer/rehacer) ya no pide guardar.
> - **U2 · Conflicto completo**: diálogo **Recargar desde disco / Guardar y sobrescribir /
>   Guardar como…** (+ «Resolver…» en el aviso), sin perder nada mientras se decide.
> - **U3 · Multiselección + lote**: comando **`batch`** (contrato + dominio + tests
>   byte-exactos y atómico si un hijo falla) y en el front **Ctrl/Shift+click**, marcos
>   discontinuos, panel de lote (fuente/tamaño/N/I/S/color/fondo, **alinear**, **distribuir**,
>   borrar) aplicado en **un solo paso de undo**. **Pendiente acordado**: marco de selección
>   (arrastrar en vacío) y duplicar/copiar/cortar en lote (ver re-evaluación 0002).
> - **U4 · Jerarquía/breadcrumb**: `lib/hierarchy.ts` (ruta de contenedores + árbol con
>   celdas, con tests), barra de **breadcrumb** clicable sobre el lienzo y panel de
>   **Jerarquía** conmutables desde la toolbar.
> - **U5 · Z-order**: atajos **Ctrl+Shift+]** / **Ctrl+Shift+[** y pistas en el menú.
> - **Cierre**: re-evaluación `intent` → `/evaluate` en `docs/ux/0002-evaluacion-ux.md`
>   (**86/100**, sin P0/P1; P2 = lote incompleto, estados mixtos en el panel, iconos sin
>   etiqueta y sin hoja de atajos). React Doctor **100/100** tras extraer
>   `WorkspaceDialogs`/`CanvasColumn`/`LeftPanels` y los hooks `useFileDrop`/`useEditorKeys`/
>   `usePaletteActions`. Estado: **283 back + 162 front**, `typecheck` limpio y **63 E2E** verdes.
>
> **Punto de retomada**: completar U3 (marco de selección + duplicar/copiar/cortar en lote)
> y los P2/P3 de 0002 (estados mixtos, etiquetas de alinear, hoja de atajos, toolbar/estado).
>
> **Cierre de U3 (misma sesión, tras la re-evaluación) — ✅ hecho**:
>
> - **Marco de selección**: arrastrar en vacío pinta el marco (coordenadas del papel con
>   `getRelativePointerPosition`) y adopta como multiselección los items que intersecta;
>   el click sintético posterior no limpia la selección. Hook `useMarqueeSelection`.
> - **Duplicar en lote**: `Ctrl+D` con 2+ seleccionados → `batch` de `duplicateItem`, **un
>   undo**, y el resultado devuelve `ids` (`applyBatch` acumula `createdIds`) para
>   seleccionar los clones.
> - **Portapapeles múltiple**: `copy`/`cut` aceptan `ids`, el portapapeles guarda varios
>   subárboles y `paste` inserta `insertClones` (nombres únicos compartidos, un solo undo,
>   índice reconstruido). Cortar varios = copiar + `batch` de borrados (un undo).
> - **Lote por celdas**: con un rango de celdas seleccionado, el panel de lote edita los
>   **contenidos** de esas celdas (cabecera «N celdas», sin alinear/distribuir porque están
>   ancladas); hook `useBatchSelection`.
> - **Feedback de uso aplicado**: toolbar responsive (scroll + etiquetas plegables),
>   panel de lote con **selector de fuente**, tamaño legible, **bordes/padding/visibilidad**
>   y **estilos efectivos** (Arial/10pt/Visible por defecto; editar un lado mezclado se
>   permite, marcado «—»), **Jerarquía colapsable + buscador**, panel de **Variables**
>   unificado al look de Jerarquía, y submenús del menú contextual sin recortes.
>
> Estado: **285 back + 168 front**, `typecheck` limpio, **67 E2E** verdes y React Doctor
> **100/100**.
>
> **Punto de retomada actualizado**: quedan los P2/P3 de 0002 (etiquetas visibles de
> alinear/distribuir, hoja de atajos, error persistente, barra de estado) y, del plan,
> el bug de `Maximum update depth exceeded`, la fase F2.c → F3 y los técnicos T1–T5.

> **Sesión 2026-09-30 (4.ª parte) · pase UX U6–U9 (zoom, paleta, agrupar la fila, teclado/ARIA)** —
> segunda sesión trabajando **en paralelo** sobre el mismo árbol (la otra cubre U1–U5:
> guardar como/nuevo/recientes, conflicto, multiselección, jerarquía y z-order; documentará
> su parte). Aquí queda **U6–U9**:
>
> - **U6 · zoom «ajustar al ancho»/100 %**: `lib/zoom.ts` (límites 20–200 % y la
>   matemática de ajuste, con tests); el **porcentaje de la toolbar abre un menú** con
>   «Ajustar al ancho», «Tamaño real (100 %)» y presets (50/75/125/150/200 %); el lienzo
>   **mide su hueco real** (ResizeObserver, sin paddings ni reglas) y publica el zoom de
>   ajuste. Atajos nuevos **Ctrl+1** (ajustar) y **Ctrl+0** (100 %), válidos también con
>   el foco en un campo.
> - **U7 · paleta Ctrl+K**: las acciones declaran su contexto (`needs:
document/textbox/tablix`) y la paleta las habilita/deshabilita sola
>   (`paletteDisabledActions`, con tests); se añaden **Cerrar informe**, **Ajustar al
>   ancho**, **Zoom 100 %**, **Editar el texto del textbox…** (abre el editor de runs) y
>   **Filtros del Tablix…**. «Guardar como»/«Nuevo»/recientes entran con U1 (otra sesión).
> - **U8 · «Agrupar la fila…» en el menú contextual**: con una fila **estática** (sin
>   grupo) el click derecho la agrupa con el mismo diálogo de expresión que el ⊕ del
>   árbol (`addRowGroup`); si la fila ya está en un grupo se mantiene «Propiedades del
>   grupo…» (espejo exacto del árbol de Estructura).
> - **U9 · teclado y ARIA de los diálogos nuevos**: **Ctrl+S / Ctrl+Shift+S / Ctrl+O /
>   Ctrl+N** (guardar/guardar como/abrir/nuevo) y **Ctrl+K ya no se abre encima de un
>   diálogo**; **Ctrl+Intro aplica** los diálogos de expresión, grupo, filtros del
>   Tablix, texto y propiedades del informe (el de expresión recibe el **valor vivo**
>   del editor, sin borradores de un render anterior); el botón de cerrar de los
>   diálogos se anuncia en español («Cerrar»); la barra de estado vive en un
>   `role="status"`.
>
> Verificación: **148 unit front** (137 → 148), `typecheck` de front y contratos limpio,
> y **55 E2E** del diseñador (51 → 55) verdes en pasada completa sobre el build final.
> Los 4 E2E nuevos cubren: presets/atajos de zoom, acciones nuevas de la paleta,
> agrupar la fila por menú contextual (con Ctrl+Intro) y Ctrl+S / Ctrl+K con diálogo.
>
> **Punto de retomada**: U1–U5 los cierra la sesión paralela; después sigue ③ la fase
> (**F2.c** totales → **F3** Matrix) y quedan abiertos el bug de `Maximum update depth
exceeded` al mover Tablix anidados y el resto de T1–T5.

> **Sesión 2026-09-30 (3.ª parte) · resuelto el E2E flaky del arrastre (aislamiento entre tests)** —
> la carrera que quedó en la retomada anterior era del **harness**: `resetDocument`
> comparaba la versión 20 ms después del `Ctrl+Z` y podía cortar con el undo aún en
> vuelo (o con un commit diferido sin llegar), dejando el estado del test anterior a
> medias para el siguiente (el arrastre del panel Estructura terminaba en 9,8259).
> Arreglos:
>
> - **`resetDocument` por huella** (`e2e/rdlc-designer.spec.ts`): la parada ya no es un
>   timeout fijo sino la **huella del documento** (proyección sin `version`) igual a la
>   del informe recién abierto; cada undo espera el **cambio real de versión**
>   (`waitForFunction`, 1 s) y, tras converger, una **ventana de calma de 450 ms**
>   absorbe los commits **diferidos** (ráfagas de flechas/color, 250–400 ms). Si no
>   converge, falla con la versión y el texto de la barra de estado (antes: silencio y
>   contaminación del test siguiente).
> - **Guarda de versión en el front** (`useDocumentCore`): `onDocumentChanged` **ignora
>   los snapshots con versión anterior** a la proyección viva; un evento retrasado o
>   duplicado ya no puede pisar un estado más nuevo.
> - **Test del arrastre**: antes del scrub se espera a que el input muestre el valor
>   medido (`toHaveValue`) y a que **no tenga foco** (con foco el gesto coloca el cursor
>   en vez de arrastrar); la base del commit es exactamente la del aserto.
>
> Verificación: **51 E2E verdes** en pasada completa y **102 verdes con
> `--repeat-each=2`** (cada test dos veces en la misma sesión: el aislamiento es real);
> **410 unit** (273 back + 137 front) y `typecheck` limpio.
>
> **Punto de retomada**: probar en la app los editores de tamaño de Estructura
> (tecleo/flechas/arrastre) y que Ctrl+Z refresca al instante; después **U3**
> (multiselección + edición en lote) y el bug de `Maximum update depth exceeded` al
> mover Tablix anidados, que siguen abiertos.

> **Sesión 2026-09-30 (2.ª parte) · editores de tamaño en Estructura + NumberInput estándar** —
> tamaños de filas/columnas editables en el panel Estructura con **tres formas de cambio**
> (teclear con Enter/Escape, **flechas ↑/↓** y **arrastre sobre el valor** con cursor de
> redimensionado), y **el contenido de las celdas acompaña al redimensionado**:
>
> - **Sincronización de contenido en el back** (`resizeTablix.ts`): al redimensionar
>   columna/fila/tabla se actualizan los `Width`/`Height` **declarados** de los contenidos
>   de las celdas cubiertas (incluida la cabecera); los canónicos sin tamaño declarado
>   siguen por el **fallback de proyección** (la celda manda), sin inventar etiquetas.
>   Undo byte-exacto verificado con cadena delete→insert→resize→undo×3.
> - **`NumberInput` compartido** (`apps/front/src/components/ui/number-input.tsx`):
>   borrador de tecleo (coma→punto, Enter/blur confirma, Escape cancela), flechas ↑/↓ con
>   un commit por clic, **arrastre** con `cursor-ew/ns-resize` que confirma **una sola vez**
>   al soltar (un paso de undo; Escape cancela; clic sin arrastre coloca el cursor). Ejes
>   `x`/`y` con `invert` (la posición Y arrastra hacia abajo = aumenta). Estandarizado en
>   **todos** los campos numéricos: Estructura, Propiedades (X/Y/Ancho/Alto), grosores de
>   borde, tamaño de fuente (toolbar y editor de runs), Informe… (página y márgenes) y
>   padding por lado.
> - **Fix de refresco con Ctrl+Z**: el borrador del arrastre no se limpiaba en la ruta de
>   commit y el panel Estructura quedaba clavado con el valor arrastrado hasta cambiar de
>   tabla; ahora `finish()` limpia el borrador **siempre**, así que Ctrl+Z se refleja al
>   momento.
> - **Tests**: 273 back + 137 front verdes, `typecheck` limpio. E2E: 50 pasan; en la última
>   pasada completa quedó **un fallo por resolver** (ver «Punto de retomada»). Ajustes
>   deterministas ya aplicados: `getByLabel(..., { exact: true })` donde las flechas nuevas
>   rompían la resolución estricta (padding y «Alto del encabezado/pie») y el padding
>   espera `'2.00'` (el NumberInput muestra 2 decimales fijos).
>
> **Fallo E2E sin resolver (forense hecha, causa raíz pendiente)** — ✅ **resuelto en la
> 3.ª parte del 2026-09-30 (ver bloque superior)**: era la carrera de `resetDocument`; la
> parada ahora es la huella del documento + ventana de calma, y el front ignora snapshots
> viejos. Se conserva la forense como historial:
>
> «el panel Estructura edita el tamaño…», paso de **arrastre**, solo en pasada completa
> (pasa solo, y con su test anterior, 3× de seguido). Señales del run fallido:
>
> - La columna 0 de `LinesTable2` acabó en **9.8259 cm** = corpus (11.51184) **menos el
>   delta del test anterior** (60 px de cabecera ≈ 1,686 cm); el estado del test previo
>   «volvió a aparecer».
> - La barra de estado quedó en **`Deshecho (v37)`**: lo último aplicado fue **un undo**,
>   no el commit del arrastre (el scrub de `NumberInput` es correcto: se verificó con
>   instrumentación que parte de 11.51, zoom 0.6, selección `LinesTable2`, y commit
>   absoluto +3 cm).
> - La selección acabó en **`Rectangle3`** (contenido de la celda de `Tablix2`, 1×1);
>   ningún test lo selecciona.
> - Descartado: matemática del scrub (correcta), drag Konva «pegado» (los pointer events
>   del panel no llegan al lienzo, x≈1311 > borde derecho del canvas ≈1053), zoom raro
>   (es 0.6 en runs instrumentados), valores 6.8259/9.8259 en el corpus (no existen).
> - **Hipótesis principal**: el hook `resetDocument` (afterEach) puede **quedarse corto**:
>   compara la versión 20 ms tras `Ctrl+z` (`waitForTimeout(20)`) y corta si no cambió,
>   pero la respuesta del undo puede tardar más → deja el documento **a medio deshacer**;
>   un undo «tardío» aplicado durante el test siguiente encaja con `Deshecho (v37)` y el
>   estado reaparecido. Alternativas: snapshot antiguo sobreescribiendo la proyección del
>   front, o `dragend` de Konva disparándose dos veces reenviando el resize viejo.
> - **Plan próximo paso**: endurecer `resetDocument` (esperar el cambio de versión con
>   `waitForFunction`/timeout real en vez de 20 ms), exponer/leer el estado de la barra
>   en el poll para ver qué comando aplica, revisar si el undo del front puede aplicar
>   respuestas fuera de orden, y repetir la pasada completa varias veces.
>
> **Punto de retomada**:
>
> 1. ✅ **Resuelto (3.ª parte, 2026-09-30)**: fallo E2E del arrastre — `resetDocument`
>    por huella + ventana de calma y guarda de versión en el front (ver bloque superior).
> 2. **Probar en la app** los editores de tamaño de Estructura (tecleo/flechas/arrastre) y
>    el arrastre en el resto de campos estandarizados; verificar que Ctrl+Z refresca el
>    panel al instante.
> 3. **U3 — multiselección de items + edición en lote** (diseño acordado): modos
>    excluyentes item ↔ celda, `Ctrl/Shift+click` y **marco** de selección, panel con
>    propiedades comunes (fuente, tamaño, N/I/S, color, fondo, bordes, padding,
>    visibilidad y `CanGrow`/`KeepTogether`) aplicadas en **un solo paso de undo** con un
>    comando **`batch`** nuevo (el journal ya soporta varios inversos por comando) y
>    botones de **alinear/distribuir**.
> 4. Sigue pendiente el **bug de `Maximum update depth exceeded`** al mover Tablix
>    anidados (ver su sección) y el resto del pase de UX `intent` (U1/U2/U4–U9).

> **Sesión 2026-09-30 · verificación en la app + previsualización del redimensionado** —
> se probó en la app lo pendiente de la sesión anterior (log de comandos sobre
> `SalesCreditMemoESP`): **Tablix 2×3** (7,5 × 1,2 cm, las 6 celdas), **drag de
> contenedores** y **redimensionado** de tabla/filas/columnas, todo `ok=true` y sin
> rastro del bug de `Maximum update depth exceeded` en esa sesión. Feedback del uso:
>
> - **Previsualización al arrastrar bordes de cabecera**: arrastrar el borde de una
>   fila/columna no mostraba nada hasta soltar. Ahora hay una **línea discontinua en
>   la frontera destino + etiqueta con el ancho/alto resultante**, calculada con la
>   **misma matemática que al soltar** (`resizeBoundary`, imán y mínimo incluidos):
>   lo que se ve es exactamente lo que se aplica. Pintada por refs en la capa de
>   selección (sin re-render durante el drag, como la previsualización de los
>   tiradores) y cubierta por E2E a mitad de arrastre.
> - Queda por probar a mano **borrar un Tablix** y **«Orden» en celdas** (los cubren
>   los E2E como regresión: 33 · mover rectángulo, 34 · borrar Tablix, 28 · ZIndex).
>
> Estado: **400 unit tests** (266 back + 134 front), `typecheck` limpio y **50 E2E** verdes.

> **Sesión 2026-09-29 (2.ª parte) · pruebas manuales en la app: fixes y ajustes** —
> feedback del uso real sobre el bloque de gaps G1–G13:
>
> - **Drag de contenedores**: mover un **rectángulo/Tablix** unos píxeles ya no
>   intenta reparentarlo dentro de sí mismo (`No se puede mover un elemento
dentro de sí mismo`): el lienzo ignora los destinos **dentro del propio
>   item** (`scopeInsideItem`) y lo trata como un movimiento normal. El dominio
>   sigue validando ciclos como red de seguridad.
> - **Borrar un Tablix**: el hit-test de un Tablix devolvía solo celdas; ahora,
>   fuera de la rejilla (borde/cabecera sin slot), devuelve el **Tablix**, y el
>   menú contextual cae a las acciones de lo **seleccionado** cuando el click
>   cae en vacío. Se puede borrar con el menú o con `Supr`.
> - **«Orden» dentro de celdas**: `findSiblings` no atravesaba las celdas de
>   Tablix; ahora sí (los items de un rectángulo dentro de una celda tienen su
>   submenú de z-order). En el corpus `Rectangle2` está **vacío**: si no se le
>   meten items, no hay nada que ordenar.
> - **Tablix nuevo 2×3**: al insertar nace con **2 filas × 3 columnas**, celdas
>   de **2,5 × 0,6 cm** (total 7,5 × 1,2 cm), **las 6 celdas con Textbox** y las
>   jerarquías a juego. Soltado dentro de una celda toma el tamaño de la celda y
>   reparte.
>
> Estado: **400 unit tests** (266 back + 134 front), `typecheck` limpio y
> **50 E2E** verdes (con regresión de los dos bugs de drag/borrado y del Tablix
> 2×3).
>
> **Punto de retomada**:
>
> 1. **Probar en la app** lo de esta sesión (quedó pendiente): Tablix 2×3,
>    drag de rectángulos, borrado de Tablix y «Orden» en celdas. La copia de
>    pruebas vive en `%TEMP%\rdlc-demo\SalesCreditMemoESP.rdlc`; para relanzar:
>    `$env:RDLC_OPEN='<fichero>'; pnpm --filter @rdlc-designer/back dev`.
> 2. **U3 · multiselección de items + edición en lote** (diseño acordado):
>    modos excluyentes item ↔ celda, `Ctrl/Shift+click` y **marco** de selección,
>    panel con propiedades comunes (fuente, tamaño, N/I/S, color, fondo, bordes,
>    padding, visibilidad y `CanGrow`/`KeepTogether`) aplicadas en **un solo paso
>    de undo** con un comando **`batch`** nuevo (el journal ya soporta varios
>    inversos por comando) y botones de **alinear/distribuir**.
> 3. Sigue pendiente el **bug de `Maximum update depth exceeded`** al mover
>    Tablix anidados (ver su sección) y el resto del pase de UX `intent`
>    (U1/U2/U4–U9).

> **Sesión 2026-09-29 (bloque de gaps) · G1–G13 cubiertos** — auditoría del
> 2026-09-29, punto ① del plan. Un commit por gap, con tests y E2E:
>
> - **G1 · Insertar Tablix**: variante `tablix` en el contrato y factory con
>   rejilla 1×1 (celda con Textbox y ambas jerarquías, XSD válido); botón en
>   toolbar/paleta/menú contextual y tamaño por defecto 8 × 2,5 cm.
> - **G2 · Bordes por lado**: `setStyle` escribe `Border`/`TopBorder`… con la
>   herencia de BC resuelta **propiedad a propiedad** (genérico `Solid` +
>   `TopBorder` solo con `Width`); la proyección emite los 4 lados; el panel
>   tiene estilo/color/grosor por lado (color con commit diferido) y el lienzo
>   pinta las líneas por lado (incluido `Double`).
> - **G3 · `moveItem`**: reparentar/reordenar con validación de ciclos,
>   `Top/Left` **opcionales** relativos al destino (al entrar en una celda se
>   quitan, como el contenido de BC), crecimiento del rectángulo destino y undo
>   byte-exacto (`moveNode`). El drag&drop del lienzo reparenta solo si el
>   puntero suelta en otro contenedor y conserva el punto agarrado.
> - **G4 · `setItemOptions`**: `CanGrow`/`KeepTogether` de un Textbox (apagar
>   quita la etiqueta, como RB) con checkboxes en el panel.
> - **G5 · `setZIndex`**: comando + «Traer al frente»/«Enviar atrás» en el menú
>   contextual; un `zIndex` negativo manda el item detrás de todos corriendo a
>   los hermanos (un solo paso de undo, XSD válido).
> - **G6 · Bandas de página**: `setRegionHeight` + `setHeaderFooterOptions`, la
>   proyección ya lee `PrintOnFirstPage/LastPage` y «Informe…» edita alto y
>   flags del encabezado y el pie.
> - **G7**: el hook `moveItem` (mover posición con `setLocation`) pasa a
>   `moveTo`, libre el nombre del contrato.
> - **G8 · Insertar en cabecera/esquina**: scopes `tablixHeader`/`tablixCorner`,
>   `findScope` sin crear contenedores, hit-test de huecos **vacíos** con su
>   caja (el item nuevo ocupa el hueco) y menú «Insertar» solo en celdas
>   libres; insertar/pegar en una celda ocupada se rechaza con motivo.
> - **G9 · Saltos de página de items**: `setItemPageBreak` (Rectangle/Tablix),
>   proyección de `PageBreak > BreakLocation` y control en el panel.
> - **G10 · Filtros del Tablix**: `setTablixFilters` (reemplaza el bloque, undo
>   byte-exacto con el nodo original), proyección de `Filters > Filter` y
>   diálogo «Filtros…» en la cabecera de la estructura (valores uno por línea).
> - **G11 · Renombrar grupo**: `setGroupName` (único en el documento) y campo
>   editable en «Propiedades del grupo» con aviso de que las expresiones de
>   ámbito no se reescriben.
> - **G12 · Padding por item**: sección de padding (pt, 4 lados) compartida en
>   el panel de propiedades (antes solo en el de imagen).
> - **G13 · Imágenes embebidas**: catálogo de `<EmbeddedImages>` en la meta
>   (nombre + MIME; el `ImageData` no viaja) y desplegable en el panel de
>   imagen cuando `Source=Embedded`.
>
> Estado: **397 unit tests** (266 back + 131 front), `typecheck` limpio y
> **48 E2E** de Playwright verdes.
>
> **Punto de retomada**: ② pase de UX con el skill `intent` (U1–U9: guardar
> como/nuevo/recientes, conflicto completo, multiselección con alinear,
> jerarquía/breadcrumb, zoom al ancho, acciones nuevas en la paleta, atajos y
> ARIA) → ③ seguir fase (**F2.c** totales → **F3** Matrix) y cerrar con T1
> (CI/empaquetado).

> **Sesión 2026-09-29 · F2.b (grupos de fila) + F2.b.2 (feedback de uso: propiedades del grupo)** —
> **`setGroupExpression`** (edita la expresión del grupo; `axis` + `path` de la
> proyección), **`addRowGroup`** (envuelve la fila elegida en un grupo nuevo:
> `Group` + `GroupExpressions` + `SortExpressions` ordenando por la expresión y
> `TablixMembers` con la hoja; el body no cambia) y **`deleteRowGroup`** (quita
> el grupo; ver más abajo qué pasa con las filas). Decisiones del ida/vuelta con
> Report Builder:
>
> - El grupo nuevo **no crea cabecera** (RB la añade aparte) y nunca se
>   convierte una `TablixHeader` en fila.
> - **Quitar grupo** (arreglado tras probarlo en la app): con **hijos**, las
>   filas **se elevan al padre** y el miembro desaparece (antes quedaba un
>   contenedor estático que el árbol pintaba como «Grupo» fantasma y sus
>   acciones daban error); si la cabecera tiene contenido, se **rechaza** con
>   motivo para no perderla. Con **grupo hoja**, la fila se queda como fila
>   estática. El inverso usa el comando interno `moveNode` (undo byte-exacto).
> - Los **grupos hoja** (`Tablix2 · Details`, `Tablix7`, `Tablix1 · BTCBillNo1`)
>   se clasifican por **`expression`**, no por tener hijos: en el árbol salen con
>   el icono de capas y su fila sigue siendo seleccionable (la entrada lleva
>   `index`).
> - La **ordenación espeja la expresión**: el grupo nuevo nace ordenado por ella
>   y al editarla se sincroniza el `SortExpression` que espejaba la anterior (si
>   ordenaba por otro campo, se respeta: caso `Tablix7`). Ascendente se **omite**
>   en el XML (canónico de BC).
> - El **nombre** del grupo sale del primer campo de la expresión
>   (`=Fields!X.Value` → `X`, como RB) y es único entre los nombres de ámbito
>   (`Group` y `DataSet`); si ya existe, añade 1, 2…
>
> **Propiedades del grupo (F2.b.2)** — el **lápiz** de cada grupo del árbol abre
> un diálogo con pestañas, como el de RB:
>
> - **General**: nombre (solo lectura: renombrarlo puede romper expresiones de
>   ámbito) + **lista de expresiones** («Group on» / «And on») con **desplegable
>   de variables** (`=Fields!X.Value`, parámetros, `Code.`, `Globals!`, `User!`)
>   y **fx** (Monaco) para expresión libre; añadir/eliminar (mínimo 1).
> - **Saltos de página**: `Between` (entre instancias), `Start` (al inicio),
>   `End` (al final) → un `PageBreak > BreakLocation` por opción. Los `PageBreak`
>   con valores no gestionados (`None`, `StartAndEnd`) no se tocan.
> - **Ordenación**: lista de `SortExpressions` (expresión + A→Z/Z→A) con
>   añadir/eliminar y subir/bajar. Vaciar la lista quita el bloque.
> - **Visibilidad**: Mostrar / Ocultar / «mostrar u ocultar según una
>   expresión» (fx) + **«alternar con este elemento»** (`Visibility >
ToggleItem`, desplegable de items del informe).
> - **«Aplicar» manda solo las secciones cambiadas** (un comando por sección):
>   `setGroupExpressions`, `setGroupPageBreaks`, `setGroupSorting`,
>   `setMemberVisibility` y `setMemberToggleItem`. La proyección del miembro
>   gana `name`, `sortExpressions`, `pageBreaks` y `toggleItem`.
>
> **Extender grupos y filas fuera del grupo (F2.b.3)** — tras probarlo en la app:
>
> - **`addRowToGroup`**: mueve una fila **contigua** al grupo (botones ↑/↓ en su
>   cabecera del árbol: «Añadir la fila N al grupo»). Rechaza filas que no tocan
>   el rango del grupo y **grupos hoja** (añadirles miembros convertiría su fila
>   en contenedor y la fila desaparecería). Undo byte-exacto (interno `moveNode`).
> - **`addRowOutsideGroup`**: inserta una fila de relleno **fuera** del grupo que
>   contiene la celda, pegada a su borde (encima = antes de su primera hoja;
>   debajo = después de su última hoja). El miembro va al contenedor del padre.
> - **`addRowInsideGroup`**: fila de relleno **dentro** del grupo, pegada a la
>   fila de la celda (encima/debajo). Antes, «debajo de la última fila» se
>   colaba **fuera** (el `addRow` genérico insertaba en el borde del rango); si
>   el grupo es **hoja** (su fila ES el grupo, caso `Tablix7`/`Tablix1`), el
>   grupo se convierte en **contenedor** conservando la fila original como
>   primer miembro (el body no cambia de orden y la cabecera del grupo se
>   conserva).
> - **Menú contextual de celda** estilo RB: _Insertar fila o columna_ con
>   «Dentro del grupo: fila encima/debajo» y «Fuera del grupo: fila
>   encima/debajo» (con grupo, también si es hoja: ahí el grupo pasa a mostrar
>   las filas anidadas) y **«Propiedades del grupo…»** para el grupo que posee
>   la fila.
>
> **E2E**: `selectItemViaPalette` espera a que el **scroll suave** del «traer a
> la vista» se asiente antes de calcular puntos (la carrera que destapó el test
> de cabeceras al cambiar los tiempos de render).
>
> **Punto de retomada (próxima sesión)**:
>
> - **Bug detectado en pruebas**: `Maximum update depth exceeded` al mover
>   `Tablix7`/`Tablix1` (caso real, sin causa raíz; ver «🐞 Bug pendiente de
>   cazar (2026-09-29)»). Capturar la traza del componente si vuelve a salir.
> - **Cubrir gaps auditados** (sección «🔎 Auditoría de gaps (2026-09-29)»):
>   primero los P1 (G1 insertar Tablix, G2 bordes, G3 `moveItem`, G4–G6 contrato,
>   G8 cabeceras del Tablix…), después el pase de UX con el skill `intent`
>   (U1–U9) y luego seguir fase (F2.c → F3).
> - **Probar en la app** los grupos con un informe grande: propiedades (cambiar
>   expresión, saltos, ordenación, visibilidad), crear/extender/quitar grupos,
>   filas dentro/fuera del grupo (y grupos hoja) y deshacer; comparar el
>   ida/vuelta con RB.
> - **F2.c (opcional)**: botón «Añadir total antes/después» (inserta la fila
>   estática y precarga `Sum`/`Count`/`First` por columna) y, si se pide,
>   cabeceras de grupo (`TablixHeader`) al crear grupos.
> - **F3 · Matrix** (grupos de **columna** + esquina): `setGroupExpression`,
>   `deleteRowGroup` y las opciones del diálogo ya aceptan `axis: 'column'`;
>   faltarían `addColumnGroup`/`addColumnToGroup`/`addColumnInsideGroup`.
> - Menores: **insertar Tablix**, **bordes** de estilo, `setZIndex`/
>   `setItemOptions`/`moveItem` (en el contrato, rechazados), renombrar grupos
>   (General) y «Agrupar la fila…» desde el menú contextual (hoy vive en el
>   árbol), empaquetado electron-builder y CI.
>
> Estado: **350 unit tests** (225 back + 125 front), `typecheck` limpio y
> **37 E2E** de Playwright verdes.

> **Sesión 2026-09-25/28 · visibilidad (items y Tablix), nombre/etiqueta/fondo editables y fixes del lienzo** —
> **Visibilidad de items**: `setVisibility` (literal, expresión o `null` que quita la
> declaración) y el panel la edita con **Visible / Oculta / Expresión…** (la
> predeterminada **es visible**: no hay opción «predeterminada»). La proyección
> lee `Visibility > Hidden` (antes buscaba un hijo directo y nunca llegaba al
> lienzo) y los ocultos se pintan **atenuados (40 %)** en diseño, editables.
> **Visibilidad de filas/columnas/grupos**: `setMemberVisibility` (`axis` + `path`
> de la proyección) con **ojo** y **Σ** en cada miembro del árbol de Estructura;
> el `Hidden` se escribe con el mismo helper que los items (antes de `ToggleItem`,
> orden del XSD) y el undo es byte-exacto.
> **Panel de propiedades**: el **nombre** es editable (`setName`: único,
> estructural; `rd:DefaultName` se sincroniza como al duplicar; undo con el interno
> `setAttribute`), la **etiqueta `<Label>`** del caso simple se edita inline
> (`setParagraphs`) y el **color de fondo** admite literal o **expresión** (`Σ`
> abre un **diálogo Monaco con números de línea**, reutilizado por la visibilidad).
> **Selector de color**: commit **diferido** (~250 ms, flush al desmontar) porque
> el `input type=color` dispara `input` en cada paso del arrastre y antes lanzaba
> 100+ comandos por segundo (y un `Maximum update depth exceeded` del renderer).
> **Fixes**: el **autocompletado** era invisible porque el CSS de Monaco está
> _scoped_ bajo `.monaco-editor`; ahora hay un **host de overflow** propio en el
> body con esa clase, `pointer-events:auto` y z-index (fuera de diálogos, visible
> y clicable con ratón y Tab). El **marco de selección** busca el adorno **propio
> por niveles** (`tablix-border`/`item-box`): `find()` devolvía el borde del primer
> Tablix anidado (el borde propio se dibuja al final → Tablix2 medía LinesTable2).
> `addRow`/`addColumn` crean celdas con **Textbox** (no celdas muertas) y se
> quitaron los «+» por fila/columna (queda el de la cabecera, al final).
> **Autocerrados**: al quitar el último hijo de un `<X />` se recupera el
> autocierre (`expandedSelfClosing`) para que el undo sea byte-exacto de verdad.
>
> **Punto de retomada (próxima sesión)** — plan reordenado tras revisar el corpus:
>
> - ✅ **F2.a · `TablixCorner` + `TablixHeader`** (hecho en esta sesión): la
>   proyección y el lienzo ya pintan las cabeceras **fuera de la rejilla**:
>   bandas de `TablixMember > TablixHeader` (grosor = `Size`, largo = filas/columnas
>   que cubre el miembro), esquina `TablixCorner` (celda `[banda de columna][banda
de fila]`) y un `headers.offset` que desplaza el body. En `Tablix7` de
>   `SalesInvoiceESP`/`SalesCreditMemoESP` ya se ven `Textbox72` (esquina),
>   `Textbox73/75` (columnas) y `VATIdentifier_VatAmountLine` (cabecera del grupo,
>   con `=Sum(...)`); el marco del Tablix mide cabeceras + rejilla y las cabeceras
>   se seleccionan como contenido anclado (sin tiradores). La proyección expone
>   `TablixDto.headers` y el front las recorre (`tablixHeaderItems`) para
>   selección, propiedades, paleta y hit-test; `tablixLayout` devuelve el `offset`.
> - **F2.b · Gestión de grupos de fila** (siguiente): `setGroupExpression` (editar la
>   expresión del grupo; lo más útil para tocar informes de BC, que ya traen los
>   grupos), `addRowGroup` / `deleteRowGroup` (crear/borrar) y decidir si la cabecera
>   del grupo va al body o a `TablixHeader` (BC usa `TablixHeader`). Lecciones del
>   ida/vuelta con Report Builder (fichero `SalesInvoiceESP` editado con RB):
>   - Un grupo puede ser **miembro hoja** (sin `TablixMembers`): es la fila de detalle
>     que se repite (caso real: `Tablix7`, grupo `=Fields!VATPct_VatAmountLine.Value`
>     como hoja, con `VATIdentifier_VatAmountLine` en su primera celda). En el árbol
>     hay que clasificarlo por **`expression`**, no por tener hijos: hoy sale como
>     fila con `↳` en vez de con el icono de capas.
>   - RB puede **aplanar** las cabeceras al tocar la tabla: quita `TablixHeader`/
>     `TablixCorner` y refluye su contenido a **filas/celdas del body** (la esquina
>     `Textbox72` pasó a `Textbox83` en la fila estática de rótulos). Al gestionar
>     grupos hay que **preservar `TablixHeader`** si existe (no convertirlo en fila
>     sin pedirlo) y no asumir que un grupo trae cabecera fuera de la rejilla.
>   - La inferencia de **totales** es heurística: el `=Sum(...)` puede vivir en la
>     `TablixHeader` del grupo o en su fila de detalle, no solo en una fila estática
>     adyacente (en ese caso no hay Σ que mostrar, y está bien).
> - **F2.c · Conveniencia de totales** (opcional): los totales **no tienen XML propio**:
>   son filas estáticas con agregados (`LinesTable2`, fila 5: `=Sum(...)`) y ya se pueden
>   hacer a mano. Un botón «Añadir total antes/después» que inserte la fila y precargue
>   `Sum`/`Count`/`First` por columna según el tipo de campo.
> - **F3 · Matrix** (grupos de **columna** + esquina): reutiliza F2.a/F2.b.
> - Menores: **insertar Tablix** (no existe), **bordes** de estilo (siguen rechazados),
>   `setZIndex`/`setItemOptions`/`moveItem` (en el contrato, rechazados), empaquetado
>   electron-builder y CI.
>
> Estado: **298 unit tests** (183 back + 115 front), `typecheck` limpio,
> `react-doctor` **100/100** y **29 E2E** de Playwright verdes.

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

## 🐞 Bug pendiente de cazar (2026-09-29) — `Maximum update depth exceeded` al mover Tablix anidados

> Detectado **en la app de dev** (sesión de pruebas manual del 2026-09-29 con
> `SalesCreditMemoESP.rdlc` en copia temporal). Se documenta como **caso real**:
> no se ha reproducido en simulación y no hay causa raíz todavía, pero si vuelve
> a aparecer, aquí está el contexto y cómo capturarlo.

- **Síntoma**: React lanza `Maximum update depth exceeded` (bucle de updates) y
  acto seguido `Uncaught Error` con el mismo mensaje. La app **sigue aceptando
  comandos** después (en el log, los `setLocation` posteriores se aplican y se
  ven los `[renderer]` normales), pero la UI puede quedarse bloqueada.
- **Cuándo** (dos veces, ambas tras mover un Tablix anidado y ~3-4 s después
  del último comando, sin comandos intermedios):
  - `11:31:33.886` — tras varios `setLocation` sobre **Tablix7** (v14; flechas/
    arrastre + undos previos).
  - `11:31:51.225` — tras un `setLocation` sobre **Tablix1** (v17).
- **Evidencia** (electron-log del main):
  ```
  11:31:33.886 > [renderer] Maximum update depth exceeded. This can happen when a
    component calls setState inside useEffect, but useEffect either doesn't have a
    dependency array, or one of the dependencies changes on every render.
  11:31:33.946 > [renderer] Uncaught Error: Maximum update depth exceeded. ...
  11:31:36.973 > [renderer] Uncaught Error: Maximum update depth exceeded. ...
  ```
- **Qué se intentó para reproducirlo (sin éxito)**: spec temporal de Playwright
  que seleccionaba `Tablix7`/`Tablix1` por paleta, pulsaba flechas ×4, `Ctrl+Z`
  ×5, flechas ×3 y hacía 3 arrastres reales del cuerpo del Tablix → **0 errores**
  de consola. (El spec se borró; no forma parte de la suite.)
- **Sospechas**: el único `setState` dentro de un `useEffect` del lienzo es la
  medición del marco (`CanvasPreview`, deps `[selectedId, selectedCell,
projection, zoom]`); para el bucle haría falta que una de esas dependencias
  cambiase de identidad en cada render (o un efecto con `setState` sin deps que
  no hemos visto aún). El `SelectionFrame` tiene un efecto sin deps que **solo
  escribe en `window`**.
- **Cómo capturarlo la próxima vez**:
  1. `main.ts` registra solo `event.message` de la consola del renderer:
     ampliarlo para loguear también los argumentos (React adjunta la **traza del
     componente** como argumento adicional) o añadir un `error boundary` que la
     muestre.
  2. En un spec de Playwright: `page.on('pageerror', (e) => e.stack)` y
     `console` con `message.args()`.
  3. Anotar la **secuencia exacta** de clics/teclas del usuario (el log de
     comandos no basta: entre los dos crashes hubo ~3 s sin comandos).
- **Impacto**: sin pérdida de datos conocida; es un bucle de render, no un
  problema de dominio/undo.

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

## 🔎 Auditoría de gaps (2026-09-29) — backlog antes de F3

> Revisión **contrato ↔ dominio ↔ proyección ↔ UI** sobre el código (no solo el
> plan): comandos declarados sin implementar, campos del DTO que nadie rellena,
> scopes que faltan y UX de fichero/editor. Plan de las próximas sesiones:
> **① cubrir gaps → ② pase de UX con el skill `intent` → ③ seguir fase**
> (F2.c totales → F3 Matrix). Prioridad: **P1** = se nota a diario con informes
> de BC · **P2** = acabado · **P3** = proceso. Tamaño: **S** (< 1 sesión),
> **M** (1 sesión), **L** (varias).
>
> **Estado (2026-09-29, bloque de gaps)**: ✅ **G1–G13 hechos** (ver el bloque
> de sesión al principio del fichero). Quedan **U1–U9** (pase `intent`) y
> **T1–T5**, además de **G14** (que es el trabajo de fase: F2.c totales → F3
> Matrix). Las columnas «Estado hoy» describen el punto de partida de la
> auditoría, antes de este bloque.

### 🎯 P1 · Bloque elegido: menores de alto valor BC

| #   | Gap                                   | Estado hoy                                                                                                                                                                            | Qué falta                                                                                                                                                                                                             | Tam. |
| --- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| G1  | **Insertar Tablix**                   | `KIND_PREFIX` ya contempla `tablix`, pero `newItemSpecSchema` no tiene la variante y `createReportItem` cae al `else` → **crearía un `<Image>` vacío** (trampa latente, XSD inválido) | Variante `tablix` en el contrato; rama en la factory (`TablixBody` 1×1 con textbox + ambas jerarquías + `Height`/`Width`/`Style`, XSD válido); botón en toolbar/paleta/menú; tamaño por defecto                       | S    |
| G2  | **Bordes por lado**                   | Contrato OK (`StyleDto.border`); `setStyle` los **rechaza** (`SUPPORTED_KEYS`), la proyección no lee `<Border>`, no hay UI ni pintado                                                 | Escribir/leer `Style/Border/{Top,Left,Bottom,Right}` (`Style`/`Color`/`Width`); parche con lados **nullables** (quitar un lado); UI en el panel (4 lados); pintado por lado en el lienzo (BC los usa mucho en celdas) | M    |
| G3  | **`moveItem` (reparentar/reordenar)** | Rechazado a propósito (test en `commands.spec.ts`); arrastrar un hijo fuera de su rectángulo/celda **no lo saca**                                                                     | Comando con validación de ciclos + índice de destino; `growContainer` de origen/destino; drag&drop que reparenta (y/o «Mover a…» en el menú); undo byte-exacto (`moveNode`)                                           | M    |

### 🧩 P1/P2 · Completar el contrato (comandos declarados, hoy rechazados)

| #   | Gap                                          | Estado hoy                                                                                                    | Qué falta                                                                                         | Tam. |
| --- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ---- |
| G4  | `setItemOptions` (`CanGrow`/`KeepTogether`)  | Proyectados; sin comando ni UI (el front ni los muestra)                                                      | Comando + checkboxes en el panel de propiedades                                                   | S    |
| G5  | `setZIndex`                                  | Proyectado (pintado y hit-test lo respetan); el panel lo muestra como texto; sin comando                      | Comando + «Traer al frente / Enviar atrás» (menú contextual y/o atajos)                           | S    |
| G6  | `setRegionHeight` + `setHeaderFooterOptions` | Contrato OK; **la proyección tampoco lee `printOnFirstPage/printOnLastPage`**; sin UI                         | Proyectar los flags; comandos + campos en «Informe…» (alto de banda y imprimir en primera/última) | S    |
| G7  | Colisión de nombre `moveItem`                | `useItemEditing.moveItem(id, top, left)` es mover con `setLocation`; el `moveItem` del contrato es reparentar | Renombrar el del hook (`moveTo`) al implementar G3                                                | S    |

### 🖼️ P1/P2 · Edición que se echa en falta con informes de BC

| #   | Gap                                         | Estado hoy                                                                                                                      | Qué falta                                                                                      | Tam. |
| --- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ---- |
| G8  | **Insertar en cabecera/esquina del Tablix** | No hay scope `tablixHeader`/`tablixCorner`: los items existentes se editan/borran, pero **no se puede añadir** (RB sí)          | Scopes nuevos + `resolveScope` + hit-test de las celdas de cabecera + menú/arrastrar           | M    |
| G9  | **Saltos de página de items**               | Los grupos tienen su pestaña (F2.b.2), pero el `<PageBreak>` de `Rectangle`/`Tablix` (el corpus tiene uno) no se ve ni se edita | Proyectar `pageBreak` del item + comando + control en el panel                                 | S    |
| G10 | **Filtros** (grupo/Tablix/DataSet)          | `<Filters>` (BC los usa en `Tablix7`) se conservan pero no se editan; la pestaña del diálogo de grupo no existe                 | Pestaña «Filtros» (expresión/operador/valores) reutilizando el patrón del diálogo de grupo     | M    |
| G11 | **Renombrar grupo**                         | El Nombre del diálogo de grupo es solo lectura                                                                                  | `setGroupName` (único entre ámbitos) + campo editable con aviso de referencias                 | S    |
| G12 | **Padding por item**                        | `setStyle` lo soporta; UI solo en el panel de imagen                                                                            | Sección de padding (4 lados, pt) en el panel de propiedades                                    | S    |
| G13 | **Imágenes embebidas**                      | `Source=Embedded` no lista `<EmbeddedImages>` ni se proyectan                                                                   | Proyectar catálogo + desplegable en el panel de imagen                                         | S    |
| G14 | F2.c totales / F3 Matrix                    | Planificados                                                                                                                    | «Añadir total antes/después» (`Sum`/`Count`/`First` por columna) y grupos de columna + esquina | M/L  |

### 🎛️ P2 · UX/editor (pase con el skill `intent`)

| #     | Gap                                                           | Estado hoy                                                                                                                                       | Qué falta                                                                                                                                                                                                       | Tam. |
| ----- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| U1    | **Guardar como / Nuevo / recientes / abrir soltando fichero** | `IPC_CHANNELS.createNew` y `saveAs` + sus schemas **existen en el contrato pero no están implementados** (ni en preload ni en `RdlcApi`); sin UI | Implementar canales, «Guardar como…»/«Nuevo…», lista de recientes y drag&drop de `.rdlc` sobre la ventana                                                                                                       | M    |
| U2    | **Conflicto de fichero completo**                             | Hoy: banner + «guardar = sobrescribir / cerrar = descartar» (H2)                                                                                 | Diálogo Recargar / Sobrescribir / Guardar como                                                                                                                                                                  | M    |
| U3    | **Multiselección de items** + alinear/distribuir              | Solo selección única de item o de celdas                                                                                                         | Selección múltiple (Shift/Ctrl en lienzo), caja de selección, alinear/distribuir y guías. **Diseño acordado (2026-09-29)**: modos item ↔ celda excluyentes y edición en lote con comando `batch` (un solo undo) | L    |
| U4    | **Jerarquía del informe / breadcrumb**                        | El árbol del Tablix existe; no hay árbol de items ni breadcrumb de contenedor (gap #12)                                                          | Panel de jerarquía + breadcrumb (Rectángulo/Celda)                                                                                                                                                              | M    |
| U5    | Z-order                                                       | = G5                                                                                                                                             | Botones/atajos en el menú                                                                                                                                                                                       | S    |
| U6 ✅ | Zoom «ajustar al ancho»/100 %                                 | Solo +/− del 20 % al 200 %                                                                                                                       | Presets y atajo                                                                                                                                                                                                 | S    |
| U7 ✅ | Paleta Ctrl+K                                                 | Acciones actuales fijas (abrir/guardar/undo/redo/inserts)                                                                                        | Añadir las acciones nuevas (Tablix, guardar como, bordes…)                                                                                                                                                      | S    |
| U8 ✅ | «Agrupar la fila…» en el menú contextual                      | Solo el ⊕ del árbol («Propiedades del grupo…» ya está en el menú)                                                                                | Acción en el submenú tipo Row Group                                                                                                                                                                             | S    |
| U9 ✅ | Atajos y ARIA de los diálogos nuevos                          | Ctrl+C/X/V/D/Z/Y/K, flechas, Supr, Esc; diálogos con foco Radix                                                                                  | Repaso de teclado/accesibilidad de los diálogos nuevos (pase `intent`/`include`)                                                                                                                                | S    |

### 🛠️ P3 · Técnicos/proceso

| #   | Gap                                       | Estado hoy                                                            | Qué falta                                                                                  | Tam. |
| --- | ----------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ---- |
| T1  | **CI + empaquetado**                      | Nada                                                                  | GitHub Actions (typecheck + unit + E2E) y electron-builder (MSI/NSIS), firma y recursos    | M    |
| T2  | **Endurecer Electron**                    | `contextIsolation`, `nodeIntegration:false`, CSP y zod en el borde ✅ | `will-navigate`, `setWindowOpenHandler`, revisar `sandbox`/permisos                        | S    |
| T3  | **Rendimiento del lienzo**                | Línea base medida (972 textboxes ≈ 30 fps)                            | Viewport culling, drag sin re-render, grid cacheado, solo la pestaña activa monta el stage | L    |
| T4  | **Property tests** de comandos aleatorios | No hay                                                                | Generador + invariantes (undo byte-exacto)                                                 | M    |
| T5  | **Flujo BC documentado** (página 9650)    | No hay                                                                | Guía exportar → editar → reimportar y evolutivo de despliegue                              | S    |

**Plan acordado (2026-09-29)**: ① cubrir gaps (G1–G13, priorizando P1) →
② pase de UX con el skill `intent` (U1–U9) → ③ seguir fase (**F2.c** totales →
**F3** Matrix) y cerrar con T1 (CI/empaquetado).

**Progreso**: ① **G1–G13 ✅** en el bloque de gaps del 2026-09-29 (queda G14 =
F2.c/F3, que ya es fase); sigue ② el pase de UX (`intent`, U1–U9).

## 🔴 Gaps funcionales (MVP)

> Actualizado tras la **auditoría 2026-09-29** (backlog priorizado arriba:
> G1–G14, U1–U9, T1–T5). Esta lista se mantiene como estado por área.

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
   segmentada, fusión por tramos, proyección de anchos por columna acumulada,
   **visibilidad de items y de filas/columnas/grupos**, **cabeceras
   (`TablixHeader`) + esquina (`TablixCorner`)**, **gestión completa de grupos de
   fila** (F2.b/F2.b.2: expresiones, crear/quitar elevando filas, saltos de
   página, ordenación y `ToggleItem`) ✅ y **totales del grupo** (F2.c, sesión
   2026-10-01: `addTotalRow` con `Sum`/`First` inferidos por columna y el
   submenú «Total del grupo») ✅.
5. **Matrix (Fase 3)** — ✅ hecho (sesión 2026-09-30, 5.ª parte): **grupos de
   columna** (`addColumnGroup`/`addColumnToGroup`) con la misma edición que los
   de fila en el panel de Estructura (agrupar, extender con la contigua,
   expresión/orden/saltos/visibilidad/renombrar/quitar) y undo byte-exacto.
   Queda como opcional la inserción de columnas «dentro/fuera del grupo».
6. **`moveItem`** (reparentar/reordenar) — ✅ hecho (G3, 2026-09-29): comando con
   ciclos + `Top/Left` opcionales, crecimiento del destino y drag&drop que
   reparenta conservando el punto agarrado; undo byte-exacto.
7. **`setName`** (renombrar elemento) — ✅ hecho (sesión 2026-09-25/28): comando
   (único, estructural, `rd:DefaultName` sincronizado) y campo editable en el panel.
8. **Bordes** (`BorderStyle`/`BorderColor`/`BorderWidth` por lado) — ✅ hecho (G2,
   2026-09-29): `setStyle` escribe genérico + overrides por lado con la herencia
   resuelta propiedad a propiedad, la proyección emite los 4 lados, el panel los
   edita y el lienzo los pinta. Lo usan mucho las celdas de Tablix de BC.

## 🟡 Gaps técnicos de frontend

9. **Rendimiento del lienzo** — 🔶 línea base medida (972 textboxes ≈ 30 fps p50,
   [docs/perf/0001-baseline-lienzo.md](docs/perf/0001-baseline-lienzo.md)); faltan las
   optimizaciones: drag sin re-render de React, viewport culling, grid cacheado,
   solo la pestaña activa monta el stage, batching de comandos.
10. **Arquitectura del lienzo** — 🔶 hay base (capas, selección, drag, snap, **toolbox con
    drag&drop real**); faltan multi-selección, alineación/distribución y guías inteligentes.
11. **Lista de variables → inserción en Monaco** — ✅ hecho: inserta en la posición del
    cursor del editor registrado (y copia al portapapeles si no hay editor).
12. **Breadcrumb de contenedor** (Rectángulo/Celda) y **panel de jerarquía** del informe
    (árbol de elementos) — ⬜ el renombrado ya vive en el panel de propiedades ✅.

## 🟠 Proceso y operativa

13. **Empaquetado** — ⬜ electron-builder (MSI/NSIS), decisión de firma, recursos del
    renderer (el XSD viaja en `apps/back/resources/`).
14. **Seguridad Electron** — 🔶 `contextIsolation`, `nodeIntegration:false`, CSP y zod en
    el borde ya están; falta revisar el checklist antes de abrir el repo.
15. **XML corrupto / inválido** — ✅ resuelto: parse error → no se abre; XSD inválido →
    aviso al importar y **bloqueo al guardar** con lista de problemas.
16. **Flujo BC** — ⬜ documentar el ciclo exportar layout (página 9650) → editar →
    reimportar; evolutivo: desplegar a BC.
17. **Testing más allá del golden** — 🔶 350 tests (225 back + 125 front) y **E2E de
    Playwright del lienzo ✅ (32)**; faltan property tests de comandos aleatorios y CI.

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
