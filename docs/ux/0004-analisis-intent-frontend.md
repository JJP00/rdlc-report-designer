# Análisis del front con el sistema Intent — app en ejecución

- **Fecha**: 2026-10-09
- **Commit evaluado**: `a18b880` (pestañas con reordenar y menú contextual, resiliencia cerrada)
- **Skills aplicadas**, en paralelo y con la app ejecutándose (Playwright sobre el build de
  producción, informes de `fixtures/corpus` copiados a temporales): `/evaluate`,
  `/include`, `/organize` + `/articulate` y `/fortify` + `/transpose`.
- **Diferencia con 0003**: aquel análisis fue **estático** (lectura de código). Este
  observa la app corriendo: capturas, árbol de accesibilidad, orden de Tab, contrastes
  calculados con `getComputedStyle`, tres tamaños de ventana, 8 pestañas y un informe de
  136 elementos.
- **Naturaleza de las cifras**: las puntuaciones son estimaciones de experto. Los
  contrastes son **cálculos** a partir de estilos computados, no mediciones con una
  herramienta dedicada. Lo que dependía de un lector de pantalla es **inferido** del DOM.
- **No evaluado**: lector de pantalla real (NVDA/Narrator), DPI y zoom del sistema,
  arrastrar ficheros desde el Explorador (`webUtils` no se puede simular), doble clic en un
  reciente, cierre con varias pestañas sucias a la vez, informes de más de 136 elementos,
  edición profunda de tablix y usuarios reales. Los P0 de 0003 no se re-provocaron: se
  asumen cerrados por `01add38`.

## Salud UX

**≈ 71 / 100** (rango 64–78), con los mismos pesos que 0003.

| Componente           | Resultado                                           | Peso |
| -------------------- | --------------------------------------------------- | ---- |
| Heurísticas (H1–H10) | 16 puntos de severidad / 40 → 60 %                  | 50 % |
| Éxito de tarea       | 6 ok · 2 dudas · 1 fallo (~75 %, estimado)          | 30 % |
| Anti-patrones        | sin manipulación; fallos de oficio (~90 %)          | 20 % |

Comparación: 0002 = 86 (solo ruta feliz), 0003 ≈ 61 (caminos de fallo, estático), hoy
≈ 71. Sube respecto a 0003 porque lo ejecutado confirma las mejoras (título con `*`,
«Guardado:» / «Deshecho», pestañas robustas). No sube más porque, al ejecutar, aparece una
capa de problemas de accesibilidad y adaptación que el análisis estático no veía. El rango
es amplio porque H9 (recuperación de errores) no se volvió a medir.

| H   | Hoy | Nota                                                                |
| --- | --- | ------------------------------------------------------------------- |
| H1  | 2   | Las ediciones no dicen nada en el pie; «Abierto: …» queda obsoleto  |
| H2  | 1   | Jerga del modelo en el inspector                                    |
| H3  | 1   | Undo y diálogos de cierre con «Cancelar» enfocado                   |
| H4  | 2   | «Aplicar» (informe) frente a edición en vivo (elemento)             |
| H5  | 1   |                                                                     |
| H6  | 2   | Editar texto solo desde el menú contextual; toolbar sin etiquetas   |
| H7  | 2   | Sin doble clic / Enter / F2; lienzo sin teclado; Ctrl+K invisible   |
| H8  | 2   | Inspector apilado                                                   |
| H9  | 1   | No re-medido                                                        |
| H10 | 2   | Estado vacío largo; sin hoja de atajos                              |

## Veredicto de anti-patrones

**Sin manipulación.** Lo que hay es negligencia de oficio: **Destructive Default** en el
diálogo de conflicto (hallazgo 8), **Missing Feedback** en la inserción y en el pie
(hallazgos 7 y 17) y **Dead End** en el diálogo «Informe…» a ventana pequeña (hallazgo 4).

## Hallazgos consolidados por prioridad

