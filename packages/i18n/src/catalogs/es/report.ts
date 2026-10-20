/**
 * Propiedades del informe: página, código VB y variables (ES).
 *
 * Valores **byte a byte** los que la app mostraba con los textos hardcodeados,
 * salvo los recortes acordados en el barrido de microcopy (`code.note`, guía
 * 0006 §inventario); `region.empty` es un «Keep» y no se recorta.
 */
export const report = {
  properties: {
    title: 'Propiedades del informe',
    subtitle: 'Configuración de página y código VB del informe ({name}).',
  },
  tab: {
    page: 'Configurar página',
    code: 'Código',
  },
  apply: 'Aplicar',
  applyShortcut: 'Aplicar (Ctrl+Intro)',
  code: {
    note: 'Bloque <Code> VB (funciones Code.): se reemplaza como un todo, en un paso de undo.',
    aria: 'Código VB del informe',
  },
  paper: {
    label: 'Papel',
    size: 'Tamaño',
    sizeAria: 'Tamaño de papel',
    orientation: 'Orientación',
    orientationAria: 'Orientación del papel',
    portrait: 'Vertical',
    landscape: 'Horizontal',
    custom: 'Custom',
  },
  page: {
    width: 'Ancho (cm)',
    height: 'Alto (cm)',
    margins: 'Márgenes (cm)',
    headerFooter: 'Encabezado y pie',
    body: 'Cuerpo',
    bodyWidth: 'Ancho del cuerpo (cm)',
    bodyHeight: 'Alto del cuerpo (cm)',
  },
  region: {
    headerTitle: 'Encabezado',
    headerName: 'encabezado',
    footerTitle: 'Pie',
    footerName: 'pie',
    remove: 'Quitar',
    insert: 'Insertar',
    removeAria: 'Quitar el {name}',
    insertAria: 'Insertar el {name}',
    removeTitle: 'Quitar el {name} del informe (se puede deshacer)',
    insertTitle: 'Insertar un {name} nuevo',
    height: 'Alto del {name} (cm)',
    firstPage: 'Primera página',
    lastPage: 'Última página',
    printFirstAria: 'Imprimir el {name} en la primera página',
    printLastAria: 'Imprimir el {name} en la última página',
    empty: 'Sin {name}. Pulsa «Insertar» y luego «Aplicar» para añadirlo.',
  },
  variables: {
    title: 'Variables',
    expandAll: 'Expandir todo',
    collapseAll: 'Colapsar todo',
    searchPlaceholder: 'Buscar campo, parámetro, función…',
    searchAria: 'Buscar variables',
    noResults: 'Sin resultados.',
    groupFields: 'Campos (Fields!)',
    groupParameters: 'Parámetros',
    groupFunctions: 'Funciones Code.',
    groupGlobals: 'Globals!',
    groupUser: 'User!',
  },
} as const;
