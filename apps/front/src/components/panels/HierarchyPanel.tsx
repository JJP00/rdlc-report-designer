import type { ProjectionDto } from '@rdlc-designer/contracts';
import type { KeyboardEvent, ReactNode } from 'react';
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
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { hierarchyTree, searchHierarchy, type HierarchyNode } from '@/lib/hierarchy';
import {
  countNodes,
  flattenVisible,
  indexOfKey,
  siblingSets,
  treeKeyboardTarget,
  TREE_KEYS,
} from '@/lib/hierarchyNav';
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

/** Teclas del patrón árbol: se consumen en el `ul` para que no actúen los atajos globales. */
const TREE_KEY_SET = new Set(TREE_KEYS);

/**
 * Panel de Jerarquía (U4): el árbol completo del informe (regiones, items y
 * celdas de Tablix) para navegar y seleccionar sin tocar el lienzo. Los nodos
 * con hijos se **colapsan** (como los grupos del panel de Variables) y hay un
 * botón para plegar/desplegar todo.
 *
 * Implementa el patrón WAI-ARIA «tree» con selección simple y roving tabindex:
 * solo la fila enfocada entra en el orden de Tab y las flechas recorren el
 * árbol (↑/↓, →/←, Inicio/Fin, Enter/Espacio). Los botones internos de cada
 * fila siguen operando con ratón, pero quedan fuera del orden de Tab.
 */
