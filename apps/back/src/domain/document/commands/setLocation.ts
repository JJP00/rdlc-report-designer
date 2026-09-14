import type { RdlcCommand } from '@rdlc-designer/contracts';
import { left, right, type Either } from '../../../shared/either.js';
import { CommandRejectedError, type DomainError } from '../../../shared/domainError.js';
import { readLength, writeLength } from '../geometry/geometry.js';
import type { CommandContext, CommandOutcome } from './CommandContext.js';

export type SetLocationCommand = Extract<RdlcCommand, { cmd: 'setLocation' }>;

/** Drag = 1 comando al soltar: mueve el item y devuelve la posición anterior. */
export function applySetLocation(
  ctx: CommandContext,
  command: SetLocationCommand,
): Either<DomainError, CommandOutcome> {
  const node = ctx.index.get(command.id);
  if (!node) return left(CommandRejectedError.create(`No existe el elemento '${command.id}'`));

  // El corpus siempre trae Top/Left explícitos; si faltaran, la inversa
  // restauraría 0cm (no eliminaría el nodo creado). Refinar con el
  // ReportItemFactory completo en F1.
  const previousTop = readLength(node, 'Top') ?? { value: 0, unit: 'cm' };
  const previousLeft = readLength(node, 'Left') ?? { value: 0, unit: 'cm' };

  writeLength(node, 'Top', command.top);
  writeLength(node, 'Left', command.left);

  return right({
    inverse: { cmd: 'setLocation', id: command.id, top: previousTop, left: previousLeft },
  });
}
