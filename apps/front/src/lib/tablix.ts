import type { ItemDto, ProjectionDto, TablixDto, TablixMemberDto } from '@rdlc-designer/contracts';
import { flattenItems, toCm } from './projection';

/**
 * Geometría y estructura del Tablix en el front (F2 parte 3): cajas de celda
 * (con `ColSpan`/`RowSpan`), hit-test de celdas y el árbol de miembros que
 * alimenta el panel de estructura (cada hoja es una fila/columna).
 */

export interface TablixCellBox {
  row: number;
  col: number;
  rowSpan: number;
  colSpan: number;
  /** Rect en cm relativo al origen del Tablix. */
  x: number;
  y: number;
  width: number;
  height: number;
  content: ItemDto | null;
}

/** Celda seleccionada en el lienzo (estado de UI, no del documento). */
export interface SelectedCell {
  id: string;
  /** Ancla del rango (donde se empezó). */
  row: number;
  col: number;
  /** Foco del rango (Shift+click); sin él, es una sola celda. */
  endRow?: number;
  endCol?: number;
  /** Celdas añadidas con Ctrl+click (fuera del rectángulo). */
  extra?: { row: number; col: number }[];
}

export interface CellRange {
  row0: number;
  row1: number;
  col0: number;
  col1: number;
}

/** Celda de un Tablix (id del Tablix + posición en la rejilla). */
export interface CellRef {
  id: string;
  row: number;
  col: number;
}

/** Rectángulo normalizado de una selección de celdas. */
export function cellRange(selection: SelectedCell): CellRange {
  return {
    row0: Math.min(selection.row, selection.endRow ?? selection.row),
    row1: Math.max(selection.row, selection.endRow ?? selection.row),
    col0: Math.min(selection.col, selection.endCol ?? selection.col),
    col1: Math.max(selection.col, selection.endCol ?? selection.col),
  };
}

/**
 * Rectángulo que cubre **todas** las celdas seleccionadas (las sueltas de
 * Ctrl+click incluidas), a diferencia de `cellRange`, que solo mira el
 * rectángulo ancla→foco.
 */
export function selectionBounds(selection: SelectedCell): CellRange {
  const cells = selectionCells(selection);
  const rows = cells.map((cell) => cell.row);
  const cols = cells.map((cell) => cell.col);
  return {
    row0: Math.min(...rows),
    row1: Math.max(...rows),
    col0: Math.min(...cols),
    col1: Math.max(...cols),
  };
}

export function rangeRows(range: CellRange): number {
  return range.row1 - range.row0 + 1;
}

export function rangeCols(range: CellRange): number {
  return range.col1 - range.col0 + 1;
}

/** true si la celda cae dentro del rango seleccionado (el rectángulo). */
export function isCellInRange(
  cell: { row: number; col: number },
  selection: SelectedCell,
): boolean {
  const range = cellRange(selection);
  return (
    cell.row >= range.row0 &&
    cell.row <= range.row1 &&
    cell.col >= range.col0 &&
    cell.col <= range.col1
  );
}

/**
 * true si la celda forma parte de la selección: el rectángulo ancla→foco
 * **o** las añadidas con Ctrl+click (que pueden quedar fuera de él).
 */
export function isCellSelected(
  cell: { row: number; col: number },
  selection: SelectedCell,
): boolean {
  if (isCellInRange(cell, selection)) return true;
  return (selection.extra ?? []).some((entry) => entry.row === cell.row && entry.col === cell.col);
}

/**
 * Celda (del tablix seleccionado) que está en la cadena de celdas que
 * atraviesa un hit. Con tablixes anidados la cadena trae las celdas de fuera a
 * dentro, así que el click derecho dentro de la selección no la pierde aunque
 * el elemento más interno pertenezca a otra tabla.
 */
export function hitSelectionCell(
  cells: CellRef[] | undefined,
  selection: SelectedCell | null,
): CellRef | undefined {
  if (!cells || !selection) return undefined;
  return cells.find((cell) => cell.id === selection.id && isCellSelected(cell, selection));
}

/** Todas las celdas seleccionadas: el rectángulo + las añadidas con Ctrl. */
export function selectionCells(selection: SelectedCell): { row: number; col: number }[] {
  const range = cellRange(selection);
  const cells: { row: number; col: number }[] = [];
  for (let row = range.row0; row <= range.row1; row += 1) {
    for (let col = range.col0; col <= range.col1; col += 1) {
      cells.push({ row, col });
    }
  }
  for (const extra of selection.extra ?? []) {
    if (!isCellInRange(extra, selection)) cells.push(extra);
  }
  return cells;
}

/** Filas tocadas por la selección (únicas y ordenadas). */
export function selectionRows(selection: SelectedCell): number[] {
  return [...new Set(selectionCells(selection).map((cell) => cell.row))].sort((a, b) => a - b);
}

