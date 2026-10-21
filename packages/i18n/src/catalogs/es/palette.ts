/**
 * Paleta de comandos (Ctrl+K) (ES).
 *
 * Valores **byte a byte** los que la app mostraba con los textos hardcodeados;
 * «Deshacer»/«Rehacer» reutilizan `common.*` (coinciden exactamente).
 */
export const palette = {
  dialog: {
    title: 'Paleta de comandos',
    description: 'Busca elementos del informe, variables o acciones del editor',
  },
  search: {
    placeholder: 'Buscar elemento, variable o acción…',
    empty: 'Sin resultados.',
  },
  section: {
    actions: 'Acciones',
    elements: 'Elementos del informe',
    variables: 'Variables',
  },
  category: {
    report: 'Informe',
    view: 'Ver',
    tabs: 'Pestañas',
    edit: 'Edición',
    insert: 'Insertar',
  },
  action: {
    new: 'Nuevo informe',
    open: 'Abrir informe…',
    save: 'Guardar',
    saveAs: 'Guardar como…',
    close: 'Cerrar informe',
    reportProperties: 'Propiedades del informe…',
    toggleVariables: 'Mostrar u ocultar variables',
    toggleHierarchy: 'Mostrar u ocultar jerarquía',
    toggleTheme: 'Modo oscuro / modo claro',
    nextTab: 'Pestaña siguiente',
    prevTab: 'Pestaña anterior',
    moveTabLeft: 'Mover pestaña a la izquierda',
    moveTabRight: 'Mover pestaña a la derecha',
    zoomFitWidth: 'Ajustar al ancho',
    zoom100: 'Zoom 100 % (tamaño real)',
    editText: 'Editar el texto del textbox…',
    tablixFilters: 'Filtros del Tablix…',
    insertTextbox: 'Insertar textbox',
    insertRectangle: 'Insertar rectángulo',
    insertLine: 'Insertar línea',
    insertImage: 'Insertar imagen',
    insertTablix: 'Insertar tabla (Tablix)',
  },
} as const;
