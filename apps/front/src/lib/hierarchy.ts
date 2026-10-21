import type { ItemDto, ProjectionDto } from '@rdlc-designer/contracts';
import { createTranslator, type CatalogKey, type Translator } from '@rdlc-designer/i18n';
import { tablixLayout } from './tablix';

/**
 * Jerarquía del informe (U4): la ruta de contenedores de un elemento (para el
 * breadcrumb) y el árbol completo de items (para el panel de Jerarquía).
 *
 * Es lógica pura sobre la proyección: ni DOM ni estado. Las celdas de un Tablix
 * entran en el árbol como nodos («Celda 2,1») para poder navegar a su
 * contenido, igual que hace el panel de Estructura con la rejilla.
 *
 * Las etiquetas visibles (regiones, celdas, raíz) salen del catálogo: el `t`
 * entra por parámetro, como en `pageResize` y `canvasA11y`.
 */

/**
 * Traductor por defecto de los llamantes que aún no pasan `t` (el breadcrumb
 * del módulo toolbar, que ya tiene el hook preparado): cae al catálogo **ES**
 * para no cambiar ni un byte de lo que había hardcodeado. Es un puente
 * temporal; cuando todo consumidor pase el `t` de `useT()`, se borra.
 */
const fallbackT: Translator['t'] = createTranslator('es').t;

export type HierarchyTarget =
  { kind: 'item'; id: string } | { kind: 'cell'; id: string; row: number; col: number };

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

const REGIONS: { key: 'pageHeader' | 'body' | 'pageFooter'; labelKey: CatalogKey }[] = [
  { key: 'pageHeader', labelKey: 'tablix.hierarchy.regionHeader' },
  { key: 'body', labelKey: 'tablix.hierarchy.regionBody' },
  { key: 'pageFooter', labelKey: 'tablix.hierarchy.regionFooter' },
];

function regionItems(
  projection: ProjectionDto,
  key: 'pageHeader' | 'body' | 'pageFooter',
): ItemDto[] {
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

function cellEntry(
  t: Translator['t'],
  tablixId: string,
  row: number,
  col: number,
): BreadcrumbEntry {
  return {
    label: t('tablix.hierarchy.cell', { row: row + 1, col: col + 1 }),
    target: { kind: 'cell', id: tablixId, row, col },
  };
}

/** Ruta dentro de una lista (sin incluir la región): contenedores hasta `id`. */
function pathInItems(
  items: ItemDto[],
  id: string,
  t: Translator['t'],
): BreadcrumbEntry[] | undefined {
  for (const item of items) {
    if (item.id === id) return [itemEntry(item)];

    const inChildren = pathInItems(childItems(item), id, t);
    if (inChildren) return [itemEntry(item), ...inChildren];

    if (item.kind === 'tablix') {
      // Las cajas del layout dan la **columna de rejilla** de cada ancla: con
      // celdas fusionadas el índice del array no coincide (los rellenos no se
      // proyectan) y la celda del breadcrumb saldría mal.
      for (const box of tablixLayout(item).cells) {
        const content = box.content;
        if (!content) continue;
        if (content.id === id) {
          return [itemEntry(item), cellEntry(t, item.id, box.row, box.col), itemEntry(content)];
        }
        const inCell = pathInItems([content], id, t);
        if (inCell) {
          return [itemEntry(item), cellEntry(t, item.id, box.row, box.col), ...inCell];
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
  t: Translator['t'],
): BreadcrumbEntry[] | undefined {
  for (const item of items) {
    if (item.id === cell.id) {
      return [itemEntry(item), cellEntry(t, item.id, cell.row, cell.col)];
    }
    const inChildren = pathToCell(childItems(item), cell, t);
    if (inChildren) return [itemEntry(item), ...inChildren];
  }
  return undefined;
}

/**
 * Migas de pan de la selección: `Informe › Cuerpo › Tablix2 › Celda 2,1 › Textbox`.
 * Con la selección vacía devuelve solo la raíz.
 *
 * `t` es opcional solo para llamantes que todavía no lo pasan (ver `fallbackT`).
 */
export function breadcrumbEntries(
  projection: ProjectionDto,
  selection: HierarchySelection,
  t: Translator['t'] = fallbackT,
): BreadcrumbEntry[] {
  const root: BreadcrumbEntry = { label: t('tablix.hierarchy.report') };
  const id = selection.itemId ?? null;
  const cell = selection.cell ?? null;
  if (!id && !cell) return [root];

  for (const region of REGIONS) {
    const items = regionItems(projection, region.key);
    const path = id ? pathInItems(items, id, t) : cell ? pathToCell(items, cell, t) : undefined;
    if (path) return [root, { label: t(region.labelKey) }, ...path];
  }
  return [root];
}

/* --------------------------------- árbol --------------------------------- */

function itemNode(item: ItemDto, t: Translator['t']): HierarchyNode {
  const children: HierarchyNode[] = childItems(item).map((child) => itemNode(child, t));
  if (item.kind === 'tablix') {
    // Una entrada por celda **ancla** (rejilla), no por índice del array: en las
    // filas con fusiones el índice y la columna difieren.
    for (const box of tablixLayout(item).cells) {
      children.push({
        key: `${item.id}-${box.row}-${box.col}`,
        label: t('tablix.hierarchy.cell', { row: box.row + 1, col: box.col + 1 }),
        kind: 'cell',
        target: { kind: 'cell', id: item.id, row: box.row, col: box.col },
        children: box.content ? [itemNode(box.content, t)] : [],
      });
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
export function hierarchyTree(
  projection: ProjectionDto,
  t: Translator['t'] = fallbackT,
): HierarchyNode[] {
  return REGIONS.map((region) => ({
    key: region.key,
    label: t(region.labelKey),
    kind: 'region' as const,
    children: regionItems(projection, region.key).map((item) => itemNode(item, t)),
  }));
}

/**
 * Filtro del panel de Jerarquía: conserva los nodos que coinciden (con todo su
 * subárbol, para poder ver las celdas de un Tablix encontrado) y los
 * **ancestros** de los que contienen coincidencias. Sin consulta, el árbol tal cual.
 */
export function searchHierarchy(nodes: HierarchyNode[], query: string): HierarchyNode[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return nodes;
  return nodes.flatMap((node) => {
    if (node.label.toLowerCase().includes(needle)) return [node];
    const children = searchHierarchy(node.children, query);
    return children.length > 0 ? [{ ...node, children }] : [];
  });
}
