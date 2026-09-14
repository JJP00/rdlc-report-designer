import type {
  CloseResult,
  DocumentChangedEvent,
  OpenFileResult,
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
  openFile(path: string): Promise<OpenFileResult>;
  save(sessionId: string): Promise<SaveResult>;
  close(sessionId: string): Promise<CloseResult>;
  /** Solicitud de cambio externo del fichero (watcher) → nueva snapshot. */
  onDocumentChanged(callback: (event: DocumentChangedEvent) => void): () => void;
}
