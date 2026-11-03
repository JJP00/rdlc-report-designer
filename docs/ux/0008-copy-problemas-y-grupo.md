# Textos de Problemas y de Propiedades del grupo

## Mensajes del lint

Cada mensaje dice qué falla y cómo se arregla. La ubicación va en su propia línea y no se repite en el mensaje. Ninguno lleva la posición del carácter: «Abrir» (F2) deja el cursor en el sitio [`docs/features/0006-repetir-fila-y-hallazgos-journey.md`].

| Clave | Cuándo | ES | EN |
| --- | --- | --- | --- |
| `lint.rule.unknownField.rdlc` | Campo que no está en el dataset, fichero `.rdlc` | El campo «{field}» no está en el dataset. Añádelo al dataset del informe en AL y compila, o corrige el nombre. | Field “{field}” is not in the dataset. Add it to the report dataset in AL and compile, or fix the name. |
| `lint.rule.unknownField.rdl` | Lo mismo, fichero `.rdl` de SSRS | El campo «{field}» no está en el dataset. Añádelo a la consulta del dataset o corrige el nombre. | Field “{field}” is not in the dataset. Add it to the dataset query, or fix the name. |
| `lint.rule.reportItemMissing` | `ReportItems!X` sin elemento | Ningún elemento del informe se llama «{name}». Corrige ReportItems!{name}; si renombraste el elemento, usa su nombre nuevo. | No report item is named “{name}”. Fix ReportItems!{name}; if you renamed the item, use its new name. |
| `lint.rule.unclosedBracket` | `(`, `[` o `{` sin cierre | Falta cerrar «{char}». | “{char}” is never closed. |
| `lint.rule.unopenedBracket` | `)`, `]` o `}` sin apertura | «{char}» no tiene apertura. Quítalo o añade la que falta. | “{char}” has no opening. Remove it or add the missing one. |
| `lint.rule.unclosedQuote` | Comillas `"` sin cerrar | Faltan las comillas de cierre. | A closing quote is missing. |

El front elige la clave: `.rdlc` o `.rdl` por la extensión del documento, y apertura, cierre o comillas por `char`. `index` deja de mostrarse.

## Ubicación de un hallazgo

Nombra el sitio con las mismas palabras que la interfaz que lo edita.

| Clave | ES | EN |
| --- | --- | --- |
| `lint.where.text` | {item} · Texto | {item} · Text |
| `lint.where.itemVisibility` | {item} · Visibilidad | {item} · Visibility |
| `lint.where.itemProperty` | {item} · {property} | {item} · {property} |
| `lint.where.groupExpression` | Grupo {group} · Expresión de grupo | Group {group} · Group expression |
| `lint.where.groupSort` | Grupo {group} · Ordenación | Group {group} · Sorting |
| `lint.where.groupVisibility` | Grupo {group} · Visibilidad | Group {group} · Visibility |
| `lint.where.groupPageName` | Grupo {group} · Saltos de página | Group {group} · Page breaks |
| `lint.where.rowVisibility` | {tablix} · Fila {row} · Visibilidad | {tablix} · Row {row} · Visibility |
| `lint.where.tablixFilters` | {tablix} · Filtros | {tablix} · Filters |
| `lint.where.noRowsMessage` | {tablix} · Mensaje sin filas | {tablix} · No rows message |
| `lint.where.code` | Código · línea {line} | Code · line {line} |
| `lint.where.other` | {item} · {tag} | {item} · {tag} |

`{property}` es la etiqueta del campo en el inspector, en el idioma de la interfaz («Color de fondo» / «Background color»). `{tag}` es la etiqueta XML y solo aparece cuando no hay editor para esa expresión.

## Estados del indicador Problemas