Las cuatro auditorías coinciden en varios puntos; aquí están **fusionados**. «Verificado»
= comprobado además leyendo el código tras recibir los informes. `[NUEVO]` = no estaba en
0002/0003.

### P0 — bloquea a un grupo de usuarios

**1. El lienzo no tiene entrada por teclado ni alternativa para lector de pantalla.**
Confirma y agrava 0003 #11 (lo señalan `/include`, `/evaluate`, `/organize` y `/fortify`).
- Observado: los `<canvas>` de Konva cuelgan de un `div role="presentation"`, sin
  `tabindex`, `role` ni `aria-label`. De las 40–45 paradas de Tab ninguna entra en el
  lienzo; tras un clic, `document.activeElement` es `BODY`. Los atajos globales (flechas,
  Supr, Esc) funcionan, pero exigen una selección previa, que solo se consigue con ratón,
  Jerarquía o Ctrl+K.
- Consecuencia: un usuario ciego o solo de teclado no sabe qué hay en la página ni puede
  crear elementos sin puntero.
- Arreglo: contenedor `role="application"` (o `group`) con `aria-label` («Página del
  informe, N elementos») y `tabindex=0`; Tab o flechas recorren los elementos por orden de
  lectura; región `aria-live` que anuncie la selección y el movimiento («Textbox2, x … cm,
  y … cm»); un comando «Insertar en la posición…» con teclado.
- → `/journey` (modelo de interacción) y `/specify`.

### P1 — daña tareas centrales

**2. La Jerarquía declara `role="tree"` pero no se navega como un árbol.** [NUEVO]
Observado: 233 `treeitem` en lista plana, sin `aria-level` ni `role="group"`, 341 botones
enfocables y ninguna navegación con flechas (`HierarchyPanel.tsx`). Llegar al elemento 200
exige hasta 340 Tab, y es la única vía no visual. ARIA incorrecto es peor que ninguno.
Arreglo: roving tabindex con ↑/↓, →/← para expandir y colapsar, Inicio/Fin, y
`aria-level` / `aria-setsize` / `aria-posinset`. → `/specify`.

**3. La tira de pestañas es un `tablist` incompleto y la activa puede quedar fuera de
vista.** [NUEVO] (`/include`, `/fortify`, `/organize`)
- Observado: no hay `tabpanel` ni `aria-controls`; cada pestaña contiene un botón «Cerrar»
  enfocable (2N paradas de Tab y nombre accesible «A.rdlc Cerrar A.rdlc»); no hay roving
  tabindex ni flechas entre pestañas ni Inicio/Fin (Verificado: `TabStrip.tsx` solo trata
  Enter, Espacio y Alt+←/→).
- Observado: con 8 pestañas a 1024 px, abrir la última dejó `scrollLeft=0` y la activa
  fuera de vista; ninguna aparece seleccionada. No hay `scrollIntoView` (Verificado), ni
  botón «Todas las pestañas», ni flechas de desplazamiento; la barra de scroll nativa
  ocupa ~10 px.
- Arreglo: `scrollIntoView({inline:'nearest'})` al activar; menú desplegable de pestañas
  cuando `scrollWidth > clientWidth`; ←/→/Inicio/Fin; `tabIndex={-1}` en la X de cerrar
  (cierre con Ctrl+W, ya existe); envolver el editor en `role="tabpanel"` con
  `aria-labelledby`; anunciar el reordenado («A.rdlc, posición 2 de 3»).
- → `/journey` + `/specify`.

**4. El diálogo «Informe…» se sale de la ventana y no hace scroll.** [NUEVO] (`/fortify`)
Observado: a 800×500 el diálogo mide 853 px con `top=-196` en un viewport de 461 px y
`scrollHeight == clientHeight`; el título, la X y los botones quedan inalcanzables (solo
sirve Esc). Es el mismo ancho que daría en un portátil de 1366×768, así que el recorte
también ocurriría allí (inferido). Causa: `max-w-2xl` sin `max-h` ni `overflow`. Arreglo:
`max-h-[85vh] overflow-y-auto` o la estructura `flex-col` con cabecera y pie fijos del
`TextEditorDialog`. → `/specify`.

