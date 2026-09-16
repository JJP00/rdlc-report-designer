import type { CommandResult, RdlcCommand, ScopeRef } from '@rdlc-designer/contracts';
import type { Either } from '../../shared/either.js';
import type { DomainError } from '../../shared/domainError.js';

export const COMMAND_SERVICE = Symbol('ICommandService');

/**
 * Caso de uso: ejecutar comandos y hacer undo/redo.
 * El *cómo invertir* es dominio; el journal de la sesión es aplicación.
 */
export interface ICommandService {
  execute(sessionId: string, command: RdlcCommand): Either<DomainError, CommandResult>;
  undo(sessionId: string): Either<DomainError, CommandResult>;
  redo(sessionId: string): Either<DomainError, CommandResult>;
  /** Portapapeles de items: copiar no toca el documento ni el journal. */
  copy(sessionId: string, id: string): Either<DomainError, CommandResult>;
  cut(sessionId: string, id: string): Either<DomainError, CommandResult>;
  paste(sessionId: string, scope: ScopeRef, index: number): Either<DomainError, CommandResult>;
  /** Descarta el journal de una sesión (al cerrarla). */
  drop(sessionId: string): void;
}
