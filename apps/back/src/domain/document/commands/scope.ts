import type { ScopeRef } from '@rdlc-designer/contracts';
import { childOrCreate } from '../geometry/geometry.js';
import type { RdlcNode } from '../tree/RdlcNode.js';
import type { CommandContext } from './CommandContext.js';
import { memberAt, tablixHierarchy } from './tablixParts.js';

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
  const row = ctx.index
    .get(scope.id)
    ?.child('TablixBody')
    ?.child('TablixRows')
    ?.children('TablixRow')[scope.row];
  return row?.child('TablixCells')?.children('TablixCell')[scope.col];
}

function section(ctx: CommandContext): RdlcNode | undefined {
  return ctx.root.child('ReportSections')?.child('ReportSection');
}

function regionItems(region: RdlcNode | undefined): RdlcNode | undefined {
  return region ? childOrCreate(region, 'ReportItems') : undefined;
}
