import 'reflect-metadata';
import { mkdir, mkdtemp, readFile, readdir, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  IPC_CHANNELS,
  IPC_EVENTS,
  type ItemDto,
  type Length,
  type ProjectionDto,
} from '@rdlc-designer/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FileWatcherPort, Unwatch } from '../../src/application/ports/out/FileWatcherPort.js';
import type {
  SchemaValidationResult,
  XmlSchemaValidatorPort,
} from '../../src/application/ports/out/XmlSchemaValidatorPort.js';
import { CommandService } from '../../src/application/services/CommandService.js';
import { SessionService } from '../../src/application/services/SessionService.js';
import { BLANK_REPORT_XML } from '../../src/domain/document/templates/blankReport.js';
import { NodeFileSystemAdapter } from '../../src/infrastructure/fs/NodeFileSystemAdapter.js';
import { TrueFormatProjectionAdapter } from '../../src/infrastructure/rdlc/TrueFormatProjectionAdapter.js';
import { TrueFormatXmlAdapter } from '../../src/infrastructure/rdlc/TrueFormatXmlAdapter.js';
import { LibXml2SchemaValidatorAdapter } from '../../src/infrastructure/validation/LibXml2SchemaValidatorAdapter.js';
import { IpcController } from '../../src/presentation/ipc/IpcController.js';
import {
  FakeEventBus,
  FakeWatcher,
  cleanupTempDirs,
  makeService,
  writeFixture,
} from '../application/test-utils.js';

/**
 * Bugs conocidos de la capa de servicios / infraestructura.
 *
 * Cada `describe('BUG-NN …')` reproduce un bug con `it.fails`: las aserciones
 * describen el comportamiento **correcto**. Al arreglar el bug se quita el
 * `.fails` y el test debe pasar.
 */

// `IpcController` importa `electron`: se mockea (como en test/bootstrap) y se
// capturan los handlers registrados en `ipcMain.handle`.
const ipcHandlers = new Map<string, (...args: unknown[]) => unknown>();
vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
      ipcHandlers.set(channel, handler);
    },
  },
  dialog: { showOpenDialog: vi.fn(), showSaveDialog: vi.fn() },
  app: { getPath: () => tmpdir() },
}));

const XSD_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../resources/rdl2016/ReportDefinition2016.xsd',
);

const ownTempDirs: string[] = [];

