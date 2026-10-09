import type { HierarchyNode } from './hierarchy';
import { describe, expect, it } from 'vitest';
import {
  countNodes,
  flattenVisible,
  indexOfKey,
  isExpandedAt,
  nextVisibleIndex,
  parentIndexOf,
  siblingSets,
  treeKeyboardTarget,
} from './hierarchyNav';

/** Navegación del panel de Jerarquía: aplanado, conjuntos y teclas del árbol. */

function node(key: string, children: HierarchyNode[] = []): HierarchyNode {
  return { key, label: key, kind: 'textbox', target: { kind: 'item', id: key }, children };
}

/**
 * Encabezado; Cuerpo → [R1 → [A, B], T1 → [Celda 1,1 → [C]]]; Pie.
 * Sin colapsar los índices visibles son:
 * 0 Encabezado, 1 Cuerpo, 2 R1, 3 A, 4 B, 5 T1, 6 Celda 1,1, 7 C, 8 Pie.
 */
function fullTree(): HierarchyNode[] {
  return [
    node('Encabezado'),
    node('Cuerpo', [
      node('R1', [node('A'), node('B')]),
      node('T1', [node('Celda 1,1', [node('C')])]),
    ]),
    node('Pie'),
  ];
}

const keys = (rows: ReturnType<typeof flattenVisible>): string[] => rows.map((row) => row.node.key);

describe('flattenVisible', () => {
  it('aplana en orden de lectura con la profundidad de cada fila', () => {
    const rows = flattenVisible(fullTree(), new Set());
    expect(keys(rows)).toEqual([
      'Encabezado',
      'Cuerpo',
      'R1',
      'A',
      'B',
      'T1',
      'Celda 1,1',
      'C',
      'Pie',
    ]);
    expect(rows.map((row) => row.depth)).toEqual([0, 0, 1, 2, 2, 1, 2, 3, 0]);
  });

  it('no entra en los subárboles colapsados, pero deja visible el nodo colapsado', () => {
    expect(keys(flattenVisible(fullTree(), new Set(['R1'])))).toEqual([
      'Encabezado',
      'Cuerpo',
      'R1',
      'T1',
      'Celda 1,1',
      'C',
      'Pie',
    ]);
    expect(keys(flattenVisible(fullTree(), new Set(['Cuerpo'])))).toEqual([
      'Encabezado',
      'Cuerpo',
      'Pie',
    ]);
  });
});

describe('countNodes', () => {
  it('cuenta también los nodos de subárboles colapsados', () => {
    expect(countNodes(fullTree())).toBe(9);
  });
});

describe('siblingSets', () => {
  it('da la posición y el tamaño de cada nivel del árbol completo', () => {
    const sets = siblingSets(fullTree());
    expect(sets.get('Encabezado')).toEqual({ posInSet: 1, setSize: 3 });
    expect(sets.get('Cuerpo')).toEqual({ posInSet: 2, setSize: 3 });
    expect(sets.get('T1')).toEqual({ posInSet: 2, setSize: 2 });
    expect(sets.get('A')).toEqual({ posInSet: 1, setSize: 2 });
    expect(sets.get('Celda 1,1')).toEqual({ posInSet: 1, setSize: 1 });
  });
});

describe('indexOfKey', () => {
  it('encuentra la fila visible y devuelve -1 si no está', () => {
    const rows = flattenVisible(fullTree(), new Set());
    expect(indexOfKey(rows, 'T1')).toBe(5);
    expect(indexOfKey(rows, null)).toBe(-1);
    expect(indexOfKey(rows, 'Fantasma')).toBe(-1);
    expect(indexOfKey(flattenVisible(fullTree(), new Set(['Cuerpo'])), 'T1')).toBe(-1);
  });
});

describe('nextVisibleIndex', () => {
  const rows = flattenVisible(fullTree(), new Set());

  it('avanza y retrocede por la lista visible', () => {
    expect(nextVisibleIndex(rows, 3, 1)).toBe(4);
    expect(nextVisibleIndex(rows, 3, -1)).toBe(2);
  });

  it('se acota en los extremos', () => {
    expect(nextVisibleIndex(rows, 0, -1)).toBe(0);
    expect(nextVisibleIndex(rows, 8, 1)).toBe(8);
  });

  it('sin filas devuelve -1', () => {
    expect(nextVisibleIndex([], 0, 1)).toBe(-1);
  });
});

