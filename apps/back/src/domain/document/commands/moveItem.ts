import type { RdlcCommand } from '@rdlc-designer/contracts';
import { left, right, type Either } from '../../../shared/either.js';
import { CommandRejectedError, type DomainError } from '../../../shared/domainError.js';
import { insertCanonical } from '../geometry/geometry.js';
import { formatLength, type Length } from '../style/Length.js';
import type { RdlcNode } from '../tree/RdlcNode.js';
import type { CommandContext, CommandOutcome, DomainCommand } from './CommandContext.js';
import { ensureBandGeometry } from './bandGeometry.js';
import { growContainerToFit } from './growContainer.js';
import { detach, moveNode, restore, setNodeTextChange, type Detached } from './nodeChanges.js';
import { findScope, resolveScope } from './scope.js';

export type MoveItemCommand = Extract<RdlcCommand, { cmd: 'moveItem' }>;

/**
 * Reparenta/reordena un item (un solo paso de undo): el nodo se mueve al
 * contenedor destino (`body`, `pageHeader/footer`, rectángulo o celda de
 * Tablix) en su índice y, si el drag trae posición, se escriben `Top`/`Left`
 * **relativos al contenedor nuevo**.
 *
 * - Un destino que es el propio item o un descendiente suyo se rechaza (ciclo).
 * - Dentro de una celda el contenido **no declara** `Top`/`Left` (los pone la
 *   celda): se quitan y el undo los reinserta en su sitio exacto.
 * - Al entrar en un rectángulo de tamaño explícito, el contenedor **crece**
 *   para envolver al hijo (como el drag de `setLocation`).
 */
export function applyMoveItem(
  ctx: CommandContext,
  command: MoveItemCommand,
): Either<DomainError, CommandOutcome> {
  const node = ctx.index.get(command.id);
  if (!node) return left(CommandRejectedError.of('itemMissing', { id: command.id }));

  // `resolveScope` crea el contenedor si falta (`ReportItems`/`CellContents`):
  // si lo creó este comando, el inverso lo quita (nada de nodos vacíos).
  const existing = findScope(ctx, command.toScope);
  const container = existing ?? resolveScope(ctx, command.toScope);
  if (!container) {
    return left(CommandRejectedError.of('scopeContainerMissing'));
  }
  const containerCreated = existing === undefined;
  if (isSelfOrDescendant(container, node)) {
    return left(CommandRejectedError.of('moveIntoSelf'));
  }

  const source = node.parent;
  if (!source) return left(CommandRejectedError.of('itemHasNoContainer', { id: command.id }));
  const sourceIndex = source.children().findIndex((child) => child.equals(node));

  const inverse: DomainCommand[] = [];

  // Top/Left relativos al contenedor nuevo.
  if (command.toScope.kind === 'tablixCell') {
    removeChildTag(node, 'Top', inverse);
    removeChildTag(node, 'Left', inverse);
  } else {
    if (command.top) writePosition(node, 'Top', command.top, inverse);
    if (command.left) writePosition(node, 'Left', command.left, inverse);
    // Una banda (cuerpo/cabecera/pie) exige `Width`/`Height` explícitos: RB
    // estira al tamaño de la banda el item que no los declara y lo pinta
    // encima (su fondo blanco tapa la tabla → el informe parece vacío).
    inverse.push(...ensureBandGeometry(node, container, command.top, command.left));
  }

  // Mover: mismo contenedor con índice posterior se corre una posición (el
  // índice del front cuenta el item todavía en su sitio).
  let toIndex = command.toIndex;
  if (source.equals(container) && sourceIndex !== -1 && sourceIndex < toIndex) {
    toIndex -= 1;
  }
  node.remove();
  container.insertChildAt(node, toIndex);

  // El rectángulo destino crece si el hijo se sale de él (los contenedores
  // implícitos 0×0 no se tocan: manda la celda).
  const growth = command.toScope.kind === 'rectangle' ? growContainerToFit(node) : undefined;

  return right({
    inverse: [
      ...(containerCreated ? [{ cmd: 'removeNode', node: container } as const] : []),
      ...(growth ? [growth.inverse] : []),
      ...inverse,
      moveNode(node, source, sourceIndex),
    ],
    ...(growth ? { applied: [growth.applied] } : {}),
  });
}

/** true si `candidate` es el nodo o está dentro de él (mover sería un ciclo). */
function isSelfOrDescendant(candidate: RdlcNode, node: RdlcNode): boolean {
  let current: RdlcNode | null = candidate;
  while (current) {
    if (current.equals(node)) return true;
    current = current.parent;
  }
  return false;
}

/** Escribe `Top`/`Left` con inverso: texto anterior, o quitar si se creó. */
function writePosition(
  node: RdlcNode,
  tag: 'Top' | 'Left',
  length: Length,
  inverse: DomainCommand[],
): void {
  const formatted = formatLength(length);
  const existing = node.child(tag);
  if (existing) {
    const previous = existing.text() ?? '';
    if (previous === formatted) return;
    existing.setText(formatted);
    inverse.push(setNodeTextChange({ node: existing, value: previous }));
    return;
  }
  const created = node.createElement(tag, formatted);
  insertCanonical(node, tag, created);
  inverse.push({ cmd: 'removeNode', node: created });
}

/** Quita un tag hijo del item (el undo lo reinserta en su índice exacto). */
function removeChildTag(node: RdlcNode, tag: string, inverse: DomainCommand[]): void {
  const child = node.child(tag);
  if (!child) return;
  const position: Detached = detach(child);
  inverse.push(restore(position, child));
}
