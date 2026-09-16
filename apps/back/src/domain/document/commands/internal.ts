import type { ScopeRef } from '@rdlc-designer/contracts';
import type { RdlcNode } from '../tree/RdlcNode.js';

/**
 * Comandos internos del journal (no viajan por IPC: el front usa el catálogo
 * público). Existen para que insertar/duplicar/eliminar tengan inverso:
 *
 * - `removeNode`: deshace un `insertItem`/`duplicateItem` (quita por nombre).
 * - `restoreNode`: deshace un `deleteItem` reinsertando el subárbol
 *   desprendido (el nodo sigue vivo en memoria, sin re-serializar nada).
 */

export interface RemoveNodeCommand {
  readonly cmd: 'removeNode';
  /** Nodo a quitar (referencia directa: no depende del índice, que puede estar desactualizado). */
  readonly node: RdlcNode;
}

export interface RestoreNodeCommand {
  readonly cmd: 'restoreNode';
  readonly node: RdlcNode;
  readonly container: RdlcNode;
  readonly index: number;
  readonly name: string;
}

/**
 * Devuelve un nodo de texto a su contenido anterior sin moverlo (p. ej. los
 * `<Style>` de párrafos/runs que `setStyle` sincroniza). A diferencia de
 * `restoreNode` no hay que reinsertar nada: la posición no cambió.
 */
export interface SetNodeTextCommand {
  readonly cmd: 'setNodeText';
  readonly node: RdlcNode;
  readonly value: string;
}

/**
 * Pega un clon del portapapeles: el nodo origen vive **desprendido** del
 * documento (lo guardó `copy`/`cut`), así que cada pegado clona y renombra.
 */
export interface InsertCloneCommand {
  readonly cmd: 'insertClone';
  readonly scope: ScopeRef;
  readonly index: number;
  readonly source: RdlcNode;
}

export type InternalCommand =
  | RemoveNodeCommand
  | RestoreNodeCommand
  | SetNodeTextCommand
  | InsertCloneCommand;

export function isInternalCommand(command: { cmd: string }): command is InternalCommand {
  return (
    command.cmd === 'removeNode' ||
    command.cmd === 'restoreNode' ||
    command.cmd === 'setNodeText' ||
    command.cmd === 'insertClone'
  );
}

/** Referencia de scope usada por los tests/diagnóstico. */
export type { ScopeRef };
