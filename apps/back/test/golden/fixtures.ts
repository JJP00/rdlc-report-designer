import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/** `fixtures/corpus/` en la raíz del monorepo (corpus versionado). */
export const CORPUS_DIR = resolve(here, '../../../../fixtures/corpus');

export interface CorpusFile {
  name: string;
  /** Bytes exactos del fichero (referencia del golden test). */
  bytes: Buffer;
  /** Vista utf-8 (los ficheros del corpus son utf-8 sin BOM). */
  xml: string;
}

export function loadCorpus(): CorpusFile[] {
  return readdirSync(CORPUS_DIR)
    .filter((name) => name.endsWith('.rdlc'))
    .sort((a, b) => a.localeCompare(b))
    .map((name) => {
      const bytes = readFileSync(join(CORPUS_DIR, name));
      return { name, bytes, xml: bytes.toString('utf8') };
    });
}

export function corpusByName(name: string): CorpusFile {
  const file = loadCorpus().find((f) => f.name === name);
  if (!file) throw new Error(`No existe el fixture ${name}`);
  return file;
}

/** Primer índice donde difieren dos strings (para diagnósticos legibles). */
export function firstDiff(a: string, b: string): { index: number; around: string } | null {
  const max = Math.min(a.length, b.length);
  for (let i = 0; i < max; i += 1) {
    if (a[i] !== b[i]) {
      const from = Math.max(0, i - 40);
      const to = Math.min(max, i + 40);
      return {
        index: i,
        around: `...${a.slice(from, i)}⟦${a[i]}❗${b[i]}⟧${a.slice(i + 1, to)}...`,
      };
    }
  }
  if (a.length !== b.length) {
    return { index: max, around: `longitudes distintas: ${a.length} vs ${b.length}` };
  }
  return null;
}
