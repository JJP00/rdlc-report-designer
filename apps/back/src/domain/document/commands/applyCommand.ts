import type { RdlcCommand } from '@rdlc-designer/contracts';
import { left, type Either } from '../../../shared/either.js';
import { CommandRejectedError, type DomainError } from '../../../shared/domainError.js';
import type { CommandContext, CommandOutcome } from './CommandContext.js';
import { applySetLocation } from './setLocation.js';
import { applySetPageMargins } from './setPageMargins.js';
import { applySetPageSize } from './setPageSize.js';
import { applySetReportCode } from './setReportCode.js';
import { applySetSize } from './setSize.js';
import { applySetText } from './setText.js';

/**
 * Dispatcher de comandos del dominio. Cada familia de comandos añade su caso;
 * si un comando no está implementado todavía se rechaza explícitamente
 * (nunca se ignora en silencio).
 */
export function applyCommand(
  ctx: CommandContext,
  command: RdlcCommand,
): Either<DomainError, CommandOutcome> {
  switch (command.cmd) {
    case 'setLocation':
      return applySetLocation(ctx, command);
    case 'setSize':
      return applySetSize(ctx, command);
    case 'setText':
      return applySetText(ctx, command);
    case 'setPageSize':
      return applySetPageSize(ctx, command);
    case 'setPageMargins':
      return applySetPageMargins(ctx, command);
    case 'setReportCode':
      return applySetReportCode(ctx, command);
    default:
      return left(CommandRejectedError.create(`Comando no implementado: '${command.cmd}'`));
  }
}
