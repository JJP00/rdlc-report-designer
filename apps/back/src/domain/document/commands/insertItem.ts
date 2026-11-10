import type { RdlcCommand, ScopeRef } from '@rdlc-designer/contracts';
import { left, right, type Either } from '../../../shared/either.js';
import { CommandRejectedError, type DomainError } from '../../../shared/domainError.js';
import type { ErrorReason } from '../../../shared/errorReasons.js';
import { clampPosition } from '../geometry/geometry.js';
import type { Length } from '../style/Length.js';
import type { RdlcNode } from '../tree/RdlcNode.js';
import type { CommandContext, CommandOutcome } from './CommandContext.js';
import { createReportItem } from './itemFactory.js';
import { resolveScope, tablixCellBox } from './scope.js';
import { hasGroupNamed } from './scopeNames.js';
import { applyStyleToNode } from './setStyle.js';

export type InsertItemCommand = Extract<RdlcCommand, { cmd: 'insertItem' }>;

const ZERO: Length = { value: 0, unit: 'cm' };

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
    return left(CommandRejectedError.of('scopeContainerMissing'));
  }

  const name = command.item.name ?? nextItemName(ctx, command.item.kind);
  // Grupos y items comparten namespace (BUG-11): el nombre no puede ser el de
  // un grupo existente aunque el índice de items no lo vea.
  if (ctx.index.has(name) || hasGroupNamed(ctx.root, name)) {
    return left(CommandRejectedError.of('nameTaken', { name }));
  }

  const occupied = occupiedCell(container, command.scope);
  if (occupied) return left(CommandRejectedError.of(occupied));

  // Dentro de una celda del body, manda la celda (como en RB): el item nace en
  // su origen y con su caja, aunque el llamante (front, MCP) pida otra cosa; si
  // no, se sale de la celda.
  const cellBox =
    command.scope.kind === 'tablixCell' ? tablixCellBox(ctx, command.scope) : undefined;
  const spec = cellBox
    ? { ...command.item, top: ZERO, left: ZERO, width: cellBox.width, height: cellBox.height }
    : command.item;

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
  const position = clampPosition(spec.top, spec.left, spec.width, spec.height, regionBounds);

  // Los items anidados que la factory cree (los Textbox de las celdas de un
  // Tablix) reservan su nombre en este mismo comando para no repetirlo.
  const taken = new Set<string>();
  const node = createReportItem(
    container,
    { ...spec, name, ...position },
    {
      nameFor: (kind) => {
        const nested = nextItemName(ctx, kind, taken);
        taken.add(nested);
        return nested;
      },
    },
  );
  // `item.style` viaja en el contrato (MCP/IPC): se aplica con la misma lógica
  // que `setStyle` (fuente a los runs, `TextAlign` a los párrafos, bordes…).
  // Se hace **antes** de colgar el item: un parche con claves no soportadas
  // se rechaza y no queda nada a medias. El inverso (`removeNode`) ya se lleva
  // el estilo consigo, no hace falta uno propio.
  const style = applyItemStyle(node, name, command.item.style);
  if (style.isLeft()) return left(style.value);

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
          width: spec.width,
          height: spec.height,
          // El eco incluye el estilo: si algo no se aplicara, se vería aquí.
          ...(style.value ? { style: style.value } : {}),
        },
      },
    ],
    createdId: name,
  });
}

/**
 * Estilo del item nuevo. Devuelve lo aplicado (para el eco de `applied`) o
 * `undefined` si no había nada que aplicar.
 *
 * `readStyle` solo lee el `<Style>` del item, y `textAlign`/`format`/`listStyle`
 * se escriben en párrafos y runs: se añaden al eco desde el parche (ya validado)
 * para que lo que se pidió figure en lo que se devuelve.
 */
function applyItemStyle(
  node: RdlcNode,
  name: string,
  patch: InsertItemCommand['item']['style'],
): Either<DomainError, Record<string, unknown> | undefined> {
  if (!patch || Object.keys(patch).length === 0) return right(undefined);

  const outcome = applyStyleToNode(node, { cmd: 'setStyle', id: name, style: patch });
  if (outcome.isLeft()) return left(outcome.value);

  const itemStyle = outcome.value.applied?.[0]?.values['style'] as
    Record<string, unknown> | undefined;
  const { textAlign, format, listStyle } = patch;
  const echoed: Record<string, unknown> = {
    ...itemStyle,
    ...(textAlign ? { textAlign } : {}),
    ...(format ? { format } : {}),
    ...(listStyle ? { listStyle } : {}),
  };
  return right(Object.keys(echoed).length > 0 ? echoed : undefined);
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
 * Devuelve el motivo (`reason`) si ya tiene contenido (ignorando `ColSpan`/`RowSpan`).
 */
export function occupiedCell(container: RdlcNode, scope: ScopeRef): ErrorReason | undefined {
  if (scope.kind !== 'tablixHeader' && scope.kind !== 'tablixCorner') return undefined;
  const hasContent = container
    .children()
    .some((child) => !['ColSpan', 'RowSpan', 'Height'].includes(child.tagName));
  if (!hasContent) return undefined;
  return scope.kind === 'tablixHeader' ? 'headerCellOccupied' : 'cornerCellOccupied';
}
