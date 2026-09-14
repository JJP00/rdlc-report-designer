import { XmlDocument, XmlParser } from 'xml-trueformat';
import type { RdlcParserPort } from '../../application/ports/out/RdlcParserPort.js';
import type { RdlcSerializerPort } from '../../application/ports/out/RdlcSerializerPort.js';
import { asRdlcDocument, type RdlcDocument } from '../../domain/document/tree/RdlcDocument.js';

/**
 * Adaptador lossless basado en `xml-trueformat` (MIT).
 *
 * Retiene whitespace, saltos de línea, comentarios, comillas de atributos,
 * orden de atributos, nodos self-closing, CDATA y la declaración XML.
 * Candidato elegido en la Fase 0 (ver docs/adr/0001-parser-xml-lossless.md).
 */
export class TrueFormatXmlAdapter implements RdlcParserPort, RdlcSerializerPort {
  readonly name = 'xml-trueformat';

  parse(xml: string): RdlcDocument {
    return asRdlcDocument(XmlParser.parse(xml));
  }

  serialize(doc: RdlcDocument): string {
    return (doc as unknown as XmlDocument).toString();
  }
}
