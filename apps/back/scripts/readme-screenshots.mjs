/**
 * Capturas del README sobre la app real (Playwright `_electron`), en inglés.
 *
 *   pnpm --filter @rdlc-designer/back build:e2e      # build con los hooks __rdlc*
 *   node apps/back/scripts/readme-screenshots.mjs docs/assets [escena,escena…]
 *
 * Cada escena lanza la app con **copias** del corpus (la app tiene watcher) y
 * guarda un PNG con el nombre que enlaza el README. La ruta temporal de los
 * informes se sustituye en el DOM por `C:\reports` antes de cada captura (no
 * publica el usuario de la máquina). Desde el terminal de VS Code hay que quitar
 * `ELECTRON_RUN_AS_NODE` (`env -u ELECTRON_RUN_AS_NODE node …`).
 */
import { _electron as electron } from '@playwright/test';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const mainEntry = join(here, '..', 'out', 'main', 'main.js');
const corpus = join(here, '..', '..', '..', 'fixtures', 'corpus');
const outDir = resolve(process.argv[2] ?? 'docs/assets');
const only = process.argv[3] ? process.argv[3].split(',') : null;
const W = 1440;
const H = 900;
const INVOICE = 'SalesInvoiceESP.rdlc';
const THREE_TABS = [INVOICE, 'SalesShipment.rdlc', 'BTCLoadingOrder.rdlc'];

/** Lanza la app con copias de `files` (la primera activa) a W×H. */
async function launch(files) {
  const workspace = join(tmpdir(), `rdlc-readme-${Date.now()}`);
  const reports = join(workspace, 'reports');
  mkdirSync(reports, { recursive: true });
  const paths = files.map((name) => {
    const target = join(reports, name);
    copyFileSync(join(corpus, name), target);
    return target;
  });
  const app = await electron.launch({
    args: [mainEntry, paths[0], `--user-data-dir=${join(workspace, 'user-data')}`],
    env: { ...process.env, RDLC_LOCALE: 'en' },
  });
  const page = await app.firstWindow();
  await app.evaluate(
    ({ BrowserWindow }, size) => {
      const win = BrowserWindow.getAllWindows()[0];
      win.unmaximize();
      win.setContentSize(size.w, size.h);
      win.center();
    },
    { w: W, h: H },
  );
  await page.waitForFunction(() => Boolean(window.__rdlcStage && window.__rdlcProjection));
  await page.waitForTimeout(1200);
  const ctx = { app, page, reports, paths };
  for (const extra of paths.slice(1)) await openViaToolbar(ctx, extra);
  if (paths.length > 1) {
    await page.getByTestId('tab-item').first().click();
    await page.waitForTimeout(800);
  }
  return ctx;
}

/** Abre una ruta en otra pestaña por Fichero → Abrir… (diálogo nativo sustituido). */
async function openViaToolbar(ctx, path) {
  await ctx.app.evaluate(({ dialog }, p) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [p] });
  }, path);
  await ctx.page.getByRole('button', { name: 'File' }).click();
  await ctx.page.getByRole('menuitem', { name: 'Open…' }).click();
  await ctx.page.waitForTimeout(1200);
}

/**
 * Cierra sin preguntar: con cambios sin guardar `app.close()` se queda esperando
 * al diálogo de la app; `app.exit()` de Electron sale sin pasar por él.
 */
async function close(ctx) {
  await ctx.app.evaluate(({ app }) => app.exit(0)).catch(() => undefined);
  await ctx.app.close().catch(() => undefined);
}

/** Rectángulo de pantalla de un nodo Konva por id. */
async function nodeRect(page, id) {
  return page.evaluate((nodeId) => {
    const stage = window.__rdlcStage;
    const node = stage.findOne((candidate) => candidate.id() === nodeId);
    if (!node) return null;
    const box = node.getClientRect({ relativeTo: stage });
    const container = stage.container().getBoundingClientRect();
    const zoom = stage.scaleX();
    return {
      x: container.left + stage.x() + box.x * zoom,
      y: container.top + stage.y() + box.y * zoom,
      width: box.width * zoom,
      height: box.height * zoom,
    };
  }, id);
}

async function clickItem(page, id, fx = 0.5) {
  const rect = await nodeRect(page, id);
  if (!rect) throw new Error(`no hay nodo ${id} en el lienzo`);
  await page.mouse.click(rect.x + rect.width * fx, rect.y + rect.height / 2);
  await page.waitForTimeout(250);
}

/** Selecciona un item por la paleta (Ctrl+K): lo trae a la vista aunque esté fuera. */
async function selectViaPalette(page, id) {
  await page.evaluate(() => document.activeElement?.blur?.());
  await page.keyboard.press('Control+k');
  await page.getByPlaceholder('Search an element, variable, or action…').fill(id);
  await page.waitForTimeout(300);
  await page
    .getByRole('option')
    .filter({ hasText: new RegExp(`^${id}(?!\\d)`) })
    .first()
    .click();
  await page.waitForTimeout(700);
}

async function togglePanel(page, name) {
  await page.getByRole('button', { name, exact: true }).click();
  await page.waitForTimeout(400);
}

async function setDarkTheme(page) {
  await page.getByRole('button', { name: 'Dark mode' }).click();
  await page.waitForTimeout(500);
}

