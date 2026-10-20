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
  pathNotAllowedOpen: 'Path not allowed to open: {path} (use Open…, recent files, or drop the file)',
  pathNotAllowedCreate:
    'Path not allowed to create the report: {path} (use the save dialog)',
  pathNotAllowedSave: 'Path not allowed to save: {path} (use the save dialog)',
  missingNewReportPath: 'Missing path for the new report',
  itemMissing: "Item not found: ''{id}''",
  clipboardEmpty: 'The clipboard is empty',
} as const;