export function HierarchyPanel({
  projection,
  selectedId,
  selectedCell,
  onSelectItem,
  onSelectCell,
}: HierarchyPanelProps): ReactNode {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  /** Fila con el `tabIndex=0` del roving: la última enfocada con teclado o ratón. */
  const [focusedKey, setFocusedKey] = useState<string | null>(null);
  const rowElements = useRef(new Map<string, HTMLLIElement>());
  const tree = useMemo(() => hierarchyTree(projection), [projection]);
  const searching = query.trim().length > 0;
  const filtered = useMemo(() => searchHierarchy(tree, query), [tree, query]);
  // Al buscar los nodos con coincidencias se muestran siempre abiertos.
  const rows = useMemo(
    () => flattenVisible(filtered, searching ? new Set<string>() : collapsed),
    [filtered, searching, collapsed],
  );
  // `aria-posinset`/`aria-setsize` sobre el árbol **completo** (sin filtrar): la
  // posición entre hermanos no baila al teclear en el buscador.
  const sets = useMemo(() => siblingSets(tree), [tree]);

  const isSelected = (node: HierarchyNode): boolean => {
    if (node.kind === 'cell') {
      return (
        selectedCell !== null &&
        node.target?.kind === 'cell' &&
        selectedCell.id === node.target.id &&
        selectedCell.row === node.target.row &&
        selectedCell.col === node.target.col
      );
    }
    return node.target?.kind === 'item' && selectedId === node.target.id;
  };

  // Roving tabindex: la fila enfocada; antes de la primera interacción, la
  // seleccionada si está visible y, si no, la primera visible.
  const focusedIndex = indexOfKey(rows, focusedKey);
  const selectedIndex = rows.findIndex(({ node }) => isSelected(node));
  const activeIndex =
    focusedIndex >= 0
      ? focusedIndex
      : selectedIndex >= 0
        ? selectedIndex
        : rows.length > 0
          ? 0
          : -1;
  const activeKey = activeIndex >= 0 ? rows[activeIndex]!.node.key : null;

  // Al filtrar o colapsar puede desaparecer la fila enfocada: el roving cae a
  // la primera visible (con el foco en el buscador no se roba el foco real).
  useEffect(() => {
    if (focusedKey === null) return;
    if (rows.length === 0 || indexOfKey(rows, focusedKey) < 0) {
      setFocusedKey(rows[0]?.node.key ?? null);
    }
  }, [rows, focusedKey]);

  const collapsibleKeys = useMemo(() => {
    const keys: string[] = [];
    const walk = (nodes: HierarchyNode[]): void => {
      for (const node of nodes) {
        if (node.children.length > 0) keys.push(node.key);
        walk(node.children);
      }
    };
    walk(filtered);
    return keys;
  }, [filtered]);
  const allCollapsed =
    collapsibleKeys.length > 0 && collapsibleKeys.every((key) => collapsed.has(key));

  const toggle = (key: string): void => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  /** Misma selección que el clic en la etiqueta; las regiones no tienen destino. */
  const selectNode = (node: HierarchyNode): void => {
    if (!node.target) return;
    if (node.target.kind === 'item') onSelectItem(node.target.id);
    else onSelectCell({ id: node.target.id, row: node.target.row, col: node.target.col });
  };

  const registerRow = (key: string, element: HTMLLIElement | null): void => {
    if (element) rowElements.current.set(key, element);
    else rowElements.current.delete(key);
  };

  /** Lleva el foco DOM a la fila `key` y la deja a la vista. */
  const focusRow = (key: string): void => {
    const element = rowElements.current.get(key);
    if (!element) return;
    element.focus({ preventScroll: true });
    element.scrollIntoView({ block: 'nearest' });
  };

  /** La selección sigue al foco: ↑/↓, Inicio/Fin y Enter/Espacio seleccionan. */
  const focusAndSelect = (index: number): void => {
    const row = rows[index];
    if (!row) return;
    setFocusedKey(row.node.key);
    selectNode(row.node);
    focusRow(row.node.key);
  };

  const handleTreeKeyDown = (event: KeyboardEvent<HTMLUListElement>): void => {
    if (!TREE_KEY_SET.has(event.key)) return;
    // Tras un clic el foco DOM puede estar en un botón interno: la tecla actúa
    // sobre su fila, no sobre el último `focusedKey`.
    const eventKey = (event.target as HTMLElement)
      .closest('li[role="treeitem"]')
      ?.getAttribute('data-hierarchy-key');
    const fromEvent = indexOfKey(rows, eventKey);
    const index = fromEvent >= 0 ? fromEvent : activeIndex;
    if (index < 0) return;
    // Las flechas, Inicio/Fin, Enter y Espacio son del árbol: sin esto, los
    // atajos globales del lienzo moverían el item seleccionado.
    event.preventDefault();
    const target = treeKeyboardTarget(rows, index, event.key);
    if (!target) return;
    if (target.type === 'focus' || target.type === 'select') {
      focusAndSelect(target.index);
      return;
    }
    // →/←: expandir o colapsar el propio nodo; el foco se queda en él.
    setFocusedKey(target.key);
    setCollapsed((current) => {
      const next = new Set(current);
      if (target.type === 'expand') next.delete(target.key);
      else next.add(target.key);
      return next;
    });
    focusRow(target.key);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-col gap-2 border-b p-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">Jerarquía</span>
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-muted-foreground">{countNodes(filtered)}</span>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={allCollapsed ? 'Expandir todo' : 'Colapsar todo'}
              title={allCollapsed ? 'Expandir todo' : 'Colapsar todo'}
              onClick={() => setCollapsed(allCollapsed ? new Set() : new Set(collapsibleKeys))}
            >
              {allCollapsed ? <ChevronsUpDown /> : <ChevronsDownUp />}
            </Button>
          </div>
        </div>
        <Input
          className="h-7 text-xs"
          placeholder="Buscar elemento o celda…"
          aria-label="Buscar en la jerarquía"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      <ul
        role="tree"
        aria-label="Jerarquía del informe"
        className="min-h-0 flex-1 overflow-auto p-1"
        onKeyDown={handleTreeKeyDown}
      >
        {rows.map(({ node, depth }) => {
          const selected = isSelected(node);
          const Icon = KIND_ICONS[node.kind];
          const hasChildren = node.children.length > 0;
          const expanded = hasChildren && !collapsed.has(node.key);
          const set = sets.get(node.key);
          return (
            <li
              key={node.key}
              ref={(element) => registerRow(node.key, element)}
              role="treeitem"
              data-hierarchy-key={node.key}
              // Nombre limpio: sin él, el lector concatenaría los dos botones internos.
              aria-label={node.label}
              aria-level={depth + 1}
              aria-posinset={set?.posInSet}
              aria-setsize={set?.setSize}
              aria-selected={selected}
              aria-expanded={hasChildren ? expanded : undefined}
              tabIndex={node.key === activeKey ? 0 : -1}
              className="rounded outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
                    tabIndex={-1}
                    aria-label={`${expanded ? 'Colapsar' : 'Expandir'} ${node.label}`}
                    title={expanded ? 'Colapsar' : 'Expandir'}
                    className="flex size-4 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      setFocusedKey(node.key);
                      toggle(node.key);
                    }}
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
                  tabIndex={-1}
                  disabled={!node.target}
                  onClick={() => {
                    setFocusedKey(node.key);
                    selectNode(node);
                  }}
                  title={
                    node.kind === 'region' || node.kind === 'cell'
                      ? node.label
                      : itemKindLabel(node.kind)
                  }
                  className={`flex min-w-0 flex-1 items-center gap-1.5 rounded px-1 py-0.5 text-left text-[11px] transition-colors ${
                    selected
                      ? 'font-medium text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  } disabled:cursor-default`}
                >
                  <Icon aria-hidden className="size-3 shrink-0" />
                  <span className="truncate font-mono">{node.label}</span>
                </button>
              </div>
            </li>
          );
        })}
        {rows.length === 0 ? (
          <li className="p-2 text-xs text-muted-foreground">Sin resultados.</li>
        ) : null}
      </ul>
    </div>
  );
}
