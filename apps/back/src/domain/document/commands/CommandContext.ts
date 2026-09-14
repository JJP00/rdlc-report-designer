import type { RdlcCommand } from '@rdlc-designer/contracts';
import type { DocumentIndex } from '../index/DocumentIndex.js';
import type { RdlcNode } from '../tree/RdlcNode.js';

/** Contexto de edición: el árbol + índice por nombre. */
export interface CommandContext {
  readonly root: RdlcNode;
  readonly index: DocumentIndex;
}

/** Valores normalizados de un elemento tras aplicar un comando. */
export interface AppliedEntry {
  id: string;
  values: Record<string, unknown>;
}

/**
 * Resultado de aplicar un comando: siempre incluye su(s) inverso(s).
 *
 * Puede haber varios: mover un hijo fuera de su rectángulo genera también un
 * `setSize` del contenedor. El journal los aplica en orden inverso al deshacer.
 */
export interface CommandOutcome {
  readonly inverse: RdlcCommand | RdlcCommand[];
  /** Valores normalizados por el dominio (el front reconcilia su optimismo). */
  readonly applied?: AppliedEntry[];
}

/** Normaliza el inverso a una lista (orden de aplicación; el undo lo invierte). */
export function inverseCommands(outcome: CommandOutcome): RdlcCommand[] {
  return Array.isArray(outcome.inverse) ? outcome.inverse : [outcome.inverse];
}
