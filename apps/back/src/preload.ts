import { contextBridge, ipcRenderer } from 'electron';
import {
  IPC_CHANNELS,
  IPC_EVENTS,
  type CloseResult,
  type CommandResult,
  type ConflictDetectedEvent,
  type DirtyChangedEvent,
  type DocumentChangedEvent,
  type FontListResult,
  type OpenFileResult,
  type PendingOpenResult,
  type PickFileResult,
  type RdlcApi,
  type RdlcCommand,
  type SaveResult,
  type ScopeRef,
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

  consumePendingOpen: (): Promise<PendingOpenResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.pendingOpen),

  listFonts: (): Promise<FontListResult> => ipcRenderer.invoke(IPC_CHANNELS.listFonts),

  openFile: (path: string): Promise<OpenFileResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.openFile, { path }),

  save: (sessionId: string): Promise<SaveResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.save, { sessionId }),

  close: (sessionId: string, force?: boolean): Promise<CloseResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.close, { sessionId, ...(force ? { force } : {}) }),

  executeCommand: (sessionId: string, command: RdlcCommand): Promise<CommandResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.executeCommand, { sessionId, command }),

  undo: (sessionId: string): Promise<CommandResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.undo, { sessionId }),

  redo: (sessionId: string): Promise<CommandResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.redo, { sessionId }),

  copy: (sessionId: string, id: string): Promise<CommandResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.copy, { sessionId, id }),

  cut: (sessionId: string, id: string): Promise<CommandResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.cut, { sessionId, id }),

  paste: (sessionId: string, scope: ScopeRef, index: number): Promise<CommandResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.paste, { sessionId, scope, index }),

  onDocumentChanged: (callback: (event: DocumentChangedEvent) => void): (() => void) =>
    subscribe(IPC_EVENTS.documentChanged, callback),

  onDirtyChanged: (callback: (event: DirtyChangedEvent) => void): (() => void) =>
    subscribe(IPC_EVENTS.dirtyChanged, callback),

  onConflictDetected: (callback: (event: ConflictDetectedEvent) => void): (() => void) =>
    subscribe(IPC_EVENTS.conflictDetected, callback),
};

contextBridge.exposeInMainWorld('api', api);
