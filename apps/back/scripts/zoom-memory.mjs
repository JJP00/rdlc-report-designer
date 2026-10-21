/**
 * Memoria del lienzo por nivel de zoom (canvas de Konva) sobre el **build de
 * producción**.
 *
 *   pnpm --filter @rdlc-designer/back build
 *   node apps/back/scripts/zoom-memory.mjs
 *
 * Abre el informe del corpus, fija el zoom con el menú de la toolbar y mide en
 * el renderer: nº de canvas, MB de *backing store* (`w × h × 4`), heap JS y el
 * working set del proceso del renderer (`app.getAppMetrics`). El coste del
 * lienzo son los canvas de Konva (memoria fuera del heap de JS), no los nodos.
 */
import { _electron as electron } from '@playwright/test';
import { copyFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const mainEntry = join(here, '..', 'out', 'main', 'main.js');
const fixture = join(here, '..', '..', '..', 'fixtures', 'corpus', 'SalesCreditMemoESP.rdlc');
const workspace = join(tmpdir(), `rdlc-zoom-${Date.now()}`);
mkdirSync(workspace, { recursive: true });
const file = join(workspace, 'SalesCreditMemoESP.rdlc');
copyFileSync(fixture, file);

/** Zooms a medir (etiquetas del menú de la toolbar en ES). */
const ZOOMS = ['50 %', '200 %', '300 %', '400 %'];

const app = await electron.launch({
  args: [mainEntry, file, `--user-data-dir=${join(workspace, 'user-data')}`],
  env: { ...process.env, RDLC_LOCALE: 'es' },
});

try {
  const page = await app.firstWindow();
  // Sin ganchos de QA en el build de producción: se espera al lienzo y a la
  // toolbar (el informe llega por argumento, como en los E2E).
  await page.waitForSelector('canvas', { timeout: 60_000 });
  await page.getByRole('button', { name: /^Zoom:/ }).waitFor({ timeout: 60_000 });

  const rows = [];
  for (const label of ZOOMS) {
    await page.getByRole('button', { name: /^Zoom:/ }).click();
    await page.getByRole('menuitem', { name: label, exact: true }).click();
    // Asentar el re-render del stage y el redibujado de las capas.
    await page.waitForTimeout(700);

    const measured = await page.evaluate(() => {
      const canvases = [...document.querySelectorAll('canvas')];
      const bytes = canvases.reduce((total, canvas) => total + canvas.width * canvas.height * 4, 0);
      const first = canvases[0];
      return {
        zoom: document.querySelector('[aria-label^="Zoom:"]')?.textContent ?? '?',
        canvases: canvases.length,
        // Tamaño del stage (el primer canvas de escena), en px de pantalla.
        stagePx: first ? `${first.style.width}×${first.style.height}` : '?',
        canvasMB: Math.round(bytes / 1024 / 1024),
        heapMB: Math.round(((performance.memory?.usedJSHeapSize ?? 0) / 1024 / 1024) * 10) / 10,
        dpr: window.devicePixelRatio,
      };
    });
    const rendererKB = (await app.evaluate(({ app: electronApp }) => electronApp.getAppMetrics()))
      .filter((metric) => metric.type === 'Tab' || metric.type === 'Renderer')
      .reduce((total, metric) => total + (metric.memory?.workingSetSize ?? 0), 0);

    rows.push({ label, ...measured, rendererMB: Math.round(rendererKB / 1024) });
  }

  console.log(JSON.stringify(rows, null, 2));
} finally {
  await app.close().catch(() => undefined);
}
