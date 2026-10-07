import { insertCanonical } from '../geometry/geometry.js';
import { formatLength, type Length } from '../style/Length.js';
import type { RdlcNode } from '../tree/RdlcNode.js';
import type { DomainCommand } from './CommandContext.js';
import { setNodeTextChange } from './nodeChanges.js';

/**
 * Report Builder estira al **tamaño completo de la banda** cualquier item del
 * cuerpo que no declare `Width`/`Height` (y lo pinta con su fondo: un textbox
 * blanco sin tamaño tapa la tabla entera y el informe parece vacío). Los items
 * que vienen de una celda no declaran longitudes —las pone la celda—, así que
 * al entrar en una banda hay que **materializarlas**.
 *
 * Los defaults espejan `NEW_ITEM_SIZES` del front (insertar en el lienzo).
 */

const BAND_ITEM_DEFAULTS: Record<string, { width: Length; height: Length }> = {
  Textbox: { width: { value: 5, unit: 'cm' }, height: { value: 1, unit: 'cm' } },
  Rectangle: { width: { value: 5, unit: 'cm' }, height: { value: 1, unit: 'cm' } },
  Line: { width: { value: 4, unit: 'cm' }, height: { value: 0, unit: 'cm' } },
  Image: { width: { value: 3, unit: 'cm' }, height: { value: 2, unit: 'cm' } },
  Tablix: { width: { value: 7.5, unit: 'cm' }, height: { value: 1.2, unit: 'cm' } },
};

const ZERO: Length = { value: 0, unit: 'cm' };

/** `true` si el contenedor es el `ReportItems` de una banda (cuerpo/cabecera/pie). */
export function isBandContainer(container: RdlcNode): boolean {
  const parent = container.parent?.tagName;
  return (
    container.tagName === 'ReportItems' &&
    (parent === 'Body' || parent === 'PageHeader' || parent === 'PageFooter')
  );
}

/**
 * Deja el item con `Top`/`Left`/`Width`/`Height` explícitos cuando su destino es
 * una banda. `top`/`left` (si el drag los trae) mandan; si no, se conserva lo
 * que ya tuviera y, si falta, se usa 0. Devuelve los inversos (quitar lo creado
 * o restaurar el texto anterior).
 */
export function ensureBandGeometry(
  node: RdlcNode,
  container: RdlcNode,
  top?: Length,
  left?: Length,
): DomainCommand[] {
  if (!isBandContainer(container)) return [];

  const inverse: DomainCommand[] = [];
  writeLength(node, 'Top', top ?? ZERO, inverse, top !== undefined);
  writeLength(node, 'Left', left ?? ZERO, inverse, left !== undefined);

  const defaults = BAND_ITEM_DEFAULTS[node.tagName];
  if (defaults) {
    if (!node.child('Width')) writeLength(node, 'Width', defaults.width, inverse, false);
    if (!node.child('Height')) writeLength(node, 'Height', defaults.height, inverse, false);
  }
  return inverse;
}

/** Escribe el tag; con `overwrite` pisa el valor existente (y el undo lo restaura). */
function writeLength(
  node: RdlcNode,
  tag: 'Top' | 'Left' | 'Width' | 'Height',
  length: Length,
  inverse: DomainCommand[],
  overwrite: boolean,
): void {
  const formatted = formatLength(length);
  const existing = node.child(tag);
  if (existing) {
    if (!overwrite) return;
    const previous = existing.text() ?? '';
    if (previous === formatted) return;
    existing.setText(formatted);
    inverse.push(setNodeTextChange({ node: existing, value: previous }));
    return;
  }
  const created = node.createElement(tag, formatted);
  insertCanonical(node, tag, created);
  inverse.push({ cmd: 'removeNode', node: created });
}
