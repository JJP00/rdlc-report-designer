import type { RdlcCommand } from '@rdlc-designer/contracts';
import { left, right, type Either } from '../../../shared/either.js';
import { CommandRejectedError, type DomainError } from '../../../shared/domainError.js';
import type { CommandContext, CommandOutcome } from './CommandContext.js';
import { createReportItem } from './itemFactory.js';
import { resolveScope } from './scope.js';

export type InsertItemCommand = Extract<RdlcCommand, { cmd: 'insertItem' }>;

const KIND_PREFIX: Record<string, string> = {
  textbox: 'Textbox',
  rectangle: 'Rectangle',
  line: 'Line',
  image: 'Image',
  tablix: 'Tablix',
};

/**
 * `Textbox17` libre en el índice (el front suele proponer nombre; esto es el
 * respaldo). `taken` permite reservar nombres ya asignados en el mismo comando
 * (duplicar un contenedor renombra varios hijos a la vez).
 */
export function nextItemName(
  ctx: CommandContext,
  kind: string,
  taken?: ReadonlySet<string>,
): string {
  const prefix = KIND_PREFIX[kind] ?? 'Item';
  for (let index = 1; ; index += 1) {
    const candidate = `${prefix}${index}`;
    if (!ctx.index.has(candidate) && !taken?.has(candidate)) return candidate;
  }
}

export function applyInsertItem(
  ctx: CommandContext,
  command: InsertItemCommand,
): Either<DomainError, CommandOutcome> {
  const container = resolveScope(ctx, command.scope);
  if (!container) {
    return left(CommandRejectedError.create('No se encontró el contenedor del scope'));
  }

  const name = command.item.name ?? nextItemName(ctx, command.item.kind);
  if (ctx.index.has(name)) {
    return left(CommandRejectedError.create(`Ya existe un elemento con el nombre '${name}'`));
  }

  const node = createReportItem(container, { ...command.item, name });
  container.insertChildAt(node, command.index);

  return right({
    inverse: [{ cmd: 'removeNode', node }],
    applied: [
      {
        id: name,
        values: {
          kind: command.item.kind,
          top: command.item.top,
          left: command.item.left,
          width: command.item.width,
          height: command.item.height,
        },
      },
    ],
  });
}
