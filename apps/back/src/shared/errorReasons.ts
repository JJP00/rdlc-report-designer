/**
 * Motivos estables de error (`reason`): el dominio no compone prosa, cada error
 * lleva un motivo + parámetros y los bordes traducen con los catálogos
 * (`errors.<reason>`).
 *
 * Todo motivo de esta lista tiene mensaje en EN y ES; lo verifica
 * `test/shared/error-reasons.spec.ts`.
 */
export const ERROR_REASONS = [
  /* Fichero / sesión */
  'fileMissing',
  'invalidXml',
  'invalidXmlDetail',
  'unsupportedSchemaVersion',
  'unsupportedSchemaNamespace',
  'unsupportedSchemaUnknown',
  'ioReadFailed',
  'ioWriteFailed',
  'ioWatchFailed',
  'fileChangedOnDisk',
  'sessionUnknown',
  'xsdValidationFailed',
  'unexpected',
  /* Rutas no autorizadas (BUG-50) */
  'pathNotAllowedOpen',
  'pathNotAllowedCreate',
  'pathNotAllowedSave',
  'missingNewReportPath',
  /* Comandos (E_COMMAND_REJECTED / E_INVALID_COMMAND) */
  'itemMissing',
  'clipboardEmpty',
] as const;

export type ErrorReason = (typeof ERROR_REASONS)[number];
