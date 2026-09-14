declare const rdlcDocumentBrand: unique symbol;

/**
 * Documento RDLC en memoria.
 *
 * F0 (spike): tipo opaco. Los adaptadores guardan dentro su representación
 * interna (por ejemplo el modelo de `xml-trueformat`) mientras se valida el
 * round-trip byte a byte.
 *
 * F1: se sustituye por el aggregate root con árbol genérico de nodos propio
 * —cada nodo conserva texto fuente, atributos en orden original, comentarios
 * y whitespace—. El tipo se mantiene opaco en los puertos para que el dominio
 * nunca dependa de la librería XML elegida (esa vive en infraestructura).
 */
export interface RdlcDocument {
  readonly [rdlcDocumentBrand]: 'RdlcDocument';
}

/** Marca un valor (representación interna de un adaptador) como documento RDLC. */
export function asRdlcDocument(value: unknown): RdlcDocument {
  return value as RdlcDocument;
}
