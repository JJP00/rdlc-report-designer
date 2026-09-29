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
  col: number;
  colSpan: number;
  rowSpan: number;
}

export function positionedCells(row: RdlcNode): PositionedCell[] {
  const result: PositionedCell[] = [];
  let col = 0;
  for (const cell of tablixCells(row)) {
    const colSpan = cellSpan(cell, 'ColSpan');
    result.push({ cell, col, colSpan, rowSpan: cellSpan(cell, 'RowSpan') });
    col += colSpan;
  }
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
