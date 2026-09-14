import type { RdlcCommand } from '@rdlc-designer/contracts';
import { left, right, type Either } from '../../../shared/either.js';
import { CommandRejectedError, type DomainError } from '../../../shared/domainError.js';
import { readLength } from '../geometry/geometry.js';
import type { RdlcNode } from '../tree/RdlcNode.js';
import type { CommandContext, CommandOutcome } from './CommandContext.js';
import { nextItemName } from './insertItem.js';

export type DuplicateItemCommand = Extract<RdlcCommand, { cmd: 'duplicateItem' }>;

/** Clona el subárbol exacto (formato y estilos incluidos) justo después del original. */
export function applyDuplicateItem(
  ctx: CommandContext,
  command: DuplicateItemCommand,
): Either<DomainError, CommandOutcome> {
  const source = ctx.index.get(command.id);
  if (!source) return left(CommandRejectedError.create(`No existe el elemento '${command.id}'`));

  const container = source.parent;
  if (!container) {
    return left(CommandRejectedError.create(`El elemento '${command.id}' no tiene contenedor`));
  }

  const name = command.name ?? nextItemName(ctx, kindOf(source));
  if (ctx.index.has(name)) {
    return left(CommandRejectedError.create(`Ya existe un elemento con el nombre '${name}'`));
  }

  const clone = source.clone();
  clone.setAttribute('Name', name);

  // Justo después del original, respetando el orden de los hermanos.
  const siblings = container.children();
  const index = siblings.findIndex((sibling) => sibling.equals(source));
  container.insertChildAt(clone, index === -1 ? siblings.length : index + 1);

  return right({
    inverse: [{ cmd: 'removeNode', node: clone }],
    applied: [{ id: name, values: geometryOf(clone) }],
  });
}

function kindOf(node: RdlcNode): string {
  return node.tagName.toLowerCase();
}

function geometryOf(node: RdlcNode): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  const top = readLength(node, 'Top');
  const left = readLength(node, 'Left');
  const width = readLength(node, 'Width');
  const height = readLength(node, 'Height');
  if (top) values.top = top;
  if (left) values.left = left;
  if (width) values.width = width;
  if (height) values.height = height;
  return values;
}
