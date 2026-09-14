import type { RdlcCommand } from '@rdlc-designer/contracts';
import { left, right, type Either } from '../../../shared/either.js';
import { CommandRejectedError, type DomainError } from '../../../shared/domainError.js';
import { readLength, writeLength } from '../geometry/geometry.js';
import type { CommandContext, CommandOutcome } from './CommandContext.js';

export type SetSizeCommand = Extract<RdlcCommand, { cmd: 'setSize' }>;

export function applySetSize(
  ctx: CommandContext,
  command: SetSizeCommand,
): Either<DomainError, CommandOutcome> {
  const node = ctx.index.get(command.id);
  if (!node) return left(CommandRejectedError.create(`No existe el elemento '${command.id}'`));

  const previousWidth = readLength(node, 'Width') ?? { value: 0, unit: 'cm' };
  const previousHeight = readLength(node, 'Height') ?? { value: 0, unit: 'cm' };

  writeLength(node, 'Width', command.width);
  writeLength(node, 'Height', command.height);

  return right({
    inverse: {
      cmd: 'setSize',
      id: command.id,
      width: previousWidth,
      height: previousHeight,
    },
  });
}
