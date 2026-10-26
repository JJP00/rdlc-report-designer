/**
 * Medición de memoria por proceso sobre el **build de producción**.
 *
 *   pnpm --filter @rdlc-designer/back build
 *   node scripts/measure-memory.mjs                                  # todo, 1 pasada
 *   node scripts/measure-memory.mjs --variants baseline,disable-gpu  # solo esas flags
 *   node scripts/measure-memory.mjs --scenarios idle,report --runs 3
 *   node scripts/measure-memory.mjs --label tras-pixelratio --out medidas.json
 *
 * Cada combinación variante × escenario lanza Electron con un `--user-data-dir`
 * propio (no choca con una instancia abierta) y lee `app.getAppMetrics()`:
 * `privateBytes` es la memoria propia de cada proceso (Browser = main, GPU,
 * Tab = renderer, Utility = red). `report-max` es `report` con la ventana
 * maximizada. El escenario `bench` mide además los fps del
 * drag (mismo benchmark que `scripts/bench.mjs`).
 */
import { _electron as electron } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Variantes de Chromium: cada una es una lista de flags añadidas a la línea de comandos. */
const VARIANTS = {
  baseline: [],
  'disable-gpu': ['--disable-gpu'],
  'disable-gpu-compositing': ['--disable-gpu-compositing'],
  'disable-gpu-rasterization': ['--disable-gpu-rasterization'],
  'in-process-gpu': ['--in-process-gpu'],
  // Escalado de Windows (laptops 125–200 %): el canvas cuesta × dpr².
  'dpr1.5': ['--force-device-scale-factor=1.5'],
  'dpr2': ['--force-device-scale-factor=2'],
  'dpr1.5-nogpu': ['--force-device-scale-factor=1.5', '--disable-gpu'],
  'dpr2-nogpu': ['--force-device-scale-factor=2', '--disable-gpu'],
  'gpu-on': [],
  'gpu-soft-compositing': ['--disable-gpu-compositing'],
  'gpu-soft-raster': ['--disable-gpu-rasterization'],
  'no-heap-cap': [],
  'gpu-on-no-heap-cap': [],
};

/** Variantes que se activan por variable de entorno de la app (no por flag). */
const VARIANT_ENV = {
  'gpu-on': { RDLC_ENABLE_GPU: '1' },
  'gpu-soft-compositing': { RDLC_ENABLE_GPU: '1' },
  'gpu-soft-raster': { RDLC_ENABLE_GPU: '1' },
  'no-heap-cap': { RDLC_NO_HEAP_CAP: '1' },
  'gpu-on-no-heap-cap': { RDLC_ENABLE_GPU: '1', RDLC_NO_HEAP_CAP: '1' },
};

const SCENARIOS = ['idle', 'report', 'editor', 'editor-switch', 'editor-switch-max', 'report-max', 'bench', 'bench-max'];

const here = fileURLToPath(new URL('.', import.meta.url));
const mainEntry = join(here, '..', 'out', 'main', 'main.js');
const fixture = resolve(here, '..', '..', '..', 'fixtures', 'corpus', 'SalesShipment.rdlc');

function option(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? (process.argv[index + 1] ?? fallback) : fallback;
}

const variants = option('variants', Object.keys(VARIANTS)).toString().split(',');
const scenarios = option('scenarios', SCENARIOS.join(',')).toString().split(',');
const runs = Number.parseInt(option('runs', '1'), 10);
const benchItems = option('items', '972');
const label = option('label', 'medida');
const outFile = option('out', '');
const settleMs = Number.parseInt(option('settle', '4000'), 10);

const TYPE_NAMES = { Browser: 'main', GPU: 'gpu', Tab: 'renderer', Utility: 'utility' };

