import type { RdlcNode } from '../tree/RdlcNode.js';

/**
 * Índice `Name → nodo` del documento. Es la clave de los comandos: resolver un
 * `id` es O(1) y las operaciones del backend no recorren el árbol.
 */
export class DocumentIndex {
  private readonly byName = new Map<string, RdlcNode>();

  private constructor(root: RdlcNode) {
    const walk = (node: RdlcNode): void => {
      const name = node.attribute('Name');
      if (name) this.byName.set(name, node);
      for (const child of node.children()) walk(child);
    };
    walk(root);
  }

  static build(root: RdlcNode): DocumentIndex {
    return new DocumentIndex(root);
  }

  get(name: string): RdlcNode | undefined {
    return this.byName.get(name);
  }

  has(name: string): boolean {
    return this.byName.has(name);
  }

  names(): string[] {
    return [...this.byName.keys()];
  }

  get size(): number {
    return this.byName.size;
  }
}
