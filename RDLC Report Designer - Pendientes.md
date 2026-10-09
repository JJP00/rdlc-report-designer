# RDLC Report Designer — Puntos pendientes (gaps del plan)

> **Zoom hasta 400 % · 2026-10-09** — el tope era 200 % (`ZOOM_MAX = 2` en
> `apps/front/src/lib/zoom.ts`) y «ajustar al ancho» también se acotaba a él, así que en
> una ventana ancha el papel no llenaba el lienzo. Ahora `ZOOM_MAX = 4`, con presets 300 %
> y 400 % en el menú de zoom (+/−, Ctrl+rueda y los atajos respetan el nuevo límite; el
> `ui` de pestaña restaurado se acota igual). Comprobado en la app con SalesInvoiceESP:
> ventana de 2384 px → «ajustar al ancho» = 252 % (antes 200 %), 400 % nítido, scroll a
> 60 fps (p50 16,7 ms, p95 17,7 ms). Sin medir: memoria de los canvas de Konva a 400 % con
> páginas muy grandes (un A4 a 400 % ≈ 3176×4492 px por capa).

> **Ajustes de UI tras el análisis Intent · 2026-10-09** — pedidos en la revisión; sin
> commitear. Verificación: `typecheck` 3/3, 400 back + 277 front unit y E2E (ver abajo).
>
> - **Tira de pestañas bajo la barra de formato**, justo encima del lienzo. `ReportTab`
>   se divide en un **marco estable** (barra principal, barra de formato y la tira, que
>   llega como `tabStrip` desde `App`) y un `ReportBody` con `key={sessionId}` (avisos,
>   paneles, lienzo, inspector y pie). Así la tira ya no se remonta al cambiar de
>   pestaña y conserva scroll y foco.
> - **Botón «+» eliminado** de la tira: Nuevo/Abrir/recientes quedan en «Fichero» y en
>   arrastrar ficheros a la ventana (`onNew`/`onOpen`/`onOpenRecent`/`busy`/`recents`
>   salen de `TabStrip`).
> - **Colores más contrastados y con jerarquía** (`styles.css`): tokens nuevos
>   `--chrome` (barra principal), `--chrome-subtle` (barra de formato) y `--tabstrip`
>   (pista de pestañas); en claro la barra principal es la más marcada y la pestaña
>   activa (blanca, con filete superior `primary`) destaca sobre una pista más oscura;
>   en oscuro la barra principal es la más elevada y la pista la más hundida. Neutros
>   con un matiz frío (hue 260). `--border`, `--input` (≥ 3:1: 0,62 en claro, 0,56 en
>   oscuro), `--muted-foreground`, `--accent`/`--muted` (hover visible), `--ring`
>   (opaco y azulado; el contorno base pasa de `outline-ring/50` a `outline-ring`) y
>   avisos ámbar con variante oscura (`EditorBanners`, asterisco de la pestaña). Es el
>   primer arreglo de los hallazgos 10 y 11 de `docs/ux/0004` (foco, bordes y avisos).
> - **Verificado con `/include` midiendo en la app** (tokens resueltos a RGB; ratios
>   WCAG y escalones de luminosidad OKLab). Texto sobre todas las superficies: 12,7–19,7:1
>   (principal) y 5,4–9,4:1 (atenuado), claro y oscuro. Borde de campo (`--input`) ≥ 3,1:1
>   sobre las seis superficies en ambos temas (antes 1,6–1,8:1 y, en un primer intento,
>   2,8–2,9:1 sobre la barra principal: subido a `oklch(.57)` claro y `oklch(.62)` oscuro).
>   Foco (`--ring`) 4,8–9,3:1. Avisos ámbar 6,5:1 (claro) y 15,2:1 (oscuro); asterisco de
>   «sin guardar» 5,0:1 y 17,5:1. Destructivo 6,0:1 y 6,7:1. **Jerarquía**: el primer
>   intento daba escalones de ≈ 1,07 (barra principal/barra de formato; en oscuro,
>   pestaña activa/pista); se subió a ≥ 5 puntos de luminosidad entre niveles (claro:
>   barra 91,5 · formato 96,8 · pista 88 · contenido 100; oscuro: 30 · 25 · 12 · 20).
>   Los bordes de separación (`--border`) quedan en 1,5–2,1:1: son decorativos, no
>   delimitan controles. No se han probado combinaciones con el lienzo Konva (el papel
>   sigue blanco por fidelidad WYSIWYG) ni daltonismo simulado.

> **Análisis del front con el sistema Intent · 2026-10-09** — `/evaluate`, `/include`,
> `/organize` + `/articulate` y `/fortify` + `/transpose` **con la app ejecutándose**
> (capturas, árbol de accesibilidad, contrastes calculados, 3 tamaños de ventana, 8
> pestañas). Documento completo: `docs/ux/0004-analisis-intent-frontend.md`.
> **Salud UX ≈ 71/100** (rango 64–78; 0003 ≈ 61, 0002 = 86). Sin manipulación; sin
> regresiones de los P0 de resiliencia. Las puntuaciones son estimaciones y los
> contrastes, cálculos. **No evaluado**: lector de pantalla real, DPI del sistema,
> arrastrar ficheros desde el Explorador, cierre con varias sucias.
>
> **Por prioridad** (detalle, evidencia y arreglo en 0004):
> - **P0 · el lienzo no se puede usar con teclado ni lector** (`role="presentation"`, sin
>   `tabindex`; las flechas solo mueven con selección previa). La Jerarquía, única vía no
>   visual, declara `role="tree"` sin navegación de árbol (341 botones; hasta ~340 Tab).
> - **P1**: tira de pestañas con `tablist` incompleto y la **pestaña activa fuera de
>   vista** con muchas abiertas (sin `scrollIntoView`); diálogo «Informe…» que se sale de
>   la ventana sin scroll; **sin tamaño mínimo de ventana** y con Jerarquía + Variables
>   abiertas el lienzo mide 0 px a 800; **editar texto solo por clic derecho** (sin doble
>   clic/Enter/F2); insertar sin modelo mental ni aviso; **conflicto con «Sobrescribir»
>   como acción primaria enfocada**; «sin guardar» solo por color y `aria-hidden`.
> - **P2**: foco, bordes de campo y avisos ámbar bajo 3:1/4,5:1; objetivos < 24 px;
>   toolbar sin tooltips; Ctrl+K y atajos invisibles; estado vacío sin acción; inspector
>   apilado y con jerga (CanGrow, KeepTogether, Zindex…); pie que no refleja la actividad
>   y trunca el nombre del fichero; terminología de cierre inconsistente; foco perdido al
>   cerrar diálogos; reordenar pestañas sin anunciar.
> - **P3**: tirones con Ctrl+rueda en informes grandes, texto recortado sin señal, nombres
>   largos de pestaña, `prefers-color-scheme`, textos menores.
>
> **Orden sugerido**: ① accesibilidad del lienzo y la Jerarquía (`/journey` →
> `/specify`); ② robustez a ventana pequeña (`minWidth`, un solo panel, scroll del
> diálogo y de la tira): cambios pequeños; ③ descubrimiento y feedback (editar texto,
> inserción, estado vacío, Ctrl+K); ④ foco seguro en el diálogo de conflicto y «sin
> guardar» accesible; ⑤ pasada única de tokens (foco, bordes, objetivos); ⑥ guía de
> terminología. **Esto no sustituye** al «Punto de retomada» de más abajo: se suma a él
> (las capas Nivel 1 comparten el hueco del teclado del lienzo).

