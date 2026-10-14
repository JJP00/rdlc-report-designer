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

/**
 * Punto del borde superior de un Tablix (anillo de hit) para seleccionarlo,
 * **medio px de papel dentro** del borde: el anillo mide 4 px de papel hacia
 * fuera y 1 hacia dentro, y con zoom 60 % un offset fijo de 2 px de pantalla
 * queda a 0,25 px del borde exterior (el redondeo lo saca del anillo).
 */
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
      scaleX(): number;
    };
    const borders = stage.find(
      (node) => node.className === 'Rect' && typeof node.getAttr('hitFunc') === 'function',
    );
    const border = borders.find((candidate) => candidate.getParent().id() === tablixId);
    if (!border) return null;
    const container = stage.container().getBoundingClientRect();
    const point = border.getAbsoluteTransform().point({ x: border.width() / 2, y: 0 });
    return { x: container.left + point.x, y: container.top + point.y + stage.scaleX() / 2 };
  }, id);
}

/**
 * Limpia la selección pinchando la esquina del papel (dentro del margen, sin
 * items): el clic cae en el `Stage` y el lienzo deselecciona. Los manejadores y
 * bandas de la selección anterior tapan los bordes vecinos (a veces a 4 px,
 * como `Tablix2` sobre `LinesTable2`) y el clic no cambiaría la selección.
 */
async function clearSelection(page: Page): Promise<void> {
  const point = await page.evaluate(() => {
    const stage = (window as never as Record<string, unknown>)['__rdlcStage'] as {
      container(): HTMLElement;
      scaleX(): number;
    };
    const container = stage.container().getBoundingClientRect();
    const zoom = stage.scaleX();
    return { x: container.left + 4 * zoom, y: container.top + 4 * zoom };
  });
  await page.mouse.click(point.x, point.y);
  await page
    .waitForFunction(
      () =>
        !((window as never as Record<string, unknown>)['__rdlcSelection'] as { id?: string } | null)
          ?.id,
      undefined,
      { timeout: 2000 },
    )
    .catch(() => undefined);
}

async function selectTablix(page: Page, id: string): Promise<void> {
  await clearSelection(page);
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

/* ------------------------------ diálogos -------------------------------- */

/** Caja en pantalla de un elemento; falla con un mensaje claro si no está. */
async function boxOf(
  locator: Locator,
): Promise<{ x: number; y: number; width: number; height: number }> {
  const box = await locator.boundingBox();
  expect(box, `bounding box de ${String(locator)}`).not.toBeNull();
  return box!;
}

/**
 * Espera a que la caja deje de moverse: tras un arrastre o un cambio de
 * ventana el renderer sigue procesando input y reflujos encolados, así que
 * medir de inmediato puede leer un estado intermedio (mismo motivo que
 * `stableBox` en `rdlc-designer.spec.ts`).
 */
async function stableBox(
  page: Page,
  locator: Locator,
): Promise<{ x: number; y: number; width: number; height: number }> {
  let box = await boxOf(locator);
  for (let attempt = 0; attempt < 30; attempt += 1) {
    await page.waitForTimeout(50);
    const next = await boxOf(locator);
    if (
      box.x === next.x &&
      box.y === next.y &&
      box.width === next.width &&
      box.height === next.height
    ) {
      return next;
    }
    box = next;
  }
  return box;
}

/** Centro en pantalla de una caja (el resize centrado no debe moverlo). */
function centerOf(box: { x: number; y: number; width: number; height: number }): {
  x: number;
  y: number;
} {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** Abre «Propiedades del informe» y espera a que la animación de entrada repose. */
async function openReportProperties(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: 'Informe…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Propiedades del informe' });
  await expect(dialog).toBeVisible();
  await stableBox(page, dialog); // `data-open:animate-in` reposa
  return dialog;
}

/** Arrastra la agarradera del diálogo los píxeles indicados. */
async function dragGrip(page: Page, dx: number, dy: number): Promise<void> {
  // Búsqueda global: la agarradera puede vivir dentro del marco (arreglado) o
  // en un portal (antes de BUG-61), y el E2E existente la busca así.
  const gripLocator = page.locator('[data-rdlc-dialog-grip]');
  await expect(gripLocator).toBeVisible();
  const grip = await boxOf(gripLocator);
  const x = grip.x + grip.width / 2;
  const y = grip.y + grip.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 10 });
  await page.mouse.up();
  await stableBox(page, gripLocator); // la agarradera deja de moverse
}

