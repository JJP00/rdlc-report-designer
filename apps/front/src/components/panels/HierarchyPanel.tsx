import type { ProjectionDto } from '@rdlc-designer/contracts';
import type { ReactNode } from 'react';
import {
  Grid3x3,
  Image,
  Layers,
  Minus,
  Square,
  Table,
  Type,
  type LucideIcon,
} from 'lucide-react';
import { hierarchyTree, type HierarchyNode } from '@/lib/hierarchy';
import { itemKindLabel } from '@/lib/palette';
import type { SelectedCell } from '@/lib/tablix';

export interface HierarchyPanelProps {
  projection: ProjectionDto;
  selectedId: string | null;
  selectedCell: SelectedCell | null;
  onSelectItem: (id: string) => void;
  onSelectCell: (cell: SelectedCell) => void;
}

const KIND_ICONS: Record<HierarchyNode['kind'], LucideIcon> = {
  region: Layers,
  cell: Grid3x3,
  textbox: Type,
  rectangle: Square,
  line: Minus,
  image: Image,
  tablix: Table,
  unknown: Square,
};

interface FlatNode {
  node: HierarchyNode;
  depth: number;
}

function flatten(nodes: HierarchyNode[], depth = 0, out: FlatNode[] = []): FlatNode[] {
  for (const node of nodes) {
    out.push({ node, depth });
    flatten(node.children, depth + 1, out);
  }
  return out;
}

/**
 * Panel de Jerarquía (U4): el árbol completo del informe (regiones, items y
 * celdas de Tablix) para navegar y seleccionar sin tocar el lienzo. La
 * selección se refleja resaltada y «trae a la vista» el elemento.
 */
export function HierarchyPanel({
  projection,
  selectedId,
  selectedCell,
  onSelectItem,
  onSelectCell,
}: HierarchyPanelProps): ReactNode {
  const rows = flatten(hierarchyTree(projection));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="border-b px-3 py-2 text-xs font-medium text-muted-foreground">
        Jerarquía
      </header>
      <ul role="tree" aria-label="Jerarquía del informe" className="min-h-0 flex-1 overflow-auto p-1">
        {rows.map(({ node, depth }) => {
          const isCellSelected =
            node.kind === 'cell' &&
            selectedCell !== null &&
            node.target?.kind === 'cell' &&
            selectedCell.id === node.target.id &&
            selectedCell.row === node.target.row &&
            selectedCell.col === node.target.col;
          const isItemSelected =
            node.target?.kind === 'item' && selectedId === node.target.id;
          const selected = isCellSelected || isItemSelected;
          const Icon = KIND_ICONS[node.kind];
          return (
            <li key={node.key} role="treeitem" aria-selected={selected}>
              <button
                type="button"
                disabled={!node.target}
                onClick={() => {
                  if (!node.target) return;
                  if (node.target.kind === 'item') onSelectItem(node.target.id);
                  else
                    onSelectCell({
                      id: node.target.id,
                      row: node.target.row,
                      col: node.target.col,
                    });
                }}
                title={node.kind === 'region' || node.kind === 'cell' ? node.label : itemKindLabel(node.kind)}
                style={{ paddingLeft: 6 + depth * 12 }}
                className={`flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left text-[11px] transition-colors ${
                  selected
                    ? 'bg-primary/10 font-medium text-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                } disabled:cursor-default`}
              >
                <Icon aria-hidden className="size-3 shrink-0" />
                <span className="truncate font-mono">{node.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
