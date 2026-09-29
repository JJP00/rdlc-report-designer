import type { RdlcCommand } from '@rdlc-designer/contracts';
import { right, left, type Either } from '../../../shared/either.js';
import { CommandRejectedError, type DomainError } from '../../../shared/domainError.js';
import { insertCanonical } from '../geometry/geometry.js';
import type { RdlcNode } from '../tree/RdlcNode.js';
import type { CommandContext, CommandOutcome, DomainCommand } from './CommandContext.js';
import { detach, restore, setNodeTextChange } from './nodeChanges.js';

export type SetItemOptionsCommand = Extract<RdlcCommand, { cmd: 'setItemOptions' }>;

/**
 * Opciones del item que no viven en `Style` (`CanGrow`/`KeepTogether`).
 *
 * En RDL el valor por defecto de ambas es `false`, así que **apagarlas quita la
 * etiqueta** (como hace Report Builder) en vez de escribir `<CanGrow>false</CanGrow>`;
 * encenderlas escribe `true` creando el nodo en orden canónico. El undo es
 * byte-exacto: lo creado se quita, lo existente vuelve con su texto anterior y
 * lo borrado se reinserta en su posición.
 */
export function applySetItemOptions(
  ctx: CommandContext,
  command: SetItemOptionsCommand,
): Either<DomainError, CommandOutcome> {
  const node = ctx.index.get(command.id);
  if (!node) return left(CommandRejectedError.create(`No existe el elemento '${command.id}'`));

  if (command.canGrow === undefined && command.keepTogether === undefined) {
    return left(CommandRejectedError.create('No hay ninguna opción que cambiar'));
  }

  // De momento solo el Textbox las proyecta; el resto se rechaza con motivo
  // (nunca ignorar en silencio).
  if (node.tagName !== 'Textbox') {
    return left(CommandRejectedError.create(`'${command.id}' no admite CanGrow ni KeepTogether`));
  }

  const inverse: DomainCommand[] = [];

  if (command.canGrow !== undefined) {
    applyFlag(node, 'CanGrow', command.canGrow, inverse);
  }
  if (command.keepTogether !== undefined) {
    applyFlag(node, 'KeepTogether', command.keepTogether, inverse);
  }

  // Pide snapshot: apagar una opción **quita** la etiqueta y `applied` no puede
  // expresar "ausente" (un `undefined` por IPC desaparece); la proyección nueva
  // deja el flag como `undefined` y el panel se sincroniza solo.
  return right({ inverse, snapshotOut: true });
}

/** Enciende (`true`) o apaga (quita) el flag, apuntando el inverso. */
function applyFlag(
  parent: RdlcNode,
  tag: 'CanGrow' | 'KeepTogether',
  value: boolean,
  inverse: DomainCommand[],
): void {
  const existing = parent.child(tag);

  if (value) {
    if (existing) {
      const previous = existing.text() ?? '';
      if (previous === 'true') return;
      inverse.push(setNodeTextChange({ node: existing, value: previous }));
      existing.setText('true');
      return;
    }
    const created = parent.createElement(tag, 'true');
    insertCanonical(parent, tag, created);
    inverse.push({ cmd: 'removeNode', node: created });
    return;
  }

  if (existing) inverse.push(restore(detach(existing), existing));
}
