# Decisiones de UX

## 2026-10-27 · La evaluación 0007 cubre lo añadido desde el 2026-10-09 y lo que se pudo observar de lo pendiente de 0005
- Decidido por: Claude (por defecto)
- Por qué: 0005 ya auditó el resto con cuatro pasadas; el panel Problemas, las opciones de item, los saltos de grupo, el actualizador y EN/ES no tenían evaluación.
- Descartado: una re-auditoría completa, que repetiría 0005 sin evidencia nueva.
- Se apoya en: `docs/ux/0005-reauditoria-intent.md`; `git log` del 2026-10-09 a `3b3c3e8`; build E2E de `3b3c3e8` con Playwright a 1366×768 y 960×600, en ES y EN, sobre copias de `fixtures/corpus/SalesInvoiceESP.rdlc` (una con un campo inexistente añadido).

## 2026-10-27 · Fuera de la evaluación 0007: lector de pantalla, DPI físico, tiradores sobre un vecino solapado, señal de texto recortado y objetivos < 24 px
- Decidido por: Claude (por defecto)
- Por qué: necesitan NVDA/Narrator y una pantalla de DPI alto, y siguen abiertos en Pendientes sin cambios desde 0005.
- Descartado: darlos por resueltos o por empeorados sin medirlos.
- Se apoya en: `RDLC Report Designer - Pendientes.md`, sección «UX — restos de la re-auditoría Intent (0005)».

## 2026-10-27 · Usuarios: desarrolladores y consultores de Business Central que editan layouts RDLC en Windows, y usuarios de SSRS del proyecto abierto
- Decidido por: Claude (por defecto, sin entrevistas)
- Por qué: es lo que dicen el README y el documento de producto; no hay investigación con usuarios.
- Descartado: —
- Se apoya en: `README.md`; `RDLC Report Designer.md`.

## 2026-10-27 · «Sin problemas» falso se califica como importante
- Decidido por: Claude (por defecto)
- Por qué: el indicador es la única señal del lint antes de desplegar a BC; un visto bueno sin comprobación invierte su propósito aunque el fallo sea raro.
- Descartado: menor, porque la frecuencia de un fallo del IPC o de una regla no se ha medido.
- Se apoya en: `apps/front/src/hooks/useLintFindings.ts:56-63`.

## 2026-10-27 · El hallazgo sobre Problemas baja de importante a menor
- Decidido por: JunPeng Jin, comprobado en la app
- Por qué: pulsar un hallazgo selecciona su elemento y desplaza el lienzo hasta él; en los hallazgos de grupo, Estructura muestra la fila del grupo con su botón de propiedades. Lo que falta es decir qué expresión del grupo falla y cómo se arregla: fricción, no un callejón sin salida.
- Descartado: mantenerlo como importante; abrir el diálogo del grupo al pulsar, porque la selección ya lleva al sitio y abrir un diálogo en cada clic estorba al recorrer la lista.
- Se apoya en: `apps/front/src/hooks/useItemEditing.ts:1505-1511` (`selectAndReveal`); clic en «Tablix1 · Value» y «Tablix1 · GroupExpression» sobre `SalesInvoiceESP.rdlc`.

