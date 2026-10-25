/**
 * Errores del dominio (ES). Los mensajes son **byte a byte** los que la app
 * componía en el dominio antes del i18n; `xsdValidationFailed` usa ya plural
 * ICU real (`problema(s)` → `1 problema` / `N problemas`, guía de microcopy).
 */
export const errors = {
  fallback: {
    E_INVALID_COMMAND: 'Comando no válido',
    E_COMMAND_REJECTED: 'La operación no se pudo completar',
    E_CONFLICT: 'El fichero cambió en disco',
    E_VALIDATION: 'El XML no valida contra el esquema',
    E_NOT_FOUND: 'No se encontró el recurso',
    E_INVALID_XML: 'El fichero no es un XML válido',
    E_UNSUPPORTED_SCHEMA: 'Esquema RDL no soportado',
    E_IO: 'Error de acceso al disco',
    E_UNEXPECTED: 'Error inesperado',
  },
  fileMissing: 'No existe el fichero: {path}',
  invalidXml: 'El fichero no es un XML RDLC válido: {path}',
  invalidXmlDetail: 'El fichero no es un XML RDLC válido: {path} ({detail})',
  unsupportedSchemaVersion:
    'El fichero usa el esquema RDL {version}; esta versión solo edita RDL/RDLC 2016/01. Ábrelo con Report Builder 2016 o superior, guárdalo para actualizarlo a 2016 y vuelve a intentarlo: {path}',
  unsupportedSchemaNamespace:
    "El fichero usa un esquema distinto (''{namespace}''); esta versión solo edita RDL/RDLC 2016/01. Ábrelo con Report Builder 2016 o superior, guárdalo para actualizarlo a 2016 y vuelve a intentarlo: {path}",
  unsupportedSchemaUnknown:
    'El fichero usa sin namespace RDL; esta versión solo edita RDL/RDLC 2016/01. Ábrelo con Report Builder 2016 o superior, guárdalo para actualizarlo a 2016 y vuelve a intentarlo: {path}',
  ioReadFailed: 'Error de E/S al leer {path}',
  ioWriteFailed: 'Error de E/S al escribir {path}',
  ioWatchFailed: 'Error de E/S al vigilar {path}',
  fileChangedOnDisk:
    'El fichero cambió en disco desde la última lectura y no se guardó nada: {path}. Recarga el informe o usa «Guardar como…» para no perder la edición externa.',
  sessionUnknown: 'Sesión desconocida: {sessionId}',
  xsdValidationFailed:
    'El XML no valida contra el esquema RDL 2016/01 ({count, plural, one {1 problema} other {# problemas}}); no se escribió el fichero',
  unexpected: 'Error inesperado',
  pathNotAllowedOpen:
    'Ruta no autorizada para abrir: {path} (usa «Abrir…», los recientes o arrastra el fichero)',
  pathNotAllowedCreate:
    'Ruta no autorizada para crear el informe: {path} (usa el diálogo de guardado)',
  pathNotAllowedSave: 'Ruta no autorizada para guardar: {path} (usa el diálogo de guardado)',
  missingNewReportPath: 'Falta la ruta del informe nuevo',
  itemMissing: "No existe el elemento ''{id}''",
  clipboardEmpty: 'El portapapeles está vacío',
  clipboardHoldsCells:
    'El portapapeles contiene celdas de tabla: selecciona una celda para pegarlas',
  cellsNothingToCopy: 'Las celdas seleccionadas están vacías: no hay nada que copiar',
  pasteCellsNothingFits: 'Las celdas copiadas no caben en la tabla desde esa celda',
  /* Comandos de documento: contenedores, nombres y opciones del item */
  scopeContainerMissing: 'No se encontró el contenedor del scope',
  nameTaken: "Ya existe un elemento o grupo con el nombre ''{name}''",
  itemHasNoContainer: "El elemento ''{id}'' no tiene contenedor",
  headerCellOccupied: 'La celda de cabecera ya tiene contenido',
  cornerCellOccupied: 'La celda de la esquina ya tiene contenido',
  commandNotImplemented: "Comando no implementado: ''{cmd}''",
  noOptionToChange: 'No hay ninguna opción que cambiar',
  itemOptionsUnsupported: "''{id}'' no admite CanGrow ni KeepTogether",
  moveIntoSelf: 'No se puede mover un elemento dentro de sí mismo',
  notATablix: "El elemento ''{id}'' no es un Tablix",
  notAnImage: "''{id}'' no es una imagen",
  notATextbox: "El elemento ''{id}'' no es un Textbox",
  tablixHasNoColumn: "El Tablix ''{id}'' no tiene la columna {column}",
  tablixHasNoRow: "El Tablix ''{id}'' no tiene la fila {row}",
  tablixIncomplete: "El elemento ''{id}'' no es un Tablix completo (rejilla + jerarquías)",
  /* Texto (Textbox, párrafos y runs) */
  nameEmpty: 'El nombre no puede estar vacío',
  paragraphsMissing: "El Textbox ''{id}'' no tiene <Paragraphs>",
  paragraphsEmpty: 'El Textbox necesita al menos un párrafo',
  paragraphWithoutRuns: 'El párrafo {index} no tiene TextRuns: cada párrafo necesita al menos uno',
  runMissing: "El Textbox ''{id}'' no tiene el run [{p}][{r}]",
  styleUnsupported: 'setStyle no soporta todavía: {properties}',
  /* Página y secciones */
  reportSectionMissing: 'El documento no tiene ReportSection',
  bodyMissing: 'El documento no tiene Body',
  /* Visibilidad y filtros */
  visibilityExpressionEmpty: 'La expresión de visibilidad no puede estar vacía',
  filterExpressionEmpty: 'La expresión del filtro no puede estar vacía',
  /* Grupos del Tablix */
  groupExpressionsMultiple:
    'El grupo tiene varias expresiones: edítalas desde «Propiedades del grupo»',
  groupExpressionEmpty: 'La expresión del grupo no puede estar vacía',
  groupNeedsExpression: 'El grupo necesita al menos una expresión',
  groupNameEmpty: 'El nombre del grupo no puede estar vacío',
  sortExpressionEmpty: 'La expresión de ordenación no puede estar vacía',
  notAGroup: 'El miembro no es un grupo: no declara <Group>',
  tablixHasNoRowHierarchy: "El Tablix ''{id}'' no tiene jerarquía de filas",
  tablixHasNoColumnHierarchy: "El Tablix ''{id}'' no tiene jerarquía de columnas",
  rowPathMissing: "No hay fila en la ruta {path} del Tablix ''{id}''",
  columnPathMissing: "No hay columna en la ruta {path} del Tablix ''{id}''",
  rowOutOfTablix: "La fila {row} está fuera del Tablix ''{id}''",
  columnOutOfTablix: "La columna {column} está fuera del Tablix ''{id}''",
  rowHierarchyMemberMissing: "La jerarquía del Tablix ''{id}'' no tiene miembro para la fila {row}",
  columnHierarchyMemberMissing:
    "La jerarquía del Tablix ''{id}'' no tiene miembro para la columna {column}",
  rowIsThatGroup: 'La fila ya es ese grupo',
  columnIsThatGroup: 'La columna ya es ese grupo',
  rowGroupIsLeaf: 'El grupo es una fila (grupo hoja): no se le pueden añadir más filas',
  columnGroupIsLeaf: 'El grupo es una columna (grupo hoja): no se le pueden añadir más columnas',
  rowAlreadyInGroup: 'La fila ya está dentro del grupo',
  columnAlreadyInGroup: 'La columna ya está dentro del grupo',
  onlyContiguousRows: 'Solo se pueden añadir filas contiguas al grupo',
  onlyContiguousColumns: 'Solo se pueden añadir columnas contiguas al grupo',
  rowOnlyLeafInGroup: 'La fila es la única de su grupo: muévela con el grupo',
  columnOnlyLeafInGroup: 'La columna es la única de su grupo: muévela con el grupo',
  groupLeafRangeMissing: 'No se pudo localizar el rango de hojas del grupo',
  groupHeaderHasContent:
    'El grupo tiene una cabecera fuera de la rejilla con contenido: bórrala antes de quitar el grupo',
  rowNotInAGroup: 'La fila no está dentro de un grupo',
  /* Estructura del Tablix: rejilla, borrado y fusión */
  rowCoveredByMergedCells:
    'Todas las columnas de esa posición están cubiertas por celdas fusionadas',
  tablixNeedsRow: 'No se puede dejar el Tablix sin filas',
  tablixNeedsColumn: 'No se puede dejar el Tablix sin columnas',
  rowHasVerticalMerge:
    'La fila contiene celdas fusionadas verticalmente: quita la fusión antes de borrarla',
  columnHasVerticalMerge:
    'La columna contiene celdas fusionadas verticalmente: quita la fusión antes de borrarla',
  gridDoesNotCoverColumn: "La rejilla del Tablix ''{id}'' no cubre la columna {column}",
  mergeNeedsSingleRow: 'Solo se pueden combinar celdas contiguas de la misma fila',
  mergeSingleCell: 'No hay nada que combinar en una sola celda',
  mergeOutOfTablix: "El bloque a combinar sale del Tablix ''{id}''",
  cellMissing: "No hay celda en ({row}, {col}) del Tablix ''{id}''",
  selectionCutsMergedCell: 'La selección corta una celda fusionada',
  selectionHasMergedCells: 'La selección contiene celdas ya fusionadas',
  selectionCrossesVerticalMerge: 'La selección cruza una celda fusionada verticalmente',
  cellNotMerged: 'La celda no está combinada',
} as const;
