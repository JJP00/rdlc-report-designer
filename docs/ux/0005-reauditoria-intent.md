# Re-auditoría del front con Intent — app en ejecución

- **Fecha**: 2026-10-09
- **Qué se evalúa**: el árbol de trabajo con las correcciones que otro agente aplicó tras
  `docs/ux/0004-analisis-intent-frontend.md` (commit base `b632379`; esas correcciones
  **aún no están commiteadas**). Build de `apps/back/out` recompilado en modo E2E; la suite
  completa pasa **118/118** sobre él.
- **Método**: cuatro agentes en paralelo, solo lectura, con la app ejecutándose
  (Playwright sobre copias de `fixtures/corpus`): `/evaluate`, `/include`,
  `/organize` + `/articulate` y `/fortify` + `/transpose`. Cada uno dio un veredicto
  **verificado ejecutando** por cada hallazgo de 0004 que le tocaba y buscó hallazgos nuevos.
- **Naturaleza de las cifras**: puntuaciones de experto; los contrastes y tamaños son
  cálculos sobre estilos computados, no una herramienta dedicada.
- **No evaluado**: lector de pantalla real (NVDA/Narrator) — todo lo que se dice de lo
  que «anunciaría» es inferido del DOM; DPI físico alto (solo `setZoomFactor`); inserción
  desde teclado sin ratón; el aviso de cambio externo en vivo (el watcher no disparó en
  una de las pruebas y quedó sin conclusión); usuarios reales.

## Resultado

**Salud UX ≈ 77 / 100** (rango 72–82), frente a ≈ 71 en 0004, ≈ 61 en 0003 y 86 en 0002
(esta última solo cubría la ruta feliz). La cifra sale del agente de `/evaluate`, que
re-midió H1, H2, H4, H6–H9; el resto de dimensiones se estima:

| Dimensión                                       | 0004                       | Ahora                                                   |
| ----------------------------------------------- | -------------------------- | ------------------------------------------------------- |
| Heurísticas (H1–H10)                            | 16/40                      | ≈ 19/40                                                 |
| Éxito de tarea                                  | ~75 %                      | ~85 %                                                   |
| Anti-patrones                                   | ~90 %                      | ~95 % (el Destructive Default del conflicto desaparece) |
| Accesibilidad por teclado y lector (`/include`) | ≈ 45–55 / 100              | ≈ 75–80 / 100 (sin lector real)                         |
| Robustez de layout y estados límite             | —                          | 7 de 8 hallazgos resueltos                              |
| Terminología y descubrimiento                   | H2 1 · H6 2 · H7 2 · H10 2 | **sin cambios** (≈ +1 punto global)                     |

Veredicto por hallazgo de 0004 (29): **12 resueltos** (incluye el 29, que no era un fallo),
**10 parciales**, **6 sin resolver** y **1 regresión medida**.

## Veredicto por hallazgo de 0004

