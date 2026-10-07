export const FILE_WATCHER_PORT = Symbol('FileWatcherPort');

export type Unwatch = () => void;

/** Puerto de salida: observación de cambios externos del fichero (chokidar). */
export interface FileWatcherPort {
  watch(path: string, onChange: () => void): Promise<Unwatch>;
}
