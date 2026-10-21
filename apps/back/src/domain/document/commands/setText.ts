import type { RdlcCommand } from '@rdlc-designer/contracts';
import { left, right, type Either } from '../../../shared/either.js';
import { CommandRejectedError, type DomainError } from '../../../shared/domainError.js';
import type { CommandContext, CommandOutcome } from './CommandContext.js';

export type SetTextCommand = Extract<RdlcCommand, { cmd: 'setText' }>;

/** Edita el valor de UN TextRun (texto plano o `=expresión`). */
export function applySetText(
  ctx: CommandContext,
  command: SetTextCommand,
): Either<DomainError, CommandOutcome> {
  const node = ctx.index.get(command.id);
  if (!node) return left(CommandRejectedError.of('itemMissing', { id: command.id }));

  const paragraph = node.child('Paragraphs')?.children('Paragraph')[command.p];
  const run = paragraph?.child('TextRuns')?.children('TextRun')[command.r];
  const value = run?.child('Value');
  if (!value) {
    return left(
      CommandRejectedError.of('runMissing', { id: command.id, p: command.p, r: command.r }),
    );
  }

  const previous = value.text() ?? '';
  value.setText(command.value);

  return right({
    inverse: { cmd: 'setText', id: command.id, p: command.p, r: command.r, value: previous },
  });
}
