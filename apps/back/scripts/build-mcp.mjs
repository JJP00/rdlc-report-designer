// Empaqueta el servidor MCP (stdio) en `out/mcp/server.mjs`.
// Solo se incluye el código del monorepo (`@rdlc-designer/contracts` es TS sin
// compilar); el resto de dependencias se resuelven desde `node_modules`.
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const external = Object.keys(pkg.dependencies).filter(
  (name) => name !== '@rdlc-designer/contracts',
);

await build({
  entryPoints: ['src/mcp/server.ts'],
  outfile: 'out/mcp/server.mjs',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: true,
  external,
  logLevel: 'info',
});
