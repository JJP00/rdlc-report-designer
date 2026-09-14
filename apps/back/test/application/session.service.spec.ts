import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { IPC_EVENTS, type DocumentChangedEvent } from '@rdlc-designer/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EventBusPort } from '../../src/application/ports/out/EventBusPort.js';
import type { FileWatcherPort, Unwatch } from '../../src/application/ports/out/FileWatcherPort.js';
import { SessionService } from '../../src/application/services/SessionService.js';
import { NodeFileSystemAdapter } from '../../src/infrastructure/fs/NodeFileSystemAdapter.js';
import { TrueFormatProjectionAdapter } from '../../src/infrastructure/rdlc/TrueFormatProjectionAdapter.js';
import { TrueFormatXmlAdapter } from '../../src/infrastructure/rdlc/TrueFormatXmlAdapter.js';
import { corpusByName } from '../golden/fixtures.js';

/** F0 — caso de uso completo con adaptadores fake (sin Electron). */

class FakeWatcher implements FileWatcherPort {
  private readonly callbacks = new Map<string, () => void>();

  async watch(path: string, onChange: () => void): Promise<Unwatch> {
    this.callbacks.set(path, onChange);
    return () => this.callbacks.delete(path);
  }

  trigger(path: string): void {
    this.callbacks.get(path)?.();
  }

  get watchingPaths(): string[] {
    return [...this.callbacks.keys()];
  }
}

class FakeEventBus implements EventBusPort {
  readonly sent: { channel: string; payload: unknown }[] = [];

  send(channel: string, payload: unknown): void {
    this.sent.push({ channel, payload });
  }
}

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function makeService(): Promise<{
  service: SessionService;
  watcher: FakeWatcher;
  events: FakeEventBus;
  tmp: string;
}> {
  const tmp = await mkdtemp(join(tmpdir(), 'rdlc-test-'));
  tempDirs.push(tmp);

  const watcher = new FakeWatcher();
  const events = new FakeEventBus();
  const xml = new TrueFormatXmlAdapter();
  const service = new SessionService(
    new NodeFileSystemAdapter(),
    watcher,
    xml,
    xml,
    new TrueFormatProjectionAdapter(),
    events,
  );
  return { service, watcher, events, tmp };
}

async function writeFixture(tmp: string, name: string): Promise<string> {
  const corpus = corpusByName(name);
  const path = join(tmp, name);
  await writeFile(path, corpus.bytes);
  return path;
}

describe('F0 · SessionService (abrir / guardar / vigilar)', () => {
  it('abre un fichero real, proyecta y guarda bytes idénticos', async () => {
    const { service, tmp } = await makeService();
    const path = await writeFixture(tmp, 'PalletOutput.rdlc');
    const before = await readFile(path);

    const opened = await service.open(path);
    expect(opened.isRight()).toBe(true);
    if (!opened.isRight()) return;

    const projection = opened.value.projection;
    expect(projection.reportName).toBe('PalletOutput');
    expect(projection.page.width.value).toBeGreaterThan(0);
    expect(projection.page.body.items.length).toBeGreaterThan(0);

    const saved = await service.save(opened.value.sessionId);
    expect(saved.isRight()).toBe(true);
    if (!saved.isRight()) return;
    expect(saved.value.bytesIdentical).toBe(true);

    const after = await readFile(path);
    expect(after.equals(before)).toBe(true);
  });

  it('proyecta el corpus: items, texto y funciones del bloque <Code>', async () => {
    const { service, tmp } = await makeService();
    const path = await writeFixture(tmp, 'SalesInvoiceESP.rdlc');

    const opened = await service.open(path);
    expect(opened.isRight()).toBe(true);
    if (!opened.isRight()) return;

    const { projection } = opened.value;
    expect(projection.page.width.value).toBeCloseTo(21, 1);
    expect(projection.page.height.value).toBeCloseTo(29.7, 1);
    expect(projection.page.body.items.length).toBeGreaterThan(0);
    expect(projection.meta.fields.length).toBeGreaterThan(0);
    expect(projection.meta.code.functions.length).toBeGreaterThan(0);
  });

  it('detecta cambios externos y empuja una snapshot nueva', async () => {
    const { service, watcher, events, tmp } = await makeService();
    const path = await writeFixture(tmp, 'PalletOutput.rdlc');

    const opened = await service.open(path);
    expect(opened.isRight()).toBe(true);
    if (!opened.isRight()) return;
    const sessionId = opened.value.sessionId;

    expect(watcher.watchingPaths).toEqual([path]);

    // Simula una edición externa (como haría Report Builder o VS Code).
    const xml = await readFile(path, 'utf8');
    await writeFile(path, xml.replace('<Value>(</Value>', '<Value>[EDITADO]</Value>'), 'utf8');

    watcher.trigger(path);

    await vi.waitFor(() => {
      expect(events.sent.some((e) => e.channel === IPC_EVENTS.documentChanged)).toBe(true);
    });

    const event = events.sent.find((e) => e.channel === IPC_EVENTS.documentChanged)?.payload as
      | DocumentChangedEvent
      | undefined;
    expect(event?.sessionId).toBe(sessionId);
    expect(event?.projection.version).toBe(2);
  });

  it('no dispara recarga por el eco de la propia escritura', async () => {
    const { service, watcher, events, tmp } = await makeService();
    const path = await writeFixture(tmp, 'PalletOutput.rdlc');

    const opened = await service.open(path);
    expect(opened.isRight()).toBe(true);
    if (!opened.isRight()) return;

    await service.save(opened.value.sessionId);
    watcher.trigger(path);

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(events.sent.some((e) => e.channel === IPC_EVENTS.documentChanged)).toBe(false);
  });

  it('devuelve E_NOT_FOUND con un fichero inexistente', async () => {
    const { service, tmp } = await makeService();
    const result = await service.open(join(tmp, 'no-existe.rdlc'));
    expect(result.isLeft()).toBe(true);
    if (result.isLeft()) expect(result.value.code).toBe('E_NOT_FOUND');
  });

  it('devuelve E_INVALID_XML con un fichero corrupto', async () => {
    const { service, tmp } = await makeService();
    const path = join(tmp, 'roto.rdlc');
    await writeFile(path, '<Report><sin cerrar</Report>', 'utf8');

    const result = await service.open(path);
    expect(result.isLeft()).toBe(true);
    if (result.isLeft()) expect(result.value.code).toBe('E_INVALID_XML');
  });

  it('cierra la sesión y deja de vigilar', async () => {
    const { service, watcher, tmp } = await makeService();
    const path = await writeFixture(tmp, 'PalletOutput.rdlc');

    const opened = await service.open(path);
    expect(opened.isRight()).toBe(true);
    if (!opened.isRight()) return;

    const closed = await service.close(opened.value.sessionId);
    expect(closed.isRight()).toBe(true);
    expect(watcher.watchingPaths).toEqual([]);

    const saveAfterClose = await service.save(opened.value.sessionId);
    expect(saveAfterClose.isLeft()).toBe(true);
  });
});
