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
 * Devuelve un **atributo** a su valor anterior (p. ej. el `Name` al renombrar
 * con `setName`). Los items siempre tienen `Name` (lo exige el XSD), así que no
 * hace falta quitarlo.
 */
export interface SetAttributeCommand {
  readonly cmd: 'setAttribute';
  readonly node: RdlcNode;
  readonly name: string;
  readonly value: string;
}

/**
 * Mueve un nodo a otro contenedor/posición (`remove` + `insert`), para inversos
 * que devuelven subárboles a su sitio (p. ej. elevar las filas al quitar un
 * grupo). El nodo conserva su indentación recordada.
 */
export interface MoveNodeCommand {
  readonly cmd: 'moveNode';
  readonly node: RdlcNode;
  readonly container: RdlcNode;
  readonly index: number;
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

/**
 * Pega **varios** clones consecutivos del portapapeles (multiselección): cada
 * origen se clona y renombra; todo es **un solo paso de undo**.
 */
export interface InsertClonesCommand {
  readonly cmd: 'insertClones';
  readonly scope: ScopeRef;
  readonly index: number;
  readonly sources: RdlcNode[];
}

/**
 * Pega un bloque de **celdas** del portapapeles en un Tablix: `(row, col)` es la
 * celda ancla y cada entrada cae en `(row + dRow, col + dCol)`. Un solo paso de
 * undo; lo que no cabe en la tabla se descarta (nunca la hace crecer).
 */
export interface InsertCellClonesCommand {
  readonly cmd: 'insertCellClones';
  /** Nombre del Tablix. */
  readonly id: string;
  readonly row: number;
  readonly col: number;
  readonly entries: { dRow: number; dCol: number; source: RdlcNode }[];
}

export type InternalCommand =
  | RemoveNodeCommand
  | RestoreNodeCommand
  | SetNodeTextCommand
  | SetAttributeCommand
  | MoveNodeCommand
  | InsertCloneCommand
  | InsertClonesCommand
  | InsertCellClonesCommand;

export function isInternalCommand(command: { cmd: string }): command is InternalCommand {
  return (
    command.cmd === 'removeNode' ||
    command.cmd === 'restoreNode' ||
    command.cmd === 'setNodeText' ||
    command.cmd === 'setAttribute' ||
    command.cmd === 'moveNode' ||
    command.cmd === 'insertClone' ||
    command.cmd === 'insertClones' ||
    command.cmd === 'insertCellClones'
  );
}

/** Referencia de scope usada por los tests/diagnóstico. */
export type { ScopeRef };
