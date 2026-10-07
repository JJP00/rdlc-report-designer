import type { RdlcDocument } from '../../../domain/document/tree/RdlcDocument.js';

export const RDLC_SERIALIZER_PORT = Symbol('RdlcSerializerPort');

/**
 * Puerto de salida: documento en memoria → string XML.
 * Si el documento no se tocó, el resultado es byte a byte el original.
 */
export interface RdlcSerializerPort {
  /** Identificador del adaptador (para ADR y diagnóstico). */
  readonly name: string;
  serialize(doc: RdlcDocument): string;
}
