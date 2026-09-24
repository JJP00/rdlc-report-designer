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
 * E2E sobre la app Electron real. Se lanza el build de `out/` con una **copia**
 * temporal del informe (la app tiene watcher: el corpus no se toca) y se
 * interactúa con ratón/teclado reales sobre el lienzo Konva.
 */

const here = fileURLToPath(new URL('.', import.meta.url));
const mainEntry = join(here, '..', 'out', 'main', 'main.js');
const fixture = join(here, '..', '..', '..', 'fixtures', 'corpus', 'SalesCreditMemoESP.rdlc');

let app: ElectronApplication;
let page: Page;

test.beforeAll(async () => {
  const workspace = join(tmpdir(), `rdlc-e2e-${Date.now()}`);
  mkdirSync(workspace, { recursive: true });
  const file = join(workspace, 'SalesCreditMemoESP.rdlc');
  copyFileSync(fixture, file);

  app = await electron.launch({ args: [mainEntry, file] });
  page = await app.firstWindow();
  await page.waitForFunction(() =>
    Boolean((window as never as Record<string, unknown>)['__rdlcStage']),
  );
  await page.waitForFunction(() =>
    Boolean((window as never as Record<string, unknown>)['__rdlcProjection']),
  );
});

test.afterAll(async () => {
  await app?.close();
});

async function projectionVersion(): Promise<number> {
  const proj = await projection();
  return proj.version;
}

/**
 * Deja el documento como al abrir: cierra menús y deshace todo lo pendiente.
 * Así cada test parte del mismo estado y no depende del anterior.
 */
async function resetDocument(): Promise<void> {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
  await page.keyboard.press('Escape');
  for (let index = 0; index < 80; index += 1) {
    const before = await projectionVersion();
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(20);
    const after = await projectionVersion();
    if (after === before) break;
  }
}

test.afterEach(async () => {
  await resetDocument();
});

/* ------------------------------- helpers -------------------------------- */

interface Projection {
  reportName: string;
  page: { body: { items: ItemLike[] } };
}

interface CellLike {
  colSpan?: number;
  rowSpan?: number;
  content?: ItemLike;
}

interface ItemLike {
  id: string;
  kind: string;
  top?: { value: number; unit: string };
  left?: { value: number; unit: string };
  body?: {
    columns: { value: number; unit: string }[];
    rows: { height: { value: number; unit: string }; cells: (CellLike | null)[] }[];
  };
  children?: ItemLike[];
}

/** Proyección viva publicada por el front en dev. */
async function projection(): Promise<Projection> {
  return page.evaluate(
    () => (window as never as Record<string, unknown>)['__rdlcProjection'] as Projection,
  );
}

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

async function tablixColumns(id: string): Promise<number[]> {
  const proj = await projection();
  const tablix = findItem(proj.page.body.items, id);
  const columns = tablix?.body?.columns ?? [];
  return columns.map((column) => column.value);
}

