import type { ErrorCode } from '@rdlc-designer/contracts';
import type { ErrorReason } from './errorReasons.js';

/**
 * Errores de dominio (patrón 3DChess): factorías `static create()` y ningún
 * `throw` cruzando capas. `code` es el código del contrato IPC; `reason` es el
 * motivo estable (i18n) y `params` los valores de su plantilla.
 *
 * El dominio **no compone prosa**: la traducción vive en los bordes (front,
 * main, MCP) con los catálogos `errors.<reason>`.
 */
export interface DomainError {
  readonly code: ErrorCode;
  readonly reason: ErrorReason;
  readonly params?: Readonly<Record<string, string | number>>;
  /** Datos adjuntos para la UI (p. ej. la lista de problemas del XSD). */
  readonly data?: unknown;
}

export class FileNotFoundError implements DomainError {
  readonly code = 'E_NOT_FOUND' as const;
  readonly reason = 'fileMissing' as const;

  private constructor(readonly params: { path: string }) {}

  static create(path: string): FileNotFoundError {
    return new FileNotFoundError({ path });
  }
}

export class InvalidXmlError implements DomainError {
  readonly code = 'E_INVALID_XML' as const;
  readonly reason: 'invalidXml' | 'invalidXmlDetail';

  private constructor(
    reason: 'invalidXml' | 'invalidXmlDetail',
    readonly params: { path: string; detail?: string },
    readonly data?: unknown,
  ) {
    this.reason = reason;
  }

  static create(path: string, detail?: string): InvalidXmlError {
    return detail
      ? new InvalidXmlError('invalidXmlDetail', { path, detail })
      : new InvalidXmlError('invalidXml', { path });
  }
}

/**
 * RDL/RDLC con un esquema distinto del 2016/01 (2005, 2008, 2010…). El dominio
 * escribe en orden canónico 2016 y las secciones (`ReportSections`) no existen
 * antes: editarlo como si fuera 2016 lo corrompería, así que no se abre.
 */
export class UnsupportedRdlSchemaError implements DomainError {
  readonly code = 'E_UNSUPPORTED_SCHEMA' as const;
  readonly reason:
    | 'unsupportedSchemaVersion'
    | 'unsupportedSchemaNamespace'
    | 'unsupportedSchemaUnknown';

  private constructor(
    reason: UnsupportedRdlSchemaError['reason'],
    readonly params: { path: string; version?: string; namespace?: string },
  ) {
    this.reason = reason;
  }

  static create(path: string, namespace: string | undefined): UnsupportedRdlSchemaError {
    const version = namespace?.match(/\/(\d{4})\/\d{2}\/reportdefinition/i)?.[1];
    if (version) return new UnsupportedRdlSchemaError('unsupportedSchemaVersion', { path, version });
    if (namespace) {
      return new UnsupportedRdlSchemaError('unsupportedSchemaNamespace', { path, namespace });
    }
    return new UnsupportedRdlSchemaError('unsupportedSchemaUnknown', { path });
  }
}

/** Operaciones del puerto de fichero (`reason` = `io<X>Failed`). */
export type IoOperation = 'read' | 'write' | 'watch';

const IO_REASONS: Record<IoOperation, ErrorReason & ('ioReadFailed' | 'ioWriteFailed' | 'ioWatchFailed')> = {
  read: 'ioReadFailed',
  write: 'ioWriteFailed',
  watch: 'ioWatchFailed',
};

export class IoError implements DomainError {
  readonly code = 'E_IO' as const;

  private constructor(
    readonly reason: ErrorReason,
    readonly params: { path: string },
    readonly data?: unknown,
  ) {}

  static create(operation: IoOperation, path: string, error: unknown): IoError {
    return new IoError(IO_REASONS[operation], { path }, error);
  }
}

/**
 * El fichero cambió en disco (mtime/tamaño/contenido) desde la última
 * referencia de la sesión y el guardado se rechaza para no pisotear la edición
 * externa. El watcher también lo detecta, pero puede perder el evento
 * (debounce, unidad de red): Guardar comprueba el disco antes de escribir.
 */
export class FileConflictError implements DomainError {
  readonly code = 'E_CONFLICT' as const;
  readonly reason = 'fileChangedOnDisk' as const;

  private constructor(readonly params: { path: string }) {}

  static create(path: string): FileConflictError {
    return new FileConflictError({ path });
  }
}

export class UnknownSessionError implements DomainError {
  readonly code = 'E_NOT_FOUND' as const;
  readonly reason = 'sessionUnknown' as const;

  private constructor(readonly params: { sessionId: string }) {}

  static create(sessionId: string): UnknownSessionError {
    return new UnknownSessionError({ sessionId });
  }
}

export class CommandRejectedError implements DomainError {
  readonly code = 'E_COMMAND_REJECTED' as const;

  private constructor(
    readonly reason: ErrorReason,
    readonly params?: Readonly<Record<string, string | number>>,
    readonly data?: unknown,
  ) {}

  static of(
    reason: ErrorReason,
    params?: Readonly<Record<string, string | number>>,
    data?: unknown,
  ): CommandRejectedError {
    return new CommandRejectedError(reason, params, data);
  }
}

export class InvalidCommandError implements DomainError {
  readonly code = 'E_INVALID_COMMAND' as const;

  private constructor(
    readonly reason: ErrorReason,
    readonly params?: Readonly<Record<string, string | number>>,
  ) {}

  static of(
    reason: ErrorReason,
    params?: Readonly<Record<string, string | number>>,
  ): InvalidCommandError {
    return new InvalidCommandError(reason, params);
  }
}

export class ValidationFailedError implements DomainError {
  readonly code = 'E_VALIDATION' as const;
  readonly reason = 'xsdValidationFailed' as const;

  private constructor(
    readonly params: { count: number },
    readonly data: string[],
  ) {}

  static create(problems: string[]): ValidationFailedError {
    return new ValidationFailedError({ count: problems.length }, problems);
  }
}

export class UnexpectedError implements DomainError {
  readonly code = 'E_UNEXPECTED' as const;
  readonly reason = 'unexpected' as const;

  private constructor(readonly data?: unknown) {}

  static create(error: unknown): UnexpectedError {
    return new UnexpectedError(error);
  }
}
