import type { RdlcCommand } from '@rdlc-designer/contracts';
import type { DocumentIndex } from '../index/DocumentIndex.js';
import type { RdlcNode } from '../tree/RdlcNode.js';
import type { InternalCommand } from './internal.js';

/** Contexto de edición: el árbol + índice por nombre. */
export interface CommandContext {
  readonly root: RdlcNode;
  readonly index: DocumentIndex;
}

/** Comando que el journal puede aplicar: público (IPC) o interno. */
export type DomainCommand = RdlcCommand | InternalCommand;

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
  readonly inverse: DomainCommand | DomainCommand[];
  /** Valores normalizados por el dominio (el front reconcilia su optimismo). */
  readonly applied?: AppliedEntry[];
  /**
   * Nombre del item creado por el comando (`insertItem`/`duplicateItem`/
   * `insertClone`): el front lo usa para seleccionarlo sin adivinar.
   */
  readonly createdId?: string;
  /** Ids creados por un `batch` (varios duplicados/pegados en un paso). */
  readonly createdIds?: string[];
  /**
   * true si el comando tocó partes del documento que `applied` no puede
   * expresar (p. ej. los `<Style>` de párrafos/runs al limpiar overrides) y el
   * front necesita una proyección completa para no quedarse con datos viejos.
   */
  readonly snapshotOut?: boolean;
}

/** Normaliza el inverso a una lista (orden de aplicación; el undo lo invierte). */
export function inverseCommands(outcome: CommandOutcome): DomainCommand[] {
  return Array.isArray(outcome.inverse) ? outcome.inverse : [outcome.inverse];
}
