import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  IPC_EVENTS,
  type DocumentChangedEvent,
  type ExternalReloadFailedEvent,
  type FileMissingChangedEvent,
} from '@rdlc-designer/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  FileStat,
  FileSystemPort,
} from '../../src/application/ports/out/FileSystemPort.js';
import { NodeFileSystemAdapter } from '../../src/infrastructure/fs/NodeFileSystemAdapter.js';
import { cleanupTempDirs, makeService, writeFixture } from './test-utils.js';

/**
 * Resiliencia del ciclo de vida del documento (docs/bugs/0002): el guardado
 * concurrente, el conflicto que se resuelve sobrescribiendo, los ficheros
 * externos corruptos/borrados y un watcher que no arranca.
 */

afterEach(cleanupTempDirs);

/**
 * Adaptador de ficheros instrumentado (BUG-54): deja los bytes en disco y
 * después mantiene la promesa pendiente un instante. Sin serialización por
 * sesión, el segundo guardado comprobaría la referencia en ese hueco y vería
 * un cambio externo que en realidad es la primera escritura a medias.
 */
class SlowFileSystem implements FileSystemPort {
  readonly writeLog: string[] = [];
  latencyMs = 25;
  private readonly inner = new NodeFileSystemAdapter();

  async readFile(path: string): Promise<Buffer> {
    return this.inner.readFile(path);
  }

  async stat(path: string): Promise<FileStat> {
    return this.inner.stat(path);
  }

  async exists(path: string): Promise<boolean> {
    return this.inner.exists(path);
  }

  async writeFile(path: string, content: Buffer): Promise<void> {
    this.writeLog.push('start');
    await this.inner.writeFile(path, content);
    await new Promise((resolve) => setTimeout(resolve, this.latencyMs));
    this.writeLog.push('end');
  }
}

/** RDL 2010: misma forma que SSRS pero otra versión de esquema (no se abre). */
const RDL_2010 = `<?xml version="1.0" encoding="utf-8"?>
<Report xmlns="http://schemas.microsoft.com/sqlserver/reporting/2010/01/reportdefinition">
  <Body><ReportItems /><Height>2cm</Height></Body>
  <Width>21cm</Width>
</Report>
`;

describe('Resiliencia · conflicto al guardar (BUG-52)', () => {
  it('avanza la referencia: sobrescribir funciona una vez y un cambio posterior se detecta', async () => {
    const { service, tmp } = await makeService();
    const path = await writeFixture(tmp, 'PalletOutput.rdlc');
    const opened = await service.open(path);
    if (!opened.isRight()) throw new Error('no abrió');
    const sessionId = opened.value.sessionId;

    const target = service.getEditTarget(sessionId);
    if (!target.isRight()) throw new Error('sin sesión');
    target.value.index.get('Textbox25')?.child('Width')?.setText('5cm');
    service.touch(sessionId, { snapshotOut: false });

    // Cambio externo que el watcher no llegó a ver (sin `trigger`).
    const external = (await readFile(path, 'utf8')).replace(
      '<Value>(</Value>',
      '<Value>[EXTERNO]</Value>',
    );
    await writeFile(path, external, 'utf8');

    const first = await service.save(sessionId);
    expect(first.isLeft()).toBe(true);
    if (first.isLeft()) expect(first.value.code).toBe('E_CONFLICT');
    // No se pisó el fichero externo.
    expect(await readFile(path, 'utf8')).toBe(external);

    // «Guardar y sobrescribir»: el **mismo** cambio ya no se rechaza.
    const second = await service.save(sessionId);
    expect(second.isRight()).toBe(true);
    expect(await readFile(path, 'utf8')).toContain('5cm');

    // Un cambio externo **distinto** posterior vuelve a detectarse.
    const later = (await readFile(path, 'utf8')).replace(
      '<Value>(</Value>',
      '<Value>[OTRO]</Value>',
    );
    await writeFile(path, later, 'utf8');

    const third = await service.save(sessionId);
    expect(third.isLeft()).toBe(true);
    if (third.isLeft()) expect(third.value.code).toBe('E_CONFLICT');
  });
});

