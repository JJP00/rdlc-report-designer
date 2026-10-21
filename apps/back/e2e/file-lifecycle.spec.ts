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
import { appEnv } from './launch.js';

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
/** Segundo informe para las pruebas de pestañas (fixture distinta). */
let secondFile: string;

test.beforeAll(async () => {
  workspace = join(tmpdir(), `rdlc-e2e-lifecycle-${Date.now()}`);
  mkdirSync(workspace, { recursive: true });
  file = join(workspace, 'PalletOutput.rdlc');
  copyFileSync(fixture, file);
  secondFile = join(workspace, 'Segundo.rdlc');
  copyFileSync(
    join(here, '..', '..', '..', 'fixtures', 'corpus', 'SalesCreditMemoESP.rdlc'),
    secondFile,
  );

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
  const before = await itemCount();
  await page.getByRole('button', { name: 'Insertar textbox' }).click();
  // BUG-58: los comandos rutinarios ya no escriben nada en el pie; la señal
  // estable de que el comando se aplicó es la proyección.
  await expect
    .poll(itemCount, { message: 'el textbox debe aparecer en la proyección' })
    .toBe(before + 1);
}

/** Id del elemento seleccionado en el lienzo (según `__rdlcSelection`). */
async function selectedId(): Promise<string | null> {
  return page.evaluate(
    () =>
      ((window as never as Record<string, unknown>)['__rdlcSelection'] as { id?: string } | null)
        ?.id ?? null,
  );
}

/** Selecciona un elemento del informe por nombre desde la paleta (Ctrl+K). */
async function selectItemViaPalette(id: string): Promise<void> {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
  await page.keyboard.press('Control+k');
  await page.getByPlaceholder('Buscar elemento, variable o acción…').fill(id);
  await page.waitForTimeout(250);
  await page.getByRole('option', { name: new RegExp(`^${id}\\b`) }).click();
  await expect.poll(selectedId).toBe(id);
}

/** Pide al SO cerrar la ventana (el main lo intercepta y avisa al renderer). */
async function requestWindowClose(): Promise<void> {
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.close();
  });
}

test('Ctrl+S guarda (bytes idénticos) sin cambios', async () => {
  await page.keyboard.press('Control+s');
  await expect.poll(statusText).toContain('Guardado');
});

test('con cambios sin guardar, abrir el mismo reciente activa su pestaña sin preguntar', async () => {
  const before = await itemCount();
  await insertTextbox();
  await expect.poll(itemCount).toBe(before + 1);
  const versionAfterEdit = await projectionVersion();

  // Fase de pestañas: la ruta ya está abierta. El reciente **activa su
  // pestaña** (anti-duplicados) y no pregunta nada: nada se pierde, el
  // textbox sigue en su pestaña y el documento no se recarga.
  await page.getByRole('button', { name: 'Fichero' }).click();
  await page.getByRole('menuitem', { name: 'Recientes' }).click();
  await page.getByRole('menuitem', { name: file, exact: true }).click();

  const dialog = page.getByTestId('unsaved-changes-dialog');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByTestId('tab-strip').getByTestId('tab-item')).toHaveCount(1);
  await expect(page.getByTestId('tab-item')).toHaveAttribute('aria-selected', 'true');
  await expect.poll(itemCount).toBe(before + 1);
  expect(await projectionVersion(), 'el reciente no recarga ni reabre').toBe(versionAfterEdit);
  await expect.poll(isDirty).toBe(true);

  // Los tests siguientes comparten instancia: se guarda para que disco y
  // memoria queden en sintonía (el textbox forma parte del fichero).
  await page.keyboard.press('Control+s');
  await expect.poll(statusText).toContain('Guardado');
});

