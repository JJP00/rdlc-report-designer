import type { HierarchyNode } from './hierarchy';

/**
 * Navegación del panel de Jerarquía (patrón WAI-ARIA «tree» con roving
 * tabindex): aplanado de las filas visibles, posición entre hermanos para
 * `aria-posinset`/`aria-setsize` y acciones puras de teclado.
 *
 * Es lógica pura sobre el árbol de `hierarchy.ts`: ni DOM ni estado. El panel
 * decide qué hacer con cada acción; aquí solo se calcula.
 */

export interface FlatNode {
  node: HierarchyNode;
  depth: number;
}

/** Posición 1-based y tamaño del conjunto de hermanos de un nodo. */
export interface SiblingSet {
  posInSet: number;
  setSize: number;
}

/** Aplana el árbol en orden de lectura, sin entrar en los subárboles colapsados. */
export function flattenVisible(
  nodes: HierarchyNode[],
  collapsed: ReadonlySet<string>,
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

/** Cuenta todos los nodos del árbol, incluidos los de subárboles colapsados. */
export function countNodes(nodes: HierarchyNode[]): number {
  return nodes.reduce((total, node) => total + 1 + countNodes(node.children), 0);
}

/**
 * `aria-posinset` / `aria-setsize` de cada nodo, calculados sobre el árbol
 * **completo** (el de `hierarchyTree`, no el filtrado): la posición entre
 * hermanos no cambia al teclear en el buscador y los hermanos colapsados o
 * descartados por el filtro siguen contando, que es lo que espera un lector.
 */
export function siblingSets(nodes: HierarchyNode[]): Map<string, SiblingSet> {
  const sets = new Map<string, SiblingSet>();
  const walk = (level: HierarchyNode[]): void => {
    level.forEach((node, position) => {
      sets.set(node.key, { posInSet: position + 1, setSize: level.length });
      walk(node.children);
    });
  };
  walk(nodes);
  return sets;
}

/** Índice de la fila visible con `key` (-1 si no está en la lista). */
export function indexOfKey(rows: readonly FlatNode[], key: string | null | undefined): number {
  if (!key) return -1;
  return rows.findIndex((row) => row.node.key === key);
}

/** Fila `index + direction`, acotada a los extremos de la lista visible. */
export function nextVisibleIndex(
  rows: readonly FlatNode[],
  index: number,
  direction: 1 | -1,
): number {
  if (rows.length === 0) return -1;
  return Math.min(Math.max(index + direction, 0), rows.length - 1);
}

/**
 * ¿La fila `index` está expandida? Se deduce del aplanado: su primera hija es
 * la fila siguiente (el mismo criterio que usa `flattenVisible`).
 */
export function isExpandedAt(rows: readonly FlatNode[], index: number): boolean {
  const row = rows[index];
  const next = rows[index + 1];
  return Boolean(row && next && next.depth === row.depth + 1);
}

/** Índice visible del padre de la fila `index` (-1 si es de primer nivel). */
export function parentIndexOf(rows: readonly FlatNode[], index: number): number {
  const row = rows[index];
  if (!row) return -1;
  for (let candidate = index - 1; candidate >= 0; candidate -= 1) {
    if (rows[candidate]!.depth < row.depth) return candidate;
  }
  return -1;
}

/** Acción que el panel debe ejecutar; `null` = la tecla no aplica aquí. */
export type TreeKeyboardTarget =
  | { type: 'focus'; index: number }
  | { type: 'select'; index: number }
  | { type: 'expand'; key: string }
  | { type: 'collapse'; key: string };

/** Teclas del patrón árbol (las que el panel consume con `preventDefault`). */
export const TREE_KEYS: readonly string[] = [
  'ArrowDown',
  'ArrowUp',
  'ArrowRight',
  'ArrowLeft',
  'Home',
  'End',
  'Enter',
  ' ',
];

/**
 * Traduce una tecla a la acción del patrón árbol desde la fila `index`:
 * ↑/↓ mueven el foco a la fila visible anterior/siguiente, → expande o baja a
 * la primera hija, ← colapsa o sube al padre, Inicio/Fin van a los extremos y
 * Enter/Espacio seleccionan la fila enfocada.
 */
export function treeKeyboardTarget(
  rows: readonly FlatNode[],
  index: number,
  key: string,
): TreeKeyboardTarget | null {
  const row = rows[index];
  if (!row) return null;
  switch (key) {
    case 'ArrowDown':
      return { type: 'focus', index: nextVisibleIndex(rows, index, 1) };
    case 'ArrowUp':
      return { type: 'focus', index: nextVisibleIndex(rows, index, -1) };
    case 'Home':
      return { type: 'focus', index: 0 };
    case 'End':
      return { type: 'focus', index: rows.length - 1 };
    case 'ArrowRight':
      if (row.node.children.length === 0) return null;
      return isExpandedAt(rows, index)
        ? { type: 'focus', index: index + 1 }
        : { type: 'expand', key: row.node.key };
    case 'ArrowLeft': {
      if (isExpandedAt(rows, index)) return { type: 'collapse', key: row.node.key };
      const parent = parentIndexOf(rows, index);
      return parent >= 0 ? { type: 'focus', index: parent } : null;
    }
    case 'Enter':
    case ' ':
      return { type: 'select', index };
    default:
      return null;
  }
}
