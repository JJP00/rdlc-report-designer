import { contextBridge, ipcRenderer, webUtils } from 'electron';
import {
  IPC_CHANNELS,
  IPC_EVENTS,
  type AppLocale,
  type CloseResult,
  type CommandResult,
  type ConflictDetectedEvent,
  type DirtyChangedEvent,
  type DocumentChangedEvent,
  type ExternalReloadFailedEvent,
  type FileMissingChangedEvent,
  type FontListResult,
  type ListedSessionsResult,
  type LocaleResult,
  type OpenFileResult,
  type OpenRequestedEvent,
  type PendingOpenResult,
  type PickFileResult,
  type PickSavePathResult,
  type RdlcApi,
  type RdlcCommand,
  type ReadProjectionResult,
  type RecentFilesResult,
  type SaveResult,
  type SavedEvent,
  type ScopeRef,
  type SessionClosedEvent,
  type UpdateState,
  type UpdateStateResult,
} from '@rdlc-designer/contracts';

/**
 * Puente tipado: el renderer solo ve `window.api` (nada de `ipcRenderer` ni
 * Node). Los tipos del contrato son la única superficie compartida.
 */
function subscribe<T>(channel: string, callback: (payload: T) => void): () => void {
  const listener = (_event: unknown, payload: T): void => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => {
    ipcRenderer.off(channel, listener);
  };
}

const api: RdlcApi = {
  pickFile: (): Promise<PickFileResult> => ipcRenderer.invoke(IPC_CHANNELS.pickFile),

  pickSavePath: (defaultPath?: string): Promise<PickSavePathResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.pickSavePath, defaultPath ? { defaultPath } : {}),

  consumePendingOpen: (): Promise<PendingOpenResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.pendingOpen),

  listFonts: (): Promise<FontListResult> => ipcRenderer.invoke(IPC_CHANNELS.listFonts),

  openFile: (path: string): Promise<OpenFileResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.openFile, { path }),

  createNew: (path: string): Promise<OpenFileResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.createNew, { path }),

  save: (sessionId: string): Promise<SaveResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.save, { sessionId }),

  saveAs: (sessionId: string, path: string): Promise<SaveResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.saveAs, { sessionId, path }),

  reloadFile: (sessionId: string): Promise<OpenFileResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.reloadFile, { sessionId }),

  readProjection: (sessionId: string): Promise<ReadProjectionResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.readProjection, { sessionId }),

  recentFiles: (): Promise<RecentFilesResult> => ipcRenderer.invoke(IPC_CHANNELS.recentFiles),

  close: (sessionId: string, force?: boolean): Promise<CloseResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.close, { sessionId, ...(force ? { force } : {}) }),

  confirmWindowClose: (proceed: boolean): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.confirmWindowClose, { proceed }),

  acknowledgeCloseRequest: (): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.acknowledgeCloseRequest),

  listSessions: (): Promise<ListedSessionsResult> => ipcRenderer.invoke(IPC_CHANNELS.listSessions),

  getLocale: (): Promise<LocaleResult> => ipcRenderer.invoke(IPC_CHANNELS.getLocale),

  setLocale: (locale: AppLocale): Promise<LocaleResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.setLocale, { locale }),

  getUpdateState: (): Promise<UpdateStateResult> => ipcRenderer.invoke(IPC_CHANNELS.getUpdateState),

  checkForUpdates: (): Promise<UpdateStateResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.checkForUpdates),

  downloadUpdate: (): Promise<UpdateStateResult> => ipcRenderer.invoke(IPC_CHANNELS.downloadUpdate),

  installUpdate: (): Promise<UpdateStateResult> => ipcRenderer.invoke(IPC_CHANNELS.installUpdate),

  skipUpdateVersion: (): Promise<UpdateStateResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.skipUpdateVersion),

  openReleasePage: (): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.openReleasePage),

  executeCommand: (sessionId: string, command: RdlcCommand): Promise<CommandResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.executeCommand, { sessionId, command }),

  undo: (sessionId: string): Promise<CommandResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.undo, { sessionId }),

  redo: (sessionId: string): Promise<CommandResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.redo, { sessionId }),

  copy: (sessionId: string, ids: string[]): Promise<CommandResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.copy, { sessionId, ids }),

  cut: (sessionId: string, ids: string[]): Promise<CommandResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.cut, { sessionId, ids }),

  paste: (sessionId: string, scope: ScopeRef, index: number): Promise<CommandResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.paste, { sessionId, scope, index }),

  copyCells: (
    sessionId: string,
    id: string,
    cells: { row: number; col: number }[],
  ): Promise<CommandResult> => ipcRenderer.invoke(IPC_CHANNELS.copyCells, { sessionId, id, cells }),

  pasteCells: (sessionId: string, id: string, row: number, col: number): Promise<CommandResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.pasteCells, { sessionId, id, row, col }),

  pathForFile: (file: File): string => {
    const path = webUtils.getPathForFile(file);
    // Un fichero soltado es una elección del usuario como la del diálogo: main
    // autoriza la ruta para que `openFile` la acepte (BUG-50). Solo un `File`
    // real tiene ruta (uno sintético devuelve ''), y este canal no está en
    // `window.api`: el renderer no puede registrarse rutas a sí mismo.
    if (path) {
      void ipcRenderer.invoke(IPC_CHANNELS.registerDroppedFile, { path }).catch(() => undefined);
    }
    return path;
  },

  onDocumentChanged: (callback: (event: DocumentChangedEvent) => void): (() => void) =>
    subscribe(IPC_EVENTS.documentChanged, callback),

  onDirtyChanged: (callback: (event: DirtyChangedEvent) => void): (() => void) =>
    subscribe(IPC_EVENTS.dirtyChanged, callback),

  onConflictDetected: (callback: (event: ConflictDetectedEvent) => void): (() => void) =>
    subscribe(IPC_EVENTS.conflictDetected, callback),

  onCloseRequested: (callback: () => void): (() => void) =>
    subscribe(IPC_EVENTS.closeRequested, callback),

  onFileMissingChanged: (callback: (event: FileMissingChangedEvent) => void): (() => void) =>
    subscribe(IPC_EVENTS.fileMissingChanged, callback),

  onExternalReloadFailed: (callback: (event: ExternalReloadFailedEvent) => void): (() => void) =>
    subscribe(IPC_EVENTS.externalReloadFailed, callback),

  onSessionClosed: (callback: (event: SessionClosedEvent) => void): (() => void) =>
    subscribe(IPC_EVENTS.sessionClosed, callback),

  onSaved: (callback: (event: SavedEvent) => void): (() => void) =>
    subscribe(IPC_EVENTS.saved, callback),

  onOpenRequested: (callback: (event: OpenRequestedEvent) => void): (() => void) =>
    subscribe(IPC_EVENTS.openRequested, callback),

  onUpdateStateChanged: (callback: (state: UpdateState) => void): (() => void) =>
    subscribe(IPC_EVENTS.updateStateChanged, callback),
};

contextBridge.exposeInMainWorld('api', api);