/**
 * Cambia el tamaño de la ventana (borde exterior, px CSS). Con `setSize` el
 * viewport queda algo por debajo del valor pedido; `setContentSize` da un
 * tamaño de contenido poco fiable en la ventana e2e (sin foco y fuera de
 * pantalla), así que el test pide "una ventana pequeña", no un cliente exacto.
 */
async function resizeWindow(
  app: ElectronApplication,
  width: number,
  height: number,
): Promise<void> {
  await app.evaluate(
    ({ BrowserWindow }, size) => {
      BrowserWindow.getAllWindows()[0]?.setSize(size.width, size.height);
    },
    { width, height },
  );
}

/* -------------------------------- BUG-60 -------------------------------- */

/**
 * BUG-60 — La agarradera de la esquina inferior derecha no sigue al cursor:
 * el diálogo está centrado con `translate(-50 %, -50 %)`, así que al crecer
 * `dx` el borde derecho avanza `dx / 2` y el izquierdo retrocede `dx / 2`.
 * Origen: `dialog.tsx` (clase `fixed top-1/2 left-1/2 … -translate-x-1/2
 * -translate-y-1/2` y `onPointerMove` → `setSize(clampSize(start + delta))`).
 * Correcto: mientras se arrastra, el borde agarrado sigue al cursor 1:1 y el
 * centro no se mueve (el borde opuesto se mueve simétrico). Decisión del
 * usuario (2026-10-13): el diálogo **no debe descentrarse** al redimensionar,
 * así que el tamaño crece el doble del delta en vez de fijar la esquina.
 * Remove `test.fail()` when fixing; the test must then pass.
 */
