import type { RdlcCommand } from '@rdlc-designer/contracts';
import { left, right, type Either } from '../../../shared/either.js';
import { CommandRejectedError, type DomainError } from '../../../shared/domainError.js';
import { childOrCreate, insertCanonical } from '../geometry/geometry.js';
import type { CommandContext, CommandOutcome, DomainCommand } from './CommandContext.js';
import { detach, restore, setNodeTextChange } from './nodeChanges.js';

export type SetItemPageBreakCommand = Extract<RdlcCommand, { cmd: 'setItemPageBreak' }>;

/**
 * Salto de página **del item** (`<PageBreak><BreakLocation>`; Rectangle/Tablix,
 * los que BC usa). `None` o `null` quitan el bloque (es el valor por defecto)
 * y el undo lo reinserta en su sitio exacto.
 */
export function applySetItemPageBreak(
  ctx: CommandContext,
  command: SetItemPageBreakCommand,
): Either<DomainError, CommandOutcome> {
  const node = ctx.index.get(command.id);
  if (!node) return left(CommandRejectedError.of('itemMissing', { id: command.id }));

  if (command.breakLocation === null || command.breakLocation === 'None') {
    const pageBreak = node.child('PageBreak');
    if (!pageBreak) {
      return right({ inverse: [], applied: [{ id: command.id, values: { pageBreak: 'None' } }] });
    }
    const position = detach(pageBreak);
    return right({
      inverse: [restore(position, pageBreak)],
      applied: [{ id: command.id, values: { pageBreak: 'None' } }],
    });
  }

  const pageBreakExisted = node.child('PageBreak') !== undefined;
  const pageBreak = childOrCreate(node, 'PageBreak');
  const location = pageBreak.child('BreakLocation');

  const inverse: DomainCommand[] = [];
  if (location) {
    const previous = location.text() ?? '';
    if (previous !== command.breakLocation) {
      location.setText(command.breakLocation);
      inverse.push(setNodeTextChange({ node: location, value: previous }));
    }
  } else {
    const created = pageBreak.createElement('BreakLocation', command.breakLocation);
    insertCanonical(pageBreak, 'BreakLocation', created);
    // Si el `PageBreak` nació aquí, quitarlo se lleva el hijo por delante.
    inverse.push({ cmd: 'removeNode', node: pageBreakExisted ? created : pageBreak });
  }

  return right({
    inverse,
    applied: [{ id: command.id, values: { pageBreak: command.breakLocation } }],
  });
}
