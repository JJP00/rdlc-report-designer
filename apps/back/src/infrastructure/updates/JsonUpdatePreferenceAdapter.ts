import { readFile, writeFile } from 'node:fs/promises';
import type { UpdatePreferencePort } from '../../application/ports/out/UpdatePreferencePort.js';

/**
 * Preferencias de actualización en un JSON (en la app, bajo `userData`).
 * Formato: `{ "skippedVersion": "0.9.1" }`. Sin fichero o JSON corrupto: se
 * empieza sin versión omitida.
 */
export class JsonUpdatePreferenceAdapter implements UpdatePreferencePort {
  constructor(private readonly filePath: string) {}

  async readSkippedVersion(): Promise<string | null> {
    try {
      const parsed: unknown = JSON.parse(await readFile(this.filePath, 'utf8'));
      if (parsed && typeof parsed === 'object' && 'skippedVersion' in parsed) {
        const value = (parsed as { skippedVersion?: unknown }).skippedVersion;
        return typeof value === 'string' && value.trim() !== '' ? value : null;
      }
      return null;
    } catch {
      return null;
    }
  }

  async writeSkippedVersion(version: string): Promise<void> {
    try {
      await writeFile(this.filePath, JSON.stringify({ skippedVersion: version }, null, 2), 'utf8');
    } catch {
      // Omitir una versión es una comodidad: un fallo de disco no rompe.
    }
  }
}