| Nº  | Resumen                                   | Veredicto                   | Evidencia observada                                                                                                                                                                                                                                                         |
| --- | ----------------------------------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Lienzo con teclado y lector               | **Resuelto**                | `role=group tabindex=0 aria-label="Página del informe, 136 elementos"`; Tab selecciona `Textbox95`, la región viva dice «x 3,60 cm, y 5,70 cm»; flechas mueven y se anuncian, Inicio/Fin, Enter/F2 abren el editor, Esc devuelve el foco al lienzo                          |
| 2   | Jerarquía como árbol                      | **Resuelto**                | 233 `treeitem` con `aria-level` 1–7, `aria-setsize`, `aria-posinset`; 1 parada tabulable (roving); ↓ → ← Inicio Fin                                                                                                                                                         |
| 3   | `tablist` y pestaña activa fuera de vista | **Resuelto** (matiz)        | Roving + ←/→/Inicio/Fin; la X de cerrar con `tabIndex=-1`; con 8 pestañas a 1024 px la activa queda visible (`scrollLeft` 450–615); botón «Todas las pestañas (8)»; Alt+← anuncia «posición 1 de 8». Matiz: el `aria-controls` de las inactivas apunta a ids que no existen |
| 4   | «Informe…» se sale de la ventana          | **Resuelto**                | A 800×500, diálogo con scroll interno, título y X visibles. «Aplicar» no es fijo (P3)                                                                                                                                                                                       |
| 5   | Sin tamaño mínimo / lienzo a 0 px         | **Resuelto** (matiz)        | `getMinimumSize()=[960,600]`; Jerarquía y Variables exclusivas; lienzo 352 px a 960, 672 a 1280 (antes 144 / 400). Inspector sigue fijo a 320 px                                                                                                                            |
| 6   | Editar texto solo por clic derecho        | **Parcial**                 | Con el elemento ya seleccionado, doble clic, Enter, F2 y el botón «Abrir editor de texto» del inspector abren el editor. **Falla el primer doble clic «en frío»** (ver N1)                                                                                                  |
| 7   | Insertar sin feedback                     | **Parcial**                 | Hay mensaje «Textbox5 insertado en el cuerpo» y queda seleccionado. El mensaje no caduca y la segunda inserción cae en el mismo punto (2, 2) cm                                                                                                                             |
| 8   | Conflicto con acción primaria destructiva | **Resuelto**                | «Guardar como…» es el botón relleno, con foco inicial; «Guardar y sobrescribir» pasa a contorno                                                                                                                                                                             |
| 9   | «Sin guardar» accesible                   | **Resuelto**                | Nombre accesible «X.rdlc, con cambios sin guardar»; asterisco 5,03:1 (claro) y 10,52:1 (oscuro)                                                                                                                                                                             |
| 10  | Foco visible débil                        | **Parcial**                 | Selects, colores, pestaña y lienzo: contorno 2 px con ratio 4,3–6,2 (claro). **Botones: anillo 3 px con alfa 0,6 → 2,42–2,61:1 en claro (< 3:1)**; 3,4–3,8:1 en oscuro                                                                                                      |
| 11  | Bordes de campo y ámbar                   | **Parcial**                 | `--input` 4,46:1 / 4,95:1 y aviso de conflicto 6,51:1 / 10,75:1. Quedan fuera: select «Fuente» 1,71:1 / 1,88:1; `StatusBar` `text-amber-600` 2,49:1 en claro; «Total» de Tablix `amber-700` 3,6:1 en oscuro                                                                 |
| 12  | Objetivos < 24 px                         | **Parcial**                 | Cerrar pestaña 24×24 (era 16×16). Sin cambios: pasos numéricos 16×12, asas de regla 12×20, casillas 16×16                                                                                                                                                                   |
| 13  | Toolbar sin tooltips                      | **Resuelto**                | Con Tab los cinco botones muestran tooltip («Deshacer (Ctrl+Z)», «Rehacer (Ctrl+Y)»…). Con hover automático el tooltip fue poco fiable en el arnés (no confirmado en uso real). Las etiquetas siguen ocultas a 1366 y 1536 px                                               |
| 14  | Ctrl+K y atajos invisibles                | **Sin resolver**            | Ctrl+K no aparece en la UI; Fichero solo muestra «Ctrl+S» (faltan Ctrl+N, Ctrl+O, Ctrl+Shift+S); el menú de pestañas sí muestra «Ctrl+W»                                                                                                                                    |
| 15  | Estado vacío sin acción                   | **Sin resolver**            | Mismo párrafo largo («imán de 0,1 cm; Shift lo ignora», «haz click»); sin botón Abrir ni recientes                                                                                                                                                                          |
| 16  | Inspector apilado y con jerga             | **Parcial**                 | «Estructura» acotada a ~210 px con scroll y ya no empuja «Propiedades». Sigue la jerga («X (Left)», «CanGrow», «KeepTogether», «Padding (pt)», «run(s)») y el inspector del informe sigue con «Aplicar»                                                                     |
| 17  | Pie de estado                             | **Parcial**                 | Mejoran «Deshecho», «Guardado: …», «Copiado: …», «insertado». Siguen mal: negrita/cursiva/texto no dicen nada, la ruta aparece dos veces y se trunca por el final, y **tras editar el pie sigue diciendo «Guardado — bytes idénticos…» con el título en `*`**               |
| 18  | Terminología de cierre                    | **Parcial**                 | «Cerrar guardadas» → «Cerrar las que no tienen cambios». Siguen «Sin documento abierto» / «Documento cerrado» frente a «informe»                                                                                                                                            |
| 19  | Fichero y paleta coherentes               | **Sin resolver**            | La paleta carece de Nuevo, Guardar como, Jerarquía, Modo oscuro y comandos de pestaña; el filtro es difuso («zzzz» devuelve resultados); las acciones van al final de ~450 ítems                                                                                            |
| 20  | Foco perdido al cerrar                    | **Resuelto**                | «Informe…» + Esc vuelve al botón; la paleta devuelve el foco al elemento desde el que se abrió                                                                                                                                                                              |
| 21  | Reordenar sin anunciar                    | **Resuelto** (anuncio)      | Región viva «posición 1 de 8». Que el atajo se descubra visualmente no se comprobó                                                                                                                                                                                          |
| 22  | Ctrl+rueda con informes grandes           | **Regresión medida**        | SalesInvoiceESP, 20 pasos: p95 351–384 ms, máx 685–953 ms (en 0004: p95 83, máx 129). **Matiz**: las pasadas llegan ahora a 400 %, con un lienzo mucho mayor; no son las mismas condiciones. Rueda normal fluida (p95 16,8)                                                 |
| 23  | Texto largo recortado sin señal           | **Sin resolver**            | El textbox de 0,6 cm con 11 000 caracteres no muestra marca de recorte (`wrap:'none'`, sin elipsis)                                                                                                                                                                         |
| 24  | Nombres largos de pestaña                 | **Parcial**                 | Se trunca por el inicio (`[direction:rtl]`): conserva la extensión pero pierde lo que identifica al informe                                                                                                                                                                 |
| 25  | Dos avisos ámbar apilados                 | **Resuelto**                | Un solo aviso con las dos frases y «Resolver…» (sigue siendo largo, ~110 px, y repite la ruta)                                                                                                                                                                              |
| 26  | Enlace de salto, reflow, reduced-motion   | **Sin resolver**            | Sin enlace de salto; una sola regla `prefers-reduced-motion` (`.shimmer`); a 400 % del renderer `scrollWidth` 688 > 371 con 5 controles recortados                                                                                                                          |
| 27  | Textos menores                            | **Parcial**                 | Resueltos: «Modo oscuro»/«Modo claro», Rehacer con una sola forma. Siguen: «Guardado — bytes idénticos al original ✓», «Insertar tabla (Tablix)», «Custom»                                                                                                                  |
| 28  | `prefers-color-scheme`                    | **Sin resolver**            | Con el esquema oscuro emulado y un perfil nuevo, `<html class="">` (claro); el tema solo sale de `localStorage`                                                                                                                                                             |
| 29  | Persistencia del tema entre perfiles      | **Cerrado: no es un fallo** | Se guarda en `localStorage` (`rdlc-designer-theme`) del perfil de Electron; un `--user-data-dir` nuevo arranca claro                                                                                                                                                        |