/** Columnas tocadas por la selección (únicas y ordenadas). */
export function selectionCols(selection: SelectedCell): number[] {
  return [...new Set(selectionCells(selection).map((cell) => cell.col))].sort((a, b) => a - b);
}

/** true si las celdas seleccionadas forman un rectángulo completo (fusión). */
export function isRectangleSelection(selection: SelectedCell): boolean {
  const range = cellRange(selection);
  return selectionCells(selection).length === rangeRows(range) * rangeCols(range);
}

/**
 * Elegibilidad de fusión: las celdas seleccionadas forman un **tramo contiguo
 * de una misma fila**. Da igual cómo se seleccionaran: con Shift+click (rango)
 * o con Ctrl+click (sueltas); los bloques que tocan varias filas se rechazan
 * porque descartarían el contenido de las celdas de abajo.
 */
export function canMergeSelection(selection: SelectedCell): boolean {
  const cells = selectionCells(selection);
  if (cells.length < 2) return false;

  const row = cells[0]!.row;
  if (cells.some((cell) => cell.row !== row)) return false;

  const cols = cells.map((cell) => cell.col).sort((a, b) => a - b);
  return cols.every((col, index) => index === 0 || col === cols[index - 1]! + 1);
}

/** Etiqueta de índices 0-based: `1–3` si son contiguos, `1, 3` si no. */
export function formatIndexList(indexes: number[]): string {
  if (indexes.length === 0) return '';
  const numbers = indexes.map((index) => index + 1);
  const contiguous = indexes.every((index, position) => index === indexes[0]! + position);
  return contiguous ? `${numbers[0]}–${numbers[numbers.length - 1]}` : numbers.join(', ');
}

export interface TablixLayout {
  columns: number[];
  rows: number[];
  cells: TablixCellBox[];
  /** Desplazamiento de la rejilla por las cabeceras (cm). */
  offset: { x: number; y: number };
  /** Ancho/alto **totales** (cabeceras + rejilla). */
  width: number;
  height: number;
}

/**
 * Cajas de todas las celdas (cm, relativas al Tablix) y medidas **totales**.
 * Las cabeceras (`TablixHeader`/`TablixCorner`) van fuera del body y desplazan
 * la rejilla: las cajas de celda ya salen con ese desplazamiento sumado.
 */
export function tablixLayout(tablix: TablixDto): TablixLayout {
  const columns = tablix.body.columns.map(toCm);
  const rows = tablix.body.rows.map((row) => toCm(row.height));
  const offset = {
    x: sum((tablix.headers?.rows ?? []).map((band) => toCm(band.size))),
    y: sum((tablix.headers?.columns ?? []).map((band) => toCm(band.size))),
  };
  const columnOffsets = cumulative(columns).map((value) => value + offset.x);
  const rowOffsets = cumulative(rows).map((value) => value + offset.y);

  const cells: TablixCellBox[] = [];
  tablix.body.rows.forEach((row, rowIndex) => {
    let col = 0;
    for (const cell of row.cells) {
      const colSpan = cell.colSpan ?? 1;
      const rowSpan = cell.rowSpan ?? 1;
      const x = columnOffsets[col] ?? 0;
      const y = rowOffsets[rowIndex] ?? 0;
      cells.push({
        row: rowIndex,
        col,
        colSpan,
        rowSpan,
        x,
        y,
        width: sum(columns.slice(col, col + colSpan)),
        height: sum(rows.slice(rowIndex, rowIndex + rowSpan)),
        content: cell.content,
      });
      col += colSpan;
    }
  });

  return {
    columns,
    rows,
    cells,
    offset,
    width: sum(columns) + offset.x,
    height: sum(rows) + offset.y,
  };
}

/** Hueco de una banda de cabecera (miembro con `TablixHeader`), ocupado o no. */
export interface TablixHeaderSlotBox {
  axis: 'row' | 'column';
  path: number[];
  /** Rect en cm relativo al origen del Tablix. */
  x: number;
  y: number;
  width: number;
  height: number;
  content: ItemDto | null;
}

/** Hueco de la esquina (`TablixCorner`), ocupado o no. */
export interface TablixCornerSlotBox {
  row: number;
  col: number;
  x: number;
  y: number;
  width: number;
  height: number;
  content: ItemDto | null;
}

export interface TablixHeaderSlots {
  headers: TablixHeaderSlotBox[];
  corners: TablixCornerSlotBox[];
}

/**
 * Cajas de todas las celdas de cabecera y esquina (cm, relativas al Tablix),
 * incluidas las **vacías**: son los destinos de «Insertar» (G8). La geometría
 * sale del `members` de cada banda (`path`/`start`/`span`) y de las medidas de
 * las bandas, igual que en la proyección.
 */