test.describe('BUG-60…65 los diálogos redimensionables comparten la agarradera', () => {
  const ctx = useApp('SalesCreditMemoESP.rdlc');

  // La app es compartida por todo el `describe`: cada test cierra su diálogo.
  test.afterEach(async () => {
    const { page } = ctx();
    await page.keyboard.press('Escape');
  });

  test('arrastrar 100 px mueve los bordes 100 px y deja el diálogo centrado', async () => {
    const { page } = ctx();
    const dialog = await openReportProperties(page);
    // Primero se encoge: el alto natural toca el tope del viewport y no habría
    // 100 px de recorrido hacia abajo para comprobar el 1:1.
    await dragGrip(page, -200, -200);
    const before = await stableBox(page, dialog);

    await dragGrip(page, 100, 100);
    const after = await stableBox(page, dialog);

    // El centro no se mueve: el borde opuesto se mueve simétrico (−100).
    const centerBefore = centerOf(before);
    const centerAfter = centerOf(after);
    expect(
      Math.abs(centerAfter.x - centerBefore.x),
      'centro horizontal quieto',
    ).toBeLessThanOrEqual(1);
    expect(Math.abs(centerAfter.y - centerBefore.y), 'centro vertical quieto').toBeLessThanOrEqual(
      1,
    );
    expect(Math.abs(after.x - (before.x - 100)), 'borde izquierdo simétrico').toBeLessThanOrEqual(
      1,
    );
    expect(Math.abs(after.y - (before.y - 100)), 'borde superior simétrico').toBeLessThanOrEqual(1);
    expect(
      Math.abs(after.x + after.width - (before.x + before.width + 100)),
      'borde derecho a 100 px del cursor',
    ).toBeLessThanOrEqual(1);
    expect(
      Math.abs(after.y + after.height - (before.y + before.height + 100)),
      'borde inferior a 100 px del cursor',
    ).toBeLessThanOrEqual(1);
  });

  /* -------------------------------- BUG-61 -------------------------------- */

  /**
   * BUG-61 — La agarradera se pintaba en un portal a `document.body` y su
   * posición salía de un `ResizeObserver` + `setTimeout(200)`: durante la
   * animación de entrada medía el rectángulo escalado y quedaba descolocada (una
   * vuelta de render por detrás del marco).
   * Origen: `dialog.tsx` (portal + `corner` + observer + timer).
   * Correcto: la agarradera es parte del marco y está pegada a su esquina desde
   * el primer fotograma, animación incluida.
   * Remove `test.fail()` when fixing; the test must then pass.
   */
  test('BUG-61: es parte del diálogo y sigue su esquina durante la animación de entrada', async () => {
    const { page } = ctx();
    await page.getByRole('button', { name: 'Informe…' }).click();
    const dialog = page.getByRole('dialog', { name: 'Propiedades del informe' });
    await expect(dialog).toBeVisible();
    const grip = dialog.locator('[data-rdlc-dialog-grip]');
    await expect(grip).toBeVisible();

    // Sin esperar a que repose `zoom-in-95`: ambos escalan juntos.
    for (let frame = 0; frame < 6; frame += 1) {
      const box = await boxOf(dialog);
      const handle = await boxOf(grip);
      expect(
        Math.abs(handle.x + handle.width - (box.x + box.width)),
        `esquina derecha (fotograma ${frame})`,
      ).toBeLessThanOrEqual(8);
      expect(
        Math.abs(handle.y + handle.height - (box.y + box.height)),
        `esquina inferior (fotograma ${frame})`,
      ).toBeLessThanOrEqual(8);
      await page.waitForTimeout(50);
    }
  });

  /* -------------------------------- BUG-62 -------------------------------- */

  /**
   * BUG-62 — El tamaño en píxeles se recorta solo dentro del arrastre; después
   * se queda con `maxWidth/maxHeight: none`. Al encoger la ventana el diálogo
   * sigue más grande que el viewport y sus botones quedan fuera de alcance.
   * Origen: `dialog.tsx` (`clampSize` solo en el arrastre y estilos en línea).
   * Correcto: el tamaño es una preferencia con tope de viewport (`min(px, 95vw)`
   * / `min(px, 90vh)`): al encoger se recorta y al crecer se recupera.
   * Remove `test.fail()` when fixing; the test must then pass.
   */
  test('BUG-62: encoger la ventana deja el diálogo dentro del viewport y al crecer recupera el tamaño', async () => {
    const { app, page } = ctx();
    const dialog = await openReportProperties(page);
    await dragGrip(page, 400, 60); // «demasiado grande» para 960×600
    const oversized = await stableBox(page, dialog);

    await resizeWindow(app, 960, 600);
    // La app impone un mínimo de **contenido** de 960×600 (`applyMinimumSize`
    // en `main.ts`): al pedir 960×600 exteriores el cliente queda en el mínimo
    // más el marco/redondeo de la ventana e2e (medido 602), no por debajo. Se
    // comprueba que quedó en el mínimo, no un tamaño de cliente exacto.
    await expect.poll(() => page.evaluate(() => window.innerWidth)).toBeLessThanOrEqual(968);
    await expect.poll(() => page.evaluate(() => window.innerHeight)).toBeLessThanOrEqual(608);
    const viewport = await page.evaluate(() => ({
      width: window.innerWidth,
      height: window.innerHeight,
    }));
    expect(
      oversized.width > viewport.width * 0.95 || oversized.height > viewport.height * 0.9,
      'el diálogo debe quedar sobredimensionado para el viewport pequeño',
    ).toBe(true);

    const small = await stableBox(page, dialog);
    expect(small.x, 'borde izquierdo dentro del viewport').toBeGreaterThanOrEqual(0);
    expect(small.y, 'borde superior dentro del viewport').toBeGreaterThanOrEqual(0);
    expect(small.x + small.width, 'borde derecho dentro del viewport').toBeLessThanOrEqual(
      viewport.width + 1,
    );
    expect(small.y + small.height, 'borde inferior dentro del viewport').toBeLessThanOrEqual(
      viewport.height + 1,
    );

    // El pie (BUG-64) sigue a la vista: «Aplicar» dentro del viewport.
    const apply = dialog.getByRole('button', { name: 'Aplicar' });
    await expect(apply).toBeVisible();
    const button = await boxOf(apply);
    expect(button.y + button.height, '«Aplicar» dentro del viewport').toBeLessThanOrEqual(
      viewport.height + 1,
    );

    // Al recuperar la ventana vuelve el tamaño preferido.
    await resizeWindow(app, 1500, 950);
    await expect.poll(() => page.evaluate(() => window.innerWidth)).toBeGreaterThan(1400);
    const recovered = await stableBox(page, dialog);
    expect(Math.abs(recovered.width - oversized.width), 'ancho recuperado').toBeLessThanOrEqual(2);
    expect(Math.abs(recovered.height - oversized.height), 'alto recuperado').toBeLessThanOrEqual(2);
  });

  /* -------------------------------- BUG-64 -------------------------------- */

  /**
   * BUG-64 — En «Propiedades del informe» el contenido entero (cabecera y pie
   * incluidos) es el contenedor de scroll (`max-h-[85vh] overflow-y-auto`): al
   * encoger el diálogo, «Aplicar» queda por debajo del pliegue.
   * Origen: `ReportPropertiesDialog.tsx` + `ReportPropertiesForm.tsx` (el
   * `DialogFooter` va al final del formulario, dentro del scroll).
   * Correcto: marco en columna con el cuerpo con scroll propio y el pie fijo
   * (como TextEditorDialog, GroupPropertiesDialog y TablixFiltersDialog).
   * Remove `test.fail()` when fixing; the test must then pass.
   */
  test('BUG-64: con el diálogo al mínimo, el título y «Aplicar» siguen a la vista', async () => {
    const { page } = ctx();
    const dialog = await openReportProperties(page);
    await dragGrip(page, 0, -700); // hasta el alto mínimo (220 px)

    await expect
      .poll(async () => (await boxOf(dialog)).height, {
        message: 'el diálogo se encogió hasta el mínimo',
        timeout: 5000,
      })
      .toBeLessThanOrEqual(230);
    const shortened = await stableBox(page, dialog);
    expect(shortened.height, 'el diálogo se encogió hasta el mínimo').toBeLessThanOrEqual(230);

    await expect(dialog.getByRole('heading', { name: 'Propiedades del informe' })).toBeVisible();
    const apply = dialog.getByRole('button', { name: 'Aplicar' });
    await expect(apply).toBeVisible();
    const viewport = await page.evaluate(() => ({
      width: window.innerWidth,
      height: window.innerHeight,
    }));
    const button = await boxOf(apply);
    expect(button.y + button.height, '«Aplicar» dentro del viewport').toBeLessThanOrEqual(
      viewport.height + 1,
    );
  });

  /* -------------------------------- BUG-65 -------------------------------- */

  /**
   * BUG-65 — El tamaño elegido sobrevive al cierre: `size` es estado de
   * `DialogContent`, que el padre mantiene montado (Radix desmonta solo su
   * contenido), así que al reabrir el diálogo aparece con el tamaño anterior.
   * Origen: `dialog.tsx` (`useState` de `size` sin reinicio).
   * Correcto: al cerrar se vuelve al tamaño original (reiniciar es el defecto
   * seguro elegido por el documento).
   * Remove `test.fail()` when fixing; the test must then pass.
   */
  test('BUG-65: cerrar y reabrir devuelve el diálogo a su tamaño original', async () => {
    const { page } = ctx();
    const dialog = await openReportProperties(page);
    const original = await stableBox(page, dialog);

    await dragGrip(page, 150, 60);
    const grown = await stableBox(page, dialog);
    expect(grown.width, 'creció al arrastrar la agarradera').toBeGreaterThan(original.width + 100);

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();

    const reopened = await openReportProperties(page);
    const after = await stableBox(page, reopened);
    expect(Math.abs(after.width - original.width), 'ancho original').toBeLessThanOrEqual(2);
    expect(Math.abs(after.height - original.height), 'alto original').toBeLessThanOrEqual(2);
  });

  /* -------------------------------- BUG-63 -------------------------------- */

  /** Ejecuta una acción de la paleta (Ctrl+K) por su texto. */
  async function runPaletteAction(page: Page, query: string, name: RegExp): Promise<void> {
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
    await page.keyboard.press('Control+k');
    await page.getByPlaceholder('Buscar elemento, variable o acción…').fill(query);
    await page.waitForTimeout(250);
    await page.getByRole('option', { name }).click();
  }

  /**
   * Arrastra la agarradera de un diálogo concreto (no la primera del DOM): con
   * diálogos anidados (una expresión dentro de propiedades) hay más de una.
   */
  async function dragDialogGrip(
    page: Page,
    dialog: Locator,
    dx: number,
    dy: number,
  ): Promise<void> {
    const grip = dialog.locator('[data-rdlc-dialog-grip]');
    await expect(grip).toBeVisible();
    const gripBox = await boxOf(grip);
    const x = gripBox.x + gripBox.width / 2;
    const y = gripBox.y + gripBox.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + dx, y + dy, { steps: 10 });
    await page.mouse.up();
    await stableBox(page, dialog); // la agarradera deja de moverse
  }

  /**
   * BUG-63 — La agarradera (con su marco de mínimo 320×220, máximo el viewport,
   * doble clic para volver al tamaño original y cabecera/pie fijos con el scroll
   * solo en el cuerpo) existía únicamente en «Propiedades del informe»; cada
   * diálogo tenía topes distintos y `ExpressionDialog` no tenía scroll interno.
   * Correcto: el editor de texto, el diálogo de expresión, las propiedades del
   * grupo y los filtros del Tablix comparten `ResizableDialogContent` +
   * `DialogBody`; las guardas (cambios sin guardar) siguen fijas y sin agarradera.
   */
  test('BUG-63: el editor de texto se arrastra 1:1 y con el alto mínimo título y acciones siguen a la vista', async () => {
    const { page } = ctx();
    await selectItemViaPalette(page, 'Textbox128');
    await runPaletteAction(page, 'Editar el texto', /Editar el texto/);
    const dialog = page.getByRole('dialog', { name: 'Texto de Textbox128' });
    await expect(dialog).toBeVisible();
    await stableBox(page, dialog); // reposa la animación de entrada
    await expect(dialog.locator('[data-rdlc-dialog-grip]')).toBeVisible();

    // Primero se encoge: así el crecimiento posterior no topa con el viewport.
    await dragDialogGrip(page, dialog, -150, -150);
    const before = await stableBox(page, dialog);
    await dragDialogGrip(page, dialog, 80, 60);
    const after = await stableBox(page, dialog);
    // Centrado: el borde agarrado sigue al cursor y el centro no se mueve.
    const centerBefore = centerOf(before);
    const centerAfter = centerOf(after);
    expect(
      Math.abs(centerAfter.x - centerBefore.x),
      'centro horizontal quieto',
    ).toBeLessThanOrEqual(1);
    expect(Math.abs(centerAfter.y - centerBefore.y), 'centro vertical quieto').toBeLessThanOrEqual(
      1,
    );
    expect(
      Math.abs(after.x + after.width - (before.x + before.width + 80)),
      'borde derecho a 80 px del cursor',
    ).toBeLessThanOrEqual(1);
    expect(
      Math.abs(after.y + after.height - (before.y + before.height + 60)),
      'borde inferior a 60 px del cursor',
    ).toBeLessThanOrEqual(1);

    // Al alto mínimo (220 px): cabecera y pie fijos; solo scrollea el cuerpo.
    await dragDialogGrip(page, dialog, 0, -700);
    await expect
      .poll(async () => (await boxOf(dialog)).height, {
        message: 'el diálogo se encogió hasta el mínimo',
        timeout: 5000,
      })
      .toBeLessThanOrEqual(230);
    await expect(dialog.getByRole('heading', { name: 'Texto de Textbox128' })).toBeVisible();
    const viewport = await page.evaluate(() => ({
      width: window.innerWidth,
      height: window.innerHeight,
    }));
    for (const name of ['Cancelar', 'Aplicar']) {
      const button = dialog.getByRole('button', { name });
      await expect(button).toBeVisible();
      const buttonBox = await boxOf(button);
      expect(buttonBox.y + buttonBox.height, `«${name}» dentro del viewport`).toBeLessThanOrEqual(
        viewport.height + 1,
      );
    }

    await dialog.getByRole('button', { name: 'Cancelar' }).click();
    await expect(dialog).toBeHidden();
  });

  test('BUG-63: el diálogo de expresión se arrastra 1:1 y con el alto mínimo título y acciones siguen a la vista', async () => {
    const { page } = ctx();
    await selectItemViaPalette(page, 'Textbox4');
    await page.getByRole('button', { name: 'Abrir editor de la expresión de visibilidad' }).click();
    const dialog = page.getByRole('dialog', { name: 'Expresión de visibilidad' });
    await expect(dialog).toBeVisible();
    await stableBox(page, dialog);
    await expect(dialog.locator('[data-rdlc-dialog-grip]')).toBeVisible();
    await expect(dialog.locator('.monaco-editor')).toBeVisible({ timeout: 15_000 });

    await dragDialogGrip(page, dialog, -150, -150);
    const before = await stableBox(page, dialog);
    await dragDialogGrip(page, dialog, 80, 60);
    const after = await stableBox(page, dialog);
    // Centrado: el borde agarrado sigue al cursor y el centro no se mueve.
    const centerBefore = centerOf(before);
    const centerAfter = centerOf(after);
    expect(
      Math.abs(centerAfter.x - centerBefore.x),
      'centro horizontal quieto',
    ).toBeLessThanOrEqual(1);
    expect(Math.abs(centerAfter.y - centerBefore.y), 'centro vertical quieto').toBeLessThanOrEqual(
      1,
    );
    expect(
      Math.abs(after.x + after.width - (before.x + before.width + 80)),
      'borde derecho a 80 px del cursor',
    ).toBeLessThanOrEqual(1);
    expect(
      Math.abs(after.y + after.height - (before.y + before.height + 60)),
      'borde inferior a 60 px del cursor',
    ).toBeLessThanOrEqual(1);

    // Monaco mide 380 px: al mínimo el cuerpo scrollea y el pie queda fijo.
    await dragDialogGrip(page, dialog, 0, -700);
    await expect
      .poll(async () => (await boxOf(dialog)).height, {
        message: 'el diálogo se encogió hasta el mínimo',
        timeout: 5000,
      })
      .toBeLessThanOrEqual(230);
    await expect(dialog.getByRole('heading', { name: 'Expresión de visibilidad' })).toBeVisible();
    await expect(dialog.locator('.monaco-editor')).toBeAttached();
    const viewport = await page.evaluate(() => ({
      width: window.innerWidth,
      height: window.innerHeight,
    }));
    for (const name of ['Cancelar', 'Aplicar']) {
      const button = dialog.getByRole('button', { name });
      await expect(button).toBeVisible();
      const buttonBox = await boxOf(button);
      expect(buttonBox.y + buttonBox.height, `«${name}» dentro del viewport`).toBeLessThanOrEqual(
        viewport.height + 1,
      );
    }

    await dialog.getByRole('button', { name: 'Cancelar' }).click();
    await expect(dialog).toBeHidden();
  });

  test('BUG-63: propiedades del grupo y filtros del Tablix comparten la agarradera', async () => {
    const { page } = ctx();
    await selectItemViaPalette(page, 'Tablix7');

    await page.getByRole('button', { name: 'Propiedades del grupo de la fila 1' }).click();
    const group = page.getByRole('dialog', { name: /Propiedades del grupo/ });
    await expect(group).toBeVisible();
    await stableBox(page, group);
    await expect(group.locator('[data-rdlc-dialog-grip]')).toBeVisible();
    await group.getByRole('button', { name: 'Cancelar' }).click();
    await expect(group).toBeHidden();

    await page.getByRole('button', { name: 'Filtros (1)' }).click();
    const filters = page.getByRole('dialog', { name: 'Filtros del Tablix' });
    await expect(filters).toBeVisible();
    const filterBefore = await stableBox(page, filters);
    await expect(filters.locator('[data-rdlc-dialog-grip]')).toBeVisible();
    await dragDialogGrip(page, filters, -120, -80);
    const filterAfter = await stableBox(page, filters);
    expect(filterAfter.height, 'se encogió al arrastrar la agarradera').toBeLessThan(
      filterBefore.height,
    );
    const filterCenterBefore = centerOf(filterBefore);
    const filterCenterAfter = centerOf(filterAfter);
    expect(
      Math.abs(filterCenterAfter.y - filterCenterBefore.y),
      'centro vertical quieto',
    ).toBeLessThanOrEqual(1);
    const viewport = await page.evaluate(() => ({
      width: window.innerWidth,
      height: window.innerHeight,
    }));
    const apply = filters.getByRole('button', { name: 'Aplicar' });
    await expect(apply).toBeVisible();
    const applyBox = await boxOf(apply);
    expect(applyBox.y + applyBox.height, '«Aplicar» dentro del viewport').toBeLessThanOrEqual(
      viewport.height + 1,
    );
    await filters.getByRole('button', { name: 'Cancelar' }).click();
    await expect(filters).toBeHidden();
  });

  test('BUG-63: la guarda de cambios sin guardar sigue fija, sin agarradera', async () => {
    const { app, page } = ctx();
    // Un cambio real hace que cerrar la ventana pida confirmación.
    const before = (await projection(page))!.page.body.items.length;
    await page.getByRole('button', { name: 'Insertar textbox' }).click();
    await expect
      .poll(async () => (await projection(page))!.page.body.items.length)
      .toBe(before + 1);

    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.close();
    });
    const confirm = page.getByTestId('unsaved-changes-dialog');
    await expect(confirm).toBeVisible();
    await expect(confirm.locator('[data-rdlc-dialog-grip]')).toHaveCount(0);
    await expect(page.locator('[data-rdlc-dialog-grip]')).toHaveCount(0);

    // Cancelar deja la ventana abierta (la guarda es fija, no redimensionable).
    await confirm.getByRole('button', { name: 'Cancelar' }).click();
    await expect(confirm).toBeHidden();
  });
});