## Hallazgos nuevos y regresiones

### P1

**N1. El lienzo se desplaza 28 px al seleccionar el primer elemento.** [NUEVO, observado por
dos agentes] Sin selección, el contenedor de Konva está en `top = 159`; al seleccionar
aparece el breadcrumb (`Breadcrumb.tsx`, `min-h-7`) y baja a `top = 187`. El segundo clic de
un doble clic «en frío» cae 28 px más abajo, en vacío o en otro elemento: con
`page.mouse.dblclick` sobre `Textbox95` sin selección previa **no abrió el editor**; con
selección previa sí. Un usuario real lo notaría en cada doble clic sobre un elemento sin
seleccionar. `Breadcrumb.tsx` no está modificado: el salto ya existía antes, pero ahora
importa porque el doble clic es la vía principal para editar texto. Arreglo: reservar
siempre la altura de la fila (render vacío con la misma altura) o superponerla al lienzo.

### P2

- **Con escalado de Windows del 150–200 % la toolbar se recorta sin alternativa.** El
  mínimo de 960 está en píxeles del dispositivo: a 1,5 (843×507 CSS) desaparecen el zoom y
  el botón de tema; a 2,0 (632×380) quedan fuera Deshacer, Rehacer, zoom y tema. Arreglo:
  menú de desbordamiento «Más…» o un mínimo en función de `getZoomFactor()`.
- **136 pulsaciones de Tab para salir del lienzo** en un informe de 136 elementos
  (Shift+Tab sale en 1; Esc no sale). Arreglo: Esc o F6 devuelven el foco a la pestaña, y
  decirlo en `aria-describedby`.
- **Contraste que escapó a la pasada de tokens**: las tres excepciones de la fila 11 y el
  anillo de foco de los botones en claro (fila 10).
- **El pie miente tras editar**: «Guardado — bytes idénticos…» con el título en `*`
  (fila 17). Arreglo: limpiar el mensaje al editar.
- **Los tiradores del elemento seleccionado tapan el borde de un vecino solapado**: con
  `LinesTable` seleccionada, un clic en el borde de `LinesTable2` golpea el tirador de la
  primera y no cambia la selección. Es comportamiento de diseño que además explica por qué
  un test que depende del orden puede fallar; relevante para el rediseño de elementos
  solapados (`docs/features/0002-capas-rediseno-journey.md`).
- **Zoom con rueda: tirones de hasta ~0,95 s** a 400 % con 136 elementos (fila 22). Medir a
  igual rango que 0004 para separar la regresión real del efecto del tope.
- **A 960×600 con un aviso de error y uno ámbar a la vez, el lienzo se queda en ≈ 320 px de
  alto.** Arreglo: una sola banda visible con contador, o aviso ámbar de una línea.

### P3

- El texto de la banda ámbar es ~15 px frente a 12 px del rojo (`text-xs`).
- «Error de E/S al escribir <ruta>» sin causa ni acción: traducir `EISDIR`/`EPERM` y
  ofrecer «Guardar como…».
