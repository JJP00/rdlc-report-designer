import type { ItemDto, ProjectionDto } from '@rdlc-designer/contracts';
import { useMemo } from 'react';
import { findItem } from '@/lib/projection';
import { selectionCells, type SelectedCell } from '@/lib/tablix';

/**
 * Qué edita el panel de lote (U3): la multiselección de items o, si lo que hay
 * seleccionado es un **rango de celdas**, los contenidos de esas celdas (para
 * editar su estilo/visibilidad a la vez aunque la celda esté anclada).
 */
export interface BatchSelection {
  /** Items a editar en lote. */
  items: ItemDto[];
  /** Movibles (solo items; el contenido de una celda lo fija la celda). */
  movableIds: string[];
  /** El lote viene de celdas seleccionadas (la cabecera dice «N celdas»). */
  fromCells: boolean;
}

export function useBatchSelection(options: {
  projection: ProjectionDto | null;
  selectedIds: string[];
  /** Items completos de la multiselección de items. */
  selectedItems: ItemDto[];
  movableIds: string[];
  selectedCell: SelectedCell | null;
}): BatchSelection {
  const { projection, selectedIds, selectedItems, movableIds, selectedCell } = options;

  const cellContents = useMemo(() => {
    if (!projection || !selectedCell || selectedIds.length > 0) return [];
    const tablix = findItem(projection, selectedCell.id);
    if (tablix?.kind !== 'tablix') return [];
    const contents = [];
    for (const { row, col } of selectionCells(selectedCell)) {
      const content = tablix.body?.rows[row]?.cells[col]?.content;
      if (content) contents.push(content);
    }
    return contents;
  }, [projection, selectedCell, selectedIds]);

  if (selectedItems.length > 1) return { items: selectedItems, movableIds, fromCells: false };
  if (cellContents.length > 1) return { items: cellContents, movableIds: [], fromCells: true };
  return { items: [], movableIds: [], fromCells: false };
}
