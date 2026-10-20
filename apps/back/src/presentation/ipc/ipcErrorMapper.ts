import type { IpcErrorDto } from '@rdlc-designer/contracts';
import type { DomainError } from '../../shared/domainError.js';
import { describeError } from '../../shared/describeError.js';
import { UnexpectedError } from '../../shared/domainError.js';

/**
 * Mapea errores de dominio al contrato IPC (`ok:false` + código + `reason`).
 * El `message` que viaja es el diagnóstico **en inglés** (logs, MCP); la UI
 * compone el mensaje visible desde `reason`/`params` con sus catálogos.
 * Equivalente al `httpErrorMapper` de 3DChess, pero para el canal IPC.
 */
export function toIpcError(error: DomainError): IpcErrorDto {
  return {
    ok: false,
    code: error.code,
    reason: error.reason,
    ...(error.params ? { params: { ...error.params } } : {}),
    message: describeError(error),
    ...(error.data === undefined ? {} : { data: error.data }),
  };
}

export function unexpectedToIpcError(error: unknown): IpcErrorDto {
  return toIpcError(UnexpectedError.create(error));
}