describe('Resiliencia · cambio externo no recargable (BUG-53)', () => {
  it('sesión limpia + fichero corrupto: aviso suave; al completarse, recarga externa', async () => {
    const { service, watcher, events, tmp } = await makeService();
    const path = await writeFixture(tmp, 'PalletOutput.rdlc');
    const opened = await service.open(path);
    if (!opened.isRight()) throw new Error('no abrió');
    const sessionId = opened.value.sessionId;
    const original = await readFile(path);

    await writeFile(path, '<Report><sin cerrar</Report>', 'utf8');
    watcher.trigger(path);

    await vi.waitFor(() => {
      expect(events.payloads<ExternalReloadFailedEvent>(IPC_EVENTS.externalReloadFailed)).toHaveLength(1);
    });
    expect(events.payloads<ExternalReloadFailedEvent>(IPC_EVENTS.externalReloadFailed)[0]).toEqual({
      sessionId,
      filePath: path,
      reason: 'unreadable',
    });
    // Sin ediciones locales no se habla de conflicto.
    expect(events.sent.some((e) => e.channel === IPC_EVENTS.conflictDetected)).toBe(false);

    // El fichero se completa: recarga silenciosa, sin conflicto pegado.
    await writeFile(path, original);
    watcher.trigger(path);
    await vi.waitFor(() => {
      expect(
        events
          .payloads<DocumentChangedEvent>(IPC_EVENTS.documentChanged)
          .some((e) => e.reason === 'external'),
      ).toBe(true);
    });
    expect(events.sent.some((e) => e.channel === IPC_EVENTS.conflictDetected)).toBe(false);
  });

  it('sesión limpia + RDL de otro esquema: aviso suave con unsupportedSchema', async () => {
    const { service, watcher, events, tmp } = await makeService();
    const path = await writeFixture(tmp, 'PalletOutput.rdlc');
    const opened = await service.open(path);
    if (!opened.isRight()) throw new Error('no abrió');

    await writeFile(path, RDL_2010, 'utf8');
    watcher.trigger(path);

    await vi.waitFor(() => {
      const failed = events
        .payloads<ExternalReloadFailedEvent>(IPC_EVENTS.externalReloadFailed)
        .at(-1);
      expect(failed?.reason).toBe('unsupportedSchema');
    });
    expect(events.sent.some((e) => e.channel === IPC_EVENTS.conflictDetected)).toBe(false);
    expect(events.sent.some((e) => e.channel === IPC_EVENTS.documentChanged)).toBe(false);
  });

  it('con ediciones locales el conflicto se mantiene aunque el fichero no se pueda leer', async () => {
    const { service, watcher, events, tmp } = await makeService();
    const path = await writeFixture(tmp, 'PalletOutput.rdlc');
    const opened = await service.open(path);
    if (!opened.isRight()) throw new Error('no abrió');
    const sessionId = opened.value.sessionId;

    const target = service.getEditTarget(sessionId);
    if (!target.isRight()) throw new Error('sin sesión');
    target.value.index.get('Textbox25')?.child('Width')?.setText('5cm');
    service.touch(sessionId, { snapshotOut: false });

    await writeFile(path, '<Report><sin cerrar</Report>', 'utf8');
    watcher.trigger(path);

    await vi.waitFor(() => {
      expect(events.sent.some((e) => e.channel === IPC_EVENTS.conflictDetected)).toBe(true);
    });
    expect(events.sent.some((e) => e.channel === IPC_EVENTS.externalReloadFailed)).toBe(false);
  });
});

