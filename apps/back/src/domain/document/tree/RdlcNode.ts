/**
 * Árbol de nodos del dominio (interfaz propia; la implementación vive en
 * infraestructura, hoy sobre `xml-trueformat`).
 *
 * Semántica lossless: toda mutación conserva el formato del resto del
 * documento; los nodos nuevos adoptan el formato de sus vecinos. El texto de
 * un elemento se maneja con `text()` / `setText()` (no se exponen nodos de
 * texto: los comandos trabajan con "el contenido" del elemento).
 */
export interface RdlcNode {
  readonly tagName: string;
  readonly parent: RdlcNode | null;

  /* --------------------------- lectura ---------------------------- */

  attribute(name: string): string | undefined;
  /** Primer hijo elemento con ese tag. */
  child(tagName: string): RdlcNode | undefined;
  /** Hijos elemento, opcionalmente filtrados por tag. */
  children(tagName?: string): RdlcNode[];
  /** Texto directo del elemento (primer nodo de texto), sin escapar. */
  text(): string | undefined;

  /* --------------------------- escritura -------------------------- */

  setAttribute(name: string, value: string): void;
  setText(value: string): void;

  /** Crea un elemento huérfano listo para insertar (mismo tipo de documento). */
  createElement(tagName: string, text?: string): RdlcNode;

  appendChild(child: RdlcNode): void;
  insertBefore(child: RdlcNode, reference: RdlcNode): void;
  /** Inserta como n-ésimo hijo elemento (más allá del final = append). */
  insertChildAt(child: RdlcNode, index: number): void;
  removeChild(child: RdlcNode): void;
  /** Elimina este nodo del padre. */
  remove(): void;
}

/** Documento RDLC en memoria. */
export interface RdlcDocument {
  readonly root: RdlcNode;
  /** true si algo se mutó desde el último parseo/guardado. */
  isDirty(): boolean;
  markClean(): void;
}
