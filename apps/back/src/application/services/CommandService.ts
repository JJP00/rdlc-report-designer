import { Injectable, Inject } from '@nestjs/common';
import type { CommandResult, RdlcCommand, ScopeRef } from '@rdlc-designer/contracts';
import { applyCommand } from '../../domain/document/commands/applyCommand.js';
import { inverseCommands } from '../../domain/document/commands/CommandContext.js';
import type {
  CommandOutcome,
  DomainCommand,
} from '../../domain/document/commands/CommandContext.js';
import type { RdlcDocument } from '../../domain/document/tree/RdlcNode.js';
import { left, right, type Either } from '../../shared/either.js';
import type { DomainError } from '../../shared/domainError.js';
import { CommandRejectedError } from '../../shared/domainError.js';
import type { ICommandService } from './ICommandService.js';
import type { ISessionService } from './ISessionService.js';
import { SESSION_SERVICE } from './ISessionService.js';

interface JournalEntry {
  command: DomainCommand;
  /** Inversos en orden de aplicación; el undo los aplica al revés. */
  inverse: DomainCommand[];
}

/** Comandos que cambian la estructura/límites: obligan a reconstruir el índice. */
const STRUCTURAL_COMMANDS = new Set<string>([
  'setPageSize',
  'setPageMargins',
  // El alto de banda entra en los límites del índice (clamp de inserción).
  'setRegionHeight',
  'setReportCode',
  'insertItem',
  'duplicateItem',
  'deleteItem',
  // Reparentar/reordenar cambia quién cuelga de quién.
  'moveItem',
  // Renombrar: el índice por nombre (y las referencias del front) cambian.
  'setName',
  'setGroupName',
  // Interno del pegado: inserta subárbol (mismos efectos que insertItem).
  'insertClone',
  // Fusionar descarta celdas con contenido; separar crea celdas con textbox.
  'mergeCells',
  'unmergeCells',
]);

function isStructural(command: { cmd: string }): boolean {
  return STRUCTURAL_COMMANDS.has(command.cmd);
}

interface SessionJournal {
  /**
   * Documento al que pertenecen los inversos. Si la sesión recarga el fichero
   * (cambio externo), los nodos del journal quedan desprendidos: se detecta por
   * identidad y el journal se descarta.
   */
  document: RdlcDocument;
  undoStack: JournalEntry[];
  redoStack: JournalEntry[];
}

/**
 * Journal de comandos por sesión. `execute` aplica el comando al DOM del
 * documento (en memoria) y apila `{ command, inverse }`; `undo` aplica la
 * inversa; `redo` vuelve a aplicar el comando (recuperando su nueva inversa).
 */
@Injectable()
export class CommandService implements ICommandService {
  private readonly journals = new Map<string, SessionJournal>();

  constructor(@Inject(SESSION_SERVICE) private readonly sessions: ISessionService) {}

  execute(sessionId: string, command: RdlcCommand): Either<DomainError, CommandResult> {
    const applied = this.applyAndJournal(sessionId, command);
    if (applied.isLeft()) return left(applied.value);

    const { outcome, version } = applied.value;
    return right({
      ok: true,
      version,
      // `insertItem`/`duplicateItem` devuelven el nombre del item nuevo: el
      // front lo selecciona sin tener que adivinarlo.
      ...(outcome.createdId ? { id: outcome.createdId } : {}),
      ...(outcome.applied ? { applied: outcome.applied } : {}),
    });
  }

  /**
   * Copiar no toca el documento: no entra en el journal (no hay nada que
   * deshacer, y marcar dirty por copiar sería mentira).
   */
  copy(sessionId: string, id: string): Either<DomainError, CommandResult> {
    const copied = this.sessions.copyToClipboard(sessionId, id);
    if (copied.isLeft()) return left(copied.value);
    return right({ ok: true, version: this.sessions.versionOf(sessionId) });
  }

  /**
   * Cortar = copiar al portapapeles + eliminar. El borrado es un comando normal,
   * así que un solo Ctrl+Z devuelve el item a su sitio.
   */
  cut(sessionId: string, id: string): Either<DomainError, CommandResult> {
    const copied = this.sessions.copyToClipboard(sessionId, id);
    if (copied.isLeft()) return left(copied.value);
    return this.execute(sessionId, { cmd: 'deleteItem', id });
  }

