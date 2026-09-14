import type { ProjectionDto } from '@rdlc-designer/contracts';
import type { Either } from '../../shared/either.js';
import type { DomainError } from '../../shared/domainError.js';

export const SESSION_SERVICE = Symbol('ISessionService');

export interface OpenSessionResult {
  sessionId: string;
  projection: ProjectionDto;
}

export interface SaveSessionResult {
  path: string;
  /** true si el documento no se tocó: se re-escribieron exactamente los mismos bytes. */
  bytesIdentical: boolean;
}

/** Caso de uso: ciclo de vida de pestañas (abrir/guardar/cerrar/vigilar). */
export interface ISessionService {
  open(filePath: string): Promise<Either<DomainError, OpenSessionResult>>;
  save(sessionId: string): Promise<Either<DomainError, SaveSessionResult>>;
  close(sessionId: string): Promise<Either<DomainError, void>>;
}
