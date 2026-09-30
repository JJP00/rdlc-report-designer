import type { ProjectionDto } from '@rdlc-designer/contracts';
import type { ReactNode } from 'react';
import {
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  Grid3x3,
  Image,
  Layers,
  Minus,
  Square,
  Table,
  Type,
  type LucideIcon,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
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

function flattenVisible(
  nodes: HierarchyNode[],
  collapsed: Set<string>,
  depth = 0,
  out: FlatNode[] = [],
): FlatNode[] {
  for (const node of nodes) {
    out.push({ node, depth });
    if (node.children.length > 0 && !collapsed.has(node.key)) {
      flattenVisible(node.children, collapsed, depth + 1, out);
    }
  }
  return out;
}

function countNodes(nodes: HierarchyNode[]): number {
  return nodes.reduce((total, node) => total + 1 + countNodes(node.children), 0);
}

/**
 * Panel de Jerarquía (U4): el árbol completo del informe (regiones, items y
 * celdas de Tablix) para navegar y seleccionar sin tocar el lienzo. Los nodos
 * con hijos se **colapsan** (como los grupos del panel de Variables) y hay un
 * botón para plegar/desplegar todo.
 */
export function HierarchyPanel({
  projection,
  selectedId,
  selectedCell,
  onSelectItem,
  onSelectCell,
}: HierarchyPanelProps): ReactNode {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const tree = useMemo(() => hierarchyTree(projection), [projection]);
  const rows = flattenVisible(tree, collapsed);

  const collapsibleKeys = useMemo(() => {
    const keys: string[] = [];
    const walk = (nodes: HierarchyNode[]): void => {
      for (const node of nodes) {
        if (node.children.length > 0) keys.push(node.key);
        walk(node.children);
      }
    };
    walk(tree);
    return keys;
  }, [tree]);
  const allCollapsed = collapsibleKeys.length > 0 && collapsibleKeys.every((key) => collapsed.has(key));

  const toggle = (key: string): void => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center justify-between border-b px-3 py-2">
        <span className="text-xs font-medium text-muted-foreground">Jerarquía</span>
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-muted-foreground">{countNodes(tree)}</span>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={allCollapsed ? 'Expandir todo' : 'Colapsar todo'}
            title={allCollapsed ? 'Expandir todo' : 'Colapsar todo'}
            onClick={() =>
              setCollapsed(allCollapsed ? new Set() : new Set(collapsibleKeys))
            }
          >
            {allCollapsed ? <ChevronsUpDown /> : <ChevronsDownUp />}
          </Button>
        </div>
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
          const isItemSelected = node.target?.kind === 'item' && selectedId === node.target.id;
          const selected = isCellSelected || isItemSelected;
          const Icon = KIND_ICONS[node.kind];
          const hasChildren = node.children.length > 0;
          const expanded = hasChildren && !collapsed.has(node.key);
          return (
            <li
              key={node.key}
              role="treeitem"
              aria-selected={selected}
              aria-expanded={hasChildren ? expanded : undefined}
            >
              <div
                className={`flex items-center rounded ${
                  selected ? 'bg-primary/10' : 'hover:bg-muted'
                }`}
                style={{ paddingLeft: 4 + depth * 12 }}
              >
                {hasChildren ? (
                  <button
                    type="button"
                    aria-label={`${expanded ? 'Colapsar' : 'Expandir'} ${node.label}`}
                    title={expanded ? 'Colapsar' : 'Expandir'}
                    className="flex size-4 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground"
                    onClick={() => toggle(node.key)}
                  >
                    {expanded ? (
                      <ChevronDown className="size-3" />
                    ) : (
                      <ChevronRight className="size-3" />
                    )}
                  </button>
                ) : (
                  <span className="size-4 shrink-0" />
                )}
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
                  title={
                    node.kind === 'region' || node.kind === 'cell'
                      ? node.label
                      : itemKindLabel(node.kind)
                  }
                  className={`flex min-w-0 flex-1 items-center gap-1.5 rounded px-1 py-0.5 text-left text-[11px] transition-colors ${
                    selected ? 'font-medium text-foreground' : 'text-muted-foreground hover:text-foreground'
                  } disabled:cursor-default`}
                >
                  <Icon aria-hidden className="size-3 shrink-0" />
                  <span className="truncate font-mono">{node.label}</span>
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
