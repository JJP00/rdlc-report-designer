import type { RdlcCommand } from '@rdlc-designer/contracts';
import { right, left, type Either } from '../../../shared/either.js';
import { CommandRejectedError, type DomainError } from '../../../shared/domainError.js';
import { insertCanonical } from '../geometry/geometry.js';
import type { RdlcNode } from '../tree/RdlcNode.js';
import type { CommandContext, CommandOutcome, DomainCommand } from './CommandContext.js';
import { detach, restore, setNodeTextChange } from './nodeChanges.js';

export type SetItemOptionsCommand = Extract<RdlcCommand, { cmd: 'setItemOptions' }>;

/** Tipos de item que admiten cada opción (la opción vive en el propio item). */
const CAN_GROW_ITEMS = ['Textbox'];
const KEEP_TOGETHER_ITEMS = ['Textbox', 'Tablix', 'Rectangle'];
const TABLIX_ONLY_ITEMS = ['Tablix'];

/**
 * Opciones del item que no viven en `Style`: `CanGrow`/`KeepTogether` (Textbox,
 * Tablix y Rectangle según el caso) y, solo en Tablix, `RepeatColumnHeaders`,
 * `RepeatRowHeaders` y `NoRowsMessage`.
 *
 * En RDL el valor por defecto de los booleanos es `false`, así que **apagarlos
 * quita la etiqueta** (como hace Report Builder) en vez de escribir
 * `<CanGrow>false</CanGrow>`; encenderlos escribe `true` creando el nodo en orden
 * canónico. `NoRowsMessage` vacío quita la etiqueta igual. El undo es
 * byte-exacto: lo creado se quita, lo existente vuelve con su texto anterior y
 * lo borrado se reinserta en su posición.
 */
export function applySetItemOptions(
  ctx: CommandContext,
  command: SetItemOptionsCommand,
): Either<DomainError, CommandOutcome> {
  const node = ctx.index.get(command.id);
  if (!node) return left(CommandRejectedError.of('itemMissing', { id: command.id }));

  const requested = [
    command.canGrow,
    command.keepTogether,
    command.repeatColumnHeaders,
    command.repeatRowHeaders,
    command.noRowsMessage,
  ];
  if (requested.every((value) => value === undefined)) {
    return left(CommandRejectedError.of('noOptionToChange'));
  }

  // Nunca ignorar en silencio: cada opción pedida debe admitirla el tipo del item.
  const unsupported =
    (command.canGrow !== undefined && !CAN_GROW_ITEMS.includes(node.tagName)) ||
    (command.keepTogether !== undefined && !KEEP_TOGETHER_ITEMS.includes(node.tagName)) ||
    (command.repeatColumnHeaders !== undefined && !TABLIX_ONLY_ITEMS.includes(node.tagName)) ||
    (command.repeatRowHeaders !== undefined && !TABLIX_ONLY_ITEMS.includes(node.tagName)) ||
    (command.noRowsMessage !== undefined && !TABLIX_ONLY_ITEMS.includes(node.tagName));
  if (unsupported) {
    return left(CommandRejectedError.of('itemOptionsUnsupported', { id: command.id }));
  }

  const inverse: DomainCommand[] = [];

  if (command.canGrow !== undefined) {
    applyFlag(node, 'CanGrow', command.canGrow, inverse);
  }
  if (command.keepTogether !== undefined) {
    applyFlag(node, 'KeepTogether', command.keepTogether, inverse);
  }
  if (command.repeatColumnHeaders !== undefined) {
    applyFlag(node, 'RepeatColumnHeaders', command.repeatColumnHeaders, inverse);
  }
  if (command.repeatRowHeaders !== undefined) {
    applyFlag(node, 'RepeatRowHeaders', command.repeatRowHeaders, inverse);
  }
  if (command.noRowsMessage !== undefined) {
    applyText(node, 'NoRowsMessage', command.noRowsMessage, inverse);
  }

  // Pide snapshot: apagar una opción **quita** la etiqueta y `applied` no puede
  // expresar "ausente" (un `undefined` por IPC desaparece); la proyección nueva
  // deja el flag como `undefined` y el panel se sincroniza solo.
  return right({ inverse, snapshotOut: true });
}

/** Enciende (`true`) o apaga (quita) el flag, apuntando el inverso. */
function applyFlag(
  parent: RdlcNode,
  tag: 'CanGrow' | 'KeepTogether' | 'RepeatColumnHeaders' | 'RepeatRowHeaders',
  value: boolean,
  inverse: DomainCommand[],
): void {
  applyText(parent, tag, value ? 'true' : undefined, inverse);
}

/**
 * Escribe el texto del hijo `tag` (creándolo en orden canónico si falta), o lo
 * quita si `text` es `undefined` o vacío. Apunta el inverso correspondiente.
 */
function applyText(
  parent: RdlcNode,
  tag: string,
  text: string | undefined,
  inverse: DomainCommand[],
): void {
  const existing = parent.child(tag);
  const value = text === '' ? undefined : text;

  if (value === undefined) {
    if (existing) inverse.push(restore(detach(existing), existing));
    return;
  }

  if (existing) {
    const previous = existing.text() ?? '';
    if (previous === value) return;
    inverse.push(setNodeTextChange({ node: existing, value: previous }));
    existing.setText(value);
    return;
  }
  const created = parent.createElement(tag, value);
  insertCanonical(parent, tag, created);
  inverse.push({ cmd: 'removeNode', node: created });
}
