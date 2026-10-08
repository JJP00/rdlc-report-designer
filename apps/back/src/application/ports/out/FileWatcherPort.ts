export const FILE_WATCHER_PORT = Symbol('FileWatcherPort');

export type Unwatch = () => void;

/** Puerto de salida: observación de cambios externos del fichero (chokidar). */
export interface FileWatcherPort {
  /**
   * `onUnlink` (opcional) avisa de que el fichero desapareció del disco
   * (BUG-55): borrado o movimiento externo, no el rename interno de una
   * escritura propia (ese lo filtra `SessionService.writing`).
   */
  watch(path: string, onChange: () => void, onUnlink?: () => void): Promise<Unwatch>;
}