  /**
   * Pegar: inserta un clon del portapapeles (con nombres nuevos) en
   * `scope[index]`. El clon se crea en cada pegado, así que se puede pegar
   * varias veces y deshacer cada paso.
   */
  paste(sessionId: string, scope: ScopeRef, index: number): Either<DomainError, CommandResult> {
    const source = this.sessions.clipboardOf(sessionId);
    if (!source) return left(CommandRejectedError.create('El portapapeles está vacío'));

    const applied = this.applyAndJournal(sessionId, { cmd: 'insertClone', scope, index, source });
    if (applied.isLeft()) return left(applied.value);

    const { outcome, version } = applied.value;
    return right({
      ok: true,
      version,
      ...(outcome.createdId ? { id: outcome.createdId } : {}),
      ...(outcome.applied ? { applied: outcome.applied } : {}),
    });
  }

  undo(sessionId: string): Either<DomainError, CommandResult> {
    const target = this.sessions.getEditTarget(sessionId);
    if (target.isLeft()) return left(target.value);

    const journal = this.journal(sessionId, target.value.document);
    const entry = journal.undoStack.pop();
    if (!entry) return right({ ok: true, version: this.sessions.versionOf(sessionId) });

    const ctx = { root: target.value.document.root, index: target.value.index };
    for (const inverse of [...entry.inverse].reverse()) {
      const applied = applyCommand(ctx, inverse);
      if (applied.isLeft()) {
        // No debería ocurrir (los inversos son siempre aplicables); si pasa,
        // se devuelve el estado del journal a su sitio para no perder el paso.
        journal.undoStack.push(entry);
        return left(applied.value);
      }
    }

    journal.redoStack.push({ command: entry.command, inverse: [...entry.inverse] });
    if (isStructural(entry.command)) this.sessions.rebuildIndex(sessionId);
    const version = this.sessions.touch(sessionId, { snapshotOut: true });
    // Deshacer puede devolver el documento a su estado en disco: recalcula dirty.
    this.sessions.refreshDirty(sessionId);
    return right({ ok: true, version });
  }

  redo(sessionId: string): Either<DomainError, CommandResult> {
    const target = this.sessions.getEditTarget(sessionId);
    if (target.isLeft()) return left(target.value);

    const journal = this.journal(sessionId, target.value.document);
    const entry = journal.redoStack.pop();
    if (!entry) return right({ ok: true, version: this.sessions.versionOf(sessionId) });

    const applied = applyCommand(
      { root: target.value.document.root, index: target.value.index },
      entry.command,
    );
    if (applied.isLeft()) {
      journal.redoStack.push(entry);
      return left(applied.value);
    }

    journal.undoStack.push({ command: entry.command, inverse: inverseCommands(applied.value) });
    if (isStructural(entry.command)) this.sessions.rebuildIndex(sessionId);
    const version = this.sessions.touch(sessionId, { snapshotOut: true });
    // Rehacer también puede devolver el documento a su estado en disco.
    this.sessions.refreshDirty(sessionId);
    return right({ ok: true, version });
  }

  /** El journal se descarta al cerrar la sesión (la pila no sobrevive). */
  drop(sessionId: string): void {
    this.journals.delete(sessionId);
  }

  /** Aplica un comando al documento, lo apunta en el journal y toca la sesión. */
  private applyAndJournal(
    sessionId: string,
    command: DomainCommand,
  ): Either<DomainError, { outcome: CommandOutcome; version: number }> {
    const target = this.sessions.getEditTarget(sessionId);
    if (target.isLeft()) return left(target.value);

    const applied = applyCommand(
      { root: target.value.document.root, index: target.value.index },
      command,
    );
    if (applied.isLeft()) return left(applied.value);

    const journal = this.journal(sessionId, target.value.document);
    journal.undoStack.push({ command, inverse: inverseCommands(applied.value) });
    journal.redoStack.length = 0;

    if (isStructural(command)) this.sessions.rebuildIndex(sessionId);

    // Los comandos estructurales (página, código, pegar) reenvían la proyección:
    // el front refresca límites y funciones de <Code> sin esperar al reload.
    // Algunos comandos (p. ej. `setStyle`) lo piden cuando tocan partes que
    // `applied` no puede expresar.
    const version = this.sessions.touch(sessionId, {
      snapshotOut: isStructural(command) || applied.value.snapshotOut === true,
    });

    return right({ outcome: applied.value, version });
  }

  /**
   * Journal de la sesión, atado al documento vivo: si el documento cambió
   * (recarga por edición externa) los inversos apuntan a nodos desprendidos, así
   * que se empieza de cero en vez de "deshacer" sobre un árbol fantasma.
   */
  private journal(sessionId: string, document: RdlcDocument): SessionJournal {
    let journal = this.journals.get(sessionId);
    if (!journal || journal.document !== document) {
      journal = { document, undoStack: [], redoStack: [] };
      this.journals.set(sessionId, journal);
    }
    return journal;
  }
}
