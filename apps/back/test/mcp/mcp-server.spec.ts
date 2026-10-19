import { copyFile, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createMcpServer } from '../../src/mcp/createServer.js';
import { createHeadlessContext } from '../../src/mcp/headlessContext.js';
import {
  cleanupTempDirs,
  FakeWatcher,
  makeService,
  writeFixture,
} from '../application/test-utils.js';

/**
 * El servidor MCP de punta a punta: un cliente MCP real contra el servidor por
 * un transporte en memoria, con el dominio, el serializador y el XSD reales
 * (solo el watcher es un fake para no dejar handles abiertos).
 */

interface Reply {
  [key: string]: unknown;
}

let client: Client;
let watcher: FakeWatcher;
let tmp: string;

async function call(
  name: string,
  args: Record<string, unknown> = {},
): Promise<Reply & { isError: boolean }> {
  const result = await client.callTool({ name, arguments: args });
  const content = result.content as { type: string; text: string }[];
  const body = content[0]?.text ?? '';
  let parsed: Reply;
  try {
    parsed = JSON.parse(body) as Reply;
  } catch {
    parsed = { text: body };
  }
  return { ...parsed, isError: result.isError === true };
}

beforeEach(async () => {
  watcher = new FakeWatcher();
  tmp = (await makeService()).tmp;
  const ctx = createHeadlessContext({ fileWatcher: watcher });
  const server = createMcpServer(ctx);
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: 'test', version: '0.0.0' });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
});

afterEach(async () => {
  await client.close();
  await cleanupTempDirs();
});

async function createBlank(name = 'new.rdlc'): Promise<{ sessionId: string; path: string }> {
  const path = join(tmp, name);
  const created = await call('rdlc_create', { path });
  expect(created.isError).toBe(false);
  return { sessionId: created['sessionId'] as string, path };
}

const textbox = (name: string, value: string): Record<string, unknown> => ({
  cmd: 'insertItem',
  scope: { kind: 'body' },
  index: 0,
  item: {
    kind: 'textbox',
    name,
    top: { value: 1, unit: 'cm' },
    left: { value: 1, unit: 'cm' },
    width: { value: 5, unit: 'cm' },
    height: { value: 1, unit: 'cm' },
    text: value,
  },
});

