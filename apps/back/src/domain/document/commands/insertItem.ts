import type { RdlcCommand, ScopeRef } from '@rdlc-designer/contracts';
import { left, right, type Either } from '../../../shared/either.js';
import { CommandRejectedError, type DomainError } from '../../../shared/domainError.js';
import { clampPosition } from '../geometry/geometry.js';
import type { Length } from '../style/Length.js';
import type { RdlcNode } from '../tree/RdlcNode.js';
import type { CommandContext, CommandOutcome } from './CommandContext.js';
import { createReportItem } from './itemFactory.js';
import { resolveScope } from './scope.js';
import { hasGroupNamed } from './scopeNames.js';

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
    if (!ctx.index.has(candidate) && !isTakenIgnoringCase(taken, candidate)) return candidate;
  }
}

/** `taken` guarda nombres exactos; la reserva del mismo comando también ignora caja. */
function isTakenIgnoringCase(taken: ReadonlySet<string> | undefined, candidate: string): boolean {
  if (!taken) return false;
  const lower = candidate.toLowerCase();
  for (const name of taken) {
    if (name.toLowerCase() === lower) return true;
  }
  return false;
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
  // Grupos y items comparten namespace (BUG-11): el nombre no puede ser el de
  // un grupo existente aunque el índice de items no lo vea.
  if (ctx.index.has(name) || hasGroupNamed(ctx.root, name)) {
    return left(
      CommandRejectedError.create(`Ya existe un elemento o grupo con el nombre '${name}'`),
    );
  }

  const occupied = occupiedCell(container, command.scope);
  if (occupied) return left(CommandRejectedError.create(occupied));

  // Un item soltado cerca del borde no debe salirse de su banda: se normaliza la
  // posición igual que hace el drag (`clampPosition`). En contenedores que no
  // son bandas (rectángulo/celda/cabecera/esquina) el item nace donde se pide.
  const regionBounds =
    command.scope.kind === 'rectangle' ||
    command.scope.kind === 'tablixCell' ||
    command.scope.kind === 'tablixHeader' ||
    command.scope.kind === 'tablixCorner'
      ? undefined
      : boundsForRegion(ctx, command.scope.kind);
  const position = clampPosition(
    command.item.top,
    command.item.left,
    command.item.width,
    command.item.height,
    regionBounds,
  );

  // Los items anidados que la factory cree (los Textbox de las celdas de un
  // Tablix) reservan su nombre en este mismo comando para no repetirlo.
  const taken = new Set<string>();
  const node = createReportItem(
    container,
    { ...command.item, name, ...position },
    {
      nameFor: (kind) => {
        const nested = nextItemName(ctx, kind, taken);
        taken.add(nested);
        return nested;
      },
    },
  );
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
    createdId: name,
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

/**
 * Una celda de cabecera o esquina admite **un** report item (como en RB).
 * Devuelve el motivo si ya tiene contenido (ignorando `ColSpan`/`RowSpan`).
 */
export function occupiedCell(container: RdlcNode, scope: ScopeRef): string | undefined {
  if (scope.kind !== 'tablixHeader' && scope.kind !== 'tablixCorner') return undefined;
  const hasContent = container
    .children()
    .some((child) => !['ColSpan', 'RowSpan', 'Height'].includes(child.tagName));
  if (!hasContent) return undefined;
  return scope.kind === 'tablixHeader'
    ? 'La celda de cabecera ya tiene contenido'
    : 'La celda de la esquina ya tiene contenido';
}
