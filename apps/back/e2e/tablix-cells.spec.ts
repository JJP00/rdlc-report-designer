import { appEnv } from './launch.js';
import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import { copyFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * E2E de las celdas de Tablix: formato heredado al insertar filas/columnas,
 * items insertados que ocupan su celda, pegar dentro de un rectángulo y
 * copiar/pegar de celdas. Se lanza el build de `out/` con una **copia**
 * temporal del informe (el corpus no se toca) y se interactúa con ratón y
 * teclado reales sobre el lienzo Konva; se verifica por la proyección viva
 * (`window.__rdlcProjection`) y el pie de estado.
 */

const here = fileURLToPath(new URL('.', import.meta.url));
const mainEntry = join(here, '..', 'out', 'main', 'main.js');
const fixture = join(here, '..', '..', '..', 'fixtures', 'corpus', 'SalesCreditMemoESP.rdlc');

let app: ElectronApplication;
let page: Page;
let workspace = '';
/** Huella del informe recién abierto (la proyección sin su `version`). */
let initialFingerprint = '';

test.beforeAll(async () => {
  workspace = join(tmpdir(), `rdlc-e2e-cells-${Date.now()}`);
  mkdirSync(workspace, { recursive: true });
  const file = join(workspace, 'SalesCreditMemoESP.rdlc');
  copyFileSync(fixture, file);

  app = await electron.launch({
    args: [mainEntry, file, `--user-data-dir=${join(workspace, 'user-data')}`],
    env: appEnv(),
  });
  page = await app.firstWindow();
  await page.waitForFunction(() =>
    Boolean((window as never as Record<string, unknown>)['__rdlcStage']),
  );
  await page.waitForFunction(() =>
    Boolean((window as never as Record<string, unknown>)['__rdlcProjection']),
  );
  initialFingerprint = await projectionFingerprint();
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
  try {
    rmSync(workspace, { recursive: true, force: true });
  } catch {
    // Windows puede retener el handle un instante: el temporal se queda.
  }
});

/* ------------------------------- tipos ---------------------------------- */

interface Len {
  value: number;
  unit: string;
}

interface StyleLike {
  [key: string]: unknown;
}

interface ItemLike {
  id: string;
  kind: string;
  top?: Len;
  left?: Len;
  width?: Len;
  height?: Len;
  style?: StyleLike;
  paragraphs?: { runs: { value: string; style?: StyleLike }[]; style?: StyleLike }[];
  children?: ItemLike[];
  body?: {
    columns: Len[];
    rows: { height: Len; cells: (CellLike | null)[] }[];
  };
}

interface CellLike {
  colSpan?: number;
  rowSpan?: number;
  content?: ItemLike;
}

interface Projection {
  version: number;
  page: {
    header: { items: ItemLike[] };
    body: { items: ItemLike[] };
    footer: { items: ItemLike[] };
  };
}

interface KonvaLike {
  id(): string;
  getClientRect(options: { relativeTo: unknown }): {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

/* ------------------------------- helpers -------------------------------- */

async function projection(): Promise<Projection> {
  return page.evaluate(
    () => (window as never as Record<string, unknown>)['__rdlcProjection'] as Projection,
  );
}

/**
 * Huella del documento: la proyección **sin** `version` (que sube a cada
 * mutación). Al deshacer todo vuelve a ser la del informe recién abierto.
 */
async function projectionFingerprint(): Promise<string> {
  return page.evaluate(() => {
    const projection = (window as never as Record<string, unknown>)['__rdlcProjection'] as
      Record<string, unknown> | null | undefined;
    if (!projection) return '';
    const copy = { ...projection };
    delete copy.version;
    return JSON.stringify(copy);
  });
}

/**
 * Deja el documento como al abrir: cierra menús y deshace todo lo pendiente
 * hasta que la huella coincide con la inicial y se queda quieta (ventana de
 * calma para los commits diferidos). Así cada test parte del mismo estado.
 */
async function resetDocument(): Promise<void> {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
  await page.keyboard.press('Escape');

  for (let round = 0; round < 3; round += 1) {
    let stalls = 0;
    let undone = false;
    for (let index = 0; index < 40 && stalls < 4; index += 1) {
      if ((await projectionFingerprint()) === initialFingerprint) break;
      const before = (await projection()).version;
      await page.keyboard.press('Control+z');
      const changed = await page
        .waitForFunction(
          (version) => {
            const projection = (window as never as Record<string, unknown>)['__rdlcProjection'] as {
              version?: number;
            } | null;
            return Boolean(projection) && projection?.version !== version;
          },
          before,
          { timeout: 1000 },
        )
        .then(() => true)
        .catch(() => false);
      stalls = changed ? 0 : stalls + 1;
      undone = undone || changed;
    }

    const version = (await projection()).version;
    await page.waitForTimeout(undone ? 450 : 100);
    if (
      (await projection()).version === version &&
      (await projectionFingerprint()) === initialFingerprint
    ) {
      return;
    }
  }

  const status = await statusText().catch(() => null);
  throw new Error(`resetDocument no convergió al estado inicial: ${status ?? 'sin estado'}`);
}

test.afterEach(async () => {
  await resetDocument();
});

/** Busca un item en regiones, rectángulos y celdas de Tablix (recursivo). */
function findItem(items: ItemLike[], id: string): ItemLike | undefined {
  for (const item of items) {
    const found = findItemDeep(item, id);
    if (found) return found;
  }
  return undefined;
}

function findItemDeep(item: ItemLike, id: string): ItemLike | undefined {
  if (item.id === id) return item;
  for (const child of item.children ?? []) {
    const found = findItemDeep(child, id);
    if (found) return found;
  }
  for (const row of item.body?.rows ?? []) {
    for (const cell of row.cells ?? []) {
      if (!cell?.content) continue;
      const found = findItemDeep(cell.content, id);
      if (found) return found;
    }
  }
  return undefined;
}

/** Todos los ids de item de la proyección (para detectar los recién creados). */
function allIds(proj: Projection): Set<string> {
  const ids = new Set<string>();
  const walk = (item: ItemLike): void => {
    ids.add(item.id);
    (item.children ?? []).forEach(walk);
    for (const row of item.body?.rows ?? []) {
      for (const cell of row.cells ?? []) if (cell?.content) walk(cell.content);
    }
  };
  for (const items of [proj.page.header.items, proj.page.body.items, proj.page.footer.items]) {
    items.forEach(walk);
  }
  return ids;
}

function findInProjection(proj: Projection, id: string): ItemLike | undefined {
  for (const items of [proj.page.header.items, proj.page.body.items, proj.page.footer.items]) {
    const found = findItem(items, id);
    if (found) return found;
  }
  return undefined;
}

async function item(id: string): Promise<ItemLike | undefined> {
  return findInProjection(await projection(), id);
}

function toCm(length: Len): number {
  if (length.unit === 'mm') return length.value / 10;
  if (length.unit === 'in') return length.value * 2.54;
  if (length.unit === 'pt') return (length.value * 2.54) / 72;
  return length.value;
}

/** Celda (row, col) de la rejilla, contando los espacios de las anteriores. */
function cellAt(tablix: ItemLike | undefined, row: number, col: number): CellLike | undefined {
  const cells = tablix?.body?.rows[row]?.cells ?? [];
  let current = 0;
  for (const cell of cells) {
    if (current === col) return cell ?? undefined;
    current += cell?.colSpan ?? 1;
  }
  return undefined;
}

async function cellContentAt(
  tablixId: string,
  row: number,
  col: number,
): Promise<ItemLike | undefined> {
  return cellAt(await item(tablixId), row, col)?.content ?? undefined;
}

/** Texto (valor del primer run) de un textbox. */
function textOf(content: ItemLike | undefined): string | undefined {
  return content?.paragraphs?.[0]?.runs[0]?.value;
}

/** Formato visual de un textbox: su `Style`, el del primer párrafo y el del primer run. */
function formatOf(content: ItemLike | undefined): {
  style: StyleLike | undefined;
  paragraph: StyleLike | undefined;
  run: StyleLike | undefined;
} {
  const paragraph = content?.paragraphs?.[0];
  return {
    style: content?.style,
    paragraph: paragraph?.style,
    run: paragraph?.runs[0]?.style,
  };
}

async function rowHeights(tablixId: string): Promise<number[]> {
  return ((await item(tablixId))?.body?.rows ?? []).map((row) => toCm(row.height));
}

async function columnWidths(tablixId: string): Promise<number[]> {
  return ((await item(tablixId))?.body?.columns ?? []).map((column) => toCm(column));
}

async function selectedId(): Promise<string | null> {
  return page.evaluate(
    () =>
      ((window as never as Record<string, unknown>)['__rdlcSelection'] as { id?: string } | null)
        ?.id ?? null,
  );
}

async function selectionIds(): Promise<string[]> {
  return page.evaluate(
    () => ((window as never as Record<string, unknown>)['__rdlcSelectionIds'] as string[]) ?? [],
  );
}

/** Texto del pie de estado (mensaje de la última acción). */
async function statusText(): Promise<string> {
  return (await page.getByRole('status').first().textContent()) ?? '';
}

/** Punto de pantalla de un nodo Konva por id (su centro, o la fracción `fx`/`fy`). */
async function nodeCenter(
  id: string,
  fx = 0.5,
  fy = 0.5,
): Promise<{ x: number; y: number } | null> {
  return page.evaluate(
    ({ nodeId, fx, fy }) => {
      const stage = (window as never as Record<string, unknown>)['__rdlcStage'] as {
        findOne(selector: (node: KonvaLike) => boolean): KonvaLike | undefined;
        container(): HTMLElement;
        scaleX(): number;
        x(): number;
        y(): number;
      };
      const node = stage.findOne((candidate) => candidate.id() === nodeId);
      if (!node) return null;
      const box = node.getClientRect({ relativeTo: stage as unknown as never });
      const container = stage.container().getBoundingClientRect();
      const zoom = stage.scaleX();
      return {
        x: container.left + stage.x() + (box.x + box.width * fx) * zoom,
        y: container.top + stage.y() + (box.y + box.height * fy) * zoom,
      };
    },
    { nodeId: id, fx, fy },
  );
}

async function waitCanvasScrollSettled(): Promise<void> {
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

/** Centra el nodo en el hueco visible del lienzo (scroll directo, sin animación). */
async function scrollNodeIntoView(id: string): Promise<void> {
  await page.evaluate((nodeId) => {
    const stage = (window as never as Record<string, unknown>)['__rdlcStage'] as {
      findOne(selector: (node: KonvaLike) => boolean): KonvaLike | undefined;
      container(): HTMLElement;
      scaleX(): number;
      x(): number;
      y(): number;
    };
    const node = stage.findOne((candidate) => candidate.id() === nodeId);
    const canvas = stage.container();
    const scroller = canvas.closest('.overflow-auto');
    if (!node || !(scroller instanceof HTMLElement)) return;
    const box = node.getClientRect({ relativeTo: stage as unknown as never });
    const zoom = stage.scaleX();
    const container = canvas.getBoundingClientRect();
    const centerY = container.top + stage.y() + (box.y + box.height / 2) * zoom;
    const deltaY = centerY - (scroller.getBoundingClientRect().top + scroller.clientHeight / 2);
    scroller.scrollLeft = 0;
    scroller.scrollTop = Math.max(
      0,
      Math.min(scroller.scrollHeight - scroller.clientHeight, scroller.scrollTop + deltaY),
    );
  }, id);
  await waitCanvasScrollSettled();
}

async function pointInCanvasViewport(point: { x: number; y: number }): Promise<boolean> {
  return page.evaluate(({ x, y }) => {
    const scroller = document.querySelector('canvas')?.closest('.overflow-auto');
    if (!(scroller instanceof HTMLElement)) return true;
    const rect = scroller.getBoundingClientRect();
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  }, point);
}

/** Punto de pantalla del nodo, ya centrado en el hueco visible y quieto. */
async function settledPoint(id: string, fx = 0.5, fy = 0.5): Promise<{ x: number; y: number }> {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    await scrollNodeIntoView(id);
    let previous = '';
    for (let step = 0; step < 24; step += 1) {
      const point = await nodeCenter(id, fx, fy);
      const current = JSON.stringify(point);
      if (point && current === previous && (await pointInCanvasViewport(point))) return point;
      previous = current;
      await page.waitForTimeout(50);
    }
  }
  throw new Error(`el nodo ${id} no se asienta en el hueco visible`);
}

/** Selecciona un item pinchándolo en el lienzo (reintenta si el clic cae en vacío). */
async function clickItem(id: string, fx = 0.5, fy = 0.5): Promise<void> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const point = await settledPoint(id, fx, fy);
    await page.mouse.click(point.x, point.y);
    if ((await selectedId()) === id) return;
    await page.waitForTimeout(150);
  }
  await expect.poll(selectedId, { message: `${id} debe quedar seleccionado` }).toBe(id);
}

/**
 * Ctrl/Shift+click sobre el contenido de una celda: dentro de un Tablix manda la
 * selección de **celdas** (Ctrl añade, Shift amplía el rango), no la de items.
 */
async function modClickItem(id: string, key: 'Control' | 'Shift'): Promise<void> {
  const point = await settledPoint(id);
  await page.keyboard.down(key);
  await page.mouse.click(point.x, point.y);
  await page.keyboard.up(key);
}

/** Celda (o rango) seleccionada en el lienzo (según `__rdlcCell`). */
async function selectedCell(): Promise<{
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

/** Selecciona un elemento del informe por nombre desde la paleta (Ctrl+K). */
async function selectItemViaPalette(id: string): Promise<void> {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
  await page.keyboard.press('Control+k');
  await page.getByPlaceholder('Buscar elemento, variable o acción…').fill(id);
  await page.waitForTimeout(250);
  await page.getByRole('option', { name: new RegExp(`^${id}\\b`) }).click();
  await expect.poll(selectedId).toBe(id);
  await expect(page.getByPlaceholder('Buscar elemento, variable o acción…')).toHaveCount(0);
  await waitCanvasScrollSettled();
}

/**
 * Deselecciona pinchando la esquina del papel (dentro del margen, sin items).
 * No sirve con una tabla seleccionada: su selección tapa el clic y el lienzo la
 * conserva; en esos casos se usa un item que no sea una tabla.
 */
async function clearSelection(): Promise<void> {
  // La esquina del papel debe estar a la vista: se vuelve arriba del todo.
  await page.evaluate(() => {
    const scroller = document.querySelector('canvas')?.closest('.overflow-auto');
    if (scroller instanceof HTMLElement) {
      scroller.scrollTop = 0;
      scroller.scrollLeft = 0;
    }
  });
  await waitCanvasScrollSettled();
  const point = await page.evaluate(() => {
    const stage = (window as never as Record<string, unknown>)['__rdlcStage'] as {
      container(): HTMLElement;
      scaleX(): number;
      x(): number;
      y(): number;
    };
    const container = stage.container().getBoundingClientRect();
    const zoom = stage.scaleX();
    return {
      x: container.left + stage.x() + 4 * zoom,
      y: container.top + stage.y() + 4 * zoom,
    };
  });
  await page.mouse.click(point.x, point.y);
  // Sin selección el panel lateral pasa a las propiedades del informe (el hook
  // `__rdlcSelection` conserva el último valor, no sirve de prueba).
  await expect(page.getByRole('heading', { name: 'Propiedades del informe' })).toBeVisible();
}

async function clickMenuItem(name: string): Promise<void> {
  const menuItem = page.getByRole('menuitem', { name, exact: true });
  await expect(menuItem).toBeVisible();
  await menuItem.dispatchEvent('click');
}

/** Click derecho sobre el contenido de una celda y submenú «Insertar fila o columna». */
async function insertRowOrColumn(contentId: string, option: string): Promise<void> {
  const point = await settledPoint(contentId);
  await page.mouse.click(point.x, point.y, { button: 'right' });
  await page.getByRole('menuitem', { name: 'Insertar fila o columna' }).click();
  await clickMenuItem(option);
  // El menú se cierra con animación: hasta que desaparece, Radix bloquea el puntero.
  await expect(page.getByRole('menuitem', { name: option, exact: true })).toBeHidden();
}

const TABLE = 'LinesTable2';

/** Deshace un paso y comprueba que el documento vuelve a ser el recién abierto. */
async function undoToInitial(): Promise<void> {
  await page.keyboard.press('Control+z');
  await expect
    .poll(projectionFingerprint, { message: 'un undo debe restaurar el documento inicial' })
    .toBe(initialFingerprint);
}

/** Contenidos de la fila `row` de la tabla, por posición de rejilla (columnas 0..3). */
function rowContents(tablix: ItemLike | undefined, row: number): (ItemLike | undefined)[] {
  return [0, 1, 2, 3].map((col) => cellAt(tablix, row, col)?.content);
}

/* ------------------- 1. filas y columnas heredan formato ------------------ */

test('menú de celda · Fila debajo: la fila nueva copia alto y formato de la fila pinchada', async () => {
  const before = await projection();
  const idsBefore = allIds(before);
  const tablix = findInProjection(before, TABLE);
  const heights = await rowHeights(TABLE);
  // Fila 1 (índice 1): 0,6 cm y cabecera gris; la de debajo (índice 3 tras la
  // fila de celda combinada) mide 0,388 cm y tiene otro formato.
  const reference = rowContents(tablix, 1);
  const opposite = rowContents(tablix, 3);
  expect(heights).toEqual([0.6, 0.6, 0.38806, 0.38806, 0.6]);
  expect(formatOf(reference[1])).not.toEqual(formatOf(opposite[1]));

  await insertRowOrColumn(reference[1]!.id, 'Fila debajo');

  await expect.poll(() => rowHeights(TABLE)).toHaveLength(heights.length + 1);
  const grown = findInProjection(await projection(), TABLE);
  // Alto de la fila nueva (índice 2) = alto de la fila pinchada, no de la siguiente.
  const afterHeights = await rowHeights(TABLE);
  expect(afterHeights[2]).toBeCloseTo(heights[1]!, 5);
  expect(afterHeights[3]).toBeCloseTo(heights[2]!, 5);

  const created = rowContents(grown, 2);
  for (let col = 0; col < 4; col += 1) {
    const cell = created[col];
    expect(cell, `celda nueva (2,${col})`).toBeTruthy();
    expect(idsBefore.has(cell!.id), `${cell!.id} debe ser un textbox nuevo`).toBe(false);
    expect(textOf(cell), `texto de (2,${col})`).toBe('');
    expect(formatOf(cell), `formato de (2,${col})`).toEqual(formatOf(reference[col]));
  }
  // La fila pinchada sigue donde estaba y sin tocar.
  expect(rowContents(grown, 1).map((cell) => cell?.id)).toEqual(reference.map((cell) => cell?.id));

  await undoToInitial();
});

test('menú de celda · Fila encima: la fila nueva copia alto y formato de la fila pinchada', async () => {
  const before = await projection();
  const idsBefore = allIds(before);
  const tablix = findInProjection(before, TABLE);
  const heights = await rowHeights(TABLE);
  // Fila 4 (índice 4): 0,6 cm; la de encima (índice 3) mide 0,388 cm y otro formato.
  const reference = rowContents(tablix, 4);
  const opposite = rowContents(tablix, 3);
  expect(heights).toEqual([0.6, 0.6, 0.38806, 0.38806, 0.6]);
  expect(formatOf(reference[1])).not.toEqual(formatOf(opposite[1]));

  await insertRowOrColumn(reference[1]!.id, 'Fila encima');

  await expect.poll(() => rowHeights(TABLE)).toHaveLength(heights.length + 1);
  const grown = findInProjection(await projection(), TABLE);
  const afterHeights = await rowHeights(TABLE);
  expect(afterHeights[3]).toBeCloseTo(heights[3]!, 5);
  expect(afterHeights[4]).toBeCloseTo(heights[4]!, 5);
  expect(afterHeights[5]).toBeCloseTo(heights[4]!, 5);

  const created = rowContents(grown, 4);
  for (let col = 0; col < 4; col += 1) {
    const cell = created[col];
    expect(cell, `celda nueva (4,${col})`).toBeTruthy();
    expect(idsBefore.has(cell!.id), `${cell!.id} debe ser un textbox nuevo`).toBe(false);
    expect(textOf(cell), `texto de (4,${col})`).toBe('');
    expect(formatOf(cell), `formato de (4,${col})`).toEqual(formatOf(reference[col]));
  }
  // La fila pinchada se corrió a abajo, intacta.
  expect(rowContents(grown, 5).map((cell) => cell?.id)).toEqual(reference.map((cell) => cell?.id));

  await undoToInitial();
});

/**
 * Compara la columna nueva con la de referencia, fila a fila. Las filas cuyo
 * hueco de referencia lo cubre una celda combinada no tienen celda propia y se
 * saltan; se exige que al menos `minRows` filas sean comparables.
 */
function expectNewColumnFormat(
  before: ItemLike | undefined,
  after: ItemLike | undefined,
  idsBefore: Set<string>,
  referenceCol: number,
  newCol: number,
  minRows: number,
): void {
  let compared = 0;
  const rowCount = before?.body?.rows.length ?? 0;
  for (let row = 0; row < rowCount; row += 1) {
    const reference = cellAt(before, row, referenceCol)?.content;
    const created = cellAt(after, row, newCol)?.content;
    if (!reference || !created || idsBefore.has(created.id)) continue;
    expect(textOf(created), `texto de (${row},${newCol})`).toBe('');
    expect(formatOf(created), `formato de (${row},${newCol})`).toEqual(formatOf(reference));
    compared += 1;
  }
  expect(compared, 'filas comparables').toBeGreaterThanOrEqual(minRows);
}

test('menú de celda · Columna a la izquierda: la columna nueva copia ancho y formato de la pinchada', async () => {
  const before = await projection();
  const idsBefore = allIds(before);
  const tablix = findInProjection(before, TABLE);
  const widths = await columnWidths(TABLE);
  expect(widths).toEqual([11.51184, 2.42552, 2.2973, 2.70953]);

  await insertRowOrColumn(cellAt(tablix, 1, 1)!.content!.id, 'Columna a la izquierda');

  await expect.poll(() => columnWidths(TABLE)).toHaveLength(widths.length + 1);
  const afterWidths = await columnWidths(TABLE);
  // Ancho de la nueva (índice 1) = el de la pinchada (2,42552), no el de la de su izquierda.
  expect(afterWidths[0]).toBeCloseTo(widths[0]!, 5);
  expect(afterWidths[1]).toBeCloseTo(widths[1]!, 5);
  expect(afterWidths[2]).toBeCloseTo(widths[1]!, 5);

  // Filas 0, 1, 3 y 4 (la 2 es una celda combinada que solo se ensancha).
  expectNewColumnFormat(tablix, findInProjection(await projection(), TABLE), idsBefore, 1, 1, 4);

  await undoToInitial();
});

test('menú de celda · Columna a la derecha: la columna nueva copia ancho y formato de la pinchada', async () => {
  const before = await projection();
  const idsBefore = allIds(before);
  const tablix = findInProjection(before, TABLE);
  const widths = await columnWidths(TABLE);

  await insertRowOrColumn(cellAt(tablix, 1, 2)!.content!.id, 'Columna a la derecha');

  await expect.poll(() => columnWidths(TABLE)).toHaveLength(widths.length + 1);
  const afterWidths = await columnWidths(TABLE);
  // Ancho de la nueva (índice 3) = el de la pinchada (2,2973), no el de la de su derecha (2,70953).
  expect(afterWidths[2]).toBeCloseTo(widths[2]!, 5);
  expect(afterWidths[3]).toBeCloseTo(widths[2]!, 5);
  expect(afterWidths[4]).toBeCloseTo(widths[3]!, 5);

  expectNewColumnFormat(tablix, findInProjection(await projection(), TABLE), idsBefore, 2, 3, 3);

  await undoToInitial();
});

/* ------------- 2. rectángulo insertado en una celda vacía ----------------- */

/**
 * Vacía la celda (4,0) de la tabla (borra `Textbox170`) y le inserta un
 * rectángulo con el menú contextual de la celda vacía. Devuelve su id.
 */
async function insertRectangleInEmptiedCell(): Promise<string> {
  const idsBefore = allIds(await projection());
  await clickItem('Textbox170');
  const point = await settledPoint('Textbox170');
  await page.keyboard.press('Delete');
  await expect.poll(() => cellContentAt(TABLE, 4, 0)).toBeUndefined();

  await page.mouse.click(point.x, point.y, { button: 'right' });
  await page.getByRole('menuitem', { name: 'Insertar', exact: true }).click();
  await clickMenuItem('Rectángulo');

  await expect.poll(async () => (await cellContentAt(TABLE, 4, 0))?.kind).toBe('rectangle');
  const rectangle = (await cellContentAt(TABLE, 4, 0))!;
  expect(idsBefore.has(rectangle.id)).toBe(false);
  return rectangle.id;
}

test('Insertar > Rectángulo en una celda vacía nace en 0,0 con el tamaño exacto de la celda', async () => {
  const widths = await columnWidths(TABLE);
  const heights = await rowHeights(TABLE);

  const id = await insertRectangleInEmptiedCell();
  const rectangle = (await item(id))!;

  expect(toCm(rectangle.top!)).toBeCloseTo(0, 4);
  expect(toCm(rectangle.left!)).toBeCloseTo(0, 4);
  // Celda (4,0) = columna 0 × fila 4.
  expect(toCm(rectangle.width!)).toBeCloseTo(widths[0]!, 4);
  expect(toCm(rectangle.height!)).toBeCloseTo(heights[4]!, 4);
  // La rejilla no cambió de tamaño.
  expect(await columnWidths(TABLE)).toEqual(widths);
  expect(await rowHeights(TABLE)).toEqual(heights);

  // Un undo quita el rectángulo; otro devuelve el textbox borrado.
  await page.keyboard.press('Control+z');
  await expect.poll(() => cellContentAt(TABLE, 4, 0)).toBeUndefined();
  await undoToInitial();
});

/* -------------- 3. reproducción: pegar dentro de un rectángulo ------------ */

test('pegar con un rectángulo seleccionado mete el item dentro y moverlo no agranda el rectángulo', async () => {
  const rectangleId = await insertRectangleInEmptiedCell();
  const rectangleBefore = (await item(rectangleId))!;
  const widthBefore = toCm(rectangleBefore.width!);
  const heightBefore = toCm(rectangleBefore.height!);
  const sourceBefore = (await item('BTC_Header_Carrier'))!;
  // El original vive fuera de la celda (Top 6,7 cm / Left 11,6 cm de Rectangle3).
  expect(toCm(sourceBefore.top!)).toBeGreaterThan(heightBefore);
  expect(toCm(sourceBefore.left!)).toBeGreaterThan(widthBefore);

  await selectItemViaPalette('BTC_Header_Carrier');
  await page.keyboard.press('Control+c');
  await expect.poll(statusText).toContain('Copiado');

  await selectItemViaPalette(rectangleId);
  await page.keyboard.press('Control+v');

  await expect
    .poll(async () => (await item(rectangleId))?.children?.length, {
      message: 'el clon debe nacer dentro del rectángulo',
    })
    .toBe(1);
  const pasted = (await item(rectangleId))!.children![0]!;
  expect(pasted.id).not.toBe('BTC_Header_Carrier');
  expect(pasted.kind).toBe('rectangle');
  const inside = (): Promise<{ left: number; top: number; right: number; bottom: number }> =>
    item(pasted.id).then((current) => ({
      left: toCm(current!.left!),
      top: toCm(current!.top!),
      right: toCm(current!.left!) + toCm(current!.width!),
      bottom: toCm(current!.top!) + toCm(current!.height!),
    }));
  let box = await inside();
  expect(box.left).toBeGreaterThanOrEqual(-1e-6);
  expect(box.top).toBeGreaterThanOrEqual(-1e-6);
  expect(box.right).toBeLessThanOrEqual(widthBefore + 1e-6);
  expect(box.bottom).toBeLessThanOrEqual(heightBefore + 1e-6);
  // El rectángulo contenedor no cambió de tamaño al pegar.
  const afterPaste = (await item(rectangleId))!;
  expect(toCm(afterPaste.width!)).toBeCloseTo(widthBefore, 4);
  expect(toCm(afterPaste.height!)).toBeCloseTo(heightBefore, 4);

  // Mover el clon unos pasos con las flechas hacia dentro (el bug: el padre
  // crecía hasta contener la posición heredada de 6,7 × 11,6 cm). El clon se
  // coloca con el desplazamiento mínimo, o sea pegado al borde derecho/inferior.
  await expect.poll(selectionIds).toEqual([pasted.id]);
  const leftBefore = box.left;
  for (let step = 0; step < 3; step += 1) await page.keyboard.press('ArrowLeft');
  await expect
    .poll(async () => (await inside()).left, { message: 'el clon debe moverse' })
    .toBeLessThan(leftBefore);
  for (let step = 0; step < 3; step += 1) await page.keyboard.press('ArrowUp');
  // Deja pasar el commit diferido de las flechas antes de medir el padre.
  await page.waitForTimeout(600);
  box = await inside();
  expect(box.left).toBeGreaterThanOrEqual(-1e-6);
  expect(box.top).toBeGreaterThanOrEqual(-1e-6);
  expect(box.right).toBeLessThanOrEqual(widthBefore + 1e-6);
  const afterMove = (await item(rectangleId))!;
  expect(toCm(afterMove.width!)).toBeCloseTo(widthBefore, 4);
  expect(toCm(afterMove.height!)).toBeCloseTo(heightBefore, 4);
  // Y el original no se movió.
  expect(await item('BTC_Header_Carrier')).toEqual(sourceBefore);
});

/* ------------------ 4. copiar y pegar celdas de Tablix -------------------- */

const SOURCE_EXPR = '=Fields!BTCQuantity.Value';

test('copiar el textbox de una celda y pegarlo sobre otra sustituye su contenido (un undo)', async () => {
  const idsBefore = allIds(await projection());
  const sourceBefore = (await item('Quantity_Line2'))!;
  const targetBefore = (await item('Textbox190'))!;
  expect(textOf(sourceBefore)).toBe(SOURCE_EXPR);
  expect(textOf(targetBefore)).toBe('');

  await clickItem('Quantity_Line2');
  await page.keyboard.press('Control+c');
  await expect.poll(statusText).toContain('Copiado');
  await clickItem('Textbox190');
  await page.keyboard.press('Control+v');

  await expect.poll(async () => (await cellContentAt(TABLE, 4, 2))?.id).not.toBe('Textbox190');
  const pasted = (await cellContentAt(TABLE, 4, 2))!;
  expect(idsBefore.has(pasted.id), 'nombre nuevo y único').toBe(false);
  expect(pasted.kind).toBe('textbox');
  expect(textOf(pasted)).toBe(SOURCE_EXPR);
  expect(formatOf(pasted)).toEqual(formatOf(sourceBefore));
  expect(await item('Textbox190'), 'el textbox sustituido desaparece').toBeUndefined();
  expect(await item('Quantity_Line2'), 'el origen no se toca').toEqual(sourceBefore);
  await expect.poll(statusText).toContain('Pegada 1 celda');

  await undoToInitial();
});

/**
 * Selecciona el rango de celdas (3,0)-(3,1) —Ctrl+click en la primera y
 * Shift+click en la segunda— y las copia.
 */
async function copyTwoCells(): Promise<void> {
  await modClickItem('Description_Line_3', 'Control');
  await expect.poll(selectedCell).toEqual({ id: TABLE, row: 3, col: 0 });
  await modClickItem('Quantity_Line2', 'Shift');
  await expect.poll(selectedCell).toEqual({ id: TABLE, row: 3, col: 0, endRow: 3, endCol: 1 });
  await page.keyboard.press('Control+c');
  await expect.poll(statusText).toContain('Copiadas 2 celdas');
}

test('copiar 2 celdas contiguas y pegar: ocupan las celdas consecutivas desde la ancla', async () => {
  const idsBefore = allIds(await projection());
  const tablix = findInProjection(await projection(), TABLE);
  const sources = [cellAt(tablix, 3, 0)!.content!, cellAt(tablix, 3, 1)!.content!];
  const rowBefore = rowContents(tablix, 4);

  await copyTwoCells();
  // Ancla (4,1): el bloque cae en (4,1) y (4,2); (4,0) y (4,3) no se tocan.
  await clickItem('Textbox187');
  await page.keyboard.press('Control+v');

  await expect.poll(async () => (await cellContentAt(TABLE, 4, 1))?.id).not.toBe('Textbox187');
  const after = findInProjection(await projection(), TABLE);
  const row = rowContents(after, 4);
  expect(row[0]).toEqual(rowBefore[0]);
  expect(row[3]).toEqual(rowBefore[3]);
  for (const [index, col] of [1, 2].entries()) {
    const pasted = row[col]!;
    expect(idsBefore.has(pasted.id), `(4,${col}) es un clon nuevo`).toBe(false);
    expect(textOf(pasted)).toBe(textOf(sources[index]));
    expect(formatOf(pasted)).toEqual(formatOf(sources[index]));
  }
  // Los orígenes siguen en su sitio.
  expect(cellAt(after, 3, 0)!.content).toEqual(sources[0]);
  expect(cellAt(after, 3, 1)!.content).toEqual(sources[1]);
  await expect.poll(statusText).toContain('Pegadas 2 celdas');

  await undoToInitial();
});

test('pegar celdas junto al borde recorta lo que no cabe y lo avisa', async () => {
  const tablix = findInProjection(await projection(), TABLE);
  const source = cellAt(tablix, 3, 0)!.content!;
  const rowBefore = rowContents(tablix, 4);
  const columns = (await columnWidths(TABLE)).length;

  await copyTwoCells();
  // Ancla en la última columna: solo cabe la primera de las 2 celdas.
  await clickItem('Textbox192');
  await page.keyboard.press('Control+v');

  await expect
    .poll(statusText)
    .toContain('1 de 2 celdas pegadas: el resto queda fuera de la tabla');
  const after = findInProjection(await projection(), TABLE);
  expect(after!.body!.columns).toHaveLength(columns);
  const row = rowContents(after, 4);
  expect(row.slice(0, 3)).toEqual(rowBefore.slice(0, 3));
  expect(row[3]!.id).not.toBe('Textbox192');
  expect(textOf(row[3])).toBe(textOf(source));
  expect(formatOf(row[3])).toEqual(formatOf(source));

  await undoToInitial();
});

test('con celdas en el portapapeles, pegar sin una celda seleccionada avisa y no cambia nada', async () => {
  const message = 'El portapapeles contiene celdas de tabla: selecciona una celda para pegarlas';
  // (Monaco monta también regiones role=alert vacías: se filtra por el texto.)
  const banner = page.getByRole('alert').filter({ hasText: message });
  await copyTwoCells();

  // 1) Con un item que no es una celda (un textbox del encabezado).
  await selectItemViaPalette('Textbox4');
  await page.keyboard.press('Control+v');
  await expect(banner).toBeVisible();
  expect(await projectionFingerprint()).toBe(initialFingerprint);
  await page.getByRole('button', { name: 'Cerrar el aviso' }).click();
  await expect(banner).toHaveCount(0);

  // 2) Sin nada seleccionado (clic en el papel vacío).
  await clearSelection();
  await page.keyboard.press('Control+v');
  await expect(banner).toBeVisible();
  expect(await projectionFingerprint()).toBe(initialFingerprint);
});