**5. Con Jerarquía y Variables abiertas, el lienzo desaparece; y la ventana no tiene
tamaño mínimo.** [NUEVO] (`/fortify`, `/evaluate`)
Medido: anchos fijos de 256 + 288 (paneles izquierdos) y 320 (inspector) dejan 400 px de
lienzo a 1280, 144 a 1024 y 0 px a 800 y a 640. `getMinimumSize() = [0,0]`; en `main.ts`
no hay `minWidth` (Verificado). A 800 px la toolbar de formato se recorta y aparecen
barras de scroll horizontales; a 1024 px la toolbar se adapta bien (las etiquetas pasan a
icono). Arreglo: mínimo ≈ 960×600; por debajo de ~1280 px, un solo panel izquierdo a la
vez; inspector colapsable o superpuesto. → `/transpose` + `/organize`.

**6. Editar el texto de un elemento solo se descubre con clic derecho.** [NUEVO]
(`/evaluate`) Observado: doble clic en un textbox no hace nada; «Editar texto…» solo está
en el menú contextual. No hay doble clic, Enter ni F2 (Verificado: no existen manejadores
de doble clic; F2 solo aparece en comentarios). La tarea central falla en el primer
intento de quien viene de Word o Report Builder. Arreglo: doble clic, Enter y F2 abren el
editor, y un botón visible «Editar texto…» en el inspector. → `/journey` + `/articulate`.

**7. Insertar desde la toolbar no tiene modelo mental claro.** [NUEVO] (`/evaluate`)
Observado: «Insertar tablix» o «línea» crean el elemento al instante en (2, 2) cm del
cuerpo, sin armar herramienta y sin mensaje; con una celda seleccionada, el textbox nació
dentro de ella y el breadcrumb pasó a `Celda 1,2 › Textbox161` sin aviso. En facturas
densas el elemento cae encima de otros (relacionado con el rediseño de elementos
solapados). Arreglo: o armar la herramienta y colocar con clic/arrastre, o insertar al
instante con mensaje «Textbox29 insertado en Celda 1,2» y hacer scroll hasta la
selección. → `/journey` + `/fortify`.

**8. El diálogo de conflicto tiene como acción primaria la destructiva.** [NUEVO]
(`/fortify`) Observado con captura: «Guardar y sobrescribir el fichero» es el botón
relleno y recibe el foco inicial, así que Enter pisa la versión externa (Verificado en
`ConflictDialog.tsx`: es el único `Button` sin `variant`). Es el momento de mayor riesgo.
Arreglo: foco inicial en «Ahora no» o primaria «Guardar como…»; la sobrescritura, como
acción secundaria que nombre lo que se pierde. → `/articulate`.

**9. «Sin guardar» solo se comunica con un asterisco ámbar `aria-hidden`.** [NUEVO]
(`/include`, `/organize`) El nombre accesible de la pestaña no cambia al editar, así que
un lector no sabe que hay cambios (pérdida de datos potencial) y el color ámbar da ≈ 3,2–
3,3:1 sobre claro (calculado). El icono de conflicto lleva `aria-label` sobre un `svg`
sin `role="img"`. Arreglo: `aria-label="A.rdlc, con cambios sin guardar"` o texto
`sr-only`, y un punto con forma además del color. → `/articulate`.

### P2

