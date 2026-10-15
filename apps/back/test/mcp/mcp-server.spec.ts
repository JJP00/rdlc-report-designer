import { readFile, writeFile } from 'node:fs/promises';
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
    expect(String(outline['text']).split('\n').length).toBeLessThanOrEqual(31);
  });

  it('rdlc_list_commands da firmas y esquemas exactos', async () => {
    const index = await call('rdlc_list_commands');
    expect(index['commands']).toEqual(expect.arrayContaining(['setText(id, p, r, value)']));

    const detail = await call('rdlc_list_commands', { names: ['setText'] });
    const [schema] = detail['schemas'] as { properties: Record<string, unknown> }[];
    expect(Object.keys(schema?.properties ?? {})).toEqual(
      expect.arrayContaining(['cmd', 'id', 'p', 'r', 'value']),
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
