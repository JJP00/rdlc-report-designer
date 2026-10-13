import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import { copyFileSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Resiliencia del ciclo de vida de fichero (revisión P0/P1 de 2026-10-08):
 * título de ventana (BUG-59), comandos rutinarios en silencio (BUG-58),
 * fichero borrado por fuera (BUG-55), cambio externo ilegible con sesión limpia
 * (BUG-53) y re-adopción de la sesión viva tras recargar la interfaz (BUG-51).
 *
 * Cada `describe` lanza su **propia** instancia sobre una copia temporal de la
 * fixture: los tests no comparten estado y pueden mutar el fichero.
 */

const here = fileURLToPath(new URL('.', import.meta.url));
const mainEntry = join(here, '..', 'out', 'main', 'main.js');
const corpus = join(here, '..', '..', '..', 'fixtures', 'corpus');

const TITLE = 'PalletOutput.rdlc — RDLC Report Designer';
const TITLE_DIRTY = 'PalletOutput.rdlc * — RDLC Report Designer';

interface Ctx {
  app: ElectronApplication;
  page: Page;
  workspace: string;
  file: string;
}

async function launch(fixtureName: string): Promise<Ctx> {
  const workspace = join(
    tmpdir(),
    `rdlc-e2e-res-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  );
  mkdirSync(workspace, { recursive: true });
  const file = join(workspace, fixtureName);
  copyFileSync(join(corpus, fixtureName), file);
  const app = await electron.launch({
    args: [mainEntry, file, `--user-data-dir=${join(workspace, 'user-data')}`],
  });
  const page = await app.firstWindow();
  await page.waitForFunction(() =>
    Boolean((window as never as Record<string, unknown>)['__rdlcProjection']),
  );
  return { app, page, workspace, file };
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

/** Registra una app por `describe` (beforeAll/afterAll) y devuelve su getter. */
function useApp(fixtureName: string): () => Ctx {
  let ctx: Ctx | undefined;
  test.beforeAll(async () => {
    ctx = await launch(fixtureName);
  });
  test.afterAll(async () => {
    await shutdown(ctx);
  });
  return () => ctx!;
}

/* ------------------------------- helpers -------------------------------- */

async function projectionVersion(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      ((window as never as Record<string, unknown>)['__rdlcProjection'] as { version: number })
        .version,
  );
}

async function itemCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    const projection = (window as never as Record<string, unknown>)['__rdlcProjection'] as {
      page: { body: { items: unknown[] } };
    };
    return projection.page.body.items.length;
  });
}

async function statusText(page: Page): Promise<string> {
  return (await page.locator('footer').first().innerText()).replace(/\s+/g, ' ');
}

/** Inserta un textbox y espera a que aparezca en la proyección (sin estado). */
async function insertTextbox(page: Page): Promise<void> {
  const before = await itemCount(page);
  await page.getByRole('button', { name: 'Insertar textbox' }).click();
  await expect
    .poll(() => itemCount(page), { message: 'el textbox debe aparecer en la proyección' })
    .toBe(before + 1);
}

/** true si el aviso de conflicto está a la vista (diálogo o banda superior). */
async function conflictVisible(page: Page): Promise<boolean> {
  if (
    await page
      .getByTestId('conflict-dialog')
      .isVisible()
      .catch(() => false)
  )
    return true;
  return page
    .getByText(/cambió por fuera y hay cambios sin guardar/)
    .isVisible()
    .catch(() => false);
}

/* ------------------------------- BUG-59 --------------------------------- */

test.describe('BUG-59 el título de la ventana', () => {
  const ctx = useApp('PalletOutput.rdlc');

  test('muestra el informe y el * de cambios sin guardar', async () => {
    const { page, file } = ctx();
    const original = readFileSync(file);
    await expect.poll(() => page.title(), { message: 'título tras abrir' }).toBe(TITLE);

    await insertTextbox(page);
    await expect
      .poll(() => page.title(), { message: 'título con cambios sin guardar' })
      .toBe(TITLE_DIRTY);

    // Ctrl+S marca limpio: el * desaparece y el fichero cambió en disco.
    await page.keyboard.press('Control+s');
    await expect.poll(() => page.title(), { message: 'título tras guardar' }).toBe(TITLE);
    expect(readFileSync(file).equals(original), 'el guardado debe escribir el textbox').toBe(false);
  });
});

/* ------------------------------- BUG-58 --------------------------------- */

test.describe('BUG-58 los comandos rutinarios no ensucian el pie', () => {
  const ctx = useApp('PalletOutput.rdlc');

  test('insertar un textbox no deja insertItem/Comando/aplicado en el pie', async () => {
    const { page } = ctx();
    await insertTextbox(page);
    // El pie ya no recibe un mensaje por el comando; se le da un instante por si
    // una regresión lo escribiera algo más tarde que la proyección.
    await page.waitForTimeout(300);

    const footer = await statusText(page);
    expect(footer).not.toContain('insertItem');
    expect(footer).not.toContain('Comando');
    expect(footer).not.toContain('aplicado');
  });
});

/* ------------------------------- BUG-55 --------------------------------- */

test.describe('BUG-55 el fichero desaparecido de disco', () => {
  const ctx = useApp('PalletOutput.rdlc');

  test('avisa en ámbar y retira el aviso cuando el fichero vuelve', async () => {
    const { page, file } = ctx();
    const original = readFileSync(file);

    unlinkSync(file);
    const banner = page.getByTestId('file-missing-banner');
    await expect(banner, 'el borrado externo debe avisarse').toBeVisible({ timeout: 15_000 });
    await expect(banner).toContainText('ya no existe en disco');
    expect(await conflictVisible(page), 'un borrado no es un conflicto').toBe(false);

    // El fichero vuelve (la misma copia): el aviso desaparece solo.
    writeFileSync(file, original);
    await expect(banner, 'el aviso debe retirarse al volver el fichero').toBeHidden({
      timeout: 15_000,
    });
    expect(await conflictVisible(page), 'seguir sin conflicto tras volver').toBe(false);
  });
});

/* ------------------------------- BUG-53 --------------------------------- */

test.describe('BUG-53 cambio externo ilegible con la sesión limpia', () => {
  const ctx = useApp('PalletOutput.rdlc');

  test('avisa en suave, sin conflicto, y se recupera con un XML válido', async () => {
    const { page, file } = ctx();
    const original = readFileSync(file);
    const versionBefore = await projectionVersion(page);

    // XML a medias: no se pudo recargar, pero la sesión sigue intacta.
    writeFileSync(file, 'esto no es XML <Report', 'utf8');
    await expect.poll(() => statusText(page), { timeout: 15_000 }).toContain('no se pudo leer');
    expect(await conflictVisible(page), 'un fichero ilegible no es un conflicto').toBe(false);

    // Vuelve un XML válido: se recarga solo (la versión avanza) y sigue sin
    // conflicto.
    writeFileSync(file, original);
    await expect
      .poll(() => statusText(page), { timeout: 15_000 })
      .toContain('Recargado desde disco');
    await expect
      .poll(() => projectionVersion(page), { message: 'la recarga externa avanza la versión' })
      .toBeGreaterThan(versionBefore);
    expect(await conflictVisible(page), 'sin conflicto tras recuperarse').toBe(false);
  });
});

/* ------------------------------- BUG-51 --------------------------------- */

test.describe('BUG-51 recargar la interfaz re-adopta la sesión viva', () => {
  const ctx = useApp('PalletOutput.rdlc');

  test('conserva el documento sucio, su versión y el título tras page.reload()', async () => {
    const { page } = ctx();
    const before = await itemCount(page);
    await insertTextbox(page);
    await expect.poll(() => page.title(), { message: 'sucio antes de recargar' }).toBe(TITLE_DIRTY);
    const versionBefore = await projectionVersion(page);

    await page.reload();
    await page.waitForFunction(() =>
      Boolean((window as never as Record<string, unknown>)['__rdlcProjection']),
    );

    // La proyección es la misma sesión viva (mismo contenido y versión): el
    // trabajo sin guardar no se ha perdido.
    await expect.poll(() => statusText(page)).toContain('Sesión recuperada');
    await expect.poll(() => projectionVersion(page)).toBe(versionBefore);
    expect(await itemCount(page)).toBe(before + 1);
    await expect.poll(() => page.title()).toBe(TITLE_DIRTY);

    // Deja la sesión limpia para que el cierre de afterAll no pregunte.
    await page.keyboard.press('Control+s');
    await expect.poll(() => page.title()).toBe(TITLE);
  });
});
