import type { RdlcCommand } from '@rdlc-designer/contracts';
import { left, right, type Either } from '../../../shared/either.js';
import { CommandRejectedError, type DomainError } from '../../../shared/domainError.js';
import { clampPosition } from '../geometry/geometry.js';
import type { Length } from '../style/Length.js';
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

  // Un item soltado cerca del borde no debe salirse de su banda: se normaliza la
  // posición igual que hace el drag (`clampPosition`).
  const regionBounds =
    command.scope.kind === 'rectangle' || command.scope.kind === 'tablixCell'
      ? undefined
      : boundsForRegion(ctx, command.scope.kind);
  const position = clampPosition(
    command.item.top,
    command.item.left,
    command.item.width,
    command.item.height,
    regionBounds,
  );

  const node = createReportItem(container, { ...command.item, name, ...position });
  container.insertChildAt(node, command.index);

  return right({
    inverse: [{ cmd: 'removeNode', node }],
    applied: [
      {
        id: name,
        values: {
          kind: command.item.kind,
          top: position.top,
          left: position.left,
          width: command.item.width,
          height: command.item.height,
        },
      },
    ],
  });
}

function boundsForRegion(
  ctx: CommandContext,
  region: 'body' | 'pageHeader' | 'pageFooter',
): { width: Length; height: Length } {
  const bounds = ctx.index.bounds();
  if (region === 'pageHeader') return bounds.header;
  if (region === 'pageFooter') return bounds.footer;
  return bounds.body;
}
