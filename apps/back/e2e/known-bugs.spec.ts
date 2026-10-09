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

/**
 * Regresiones de bugs conocidos del front que solo se alcanzan a través de
 * hooks/componentes (los reproducibles con funciones puras están en
 * `apps/front/src/lib/known-bugs.spec.ts`).
 *
 * Convención: un `describe` por bug; cada test describe el comportamiento
 * CORRECTO y lleva `test.fail()` porque hoy falla. Al arreglar el bug se quita
 * `test.fail()` y el test debe pasar.
 *
 * Cada `describe` lanza su **propia** instancia de la app sobre una copia
 * temporal de la fixture: un test que falla a mitad (lo esperado aquí) no
 * puede contaminar el estado del siguiente.
 */

const here = fileURLToPath(new URL('.', import.meta.url));
const mainEntry = join(here, '..', 'out', 'main', 'main.js');
const corpus = join(here, '..', '..', '..', 'fixtures', 'corpus');

interface Ctx {
  app: ElectronApplication;
  page: Page;
  workspace: string;
  file: string;
}

async function launch(fixtureName: string): Promise<Ctx> {
  const workspace = join(
    tmpdir(),
    `rdlc-e2e-bugs-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  );
  mkdirSync(workspace, { recursive: true });
  const file = join(workspace, fixtureName);
  copyFileSync(join(corpus, fixtureName), file);
  const app = await electron.launch({
    args: [mainEntry, file, `--user-data-dir=${join(workspace, 'user-data')}`],
  });
  const page = await app.firstWindow();
  await page.waitForFunction(() =>
    Boolean((window as never as Record<string, unknown>)['__rdlcStage']),
  );
  await page.waitForFunction(() =>
    Boolean((window as never as Record<string, unknown>)['__rdlcProjection']),
  );
  return { app, page, workspace, file };
}

async function shutdown(ctx: Ctx | undefined): Promise<void> {
  if (!ctx) return;
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

interface LengthLike {
  value: number;
  unit: string;
}

interface ItemLike {
  id: string;
  kind: string;
  top?: LengthLike;
  left?: LengthLike;
  width?: LengthLike;
  height?: LengthLike;
  style?: { backgroundColor?: string };
  children?: ItemLike[];
  body?: {
    columns: LengthLike[];
    rows: { height: LengthLike; cells: ({ colSpan?: number; content?: ItemLike } | null)[] }[];
  };
}

interface RegionLike {
  items: ItemLike[];
  height?: LengthLike;
}

interface Projection {
  version: number;
  page: {
    margins: { top: LengthLike; bottom: LengthLike; left: LengthLike; right: LengthLike };
    header: RegionLike;
    body: RegionLike;
    footer: RegionLike;
  };
}

interface KonvaLike {
  id(): string;
  name(): string;
  width(): number;
  height(): number;
  getAbsoluteTransform(): { point(point: { x: number; y: number }): { x: number; y: number } };
  getClientRect(options?: { relativeTo?: unknown }): {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

function toCm(length: LengthLike | undefined): number {
  if (!length) return Number.NaN;
  if (length.unit === 'mm') return length.value / 10;
  if (length.unit === 'in') return length.value * 2.54;
  if (length.unit === 'pt') return (length.value * 2.54) / 72;
  return length.value;
}

async function projection(page: Page): Promise<Projection | null> {
  return page.evaluate(
    () =>
      ((window as never as Record<string, unknown>)['__rdlcProjection'] as Projection | null) ??
      null,
  );
}

function findDeep(item: ItemLike, id: string): ItemLike | undefined {
  if (item.id === id) return item;
  for (const child of item.children ?? []) {
    const found = findDeep(child, id);
    if (found) return found;
  }
  for (const row of item.body?.rows ?? []) {
    for (const cell of row.cells ?? []) {
      if (!cell?.content) continue;
      const found = findDeep(cell.content, id);
      if (found) return found;
    }
  }
  return undefined;
}

async function findItem(page: Page, id: string): Promise<ItemLike | undefined> {
  const proj = await projection(page);
  if (!proj) return undefined;
  for (const region of [proj.page.header, proj.page.body, proj.page.footer]) {
    for (const item of region.items) {
      const found = findDeep(item, id);
      if (found) return found;
    }
  }
  return undefined;
}

async function itemLeftCm(page: Page, id: string): Promise<number | undefined> {
  const item = await findItem(page, id);
  return item?.left ? toCm(item.left) : undefined;
}

async function itemBackground(page: Page, id: string): Promise<string | undefined> {
  return (await findItem(page, id))?.style?.backgroundColor;
}

async function selectedId(page: Page): Promise<string | null> {
  return page.evaluate(
    () =>
      ((window as never as Record<string, unknown>)['__rdlcSelection'] as { id?: string } | null)
        ?.id ?? null,
  );
}

async function selectedCell(page: Page): Promise<{
  id: string;
  row: number;
  col: number;
  endRow?: number;
  endCol?: number;
} | null> {
  return page.evaluate(
    () =>
      ((window as never as Record<string, unknown>)['__rdlcCell'] as {
        id: string;
        row: number;
        col: number;
      } | null) ?? null,
  );
}

async function statusText(page: Page): Promise<string> {
  return (await page.locator('footer').first().innerText()).replace(/\s+/g, ' ');
}

/** Espera a que el scroll suave del lienzo se asiente. */
async function waitCanvasScrollSettled(page: Page): Promise<void> {
  let previous = '';
  let stable = 0;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const current = await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      const scroller = canvas?.closest('.overflow-auto');
      return scroller instanceof HTMLElement
        ? `${scroller.scrollLeft}:${scroller.scrollTop}`
        : 'none';
    });
    stable = current === previous ? stable + 1 : 0;
    if (stable >= 2) return;
    previous = current;
    await page.waitForTimeout(50);
  }
}

/** Selecciona un elemento por nombre desde la paleta (Ctrl+K). */
async function selectItemViaPalette(page: Page, id: string): Promise<void> {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
  await page.keyboard.press('Control+k');
  await page.getByPlaceholder('Buscar elemento, variable o acción…').fill(id);
  await page.waitForTimeout(250);
  await page.getByRole('option', { name: new RegExp(`^${id}\\b`) }).click();
  await expect.poll(() => selectedId(page)).toBe(id);
  await waitCanvasScrollSettled(page);
}

/** Centro en pantalla del nodo Konva de un item. */
async function nodeCenter(page: Page, id: string): Promise<{ x: number; y: number } | null> {
  return page.evaluate((nodeId) => {
    const stage = (window as never as Record<string, unknown>)['__rdlcStage'] as {
      findOne(selector: (node: KonvaLike) => boolean): KonvaLike | undefined;
      container(): HTMLElement;
      scaleX(): number;
    };
    const node = stage.findOne((candidate) => candidate.id() === nodeId);
    if (!node) return null;
    const box = node.getClientRect({ relativeTo: stage as unknown as never });
    const container = stage.container().getBoundingClientRect();
    const zoom = stage.scaleX();
    return {
      x: container.left + (box.x + box.width / 2) * zoom,
      y: container.top + (box.y + box.height / 2) * zoom,
    };
  }, id);
}

/** Punto del borde superior de un Tablix (anillo de hit) para seleccionarlo. */
async function tablixBorderPoint(page: Page, id: string): Promise<{ x: number; y: number } | null> {
  return page.evaluate((tablixId) => {
    const stage = (window as never as Record<string, unknown>)['__rdlcStage'] as {
      find(
        selector: (
          node: KonvaLike & {
            className?: string;
            getAttr(n: string): unknown;
            getParent(): KonvaLike;
          },
        ) => boolean,
      ): (KonvaLike & { getParent(): KonvaLike })[];
      container(): HTMLElement;
    };
    const borders = stage.find(
      (node) => node.className === 'Rect' && typeof node.getAttr('hitFunc') === 'function',
    );
    const border = borders.find((candidate) => candidate.getParent().id() === tablixId);
    if (!border) return null;
    const container = stage.container().getBoundingClientRect();
    const point = border.getAbsoluteTransform().point({ x: border.width() / 2, y: 0 });
    return { x: container.left + point.x, y: container.top + point.y - 2 };
  }, id);
}

async function selectTablix(page: Page, id: string): Promise<void> {
  const point = await tablixBorderPoint(page, id);
  expect(point, `borde de ${id}`).not.toBeNull();
  await page.mouse.click(point!.x, point!.y);
  await expect.poll(() => selectedId(page)).toBe(id);
}

/* -------------------------------- BUG-30 -------------------------------- */

/**
 * BUG-30 — `openPath`/`createNew` cierran la sesión anterior ANTES de que la
 * nueva apertura tenga éxito; si falla, `doc` sigue apuntando a la sesión
 * cerrada y los comandos/guardados posteriores fallan.
 * Origen: apps/front/src/hooks/useDocumentCore.ts:282-290 (openPath) y
 * :312-317 (createNew).
 * Correcto: tras un fallo al abrir, o el documento anterior sigue plenamente
 * usable (editar + guardar funciona) o el editor queda sin documento.
 * Remove `test.fail()` when fixing; the test must then pass.
 */
test.describe('BUG-30 abrir un fichero corrupto deja la sesión anterior cerrada', () => {
  const ctx = useApp('PalletOutput.rdlc');

  test('tras fallar la apertura, el documento anterior sigue usable (o no hay documento)', async () => {
    const { app, page, workspace } = ctx();
    const bad = join(workspace, 'Corrupto.rdlc');
    writeFileSync(bad, 'esto no es XML <Report', 'utf8');

    // El diálogo nativo de abrir devuelve el fichero corrupto.
    await app.evaluate(({ dialog }, filePath) => {
      dialog.showOpenDialog = (async () => ({
        canceled: false,
        filePaths: [filePath],
      })) as typeof dialog.showOpenDialog;
    }, bad);

    const before = await projection(page);
    expect(before).not.toBeNull();
    const itemsBefore = before!.page.body.items.length;

    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
    await page.keyboard.press('Control+o');
    // La apertura falla (XML inválido): se muestra el error.
    await expect(page.getByRole('alert').first()).toBeVisible();

    if ((await projection(page)) === null) return; // «sin documento»: aceptable.

    // El documento anterior debe seguir vivo: insertar y guardar funcionan.
    await page.getByRole('button', { name: 'Insertar textbox' }).click();
    await expect
      .poll(async () => (await projection(page))?.page.body.items.length, {
        message: 'el insert sobre la sesión anterior debe aplicarse',
        timeout: 5000,
      })
      .toBe(itemsBefore + 1);
    await page.keyboard.press('Control+s');
    await expect.poll(() => statusText(page), { timeout: 5000 }).toContain('Guardado');
  });
});

/* -------------------------------- BUG-31 -------------------------------- */

/**
 * BUG-31 — Las actualizaciones optimistas no se revierten cuando el backend
 * rechaza el comando: los caminos de useItemEditing llaman
 * `reconcile(undefined)`, que no hace nada, y la proyección local queda con el
 * valor optimista que el documento real no tiene.
 * Origen: apps/front/src/hooks/useItemEditing.ts:407 (flushNudge), :482
 * (moveTo), :513, :537, :583… y useDocumentCore.ts:216-231 (reconcile).
 * Reproducción: el handler IPC `rdlc:executeCommand` se sustituye en el
 * proceso principal por uno que siempre rechaza (E_COMMAND_REJECTED).
 * Remove `test.fail()` when fixing; the test must then pass.
 */
test.describe('BUG-31 el optimismo no se revierte si el comando es rechazado', () => {
  const ctx = useApp('SalesCreditMemoESP.rdlc');

  test('mover con flechas un item y que el backend lo rechace deja la posición original', async () => {
    const { app, page } = ctx();
    await selectItemViaPalette(page, 'Textbox93');
    const original = await itemLeftCm(page, 'Textbox93');
    expect(original).toBeDefined();

    await app.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler('rdlc:executeCommand');
      ipcMain.handle('rdlc:executeCommand', () => ({
        ok: false,
        code: 'E_COMMAND_REJECTED',
        message: 'rechazado por el test BUG-31',
      }));
    });

    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
    await page.keyboard.press('ArrowRight'); // nudge optimista; el keyup lo confirma
    await expect(
      page.getByRole('alert').filter({ hasText: 'rechazado por el test BUG-31' }),
    ).toBeVisible();

    await expect
      .poll(() => itemLeftCm(page, 'Textbox93'), {
        message: 'la proyección debe volver al valor del documento real',
        timeout: 3000,
      })
      .toBeCloseTo(original!, 4);
  });
});

/* -------------------------------- BUG-32 -------------------------------- */

/**
 * BUG-32 — ReportPropertiesForm inicializa los altos de banda con
 * `Math.max(h, 1.25)` y «Aplicar» los reenvía siempre: un pie de 0,6 cm crece
 * a 1,25 cm aunque solo se haya cambiado un margen.
 * Origen: apps/front/src/components/panels/ReportPropertiesForm.tsx:131-142
 * (estado inicial) y :190-207 (applyPage).
 * Fixture: BTCQualityControl.rdlc (PageFooter Height = 0.6cm).
 * Remove `test.fail()` when fixing; the test must then pass.
 */
test.describe('BUG-32 Aplicar un margen agranda un pie corto a 1,25 cm', () => {
  const ctx = useApp('BTCQualityControl.rdlc');

  test('cambiar solo el margen izquierdo no toca el alto del pie (proyección y XML guardado)', async () => {
    const { page, file } = ctx();
    const before = await projection(page);
    expect(toCm(before!.page.footer.height)).toBeCloseTo(0.6, 3);
    const newLeft = Math.round((toCm(before!.page.margins.left) + 0.2) * 100) / 100;

    await page.getByRole('button', { name: 'Informe…' }).click();
    const dialog = page.getByRole('dialog', { name: 'Propiedades del informe' });
    await expect(dialog).toBeVisible();
    const left = dialog.getByLabel('Izquierdo', { exact: true });
    await left.fill(String(newLeft));
    await left.press('Tab'); // blur = commit del borrador
    await dialog.getByRole('button', { name: 'Aplicar' }).click();
    await expect
      .poll(async () => toCm((await projection(page))!.page.margins.left))
      .toBeCloseTo(newLeft, 3);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();

    await page.keyboard.press('Control+s');
    await expect.poll(() => statusText(page)).toContain('Guardado');
    const xml = readFileSync(file, 'utf8').replace(/\s+/g, ' ');
    const footerHeight = /<PageFooter> ?<Height>([^<]+)<\/Height>/.exec(xml)?.[1];

    expect(
      toCm((await projection(page))!.page.footer.height),
      'alto del pie proyectado',
    ).toBeCloseTo(0.6, 3);
    expect(footerHeight, 'alto del pie en el XML guardado').toBe('0.6cm');
  });
});

/* -------------------------------- BUG-33 -------------------------------- */

/**
 * BUG-33 — Las tiras de cabecera de fila/columna del Tablix (modo celda)
 * ignoran `tablixLayout().offset` (ancho de las cabeceras de grupo de fila y
 * alto de las de columna): quedan desplazadas respecto a la rejilla del cuerpo.
 * Origen: apps/front/src/components/canvas/SelectionFrame.tsx:286-470
 * (TablixHeaders, usa `cumulative(columns)` desde rect.x/rect.y sin offset) y
 * CanvasPreview.tsx:577-597 (computeSelectedFrame, grid sin offset).
 * Fixture: Tablix7 de SalesCreditMemoESP (cabecera de fila de grupo + 2
 * cabeceras de columna). La lógica pura (`lib/tablix.ts` tablixLayout) ya
 * calcula bien el offset: el fallo está en el componente.
 * Remove `test.fail()` when fixing; the test must then pass.
 */
test.describe('BUG-33 cabeceras del Tablix desalineadas con cabeceras de grupo', () => {
  const ctx = useApp('SalesCreditMemoESP.rdlc');

  test('la cabecera de la columna 1 empieza donde empieza la celda (0,0) del cuerpo', async () => {
    const { page } = ctx();
    await selectItemViaPalette(page, 'Tablix7');
    await page.getByRole('button', { name: 'Seleccionar columna 1' }).click();
    await expect.poll(async () => (await selectedCell(page))?.id).toBe('Tablix7');

    // Contenido de la celda (0,0) del cuerpo.
    const tablix = await findItem(page, 'Tablix7');
    const content = tablix?.body?.rows[0]?.cells[0]?.content;
    expect(content, 'contenido de la celda (0,0)').toBeDefined();

    const geometry = await page.evaluate((contentId) => {
      const stage = (window as never as Record<string, unknown>)['__rdlcStage'] as {
        find(selector: (node: KonvaLike) => boolean): KonvaLike[];
        findOne(selector: (node: KonvaLike) => boolean): KonvaLike | undefined;
      };
      const column = stage.find((node) => node.name() === 'tablix-column-header')[0];
      const row = stage.find((node) => node.name() === 'tablix-row-header')[0];
      const cell = stage.findOne((node) => node.id() === contentId);
      if (!column || !row || !cell) return null;
      const columnLeft = column.getAbsoluteTransform().point({ x: 0, y: 0 }).x;
      const rowTop = row.getAbsoluteTransform().point({ x: 0, y: 0 }).y;
      const cellBox = cell.getClientRect();
      return { columnLeft, rowTop, cellLeft: cellBox.x, cellTop: cellBox.y };
    }, content!.id);
    expect(geometry, 'cabeceras y celda en el lienzo').not.toBeNull();

    expect(
      Math.abs(geometry!.columnLeft - geometry!.cellLeft),
      'x de la cabecera de columna vs x de la celda',
    ).toBeLessThan(2);
    expect(
      Math.abs(geometry!.rowTop - geometry!.cellTop),
      'y de la cabecera de fila vs y de la celda',
    ).toBeLessThan(2);
  });
});

/* -------------------------------- BUG-34 -------------------------------- */

/**
 * BUG-34 — Ctrl+Intro en ReportPropertiesForm aplica el valor VIEJO del campo
 * que se está editando: el NumberInput confirma su borrador en el mismo
 * keydown (setState asíncrono) y el keydown del formulario llama a
 * `applyPage()` con el estado de ese render.
 * Origen: apps/front/src/components/ui/number-input.tsx:183 (commitText en
 * Enter) vs ReportPropertiesForm.tsx:222-228 (Ctrl+Intro → applyPage).
 * Remove `test.fail()` when fixing; the test must then pass.
 */
test.describe('BUG-34 Ctrl+Intro aplica el margen anterior', () => {
  const ctx = useApp('SalesCreditMemoESP.rdlc');

  test('teclear un margen y pulsar Ctrl+Intro aplica el valor tecleado', async () => {
    const { page } = ctx();
    // Sin selección, el inspector muestra el formulario del informe.
    const panel = page.getByRole('region', { name: 'Propiedades del informe' });
    await expect(panel).toBeVisible();
    const before = await projection(page);
    const target = Math.round((toCm(before!.page.margins.top) + 0.3) * 100) / 100;

    const top = panel.getByLabel('Superior', { exact: true });
    await top.fill(String(target));
    await top.press('Control+Enter');

    await expect
      .poll(async () => toCm((await projection(page))!.page.margins.top), {
        message: 'el margen superior aplicado debe ser el tecleado',
        timeout: 3000,
      })
      .toBeCloseTo(target, 3);
  });
});

/* -------------------------------- BUG-38 -------------------------------- */

/**
 * BUG-38 — useDeferredColor: si la selección cambia dentro de la ventana de
 * 250 ms, el color pendiente se confirma sobre el item NUEVO. `commitRef` se
 * actualiza en cada render y BackgroundField no se remonta por item (no lleva
 * `key`), así que el temporizador entrega el color con el `commit` del item
 * recién seleccionado.
 * Origen: apps/front/src/hooks/useDeferredColor.ts:26-41 (commitRef +
 * scheduler) y components/panels/PropertiesPanel.tsx:157 (BackgroundField sin
 * key). La parte pura (lib/deferredColor.ts) es correcta: no captura destino.
 * Remove `test.fail()` when fixing; the test must then pass.
 */
test.describe('BUG-38 el color diferido cae en el item recién seleccionado', () => {
  const ctx = useApp('SalesCreditMemoESP.rdlc');

  test('cambiar de selección antes de 250 ms aplica el color al item original', async () => {
    const { page } = ctx();
    await selectItemViaPalette(page, 'Textbox4');
    const target = await nodeCenter(page, 'Textbox17');
    expect(target).not.toBeNull();
    const original17 = await itemBackground(page, 'Textbox17');

    // Elige color en Textbox4 y, sin esperar al commit diferido, selecciona Textbox17.
    await page.locator('input[aria-label="Color de fondo"]').evaluate((el) => {
      const input = el as HTMLInputElement;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(input, '#123456');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.mouse.click(target!.x, target!.y);
    await expect.poll(() => selectedId(page)).toBe('Textbox17');
    await page.waitForTimeout(800); // pasa la ventana del commit diferido

    expect(await itemBackground(page, 'Textbox17'), 'Textbox17 no debe recibir el color').toBe(
      original17,
    );
    expect((await itemBackground(page, 'Textbox4'))?.toUpperCase()).toBe('#123456');
  });
});

/* -------------------------------- BUG-39 -------------------------------- */

/**
 * BUG-39 — `deleteSelected` ignora la multiselección (el botón «Eliminar» de
 * la toolbar solo borra el último seleccionado) y limpia la selección aunque
 * el comando falle. (La tecla Supr sí borra en lote vía useEditorKeys.)
 * Origen: apps/front/src/hooks/useItemEditing.ts:906-910.
 * Remove `test.fail()` when fixing; the test must then pass.
 */
test.describe('BUG-39 Eliminar de la toolbar ignora la multiselección', () => {
  const ctx = useApp('SalesCreditMemoESP.rdlc');

  test('con dos items seleccionados, el botón Eliminar borra los dos', async () => {
    const { page } = ctx();
    await selectItemViaPalette(page, 'Textbox4');
    const center = await nodeCenter(page, 'Textbox17');
    expect(center).not.toBeNull();
    await page.keyboard.down('Control');
    await page.mouse.click(center!.x, center!.y);
    await page.keyboard.up('Control');
    await expect(page.getByTestId('multi-selection-panel')).toContainText('2 elementos');

    await page.getByRole('button', { name: 'Eliminar (Supr)' }).click();
    await expect.poll(async () => (await findItem(page, 'Textbox17')) === undefined).toBe(true);
    await expect
      .poll(async () => (await findItem(page, 'Textbox4')) === undefined, {
        message: 'Textbox4 también debe borrarse',
        timeout: 3000,
      })
      .toBe(true);
  });
});

/* -------------------------------- BUG-40 -------------------------------- */

/**
 * BUG-40 — `selectedCell` no se valida contra los límites de la rejilla: tras
 * borrar la última columna/fila sigue apuntando a un índice que ya no existe
 * (solo se comprueba que el Tablix siga existiendo).
 * Origen: apps/front/src/hooks/useItemEditing.ts:347-353.
 * Remove `test.fail()` when fixing; the test must then pass.
 */
test.describe('BUG-40 la celda seleccionada queda fuera de la rejilla', () => {
  const ctx = useApp('SalesCreditMemoESP.rdlc');

  test('borrar la última columna con su celda seleccionada no deja una selección fuera de rango', async () => {
    const { page } = ctx();
    await selectTablix(page, 'LinesTable2');
    const columns = (await findItem(page, 'LinesTable2'))!.body!.columns.length;
    expect(columns).toBeGreaterThan(1);

    await page.getByRole('button', { name: `Seleccionar columna ${columns}` }).click();
    await expect.poll(async () => (await selectedCell(page))?.col).toBe(columns - 1);

    await page.getByRole('button', { name: `Eliminar columna ${columns}` }).click();
    await expect
      .poll(async () => (await findItem(page, 'LinesTable2'))?.body?.columns.length)
      .toBe(columns - 1);

    const cell = await selectedCell(page);
    if (cell) {
      expect(cell.col, 'col dentro de la rejilla').toBeLessThan(columns - 1);
      expect(cell.endCol ?? cell.col, 'endCol dentro de la rejilla').toBeLessThan(columns - 1);
    }
  });
});

/* -------------------------------- BUG-41 -------------------------------- */

/**
 * BUG-41 — `useGlobalKeys` solo considera campo de texto INPUT/TEXTAREA/
 * SELECT: con el foco en un botón (toolbar, pestaña, slider…) las flechas
 * mueven el item seleccionado en vez de ser del control enfocado.
 * Origen: apps/front/src/hooks/useGlobalKeys.ts:53 (isTextField).
 * Remove `test.fail()` when fixing; the test must then pass.
 */
test.describe('BUG-41 las flechas con foco en un botón mueven el item', () => {
  const ctx = useApp('SalesCreditMemoESP.rdlc');

  test('ArrowRight con el foco en un botón de la toolbar no mueve la selección', async () => {
    const { page } = ctx();
    await selectItemViaPalette(page, 'Textbox93');
    const before = await itemLeftCm(page, 'Textbox93');

    await page.getByRole('button', { name: 'Informe…' }).focus();
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(600); // ventana del commit diferido del nudge

    expect(await itemLeftCm(page, 'Textbox93')).toBeCloseTo(before!, 4);
  });
});

/* -------------------------------- BUG-44 -------------------------------- */

/**
 * BUG-44 — Parseo del NumberInput (`Number.parseFloat(draft.replace(',', '.'))`):
 * acepta basura final («12abc» → 12) y trunca los separadores de miles
 * («1.234,5» → 1.234). El parseo no está exportado (no hay test unitario
 * posible), así que se prueba en el campo «X» del panel.
 * El tercer caso descrito (en estado mixto `null`, teclear 0 no confirma) NO
 * es alcanzable hoy desde la UI: todos los NumberInput con `value={null}`
 * tienen `min ≥ 1` (tamaño de fuente de lote/run), y el clamp convierte el 0
 * en un valor distinto de 0 que sí se confirma.
 * Origen: apps/front/src/components/ui/number-input.tsx:89-101 (commitText).
 * Remove `test.fail()` when fixing; the test must then pass.
 */
test.describe('BUG-44 el NumberInput acepta texto inválido', () => {
  const ctx = useApp('SalesCreditMemoESP.rdlc');

  test('«12abc» se rechaza (no mueve el item a 12 cm)', async () => {
    const { page } = ctx();
    await selectItemViaPalette(page, 'Textbox93');
    const before = await itemLeftCm(page, 'Textbox93');
    const field = page.getByLabel('X', { exact: true });
    await field.fill('12abc');
    await field.press('Enter');
    await page.waitForTimeout(500);
    expect(await itemLeftCm(page, 'Textbox93')).toBeCloseTo(before!, 4);
  });

  test('«1.234,5» no se trunca a 1,234', async () => {
    const { page } = ctx();
    await selectItemViaPalette(page, 'Textbox93');
    const field = page.getByLabel('X', { exact: true });
    await field.fill('1.234,5');
    await field.press('Enter');
    await page.waitForTimeout(500);
    // Correcto: o se interpreta como 1234,5 (y el dominio lo limita) o se
    // rechaza; nunca se queda con «1.234» descartando «,5» en silencio.
    expect(await itemLeftCm(page, 'Textbox93')).not.toBeCloseTo(1.234, 3);
  });
});
