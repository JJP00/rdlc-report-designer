import type { RdlcCommand, ScopeRef } from './commands.js';
import type {
  CloseResult,
  CommandResult,
  ConflictDetectedEvent,
  DirtyChangedEvent,
  DocumentChangedEvent,
  FontListResult,
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
  /** Fuentes instaladas en el sistema (barra de formato / expresiones). */
  listFonts(): Promise<FontListResult>;
  openFile(path: string): Promise<OpenFileResult>;
  save(sessionId: string): Promise<SaveResult>;
  /** `force` cierra aunque haya cambios sin guardar (tras confirmar). */
  close(sessionId: string, force?: boolean): Promise<CloseResult>;

  /** Ejecuta un comando de edición (el backend queda sincronizado al momento). */
  executeCommand(sessionId: string, command: RdlcCommand): Promise<CommandResult>;
  undo(sessionId: string): Promise<CommandResult>;
  redo(sessionId: string): Promise<CommandResult>;

  /**
   * Portapapeles de items (vive en el backend: guarda el subárbol XML exacto).
   * `cut` = copiar + `deleteItem` (un solo paso de undo).
   */
  copy(sessionId: string, id: string): Promise<CommandResult>;
  cut(sessionId: string, id: string): Promise<CommandResult>;
  /** Pega un clon con nombres nuevos en `scope[index]`; devuelve `id` nuevo. */
  paste(sessionId: string, scope: ScopeRef, index: number): Promise<CommandResult>;

  /** Cambio externo del fichero (watcher) o snapshot tras undo/redo. */
  onDocumentChanged(callback: (event: DocumentChangedEvent) => void): () => void;
  /** La pestaña tiene (o deja de tener) cambios sin guardar. */
  onDirtyChanged(callback: (event: DirtyChangedEvent) => void): () => void;
  /**
   * El fichero cambió en disco mientras había ediciones sin guardar: el backend
   * NO pisa el documento; el front avisa y el usuario decide.
   */
  onConflictDetected(callback: (event: ConflictDetectedEvent) => void): () => void;
}
