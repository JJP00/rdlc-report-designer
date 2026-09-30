import { left, right, type Either } from '../../../shared/either.js';
import type { DomainError } from '../../../shared/domainError.js';
import { applyCommand } from './applyCommand.js';
import { inverseCommands } from './CommandContext.js';
import type { CommandContext, CommandOutcome, DomainCommand } from './CommandContext.js';
import type { RdlcCommand } from '@rdlc-designer/contracts';

type BatchCommand = Extract<RdlcCommand, { cmd: 'batch' }>;

/**
 * `batch`: aplica varios comandos como **un solo paso de undo** (edición en
 * lote desde la multiselección). El inverso es la concatenación de los inversos
 * en orden de aplicación; el journal los revierte en orden inverso.
 *
 * Si un comando de dentro falla, se revierten los ya aplicados (mejor esfuerzo
 * con sus inversos) y se devuelve el error: el lote es atómico.
 */
export function applyBatch(
  ctx: CommandContext,
  command: BatchCommand,
): Either<DomainError, CommandOutcome> {
  const inverse: DomainCommand[] = [];
  const applied: NonNullable<CommandOutcome['applied']> = [];
  const createdIds: string[] = [];

  for (const inner of command.commands) {
    const result = applyCommand(ctx, inner);
    if (result.isLeft()) {
      for (const undo of [...inverse].reverse()) applyCommand(ctx, undo);
      return left(result.value);
    }
    inverse.push(...inverseCommands(result.value));
    if (result.value.applied) applied.push(...result.value.applied);
    if (result.value.createdId) createdIds.push(result.value.createdId);
  }

  return right({
    inverse,
    ...(applied.length > 0 ? { applied } : {}),
    ...(createdIds.length > 0 ? { createdIds } : {}),
    // El lote puede tocar partes que `applied` no expresa (varios items): el
    // front refresca con la proyección completa.
    snapshotOut: true,
  });
}
