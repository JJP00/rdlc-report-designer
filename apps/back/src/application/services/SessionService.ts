import { randomUUID } from 'node:crypto';
import { IPC_EVENTS } from '@rdlc-designer/contracts';
import type { ProjectionDto } from '@rdlc-designer/contracts';
import { Injectable, Inject } from '@nestjs/common';
import { DocumentIndex } from '../../domain/document/index/DocumentIndex.js';
import type { EventBusPort } from '../ports/out/EventBusPort.js';
import { EVENT_BUS_PORT } from '../ports/out/EventBusPort.js';
import type { FileSystemPort } from '../ports/out/FileSystemPort.js';
import { FILE_SYSTEM_PORT } from '../ports/out/FileSystemPort.js';
import type { FileWatcherPort, Unwatch } from '../ports/out/FileWatcherPort.js';
import { FILE_WATCHER_PORT } from '../ports/out/FileWatcherPort.js';
import type { RdlcProjectionPort } from '../ports/out/RdlcProjectionPort.js';
import { RDLC_PROJECTION_PORT } from '../ports/out/RdlcProjectionPort.js';
import type { RdlcParserPort } from '../ports/out/RdlcParserPort.js';
import { RDLC_PARSER_PORT } from '../ports/out/RdlcParserPort.js';
import type { RdlcSerializerPort } from '../ports/out/RdlcSerializerPort.js';
import { RDLC_SERIALIZER_PORT } from '../ports/out/RdlcSerializerPort.js';
import type { XmlSchemaValidatorPort } from '../ports/out/XmlSchemaValidatorPort.js';
import { XML_SCHEMA_VALIDATOR_PORT } from '../ports/out/XmlSchemaValidatorPort.js';
import type { RdlcDocument } from '../../domain/document/tree/RdlcNode.js';
import { left, right, type Either } from '../../shared/either.js';
import type { DomainError } from '../../shared/domainError.js';
import {
  FileNotFoundError,
  InvalidXmlError,
  IoError,
  UnknownSessionError,
  ValidationFailedError,
} from '../../shared/domainError.js';
import type {
  EditTarget,
  ISessionService,
  OpenSessionResult,
  SaveSessionResult,
  TouchOptions,
} from './ISessionService.js';

interface Session {
  sessionId: string;
  filePath: string;
  document: RdlcDocument;
  /** Índice Name → nodo (O(1) por comando). */
  index: DocumentIndex;
  /** Bytes leídos del disco (referencia para el guardado quirúrgico). */
  originalBytes: Buffer;
  version: number;
  dirty: boolean;
  /** mtime de la última escritura propia (filtra el eco del watcher). */
  lastWriteMs: number;
  /** true mientras escribimos: el watcher ignora esos eventos. */
  writing: boolean;
  unwatch?: Unwatch;
}

@Injectable()
export class SessionService implements ISessionService {
  private readonly sessions = new Map<string, Session>();

  constructor(
    @Inject(FILE_SYSTEM_PORT) private readonly fileSystem: FileSystemPort,
    @Inject(FILE_WATCHER_PORT) private readonly fileWatcher: FileWatcherPort,
    @Inject(RDLC_PARSER_PORT) private readonly parser: RdlcParserPort,
    @Inject(RDLC_SERIALIZER_PORT) private readonly serializer: RdlcSerializerPort,
    @Inject(RDLC_PROJECTION_PORT) private readonly projection: RdlcProjectionPort,
    @Inject(XML_SCHEMA_VALIDATOR_PORT) private readonly schema: XmlSchemaValidatorPort,
    @Inject(EVENT_BUS_PORT) private readonly events: EventBusPort,
  ) {}

  async open(filePath: string): Promise<Either<DomainError, OpenSessionResult>> {
    if (!(await this.fileSystem.exists(filePath))) {
      return left(FileNotFoundError.create(filePath));
    }

    const read = await this.tryRead(filePath);
    if (read.isLeft()) return left(read.value);

    const parsed = this.tryParse(filePath, read.value);
    if (parsed.isLeft()) return left(parsed.value);

    let mtimeMs: number;
    try {
      mtimeMs = (await this.fileSystem.stat(filePath)).mtimeMs;
    } catch (error) {
      return left(IoError.create('leer', filePath, error));
    }

    const sessionId = randomUUID();
    const session: Session = {
      sessionId,
      filePath,
      document: parsed.value,
      index: DocumentIndex.build(parsed.value.root),
      originalBytes: read.value,
      version: 1,
      dirty: false,
      lastWriteMs: mtimeMs,
      writing: false,
    };
    this.sessions.set(sessionId, session);

    session.unwatch = await this.fileWatcher.watch(filePath, () => {
      void this.onExternalChange(sessionId);
    });

    // Validación de esquema al importar: avisa, no bloquea (el usuario puede
    // querer arreglar un fichero roto con la herramienta).
    const validation = this.schema.validate(read.value.toString('utf8'));
    const warnings = validation.valid ? undefined : validation.problems;

    return right({
      sessionId,
      projection: this.project(session),
      ...(warnings ? { warnings } : {}),
    });
  }

