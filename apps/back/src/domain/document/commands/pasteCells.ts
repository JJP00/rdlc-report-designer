import { left, right, type Either } from '../../../shared/either.js';
import { CommandRejectedError, type DomainError } from '../../../shared/domainError.js';
import { readLength, writeLength } from '../geometry/geometry.js';
import { fromCm, toCm, type Length } from '../style/Length.js';
import type { RdlcNode } from '../tree/RdlcNode.js';
import type { CommandContext, CommandOutcome, DomainCommand } from './CommandContext.js';
import { insertCloneAt } from './cloneInsert.js';
import type { InsertCellClonesCommand } from './internal.js';
import { detach, restore } from './nodeChanges.js';
import { positionedCells, tablixColumns, tablixRows, type PositionedCell } from './tablixParts.js';

/**
 * Copiar y pegar **celdas** de un Tablix (solo el contenido de la celda: el
 * item que lleva dentro, con su formato, expresiones e hijos).
 *
 * - `copyCellContents` produce el portapapeles de celdas: el contenido de cada
 *   celda con su posición relativa (`dRow`/`dCol`) dentro del rectángulo que
 *   envuelve la selección. Las celdas vacías no entran (pero cuentan para la
 *   caja, así que el hueco se conserva) y una celda fusionada aporta su
 *   contenido **una vez**, en el sitio donde se pidió.
 * - `applyInsertCellClones` pega ese bloque desde una celda ancla: lo que no
 *   cabe en el Tablix se descarta (nunca crece), una posición cubierta por una
 *   fusión escribe en el ancla de la fusión y el contenido previo se **sustituye**
 *   (una celda del cuerpo lleva un solo item). La estructura no se toca.
 */

/** Contenido de una celda copiada con su posición relativa a la selección. */
export interface CellClipboardEntry {
  dRow: number;
  dCol: number;
  /** Clon desprendido del item de la celda. */
  source: RdlcNode;
}

/** Hijos de `CellContents` que no son el report item. */
const NON_ITEM_TAGS = new Set(['ColSpan', 'RowSpan', 'Height']);

/** Celda ancla que cubre una posición de la rejilla (con su fila de origen). */
interface CellAnchor {
  row: number;
  entry: PositionedCell;
}

/**
 * Ancla que cubre `(row, col)`: la celda que empieza ahí o la fusionada
 * (`ColSpan`/`RowSpan`) que la pisa. Los rellenos SSRS/BC no cuentan.
 */
function anchorAt(
  rows: RdlcNode[],
  columnCount: number,
  row: number,
  col: number,
): CellAnchor | undefined {
  if (row < 0 || row >= rows.length || col < 0 || col >= columnCount) return undefined;
  for (let source = row; source >= 0; source -= 1) {
    for (const entry of positionedCells(rows[source]!, columnCount)) {
      if (entry.placeholder) continue;
      const coversCol = entry.col <= col && col < entry.col + entry.colSpan;
      if (coversCol && source + entry.rowSpan > row) return { row: source, entry };
    }
  }
  return undefined;
}

/** Report items de una celda (sin `ColSpan`/`RowSpan`). */
function contentItems(cell: RdlcNode): RdlcNode[] {
  return (
    cell
      .child('CellContents')
      ?.children()
      .filter((child) => !NON_ITEM_TAGS.has(child.tagName)) ?? []
  );
}

/**
 * Clona el contenido de las celdas pedidas (fila, columna de rejilla) en el
 * orden recibido. El resultado queda vacío si todas las celdas están vacías.
 */
export function copyCellContents(
  ctx: CommandContext,
  id: string,
  cells: readonly { row: number; col: number }[],
): Either<DomainError, CellClipboardEntry[]> {
  const tablix = ctx.index.get(id);
  if (!tablix) return left(CommandRejectedError.of('itemMissing', { id }));
  if (tablix.tagName !== 'Tablix') return left(CommandRejectedError.of('notATablix', { id }));

  const rows = tablixRows(tablix);
  const columnCount = tablixColumns(tablix).length;

  // La caja se calcula con **todas** las celdas pedidas (vacías incluidas): el
  // diseño relativo de la selección no depende de qué celdas tengan contenido.
  const row0 = Math.min(...cells.map((cell) => cell.row));
  const col0 = Math.min(...cells.map((cell) => cell.col));

  const entries: CellClipboardEntry[] = [];
  const seen: CellAnchor[] = [];
  for (const { row, col } of cells) {
    const anchor = anchorAt(rows, columnCount, row, col);
    if (!anchor) return left(CommandRejectedError.of('cellMissing', { id, row, col }));

    // Una fusión aporta su contenido una vez (en la primera celda pedida).
    if (seen.some((other) => other.entry.cell.equals(anchor.entry.cell))) continue;
    seen.push(anchor);

    const item = contentItems(anchor.entry.cell)[0];
    if (!item) continue;
    entries.push({ dRow: row - row0, dCol: col - col0, source: item.clone() });
  }
  return right(entries);
}