/** Punto de pantalla del borde superior del Tablix (dentro del anillo de hit). */
async function tablixBorderPoint(id: string): Promise<{ x: number; y: number } | null> {
  return page.evaluate((tablixId) => {
    const stage = (window as never as Record<string, unknown>)['__rdlcStage'] as {
      find(selector: (node: KonvaLike) => boolean): KonvaLike[];
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

/** Punto de pantalla del centro de un nodo Konva por id. */
async function nodeCenter(id: string): Promise<{ x: number; y: number } | null> {
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

interface KonvaLike {
  className?: string;
  id(): string;
  name(): string;
  width(): number;
  height(): number;
  x(): number;
  y(): number;
  points?(): number[];
  getAttr(name: string): unknown;
  getParent(): KonvaLike;
  getChildren(filter?: (node: KonvaLike) => boolean): KonvaLike[];
  getAbsoluteTransform(): { point(point: { x: number; y: number }): { x: number; y: number } };
  getClientRect(options: { relativeTo: unknown }): {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

/* -------------------------------- tests --------------------------------- */

test('abre el informe y pinta el lienzo', async () => {
  await expect(page.locator('canvas').first()).toBeVisible();
  const proj = await projection();
  expect(proj.reportName).toContain('SalesCreditMemoESP');
  expect(proj.page.body.items.length).toBeGreaterThan(0);
  await expect(page.getByText(/\d+ elementos ·/)).toBeVisible();
});

test('ningún color del lienzo es una expresión RDL (no se pintan en negro)', async () => {
  const offenders = await page.evaluate(() => {
    const stage = (window as never as Record<string, unknown>)['__rdlcStage'] as {
      find(selector: (node: KonvaLike) => boolean): KonvaLike[];
    };
    const found: { id: string; attr: string; value: string }[] = [];
    for (const node of stage.find(() => true)) {
      for (const attr of ['fill', 'stroke']) {
        const value = node.getAttr(attr);
        if (typeof value === 'string' && value.startsWith('=')) {
          found.push({ id: node.id() || node.name(), attr, value });
        }
      }
    }
    return found;
  });
  expect(offenders).toEqual([]);
});

test('selecciona la tabla por su borde y muestra los separadores de la rejilla', async () => {
  const point = await tablixBorderPoint('LinesTable2');
  expect(point).not.toBeNull();
  await page.mouse.click(point!.x, point!.y);

  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            (
              (window as never as Record<string, unknown>)['__rdlcSelection'] as {
                id?: string;
              } | null
            )?.id ?? null,
        ),
      { message: 'la tabla debe quedar seleccionada' },
    )
    .toBe('LinesTable2');

  // Cabeceras de fila/columna montadas (el redimensionado va en sus bordes).
  const headers = await page.evaluate(() => {
    const stage = (window as never as Record<string, unknown>)['__rdlcStage'] as {
      find(selector: (node: KonvaLike) => boolean): KonvaLike[];
    };
    return {
      columns: stage.find((node) => node.name() === 'tablix-column-header').length,
      rows: stage.find((node) => node.name() === 'tablix-row-header').length,
    };
  });
  expect(headers.columns).toBe(await tablixColumnCount('LinesTable2'));
  expect(headers.rows).toBe(await tablixRowCount('LinesTable2'));
});

test('un click dentro de la tabla selecciona el elemento de dentro y Esc sube al contenedor', async () => {
  const proj = await projection();
  const tablix = findItem(proj.page.body.items, 'LinesTable2') as
    (ItemLike & { body: { rows: { cells: (CellLike | null)[] }[] } }) | undefined;
  const cellContent = tablix?.body.rows
    .flatMap((row) => row.cells ?? [])
    .map((cell) => cell?.content)
    .find((content): content is ItemLike => Boolean(content));
  expect(cellContent, 'la tabla debe tener contenido en las celdas').toBeTruthy();

  const point = await nodeCenter(cellContent!.id);
  expect(point).not.toBeNull();
  await page.mouse.click(point!.x, point!.y);

  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            (
              (window as never as Record<string, unknown>)['__rdlcSelection'] as {
                id?: string;
              } | null
            )?.id ?? null,
        ),
      { message: 'el click debe llegar al contenido de la celda, no a la tabla' },
    )
    .toBe(cellContent!.id);

  await page.keyboard.press('Escape');
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            (
              (window as never as Record<string, unknown>)['__rdlcSelection'] as {
                id?: string;
              } | null
            )?.id ?? null,
        ),
      { message: 'Esc debe subir el nivel de selección' },
    )
    .toBe('LinesTable2');
});

/** Número de filas de la rejilla de un Tablix según la proyección viva. */
async function tablixRowCount(id: string): Promise<number> {
  const proj = await projection();
  return findItem(proj.page.body.items, id)?.body?.rows.length ?? 0;
}

/** Número de columnas de la rejilla de un Tablix según la proyección viva. */
async function tablixColumnCount(id: string): Promise<number> {
  const proj = await projection();
  return findItem(proj.page.body.items, id)?.body?.columns.length ?? 0;
}

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

function toCm(length: { value: number; unit: string }): number {
  if (length.unit === 'mm') return length.value / 10;
  if (length.unit === 'in') return length.value * 2.54;
  if (length.unit === 'pt') return (length.value * 2.54) / 72;
  return length.value;
}

/** Posición (cm) de un item en la proyección viva. */
async function itemPosition(id: string): Promise<{ top: number; left: number } | null> {
  const proj = await projection();
  const item = findItem(proj.page.body.items, id);
  if (!item?.top || !item?.left) return null;
  return { top: toCm(item.top), left: toCm(item.left) };
}

/** Posición del nodo Konva (px de papel) dentro de su padre. */
async function nodePosition(id: string): Promise<{ x: number; y: number } | null> {
  return page.evaluate((nodeId) => {
    const stage = (window as never as Record<string, unknown>)['__rdlcStage'] as {
      findOne(selector: (node: KonvaLike) => boolean): KonvaLike | undefined;
    };
    const node = stage.findOne((candidate) => candidate.id() === nodeId);
    return node ? { x: node.x(), y: node.y() } : null;
  }, id);
}

/** Primer item dentro de una celda de un Tablix (recursivo por celdas). */
function firstCellContent(proj: Projection, tablixId: string): ItemLike | undefined {
  const tablix = findItem(proj.page.body.items, tablixId);
  return tablix?.body?.rows
    .flatMap((row) => row.cells ?? [])
    .map((cell) => cell?.content)
    .find((content): content is ItemLike => Boolean(content));
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
  const proj = await projection();
  return cellAt(findItem(proj.page.body.items, tablixId), row, col)?.content;
}

async function cellSpans(
  tablixId: string,
  row: number,
  col: number,
): Promise<{ colSpan: number; rowSpan: number }> {
  const proj = await projection();
  const cell = cellAt(findItem(proj.page.body.items, tablixId), row, col);
  return { colSpan: cell?.colSpan ?? 1, rowSpan: cell?.rowSpan ?? 1 };
}

/** Punto de pantalla del centro de una cabecera de fila/columna del Tablix. */
async function headerPoint(
  kind: 'column' | 'row',
  index: number,
): Promise<{ x: number; y: number } | null> {
  return page.evaluate(
    ({ kind, index }) => {
      const stage = (window as never as Record<string, unknown>)['__rdlcStage'] as {
        find(selector: (node: KonvaLike) => boolean): KonvaLike[];
        container(): HTMLElement;
      };
      const name = kind === 'column' ? 'tablix-column-header' : 'tablix-row-header';
      const node = stage.find((candidate) => candidate.name() === name)[index];
      if (!node) return null;
      const container = stage.container().getBoundingClientRect();
      const point = node
        .getAbsoluteTransform()
        .point({ x: node.width() / 2, y: node.height() / 2 });
      return { x: container.left + point.x, y: container.top + point.y };
    },
    { kind, index },
  );
}

/** Punto del borde derecho de la cabecera de una columna (zona de redimensionado). */
async function columnHeaderEdgePoint(index: number): Promise<{ x: number; y: number } | null> {
  return page.evaluate((index) => {
    const stage = (window as never as Record<string, unknown>)['__rdlcStage'] as {
      find(selector: (node: KonvaLike) => boolean): KonvaLike[];
      container(): HTMLElement;
    };
    const node = stage.find((candidate) => candidate.name() === 'tablix-column-header')[index];
    if (!node) return null;
    const container = stage.container().getBoundingClientRect();
    const point = node.getAbsoluteTransform().point({ x: node.width(), y: node.height() / 2 });
    return { x: container.left + point.x, y: container.top + point.y };
  }, index);
}

test('el panel de estructura selecciona celdas y añade/quita filas (con undo)', async () => {
  const point = await tablixBorderPoint('Tablix3');
  expect(point).not.toBeNull();
  await page.mouse.click(point!.x, point!.y);

  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            (
              (window as never as Record<string, unknown>)['__rdlcSelection'] as {
                id?: string;
              } | null
            )?.id ?? null,
        ),
      { message: 'Tablix3 debe quedar seleccionada' },
    )
    .toBe('Tablix3');

  await expect(page.getByRole('region', { name: 'Estructura del Tablix' })).toBeVisible();
  await expect(page.getByText('2 filas × 6 columnas')).toBeVisible();

  // Seleccionar una celda desde el árbol.
  await page.getByRole('button', { name: 'Seleccionar fila 1' }).click();
  await expect.poll(selectedCell).toEqual({ id: 'Tablix3', row: 0, col: 0 });

  // Añadir fila al final y deshacer.
  const rowsBefore = await tablixRowCount('Tablix3');
  await page.getByRole('button', { name: 'Añadir fila al final' }).click();
  await expect.poll(() => tablixRowCount('Tablix3')).toBe(rowsBefore + 1);
  await expect(page.getByText(/3 filas × 6 columnas/)).toBeVisible();

  await page.keyboard.press('Control+z');
  await expect.poll(() => tablixRowCount('Tablix3')).toBe(rowsBefore);

  // Quitar la segunda fila desde su botón y deshacer.
  await page.getByRole('button', { name: 'Eliminar fila 2' }).click();
  await expect.poll(() => tablixRowCount('Tablix3')).toBe(rowsBefore - 1);
  await page.keyboard.press('Control+z');
  await expect.poll(() => tablixRowCount('Tablix3')).toBe(rowsBefore);
});

