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
      'Escribe el texto (Enter = párrafo nuevo) y las expresiones como {marker}. El bloque de abajo edita los fragmentos del párrafo donde tienes el cursor.',
    paragraph: 'Párrafo {index}',
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
    textareaAria: 'Texto del textbox',
    addText: 'Añadir texto',
    addExpression: 'Añadir expresión',
    insertAtCursor: 'Insertar en el cursor',
    addParagraph: 'Añadir párrafo',
    applyTitle: 'Aplicar (Ctrl+Intro)',
  },
  /** TextRun: valor (texto o expresión), etiqueta de BC y formato. */
  run: {
    labelPlaceholder: 'etiqueta (Label)',
    labelTitle: 'Etiqueta de BC (<Label>): se muestra en lugar de la expresión',
    labelAria: 'Etiqueta del run {index}',
    kindExpression: 'expresión',
    kindText: 'texto',
    expressionAria: 'Expresión del run {index}',
    valueAria: 'Valor del run {index}',
    toText: 'Convertir en texto',
    toExpression: 'Convertir en expresión',
    duplicate: 'Duplicar run',
    up: 'Subir run',
    down: 'Bajar run',
    remove: 'Eliminar run',
    fontPlaceholder: '(heredada)',
    fontAria: 'Fuente del run {index}',
    sizeTitle: 'Tamaño (pt): flechas o arrastre (enteros)',
    sizeAria: 'Tamaño del run {index}',
    bold: 'Negrita',
    boldAria: 'Negrita del run {index}',
    italic: 'Cursiva',
    italicAria: 'Cursiva del run {index}',
    underline: 'Subrayado',
    underlineAria: 'Subrayado del run {index}',
    color: 'Color de texto',
    colorAria: 'Color del run {index}',
    highlight: 'Resaltado',
    highlightAria: 'Resaltado del run {index}',
    formatAria: 'Formato del run {index}',
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
