import type { ErrorCode } from '@rdlc-designer/contracts';

/**
 * Errores de dominio (patrón 3DChess): factorías `static create()` y ningún
 * `throw` cruzando capas. `code` es el código del contrato IPC.
 */
export interface DomainError {
  readonly code: ErrorCode;
  readonly errorMessage: string;
  readonly data?: unknown;
}

export class FileNotFoundError implements DomainError {
  readonly code = 'E_NOT_FOUND' as const;

  private constructor(readonly errorMessage: string) {}

  static create(path: string): FileNotFoundError {
    return new FileNotFoundError(`No existe el fichero: ${path}`);
  }
}

export class InvalidXmlError implements DomainError {
  readonly code = 'E_INVALID_XML' as const;

  private constructor(
    readonly errorMessage: string,
    readonly data?: unknown,
  ) {}

  static create(path: string, detail?: string): InvalidXmlError {
    return new InvalidXmlError(
      `El fichero no es un XML RDLC válido: ${path}${detail ? ` (${detail})` : ''}`,
    );
  }
}

/**
 * RDL/RDLC con un esquema distinto del 2016/01 (2005, 2008, 2010…). El dominio
 * escribe en orden canónico 2016 y las secciones (`ReportSections`) no existen
 * antes: editarlo como si fuera 2016 lo corrompería, así que no se abre.
 */
export class UnsupportedRdlSchemaError implements DomainError {
  readonly code = 'E_UNSUPPORTED_SCHEMA' as const;

  private constructor(readonly errorMessage: string) {}

  static create(path: string, namespace: string | undefined): UnsupportedRdlSchemaError {
    const version = namespace?.match(/\/(\d{4})\/\d{2}\/reportdefinition/i)?.[1];
    const found = version
      ? `el esquema RDL ${version}`
      : namespace
        ? `un esquema distinto ('${namespace}')`
        : 'sin namespace RDL';
    return new UnsupportedRdlSchemaError(
      `El fichero usa ${found}; esta versión solo edita RDL/RDLC 2016/01. ` +
        `Ábrelo con Report Builder 2016 o superior, guárdalo para actualizarlo a 2016 y vuelve a intentarlo: ${path}`,
    );
  }
}

export class IoError implements DomainError {
  readonly code = 'E_IO' as const;

  private constructor(
    readonly errorMessage: string,
    readonly data?: unknown,
  ) {}

  static create(operation: string, path: string, error: unknown): IoError {
    return new IoError(`Error de E/S al ${operation} ${path}`, error);
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

  private constructor(readonly errorMessage: string) {}

  static create(path: string): FileConflictError {
    return new FileConflictError(
      `El fichero cambió en disco desde la última lectura y no se guardó nada: ${path}. ` +
        `Recarga el informe o usa «Guardar como…» para no perder la edición externa.`,
    );
  }
}

export class UnknownSessionError implements DomainError {
  readonly code = 'E_NOT_FOUND' as const;

  private constructor(readonly errorMessage: string) {}

  static create(sessionId: string): UnknownSessionError {
    return new UnknownSessionError(`Sesión desconocida: ${sessionId}`);
  }
}

export class CommandRejectedError implements DomainError {
  readonly code = 'E_COMMAND_REJECTED' as const;

  private constructor(
    readonly errorMessage: string,
    readonly data?: unknown,
  ) {}

  static create(message: string, data?: unknown): CommandRejectedError {
    return new CommandRejectedError(message, data);
  }
}

export class InvalidCommandError implements DomainError {
  readonly code = 'E_INVALID_COMMAND' as const;

  private constructor(readonly errorMessage: string) {}

  static create(message: string): InvalidCommandError {
    return new InvalidCommandError(message);
  }
}

export class ValidationFailedError implements DomainError {
  readonly code = 'E_VALIDATION' as const;

  private constructor(
    readonly errorMessage: string,
    readonly data?: unknown,
  ) {}

  static create(problems: string[]): ValidationFailedError {
    return new ValidationFailedError(
      `El XML no valida contra el esquema RDL 2016/01 (${problems.length} problema(s)); no se escribió el fichero`,
      problems,
    );
  }
}

export class UnexpectedError implements DomainError {
  readonly code = 'E_UNEXPECTED' as const;

  private constructor(
    readonly errorMessage: string,
    readonly data?: unknown,
  ) {}

  static create(error: unknown): UnexpectedError {
    return new UnexpectedError('Error inesperado', error);
  }
}