test('borra filas y columnas de una tabla con grupos y celdas fusionadas (y deshace)', async () => {
  const point = await tablixBorderPoint('LinesTable2');
  expect(point).not.toBeNull();
  await page.mouse.click(point!.x, point!.y);
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            (
              (window as never as Record<string, unknown>)['__rdlcSelection'] as {
                id?: string;
              } | null
            )?.id ?? null,
        ),
      { message: 'LinesTable2 debe quedar seleccionada' },
    )
    .toBe('LinesTable2');

  const rowsBefore = await tablixRowCount('LinesTable2');
  const columnsBefore = await tablixColumnCount('LinesTable2');

  // Fila (dentro de la jerarquía con grupo) y deshacer.
  await page.getByRole('button', { name: 'Eliminar fila 2' }).click();
  await expect.poll(() => tablixRowCount('LinesTable2')).toBe(rowsBefore - 1);
  await page.keyboard.press('Control+z');
  await expect.poll(() => tablixRowCount('LinesTable2')).toBe(rowsBefore);

  // Columna (con un ColSpan que debe encogerse) y deshacer.
  await page.getByRole('button', { name: 'Eliminar columna 1' }).click();
  await expect.poll(() => tablixColumnCount('LinesTable2')).toBe(columnsBefore - 1);
  await page.keyboard.press('Control+z');
  await expect.poll(() => tablixColumnCount('LinesTable2')).toBe(columnsBefore);
});

test('el menú contextual de una celda inserta filas y columnas', async () => {
  const proj = await projection();
  const tablix = findItem(proj.page.body.items, 'LinesTable2') as
    (ItemLike & { body: { rows: { cells: (CellLike | null)[] }[] } }) | undefined;
  const content = tablix?.body.rows
    .flatMap((row) => row.cells ?? [])
    .map((cell) => cell?.content)
    .find((entry): entry is ItemLike => Boolean(entry));
  expect(content).toBeTruthy();

  const point = await nodeCenter(content!.id);
  expect(point).not.toBeNull();
  const rowsBefore = await tablixRowCount('LinesTable2');
  const columnsBefore = await tablixColumnCount('LinesTable2');

  // Click derecho sobre la celda: submenú «Insertar fila o columna» → fila debajo.
  await page.mouse.click(point!.x, point!.y, { button: 'right' });
  await page.getByRole('menuitem', { name: 'Insertar fila o columna' }).click();
  await page.getByRole('menuitem', { name: 'Fila debajo' }).click();
  await expect.poll(() => tablixRowCount('LinesTable2')).toBe(rowsBefore + 1);
  await page.keyboard.press('Control+z');
  await expect.poll(() => tablixRowCount('LinesTable2')).toBe(rowsBefore);

  // Click derecho otra vez: submenú → columna a la derecha.
  await page.mouse.click(point!.x, point!.y, { button: 'right' });
  await page.getByRole('menuitem', { name: 'Insertar fila o columna' }).click();
  await page.getByRole('menuitem', { name: 'Columna a la derecha' }).click();
  await expect.poll(() => tablixColumnCount('LinesTable2')).toBe(columnsBefore + 1);
  await page.keyboard.press('Control+z');
  await expect.poll(() => tablixColumnCount('LinesTable2')).toBe(columnsBefore);
});