/**
 * Pega el bloque de celdas del portapapeles con `(row, col)` como ancla. Un solo
 * paso de undo: el inverso quita los clones, restaura el contenido sustituido y
 * quita los `CellContents` que hubo que crear.
 */
export function applyInsertCellClones(
  ctx: CommandContext,
  command: InsertCellClonesCommand,
): Either<DomainError, CommandOutcome> {
  const tablix = ctx.index.get(command.id);
  if (!tablix) return left(CommandRejectedError.of('itemMissing', { id: command.id }));
  if (tablix.tagName !== 'Tablix') {
    return left(CommandRejectedError.of('notATablix', { id: command.id }));
  }

  const rows = tablixRows(tablix);
  const columns = tablixColumns(tablix);
  const columnCount = columns.length;

  if (!anchorAt(rows, columnCount, command.row, command.col)) {
    return left(
      CommandRejectedError.of('cellMissing', {
        id: command.id,
        row: command.row,
        col: command.col,
      }),
    );
  }

  // Plan: celda destino (ancla de la fusión si la hay) de cada entrada que cabe.
  // Si dos entradas caen en la misma celda gana la primera (orden de lectura).
  const plan: { anchor: CellAnchor; source: RdlcNode }[] = [];
  for (const entry of command.entries) {
    const anchor = anchorAt(rows, columnCount, command.row + entry.dRow, command.col + entry.dCol);
    if (!anchor) continue;
    if (plan.some((planned) => planned.anchor.entry.cell.equals(anchor.entry.cell))) continue;
    plan.push({ anchor, source: entry.source });
  }

  const total = command.entries.length;
  if (plan.length === 0) return left(CommandRejectedError.of('pasteCellsNothingFits'));

  const inverse: DomainCommand[] = [];
  // Registro compartido: el índice no ve los clones hasta terminar el comando.
  const taken = new Set<string>();

  for (const { anchor, source } of plan) {
    const { entry } = anchor;
    let contents = entry.cell.child('CellContents');
    if (!contents) {
      contents = entry.cell.createElement('CellContents');
      entry.cell.insertChildAt(contents, 0);
      inverse.push({ cmd: 'removeNode', node: contents });
    }

    // Una celda lleva un solo item: el contenido previo se desprende (su
    // inverso lo reinserta en su sitio) y el clon ocupa su lugar.
    for (const previous of contentItems(entry.cell)) {
      inverse.push(restore(detach(previous), previous));
    }

    const { clone } = insertCloneAt(ctx, contents, source, 0, undefined, taken);
    inverse.push({ cmd: 'removeNode', node: clone });
    fitToCell(clone, cellBox(rows, columns, anchor));
  }

  return right({ inverse, snapshotOut: true, cells: { done: plan.length, total } });
}

/**
 * Un Textbox en una celda no declara longitudes (las pone la celda, como BC);
 * el resto de items (Rectangle, Image, Line…) necesita `Top/Left` a 0 y el
 * tamaño de la celda. El clon es nuevo: el undo lo quita entero.
 */
function fitToCell(clone: RdlcNode, box: { width: Length; height: Length } | undefined): void {
  if (clone.tagName === 'Textbox') {
    for (const tag of ['Top', 'Left', 'Width', 'Height']) clone.child(tag)?.remove();
    return;
  }
  const zero: Length = { value: 0, unit: 'cm' };
  writeLength(clone, 'Top', zero);
  writeLength(clone, 'Left', zero);
  if (box) {
    writeLength(clone, 'Width', box.width);
    writeLength(clone, 'Height', box.height);
  }
}

/** Caja de rejilla de la celda (suma de las columnas/filas que cubre). */
function cellBox(
  rows: RdlcNode[],
  columns: RdlcNode[],
  anchor: CellAnchor,
): { width: Length; height: Length } | undefined {
  const { entry } = anchor;
  const widths = columns
    .slice(entry.col, entry.col + entry.colSpan)
    .map((column) => readLength(column, 'Width'));
  const heights = rows
    .slice(anchor.row, anchor.row + entry.rowSpan)
    .map((row) => readLength(row, 'Height'));
  if (widths.some((value) => !value) || heights.some((value) => !value)) return undefined;
  return { width: sumLengths(widths as Length[]), height: sumLengths(heights as Length[]) };
}

function sumLengths(lengths: Length[]): Length {
  const total = lengths.reduce((acc, length) => acc + toCm(length), 0);
  return fromCm(total, lengths[0]?.unit ?? 'cm');
}
