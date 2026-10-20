import { readFile, writeFile } from 'node:fs/promises';
import type { LocalePreferencePort } from '../../application/ports/out/LocalePreferencePort.js';

/**
 * Preferencia de idioma en un JSON (en la app, bajo `userData`). Formato:
 * `{ "locale": "es" }`. Sin fichero o JSON corrupto: se empieza sin
 * preferencia (el idioma del SO decide).
 */
export class JsonLocalePreferenceAdapter implements LocalePreferencePort {
  constructor(private readonly filePath: string) {}

  async read(): Promise<string | null> {
    try {
      const parsed: unknown = JSON.parse(await readFile(this.filePath, 'utf8'));
      if (parsed && typeof parsed === 'object' && 'locale' in parsed) {
        const value = (parsed as { locale?: unknown }).locale;
        return typeof value === 'string' && value.trim() !== '' ? value : null;
      }
      return null;
    } catch {
      return null;
    }
  }

  async write(locale: string): Promise<void> {
    try {
      await writeFile(this.filePath, JSON.stringify({ locale }, null, 2), 'utf8');
    } catch {
      // Persistir la preferencia es una comodidad: un fallo de disco no rompe.
    }
  }
}
