import type { RdlcDocument } from '../../../domain/document/tree/RdlcDocument.js';

export const RDLC_PARSER_PORT = Symbol('RdlcParserPort');

/**
 * Puerto de salida: string XML → documento en memoria (lossless).
 * Se lanza `InvalidXmlError` del dominio si el XML no es parseable.
 */
export interface RdlcParserPort {
  /** Identificador del adaptador (para ADR y diagnóstico). */
  readonly name: string;
  parse(xml: string): RdlcDocument;
}
