import type { RdlcCommand } from '@rdlc-designer/contracts';
import { left, right, type Either } from '../../../shared/either.js';
import { CommandRejectedError, type DomainError } from '../../../shared/domainError.js';
import type { CommandContext, CommandOutcome } from './CommandContext.js';

export type DeleteItemCommand = Extract<RdlcCommand, { cmd: 'deleteItem' }>;

/**
 * Elimina el elemento. El inverso (`restoreNode`, interno) reinserta el mismo
 * subárbol en su sitio: no hace falta serializar nada.
 */
export function applyDeleteItem(
  ctx: CommandContext,
  command: DeleteItemCommand,
): Either<DomainError, CommandOutcome> {
  const node = ctx.index.get(command.id);
  if (!node) return left(CommandRejectedError.create(`No existe el elemento '${command.id}'`));

  const container = node.parent;
  if (!container) {
    return left(CommandRejectedError.create(`El elemento '${command.id}' no tiene contenedor`));
  }

  const index = container.children().findIndex((sibling) => sibling.equals(node));
  node.remove();

  return right({
    inverse: [{ cmd: 'restoreNode', node, container, index, name: command.id }],
  });
}
