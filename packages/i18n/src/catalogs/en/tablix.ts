/**
 * Tablix: estructura, grupos, filtros y jerarquía
 * (barrido i18n: módulo «panels-tablix»).
 *
 * Se quedan **sin traducir** (mismo valor en EN y ES, por eso viven aquí y no
 * en el código): la jerga del XSD `Group on`/`And on`, la marca de total interno
 * (`before`/`after`) y el ejemplo de expresión `Sum(…, "Grupo")` de la nota del
 * nombre. Las teclas y los nombres de item van como parámetros.
 */
export const tablix = {
  /** Acción de los diálogos del módulo («Aplicar» cambia en Group y Filters). */
  apply: 'Apply',
  applyHint: 'Apply (Ctrl+Enter)',
  add: 'Add',

  structure: {
    aria: 'Tablix structure',
    title: 'Structure',
    /** «2 rows × 6 columns»; plurales reales para 1 fila / 1 columna. */
    summary:
      '{rows, plural, one {# row} other {# rows}} × {columns, plural, one {# column} other {# columns}}',
    filtersHint: 'Tablix filters (Filters > Filter)',
    filtersCount: 'Filters ({count})',
    filters: 'Filters…',
  },

  rows: {
    title: 'Rows',
    delete: 'Delete row {row}',
    select: 'Select row {row}',
    selectInGroup: 'Select row {row} (group {expression})',
    addAtEnd: 'Add row at the end',
    sizeLabel: 'Height of row {row}',
    sizeHint:
      'Height of row {row} (cm). The cell content follows the row. Drag, use the arrows or type a value.',
    group: 'Group row {row}…',
    groupHint: 'Group the row in a new group…',
    groupTitle: 'Group row {row}',
    groupProperties: 'Group properties for row {row}',
    ungroup: 'Remove group from row {row}',
    addToGroup: 'Add row {row} to the group',
    addPreviousHint: 'Add the previous row to this group',
    addNextHint: 'Add the next row to this group',
  },

  columns: {
    title: 'Columns',
    delete: 'Delete column {column}',
    select: 'Select column {column}',
    selectInGroup: 'Select column {column} (group {expression})',
    addAtEnd: 'Add column at the end',
    sizeLabel: 'Width of column {column}',
    sizeHint:
      'Width of column {column} (cm). The cell content follows the column. Drag, use the arrows or type a value.',
    group: 'Group column {column}…',
    groupHint: 'Group the column in a new group…',
    groupTitle: 'Group column {column}',
    groupProperties: 'Group properties for column {column}',
    ungroup: 'Remove group from column {column}',
    addToGroup: 'Add column {column} to the group',
    addPreviousHint: 'Add the previous column to this group',
    addNextHint: 'Add the next column to this group',
  },

  /** Fragmentos de la fila/columna/grupo: otras superficies los interpolan. */
  member: {
    row: 'row {index}',
    column: 'column {index}',
    group: 'group {expression}',
    groupPlain: 'group',
  },

  group: {
    placeholder: 'Group',
    properties: 'Group properties',
    propertiesHint: 'Group properties (expressions, page breaks, sorting, visibility)…',
    remove: 'Remove group',
    removeHint: 'Remove the group (rows stay as static rows)',
    removeLeafHint: 'Remove the group (the row stays as a static row)',
  },

  /** Total de un grupo: el valor (`before`/`after`) es interno, no se traduce. */
  total: {
    before: 'Total (before)',
    after: 'Total (after)',
  },

  groupProps: {
    title: 'Group properties',
    titleWithName: 'Group properties · {name}',
    subtitle:
      'Group expressions, page breaks, sorting and visibility. "Apply" sends only the sections you changed.',
    tabGeneral: 'General',
    tabBreaks: 'Page breaks',
    tabSorting: 'Sorting',
    tabVisibility: 'Visibility',
    name: 'Name',
    /** Barrido de microcopy (Trim): la advertencia se queda, el relleno no. */
    nameNote: 'Unique in the report. Renaming the group does not rewrite scope expressions.',
    expressions: 'Group expressions',
    /** Barrido (Keep): «Group on»/«And on» son jerga del XML. */
    expressionsNote:
      'The first one is "Group on"; the following ones narrow the group further ("And on").',
    groupOn: 'Group on',
    andOn: 'And on',
    expression: 'Group expression',
    expressionExtra: 'Additional group expression {index}',
    editExpression: 'Edit expression {index} in the editor',
    deleteExpression: 'Delete expression {index}',
    deleteExpressionHint: 'Delete this expression',
    expressionTitle: 'Group expression {index}',
    breaksNote: 'The options are written as `PageBreak → BreakLocation` for the group.',
    breakBetween: 'Between each group instance',
    breakStart: 'Also at the start of the group',
    breakEnd: 'Also at the end of the group',
    sortColumns: 'Sort columns',
    /** Barrido (Keep): un hecho, una línea. */
    noSorting: 'No sorting: the group keeps the dataset order.',
    sortBy: 'Sort by',
    thenBy: 'Then by',
    sortExpression: 'Sort expression {index}',
    sortDirection: 'Sort direction {index}',
    editSort: 'Edit sort {index} in the editor',
    moveSortUp: 'Move sort {index} up',
    moveSortDown: 'Move sort {index} down',
    moveUpHint: 'Up',
    moveDownHint: 'Down',
    deleteSort: 'Delete sort {index}',
    deleteHint: 'Delete',
    sortTitle: 'Sort {index}',
    visibilityLegend: 'When the report runs for the first time',
    show: 'Show',
    hide: 'Hide',
    showByExpression: 'Show or hide with an expression',
    editVisibilityExpression: 'Edit the visibility expression',
    toggleItem: 'Visibility can be toggled with this report item',
    toggleItemAria: 'Item that toggles visibility',
    chooseItem: '— choose item —',
    visibilityTitle: 'Group visibility',
    visibilityTitleWithItem: 'Group visibility {item}',
    chooseVariable: '— choose variable —',
    customExpression: 'Custom expression (fx)…',
    editWithEditor: 'Edit in the expression editor…',
  },

  filters: {
    title: 'Tablix filters',
    subtitle:
      'Evaluated on each dataset row before grouping. Values go one per line (expressions with commas are allowed).',
    empty: 'No filters.',
    row: 'Filter {index}',
    remove: 'Remove filter {index}',
    expression: 'Filter expression {index}',
    operator: 'Filter operator {index}',
    values: 'Filter values {index}',
    add: 'Add filter',
    /** Operadores de `Filters > Filter`: los términos entre paréntesis del ES. */
    operators: {
      equal: 'Equal to',
      notEqual: 'Not equal to',
      like: 'Like',
      greaterThan: 'Greater than',
      greaterThanOrEqual: 'Greater than or equal to',
      lessThan: 'Less than',
      lessThanOrEqual: 'Less than or equal to',
      in: 'In list',
      between: 'Between',
      topN: 'Top N',
      bottomN: 'Bottom N',
      topPercent: 'Top %',
      bottomPercent: 'Bottom %',
    },
  },

  hierarchy: {
    title: 'Hierarchy',
    treeAria: 'Report hierarchy',
    search: 'Search the hierarchy',
    searchPlaceholder: 'Search item or cell…',
    expandAll: 'Expand all',
    collapseAll: 'Collapse all',
    expand: 'Expand',
    collapse: 'Collapse',
    expandNode: 'Expand {label}',
    collapseNode: 'Collapse {label}',
    noResults: 'No results.',
    /** Raíz del breadcrumb y bandas del informe (`Encabezado`/`Cuerpo`/`Pie`). */
    report: 'Report',
    regionHeader: 'Header',
    regionBody: 'Body',
    regionFooter: 'Footer',
    cell: 'Cell {row},{col}',
  },
} as const;