describe('isExpandedAt / parentIndexOf', () => {
  const rows = flattenVisible(fullTree(), new Set());

  it('deduce la expansión de la fila siguiente', () => {
    expect(isExpandedAt(rows, 1)).toBe(true); // Cuerpo con hijos visibles
    expect(isExpandedAt(rows, 3)).toBe(false); // A es una hoja
    const collapsed = flattenVisible(fullTree(), new Set(['Cuerpo']));
    expect(isExpandedAt(collapsed, 1)).toBe(false);
  });

  it('encuentra el padre por profundidad', () => {
    expect(parentIndexOf(rows, 7)).toBe(6); // C → Celda 1,1
    expect(parentIndexOf(rows, 3)).toBe(2); // A → R1
    expect(parentIndexOf(rows, 1)).toBe(-1); // Cuerpo es de primer nivel
    expect(parentIndexOf(rows, 0)).toBe(-1);
  });
});

describe('treeKeyboardTarget', () => {
  const rows = flattenVisible(fullTree(), new Set());

  it('↑/↓ mueven a la fila visible anterior/siguiente sin salirse', () => {
    expect(treeKeyboardTarget(rows, 3, 'ArrowDown')).toEqual({ type: 'focus', index: 4 });
    expect(treeKeyboardTarget(rows, 3, 'ArrowUp')).toEqual({ type: 'focus', index: 2 });
    expect(treeKeyboardTarget(rows, 0, 'ArrowUp')).toEqual({ type: 'focus', index: 0 });
    expect(treeKeyboardTarget(rows, 8, 'ArrowDown')).toEqual({ type: 'focus', index: 8 });
  });

  it('Inicio/Fin van a los extremos', () => {
    expect(treeKeyboardTarget(rows, 4, 'Home')).toEqual({ type: 'focus', index: 0 });
    expect(treeKeyboardTarget(rows, 4, 'End')).toEqual({ type: 'focus', index: 8 });
  });

  it('→ expande si está colapsado y baja a la primera hija si ya lo está', () => {
    const collapsed = flattenVisible(fullTree(), new Set(['R1']));
    // Con R1 colapsado queda en el índice 2: → lo expande.
    expect(treeKeyboardTarget(collapsed, 2, 'ArrowRight')).toEqual({ type: 'expand', key: 'R1' });
    // Expandido, R1 (índice 2) baja a su primera hija.
    expect(treeKeyboardTarget(rows, 2, 'ArrowRight')).toEqual({ type: 'focus', index: 3 });
    // A es una hoja: no hay acción.
    expect(treeKeyboardTarget(rows, 3, 'ArrowRight')).toBeNull();
  });

  it('← colapsa si está expandido y sube al padre si no', () => {
    expect(treeKeyboardTarget(rows, 1, 'ArrowLeft')).toEqual({ type: 'collapse', key: 'Cuerpo' });
    expect(treeKeyboardTarget(rows, 7, 'ArrowLeft')).toEqual({ type: 'focus', index: 6 });
    const collapsed = flattenVisible(fullTree(), new Set(['Cuerpo']));
    expect(treeKeyboardTarget(collapsed, 1, 'ArrowLeft')).toBeNull(); // primer nivel
  });

  it('Enter y Espacio seleccionan la fila enfocada', () => {
    expect(treeKeyboardTarget(rows, 4, 'Enter')).toEqual({ type: 'select', index: 4 });
    expect(treeKeyboardTarget(rows, 4, ' ')).toEqual({ type: 'select', index: 4 });
  });

  it('no hay acción fuera de la lista o con otra tecla', () => {
    expect(treeKeyboardTarget(rows, 99, 'ArrowDown')).toBeNull();
    expect(treeKeyboardTarget([], 0, 'ArrowDown')).toBeNull();
    expect(treeKeyboardTarget(rows, 0, 'a')).toBeNull();
  });
});
