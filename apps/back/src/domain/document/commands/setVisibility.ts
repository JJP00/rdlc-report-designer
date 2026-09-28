import type { RdlcCommand } from '@rdlc-designer/contracts';
import { left, right, type Either } from '../../../shared/either.js';
import { CommandRejectedError, type DomainError } from '../../../shared/domainError.js';
import { childOrCreate } from '../geometry/geometry.js';
import type { RdlcNode } from '../tree/RdlcNode.js';
import type { CommandContext, CommandOutcome, DomainCommand } from './CommandContext.js';

export type SetVisibilityCommand = Extract<RdlcCommand, { cmd: 'setVisibility' }>;

interface Detached {
  container: RdlcNode;
  index: number;
}

/**
 * Visibilidad del item (`<Visibility><Hidden>`):
 * - `true`/`false`: literal.
 * - expresión (`=IIF(...)`): tal cual (en diseño no se evalúa, como en RB).
 * - `null`: quita el `Hidden`; si el `Visibility` se queda vacío, se quita
 *   también el bloque (así el fichero no acumula nodos muertos).
 *
 * El `Hidden` debe ir **antes** de un `ToggleItem` (orden del XSD). El undo es
 * byte-exacto: lo creado se quita y lo existente vuelve con su texto anterior.
 *
 * Las filas/columnas/grupos de un Tablix usan el mismo esquema sobre
 * `TablixMember` (`setMemberVisibility`), así que la escritura y el borrado
 * viven aquí y se comparten.
 */
export function applySetVisibility(
  ctx: CommandContext,
  command: SetVisibilityCommand,
): Either<DomainError, CommandOutcome> {
  const node = ctx.index.get(command.id);
  if (!node) return left(CommandRejectedError.create(`No existe el elemento '${command.id}'`));

  if (command.hidden === null) {
    return right({ inverse: clearHidden(node), applied: [{ id: command.id, values: {} }] });
  }

  const value = visibilityValue(command.hidden);
  if (value.isLeft()) return left(value.value);

  return right({
    inverse: writeHidden(node, value.value),
    applied: [{ id: command.id, values: { hidden: command.hidden } }],
  });
}

/** Normaliza el valor del contrato a texto RDL; una expresión vacía se rechaza. */
export function visibilityValue(hidden: boolean | string): Either<DomainError, string> {
  const value = typeof hidden === 'boolean' ? String(hidden) : hidden;
  if (value.trim() === '') {
    return left(CommandRejectedError.create('La expresión de visibilidad no puede estar vacía'));
  }
  return right(value);
}

/** Escribe/actualiza `<Visibility><Hidden>` (creando lo que falte). */
export function writeHidden(node: RdlcNode, value: string): DomainCommand[] {
  const visibilityExisted = node.child('Visibility') !== undefined;
  const visibility = childOrCreate(node, 'Visibility');
  const hidden = visibility.child('Hidden');

  if (hidden) {
    const previous = hidden.text() ?? '';
    hidden.setText(value);
    return [{ cmd: 'setNodeText', node: hidden, value: previous }];
  }

  const created = visibility.createElement('Hidden', value);
  const toggle = visibility.child('ToggleItem');
  if (toggle) visibility.insertBefore(created, toggle);
  else visibility.appendChild(created);

  // Si el `Visibility` también nació aquí, basta con quitar el padre en el
  // undo (se lleva el `Hidden` consigo).
  return [{ cmd: 'removeNode', node: visibilityExisted ? created : visibility }];
}

/** Quita la visibilidad declarada (solo el `Hidden`, o el bloque si queda vacío). */
export function clearHidden(node: RdlcNode): DomainCommand[] {
  const visibility = node.child('Visibility');
  const hidden = visibility?.child('Hidden');
  if (!visibility || !hidden) return [];

  if (visibility.child('ToggleItem')) {
    const position = detach(hidden);
    return [restore(position, hidden)];
  }

  const position = detach(visibility);
  return [restore(position, visibility)];
}

function detach(node: RdlcNode): Detached {
  const container = node.parent;
  if (!container) throw new Error(`El nodo '${node.tagName}' no tiene contenedor`);
  const index = container.children().findIndex((child) => child.equals(node));
  node.remove();
  return { container, index };
}

function restore(position: Detached, node: RdlcNode): DomainCommand {
  return {
    cmd: 'restoreNode',
    node,
    container: position.container,
    index: position.index,
    name: node.tagName,
  };
}
