// Empaqueta el servidor MCP de `apps/back/src/mcp` como paquete npm:
//   dist/server.mjs               bundle (código del monorepo + contratos)
//   resources/rdl2016/*.xsd       esquema oficial, junto al bundle
// Las dependencias de terceros NO se incluyen: npm las instala (`dependencies`),
// así `libxml2-wasm` carga su .wasm desde `node_modules` sin trucos.
import { cp, mkdir, readFile, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const back = join(root, '../../apps/back');
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));

await rm(join(root, 'dist'), { recursive: true, force: true });
await rm(join(root, 'resources'), { recursive: true, force: true });

await build({
  entryPoints: [join(back, 'src/mcp/server.ts')],
  outfile: join(root, 'dist/server.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  // El tsconfig del back activa los decoradores que usan los servicios.
  tsconfig: join(back, 'tsconfig.json'),
  external: Object.keys(pkg.dependencies),
  define: { __RDLC_MCP_VERSION__: JSON.stringify(pkg.version) },
  banner: { js: '#!/usr/bin/env node' },
  logLevel: 'info',
});

await mkdir(join(root, 'resources'), { recursive: true });
await cp(join(back, 'resources/rdl2016'), join(root, 'resources/rdl2016'), { recursive: true });
