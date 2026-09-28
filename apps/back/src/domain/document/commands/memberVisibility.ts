import type { RdlcCommand } from '@rdlc-designer/contracts';
import { left, right, type Either } from '../../../shared/either.js';
import { CommandRejectedError, type DomainError } from '../../../shared/domainError.js';
import type { RdlcNode } from '../tree/RdlcNode.js';
import type { CommandContext, CommandOutcome, DomainCommand } from './CommandContext.js';
import { clearHidden, visibilityValue, writeHidden } from './setVisibility.js';

export type SetMemberVisibilityCommand = Extract<RdlcCommand, { cmd: 'setMemberVisibility' }>;

/**
 * Visibilidad de un miembro del Tablix (fila, columna o grupo): escribe el
 * `<Visibility><Hidden>` del `TablixMember` apuntado por `path` (índices de
 * `TablixMember` desde la raíz de su jerarquía, como la proyección).
 *
 * Comparte la escritura/borrado con `setVisibility` de items. El miembro no
 * viaja en `applied` (no es un item), así que el comando pide **snapshot** para
 * refrescar la proyección; el undo es byte-exacto (lo comparten los inversos).
 */
export function applySetMemberVisibility(
  ctx: CommandContext,
  command: SetMemberVisibilityCommand,
): Either<DomainError, CommandOutcome> {
  const tablix = ctx.index.get(command.id);
  if (!tablix) return left(CommandRejectedError.create(`No existe el elemento '${command.id}'`));

  const hierarchyTag = command.axis === 'row' ? 'TablixRowHierarchy' : 'TablixColumnHierarchy';
  const root = tablix.child(hierarchyTag)?.child('TablixMembers');
  if (!root) {
    return left(
      CommandRejectedError.create(
        `El Tablix '${command.id}' no tiene jerarquía de ${command.axis === 'row' ? 'filas' : 'columnas'}`,
      ),
    );
  }

  const member = memberAt(root, command.path);
  if (!member) {
    const axis = command.axis === 'row' ? 'fila' : 'columna';
    return left(
      CommandRejectedError.create(
        `No hay ${axis} en la ruta ${command.path.join('.')} del Tablix '${command.id}'`,
      ),
    );
  }

  let inverse: DomainCommand[];
  if (command.hidden === null) {
    inverse = clearHidden(member);
  } else {
    const value = visibilityValue(command.hidden);
    if (value.isLeft()) return left(value.value);
    inverse = writeHidden(member, value.value);
  }

  return right({ inverse, snapshotOut: true });
}

/** Miembro en `path` (índices entre hermanos `TablixMember` en cada nivel). */
function memberAt(root: RdlcNode, path: number[]): RdlcNode | undefined {
  let container = root;
  let member: RdlcNode | undefined;

  for (const index of path) {
    member = container.children('TablixMember')[index];
    if (!member) return undefined;
    const nested = member.child('TablixMembers');
    if (nested) container = nested;
  }

  return member;
}