async function ownTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'rdlc-known-bugs-'));
  ownTempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await cleanupTempDirs();
  await Promise.all(ownTempDirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

/** Número de sesiones vivas (el mapa es privado: no hay API pública que lo liste). */
function sessionCount(service: SessionService): number {
  return (service as unknown as { sessions: Map<string, unknown> }).sessions.size;
}

function buildService(
  watcher: FileWatcherPort,
  schema: XmlSchemaValidatorPort,
  events = new FakeEventBus(),
): SessionService {
  const xml = new TrueFormatXmlAdapter();
  return new SessionService(
    new NodeFileSystemAdapter(),
    watcher,
    xml,
    xml,
    new TrueFormatProjectionAdapter(),
    schema,
    events,
  );
}

const CM_PER_UNIT: Record<string, number> = { cm: 1, mm: 0.1, in: 2.54, pt: 2.54 / 72 };
function toCm(length: Length): number {
  return length.value * (CM_PER_UNIT[length.unit] ?? Number.NaN);
}

function projectXml(xml: string): ProjectionDto {
  const adapter = new TrueFormatXmlAdapter();
  return new TrueFormatProjectionAdapter().project({
    sessionId: 'known-bugs',
    filePath: 'known-bugs.rdl',
    document: adapter.parse(xml),
    version: 1,
  });
}

const FUTURE = new Date(Date.now() + 60 * 60 * 1000);
const PAST = new Date('2001-01-01T00:00:00Z');

const RDL_2010 = `<?xml version="1.0" encoding="utf-8"?>
<Report xmlns="http://schemas.microsoft.com/sqlserver/reporting/2010/01/reportdefinition">
  <Body><ReportItems /><Height>2cm</Height></Body>
  <Width>21cm</Width>
  <Page><PageHeight>29.7cm</PageHeight><PageWidth>21cm</PageWidth></Page>
</Report>
`;

/* ========================================================================== */

// BUG-20 — SessionService.save no comprueba si el fichero cambió en disco desde
// `lastWriteMs`: solo el watcher detecta conflictos. Si el watcher aún no ha
// disparado (debounce, red, evento perdido), Guardar pisa en silencio la
// edición externa.
// Fuente: apps/back/src/application/services/SessionService.ts:139-154
// Comportamiento esperado (elección de diseño): save compara mtime/size de disco
// con la referencia y devuelve Left (conflicto) sin escribir.
// Remove `.fails` when fixing; the test must then pass.
describe('BUG-20 save sobrescribe un cambio externo no detectado por el watcher', () => {
  it('save devuelve conflicto y no pisa el fichero si cambió en disco', async () => {
    const { service, tmp } = await makeService();
    const path = await writeFixture(tmp, 'PalletOutput.rdlc');
    const opened = await service.open(path);
    if (!opened.isRight()) throw new Error('no abrió');

    // Edición externa (otra herramienta) con mtime posterior; el watcher NO dispara.
    const external = (await readFile(path, 'utf8')).replace(
      '<Value>(</Value>',
      '<Value>[EXTERNO]</Value>',
    );
    await writeFile(path, external, 'utf8');
    await utimes(path, FUTURE, FUTURE);

    const saved = await service.save(opened.value.sessionId);

    expect(saved.isLeft()).toBe(true);
    expect(await readFile(path, 'utf8')).toBe(external);
  });
});

// BUG-21 — onExternalChange descarta cambios con `stat.mtimeMs <= lastWriteMs`:
// un reemplazo con mtime ANTERIOR (copia desde el Explorador, `git restore`,
// descomprimir) se ignora y la sesión sigue mostrando el contenido viejo.
// Fuente: apps/back/src/application/services/SessionService.ts:326
// Esperado: se recarga (documentChanged 'external') o se avisa (conflictDetected).
// Remove `.fails` when fixing; the test must then pass.
describe('BUG-21 cambio externo con mtime más antiguo se ignora', () => {
  it('un fichero reemplazado con mtime anterior provoca recarga o conflicto', async () => {
    const { service, watcher, events, tmp } = await makeService();
    const path = await writeFixture(tmp, 'PalletOutput.rdlc');
    const opened = await service.open(path);
    if (!opened.isRight()) throw new Error('no abrió');

    const replaced = (await readFile(path, 'utf8')).replace(
      '<Value>(</Value>',
      '<Value>[RESTAURADO]</Value>',
    );
    await writeFile(path, replaced, 'utf8');
    await utimes(path, PAST, PAST);

    watcher.trigger(path);

    await vi.waitFor(
      () => {
        const reloaded = events
          .payloads<{ reason?: string }>(IPC_EVENTS.documentChanged)
          .some((e) => e.reason === 'external');
        const conflict = events.sent.some((e) => e.channel === IPC_EVENTS.conflictDetected);
        expect(reloaded || conflict).toBe(true);
      },
      { timeout: 1000 },
    );
  });
});

// BUG-22 — NodeFileSystemAdapter.writeFile usa un temporal `${path}.tmp-${pid}`
// fijo por proceso: dos escrituras concurrentes al mismo path comparten el
// temporal y la segunda `rename` falla (ENOENT/EPERM). Además, si `rename` falla
// el temporal se queda en disco.
// Fuente: apps/back/src/infrastructure/fs/NodeFileSystemAdapter.ts:13-18
// Esperado: ambas escrituras resuelven y el fichero final es una de las dos; un
// fallo de rename no deja `*.tmp-*` huérfanos.
// Remove `.fails` when fixing; the test must then pass.
describe('BUG-22 NodeFileSystemAdapter.writeFile: temporal compartido y huérfano', () => {
  it('varios writeFile concurrentes al mismo path resuelven todos', async () => {
    const dir = await ownTempDir();
    const fs = new NodeFileSystemAdapter();
    const path = join(dir, 'Concurrente.rdlc');
    // Varios escritores en paralelo y varias rondas: basta UNA colisión en el
    // temporal compartido para el rechazo; así la reproducción no depende del
    // planificador (con 2 escritores y pocas rondas a veces no se solapaban).
    const contents = Array.from({ length: 8 }, (_, i) => Buffer.alloc(512 * 1024, 65 + i));

    for (let round = 0; round < 10; round += 1) {
      const results = await Promise.allSettled(contents.map((c) => fs.writeFile(path, c)));
      const rejected = results.filter((r) => r.status === 'rejected').length;
      expect(rejected).toBe(0);
      const final = await readFile(path);
      expect(contents.some((c) => final.equals(c))).toBe(true);
    }
  });

  it('si rename falla no deja el temporal en disco', async () => {
    const dir = await ownTempDir();
    const fs = new NodeFileSystemAdapter();
    // El destino es un directorio: `rename(fichero, directorio)` falla.
    const target = join(dir, 'Destino.rdlc');
    await mkdir(target);

    await expect(fs.writeFile(target, Buffer.from('x'))).rejects.toBeDefined();

    const leftovers = (await readdir(dir)).filter((name) => name.includes('.tmp-'));
    expect(leftovers).toEqual([]);
  });
});

// BUG-23 — SessionService.open registra la sesión y arranca el watcher ANTES de
// `schema.validate`; si la validación lanza (LibXml2SchemaValidatorAdapter.validate
// llama a `XmlDocument.fromString` fuera del try, y libxml2 es más estricto que
// xml-trueformat: entidades no definidas, atributos duplicados…), `open` rechaza
// pero la sesión y el watcher quedan colgados. En el guardado,
// `serializeValidated` propaga la excepción en vez de devolver ValidationFailedError.
// Fuentes: apps/back/src/application/services/SessionService.ts:110-118 y :377-387;
// apps/back/src/infrastructure/validation/LibXml2SchemaValidatorAdapter.ts:25
// Esperado: open no deja sesiones ni watchers tras fallar; con el adaptador real,
// un XML que libxml2 no parsea abre con avisos (la validación al importar avisa,
// no bloquea) o devuelve Left, pero nunca rechaza; save devuelve Left E_VALIDATION.
// Remove `.fails` when fixing; the test must then pass.
describe('BUG-23 validación que lanza: sesión/watcher filtrados y error genérico', () => {
  class ThrowingSchema implements XmlSchemaValidatorPort {
    validate(): SchemaValidationResult {
      throw new Error('validador roto');
    }
    warmUp(): void {}
  }

  it('open con un validador que lanza no deja sesión ni watcher', async () => {
    const tmp = await ownTempDir();
    const path = await writeFixture(tmp, 'PalletOutput.rdlc');
    const watcher = new FakeWatcher();
    const service = buildService(watcher, new ThrowingSchema());

    await service.open(path).catch(() => undefined);

    expect(watcher.watchingPaths).toEqual([]);
    expect(sessionCount(service)).toBe(0);
  });

  it('open con libxml2 real y XML que trueformat acepta pero libxml2 no: no rechaza ni filtra', async () => {
    const tmp = await ownTempDir();
    const path = join(tmp, 'Entidad.rdl');
    // `&foo;` no está definida: xml-trueformat lo tolera, libxml2 lanza XmlParseError.
    await writeFile(
      path,
      BLANK_REPORT_XML.replace('<AutoRefresh>0</AutoRefresh>', '<AutoRefresh>&foo;</AutoRefresh>'),
      'utf8',
    );
    const watcher = new FakeWatcher();
    const service = buildService(watcher, new LibXml2SchemaValidatorAdapter(XSD_PATH));

    let rejected: unknown = null;
    const opened = await service.open(path).catch((error: unknown) => {
      rejected = error;
      return null;
    });

    expect(rejected).toBeNull();
    if (opened?.isRight()) {
      expect(opened.value.warnings?.length ?? 0).toBeGreaterThan(0);
    } else {
      expect(watcher.watchingPaths).toEqual([]);
      expect(sessionCount(service)).toBe(0);
    }
  });

  it('save con XML que libxml2 no parsea devuelve Left E_VALIDATION (no lanza)', async () => {
    /** Valida OK al abrir; después delega en el adaptador libxml2 real. */
    class SwitchableSchema implements XmlSchemaValidatorPort {
      delegate: XmlSchemaValidatorPort | null = null;
      validate(xml: string): SchemaValidationResult {
        return this.delegate ? this.delegate.validate(xml) : { valid: true, problems: [] };
      }
      warmUp(): void {}
    }

    const tmp = await ownTempDir();
    const path = join(tmp, 'Entidad.rdl');
    await writeFile(
      path,
      BLANK_REPORT_XML.replace('<AutoRefresh>0</AutoRefresh>', '<AutoRefresh>&foo;</AutoRefresh>'),
      'utf8',
    );
    const schema = new SwitchableSchema();
    const service = buildService(new FakeWatcher(), schema);
    const opened = await service.open(path);
    if (!opened.isRight()) throw new Error('no abrió');

    schema.delegate = new LibXml2SchemaValidatorAdapter(XSD_PATH);

    let rejected: unknown = null;
    const saved = await service.save(opened.value.sessionId).catch((error: unknown) => {
      rejected = error;
      return null;
    });

    expect(rejected).toBeNull();
    expect(saved?.isLeft()).toBe(true);
    if (saved?.isLeft()) expect(saved.value.code).toBe('E_VALIDATION');
  });
});

// BUG-24 — Si `fileWatcher.watch` rechaza durante open (permisos, límite de
// watchers, ruta de red), la sesión ya está en el mapa y se queda filtrada.
// Fuente: apps/back/src/application/services/SessionService.ts:110-114
// Esperado: open falla (Left o rechazo) sin dejar sesiones vivas.
// Remove `.fails` when fixing; the test must then pass.
describe('BUG-24 watcher que rechaza en open deja la sesión filtrada', () => {
  it('si watch rechaza no queda ninguna sesión', async () => {
    class RejectingWatcher implements FileWatcherPort {
      async watch(): Promise<Unwatch> {
        throw new Error('EMFILE: too many open files, watch');
      }
    }
    const tmp = await ownTempDir();
    const path = await writeFixture(tmp, 'PalletOutput.rdlc');
    const service = buildService(new RejectingWatcher(), new LibXml2Stub());

    await service.open(path).catch(() => undefined);

    expect(sessionCount(service)).toBe(0);
  });
});

/** Validador trivial (siempre válido) para tests que no prueban validación. */
class LibXml2Stub implements XmlSchemaValidatorPort {
  validate(): SchemaValidationResult {
    return { valid: true, problems: [] };
  }
  warmUp(): void {}
}

// BUG-25 — TrueFormatProjectionAdapter lee `rd:TypeName` como ATRIBUTO del
// <Field>; en los .rdl de SSRS es un elemento hijo
// `<rd:TypeName>System.String</rd:TypeName>`, así que el tipo se pierde.
// Fuente: apps/back/src/infrastructure/rdlc/TrueFormatProjectionAdapter.ts:596
// Esperado: `meta.fields[].dataType === 'System.String'` (contrato:
// packages/contracts/src/projection.ts, `fields[].dataType`).
// Remove `.fails` when fixing; the test must then pass.
describe('BUG-25 rd:TypeName como elemento hijo de <Field> no se proyecta', () => {
  it('proyecta dataType desde <rd:TypeName> hijo', () => {
    const xml = BLANK_REPORT_XML.replace(
      '<ReportSections>',
      `<DataSets>
    <DataSet Name="DataSet1">
      <Query><DataSourceName>DataSource</DataSourceName><CommandText>select 1</CommandText></Query>
      <Fields>
        <Field Name="CustomerName">
          <DataField>CustomerName</DataField>
          <rd:TypeName>System.String</rd:TypeName>
        </Field>
      </Fields>
    </DataSet>
  </DataSets>
  <ReportSections>`,
    );

    const field = projectXml(xml).meta.fields.find((f) => f.name === 'CustomerName');
    expect(field).toBeDefined();
    expect(field?.dataType).toBe('System.String');
  });
});

// BUG-26 — LENGTH_RE (`/^(-?\d+(?:\.\d+)?)(cm|mm|in|pt)?$/`) no acepta números
// sin cero inicial (`.5in`) ni la unidad `pc` (pica = 12pt), ambos válidos en
// RDL: el item cae al fallback (0) y se dibuja colapsado.
// Fuente: apps/back/src/infrastructure/rdlc/TrueFormatProjectionAdapter.ts:47
// Esperado: `.5in` ≡ 1.27cm y `1pc` ≡ 12pt ≡ 0.4233cm en la proyección (se
// compara en cm: el contrato solo tiene cm|mm|in|pt, así que `pc` debe
// convertirse a una de ellas).
// Remove `.fails` when fixing; the test must then pass.
describe('BUG-26 longitudes `.5in` y `pc` colapsan a 0', () => {
  const textboxXml = (top: string, width: string): string =>
    BLANK_REPORT_XML.replace(
      '<Body>',
      `<Body>
        <ReportItems>
          <Textbox Name="Tb1">
            <Paragraphs><Paragraph><TextRuns><TextRun><Value>x</Value><Style /></TextRun></TextRuns><Style /></Paragraph></Paragraphs>
            <Top>${top}</Top>
            <Left>0cm</Left>
            <Height>1cm</Height>
            <Width>${width}</Width>
            <Style />
          </Textbox>
        </ReportItems>`,
    );

  const tb1 = (xml: string): ItemDto => {
    const item = projectXml(xml).page.body.items.find((i: ItemDto) => i.id === 'Tb1');
    if (!item) throw new Error('Tb1 no proyectado');
    return item;
  };

  it('proyecta `.5in` (sin cero inicial) como 0.5in', () => {
    expect(toCm(tb1(textboxXml('.5in', '3cm')).top)).toBeCloseTo(1.27, 3);
  });

  it('proyecta `1pc` (pica) como 12pt', () => {
    expect(toCm(tb1(textboxXml('1cm', '1pc')).width)).toBeCloseTo((12 * 2.54) / 72, 3);
  });
});

// BUG-27 — reload y onExternalChange no pasan por `checkSupportedSchema` (ni
// por la validación de raíz) que sí hace open: un cambio externo a un RDL de
// otra versión (2010) o a un XML cuya raíz no es <Report> se carga en silencio
// y el siguiente guardado lo reescribiría en orden 2016.
// Fuentes: apps/back/src/application/services/SessionService.ts:180-216 (reload)
// y :319-360 (onExternalChange)
// Esperado: reload devuelve Left con el mismo código que open
// (E_UNSUPPORTED_SCHEMA / E_INVALID_XML); el cambio externo no recarga y avisa.
// En una sesión **limpia** el aviso es `externalReloadFailed` (aviso suave,
// BUG-53); `conflictDetected` queda para sesiones con cambios sin guardar.
describe('BUG-27 reload / cambio externo aceptan esquemas no soportados', () => {
  it('reload a un RDL 2010 devuelve E_UNSUPPORTED_SCHEMA', async () => {
    const { service, tmp } = await makeService();
    const path = await writeFixture(tmp, 'PalletOutput.rdlc');
    const opened = await service.open(path);
    if (!opened.isRight()) throw new Error('no abrió');

    await writeFile(path, RDL_2010, 'utf8');
    const reloaded = await service.reload(opened.value.sessionId);

    expect(reloaded.isLeft()).toBe(true);
    if (reloaded.isLeft()) expect(reloaded.value.code).toBe('E_UNSUPPORTED_SCHEMA');
  });

  it('reload a un XML cuya raíz no es <Report> devuelve E_INVALID_XML', async () => {
    const { service, tmp } = await makeService();
    const path = await writeFixture(tmp, 'PalletOutput.rdlc');
    const opened = await service.open(path);
    if (!opened.isRight()) throw new Error('no abrió');

    await writeFile(path, '<?xml version="1.0"?><foo><bar /></foo>', 'utf8');
    const reloaded = await service.reload(opened.value.sessionId);

    expect(reloaded.isLeft()).toBe(true);
    if (reloaded.isLeft()) expect(reloaded.value.code).toBe('E_INVALID_XML');
  });

  it('un cambio externo a RDL 2010 no se carga y emite externalReloadFailed (sesión limpia)', async () => {
    const { service, watcher, events, tmp } = await makeService();
    const path = await writeFixture(tmp, 'PalletOutput.rdlc');
    const opened = await service.open(path);
    if (!opened.isRight()) throw new Error('no abrió');

    await writeFile(path, RDL_2010, 'utf8');
    await utimes(path, FUTURE, FUTURE);
    watcher.trigger(path);

    await vi.waitFor(
      () => {
        const external = events
          .payloads<{ reason?: string }>(IPC_EVENTS.documentChanged)
          .some((e) => e.reason === 'external');
        expect(external).toBe(false);
        const failed = events.payloads<{ reason?: string }>(IPC_EVENTS.externalReloadFailed).at(-1);
        expect(failed?.reason).toBe('unsupportedSchema');
      },
      { timeout: 1000 },
    );
    // Sin ediciones locales no hay conflicto que resolver.
    expect(events.sent.some((e) => e.channel === IPC_EVENTS.conflictDetected)).toBe(false);
  });
});

// BUG-28 — CommandService.undo no es atómico: aplica los inversos uno a uno y,
// si el k-ésimo falla, los k-1 anteriores ya están aplicados (documento medio
// revertido) aunque el paso se devuelva al undoStack. Reproducible sin fault
// injection: en un `batch` [setLocation X, setName X→Y] el undo aplica primero
// el inverso de setName (setAttribute, por nodo: el item vuelve a llamarse X) y
// después el `setLocation id: X` del inverso, que busca X en un índice que no
// se reconstruye entre inversos (solo conoce Y) y falla.
// Fuente: apps/back/src/application/services/CommandService.ts:151-176
// Esperado (elección de diseño): undo es todo-o-nada. Si devuelve Left el
// documento queda exactamente como antes del undo; si devuelve Right queda
// totalmente revertido. Lo ideal es que este undo concreto funcione.
// Remove `.fails` when fixing; the test must then pass.
describe('BUG-28 undo de un batch deja el documento medio revertido', () => {
  it('undo de [setLocation, setName] es todo-o-nada', async () => {
    const { service, tmp } = await makeService();
    const path = await writeFixture(tmp, 'PalletOutput.rdlc');
    const opened = await service.open(path);
    if (!opened.isRight()) throw new Error('no abrió');
    const sessionId = opened.value.sessionId;
    const commands = new CommandService(service);

    const inserted = commands.execute(sessionId, {
      cmd: 'insertItem',
      scope: { kind: 'body' },
      index: 0,
      item: {
        kind: 'textbox',
        name: 'TbBug28',
        top: { value: 1, unit: 'cm' },
        left: { value: 1, unit: 'cm' },
        width: { value: 3, unit: 'cm' },
        height: { value: 1, unit: 'cm' },
        text: 'Hola',
      },
    });
    expect(inserted.isRight()).toBe(true);

    const batched = commands.execute(sessionId, {
      cmd: 'batch',
      commands: [
        {
          cmd: 'setLocation',
          id: 'TbBug28',
          top: { value: 2, unit: 'cm' },
          left: { value: 2, unit: 'cm' },
        },
        { cmd: 'setName', id: 'TbBug28', name: 'TbBug28Renamed' },
      ],
    });
    expect(batched.isRight()).toBe(true);

    // Referencia al nodo vivo (la identidad se conserva al renombrar).
    const target = service.getEditTarget(sessionId);
    if (!target.isRight()) throw new Error('sin sesión');
    const node = target.value.index.get('TbBug28Renamed');
    if (!node) throw new Error('no se renombró');
    const snapshot = (): { name: string | undefined; top: string | undefined } => ({
      name: node.attribute('Name'),
      top: node.child('Top')?.text(),
    });

    const before = snapshot();
    expect(before.name).toBe('TbBug28Renamed');

    const undone = commands.undo(sessionId);
    const after = snapshot();

    if (undone.isLeft()) {
      // Fallo: el documento debe quedar intacto.
      expect(after).toEqual(before);
    } else {
      expect(after.name).toBe('TbBug28');
      expect(after.top).toBe('1cm');
    }
  });
});

// BUG-29 — IpcController.pendingOpen nunca se limpia tras consumirse: cada
// llamada a `rdlc:pendingOpen` (p. ej. recarga del renderer, HMR) devuelve otra
// vez el fichero de arranque y el front lo reabre.
// Fuente: apps/back/src/presentation/ipc/IpcController.ts:86-89
// Esperado: el primer get devuelve la ruta; los siguientes devuelven null.
// Remove `.fails` when fixing; the test must then pass.
describe('BUG-29 pendingOpen se devuelve más de una vez', () => {
  it('el segundo getPendingOpen devuelve null', async () => {
    ipcHandlers.clear();
    const dummy = {} as never;
    const controller = new IpcController(dummy, dummy, dummy, dummy);
    controller.setPendingOpen('C:\\informes\\Arranque.rdlc');
    controller.register(() => null);

    const handler = ipcHandlers.get(IPC_CHANNELS.pendingOpen);
    expect(handler).toBeDefined();

    const first = (await handler!({})) as { ok: boolean; path: string | null };
    const second = (await handler!({})) as { ok: boolean; path: string | null };

    expect(first.path).toBe('C:\\informes\\Arranque.rdlc');
    expect(second.path).toBeNull();
  });
});
