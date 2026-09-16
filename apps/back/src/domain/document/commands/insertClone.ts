import { left, right, type Either } from '../../../shared/either.js';
import { CommandRejectedError, type DomainError } from '../../../shared/domainError.js';
import { insertCloneAt, pastedGeometry } from './cloneInsert.js';
import type { CommandContext, CommandOutcome } from './CommandContext.js';
import type { InsertCloneCommand } from './internal.js';
import { resolveScope } from './scope.js';

/**
 * Pega un clon del portapapeles (`insertClone`). El nodo origen está
 * desprendido del documento: se clona, se renombra y se inserta en el scope.
 * El inverso lo quita, así que el undo del pegado es un solo paso.
 */
export function applyInsertClone(
  ctx: CommandContext,
  command: InsertCloneCommand,
): Either<DomainError, CommandOutcome> {
  const container = resolveScope(ctx, command.scope);
  if (!container) {
    return left(CommandRejectedError.create('No se encontró el contenedor del scope'));
  }

  const { name, clone } = insertCloneAt(ctx, container, command.source, command.index);

  return right({
    inverse: [{ cmd: 'removeNode', node: clone }],
    applied: [{ id: name, values: pastedGeometry(clone) }],
  });
}
