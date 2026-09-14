import { applyCommand } from '../../src/domain/document/commands/applyCommand.js';
import type { CommandContext, CommandOutcome } from '../../src/domain/document/commands/CommandContext.js';
import { inverseCommands } from '../../src/domain/document/commands/CommandContext.js';
import type { Either } from '../../src/shared/either.js';
import type { DomainError } from '../../src/shared/domainError.js';

/**
 * Deshace un resultado aplicando sus inversos en orden inverso (lo mismo que
 * hace el journal del CommandService). Helper de tests.
 */
export function undoAll(
  ctx: CommandContext,
  outcome: CommandOutcome,
): Either<DomainError, CommandOutcome> {
  const inverses = [...inverseCommands(outcome)].reverse();
  let result = applyCommand(ctx, inverses[0]!);
  for (const inverse of inverses.slice(1)) {
    if (result.isLeft()) return result;
    result = applyCommand(ctx, inverse);
  }
  return result;
}

/** Valores normalizados del elemento `id` dentro del resultado. */
export function appliedOf(
  outcome: CommandOutcome,
  id: string,
): Record<string, unknown> | undefined {
  return outcome.applied?.find((entry) => entry.id === id)?.values;
}
