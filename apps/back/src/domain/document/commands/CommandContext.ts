import type { RdlcCommand } from '@rdlc-designer/contracts';
import type { DocumentIndex } from '../index/DocumentIndex.js';
import type { RdlcNode } from '../tree/RdlcNode.js';

/** Contexto de edición: el árbol + índice por nombre. */
export interface CommandContext {
  readonly root: RdlcNode;
  readonly index: DocumentIndex;
}

/**
 * Resultado de aplicar un comando: siempre incluye su inverso.
 * `undo` = aplicar la inversa; `redo` = volver a aplicar el comando (que
 * devuelve una inversa nueva). El journal vive en la capa de aplicación.
 */
export interface CommandOutcome {
  readonly inverse: RdlcCommand;
  /** Valores normalizados por el dominio (el front reconcilia su optimismo). */
  readonly applied?: Record<string, unknown>;
}