export function tablixHeaderSlots(tablix: TablixDto): TablixHeaderSlots {
  const headers = tablix.headers;
  if (!headers) return { headers: [], corners: [] };

  const columns = tablix.body.columns.map(toCm);
  const rows = tablix.body.rows.map((row) => toCm(row.height));
  const offsetLeft = sum(headers.rows.map((band) => toCm(band.size)));
  const offsetTop = sum(headers.columns.map((band) => toCm(band.size)));

  const headerSlots: TablixHeaderSlotBox[] = [];

  let bandTop = 0;
  for (const band of headers.columns) {
    band.members?.forEach((member, index) => {
      headerSlots.push({
        axis: 'column',
        path: member.path,
        x: offsetLeft + sum(columns.slice(0, member.start)),
        y: bandTop,
        width: sum(columns.slice(member.start, member.start + member.span)),
        height: toCm(band.size),
        content: band.cells[index] ?? null,
      });
    });
    bandTop += toCm(band.size);
  }

  let bandLeft = 0;
  for (const band of headers.rows) {
    band.members?.forEach((member, index) => {
      headerSlots.push({
        axis: 'row',
        path: member.path,
        x: bandLeft,
        y: offsetTop + sum(rows.slice(0, member.start)),
        width: toCm(band.size),
        height: sum(rows.slice(member.start, member.start + member.span)),
        content: band.cells[index] ?? null,
      });
    });
    bandLeft += toCm(band.size);
  }

  const corners: TablixCornerSlotBox[] = [];
  let cornerTop = 0;
  headers.columns.forEach((columnBand, row) => {
    let cornerLeft = 0;
    headers.rows.forEach((rowBand, col) => {
      corners.push({
        row,
        col,
        x: cornerLeft,
        y: cornerTop,
        width: toCm(rowBand.size),
        height: toCm(columnBand.size),
        content: headers.corner[row]?.[col] ?? null,
      });
      cornerLeft += toCm(rowBand.size);
    });
    cornerTop += toCm(columnBand.size);
  });

  return { headers: headerSlots, corners };
}

/** Celda que contiene el punto (cm, relativo al Tablix). */
export function findCellAt(tablix: TablixDto, x: number, y: number): TablixCellBox | undefined {
  const layout = tablixLayout(tablix);
  return layout.cells.find(
    (cell) => x >= cell.x && x <= cell.x + cell.width && y >= cell.y && y <= cell.y + cell.height,
  );
}

/** Celda por su ancla (fila, columna) en la rejilla. */
export function cellBoxAt(tablix: TablixDto, row: number, col: number): TablixCellBox | undefined {
  return tablixLayout(tablix).cells.find((cell) => cell.row === row && cell.col === col);
}

export interface TablixTreeEntry {
  /**
   * `group` = miembro dinámico (con `expression`) o contenedor con hijos;
   * `row` = hoja estática. Un **grupo hoja** (sin hijos) es las dos cosas: se
   * clasifica por `expression` (lecciones del ida/vuelta con RB) y trae `index`
   * porque **es** una fila/columna del body.
   */
  kind: 'group' | 'row';
  /** Profundidad en el árbol (indentación del panel). */
  depth: number;
  path: number[];
  expression?: string;
  total: 'none' | 'before' | 'after';
  hidden?: boolean | string;
  /** Hojas (filas/columnas del body, 0-based), también en grupos hoja. */
  index?: number;
  /** Rango de hojas que cubre la entrada (0-based, inclusive). */
  leafStart: number;
  leafEnd: number;
  /** Miembro de la proyección del que sale la entrada (diálogo de propiedades). */
  member: TablixMemberDto;
}

/** Hojas (filas/columnas) que cubre un miembro del árbol. */
function memberLeafCount(member: TablixMemberDto): number {
  if (member.children.length === 0) return 1;
  return member.children.reduce((total, child) => total + memberLeafCount(child), 0);
}

/** Árbol de la jerarquía aplanado para el panel (grupos + hojas con su índice). */
export function tablixTree(members: TablixMemberDto[]): TablixTreeEntry[] {
  const entries: TablixTreeEntry[] = [];
  let leaf = 0;

  const walk = (list: TablixMemberDto[], depth: number): void => {
    for (const member of list) {
      const isLeaf = member.children.length === 0;
      const leafStart = leaf;
      const leafEnd = leafStart + memberLeafCount(member) - 1;
      const base = {
        depth,
        path: member.path,
        member,
        leafStart,
        leafEnd,
        total: member.total,
        ...(member.expression !== undefined ? { expression: member.expression } : {}),
        ...(member.hidden !== undefined ? { hidden: member.hidden } : {}),
      };
      if (member.expression !== undefined || !isLeaf) {
        entries.push({ kind: 'group', ...base, ...(isLeaf ? { index: leafStart } : {}) });
      } else {
        entries.push({ kind: 'row', ...base, index: leafStart });
      }
      if (isLeaf) leaf += 1;
      else walk(member.children, depth + 1);
    }
  };

  walk(members, 0);
  return entries;
}