function summarizeMetrics(metrics) {
  const byType = { main: 0, gpu: 0, renderer: 0, utility: 0, other: 0 };
  for (const metric of metrics) {
    const key = TYPE_NAMES[metric.type] ?? 'other';
    byType[key] += (metric.memory.privateBytes ?? metric.memory.workingSetSize) / 1024;
  }
  const total = Object.values(byType).reduce((sum, value) => sum + value, 0);
  const rounded = Object.fromEntries(
    Object.entries(byType).map(([key, value]) => [key, Math.round(value)]),
  );
  return { ...rounded, total: Math.round(total) };
}

async function measure(variant, scenario) {
  const workspace = join(tmpdir(), `rdlc-mem-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
  mkdirSync(workspace, { recursive: true });

  const env = { ...process.env };
  // Con `ELECTRON_RUN_AS_NODE` (p. ej. heredado de un terminal de VS Code)
  // Electron arranca como Node y no abre ventana.
  delete env['ELECTRON_RUN_AS_NODE'];
  delete env['RDLC_OPEN'];
  delete env['RDLC_BENCH'];
  if (scenario.startsWith('report') || scenario.startsWith('editor')) env['RDLC_OPEN'] = fixture;
  Object.assign(env, VARIANT_ENV[variant] ?? {});
  if (scenario.startsWith('bench')) env['RDLC_BENCH'] = benchItems;

  const app = await electron.launch({
    args: [mainEntry, `--user-data-dir=${join(workspace, 'user-data')}`, ...VARIANTS[variant]],
    env,
  });

  try {
    const page = await app.firstWindow();
    page.on('pageerror', (error) => console.error('[pageerror]', error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') console.error('[renderer]', message.text());
    });
    await page.waitForLoadState('load');

    let fps = null;
    let openMs = null;
    let switchMs = null;
    let frameInfo = null;
    if (scenario.startsWith('editor')) {
      // Abre un editor de expresión (Monaco, carga diferida) como el usuario:
      // paleta Ctrl+K → Textbox37 → panel con el editor → desplegable de sugerencias.
      await page.waitForSelector('canvas', { timeout: 30_000 });
      if (scenario.endsWith('-max')) {
        await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.maximize());
        await page.waitForTimeout(1500);
      }
      await page.waitForTimeout(1000);
      await page.keyboard.press('Control+k');
      await page.locator('[cmdk-input]').fill('Textbox37');
      await page.waitForTimeout(300);
      await page.locator('[cmdk-item]', { hasText: /Textbox37/ }).first().click();
      const started = Date.now();
      const editor = page.locator('.monaco-editor').first();
      await editor.waitFor({ state: 'visible', timeout: 30_000 });
      openMs = Date.now() - started;
      await editor.click();
      await page.keyboard.press('Control+Space');
      await page.locator('.suggest-widget.visible').first().waitFor({ timeout: 10_000 });

      if (scenario.startsWith('editor-switch')) {
        // Con Monaco ya cargado: cada apertura del diálogo «editor de texto» monta
        // editores nuevos. Se mide hasta que el del diálogo pinta su texto.
        const times = [];
        const worstFrames = [];
        let slowFrames = 0;
        let allFrames = 0;
        for (let round = 0; round < 6; round += 1) {
          await page.evaluate(() => document.activeElement?.blur?.());
          await page.waitForTimeout(400);
          await page.evaluate(() => {
            window.__frames = [];
            let last = performance.now();
            const tick = (now) => {
              window.__frames.push(now - last);
              last = now;
              if (window.__recording) requestAnimationFrame(tick);
            };
            window.__recording = true;
            requestAnimationFrame(tick);
          });
          const clicked = Date.now();
          await page.getByRole('button', { name: 'Abrir editor de texto' }).click();
          await page.waitForFunction(
            () => document.querySelector('[role="dialog"] .monaco-editor .view-line span'),
            null,
            { timeout: 15_000 },
          );
          const elapsed = Date.now() - clicked;
          await page.waitForTimeout(500); // acaba la animación del diálogo
          const frames = await page.evaluate(() => {
            window.__recording = false;
            return window.__frames;
          });
          if (round > 0) {
            times.push(elapsed); // la 1.ª ronda calienta
            worstFrames.push(Math.round(Math.max(...frames)));
            slowFrames += frames.filter((frame) => frame > 33).length;
            allFrames += frames.length;
          }
          await page.keyboard.press('Escape');
          await page.waitForSelector('[role="dialog"]', { state: 'detached', timeout: 5_000 });
        }
        times.sort((x, y) => x - y);
        switchMs = times[Math.floor(times.length / 2)];
        worstFrames.sort((x, y) => x - y);
        frameInfo = `worst frame ${worstFrames[Math.floor(worstFrames.length / 2)]}ms, ${slowFrames}/${allFrames} frames >33ms`;
      }
    } else if (scenario.startsWith('report')) {
      await page.waitForSelector('canvas', { timeout: 30_000 });
      if (scenario === 'report-max') {
        // Ventana maximizada (el uso real en un monitor grande): el stage y sus
        // canvas crecen con la ventana.
        await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.maximize());
        await page.waitForTimeout(1500);
      }
    } else if (scenario.startsWith('bench')) {
      if (scenario === 'bench-max') {
        // Maximiza y relanza la medición: el benchmark arranca solo al cargar.
        await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.maximize());
        await page.waitForTimeout(1500);
        await page.evaluate(() => {
          delete window.__benchResult;
          window.__benchRestart();
        });
      }
      const handle = await page.waitForFunction(() => window.__benchResult ?? null, null, {
        timeout: 180_000,
      });
      fps = (await handle.jsonValue()).fpsP50;
    }
    await page.waitForTimeout(settleMs);

    const metrics = await app.evaluate(({ app: electronApp }) => electronApp.getAppMetrics());
    const mainHeap = await app.evaluate(() => {
      const stats = process.getHeapStatistics();
      return { limitMB: Math.round(stats.heapSizeLimit / 1024), usedMB: Math.round(stats.totalHeapSize / 1024) };
    });
    const view = await page.evaluate(() => ({
      rendererHeapLimitMB: Math.round(performance.memory.jsHeapSizeLimit / 1048576),
      rendererHeapUsedMB: Math.round(performance.memory.usedJSHeapSize / 1048576),
      dpr: window.devicePixelRatio,
      width: window.innerWidth,
      height: window.innerHeight,
      canvases: document.querySelectorAll('canvas').length,
      // Σ ancho × alto × 4 bytes de los canvas del DOM (capas de Konva).
      canvasMB: Math.round(
        ([...document.querySelectorAll('canvas')].reduce(
          (sum, canvas) => sum + canvas.width * canvas.height * 4,
          0,
        ) /
          1048576) *
          10,
      ) / 10,
    }));
    return {
      variant,
      scenario,
      ...summarizeMetrics(metrics),
      fps,
      openMs,
      switchMs,
      frameInfo,
      mainHeapLimitMB: mainHeap.limitMB,
      mainHeapMB: mainHeap.usedMB,
      ...view,
    };
  } finally {
    await app.close().catch(() => undefined);
  }
}

const rows = [];
for (const variant of variants) {
  for (const scenario of scenarios) {
    for (let run = 0; run < runs; run += 1) {
      const row = await measure(variant, scenario);
      rows.push(row);
      console.error(
        `${variant.padEnd(26)} ${scenario.padEnd(7)} total ${String(row.total).padStart(4)} MB ` +
          `(gpu ${row.gpu}, renderer ${row.renderer}, main ${row.main}, util ${row.utility})` +
          `${row.fps === null ? '' : ` fps ${row.fps}`}${row.openMs === null ? '' : ` open ${row.openMs}ms`}${row.switchMs === null || row.switchMs === undefined ? '' : ` switch(median) ${row.switchMs}ms [${row.frameInfo}]`} heap limit r/m ${row.rendererHeapLimitMB}/${row.mainHeapLimitMB} used r/m ${row.rendererHeapUsedMB}/${row.mainHeapMB} canvases ${row.canvases} dpr ${row.dpr}`,
      );
    }
  }
}

const result = { label, date: new Date().toISOString(), runs, fixture, rows };
if (outFile) writeFileSync(outFile, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
