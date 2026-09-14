import { XMLBuilder, XMLParser } from 'fast-xml-parser';

/**
 * Comparador de round-trip (Fase 0) basado en `fast-xml-parser`.
 *
 * Configurado al máximo de fidelidad (`preserveOrder`, `trimValues: false`,
 * `ignoreAttributes: false`), pero por diseño no promete preservar formato.
 * Solo existe para la evidencia del ADR 0001; NO es un adaptador de producción
 * ni implementa los puertos del dominio.
 */
export class FastXmlAdapter {
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

  roundTrip(xml: string): string {
    return this.builder.build(this.parser.parse(xml) as object);
  }
}