test('el contenido de una celda está anclado: no se arrastra ni se sale de la celda', async () => {
  const proj = await projection();
  const content = firstCellContent(proj, 'LinesTable2');
  expect(content).toBeTruthy();

  const point = await nodeCenter(content!.id);
  expect(point).not.toBeNull();
  const before = await itemPosition(content!.id);
  const nodeBefore = await nodePosition(content!.id);

  // Intento de arrastre real hacia fuera de la celda.
  await page.mouse.move(point!.x, point!.y);
  await page.mouse.down();
  await page.mouse.move(point!.x + 160, point!.y + 100, { steps: 12 });
  await page.mouse.up();

  expect(await itemPosition(content!.id)).toEqual(before);
  expect(await nodePosition(content!.id)).toEqual(nodeBefore);

  // El contenido va dentro de un grupo que lo recorta a la celda.
  const clipWidth = await page.evaluate((nodeId) => {
    const stage = (window as never as Record<string, unknown>)['__rdlcStage'] as {
      findOne(selector: (node: KonvaLike) => boolean): KonvaLike | undefined;
    };
    const node = stage.findOne((candidate) => candidate.id() === nodeId);
    const clip = node?.getParent().getAttr('clip') as { width?: number } | undefined;
    return clip?.width ?? null;
  }, content!.id);
  expect(clipWidth).toBeGreaterThan(0);
});

test('la selección de la tabla mide su rejilla (el contenido no la infla)', async () => {
  const point = await tablixBorderPoint('LinesTable2');
  expect(point).not.toBeNull();
  await page.mouse.click(point!.x, point!.y);
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            (
              (window as never as Record<string, unknown>)['__rdlcSelection'] as {
                id?: string;
              } | null
            )?.id ?? null,
        ),
      { message: 'LinesTable2 debe quedar seleccionada' },
    )
    .toBe('LinesTable2');

  const sizes = await page.evaluate(() => {
    const stage = (window as never as Record<string, unknown>)['__rdlcStage'] as {
      findOne(selector: (node: KonvaLike) => boolean): KonvaLike | undefined;
    };
    const selection = (window as never as Record<string, unknown>)['__rdlcSelection'] as {
      id: string;
      rect: { width: number; height: number };
    };
    const node = stage.findOne((candidate) => candidate.id() === selection.id);
    const border = node?.getChildren((child) => child.name() === 'tablix-border')[0];
    const grid = border?.getClientRect({ relativeTo: stage });
    return {
      frameWidth: selection.rect.width,
      frameHeight: selection.rect.height,
      gridWidth: grid?.width ?? 0,
      gridHeight: grid?.height ?? 0,
    };
  });

  expect(Math.abs(sizes.frameWidth - sizes.gridWidth)).toBeLessThan(1.5);
  expect(Math.abs(sizes.frameHeight - sizes.gridHeight)).toBeLessThan(1.5);
});

test('la rejilla renderizada se actualiza al añadir y deshacer una columna', async () => {
  const point = await tablixBorderPoint('LinesTable2');
  expect(point).not.toBeNull();
  await page.mouse.click(point!.x, point!.y);
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            (
              (window as never as Record<string, unknown>)['__rdlcSelection'] as {
                id?: string;
              } | null
            )?.id ?? null,
        ),
      { message: 'LinesTable2 debe quedar seleccionada' },
    )
    .toBe('LinesTable2');

  // Fronteras únicas de la rejilla y nodos reales (los nodos son **segmentos**:
  // las fronteras que cruza una celda fusionada no se dibujan).
  const gridEdges = (): Promise<{
    vertical: number[];
    horizontal: number[];
    verticalNodes: number;
    horizontalNodes: number;
  }> =>
    page.evaluate(() => {
      const stage = (window as never as Record<string, unknown>)['__rdlcStage'] as {
        find(selector: (node: KonvaLike) => boolean): KonvaLike[];
      };
      const vertical = new Set<number>();
      const horizontal = new Set<number>();
      let verticalNodes = 0;
      let horizontalNodes = 0;
      for (const node of stage.find((candidate) => candidate.name() === 'tablix-grid')) {
        const points = node.points?.();
        if (!points || points.length < 4) continue;
        if (points[0] === points[2]) {
          vertical.add(Math.round(points[0]! * 100) / 100);
          verticalNodes += 1;
        } else {
          horizontal.add(Math.round(points[1]! * 100) / 100);
          horizontalNodes += 1;
        }
      }
      return {
        vertical: [...vertical],
        horizontal: [...horizontal],
        verticalNodes,
        horizontalNodes,
      };
    });

  const before = await gridEdges();
  // LinesTable2 tiene una celda con `ColSpan 3`: su frontera interior no se
  // dibuja, así que hay más segmentos que fronteras únicas.
  expect(before.verticalNodes).toBeGreaterThan(before.vertical.length);

  await page.getByRole('button', { name: 'Añadir columna al final' }).click();
  await expect
    .poll(async () => (await gridEdges()).vertical.length)
    .toBe(before.vertical.length + 1);
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await gridEdges()).vertical.length).toBe(before.vertical.length);
});

