import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * U1/U2 — ciclo de vida de fichero sobre la app real: Nuevo/Guardar como,
 * recientes, drag&drop (lógico), guardas de cambios sin guardar, diálogo de
 * conflicto y cierre de ventana.
 *
 * Va en un fichero aparte porque modifica el fichero abierto (conflictos,
 * guardar como) y no debe arrastrar ese estado a la suite principal.
 */

const here = fileURLToPath(new URL('.', import.meta.url));
const mainEntry = join(here, '..', 'out', 'main', 'main.js');
const fixture = join(here, '..', '..', '..', 'fixtures', 'corpus', 'PalletOutput.rdlc');

let app: ElectronApplication;
let page: Page;
let workspace: string;
let file: string;
/** Copia de seguridad de la fixture original (para restaurar tras el conflicto). */
let originalBytes: Buffer;

test.beforeAll(async () => {
  workspace = join(tmpdir(), `rdlc-e2e-lifecycle-${Date.now()}`);
  mkdirSync(workspace, { recursive: true });
  file = join(workspace, 'PalletOutput.rdlc');
  copyFileSync(fixture, file);
  originalBytes = readFileSync(file);

  app = await electron.launch({
    args: [mainEntry, file, `--user-data-dir=${join(workspace, 'user-data')}`],
  });
  page = await app.firstWindow();
  await page.waitForFunction(() =>
    Boolean((window as never as Record<string, unknown>)['__rdlcProjection']),
  );
});

test.afterAll(async () => {
  if (!app) return;
  // El cierre pide confirmación si el test dejó cambios: se descartan.
  const closing = app.close().catch(() => undefined);
  await page
    .getByTestId('unsaved-changes-dialog')
    .getByRole('button', { name: 'Salir sin guardar' })
    .click({ timeout: 5000 })
    .catch(() => undefined);
  await closing;
});

async function projectionVersion(): Promise<number> {
  return page.evaluate(
    () =>
      ((window as never as Record<string, unknown>)['__rdlcProjection'] as { version: number })
        .version,
  );
}

async function itemCount(): Promise<number> {
  return page.evaluate(() => {
    const projection = (window as never as Record<string, unknown>)['__rdlcProjection'] as {
      page: { body: { items: unknown[] } };
    };
    return projection.page.body.items.length;
  });
}

async function statusText(): Promise<string> {
  return (await page.locator('footer').first().innerText()).replace(/\s+/g, ' ');
}

/** true si la barra de estado marca cambios sin guardar (asterisco junto a la ruta). */
async function isDirty(): Promise<boolean> {
  return page.evaluate(() => (document.querySelector('footer')?.innerText ?? '').includes('*'));
}

/** Inserta un textbox desde la toolbar (deja el documento con cambios). */
async function insertTextbox(): Promise<void> {
  await page.getByRole('button', { name: 'Insertar textbox' }).click();
  await expect.poll(() => page.locator('footer').first().innerText()).toContain('insertItem');
}

test('Ctrl+S guarda (bytes idénticos) sin cambios', async () => {
  await page.keyboard.press('Control+s');
  await expect.poll(statusText).toContain('Guardado');
});

test('con cambios sin guardar, abrir un reciente pide confirmación', async () => {
  const before = await itemCount();
  await insertTextbox();
  await expect.poll(itemCount).toBe(before + 1);

  // Desplegable «Fichero» → Recientes → el propio fichero en edición (ruta
  // exacta: con userData aislado solo hay un reciente, pero se ata al fichero).
  await page.getByRole('button', { name: 'Fichero' }).click();
  await page.getByRole('menuitem', { name: 'Recientes' }).click();
  await page.getByRole('menuitem', { name: file, exact: true }).click();

  // Guarda de cambios: Cancelar conserva el documento intacto.
  const dialog = page.getByTestId('unsaved-changes-dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancelar' }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(itemCount).toBe(before + 1);

  // Repetir y descartar: el informe se reabre desde disco (sin el textbox).
  await page.getByRole('button', { name: 'Fichero' }).click();
  await page.getByRole('menuitem', { name: 'Recientes' }).click();
  await page.getByRole('menuitem', { name: file, exact: true }).click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Abrir sin guardar' }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(itemCount).toBe(before);
  await expect.poll(projectionVersion).toBe(1);
});

test('el conflicto ofrece recargar / sobrescribir / guardar como', async () => {
  const before = await itemCount();
  await insertTextbox();

  // Edición externa (como haría otro editor) → conflicto.
  writeFileSync(
    file,
    originalBytes.toString('utf8').replace('<Value>(</Value>', '<Value>[EXTERNO]</Value>'),
    'utf8',
  );

  const dialog = page.getByTestId('conflict-dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: /Recargar desde disco/ }).click();
  await expect(dialog).toBeHidden();

  // El documento local se descartó: quedan los items originales y el texto externo.
  await expect.poll(itemCount).toBe(before);
  await expect.poll(statusText).toContain('Recargado');
  await expect
    .poll(() =>
      page.evaluate(() =>
        JSON.stringify((window as never as Record<string, unknown>)['__rdlcProjection']).includes(
          '[EXTERNO]',
        ),
      ),
    )
    .toBe(true);

  // Restaurar el fichero: como la sesión quedó limpia, se recarga solo.
  writeFileSync(file, originalBytes);
  await expect
    .poll(() =>
      page.evaluate(() =>
        JSON.stringify((window as never as Record<string, unknown>)['__rdlcProjection']).includes(
          '[EXTERNO]',
        ),
      ),
    )
    .toBe(false);
});

test('Guardar como… escribe en la ruta nueva y la sesión sigue ahí', async () => {
  const target = join(workspace, 'Copia.rdlc');

  // El diálogo nativo se sustituye en el proceso principal por una respuesta fija.
  await app.evaluate(({ dialog }, filePath) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath });
  }, target);

  const before = await itemCount();
  await insertTextbox();

  await page.getByRole('button', { name: 'Fichero' }).click();
  await page.getByRole('menuitem', { name: 'Guardar como…' }).click();
  await expect.poll(() => existsSync(target)).toBe(true);
  await expect.poll(statusText).toContain('Guardado como');

  // A partir de aquí se guarda en la copia (el original no cambia).
  await page.keyboard.press('Control+s');
  await expect.poll(statusText).toContain('Guardado');

  const savedXml = readFileSync(target, 'utf8');
  const originalXml = readFileSync(file, 'utf8');
  expect(savedXml).toContain('Textbox');
  expect(originalXml).not.toBe(savedXml);
  expect(await itemCount()).toBe(before + 1);
});

test('cerrar la ventana con cambios sin guardar pide confirmación', async () => {
  await insertTextbox();

  // El SO pide cerrar: el main lo intercepta y el front muestra el diálogo.
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.close();
  });

  const dialog = page.getByTestId('unsaved-changes-dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancelar' }).click();
  await expect(dialog).toBeHidden();

  // La ventana sigue viva; se guarda para que el cierre de afterAll no pregunte.
  expect(await app.windows().length).toBe(1);
  await expect.poll(isDirty).toBe(true);
  await page.keyboard.press('Control+s');
  await expect.poll(isDirty).toBe(false);
});
