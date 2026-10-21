/**
 * Paleta de comandos (Ctrl+K): acciones, variables y búsqueda
 * (barrido i18n: módulo «palette-status»).
 */
export const palette = {
  dialog: {
    title: 'Command palette',
    description: 'Search report elements, variables, or editor actions',
  },
  search: {
    placeholder: 'Search an element, variable, or action…',
    empty: 'No results.',
  },
  section: {
    actions: 'Actions',
    elements: 'Report elements',
    variables: 'Variables',
  },
  category: {
    report: 'Report',
    view: 'View',
    tabs: 'Tabs',
    edit: 'Edit',
    insert: 'Insert',
  },
  action: {
    new: 'New report',
    open: 'Open report…',
    save: 'Save',
    saveAs: 'Save as…',
    close: 'Close report',
    reportProperties: 'Report properties…',
    toggleVariables: 'Show or hide variables',
    toggleHierarchy: 'Show or hide hierarchy',
    toggleTheme: 'Dark mode / light mode',
    nextTab: 'Next tab',
    prevTab: 'Previous tab',
    moveTabLeft: 'Move tab left',
    moveTabRight: 'Move tab right',
    zoomFitWidth: 'Fit to width',
    zoom100: 'Zoom 100% (actual size)',
    editText: 'Edit textbox text…',
    tablixFilters: 'Tablix filters…',
    insertTextbox: 'Insert textbox',
    insertRectangle: 'Insert rectangle',
    insertLine: 'Insert line',
    insertImage: 'Insert image',
    insertTablix: 'Insert table (Tablix)',
  },
} as const;
