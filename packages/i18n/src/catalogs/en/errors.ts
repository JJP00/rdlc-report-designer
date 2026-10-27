/**
 * Errores del dominio: un mensaje por `reason` (`errors.<reason>`) y un
 * fallback por código (`errors.fallback.<code>`) cuando el motivo no tiene
 * traducción propia.
 *
 * Los motivos se declaran en `apps/back/src/shared/errorReasons.ts` y se
 * verifican con `test/shared/error-reasons.spec.ts`.
 */
export const errors = {
  fallback: {
    E_INVALID_COMMAND: 'Invalid command',
    E_COMMAND_REJECTED: 'The operation could not be completed',
    E_CONFLICT: 'The file changed on disk',
    E_VALIDATION: 'The XML did not validate',
    E_NOT_FOUND: 'Not found',
    E_INVALID_XML: 'The file is not valid XML',
    E_UNSUPPORTED_SCHEMA: 'Unsupported RDL schema',
    E_IO: 'File access error',
    E_UNEXPECTED: 'Unexpected error',
  },
  fileMissing: 'File not found: {path}',
  invalidXml: 'The file is not a valid RDLC XML: {path}',
  invalidXmlDetail: 'The file is not a valid RDLC XML: {path} ({detail})',
  unsupportedSchemaVersion:
    'The file uses RDL schema {version}; this version only edits RDL/RDLC 2016/01. Open it with Report Builder 2016 or later, save it to upgrade it to 2016, and try again: {path}',
  unsupportedSchemaNamespace:
    "The file uses a different schema (''{namespace}''); this version only edits RDL/RDLC 2016/01. Open it with Report Builder 2016 or later, save it to upgrade it to 2016, and try again: {path}",
  unsupportedSchemaUnknown:
    'The file has no RDL namespace; this version only edits RDL/RDLC 2016/01. Open it with Report Builder 2016 or later, save it to upgrade it to 2016, and try again: {path}',
  ioReadFailed: 'I/O error reading {path}',
  ioWriteFailed: 'I/O error writing {path}',
  ioWatchFailed: 'I/O error watching {path}',
  fileChangedOnDisk:
    'The file changed on disk since it was last read, so nothing was saved: {path}. Reload the report or use Save As… so the external edit is not lost.',
  sessionUnknown: 'Unknown session: {sessionId}',
  xsdValidationFailed:
    'The XML does not validate against the RDL 2016/01 schema ({count, plural, one {1 problem} other {# problems}}); the file was not written',
  unexpected: 'Unexpected error',
  pathNotAllowedOpen:
    'Path not allowed to open: {path} (use Open…, recent files, or drop the file)',
  pathNotAllowedCreate: 'Path not allowed to create the report: {path} (use the save dialog)',
  pathNotAllowedSave: 'Path not allowed to save: {path} (use the save dialog)',
  missingNewReportPath: 'Missing path for the new report',
  itemMissing: "Item not found: ''{id}''",
  clipboardEmpty: 'The clipboard is empty',
  clipboardHoldsCells: 'The clipboard holds table cells: select a cell to paste them',
  cellsNothingToCopy: 'The selected cells are empty: nothing to copy',
  pasteCellsNothingFits: 'The copied cells do not fit in the table from that cell',
  /* Document commands: containers, names and item options */
  scopeContainerMissing: 'The scope container was not found',
  nameTaken: "An item or group named ''{name}'' already exists",
  itemHasNoContainer: "Item ''{id}'' has no container",
  headerCellOccupied: 'The header cell already has content',
  cornerCellOccupied: 'The corner cell already has content',
  commandNotImplemented: "Command not implemented: ''{cmd}''",
  noOptionToChange: 'No option to change',
  itemOptionsUnsupported: "''{id}'' does not support this item option",
  moveIntoSelf: 'An item cannot be moved inside itself',
  notATablix: "''{id}'' is not a Tablix",
  notAnImage: "''{id}'' is not an image",
  notATextbox: "''{id}'' is not a textbox",
  tablixHasNoColumn: "Tablix ''{id}'' has no column {column}",
  tablixHasNoRow: "Tablix ''{id}'' has no row {row}",
  tablixIncomplete: "''{id}'' is not a complete Tablix (grid + hierarchies)",
  /* Text (textbox, paragraphs and runs) */
  nameEmpty: 'The name cannot be empty',
  paragraphsMissing: "Textbox ''{id}'' has no <Paragraphs>",
  paragraphsEmpty: 'A textbox needs at least one paragraph',
  paragraphWithoutRuns: 'Paragraph {index} has no TextRuns: every paragraph needs at least one',
  runMissing: "Textbox ''{id}'' has no run [{p}][{r}]",
  styleUnsupported: 'setStyle does not support these properties yet: {properties}',
  /* Page and sections */
  reportSectionMissing: 'The document has no ReportSection',
  bodyMissing: 'The document has no Body',
  /* Visibility and filters */
  visibilityExpressionEmpty: 'The visibility expression cannot be empty',
  filterExpressionEmpty: 'The filter expression cannot be empty',
  /* Tablix groups */
  groupExpressionsMultiple: 'The group has multiple expressions: edit them in Group Properties',
  groupExpressionEmpty: 'The group expression cannot be empty',
  groupResetPageNumberNeedsBreak: 'Reset page number needs a page break on the group',
  groupNeedsExpression: 'The group needs at least one expression',
  groupNameEmpty: 'The group name cannot be empty',
  sortExpressionEmpty: 'The sort expression cannot be empty',
  notAGroup: 'The member is not a group: it declares no <Group>',
  tablixHasNoRowHierarchy: "Tablix ''{id}'' has no row hierarchy",
  tablixHasNoColumnHierarchy: "Tablix ''{id}'' has no column hierarchy",
  rowPathMissing: "No row at path {path} in Tablix ''{id}''",
  columnPathMissing: "No column at path {path} in Tablix ''{id}''",
  rowOutOfTablix: "Row {row} is outside Tablix ''{id}''",
  columnOutOfTablix: "Column {column} is outside Tablix ''{id}''",
  rowHierarchyMemberMissing: "The hierarchy of Tablix ''{id}'' has no member for row {row}",
  columnHierarchyMemberMissing:
    "The hierarchy of Tablix ''{id}'' has no member for column {column}",
  rowIsThatGroup: 'The row is already that group',
  columnIsThatGroup: 'The column is already that group',
  rowGroupIsLeaf: 'The group is a leaf row: more rows cannot be added to it',
  columnGroupIsLeaf: 'The group is a leaf column: more columns cannot be added to it',
  rowAlreadyInGroup: 'The row is already inside the group',
  columnAlreadyInGroup: 'The column is already inside the group',
  onlyContiguousRows: 'Only contiguous rows can be added to the group',
  onlyContiguousColumns: 'Only contiguous columns can be added to the group',
  rowOnlyLeafInGroup: 'The row is the only one in its group: move it with the group',
  columnOnlyLeafInGroup: 'The column is the only one in its group: move it with the group',
  groupLeafRangeMissing: 'The leaf range of the group could not be located',
  groupHeaderHasContent:
    'The group has a header outside the grid with content: delete it before removing the group',
  rowNotInAGroup: 'The row is not inside a group',
  /* Tablix structure: grid, deletion and merge */
  rowCoveredByMergedCells: 'All columns at that position are covered by merged cells',
  tablixNeedsRow: 'The Tablix cannot be left without rows',
  tablixNeedsColumn: 'The Tablix cannot be left without columns',
  rowHasVerticalMerge:
    'The row contains vertically merged cells: unmerge them before deleting the row',
  columnHasVerticalMerge:
    'The column contains vertically merged cells: unmerge them before deleting the column',
  gridDoesNotCoverColumn: "The grid of Tablix ''{id}'' does not cover column {column}",
  mergeNeedsSingleRow: 'Only contiguous cells in the same row can be merged',
  mergeSingleCell: 'There is nothing to merge in a single cell',
  mergeOutOfTablix: "The block to merge falls outside Tablix ''{id}''",
  cellMissing: "No cell at ({row}, {col}) in Tablix ''{id}''",
  selectionCutsMergedCell: 'The selection cuts across a merged cell',
  selectionHasMergedCells: 'The selection contains already merged cells',
  selectionCrossesVerticalMerge: 'The selection crosses a vertically merged cell',
  cellNotMerged: 'The cell is not merged',
} as const;
