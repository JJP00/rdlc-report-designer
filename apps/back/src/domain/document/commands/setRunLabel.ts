import type { RdlcCommand } from '@rdlc-designer/contracts';
import { left, right, type Either } from '../../../shared/either.js';
import { CommandRejectedError, type DomainError } from '../../../shared/domainError.js';
import type { RdlcNode } from '../tree/RdlcNode.js';
import type { CommandContext, CommandOutcome } from './CommandContext.js';

export type SetRunLabelCommand = Extract<RdlcCommand, { cmd: 'setRunLabel' }>;

/**
 * Etiqueta de diseñador de UN TextRun (`<Label>`: lo que BC/RB pinta en lugar
 * de la expresión). `null` — o cadena vacía — la quita.
 *
 * El `<Label>` es hijo del `<TextRun>` y va **antes** del `<Value>` (orden del
 * XSD): si no existe se inserta delante del `Value`; si se quita, el inverso lo
 * restituye en su posición exacta (undo byte a byte).
 */
export function applySetRunLabel(
  ctx: CommandContext,
  command: SetRunLabelCommand,
): Either<DomainError, CommandOutcome> {
  const run = findRun(ctx, command);
  if (!run) return left(missingRun(command));

  const label = command.label ?? '';
  const existing = run.child('Label');

  // Quitar la etiqueta (o un `null` sobre un run que no la tiene: no-op).
  if (label === '') {
    if (!existing) return right({ inverse: [] });
    const index = run.children().findIndex((child) => child.equals(existing));
    existing.remove();
    return right({
      inverse: [{ cmd: 'restoreNode', node: existing, container: run, index, name: 'Label' }],
    });
  }

  if (existing) {
    if (existing.text() === label) return right({ inverse: [] });
    const previous = existing.text() ?? '';
    existing.setText(label);
    return right({ inverse: [{ cmd: 'setNodeText', node: existing, value: previous }] });
  }

  const value = run.child('Value');
  if (!value) return left(missingRun(command));

  const created = run.createElement('Label', label);
  run.insertBefore(created, value);
  return right({ inverse: [{ cmd: 'removeNode', node: created }] });
}

/** El TextRun `[p][r]` del Textbox `id`, si existe. */
function findRun(ctx: CommandContext, command: SetRunLabelCommand): RdlcNode | undefined {
  const textbox = ctx.index.get(command.id);
  const paragraph = textbox?.child('Paragraphs')?.children('Paragraph')[command.p];
  return paragraph?.child('TextRuns')?.children('TextRun')[command.r];
}

function missingRun(command: SetRunLabelCommand): DomainError {
  return CommandRejectedError.create(
    `El Textbox '${command.id}' no tiene el run [${command.p}][${command.r}]`,
  );
}
