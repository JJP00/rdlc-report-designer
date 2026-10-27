import type { RdlcCommand } from '@rdlc-designer/contracts';
import { left, right, type Either } from '../../../shared/either.js';
import { CommandRejectedError, type DomainError } from '../../../shared/domainError.js';
import type { RdlcNode } from '../tree/RdlcNode.js';
import type { CommandContext, CommandOutcome, DomainCommand } from './CommandContext.js';
import { detach, insertAfterTags, restore, setNodeTextChange } from './nodeChanges.js';
import { clearHidden, visibilityValue, writeHidden } from './setVisibility.js';
import { memberAt, tablixHierarchy } from './tablixParts.js';

export type SetMemberVisibilityCommand = Extract<RdlcCommand, { cmd: 'setMemberVisibility' }>;
export type SetMemberToggleItemCommand = Extract<RdlcCommand, { cmd: 'setMemberToggleItem' }>;

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
  const found = findMember(ctx, command.id, command.axis, command.path);
  if (found.isLeft()) return left(found.value);
  const member = found.value;

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

/**
 * Item que alterna la visibilidad del miembro (`Visibility > ToggleItem`).
 * `null` quita el `ToggleItem`; si la `Visibility` se queda sin hijos, se quita
 * también (no se dejan bloques vacíos). La `Hidden` declarada se conserva.
 */
export function applySetMemberToggleItem(
  ctx: CommandContext,
  command: SetMemberToggleItemCommand,
): Either<DomainError, CommandOutcome> {
  const found = findMember(ctx, command.id, command.axis, command.path);
  if (found.isLeft()) return left(found.value);
  const member = found.value;

  const item = command.item?.trim() ?? '';
  const visibility = member.child('Visibility');
  const inverse: DomainCommand[] = [];

  if (item === '') {
    const toggle = visibility?.child('ToggleItem');
    if (!visibility || !toggle) return right({ inverse: [] });
    const togglePosition = detach(toggle);
    inverse.push(restore(togglePosition, toggle));
    if (visibility.children().length === 0) {
      const visibilityPosition = detach(visibility);
      inverse.push(restore(visibilityPosition, visibility));
    }
    return right({ inverse, snapshotOut: true });
  }

  if (!visibility) {
    const created = member.createElement('Visibility');
    created.appendChild(created.createElement('ToggleItem', item));
    // Canónico: `Visibility` va detrás de cabecera/miembros.
    insertAfterTags(member, created, [
      'TablixHeader',
      'TablixMembers',
      'CustomProperties',
      'FixedData',
    ]);
    inverse.push({ cmd: 'removeNode', node: created });
    return right({ inverse, snapshotOut: true });
  }

  const existing = visibility.child('ToggleItem');
  if (existing) {
    if (existing.text() === item) return right({ inverse: [] });
    inverse.push(setNodeTextChange({ node: existing, value: existing.text() ?? '' }));
    existing.setText(item);
    return right({ inverse, snapshotOut: true });
  }

  const created = visibility.createElement('ToggleItem', item);
  visibility.appendChild(created); // detrás de `Hidden` si lo hay (canónico)
  inverse.push({ cmd: 'removeNode', node: created });
  return right({ inverse, snapshotOut: true });
}

/** Miembro apuntado por `path`, con el motivo del rechazo si no existe. */
export function findMember(
  ctx: CommandContext,
  id: string,
  axis: 'row' | 'column',
  path: number[],
): Either<DomainError, RdlcNode> {
  const tablix = ctx.index.get(id);
  if (!tablix) return left(CommandRejectedError.of('itemMissing', { id }));

  const root = tablixHierarchy(tablix, axis);
  if (!root) {
    return left(
      CommandRejectedError.of(
        axis === 'row' ? 'tablixHasNoRowHierarchy' : 'tablixHasNoColumnHierarchy',
        { id },
      ),
    );
  }

  const member = memberAt(root, path);
  if (!member) {
    return left(
      CommandRejectedError.of(axis === 'row' ? 'rowPathMissing' : 'columnPathMissing', {
        path: path.join('.'),
        id,
      }),
    );
  }

  return right(member);
}
