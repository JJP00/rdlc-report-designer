import type { RdlcCommand, TablixFilterDto } from '@rdlc-designer/contracts';
import { left, right, type Either } from '../../../shared/either.js';
import { CommandRejectedError, type DomainError } from '../../../shared/domainError.js';
import { insertCanonical } from '../geometry/geometry.js';
import type { RdlcNode } from '../tree/RdlcNode.js';
import type { CommandContext, CommandOutcome } from './CommandContext.js';
import { detach, restore } from './nodeChanges.js';

export type SetTablixFiltersCommand = Extract<RdlcCommand, { cmd: 'setTablixFilters' }>;

/**
 * Reemplaza los filtros del Tablix (`Filters > Filter`). El bloque entero se
 * reconstruye en orden canónico: el inverso **devuelve el nodo original** a su
 * índice exacto (undo byte-exacto aunque el fichero no siga el orden canónico).
 * Una lista vacía quita el bloque.
 */
export function applySetTablixFilters(
  ctx: CommandContext,
  command: SetTablixFiltersCommand,
): Either<DomainError, CommandOutcome> {
  const tablix = ctx.index.get(command.id);
  if (!tablix) return left(CommandRejectedError.create(`No existe el elemento '${command.id}'`));
  if (tablix.tagName !== 'Tablix') {
    return left(CommandRejectedError.create(`'${command.id}' no es un Tablix`));
  }

  for (const filter of command.filters) {
    const expression = filter.expression.trim();
    if (expression === '' || expression === '=') {
      return left(CommandRejectedError.create('La expresión del filtro no puede estar vacía'));
    }
  }

  const existing = tablix.child('Filters');

  if (command.filters.length === 0) {
    if (!existing) return right({ inverse: [], snapshotOut: true });
    const position = detach(existing);
    return right({ inverse: [restore(position, existing)], snapshotOut: true });
  }

  const created = buildFilters(tablix, command.filters);
  if (existing) {
    const position = detach(existing);
    tablix.insertChildAt(created, position.index);
    return right({
      inverse: [restore(position, existing), { cmd: 'removeNode', node: created }],
      snapshotOut: true,
    });
  }

  insertCanonical(tablix, 'Filters', created);
  return right({ inverse: [{ cmd: 'removeNode', node: created }], snapshotOut: true });
}

/** Subárbol `<Filters>` canónico desde la lista del contrato. */
function buildFilters(tablix: RdlcNode, filters: TablixFilterDto[]): RdlcNode {
  const container = tablix.createElement('Filters');
  for (const filter of filters) {
    const node = container.createElement('Filter');
    node.appendChild(node.createElement('FilterExpression', filter.expression));
    node.appendChild(node.createElement('Operator', filter.operator));
    const values = container.createElement('FilterValues');
    for (const value of filter.values) {
      values.appendChild(values.createElement('FilterValue', value));
    }
    node.appendChild(values);
    container.appendChild(node);
  }
  return container;
}
