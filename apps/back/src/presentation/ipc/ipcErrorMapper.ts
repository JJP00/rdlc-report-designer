import type { IpcErrorDto } from '@rdlc-designer/contracts';
import type { DomainError } from '../../shared/domainError.js';
import { UnexpectedError } from '../../shared/domainError.js';

/**
 * Mapea errores de dominio al contrato IPC (`ok:false` + código).
 * Equivalente al `httpErrorMapper` de 3DChess, pero para el canal IPC.
 */
export function toIpcError(error: DomainError): IpcErrorDto {
  return error.data === undefined
    ? { ok: false, code: error.code, message: error.errorMessage }
    : { ok: false, code: error.code, message: error.errorMessage, data: error.data };
}

export function unexpectedToIpcError(error: unknown): IpcErrorDto {
  return toIpcError(UnexpectedError.create(error));
}
