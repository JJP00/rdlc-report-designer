import type { ListedSession, ProjectionDto } from '@rdlc-designer/contracts';
import type { DocumentIndex } from '../../domain/document/index/DocumentIndex.js';
import type { RdlcDocument, RdlcNode } from '../../domain/document/tree/RdlcNode.js';
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
  /** Aviso no bloqueante tras un guardado correcto (p. ej. watcher que no arrancó, BUG-56). */
  warning?: string;
}

/** Resultado de cerrar: puede pedir confirmación si hay cambios sin guardar. */
export type CloseSessionResult = { closed: true } | { closed: false; reason: 'dirty' };

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
  /**
   * Sesiones vivas en orden de apertura (con `dirty` y la proyección vigente):
   * el front las re-adopta tras recargar la interfaz (P0.1, BUG-51).
   */
  listSessions(): ListedSession[];
  open(filePath: string): Promise<Either<DomainError, OpenSessionResult>>;
  /** Escribe la plantilla en blanco en `filePath` y la abre como sesión nueva. */
  createNew(filePath: string): Promise<Either<DomainError, OpenSessionResult>>;
  save(sessionId: string): Promise<Either<DomainError, SaveSessionResult>>;
  /** Guarda copiando a `filePath`: la sesión pasa a apuntar y vigilar ahí. */
  saveAs(sessionId: string, filePath: string): Promise<Either<DomainError, SaveSessionResult>>;
  /**
   * Recarga el documento desde disco **descartando** los cambios locales
   * (resolución del conflicto «Recargar»). Devuelve la proyección nueva.
   */
  reload(sessionId: string): Promise<Either<DomainError, OpenSessionResult>>;
  /**
   * Proyección **vigente** del documento en memoria (no recarga del disco):
   * el front la pide para deshacer el optimismo de un comando rechazado.
   */
  projectionOf(sessionId: string): Either<DomainError, ProjectionDto>;
  /**
   * Cierra la sesión. Si hay cambios sin guardar y no se fuerza, **no cierra**:
   * devuelve `{ closed: false, reason: 'dirty' }` para que el front pregunte.
   */
  close(
    sessionId: string,
    options?: { force?: boolean },
  ): Promise<Either<DomainError, CloseSessionResult>>;

  /** Acceso de edición: el DOM + índice de nombres de la sesión. */
  getEditTarget(sessionId: string): Either<DomainError, EditTarget>;

  /** Guarda un clon desprendido del item en el portapapeles de la sesión. */
  copyToClipboard(sessionId: string, ids: string[]): Either<DomainError, void>;
  /** Subárboles del portapapeles (desprendidos), si los hay. */
  clipboardOf(sessionId: string): RdlcNode[] | undefined;
  /** Reconstruye el índice tras comandos que cambian estructura o límites. */
  rebuildIndex(sessionId: string): void;
  /** Mutación aplicada: sube la versión, marca dirty y emite eventos. */
  touch(sessionId: string, options?: TouchOptions): number;
  /**
   * Recalcula `dirty` comparando los bytes serializados con la referencia del
   * disco. Se llama tras **deshacer/rehacer**: volver al estado original deja
   * la sesión limpia (y el cierre de ventana ya no pide guardar).
   */
  refreshDirty(sessionId: string): void;
  versionOf(sessionId: string): number;
}