test('el conflicto ofrece recargar / sobrescribir / guardar como', async () => {
  const before = await itemCount();
  await insertTextbox();

  // Edición externa (como haría otro editor) sobre el contenido **actual** del
  // disco (el test anterior dejó un textbox guardado) → conflicto.
  const currentBytes = readFileSync(file);
  writeFileSync(
    file,
    currentBytes.toString('utf8').replace('<Value>(</Value>', '<Value>[EXTERNO]</Value>'),
    'utf8',
  );

  const dialog = page.getByTestId('conflict-dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: /Recargar desde disco/ }).click();
  await expect(dialog).toBeHidden();

  // El documento local se descartó: quedan los items de disco y el texto externo.
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
  writeFileSync(file, currentBytes);
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
  await requestWindowClose();

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

/* ---------------- pestañas (bloque D): aislamiento por pestaña -------------- */

test('pestañas: «guardar como» a una ruta abierta se aborta y la UI no viaja', async () => {
  // Abrir Segundo.rdlc en una pestaña nueva (diálogo nativo simulado).
  await app.evaluate(({ dialog }, filePath) => {
    dialog.showOpenDialog = (async () => ({
      canceled: false,
      filePaths: [filePath],
    })) as typeof dialog.showOpenDialog;
  }, secondFile);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
  await page.keyboard.press('Control+o');

  const tabs = page.getByTestId('tab-strip').getByTestId('tab-item');
  await expect(tabs).toHaveCount(2);
  await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
  await expect(tabs.nth(1)).toContainText('Segundo.rdlc');

  // Guardar como… hacia la ruta de la OTRA pestaña: se aborta con un aviso
  // persistente y no se crea una segunda pestaña sobre el mismo fichero.
  await app.evaluate(
    ({ dialog }, filePath) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath });
    },
    join(workspace, 'Copia.rdlc'),
  );
  await page.getByRole('button', { name: 'Fichero' }).click();
  await page.getByRole('menuitem', { name: 'Guardar como…' }).click();
  await expect(page.getByRole('alert').first()).toContainText(
    'Esa ruta ya está abierta en otra pestaña',
  );
  await page.getByRole('button', { name: 'Cerrar el aviso' }).click();
  await expect(tabs).toHaveCount(2);

  // Selección de cada pestaña: Tablix7 en la segunda, Textbox25 en la primera.
  // (Se elige un Tablix a propósito: es el caso que monta/desmonta el lienzo.)
  await selectItemViaPalette('Tablix7');
  await tabs.nth(0).click();
  await expect(tabs.nth(0)).toHaveAttribute('aria-selected', 'true');
  await selectItemViaPalette('Textbox25');
  await page.getByRole('button', { name: /^Zoom:/ }).click();
  await page.getByRole('menuitem', { name: '50 %', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Zoom: 50 %' })).toBeVisible();

  // Volver a la segunda: conserva SU selección y SU zoom (no los de la otra).
  await tabs.nth(1).click();
  await expect
    .poll(selectedId, { message: 'la segunda pestaña recupera su Tablix' })
    .toBe('Tablix7');
  await expect(page.getByRole('button', { name: 'Zoom: 60 %' })).toBeVisible();

  // Y de vuelta a la primera: su selección y su zoom siguen ahí.
  await tabs.nth(0).click();
  await expect
    .poll(selectedId, { message: 'la primera pestaña recupera su selección' })
    .toBe('Textbox25');
  await expect(page.getByRole('button', { name: 'Zoom: 50 %' })).toBeVisible();
});

/* ------------- pestañas (bloque C): cierre con varias sucias ----------------- */

test('cerrar la ventana con dos pestañas sucias: Guardar todas o Cancelar', async () => {
  const tabs = page.getByTestId('tab-strip').getByTestId('tab-item');

  // La pestaña activa (Copia) queda sucia con un textbox; la otra, también.
  await insertTextbox();
  await tabs.nth(1).click();
  await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
  await insertTextbox();

  // El SO pide cerrar: con varias sucias, «Guardar todas / Descartar todas /
  // Cancelar» y la lista de los informes en juego.
  await requestWindowClose();
  const dialog = page.getByTestId('save-all-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Copia.rdlc');
  await expect(dialog).toContainText('Segundo.rdlc');

  // Cancelar: no se cierra nada y la ventana sigue viva.
  await dialog.getByRole('button', { name: 'Cancelar' }).click();
  await expect(dialog).toBeHidden();
  expect(await app.windows().length).toBe(1);

  // Guardar todas: escribe ambas y confirma el cierre una sola vez.
  const copiaFile = join(workspace, 'Copia.rdlc');
  const copiaBefore = readFileSync(copiaFile);
  const segundoBefore = readFileSync(secondFile);
  await requestWindowClose();
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Guardar todas' }).click();
  await expect
    .poll(() => page.isClosed(), { message: 'la ventana se cierra tras guardar' })
    .toBe(true);
  expect(readFileSync(copiaFile)).not.toEqual(copiaBefore);
  expect(readFileSync(secondFile)).not.toEqual(segundoBefore);
});
