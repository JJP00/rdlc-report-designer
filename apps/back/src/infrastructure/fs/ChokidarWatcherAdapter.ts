import { watch, type FSWatcher } from 'chokidar';
import type { FileWatcherPort, Unwatch } from '../../application/ports/out/FileWatcherPort.js';

/**
 * Adaptador chokidar. `ignoreInitial` para no disparar al abrir; el filtrado
 * de la propia escritura (mtime/flag) vive en SessionService.
 */
export class ChokidarWatcherAdapter implements FileWatcherPort {
  private readonly watchers = new Map<string, FSWatcher>();

  async watch(path: string, onChange: () => void): Promise<Unwatch> {
    const watcher = watch(path, {
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 80, pollInterval: 20 },
    });
    watcher.on('change', onChange);
    watcher.on('add', onChange);
    this.watchers.set(path, watcher);
    return () => {
      void watcher.close();
      this.watchers.delete(path);
    };
  }
}
