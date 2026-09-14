import type { RdlcCommand } from '@rdlc-designer/contracts';
import { left, right, type Either } from '../../../shared/either.js';
import { CommandRejectedError, type DomainError } from '../../../shared/domainError.js';
import { clampSize, readLength, writeLength } from '../geometry/geometry.js';
import type { CommandContext, CommandOutcome } from './CommandContext.js';
import { growContainerToFit } from './growContainer.js';

export type SetSizeCommand = Extract<RdlcCommand, { cmd: 'setSize' }>;

/**
 * Redimensiona; el dominio normaliza para que el item quepa en su región y,
 * si es hijo de un rectángulo con tamaño explícito, el contenedor crece.
 */
export function applySetSize(
  ctx: CommandContext,
  command: SetSizeCommand,
): Either<DomainError, CommandOutcome> {
  const node = ctx.index.get(command.id);
  if (!node) return left(CommandRejectedError.create(`No existe el elemento '${command.id}'`));

  const previousWidth = readLength(node, 'Width') ?? { value: 0, unit: 'cm' };
  const previousHeight = readLength(node, 'Height') ?? { value: 0, unit: 'cm' };
  const top = readLength(node, 'Top') ?? { value: 0, unit: 'cm' };
  const leftPosition = readLength(node, 'Left') ?? { value: 0, unit: 'cm' };

  const bounds = ctx.index.boundsOf(command.id);
  const { width, height } = clampSize(command.width, command.height, top, leftPosition, bounds);

  writeLength(node, 'Width', width);
  writeLength(node, 'Height', height);

  const growth = growContainerToFit(node);

  return right({
    inverse: [
      { cmd: 'setSize', id: command.id, width: previousWidth, height: previousHeight },
      ...(growth ? [growth.inverse] : []),
    ],
    applied: [
      { id: command.id, values: { width, height } },
      ...(growth ? [growth.applied] : []),
    ],
  });
}