- En el diálogo de salida con 8 sucias el nombre largo se corta por el final y pierde la
  extensión (truncar por el centro).
- El anuncio del lienzo dice solo el id («Textbox95, x…, y…»), sin tipo ni texto.
- `aria-controls` colgante en las pestañas inactivas.
- El diálogo «Editar texto» deja el foco en «Alinear izquierda (párrafo 1)» en lugar de en el
  texto.
- La inserción apila elementos en (2, 2) cm sin cascada; los mensajes del pie no caducan.
- Nombres inconsistentes entre superficies («Informe…» / «Propiedades del informe…»,
  «Variables» / «Mostrar u ocultar Variables», «Cerrar» / «Cerrar informe»): una tabla
  única de etiquetas.

## Sospecha de regresión de clic: descartada

Tras el primer intento de validación, la suite E2E dio 23 fallos y se sospechó que los
cambios de accesibilidad del lienzo desplazaban el mapeo del puntero. **No se sostiene**:
los cuatro auditores hicieron cientos de clics reales (84 aleatorios a 60 %/zoom/scroll,
barridos de 15 elementos, secuencias de 6–8 clics, marquesina, bordes de tabla a 100/150/200 %)
y la selección coincidió siempre con lo que Konva devuelve bajo el cursor; contenedor y
`<canvas>` miden y están posicionados igual. Con el build recompilado la suite pasa 118/118:
los fallos de esa pasada procedían de un build desfasado respecto al árbol de trabajo. Lo
que sí se encontró es N1 (desplazamiento de 28 px), que existe con independencia de eso.

## Qué proteger

- Teclado completo del lienzo (Tab, flechas, Inicio/Fin, Enter, F2, Esc), con anuncios
  `aria-live`; Jerarquía como árbol real; pestañas con roving tabindex y anuncio del
  reordenado.
- Diálogo de conflicto con «Guardar como…» como primaria y aviso único fusionado.
- Ventana con mínimo 960×600 y paneles exclusivos; «Informe…» con scroll.
- Foco devuelto al disparador al cerrar diálogos y paleta.
- Jerarquía de superficies y contraste de texto de 0004.

## Orden recomendado

1. **N1** (breadcrumb que mueve el lienzo): es pequeño y afecta a la tarea central.
2. **Pasada de tokens que faltó**: anillo de foco de botones, `--input` en el select
   «Fuente», `StatusBar` y «Total» ámbar con variante oscura, objetivos de 24 px (pasos
   numéricos, asas de regla, casillas).
3. **Descubrimiento**: Ctrl+K visible, atajos en Fichero, estado vacío con acciones, paleta
   con Nuevo / Guardar como / Jerarquía / Modo oscuro.
4. **Pie y textos**: limpiar «Guardado…» al editar, mensajes de formato, ruta una sola vez
   con truncado por el inicio, «bytes idénticos», jerga del inspector.
5. **DPI y desbordamiento** de la toolbar; salida rápida del lienzo con teclado;
   `prefers-color-scheme`; enlace de salto; reduced-motion.
6. **Medir** el zoom a igual rango que 0004 y, cuando se pueda, con lector de pantalla real
   y con DPI alto.

**Criterio de salida**: sin P1 abiertos y con una pasada con lector de pantalla real que
permita seleccionar, mover y editar un elemento sin ratón.

## Resolución posterior (2026-10-09)

Corregido tras la re-auditoría (E2E 118/118, 400 tests back y 337 front):

- N1: el breadcrumb reserva siempre su fila de 28 px, así que el lienzo ya no se desplaza al seleccionar.
- Pie: el mensaje «Guardado» se limpia al editar y los mensajes de acción caducan a los 8 s; StatusBar con contraste en ambos temas.
- Accesibilidad: anillo de foco opaco, borde del select «Fuente», «Total» de Tablix en oscuro, enlace «Saltar al lienzo», `prefers-color-scheme`, reduced-motion, `aria-controls` colgante y Esc para salir del lienzo.
- Descubrimiento: estado vacío con «Abrir informe…» y recientes, atajos en Fichero, botón Ctrl+K, paleta con más acciones y filtro por subcadena, jerga del inspector traducida.
- Zoom con Ctrl+rueda: un solo redibujado por ráfaga (p95 de 213–388 ms a 17–68 ms), con el papel escalado por CSS mientras dura el gesto.
- Banda ámbar compacta y mínimo de ventana escalado con el zoom del renderer.

Sin hacer: N2 (tiradores sobre el borde de un vecino, `SelectionFrame.tsx`), señal de texto recortado (propuesta en `ItemView.tsx`), menú «Más…» de la toolbar, objetivos de 24 px en pasos numéricos y reglas, y las pruebas con lector de pantalla y DPI físico. El desplazamiento del lienzo y el escalado de Windows no se midieron en la app tras el arreglo.
