import type { RdlcCommand, ScopeRef } from './commands.js';
import type {
  CloseResult,
  CommandResult,
  ConflictDetectedEvent,
  DirtyChangedEvent,
  DocumentChangedEvent,
  ExternalReloadFailedEvent,
  FileMissingChangedEvent,
  FontListResult,
  ListedSessionsResult,
  OpenFileResult,
  PendingOpenResult,
  PickFileResult,
  PickSavePathResult,
  ReadProjectionResult,
  RecentFilesResult,
  SaveResult,
  SavedEvent,
  SessionClosedEvent,
} from './ipc.js';

/**
 * API que el preload expone al renderer como `window.api`.
 * Los componentes NUNCA llaman a `ipcRenderer`: todo pasa por esta interfaz.
 */
export interface RdlcApi {
  /** Abre el diálogo nativo de ficheros; `path: null` si se cancela. */
  pickFile(): Promise<PickFileResult>;
  /** Abre el diálogo nativo de guardado; `path: null` si se cancela. */
  pickSavePath(defaultPath?: string): Promise<PickSavePathResult>;
  /** Fichero con el que se arrancó la app (arg. de línea de comandos), si lo hay. */
  consumePendingOpen(): Promise<PendingOpenResult>;
  /** Fuentes instaladas en el sistema (barra de formato / expresiones). */
  listFonts(): Promise<FontListResult>;
  openFile(path: string): Promise<OpenFileResult>;
  /** Crea un informe nuevo en blanco en `path` y lo abre. */
  createNew(path: string): Promise<OpenFileResult>;
  save(sessionId: string): Promise<SaveResult>;
  /** Guarda copiando a `path` (la sesión pasa a apuntar ahí). */
  saveAs(sessionId: string, path: string): Promise<SaveResult>;
  /** Recarga desde disco descartando los cambios locales (conflicto resuelto). */
  reloadFile(sessionId: string): Promise<OpenFileResult>;
  /**
   * Proyección vigente del backend (sin tocar el documento): el front la usa
   * para deshacer el optimismo de un comando rechazado.
   */
  readProjection(sessionId: string): Promise<ReadProjectionResult>;
  /** Ficheros abiertos recientemente, más nuevos primero. */
  recentFiles(): Promise<RecentFilesResult>;
  /** `force` cierra aunque haya cambios sin guardar (tras confirmar). */
  close(sessionId: string, force?: boolean): Promise<CloseResult>;
  /** Responde al cierre de ventana pedido por el SO (tras decidir el usuario). */
  confirmWindowClose(proceed: boolean): Promise<void>;
  /**
   * El renderer está vivo y atendiendo la petición de cierre: cancela el
   * vigilante del main (si no responde a tiempo, avisará para cerrar sin
   * guardar). Se llama al recibir `onCloseRequested`, antes de decidir (P0.1).
   */
  acknowledgeCloseRequest(): Promise<void>;
  /** Sesiones vivas del backend (re-adopción tras recargar la interfaz, P0.1). */
  listSessions(): Promise<ListedSessionsResult>;

  /** Ejecuta un comando de edición (el backend queda sincronizado al momento). */
  executeCommand(sessionId: string, command: RdlcCommand): Promise<CommandResult>;
  undo(sessionId: string): Promise<CommandResult>;
  redo(sessionId: string): Promise<CommandResult>;

  /**
   * Portapapeles de items (vive en el backend: guarda los subárboles XML
   * exactos). `cut` = copiar + `deleteItem` en lote (un solo paso de undo).
   * Acepta varios ids (multiselección).
   */
  copy(sessionId: string, ids: string[]): Promise<CommandResult>;
  cut(sessionId: string, ids: string[]): Promise<CommandResult>;
  /** Pega clones con nombres nuevos en `scope[index]`; devuelve `ids` nuevos. */
  paste(sessionId: string, scope: ScopeRef, index: number): Promise<CommandResult>;

  /** Ruta real de un fichero soltado sobre la ventana (drag&drop de `.rdlc`). */
  pathForFile(file: File): string;

  /** Cambio externo del fichero (watcher) o snapshot tras undo/redo. */
  onDocumentChanged(callback: (event: DocumentChangedEvent) => void): () => void;
  /** La pestaña tiene (o deja de tener) cambios sin guardar. */
  onDirtyChanged(callback: (event: DirtyChangedEvent) => void): () => void;
  /**
   * El fichero cambió en disco mientras había ediciones sin guardar: el backend
   * NO pisa el documento; el front avisa y el usuario decide.
   */
  onConflictDetected(callback: (event: ConflictDetectedEvent) => void): () => void;
  /** El SO quiere cerrar la ventana: el front decide y responde. */
  onCloseRequested(callback: () => void): () => void;
  /** El fichero de la sesión desapareció (`missing: true`) o volvió (BUG-55). */
  onFileMissingChanged(callback: (event: FileMissingChangedEvent) => void): () => void;
  /**
   * Un cambio externo no se pudo recargar (fichero a medias u otra versión del
   * esquema) y la sesión no tenía cambios: aviso suave, sin diálogo (BUG-53).
   */
  onExternalReloadFailed(callback: (event: ExternalReloadFailedEvent) => void): () => void;
  /** La sesión se cerró en el backend: el workspace retira su pestaña (fase A). */
  onSessionClosed(callback: (event: SessionClosedEvent) => void): () => void;
  /** Guardado consumado en el backend (robustez del estado por pestaña, fase A). */
  onSaved(callback: (event: SavedEvent) => void): () => void;
}
