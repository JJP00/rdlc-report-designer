import type { RdlcCommand } from '@rdlc-designer/contracts';
import { left, right, type Either } from '../../../shared/either.js';
import { CommandRejectedError, type DomainError } from '../../../shared/domainError.js';
import { childOrCreate, readLength, writeLength } from '../geometry/geometry.js';
import type { CommandContext, CommandOutcome } from './CommandContext.js';

export type SetPageMarginsCommand = Extract<RdlcCommand, { cmd: 'setPageMargins' }>;

const MARGIN_TAGS = ['TopMargin', 'BottomMargin', 'LeftMargin', 'RightMargin'] as const;

/** Márgenes de página. Crea `<Page>` si el fichero no lo trae. */
export function applySetPageMargins(
  ctx: CommandContext,
  command: SetPageMarginsCommand,
): Either<DomainError, CommandOutcome> {
  const section = ctx.root.child('ReportSections')?.child('ReportSection');
  if (!section) {
    return left(CommandRejectedError.create('El documento no tiene ReportSection'));
  }

  const page = childOrCreate(section, 'Page');
  const previous = {
    top: readLength(page, 'TopMargin') ?? { value: 2.5, unit: 'cm' as const },
    bottom: readLength(page, 'BottomMargin') ?? { value: 2.5, unit: 'cm' as const },
    left: readLength(page, 'LeftMargin') ?? { value: 1.9, unit: 'cm' as const },
    right: readLength(page, 'RightMargin') ?? { value: 1.9, unit: 'cm' as const },
  };

  writeLength(page, 'TopMargin', command.top);
  writeLength(page, 'BottomMargin', command.bottom);
  writeLength(page, 'LeftMargin', command.left);
  writeLength(page, 'RightMargin', command.right);

  return right({
    inverse: {
      cmd: 'setPageMargins',
      top: previous.top,
      bottom: previous.bottom,
      left: previous.left,
      right: previous.right,
    },
  });
}

/** Nombres de los márgenes que gestiona el comando (para tests/diagnóstico). */
export const PAGE_MARGIN_TAGS = MARGIN_TAGS;
