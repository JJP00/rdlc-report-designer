import type { XmlDocument } from 'xml-trueformat';
import { XmlElement, XmlText } from 'xml-trueformat';
import type { RdlcDocument, RdlcNode } from '../../../domain/document/tree/RdlcNode.js';

/**
 * Implementación del árbol de dominio sobre `xml-trueformat`.
 *
 * Los nodos son envoltorios *lazy* (sin copia): leer/escribir no duplica
 * memoria y cualquier mutación marca el documento como dirty. Los nodos
 * nuevos adoptan el formato de sus vecinos (`XmlElement.addElement`).
 */
export class TrueFormatDocument implements RdlcDocument {
  readonly root: TrueFormatNode;
  private dirty = false;

  constructor(private readonly document: XmlDocument) {
    this.root = new TrueFormatNode(document.getRootElement(), null, this);
  }

  isDirty(): boolean {
    return this.dirty;
  }

  markClean(): void {
    this.dirty = false;
  }

  markDirty(): void {
    this.dirty = true;
  }

  /** Serializa el documento completo (parcheo quirúrgico: intacto si no hubo mutaciones). */
  toXml(): string {
    return this.document.toString();
  }

  /** Escape hatch de infraestructura (adaptador de proyección F0). */
  raw(): XmlDocument {
    return this.document;
  }
}

export class TrueFormatNode implements RdlcNode {
  constructor(
    private readonly el: XmlElement,
    private parentNode: TrueFormatNode | null,
    private readonly doc: TrueFormatDocument,
  ) {}

  get tagName(): string {
    return this.el.tagName;
  }

  get parent(): RdlcNode | null {
    return this.parentNode;
  }

  /* --------------------------- lectura ---------------------------- */

  attribute(name: string): string | undefined {
    return this.el.getAttributeValue(name);
  }

  child(tagName: string): RdlcNode | undefined {
    const found = this.el.getFirstElementByName(tagName);
    return found ? new TrueFormatNode(found, this, this.doc) : undefined;
  }

  children(tagName?: string): RdlcNode[] {
    return this.elementChildren()
      .filter((child) => tagName === undefined || child.tagName === tagName)
      .map((child) => new TrueFormatNode(child, this, this.doc));
  }

  text(): string | undefined {
    const textNode = this.el.children.find((child): child is XmlText => child instanceof XmlText);
    return textNode?.unescapeText();
  }

  /* --------------------------- escritura -------------------------- */

  setAttribute(name: string, value: string): void {
    this.el.setAttributeValue(name, value);
    this.doc.markDirty();
  }

  setText(value: string): void {
    // Escapado propio (no el de la librería): `"` y `'` se dejan tal cual,
    // como hacen los ficheros de BC; así los comandos son byte-fieles al
    // deshacer textos con comillas (p. ej. el bloque <Code> VB).
    const escaped = escapeXmlText(value);
    const textNode = this.el.children.find((child): child is XmlText => child instanceof XmlText);
    if (textNode) textNode.text = escaped;
    else this.el.children.push(new XmlText(escaped));
    this.doc.markDirty();
  }

  createElement(tagName: string, text?: string): RdlcNode {
    const element = new XmlElement(tagName);
    if (text !== undefined) element.children.push(new XmlText(text));
    return new TrueFormatNode(element, null, this.doc);
  }

  appendChild(child: RdlcNode): void {
    const wrapped = this.unwrap(child);
    this.el.addElement(wrapped.el);
    wrapped.parentNode = this;
    this.doc.markDirty();
  }

  insertBefore(child: RdlcNode, reference: RdlcNode): void {
    const wrapped = this.unwrap(child);
    const ref = this.unwrap(reference);
    this.el.addElement(wrapped.el, { before: ref.el });
    wrapped.parentNode = this;
    this.doc.markDirty();
  }

  insertChildAt(child: RdlcNode, index: number): void {
    const siblings = this.elementChildren();
    const reference = siblings[index];
    if (reference === undefined) {
      this.appendChild(child);
      return;
    }
    this.insertBefore(child, new TrueFormatNode(reference, this, this.doc));
  }

  removeChild(child: RdlcNode): void {
    const wrapped = this.unwrap(child);
    const index = this.el.children.indexOf(wrapped.el);
    if (index === -1) return;
    this.el.children.splice(index, 1);
    // Quita también el whitespace de indentación que precede al elemento.
    const previous = this.el.children[index - 1];
    if (previous instanceof XmlText && previous.isWhitespace()) {
      this.el.children.splice(index - 1, 1);
    }
    this.doc.markDirty();
  }

  remove(): void {
    this.parentNode?.removeChild(this);
  }

  /* --------------------------- interno ---------------------------- */

  private elementChildren(): XmlElement[] {
    return this.el.children.filter((child): child is XmlElement => child instanceof XmlElement);
  }

  private unwrap(node: RdlcNode): TrueFormatNode {
    if (!(node instanceof TrueFormatNode)) {
      throw new Error('El nodo pertenece a otro documento');
    }
    return node;
  }
}

/** Escapa lo imprescindible en un nodo de texto (deja `"` y `'` crudas). */
function escapeXmlText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
