import type { RdlcNode } from '../tree/RdlcNode.js';

/**
 * Piezas del Tablix compartidas por la geometría (`resizeTablix`) y la
 * estructura (`tablixStructure`): rejilla del `TablixBody` y árboles de
 * miembros (`TablixRowHierarchy` / `TablixColumnHierarchy`).
 *
 * Invariante clave del modelo RDL: **cada hoja de la jerarquía es una fila o
 * columna del body, en orden de documento**. Los comandos de estructura
 * mantienen esa correspondencia.
 */

export function tablixColumns(tablix: RdlcNode): RdlcNode[] {
  return tablix.child('TablixBody')?.child('TablixColumns')?.children('TablixColumn') ?? [];
}

export function tablixRows(tablix: RdlcNode): RdlcNode[] {
  return tablix.child('TablixBody')?.child('TablixRows')?.children('TablixRow') ?? [];
}

export function tablixCells(row: RdlcNode): RdlcNode[] {
  return row.child('TablixCells')?.children('TablixCell') ?? [];
}

/** Espacio (`ColSpan`/`RowSpan`) de una celda; 1 si no declara nada. */
export function cellSpan(cell: RdlcNode, tag: 'ColSpan' | 'RowSpan'): number {
  const raw = cell.child('CellContents')?.child(tag)?.text();
  const value = raw ? Number.parseInt(raw, 10) : 1;
  return Number.isFinite(value) && value > 0 ? value : 1;
}

/** Celdas de una fila con su columna inicial y sus espacios. */
export interface PositionedCell {
  cell: RdlcNode;
  /** Posición de la celda en `TablixCells` (para insertar/quitar nodos). */
  index: number;
  col: number;
  colSpan: number;
  rowSpan: number;
  /**
   * Celda de **relleno**: una celda cubierta por el `ColSpan` de un ancla
   * anterior. BC/SSRS escriben una `TablixCell` por columna y las columnas
   * cubiertas van vacías; el editor no las pinta ni las selecciona.
   */
  placeholder: boolean;
}

/**
 * true si la fila sigue la convención **SSRS/BC** de una celda por columna: su
 * número de `TablixCell` coincide con el de columnas y hay algún `ColSpan` que
 * desborda la cuenta (las columnas cubiertas están rellenas de celdas vacías).
 * En ese caso la celda i vive en la columna i. El resto de filas usan la
 * convención del editor, que acumula los `ColSpan` de las anclas.
 *
 * `covered` son las columnas de esa fila cubiertas por un `RowSpan` de arriba
 * (ver `rowSpanCoverage`): una rellena por un `RowSpan` también delata la
 * convención SSRS/BC aunque no haya ningún `ColSpan` que desborde.
 */
export function usesSlotCells(
  row: RdlcNode,
  columnCount: number,
  covered?: readonly boolean[],
): boolean {
  const cells = tablixCells(row);
  if (cells.length !== columnCount) return false;
  let total = 0;
  for (const cell of cells) total += cellSpan(cell, 'ColSpan');
  return total !== columnCount || covered?.some(Boolean) === true;
}

/**
 * Columnas de la fila `rowIndex` cubiertas por el `RowSpan` de una celda de una
 * fila anterior (el cuerpo de una celda que baja de fila).
 */
export function rowSpanCoverage(
  rows: RdlcNode[],
  rowIndex: number,
  columnCount: number,
): boolean[] {
  const covered = new Array<boolean>(columnCount).fill(false);
  for (let index = 0; index < rowIndex; index += 1) {
    const row = rows[index];
    if (!row) continue;
    for (const entry of positionedCells(row, columnCount)) {
      if (entry.placeholder || entry.rowSpan <= 1 || index + entry.rowSpan <= rowIndex) continue;
      for (let column = entry.col; column < entry.col + entry.colSpan; column += 1) {
        if (column < columnCount) covered[column] = true;
      }
    }
  }
  return covered;
}

/**
 * Celdas de una fila con su columna de rejilla. Con `columnCount` se detecta la
 * convención SSRS/BC (ver `usesSlotCells`); sin él se asume la del editor (la
 * geometría coincide cuando no hay fusiones).
 */
export function positionedCells(
  row: RdlcNode,
  columnCount?: number,
  covered?: readonly boolean[],
): PositionedCell[] {
  const cells = tablixCells(row);
  const spans = cells.map((cell) => cellSpan(cell, 'ColSpan'));
  const total = spans.reduce((acc, span) => acc + span, 0);
  const bySlot =
    columnCount !== undefined &&
    cells.length === columnCount &&
    (total !== columnCount || covered?.some(Boolean) === true);

  const result: PositionedCell[] = [];
  let coveredUntil = 0;
  let col = 0;
  cells.forEach((cell, index) => {
    const colSpan = spans[index]!;
    const rowSpan = cellSpan(cell, 'RowSpan');
    if (bySlot) {
      const placeholder = index < coveredUntil;
      result.push({ cell, index, col: index, colSpan, rowSpan, placeholder });
      if (!placeholder) coveredUntil = index + colSpan;
      return;
    }
    result.push({ cell, index, col, colSpan, rowSpan, placeholder: false });
    col += colSpan;
  });
  return result;
}

