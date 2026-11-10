# Editor de texto del Textbox (`TextEditorDialog`)

## Veredicto de anti-patrones

Sin patrones manipulativos. Tres fallos comunes: patrones incoherentes (dos rótulos «Párrafo N» para un solo bloque; «run» y «fragmento» para lo mismo), controles identificados solo por su placeholder y una acción que rompe el documento sin aviso (insertar una expresión dentro de un marcador).

## Problemas

### Importantes

#### La barra del párrafo parece de todo el texto

La alineación y las acciones del párrafo (duplicar, subir, bajar, borrar) iban en una franja «Párrafo 1» encima del textarea, que contiene todos los párrafos; el bloque de fragmentos, debajo del textarea, repetía «Párrafo 1 · 1 fragmento». Con los 9 párrafos de `Textbox10` en `SalesCreditMemoESP.rdlc`, nada unía la franja con una línea del textarea. El foco inicial caía en «Alinear izquierda (párrafo 1)» [`docs/ux/0005-reauditoria-intent.md:117`].

Heurísticas: correspondencia entre el control y lo que cambia; visibilidad del estado del sistema.

Cambio: una sola cabecera «Párrafo N · M fragmentos», con la alineación y las acciones del párrafo, en el bloque del párrafo. Con más de un párrafo, la línea del párrafo activo se tiñe en el textarea. El foco entra en el textarea.

#### Un marcador se lee como texto literal

`⟨MaterialQuantity⟩` se ve como «(MaterialQuantity)» en la fuente monoespaciada: nada lo distingue de un texto entre paréntesis que se imprimiría tal cual.

Heurística: reconocer antes que recordar.

Cambio: cada marcador que será un run se ve como un chip, sin los `⟨ ⟩`, con el mismo criterio que `textToParagraphs` [`apps/front/src/lib/textEditor.ts`, `splitMarkers`]. Las expresiones no se editan en el textarea: un clic en una lleva el foco a su fragmento, abajo; el caret la cruza entera con las flechas; Retroceso o Supr junto a ella la quita entera, y escribir o pegar dentro va detrás [`protectMarkers`]. «Insertar expresión» la crea y lleva el foco a su fragmento.

#### «Insertar en el cursor» parte un marcador

Con el caret dentro de `⟨BTCGLNLbl⟩`, el resultado era `⟨BT⟨=⟩CGLNLbl⟩`: el run de la etiqueta se rompía y el borrador lo aceptaba.

Heurística: prevención de errores.

Cambio: sin selección y dentro de un par `⟨…⟩`, el marcador nuevo va detrás de su cierre [`insertionPointAt`]. El botón se llama «Insertar expresión» y está junto al textarea, sobre el que actúa.

### Menores

#### La misma expresión tres veces en la tarjeta del fragmento

Con etiqueta, la cabecera repetía la expresión recortada justo encima del editor que la muestra entera.

Cambio: fuera la copia de la cabecera.

#### Controles sin rótulo

La etiqueta se identificaba solo por el placeholder «etiqueta (Label)», que desaparece al rellenarla; la fuente, el tamaño y el formato no tenían rótulo visible.

Heurística: reconocer antes que recordar.

Cambio: rótulos «Etiqueta», «Fuente» y «Formato»; placeholder «(sin etiqueta)».

#### El tipo se cambiaba con un icono «ab»

El tipo se mostraba en un badge y se cambiaba con un icono sin texto al otro extremo de la fila.

Cambio: un selector «Texto | Expresión»: el pulsado es el vigente y pulsar el otro lo cambia.

#### «run» y «fragmento»

Los encabezados decían «fragmento»; los tooltips y los nombres accesibles, «run» («Duplicar run», «Expresión del run 1»).

Cambio: «fragmento» en todo el catálogo ES de los runs, también en el panel de texto, que comparte las claves. EN sigue con «run».

#### 180 px de textarea para una línea

Cambio: el textarea crece con el texto, de 3 líneas al 45 % del alto de la ventana.

#### Ctrl+Intro solo en el tooltip de Aplicar

Cambio: «Ctrl+Intro para aplicar» en el pie.

## Preguntas abiertas

- ¿El editor de formato se pliega mientras el formato es General? Hoy ocupa media tarjeta en cada fragmento.
