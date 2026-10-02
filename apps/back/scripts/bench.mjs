/**
 * Runner del benchmark de lienzo (T3) sobre el **build de producción**.
 *
 *   pnpm --filter @rdlc-designer/back bench          # 972 textboxes ×3 pasadas
 *   node scripts/bench.mjs 5000 5                    # otro tamaño / pasadas
 *
 * Lanza Electron con `RDLC_BENCH` (la app carga `?bench=N` en el renderer),
 * repite la medición N veces (el "Repetir" de la página) y saca la **mediana**
 * de los fps p50, además del diagnóstico de nodos visibles/ocultos.
 */
import { _electron as electron } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const count = Number.parseInt(process.argv[2] ?? '972', 10);
const runs = Number.parseInt(process.argv[3] ?? '3', 10);
const here = fileURLToPath(new URL('.', import.meta.url));
const mainEntry = join(here, '..', 'out', 'main', 'main.js');
const workspace = join(tmpdir(), `rdlc-bench-${Date.now()}`);
mkdirSync(workspace, { recursive: true });

const app = await electron.launch({
  args: [mainEntry, `--user-data-dir=${join(workspace, 'user-data')}`],
  env: { ...process.env, RDLC_BENCH: String(count) },
});

try {
  const page = await app.firstWindow();
  page.on('console', (message) => {
    if (message.type() === 'error') console.error('[renderer]', message.text());
  });

  const results = [];
  let debug = null;
  for (let run = 0; run < runs; run += 1) {
    if (run > 0) {
      await page.evaluate(() => {
        delete (/** @type {any} */ (window).__benchResult);
        /** @type {any} */ (window).__benchRestart();
      });
    }
    const handle = await page.waitForFunction(
      () => /** @type {any} */ (window).__benchResult ?? null,
      null,
      { timeout: 180_000 },
    );
    results.push(await handle.jsonValue());
    debug = await page.evaluate(() => /** @type {any} */ (window).__benchDebug ?? null);
  }

  const p50 = results.map((result) => result.fpsP50).sort((a, b) => a - b);
  const median = p50[Math.floor(p50.length / 2)];
  console.log(JSON.stringify({ count, runs: results, medianFpsP50: median, debug }, null, 2));
} finally {
  await app.close().catch(() => undefined);
}