> **Ronda de cierre de pestañas y resiliencia · 2026-10-09** — revisión de lo
> commiteado el 2026-10-08 (`01add38`, `4da665f`) y cierre de los huecos que salieron.
> Verificación: `typecheck` 3/3; **400 back + 277 front** unit; **118/118 E2E**
> (`pnpm build:e2e` + `playwright test`; **no** vale un build de producción, que no trae
> los ganchos `__rdlc*`).
>
> - **BUG-51 · cobertura**: la lógica del vigilante de cierre (2 s), `render-process-gone`
>   y `unresponsive` sale de `main.ts` a `apps/back/src/lifecycle/windowLifecycle.ts`
>   (sin Electron, dependencias inyectadas) con **19 unit** y timers falsos
>   (`test/lifecycle/windowLifecycle.spec.ts`). Los diálogos nativos reales siguen sin
>   E2E (Playwright no los alcanza), pero ya no es lógica sin probar.
> - **Operaciones de fichero por sesión**: `lib/fileOps.ts` (`createSessionOps`,
>   `createSerialQueue`). Guardar/Guardar como en la pestaña A no bloquea la B; dentro de
>   una pestaña las operaciones se encadenan; abrir/Nuevo/soltar ficheros mientras otra
>   apertura está en curso **se encolan** (aviso en el pie, ya no se pierden en silencio).
> - **Cierre de ventana con un guardado en vuelo**: `saveAfterInFlight` espera esa
>   operación y continúa; si falla, el cierre se cancela y la pestaña queda con su
>   error (antes se cancelaba sin decir nada).
> - **«Guardando…» solo en su pestaña**: `visibleBusyLabel`.
> - **Re-adopción tras recargar la interfaz**: `ListedSession.missing` (contrato +
>   `listSessions`) vuelve a `fileMissing` y el `ui` de cada pestaña (selección, zoom,
>   paneles) se guarda en `sessionStorage` (`lib/tabUiStorage.ts`, validado campo a
>   campo). El conflicto pendiente no se recupera (el backend no lo guarda), pero se
>   vuelve a detectar al guardar (BUG-52).
> - **Reordenar pestañas** (estaba como evolutivo): arrastrar y soltar en la tira
>   (indicador de ranura), `Ctrl+Shift+RePág/AvPág` para la activa y `Alt+←/→` sobre la
>   pestaña enfocada; `moveTab` puro en `lib/workspace.ts`.
> - **Menú contextual de la pestaña** (clic derecho o tecla de menú): Cerrar · Cerrar
>   guardadas · Cerrar otras · Cerrar a la derecha · Cerrar todas
>   (`closeTargets`). Las que tienen cambios pasan por «Guardar todas / Descartar todas
>   / Cancelar» y es atómico: Cancelar no cierra ninguna; un fallo al guardar no cierra
>   nada y deja esa pestaña activa con su error.
> - **Límites conocidos**: el orden de las pestañas no sobrevive a recargar la interfaz
>   (el backend las devuelve por orden de apertura); las claves de `sessionStorage` de
>   sesiones desaparecidas se quedan hasta cerrar la ventana; mientras se guarda en
>   cualquier pestaña, Nuevo/Abrir del menú Fichero están deshabilitados.
>
> **Punto de retomada**: ① **capas Nivel 1** (pendiente de tu confirmación;
> `docs/features/0002-capas-rediseno-journey.md`); ② UX P2/P3 de `docs/ux/0002`/`0003`;
> ③ bug de `Maximum update depth exceeded` con Tablix anidados; ④ T4, T5, CI en la
> nube y firma; ⑤ evolutivo de pestañas: restaurar al arrancar, persistir el orden,
> split view y comparación. Criterio de salida de 0003 (re-evaluar **ejecutando** la
> app con una caída de render real) sigue sin hacerse.

> **Pestañas MVP A–E ✅ · 2026-10-08 (tarde)** — la fase de pestañas queda
> **implementada y verificada** (una pestaña por informe: varios informes abiertos
> a la vez con estado, undo, `dirty`, conflicto y watcher independientes por
> sesión). Verificación: `typecheck` 3/3; **254 front** unit; **114/114 E2E**.
>
> - **A · Workspace**: modelo puro en `apps/front/src/lib/workspace.ts` (39 unit)
>   con `TabState`/`TabUiState`, eventos enrutados por `sessionId` (guarda de
>   versión), anti-duplicados por ruta normalizada (case-insensitive en Windows),
>   abrir/Nuevo/recientes/drag&drop **añaden** pestaña sin cerrar la anterior y la
>   re-adopción al recargar la interfaz adopta **todas** las sesiones vivas.
>   `useDocumentCore` desaparece: el ciclo de vida vive en `useWorkspace`.
> - **B · Chrome**: `TabStrip` siempre visible (nombre, `*` de dirty, marca de
>   conflicto, cerrar con guarda por pestaña, el menú `+` que tuvo se retiró el 2026-10-09);
>   `Ctrl+W` cierra la activa y `Ctrl+Tab`/`Ctrl+Shift+Tab` rotan; cerrar la última
>   deja el editor vacío (no cierra la ventana). **Cambio deliberado**: abrir otro
>   informe ya no pregunta nada (nada se pierde: se añade pestaña); la guarda queda
>   para cerrar pestaña y cerrar ventana.
> - **C · Ciclo de vida**: diálogo **«Guardar todas / Descartar todas / Cancelar»**
>   para el cierre de ventana con varias sucias (se guardan en orden; al primer
>   fallo se cancela el cierre y esa pestaña queda activa con su error);
>   `saveAs` no puede crear dos pestañas con la misma ruta (error persistente).
> - **D · Aislamiento**: `ReportTab key={sessionId}` (solo la activa monta el
>   editor) y `TabUiState` **persistido**: selección, celdas, zoom y paneles se
>   restauran al volver a una pestaña; paleta y diálogos se cierran al cambiar de
>   pestaña; escrituras tardías de comandos van a su pestaña de origen.
> - **E · QA**: `e2e/tabs.spec.ts` (9 pruebas con `--repeat-each=2` determinista:
>   dos informes, undo/dirty independientes, selección+zoom conservados,
>   anti-duplicados, cierre de pestaña con guarda y vecina correcta, cierre de
>   ventana «Descartar todas», conflicto por pestaña) y `hasClipboard` pasa a ser
>   por sesión (el backend ya lo era).
>
> **Punto de retomada**: ① **capas Nivel 1** (pendiente de tu confirmación;
> `docs/features/0002-capas-rediseno-journey.md`); ② UX P2/P3 de
> `docs/ux/0002`/`0003` (hoja de atajos, etiquetas de alinear/distribuir, toolbar y
> barra de estado, `prefers-color-scheme`, lienzo enfocable — `/include`); ③ bug de
> `Maximum update depth exceeded` al mover Tablix anidados (la guarda de BUG-47
> protege el cambio de pestaña, pero el bug sigue abierto); ④ **T4** (property
> tests) y **T5** (flujo BC documentado) + primera pasada de CI en la nube y firma.
> **Evolutivo de pestañas** (fuera de la fase): restaurar al arrancar, split view y
> comparación de informes (reordenar por arrastre y el menú contextual se hicieron el
> 2026-10-09).

> **Cierre P0/P1 · resiliencia · 2026-10-08 (tarde)** — los dos P0 y los siete P1 de
> `docs/bugs/0002-resiliencia-2026-10-08.md` (más BUG-58/59, la jerga del estado y el
> título de ventana) están **arreglados y verificados**. El contrato solo suma:
> canales `listSessions` y `acknowledgeCloseRequest`, eventos `fileMissingChanged` y
> `externalReloadFailed`, y `SaveResult.warning`.
>
> - **BUG-51 (P0.1)**: vigilante de cierre en `main.ts` (2 s → diálogo nativo «Cerrar
>   sin guardar / Cancelar»), acuse `acknowledgeCloseRequest`, `render-process-gone`
>   (recarga o cierra) y `unresponsive`; canal `listSessions` + re-adopción de las
>   sesiones vivas al montar (la base de la fase de pestañas A); el aviso del boundary
>   dice que el trabajo sigue en memoria. Los diálogos nativos del main quedan
>   **_doc-only_** (compilan y están revisados; sin E2E que simule la caída).
> - **BUG-52 (P0.2)**: `E_CONFLICT` abre el diálogo en el front y el back adelanta
>   `lastWriteMs/Size` al disco actual: «sobrescribir» funciona una vez y un cambio
>   posterior se sigue detectando.
> - **BUG-53/55/56**: cambios externos no recargables en sesión limpia → aviso suave
>   (`externalReloadFailed`, sin diálogo); `unlink` → `fileMissingChanged` con banner
>   ámbar que se limpia al volver el fichero; `saveAs` crea el watcher nuevo antes de
>   soltar el viejo y devuelve `warning` si falla.
> - **BUG-54**: cola por sesión en `SessionService` para `save`/`saveAs`/`reload` y
>   guarda `busy` síncrona en el front (grupo Fichero deshabilitado,
>   «Abriendo…/Guardando…» a los 300 ms).
> - **BUG-57/58/59**: errores accionables persistentes (`E_UNSUPPORTED_SCHEMA`,
>   `E_CONFLICT`, `E_IO`); comandos rutinarios en silencio en el pie; título
>   `Nombre.rdlc * — RDLC Report Designer`.
>
> Verificación: `typecheck` 3/3 paquetes; **380 back + 206 front** unit; **103/103
> E2E** (`pnpm e2e`; 5 pruebas nuevas en `e2e/resilience.spec.ts`, más
> `insertTextbox` y una aserción de `setLocation` actualizadas a la conducta nueva).
> Sin cambios de producto destapados por la E2E (commiteado en `01add38`).
>
> **Punto de retomada**: superado — las pestañas A–E se hicieron después (ver el bloque
> de arriba). Sigue abierto el bug de `Maximum update depth exceeded` al mover Tablix
> anidados.

