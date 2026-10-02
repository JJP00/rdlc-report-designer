import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import { copyFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * T2 — endurecimiento del renderer: sin ventanas nuevas, sin navegación fuera
 * de la app, `webview` bloqueado y sandbox activo. Se abre una copia temporal
 * del corpus (la app con documento publica la proyección).
 */

const here = fileURLToPath(new URL('.', import.meta.url));
const mainEntry = join(here, '..', 'out', 'main', 'main.js');
const fixture = join(here, '..', '..', '..', 'fixtures', 'corpus', 'SalesCreditMemoESP.rdlc');

let app: ElectronApplication;
let page: Page;

test.beforeAll(async () => {
  const workspace = join(tmpdir(), `rdlc-e2e-security-${Date.now()}`);
  mkdirSync(workspace, { recursive: true });
  const file = join(workspace, 'SalesCreditMemoESP.rdlc');
  copyFileSync(fixture, file);

  app = await electron.launch({
    args: [mainEntry, file, `--user-data-dir=${join(workspace, 'user-data')}`],
  });
  page = await app.firstWindow();
  await page.waitForFunction(() =>
    Boolean((window as never as Record<string, unknown>)['__rdlcProjection']),
  );
});

test.afterAll(async () => {
  await app?.close().catch(() => undefined);
});

test('el renderer corre en sandbox con aislamiento de contexto', async () => {
  const prefs = await app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    return window?.webContents.getLastWebPreferences() ?? null;
  });

  expect(prefs?.sandbox).toBe(true);
  expect(prefs?.contextIsolation).toBe(true);
  expect(prefs?.nodeIntegration).toBe(false);
});

test('bloquea las ventanas nuevas', async () => {
  await page.evaluate(() => {
    window.open('https://example.com/', '_blank');
  });

  const windowAppeared = await app
    .waitForEvent('window', { timeout: 1500 })
    .then(() => true)
    .catch(() => false);
  expect(windowAppeared).toBe(false);
});

test('bloquea la navegación fuera de la app', async () => {
  const before = page.url();

  await page.evaluate(() => {
    window.location.href = 'https://example.com/';
  });
  await new Promise((resolve) => setTimeout(resolve, 800));

  expect(page.url()).toBe(before);
  // El error del renderer sigue vivo: la app no se ha descargado.
  const projection = await page.evaluate(() =>
    Boolean((window as never as Record<string, unknown>)['__rdlcProjection']),
  );
  expect(projection).toBe(true);
});
