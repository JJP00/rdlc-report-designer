import { watch, type FSWatcher } from 'chokidar';
import type { FileWatcherPort, Unwatch } from '../../application/ports/out/FileWatcherPort.js';

/**
 * Adaptador chokidar. `ignoreInitial` para no disparar al abrir; el filtrado
 * de la propia escritura (mtime/flag) vive en SessionService.
 */
export class ChokidarWatcherAdapter implements FileWatcherPort {
  private readonly watchers = new Map<string, FSWatcher>();

  async watch(path: string, onChange: () => void, onUnlink?: () => void): Promise<Unwatch> {
    const watcher = watch(path, {
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 80, pollInterval: 20 },
    });
    watcher.on('change', onChange);
    watcher.on('add', onChange);
    // Borrado/movimiento externo (BUG-55): el fichero ya no está en la ruta.
    if (onUnlink) watcher.on('unlink', onUnlink);
    // Sin listener, un error de chokidar (permisos, path inexistente) emite
    // 'error' sin capturar y tumba el proceso (BUG-29): se registra y el
    // watcher sigue vivo para el resto de sesiones.
    watcher.on('error', (error) => {
      console.error(`[watcher] error vigilando ${path}:`, error);
    });
    this.watchers.set(path, watcher);
    return () => {
      void watcher.close();
      this.watchers.delete(path);
    };
  }
}
