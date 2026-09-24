import type { TablixDto } from '@rdlc-designer/contracts';
import { tablixLayout, type TablixCellBox } from './tablix';

/**
 * Rejilla del Tablix en **segmentos** (cm, relativos al Tablix). Las fronteras
 * que una celda fusionada cruza no se dibujan: dentro de una celda con
 * `ColSpan`/`RowSpan` no hay línea, como en Report Builder. Así una celda
 * fusionada se ve como una caja continua y no como varias celdas.
 */

export interface GridSegment {
  /** Coordenada fija del segmento (x si es vertical, y si es horizontal). */
  fixed: number;
  from: number;
  to: number;
}

export function tablixGrid(tablix: TablixDto): {
  vertical: GridSegment[];
  horizontal: GridSegment[];
} {
  const layout = tablixLayout(tablix);
  const columnEdges = edges(layout.columns);
  const rowEdges = edges(layout.rows);
  const { cells } = layout;

  const coversRow = (cell: TablixCellBox, row: number): boolean =>
    cell.row <= row && row < cell.row + cell.rowSpan;
  const coversColumn = (cell: TablixCellBox, col: number): boolean =>
    cell.col <= col && col < cell.col + cell.colSpan;
  const crossesColumn = (cell: TablixCellBox, boundary: number): boolean =>
    cell.col < boundary && boundary < cell.col + cell.colSpan;
  const crossesRow = (cell: TablixCellBox, boundary: number): boolean =>
    cell.row < boundary && boundary < cell.row + cell.rowSpan;

  // Verticales: para cada frontera de columna, un segmento por tramo de filas
  // sin ninguna celda que la cruce.
  const vertical: GridSegment[] = [];
  for (let boundary = 1; boundary < columnEdges.length; boundary += 1) {
    pushVertical(vertical, columnEdges[boundary]!, rowEdges, (row) =>
      cells.some((cell) => coversRow(cell, row) && crossesColumn(cell, boundary)),
    );
  }

  // Horizontales: para cada frontera de fila, un segmento por tramo de columnas.
  const horizontal: GridSegment[] = [];
  for (let boundary = 1; boundary < rowEdges.length; boundary += 1) {
    pushHorizontal(horizontal, rowEdges[boundary]!, columnEdges, (col) =>
      cells.some((cell) => coversColumn(cell, col) && crossesRow(cell, boundary)),
    );
  }

  return { vertical, horizontal };
}

/** [0, acumulados…]: borde inicial de cada columna/fila. */
function edges(values: number[]): number[] {
  const result = [0];
  let total = 0;
  for (const value of values) {
    total += value;
    result.push(round4(total));
  }
  return result;
}

function pushVertical(
  out: GridSegment[],
  x: number,
  rowEdges: number[],
  crossed: (row: number) => boolean,
): void {
  let start: number | null = null;
  for (let row = 0; row < rowEdges.length - 1; row += 1) {
    if (crossed(row)) {
      if (start !== null) {
        out.push({ fixed: x, from: start, to: rowEdges[row]! });
        start = null;
      }
    } else if (start === null) {
      start = rowEdges[row]!;
    }
  }
  if (start !== null) out.push({ fixed: x, from: start, to: rowEdges[rowEdges.length - 1]! });
}

function pushHorizontal(
  out: GridSegment[],
  y: number,
  columnEdges: number[],
  crossed: (col: number) => boolean,
): void {
  let start: number | null = null;
  for (let col = 0; col < columnEdges.length - 1; col += 1) {
    if (crossed(col)) {
      if (start !== null) {
        out.push({ fixed: y, from: start, to: columnEdges[col]! });
        start = null;
      }
    } else if (start === null) {
      start = columnEdges[col]!;
    }
  }
  if (start !== null) out.push({ fixed: y, from: start, to: columnEdges[columnEdges.length - 1]! });
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}
