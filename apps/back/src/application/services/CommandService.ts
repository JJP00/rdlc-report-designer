import { Injectable, Inject } from '@nestjs/common';
import type { CommandResult, RdlcCommand } from '@rdlc-designer/contracts';
import { applyCommand } from '../../domain/document/commands/applyCommand.js';
import { inverseCommands } from '../../domain/document/commands/CommandContext.js';
import type { DomainCommand } from '../../domain/document/commands/CommandContext.js';
import { left, right, type Either } from '../../shared/either.js';
import type { DomainError } from '../../shared/domainError.js';
import { UnknownSessionError } from '../../shared/domainError.js';
import type { ICommandService } from './ICommandService.js';
import type { ISessionService } from './ISessionService.js';
import { SESSION_SERVICE } from './ISessionService.js';

interface JournalEntry {
  command: RdlcCommand;
  /** Inversos en orden de aplicación; el undo los aplica al revés. */
  inverse: DomainCommand[];
}

/** Comandos que cambian la estructura/límites: obligan a reconstruir el índice. */
const STRUCTURAL_COMMANDS = new Set<RdlcCommand['cmd']>([
  'setPageSize',
  'setPageMargins',
  'setReportCode',
  'insertItem',
  'duplicateItem',
  'deleteItem',
]);

interface SessionJournal {
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
    const target = this.sessions.getEditTarget(sessionId);
    if (target.isLeft()) return left(target.value);

    const applied = applyCommand(
      { root: target.value.document.root, index: target.value.index },
      command,
    );
    if (applied.isLeft()) return left(applied.value);

    const journal = this.journal(sessionId);
    journal.undoStack.push({ command, inverse: inverseCommands(applied.value) });
    journal.redoStack.length = 0;

    if (STRUCTURAL_COMMANDS.has(command.cmd)) this.sessions.rebuildIndex(sessionId);

    // Los comandos estructurales (página, código) reenvían la proyección:
    // el front refresca límites y funciones de <Code> sin esperar al reload.
    const version = this.sessions.touch(sessionId, {
      snapshotOut: STRUCTURAL_COMMANDS.has(command.cmd),
    });
    const result: CommandResult = applied.value.applied
      ? { ok: true, version, applied: applied.value.applied }
      : { ok: true, version };
    return right(result);
  }

  undo(sessionId: string): Either<DomainError, CommandResult> {
    const journal = this.journals.get(sessionId);
    if (!journal) return left(UnknownSessionError.create(sessionId));

    const entry = journal.undoStack.pop();
    if (!entry) return right({ ok: true, version: this.sessions.versionOf(sessionId) });

    const target = this.sessions.getEditTarget(sessionId);
    if (target.isLeft()) return left(target.value);

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
    if (STRUCTURAL_COMMANDS.has(entry.command.cmd)) this.sessions.rebuildIndex(sessionId);
    const version = this.sessions.touch(sessionId, { snapshotOut: true });
    return right({ ok: true, version });
  }

  redo(sessionId: string): Either<DomainError, CommandResult> {
    const journal = this.journals.get(sessionId);
    if (!journal) return left(UnknownSessionError.create(sessionId));

    const entry = journal.redoStack.pop();
    if (!entry) return right({ ok: true, version: this.sessions.versionOf(sessionId) });

    const target = this.sessions.getEditTarget(sessionId);
    if (target.isLeft()) return left(target.value);

    const applied = applyCommand(
      { root: target.value.document.root, index: target.value.index },
      entry.command,
    );
    if (applied.isLeft()) {
      journal.redoStack.push(entry);
      return left(applied.value);
    }

    journal.undoStack.push({ command: entry.command, inverse: inverseCommands(applied.value) });
    if (STRUCTURAL_COMMANDS.has(entry.command.cmd)) this.sessions.rebuildIndex(sessionId);
    const version = this.sessions.touch(sessionId, { snapshotOut: true });
    return right({ ok: true, version });
  }

  /** El journal se descarta al cerrar la sesión (la pila no sobrevive). */
  drop(sessionId: string): void {
    this.journals.delete(sessionId);
  }

  private journal(sessionId: string): SessionJournal {
    let journal = this.journals.get(sessionId);
    if (!journal) {
      journal = { undoStack: [], redoStack: [] };
      this.journals.set(sessionId, journal);
    }
    return journal;
  }
}
