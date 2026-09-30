import type { ItemDto, ProjectionDto } from '@rdlc-designer/contracts';

/**
 * Jerarquía del informe (U4): la ruta de contenedores de un elemento (para el
 * breadcrumb) y el árbol completo de items (para el panel de Jerarquía).
 *
 * Es lógica pura sobre la proyección: ni DOM ni estado. Las celdas de un Tablix
 * entran en el árbol como nodos («Celda 2,1») para poder navegar a su
 * contenido, igual que hace el panel de Estructura con la rejilla.
 */

export type HierarchyTarget =
  | { kind: 'item'; id: string }
  | { kind: 'cell'; id: string; row: number; col: number };

export interface BreadcrumbEntry {
  label: string;
  /** Sin destino = solo contexto («Informe», «Cuerpo»). */
  target?: HierarchyTarget;
}

export interface HierarchyNode {
  key: string;
  label: string;
  kind: ItemDto['kind'] | 'region' | 'cell';
  target?: HierarchyTarget;
  children: HierarchyNode[];
}

export interface HierarchySelection {
  itemId?: string | null;
  cell?: { id: string; row: number; col: number } | null;
}

const REGIONS: { key: 'pageHeader' | 'body' | 'pageFooter'; label: string }[] = [
  { key: 'pageHeader', label: 'Encabezado' },
  { key: 'body', label: 'Cuerpo' },
  { key: 'pageFooter', label: 'Pie' },
];

function regionItems(projection: ProjectionDto, key: 'pageHeader' | 'body' | 'pageFooter'): ItemDto[] {
  const byKey = {
    pageHeader: projection.page.header,
    body: projection.page.body,
    pageFooter: projection.page.footer,
  };
  return byKey[key].items;
}

function itemEntry(item: ItemDto): BreadcrumbEntry {
  return { label: item.id, target: { kind: 'item', id: item.id } };
}

/** Hijos de un item si su variante los tiene (rectángulos). */
function childItems(item: ItemDto): ItemDto[] {
  return 'children' in item && Array.isArray(item.children) ? item.children : [];
}

function cellEntry(tablixId: string, row: number, col: number): BreadcrumbEntry {
  return {
    label: `Celda ${row + 1},${col + 1}`,
    target: { kind: 'cell', id: tablixId, row, col },
  };
}

/** Ruta dentro de una lista (sin incluir la región): contenedores hasta `id`. */
function pathInItems(items: ItemDto[], id: string): BreadcrumbEntry[] | undefined {
  for (const item of items) {
    if (item.id === id) return [itemEntry(item)];

    const inChildren = pathInItems(childItems(item), id);
    if (inChildren) return [itemEntry(item), ...inChildren];

    if (item.kind === 'tablix') {
      const rows = item.body?.rows ?? [];
      for (let row = 0; row < rows.length; row += 1) {
        const cells = rows[row]?.cells ?? [];
        for (let col = 0; col < cells.length; col += 1) {
          const content = cells[col]?.content;
          if (!content) continue;
          if (content.id === id) return [itemEntry(item), cellEntry(item.id, row, col), itemEntry(content)];
          const inCell = pathInItems([content], id);
          if (inCell) return [itemEntry(item), cellEntry(item.id, row, col), ...inCell];
        }
      }
    }
  }
  return undefined;
}

/** Ruta de un Tablix + su celda (para la selección de celda). */
function pathToCell(
  items: ItemDto[],
  cell: { id: string; row: number; col: number },
): BreadcrumbEntry[] | undefined {
  for (const item of items) {
    if (item.id === cell.id) return [itemEntry(item), cellEntry(item.id, cell.row, cell.col)];
    const inChildren = pathToCell(childItems(item), cell);
    if (inChildren) return [itemEntry(item), ...inChildren];
  }
  return undefined;
}

/**
 * Migas de pan de la selección: `Informe › Cuerpo › Tablix2 › Celda 2,1 › Textbox`.
 * Con la selección vacía devuelve solo la raíz.
 */
export function breadcrumbEntries(
  projection: ProjectionDto,
  selection: HierarchySelection,
): BreadcrumbEntry[] {
  const root: BreadcrumbEntry = { label: 'Informe' };
  const id = selection.itemId ?? null;
  const cell = selection.cell ?? null;
  if (!id && !cell) return [root];

  for (const region of REGIONS) {
    const items = regionItems(projection, region.key);
    const path = id
      ? pathInItems(items, id)
      : cell
        ? pathToCell(items, cell)
        : undefined;
    if (path) return [root, { label: region.label }, ...path];
  }
  return [root];
}

/* --------------------------------- árbol --------------------------------- */

function itemNode(item: ItemDto): HierarchyNode {
  const children: HierarchyNode[] = childItems(item).map(itemNode);
  if (item.kind === 'tablix') {
    const rows = item.body?.rows ?? [];
    for (let row = 0; row < rows.length; row += 1) {
      const cells = rows[row]?.cells ?? [];
      for (let col = 0; col < cells.length; col += 1) {
        const content = cells[col]?.content;
        children.push({
          key: `${item.id}-${row}-${col}`,
          label: `Celda ${row + 1},${col + 1}`,
          kind: 'cell',
          target: { kind: 'cell', id: item.id, row, col },
          children: content ? [itemNode(content)] : [],
        });
      }
    }
  }
  return {
    key: item.id,
    label: item.id,
    kind: item.kind,
    target: { kind: 'item', id: item.id },
    children,
  };
}

/** Árbol del informe: regiones → items → (celdas de Tablix) → contenido. */
export function hierarchyTree(projection: ProjectionDto): HierarchyNode[] {
  return REGIONS.map((region) => ({
    key: region.key,
    label: region.label,
    kind: 'region' as const,
    children: regionItems(projection, region.key).map(itemNode),
  }));
}
