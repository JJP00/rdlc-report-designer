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
} as const;
