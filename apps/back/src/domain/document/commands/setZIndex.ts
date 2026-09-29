import type { RdlcCommand } from '@rdlc-designer/contracts';
import { left, right, type Either } from '../../../shared/either.js';
import { CommandRejectedError, type DomainError } from '../../../shared/domainError.js';
import { insertCanonical } from '../geometry/geometry.js';
import type { RdlcNode } from '../tree/RdlcNode.js';
import type { CommandContext, CommandOutcome, DomainCommand } from './CommandContext.js';
import { detach, restore, setNodeTextChange } from './nodeChanges.js';

export type SetZIndexCommand = Extract<RdlcCommand, { cmd: 'setZIndex' }>;

/**
 * Orden de apilado del item (`<ZIndex>`; el mayor queda encima).
 *
 * - `zIndex > 0` escribe el valor (creando el nodo en orden canónico).
 * - `zIndex = 0` **quita** la etiqueta: el XSD la define `unsignedInt` con
 *   valor por defecto 0, así que un 0 explícito es ruido.
 * - `zIndex < 0` significa «detrás de todos»: como no hay negativos válidos,
 *   el dominio **corre** los `ZIndex` de los hermanos `-zIndex` posiciones y
 *   deja el item en 0 (p. ej. «Enviar atrás» manda `-1`). Es un solo comando
 *   (un paso de undo) aunque toque varios nodos.
 *
 * El comando pide snapshot: el front no puede anticipar el reajuste de los
 * hermanos.
 */
export function applySetZIndex(
  ctx: CommandContext,
  command: SetZIndexCommand,
): Either<DomainError, CommandOutcome> {
  const node = ctx.index.get(command.id);
  if (!node) return left(CommandRejectedError.create(`No existe el elemento '${command.id}'`));

  if (command.zIndex < 0) {
    if (!node.parent) {
      return left(CommandRejectedError.create(`El elemento '${command.id}' no tiene contenedor`));
    }
    return right({ inverse: sendToBack(node, command.zIndex), snapshotOut: true });
  }

  return right({
    inverse: writeZIndex(node, command.zIndex),
    applied: [{ id: command.id, values: { zIndex: command.zIndex } }],
  });
}

/** «Detrás de todos»: el item a 0 y los hermanos corridos `-requested`. */
function sendToBack(node: RdlcNode, requested: number): DomainCommand[] {
  const parent = node.parent!;
  const delta = -requested;
  const inverse: DomainCommand[] = [];

  for (const sibling of parent.children()) {
    if (sibling.equals(node)) continue;
    const zIndex = sibling.child('ZIndex');
    if (zIndex) {
      const previous = zIndex.text() ?? '';
      zIndex.setText(String((Number.parseInt(previous, 10) || 0) + delta));
      inverse.push(setNodeTextChange({ node: zIndex, value: previous }));
      continue;
    }
    const created = sibling.createElement('ZIndex', String(delta));
    insertCanonical(sibling, 'ZIndex', created);
    inverse.push({ cmd: 'removeNode', node: created });
  }

  inverse.push(...writeZIndex(node, 0));
  return inverse;
}

/** Escribe (o quita, con 0) el `ZIndex`, con el inverso byte-exacto. */
function writeZIndex(node: RdlcNode, value: number): DomainCommand[] {
  const existing = node.child('ZIndex');

  if (value === 0) {
    if (!existing) return [];
    return [restore(detach(existing), existing)];
  }

  if (existing) {
    const previous = existing.text() ?? '';
    if (previous === String(value)) return [];
    existing.setText(String(value));
    return [setNodeTextChange({ node: existing, value: previous })];
  }

  const created = node.createElement('ZIndex', String(value));
  insertCanonical(node, 'ZIndex', created);
  return [{ cmd: 'removeNode', node: created }];
}