## 2026-10-27 · Las casillas de repetición del Tablix se deshabilitan, con su valor visible, en tablas sin cabeceras de grupo
- Decidido por: Claude (por defecto)
- Por qué: en una tabla no tienen efecto y desvían al usuario de la fila, que es donde se repite; deshabilitarlas conserva a la vista el valor que trae el fichero.
- Descartado: ocultarlas (esconde un valor presente en el XML); dejarlas como están (la trampa sigue).
- Se apoya en: [Microsoft Learn, *Show row and column headers on multiple pages*](https://learn.microsoft.com/en-us/sql/reporting-services/report-design/display-row-and-column-headers-on-multiple-pages-report-builder-and-ssrs); `LinesTable` de `SalesInvoiceESP.rdlc` (0 `TablixHeader`, 0 `TablixCorner`, 2 miembros con `RepeatOnNewPage`).

## 2026-10-27 · Revisión ética de la 0007: sin patrones manipulativos
- Decidido por: Claude (por defecto)
- Por qué: el actualizador actualiza solo a petición y pregunta por los cambios sin guardar; no hay telemetría.
- Descartado: —
- Se apoya en: `packages/i18n/src/catalogs/es/dialogs.ts:33-52`; búsqueda de `telemetry|analytics|sentry|posthog|mixpanel|trackEvent` en `apps/` sin resultados.

## 2026-10-27 · La evaluación 0007 está en español
- Decidido por: Claude (por defecto)
- Por qué: `docs/ux/` y Pendientes están en español.
- Descartado: inglés, el idioma del README y de los commits recientes.
- Se apoya en: `docs/ux/0001`–`0006`.

## 2026-10-27 · Repetir una fila de cabecera repite el bloque contiguo hasta el grupo
- Decidido por: Claude (por defecto)
- Por qué: un bloque con huecos parte la cabecera entre páginas; en el corpus las 18 filas que se repiten van en bloques de dos pegados al grupo.
- Descartado: fila a fila sin regla (permite huecos); toda la cabecera siempre (impide repetir solo la fila 2 bajo un título en la fila 1).
- Se apoya en: `fixtures/corpus/*.rdlc` (`RepeatOnNewPage` por miembro y lado del grupo); `docs/features/0006-repetir-fila-y-hallazgos-journey.md`.

## 2026-10-27 · Dejar de repetir quita `RepeatOnNewPage` y conserva `KeepWithGroup`
- Decidido por: Claude (por defecto)
- Por qué: `KeepWithGroup=After` sin repetición mantiene la cabecera con la primera línea, y así está en tres filas de `SalesShipment.rdlc`.
- Descartado: quitar los dos (cambia la paginación más allá de lo pedido).
- Se apoya en: `fixtures/corpus/SalesShipment.rdlc`.

## 2026-10-27 · El botón de repetir solo aparece en filas estáticas antes de un grupo; las filas de pie y las columnas quedan fuera
- Decidido por: Claude (por defecto)
- Por qué: ningún informe del corpus repite filas de pie y solo uno tiene grupo de columnas; un botón deshabilitado en cada fila sería ruido.
- Descartado: botón deshabilitado con motivo en todas las filas; cubrir pies y columnas ya.
- Se apoya en: `fixtures/corpus/*.rdlc`.

## 2026-10-27 · En Problemas, seleccionar y abrir son gestos distintos: Enter o clic selecciona, F2 / doble clic / «Abrir» abre
- Decidido por: Claude (por defecto)
- Por qué: recorrer la lista no debe abrir un diálogo por fila; F2 ya abre el editor en el lienzo.
- Descartado: abrir al pulsar; Ctrl+Enter (no se usa en el resto de la app).
- Se apoya en: `apps/front/src/hooks/useItemEditing.ts:1505-1511`; `docs/ux/0005-reauditoria-intent.md` (Enter/F2 en el lienzo).

## 2026-10-27 · Los usos de un mismo campo o elemento ausente se agrupan bajo un solo problema
- Decidido por: Claude (por defecto)
- Por qué: el arreglo es uno por nombre (en AL o en la expresión), no uno por uso.
- Descartado: lista plana (5 filas para 3 arreglos en `SalesInvoiceESP.rdlc`); agrupar también los paréntesis sin pareja (cada uno es un arreglo distinto).
- Se apoya en: `apps/back/src/domain/lint/rules/unknownField.ts`.

## 2026-10-28 · «Comprobando» solo aparece tras 1 s sin resultado de la versión vigente, y «No se pudo comprobar» a los 5 s
- Decidido por: Claude (por defecto)
- Por qué: el lint tarda 4–38 ms en los informes más grandes del repositorio; un indicador de carga en cada cambio solo parpadearía. Por debajo de 1 s se mantiene el último resultado.
- Descartado: mostrar «Comprobando…» en cada cambio (parpadeo); no tener tiempo límite (hoy un IPC colgado deja «Sin problemas» para siempre).
- Se apoya en: medición con `window.api.lint` sobre `CartaCMR.rdlc`, `BTCSalesQuote.rdlc` y `SalesCreditMemoESP.rdlc`, 15 pasadas cada uno; `docs/features/0007-estados-indicador-problemas.md`.

## 2026-10-28 · Retardo del lint tras un cambio: 250 ms en lugar de 600 ms
- Decidido por: Claude (por defecto)
- Por qué: el cálculo cuesta milisegundos y 250 ms sigue agrupando ráfagas; acorta el tiempo en que se ve un resultado anterior.
- Descartado: sin retardo (un lint por cada paso de un deshacer repetido); mantener 600 ms.
- Se apoya en: `apps/front/src/hooks/useLintFindings.ts` (`LINT_DEBOUNCE_MS`); la misma medición.

## 2026-10-28 · Si la comprobación falla, el panel no muestra los hallazgos anteriores y no reintenta solo
- Decidido por: Claude (por defecto)
- Por qué: hallazgos de otra versión junto a un fallo confunden sobre qué está mal ahora; un fallo de una regla con el mismo documento se repite, así que reintentar en bucle no arregla nada. Se reintenta con «Reintentar» o con el siguiente cambio.
- Descartado: lista anterior atenuada bajo el fallo; reintento con espera creciente.
- Se apoya en: `apps/back/src/presentation/ipc/IpcController.ts:416-421` (una excepción de cualquier regla acaba en `ok:false`).

## 2026-10-28 · «Sin comprobar» usa un icono neutro (círculo discontinuo), ni rojo ni verde
- Decidido por: Claude (por defecto)
- Por qué: no es un error del informe, y el verde es justo la promesa que no se puede hacer.
- Descartado: icono de aviso ámbar (se confunde con un aviso del lint).
- Se apoya en: `apps/front/src/components/StatusBar.tsx` (rojo = error, ámbar = aviso).

## 2026-10-28 · Propiedades del grupo sin subtítulo
- Decidido por: Claude (por defecto)
- Por qué: repite las cuatro pestañas y explica el envío interno de «Aplicar», que no cambia ninguna decisión del usuario.
- Descartado: conservar la primera frase (la propuesta de la evaluación 0007, que repetía las pestañas).
- Se apoya en: `docs/ux/0006-guia-microcopy.md` («No narrar lo que la UI ya muestra»).

## 2026-10-28 · «Agrupar por» / «Y por» en ES, y fuera la nota que explicaba «Group on» / «And on»
- Decidido por: Claude (por defecto)
- Por qué: con las etiquetas traducidas la nota sobra, igual que «Ordenar por» / «Y por» en Ordenación no la necesita. Revierte el «Keep» de la guía de microcopy, que se dio con las etiquetas en inglés.
- Descartado: mantener las etiquetas en inglés con la nota.
- Se apoya en: `docs/features/0005-i18n.md` §5 (candidato «Agrupar por / Y por», pendiente de validar con Report Builder ES); `packages/i18n/src/catalogs/es/tablix.ts:97-112`.

## 2026-10-28 · El fallo del lint no muestra su motivo técnico en el panel
- Decidido por: Claude (por defecto)
- Por qué: el único motivo posible es «Error inesperado» (excepción) o el tiempo límite; el primero no ayuda al usuario y va al registro. Se distingue el tiempo límite y se dice que editar y guardar siguen funcionando.
- Descartado: «No se pudo comprobar el informe: {motivo}.» (la propuesta de la 0007 de estados).
- Se apoya en: `packages/i18n/src/catalogs/es/errors.ts` (`E_UNEXPECTED`); `apps/back/src/presentation/ipc/IpcController.ts:416-421`.

## 2026-10-28 · El mensaje de campo inexistente cambia según el fichero: AL para `.rdlc`, consulta del dataset para `.rdl`
- Decidido por: Claude (por defecto)
- Por qué: la app abre `.rdlc` de BC y `.rdl` de SSRS; en SSRS no hay AL y el dataset viene de su consulta.
- Descartado: un solo mensaje con AL (falso para SSRS); un mensaje sin arreglo.
- Se apoya en: `README.md` (formatos); `RDLC Report Designer.md`.

## 2026-10-28 · Los mensajes de paréntesis dicen si falta el cierre o la apertura y no muestran la posición
- Decidido por: Claude (por defecto)
- Por qué: el carácter ya dice cuál de los dos es; un desplazamiento en caracteres no se puede usar sin contar, y «Abrir» (F2) deja el cursor en el sitio.
- Descartado: mantener «en la posición {index}».
- Se apoya en: `apps/back/src/domain/lint/rules/unbalancedBrackets.ts:113-149`.

## 2026-11-10 · La alineación y las acciones del párrafo van en la cabecera del bloque del párrafo, no encima del textarea
- Decidido por: Claude (por defecto)
- Por qué: actúan sobre el párrafo de ese bloque, no sobre el textarea; dos rótulos «Párrafo N» separados por el textarea no decían que eran el mismo, y el foco inicial caía en «Alinear izquierda».
- Descartado: dejar la franja y quitar el rótulo de abajo, porque seguiría pareciendo del textarea.
- Se apoya en: `docs/ux/0009-editor-de-texto.md`; `docs/ux/0005-reauditoria-intent.md:117`.

## 2026-11-10 · Los marcadores se resaltan con una capa detrás del textarea, no con un editor enriquecido
- Decidido por: Claude (por defecto)
- Por qué: el textarea conserva el historial común de deshacer, el caret y sus selectores E2E; la capa pinta el texto visible con la misma caja, fuente y ajuste de línea, y el textarea encima es transparente.
- Descartado: Monaco para el documento (un editor y un historial más por diálogo); otros caracteres para el marcador (son el formato del texto).
- Se apoya en: `apps/front/src/components/panels/TextEditorDialog.tsx` (`DocumentHighlights`); `apps/front/src/lib/textEditor.ts` (`splitMarkers`).

## 2026-11-10 · «fragmento» en todos los textos ES de los runs, también en los nombres accesibles
- Decidido por: Claude (por defecto)
- Por qué: los encabezados ya decían «fragmento» y un lector de pantalla oía «run».
- Descartado: cambiar solo los tooltips visibles.
- Se apoya en: `packages/i18n/src/catalogs/es/text.ts`; `docs/ux/0006-guia-microcopy.md` (los selectores E2E se actualizan en el mismo paso).

## 2026-11-10 · Insertar una expresión con el caret dentro de un marcador la pone detrás de él
- Decidido por: Claude (por defecto)
- Por qué: partirlo rompía el run de la etiqueta.
- Descartado: deshabilitar el botón dentro de un marcador, porque no diría por qué.
- Se apoya en: `apps/front/src/lib/textEditor.ts` (`insertionPointAt`).

## 2026-11-10 · Los `⟨ ⟩` de los marcadores no se ven en el textarea
- Decidido por: JunPeng Jin
- Por qué: se leían como paréntesis literales y confundían; el chip ya delimita la expresión.
- Descartado: otros delimitadores visibles; quitarlos del valor (son los que separan los runs al reconstruir los párrafos).
- Se apoya en: `apps/front/src/components/panels/TextEditorDialog.tsx` (`DocumentHighlights`).

## 2026-11-10 · Las expresiones no se editan en el textarea: un clic lleva a su fragmento
- Decidido por: JunPeng Jin
- Por qué: el textarea muestra la etiqueta de la expresión, no la expresión; editarla ahí rompía el run o cambiaba otra cosa que la que se ve.
- Descartado: dejar editar el texto del chip.
- Se apoya en: `apps/front/src/components/panels/TextEditorDialog.tsx` (`onDocumentMouseUp`); `apps/front/src/lib/textEditor.ts` (`markerRunAt`).

## 2026-11-10 · Retroceso o Supr junto a una expresión la quita entera
- Decidido por: Claude (por defecto)
- Por qué: es como se borra un chip en cualquier campo de destinatarios o menciones; que la tecla no hiciera nada parecería un fallo, y Ctrl+Z la devuelve (paso de deshacer propio).
- Descartado: bloquear el borrado y obligar a la papelera del fragmento.
- Se apoya en: `apps/front/src/lib/textEditor.ts` (`protectMarkers`).

## 2026-11-10 · Las reglas van alineadas con el papel pero no se salen de la vista al hacer scroll
- Decidido por: JunPeng Jin
- Por qué: con zoom alto, al desplazarse la regla desaparecía y no había forma de leer la distancia de lo que se ve.
- Descartado: reglas fijas en el borde del lienzo con el 0 desplazado según el scroll (misma lectura, más código por scroll).
- Se apoya en: `apps/front/src/components/canvas/CanvasPreview.tsx` (`CanvasRulers`, `position: sticky`).

## 2026-11-10 · El papel se centra solo mientras cabe en el lienzo
- Decidido por: Claude (por defecto)
- Por qué: con `justify-content: center`, a 200 % los primeros ~2,7 cm de la página quedaban a la izquierda del scroll, inalcanzables, y con ellos el 0 de la regla.
- Descartado: márgenes automáticos en el papel (mismo efecto, menos explícito).
- Se apoya en: `apps/front/src/components/canvas/CanvasPreview.tsx` (`justify-center-safe`).

## 2026-11-10 · Los bordes de página que se arrastran llevan un asa visible en el margen y una pista al pasar por encima
- Decidido por: Claude (por defecto), a petición de JunPeng Jin («no está claro en el canvas»)
- Por qué: las zonas de arrastre eran invisibles y solo cambiaba el cursor; el asa va en el margen porque ahí nunca hay contenido, y la pista dice qué cambia y cuánto mide.
- Descartado: marcadores de banda en la regla vertical (lejos de donde se mira); rótulos fijos de banda sobre el papel (tapan contenido a zoom bajo).
- Se apoya en: `apps/front/src/components/canvas/PageResizeLayer.tsx` (`variant="grips"`, `showHint`).

## 2026-11-10 · Todos los paneles se redimensionan desde su borde y Propiedades se pliega a una tira
- Decidido por: JunPeng Jin
- Por qué: los anchos fijos (256, 288 y 320 px) no dejaban ver expresiones largas ni ganar lienzo.
- Descartado: —
- Se apoya en: `apps/front/src/components/ui/panel-resizer.tsx`; `apps/front/src/components/InspectorColumn.tsx`.

## 2026-11-10 · Los tamaños de los paneles son de la app, no de cada pestaña, y se recuerdan entre sesiones
- Decidido por: Claude (por defecto)
- Por qué: el ancho cómodo depende de la pantalla y de la persona, no del informe; que cambie al cambiar de pestaña desorienta.
- Descartado: guardarlos en el `ui` de cada pestaña, como Jerarquía y Variables.
- Se apoya en: `apps/front/src/hooks/usePanelLayout.ts`; `apps/front/src/lib/panelLayout.ts`.

## 2026-11-10 · Mínimos de 200, 220 y 280 px y lienzo nunca por debajo de 320 px
- Decidido por: Claude (por defecto)
- Por qué: por debajo de 1280 px solo hay un panel izquierdo, así que 220 + 280 + 320 cabe en la ventana mínima de 960 px; por encima caben los tres al mínimo.
- Descartado: mínimos iguales a los anchos fijos anteriores (no dejaban ganar lienzo).
- Se apoya en: `apps/front/src/App.tsx:80` (un panel izquierdo por debajo de 1280 px); medido en la app a 960 × 600.

## 2026-11-10 · Los campos del inspector se maquetan por el ancho del panel, no por el de la ventana
- Decidido por: Claude (por defecto)
- Por qué: con el inspector a 280 px la fila de cada borde (nombre, estilo, color, grosor) desbordaba 25 px; con `@container` el nombre pasa encima, como en Relleno.
- Descartado: subir el mínimo del inspector a 320 px.
- Se apoya en: `apps/front/src/components/panels/BorderField.tsx`.

## 2026-11-10 · Los recientes muestran el nombre del fichero y la carpeta recortada por el principio
- Decidido por: JunPeng Jin
- Por qué: las rutas recientes comparten el principio (`C:\Users\…\OneDrive - …`); cortadas por el final se veían todas iguales.
- Descartado: la ruta entera recortada por el principio (el nombre quedaba al final, detrás de la carpeta).
- Se apoya en: `apps/front/src/components/RecentPath.tsx`.

