import { left, right, type Either } from '../../../shared/either.js';
import { CommandRejectedError, type DomainError } from '../../../shared/domainError.js';
import { insertCloneAt, pastedGeometry } from './cloneInsert.js';
import { fitClonesIntoRectangle } from './fitClones.js';
import type {
  AppliedEntry,
  CommandContext,
  CommandOutcome,
  DomainCommand,
} from './CommandContext.js';
import { occupiedCell } from './insertItem.js';
import type { InsertCloneCommand } from './internal.js';
import { resolveScope } from './scope.js';

/**
 * Pega un clon del portapapeles (`insertClone`). El nodo origen está
 * desprendido del documento: se clona, se renombra y se inserta en el scope.
 * El inverso lo quita, así que el undo del pegado es un solo paso.
 */
/**
 * Pegado múltiple en un rectángulo: ajusta el lote **entero** (los clones son
 * los nodos de los inversos `removeNode`) y devuelve su geometría final;
 * `undefined` si el destino no es un rectángulo.
 */
export function fitInsertedClones(
  ctx: CommandContext,
  scope: InsertCloneCommand['scope'],
  inverse: readonly DomainCommand[],
): AppliedEntry[] | undefined {
  const container = scope.kind === 'rectangle' ? resolveScope(ctx, scope) : undefined;
  if (!container) return undefined;
  const clones = inverse.flatMap((command) => (command.cmd === 'removeNode' ? [command.node] : []));
  fitClonesIntoRectangle(container, scope, clones);
  return clones.map((clone) => ({
    id: clone.attribute('Name') ?? '',
    values: pastedGeometry(clone),
  }));
}

export function applyInsertClone(
  ctx: CommandContext,
  command: InsertCloneCommand,
  /** Registro de nombres compartido por `insertClones` (pegado múltiple). */
  sharedTaken?: Set<string>,
  /** `insertClones` ajusta el lote entero a la vez, para no romper su disposición. */
  fitToRectangle = true,
): Either<DomainError, CommandOutcome> {
  const container = resolveScope(ctx, command.scope);
  if (!container) {
    return left(CommandRejectedError.of('scopeContainerMissing'));
  }

  const occupied = occupiedCell(container, command.scope);
  if (occupied) return left(CommandRejectedError.of(occupied));

  const { name, clone } = insertCloneAt(
    ctx,
    container,
    command.source,
    command.index,
    undefined,
    sharedTaken,
  );
  if (fitToRectangle) fitClonesIntoRectangle(container, command.scope, [clone]);

  return right({
    inverse: [{ cmd: 'removeNode', node: clone }],
    applied: [{ id: name, values: pastedGeometry(clone) }],
    createdId: name,
  });
}