test('las cabeceras del Tablix seleccionan columnas y el menú borra en lote', async () => {
  const point = await tablixBorderPoint('LinesTable2');
  expect(point).not.toBeNull();
  await page.mouse.click(point!.x, point!.y);
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            (
              (window as never as Record<string, unknown>)['__rdlcSelection'] as {
                id?: string;
              } | null
            )?.id ?? null,
        ),
      { message: 'LinesTable2 debe quedar seleccionada' },
    )
    .toBe('LinesTable2');

  // Con una celda seleccionada aparecen las cabeceras (modo celda).
  await page.getByRole('button', { name: 'Seleccionar fila 1' }).click();
  await expect.poll(selectedCell).toEqual({ id: 'LinesTable2', row: 0, col: 0 });

  const columnsBefore = await tablixColumnCount('LinesTable2');
  const rowsCount = await tablixRowCount('LinesTable2');
  const headers = await page.evaluate(() => {
    const stage = (window as never as Record<string, unknown>)['__rdlcStage'] as {
      find(selector: (node: KonvaLike) => boolean): KonvaLike[];
    };
    return {
      columns: stage.find((node) => node.name() === 'tablix-column-header').length,
      rows: stage.find((node) => node.name() === 'tablix-row-header').length,
    };
  });
  expect(headers).toEqual({ columns: columnsBefore, rows: rowsCount });

  // Click en la cabecera de la columna 1 → columna completa seleccionada.
  const firstHeader = await headerPoint('column', 0);
  expect(firstHeader).not.toBeNull();
  await page.mouse.click(firstHeader!.x, firstHeader!.y);
  await expect.poll(selectedCell).toEqual({
    id: 'LinesTable2',
    row: 0,
    col: 0,
    endRow: rowsCount - 1,
    endCol: 0,
  });

  // Shift+click en la cabecera 2 → rango de dos columnas.
  const secondHeader = await headerPoint('column', 1);
  expect(secondHeader).not.toBeNull();
  await page.keyboard.down('Shift');
  await page.mouse.click(secondHeader!.x, secondHeader!.y);
  await page.keyboard.up('Shift');
  await expect.poll(selectedCell).toEqual({
    id: 'LinesTable2',
    row: 0,
    col: 0,
    endRow: rowsCount - 1,
    endCol: 1,
  });

  // Menú contextual dentro del rango: borra las dos columnas en un paso.
  const content = await cellContentAt('LinesTable2', 0, 0);
  const contentPoint = await nodeCenter(content!.id);
  await page.mouse.click(contentPoint!.x, contentPoint!.y, { button: 'right' });
  await page.getByRole('menuitem', { name: 'Eliminar columnas 1–2' }).click();
  await expect.poll(() => tablixColumnCount('LinesTable2')).toBe(columnsBefore - 2);
  await page.keyboard.press('Control+z');
  await expect.poll(() => tablixColumnCount('LinesTable2')).toBe(columnsBefore);
});

test('Shift+click extiende el rango y el menú combina/separa celdas', async () => {
  const c00 = await cellContentAt('LinesTable2', 0, 0);
  const c01 = await cellContentAt('LinesTable2', 0, 1);
  expect(c00).toBeTruthy();
  expect(c01).toBeTruthy();

  // La tabla debe estar seleccionada para que el panel de estructura exista.
  const border = await tablixBorderPoint('LinesTable2');
  expect(border).not.toBeNull();
  await page.mouse.click(border!.x, border!.y);
  await page.getByRole('button', { name: 'Seleccionar fila 1' }).click();
  await expect.poll(selectedCell).toEqual({ id: 'LinesTable2', row: 0, col: 0 });

  // Shift+click en la celda contigua de la misma fila: tramo fusionable.
  const p01 = await nodeCenter(c01!.id);
  expect(p01).not.toBeNull();
  await page.keyboard.down('Shift');
  await page.mouse.click(p01!.x, p01!.y);
  await page.keyboard.up('Shift');
  await expect.poll(selectedCell).toEqual({
    id: 'LinesTable2',
    row: 0,
    col: 0,
    endRow: 0,
    endCol: 1,
  });

  const p00 = await nodeCenter(c00!.id);
  await page.mouse.click(p00!.x, p00!.y, { button: 'right' });
  await page.getByRole('menuitem', { name: 'Combinar celdas' }).click();
  await expect.poll(() => cellSpans('LinesTable2', 0, 0)).toEqual({ colSpan: 2, rowSpan: 1 });

  // Separar desde el menú de la celda combinada.
  await page.mouse.click(p00!.x, p00!.y, { button: 'right' });
  await page.getByRole('menuitem', { name: 'Separar celdas' }).click();
  await expect.poll(() => cellSpans('LinesTable2', 0, 0)).toEqual({ colSpan: 1, rowSpan: 1 });

  // Deshace separar y combinar (deja el documento como estaba).
  await page.keyboard.press('Control+z');
  await expect.poll(() => cellSpans('LinesTable2', 0, 0)).toEqual({ colSpan: 2, rowSpan: 1 });
  await page.keyboard.press('Control+z');
  await expect.poll(() => cellSpans('LinesTable2', 0, 0)).toEqual({ colSpan: 1, rowSpan: 1 });
});

