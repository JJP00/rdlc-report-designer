import { IPC_EVENTS } from '@rdlc-designer/contracts';
import type { EventBusPort } from '../application/ports/out/EventBusPort.js';

/**
 * Adaptador de salida del servidor MCP: no hay ventana a la que avisar, así
 * que los eventos que el front mostraría como diálogo (conflicto, fichero
 * desaparecido, recarga externa) se convierten en **avisos** que el agente
 * recibe junto a la siguiente respuesta de esa sesión.
 */
export class HeadlessEventBus implements EventBusPort {
  private readonly notices = new Map<string, string[]>();

  send(channel: string, payload: unknown): void {
    const event = payload as { sessionId?: string } & Record<string, unknown>;
    const sessionId = event.sessionId;
    if (!sessionId) return;

    switch (channel) {
      case IPC_EVENTS.conflictDetected:
        this.push(
          sessionId,
          'The file changed on disk while this session had unsaved edits. rdlc_save will fail with E_CONFLICT: ' +
            'use rdlc_reload to discard your edits and re-read the disk, or rdlc_save_as to keep your version in another file.',
        );
        break;
      case IPC_EVENTS.documentChanged:
        // `internal` is the echo of our own commands/undo: not news.
        if (event['reason'] === 'external') {
          this.push(
            sessionId,
            'The file changed on disk and was reloaded (there were no local edits). Re-read the report: ids may have changed.',
          );
        }
        break;
      case IPC_EVENTS.fileMissingChanged:
        this.push(
          sessionId,
          event['missing'] === true
            ? 'The file no longer exists on disk (deleted or moved). rdlc_save will recreate it at the same path.'
            : 'The file exists on disk again.',
        );
        break;
      case IPC_EVENTS.externalReloadFailed:
        this.push(
          sessionId,
          `The file changed on disk but could not be reloaded (${String(event['reason'])}). The in-memory version is kept.`,
        );
        break;
      default:
        break;
    }
  }

  /** Pending notices for the session (cleared when read). */
  drain(sessionId: string): string[] {
    const pending = this.notices.get(sessionId) ?? [];
    this.notices.delete(sessionId);
    return pending;
  }

  forget(sessionId: string): void {
    this.notices.delete(sessionId);
  }

  private push(sessionId: string, message: string): void {
    const list = this.notices.get(sessionId) ?? [];
    // No duplicates: a noisy watcher must not bloat the response.
    if (!list.includes(message)) list.push(message);
    this.notices.set(sessionId, list);
  }
}
