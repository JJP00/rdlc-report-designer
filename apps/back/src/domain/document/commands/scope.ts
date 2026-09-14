import type { ScopeRef } from '@rdlc-designer/contracts';
import { childOrCreate } from '../geometry/geometry.js';
import type { RdlcNode } from '../tree/RdlcNode.js';
import type { CommandContext } from './CommandContext.js';

/**
 * Resuelve el contenedor real de un scope: siempre devuelve el nodo donde se
 * insertan los items (`ReportItems` o `CellContents`), creándolo si falta.
 */
export function resolveScope(ctx: CommandContext, scope: ScopeRef): RdlcNode | undefined {
  switch (scope.kind) {
    case 'body':
      return regionItems(ctx, section(ctx)?.child('Body'));
    case 'pageHeader':
      return regionItems(ctx, section(ctx)?.child('Page')?.child('PageHeader'));
    case 'pageFooter':
      return regionItems(ctx, section(ctx)?.child('Page')?.child('PageFooter'));
    case 'rectangle': {
      const node = ctx.index.get(scope.id);
      return node ? childOrCreate(node, 'ReportItems') : undefined;
    }
    case 'tablixCell': {
      const row = ctx.index
        .get(scope.id)
        ?.child('TablixBody')
        ?.child('TablixRows')
        ?.children('TablixRow')[scope.row];
      const cell = row?.child('TablixCells')?.children('TablixCell')[scope.col];
      return cell ? childOrCreate(cell, 'CellContents') : undefined;
    }
  }
}

function section(ctx: CommandContext): RdlcNode | undefined {
  return ctx.root.child('ReportSections')?.child('ReportSection');
}

function regionItems(
  ctx: CommandContext,
  region: RdlcNode | undefined,
): RdlcNode | undefined {
  return region ? childOrCreate(region, 'ReportItems') : undefined;
}