| Clave | Dónde | ES | EN |
| --- | --- | --- | --- |
| `lint.empty` | Contador y panel | Sin problemas | No problems |
| `lint.checking` | Contador y panel | Comprobando… | Checking… |
| `lint.checkingAria` | Nombre accesible del contador | Comprobando el informe | Checking the report |
| `lint.unchecked` | Contador | Sin comprobar | Not checked |
| `lint.uncheckedAria` | Nombre accesible del contador | No se pudo comprobar el informe | The report could not be checked |
| `lint.incomplete` | Contador, con cero hallazgos | Comprobación incompleta | Check incomplete |
| `lint.incompleteAria` | Nombre accesible del contador | Comprobación incompleta: {summary} | Check incomplete: {summary} |
| `lint.failed` | Panel, el IPC falla o responde `ok:false` | No se pudo comprobar el informe. Puedes seguir editando y guardar. | The report could not be checked. You can keep editing and saving. |
| `lint.timeout` | Panel, sin respuesta en 5 s | La comprobación tardó demasiado. Puedes seguir editando y guardar. | The check took too long. You can keep editing and saving. |
| `lint.retry` | Botón del panel | Reintentar | Try again |
| `lint.ruleFailed.unbalancedBracket` | Panel, comprobación incompleta | No se pudieron comprobar los paréntesis ni las comillas. | Could not check brackets and quotes. |
| `lint.ruleFailed.unknownField` | Panel, comprobación incompleta | No se pudieron comprobar los campos del dataset. | Could not check dataset fields. |
| `lint.ruleFailed.reportItemMissing` | Panel, comprobación incompleta | No se pudieron comprobar las referencias a elementos del informe. | Could not check references to report items. |
| `lint.ruleFailed.other` | Panel, regla sin texto propio | No se pudo comprobar la regla «{rule}». | Could not check rule “{rule}”. |
| `lint.remaining` | Región viva tras un arreglo | Quedan {n, plural, one {# problema} other {# problemas}} | {n, plural, one {# problem left} other {# problems left}} |

`{summary}` es `lint.summary`, que ya existe. Una regla que falla es una línea propia: las frases no se concatenan.

## Propiedades del grupo

| Clave | Hoy (ES) | Cambio | ES | EN |
| --- | --- | --- | --- | --- |
| `tablix.groupProps.subtitle` | Expresiones, saltos de página, ordenación y visibilidad del grupo. «Aplicar» envía solo las secciones modificadas. | Se quita | — | — |
| `tablix.groupProps.breaksNote` | Las opciones se escriben como \`PageBreak → BreakLocation\` del grupo. | Se quita | — | — |
| `tablix.groupProps.expressionsNote` | La primera es «Group on»; las siguientes acotan más el grupo («And on»). | Se quita | — | — |
| `tablix.groupProps.groupOn` | Group on | ES traducido | Agrupar por | Group on |
| `tablix.groupProps.andOn` | And on | ES traducido | Y por | And on |
| `tablix.groupProps.nameNote` | Único en el informe. Renombrar el grupo no reescribe las expresiones de ámbito. | Recortado | Único en el informe. Las expresiones que lo usan como ámbito no se renombran solas. | Unique in the report. Expressions that use it as a scope are not renamed with it. |
| `tablix.groupProps.resetPageNumber` | — | Nueva | Reiniciar la numeración de páginas en cada salto | Restart page numbering at each break |
| `tablix.groupProps.pageName` | — | Nueva | Nombre de página | Page name |
| `tablix.groupProps.pageNameHint` | — | Nueva (tooltip) | Lo devuelve Globals!PageName y da nombre a la hoja al exportar a Excel. | Returned by Globals!PageName and used as the sheet name in Excel exports. |
| `tablix.groupProps.noSorting` | Sin ordenación: el grupo respeta el orden del dataset. | Se mantiene | Sin ordenación: el grupo respeta el orden del dataset. | No sorting: the group keeps the dataset order. |
| `tablix.groupProps.visibilityLegend` | Cuando el informe se ejecuta por primera vez | Se mantiene | Cuando el informe se ejecuta por primera vez | When the report runs for the first time |
| `tablix.groupProps.toggleItem` | La visibilidad se puede alternar con este elemento del informe | Se mantiene | La visibilidad se puede alternar con este elemento del informe | Visibility can be toggled with this report item |

Sin subtítulo, el contenido del diálogo lleva `aria-describedby={undefined}`: las pestañas ya nombran las secciones. «Reiniciar la numeración…» va sangrada bajo las opciones de salto, como «También al inicio/final del grupo», y se habilita cuando hay un salto marcado.

## Preguntas abiertas

- ¿Usa el Report Builder en español «Agrupar por» / «Y por» en Propiedades del grupo?
