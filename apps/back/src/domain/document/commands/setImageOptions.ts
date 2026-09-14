import type { RdlcCommand } from '@rdlc-designer/contracts';
import { left, right, type Either } from '../../../shared/either.js';
import { CommandRejectedError, type DomainError } from '../../../shared/domainError.js';
import { insertCanonical } from '../geometry/geometry.js';
import type { RdlcNode } from '../tree/RdlcNode.js';
import type { CommandContext, CommandOutcome } from './CommandContext.js';

export type SetImageOptionsCommand = Extract<RdlcCommand, { cmd: 'setImageOptions' }>;

const TAGS: Record<string, string> = {
  source: 'Source',
  value: 'Value',
  mimeType: 'MIMEType',
  sizing: 'Sizing',
};

/**
 * Propiedades de un `<Image>`: origen (External/Embedded/Database), valor
 * (expresión de campo o URL), MIME y ajuste. `null` = quitar la propiedad.
 */
export function applySetImageOptions(
  ctx: CommandContext,
  command: SetImageOptionsCommand,
): Either<DomainError, CommandOutcome> {
  const node = ctx.index.get(command.id);
  if (!node) return left(CommandRejectedError.create(`No existe el elemento '${command.id}'`));
  if (node.tagName !== 'Image') {
    return left(CommandRejectedError.create(`'${command.id}' no es una imagen`));
  }

  const patch: Record<string, string | null | undefined> = {
    source: command.source,
    value: command.value,
    mimeType: command.mimeType,
    sizing: command.sizing,
  };

  // El inverso SOLO toca los campos presentes en el parche.
  const inverse: Record<string, string | null> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    inverse[key] = node.child(TAGS[key]!)?.text() ?? null;
  }

  applyPatch(node, patch);

  return right({
    inverse: [
      {
        cmd: 'setImageOptions',
        id: command.id,
        ...(('source' in inverse) && {
          source: inverse.source as 'External' | 'Embedded' | 'Database' | null,
        }),
        ...(('value' in inverse) && { value: inverse.value ?? null }),
        ...(('mimeType' in inverse) && { mimeType: inverse.mimeType ?? null }),
        ...(('sizing' in inverse) && { sizing: inverse.sizing ?? null }),
      },
    ],
    applied: [{ id: command.id, values: { ...readImage(node) } }],
  });
}

function applyPatch(node: RdlcNode, patch: Record<string, string | null | undefined>): void {
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    const tag = TAGS[key]!;

    if (value === null) {
      node.child(tag)?.remove();
      continue;
    }

    const existing = node.child(tag);
    if (existing) {
      existing.setText(value);
      continue;
    }
    insertCanonical(node, tag, node.createElement(tag, value));
  }
}

export function readImage(node: RdlcNode): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const [key, tag] of Object.entries(TAGS)) {
    const text = node.child(tag)?.text();
    if (text !== undefined) values[key] = text;
  }
  return values;
}
