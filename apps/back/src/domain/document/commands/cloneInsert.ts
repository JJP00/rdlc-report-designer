import { readLength } from '../geometry/geometry.js';
import type { RdlcNode } from '../tree/RdlcNode.js';
import type { CommandContext } from './CommandContext.js';
import { ensureBandGeometry } from './bandGeometry.js';
import { nextItemName } from './insertItem.js';

/**
 * Inserta un clon de `source` en `container[index]` con nombres **únicos** y
 * sincronizando `rd:DefaultName`. Lo comparten `duplicateItem` (clon junto al
 * original) y el pegado del portapapeles (`insertClone`).
 */
export function insertCloneAt(
  ctx: CommandContext,
  container: RdlcNode,
  source: RdlcNode,
  index: number,
  preferredName?: string,
  /** Registro compartido por un pegado múltiple (nombres únicos entre clones). */
  sharedTaken?: Set<string>,
): { name: string; clone: RdlcNode } {
  const taken = sharedTaken ?? new Set<string>();
  const name = preferredName ?? nextItemName(ctx, source.tagName.toLowerCase(), taken);
  const clone = source.clone();

  const oldRootName = source.attribute('Name');
  clone.setAttribute('Name', name);
  taken.add(name);
  syncDefaultName(clone, oldRootName ?? name, name);

  // Los hijos copiados conservan los nombres del original: sin renombrarlos
  // habría dos nodos con el mismo `Name` (el índice se queda con uno y BC
  // desorienta sus referencias). El mapa old→new (raíz incluida) permite
  // además reescribir las referencias internas del clon (BUG-12).
  const renames = new Map<string, string>();
  if (oldRootName !== undefined) renames.set(oldRootName, name);
  renameDescendants(ctx, clone, taken, renames);
  rewriteReferences(clone, renames);

  container.insertChildAt(clone, index);
  // Si el destino es una banda, el clon necesita `Top/Left/Width/Height`
  // explícitos (RB estira al tamaño de la banda los items sin tamaño y tapa el
  // informe). El inverso de insertar es quitar el clon, así que no hace falta
  // registrar estos nodos por separado.
  ensureBandGeometry(clone, container);
  return { name, clone };
}

/** Renombra a nombres libres todos los descendientes con `Name` del clon. */
function renameDescendants(
  ctx: CommandContext,
  node: RdlcNode,
  taken: Set<string>,
  renames: Map<string, string>,
): void {
  for (const child of node.children()) {
    const oldName = child.attribute('Name');
    if (oldName !== undefined) {
      const newName = nextItemName(ctx, child.tagName.toLowerCase(), taken);
      child.setAttribute('Name', newName);
      taken.add(newName);
      renames.set(oldName, newName);
      syncDefaultName(child, oldName, newName);
    }
    renameDescendants(ctx, child, taken, renames);
  }
}

/** Tags cuyo texto es el nombre de otro nodo del informe (referencia directa). */
const REFERENCE_TAGS = new Set(['ToggleItem']);

/**
 * Reescribe con el mapa de renombrados las referencias internas del clon:
 * - `ToggleItem` (su texto es el nombre de otro nodo del propio clon).
 * - `ReportItems!X` dentro de cualquier expresión (texto de `<Value>`…).
 *
 * Las cadenas de scope (`Sum(Fields!X.Value, "GrupoViejo")`) **no** se tocan:
 * distinguir una cadena de un literal exige parsear la expresión; el grupo
 * renombrado del clon avisa con su propio nombre nuevo en la UI.
 */
function rewriteReferences(node: RdlcNode, renames: Map<string, string>): void {
  if (renames.size === 0) return;
  const byLowerName = new Map<string, string>();
  for (const [oldName, newName] of renames) byLowerName.set(oldName.toLowerCase(), newName);

  const walk = (current: RdlcNode): void => {
    if (REFERENCE_TAGS.has(current.tagName)) {
      const text = current.text();
      const replacement = text === undefined ? undefined : byLowerName.get(text.toLowerCase());
      if (replacement !== undefined) current.setText(replacement);
    }

    const text = current.text();
    if (text !== undefined && text.includes('ReportItems!')) {
      const replaced = text.replace(
        /(ReportItems!)\s*([A-Za-z_]\w*)/gi,
        (match, prefix: string, referenced: string) => {
          const replacement = byLowerName.get(referenced.toLowerCase());
          return replacement !== undefined ? `${prefix}${replacement}` : match;
        },
      );
      if (replaced !== text) current.setText(replaced);
    }

    for (const child of current.children()) walk(child);
  };
  walk(node);
}

/** `<rd:DefaultName>` espeja el `Name` del item (lo usa Report Builder). */
function syncDefaultName(item: RdlcNode, oldName: string, newName: string): void {
  for (const child of item.children()) {
    if (child.tagName === 'rd:DefaultName' && child.text() === oldName) {
      child.setText(newName);
    }
  }
}

/** Geometría del item clonado (lo que el front refleja al reconciliar). */
export function pastedGeometry(node: RdlcNode): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  const fields = [
    ['top', 'Top'],
    ['left', 'Left'],
    ['width', 'Width'],
    ['height', 'Height'],
  ] as const;

  for (const [key, tag] of fields) {
    const length = readLength(node, tag);
    if (length) values[key] = length;
  }
  return values;
}
