import type { ProjectionDto } from '@rdlc-designer/contracts';
import type { DocumentIndex } from '../../domain/document/index/DocumentIndex.js';
import type { RdlcDocument } from '../../domain/document/tree/RdlcNode.js';
import type { Either } from '../../shared/either.js';
import type { DomainError } from '../../shared/domainError.js';

export const SESSION_SERVICE = Symbol('ISessionService');

export interface OpenSessionResult {
  sessionId: string;
  projection: ProjectionDto;
  /** Problemas de esquema al importar (aviso; el fichero se abre igual). */
  warnings?: string[];
}

export interface SaveSessionResult {
  path: string;
  /** true si el documento no se tocó: se re-escribieron exactamente los mismos bytes. */
  bytesIdentical: boolean;
}

/** Lo que necesita el CommandService de una sesión. */
export interface EditTarget {
  document: RdlcDocument;
  index: DocumentIndex;
}

export interface TouchOptions {
  /** Emite la proyección completa (undo/redo: el front redibuja). */
  snapshotOut?: boolean;
}

/** Caso de uso: ciclo de vida de pestañas (abrir/guardar/cerrar/vigilar). */
export interface ISessionService {
  open(filePath: string): Promise<Either<DomainError, OpenSessionResult>>;
  save(sessionId: string): Promise<Either<DomainError, SaveSessionResult>>;
  close(sessionId: string): Promise<Either<DomainError, void>>;

  /** Acceso de edición: el DOM + índice de nombres de la sesión. */
  getEditTarget(sessionId: string): Either<DomainError, EditTarget>;
  /** Reconstruye el índice tras comandos que cambian estructura o límites. */
  rebuildIndex(sessionId: string): void;
  /** Mutación aplicada: sube la versión, marca dirty y emite eventos. */
  touch(sessionId: string, options?: TouchOptions): number;
  versionOf(sessionId: string): number;
}
