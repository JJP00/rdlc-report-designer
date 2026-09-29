import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Locator,
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
  page: {
    header: { items: ItemLike[] };
    body: { items: ItemLike[] };
    footer: { items: ItemLike[] };
  };
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
  hidden?: boolean | string;
  style?: { backgroundColor?: string };
  paragraphs?: { runs: { value: string; label?: string }[] }[];
  rowHierarchy?: MemberLike[];
  columnHierarchy?: MemberLike[];
  body?: {
    columns: { value: number; unit: string }[];
    rows: { height: { value: number; unit: string }; cells: (CellLike | null)[] }[];
  };
  children?: ItemLike[];
}

interface MemberLike {
  path: number[];
  expression?: string;
  hidden?: boolean | string;
  sortExpressions?: { value: string; direction?: string }[];
  pageBreaks?: string[];
  children: MemberLike[];
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
  opacity?(): number;
  points?(): number[];
  getAttr(name: string): unknown;
  getParent(): KonvaLike;
  getChildren(filter?: (node: KonvaLike) => boolean): KonvaLike[];
  findOne?(selector: (node: KonvaLike) => boolean): KonvaLike | undefined;
  getAbsoluteTransform(): { point(point: { x: number; y: number }): { x: number; y: number } };
  getClientRect(options: { relativeTo: unknown }): {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

/** Opacidad del nodo Konva de un item (los ocultos se atenúan). */
async function itemOpacityOnStage(id: string): Promise<number> {
  return page.evaluate((nodeId) => {
    const stage = (window as never as Record<string, unknown>)['__rdlcStage'] as {
      findOne(selector: (node: KonvaLike) => boolean): KonvaLike | undefined;
    };
    const node = stage.findOne((candidate) => candidate.id() === nodeId);
    return node?.opacity?.() ?? -1;
  }, id);
}

/** Relleno del `item-box` del item (para comprobar el color de fondo). */
async function itemBoxFill(id: string): Promise<string | null> {
  return page.evaluate((nodeId) => {
    const stage = (window as never as Record<string, unknown>)['__rdlcStage'] as {
      findOne(selector: (node: KonvaLike) => boolean): KonvaLike | undefined;
    };
    const node = stage.findOne((candidate) => candidate.id() === nodeId);
    const box = node?.findOne?.((candidate) => candidate.name() === 'item-box');
    const fill = box?.getAttr('fill');
    return typeof fill === 'string' ? fill : null;
  }, id);
}

/** Cambia un `input[type=color]` (Playwright no teclea en estos inputs). */
async function setBackgroundColor(value: string): Promise<void> {
  await page.locator('input[aria-label="Color de fondo"]').evaluate((el, color) => {
    const input = el as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, color);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
}

/** Fondo proyectado de un item (encabezado, cuerpo o pie). */
async function itemBackground(id: string): Promise<string | undefined> {
  const proj = await projection();
  for (const items of [proj.page.header.items, proj.page.body.items, proj.page.footer.items]) {
    const found = findItem(items, id);
    if (found) return found.style?.backgroundColor;
  }
  return undefined;
}

/** Miembro de la jerarquía (fila/columna) por su `path` en la proyección viva. */
async function memberAtPath(
  tablixId: string,
  axis: 'row' | 'column',
  path: number[],
): Promise<MemberLike | undefined> {
  const proj = await projection();
  const tablix = findItem(proj.page.body.items, tablixId);
  let level = axis === 'row' ? tablix?.rowHierarchy : tablix?.columnHierarchy;
  let member: MemberLike | undefined;
  for (const index of path) {
    member = level?.[index];
    if (!member) return undefined;
    level = member.children;
  }
  return member;
}

/** Visibilidad proyectada de un miembro (fila/columna) por su `path`. */
async function memberHidden(
  tablixId: string,
  axis: 'row' | 'column',
  path: number[],
): Promise<boolean | string | undefined> {
  return (await memberAtPath(tablixId, axis, path))?.hidden;
}

/** Expresión proyectada de un miembro (fila/columna) por su `path`. */
async function memberExpression(
  tablixId: string,
  axis: 'row' | 'column',
  path: number[],
): Promise<string | undefined> {
  return (await memberAtPath(tablixId, axis, path))?.expression;
}

/** Número de hijos (`TablixMembers`) de un miembro: 0 = grupo hoja. */
async function memberChildCount(
  tablixId: string,
  axis: 'row' | 'column',
  path: number[],
): Promise<number | undefined> {
  return (await memberAtPath(tablixId, axis, path))?.children.length;
}

/** Ordenación proyectada del miembro (`SortExpressions`). */
async function memberSort(
  tablixId: string,
  axis: 'row' | 'column',
  path: number[],
): Promise<{ value: string; direction?: string }[] | undefined> {
  return (await memberAtPath(tablixId, axis, path))?.sortExpressions;
}

/** Saltos de página proyectados del miembro (`PageBreak > BreakLocation`). */
async function memberPageBreaks(
  tablixId: string,
  axis: 'row' | 'column',
  path: number[],
): Promise<string[] | undefined> {
  return (await memberAtPath(tablixId, axis, path))?.pageBreaks;
}

/** Etiqueta `<Label>` del primer run de un textbox (encabezado, cuerpo o pie). */
async function itemLabel(id: string): Promise<string | undefined> {
  const proj = await projection();
  for (const items of [proj.page.header.items, proj.page.body.items, proj.page.footer.items]) {
    const found = findItem(items, id);
    if (found) return found.paragraphs?.[0]?.runs[0]?.label;
  }
  return undefined;
}

/** Escribe una expresión en el diálogo de expresiones y aplica. */
async function applyExpressionInDialog(title: string, expression: string): Promise<void> {
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { name: title })).toBeVisible();
  const editor = dialog.locator('.monaco-editor');
  await expect(editor).toBeVisible({ timeout: 15_000 });
  await editor.click();
  await page.keyboard.type(expression);
  await dialog.getByRole('button', { name: 'Aplicar' }).click();
  await expect(dialog).toBeHidden();
}

/** Visibilidad proyectada de un item (encabezado, cuerpo o pie). */
async function itemHidden(id: string): Promise<boolean | string | undefined> {
  const proj = await projection();
  for (const items of [proj.page.header.items, proj.page.body.items, proj.page.footer.items]) {
    const found = findItem(items, id);
    if (found) return found.hidden;
  }
  return undefined;
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
  // Con un editor Monaco enfocado, Ctrl+K no llega a la app (es un chord).
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
  await page.keyboard.press('Control+k');
  await page.getByPlaceholder('Buscar elemento, variable o acción…').fill(id);
  // Deja que cmdk filtre y asiente la lista: si se pincha mientras se
  // reordena, el clic puede caer en otra opción.
  await page.waitForTimeout(250);
  // Nombre exacto: el matching de la paleta es difuso («Textbox87» también
  // encaja con «Textbox187»).
  await page.getByRole('option', { name: new RegExp(`^${id}\\b`) }).click();
  await expect.poll(selectedId).toBe(id);
  // La paleta «trae a la vista» con scroll suave: si un `nodeCenter` se
  // calcula a media animación, el click cae en otro sitio.
  await waitCanvasScrollSettled();
}

/**
 * Espera a que el scroll del lienzo deje de moverse (el «traer a la vista» de
 * la paleta usa `scrollTo({ behavior: 'smooth' })`).
 */
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

/** Texto pintado por un editor Monaco (una expresión, tal cual se ve). */
async function monacoText(editor: Locator): Promise<string> {
  return (await editor.locator('.view-lines').innerText()).replace(/\u00a0/g, ' ').trim();
}

/** Posición del desplegable de sugerencias (visible y por encima de todo). */
async function suggestWidgetInfo(): Promise<{
  onTop: boolean;
  width: number;
  height: number;
  rows: string[];
} | null> {
  return page.evaluate(() => {
    const widget = document.querySelector('.suggest-widget');
    if (!widget) return null;
    const rect = widget.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    return {
      onTop: hit?.closest('.suggest-widget') !== null,
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      rows: [...widget.querySelectorAll('.monaco-list-row')].map(
        (row) => row.textContent?.trim() ?? '',
      ),
    };
  });
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

test('al añadir una fila, las celdas nuevas nacen con un textbox seleccionable', async () => {
  // Tablix2 es la única tabla de primer nivel del informe: su fila nueva no
  // queda tapada por las tablas anidadas que van encima.
  const point = await tablixBorderPoint('Tablix2');
  expect(point).not.toBeNull();
  await page.mouse.click(point!.x, point!.y);
  await expect.poll(selectedId).toBe('Tablix2');

  const rowsBefore = await tablixRowCount('Tablix2');
  await page.getByRole('button', { name: 'Añadir fila al final' }).click();
  await expect.poll(() => tablixRowCount('Tablix2')).toBe(rowsBefore + 1);

  // La celda nueva trae un textbox vacío (no celdas muertas).
  const added = findItem((await projection()).page.body.items, 'Tablix2')?.body?.rows[rowsBefore];
  const ids = (added?.cells ?? []).map((cell) => cell?.content?.id);
  expect(ids).toHaveLength(1);
  expect(ids[0]).toMatch(/^Textbox\d+$/);

  // El lienzo lo pinta y se selecciona como cualquier item.
  const center = await nodeCenter(ids[0]!);
  expect(center).not.toBeNull();
  await page.mouse.click(center!.x, center!.y);
  await expect.poll(selectedId).toBe(ids[0]);

  await page.keyboard.press('Control+z');
  await expect.poll(() => tablixRowCount('Tablix2')).toBe(rowsBefore);
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

test('el autocompletado de expresiones muestra el desplegable y elige con ratón y Tab', async () => {
  await selectItemViaPalette('Textbox4');

  // El panel simple monta el Monaco de la expresión (carga diferida).
  const container = page.locator('[aria-label="Expresión del run 1.1"]').first();
  const editor = container.locator('.monaco-editor');
  await expect(editor).toBeVisible({ timeout: 15_000 });
  await editor.click();
  await page.keyboard.press('Control+Space');

  const widget = page.locator('.suggest-widget');
  await expect(widget).toBeVisible({ timeout: 10_000 });

  // Visible, con tamaño y por encima de todo (el host de overflow del body
  // necesita la clase `monaco-editor`: sin el CSS scoped quedaría invisible).
  const info = await suggestWidgetInfo();
  expect(info).not.toBeNull();
  expect(info!.onTop).toBe(true);
  expect(info!.width).toBeGreaterThan(100);
  expect(info!.height).toBeGreaterThan(40);
  expect(info!.rows.length).toBeGreaterThan(0);

  // Elegir con el ratón inserta la sugerencia.
  const before = await monacoText(editor);
  await widget.locator('.monaco-list-row').first().click();
  await expect.poll(() => monacoText(editor)).not.toBe(before);
  expect(await monacoText(editor)).toContain('Fields!');

  // Y con el teclado: Ctrl+Espacio + Tab.
  await editor.click();
  await page.keyboard.press('Control+End');
  await page.keyboard.press('Control+Space');
  await expect(widget).toBeVisible();
  const afterClick = await monacoText(editor);
  await page.keyboard.press('Tab');
  await expect.poll(() => monacoText(editor)).not.toBe(afterClick);
});

test('el autocompletado del editor de texto se ve por encima del diálogo', async () => {
  await selectItemViaPalette('TextboxVATClauseLbl');
  await page.getByRole('button', { name: 'Abrir editor de texto' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();

  // Una expresión nueva en el párrafo activo monta el Monaco inline del run.
  await page.getByRole('button', { name: 'Añadir expresión' }).click();
  const editor = page.locator('[role="dialog"] .monaco-editor').last();
  await expect(editor).toBeVisible({ timeout: 15_000 });
  await editor.click();
  await page.keyboard.press('Control+Space');

  await expect(page.locator('.suggest-widget')).toBeVisible({ timeout: 10_000 });
  const info = await suggestWidgetInfo();
  expect(info).not.toBeNull();
  expect(info!.onTop).toBe(true);

  // El borrador se descarta.
  await page.getByRole('button', { name: 'Cancelar' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
});

test('seleccionar un Tablix mide su rejilla, no la de un Tablix anidado', async () => {
  await selectItemViaPalette('Tablix2');

  const selection = await page.evaluate(
    () =>
      (window as never as Record<string, unknown>)['__rdlcSelection'] as {
        id: string;
        rect: { width: number; height: number };
      } | null,
  );
  expect(selection?.id).toBe('Tablix2');
  // La rejilla de Tablix2 es 19 × 12.516 cm (≈ 718 × 473 px de papel); el bug
  // medía el borde del primer Tablix anidado, LinesTable2 (2.576 cm).
  expect(selection!.rect.width).toBeGreaterThan(700);
  expect(selection!.rect.height).toBeGreaterThan(400);
});

test('el panel de propiedades edita la visibilidad y el color de fondo', async () => {
  // Textbox4 vive en el **encabezado** de página: ni la visibilidad ni el
  // estilo dependen de la región y sirve igual para el test.
  await selectItemViaPalette('Textbox4');

  // La predeterminada es visible (Textbox4 no declara `Visibility`).
  const visibility = page.getByLabel('Visibilidad del elemento');
  await expect(visibility).toHaveValue('visible');

  // Oculta: se escribe `Hidden=true` y el lienzo la pinta atenuada.
  await visibility.selectOption('hidden');
  await expect.poll(() => itemHidden('Textbox4')).toBe(true);
  await expect.poll(() => itemOpacityOnStage('Textbox4')).toBeLessThan(0.5);

  // Expresión: «Expresión…» abre el diálogo con Monaco (números de línea).
  await visibility.selectOption('expression');
  await applyExpressionInDialog('Expresión de visibilidad', '=Fields!BTCItemLbl.Value');
  await expect.poll(() => itemHidden('Textbox4')).toBe('=Fields!BTCItemLbl.Value');
  // Las expresiones no se evalúan en diseño: el item se pinta normal.
  await expect.poll(() => itemOpacityOnStage('Textbox4')).toBe(1);

  // Color literal: se pinta en la caja del item.
  await setBackgroundColor('#ff0000');
  await expect.poll(() => itemBoxFill('Textbox4')).toBe('#FF0000');
  await page.getByRole('button', { name: 'Quitar color de fondo' }).click();
  await expect.poll(() => itemBoxFill('Textbox4')).toBe('#ffffff');

  // El selector agrupa la ráfaga de `input` del arrastre: tres pasos = **un solo
  // comando**, así que un único undo vuelve al color anterior (no a un paso
  // intermedio de la ráfaga).
  await setBackgroundColor('#aa0000');
  await setBackgroundColor('#bb0000');
  await setBackgroundColor('#cc0000');
  await expect.poll(() => itemBoxFill('Textbox4')).toBe('#CC0000');
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
  await page.keyboard.press('Control+z');
  await expect.poll(() => itemBoxFill('Textbox4')).toBe('#ffffff');

  // Fondo por expresión (botón Σ): tampoco se evalúa en diseño.
  const backgroundExpression = '=IIF(Fields!BTCItemLbl.Value, "LightGray", "White")';
  await page
    .getByRole('button', { name: 'Abrir editor de la expresión de color de fondo' })
    .click();
  await applyExpressionInDialog('Expresión del color de fondo', backgroundExpression);
  await expect.poll(() => itemBackground('Textbox4')).toBe(backgroundExpression);
  await expect.poll(() => itemBoxFill('Textbox4')).toBe('#ffffff');

  // Visible quita la declaración: vuelve a la predeterminada.
  await visibility.selectOption('visible');
  await expect.poll(() => itemHidden('Textbox4')).toBeUndefined();
});

test('el panel de propiedades renombra el elemento (con validación y undo)', async () => {
  await selectItemViaPalette('Textbox4');

  const name = page.getByLabel('Nombre del elemento');
  await expect(name).toHaveValue('Textbox4');

  // Renombrado válido: la selección y el panel siguen al nombre nuevo.
  await name.fill('Textbox4Renombrado');
  await name.press('Enter');
  await expect.poll(selectedId).toBe('Textbox4Renombrado');
  await expect(name).toHaveValue('Textbox4Renombrado');

  // Nombre duplicado: lo rechaza el dominio (aviso) y no cambia nada.
  await name.fill('Tablix2');
  await name.press('Enter');
  await expect(page.getByText(/Ya existe un elemento con el nombre/)).toBeVisible();
  await expect.poll(selectedId).toBe('Textbox4Renombrado');

  // Un solo undo revierte el renombrado; el nombre original vuelve al informe.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
  await page.keyboard.press('Control+z');
  await selectItemViaPalette('Textbox4');
  await expect(page.getByLabel('Nombre del elemento')).toHaveValue('Textbox4');
});

test('la visibilidad de filas y columnas se edita desde la estructura', async () => {
  // Tablix3: 2 filas × 6 columnas sin grupos (rutas simples en la proyección).
  await selectItemViaPalette('Tablix3');
  await expect(page.getByRole('region', { name: 'Estructura del Tablix' })).toBeVisible();

  // El ojo de la fila 1 escribe `Hidden=true` y el botón pasa a «Mostrar».
  await page.getByRole('button', { name: 'Ocultar fila 1' }).click();
  await expect.poll(() => memberHidden('Tablix3', 'row', [0])).toBe(true);
  await expect(page.getByRole('button', { name: 'Mostrar fila 1' })).toBeVisible();

  // Σ abre el diálogo de expresión y la escribe en la columna 1.
  await page.getByRole('button', { name: 'Expresión de visibilidad de la columna 1' }).click();
  await applyExpressionInDialog('Visibilidad de la columna 1', '=Fields!BTCJobNo.Value <> ""');
  await expect
    .poll(() => memberHidden('Tablix3', 'column', [0]))
    .toBe('=Fields!BTCJobNo.Value <> ""');

  // Mostrar la fila quita la declaración; cada acción es un paso de undo.
  await page.getByRole('button', { name: 'Mostrar fila 1' }).click();
  await expect.poll(() => memberHidden('Tablix3', 'row', [0])).toBeUndefined();
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
  await page.keyboard.press('Control+z');
  await expect.poll(() => memberHidden('Tablix3', 'row', [0])).toBe(true);
  await page.keyboard.press('Control+z');
  await expect.poll(() => memberHidden('Tablix3', 'column', [0])).toBeUndefined();
});

test('la etiqueta del run se edita desde el panel de propiedades', async () => {
  // Textbox4 (encabezado): `=Code.GetData(2, 1)` con `<Label>BTCNifCifLbl</Label>`.
  await selectItemViaPalette('Textbox4');
  const label = page.getByLabel('Etiqueta del run 1.1');
  await expect(label).toHaveValue('BTCNifCifLbl');

  // Cambiarla desde el panel (sin abrir el editor de texto).
  await label.fill('MiEtiqueta');
  await label.press('Enter');
  await expect.poll(() => itemLabel('Textbox4')).toBe('MiEtiqueta');

  // Vaciar el campo quita el `<Label>` del XML.
  await label.fill('');
  await label.press('Enter');
  await expect.poll(() => itemLabel('Textbox4')).toBeUndefined();

  // Cada commit es un paso de undo (setParagraphs byte-exacto).
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
  await page.keyboard.press('Control+z');
  await expect.poll(() => itemLabel('Textbox4')).toBe('MiEtiqueta');
  await page.keyboard.press('Control+z');
  await expect.poll(() => itemLabel('Textbox4')).toBe('BTCNifCifLbl');
});

test('las cabeceras del Tablix (TablixHeader/TablixCorner) se proyectan y seleccionan', async () => {
  // Tablix7: cabecera de fila del grupo (VATIdentifier…) + 2 de columna + esquina.
  await selectItemViaPalette('Tablix7');

  // Los 4 textboxes ya se pintan en el lienzo (antes no se proyectaban).
  for (const id of ['Textbox72', 'Textbox73', 'Textbox75', 'VATIdentifier_VatAmountLine']) {
    await expect
      .poll(
        () =>
          page.evaluate((nodeId) => {
            const stage = (window as never as Record<string, unknown>)['__rdlcStage'] as {
              findOne(selector: (node: KonvaLike) => boolean): KonvaLike | undefined;
            };
            return Boolean(stage.findOne((candidate) => candidate.id() === nodeId));
          }, id),
        { message: `${id} debe estar en el lienzo` },
      )
      .toBe(true);
  }

  // El marco mide cabeceras + rejilla: 7.85172 × 1.2 cm ≈ 296.7 × 45.4 px de papel.
  const selection = await page.evaluate(
    () =>
      (window as never as Record<string, unknown>)['__rdlcSelection'] as {
        id: string;
        rect: { width: number; height: number };
      } | null,
  );
  expect(selection?.id).toBe('Tablix7');
  expect(selection!.rect.width).toBeGreaterThan(290);
  expect(selection!.rect.height).toBeGreaterThan(40);

  // Click en la cabecera de fila (grupo): selecciona su textbox, anclado a la celda.
  const header = await nodeCenter('VATIdentifier_VatAmountLine');
  expect(header).not.toBeNull();
  await page.mouse.click(header!.x, header!.y);
  await expect.poll(selectedId).toBe('VATIdentifier_VatAmountLine');
  await expect(page.getByText('La celda fija la posición y el tamaño del contenido')).toBeVisible();
  await expect(page.getByLabel('Nombre del elemento')).toHaveValue('VATIdentifier_VatAmountLine');
});

/* ------------------------- F2.b · grupos de fila ------------------------- */

test('los grupos hoja se ven en la estructura y su expresión se edita', async () => {
  // Tablix7: el grupo `=Fields!VATPct_VatAmountLine.Value` ES la fila (sin hijos).
  await selectItemViaPalette('Tablix7');
  await expect(page.getByRole('region', { name: 'Estructura del Tablix' })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Propiedades del grupo de la fila 1' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Seleccionar fila 1' })).toBeVisible();
  await expect.poll(() => memberChildCount('Tablix7', 'row', [0])).toBe(0);
  await expect
    .poll(() => memberExpression('Tablix7', 'row', [0]))
    .toBe('=Fields!VATPct_VatAmountLine.Value');

  // «Propiedades del grupo» → cambiar la expresión desde el desplegable de variables.
  await page.getByRole('button', { name: 'Propiedades del grupo de la fila 1' }).click();
  const dialog = page.getByRole('dialog');
  await expect(
    dialog.getByRole('heading', { name: 'Propiedades del grupo · VATIdentifier_VatAmountLine' }),
  ).toBeVisible();
  await dialog.getByLabel('Expresión de grupo').selectOption('=Fields!DocumentNo.Value');
  await dialog.getByRole('button', { name: 'Aplicar' }).click();
  await expect(dialog).toBeHidden();

  await expect.poll(() => memberExpression('Tablix7', 'row', [0])).toBe('=Fields!DocumentNo.Value');
  // Sigue siendo el mismo grupo hoja: una fila, sin hijos.
  expect(await tablixRowCount('Tablix7')).toBe(1);
  expect(await memberChildCount('Tablix7', 'row', [0])).toBe(0);

  // Un solo undo devuelve la expresión (byte-exacto).
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
  await page.keyboard.press('Control+z');
  await expect
    .poll(() => memberExpression('Tablix7', 'row', [0]))
    .toBe('=Fields!VATPct_VatAmountLine.Value');
});

test('las propiedades del grupo editan saltos de página y ordenación', async () => {
  await selectItemViaPalette('Tablix7');
  await expect
    .poll(() => memberSort('Tablix7', 'row', [0]))
    .toEqual([{ value: '=Fields!VATIdentifier_VatAmountLine.Value' }]);

  await page.getByRole('button', { name: 'Propiedades del grupo de la fila 1' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: /Propiedades del grupo/ })).toBeVisible();

  // Ordenación: la existente pasa a Z → A.
  await dialog.getByRole('tab', { name: 'Ordenación' }).click();
  await dialog.getByLabel('Dirección de la ordenación 1').selectOption('Descending');

  // Saltos de página: «entre cada instancia del grupo».
  await dialog.getByRole('tab', { name: 'Saltos de página' }).click();
  await dialog.getByLabel('Entre cada instancia del grupo').check();

  await dialog.getByRole('button', { name: 'Aplicar' }).click();
  await expect(dialog).toBeHidden();

  await expect
    .poll(() => memberSort('Tablix7', 'row', [0]))
    .toEqual([{ value: '=Fields!VATIdentifier_VatAmountLine.Value', direction: 'Descending' }]);
  await expect.poll(() => memberPageBreaks('Tablix7', 'row', [0])).toEqual(['Between']);

  // Cada sección es un paso de undo (el diálogo manda salto y orden).
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
  await page.keyboard.press('Control+z');
  await expect
    .poll(() => memberSort('Tablix7', 'row', [0]))
    .toEqual([{ value: '=Fields!VATIdentifier_VatAmountLine.Value' }]);
  await page.keyboard.press('Control+z');
  await expect.poll(() => memberPageBreaks('Tablix7', 'row', [0])).toBeUndefined();
});

test('agrupar una fila crea el grupo sin tocar la rejilla (con undo)', async () => {
  // Tablix3: 2 filas estáticas, sin grupos.
  await selectItemViaPalette('Tablix3');
  const rowsBefore = await tablixRowCount('Tablix3');

  await page.getByRole('button', { name: 'Agrupar la fila 1…' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Agrupar la fila 1' })).toBeVisible();
  const editor = dialog.locator('.monaco-editor');
  await expect(editor).toBeVisible({ timeout: 15_000 });
  await editor.click();
  await page.keyboard.type('=Fields!BTCNo_BTCHeader.Value');
  await dialog.getByRole('button', { name: 'Aplicar' }).click();
  await expect(dialog).toBeHidden();

  await expect
    .poll(() => memberExpression('Tablix3', 'row', [0]))
    .toBe('=Fields!BTCNo_BTCHeader.Value');
  // El grupo nuevo envuelve la fila: la rejilla no cambia.
  expect(await tablixRowCount('Tablix3')).toBe(rowsBefore);
  // El grupo (con hijos) tiene sus propiedades y la fila envuelta sigue seleccionable.
  await expect(page.getByRole('button', { name: 'Propiedades del grupo' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Seleccionar fila 1' })).toBeVisible();

  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
  await page.keyboard.press('Control+z');
  await expect.poll(() => memberExpression('Tablix3', 'row', [0])).toBeUndefined();
  expect(await tablixRowCount('Tablix3')).toBe(rowsBefore);
});

test('quitar un grupo deja la fila (y el undo lo restaura)', async () => {
  await selectItemViaPalette('Tablix7');
  await expect
    .poll(() => memberExpression('Tablix7', 'row', [0]))
    .toBe('=Fields!VATPct_VatAmountLine.Value');

  await page.getByRole('button', { name: 'Quitar grupo de la fila 1' }).click();
  await expect.poll(() => memberExpression('Tablix7', 'row', [0])).toBeUndefined();
  // La fila se queda: el body no cambia y sigue seleccionable como fila.
  expect(await tablixRowCount('Tablix7')).toBe(1);
  await expect(page.getByRole('button', { name: 'Seleccionar fila 1' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Quitar grupo de la fila 1' })).toBeHidden();

  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
  await page.keyboard.press('Control+z');
  await expect
    .poll(() => memberExpression('Tablix7', 'row', [0]))
    .toBe('=Fields!VATPct_VatAmountLine.Value');
});

test('quitar un grupo con hijos eleva las filas (sin línea de grupo fantasma)', async () => {
  await selectItemViaPalette('LinesTable');
  const rowsBefore = await tablixRowCount('LinesTable');
  await expect
    .poll(() => memberExpression('LinesTable', 'row', [2]))
    .toBe('=Fields!LineNo_Line.Value');
  await expect.poll(() => memberChildCount('LinesTable', 'row', [2])).toBe(2);

  await page.getByRole('button', { name: 'Quitar grupo' }).click();

  // El grupo desaparece y sus filas pasan al nivel raíz (entradas estáticas).
  await expect.poll(() => memberExpression('LinesTable', 'row', [2])).toBeUndefined();
  await expect.poll(() => memberChildCount('LinesTable', 'row', [2])).toBe(0);
  expect(await tablixRowCount('LinesTable')).toBe(rowsBefore);
  await expect(page.getByRole('button', { name: 'Seleccionar fila 3' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Quitar grupo' })).toBeHidden();

  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
  await page.keyboard.press('Control+z');
  await expect
    .poll(() => memberExpression('LinesTable', 'row', [2]))
    .toBe('=Fields!LineNo_Line.Value');
  await expect.poll(() => memberChildCount('LinesTable', 'row', [2])).toBe(2);
});
