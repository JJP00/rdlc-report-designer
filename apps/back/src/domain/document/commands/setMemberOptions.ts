import type { RdlcCommand } from '@rdlc-designer/contracts';
import { left, right, type Either } from '../../../shared/either.js';
import { CommandRejectedError, type DomainError } from '../../../shared/domainError.js';
import type { RdlcNode } from '../tree/RdlcNode.js';
import type { CommandContext, CommandOutcome, DomainCommand } from './CommandContext.js';
import { detach, insertAfterTags, restore, setNodeTextChange } from './nodeChanges.js';
import { findMember } from './memberVisibility.js';

export type SetMemberOptionsCommand = Extract<RdlcCommand, { cmd: 'setMemberOptions' }>;

type MemberTag = 'RepeatOnNewPage' | 'KeepWithGroup' | 'KeepTogether';

/**
 * Orden de los hijos de `TablixMember` según `TablixMemberType` del XSD RDL 2016
 * (`ReportDefinition2016.xsd`). Ese tipo es un `choice` sin orden estricto, pero
 * se escribe en este orden para ser canónico; las etiquetas nuevas se insertan
 * tras todas las que las preceden en esta lista.
 */
const MEMBER_ORDER = [
  'Group',
  'SortExpressions',
  'TablixHeader',
  'TablixMembers',
  'CustomProperties',
  'FixedData',
  'Visibility',
  'HideIfNoRows',
  'RepeatOnNewPage',
  'KeepWithGroup',
  'DataElementName',
  'DataElementOutput',
  'KeepTogether',
];

/**
 * Opciones de fila/columna del Tablix (`RepeatOnNewPage`, `KeepWithGroup`,
 * `KeepTogether`) sobre el `TablixMember` apuntado por `path`. Funciona también
 * con miembros **estáticos** (sin `Group`), igual que `setMemberVisibility`.
 *
 * Como en `setItemOptions`: el valor por defecto (`false` / `None`) **quita** la
 * etiqueta y lo demás la escribe en orden canónico. El undo es byte-exacto:
 * lo creado se quita, lo existente vuelve con su texto anterior y lo borrado se
 * reinserta en su posición. Un solo comando = un solo paso de undo.
 */
export function applySetMemberOptions(
  ctx: CommandContext,
  command: SetMemberOptionsCommand,
): Either<DomainError, CommandOutcome> {
  if (
    command.repeatOnNewPage === undefined &&
    command.keepWithGroup === undefined &&
    command.keepTogether === undefined
  ) {
    return left(CommandRejectedError.of('noOptionToChange'));
  }

  const found = findMember(ctx, command.id, command.axis, command.path);
  if (found.isLeft()) return left(found.value);
  const member = found.value;

  const inverse: DomainCommand[] = [];

  if (command.repeatOnNewPage !== undefined) {
    writeTag(member, 'RepeatOnNewPage', command.repeatOnNewPage ? 'true' : null, inverse);
  }
  if (command.keepWithGroup !== undefined) {
    writeTag(
      member,
      'KeepWithGroup',
      command.keepWithGroup === 'None' ? null : command.keepWithGroup,
      inverse,
    );
  }
  if (command.keepTogether !== undefined) {
    writeTag(member, 'KeepTogether', command.keepTogether ? 'true' : null, inverse);
  }

  return right({ inverse, snapshotOut: true });
}

/** Escribe el texto de la etiqueta; `null` la quita (valor por defecto). */
function writeTag(
  member: RdlcNode,
  tag: MemberTag,
  value: string | null,
  inverse: DomainCommand[],
): void {
  const existing = member.child(tag);

  if (value === null) {
    if (existing) inverse.push(restore(detach(existing), existing));
    return;
  }

  if (existing) {
    const previous = existing.text() ?? '';
    if (previous === value) return;
    inverse.push(setNodeTextChange({ node: existing, value: previous }));
    existing.setText(value);
    return;
  }

  const created = member.createElement(tag, value);
  insertAfterTags(member, created, MEMBER_ORDER.slice(0, MEMBER_ORDER.indexOf(tag)));
  inverse.push({ cmd: 'removeNode', node: created });
}