describe('Resiliencia · operaciones por sesión (BUG-54)', () => {
  it('dos save concurrentes se serializan y ninguno da falso conflicto', async () => {
    const fileSystem = new SlowFileSystem();
    const { service, tmp } = await makeService({ fileSystem });
    const path = await writeFixture(tmp, 'PalletOutput.rdlc');
    const opened = await service.open(path);
    if (!opened.isRight()) throw new Error('no abrió');
    const sessionId = opened.value.sessionId;

    const target = service.getEditTarget(sessionId);
    if (!target.isRight()) throw new Error('sin sesión');
    target.value.index.get('Textbox25')?.child('Width')?.setText('5cm');
    service.touch(sessionId, { snapshotOut: false });

    const [first, second] = await Promise.all([
      service.save(sessionId),
      service.save(sessionId),
    ]);

    expect(first.isRight()).toBe(true);
    expect(second.isRight()).toBe(true);
    // Las escrituras no se solapan: cada `start` tiene su `end` antes del siguiente.
    expect(fileSystem.writeLog).toEqual(['start', 'end', 'start', 'end']);
    expect(await readFile(path, 'utf8')).toContain('5cm');
  });

  it('una sesión desconocida devuelve error natural y no deja la cola envenenada', async () => {
    const { service, tmp } = await makeService();
    const path = await writeFixture(tmp, 'PalletOutput.rdlc');
    const opened = await service.open(path);
    if (!opened.isRight()) throw new Error('no abrió');

    const unknown = await service.save('sesión-inexistente');
    expect(unknown.isLeft()).toBe(true);
    if (unknown.isLeft()) expect(unknown.value.code).toBe('E_NOT_FOUND');

    // Tras cerrarla, la misma sesión ya no existe pero la del fichero sigue viva.
    await service.close(opened.value.sessionId, { force: true });
    const afterClose = await service.save(opened.value.sessionId);
    expect(afterClose.isLeft()).toBe(true);
    if (afterClose.isLeft()) expect(afterClose.value.code).toBe('E_NOT_FOUND');
  });
});

describe('Resiliencia · fichero borrado/movido (BUG-55)', () => {
  it('emite missing true al desaparecer y false al volver, sin repetir transiciones', async () => {
    const { service, watcher, events, tmp } = await makeService();
    const path = await writeFixture(tmp, 'PalletOutput.rdlc');
    const opened = await service.open(path);
    if (!opened.isRight()) throw new Error('no abrió');
    const sessionId = opened.value.sessionId;
    const original = await readFile(path);

    await rm(path);
    watcher.triggerUnlink(path);
    await vi.waitFor(() => {
      expect(events.payloads<FileMissingChangedEvent>(IPC_EVENTS.fileMissingChanged)).toHaveLength(1);
    });
    expect(events.payloads<FileMissingChangedEvent>(IPC_EVENTS.fileMissingChanged)[0]).toEqual({
      sessionId,
      filePath: path,
      missing: true,
    });

    // Otro unlink sin transición real no repite el aviso.
    watcher.triggerUnlink(path);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(events.payloads(IPC_EVENTS.fileMissingChanged)).toHaveLength(1);

    // El fichero vuelve: se limpia la marca (y se recarga como cambio externo).
    await writeFile(path, original);
    watcher.trigger(path);
    await vi.waitFor(() => {
      const list = events.payloads<FileMissingChangedEvent>(IPC_EVENTS.fileMissingChanged);
      expect(list.at(-1)).toEqual({ sessionId, filePath: path, missing: false });
    });
  });

  it('guardar tras el borrado recrea el fichero y limpia missing', async () => {
    const { service, watcher, events, tmp } = await makeService();
    const path = await writeFixture(tmp, 'PalletOutput.rdlc');
    const opened = await service.open(path);
    if (!opened.isRight()) throw new Error('no abrió');
    const sessionId = opened.value.sessionId;

    const target = service.getEditTarget(sessionId);
    if (!target.isRight()) throw new Error('sin sesión');
    target.value.index.get('Textbox25')?.child('Width')?.setText('5cm');
    service.touch(sessionId, { snapshotOut: false });

    await rm(path);
    watcher.triggerUnlink(path);
    await vi.waitFor(() => {
      const list = events.payloads<FileMissingChangedEvent>(IPC_EVENTS.fileMissingChanged);
      expect(list.at(-1)?.missing).toBe(true);
    });

    const saved = await service.save(sessionId);
    expect(saved.isRight()).toBe(true);
    expect(await readFile(path, 'utf8')).toContain('5cm');
    await vi.waitFor(() => {
      const list = events.payloads<FileMissingChangedEvent>(IPC_EVENTS.fileMissingChanged);
      expect(list.at(-1)).toEqual({ sessionId, filePath: path, missing: false });
    });
  });

  it('un unlink con el fichero aún presente (rename atómico) se ignora', async () => {
    const { service, watcher, events, tmp } = await makeService();
    const path = await writeFixture(tmp, 'PalletOutput.rdlc');
    const opened = await service.open(path);
    if (!opened.isRight()) throw new Error('no abrió');

    watcher.triggerUnlink(path);
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(events.sent.some((e) => e.channel === IPC_EVENTS.fileMissingChanged)).toBe(false);
  });
});