/**
 * Árbol de filas/columnas aunque la proyección no traiga jerarquía (ficheros
 * antiguos): en ese caso cada fila/columna es una hoja suelta.
 */
export function tablixRowsTree(tablix: TablixDto): TablixTreeEntry[] {
  const tree = tablixTree(tablix.rowHierarchy);
  if (tree.length > 0) return tree;
  return tablix.body.rows.map((_, index) => ({
    kind: 'row' as const,
    depth: 0,
    path: [index],
    member: { path: [index], total: 'none' as const, children: [] },
    total: 'none' as const,
    index,
    leafStart: index,
    leafEnd: index,
  }));
}

export function tablixColumnsTree(tablix: TablixDto): TablixTreeEntry[] {
  const tree = tablixTree(tablix.columnHierarchy);
  if (tree.length > 0) return tree;
  return tablix.body.columns.map((_, index) => ({
    kind: 'row' as const,
    depth: 0,
    path: [index],
    member: { path: [index], total: 'none' as const, children: [] },
    total: 'none' as const,
    index,
    leafStart: index,
    leafEnd: index,
  }));
}

/** Cadena de miembros que contiene la hoja (de fuera a dentro; incluye la hoja). */
export function memberChain(
  tablix: TablixDto,
  axis: 'row' | 'column',
  index: number,
): TablixMemberDto[] | undefined {
  const members = axis === 'row' ? tablix.rowHierarchy : tablix.columnHierarchy;
  let remaining = index;
  const chain: TablixMemberDto[] = [];

  const walk = (list: TablixMemberDto[]): boolean => {
    for (const member of list) {
      chain.push(member);
      if (member.children.length > 0) {
        if (walk(member.children)) return true;
      } else if (remaining === 0) {
        return true;
      } else {
        remaining -= 1;
      }
      chain.pop();
    }
    return false;
  };

  return walk(members) ? chain : undefined;
}

/**
 * Grupo **contenedor** (con hijos) más interno que contiene la hoja: el que
 * define «dentro/fuera del grupo» en el menú contextual. `undefined` si la
 * fila no está dentro de un grupo.
 */
export function containerGroupPath(
  tablix: TablixDto,
  axis: 'row' | 'column',
  index: number,
): number[] | undefined {
  const chain = memberChain(tablix, axis, index);
  if (!chain) return undefined;
  // Sin la propia hoja: un grupo hoja no «contiene» su fila, ES su fila.
  const group = [...chain.slice(0, -1)].reverse().find((member) => member.expression !== undefined);
  return group?.path;
}

/**
 * Grupo más interno que **posee** la hoja (incluye el propio grupo hoja): el
 * destino de «Propiedades del grupo» para esa fila.
 */
export function memberForLeafGroup(
  tablix: TablixDto,
  axis: 'row' | 'column',
  index: number,
): TablixMemberDto | undefined {
  const chain = memberChain(tablix, axis, index);
  if (!chain) return undefined;
  return [...chain].reverse().find((member) => member.expression !== undefined);
}

function cumulative(values: number[]): number[] {
  const offsets: number[] = [];
  let total = 0;
  for (const value of values) {
    offsets.push(total);
    total += value;
  }
  return offsets;
}

function sum(values: number[]): number {
  return values.reduce((acc, value) => acc + value, 0);
}

/**
 * Tablix **más interno** que contiene el item (a cualquier nivel: rectángulos
 * y celdas). Lo usa el panel de estructura al seleccionar contenido de una
 * celda o un elemento anidado.
 */
export function findOwnerTablix(projection: ProjectionDto, id: string): TablixDto | undefined {
  const tablixes = flattenItems(projection).filter(
    (item): item is TablixDto => item.kind === 'tablix',
  );
  // Si el propio id es un Tablix (p. ej. una celda seleccionada), manda él.
  const self = tablixes.find((tablix) => tablix.id === id);
  if (self) return self;

  // Al revés: los Tablix anidados aparecen después que sus contenedores.
  for (let index = tablixes.length - 1; index >= 0; index -= 1) {
    const tablix = tablixes[index]!;
    for (const row of tablix.body.rows) {
      for (const cell of row.cells) {
        if (cell?.content && itemContains(cell.content, id)) return tablix;
      }
    }
  }
  return undefined;
}

function itemContains(root: ItemDto, id: string): boolean {
  if (root.id === id) return true;
  if (root.kind === 'rectangle') return root.children.some((child) => itemContains(child, id));
  if (root.kind === 'tablix') {
    return root.body.rows.some((row) =>
      row.cells.some((cell) => Boolean(cell?.content && itemContains(cell.content, id))),
    );
  }
  return false;
}
