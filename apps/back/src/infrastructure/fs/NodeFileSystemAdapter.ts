import { randomUUID } from 'node:crypto';
import { readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { FileStat, FileSystemPort } from '../../application/ports/out/FileSystemPort.js';

/**
 * Adaptador NodeFs. Escritura atómica (temp + rename) para no dejar nunca un
 * `.rdlc` a medias si el proceso muere a mitad de guardado.
 *
 * Las escrituras al **mismo** destino se serializan en el proceso: en Windows
 * dos `rename` solapados al mismo fichero no son atómicos entre sí y el segundo
 * falla con EPERM (doble Ctrl+S, «guardar» mientras corre otro guardado).
 */
export class NodeFileSystemAdapter implements FileSystemPort {
  async readFile(path: string): Promise<Buffer> {
    return readFile(path);
  }

  async writeFile(path: string, content: Buffer): Promise<void> {
    const key = queueKey(path);
    const previous = writeQueues.get(key) ?? Promise.resolve();
    // Una escritura anterior rechazada no debe envenenar las siguientes.
    const task = previous.catch(() => undefined).then(() => this.writeAtomic(path, content));
    const settled = task.then(
      () => undefined,
      () => undefined,
    );
    writeQueues.set(key, settled);
    try {
      await task;
    } finally {
      // Última de la cola: se retira la entrada para que el mapa no crezca.
      if (writeQueues.get(key) === settled) writeQueues.delete(key);
    }
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

  private async writeAtomic(path: string, content: Buffer): Promise<void> {
    // Temporal **único por escritura**: dos guardados del mismo informe no
    // comparten fichero (antes `${path}.tmp-${pid}`: el segundo rename daba
    // ENOENT) ni se pisan entre sí.
    const tmp = `${path}.tmp-${process.pid}-${randomUUID()}`;
    try {
      await writeFile(tmp, content);
      await renameWithRetry(tmp, path);
    } catch (error) {
      // Un rename rechazado (EPERM/EBUSY por antivirus o bloqueos, EISDIR…)
      // no debe dejar el `.tmp-*` huérfano al lado del informe.
      await rm(tmp, { force: true }).catch(() => undefined);
      throw error;
    }
  }
}

/**
 * `rename` con reintentos para rechazos **transitorios** de Windows (antivirus
 * o indexador con el fichero abierto un instante). Un rechazo definitivo
 * (EISDIR, ENOENT…) se propaga tal cual.
 */
async function renameWithRetry(from: string, to: string): Promise<void> {
  const delaysMs = [10, 25, 50, 100];
  for (let attempt = 0; ; attempt += 1) {
    try {
      await rename(from, to);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      const transient = code === 'EPERM' || code === 'EACCES' || code === 'EBUSY';
      if (!transient || attempt >= delaysMs.length) throw error;
      await new Promise((resolveDelay) => setTimeout(resolveDelay, delaysMs[attempt]));
    }
  }
}

/** Colas de escritura por destino (clave normalizada; Windows es insensible a mayúsculas). */
const writeQueues = new Map<string, Promise<void>>();

function queueKey(path: string): string {
  const resolved = resolve(path);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}
