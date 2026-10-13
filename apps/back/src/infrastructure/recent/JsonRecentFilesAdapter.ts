import { readFile, stat, writeFile } from 'node:fs/promises';
import type { RecentFilesPort } from '../../application/ports/out/RecentFilesPort.js';

/** Máximo de recientes que se conservan. */
const MAX_RECENT = 8;

/**
 * Recientes persistidos en un JSON (en la app, bajo `userData`). Al listar se
 * descartan las rutas que ya no existen en disco y se reescribe la lista
 * podada, para que el desplegable nunca ofrezca ficheros rotos.
 */
export class JsonRecentFilesAdapter implements RecentFilesPort {
  constructor(private readonly filePath: string) {}

  async list(): Promise<string[]> {
    const stored = await this.readStored();
    const existing: string[] = [];
    for (const path of stored) {
      if (await this.exists(path)) existing.push(path);
      if (existing.length >= MAX_RECENT) break;
    }
    if (existing.length !== stored.length) await this.writeStored(existing);
    return existing;
  }

  async add(path: string): Promise<string[]> {
    const stored = await this.readStored();
    const next = [path, ...stored.filter((candidate) => candidate !== path)].slice(0, MAX_RECENT);
    await this.writeStored(next);
    return this.list();
  }

  private async readStored(): Promise<string[]> {
    try {
      const parsed: unknown = JSON.parse(await readFile(this.filePath, 'utf8'));
      return Array.isArray(parsed)
        ? parsed.filter((item): item is string => typeof item === 'string')
        : [];
    } catch {
      // Sin fichero (primera ejecución) o JSON corrupto: se empieza de cero.
      return [];
    }
  }

  private async writeStored(paths: string[]): Promise<void> {
    try {
      await writeFile(this.filePath, JSON.stringify(paths, null, 2), 'utf8');
    } catch {
      // Persistir recientes es una comodidad: un fallo de disco no debe romper.
    }
  }

  private async exists(path: string): Promise<boolean> {
    try {
      await stat(path);
      return true;
    } catch {
      return false;
    }
  }
}
