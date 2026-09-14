import { contextBridge, ipcRenderer } from 'electron';
import {
  IPC_CHANNELS,
  IPC_EVENTS,
  type CloseResult,
  type DocumentChangedEvent,
  type OpenFileResult,
  type PickFileResult,
  type RdlcApi,
  type SaveResult,
} from '@rdlc-designer/contracts';

/**
 * Puente tipado: el renderer solo ve `window.api` (nada de `ipcRenderer` ni
 * Node). Los tipos del contrato son la única superficie compartida.
 */
const api: RdlcApi = {
  pickFile: (): Promise<PickFileResult> => ipcRenderer.invoke(IPC_CHANNELS.pickFile),

  openFile: (path: string): Promise<OpenFileResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.openFile, { path }),

  save: (sessionId: string): Promise<SaveResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.save, { sessionId }),

  close: (sessionId: string): Promise<CloseResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.close, { sessionId }),

  onDocumentChanged: (callback: (event: DocumentChangedEvent) => void): (() => void) => {
    const listener = (_event: unknown, payload: DocumentChangedEvent): void => callback(payload);
    ipcRenderer.on(IPC_EVENTS.documentChanged, listener);
    return () => {
      ipcRenderer.off(IPC_EVENTS.documentChanged, listener);
    };
  },
};

contextBridge.exposeInMainWorld('api', api);
