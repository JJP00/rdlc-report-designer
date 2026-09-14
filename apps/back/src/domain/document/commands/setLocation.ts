import type { RdlcCommand } from '@rdlc-designer/contracts';
import { left, right, type Either } from '../../../shared/either.js';
import { CommandRejectedError, type DomainError } from '../../../shared/domainError.js';
import { clampPosition, readLength, writeLength } from '../geometry/geometry.js';
import type { CommandContext, CommandOutcome } from './CommandContext.js';
import { growContainerToFit } from './growContainer.js';

export type SetLocationCommand = Extract<RdlcCommand, { cmd: 'setLocation' }>;

/**
 * Drag = 1 comando al soltar: mueve el item y devuelve la posición anterior.
 *
 * - El dominio normaliza la posición para que el item no salga de su región
 *   (invariante: bounds dentro de la página).
 * - Si el item es hijo de un rectángulo con tamaño explícito y se sale de él,
 *   el contenedor **crece** para envolverlo (el inverso incluye ese `setSize`).
 */
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
  const width = readLength(node, 'Width') ?? { value: 0, unit: 'cm' };
  const height = readLength(node, 'Height') ?? { value: 0, unit: 'cm' };

  const bounds = ctx.index.boundsOf(command.id);
  const { top, left: clampedLeft } = clampPosition(
    command.top,
    command.left,
    width,
    height,
    bounds,
  );

  writeLength(node, 'Top', top);
  writeLength(node, 'Left', clampedLeft);

  const growth = growContainerToFit(node);

  return right({
    inverse: [
      { cmd: 'setLocation', id: command.id, top: previousTop, left: previousLeft },
      ...(growth ? [growth.inverse] : []),
    ],
    applied: [
      { id: command.id, values: { top, left: clampedLeft } },
      ...(growth ? [growth.applied] : []),
    ],
  });
}
