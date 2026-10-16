// Smoke del paquete tal y como lo recibiría un usuario: `npm pack`, instalar el
// tarball en un directorio limpio y hablar con su binario por stdio.
//   pnpm --filter @jjp00/rdlc-designer-mcp build && pnpm --filter @jjp00/rdlc-designer-mcp smoke
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const work = mkdtempSync(join(tmpdir(), 'rdlc-mcp-smoke-'));
const shell = process.platform === 'win32';
const run = (cmd, args, cwd) =>
  execFileSync(cmd, args, { cwd, encoding: 'utf8', shell, stdio: ['ignore', 'pipe', 'inherit'] });

try {
  const tarball = run('npm', ['pack', '--pack-destination', work, '--silent'], root)
    .trim()
    .split('\n')
    .pop();
  console.log(`packed ${tarball}`);

  const consumer = join(work, 'consumer');
  mkdirSync(consumer);
  writeFileSync(
    join(consumer, 'package.json'),
    '{"name":"consumer","private":true,"type":"module"}',
  );
  run('npm', ['install', '--no-audit', '--no-fund', '--silent', join(work, tarball)], consumer);

  // El cliente MCP sale de la propia instalación (el SDK ya es dependencia del paquete).
  const sdk = join(consumer, 'node_modules/@modelcontextprotocol/sdk');
  const load = (file) => import(pathToFileURL(join(sdk, 'dist/esm', file)).href);
  const { Client } = await load('client/index.js');
  const { StdioClientTransport } = await load('client/stdio.js');

  const bin = join(consumer, 'node_modules/@jjp00/rdlc-designer-mcp/dist/server.mjs');
  const client = new Client({ name: 'smoke', version: '0' });
  await client.connect(
    new StdioClientTransport({ command: process.execPath, args: [bin], stderr: 'ignore' }),
  );
  const call = async (name, args) =>
    JSON.parse((await client.callTool({ name, arguments: args })).content[0].text);

  const tools = (await client.listTools()).tools.length;
  const file = join(work, 'smoke.rdlc');
  const created = await call('rdlc_create', { path: file });
  const applied = await call('rdlc_apply_commands', {
    sessionId: created.sessionId,
    commands: [
      {
        cmd: 'insertItem',
        scope: { kind: 'body' },
        index: 0,
        item: {
          kind: 'textbox',
          name: 'Hello',
          top: { value: 1, unit: 'cm' },
          left: { value: 1, unit: 'cm' },
          width: { value: 4, unit: 'cm' },
          height: { value: 1, unit: 'cm' },
          text: 'Hi',
        },
      },
    ],
  });
  const saved = await call('rdlc_save', { sessionId: created.sessionId }); // valida contra el XSD empaquetado
  await client.close();

  const ok = tools === 14 && created.ok && applied.ok && saved.ok;
  console.log(JSON.stringify({ tools, create: created.ok, apply: applied.ok, save: saved.ok }));
  if (!ok) throw new Error('smoke FAILED');
  console.log('smoke OK');
} finally {
  rmSync(work, { recursive: true, force: true });
}
