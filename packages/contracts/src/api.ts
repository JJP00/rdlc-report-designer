import type { RdlcCommand } from './commands.js';
import type {
  CloseResult,
  CommandResult,
  DirtyChangedEvent,
  DocumentChangedEvent,
  OpenFileResult,
  PendingOpenResult,
  PickFileResult,
  SaveResult,
} from './ipc.js';

/**
 * API que el preload expone al renderer como `window.api`.
 * Los componentes NUNCA llaman a `ipcRenderer`: todo pasa por esta interfaz.
 */
export interface RdlcApi {
  /** Abre el diálogo nativo de ficheros; `path: null` si se cancela. */
  pickFile(): Promise<PickFileResult>;
  /** Fichero con el que se arrancó la app (arg. de línea de comandos), si lo hay. */
  consumePendingOpen(): Promise<PendingOpenResult>;
  openFile(path: string): Promise<OpenFileResult>;
  save(sessionId: string): Promise<SaveResult>;
  close(sessionId: string): Promise<CloseResult>;

  /** Ejecuta un comando de edición (el backend queda sincronizado al momento). */
  executeCommand(sessionId: string, command: RdlcCommand): Promise<CommandResult>;
  undo(sessionId: string): Promise<CommandResult>;
  redo(sessionId: string): Promise<CommandResult>;

  /** Cambio externo del fichero (watcher) o snapshot tras undo/redo. */
  onDocumentChanged(callback: (event: DocumentChangedEvent) => void): () => void;
  /** La pestaña tiene (o deja de tener) cambios sin guardar. */
  onDirtyChanged(callback: (event: DirtyChangedEvent) => void): () => void;
}
