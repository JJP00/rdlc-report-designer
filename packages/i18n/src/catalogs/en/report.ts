/**
 * Propiedades del informe: configuración de página, código VB y variables
 * (barrido i18n: módulo «panels-image-report»).
 *
 * Los presets de papel (`A4`, `Letter`…), las unidades (`cm`) y los atajos no
 * se traducen; `{name}` es el nombre del informe o de la banda (encabezado/pie).
 */
export const report = {
  properties: {
    title: 'Report properties',
    subtitle: 'Page setup and VB code for the report ({name}).',
  },
  tab: {
    page: 'Page setup',
    code: 'Code',
  },
  apply: 'Apply',
  applyShortcut: 'Apply (Ctrl+Enter)',
  code: {
    note: 'VB <Code> block (Code. functions): replaced as a whole, in a single undo step.',
    aria: 'Report VB code',
  },
  paper: {
    label: 'Paper',
    size: 'Size',
    sizeAria: 'Paper size',
    orientation: 'Orientation',
    orientationAria: 'Paper orientation',
    portrait: 'Portrait',
    landscape: 'Landscape',
    custom: 'Custom',
  },
  page: {
    width: 'Width (cm)',
    height: 'Height (cm)',
    margins: 'Margins (cm)',
    headerFooter: 'Header and footer',
    body: 'Body',
    bodyWidth: 'Body width (cm)',
    bodyHeight: 'Body height (cm)',
  },
  region: {
    headerTitle: 'Page header',
    headerName: 'page header',
    footerTitle: 'Page footer',
    footerName: 'page footer',
    remove: 'Remove',
    insert: 'Insert',
    removeAria: 'Remove the {name}',
    insertAria: 'Insert the {name}',
    removeTitle: 'Remove the {name} from the report (can be undone)',
    insertTitle: 'Insert a new {name}',
    height: 'Height of the {name} (cm)',
    firstPage: 'First page',
    lastPage: 'Last page',
    printFirstAria: 'Print the {name} on the first page',
    printLastAria: 'Print the {name} on the last page',
    empty: 'No {name}. Select "Insert", then "Apply" to add it.',
  },
  variables: {
    title: 'Variables',
    expandAll: 'Expand all',
    collapseAll: 'Collapse all',
    searchPlaceholder: 'Search field, parameter, function…',
    searchAria: 'Search variables',
    noResults: 'No results.',
    groupFields: 'Dataset fields (Fields!)',
    groupParameters: 'Parameters',
    groupFunctions: 'Code. functions',
    groupGlobals: 'Globals!',
    groupUser: 'User!',
  },
} as const;
