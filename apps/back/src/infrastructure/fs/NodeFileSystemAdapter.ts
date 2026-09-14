import { readFile, stat, writeFile } from 'node:fs/promises';
import type { FileStat, FileSystemPort } from '../../application/ports/out/FileSystemPort.js';

/**
 * Adaptador NodeFs. Escritura atómica (temp + rename) para no dejar nunca un
 * `.rdlc` a medias si el proceso muere a mitad de guardado.
 */
export class NodeFileSystemAdapter implements FileSystemPort {
  async readFile(path: string): Promise<Buffer> {
    return readFile(path);
  }

  async writeFile(path: string, content: Buffer): Promise<void> {
    const tmp = `${path}.tmp-${process.pid}`;
    await writeFile(tmp, content);
    const { rename } = await import('node:fs/promises');
    await rename(tmp, path);
  }

  async stat(path: string): Promise<FileStat> {
    const s = await stat(path);
    return { mtimeMs: s.mtimeMs, size: s.size };
  }

  async exists(path: string): Promise<boolean> {
    try {
      await stat(path);
      return true;
    } catch {
      return false;
    }
  }
}