test('un rango de varias filas no ofrece combinar celdas', async () => {
  const c00 = await cellContentAt('LinesTable2', 0, 0);
  const c11 = await cellContentAt('LinesTable2', 1, 1);
  expect(c00).toBeTruthy();
  expect(c11).toBeTruthy();

  const border = await tablixBorderPoint('LinesTable2');
  expect(border).not.toBeNull();
  await page.mouse.click(border!.x, border!.y);
  await page.getByRole('button', { name: 'Seleccionar fila 1' }).click();
  await expect.poll(selectedCell).toEqual({ id: 'LinesTable2', row: 0, col: 0 });

  // Shift+click en (1,1): el rectángulo 2×2 tocaría celdas de otra fila.
  const p11 = await nodeCenter(c11!.id);
  expect(p11).not.toBeNull();
  await page.keyboard.down('Shift');
  await page.mouse.click(p11!.x, p11!.y);
  await page.keyboard.up('Shift');
  await expect.poll(selectedCell).toEqual({
    id: 'LinesTable2',
    row: 0,
    col: 0,
    endRow: 1,
    endCol: 1,
  });

  const p00 = await nodeCenter(c00!.id);
  await page.mouse.click(p00!.x, p00!.y, { button: 'right' });
  await expect(page.getByRole('menuitem', { name: 'Combinar celdas' })).toHaveCount(0);
  // El borrado en lote de esas filas/columnas sigue disponible.
  await expect(page.getByRole('menuitem', { name: 'Eliminar filas 1–2' })).toHaveCount(1);
  await page.keyboard.press('Escape');
});

test('arrastrar el borde de una cabecera redimensiona la columna', async () => {
  const point = await tablixBorderPoint('LinesTable2');
  expect(point).not.toBeNull();
  await page.mouse.click(point!.x, point!.y);
  await page.getByRole('button', { name: 'Seleccionar fila 1' }).click();
  await expect.poll(selectedCell).toEqual({ id: 'LinesTable2', row: 0, col: 0 });

  const before = (await tablixColumns('LinesTable2'))[0]!;
  const edge = await columnHeaderEdgePoint(0);
  expect(edge).not.toBeNull();

  await page.mouse.move(edge!.x, edge!.y);
  await page.mouse.down();
  await page.mouse.move(edge!.x - 60, edge!.y, { steps: 10 });
  await page.mouse.up();

  await expect
    .poll(() => tablixColumns('LinesTable2').then((columns) => columns[0]), {
      message: 'la columna debe encogerse desde la cabecera',
    })
    .not.toBeCloseTo(before, 3);

  await page.keyboard.press('Control+z');
  await expect
    .poll(() => tablixColumns('LinesTable2').then((columns) => columns[0]))
    .toBeCloseTo(before, 3);
});

test('el editor de texto añade runs y el undo lo revierte', async () => {
  const proj = await projection();
  const content = firstCellContent(proj, 'LinesTable2');
  expect(content).toBeTruthy();
  const id = content!.id;

  // Selecciona el textbox y abre el editor desde el panel de propiedades.
  const point = await nodeCenter(id);
  expect(point).not.toBeNull();
  await page.mouse.click(point!.x, point!.y);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            (window as never as Record<string, unknown>)['__rdlcSelection'] as {
              id?: string;
            } | null
          )?.id ?? null,
      ),
    )
    .toBe(id);

  const runsOf = (): Promise<string[]> =>
    page.evaluate((itemId) => {
      const projection = (window as never as Record<string, unknown>)['__rdlcProjection'];
      let found: { paragraphs?: { runs: { value: string }[] }[] } | undefined;
      const walk = (value: unknown): void => {
        if (found) return;
        if (Array.isArray(value)) {
          value.forEach(walk);
          return;
        }
        if (value && typeof value === 'object') {
          const node = value as Record<string, unknown>;
          if (node['id'] === itemId && node['kind'] === 'textbox') {
            found = node as never;
            return;
          }
          Object.values(node).forEach(walk);
        }
      };
      walk(projection);
      return (found?.paragraphs ?? []).flatMap((paragraph) =>
        paragraph.runs.map((run) => run.value),
      );
    }, id);

  const before = (await runsOf()).length;
  await page.getByRole('button', { name: 'Abrir editor de texto' }).click();

  // En el textarea, un marcador nuevo al final = un run de expresión nuevo.
  const area = page.getByLabel('Texto del textbox');
  await area.click();
  await page.keyboard.press('Control+End');
  await area.pressSequentially('⟨=Fields!Total.Value⟩');
  await page.getByRole('button', { name: 'Aplicar' }).click();

  await expect.poll(async () => (await runsOf()).length).toBe(before + 1);
  expect(await runsOf()).toContain('=Fields!Total.Value');

  // Un solo Ctrl+Z revierte el cambio completo.
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await runsOf()).length).toBe(before);
});

test('el editor de texto monta Monaco en el párrafo activo y sugiere', async () => {
  const proj = await projection();
  const content = firstCellContent(proj, 'LinesTable2');
  expect(content).toBeTruthy();
  const point = await nodeCenter(content!.id);
  expect(point).not.toBeNull();
  await page.mouse.click(point!.x, point!.y);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            (window as never as Record<string, unknown>)['__rdlcSelection'] as {
              id?: string;
            } | null
          )?.id ?? null,
      ),
    )
    .toBe(content!.id);

  const started = Date.now();
  await page.getByRole('button', { name: 'Abrir editor de texto' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  const elapsed = Date.now() - started;

  // Monaco inline por run de expresión **del párrafo activo** (aquí 1), no por
  // todo el textbox: el diálogo abre rápido.
  await expect(page.locator('[role="dialog"] .monaco-editor')).toHaveCount(1);
  expect(elapsed).toBeLessThan(2500);

  // El autocompletado se ve (el widget vive fuera del contenedor del editor:
  // dentro del diálogo, con `transform`/`overflow`, quedaría recortado).
  const editor = page.locator('[role="dialog"] .monaco-editor').first();
  await editor.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.type('=Code.');
  await expect(page.locator('.suggest-widget')).toBeVisible();

  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
});

