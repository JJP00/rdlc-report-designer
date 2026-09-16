import type { RdlcCommand } from '@rdlc-designer/contracts';
import { right, type Either } from '../../../shared/either.js';
import type { DomainError } from '../../../shared/domainError.js';
import { childOrCreate } from '../geometry/geometry.js';
import type { RdlcNode } from '../tree/RdlcNode.js';
import type { CommandContext, CommandOutcome } from './CommandContext.js';

export type SetReportCodeCommand = Extract<RdlcCommand, { cmd: 'setReportCode' }>;

/**
 * Bloque `<Code>` VB custom (atómico). Si no existe se crea en su posición
 * canónica dentro de `<Report>` (tras `ReportSections`).
 *
 * Con código vacío el bloque **no se crea** y, si existía, se quita: así un
 * fichero sin código no gana un `<Code></Code>` al vaciarlo y guardar.
 */
export function applySetReportCode(
  ctx: CommandContext,
  command: SetReportCodeCommand,
): Either<DomainError, CommandOutcome> {
  const existing = ctx.root.child('Code');
  const previous = existing?.text() ?? '';
  const isEmpty = command.code.trim().length === 0;

  if (isEmpty) {
    if (!existing) {
      // Nada que quitar: comando sin efecto (inverso vacío).
      return right({ inverse: [] });
    }
    const index = elementIndex(ctx.root, existing);
    existing.remove();
    return right({
      inverse: {
        cmd: 'restoreNode',
        node: existing,
        container: ctx.root,
        index,
        name: 'Code',
      },
    });
  }

  const code = existing ?? childOrCreate(ctx.root, 'Code');
  code.setText(command.code);

  // Si el bloque no existía, el inverso lo quita (y no deja uno vacío).
  return right({
    inverse: existing
      ? { cmd: 'setReportCode', code: previous }
      : { cmd: 'removeNode', node: code },
  });
}

/** Posición del nodo entre los hijos elemento de su contenedor. */
function elementIndex(container: RdlcNode, node: RdlcNode): number {
  return container.children().findIndex((sibling) => sibling.equals(node));
}
