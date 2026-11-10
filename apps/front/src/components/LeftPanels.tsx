import type { ProjectionDto } from '@rdlc-designer/contracts';
import { useT } from '@rdlc-designer/i18n/react';
import type { ReactNode } from 'react';
import { HierarchyPanel } from '@/components/panels/HierarchyPanel';
import { VariablesPanel } from '@/components/panels/VariablesPanel';
import { PanelResizer, canvasRoom } from '@/components/ui/panel-resizer';
import type { PanelLayoutApi } from '@/hooks/usePanelLayout';
import { CANVAS_MIN_PX, PANEL_LIMITS } from '@/lib/panelLayout';
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
  /** Ancho de cada panel (lo comparte la app). */
  panels: PanelLayoutApi;
}

/**
 * Asides de la izquierda (Jerarquía y Variables), visibles por toggle y con el
 * ancho ajustable desde su borde derecho. Si la ventana estrecha, ceden hasta
 * su mínimo antes que el lienzo (`shrink` + `min-width`).
 */
export function LeftPanels({
  projection,
  showHierarchy,
  showVariables,
  selectedId,
  selectedCell,
  onSelectItem,
  onSelectCell,
  onPickExpression,
  panels,
}: LeftPanelsProps): ReactNode {
  const t = useT();
  if (!projection) return null;
  const { sizes } = panels.layout;
  return (
    <>
      {showHierarchy ? (
        <aside
          className="relative flex shrink flex-col border-r bg-background"
          style={{ width: sizes.hierarchy, minWidth: PANEL_LIMITS.hierarchy.min }}
        >
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <HierarchyPanel
              projection={projection}
              selectedId={selectedId}
              selectedCell={selectedCell}
              onSelectItem={onSelectItem}
              onSelectCell={onSelectCell}
            />
          </div>
          <PanelResizer
            panel="hierarchy"
            edge="right"
            size={sizes.hierarchy}
            onResize={(px) => panels.setSize('hierarchy', px)}
            onReset={() => panels.resetSize('hierarchy')}
            room={() => canvasRoom(CANVAS_MIN_PX)}
            label={t('lib.panel.hierarchyAria')}
          />
        </aside>
      ) : null}
      {showVariables ? (
        <aside
          className="relative flex shrink flex-col border-r bg-background"
          style={{ width: sizes.variables, minWidth: PANEL_LIMITS.variables.min }}
        >
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <VariablesPanel meta={projection.meta} onPick={onPickExpression} />
          </div>
          <PanelResizer
            panel="variables"
            edge="right"
            size={sizes.variables}
            onResize={(px) => panels.setSize('variables', px)}
            onReset={() => panels.resetSize('variables')}
            room={() => canvasRoom(CANVAS_MIN_PX)}
            label={t('lib.panel.variablesAria')}
          />
        </aside>
      ) : null}
    </>
  );
}