test('el marco mide la caja del textbox aunque su texto sobresalga', async () => {
  // El textbox de la dirección de la empresa: 5 párrafos y textos más anchos que
  // su caja (7.5331 × 1.9767 cm). El marco no debe inflarse con el texto.
  const id = await page.evaluate(() => {
    const projection = (window as never as Record<string, unknown>)['__rdlcProjection'];
    let found: string | null = null;
    const walk = (value: unknown): void => {
      if (found) return;
      if (Array.isArray(value)) {
        value.forEach(walk);
        return;
      }
      if (value && typeof value === 'object') {
        const node = value as Record<string, unknown>;
        if (node['kind'] === 'textbox' && typeof node['id'] === 'string') {
          const paragraphs = (node['paragraphs'] ?? []) as {
            runs?: { label?: string }[];
          }[];
          if (paragraphs.some((p) => (p.runs ?? []).some((r) => r.label === 'BTCMyCompanyName'))) {
            found = node['id'] as string;
            return;
          }
        }
        Object.values(node).forEach(walk);
      }
    };
    walk(projection);
    return found;
  });
  expect(id).toBeTruthy();

  const point = await nodeCenter(id!);
  expect(point).not.toBeNull();
  await page.mouse.click(point!.x, point!.y);

  const rects = await page.evaluate((itemId) => {
    const stage = (window as never as Record<string, unknown>)['__rdlcStage'] as {
      findOne(selector: (node: KonvaLike) => boolean): KonvaLike | undefined;
    };
    const node = stage.findOne((candidate) => candidate.id() === itemId);
    const groupRect = node?.getClientRect({ relativeTo: stage });
    const boxRect = node
      ?.getChildren()
      .flatMap((child) => child.getChildren((candidate) => candidate.name() === 'item-box'))
      .find((candidate) => Boolean(candidate))
      ?.getClientRect({ relativeTo: stage });
    const selection = (
      (window as never as Record<string, unknown>)['__rdlcSelection'] as {
        rect?: { width: number; height: number };
      } | null
    )?.rect;
    return {
      group: groupRect?.width ?? 0,
      box: boxRect?.width ?? 0,
      boxHeight: boxRect?.height ?? 0,
      selection: selection?.width ?? 0,
      selectionHeight: selection?.height ?? 0,
    };
  }, id!);

  // El texto sobresale de la caja (el grupo mediría más)…
  expect(rects.group).toBeGreaterThan(rects.box + 1);
  // …pero el marco de selección mide la caja del item.
  expect(rects.selection).toBeCloseTo(rects.box, 0);
  expect(rects.selectionHeight).toBeCloseTo(rects.boxHeight, 0);

  await page.keyboard.press('Escape');
});

test('la alineación del párrafo se refleja en el lienzo', async () => {
  const proj = await projection();
  const content = firstCellContent(proj, 'LinesTable2');
  expect(content).toBeTruthy();
  const id = content!.id;
  const point = await nodeCenter(id);
  expect(point).not.toBeNull();
  await page.mouse.click(point!.x, point!.y);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            (window as never as Record<string, unknown>)['__rdlcSelection'] as {
              id?: string;
            } | null
          )?.id ?? null,
      ),
    )
    .toBe(id);

  // El x del primer run del textbox en el lienzo (0 = pegado a la izquierda).
  const firstRunX = (): Promise<number | null> =>
    page.evaluate((itemId) => {
      const stage = (window as never as Record<string, unknown>)['__rdlcStage'] as {
        findOne(selector: (node: KonvaLike) => boolean): KonvaLike | undefined;
      };
      const item = stage.findOne((candidate) => candidate.id() === itemId);
      const clip = item?.getChildren()[0];
      const run = clip?.getChildren((candidate) => candidate.name() === 'textbox-run')[0];
      return run ? run.x() : null;
    }, id);

  // BC trae este párrafo centrado; lo dejamos a la izquierda para medir.
  await page.getByRole('button', { name: 'Abrir editor de texto' }).click();
  await page.getByRole('button', { name: 'Alinear izquierda (párrafo 1)' }).click();
  await page.getByRole('button', { name: 'Aplicar' }).click();

  const left = await firstRunX();
  expect(left).not.toBeNull();
  expect(left!).toBeLessThan(30);

  // Centra el párrafo 1 desde el editor de texto: el lienzo lo refleja.
  await page.getByRole('button', { name: 'Abrir editor de texto' }).click();
  await page.getByRole('button', { name: 'Centrar (párrafo 1)' }).click();
  await page.getByRole('button', { name: 'Aplicar' }).click();

  await expect.poll(firstRunX).toBeGreaterThan(left! + 5);

  // Y con la alineación en el párrafo del XML (no en el item).
  const alignment = await page.evaluate((itemId) => {
    const projection = (window as never as Record<string, unknown>)['__rdlcProjection'];
    let found: { paragraphs?: { style?: { textAlign?: string } }[] } | undefined;
    const walk = (value: unknown): void => {
      if (found) return;
      if (Array.isArray(value)) {
        value.forEach(walk);
        return;
      }
      if (value && typeof value === 'object') {
        const node = value as Record<string, unknown>;
        if (node['id'] === itemId && node['kind'] === 'textbox') {
          found = node as never;
          return;
        }
        Object.values(node).forEach(walk);
      }
    };
    walk(projection);
    return found?.paragraphs?.[0]?.style?.textAlign ?? null;
  }, id);
  expect(alignment).toBe('Center');

  // El undo (x2) devuelve el documento como estaba.
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  await expect.poll(firstRunX).toBeGreaterThan(left! + 5);
});

