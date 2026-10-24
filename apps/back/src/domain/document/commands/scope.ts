import type { ScopeRef } from '@rdlc-designer/contracts';
import { childOrCreate, readLength } from '../geometry/geometry.js';
import { fromCm, toCm, type Length } from '../style/Length.js';
import type { RdlcNode } from '../tree/RdlcNode.js';
import type { CommandContext } from './CommandContext.js';
import {
  cellSpan,
  memberAt,
  positionedCells,
  tablixColumns,
  tablixHierarchy,
  tablixRows,
} from './tablixParts.js';

/**
 * Resuelve el contenedor real de un scope: siempre devuelve el nodo donde se
 * insertan los items (`ReportItems` o `CellContents`), creándolo si falta.
 */
export function resolveScope(ctx: CommandContext, scope: ScopeRef): RdlcNode | undefined {
  switch (scope.kind) {
    case 'body':
      return regionItems(section(ctx)?.child('Body'));
    case 'pageHeader':
      return regionItems(section(ctx)?.child('Page')?.child('PageHeader'));
    case 'pageFooter':
      return regionItems(section(ctx)?.child('Page')?.child('PageFooter'));
    case 'rectangle': {
      const node = ctx.index.get(scope.id);
      return node ? childOrCreate(node, 'ReportItems') : undefined;
    }
    case 'tablixCell': {
      const cell = tablixCellAt(ctx, scope);
      return cell ? childOrCreate(cell, 'CellContents') : undefined;
    }
    // Cabeceras y esquina: la `CellContents` tiene que existir (si el miembro
    // no tiene `TablixHeader`/esquina, el scope no resuelve y el comando
    // rechaza con motivo; crear la cabecera es otra operación).
    case 'tablixHeader':
    case 'tablixCorner':
      return findScope(ctx, scope);
  }
}

/**
 * Como `resolveScope` pero **sin crear nada**: devuelve el contenedor solo si
 * ya existe (los comandos que necesitan deshacer la creación lo usan para
 * saber si tienen que quitar el contenedor en su inverso).
 */
export function findScope(ctx: CommandContext, scope: ScopeRef): RdlcNode | undefined {
  switch (scope.kind) {
    case 'body':
      return section(ctx)?.child('Body')?.child('ReportItems');
    case 'pageHeader':
      return section(ctx)?.child('Page')?.child('PageHeader')?.child('ReportItems');
    case 'pageFooter':
      return section(ctx)?.child('Page')?.child('PageFooter')?.child('ReportItems');
    case 'rectangle':
      return ctx.index.get(scope.id)?.child('ReportItems');
    case 'tablixCell':
      return tablixCellAt(ctx, scope)?.child('CellContents');
    case 'tablixHeader': {
      const tablix = ctx.index.get(scope.id);
      const members = tablix ? tablixHierarchy(tablix, scope.axis) : undefined;
      const member = members ? memberAt(members, scope.path) : undefined;
      return member?.child('TablixHeader')?.child('CellContents');
    }
    case 'tablixCorner': {
      const tablix = ctx.index.get(scope.id);
      const row = tablix
        ?.child('TablixCorner')
        ?.child('TablixCornerRows')
        ?.children('TablixCornerRow')[scope.row];
      const cell = row?.children('TablixCornerCell')[scope.col];
      return cell?.child('CellContents');
    }
  }
}

function tablixCellAt(
  ctx: CommandContext,
  scope: Extract<ScopeRef, { kind: 'tablixCell' }>,
): RdlcNode | undefined {
  const tablix = ctx.index.get(scope.id);
  const row = tablix?.child('TablixBody')?.child('TablixRows')?.children('TablixRow')[scope.row];
  if (!tablix || !row) return undefined;
  // `scope.col` es la **columna de rejilla** (con los `ColSpan` acumulados): el
  // ancla que la cubre puede no estar en ese índice del array (BC/SSRS rellena
  // las columnas cubiertas con celdas vacías).
  return positionedCells(row, tablixColumns(tablix).length).find(
    (entry) => entry.col === scope.col && !entry.placeholder,
  )?.cell;
}

/**
 * Caja de una celda del body (ancho de las columnas y alto de las filas que
 * cubre, con `ColSpan`/`RowSpan`). `undefined` si la celda no existe o la
 * rejilla no declara alguna de esas medidas.
 */
export function tablixCellBox(
  ctx: CommandContext,
  scope: Extract<ScopeRef, { kind: 'tablixCell' }>,
): { width: Length; height: Length } | undefined {
  const cell = tablixCellAt(ctx, scope);
  const tablix = ctx.index.get(scope.id);
  if (!cell || !tablix) return undefined;

  const span = (
    nodes: RdlcNode[],
    start: number,
    count: number,
    tag: 'Width' | 'Height',
  ): Length | undefined => {
    const covered = nodes.slice(start, start + count);
    if (covered.length === 0) return undefined;
    let total = 0;
    for (const node of covered) {
      const length = readLength(node, tag);
      if (!length) return undefined;
      total += toCm(length);
    }
    return fromCm(total);
  };

  const width = span(tablixColumns(tablix), scope.col, cellSpan(cell, 'ColSpan'), 'Width');
  const height = span(tablixRows(tablix), scope.row, cellSpan(cell, 'RowSpan'), 'Height');
  return width && height ? { width, height } : undefined;
}

function section(ctx: CommandContext): RdlcNode | undefined {
  return ctx.root.child('ReportSections')?.child('ReportSection');
}

function regionItems(region: RdlcNode | undefined): RdlcNode | undefined {
  return region ? childOrCreate(region, 'ReportItems') : undefined;
}
