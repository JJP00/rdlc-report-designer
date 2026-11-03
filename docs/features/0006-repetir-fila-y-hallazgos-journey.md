# Repetir una fila en cada página e ir de un hallazgo a su expresión

## Repetir una fila de cabecera en cada página

### Problema

Un consultor de BC quiere que la cabecera de líneas de una factura salga también en la segunda página, o que deje de salir. En RDL eso es `RepeatOnNewPage=true` + `KeepWithGroup=After` en cada fila estática de cabecera [Microsoft Learn, *Show row and column headers on multiple pages*](https://learn.microsoft.com/en-us/sql/reporting-services/report-design/display-row-and-column-headers-on-multiple-pages-report-builder-and-ssrs). En el corpus es exactamente así: las 18 filas que se repiten son filas de cabecera, antes del grupo, con `KeepWithGroup=After` y siempre en bloque de dos [`fixtures/corpus/*.rdlc`]. La app no muestra ni edita ese ajuste; las casillas «Repetir cabeceras de fila/columna» del Tablix sí están a la vista y no tienen efecto en una tabla sin áreas de cabecera de grupo, como `LinesTable` [`docs/ux/0007-evaluacion-ux.md`].

### Variantes

| Caso | Ejemplo | Qué ve el usuario |
| --- | --- | --- |
| Cabecera de dos filas que ya se repite | `LinesTable` de `SalesInvoiceESP.rdlc`, filas 1–2 | Marca de repetición en las filas 1 y 2 al seleccionar el Tablix |
| Cabecera que se mantiene con el grupo sin repetirse | `SalesShipment.rdlc`, 3 filas con `KeepWithGroup=After` | Botón sin marca; repetir añade `RepeatOnNewPage` y conserva lo demás |
| Fila de pie, tras el grupo | Fila 5 de `LinesTable` | Sin botón |
| Fila dentro del grupo sin otro grupo al lado | Filas 3–4 de `LinesTable` | Sin botón |
| Matriz con áreas de cabecera de grupo | Tablix con `TablixCorner` | Casillas del Tablix activas, más los botones de las filas que cumplan |
| Tabla sin áreas de cabecera de grupo con `RepeatRowHeaders=true` | `LinesTable` | Casilla marcada y deshabilitada, con la línea que lleva a las filas |

### Flujo

**1. El Tablix queda seleccionado.** Clic en su borde, en una celda o desde la jerarquía. Estructura → Filas lista las filas; en cada fila de cabecera que se repite hay una marca junto al número. El estado se ve sin abrir nada porque el fallo de hoy es que el ajuste que manda es invisible.

**2. El usuario pulsa «Repetir en cada página» en la fila.** El botón está en las acciones de la fila, entre la expresión de visibilidad y «Agrupar», y solo en filas estáticas que van antes de un grupo en su mismo nivel. Las demás filas no lo llevan: un botón deshabilitado en cada fila de cada tabla sería ruido para un ajuste que solo tiene sentido en la cabecera. La misma acción está en el menú contextual de cualquier celda de esa fila, tras «Propiedades del grupo…», como casilla marcable.

**3. La cabecera entera cambia de una vez.** Repetir la fila *r* repite *r* y todas las filas estáticas entre *r* y el grupo; dejar de repetir *r* la quita a ella y a las que están más lejos del grupo que *r*. Así el bloque que se repite siempre es contiguo y toca el grupo, que es la forma que tienen todos los informes del corpus y la única en la que la cabecera no se parte entre páginas. Un solo paso de deshacer. Las marcas de todas las filas afectadas cambian a la vez y el pie dice qué filas cambiaron.

**4. Guardar.** El XML lleva `RepeatOnNewPage=true` y `KeepWithGroup=After` en cada fila del bloque. Al dejar de repetir solo se quita `RepeatOnNewPage`: `KeepWithGroup=After` sigue manteniendo la cabecera con la primera línea, como en las tres filas de `SalesShipment.rdlc` que lo tienen sin repetirse.

**5. En BC** la factura impresa lleva la cabecera de líneas en cada página.

**Desde Opciones del Tablix.** En una tabla sin áreas de cabecera de grupo, «Repetir cabeceras de fila» y «Repetir cabeceras de columna» están deshabilitadas con su valor a la vista, y debajo una línea con un enlace que lleva el foco al botón de la primera fila de cabecera. Quien llega por la casilla que conoce de Report Builder encuentra el camino en vez de un callejón.

### Reglas

- **Fila que puede repetirse:** miembro estático (sin `Group`) con un hermano dinámico después de él en el mismo `TablixMembers`.
- **Repetir *r*:** `RepeatOnNewPage=true` y, si no lo tiene, `KeepWithGroup=After` en *r* y en cada fila estática entre *r* y el grupo.
- **Dejar de repetir *r*:** quitar `RepeatOnNewPage` de *r* y de las filas de cabecera más alejadas del grupo que *r*; `KeepWithGroup` no se toca.
- **Estado leído del fichero:** la marca refleja `repeatOnNewPage` de cada miembro tal como viene, aunque el bloque no sea contiguo o falte `KeepWithGroup`; la regla de contigüidad se aplica en el siguiente cambio.
- **Casillas del Tablix:** activas si el Tablix tiene áreas de cabecera de grupo en ese eje (`TablixCorner` o `TablixHeader`); si no, deshabilitadas con su valor.

### Interacción

- **Botón de la fila:** conmutador con `aria-pressed`; marcado en el mismo violeta que los demás ajustes activos de la fila. Objetivo de 24×24 px.
- **Marca junto al número:** icono de repetición, visible también cuando la fila no tiene el foco; su texto alternativo va en el nombre accesible del selector de la fila.
- **Lienzo:** con el Tablix seleccionado, el asa de cada fila que se repite lleva el mismo icono.
- **Deshacer:** un cambio de bloque es un paso de deshacer, aunque toque varias filas (`setMemberOptions` dentro de un `batch`).
- **Anuncio:** el mensaje del pie se repite en una región `aria-live="polite"`.
- **Foco:** se queda en el botón pulsado; desde el enlace de Opciones va al botón de la primera fila de cabecera.

### Textos

| Dónde | Texto |
| --- | --- |
| Botón de la fila, sin repetir (nombre y tooltip) | Repetir la fila {fila} en cada página |
| Botón de la fila, repitiéndose | Dejar de repetir la fila {fila} |
| Marca junto al número (tooltip) | Se repite en cada página |
| Menú contextual de la celda | Repetir en cada página |
| Pie, al repetir varias | Filas {desde}–{hasta}: se repiten en cada página |
| Pie, al repetir una | Fila {fila}: se repite en cada página |
| Pie, al dejar de repetir | Fila {fila}: ya no se repite |
| Opciones del Tablix, bajo las casillas deshabilitadas | En una tabla, la repetición se marca en cada fila. |
| Enlace de esa línea | Ver filas |

### Criterios de aceptación

Sobre `SalesInvoiceESP.rdlc`, con `LinesTable` seleccionada:

- Las filas 1 y 2 muestran la marca; las filas 3, 4 y 5 no tienen botón.
- Pulsar el botón de la fila 2 quita la marca de las filas 1 y 2; el XML conserva `KeepWithGroup=After` en ambas; un Ctrl+Z devuelve el fichero byte a byte.
- Sin marcas, pulsar el botón de la fila 1 escribe `RepeatOnNewPage=true` en las filas 1 y 2 en un solo paso de deshacer.
- Sin marcas, pulsar el botón de la fila 2 marca solo la fila 2.
- «Repetir cabeceras de fila» aparece marcada y deshabilitada; «Ver filas» lleva el foco al botón de la fila 1.

## Ir de un hallazgo a su expresión

### Problema

Pulsar un hallazgo de Problemas selecciona su elemento y desplaza el lienzo hasta él. Cuando la expresión es de un grupo, el elemento es el Tablix y la ubicación es la etiqueta XML («Tablix1 · Value» es la ordenación del grupo `BTCBillNo1`), así que el usuario tiene que adivinar qué pestaña de qué diálogo abrir. Cada uso de un campo ausente es una fila aparte (5 filas para 3 campos en `SalesInvoiceESP.rdlc`).

### Flujo

**1. El panel se abre** desde el contador del pie, desde la paleta («Mostrar problemas») o con Ctrl+Mayús+M.

**2. Los hallazgos de un mismo campo o elemento ausente van juntos:** una fila con el mensaje y, debajo, una fila por uso con su ubicación en las palabras de la interfaz («Grupo BTCBillNo1 · Ordenación»). El usuario ve de un vistazo qué hay que arreglar y cuántas veces aparece, y arregla el nombre una vez. Los paréntesis sin pareja no se agrupan: cada uno es un arreglo distinto.

**3. Enter o clic en un uso selecciona y revela su elemento**, como hoy. El foco sigue en la lista para pasar al siguiente con ↓.

**4. F2, doble clic o «Abrir» llevan al sitio donde se edita esa expresión** (tabla de destinos), con el campo enfocado y el cursor al principio de la referencia que falla. Abrir es un gesto aparte de seleccionar porque recorrer la lista no debe abrir un diálogo en cada fila; F2 es la misma tecla que abre el editor de texto en el lienzo.

**5. Aplicar cierra el editor y el lint vuelve a pasar** (600 ms de espera tras el cambio). Si el uso desaparece, el foco va al siguiente uso de la lista; si era el último, a la línea «Sin problemas». La región viva anuncia cuántos quedan.

### Destinos por tipo de expresión

| Expresión en el XML | Ubicación | F2 / «Abrir» lleva a |
| --- | --- | --- |
| `TextRun > Value` de un Textbox | {textbox} · Texto | Editor de texto del textbox, cursor en la expresión |
| `Visibility > Hidden` de un item | {item} · Visibilidad | Inspector → Visibilidad → Expresión… |
| Propiedad de estilo (`BackgroundColor`, `Color`, `Format`…) | {item} · {nombre del campo en el inspector} | Inspector → ese campo → Expresión… |
| `Group > GroupExpressions` | Grupo {grupo} · Agrupar por | Propiedades del grupo → General |
| `TablixMember > SortExpressions` | Grupo {grupo} · Ordenación | Propiedades del grupo → Ordenación |
| `TablixMember > Visibility > Hidden` de un grupo | Grupo {grupo} · Visibilidad | Propiedades del grupo → Visibilidad |
| `TablixMember > Visibility > Hidden` de una fila estática | {tablix} · Fila {n} · Visibilidad | Estructura → fila {n} → expresión de visibilidad |
| `Group > PageName` | Grupo {grupo} · Saltos de página | Propiedades del grupo → Saltos de página |
| `Tablix > Filters` | {tablix} · Filtros | Filtros… del Tablix |
| `Tablix > NoRowsMessage` | {tablix} · Mensaje sin filas | Inspector → Mensaje sin filas |
| `<Code>` | Código · línea {n} | Propiedades del informe → Código, en esa línea |
| Cualquier otra | {item} · {etiqueta} | Solo selección; sin «Abrir» |

Cada hallazgo trae su destino desde el dominio, que es donde se conoce el contexto XML: tipo de destino, item, eje y ruta del miembro, nombre del grupo, pestaña, párrafo y fragmento del texto, o línea del `<Code>`. El editor de texto acepta abrirse con el cursor en un párrafo y fragmento, y Propiedades del grupo acepta una pestaña inicial.

### Del diseñador a AL y vuelta

Cuando el campo está bien escrito pero no existe en el dataset, el arreglo no está en la app: hay que añadir la columna al dataset del informe en AL y compilar. BC regenera el `.rdlc` y la app lo recarga sola. El panel sigue abierto durante la recarga, la lista se rehace con el nuevo lint y el foco, si estaba en la lista, se queda en la misma posición. Si la sesión tiene cambios sin guardar, manda el aviso de conflicto que ya existe; la lista no cambia hasta que el usuario lo resuelve.

### Interacción

- **Lista:** una sola parada de tabulación con foco itinerante; ↑/↓, Inicio/Fin mueven el foco; Enter selecciona; F2 abre. `aria-describedby` de la lista: «F2 abre donde se edita».
- **«Abrir»:** botón al final de la fila de uso, visible al pasar el ratón y en la fila con foco; fuera del orden de tabulación (el teclado usa F2).
- **Fila de grupo:** no se selecciona ni se abre; agrupa y nombra el problema.
- **Al volver de un editor:** si el uso sigue en la lista, el foco vuelve a él; si desaparece, va al siguiente; si no quedan, a «Sin problemas».

### Textos

| Dónde | Texto |
| --- | --- |
| Paleta | Mostrar problemas |
| Botón de la fila de uso | Abrir |
| Tooltip de «Abrir» | Abrir donde se edita (F2) |
| Descripción de la lista | F2 abre donde se edita. |
| Región viva tras un arreglo | Quedan {n, plural, one {# problema} other {# problemas}} |
| Región viva al quedar ninguno | Sin problemas |

### Criterios de aceptación

Sobre `SalesInvoiceESP.rdlc`:

- El panel muestra 3 problemas (`BTCBillNo`, `BTCBillAmount`, `BTCBillDueDate`) con 5 usos debajo.
- F2 sobre «Grupo BTCBillNo1 · Ordenación» abre Propiedades del grupo de `BTCBillNo1` en Ordenación con la expresión enfocada.
- F2 sobre «Textbox66 · Texto» abre el editor de texto de `Textbox66` con el cursor en `Fields!BTCBillDueDate`.
- Corregir un uso y aplicar lo quita de la lista y deja el foco en el siguiente uso.

## Fuera de alcance

- Repetir filas de pie (tras el grupo): ningún informe del corpus lo hace.
- Columnas estáticas junto a un grupo de columnas: un solo grupo de columnas en el corpus (`BTCLoadingOrder.rdlc`).
- `KeepTogether` y `KeepWithGroup` como controles propios de la fila.

## Preguntas abiertas

- ¿Ofrece el problema de campo inexistente copiar el nombre del campo, para pegarlo en el dataset de AL?
- ¿A dónde lleva una expresión en los `Filters` de un grupo, que Propiedades del grupo no edita?
