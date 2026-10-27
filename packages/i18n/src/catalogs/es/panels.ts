/**
 * Paneles de propiedades del item (ES).
 *
 * Los valores son **byte a byte** los que la app mostraba con los textos
 * hardcodeados (fase 1 de `docs/features/0005-i18n.md`), salvo los recortes
 * del barrido de microcopy: nota de celda, nota de expresión de fondo.
 */
export const panels = {
  item: {
    empty: 'Selecciona un elemento en el lienzo para editar sus propiedades.',
  },
  properties: {
    title: 'Propiedades',
    nameLabel: 'Nombre del elemento',
    nameTitle:
      'Nombre del elemento (único). Las referencias existentes (ReportItems!…) no se reescriben.',
    positionAndSize: 'Posición y tamaño (cm)',
    cellNote: 'La celda controla la posición y el tamaño.',
    x: 'X',
    y: 'Y',
    width: 'Ancho',
    height: 'Alto',
    zIndex: 'ZIndex: {index}',
    pageBreak: 'Salto de página',
    pageBreakNone: 'Sin salto',
    pageBreakStart: 'Al inicio',
    pageBreakEnd: 'Al final',
    pageBreakBetween: 'Entre instancias',
    options: 'Opciones',
    canGrow: 'Crecer con el texto',
    keepTogether: 'Mantener junto',
    repeatColumnHeaders: 'Repetir cabeceras de columna',
    repeatRowHeaders: 'Repetir cabeceras de fila',
    noRowsMessage: 'Mensaje sin filas',
    appearance: 'Apariencia',
  },
  background: {
    label: 'Color de fondo',
    openExpressionEditor: 'Abrir editor de la expresión de color de fondo',
    remove: 'Quitar',
    removeAria: 'Quitar color de fondo',
    none: 'Sin color',
    expressionTitle: 'Expresión del color de fondo',
    // Barrido de microcopy (guía 0006): trim ligero — el hecho, sin relleno.
    note: 'No se evalúa en diseño: se pinta el color por defecto.',
  },
  visibility: {
    label: 'Visibilidad',
    aria: 'Visibilidad del elemento',
    visible: 'Visible',
    hidden: 'Oculta',
    expression: 'Expresión…',
    // Barrido de microcopy (guía 0006): Keep — no se recorta.
    hiddenNote: 'Oculta al imprimir: en el lienzo se pinta atenuada.',
    openExpressionEditor: 'Abrir editor de la expresión de visibilidad',
    expressionTitle: 'Expresión de visibilidad',
  },
  expression: {
    openEditor: 'Editor de expresiones (con números de línea)',
  },
  multiSelection: {
    title: 'Selección múltiple',
    countItems: '({count, plural, one {# elemento} other {# elementos}})',
    countCells: '({count, plural, one {# celda} other {# celdas}})',
    hint: 'Los cambios se aplican a todos en un solo paso de undo. «—» = valores distintos.',
    deleteItems: 'Eliminar los {count, plural, one {# elemento} other {# elementos}}',
    deleteCells: 'Eliminar el contenido de {count, plural, one {# celda} other {# celdas}}',
    text: 'Texto',
    fontFamily: 'Fuente de la selección',
    fontSize: 'Tamaño de la selección (pt)',
    bold: 'Negrita en la selección',
    italic: 'Cursiva en la selección',
    underline: 'Subrayado en la selección',
    textColor: 'Color{mixed, select, yes { —} other {}}',
    textColorAria: 'Color de texto de la selección',
    backgroundColor: 'Fondo{mixed, select, yes { —} other {}}',
    backgroundColorAria: 'Color de fondo de la selección',
    visibilityAria: 'Visibilidad de la selección',
  },
  align: {
    title: 'Alinear {state, select, insufficient {(necesita 2 elementos movibles)} other {}}',
    distributeTitle:
      'Distribuir {state, select, insufficient {(necesita 3 elementos movibles)} other {}}',
    left: 'Alinear a la izquierda',
    centerHorizontal: 'Centrar horizontalmente',
    right: 'Alinear a la derecha',
    top: 'Alinear arriba',
    middleVertical: 'Centrar verticalmente',
    bottom: 'Alinear abajo',
    distributeHorizontal: 'Distribuir horizontalmente',
    distributeVertical: 'Distribuir verticalmente',
  },
  memberVisibility: {
    show: 'Mostrar {label}',
    hide: 'Ocultar {label}',
    titleHiddenLiteral: '{label} oculta (oculta): click = visible',
    titleHiddenExpression: '{label} oculta (por expresión): click = visible',
    titleVisible: '{label} visible: click = oculta',
    expressionAria: 'Expresión de visibilidad de la {label}',
    expressionTitle: 'Visibilidad por expresión…',
    dialogTitle: 'Visibilidad de la {label}',
  },
} as const;