describe('servidor MCP rdlc', () => {
  it('expone las herramientas rdlc_*', async () => {
    const { tools } = await client.listTools();
    const names = tools.map((tool) => tool.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'rdlc_open',
        'rdlc_create',
        'rdlc_save',
        'rdlc_get_outline',
        'rdlc_apply_commands',
        'rdlc_list_commands',
        'rdlc_undo',
      ]),
    );
    // El catálogo de comandos NO viaja entero en el esquema de la herramienta.
    const apply = tools.find((tool) => tool.name === 'rdlc_apply_commands');
    expect(JSON.stringify(apply?.inputSchema).length).toBeLessThan(2000);
  });

  it('crea, edita, guarda y el fichero resultante se reabre con los cambios', async () => {
    const { sessionId, path } = await createBlank();

    const applied = await call('rdlc_apply_commands', {
      sessionId,
      commands: [
        textbox('Title', 'Hello'),
        { cmd: 'setText', id: 'Title', p: 0, r: 0, value: '=Fields!No.Value' },
      ],
    });
    expect(applied.isError).toBe(false);
    expect(applied['applied']).toBe(2);
    expect((applied['results'] as { id?: string }[])[0]?.id).toBe('Title');

    const outline = await call('rdlc_get_outline', { sessionId });
    expect(outline['text']).toContain('textbox "Title"');
    expect(outline['text']).toContain('=Fields!No.Value');

    const saved = await call('rdlc_save', { sessionId });
    expect(saved.isError).toBe(false);
    expect(await readFile(path, 'utf8')).toContain('=Fields!No.Value');

    // Reabrir desde otra sesión: lo guardado es lo editado.
    expect((await call('rdlc_close', { sessionId })).isError).toBe(false);
    const reopened = await call('rdlc_open', { path });
    const item = await call('rdlc_get_item', { sessionId: reopened['sessionId'], id: 'Title' });
    expect(item['isError']).toBe(false);
    expect(JSON.stringify(item['item'])).toContain('=Fields!No.Value');
  });

  it('setRunLabel escribe la etiqueta <Label> del run y null la quita', async () => {
    const { sessionId, path } = await createBlank();
    await call('rdlc_apply_commands', {
      sessionId,
      commands: [textbox('Title', '=Fields!No.Value')],
    });

    type Runs = { paragraphs: { runs: { value: string; label?: string }[] }[] };
    const runOf = async (): Promise<{ value: string; label?: string }> => {
      const item = await call('rdlc_get_item', { sessionId, id: 'Title' });
      return ((item['item'] as Runs).paragraphs[0]?.runs[0] ?? { value: '' }) as {
        value: string;
        label?: string;
      };
    };

    const labeled = await call('rdlc_apply_commands', {
      sessionId,
      commands: [{ cmd: 'setRunLabel', id: 'Title', p: 0, r: 0, label: 'OrderDate' }],
    });
    expect(labeled.isError).toBe(false);
    expect((await runOf()).label).toBe('OrderDate');

    // `null` la quita; el undo la recupera (journal de la sesión).
    expect(
      (
        await call('rdlc_apply_commands', {
          sessionId,
          commands: [{ cmd: 'setRunLabel', id: 'Title', p: 0, r: 0, label: null }],
        })
      ).isError,
    ).toBe(false);
    expect((await runOf()).label).toBeUndefined();
    expect((await call('rdlc_undo', { sessionId })).isError).toBe(false);
    expect((await runOf()).label).toBe('OrderDate');

    // Guardado: la etiqueta va antes del Value (orden del XSD, valida al guardar).
    expect((await call('rdlc_save', { sessionId })).isError).toBe(false);
    expect(await readFile(path, 'utf8')).toContain(
      '<TextRun><Label>OrderDate</Label><Value>=Fields!No.Value</Value></TextRun>',
    );
  });

  it('un comando mal formado no aplica nada', async () => {
    const { sessionId } = await createBlank();
    const result = await call('rdlc_apply_commands', {
      sessionId,
      commands: [textbox('A', 'one'), { cmd: 'setText', id: 'A' }],
    });
    expect(result.isError).toBe(true);
    expect(result['code']).toBe('E_INVALID_COMMAND');
    expect(result['failedIndex']).toBe(1);
    const outline = await call('rdlc_get_outline', { sessionId });
    expect(outline['text']).not.toContain('"A"');
  });

  it('en modo atómico un comando rechazado deshace los ya aplicados', async () => {
    const { sessionId } = await createBlank();
    const result = await call('rdlc_apply_commands', {
      sessionId,
      commands: [textbox('A', 'one'), { cmd: 'deleteItem', id: 'NoExiste' }],
    });
    expect(result.isError).toBe(true);
    expect(result['failedIndex']).toBe(1);
    expect(result['appliedBeforeFailure']).toBe(1);
    expect(result['rolledBack']).toBe(true);

    const outline = await call('rdlc_get_outline', { sessionId });
    expect(outline['text']).not.toContain('"A"');
  });

  it('con atomic:false conserva lo aplicado antes del fallo', async () => {
    const { sessionId } = await createBlank();
    const result = await call('rdlc_apply_commands', {
      sessionId,
      atomic: false,
      commands: [textbox('A', 'one'), { cmd: 'deleteItem', id: 'NoExiste' }],
    });
    expect(result.isError).toBe(true);
    expect(result['rolledBack']).toBeUndefined();
    const outline = await call('rdlc_get_outline', { sessionId });
    expect(outline['text']).toContain('"A"');
  });

  it('undo y redo operan sobre el journal de la sesión', async () => {
    const { sessionId } = await createBlank();
    await call('rdlc_apply_commands', { sessionId, commands: [textbox('A', 'one')] });

    expect((await call('rdlc_undo', { sessionId })).isError).toBe(false);
    expect((await call('rdlc_get_outline', { sessionId }))['text']).not.toContain('"A"');
    expect((await call('rdlc_redo', { sessionId })).isError).toBe(false);
    expect((await call('rdlc_get_outline', { sessionId }))['text']).toContain('"A"');
  });

  it('undo/redo sin historial avisan de que no cambiaron nada', async () => {
    const { sessionId } = await createBlank();
    expect((await call('rdlc_undo', { sessionId }))['changed']).toBe(false);
    expect((await call('rdlc_redo', { sessionId }))['changed']).toBe(false);

    await call('rdlc_apply_commands', { sessionId, commands: [textbox('A', 'one')] });
    expect((await call('rdlc_undo', { sessionId }))['changed']).toBe(true);
    expect((await call('rdlc_redo', { sessionId }))['changed']).toBe(true);
  });

  it('el outline marca lo que recorta y fullText lo da entero', async () => {
    const { sessionId } = await createBlank();
    const long = `=IIF(Fields!Carrier.Value = "", "none", ${'Fields!X.Value & '.repeat(12)}"end")`;
    await call('rdlc_apply_commands', { sessionId, commands: [textbox('Long', long)] });

    const short = String((await call('rdlc_get_outline', { sessionId }))['text']);
    expect(short).toMatch(/…\[\+\d+ chars\]/);
    expect(short).toContain('rdlc_get_item');
    expect(short).not.toContain('"end")');

    const full = String((await call('rdlc_get_outline', { sessionId, fullText: true }))['text']);
    expect(full).toContain('"end")');
    expect(full).not.toMatch(/…\[\+/);

    // rdlc_get_item siempre trae el texto íntegro.
    const item = await call('rdlc_get_item', { sessionId, id: 'Long' });
    expect(JSON.stringify(item['item'])).toContain('\\"end\\")');
  });

  it('reabrir una sesión limpia relee el disco; con cambios sin guardar no pisa nada', async () => {
    const a = await createBlank('a.rdlc');
    const b = await createBlank('b.rdlc');
    await call('rdlc_apply_commands', {
      sessionId: b.sessionId,
      commands: [textbox('FromDisk', 'x')],
    });
    await call('rdlc_save', { sessionId: b.sessionId });

    // El .rdlc «se regenera» en disco por fuera (p. ej. tras compilar el AL).
    await copyFile(b.path, a.path);
    const refreshed = await call('rdlc_open', { path: a.path });
    expect(refreshed['sessionId']).toBe(a.sessionId);
    expect(refreshed['refreshedFromDisk']).toBe(true);
    const outline = String((await call('rdlc_get_outline', { sessionId: a.sessionId }))['text']);
    expect(outline).toContain('"FromDisk"');

    // Con ediciones sin guardar, no se relee: se avisa.
    await call('rdlc_apply_commands', { sessionId: a.sessionId, commands: [textbox('Mine', 'y')] });
    const kept = await call('rdlc_open', { path: a.path });
    expect(kept['refreshedFromDisk']).toBe(false);
    expect(kept['unsavedChanges']).toBe(true);
    const after = String((await call('rdlc_get_outline', { sessionId: a.sessionId }))['text']);
    expect(after).toContain('"Mine"');
  });

  it('cerrar con cambios pide guardar o forzar', async () => {
    const { sessionId } = await createBlank();
    await call('rdlc_apply_commands', { sessionId, commands: [textbox('A', 'one')] });

    const refused = await call('rdlc_close', { sessionId });
    expect(refused.isError).toBe(true);
    expect(refused['code']).toBe('E_DIRTY');
    expect((await call('rdlc_close', { sessionId, force: true })).isError).toBe(false);
    expect((await call('rdlc_list_sessions'))['sessions']).toEqual([]);
  });

  it('abrir dos veces el mismo fichero devuelve la misma sesión', async () => {
    const path = await writeFixture(tmp, 'BTCLoadingOrder.rdlc');
    const first = await call('rdlc_open', { path });
    const second = await call('rdlc_open', { path });
    expect(second['alreadyOpen']).toBe(true);
    expect(second['sessionId']).toBe(first['sessionId']);
  });

  it('abre un informe real y resume su estructura', async () => {
    const path = await writeFixture(tmp, 'BTCLoadingOrder.rdlc');
    const opened = await call('rdlc_open', { path });
    expect(opened.isError).toBe(false);
    const report = opened['report'] as {
      fields: unknown[];
      regions: { body: { items: Record<string, number> } };
    };
    expect(report.fields.length).toBeGreaterThan(0);
    expect(Object.values(report.regions.body.items).reduce((a, b) => a + b, 0)).toBeGreaterThan(0);

    const outline = await call('rdlc_get_outline', {
      sessionId: opened['sessionId'],
      maxLines: 30,
    });
    // maxLines acota las líneas de contenido; los avisos finales empiezan por «…».
    const content = String(outline['text'])
      .split('\n')
      .filter((line) => !line.startsWith('…'));
    expect(content.length).toBeLessThanOrEqual(30);
  });

  it('rdlc_list_commands da firmas y esquemas exactos', async () => {
    const index = await call('rdlc_list_commands');
    expect(index['commands']).toEqual(
      expect.arrayContaining(['setText(id, p, r, value)', 'setRunLabel(id, p, r, label)']),
    );

    const detail = await call('rdlc_list_commands', { names: ['setText'] });
    const [schema] = detail['schemas'] as { properties: Record<string, unknown> }[];
    expect(Object.keys(schema?.properties ?? {})).toEqual(
      expect.arrayContaining(['cmd', 'id', 'p', 'r', 'value']),
    );

    const labelDetail = await call('rdlc_list_commands', { names: ['setRunLabel'] });
    const [labelSchema] = labelDetail['schemas'] as { properties: Record<string, unknown> }[];
    expect(Object.keys(labelSchema?.properties ?? {})).toEqual(
      expect.arrayContaining(['cmd', 'id', 'p', 'r', 'label']),
    );

    expect((await call('rdlc_list_commands', { names: ['nope'] })).isError).toBe(true);
  });

  it('rechaza rutas que no son .rdlc/.rdl y no pisa ficheros existentes', async () => {
    expect((await call('rdlc_create', { path: join(tmp, 'x.txt') }))['code']).toBe(
      'E_INVALID_PATH',
    );

    const path = join(tmp, 'exists.rdlc');
    await writeFile(path, 'keep me');
    const refused = await call('rdlc_create', { path });
    expect(refused.isError).toBe(true);
    expect(await readFile(path, 'utf8')).toBe('keep me');
  });
});
