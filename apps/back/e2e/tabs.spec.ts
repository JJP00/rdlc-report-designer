import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Locator,
  type Page,
} from '@playwright/test';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * QA/regresión de la fase MVP de pestañas (bloque E): contrato visible de una
 * pestaña por informe — dos informes abiertos, activación por click y teclado,
 * dirty/undo/conflicto **independientes**, selección y zoom por pestaña,
 * anti-duplicados por ruta, cierre de pestaña con guarda (vecina derecha /
 * izquierda) y cierre de ventana con varias sucias (Cancelar / Descartar todas).
 *
 * Cada `describe` lanza su **propia** instancia sobre copias temporales de las
 * fixtures (la app tiene watcher: el corpus no se toca). Dentro de un
 * `describe` los tests comparten instancia: `resetWorkspace` los devuelve al
 * estado de una sola pestaña limpia para que no dependan del anterior.
 */

const here = fileURLToPath(new URL('.', import.meta.url));
const mainEntry = join(here, '..', 'out', 'main', 'main.js');
const corpus = join(here, '..', '..', '..', 'fixtures', 'corpus');

interface Ctx {
  app: ElectronApplication;
  page: Page;
  workspace: string;
  /** Primer informe: el del arranque por CLI (`PalletOutput.rdlc`). */
  file: string;
  /** Segundo informe, para abrir en otra pestaña (`Segundo.rdlc`). */
  secondFile: string;
}

