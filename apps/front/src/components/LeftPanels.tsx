import type { ProjectionDto } from '@rdlc-designer/contracts';
import type { ReactNode } from 'react';
import { HierarchyPanel } from '@/components/panels/HierarchyPanel';
import { VariablesPanel } from '@/components/panels/VariablesPanel';
import type { SelectedCell } from '@/lib/tablix';

export interface LeftPanelsProps {
  projection: ProjectionDto | null;
  showHierarchy: boolean;
  showVariables: boolean;
  selectedId: string | null;
  selectedCell: SelectedCell | null;
  onSelectItem: (id: string) => void;
  onSelectCell: (cell: SelectedCell) => void;
  onPickExpression: (expression: string, name: string) => void;
}

/** Asides de la izquierda (Jerarquía y Variables), visibles por toggle. */
export function LeftPanels({
  projection,
  showHierarchy,
  showVariables,
  selectedId,
  selectedCell,
  onSelectItem,
  onSelectCell,
  onPickExpression,
}: LeftPanelsProps): ReactNode {
  if (!projection) return null;
  return (
    <>
      {showHierarchy ? (
        <aside className="flex w-64 shrink-0 flex-col overflow-hidden border-r bg-background">
          <HierarchyPanel
            projection={projection}
            selectedId={selectedId}
            selectedCell={selectedCell}
            onSelectItem={onSelectItem}
            onSelectCell={onSelectCell}
          />
        </aside>
      ) : null}
      {showVariables ? (
        <aside className="flex w-72 shrink-0 flex-col overflow-hidden border-r bg-background">
          <VariablesPanel meta={projection.meta} onPick={onPickExpression} />
        </aside>
      ) : null}
    </>
  );
}
