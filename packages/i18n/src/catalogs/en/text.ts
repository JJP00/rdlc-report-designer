/**
 * Texto y expresiones: panel simple, editor de texto mixto, runs y Monaco
 * (barrido i18n: módulo «panels-text»).
 *
 * Contextos: `panel` (panel de texto), `document` (resumen del textbox que
 * comparten panel y editor), `editor` (editor de texto mixto), `run` (fragmento
 * de texto, en el panel y en el editor) y `expression` (diálogo de expresión).
 */
export const text = {
  panel: {
    title: 'Text and expression',
    /** Línea del resumen de un párrafo en el caso mixto. */
    paragraph: 'Paragraph {index}:',
    formatLabel: 'Format',
    formatAria: 'Textbox format',
    openEditor: 'Open text editor',
    /** Una línea: el editor de Monaco se autocompleta solo. */
    hint: 'Text or expression (e.g. =Fields!Campo.Value).',
  },
  /** Resumen del documento (párrafos · fragmentos) del textbox. */
  document: {
    mixedBadge:
      '{paragraphs, plural, one {# paragraph} other {# paragraphs}} · {runs, plural, one {# run} other {# runs}}',
    expressionSummary: '[expression]',
    emptyRun: '(empty)',
  },
  editor: {
    title: 'Text of {id}',
    description:
      'Each line is a paragraph. Highlighted expressions are edited below, in their run: click one to go to it.',
    paragraphRuns: 'Paragraph {index} · {runs, plural, one {# run} other {# runs}}',
    alignLeft: 'Align left',
    alignLeftAria: 'Align left (paragraph {index})',
    alignCenter: 'Center',
    alignCenterAria: 'Center (paragraph {index})',
    alignRight: 'Align right',
    alignRightAria: 'Align right (paragraph {index})',
    duplicateParagraph: 'Duplicate paragraph',
    duplicateParagraphAria: 'Duplicate paragraph {index}',
    moveParagraphUp: 'Move paragraph up',
    moveParagraphUpAria: 'Move paragraph {index} up',
    moveParagraphDown: 'Move paragraph down',
    moveParagraphDownAria: 'Move paragraph {index} down',
    removeParagraph: 'Delete paragraph',
    removeParagraphAria: 'Delete paragraph {index}',
    /** Etiqueta visible del textarea (el nombre accesible sigue siendo `textareaAria`). */
    textLabel: 'Text',
    textareaAria: 'Textbox text',
    addText: 'Add text',
    addExpression: 'Add expression',
    insertAtCursor: 'Insert expression',
    insertAtCursorTitle: 'Inserts an expression at the cursor',
    addParagraph: 'Add paragraph',
    applyTitle: 'Apply (Ctrl+Enter)',
    applyHint: 'Ctrl+Enter to apply',
  },
  /** TextRun: valor (texto o expresión), etiqueta de BC y formato. */
  run: {
    labelPlaceholder: 'label (Label)',
    /** Editor de texto: la etiqueta ya tiene rótulo visible. */
    labelCaption: 'Label',
    labelNone: '(no label)',
    labelTitle: 'BC label (<Label>): shown instead of the expression',
    labelAria: 'Label for run {index}',
    kindExpression: 'expression',
    kindText: 'text',
    /** Selector Texto | Expresión del editor de texto. */
    kindAria: 'Kind of run {index}',
    asText: 'Text',
    asExpression: 'Expression',
    expressionAria: 'Expression for run {index}',
    valueAria: 'Value for run {index}',
    toText: 'Convert to text',
    toExpression: 'Convert to expression',
    duplicate: 'Duplicate run',
    up: 'Move run up',
    down: 'Move run down',
    remove: 'Delete run',
    fontCaption: 'Font',
    fontPlaceholder: '(inherited)',
    fontAria: 'Font for run {index}',
    sizeTitle: 'Size (pt): arrows or drag (integers)',
    sizeAria: 'Size for run {index}',
    bold: 'Bold',
    boldAria: 'Bold for run {index}',
    italic: 'Italic',
    italicAria: 'Italic for run {index}',
    underline: 'Underline',
    underlineAria: 'Underline for run {index}',
    color: 'Text color',
    colorAria: 'Text color for run {index}',
    highlight: 'Highlight',
    highlightAria: 'Highlight for run {index}',
    formatCaption: 'Format',
    formatAria: 'Format for run {index}',
    formatPlaceholder: '(inherited)',
  },
  /** Diálogo de expresión RDL (`ExpressionDialog`). */
  expression: {
    description:
      'RDL expression with highlighting and autocompletion. Ctrl+Enter or Apply to confirm.',
    editorAria: 'Editor of {title}',
  },
  /** Acciones compartidas por los diálogos del módulo. */
  dialog: {
    apply: 'Apply',
  },
} as const;
