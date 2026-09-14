import type { RdlcCommand } from '@rdlc-designer/contracts';
import { right, type Either } from '../../../shared/either.js';
import type { DomainError } from '../../../shared/domainError.js';
import { childOrCreate } from '../geometry/geometry.js';
import type { CommandContext, CommandOutcome } from './CommandContext.js';

export type SetReportCodeCommand = Extract<RdlcCommand, { cmd: 'setReportCode' }>;

/**
 * Bloque `<Code>` VB custom (atómico). Si no existe se crea en su posición
 * canónica dentro de `<Report>` (tras `ReportSections`).
 */
export function applySetReportCode(
  ctx: CommandContext,
  command: SetReportCodeCommand,
): Either<DomainError, CommandOutcome> {
  const code = childOrCreate(ctx.root, 'Code');
  const previous = code.text() ?? '';

  code.setText(command.code);

  return right({
    inverse: { cmd: 'setReportCode', code: previous },
  });
}