**10. Foco visible débil y no uniforme.** [NUEVO] El anillo es `outline-ring/50`
(`oklab .55–.62 / 50 %`): ≈ 1,8–2,2:1 en claro y ≈ 2,2:1 en oscuro (calculado), por debajo
de 3:1 (WCAG 1.4.11 / 2.4.7). La pestaña y su botón de cerrar solo tienen un `outline auto`
de 1 px. Una captura con `.focus()` mostró `outline-style: none` en oscuro (puede no ser
`focus-visible`; confirmar con Tab real). Arreglo: `ring-ring` opaco, 2 px y
`outline-offset` en un único estilo reutilizable.

**11. Contraste de bordes de campo y de avisos.** [NUEVO] `--input` oscuro = 1,77:1 y
`--border` oscuro = 1,47:1 (medido); en claro ≈ 1,6:1 (estimado). Los avisos ámbar usan
`text-amber-700` sin variante oscura (`EditorBanners.tsx:51,68`): 3,0–3,5:1 en oscuro
(dos auditorías, valores calculados distintos). Los tres tokens de texto oscuros **sí**
pasan AA (texto 18,97:1, atenuado 7,66:1, toolbar 16,94:1). Arreglo: `--input` ≥ 3:1,
`dark:text-amber-300` o un token `--warning`.

**12. Objetivos por debajo de 24 px (WCAG 2.5.8).** [NUEVO] Medido: cerrar pestaña 16×16,
paso numérico 16×12, selector de color 16×16, asas de regla 12×20, botones de formato
24×24 (límite). El cierre de pestaña, que destruye trabajo, está pegado al borde. Arreglo:
área de acierto de 24 px (padding invisible) y separación ≥ 8 px.

**13. Tres botones de la toolbar son solo icono y sin tooltip.** (`/organize`, `/fortify`)
«Variables», «Jerarquía» e «Informe…» ocultan la etiqueta por debajo de 1536 / 1280 px y
solo tienen `aria-label`; Deshacer y Rehacer tienen tooltip con el atajo pero sin el
nombre. Arreglo: `Tooltip` con nombre y atajo en los tres y en Deshacer/Rehacer.

**14. Ctrl+K y los atajos nuevos no se anuncian en ningún sitio.** Ctrl+K solo aparece en
comentarios; tampoco Ctrl+Tab, Ctrl+Shift+RePág, Alt+←/→ (reordenar), Ctrl+N ni Ctrl+O
(solo Guardar tiene `DropdownMenuShortcut`). Sigue abierta la hoja de atajos de 0003 #9.
Arreglo: campo o botón «Buscar… Ctrl+K», atajos visibles en Fichero y en el menú
contextual de pestañas, y una hoja de atajos.

**15. Estado vacío largo y sin acción principal.** (confirma 0002/0003; lo señalan tres
auditorías) Un párrafo de ~60 palabras con jerga («imán de 0,1 cm; Shift lo ignora»), «haz
click» (el resto de la UI dice «clic»), sin botón «Abrir» ni recientes; el inspector dice
«Selecciona un elemento…» y los botones de insertar y formato parecen activos. Arreglo:
título «Abre un informe para empezar», botones «Abrir informe…» (Ctrl+O) y «Nuevo informe»,
recientes visibles y «o arrastra un .rdlc aquí».

**16. Inspector apilado, con jerga y dos modelos de edición.** (`/evaluate`, `/organize`)
Con tablix o celda seleccionados, «Estructura» ocupa ~300 px y empuja «Propiedades» por
debajo de y≈450. «Aplicar» (informe) frente a edición en vivo (elemento). Términos del
modelo sin traducir: «X (Left)», «Y (Top)», «Zindex», «Crecer con el texto (CanGrow)»,
«Mantener junto (KeepTogether)», «Padding (pt)», «runs», «Custom» (papel), «(heredada)».
Arreglo: «Estructura» colapsable o en pestaña; etiqueta en español con el término de BC
como tooltip; unificar el modelo de aplicar. → `/organize`, `/articulate`, `/localize`.

