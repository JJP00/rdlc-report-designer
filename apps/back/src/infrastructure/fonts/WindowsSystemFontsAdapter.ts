import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { SystemFontsPort } from '../../application/ports/out/SystemFontsPort.js';

const execFileAsync = promisify(execFile);

const FONTS_REGISTRY_KEY = 'HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts';

/**
 * Fuentes instaladas en Windows: se leen del registro
 * (`HKLM\...\Fonts`), que lista el nombre de familia legible.
 *
 * Sin dependencias nativas; el resultado se cachea (las fuentes no cambian
 * durante la sesión).
 */
export class WindowsSystemFontsAdapter implements SystemFontsPort {
  private cache: string[] | null = null;

  async list(): Promise<string[]> {
    if (this.cache) return this.cache;

    try {
      const { stdout } = await execFileAsync('reg', ['query', FONTS_REGISTRY_KEY], {
        windowsHide: true,
        maxBuffer: 2 * 1024 * 1024,
      });
      this.cache = parseRegQueryOutput(stdout);
    } catch {
      this.cache = FALLBACK_FONTS;
    }

    return this.cache;
  }
}

/** Parsea `reg query` → nombres de familia (sin `@` ni estilo/fichero). */
export function parseRegQueryOutput(stdout: string): string[] {
  const names = new Set<string>();

  for (const line of stdout.split(/\r?\n/)) {
    // "    Arial (TrueType)    REG_SZ    arial.ttf"
    const match = /^\s+(.+?)\s+REG_SZ\s+\S+/.exec(line);
    if (!match?.[1]) continue;

    const name = match[1]
      .replace(/\s*\((TrueType|OpenType|All res|V1\.0|OTF|TTF)\)\s*$/i, '')
      .replace(/\s*\([^)]*\)\s*$/, '')
      .trim();

    // Las variantes "@Nombre" son fuentes verticales (para escritura CJK).
    if (name.length === 0 || name.startsWith('@')) continue;
    names.add(name);
  }

  return [...names].sort((a, b) => a.localeCompare(b, 'es'));
}

const FALLBACK_FONTS = ['Arial', 'Segoe UI', 'Segoe UI Semibold', 'Times New Roman', 'Courier New', 'Tahoma'];
