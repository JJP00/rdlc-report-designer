import { XMLBuilder, XMLParser } from 'fast-xml-parser';
import type { RdlcParserPort } from '../../application/ports/out/RdlcParserPort.js';
import type { RdlcSerializerPort } from '../../application/ports/out/RdlcSerializerPort.js';
import { asRdlcDocument, type RdlcDocument } from '../../domain/document/tree/RdlcDocument.js';

/**
 * Adaptador de comparación (Fase 0) basado en `fast-xml-parser`.
 *
 * Configurado al máximo de fidelidad (`preserveOrder`, `trimValues: false`,
 * `ignoreAttributes: false`), pero por diseño no promete preservar formato:
 * whitespace, comillas, atributos booleanos y self-closing se normalizan.
 * Solo existe para evidenciar la decisión del ADR; NO es un adaptador de
 * producción.
 */
export class FastXmlAdapter implements RdlcParserPort, RdlcSerializerPort {
  readonly name = 'fast-xml-parser';

  private readonly parser = new XMLParser({
    preserveOrder: true,
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    trimValues: false,
    parseAttributeValue: false,
    parseTagValue: false,
    commentPropName: '#comment',
    cdataPropName: '#cdata',
    processEntities: false,
    allowBooleanAttributes: true,
  });

  private readonly builder = new XMLBuilder({
    preserveOrder: true,
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    commentPropName: '#comment',
    cdataPropName: '#cdata',
    format: false,
    suppressEmptyNode: false,
    suppressBooleanAttributes: false,
    processEntities: false,
  });

  parse(xml: string): RdlcDocument {
    return asRdlcDocument(this.parser.parse(xml));
  }

  serialize(doc: RdlcDocument): string {
    return this.builder.build(doc as object);
  }
}