/** Columna inicial de cada celda de una fila (para localizar celdas fusionadas). */
export function cellStartColumns(row: RdlcNode): number[] {
  return positionedCells(row).map((entry) => entry.col);
}

/* ---------------------------- jerarquías -------------------------------- */

function memberChildren(container: RdlcNode): RdlcNode[] {
  return container.children('TablixMember');
}

/** Raíz `TablixMembers` de la jerarquía de un eje (`row`/`column`). */
export function tablixHierarchy(tablix: RdlcNode, axis: 'row' | 'column'): RdlcNode | undefined {
  const hierarchy = axis === 'row' ? 'TablixRowHierarchy' : 'TablixColumnHierarchy';
  return tablix.child(hierarchy)?.child('TablixMembers');
}

/** Miembro en `path` (índices entre hermanos `TablixMember` en cada nivel). */
export function memberAt(root: RdlcNode, path: number[]): RdlcNode | undefined {
  let container = root;
  let member: RdlcNode | undefined;

  for (const index of path) {
    member = memberChildren(container)[index];
    if (!member) return undefined;
    const nested = member.child('TablixMembers');
    if (nested) container = nested;
  }

  return member;
}

/** Número de hojas bajo un miembro (él mismo si no tiene `TablixMembers`). */
export function leafCount(member: RdlcNode): number {
  const sub = member.child('TablixMembers');
  if (!sub) return 1;
  return memberChildren(sub).reduce((acc, child) => acc + leafCount(child), 0);
}

export interface LeafRef {
  member: RdlcNode;
  container: RdlcNode;
  index: number;
}

/** Miembro con su contenedor e índice en él (cadena raíz → hoja). */
export type MemberRef = LeafRef;

/**
 * Cadena de miembros desde la raíz hasta la hoja n-ésima (0-based), con el
 * contenedor y el índice de cada uno: el último elemento es la hoja.
 */
export function memberChainAt(
  hierarchy: RdlcNode | undefined,
  leaf: number,
): MemberRef[] | undefined {
  const root = hierarchy?.child('TablixMembers');
  if (!root || leaf < 0) return undefined;

  let remaining = leaf;
  const chain: MemberRef[] = [];
  const walk = (container: RdlcNode): boolean => {
    const children = memberChildren(container);
    for (let index = 0; index < children.length; index += 1) {
      const member = children[index]!;
      chain.push({ member, container, index });
      const sub = member.child('TablixMembers');
      if (sub) {
        if (walk(sub)) return true;
      } else if (remaining === 0) {
        return true;
      } else {
        remaining -= 1;
      }
      chain.pop();
    }
    return false;
  };

  return walk(root) ? chain : undefined;
}

/** Rango de hojas (0-based, inclusive) que cubre un miembro del árbol. */
export function memberLeafRange(
  hierarchy: RdlcNode | undefined,
  target: RdlcNode,
): { start: number; end: number } | undefined {
  const root = hierarchy?.child('TablixMembers');
  if (!root) return undefined;

  let leaf = 0;
  let found: { start: number; end: number } | undefined;
  const walk = (container: RdlcNode): void => {
    for (const member of memberChildren(container)) {
      if (found) return;
      if (member.equals(target)) {
        found = { start: leaf, end: leaf + leafCount(member) - 1 };
        return;
      }
      const nested = member.child('TablixMembers');
      if (nested) walk(nested);
      else leaf += 1;
    }
  };

  walk(root);
  return found;
}

/** Hoja n-ésima (0-based) del árbol, con su contenedor e índice. */
export function leafAt(hierarchy: RdlcNode | undefined, leaf: number): LeafRef | undefined {
  const root = hierarchy?.child('TablixMembers');
  if (!root || leaf < 0) return undefined;

  let remaining = leaf;
  let found: LeafRef | undefined;
  const walk = (container: RdlcNode): void => {
    const children = memberChildren(container);
    for (let index = 0; index < children.length; index += 1) {
      if (found) return;
      const member = children[index]!;
      const sub = member.child('TablixMembers');
      if (sub) walk(sub);
      else if (remaining === 0) found = { member, container, index };
      else remaining -= 1;
    }
  };
  walk(root);
  return found;
}

/**
 * Dónde insertar una hoja nueva para que sea la n-ésima (0..total): dentro del
 * grupo que contiene esa posición, o al final del nivel raíz si es la última.
 */
export function leafInsertionPoint(
  members: RdlcNode,
  leaf: number,
): { container: RdlcNode; index: number } {
  const children = memberChildren(members);
  let offset = 0;
  for (let index = 0; index < children.length; index += 1) {
    const member = children[index]!;
    const count = leafCount(member);
    if (leaf < offset + count) {
      const sub = member.child('TablixMembers');
      if (sub) return leafInsertionPoint(sub, leaf - offset);
      return { container: members, index };
    }
    offset += count;
  }
  return { container: members, index: children.length };
}

/** Total de hojas de un contenedor `TablixMembers` (o 0 si no existe). */
export function totalLeaves(members: RdlcNode | undefined): number {
  if (!members) return 0;
  return memberChildren(members).reduce((acc, child) => acc + leafCount(child), 0);
}