**17. El pie no refleja la actividad y trunca lo importante.** (tres auditorías) Tras
negrita, insertar o duplicar sigue «Abierto: C:/Users/…»; la ruta aparece dos veces
(mensaje y pie) y se trunca **por el final** (`max-w-[340px] truncate`), de modo que el
nombre del fichero es lo que se pierde; un mensaje de portapapeles queda fijo; «N
recarga(s) externa(s)» usa el plural entre paréntesis. Arreglo: mensajes de acción
(«Cursiva aplicada a 1 elemento»), ruta una sola vez con truncado por el inicio y mensajes
transitorios que caducan.

**18. Terminología inconsistente.** (`/organize` + `/articulate`) Tres verbos para perder
cambios: «Cerrar sin guardar», «Salir sin guardar», «Descartar todas». «Cerrar guardadas»
es ambiguo (suena a «guardar y cerrar»; cierra las que no tienen cambios). Informe /
documento / pestaña se mezclan («Documento cerrado.», «Sin documento abierto», «Cerrar
informe»). «Informe…» lleva puntos suspensivos pero abre un panel, y duplica
«Propiedades del informe» del inspector y de la paleta. Arreglo: guía de terminología
(«informe» para el objeto, «pestaña» solo para la UI) y renombrar «Cerrar guardadas» →
«Cerrar las que no tienen cambios».

**19. Fichero, menú «+» y paleta no coinciden.** Fichero: «Nuevo», «Abrir…», «Guardar
como…»; «+»: «Nuevo…», «Abrir…»; paleta: «Abrir informe…», sin Nuevo, Guardar como,
Jerarquía, Modo oscuro ni comandos de pestaña. La paleta lista solo elementos por defecto
y con «zzzz» devolvió resultados (pendiente de verificar el filtrado). Arreglo: una sola
fuente de etiquetas y completar la paleta.

**20. El foco se pierde al cerrar un diálogo o la paleta con Esc.** [NUEVO] «Informe…» y
la paleta devuelven el foco a `BODY` en lugar de al disparador. Arreglo:
`onCloseAutoFocus` al botón que lo abrió.

**21. Reordenar pestañas no se anuncia ni se descubre.** [NUEVO] No hay región viva y
la única `role="status"` seguía mostrando «Creando…» sin diálogo en el DOM. El atajo
(Alt+←/→ en la pestaña enfocada, Ctrl+Shift+RePág/AvPág la activa) no tiene pista visible.

### P3

22. **Ctrl+rueda con un informe grande da tirones** [NUEVO]: SalesInvoiceESP, 20 pasos de
    zoom, p50 16,8 ms, p95 83 ms, máx. 129 ms (la rueda normal, fluida: p95 17,4 ms). → `/measure`.
23. **Texto largo recortado sin señal** en el lienzo (11 000 caracteres en un textbox de
    0,79 cm). Arreglo: marca de «texto recortado» o autocrecer.
24. **Nombres largos de pestaña** se truncan por el final y pierden la extensión: truncar
    por el centro (ya hay `title` con la ruta).
25. **Dos avisos ámbar apilados** (cambió por fuera + ya no existe): fusionarlos.
26. **Sin enlace de salto**, **reflow a 400 %** con desbordamiento (aceptable en escritorio)
    y **reduced-motion** con una única regla (revisar `transition-all` y `tw-animate`).
27. **Textos menores**: «Modo oscuro (blanco y negro)»; Rehacer con dos formas («Ctrl+Y» y
    «Ctrl+Shift+Z o Ctrl+Y»); «Insertar tabla (Tablix)» vs «Insertar textbox»; «Guardado —
    bytes idénticos al original ✓» es jerga de QA.
