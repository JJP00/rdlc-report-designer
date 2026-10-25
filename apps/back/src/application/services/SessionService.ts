import { randomUUID } from 'node:crypto';
import { IPC_EVENTS } from '@rdlc-designer/contracts';
import type { ListedSession, ProjectionDto } from '@rdlc-designer/contracts';
import { Injectable, Inject } from '@nestjs/common';
import { copyCellContents } from '../../domain/document/commands/pasteCells.js';
import { DocumentIndex } from '../../domain/document/index/DocumentIndex.js';
import { BLANK_REPORT_XML } from '../../domain/document/templates/blankReport.js';
import type { EventBusPort } from '../ports/out/EventBusPort.js';
import { EVENT_BUS_PORT } from '../ports/out/EventBusPort.js';
import type { FileStat, FileSystemPort } from '../ports/out/FileSystemPort.js';
import { FILE_SYSTEM_PORT } from '../ports/out/FileSystemPort.js';
import type { FileWatcherPort, Unwatch } from '../ports/out/FileWatcherPort.js';
import { FILE_WATCHER_PORT } from '../ports/out/FileWatcherPort.js';
import type { RdlcProjectionPort } from '../ports/out/RdlcProjectionPort.js';
import { RDLC_PROJECTION_PORT } from '../ports/out/RdlcProjectionPort.js';
import type { RdlcParserPort } from '../ports/out/RdlcParserPort.js';
import { RDLC_PARSER_PORT } from '../ports/out/RdlcParserPort.js';
import type { RdlcSerializerPort } from '../ports/out/RdlcSerializerPort.js';
import { RDLC_SERIALIZER_PORT } from '../ports/out/RdlcSerializerPort.js';
import type {
  XmlSchemaValidatorPort,
  SchemaValidationResult,
} from '../ports/out/XmlSchemaValidatorPort.js';
import { XML_SCHEMA_VALIDATOR_PORT } from '../ports/out/XmlSchemaValidatorPort.js';
import type { RdlcDocument, RdlcNode } from '../../domain/document/tree/RdlcNode.js';
import { left, right, type Either } from '../../shared/either.js';
import type { DomainError } from '../../shared/domainError.js';
import {
  CommandRejectedError,
  FileConflictError,
  FileNotFoundError,
  InvalidXmlError,
  IoError,
  UnexpectedError,
  UnknownSessionError,
  UnsupportedRdlSchemaError,
  ValidationFailedError,
} from '../../shared/domainError.js';
import type {
  ClipboardContent,
  CloseSessionResult,
  EditTarget,
  ISessionService,
  OpenSessionResult,
  SaveSessionResult,
  SaveWarningReason,
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
  /** Tamaño del fichero en la última referencia (mtime solo no basta). */
  lastWriteSize: number;
  /** true mientras escribimos: el watcher ignora esos eventos. */
  writing: boolean;
  /** true si el fichero desapareció del disco (borrado/movido externo, BUG-55). */
  missing: boolean;
  /** Subárboles desprendidos copiados/cortados (portapapeles de la sesión). */
  clipboard?: ClipboardContent;
  unwatch?: Unwatch;
}

@Injectable()
export class SessionService implements ISessionService {
  private readonly sessions = new Map<string, Session>();
  /** Colas de operaciones por sesión (save/saveAs/reload serializados, BUG-54). */
  private readonly sessionLocks = new Map<string, Promise<unknown>>();

  constructor(
    @Inject(FILE_SYSTEM_PORT) private readonly fileSystem: FileSystemPort,
    @Inject(FILE_WATCHER_PORT) private readonly fileWatcher: FileWatcherPort,
    @Inject(RDLC_PARSER_PORT) private readonly parser: RdlcParserPort,
    @Inject(RDLC_SERIALIZER_PORT) private readonly serializer: RdlcSerializerPort,
    @Inject(RDLC_PROJECTION_PORT) private readonly projection: RdlcProjectionPort,
    @Inject(XML_SCHEMA_VALIDATOR_PORT) private readonly schema: XmlSchemaValidatorPort,
    @Inject(EVENT_BUS_PORT) private readonly events: EventBusPort,
  ) {}