async function launch(): Promise<Ctx> {
  const workspace = join(
    tmpdir(),
    `rdlc-e2e-tabs-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  );
  mkdirSync(workspace, { recursive: true });
  const file = join(workspace, 'PalletOutput.rdlc');
  copyFileSync(join(corpus, 'PalletOutput.rdlc'), file);
  const secondFile = join(workspace, 'Segundo.rdlc');
  copyFileSync(join(corpus, 'SalesCreditMemoESP.rdlc'), secondFile);

  const app = await electron.launch({
    args: [mainEntry, file, `--user-data-dir=${join(workspace, 'user-data')}`],
  });
  const page = await app.firstWindow();
  await page.waitForFunction(() =>
    Boolean((window as never as Record<string, unknown>)['__rdlcProjection']),
  );
  return { app, page, workspace, file, secondFile };
}

async function shutdown(ctx: Ctx | undefined): Promise<void> {
  if (!ctx) return;
  // El cierre pide confirmación si el test dejó cambios: se descartan. La app
  // pudo cerrarse ya en un test («Descartar todas»): todo es tolerante.
  const closing = ctx.app.close().catch(() => undefined);
  await ctx.page
    .getByTestId('unsaved-changes-dialog')
    .getByRole('button', { name: 'Salir sin guardar' })
    .click({ timeout: 5000 })
    .catch(() => undefined);
  await closing;
}

/** Registra una app por `describe` (beforeAll/afterAll) y devuelve su getter. */
function useApp(): () => Ctx {
  let ctx: Ctx | undefined;
  test.beforeAll(async () => {
    ctx = await launch();
  });
  test.afterAll(async () => {
    await shutdown(ctx);
  });
  return () => ctx!;
}

/* ------------------------------- helpers -------------------------------- */

function tabsOf(page: Page): Locator {
  return page.getByTestId('tab-strip').getByTestId('tab-item');
}

/** Compara rutas como lo hace el anti-duplicados (separadores y caja). */
function normalize(path: string): string {
  return path.replace(/\\/g, '/').toLowerCase();
}

async function itemCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    const projection = (window as never as Record<string, unknown>)['__rdlcProjection'] as {
      page: { body: { items: unknown[] } };
    };
    return projection.page.body.items.length;
  });
}

async function projectionVersion(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      ((window as never as Record<string, unknown>)['__rdlcProjection'] as { version: number })
        .version,
  );
}

/** Id del elemento seleccionado en el lienzo (según `__rdlcSelection`). */
async function selectedId(page: Page): Promise<string | null> {
  return page.evaluate(
    () =>
      ((window as never as Record<string, unknown>)['__rdlcSelection'] as { id?: string } | null)
        ?.id ?? null,
  );
}

/** Inserta un textbox en la pestaña activa (la deja con cambios sin guardar). */
async function insertTextbox(page: Page): Promise<void> {
  const before = await itemCount(page);
  await page.getByRole('button', { name: 'Insertar textbox' }).click();
  await expect
    .poll(() => itemCount(page), { message: 'el textbox debe aparecer en la proyección' })
    .toBe(before + 1);
}

/** Selecciona un elemento del informe activo por nombre desde la paleta (Ctrl+K). */
async function selectItemViaPalette(page: Page, id: string): Promise<void> {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
  await page.keyboard.press('Control+k');
  await page.getByPlaceholder('Buscar elemento, variable o acción…').fill(id);
  await page.waitForTimeout(250);
  await page.getByRole('option', { name: new RegExp(`^${id}\\b`) }).click();
  await expect.poll(() => selectedId(page)).toBe(id);
}

/** Fija el zoom de la pestaña activa por el menú (p. ej. «50 %»). */
async function setZoom(page: Page, label: string): Promise<void> {
  await page.getByRole('button', { name: /^Zoom:/ }).click();
  await page.getByRole('menuitem', { name: label, exact: true }).click();
  await expect(page.getByRole('button', { name: `Zoom: ${label}` })).toBeVisible();
}

/** Sustituye el diálogo nativo de abrir por una respuesta fija. */
async function stubOpenDialog(app: ElectronApplication, filePath: string): Promise<void> {
  await app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = (async () => ({
      canceled: false,
      filePaths: [path],
    })) as typeof dialog.showOpenDialog;
  }, filePath);
}

/** Abre una ruta en una pestaña nueva (o activa la existente) vía Fichero → Abrir…. */
async function openViaToolbar(ctx: Ctx, path: string): Promise<void> {
  await stubOpenDialog(ctx.app, path);
  await ctx.page.getByRole('button', { name: 'Fichero' }).click();
  await ctx.page.getByRole('menuitem', { name: 'Abrir…' }).click();
}

/** Cierra una pestaña por su botón, descartando los cambios si los hay. */
async function closeTabDiscarding(page: Page, tab: Locator): Promise<void> {
  const dirty = (await tab.getAttribute('data-dirty')) === 'true';
  await tab.getByTestId('tab-close').click();
  const dialog = page.getByTestId('unsaved-changes-dialog');
  if (dirty) {
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Cerrar sin guardar' }).click();
    await expect(dialog).toBeHidden();
    return;
  }
  // Si el atributo iba por detrás, el diálogo igualmente se descarta.
  if (await dialog.isVisible().catch(() => false)) {
    await dialog.getByRole('button', { name: 'Cerrar sin guardar' }).click();
  }
}

/**
 * Deja el workspace con una sola pestaña: la del primer informe, limpia. Cierra
 * todo lo demás descartando cambios y reabre la ruta del CLI si hace falta.
 */
async function resetWorkspace(ctx: Ctx): Promise<void> {
  const { page, file } = ctx;
  const tabs = tabsOf(page);
  if ((await tabs.count()) === 1 && (await tabs.nth(0).getAttribute('data-dirty')) === 'false') {
    const path = await tabs.nth(0).getAttribute('data-path');
    if (path !== null && normalize(path) === normalize(file)) return;
  }

  for (let guard = 0; guard < 8 && (await tabs.count()) > 0; guard += 1) {
    const last = tabs.last();
    await last.click();
    await closeTabDiscarding(page, last);
  }
  await expect(tabs).toHaveCount(0);

  await openViaToolbar(ctx, file);
  await expect(tabs).toHaveCount(1);
  await expect(tabs.nth(0)).toHaveAttribute('data-dirty', 'false');
}

/** Pide al SO cerrar la ventana (el main lo intercepta y avisa al renderer). */
async function requestWindowClose(app: ElectronApplication): Promise<void> {
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.close();
  });
}

/**
 * Asegura dos pestañas sucias (idempotente): la primera y la segunda, con sus
 * ficheros respectivos. Un test anterior pudo dejarlas ya así.
 */
async function ensureTwoDirtyTabs(ctx: Ctx): Promise<void> {
  const { page, secondFile } = ctx;
  const tabs = tabsOf(page);
  if ((await tabs.count()) < 2) await openViaToolbar(ctx, secondFile);
  await expect(tabs).toHaveCount(2);
  for (const index of [0, 1]) {
    await tabs.nth(index).click();
    if ((await tabs.nth(index).getAttribute('data-dirty')) !== 'true') {
      await insertTextbox(page);
    }
    await expect(tabs.nth(index)).toHaveAttribute('data-dirty', 'true');
  }
}

/* ------------- dos informes: activación, aislamiento y anti-duplicados ------ */

test.describe('pestañas · dos informes abiertos', () => {
  const ctx = useApp();

  test('dos pestañas con su nombre; activación por click y Ctrl+Tab con vuelta', async () => {
    const { page, file, secondFile } = ctx();
    const tabs = tabsOf(page);
    await resetWorkspace(ctx());

    await openViaToolbar(ctx(), secondFile);
    await expect(tabs).toHaveCount(2);
    await expect(tabs.nth(0)).toContainText('PalletOutput.rdlc');
    await expect(tabs.nth(1)).toContainText('Segundo.rdlc');
    expect(normalize((await tabs.nth(0).getAttribute('data-path')) ?? '')).toBe(normalize(file));
    expect(normalize((await tabs.nth(1).getAttribute('data-path')) ?? '')).toBe(
      normalize(secondFile),
    );
    // La recién abierta se activa.
    await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');

    // Ratón: volver a la primera.
    await tabs.nth(0).click();
    await expect(tabs.nth(0)).toHaveAttribute('aria-selected', 'true');
    await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'false');
    await expect.poll(() => page.title()).toBe('PalletOutput.rdlc — RDLC Report Designer');

    // Ctrl+Tab adelante, vuelta circular y atrás.
    await page.keyboard.press('Control+Tab');
    await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
    await expect.poll(() => page.title()).toBe('Segundo.rdlc — RDLC Report Designer');
    await page.keyboard.press('Control+Tab');
    await expect(tabs.nth(0)).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Control+Shift+Tab');
    await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');

    await closeTabDiscarding(page, tabs.nth(1));
    await expect(tabs).toHaveCount(1);
  });

  test('dirty y undo son independientes por pestaña', async () => {
    const { page, secondFile } = ctx();
    const tabs = tabsOf(page);
    await resetWorkspace(ctx());

    // A (activa): un textbox la deja sucia y con `*` en su pestaña y el título.
    const a0 = await itemCount(page);
    await insertTextbox(page);
    await expect(tabs.nth(0)).toHaveAttribute('data-dirty', 'true');
    await expect.poll(() => page.title()).toBe('PalletOutput.rdlc * — RDLC Report Designer');

    // B nace limpia.
    await openViaToolbar(ctx(), secondFile);
    await expect(tabs).toHaveCount(2);
    await expect(tabs.nth(1)).toHaveAttribute('data-dirty', 'false');
    await expect.poll(() => page.title()).toBe('Segundo.rdlc — RDLC Report Designer');
    const b0 = await itemCount(page);

    // Editar B y deshacerlo en B: A no se toca (ni su undo).
    await insertTextbox(page);
    await expect(tabs.nth(1)).toHaveAttribute('data-dirty', 'true');
    await expect.poll(() => page.title()).toBe('Segundo.rdlc * — RDLC Report Designer');
    await page.keyboard.press('Control+z');
    await expect.poll(() => itemCount(page)).toBe(b0);
    await expect(tabs.nth(1)).toHaveAttribute('data-dirty', 'false');
    await expect(tabs.nth(0)).toHaveAttribute('data-dirty', 'true');

    // Volver a A: su edición sigue ahí y sigue sucia.
    await tabs.nth(0).click();
    await expect.poll(() => itemCount(page)).toBe(a0 + 1);
    await expect(tabs.nth(0)).toHaveAttribute('data-dirty', 'true');
    await expect.poll(() => page.title()).toBe('PalletOutput.rdlc * — RDLC Report Designer');

    // Limpieza: deshacer A (vuelve a limpia, refreshDirty) y cerrar B.
    await page.keyboard.press('Control+z');
    await expect.poll(() => itemCount(page)).toBe(a0);
    await expect(tabs.nth(0)).toHaveAttribute('data-dirty', 'false');
    await closeTabDiscarding(page, tabs.nth(1));
    await expect(tabs).toHaveCount(1);
  });

  test('selección y zoom de cada pestaña se conservan al cambiar', async () => {
    const { page, secondFile } = ctx();
    const tabs = tabsOf(page);
    await resetWorkspace(ctx());

    // A: item y zoom propios.
    await tabs.nth(0).click();
    await selectItemViaPalette(page, 'Textbox25');
    await setZoom(page, '50 %');

    // B: otra selección y el zoom por defecto (60 %).
    await openViaToolbar(ctx(), secondFile);
    await expect(tabs).toHaveCount(2);
    await selectItemViaPalette(page, 'Tablix7');
    await expect(page.getByRole('button', { name: 'Zoom: 60 %' })).toBeVisible();

    // Volver a A: recupera SU selección y SU zoom (bloque D).
    await tabs.nth(0).click();
    await expect.poll(() => selectedId(page), { message: 'A recupera Textbox25' }).toBe('Textbox25');
    await expect(page.getByRole('button', { name: 'Zoom: 50 %' })).toBeVisible();

    // Y a B: los suyos, sin los de A.
    await tabs.nth(1).click();
    await expect.poll(() => selectedId(page), { message: 'B recupera Tablix7' }).toBe('Tablix7');
    await expect(page.getByRole('button', { name: 'Zoom: 60 %' })).toBeVisible();

    await closeTabDiscarding(page, tabs.nth(1));
    await expect(tabs).toHaveCount(1);
  });

  test('abrir la ruta ya abierta activa su pestaña sin recargar', async () => {
    const { page, secondFile } = ctx();
    const tabs = tabsOf(page);
    await resetWorkspace(ctx());

    await openViaToolbar(ctx(), secondFile);
    await expect(tabs).toHaveCount(2);
    await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');

    // La segunda queda sucia: una recarga perdería el textbox y el `*`.
    const b0 = await itemCount(page);
    await insertTextbox(page);
    const versionBefore = await projectionVersion(page);
    const sessionBefore = await tabs.nth(1).getAttribute('data-session-id');
    expect(sessionBefore, 'la pestaña tiene sesión').toBeTruthy();

    // Desde A, «abrir» otra vez la misma ruta: se activa la existente.
    await tabs.nth(0).click();
    await openViaToolbar(ctx(), secondFile);
    await expect(tabs).toHaveCount(2);
    await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
    await expect(tabs.nth(1)).toHaveAttribute('data-session-id', sessionBefore!);
    await expect
      .poll(() => projectionVersion(page), { message: 'no debe recargar el documento' })
      .toBe(versionBefore);
    await expect.poll(() => itemCount(page)).toBe(b0 + 1);
    await expect(tabs.nth(1)).toHaveAttribute('data-dirty', 'true');

    // Limpieza: deshacer B y cerrarla.
    await page.keyboard.press('Control+z');
    await expect.poll(() => itemCount(page)).toBe(b0);
    await expect(tabs.nth(1)).toHaveAttribute('data-dirty', 'false');
    await closeTabDiscarding(page, tabs.nth(1));
    await expect(tabs).toHaveCount(1);
  });
});

/* -------------------- cierre de pestaña con guarda ---------------------- */

test.describe('pestañas · cierre de pestaña con guarda', () => {
  const ctx = useApp();

  test('Ctrl+W con cambios: Cancelar la mantiene; Descartar la cierra y activa la vecina derecha', async () => {
    const { page, secondFile } = ctx();
    const tabs = tabsOf(page);
    const dialog = page.getByTestId('unsaved-changes-dialog');
    await resetWorkspace(ctx());

    await openViaToolbar(ctx(), secondFile);
    await expect(tabs).toHaveCount(2);

    // La primera (izquierda) queda sucia.
    await tabs.nth(0).click();
    const a0 = await itemCount(page);
    await insertTextbox(page);
    await expect(tabs.nth(0)).toHaveAttribute('data-dirty', 'true');

    // Ctrl+W: guarda de ESA pestaña; Cancelar no la cierra.
    await page.keyboard.press('Control+w');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('PalletOutput.rdlc');
    await expect(dialog).toContainText('cerrar su pestaña');
    await dialog.getByRole('button', { name: 'Cancelar' }).click();
    await expect(dialog).toBeHidden();
    await expect(tabs).toHaveCount(2);
    await expect(tabs.nth(0)).toHaveAttribute('data-dirty', 'true');
    await expect.poll(() => itemCount(page)).toBe(a0 + 1);

    // El botón de cerrar + Descartar: A se va; su vecina derecha (B) activa.
    await tabs.nth(0).getByTestId('tab-close').click();
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Cerrar sin guardar' }).click();
    await expect(dialog).toBeHidden();
    await expect(tabs).toHaveCount(1);
    await expect(tabs.nth(0)).toContainText('Segundo.rdlc');
    await expect(tabs.nth(0)).toHaveAttribute('aria-selected', 'true');
    await expect.poll(() => page.title()).toBe('Segundo.rdlc — RDLC Report Designer');
  });

  test('cerrar la última sucia activa la vecina izquierda; la última limpia deja el editor vacío', async () => {
    const { page, secondFile } = ctx();
    const tabs = tabsOf(page);
    const dialog = page.getByTestId('unsaved-changes-dialog');
    await resetWorkspace(ctx());
    const a0 = await itemCount(page);

    // A (izquierda) y B (derecha, la última), con B sucia.
    await openViaToolbar(ctx(), secondFile);
    await expect(tabs).toHaveCount(2);
    await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
    await insertTextbox(page);
    await expect(tabs.nth(1)).toHaveAttribute('data-dirty', 'true');

    // Cerrar la última sucia: la vecina izquierda (A) pasa a ser la activa.
    await page.keyboard.press('Control+w');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Segundo.rdlc');
    await dialog.getByRole('button', { name: 'Cerrar sin guardar' }).click();
    await expect(dialog).toBeHidden();
    await expect(tabs).toHaveCount(1);
    await expect(tabs.nth(0)).toContainText('PalletOutput.rdlc');
    await expect(tabs.nth(0)).toHaveAttribute('aria-selected', 'true');
    await expect.poll(() => itemCount(page), { message: 'A conserva su contenido' }).toBe(a0);

    // Cerrar la última (limpia) deja el editor vacío, no cierra la ventana.
    await page.keyboard.press('Control+w');
    await expect(dialog).toHaveCount(0);
    await expect(tabs).toHaveCount(0);
    await expect(page.locator('footer').first()).toContainText('Documento cerrado');
    expect(await ctx().app.windows().length).toBe(1);
  });
});

/* --------------- cierre de ventana con varias pestañas sucias ------------- */

test.describe('pestañas · cierre de ventana con varias sucias', () => {
  const ctx = useApp();

  test('Cancelar mantiene la ventana y las pestañas sucias', async () => {
    const { page, app } = ctx();
    const tabs = tabsOf(page);
    await resetWorkspace(ctx());

    await ensureTwoDirtyTabs(ctx());
    await requestWindowClose(app);

    const dialog = page.getByTestId('save-all-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('PalletOutput.rdlc');
    await expect(dialog).toContainText('Segundo.rdlc');

    await dialog.getByRole('button', { name: 'Cancelar' }).click();
    await expect(dialog).toBeHidden();
    expect(await app.windows().length).toBe(1);
    await expect(tabs).toHaveCount(2);
    await expect(tabs.nth(0)).toHaveAttribute('data-dirty', 'true');
    await expect(tabs.nth(1)).toHaveAttribute('data-dirty', 'true');
  });

  test('Descartar todas sale sin escribir y cierra la ventana', async () => {
    const { page, app, file, secondFile } = ctx();
    await ensureTwoDirtyTabs(ctx());
    const beforeA = readFileSync(file);
    const beforeB = readFileSync(secondFile);

    await requestWindowClose(app);
    const dialog = page.getByTestId('save-all-dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Descartar todas' }).click();
    await expect
      .poll(() => page.isClosed(), { message: 'la ventana se cierra al descartar' })
      .toBe(true);

    // «Descartar todas» no escribe nada en disco.
    expect(readFileSync(file).equals(beforeA), 'el primer fichero no cambia').toBe(true);
    expect(readFileSync(secondFile).equals(beforeB), 'el segundo fichero no cambia').toBe(true);
  });
});

/* ---------------- el conflicto pertenece a su pestaña --------------------- */

test.describe('pestañas · el conflicto pertenece a su pestaña', () => {
  const ctx = useApp();

  test('el conflicto de A no viaja a B y vuelve a la vista al volver a A', async () => {
    const { page, file, secondFile } = ctx();
    const tabs = tabsOf(page);
    const dialog = page.getByTestId('conflict-dialog');
    await resetWorkspace(ctx());

    // A sucia, y B abierta delante (A sigue vigilada en segundo plano).
    const a0 = await itemCount(page);
    await insertTextbox(page);
    await openViaToolbar(ctx(), secondFile);
    await expect(tabs).toHaveCount(2);
    await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');

    // Edición externa del fichero de A: conflicto SOLO en su pestaña.
    const current = readFileSync(file, 'utf8');
    writeFileSync(file, current.replace('<Value>(</Value>', '<Value>[EXTERNO]</Value>'), 'utf8');
    await expect(tabs.nth(0)).toHaveAttribute('data-conflict', 'true', { timeout: 15_000 });
    await expect(tabs.nth(1)).toHaveAttribute('data-conflict', 'false');
    await expect(dialog, 'el diálogo es de la pestaña activa').toBeHidden();

    // Volver a A: su conflicto vuelve a la vista (diálogo; política actual).
    await tabs.nth(0).click();
    await expect(dialog).toBeVisible();

    // Recargar descarta lo local (política actual) y limpia el conflicto.
    await dialog.getByRole('button', { name: /Recargar desde disco/ }).click();
    await expect(dialog).toBeHidden();
    await expect(tabs.nth(0)).toHaveAttribute('data-conflict', 'false');
    await expect(tabs.nth(0)).toHaveAttribute('data-dirty', 'false');
    await expect.poll(() => itemCount(page)).toBe(a0);

    // B sigue limpia y sin conflicto: se cierra sin diálogo.
    await expect(tabs.nth(1)).toHaveAttribute('data-dirty', 'false');
    await closeTabDiscarding(page, tabs.nth(1));
    await expect(tabs).toHaveCount(1);
  });
});
