import type { RdlcNode } from '../tree/RdlcNode.js';

/**
 * Nombres de **ámbito** del informe: los grupos viven en el mismo espacio de
 * nombres que los report items (RB resuelve unos y otros con el motor VB:
 * `ToggleItem`, `ReportItems!X` y las cadenas de scope comparten namespace) y
 * la colisión es **sin distinguir mayúsculas**. Los campos de `DataSet`, en
 * cambio, no entran: renombrar un item a un nombre de campo es legítimo.
 *
 * Este helper es la única fuente para "¿existe un grupo con este nombre?" y lo
 * usan `setName`, `insertItem`, `duplicateItem` y `nextGroupName` (que además
 * consulta el índice de items).
 */
export function findGroupByName(root: RdlcNode, name: string): RdlcNode | undefined {
  const wanted = name.toLowerCase();
  let found: RdlcNode | undefined;
  const walk = (node: RdlcNode): void => {
    if (found) return;
    if (node.tagName === 'Group' && node.attribute('Name')?.toLowerCase() === wanted) {
      found = node;
      return;
    }
    for (const child of node.children()) walk(child);
  };
  walk(root);
  return found;
}

/** `true` si algún `<Group>` usa ese nombre (sin distinguir mayúsculas). */
export function hasGroupNamed(root: RdlcNode, name: string): boolean {
  return findGroupByName(root, name) !== undefined;
}