  async save(sessionId: string): Promise<Either<DomainError, SaveSessionResult>> {
    const session = this.sessions.get(sessionId);
    if (!session) return left(UnknownSessionError.create(sessionId));

    const xml = this.serializer.serialize(session.document);
    const bytes = Buffer.from(xml, 'utf8');

    // Validación de esquema ANTES de escribir: BC rompe con un XML inválido.
    const validation = this.schema.validate(xml);
    if (!validation.valid) {
      return left(ValidationFailedError.create(validation.problems));
    }

    const bytesIdentical = bytes.equals(session.originalBytes);

    session.writing = true;
    try {
      await this.fileSystem.writeFile(session.filePath, bytes);
      const stat = await this.fileSystem.stat(session.filePath);
      session.lastWriteMs = stat.mtimeMs;
      session.originalBytes = bytes;
    } catch (error) {
      return left(IoError.create('escribir', session.filePath, error));
    } finally {
      session.writing = false;
    }

    session.document.markClean();
    if (session.dirty) {
      session.dirty = false;
      this.events.send(IPC_EVENTS.dirtyChanged, { sessionId, dirty: false });
    }

    this.events.send(IPC_EVENTS.saved, { sessionId, path: session.filePath });
    return right({ path: session.filePath, bytesIdentical });
  }

  async close(sessionId: string): Promise<Either<DomainError, void>> {
    const session = this.sessions.get(sessionId);
    if (!session) return left(UnknownSessionError.create(sessionId));
    session.unwatch?.();
    this.sessions.delete(sessionId);
    this.events.send(IPC_EVENTS.sessionClosed, { sessionId });
    return right(undefined);
  }

  /* ------------------- acceso de edición (comandos) ------------------- */

  getEditTarget(sessionId: string): Either<DomainError, EditTarget> {
    const session = this.sessions.get(sessionId);
    if (!session) return left(UnknownSessionError.create(sessionId));
    return right({ document: session.document, index: session.index });
  }

  rebuildIndex(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.index = DocumentIndex.build(session.document.root);
  }

  touch(sessionId: string, options?: TouchOptions): number {
    const session = this.sessions.get(sessionId);
    if (!session) return 0;

    session.version += 1;

    if (!session.dirty && session.document.isDirty()) {
      session.dirty = true;
      this.events.send(IPC_EVENTS.dirtyChanged, { sessionId, dirty: true });
    }

    if (options?.snapshotOut) {
      this.events.send(IPC_EVENTS.documentChanged, {
        sessionId,
        projection: this.project(session),
      });
    }
    return session.version;
  }

  versionOf(sessionId: string): number {
    return this.sessions.get(sessionId)?.version ?? 0;
  }

  /* --------------------------- interno -------------------------------- */

  private async onExternalChange(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session || session.writing) return;

    try {
      const stat = await this.fileSystem.stat(session.filePath);
      // Eco de nuestra propia escritura (p. ej. si `writing` ya se limpió).
      if (stat.mtimeMs <= session.lastWriteMs) return;

      const bytes = await this.fileSystem.readFile(session.filePath);
      const doc = this.parser.parse(bytes.toString('utf8'));

      session.document = doc;
      session.index = DocumentIndex.build(doc.root);
      session.originalBytes = bytes;
      session.version += 1;
      session.lastWriteMs = stat.mtimeMs;

      if (session.dirty) {
        session.dirty = false;
        this.events.send(IPC_EVENTS.dirtyChanged, { sessionId, dirty: false });
      }

      this.events.send(IPC_EVENTS.documentChanged, {
        sessionId,
        projection: this.project(session),
      });
    } catch {
      // Fichero corrupto o ilegible: F1 emitirá `conflictDetected`/toast.
    }
  }

  private project(session: Session): ProjectionDto {
    return this.projection.project({
      sessionId: session.sessionId,
      filePath: session.filePath,
      document: session.document,
      version: session.version,
    }) as ProjectionDto;
  }

  private async tryRead(filePath: string): Promise<Either<DomainError, Buffer>> {
    try {
      return right(await this.fileSystem.readFile(filePath));
    } catch (error) {
      return left(IoError.create('leer', filePath, error));
    }
  }

  private tryParse(filePath: string, bytes: Buffer): Either<DomainError, RdlcDocument> {
    try {
      return right(this.parser.parse(bytes.toString('utf8')));
    } catch (error) {
      return left(InvalidXmlError.create(filePath, (error as Error).message));
    }
  }
}
