# RDLC Report Designer 0.8.2 (`3b3c3e8`)

## Veredicto de anti-patrones

Sin patrones manipulativos. El actualizador actualiza solo a petición («Actualizar ahora»), pregunta por los cambios sin guardar antes de reiniciar y no insiste [`packages/i18n/src/catalogs/es/dialogs.ts:33-52`]; no hay telemetría en `apps/`. Dos fallos comunes: «Sin problemas» cuando la comprobación no se ha hecho; Un hallazgo de grupo no dice qué expresión falla ni cómo se arregla.

## Problemas prioritarios

### Importantes

#### «Repetir cabeceras» ofrece la casilla que no repite la cabecera de una tabla

Con `LinesTable` seleccionada en `SalesInvoiceESP.rdlc`, Opciones muestra «Repetir cabeceras de fila» marcada y «Repetir cabeceras de columna» sin marcar. Son `RepeatRowHeaders` y `RepeatColumnHeaders` del Tablix, que actúan sobre las áreas de cabecera de grupo; `LinesTable` no tiene ninguna (0 `TablixHeader`, 0 `TablixCorner`). Sus dos filas de cabecera se repiten por otra vía: `RepeatOnNewPage=true` + `KeepWithGroup=After` en sus miembros estáticos, que es como se repite una fila estática [Microsoft Learn, *Show row and column headers on multiple pages*](https://learn.microsoft.com/en-us/sql/reporting-services/report-design/display-row-and-column-headers-on-multiple-pages-report-builder-and-ssrs). La proyección ya trae `repeatOnNewPage` y `keepWithGroup` por miembro [`packages/contracts/src/projection.ts:182-183`] y el comando `setMemberOptions` existe [`668ff36`], pero ninguna superficie del front los lee ni los escribe: ni la lista Filas de Estructura ni el menú contextual de la fila.

Un consultor que quiere que la cabecera de líneas se repita, o deje de repetirse, en la segunda página de una factura encuentra la casilla con el nombre que espera, la cambia, despliega, y la factura impresa en BC sale igual. El ajuste que sí manda no se ve en ningún sitio. 5 de los 10 informes del corpus repiten filas de cabecera con `RepeatOnNewPage`; ninguno usa `RepeatColumnHeaders`.

Heurísticas: correspondencia con el mundo real; reconocer antes que recordar.

Cambio: en la lista Filas de Estructura, una marca en cada fila estática que se repite en cada página y la acción «Repetir en cada página» en esa fila y en su menú contextual, que escribe `RepeatOnNewPage=true` + `KeepWithGroup=After` en un solo paso de deshacer. Las dos casillas del Tablix quedan deshabilitadas, con su valor visible, cuando el Tablix no tiene áreas de cabecera de grupo, con una línea debajo: «En una tabla, la repetición se marca en la fila.»

#### «Sin problemas» cuando la comprobación no se ha hecho

`useLintFindings` convierte cualquier fallo del IPC, o una respuesta `ok:false`, en una lista vacía [`apps/front/src/hooks/useLintFindings.ts:56-63`], y el pie pinta la lista vacía como «Sin problemas» con la marca verde [`apps/front/src/components/StatusBar.tsx`]. Pasa lo mismo mientras llega la primera respuesta. Si una regla lanza con un informe inesperado, el usuario ve el visto bueno sobre un documento que nadie ha revisado, y ese indicador es la única señal de la app antes de desplegar el layout a BC.

Heurística: visibilidad del estado del sistema.

Cambio: tres estados en el indicador y en el panel: comprobando; sin comprobar (icono neutro, «No se pudo comprobar» y Reintentar); y «Sin problemas» solo tras un lint correcto de la versión vigente.

### Menores

#### Un hallazgo de grupo no dice qué expresión falla ni cómo se arregla

Pulsar un hallazgo selecciona su elemento y desplaza el lienzo hasta él. Cuando la expresión es de un grupo, el elemento es el Tablix y la ubicación es el nombre de la etiqueta XML: «Tablix1 · GroupExpression», «Tablix1 · Value», «Tablix1 · Hidden». «Value» es la expresión de ordenación del grupo `BTCBillNo1` y «Hidden» su visibilidad [`fixtures/corpus/SalesInvoiceESP.rdlc:3140-3151`]. Tras el clic, Estructura muestra la fila del grupo (`=Fields!BTC…`) con su botón de propiedades, pero nada dice que el error está en la pestaña Ordenación. El mensaje dice el problema y no el arreglo («El campo «BTCBillNo» no existe en el dataset.»); en BC el arreglo es añadir la columna al dataset del informe en AL y recompilar, o corregir el nombre. Cada uso de un campo ausente es un hallazgo aparte: 5 hallazgos para 3 campos que se arreglan una vez cada uno.

Heurísticas: ayudar a reconocer, diagnosticar y recuperarse de errores; correspondencia con el mundo real.

Cambio: ubicación en términos de la interfaz («Grupo BTCBillNo1 · Ordenación», «Grupo BTCBillNo1 · Visibilidad», «ItemNo_Line_Lbl2 · Texto»). El mensaje de campo inexistente termina con su arreglo: «Añádelo al dataset en AL y recompila, o corrige el nombre.» Los hallazgos de un mismo campo van en una fila, con sus usos debajo.

#### Saltos de grupo sin reiniciar la numeración ni nombre de página

La pestaña Saltos de página del grupo solo ofrece dónde saltar. `ResetPageNumber` y `PageName` ya son comandos [`668ff36`: `setGroupPageBreaks` con `resetPageNumber`, `setGroupPageName`] y el catálogo ya tiene su error («Reiniciar el número de página requiere un salto de página en el grupo») [`packages/i18n/src/catalogs/es/errors.ts:82`], pero ningún control los escribe. «Página 1 de N» en cada factura de un lote es el caso típico de BC.

Heurística: flexibilidad y eficiencia de uso.

Cambio: casilla «Reiniciar el número de página» en la misma pestaña, habilitada cuando hay un salto marcado (como «También al inicio/final» dependen de «Entre cada instancia»), y campo «Nombre de página» con «Expresión…».

#### El panel Problemas: altura fija y una sola entrada

El panel ocupa hasta 224 px (`max-h-56`) sin divisor para cambiarlo; a 960×600, el mínimo de la ventana, deja el lienzo en unos 200 px de alto. Solo se abre desde el contador del pie («⊗ 6», entre la ruta del mensaje de estado y la ruta del documento): no está en la paleta ni en ningún menú, y no tiene atajo. Al abrir un informe con errores, esa cifra es el único aviso.

Heurísticas: flexibilidad y eficiencia de uso; estética y diseño minimalista.

Cambio: divisor arrastrable con la altura recordada y un tope de un tercio de la ventana; «Mostrar problemas» en la paleta y el atajo Ctrl+Mayús+M (el de VS Code).

#### El pie muestra la ruta dos veces y corta el nombre del fichero

Tras abrir, el mensaje de estado dice «Abierto: <ruta>» y no caduca: sigue igual tras seleccionar, abrir diálogos y cambiar el tamaño de la ventana. La misma ruta se repite a la derecha en negrita. Las dos se truncan por el final (`C:\Users\…\c--User…`) y se pierde `SalesInvoiceESP.rdlc`, que es lo que identifica el documento.

Heurística: estética y diseño minimalista.

Cambio: la ruta una sola vez, truncada por el centro conservando el nombre del fichero; «Abierto» caduca como los demás mensajes de acción.

#### «Mensaje sin filas» no admite expresión como los demás campos

`NoRowsMessage` es una expresión en RDL, pero el campo es un texto plano [`PropertiesPanel.tsx`, `TextOptionField`], sin el botón «Expresión…» ni el autocompletado que tienen Visibilidad y Color de fondo en el mismo panel.

Heurística: consistencia y estándares.

Cambio: el mismo campo con «Expresión…» que Visibilidad.

### Cosméticos

#### Textos del diálogo de grupo con voz de implementación

Subtítulo: «Expresiones, saltos de página, ordenación y visibilidad del grupo. «Aplicar» envía solo las secciones modificadas.» Pestaña Saltos de página: «Las opciones se escriben como \`PageBreak → BreakLocation\` del grupo.», con las comillas invertidas literales en pantalla. Ninguna de las dos frases ayuda a elegir, y las dos son la voz de manual y de justificación que la guía de microcopy descarta [`docs/ux/0006-guia-microcopy.md`].

Heurística: ayuda y documentación.

Cambio: subtítulo «Expresiones, saltos de página, ordenación y visibilidad del grupo.»; sin nota en Saltos de página.

#### Inspector y pie sin informe abierto

Sin documento, el inspector dice «Selecciona un elemento en el lienzo para editar sus propiedades» sin que haya lienzo, y el pie repite el estado vacío: «Listo. Abre un informe .rdlc de Business Central o un .rdl 2016.»

Heurística: estética y diseño minimalista.

Cambio: inspector vacío sin texto; pie «Listo».

## Veredictos por heurística

- Visibilidad del estado del sistema: rota. «Sin problemas» cuando la comprobación no se ha hecho.
- Correspondencia con el mundo real: rota. «Repetir cabeceras» ofrece la casilla que no repite la cabecera de una tabla.
- Control y libertad del usuario: se sostiene.
- Consistencia y estándares: tensa. «Mensaje sin filas» no admite expresión como los demás campos.
- Prevención de errores: se sostiene.
- Reconocer antes que recordar: rota. «Repetir cabeceras» ofrece la casilla que no repite la cabecera de una tabla.
- Flexibilidad y eficiencia de uso: tensa. Saltos de grupo sin reiniciar la numeración ni nombre de página.
- Estética y diseño minimalista: tensa. El pie muestra la ruta dos veces y corta el nombre del fichero.
- Ayudar a reconocer, diagnosticar y recuperarse de errores: tensa. Un hallazgo de grupo no dice qué expresión falla ni cómo se arregla.
- Ayuda y documentación: se sostiene.

## Recorrido cognitivo

**Que la cabecera de líneas de una factura se repita en cada página** (`SalesInvoiceESP.rdlc`, `LinesTable`)

| Paso | ¿Lo intenta? | ¿Ve la acción? | ¿La asocia al efecto? | ¿Ve el progreso? | Resultado | Hallazgo |
| --- | --- | --- | --- | --- | --- | --- |
| Buscar dónde se repite una fila | Sí | No: la fila no tiene la acción | No: la casilla del Tablix parece la buena | — | Fallo | «Repetir cabeceras» ofrece la casilla que no repite la cabecera de una tabla |
| Marcar «Repetir cabeceras de fila» | Sí | Sí | No | No: ni el lienzo ni la impresión en BC cambian | Fallo | «Repetir cabeceras» ofrece la casilla que no repite la cabecera de una tabla |

**Corregir el error «Tablix1 · Value» de Problemas**

| Paso | ¿Lo intenta? | ¿Ve la acción? | ¿La asocia al efecto? | ¿Ve el progreso? | Resultado | Hallazgo |
| --- | --- | --- | --- | --- | --- | --- |
| Darse cuenta de que el informe tiene errores | Sí | No: solo «⊗ 5» en el pie | Sí | — | Duda | El panel Problemas: altura fija y una sola entrada |
| Abrir la ordenación del grupo `BTCBillNo1` | Sí | Sí: la fila del grupo y su botón de propiedades quedan a la vista | No: «Value» no dice Ordenación | Sí | Duda | Un hallazgo de grupo no dice qué expresión falla ni cómo se arregla |

## Qué proteger

- El lint encuentra defectos reales en el corpus: `SalesInvoiceESP.rdlc` y `SalesCreditMemoESP.rdlc` usan `BTCBillNo`, `BTCBillAmount` y `BTCBillDueDate`, que no están en `<Fields>`.
- Pulsar un hallazgo selecciona su elemento, también a seis niveles de profundidad (Tablix2 › Celda 1,1 › Rectangle2 › LinesTable › Celda 1,1 › ItemNo_Line_Lbl2), lo muestra en la miga y desplaza el lienzo hasta él; el foco se queda en la lista para pasar al siguiente.
- El contador del pie no depende solo del color: icono, número y un nombre accesible con plurales reales («6 errores, 0 avisos, 0 sugerencias»); cada fila del panel lleva su gravedad en texto para lector.
- «También al inicio/final del grupo» dependen de «Entre cada instancia», como en Report Builder, y se guarda un único `BreakLocation`.
- El actualizador explica a la copia portable por qué no se actualiza sola y dónde descargar la nueva versión.
- Con `RDLC_LOCALE=en` la pantalla principal sale entera en inglés, incluidos el pie y el recuento de elementos.
- El estado vacío con «Abrir informe…», arrastrar y atajos, y los atajos visibles en Fichero y en la paleta.

## Orden recomendado

- «Repetir cabeceras» ofrece la casilla que no repite la cabecera de una tabla
- «Sin problemas» cuando la comprobación no se ha hecho
- Un hallazgo de grupo no dice qué expresión falla ni cómo se arregla
- Saltos de grupo sin reiniciar la numeración ni nombre de página
- El panel Problemas: altura fija y una sola entrada
- El pie muestra la ruta dos veces y corta el nombre del fichero
- «Mensaje sin filas» no admite expresión como los demás campos
- Textos del diálogo de grupo con voz de implementación
- Inspector y pie sin informe abierto
