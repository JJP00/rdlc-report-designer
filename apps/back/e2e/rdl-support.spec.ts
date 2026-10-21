import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { appEnv } from './launch.js';

/**
 * Soporte `.rdl`: los RDL 2016 comparten el esquema 2016/01 con los RDLC
 * (misma edición y round-trip byte a byte) y los RDL anteriores se rechazan
 * al abrir con un motivo accionable.
 */

const here = fileURLToPath(new URL('.', import.meta.url));
const mainEntry = join(here, '..', 'out', 'main', 'main.js');
const fixture = join(here, '..', '..', '..', 'fixtures', 'corpus', 'PalletOutput.rdlc');

/** Cierra la app descartando cualquier guarda (como los demás specs). */
async function closeApp(app: ElectronApplication, page: Page): Promise<void> {
  if (!app) return;
  const closing = app.close().catch(() => undefined);
  await page
    .getByTestId('unsaved-changes-dialog')
    .getByRole('button', { name: 'Salir sin guardar' })
    .click({ timeout: 5000 })
    .catch(() => undefined);
  await closing;
}

test.describe('RDL 2016 (.rdl)', () => {
  let app: ElectronApplication;
  let page: Page;
  let file: string;
  let original: Buffer;

  test.beforeAll(async () => {
    const workspace = join(tmpdir(), `rdlc-e2e-rdl-${Date.now()}`);
    mkdirSync(workspace, { recursive: true });
    file = join(workspace, 'Informe.rdl');
    copyFileSync(fixture, file);
    original = readFileSync(file);

    app = await electron.launch({
      args: [mainEntry, file, `--user-data-dir=${join(workspace, 'user-data')}`],
      env: appEnv(),
    });
    page = await app.firstWindow();
    await page.waitForFunction(() =>
      Boolean((window as never as Record<string, unknown>)['__rdlcProjection']),
    );
  });

  test.afterAll(async () => {
    await closeApp(app, page);
  });

  test('abre el .rdl con contenido y lo guarda byte a byte', async () => {
    const projection = await page.evaluate(
      () =>
        (window as never as Record<string, unknown>)['__rdlcProjection'] as {
          reportName: string;
          page: { body: { items: unknown[] } };
        },
    );
    expect(projection.reportName).toBe('Informe');
    expect(projection.page.body.items.length).toBeGreaterThan(0);

    await page.keyboard.press('Control+s');
    await expect
      .poll(async () => (await page.locator('footer').first().innerText()).replace(/\s+/g, ' '))
      .toContain('Guardado');
    expect(readFileSync(file).equals(original)).toBe(true);
  });
});

test.describe('RDL anterior a 2016', () => {
  let app: ElectronApplication;
  let page: Page;

  test.beforeAll(async () => {
    const workspace = join(tmpdir(), `rdlc-e2e-rdl-old-${Date.now()}`);
    mkdirSync(workspace, { recursive: true });
    const file = join(workspace, 'Viejo.rdl');
    writeFileSync(
      file,
      '<?xml version="1.0" encoding="utf-8"?>\r\n' +
        '<Report xmlns="http://schemas.microsoft.com/sqlserver/reporting/2008/01/reportdefinition">' +
        '<Body><ReportItems /></Body></Report>',
      'utf8',
    );

    app = await electron.launch({
      args: [mainEntry, file, `--user-data-dir=${join(workspace, 'user-data')}`],
      env: appEnv(),
    });
    page = await app.firstWindow();
  });

  test.afterAll(async () => {
    await closeApp(app, page);
  });

  test('se rechaza con un motivo accionable y sin sesión', async () => {
    await expect(page.getByRole('alert')).toContainText('solo edita RDL/RDLC 2016/01');

    const projection = await page.evaluate(
      () => (window as never as Record<string, unknown>)['__rdlcProjection'] ?? null,
    );
    expect(projection).toBeNull();
  });
});
