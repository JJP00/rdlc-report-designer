import { randomUUID } from 'node:crypto';
import { IPC_EVENTS } from '@rdlc-designer/contracts';
import type { ProjectionDto } from '@rdlc-designer/contracts';
import { Injectable, Inject } from '@nestjs/common';
import { DocumentIndex } from '../../domain/document/index/DocumentIndex.js';
import { BLANK_REPORT_XML } from '../../domain/document/templates/blankReport.js';
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
import type { RdlcDocument, RdlcNode } from '../../domain/document/tree/RdlcNode.js';
import { left, right, type Either } from '../../shared/either.js';
import type { DomainError } from '../../shared/domainError.js';
import {
  CommandRejectedError,
  FileNotFoundError,
  InvalidXmlError,
  IoError,
  UnknownSessionError,
  UnsupportedRdlSchemaError,
  ValidationFailedError,
} from '../../shared/domainError.js';
import type {
  CloseSessionResult,
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
  /** Subárboles desprendidos copiados/cortados (portapapeles de la sesión). */
  clipboard?: RdlcNode[];
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

    // RDL y RDLC comparten el esquema 2016/01; otras versiones no se abren
    // (ver `checkSupportedSchema`).
    const schemaProblem = checkSupportedSchema(filePath, parsed.value.root);
    if (schemaProblem) return left(schemaProblem);

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

  async createNew(filePath: string): Promise<Either<DomainError, OpenSessionResult>> {
    // La plantilla en blanco se escribe y se abre como cualquier informe: a
    // partir de ahí la sesión no tiene nada especial (comandos normales).
    try {
      await this.fileSystem.writeFile(filePath, Buffer.from(BLANK_REPORT_XML, 'utf8'));
    } catch (error) {
      return left(IoError.create('escribir', filePath, error));
    }
    return this.open(filePath);
  }

  async save(sessionId: string): Promise<Either<DomainError, SaveSessionResult>> {
    const session = this.sessions.get(sessionId);
    if (!session) return left(UnknownSessionError.create(sessionId));

    const serialized = this.serializeValidated(session);
    if (serialized.isLeft()) return left(serialized.value);

    const written = await this.writeTo(session, session.filePath, serialized.value.bytes);
    if (written.isLeft()) return left(written.value);

    this.markSaved(session, session.filePath);
    return right({
      path: session.filePath,
      bytesIdentical: serialized.value.bytesIdentical,
    });
  }

  async saveAs(
    sessionId: string,
    filePath: string,
  ): Promise<Either<DomainError, SaveSessionResult>> {
    const session = this.sessions.get(sessionId);
    if (!session) return left(UnknownSessionError.create(sessionId));

    const serialized = this.serializeValidated(session);
    if (serialized.isLeft()) return left(serialized.value);

    const written = await this.writeTo(session, filePath, serialized.value.bytes);
    if (written.isLeft()) return left(written.value);

    // La sesión pasa a apuntar (y vigilar) el fichero nuevo.
    session.unwatch?.();
    session.filePath = filePath;
    session.unwatch = await this.fileWatcher.watch(filePath, () => {
      void this.onExternalChange(sessionId);
    });

    this.markSaved(session, filePath);
    return right({ path: filePath, bytesIdentical: serialized.value.bytesIdentical });
  }

  async reload(sessionId: string): Promise<Either<DomainError, OpenSessionResult>> {
    const session = this.sessions.get(sessionId);
    if (!session) return left(UnknownSessionError.create(sessionId));

    const read = await this.tryRead(session.filePath);
    if (read.isLeft()) return left(read.value);
    const parsed = this.tryParse(session.filePath, read.value);
    if (parsed.isLeft()) return left(parsed.value);

    let mtimeMs: number;
    try {
      mtimeMs = (await this.fileSystem.stat(session.filePath)).mtimeMs;
    } catch (error) {
      return left(IoError.create('leer', session.filePath, error));
    }

    // Se descarta el documento local (el usuario eligió «Recargar»): journal,
    // portapapeles y dirty se van con él.
    session.document = parsed.value;
    session.index = DocumentIndex.build(parsed.value.root);
    session.originalBytes = read.value;
    session.version += 1;
    session.lastWriteMs = mtimeMs;
    session.clipboard = undefined;
    if (session.dirty) {
      session.dirty = false;
      this.events.send(IPC_EVENTS.dirtyChanged, { sessionId, dirty: false });
    }

    const validation = this.schema.validate(read.value.toString('utf8'));
    const warnings = validation.valid ? undefined : validation.problems;
    return right({
      sessionId,
      projection: this.project(session),
      ...(warnings ? { warnings } : {}),
    });
  }

  async close(
    sessionId: string,
    options?: { force?: boolean },
  ): Promise<Either<DomainError, CloseSessionResult>> {
    const session = this.sessions.get(sessionId);
    if (!session) return left(UnknownSessionError.create(sessionId));

    // Con cambios sin guardar no se cierra en silencio: decide el usuario.
    if (session.dirty && options?.force !== true) {
      return right({ closed: false, reason: 'dirty' });
    }

    session.unwatch?.();
    this.sessions.delete(sessionId);
    this.events.send(IPC_EVENTS.sessionClosed, { sessionId });
    return right({ closed: true });
  }

  /* ------------------- acceso de edición (comandos) ------------------- */

  getEditTarget(sessionId: string): Either<DomainError, EditTarget> {
    const session = this.sessions.get(sessionId);
    if (!session) return left(UnknownSessionError.create(sessionId));
    return right({ document: session.document, index: session.index });
  }

  /**
   * Guarda subárboles **desprendidos** en el portapapeles de la sesión: al
   * clonar se pierde el vínculo con el documento, así que pegarlos más tarde (o
   * tras deshacer el borrado) no depende de que los originales sigan existiendo.
   * Acepta varios ids (multiselección) y conserva su orden.
   */
  copyToClipboard(sessionId: string, ids: string[]): Either<DomainError, void> {
    const session = this.sessions.get(sessionId);
    if (!session) return left(UnknownSessionError.create(sessionId));

    const nodes: RdlcNode[] = [];
    for (const id of ids) {
      const node = session.index.get(id);
      if (!node) return left(CommandRejectedError.create(`No existe el elemento '${id}'`));
      nodes.push(node.clone());
    }
    session.clipboard = nodes;
    return right(undefined);
  }

  clipboardOf(sessionId: string): RdlcNode[] | undefined {
    return this.sessions.get(sessionId)?.clipboard;
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
        reason: 'internal',
      });
    }
    return session.version;
  }

  versionOf(sessionId: string): number {
    return this.sessions.get(sessionId)?.version ?? 0;
  }

  /**
   * Recalcula `dirty` contra los bytes de referencia: si deshacer/rehacer dejó
   * el documento exactamente como estaba en disco, la sesión vuelve a estar
   * limpia (no tiene sentido pedir «guardar» por cambios que ya no existen).
   */
  refreshDirty(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session || !session.dirty) return;
    try {
      const bytes = Buffer.from(this.serializer.serialize(session.document), 'utf8');
      if (!bytes.equals(session.originalBytes)) return;
    } catch {
      return;
    }
    session.dirty = false;
    this.events.send(IPC_EVENTS.dirtyChanged, { sessionId, dirty: false });
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

      // El fichero cambió en disco pero hay ediciones sin guardar: no se pisa el
      // trabajo del usuario (se perdería en silencio). Se avisa al front y la
      // decisión (recargar / sobrescribir) queda para el diálogo de conflicto.
      if (session.dirty) {
        this.events.send(IPC_EVENTS.conflictDetected, {
          sessionId,
          filePath: session.filePath,
        });
        return;
      }

      const doc = this.parser.parse(bytes.toString('utf8'));

      session.document = doc;
      session.index = DocumentIndex.build(doc.root);
      session.originalBytes = bytes;
      // El portapapeles guardaba nodos del documento anterior: se descarta.
      session.clipboard = undefined;
      session.version += 1;
      session.lastWriteMs = stat.mtimeMs;

      this.events.send(IPC_EVENTS.documentChanged, {
        sessionId,
        projection: this.project(session),
        reason: 'external',
      });
    } catch {
      // Fichero corrupto o ilegible: se deja la sesión como está y se avisa.
      this.events.send(IPC_EVENTS.conflictDetected, { sessionId, filePath: session.filePath });
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

  /* --------------------- guardado (compartido con «Guardar como») ---------- */

  /**
   * Serializa y **valida contra el XSD antes de escribir**: BC rompe con un XML
   * inválido, así que un guardado que lo rompería se rechaza en seco.
   */
  private serializeValidated(
    session: Session,
  ): Either<DomainError, { bytes: Buffer; bytesIdentical: boolean }> {
    const xml = this.serializer.serialize(session.document);
    const validation = this.schema.validate(xml);
    if (!validation.valid) {
      return left(ValidationFailedError.create(validation.problems));
    }
    const bytes = Buffer.from(xml, 'utf8');
    return right({ bytes, bytesIdentical: bytes.equals(session.originalBytes) });
  }

  /** Escribe los bytes y actualiza la referencia del disco (mtime/original). */
  private async writeTo(
    session: Session,
    filePath: string,
    bytes: Buffer,
  ): Promise<Either<DomainError, void>> {
    session.writing = true;
    try {
      await this.fileSystem.writeFile(filePath, bytes);
      const stat = await this.fileSystem.stat(filePath);
      session.lastWriteMs = stat.mtimeMs;
      session.originalBytes = bytes;
      return right(undefined);
    } catch (error) {
      return left(IoError.create('escribir', filePath, error));
    } finally {
      session.writing = false;
    }
  }

  /** Guardado consumado: marca limpio y emite los avisos al front. */
  private markSaved(session: Session, filePath: string): void {
    session.document.markClean();
    if (session.dirty) {
      session.dirty = false;
      this.events.send(IPC_EVENTS.dirtyChanged, { sessionId: session.sessionId, dirty: false });
    }
    this.events.send(IPC_EVENTS.saved, { sessionId: session.sessionId, path: filePath });
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

/** Namespace del esquema que el dominio sabe editar (RDL y RDLC lo comparten). */
const RDL_2016_NAMESPACE =
  'http://schemas.microsoft.com/sqlserver/reporting/2016/01/reportdefinition';

/**
 * Comprueba que el fichero es un informe RDL/RDLC **2016/01**. Un RDL anterior
 * usa `Report > Body` (sin `ReportSections`) y el dominio lo escribiría en
 * orden canónico 2016: mejor rechazarlo con un motivo claro que abrirlo vacío.
 */
function checkSupportedSchema(filePath: string, root: RdlcNode): DomainError | null {
  if (root.tagName !== 'Report') {
    return InvalidXmlError.create(filePath, `<${root.tagName}> no es un informe RDL/RDLC`);
  }
  const namespace = root.attribute('xmlns');
  if (namespace !== RDL_2016_NAMESPACE) {
    return UnsupportedRdlSchemaError.create(filePath, namespace);
  }
  return null;
}
