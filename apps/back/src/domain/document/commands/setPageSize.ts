import type { RdlcCommand } from '@rdlc-designer/contracts';
import { left, right, type Either } from '../../../shared/either.js';
import { CommandRejectedError, type DomainError } from '../../../shared/domainError.js';
import { childOrCreate, readLength, writeLength } from '../geometry/geometry.js';
import type { CommandContext, CommandOutcome } from './CommandContext.js';

export type SetPageSizeCommand = Extract<RdlcCommand, { cmd: 'setPageSize' }>;

/**
 * Tamaño de página (orientación = intercambio de ancho/alto en el front).
 * Si el fichero no trae `<Page>` (BC a veces lo omite) se crea en su sitio
 * canónico. Ojo: en ese caso la inversa no puede des-crear el nodo.
 */
export function applySetPageSize(
  ctx: CommandContext,
  command: SetPageSizeCommand,
): Either<DomainError, CommandOutcome> {
  const section = ctx.root.child('ReportSections')?.child('ReportSection');
  if (!section) {
    return left(CommandRejectedError.create('El documento no tiene ReportSection'));
  }

  const page = childOrCreate(section, 'Page');
  const previousWidth = readLength(page, 'PageWidth') ?? { value: 21, unit: 'cm' };
  const previousHeight = readLength(page, 'PageHeight') ?? { value: 29.7, unit: 'cm' };

  writeLength(page, 'PageWidth', command.width);
  writeLength(page, 'PageHeight', command.height);

  return right({
    inverse: {
      cmd: 'setPageSize',
      width: previousWidth,
      height: previousHeight,
    },
  });
}
