import type { RdlcCommand } from '@rdlc-designer/contracts';
import { left, right, type Either } from '../../../shared/either.js';
import { CommandRejectedError, type DomainError } from '../../../shared/domainError.js';
import type { CommandContext, CommandOutcome, DomainCommand } from './CommandContext.js';
import { hasGroupNamed } from './scopeNames.js';

export type SetNameCommand = Extract<RdlcCommand, { cmd: 'setName' }>;

/**
 * Renombra un item (`Name`), sincronizando `<rd:DefaultName>` como al duplicar:
 * solo se actualiza si espejaba el nombre anterior (BC conserva ahí el nombre
 * "original" y no se debe pisar). El nombre debe ser **único** en el documento.
 *
 * Es estructural (el índice por nombre se reconstruye al aplicarlo). El undo es
 * byte-exacto: el atributo vuelve por `setAttribute` y el `rd:DefaultName` por
 * `setNodeText`.
 */
export function applySetName(
  ctx: CommandContext,
  command: SetNameCommand,
): Either<DomainError, CommandOutcome> {
  const node = ctx.index.get(command.id);
  if (!node) return left(CommandRejectedError.create(`No existe el elemento '${command.id}'`));

  const name = command.name.trim();
  if (name === '') {
    return left(CommandRejectedError.create('El nombre no puede estar vacío'));
  }
  if (name === command.id) return right({ inverse: [] });
  // Cambiar solo la caja del propio nombre es el mismo item: permitido (RB
  // resuelve sin distinguir mayúsculas, pero el XML conserva la caja elegida).
  // Los grupos comparten namespace con los items (BUG-11): el nombre nuevo no
  // puede ser el de un grupo existente.
  const collision = ctx.index.has(name) || hasGroupNamed(ctx.root, name);
  if (collision && name.toLowerCase() !== command.id.toLowerCase()) {
    return left(CommandRejectedError.create(`Ya existe un elemento o grupo con el nombre '${name}'`));
  }

  const inverse: DomainCommand[] = [];

  const previous = node.attribute('Name');
  if (previous !== undefined) {
    inverse.push({ cmd: 'setAttribute', node, name: 'Name', value: previous });
  }
  node.setAttribute('Name', name);

  for (const child of node.children()) {
    if (child.tagName === 'rd:DefaultName' && child.text() === command.id) {
      inverse.push({ cmd: 'setNodeText', node: child, value: child.text() ?? '' });
      child.setText(name);
    }
  }

  return right({ inverse, applied: [{ id: command.id, values: { id: name } }] });
}
