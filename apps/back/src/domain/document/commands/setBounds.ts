import type { RdlcCommand } from '@rdlc-designer/contracts';
import { left, right, type Either } from '../../../shared/either.js';
import { CommandRejectedError, type DomainError } from '../../../shared/domainError.js';
import { clampPosition, clampSize, readLength, writeLengthTracking } from '../geometry/geometry.js';
import type { RdlcNode } from '../tree/RdlcNode.js';
import type { CommandContext, CommandOutcome } from './CommandContext.js';
import { growContainerToFit } from './growContainer.js';

export type SetBoundsCommand = Extract<RdlcCommand, { cmd: 'setBounds' }>;

/**
 * Mueve **y** redimensiona en un solo comando: es lo que necesitan los
 * tiradores de la selección (arrastrar una esquina cambia posición y tamaño) y
 * así el undo es un único paso. Normaliza como `setLocation` + `setSize`.
 */
export function applySetBounds(
  ctx: CommandContext,
  command: SetBoundsCommand,
): Either<DomainError, CommandOutcome> {
  const node = ctx.index.get(command.id);
  if (!node) return left(CommandRejectedError.of('itemMissing', { id: command.id }));

  const previous = {
    top: readLength(node, 'Top') ?? { value: 0, unit: 'cm' },
    left: readLength(node, 'Left') ?? { value: 0, unit: 'cm' },
    width: readLength(node, 'Width') ?? { value: 0, unit: 'cm' },
    height: readLength(node, 'Height') ?? { value: 0, unit: 'cm' },
  };

  const bounds = ctx.index.boundsOf(command.id);
  // Primero la posición (la región manda) y luego el tamaño desde esa posición.
  const position = clampPosition(command.top, command.left, command.width, command.height, bounds);
  const size = clampSize(command.width, command.height, position.top, position.left, bounds);

  // Los items dentro de una celda no declaran geometría: se anota lo que se crea
  // para que el inverso lo quite (nada de etiquetas nuevas tras deshacer).
  const created: RdlcNode[] = [];
  writeLengthTracking(node, 'Top', position.top, created);
  writeLengthTracking(node, 'Left', position.left, created);
  writeLengthTracking(node, 'Width', size.width, created);
  writeLengthTracking(node, 'Height', size.height, created);

  const growth = growContainerToFit(node);

  return right({
    inverse: [
      ...created.map((child) => ({ cmd: 'removeNode', node: child }) as const),
      {
        cmd: 'setBounds',
        id: command.id,
        top: previous.top,
        left: previous.left,
        width: previous.width,
        height: previous.height,
      },
      ...(growth ? [growth.inverse] : []),
    ],
    applied: [
      {
        id: command.id,
        values: { ...position, ...size },
      },
      ...(growth ? [growth.applied] : []),
    ],
  });
}
