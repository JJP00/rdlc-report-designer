import type { RdlcNode } from '../tree/RdlcNode.js';
import type { DomainCommand } from './CommandContext.js';

/**
 * Operaciones de nodo compartidas por los comandos que mueven/quitan/reinsertan
 * subárboles para que el undo sea **byte-exacto**:
 *
 * - `detach`: desconecta el nodo recordando contenedor e índice.
 * - `restore`: comando interno (`restoreNode`) que lo reinserta en su sitio.
 * - `setNodeTextChange`: comando interno (`setNodeText`) con el texto anterior.
 */

export interface TextChange {
  node: RdlcNode;
  value: string;
}

export interface Detached {
  container: RdlcNode;
  index: number;
}

/** Desconecta el nodo recordando dónde volver a insertarlo. */
export function detach(node: RdlcNode): Detached {
  const container = node.parent;
  if (!container) throw new Error(`El nodo '${node.tagName}' no tiene contenedor`);
  const index = container.children().findIndex((child) => child.equals(node));
  node.remove();
  return { container, index };
}

export function restore(position: Detached, node: RdlcNode): DomainCommand {
  return {
    cmd: 'restoreNode',
    node,
    container: position.container,
    index: position.index,
    name: node.attribute('Name') ?? node.tagName,
  };
}

export function setNodeTextChange(change: TextChange): DomainCommand {
  return { cmd: 'setNodeText', node: change.node, value: change.value };
}

/** Comando interno para mover un nodo a otro contenedor (undo de elevar filas). */
export function moveNode(node: RdlcNode, container: RdlcNode, index: number): DomainCommand {
  return { cmd: 'moveNode', node, container, index };
}

/**
 * Inserta el nodo justo después del último hijo con alguno de esos tags
 * (posición canónica cuando el XSD no impone un orden estricto).
 */
export function insertAfterTags(
  parent: RdlcNode,
  node: RdlcNode,
  tags: string[],
  fallback = 0,
): void {
  let index = fallback;
  parent.children().forEach((child, position) => {
    if (tags.includes(child.tagName)) index = position + 1;
  });
  parent.insertChildAt(node, index);
}
