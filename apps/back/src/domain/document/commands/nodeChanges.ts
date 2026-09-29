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