> **Rediseño de Capas con `/journey` · 2026-10-08** — solo documentación, sin código.
> Detalle en `docs/features/0002-capas-rediseno-journey.md` (+ diagrama
> `0002-capas-rediseno-journey.html`). **No sustituye** a `docs/features/0001-capas.md`
> (trabajo del usuario, sin tocar): corrige su Fase 1 con los cambios de
> `docs/ux/0003` Parte 2. Decisión tomada: **alcance por niveles**.
>
> - **Nivel 1 (a implementar primero, sin modo ni panel)**: «Seleccionar el de debajo»
>   con tres vías equivalentes — `Alt+clic`, menú contextual («de debajo / de encima /
>   Elementos aquí (N)») y `Alt+↓/↑` sobre la selección con anuncio `aria-live`; insignia
>   «1 de 2 · Alt+clic» al seleccionar algo con otro elemento debajo; arrastrar desde el
>   cuerpo del marco para mover un item tapado. No toca `hit.ts`, `ItemView`, `Paper`,
>   `App` ni el documento.
> - **Nivel 2 (condicional)**: panel «Elementos solapados» + modo «Editar solo esto» con
>   las correcciones: chip como salida (`Esc` nunca cambia de modo), insertar fuera de la
>   capa **redirige** al contenedor y avisa, panel por relevancia con pares de textos
>   colapsados, panel como árbol con teclado y **estado por pestaña**. Se construye solo
>   si hay pilas de 3+ o casos fuera de `LinesTable`/`LinesTable2`.
> - **Nombre**: «Elementos solapados» en Fase 1; «Capas» queda para las manuales de la
>   Fase 2 (sin cambios).
> - **Spikes antes de codificar (no hechos)**: (1) `Alt+clic` y `Alt+↓/↑` en Electron/
>   Windows sin activar la barra de menús; (2) pilas de las facturas con `tablixLayout`
>   vs. script de solapes; (3) mover un item tapado desde el marco sin que el de encima
>   robe el hit-test.
> - **Delegado**: textos → `/articulate`; roles y lienzo no enfocable (P2 #11) →
>   `/include`; Hidden/`unknown`, undo con insignia visible, inserción en celdas de
>   Tablix → `/fortify`; atajos y hoja de atajos → `/specify`; métricas locales opt-in →
>   `/measure`.
> - **Pendiente de decisión del usuario**: confirmar Nivel 1 primero y Nivel 2
>   condicionado.

> **Evaluación 2026-10-08 (2.ª parte) · `/evaluate` con caminos de fallo + UX de las
> capas** — complementa la revisión de más abajo (misma fecha). Método: revisión
> **estática** (código del ciclo de vida, guardas, toolbar, barra de estado, atajos,
> accesibilidad y diseño de capas) más un análisis de solapes sobre los `.rdlc` del
> repo. **No se ha ejecutado la app, no hay capturas ni usuarios**: las puntuaciones son
> estimaciones de experto. No evaluado: lector de pantalla real, contraste y foco en tema
> oscuro, rendimiento con informes grandes e inspector nuevo.
>
> **Salud UX ≈ 61/100** (rango 55–68; 0002 daba 86). Heurísticas 19/40 → 52 %, éxito de
> tarea ~60 % (5 ok · 2 dudas · 3 fallos), anti-patrones ~85 % (sin manipulación; solo
> fallos de oficio de la categoría 9). **La bajada no es una regresión**: esta evaluación
> incluye los caminos de fallo que 0002 no recorrió. Saltos: H1 1→3, H3 1→3, H9 1→3.
> El criterio de salida del bucle («sin P0 en ningún camino») **no se cumple** (no se ha
> corregido nada desde la revisión).
>
> **Hallazgos nuevos respecto a la revisión de más abajo**
>
> - **P1 · jerga interna en el estado.** `useDocumentCore` escribe
>   `Comando 'setStyle' aplicado (v12)` tras cada edición: nombres de comando y versiones
>   sin significado para el usuario. Al ser el único `role="status"` de la app, un lector
>   de pantalla leería cada edición. → `/articulate` + `/include`.
> - **P1 · sin título de ventana dinámico.** No hay `document.title` (solo el fijo de
>   `index.html`): ni el nombre del informe ni el «sin guardar» aparecen en la barra de
>   título o de tareas; el asterisco solo vive en el pie. Peor con varias pestañas. →
>   `/organize`.
> - **P2 · el lienzo no se enfoca con teclado** (sin `tabIndex` en los items; solo la
>   regla lo tiene). Los atajos son globales y la **Jerarquía es la única vía no visual**:
>   hay que garantizar que lo cubre todo. → `/include`.
> - **P2 · el tema no respeta `prefers-color-scheme`**: arranca siempre en claro y se
>   persiste solo en `localStorage`. → `/include`.
> - Se mantienen P2/P3 de 0002: hoja de atajos, etiquetas de alinear/distribuir, barra de
>   estado que repite la ruta, toolbar saturada y grupo Insertar sin etiqueta.
>
> **Recorridos que fallan** (sobre los P0, con la pregunta que se rompe): guardar tras un
> cambio externo no visto por el watcher (el aviso sugiere recargar sin ofrecerlo; Q2/Q3/Q4)
> y recuperarse de «La interfaz ha fallado» (no sabe que su trabajo sigue en memoria y la X
> no responde; Q3/Q4). Son dos fallos distintos con el mismo síntoma («no sé qué hacer»):
> no se resuelven con un único mensaje genérico.
>
> **Qué proteger**: guardas con consecuencias nombradas (Esc/clic fuera = cancelar), undo
> byte-exacto con `dirty` recalculado, lote atómico, XSD antes de escribir + escritura
> atómica con reintentos, Jerarquía + breadcrumb y `aria-label`/tooltip en los botones de
> icono de la toolbar.
>
> **UX de las capas** (evaluación del **diseño**, aún sin implementar; ≈ **70/100**
> como diseño — heurísticas 16/40, éxito de tarea ~70 % estimado, anti-patrones limpio).
> Es un diseño sólido en lo técnico (no toca el `.rdlc`, no cambia el render, Fase 1
> testeable) con fallos de **descubrimiento y de modo**:
>
> | Heur. | Pts | Hallazgo |
> | ----- | --- | -------- |
> | H6 reconocer, no recordar | **3** | `Alt+clic` es la única vía y no tiene ninguna pista visible: el usuario ve que el clic coge «lo equivocado» y no sabe que existe el ciclo |
> | H2 lenguaje | 2 | Se llama «capas» a lo que son **solapes inferidos**; quien viene de Figma/Photoshop espera crear, nombrar y reordenar capas (eso es la Fase 2). Las entradas se llaman `Tablix1/3/4` |
> | H4 consistencia | 2 | `Esc` hace dos cosas (sube al padre con selección; sale del modo capa sin ella): modo invisible con una tecla ambigua |
> | H8 minimalismo | 2 | El panel lista todas las pilas sin distinguir importancia (ver evidencia) |
> | H9 errores | 2 | «Insertar fuera de la capa activa se ignora con aviso en la barra de estado» es un fallo silencioso |
> | H10 ayuda | 2 | Sin onboarding del gesto ni entrada en la hoja de atajos (que tampoco existe) |
> | H1, H3, H5 | 1 | El chip «Capa: X ×» da visibilidad del modo; salir es barato; atenuar comunica el filtro |
> | H7 | 0 | `Alt+clic` es buen acelerador para el experto |
>
> **Evidencia sobre los `.rdlc` del repo** (script de solapes por rectángulos declarados,
> ver caveat): `SalesInvoiceESP`, `SalesInvoiceDEU` y `SalesCreditMemoESP` tienen **la pila
> `LinesTable` (z 0–1) ↔ `LinesTable2` (z 5–6)** dentro de `Tablix2/Rectangle2` — es el
> caso de uso real. **El riesgo de «cadenas» (`Tablix1/3/4/6/7` en una sola pila) no se
> confirma**: todas las pilas medidas son de 2–3 miembros (`SalesShipment` tiene una de 3
> textboxes). Pero **la mayoría de pilas son textbox sobre textbox o rectángulo + textbox**
> (etiqueta y valor, fondos), de 3–6 por informe, que compiten con la pila de tablas en el
> panel. `BTCLoadingOrder` no produce ninguna. **Caveat**: el script usa las medidas
> declaradas (`Left/Top/Width/Height`); el diseño usa `tablixLayout` (el tamaño real crece
> con las filas), así que puede **infraestimar** los solapes de Tablix. Verificar con la
> implementación real.
>
> **Recorrido «editar `LinesTable` tapada por `LinesTable2`»**: sin pista, Q2 (visibilidad)
> falla; con `Alt+clic` conocido pasa. Es **Duda** hoy y **Fallo** para quien no conoce el
> gesto. **«Mover/editar solo con teclado»** falla (sin equivalente).
>
> **Cambios propuestos al diseño antes de escribir código** (ruta `/journey`, con
> `/include` y `/articulate`):
>
> 1. **Descubrimiento**: al pasar el cursor sobre un punto con pila, chip «N elementos
>    aquí · Alt+clic para rotar» y entrada **«Seleccionar el de debajo»** en el menú
>    contextual (alternativa sin teclas modificadoras).
> 2. **Salida del modo**: el chip de la barra de estado es la salida principal; `Esc` no
>    cambia de modo.
> 3. **Inserción fuera de la capa**: redirigir al contenedor de la capa o avisar junto al
>    cursor; nunca ignorar en silencio.
> 4. **Panel**: ordenar por relevancia (tablas primero), colapsar las pilas de textboxes
>    y rotular con el `Name` más un descriptor del contenido, no solo `TablixN`.
> 5. **Lenguaje**: llamarlas «Elementos solapados» en la Fase 1 y reservar «Capas» para
>    las manuales con nombre de la Fase 2.
> 6. **Teclado/roles**: panel operable con teclado y rotación por atajo.
> 7. **Probar en la app real** el comportamiento de `Alt` en Electron/Windows antes de
>    fijar el gesto (no verificado).
> 8. **Alternativa más barata a valorar**: «Seleccionar el de debajo» + `Alt+clic` cubren
>    el caso de la factura **sin panel ni modo**; el panel y el filtro de interacción solo
>    se justifican si hay más casos que la pareja `LinesTable`/`LinesTable2`. Decisión
>    del usuario.
>
> **Estado de este bloque**: solo documentación; **no se ha tocado
> `docs/features/0001-capas.md`** (es trabajo del usuario) ni el código. La evaluación
> completa (tablas de heurísticas, recorridos, evidencia, inventario de estados y
> pruebas de estrés) está en `docs/ux/0003-evaluacion-ux.md`. Falta re-evaluar
> **ejecutando la app** (E2E con `render-process-gone` simulado y un conflicto no
> detectado) tras cerrar los P0.
>
> **Dónde está cada cosa de esta sesión (2026-10-08)**
>
> | Qué                                                           | Dónde                                                        |
> | ------------------------------------------------------------- | ------------------------------------------------------------ |
> | Lista de trabajo y orden (este bloque y el siguiente)         | este documento                                               |
> | Bugs P0/P1 con ubicación, reproducción y arreglo propuesto    | `docs/bugs/0002-resiliencia-2026-10-08.md` (BUG-51 … BUG-59) |
> | Evaluación UX, puntuaciones, recorridos, estados y estrés     | `docs/ux/0003-evaluacion-ux.md`                              |
> | Script de solapes (evidencia de capas)                        | `docs/ux/tools/overlap-stacks.py`                            |
> | Aviso de que 0002 quedó sobreconfiado                         | nota al inicio de `docs/ux/0002-evaluacion-ux.md`            |
> | Rediseño del recorrido de Capas (Nivel 1 / Nivel 2)           | `docs/features/0002-capas-rediseno-journey.md` (+ `.html`)   |
>
> **Correspondencia de IDs**: P0.1 = BUG-51 · P0.2 = BUG-52 · P1.3 = BUG-53 · P1.4 =
> BUG-54 · P1.5 = BUG-55 · P1.6 = BUG-56 · P1.7 = BUG-57 · jerga del estado = BUG-58 ·
> título de ventana = BUG-59. Ninguno tiene todavía test de regresión (solo
> documentados). El resto de hallazgos UX (P2/P3, capas) solo vive en 0003 y aquí.

> **Revisión 2026-10-08 · resiliencia del ciclo de vida (`/fortify`) y fallas UX
> (`/intent`)** — revisión **solo de lectura** (no se ha tocado código ni ejecutado la
> app; las severidades son criterio experto, sin datos de uso). Contrasta con
> `docs/ux/0002`, que da 86/100 y «ningún P0» porque evaluó la ruta feliz de cada guarda
> y no los caminos de fallo. **Su frase «el trabajo sin guardar ya no se pierde en ningún
> camino» no se sostiene** (P0.1 y P0.2).
>
> **P0 — pérdida de trabajo o usuario atrapado**
>
> - **P0.1 · Fallo de render con cambios sin guardar.** `ErrorBoundary` envuelve `<App/>`
>   (`main.tsx`): al saltar se desmonta el listener `onCloseRequested`, y `main.ts`
>   hace `preventDefault()` en cada `close` esperando al front → la X / Alt+F4 no hacen
>   nada y solo queda matar el proceso. «Recargar» (`location.reload()`) olvida la sesión
>   en el front mientras el backend la conserva sucia, huérfana y con su watcher. El bug
>   abierto de `Maximum update depth exceeded` dispara justo este camino. **Arreglo**:
>   temporizador de cierre sin respuesta en main (diálogo nativo «Cerrar sin guardar /
>   Cancelar»), handlers `render-process-gone` y `unresponsive`, y re-adopción de las
>   sesiones vivas del backend tras recargar (mismo mecanismo que la fase A de pestañas);
>   el mensaje del boundary debe decir que los cambios siguen en memoria.
> - **P0.2 · Guardar con conflicto que el watcher no vio.** `save` devuelve `E_CONFLICT`
>   (`referenceStillOnDisk`), pero el front no lo trata: solo un banner de 6 s, sin abrir
>   el diálogo de conflicto. Y «Guardar y sobrescribir» falla igual, porque en este camino
>   el backend no adelanta la referencia de disco (sí lo hace `onExternalChange`). Con la
>   guarda de «cerrar con cambios» el diálogo queda abierto sin explicación. **Arreglo**:
>   en `save()`, `E_CONFLICT` → `setConflict(doc.path)`; en el backend, al rechazar por
>   conflicto, adelantar `lastWriteMs/Size`. Un test unitario por camino.
>
> **P1**
>
> - **P1.3 · Conflicto obsoleto.** El `catch` final de `onExternalChange` emite
>   `conflictDetected` aunque no haya cambios locales (fichero a medias por Report Builder
>   o git). Al completarse, el backend recarga solo, pero el front nunca limpia `conflict`
>   en `documentChanged/external` → diálogo «Sobrescribir» que podría pisar un fichero
>   bueno. **Arreglo**: limpiar `conflict` en la recarga externa y no emitir conflicto por
>   parse fallido si la sesión no está sucia (aviso suave).
> - **P1.4 · Sin progreso ni protección contra doble acción.** Abrir / Nuevo / Guardar no
>   tienen estado «en curso». Doble clic en un reciente (o soltar dos ficheros) captura el
>   mismo `doc` obsoleto en `openPath` y deja una **sesión huérfana con su watcher**. Un
>   doble Ctrl+S puede dar un falso `E_CONFLICT` (ventana estrecha entre el `rename` y la
>   actualización de `lastWriteMs`). **Arreglo**: bandera `busy` en el hook, candado por
>   sesión en `SessionService` para `save/saveAs/reload`, y «Abriendo… / Guardando…» pasados
>   ~300 ms.
> - **P1.5 · Fichero borrado o movido por fuera: silencio.** El watcher solo escucha
>   `change`/`add`; guardar lo recrea sin avisar (`referenceStillOnDisk` devuelve `true`
>   si el `stat` falla). **Arreglo**: escuchar `unlink` y avisar en ámbar.
> - **P1.6 · «Guardar como» deja la sesión inconsistente si falla el watcher**: en
>   `saveAs`, `filePath` y `originalBytes` ya apuntan al fichero nuevo cuando
>   `fileWatcher.watch` puede lanzar (fichero escrito, sesión sucia, sin watcher, excepción
>   sin mapear). **Arreglo**: `try/catch`, crear el watcher nuevo antes de soltar el viejo y
>   avisar «guardado, pero no se vigilan cambios externos».
> - **P1.7 · Errores accionables efímeros.** El autodescarte de 6 s alcanza a
>   `E_UNSUPPORTED_SCHEMA`, `E_CONFLICT` y `E_IO` al guardar (mensajes largos con
>   instrucciones). Antes era el P3 #8 de 0002; se **sube a P1** por P0.2. **Arreglo**:
>   hacer persistentes esos códigos y dejar el autodescarte para errores de comando.
>
> **Capas (`docs/features/0001-capas.md`, sigue «propuesto», sin implementar y sin
> tocar el documento)** — cinco riesgos de UX a resolver **antes** de escribir código:
>
> 1. **`Alt+clic` es un gesto oculto**: sin pista visible no se descubre (chip «N elementos
>    solapados aquí» al pasar el cursor, o entrada en el menú contextual).
> 2. **`Esc` sobrecargado** (sube al padre con selección, sale del modo capa sin ella):
>    modo invisible con una tecla ambigua. Salida principal = chip de la barra de estado;
>    `Esc` nunca cambia de modo.
> 3. **Insertar fuera de la capa activa se ignora con un aviso en la barra de estado**:
>    fallo silencioso. Redirigir al contenedor de la capa o avisar junto al cursor.
> 4. **Pilas por componentes conexas**: en `SalesInvoiceESP`, `LinesTable` +
>    `Tablix1/3/4/6/7` pueden formar una cadena y el ciclo recorrería miembros que no
>    solapan bajo el cursor. **Probar sobre la factura real antes de implementar.**
> 5. **Sin equivalente de teclado** (`/include`): el panel de Capas debe operarse con
>    teclado y exponer roles; la Jerarquía es hoy la alternativa accesible.
>
> Además, `activeLayerId`/`showLayers` están pensados como estado global de `App`: con la
> fase de pestañas deben vivir **por pestaña** (implementar ya con ese criterio o esperar
> al store de pestañas). Además, el bug de Tablix anidados afecta a la misma estructura de
> contenedores sobre la que irán las capas.
>
> **No evaluado todavía** (P3): lector de pantalla y teclado del lienzo Konva, contraste y
> foco en **tema oscuro** (añadido después de 0002), inspector nuevo y rendimiento
> percibido con informes grandes.
>
> **Orden recomendado**: ① P0.2 + P1.3 + P1.4 (cambios pequeños, un test unitario cada
> uno); ② fase de pestañas A–B junto con P0.1 (comparten la re-adopción de sesiones); ③
> pestañas C–E; ④ rediseño de capas con `/journey` e implementación; ⑤ UX P2/P3 de 0002
> (hoja de atajos, etiquetas de alinear/distribuir, toolbar/estado/grupo Insertar); ⑥ T4,
> T5 y primera pasada de CI en la nube con firma. **Criterio de salida del bucle**:
> re-`/evaluate` incluyendo caminos de fallo, sin P0 en ninguno. Es el primer retroceso
> sobre 0002.
>
> **Pendiente de evidencia del usuario**: ¿se ha perdido trabajo alguna vez o se ha visto
> «La interfaz ha fallado»?, ¿con qué frecuencia hay conflictos con Report Builder? Sin
> esos datos el orden entre P0 y capas es juicio, no medición.

> **Planificación 2026-10-05 · nueva fase del MVP: pestañas (una pestaña = un informe)** —
> decisión de producto: el editor pasa a abrir **varios informes a la vez**, cada uno
> en su pestaña. Hoy `useDocumentCore` mantiene **un único** `doc` y abrir otro
> fichero cierra la sesión anterior (`api.close(...)`); es el mayor límite del uso
> diario con BC (comparar layouts, copiar contenido entre informes, tener una copia
> de trabajo y el original).
>
> El **backend ya está listo** para N sesiones: `SessionService` mantiene
> `Map<sessionId, Session>` (documento, índice, watcher, `dirty`, mtime y
> portapapeles por sesión) y `CommandService` tiene **journal por sesión**; los
> eventos IPC (`documentChanged`, `dirtyChanged`, `conflictDetected`, `saved`,
> `sessionClosed`) llevan `sessionId`. La fase es **casi toda front** más el ciclo
> de vida de la ventana; el detalle técnico (modelo del workspace, componentes y
> flujos) está en `RDLC Report Designer - arquitectura.md` § «Fase MVP — Pestañas».
>
> **Contrato de la fase**:
>
> - Una pestaña = una sesión del backend, con proyección, `dirty`, undo/redo,
>   conflicto y watcher **independientes**; cambiar de pestaña no recarga ni cierra.
> - Abrir/Nuevo/recientes/drag&drop **añaden pestaña**; si la ruta ya está abierta
>   se activa la existente (sin duplicados).
> - Cada pestaña conserva **su estado de UI** (selección, celdas, zoom, paneles) al
>   volver a ella y **solo la pestaña activa monta el stage Konva** (el criterio de
>   T3, que hoy era N/A, vuelve a aplicar).
> - Cerrar pestaña con cambios usa el diálogo de guardas actual (por sesión); cerrar
>   la ventana con varias sucias ofrece **Guardar todas / Descartar todas / Cancelar**
>   y una guarda que falle deja su pestaña activa con el error (nunca se pierde
>   trabajo en silencio).
> - Teclado: `Ctrl+W` cierra la activa y `Ctrl+Tab` / `Ctrl+Shift+Tab` rotan; el
>   resto de atajos (Ctrl+S, Ctrl+Z, Ctrl+K…) operan sobre la activa.
>
> **Bloques de trabajo** (S < 1 sesión · M = 1 sesión · L = varias):
>
> | Bloque | Tarea                                                                                                                                                                                                                                                                                               | Tam. |
> | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
> | A      | **Workspace**: store de pestañas (sesión + proyección + dirty + conflicto + estado por pestaña), enrutado de eventos por `sessionId` (incluido `sessionClosed`) y abrir/Nuevo que **no** cierran la anterior; anti-duplicados por ruta                                                              | M    |
> | B      | **Chrome**: `TabStrip` (título con `*` de dirty, marca de conflicto, cerrar con guarda, menú `+` con Nuevo/Abrir/recientes) y atajos de pestañas                                                                                                                                                    | M    |
> | C      | **Ciclo de vida**: cierre con guarda **por sesión**, cierre de ventana con varias sucias («Guardar todas / Descartar todas / Cancelar») y estado/error por pestaña en vez de globales                                                                                                               | M    |
> | D      | **Aislamiento de edición**: `ReportTab` con `key={sessionId}` (solo la activa monta el editor), `useItemEditing` arranca y persiste selección/zoom/paneles en la pestaña, paleta y diálogos sobre la activa                                                                                         | M    |
> | E      | **QA**: unit del store (abrir/activar/cerrar, eventos enrutados, guarda de versión, anti-duplicado) + E2E de dos informes (dirty/undo independientes, cambio de pestaña conserva selección y zoom, cierre con guardas, cierre de ventana) y regresión de la suite actual, que asume **una** pestaña | M    |
>
> **Fuera de la fase (evolutivo)**: restaurar las pestañas al arrancar, reordenarlas
> por arrastre, split view de la misma sesión y comparación de informes.
>
> **Punto de retomada**: hacer **A–B** primero (pestañas visibles y usables), seguir
> con **C–D** (guardas y aislamiento) y cerrar con **E**. Es independiente de F2.c/F3
> (cerradas) y de **T4/T5**; se sugiere antes que la deuda de UX P2/P3 de
> `docs/ux/0002` por ser funcionalidad de uso diario. Sigue abierto el bug de
> `Maximum update depth exceeded` al mover Tablix anidados.

> **Sesión 2026-10-02 (5.ª parte) · informe «en blanco» en Report Builder tras un
> split+merge (dos bugs de compatibilidad RB)** — el fichero editado (split de una
> celda + merge con la vecina) se veía bien en la app pero RB mostraba el cuerpo
> vacío. Diagnóstico usando **RB 15 como oráculo** (capturas de la ventana): el
> `list1` se dibuja **debajo de dos textboxes que la edición dejó en el cuerpo sin
> `Top/Left/Width/Height`**; RB estira esos items al tamaño de la banda y su fondo
> blanco tapa la tabla entera (la app los pinta pequeños). Además, el flujo de
> split/merge/duplicado creaba nombres duplicados **solo por caja**
> (`Textbox3/6/8/9` vs `textbox3/6/8`), inválidos para RB (VB case-insensitive).
>
> - **Fix 1 · geometría de banda** (`bandGeometry.ts`): `moveItem` y
>   `insertCloneAt` (pegar/duplicar) materializan `Top/Left/Width/Height` cuando
>   el destino es `Body`/`PageHeader`/`PageFooter`; defaults = los de insertar en
>   el lienzo (textbox 5×1, rectangle 5×1, line 4×0, image 3×2, tablix 7,5×1,2 cm).
>   Undo byte-exacto (el clon se va entero; los tags creados se quitan).
> - **Fix 2 · unicidad sin caja**: `DocumentIndex.has` compara en minúsculas;
>   `nextItemName`/`freeName` reservan los nombres que solo difieren en caja;
>   `setName` admite cambiar la caja del propio nombre y rechaza el resto;
>   `setGroupName`/`nextGroupName`/`findGroupByName` también ignoran caja.
> - **Tests**: +4 (mover/pegar un textbox de celda al cuerpo materializa
>   longitudes; insertar con `textbox1` ocupado da `Textbox2`; `setName` rechaza
>   `Textbox3` si existe `textbox3` y admite `textbox3 → TextBox3`).
>   **327 back** verdes y `typecheck` limpio.
> - **Reparar ficheros ya rotos**: borrar en la app los textboxes sueltos del
>   cuerpo (o darles X/Y/Ancho/Alto); RB vuelve a dibujar la tabla (verificado con
>   el `VendorPrePaymentJournal.rdl` del usuario).

> **Sesión 2026-10-02 (2.ª parte) · soporte `.rdl` (RDL 2016)** — la app solo
> abría `.rdlc`; los RDL de SSRS se quedaban fuera de los diálogos y del
> drag&drop.
>
> - **Extensiones**: diálogos Abrir/Guardar («Informes RDL/RDLC»), argumento de
>   CLI/`RDLC_OPEN` y drag&drop aceptan `.rdlc` y `.rdl`; el overlay y la barra
>   de estado lo dicen.
> - **Esquema al abrir**: RDL y RDLC comparten el esquema **2016/01**, así que
>   la edición y el round-trip son los mismos; el nombre del informe sale sin la
>   extensión. Al abrir se comprueba la raíz (`<Report>`) y el namespace: un RDL
>   anterior a 2016 (2005/2008/2010, con `Report > Body` sin `ReportSections`)
>   se rechaza con un motivo accionable (`E_UNSUPPORTED_SCHEMA`: «ábrelo con
>   Report Builder 2016 o superior, guárdalo y vuelve a intentarlo»), en vez de
>   abrirse vacío y no poder guardarse.
> - **Tests**: 3 unit nuevos en `session.service.spec.ts` (`.rdl` 2016 con
>   round-trip byte-exacto, RDL 2008 rechazado y raíz que no es `<Report>`) y
>   spec E2E nuevo `rdl-support.spec.ts` (2 tests: abre/guarda un `.rdl` byte a
>   byte y el aviso del esquema antiguo).
>
> Verificación: typecheck limpio, **309 back + 189 front** unit y **80/80 E2E**
> verdes. El punto de retomada del bloque T1–T3 (UX P2/P3, bug de Tablix
> anidados, T4/T5) sigue vigente.

> **Sesión 2026-10-02 · T1–T3 (CI + empaquetado, endurecimiento de Electron, rendimiento del lienzo)** —
> los tres técnicos del backlog que quedaban por delante. La deuda de UX (P2/P3 de 0002)
> sigue fuera de este bloque.
>
> - **T1 · CI + empaquetado** ✅: electron-builder 26 con **NSIS + MSI**
>   (`apps/back/electron-builder.yml`), scripts `pnpm dist` / `pnpm dist:dir`, icono
>   placeholder en `build/icon.ico` y el XSD del validador copiado **fuera del asar**
>   (`extraResources` → `resources/rdl2016/`, resuelto con `app.isPackaged`).
>   **Verificado**: `dist:dir` + smoke del .exe empaquetado (`openFile` + `save` desde un
>   guion de QA → `bytesIdentical: true`, es decir la validación XSD real con el esquema
>   empaquetado) y `dist` completo (**NSIS 111 MB + MSI 125 MB**). CI:
>   `.github/workflows/ci.yml` (checks en ubuntu + E2E en windows) y `release.yml`
>   (tags `v*` o dispatch → instaladores + adjuntos a la release; firma opcional con
>   `CSC_LINK`/`CSC_KEY_PASSWORD`). Detalle en `docs/release/0001-empaquetado-windows.md`.
>   **Pendiente**: primera ejecución del CI en la nube y certificado de firma real.
> - **T2 · Endurecer Electron** ✅: `sandbox: true` con **preload en CommonJS y bundleado**
>   (el sandbox no admite ESM ni `require` de `node_modules`; zod entra en el bundle),
>   navegación bloqueada fuera de la URL de la app, `window.open` y `<webview>` denegados y
>   permisos restringidos a `clipboard-sanitized-write`. Política pura en
>   `src/security/navigation.ts` (con tests) y **3 E2E nuevos** en `e2e/security.spec.ts`
>   (sandbox/contextIsolation, ventanas nuevas y navegación).
> - **T3 · Rendimiento del lienzo** ✅: el benchmark mide ya el **camino real de arrastre**
>   (nodo Konva + `batchDraw` por frame, sin React) sobre el build de producción
>   (`apps/back/scripts/bench.mjs`; 3 pasadas y mediana). Añadidos **culling por ventana
>   visible** (intersección con el stage, cuantizada a 400 px con margen de 600, activo a
>   partir de 250 items), `perfectDrawEnabled: false` y **caché de rejillas grandes**.
>   Escenario de 972 textboxes: **29,9 → 59,5–59,9 fps p50**, `draw()` del layer
>   25,6 → 6,9–12,5 ms y 755 de 1.945 grupos ocultos. Tabla completa en
>   `docs/perf/0001-baseline-lienzo.md`. «Solo la pestaña activa monta el stage» queda N/A
>   (una ventana = un documento).
>
> Verificación: `typecheck` limpio; **306 back + 189 front** unit y **78/78 E2E**
> (incluye los 3 de seguridad) en pasada completa. `dist:dir`/`dist` y el smoke
> empaquetado, hechos a mano.
>
> **Punto de retomada**: ① **UX pendiente** (P2 #4 etiquetas de alinear/distribuir, P2 #5
> hoja de atajos y los P3 de `docs/ux/0002`: toolbar, barra de estado, error persistente,
> grupo Insertar); ② bug de `Maximum update depth exceeded` al mover Tablix anidados;
> ③ técnicos que quedan: **T4** (property tests) y **T5** (flujo BC documentado); ④ primera
> pasada de CI en la nube y firma real cuando haya certificado. `docs/features/0001-capas.md`
> sigue siendo trabajo del usuario, sin tocar.

> **Sesión 2026-10-01 (5.ª parte) · pruebas manuales: ancho del cuerpo en «Informe…»**
> — en «Informe… → Configurar página» solo se podía editar el **alto** del
> cuerpo; el **ancho de la sección** (`ReportSection > Width`) solo se arrastraba
> en el lienzo.
>
> - **Campo nuevo**: «Ancho del cuerpo (cm)» junto al alto, cableado a
>   `setSectionWidth` (el mismo comando del arrastre); el dominio sigue
>   clampeando al contenido y las tres bandas comparten el valor.
> - **E2E**: el test de «Informe…» edita también el ancho y comprueba el valor
>   resultante (con clamp) en el cuerpo, el encabezado y el pie.
> - **Fallo latente cazado al ejecutarlo**: el test del diálogo pedía encabezado
>   2 cm y pie 1,5 cm; con los topes de contenido de la 3.ª parte el dominio los
>   sube (encabezado 8,43921 · pie 2,53503). Ahora pide valores **por encima del
>   contenido**. Es exactamente lo que tenía que cazar la pasada completa.
>
> Verificación: typecheck limpio, **182 front**; **pasada completa de E2E:
> 75/75 verdes** (incluye el diálogo corregido). Captura QA del campo nuevo.
>
> **Punto de retomada**: ① **pasada completa de E2E cerrada (75/75)**;
> ② sigue **T1** (CI + empaquetado); ③ abiertos el bug de `Maximum update
depth exceeded` y los P2/P3 de 0002.

> **Sesión 2026-10-01 (4.ª parte) · pruebas manuales: previsualización de márgenes**
> — feedback del uso real: la pastilla de la previsualización de un margen se
> quedaba en la esquina del papel (en las líneas verticales), se recortaba y
> además repetía el nombre del margen.
>
> - **Solo el tamaño**: la etiqueta muestra los **cm resultantes**, sin «Margen
>   der.» (como las bandas y el ancho de sección); los marcadores de la regla
>   conservan sus etiquetas accesibles.
> - **Junto a la línea**: en líneas verticales la pastilla va a la **derecha** de
>   la línea y, si no cabe en el papel, a la **izquierda** (las horizontales
>   siguen encima, con su fallback de siempre). Aplica también al ancho de
>   sección, que es vertical.
> - **Ancho según el texto**: la pastilla crece con `Text.measureSize` (mínimo
>   `BADGE_PX`), así el tamaño resultante no se recorta.
> - **E2E**: el test de márgenes ahora exige el **valor** en la etiqueta (sin
>   nombre) y la posición de la pastilla junto a la línea (derecha en el margen
>   izquierdo, encima en el superior).
>
> Verificación: typecheck limpio, **182 front**; E2E dirigidos (cuerpo, bandas,
> márgenes, ancho de sección y tramos de regla) verdes, con captura QA de los
> márgenes derecho y superior. **Pendiente: pasada completa de la suite E2E**
> (75 tests).
>
> **Punto de retomada**: ① pasada completa de E2E; ② sigue **T1** (CI +
> empaquetado); ③ abiertos el bug de `Maximum update depth exceeded` y los
> P2/P3 de 0002.

> **Sesión 2026-10-01 (3.ª parte) · pruebas manuales: reglas de contenido en U10**
> — feedback del uso real sobre el redimensionado de página:
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
> - **El alto de las bandas tampoco baja de su contenido** (encabezado, **cuerpo**
>   y pie): el dominio clampa `setRegionHeight` al fondo más lejano de los items
>   de la banda (`bandContentBottomCm`) y el arrastre usa su mínimo
>   (`bandContentMinCm`), con no-op byte-exacto si no cambia. En
>   `SalesCreditMemoESP`: el encabezado está lleno (8,43921 cm), el cuerpo baja
>   como mucho a 12,51612 y el pie a 2,53503.
> - **Estabilización E2E**: el test del menú de celda clicaba un item de submenú
>   Radix que se re-monta («element is not stable»); ahora usa
>   `clickMenuItem` (espera visible + `dispatchEvent('click')`), espera al cierre
>   del menú antes de reabrirlo y **recalcula el punto** (el lienzo se
>   re-encuadra tras la interacción). `undoAll` tolera outcomes **sin inversos**
>   (comandos no-op).
>
> Verificación: **301 back + 182 front**, typecheck limpio; E2E dirigidos verdes
> (bandas con los topes de contenido, márgenes, clamp de sección y menú con
> `--repeat-each=3`). **Pendiente: pasada completa de la suite E2E** (75 tests)
> en la próxima sesión.
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
> Al fusionar, el contenido de las celdas cubiertas se descarta; el ancla
> conserva el suyo y hereda el ancho fusionado. **BC/SSRS exigen una
> `TablixCell` por columna**: la celda cubierta se queda como relleno vacío
> (quitar celdas hacía que Report Builder fallara al abrir el informe con «El
> índice estaba fuera del intervalo»); separar rellena ese hueco en su sitio y
> añadir/quitar columna crea/elimina su relleno. Las filas ya fusionadas por
> versiones antiguas (solo anclas) conservan su forma hasta que se vuelvan a
> fusionar.
> **Añadir columna**: la decisión (crecer un `ColSpan` con relleno vs. insertar
> celda con textbox) se toma por fila **antes** de mutarla; leerla después con el
> recuento de columnas viejo duplicaba la celda (`TextboxN` + relleno) y dejaba
> la fila con más celdas que columnas (RB: «índice fuera de intervalo»).
> **`ListStyle`**: RDL 2016 solo lo admite como **hijo directo de
> `<Paragraph>`** (no dentro de `<Style>`). El editor lo escribía en el `<Style>`
> del item y el guardado fallaba con `E_VALIDATION` («`ListStyle`: This element
> is not expected»); ahora `setStyle`/`setParagraphs` lo escriben y el
> adaptador lo lee en el párrafo, y el comando limpia los nodos legados.
> **Separar crea textbox**: la celda recreada nace con un **Textbox vacío** (sin
> longitudes: el tamaño lo pone la celda) en vez de quedar muerta, y el
> documento sigue validando el XSD.
> **Insertar en una celda**: el item nace con el **tamaño de la celda** y en su
> origen (antes: tamaño por defecto en el punto del cursor).
> **Proyección de celdas con fusiones**: BC/SSRS numeran las celdas por
> **columna** (la i-ésima celda es la columna i; las cubiertas por un `ColSpan`
> son rellenos vacíos que no se proyectan) y las filas ya fusionadas por el
> editor (solo anclas) acumulan los `ColSpan`. Al fusionar, las celdas de la
> derecha conservan el ancho de SU columna (bug detectado con
> `SalesInvoiceESP`: la celda de un textbox pasaba de 3.35 a 3.53 cm); antes los
> rellenos se contaban como celdas y todo lo posterior a una fusión se
> desplazaba (`VendorPrePaymentJournal.rdl`). Las filas que desbordan las
> columnas declaradas (ficheros tolerantes de BC) usan la última columna como
> referencia en vez de dibujarse 0×0.
> **Colisión de nombres item/campo**: el `DocumentIndex` ya solo indexa los
> items de informe (el `choice` de `ReportItems` del XSD). BC reutiliza `Name`
> en los campos de DataSet (y estos van **después** de `ReportSections`), así
> que un campo llamado como un textbox pisaba su entrada: al editar el borde o
> el color, el comando escribía el `<Style>` en el `<Field>` y el front
> reconciliaba el estilo del item sin el padding (se «reseteaba»). Renombrar
> grupos sigue rechazando nombres de item (`setGroupName` consulta grupos aparte).
> **Rejilla segmentada**: las fronteras que cruza una celda fusionada ya no se
> dibujan (`lib/grid.ts`): una celda con `ColSpan`/`RowSpan` se ve como una caja
> continua en vez de parecer partida (caso `TextboxVATClauseDesc` en
> `SalesCreditMemoESP`: una celda con `ColSpan 2` mostraba la línea en medio).
> **Edición en lote de celdas**: el panel de multiselección mapea cada celda del
> rango por su **columna de rejilla** (`selectedCellContents` + `tablixLayout`),
> no por el índice del array: con filas fusionadas (sin rellenos en la
> proyección) el índice y la columna difieren y el lote editaba **otros**
> textboxes (p. ej. seleccionar 4 celdas nuevas cambiaba la columna de
> descripción). El breadcrumb/jerarquía usan el mismo mapeo.
> **Fuentes en el run**: BC escribe `FontFamily`/`FontSize`/`FontWeight`… **solo
> en el `<Style>` de cada `TextRun`** (los 10 RDLC del corpus: 100 % en el run) y
> RB las resuelve ahí: un textbox nuevo con la fuente solo en el `<Style>` del
> item se ve a Arial 10. `setStyle` replica ahora los tags de texto del parche en
> todos los runs y materializa los que el item declare y el run herede (con el
> valor efectivo del párrafo); `setParagraphs` hereda las fuentes del item en los
> runs nuevos para no perderlas al editar el texto. Así el formato de un textbox
> recién insertado también sobrevive en Report Builder.
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
> bloqueaba porque montaba un Monaco por run y pedía la lista de fuentes por
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

| Área                                                                                                            | Estado        |
| --------------------------------------------------------------------------------------------------------------- | ------------- |
| Monorepo pnpm + turbo, TS estricto, prettier                                                                    | ✅            |
| `packages/contracts` (comandos, proyección, IPC, errores, `RdlcApi`)                                            | ✅            |
| Golden round-trip **byte a byte** sobre el corpus (10/10) + ADR 0001                                            | ✅            |
| Shell Electron + NestJS en el main (`createApplicationContext`) + preload tipado                                | ✅ (ADR 0002) |
| File watching → re-parseo → recarga en vivo (filtra el eco por mtime)                                           | ✅            |
| Lienzo Konva: papel + márgenes + bandas, reglas en mm/cm, zoom Ctrl+rueda, placeholder de imagen                | ✅            |
| Selección (marco + tiradores), drag con imán (Shift lo ignora), flechas 1pt/10pt                                | ✅            |
| Edición de anidados (drag determinista por delta del puntero; `dragend` que burbujea)                           | ✅            |
| **Validación XSD oficial RDL 2016/01** (libxml2-wasm): avisa al importar, **bloquea al guardar**                | ✅            |
| Panel de propiedades (geometría), panel de texto/expresión por runs                                             | ✅            |
| **Barra de formato** (fuentes de Business Central, tamaño, N/I/S, color, resaltado, alineación, listas, valign) | ✅            |
| Variables (Fields/Parameters/Code./Globals/User) con búsqueda y grupos colapsables                              | ✅            |
| Propiedades del informe (Configurar página + Código VB en Monaco-like textarea)                                 | ✅            |
| Panel de imagen: origen, campo/expresión (fx), MIME desplegable (fx), tamaño (radios), padding                  | ✅            |
| Insertar / duplicar / eliminar items (botones, Ctrl+D, Supr) con undo byte-exacto                               | ✅            |
| Auto-crecimiento del contenedor al sacar un hijo fuera (solo rectángulos con tamaño explícito)                  | ✅            |
| Undo/redo con journal (inversos múltiples por comando)                                                          | ✅            |
| Tests: 94 back + 10 front (golden, comandos, invariantes, integración, fuentes, XSD)                            | ✅            |

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

| #     | Gap                                       | Estado hoy                                                            | Qué falta                                                                                                            | Tam. |
| ----- | ----------------------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ---- |
| T1 ✅ | **CI + empaquetado**                      | Nada                                                                  | Hecho (2026-10-02): GitHub Actions (typecheck + unit + E2E) y electron-builder (NSIS/MSI), firma opcional y recursos | M    |
| T2 ✅ | **Endurecer Electron**                    | `contextIsolation`, `nodeIntegration:false`, CSP y zod en el borde ✅ | Hecho (2026-10-02): `will-navigate`, `setWindowOpenHandler`, `sandbox: true` y permisos                              | S    |
| T3 ✅ | **Rendimiento del lienzo**                | Línea base medida (972 textboxes ≈ 30 fps)                            | Hecho (2026-10-02): culling, drag sin React, rejilla cacheada; **59,5–59,9 fps p50**                                 | L    |
| T4    | **Property tests** de comandos aleatorios | No hay                                                                | Generador + invariantes (undo byte-exacto)                                                                           | M    |
| T5    | **Flujo BC documentado** (página 9650)    | No hay                                                                | Guía exportar → editar → reimportar y evolutivo de despliegue                                                        | S    |

**Plan acordado (2026-09-29)**: ① cubrir gaps (G1–G13, priorizando P1) →
② pase de UX con el skill `intent` (U1–U9) → ③ seguir fase (**F2.c** totales →
**F3** Matrix) y cerrar con T1 (CI/empaquetado).

**Progreso**: ① **G1–G13 ✅** (2026-09-29), ② **U1–U9 ✅** (pase `intent`, 2026-09-30) y
**T1–T3 ✅** (2026-10-02). Quedan **T4** (property tests) y **T5** (flujo BC documentado),
la deuda de UX P2/P3 de 0002 y el bug de los Tablix anidados. **Fase nueva del MVP**
(2026-10-05): **pestañas, una por informe** (bloque de planificación al inicio de este
documento y plan técnico en `RDLC Report Designer - arquitectura.md` § «Fase MVP — Pestañas»).

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

9. **Rendimiento del lienzo** — ✅ hecho (T3, 2026-10-02): drag sin re-render de React,
   **viewport culling** por ventana visible, rejilla grande cacheada y
   `perfectDrawEnabled: false`; 972 textboxes a **59,5–59,9 fps p50**
   ([docs/perf/0001-baseline-lienzo.md](docs/perf/0001-baseline-lienzo.md)). «Solo la
   pestaña activa monta el stage» es N/A (una ventana = un documento).
10. **Arquitectura del lienzo** — ✅ base y **U3** (multi-selección por Ctrl/Shift+click y
    marco, alinear/distribuir y lote con `batch`); lo único no hecho son **guías
    inteligentes** al arrastrar (no estaban en el plan auditado).
11. **Lista de variables → inserción en Monaco** — ✅ hecho: inserta en la posición del
    cursor del editor registrado (y copia al portapapeles si no hay editor).
12. **Breadcrumb de contenedor** (Rectángulo/Celda) y **panel de jerarquía** del informe
    (árbol de elementos) — ✅ hecho (U4, 2026-09-30): `lib/hierarchy.ts`, breadcrumb
    clicable sobre el lienzo y panel de Jerarquía conmutables desde la toolbar.

## 🟠 Proceso y operativa

13. **Empaquetado** — ✅ hecho (T1, 2026-10-02): electron-builder NSIS + MSI, XSD fuera del
    asar, icono y CI de release; firma pendiente de certificado
    ([docs/release/0001-empaquetado-windows.md](docs/release/0001-empaquetado-windows.md)).
14. **Seguridad Electron** — ✅ hecho (T2, 2026-10-02): sandbox activo con preload CJS
    bundleado, navegación/ventanas/`webview` bloqueados y permisos denegados salvo
    `clipboard-sanitized-write` (3 E2E de regresión).
15. **XML corrupto / inválido** — ✅ resuelto: parse error → no se abre; XSD inválido →
    aviso al importar y **bloqueo al guardar** con lista de problemas.
16. **Flujo BC** — ⬜ documentar el ciclo exportar layout (página 9650) → editar →
    reimportar; evolutivo: desplegar a BC. (**T5**, pendiente.)
17. **Testing más allá del golden** — 🔶 **495 unit** (306 back + 189 front), **78 E2E** de
    Playwright ✅ y **CI** ✅ (T1); falta el **property testing** de comandos aleatorios (**T4**).

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
