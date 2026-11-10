/**
 * Texto y expresiones: panel simple, editor de texto mixto y runs (ES).
 *
 * Los valores son **byte a byte** los que mostraba la app hardcodeados, salvo
 * los recortes del barrido de microcopy: fuera la nota de texto mixto, el
 * manual de expresiones en una línea, el tooltip de etiqueta recortado y el
 * badge con plurales reales (`6 párr. · 6 fragmento(s)` → `6 párrafos · 6 fragmentos`).
 */
export const text = {
  panel: {
    title: 'Texto y expresión',
    /** Línea del resumen de un párrafo en el caso mixto. */
    paragraph: 'Párrafo {index}:',
    formatLabel: 'Formato',
    formatAria: 'Formato del textbox',
    openEditor: 'Abrir editor de texto',
    /** Una línea: el editor de Monaco se autocompleta solo. */
    hint: 'Texto o expresión (ej. =Fields!Campo.Value).',
  },
  /** Resumen del documento (párrafos · fragmentos) del textbox. */
  document: {
    mixedBadge:
      '{paragraphs, plural, one {# párrafo} other {# párrafos}} · {runs, plural, one {# fragmento} other {# fragmentos}}',
    expressionSummary: '[expresión]',
    emptyRun: '(vacío)',
  },
  editor: {
    title: 'Texto de {id}',
    description:
      'Cada línea es un párrafo. Las expresiones resaltadas se editan debajo, en su fragmento: haz clic en una para ir a ella.',
    paragraphRuns: 'Párrafo {index} · {runs, plural, one {# fragmento} other {# fragmentos}}',
    alignLeft: 'Alinear izquierda',
    alignLeftAria: 'Alinear izquierda (párrafo {index})',
    alignCenter: 'Centrar',
    alignCenterAria: 'Centrar (párrafo {index})',
    alignRight: 'Alinear derecha',
    alignRightAria: 'Alinear derecha (párrafo {index})',
    duplicateParagraph: 'Duplicar párrafo',
    duplicateParagraphAria: 'Duplicar párrafo {index}',
    moveParagraphUp: 'Subir párrafo',
    moveParagraphUpAria: 'Subir párrafo {index}',
    moveParagraphDown: 'Bajar párrafo',
    moveParagraphDownAria: 'Bajar párrafo {index}',
    removeParagraph: 'Eliminar párrafo',
    removeParagraphAria: 'Eliminar párrafo {index}',
    /** Etiqueta visible del textarea (el nombre accesible sigue siendo `textareaAria`). */
    textLabel: 'Texto',
    textareaAria: 'Texto del textbox',
    addText: 'Añadir texto',
    addExpression: 'Añadir expresión',
    insertAtCursor: 'Insertar expresión',
    insertAtCursorTitle: 'Inserta una expresión donde está el cursor',
    addParagraph: 'Añadir párrafo',
    applyTitle: 'Aplicar (Ctrl+Intro)',
    applyHint: 'Ctrl+Intro para aplicar',
  },
  /** TextRun: valor (texto o expresión), etiqueta de BC y formato. */
  run: {
    labelPlaceholder: 'etiqueta (Label)',
    /** Editor de texto: la etiqueta ya tiene rótulo visible. */
    labelCaption: 'Etiqueta',
    labelNone: '(sin etiqueta)',
    labelTitle: 'Etiqueta de BC (<Label>): se muestra en lugar de la expresión',
    labelAria: 'Etiqueta del fragmento {index}',
    kindExpression: 'expresión',
    kindText: 'texto',
    /** Selector Texto | Expresión del editor de texto. */
    kindAria: 'Tipo del fragmento {index}',
    asText: 'Texto',
    asExpression: 'Expresión',
    expressionAria: 'Expresión del fragmento {index}',
    valueAria: 'Valor del fragmento {index}',
    toText: 'Convertir en texto',
    toExpression: 'Convertir en expresión',
    duplicate: 'Duplicar fragmento',
    up: 'Subir fragmento',
    down: 'Bajar fragmento',
    remove: 'Eliminar fragmento',
    fontCaption: 'Fuente',
    fontPlaceholder: '(heredada)',
    fontAria: 'Fuente del fragmento {index}',
    sizeTitle: 'Tamaño (pt): flechas o arrastre (enteros)',
    sizeAria: 'Tamaño del fragmento {index}',
    bold: 'Negrita',
    boldAria: 'Negrita del fragmento {index}',
    italic: 'Cursiva',
    italicAria: 'Cursiva del fragmento {index}',
    underline: 'Subrayado',
    underlineAria: 'Subrayado del fragmento {index}',
    color: 'Color de texto',
    colorAria: 'Color del fragmento {index}',
    highlight: 'Resaltado',
    highlightAria: 'Resaltado del fragmento {index}',
    formatCaption: 'Formato',
    formatAria: 'Formato del fragmento {index}',
    formatPlaceholder: '(heredado)',
  },
  /** Diálogo de expresión RDL (`ExpressionDialog`). */
  expression: {
    description:
      'Expresión RDL con resaltado y autocompletado. Ctrl+Intro o «Aplicar» para confirmar.',
    editorAria: 'Editor de {title}',
  },
  /** Acciones compartidas por los diálogos del módulo. */
  dialog: {
    apply: 'Aplicar',
  },
} as const;
