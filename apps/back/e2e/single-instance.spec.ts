import { appEnv } from './launch.js';
import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import electronPath from 'electron';
import { spawn } from 'node:child_process';
import { copyFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Asociación de ficheros: una **segunda instancia** (doble clic en el
 * Explorador con la app ya abierta) no abre otra ventana — el lock de instancia
 * única la cierra — pero su informe llega como pestaña a la ventana viva
 * (`second-instance` → `openRequested`).
 */

const here = fileURLToPath(new URL('.', import.meta.url));
const mainEntry = join(here, '..', 'out', 'main', 'main.js');
const corpus = join(here, '..', '..', '..', 'fixtures', 'corpus');

interface Ctx {
  app: ElectronApplication;
  page: Page;
  workspace: string;
  /** Informe del arranque por CLI. */
  file: string;
  /** Informe que traerá la 2.ª instancia. */
  secondFile: string;
}

/** Mismo `user-data-dir` → mismo lock de instancia única que la app viva. */
function userDataDir(workspace: string): string {
  return join(workspace, 'user-data');
}

async function launch(): Promise<Ctx> {
  const workspace = join(
    tmpdir(),
    `rdlc-e2e-single-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  );
  mkdirSync(workspace, { recursive: true });
  const file = join(workspace, 'PalletOutput.rdlc');
  copyFileSync(join(corpus, 'PalletOutput.rdlc'), file);
  const secondFile = join(workspace, 'Segundo.rdlc');
  copyFileSync(join(corpus, 'SalesCreditMemoESP.rdlc'), secondFile);

  const app = await electron.launch({
    args: [mainEntry, file, `--user-data-dir=${userDataDir(workspace)}`],
    env: appEnv(),
  });
  const page = await app.firstWindow();
  await page.waitForFunction(() =>
    Boolean((window as never as Record<string, unknown>)['__rdlcProjection']),
  );
  return { app, page, workspace, file, secondFile };
}

/** Lanza una 2.ª instancia con un informe y espera a que el lock la cierre. */
async function spawnSecondInstance(ctx: Ctx, file: string): Promise<void> {
  const child = spawn(
    electronPath,
    [mainEntry, file, `--user-data-dir=${userDataDir(ctx.workspace)}`],
    { env: appEnv(), stdio: 'ignore' },
  );
  await new Promise<void>((resolve, reject) => {
    child.once('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`la 2.ª instancia salió con código ${code}`));
    });
    child.once('error', reject);
  });
}

async function shutdown(ctx: Ctx | undefined): Promise<void> {
  if (!ctx) return;
  // El cierre pide confirmación si el test dejó cambios: se descartan.
  const closing = ctx.app.close().catch(() => undefined);
  await ctx.page
    .getByTestId('unsaved-changes-dialog')
    .getByRole('button', { name: 'Salir sin guardar' })
    .click({ timeout: 5000 })
    .catch(() => undefined);
  await closing;
}

test.describe('instancia única · apertura desde el Explorador', () => {
  let ctx: Ctx | undefined;
  test.beforeAll(async () => {
    ctx = await launch();
  });
  test.afterAll(async () => {
    await shutdown(ctx);
  });

  test('con la app abierta, la 2.ª instancia trae su informe como pestaña', async () => {
    const { page, secondFile } = ctx!;
    const tabs = page.getByTestId('tab-item');
    await expect(tabs).toHaveCount(1);

    await spawnSecondInstance(ctx!, secondFile);

    await expect(tabs).toHaveCount(2);
    await expect(tabs.nth(1)).toContainText('Segundo.rdlc');
    // La recién abierta se activa; solo hay una ventana (no hay proceso nuevo).
    await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
    expect(await ctx!.app.windows()).toHaveLength(1);
  });

  test('repetir el doble clic re-activa la pestaña, sin duplicarla', async () => {
    const { page, secondFile } = ctx!;
    await spawnSecondInstance(ctx!, secondFile);
    await expect(page.getByTestId('tab-item')).toHaveCount(2);
  });
});