28. **El tema no respeta `prefers-color-scheme`** (0003 #12) y los grupos Alinear/Distribuir
    siguen sin etiqueta visible (0003 #10).
29. **Persistencia del tema entre ejecuciones con `--user-data-dir` distinto**: una prueba
    arrancó en oscuro con un directorio nuevo. **No investigado**; puede afectar a la
    reproducibilidad de las pruebas.

## Discrepancias entre las auditorías

- `/evaluate` listó como positivo «Flecha mueve el foco sin activar» en las pestañas y
  «Ctrl+Alt+→» como atajo de reordenar. **No coincide con el código**: no hay flechas entre
  pestañas (`/include` y `/fortify` lo observaron) y el atajo es Alt+←/→. Se descarta esa
  línea del positivo.
- El contraste ámbar oscuro sale 3,0:1 en una auditoría y 3,49:1 en otra: depende de qué
  fondo se compone. Ambos incumplen 4,5:1; se cita el rango.

## Qué proteger

- Guardas con consecuencias nombradas («Guardar y cerrar»), «Cancelar» enfocado en los
  diálogos de cierre y el diálogo de conflicto con salidas claras («Nada se ha perdido
  todavía»; el defecto del foco es lo único a corregir).
- Título de ventana con `*` y `*` en la pestaña; mensajes «Guardado:» y «Deshecho»;
  errores accionables que ya no caducan.
- Pestañas: arrastre con marcador de destino, reordenar por teclado, menú contextual que
  deshabilita lo que no procede, ruta completa en `title`.
- Los tres tokens de texto oscuros pasan AA; `color-scheme` bien declarado; sin flash.
- Todos los controles tienen nombre accesible, `lang="es"`, landmarks y diálogos con
  `aria-labelledby` / `aria-describedby`; el menú contextual de pestañas se abre con
  Shift+F10 y la tecla de menú, y Esc devuelve el foco a la pestaña.
- Rendimiento: abrir SalesInvoiceESP ~430 ms (no hace falta spinner), selección ~180 ms,
  doble Ctrl+S sin error ni estado duplicado.
- Toolbar agrupada por función y adaptable a 1024 px.

## Seguimiento (2026-10-09)

Tras esta revisión se movió la tira de pestañas bajo la barra de formato, se eliminó el
botón «+» (el hallazgo 19 sobre Fichero/«+»/paleta pierde el «+») y se rehicieron los
tokens de color de ambos temas (hallazgos 10 y 11, parcialmente: bordes de campo, foco,
avisos ámbar y jerarquía de superficies). Detalle en Pendientes. Los ratios **no se han
re-medido** en el momento de ese primer cambio; la medición posterior con `/include`
(ratios por superficie, escalones de luminosidad y bordes de campo ≥ 3:1) está en Pendientes.

## Acciones recomendadas, por orden

1. **Accesibilidad del lienzo y la Jerarquía** (1, 2, 3, 9, 20, 21) — `/journey` →
   `/specify`. Es lo único que bloquea a un grupo entero de usuarios.
2. **Robustez a ventana pequeña** (4, 5, 3-scroll de pestañas): `minWidth` en `main.ts`,
   un solo panel izquierdo por debajo de ~1280 px y diálogo «Informe…» con scroll.
   Cambios pequeños y de alto valor.
3. **Descubrimiento y feedback** (6, 7, 14, 15, 17): doble clic/Enter/F2 para editar,
   mensajes de inserción y de acción, estado vacío con acción, Ctrl+K visible.
4. **Seguridad del conflicto** (8) y **estado sin guardar para tecnologías asistivas** (9).
5. **Sistema visual** (10, 11, 12, 13): foco, bordes y objetivos con tokens; una pasada
   única en `styles.css` y `button.tsx`.
6. **Textos** (16, 18, 19, 27): guía de terminología y traducción del inspector.
7. **Pendiente de medir**: arrastre masivo y zoom con informes grandes (22), lector de
   pantalla real (NVDA), DPI del sistema y usuarios. → `/investigate` y `/measure`.

**Criterio de salida**: repetir esta pasada tras los puntos 1–4 y confirmar con un lector
de pantalla real que se puede seleccionar, mover y editar un elemento sin ratón.
