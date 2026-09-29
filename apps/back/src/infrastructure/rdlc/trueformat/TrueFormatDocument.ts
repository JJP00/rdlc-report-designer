import type { XmlDocument } from 'xml-trueformat';
import {
  XmlAttribute,
  XmlCData,
  XmlComment,
  XmlElement,
  XmlProcessing,
  XmlText,
} from 'xml-trueformat';
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

  /**
   * Elementos que venían **autocerrados** (`<TablixMember />`) y se expandieron
   * al añadirles un hijo. `XmlElement` limpia su `selfClosing` al añadir y no lo
   * restaura, así que el byte-exacto se recupera aquí: cuando el nodo vuelve a
   * quedarse sin hijos, se marca otra vez como autocerrado.
   */
  readonly expandedSelfClosing = new WeakSet<XmlElement>();

  /**
   * Indentación (`XmlText`) que precedía a un elemento al desconectarlo. Al
   * reinsertar **el mismo nodo** (undo de eliminar/desprender) se devuelve tal
   * cual: sin esto, reinsertar en un contenedor que se quedó sin elementos
   * perdía la indentación y el undo dejaba de ser byte-exacto.
   */
  readonly removedIndent = new WeakMap<XmlElement, XmlText>();

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
    // `XmlText` guarda el texto **escapado** (igual que `setText`): sin esto un
    // `&` o un `<` en una expresión o URL generarían XML inválido.
    if (text !== undefined) element.children.push(new XmlText(escapeXmlText(text)));
    return new TrueFormatNode(element, null, this.doc);
  }

  clone(): RdlcNode {
    return new TrueFormatNode(cloneElement(this.el), null, this.doc);
  }

  equals(other: RdlcNode): boolean {
    return other instanceof TrueFormatNode && other.el === this.el;
  }

  appendChild(child: RdlcNode): void {
    const wrapped = this.unwrap(child);
    this.markExpanded();
    this.insertFormatted(wrapped);
    wrapped.parentNode = this;
    this.doc.markDirty();
  }

  insertBefore(child: RdlcNode, reference: RdlcNode): void {
    const wrapped = this.unwrap(child);
    const ref = this.unwrap(reference);
    this.markExpanded();
    this.insertFormatted(wrapped, ref.el);
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
    // Quita también el whitespace de indentación que precede al elemento, pero
    // lo **recuerda**: si el nodo vuelve (undo), se reinserta tal cual.
    const previous = this.el.children[index - 1];
    if (previous instanceof XmlText && previous.isWhitespace()) {
      this.el.children.splice(index - 1, 1);
      this.doc.removedIndent.set(wrapped.el, previous);
    }
    wrapped.parentNode = null;
    this.restoreSelfClosing();
    this.doc.markDirty();
  }

  remove(): void {
    this.parentNode?.removeChild(this);
  }

  /* --------------------------- interno ---------------------------- */

  /**
   * Inserta el elemento copiando el formato de los vecinos (`addElement`), o
   * devolviendo la indentación que el nodo tenía cuando se desconectó: en un
   * contenedor que se quedó sin elementos no hay vecino del que copiar y el
   * undo dejaría de ser byte-exacto.
   */
  private insertFormatted(node: TrueFormatNode, reference?: XmlElement): void {
    const indent = this.doc.removedIndent.get(node.el);
    if (!indent) {
      if (reference) this.el.addElement(node.el, { before: reference });
      else this.el.addElement(node.el);
      return;
    }

    // Se inserta [indentación original, nodo] donde lo haría `addElement`.
    let index = reference ? this.el.children.indexOf(reference) : this.el.children.length;
    while (
      index > 0 &&
      this.el.children[index - 1] instanceof XmlText &&
      (this.el.children[index - 1] as XmlText).isWhitespace()
    ) {
      index -= 1;
    }
    this.el.addChild(index, indent, node.el);
  }

  /** Si el elemento venía autocerrado, recuerda que se ha expandido. */
  private markExpanded(): void {
    if (this.el.selfClosing) this.doc.expandedSelfClosing.add(this.el);
  }

  /** Vuelve a autocerrar el elemento si se expandió él solo y ya no tiene hijos. */
  private restoreSelfClosing(): void {
    if (this.el.children.length > 0) return;
    if (!this.doc.expandedSelfClosing.has(this.el)) return;
    this.el.selfClosing = true;
    this.doc.expandedSelfClosing.delete(this.el);
  }

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

/** Copia profunda conservando formato: comillas, whitespace, atributos y orden. */
function cloneElement(source: XmlElement): XmlElement {
  const copy = new XmlElement(
    source.tagName,
    [],
    [],
    source.attrTrailingWs,
    source.selfClosing,
    source.closeTagWs,
  );
  copy.attributes = source.attributes.map(
    (attribute) =>
      new XmlAttribute(
        attribute.name,
        attribute.value,
        attribute.leadingWs,
        attribute.wsBeforeEqual,
        attribute.wsAfterEqual,
        attribute.quote,
        attribute.hasValue,
      ),
  );
  copy.children = source.children.map((child) => {
    if (child instanceof XmlElement) return cloneElement(child);
    if (child instanceof XmlText) return new XmlText(child.text);
    if (child instanceof XmlComment) return new XmlComment(child.comment);
    if (child instanceof XmlCData) return new XmlCData(child.cdata);
    if (child instanceof XmlProcessing) {
      return new XmlProcessing(child.target, child.wsAfterTarget, child.data);
    }
    return child;
  });
  return copy;
}