/** Sustituye la ruta temporal de los informes por `C:\reports` en textos y tooltips. */
async function maskPaths(ctx) {
  await ctx.page.evaluate((prefix) => {
    const variants = [prefix, prefix.replace(/\\/g, '/')];
    const fix = (text) =>
      variants.reduce((acc, variant) => acc.split(variant).join('C:\\reports'), text);
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (variants.some((variant) => node.nodeValue.includes(variant))) {
        node.nodeValue = fix(node.nodeValue);
      }
    }
    for (const element of document.querySelectorAll('[title]')) {
      const title = element.getAttribute('title');
      if (variants.some((variant) => title.includes(variant))) {
        element.setAttribute('title', fix(title));
      }
    }
  }, ctx.reports);
}

async function shot(ctx, name, clip) {
  await maskPaths(ctx);
  await ctx.page.mouse.move(W - 2, H - 2);
  await ctx.page.waitForTimeout(150);
  await ctx.page.screenshot({ path: join(outDir, `${name}.png`), ...(clip ? { clip } : {}) });
}

/** Recorte que envuelve varias cajas con un margen, sin salirse de la ventana. */
function around(boxes, pad) {
  const x0 = Math.max(0, Math.min(...boxes.map((box) => box.x)) - pad);
  const y0 = Math.max(0, Math.min(...boxes.map((box) => box.y)) - pad);
  const x1 = Math.min(W, Math.max(...boxes.map((box) => box.x + box.width)) + pad);
  const y1 = Math.min(H, Math.max(...boxes.map((box) => box.y + box.height)) + pad);
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

async function dialogShot(ctx, name, pad = 16) {
  const box = await ctx.page.getByRole('dialog').boundingBox();
  await shot(ctx, name, around([box], pad));
}

const scenes = {
  async hero(ctx) {
    await togglePanel(ctx.page, 'Hierarchy');
    await clickItem(ctx.page, 'Textbox1', 0.3);
    await shot(ctx, 'screenshot-light');
    await setDarkTheme(ctx.page);
    await shot(ctx, 'screenshot-dark');
  },

  async palette(ctx) {
    const { page } = ctx;
    await clickItem(page, 'Textbox1', 0.3);
    await page.evaluate(() => document.activeElement?.blur?.());
    await page.keyboard.press('Control+k');
    await page.waitForTimeout(400);
    await page.getByPlaceholder('Search an element, variable, or action…').fill('line');
    await page.waitForTimeout(700);
    await dialogShot(ctx, 'palette', 24);
  },

  async panels(ctx) {
    const { page } = ctx;
    await togglePanel(page, 'Variables');
    await togglePanel(page, 'Hierarchy');
    await page.getByPlaceholder(/Search field, parameter/).fill('Total');
    await page.waitForTimeout(600);
    await clickItem(page, 'Textbox1', 0.3);
    await shot(ctx, 'panels', { x: 0, y: 115, width: 545, height: 640 });
  },

  async expression(ctx) {
    const { page } = ctx;
    // Tablix4 tiene la visibilidad por expresión: su botón es el último «editor».
    await selectViaPalette(page, 'Tablix4');
    await page.getByTitle('Expression editor (with line numbers)').last().click();
    await page.waitForTimeout(1500);
    await page.getByRole('dialog').locator('.monaco-editor .view-lines').first().click();
    await page.keyboard.press('Control+End');
    await page.keyboard.type(' OrElse Fields!BTCComp', { delay: 60 });
    await page.waitForTimeout(1200);
    await dialogShot(ctx, 'expression-editor');
  },

  async code(ctx) {
    const { page } = ctx;
    await page.getByRole('button', { name: 'Report…' }).click();
    await page.waitForTimeout(800);
    await page.getByRole('dialog').getByRole('tab', { name: 'Code' }).click();
    await page.waitForTimeout(1500);
    await dialogShot(ctx, 'report-code');
  },

  async problems(ctx) {
    await ctx.page.getByTitle('Show problems').click();
    await ctx.page.waitForTimeout(800);
    await shot(ctx, 'problems', { x: 0, y: 610, width: 945, height: H - 610 });
  },

  async conflict(ctx) {
    const { page } = ctx;
    // Un cambio sin guardar y el fichero tocado por fuera: la app pregunta qué versión quedarse.
    await clickItem(page, 'Textbox1', 0.3);
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(800);
    writeFileSync(ctx.paths[0], `${readFileSync(ctx.paths[0], 'utf8')}\n`);
    await page.waitForTimeout(2500);
    const box = await page.getByTestId('conflict-dialog').boundingBox();
    await shot(ctx, 'conflict', around([{ x: 12, y: 96, width: 1098, height: 10 }, box], 12));
  },
};

/** Informes de cada escena: las que enseñan pestañas abren tres. */
const files = { hero: THREE_TABS, conflict: THREE_TABS };

mkdirSync(outDir, { recursive: true });
let failed = false;
for (const [name, run] of Object.entries(scenes)) {
  if (only && !only.includes(name)) continue;
  const ctx = await launch(files[name] ?? [INVOICE]);
  try {
    await run(ctx);
    console.log(`ok   ${name}`);
  } catch (error) {
    failed = true;
    console.log(`FAIL ${name}: ${error.message.split('\n')[0]}`);
  } finally {
    await close(ctx);
  }
}
process.exit(failed ? 1 : 0);