describe('Resiliencia · saveAs con watcher que falla (BUG-56)', () => {
  it('queda consistente, avisa y se puede seguir guardando en la ruta nueva', async () => {
    const { service, watcher, events, tmp } = await makeService();
    const original = await writeFixture(tmp, 'PalletOutput.rdlc');
    const copy = join(tmp, 'Copia.rdlc');
    const opened = await service.open(original);
    if (!opened.isRight()) throw new Error('no abrió');
    const sessionId = opened.value.sessionId;

    const target = service.getEditTarget(sessionId);
    if (!target.isRight()) throw new Error('sin sesión');
    target.value.index.get('Textbox25')?.child('Width')?.setText('7.77cm');
    service.touch(sessionId, { snapshotOut: false });

    watcher.failNextWatch = true;
    const savedAs = await service.saveAs(sessionId, copy);
    expect(savedAs.isRight()).toBe(true);
    if (!savedAs.isRight()) return;
    expect(savedAs.value.path).toBe(copy);
    expect(savedAs.value.warning).toBe(
      'Guardado, pero no se vigilan cambios externos en el fichero nuevo.',
    );
    expect(await readFile(copy, 'utf8')).toContain('7.77cm');
    // El watcher viejo se soltó y el nuevo no llegó a crearse.
    expect(watcher.watchingPaths).toEqual([]);

    // La sesión apunta al fichero nuevo, sigue siendo guardable…
    const again = await service.save(sessionId);
    expect(again.isRight()).toBe(true);
    if (again.isRight()) expect(again.value.path).toBe(copy);

    // …y quedó limpia: cerrar no pide confirmación.
    const closed = await service.close(sessionId);
    expect(closed.isRight()).toBe(true);
    if (closed.isRight()) expect(closed.value.closed).toBe(true);
    expect(events.payloads(IPC_EVENTS.saved).length).toBeGreaterThanOrEqual(2);
  });
});

describe('Resiliencia · re-adopción de sesiones (BUG-51)', () => {
  it('listSessions devuelve las sesiones vivas en orden (con dirty/proyección) y se vacía al cerrar', async () => {
    const { service, tmp } = await makeService();
    const pathA = await writeFixture(tmp, 'PalletOutput.rdlc');
    const pathB = await writeFixture(tmp, 'SalesInvoiceESP.rdlc');

    const first = await service.open(pathA);
    const second = await service.open(pathB);
    if (!first.isRight() || !second.isRight()) throw new Error('no abrió');

    const target = service.getEditTarget(first.value.sessionId);
    if (!target.isRight()) throw new Error('sin sesión');
    target.value.index.get('Textbox25')?.child('Width')?.setText('5cm');
    service.touch(first.value.sessionId, { snapshotOut: false });

    const listed = service.listSessions();
    expect(listed.map((s) => s.sessionId)).toEqual([
      first.value.sessionId,
      second.value.sessionId,
    ]);
    expect(listed[0]).toMatchObject({ filePath: pathA, dirty: true });
    expect(listed[0]?.projection.reportName).toBe('PalletOutput');
    expect(listed[1]).toMatchObject({ filePath: pathB, dirty: false });
    expect(listed[1]?.projection.reportName).toBe('SalesInvoiceESP');

    await service.close(first.value.sessionId, { force: true });
    expect(service.listSessions().map((s) => s.sessionId)).toEqual([second.value.sessionId]);

    await service.close(second.value.sessionId);
    expect(service.listSessions()).toEqual([]);
  });
});