test('el click derecho sobre una celda suelta no pierde la selección', async () => {
  // La tabla debe estar seleccionada para que el panel de estructura exista.
  const border = await tablixBorderPoint('LinesTable2');
  expect(border).not.toBeNull();
  await page.mouse.click(border!.x, border!.y);

  // Ancla (0,0) y Ctrl+click en la celda (0,2): la suelta vive en `extra`.
  await page.getByRole('button', { name: 'Seleccionar fila 1' }).click();
  await expect.poll(selectedCell).toEqual({ id: 'LinesTable2', row: 0, col: 0 });

  const c02 = await cellContentAt('LinesTable2', 0, 2);
  expect(c02).toBeTruthy();
  const p02 = await nodeCenter(c02!.id);
  await page.keyboard.down('Control');
  await page.mouse.click(p02!.x, p02!.y);
  await page.keyboard.up('Control');
  await expect.poll(selectedCell).toEqual({
    id: 'LinesTable2',
    row: 0,
    col: 0,
    extra: [{ row: 0, col: 2 }],
  });

  // Con el botón derecho sobre esa celda el rango manda: el menú es el de la
  // selección (borrado en lote), no el de una sola celda.
  await page.mouse.click(p02!.x, p02!.y, { button: 'right' });
  await expect(page.getByRole('menuitem', { name: 'Eliminar columnas 1, 3' })).toHaveCount(1);
  // La acción del rango, no la de la celda suelta (columna 3 sola).
  await expect(page.getByRole('menuitem', { name: 'Eliminar columna 3' })).toHaveCount(0);
  // Hay un hueco entre (0,0) y (0,2): no es un tramo contiguo, no hay fusión.
  await expect(page.getByRole('menuitem', { name: 'Combinar celdas' })).toHaveCount(0);
  await expect.poll(selectedCell).toEqual({
    id: 'LinesTable2',
    row: 0,
    col: 0,
    extra: [{ row: 0, col: 2 }],
  });
  await page.keyboard.press('Escape');
});

test('Ctrl+click en celdas contiguas de una fila permite combinar', async () => {
  // La tabla debe estar seleccionada para que el panel de estructura exista.
  const border = await tablixBorderPoint('LinesTable2');
  expect(border).not.toBeNull();
  await page.mouse.click(border!.x, border!.y);

  // Ancla (0,0) y Ctrl+click en (0,1): contiguas y de la misma fila.
  await page.getByRole('button', { name: 'Seleccionar fila 1' }).click();
  await expect.poll(selectedCell).toEqual({ id: 'LinesTable2', row: 0, col: 0 });

  const c01 = await cellContentAt('LinesTable2', 0, 1);
  expect(c01).toBeTruthy();
  const p01 = await nodeCenter(c01!.id);
  await page.keyboard.down('Control');
  await page.mouse.click(p01!.x, p01!.y);
  await page.keyboard.up('Control');
  await expect.poll(selectedCell).toEqual({
    id: 'LinesTable2',
    row: 0,
    col: 0,
    extra: [{ row: 0, col: 1 }],
  });

  const c00 = await cellContentAt('LinesTable2', 0, 0);
  expect(c00).toBeTruthy();
  const p00 = await nodeCenter(c00!.id);
  await page.mouse.click(p00!.x, p00!.y, { button: 'right' });
  await page.getByRole('menuitem', { name: 'Combinar celdas' }).click();
  await expect.poll(() => cellSpans('LinesTable2', 0, 0)).toEqual({ colSpan: 2, rowSpan: 1 });

  // La selección pasa a otra celda (vacía) para que la fusionada no esté
  // seleccionada: el click derecho sobre ella también debe ofrecer Separar
  // (manda la celda del hit, no la selección).
  await page.getByRole('button', { name: 'Seleccionar fila 3' }).click();
  await page.getByRole('button', { name: 'Seleccionar columna 4' }).click();
  await expect.poll(selectedCell).toEqual({ id: 'LinesTable2', row: 2, col: 3 });

  await page.mouse.click(p01!.x, p01!.y, { button: 'right' });
  await page.getByRole('menuitem', { name: 'Separar celdas' }).click();
  await expect.poll(() => cellSpans('LinesTable2', 0, 0)).toEqual({ colSpan: 1, rowSpan: 1 });

  // Undo x2: deja el documento como estaba.
  await page.keyboard.press('Control+z');
  await expect.poll(() => cellSpans('LinesTable2', 0, 0)).toEqual({ colSpan: 2, rowSpan: 1 });
  await page.keyboard.press('Control+z');
  await expect.poll(() => cellSpans('LinesTable2', 0, 0)).toEqual({ colSpan: 1, rowSpan: 1 });
});