  /** Sesiones vivas en orden de apertura (re-adopción del front, BUG-51). */
  listSessions(): ListedSession[] {
    return [...this.sessions.values()].map((session) => ({
      sessionId: session.sessionId,
      filePath: session.filePath,
      dirty: session.dirty,
      missing: session.missing,
      projection: this.project(session),
    }));
  }

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

    let diskStat: FileStat;
    try {
      diskStat = await this.fileSystem.stat(filePath);
    } catch (error) {
      return left(IoError.create('read', filePath, error));
    }

    // Validación de esquema al importar: avisa, no bloquea (el usuario puede
    // querer arreglar un fichero roto con la herramienta). Se valida antes de
    // registrar nada: un validador que lance no deja sesión ni watcher (BUG-23).
    let validation: SchemaValidationResult;
    try {
      validation = this.schema.validate(read.value.toString('utf8'));
    } catch (error) {
      return left(UnexpectedError.create(error));
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
      lastWriteMs: diskStat.mtimeMs,
      lastWriteSize: diskStat.size,
      writing: false,
      missing: false,
    };

    // El watcher se arranca **antes** de registrar la sesión: si falla
    // (permisos, límite de descriptores, ruta de red) no queda sesión huérfana
    // en el mapa (BUG-24).
    let unwatch: Unwatch;
    try {
      unwatch = await this.fileWatcher.watch(
        filePath,
        () => {
          void this.onExternalChange(sessionId);
        },
        () => {
          void this.onFileUnlinked(sessionId);
        },
      );
    } catch (error) {
      return left(IoError.create('watch', filePath, error));
    }
    session.unwatch = unwatch;
    this.sessions.set(sessionId, session);

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
      return left(IoError.create('write', filePath, error));
    }
    return this.open(filePath);
  }

  /** Serializado con las demás operaciones de fichero de la sesión (BUG-54). */
  async save(sessionId: string): Promise<Either<DomainError, SaveSessionResult>> {
    return this.enqueue(sessionId, () => this.saveLocked(sessionId));
  }

  private async saveLocked(sessionId: string): Promise<Either<DomainError, SaveSessionResult>> {
    const session = this.sessions.get(sessionId);
    if (!session) return left(UnknownSessionError.create(sessionId));

    // El watcher también detecta cambios externos, pero puede perder el evento
    // (debounce, unidad de red): Guardar comprueba el disco para no pisar una
    // edición externa en silencio (BUG-20).
    if (!(await this.referenceStillOnDisk(session))) {
      // La referencia avanza al estado externo actual (BUG-52): un «Guardar y
      // sobrescribir» posterior no vuelve a rechazarse por **este mismo**
      // cambio; otro cambio distinto sí se detectará (mtime/tamaño distintos o
      // bytes distintos de `originalBytes`, que solo avanza en `writeTo`).
      try {
        const diskStat = await this.fileSystem.stat(session.filePath);
        session.lastWriteMs = diskStat.mtimeMs;
        session.lastWriteSize = diskStat.size;
      } catch {
        // No se pudo leer el estado: el siguiente intento lo comprobará igual.
      }
      return left(FileConflictError.create(session.filePath));
    }

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

  /** Serializado con las demás operaciones de fichero de la sesión (BUG-54). */
  async saveAs(
    sessionId: string,
    filePath: string,
  ): Promise<Either<DomainError, SaveSessionResult>> {
    return this.enqueue(sessionId, () => this.saveAsLocked(sessionId, filePath));
  }

  private async saveAsLocked(
    sessionId: string,
    filePath: string,
  ): Promise<Either<DomainError, SaveSessionResult>> {
    const session = this.sessions.get(sessionId);
    if (!session) return left(UnknownSessionError.create(sessionId));

    const serialized = this.serializeValidated(session);
    if (serialized.isLeft()) return left(serialized.value);

    const written = await this.writeTo(session, filePath, serialized.value.bytes);
    if (written.isLeft()) return left(written.value);

    // El watcher nuevo se crea **antes** de soltar el viejo (BUG-56): si falla
    // (permisos, límite de descriptores…), el guardado ya está consumado y la
    // sesión sigue siendo consistente; solo se avisa de que no hay vigilancia.
    let unwatch: Unwatch | undefined;
    let warningReason: SaveWarningReason | undefined;
    try {
      unwatch = await this.fileWatcher.watch(
        filePath,
        () => {
          void this.onExternalChange(sessionId);
        },
        () => {
          void this.onFileUnlinked(sessionId);
        },
      );
    } catch {
      warningReason = 'watchUnsupported';
    }

    // La sesión pasa a apuntar al fichero nuevo; el watcher viejo (ruta
    // antigua) se suelta en cualquier caso.
    session.unwatch?.();
    session.unwatch = unwatch;
    session.filePath = filePath;

    this.markSaved(session, filePath);
    return right({
      path: filePath,
      bytesIdentical: serialized.value.bytesIdentical,
      ...(warningReason ? { warningReason } : {}),
    });
  }

  /** Serializado con las demás operaciones de fichero de la sesión (BUG-54). */
  async reload(sessionId: string): Promise<Either<DomainError, OpenSessionResult>> {
    return this.enqueue(sessionId, () => this.reloadLocked(sessionId));
  }

  private async reloadLocked(sessionId: string): Promise<Either<DomainError, OpenSessionResult>> {
    const session = this.sessions.get(sessionId);
    if (!session) return left(UnknownSessionError.create(sessionId));

    const read = await this.tryRead(session.filePath);
    if (read.isLeft()) return left(read.value);
    const parsed = this.tryParse(session.filePath, read.value);
    if (parsed.isLeft()) return left(parsed.value);

    // Recargar pasa por las mismas comprobaciones que abrir (BUG-27): un RDL de
    // otra versión no se carga en silencio y el siguiente guardado no lo
    // reescribiría en orden 2016.
    const schemaProblem = checkSupportedSchema(session.filePath, parsed.value.root);
    if (schemaProblem) return left(schemaProblem);

    let diskStat: FileStat;
    try {
      diskStat = await this.fileSystem.stat(session.filePath);
    } catch (error) {
      return left(IoError.create('read', session.filePath, error));
    }

    // Se valida antes de tocar la sesión: un validador que lance no la deja a
    // medias (la recarga sigue avisando, no bloquea).
    let validation: SchemaValidationResult;
    try {
      validation = this.schema.validate(read.value.toString('utf8'));
    } catch (error) {
      return left(UnexpectedError.create(error));
    }

    // Se descarta el documento local (el usuario eligió «Recargar»): journal,
    // portapapeles y dirty se van con él.
    session.document = parsed.value;
    session.index = DocumentIndex.build(parsed.value.root);
    session.originalBytes = read.value;
    session.version += 1;
    session.lastWriteMs = diskStat.mtimeMs;
    session.lastWriteSize = diskStat.size;
    session.clipboard = undefined;
    // La recarga leyó del disco: el fichero existe (si estaba «missing», vuelve).
    this.clearMissing(session);
    if (session.dirty) {
      session.dirty = false;
      this.events.send(IPC_EVENTS.dirtyChanged, { sessionId, dirty: false });
    }

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
      if (!node) return left(CommandRejectedError.of('itemMissing', { id }));
      nodes.push(node.clone());
    }
    session.clipboard = { kind: 'items', nodes };
    return right(undefined);
  }

  copyCellsToClipboard(
    sessionId: string,
    id: string,
    cells: readonly { row: number; col: number }[],
  ): Either<DomainError, number> {
    const session = this.sessions.get(sessionId);
    if (!session) return left(UnknownSessionError.create(sessionId));

    const copied = copyCellContents(
      { root: session.document.root, index: session.index },
      id,
      cells,
    );
    if (copied.isLeft()) return left(copied.value);
    // Todo vacío: no hay nada que copiar y el portapapeles anterior se conserva.
    if (copied.value.length === 0) return left(CommandRejectedError.of('cellsNothingToCopy'));

    session.clipboard = { kind: 'cells', entries: copied.value };
    return right(copied.value.length);
  }

  clipboardOf(sessionId: string): RdlcNode[] | undefined {
    const clipboard = this.sessions.get(sessionId)?.clipboard;
    return clipboard?.kind === 'items' ? clipboard.nodes : undefined;
  }

  clipboardContentOf(sessionId: string): ClipboardContent | undefined {
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

  /** Proyección vigente (el front deshace con ella un optimismo rechazado). */
  projectionOf(sessionId: string): Either<DomainError, ProjectionDto> {
    const session = this.sessions.get(sessionId);
    if (!session) return left(UnknownSessionError.create(sessionId));
    return right(this.project(session));
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

  /**
   * Serializa las operaciones que escriben o releen el fichero de una sesión
   * (save/saveAs/reload, BUG-54): un segundo Ctrl+S espera al primero y nunca
   * ve una referencia a medias (falso E_CONFLICT). La cola absorbe los errores
   * para no envenenar al siguiente eslabón y se retira al quedar vacía.
   * `open`/`createNew` no pasan por aquí: crean sesiones nuevas.
   */
  private enqueue<T>(sessionId: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.sessionLocks.get(sessionId) ?? Promise.resolve();
    const task = previous.then(operation, operation);
    const tail = task.then(
      () => undefined,
      () => undefined,
    );
    this.sessionLocks.set(sessionId, tail);
    void tail.then(() => {
      if (this.sessionLocks.get(sessionId) === tail) this.sessionLocks.delete(sessionId);
    });
    return task;
  }

  private async onExternalChange(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session || session.writing) return;

    try {
      const stat = await this.fileSystem.stat(session.filePath);
      // El fichero está en disco: si se había dado por perdido, ha vuelto
      // (BUG-55). Se emite solo en la transición.
      this.clearMissing(session);

      // Camino rápido: mtime y tamaño idénticos a la referencia (eco de
      // nuestra propia escritura o fichero intacto). Nada que hacer.
      if (stat.mtimeMs === session.lastWriteMs && stat.size === session.lastWriteSize) {
        return;
      }

      // El mtime no basta para distinguir el eco propio de un reemplazo
      // externo: Explorer/robocopy/`git restore` pueden conservar el mtime
      // anterior. Si el mtime **no avanza**, manda el contenido comparado con
      // la referencia (BUG-21); si avanza se conserva la semántica de siempre
      // (cualquier escritura externa recarga o avisa).
      const bytes = await this.fileSystem.readFile(session.filePath);
      if (stat.mtimeMs <= session.lastWriteMs && bytes.equals(session.originalBytes)) {
        // Mismo contenido: solo se actualiza la referencia del disco.
        session.lastWriteMs = stat.mtimeMs;
        session.lastWriteSize = stat.size;
        return;
      }

      // El fichero cambió en disco pero hay ediciones sin guardar: no se pisa el
      // trabajo del usuario (se perdería en silencio). Se avisa al front y la
      // decisión (recargar / sobrescribir) queda para el diálogo de conflicto.
      if (session.dirty) {
        // La referencia de disco pasa al estado externo: si el usuario decide
        // «sobrescribir», el guardado posterior no vuelve a rechazarse por este
        // mismo cambio (el aviso ya se dio); otro cambio distinto sí se detecta.
        session.lastWriteMs = stat.mtimeMs;
        session.lastWriteSize = stat.size;
        this.events.send(IPC_EVENTS.conflictDetected, {
          sessionId,
          filePath: session.filePath,
        });
        return;
      }

      // Sesión limpia: el cambio externo se recarga o, si no se puede, se avisa
      // suave (BUG-53). Sin ediciones locales no hay nada que proteger: hablar
      // de «conflicto» dejaría banner/diálogo pegados sobre un fichero bueno.
      let doc: RdlcDocument;
      try {
        doc = this.parser.parse(bytes.toString('utf8'));
      } catch {
        this.sendExternalReloadFailed(session, 'unreadable');
        return;
      }

      // El cambio externo pasa por la misma comprobación de esquema que open
      // (BUG-27): un RDL de otra versión no se carga en silencio.
      if (checkSupportedSchema(session.filePath, doc.root)) {
        this.sendExternalReloadFailed(session, 'unsupportedSchema');
        return;
      }

      session.document = doc;
      session.index = DocumentIndex.build(doc.root);
      session.originalBytes = bytes;
      // El portapapeles guardaba nodos del documento anterior: se descarta.
      session.clipboard = undefined;
      session.version += 1;
      session.lastWriteMs = stat.mtimeMs;
      session.lastWriteSize = stat.size;

      this.events.send(IPC_EVENTS.documentChanged, {
        sessionId,
        projection: this.project(session),
        reason: 'external',
      });
    } catch {
      // stat/read fallaron (fichero a medias, permisos): la sesión se deja como
      // está. Con ediciones locales se conserva el diálogo de conflicto; limpia,
      // basta el aviso suave (BUG-53).
      if (session.dirty) {
        this.events.send(IPC_EVENTS.conflictDetected, {
          sessionId,
          filePath: session.filePath,
        });
      } else {
        this.sendExternalReloadFailed(session, 'unreadable');
      }
    }
  }

  /**
   * El fichero de la sesión desapareció del disco (chokidar `unlink`, BUG-55).
   * Un `unlink` puede ser la mitad de un `rename` atómico (Explorer, robocopy):
   * si el fichero sigue ahí, no ha pasado nada. Las escrituras propias también
   * renombran encima, así que mientras `writing` el evento se ignora. Se emite
   * solo en la transición a «no está».
   */
  private async onFileUnlinked(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session || session.writing) return;

    try {
      await this.fileSystem.stat(session.filePath);
      // Sigue existiendo: era el lado de un reemplazo atómico.
      return;
    } catch {
      // Ya no está: se avisa (una sola vez por transición).
    }

    if (session.missing) return;
    session.missing = true;
    this.events.send(IPC_EVENTS.fileMissingChanged, {
      sessionId,
      filePath: session.filePath,
      missing: true,
    });
  }

  /** El fichero vuelve a estar en disco: se limpia `missing` solo en la transición. */
  private clearMissing(session: Session, filePath = session.filePath): void {
    if (!session.missing) return;
    session.missing = false;
    this.events.send(IPC_EVENTS.fileMissingChanged, {
      sessionId: session.sessionId,
      filePath,
      missing: false,
    });
  }

  /** Cambio externo no recargable en una sesión limpia: aviso suave, sin diálogo. */
  private sendExternalReloadFailed(
    session: Session,
    reason: 'unreadable' | 'unsupportedSchema',
  ): void {
    this.events.send(IPC_EVENTS.externalReloadFailed, {
      sessionId: session.sessionId,
      filePath: session.filePath,
      reason,
    });
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
    let validation: SchemaValidationResult;
    try {
      validation = this.schema.validate(xml);
    } catch (error) {
      // Sin validación no se escribe: un validador que lance se reporta como
      // E_VALIDATION (nunca deja escapar la excepción) (BUG-23).
      const problem = error instanceof Error ? error.message : String(error);
      return left(ValidationFailedError.create([problem]));
    }
    if (!validation.valid) {
      return left(ValidationFailedError.create(validation.problems));
    }
    const bytes = Buffer.from(xml, 'utf8');
    return right({ bytes, bytesIdentical: bytes.equals(session.originalBytes) });
  }

  /**
   * ¿Sigue el disco en el estado de referencia de la sesión? Compara
   * mtime/tamaño y, si difieren, el contenido: un mtime distinto con los mismos
   * bytes (un `touch`, una copia que preserva el contenido) no es conflicto.
   */
  private async referenceStillOnDisk(session: Session): Promise<boolean> {
    let stat: FileStat;
    try {
      stat = await this.fileSystem.stat(session.filePath);
    } catch {
      // No se pudo leer el estado (p. ej. borrado por fuera): se intenta la
      // escritura, que dará el error definitivo o recreará el fichero.
      return true;
    }
    if (stat.mtimeMs === session.lastWriteMs && stat.size === session.lastWriteSize) {
      return true;
    }
    try {
      const bytes = await this.fileSystem.readFile(session.filePath);
      if (bytes.equals(session.originalBytes)) {
        // Mismo contenido: solo ha cambiado el metadato de disco.
        session.lastWriteMs = stat.mtimeMs;
        session.lastWriteSize = stat.size;
        return true;
      }
    } catch {
      return true;
    }
    return false;
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
      session.lastWriteSize = stat.size;
      session.originalBytes = bytes;
      // El guardado (re)creó el fichero: si se había dado por perdido, vuelve
      // (BUG-55). En `saveAs` se pasó la ruta nueva.
      this.clearMissing(session, filePath);
      return right(undefined);
    } catch (error) {
      return left(IoError.create('write', filePath, error));
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
      return left(IoError.create('read', filePath, error));
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
