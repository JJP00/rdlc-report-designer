import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { EventBusPort } from '../../src/application/ports/out/EventBusPort.js';
import type { FileWatcherPort, Unwatch } from '../../src/application/ports/out/FileWatcherPort.js';
import type {
  SchemaValidationResult,
  XmlSchemaValidatorPort,
} from '../../src/application/ports/out/XmlSchemaValidatorPort.js';
import { SessionService } from '../../src/application/services/SessionService.js';
import { NodeFileSystemAdapter } from '../../src/infrastructure/fs/NodeFileSystemAdapter.js';
import { TrueFormatProjectionAdapter } from '../../src/infrastructure/rdlc/TrueFormatProjectionAdapter.js';
import { TrueFormatXmlAdapter } from '../../src/infrastructure/rdlc/TrueFormatXmlAdapter.js';
import { corpusByName } from '../golden/fixtures.js';

/** Fakes compartidos por los tests de la capa de aplicación (sin Electron). */

export class FakeWatcher implements FileWatcherPort {
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

export class FakeEventBus implements EventBusPort {
  readonly sent: { channel: string; payload: unknown }[] = [];

  send(channel: string, payload: unknown): void {
    this.sent.push({ channel, payload });
  }

  payloads<T>(channel: string): T[] {
    return this.sent
      .filter((event) => event.channel === channel)
      .map((event) => event.payload as T);
  }
}

export class FakeSchemaValidator implements XmlSchemaValidatorPort {
  result: SchemaValidationResult = { valid: true, problems: [] };

  validate(): SchemaValidationResult {
    return this.result;
  }

  warmUp(): void {}
}

const tempDirs: string[] = [];

/** Borra los directorios temporales creados por `makeService`. */
export async function cleanupTempDirs(): Promise<void> {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
}

export interface ServiceHarness {
  service: SessionService;
  watcher: FakeWatcher;
  events: FakeEventBus;
  schema: FakeSchemaValidator;
  tmp: string;
}

export async function makeService(): Promise<ServiceHarness> {
  const tmp = await mkdtemp(join(tmpdir(), 'rdlc-test-'));
  tempDirs.push(tmp);

  const watcher = new FakeWatcher();
  const events = new FakeEventBus();
  const schema = new FakeSchemaValidator();
  const xml = new TrueFormatXmlAdapter();
  const service = new SessionService(
    new NodeFileSystemAdapter(),
    watcher,
    xml,
    xml,
    new TrueFormatProjectionAdapter(),
    schema,
    events,
  );
  return { service, watcher, events, schema, tmp };
}

/** Copia un fichero del corpus a un directorio temporal y devuelve su ruta. */
export async function writeFixture(tmp: string, name: string): Promise<string> {
  const corpus = corpusByName(name);
  const path = join(tmp, name);
  await writeFile(path, corpus.bytes);
  return path;
}
