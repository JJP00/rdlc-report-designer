export const XML_SCHEMA_VALIDATOR_PORT = Symbol('XmlSchemaValidatorPort');

export interface SchemaValidationResult {
  valid: boolean;
  /** Problemas legibles (vacío si `valid`). */
  problems: string[];
}

/**
 * Puerto de salida: validación de un XML contra el XSD oficial RDL 2016/01.
 *
 * Se usa en los bordes del ciclo de vida del fichero:
 * - al **importar**: informa (aviso, no bloquea: el usuario puede querer
 *   arreglar un fichero roto con la herramienta);
 * - al **exportar**: bloquea la escritura (BC rompe con un XML inválido).
 */
export interface XmlSchemaValidatorPort {
  validate(xml: string): SchemaValidationResult;
  /** Carga perezosa del esquema (primera validación). */
  warmUp(): void;
}
