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
/** Huella del informe recién abierto (la proyección sin su `version`). */
let initialFingerprint = '';

test.beforeAll(async () => {
  const workspace = join(tmpdir(), `rdlc-e2e-${Date.now()}`);
  mkdirSync(workspace, { recursive: true });
  const file = join(workspace, 'SalesCreditMemoESP.rdlc');
  copyFileSync(fixture, file);

  app = await electron.launch({
    args: [mainEntry, file, `--user-data-dir=${join(workspace, 'user-data')}`],
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
});

async function projectionVersion(): Promise<number> {
  const proj = await projection();
  return proj.version;
}

/**
 * Huella del documento: la proyección **sin** `version` (que sube a cada
 * mutación). Dos estados iguales comparten huella; al deshacer todo, la huella
 * vuelve a ser la del informe recién abierto.
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
 * Deja el documento como al abrir: cierra menús y deshace todo lo pendiente.
 * Así cada test parte del mismo estado y no depende del anterior.
 *
 * No basta con «Ctrl+Z hasta que la versión deje de cambiar tras 20 ms»: el
 * undo es asíncrono (IPC + snapshot), el blur puede confirmar un borrador y hay
 * **commits diferidos** (ráfagas de flechas/color, ~250–400 ms) que todavía no
 * están en el journal. La parada es la **huella** de la proyección igual a la
 * inicial **más una ventana de calma** sin cambios: si un comando tardío
 * llegase después, la huella volvería a diferir y se desharía también, así
 * ningún estado del test anterior puede colarse en el siguiente.
 */
async function resetDocument(): Promise<void> {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
  await page.keyboard.press('Escape');

  for (let round = 0; round < 3; round += 1) {
    // Deshace hasta converger; cada Ctrl+Z espera al cambio real de versión
    // (no una ventana fija). Cuatro esperas seguidas sin cambio = nada que
    // deshacer (o divergencia: la ventana de calma decide).
    let stalls = 0;
    for (let index = 0; index < 40 && stalls < 4; index += 1) {
      if ((await projectionFingerprint()) === initialFingerprint) break;
      const before = await projectionVersion();
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
    }

    // Ventana de calma: cubre los commits diferidos que aún no han llegado.
    const version = await projectionVersion();
    await page.waitForTimeout(450);
    if (
      (await projectionVersion()) === version &&
      (await projectionFingerprint()) === initialFingerprint
    ) {
      return;
    }
  }

  const status = await page
    .locator('footer')
    .first()
    .textContent()
    .catch(() => null);
  throw new Error(
    `resetDocument no convergió al estado inicial (v${await projectionVersion()}): ${
      status ?? 'sin estado'
    }`,
  );
}

test.afterEach(async () => {
  await resetDocument();
});

/* ------------------------------- helpers -------------------------------- */

interface RegionLike {
  items: ItemLike[];
  width?: { value: number; unit: string };
  height?: { value: number; unit: string };
  printOnFirstPage?: boolean;
  printOnLastPage?: boolean;
}

interface Projection {
  reportName: string;
  version: number;
  page: {
    width: { value: number; unit: string };
    height: { value: number; unit: string };
    margins: {
      top: { value: number; unit: string };
      bottom: { value: number; unit: string };
      left: { value: number; unit: string };
      right: { value: number; unit: string };
    };
    header: RegionLike;
    body: RegionLike;
    footer: RegionLike;
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
  width?: { value: number; unit: string };
  height?: { value: number; unit: string };
  hidden?: boolean | string;
  style?: {
    backgroundColor?: string;
    border?: Record<string, { style?: string; color?: string }>;
    padding?: Record<string, { value: number; unit: string }>;
  };
  paragraphs?: { runs: { value: string; label?: string }[] }[];
  canGrow?: boolean;
  keepTogether?: boolean;
  zIndex?: number;
  pageBreak?: string;
  rowHierarchy?: MemberLike[];
  columnHierarchy?: MemberLike[];
  body?: {
    columns: { value: number; unit: string }[];
    rows: { height: { value: number; unit: string }; cells: (CellLike | null)[] }[];
  };
  headers?: {
    columns: { size: { value: number; unit: string }; cells: (ItemLike | null)[] }[];
    rows: { size: { value: number; unit: string }; cells: (ItemLike | null)[] }[];
  };
  filters?: { expression: string; operator: string; values: string[] }[];
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

/** Filtros proyectados de un Tablix (`Filters > Filter`). */
async function tablixFilters(
  id: string,
): Promise<{ expression: string; operator: string; values: string[] }[] | undefined> {
  const proj = await projection();
  const tablix = findItem(proj.page.body.items, id);
  return tablix?.filters;
}

/** Nombre proyectado del grupo de un miembro (fila/columna) por su `path`. */
async function memberName(
  tablixId: string,
  axis: 'row' | 'column',
  path: number[],
): Promise<string | undefined> {
  return (await memberAtPath(tablixId, axis, path))?.name;
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

/** Posición proyectada de un item en cm. */
async function itemLocation(id: string): Promise<{ top: number; left: number } | undefined> {
  const proj = await projection();
  for (const items of [proj.page.header.items, proj.page.body.items, proj.page.footer.items]) {
    const found = findItem(items, id);
    if (found?.top && found.left) return { top: found.top.value, left: found.left.value };
  }
  return undefined;
}

/** Padding proyectado de un lado del item (`style.padding.<side>`). */
async function itemPadding(
  id: string,
  side: 'top' | 'left' | 'bottom' | 'right',
): Promise<{ value: number; unit: string } | undefined> {
  const proj = await projection();
  for (const items of [proj.page.header.items, proj.page.body.items, proj.page.footer.items]) {
    const found = findItem(items, id);
    if (found) return found.style?.padding?.[side];
  }
  return undefined;
}

/** Salto de página proyectado de un item (`PageBreak > BreakLocation`). */
async function itemPageBreak(id: string): Promise<string | undefined> {
  const proj = await projection();
  for (const items of [proj.page.header.items, proj.page.body.items, proj.page.footer.items]) {
    const found = findItem(items, id);
    if (found) return found.pageBreak;
  }
  return undefined;
}

/** Id del contenido (si lo hay) de una celda de banda de cabecera. */
async function headerCellId(
  tablixId: string,
  axis: 'column' | 'row',
  band: number,
  cell = 0,
): Promise<string | undefined> {
  const proj = await projection();
  const tablix = findItem(proj.page.body.items, tablixId);
  const bands = axis === 'column' ? tablix?.headers?.columns : tablix?.headers?.rows;
  return bands?.[band]?.cells[cell]?.id;
}

/** true si el item (o algún descendiente suyo) tiene ese id. */
function containsId(item: ItemLike | undefined, id: string): boolean {
  if (!item) return false;
  if (item.id === id) return true;
  return (item.children ?? []).some((child) => containsId(child, id));
}

/** Borde proyectado de un lado del item (`style.border.<side>`). */
async function itemBorderSide(
  id: string,
  side: 'top' | 'left' | 'bottom' | 'right',
): Promise<{ style?: string; color?: string } | undefined> {
  const proj = await projection();
  for (const items of [proj.page.header.items, proj.page.body.items, proj.page.footer.items]) {
    const found = findItem(items, id);
    if (found) return found.style?.border?.[side];
  }
  return undefined;
}

/** Colores de las líneas `item-border` pintadas dentro del nodo de un item. */
async function itemBorderStrokes(id: string): Promise<string[]> {
  return page.evaluate((nodeId) => {
    const stage = (window as never as Record<string, unknown>)['__rdlcStage'] as {
      find(selector: (node: KonvaLike) => boolean): KonvaLike[];
    };
    const strokes: string[] = [];
    for (const node of stage.find((candidate) => candidate.name() === 'item-border')) {
      // Sube por los padres hasta dar con el grupo del item que se busca.
      let current: KonvaLike | undefined = node.getParent();
      while (current) {
        if (current.id() === nodeId) {
          strokes.push(String(node.getAttr('stroke')));
          break;
        }
        current = current.getParent();
      }
    }
    return strokes;
  }, id);
}

/** Alto proyectado de una banda de página (encabezado/pie), en cm. */
async function regionHeight(region: 'header' | 'footer'): Promise<number | undefined> {
  const proj = await projection();
  return proj.page[region].height?.value;
}

/** Flag de impresión proyectado de una banda (`PrintOnFirstPage/LastPage`). */
async function regionFlag(
  region: 'header' | 'footer',
  flag: 'printOnFirstPage' | 'printOnLastPage',
): Promise<boolean | undefined> {
  const proj = await projection();
  return proj.page[region][flag];
}

/** `ZIndex` proyectado de un item. */
async function itemZIndex(id: string): Promise<number | undefined> {
  const proj = await projection();
  for (const items of [proj.page.header.items, proj.page.body.items, proj.page.footer.items]) {
    const found = findItem(items, id);
    if (found) return found.zIndex;
  }
  return undefined;
}

/** Opción booleana proyectada de un Textbox (`CanGrow`/`KeepTogether`). */
async function itemOption(
  id: string,
  option: 'canGrow' | 'keepTogether',
): Promise<boolean | undefined> {
  const proj = await projection();
  for (const items of [proj.page.header.items, proj.page.body.items, proj.page.footer.items]) {
    const found = findItem(items, id);
    if (found) return found[option];
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

test('inserta un Tablix nuevo desde la toolbar (2×3 con celdas) y el undo lo quita', async () => {
  const before = await projection();
  const idsBefore = new Set(before.page.body.items.map((item) => item.id));

  await page.getByRole('button', { name: 'Insertar tabla (Tablix)' }).click();

  await expect
    .poll(async () => (await projection()).page.body.items.length, { message: 'nace el Tablix' })
    .toBe(before.page.body.items.length + 1);

  const created = (await projection()).page.body.items.find((item) => !idsBefore.has(item.id));
  expect(created?.kind).toBe('tablix');
  // 3 columnas de 2,5 cm y 2 filas de 0,6 cm.
  expect(created?.body?.columns.map((column) => column.value)).toEqual([2.5, 2.5, 2.5]);
  expect(created?.body?.rows.map((row) => row.height.value)).toEqual([0.6, 0.6]);
  expect(created?.body?.rows[0]?.cells).toHaveLength(3);
  expect(created?.body?.rows[1]?.cells).toHaveLength(3);
  expect(created?.rowHierarchy).toHaveLength(2);
  expect(created?.columnHierarchy).toHaveLength(3);
  // Las 6 celdas nacen con un textbox dentro (seleccionables, no muertas).
  for (const row of created?.body?.rows ?? []) {
    for (const cell of row.cells) expect(cell?.content?.kind).toBe('textbox');
  }

  await page.keyboard.press('Control+z');
  await expect
    .poll(async () => (await projection()).page.body.items.length, { message: 'el undo lo quita' })
    .toBe(before.page.body.items.length);
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

  // El lienzo lo pinta y se selecciona como cualquier item. Se remide el
  // centro en cada intento: si el lienzo se asienta (scroll/repintado), el
  // punto medido antes puede caer fuera.
  await waitCanvasScrollSettled();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const center = await nodeCenter(ids[0]!);
    if (center) await page.mouse.click(center.x, center.y);
    if ((await selectedId()) === ids[0]) break;
    await page.waitForTimeout(150);
  }
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
  await clickMenuItem('Fila debajo');
  await expect.poll(() => tablixRowCount('LinesTable2')).toBe(rowsBefore + 1);
  await page.keyboard.press('Control+z');
  await expect.poll(() => tablixRowCount('LinesTable2')).toBe(rowsBefore);
  // El menú se cierra con animación: hasta que desaparece, Radix bloquea el
  // puntero y el siguiente click derecho no abriría nada.
  await expect(page.getByRole('menuitem', { name: 'Insertar fila o columna' })).toBeHidden();

  // Click derecho otra vez: submenú → columna a la derecha. El punto se
  // recalcula: el lienzo puede re-encuadrarse al cerrarse el menú anterior.
  const again = await nodeCenter(content!.id);
  expect(again).not.toBeNull();
  await page.mouse.click(again!.x, again!.y, { button: 'right' });
  await page.getByRole('menuitem', { name: 'Insertar fila o columna' }).click();
  await clickMenuItem('Columna a la derecha');
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

test('un rango de celdas edita el contenido en lote (un solo undo)', async () => {
  const c00 = await cellContentAt('LinesTable2', 0, 0);
  const c01 = await cellContentAt('LinesTable2', 0, 1);
  expect(c00).toBeTruthy();
  expect(c01).toBeTruthy();

  const border = await tablixBorderPoint('LinesTable2');
  await page.mouse.click(border!.x, border!.y);
  await page.getByRole('button', { name: 'Seleccionar fila 1' }).click();
  await expect.poll(selectedCell).toEqual({ id: 'LinesTable2', row: 0, col: 0 });

  // Shift+click en la celda contigua de la misma fila: rango de 2 celdas.
  const p01 = await nodeCenter(c01!.id);
  await page.keyboard.down('Shift');
  await page.mouse.click(p01!.x, p01!.y);
  await page.keyboard.up('Shift');
  await expect
    .poll(selectedCell)
    .toEqual({ id: 'LinesTable2', row: 0, col: 0, endRow: 0, endCol: 1 });

  // El panel de lote edita el contenido de las dos celdas a la vez.
  const panel = page.getByTestId('multi-selection-panel');
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('2 celdas');

  await panel.getByLabel('Borde superior: estilo').selectOption('Dashed');
  await expect.poll(async () => (await itemBorderSide(c00!.id, 'top'))?.style).toBe('Dashed');
  await expect.poll(async () => (await itemBorderSide(c01!.id, 'top'))?.style).toBe('Dashed');

  // Un solo undo revierte el lote de las dos celdas.
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await itemBorderSide(c00!.id, 'top'))?.style).not.toBe('Dashed');
  await expect.poll(async () => (await itemBorderSide(c01!.id, 'top'))?.style).not.toBe('Dashed');
});

test('el marco de selección selecciona los items que intersecta', async () => {
  // Caja que cubre Textbox4 y Textbox17 (ambos en el encabezado), empezando en
  // el margen izquierdo del papel (zona vacía del lienzo).
  const box = await page.evaluate(() => {
    const stage = (window as never as Record<string, unknown>)['__rdlcStage'] as {
      container(): HTMLElement;
      scaleX(): number;
      findOne(selector: (node: KonvaLike) => boolean): KonvaLike | undefined;
    };
    const node = (id: string): KonvaLike | undefined =>
      stage.findOne((candidate) => candidate.id() === id);
    const rectOf = (id: string): { x: number; y: number; width: number; height: number } => {
      const measured = node(id)?.getClientRect({ relativeTo: stage as unknown as never });
      if (!measured) throw new Error(`sin nodo ${id}`);
      return measured;
    };
    const container = stage.container().getBoundingClientRect();
    const zoom = stage.scaleX();
    const a = rectOf('Textbox4');
    const b = rectOf('Textbox17');
    const maxX = Math.max(a.x + a.width, b.x + b.width);
    const minY = Math.min(a.y, b.y);
    const maxY = Math.max(a.y + a.height, b.y + b.height);
    return {
      // Desde la columna del margen izquierdo (zona vacía a cualquier altura).
      start: { x: container.left + 6, y: container.top + (minY - 5) * zoom },
      end: { x: container.left + (maxX + 16) * zoom, y: container.top + (maxY + 16) * zoom },
    };
  });

  await page.mouse.move(box.start.x, box.start.y);
  await page.mouse.down();
  await page.mouse.move(box.end.x, box.end.y, { steps: 10 });
  await page.mouse.up();

  const ids = await page.evaluate(
    () => (window as never as Record<string, unknown>)['__rdlcSelectionIds'] as string[],
  );
  expect(ids).toContain('Textbox4');
  expect(ids).toContain('Textbox17');
  expect(ids.length).toBeGreaterThan(1);
  await expect(page.getByTestId('multi-selection-panel')).toBeVisible();
});

test('duplicar y portapapeles en lote (un undo por operación)', async () => {
  const total = async (): Promise<number> =>
    page.evaluate(() => {
      const projection = (window as never as Record<string, unknown>)['__rdlcProjection'] as {
        page: {
          header: { items: unknown[] };
          body: { items: unknown[] };
          footer: { items: unknown[] };
        };
      };
      const count = (items: unknown[]): number =>
        items.reduce<number>((sum, raw) => {
          const item = raw as {
            children?: unknown[];
            body?: { rows?: { cells?: ({ content?: unknown } | null)[] }[] };
          };
          const children = item.children ?? [];
          const cells = (item.body?.rows ?? []).flatMap((row) => row.cells ?? []);
          const contents = cells.flatMap((cell) => (cell?.content ? [cell.content] : []));
          return sum + 1 + count(children) + count(contents);
        }, 0);
      return (
        count(projection.page.header.items) +
        count(projection.page.body.items) +
        count(projection.page.footer.items)
      );
    });

  await selectItemViaPalette('Textbox4');
  const center = await nodeCenter('Textbox17');
  await page.keyboard.down('Control');
  await page.mouse.click(center!.x, center!.y);
  await page.keyboard.up('Control');
  await expect(page.getByTestId('multi-selection-panel')).toContainText('2 elementos');

  // Duplicar los dos: 2 clones nuevos y seleccionados, un solo undo.
  const before = await total();
  await page.keyboard.press('Control+d');
  await expect.poll(total).toBe(before + 2);
  const clones = await page.evaluate(
    () => (window as never as Record<string, unknown>)['__rdlcSelectionIds'] as string[],
  );
  expect(clones).toHaveLength(2);
  await page.keyboard.press('Control+z');
  await expect.poll(total).toBe(before);

  // Re-selecciona los originales (el undo los dejó sin selección) y copia/pega
  // los dos: 2 clones, un solo undo.
  await selectItemViaPalette('Textbox4');
  const again = await nodeCenter('Textbox17');
  await page.keyboard.down('Control');
  await page.mouse.click(again!.x, again!.y);
  await page.keyboard.up('Control');
  await expect(page.getByTestId('multi-selection-panel')).toContainText('2 elementos');
  await page.keyboard.press('Control+c');
  await page.keyboard.press('Control+v');
  await expect.poll(total).toBe(before + 2);
  await page.keyboard.press('Control+z');
  await expect.poll(total).toBe(before);
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

  // Durante el drag hay previsualización: línea en la frontera destino + etiqueta
  // con el tamaño resultante (misma matemática que al soltar).
  const preview = await page.evaluate(() => {
    const stage = (window as never as Record<string, unknown>)['__rdlcStage'] as {
      findOne(selector: (node: KonvaLike) => boolean): KonvaLike | undefined;
    };
    const group = stage.findOne((node) => node.name() === 'edge-preview');
    const label = stage.findOne((node) => node.name() === 'edge-preview-label');
    return {
      visible: (group?.getAttr('visible') as boolean | undefined) ?? false,
      text: (label as unknown as { text?: () => string } | undefined)?.text?.() ?? null,
    };
  });
  expect(preview.visible, 'durante el drag debe verse la previsualización del borde').toBe(true);
  const previewWidth = Number((preview.text ?? '').replace(' cm', ''));
  expect(Number.isFinite(previewWidth), `etiqueta con el tamaño: ${preview.text}`).toBe(true);
  expect(
    previewWidth,
    'la previsualización muestra un tamaño menor al arrastrar a la izquierda',
  ).toBeLessThan(before);

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

test('el panel Estructura edita el tamaño con flechas, arrastre y tecleo', async () => {
  // Selecciona el Tablix para que el panel muestre su estructura.
  const point = await tablixBorderPoint('LinesTable2');
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
    .toBe('LinesTable2');

  const contentWidthAt = async (row: number, col: number): Promise<number | null> => {
    const content = await cellContentAt('LinesTable2', row, col);
    const width = content?.width;
    if (!width) return null;
    switch (width.unit) {
      case 'cm':
        return width.value;
      case 'mm':
        return width.value / 10;
      case 'in':
        return width.value * 2.54;
      case 'pt':
        return (width.value * 2.54) / 72;
    }
  };
  const columnWidth = (index: number): Promise<number | undefined> =>
    tablixColumns('LinesTable2').then((columns) => columns[index]);

  // 1) Teclear: fija el ancho a 3 cm; el contenido de la celda acompaña
  //    (declarado sincronizado o canónico por el fallback de la celda).
  const widthInput = page.getByLabel('Ancho de la columna 1', { exact: true });
  await expect(widthInput).toBeVisible();
  const originalContentWidth = await contentWidthAt(0, 0);
  expect(originalContentWidth).not.toBeNull();

  await widthInput.fill('3');
  await widthInput.press('Enter');
  await expect.poll(() => columnWidth(0)).toBeCloseTo(3, 3);
  await expect
    .poll(() => contentWidthAt(0, 0), { message: 'el contenido sigue a la columna' })
    .toBeCloseTo(3, 3);

  // El atajo global de undo ignora los INPUT: quitar el foco antes de Ctrl+Z.
  await widthInput.blur();
  await page.keyboard.press('Control+z');
  await expect.poll(() => columnWidth(0)).not.toBeCloseTo(3, 3);
  await expect.poll(() => contentWidthAt(0, 0)).toBeCloseTo(originalContentWidth!, 3);

  // 2) Flechas ↑/↓: aumentar suma 0,1 cm y reducir lo devuelve.
  const before2 = (await tablixColumns('LinesTable2'))[1]!;
  await page.getByLabel('Ancho de la columna 2: aumentar').click();
  await expect.poll(() => columnWidth(1)).toBeCloseTo(before2 + 0.1, 3);
  await page.getByLabel('Ancho de la columna 2: reducir').click();
  await expect.poll(() => columnWidth(1)).toBeCloseTo(before2, 3);
  // Limpia los dos pasos de undo de las flechas.
  await page.keyboard.press('Control+z');
  await expect.poll(() => columnWidth(1)).toBeCloseTo(before2 + 0.1, 3);
  await page.keyboard.press('Control+z');
  await expect.poll(() => columnWidth(1)).toBeCloseTo(before2, 3);

  // 3) Arrastre sobre el valor con cursor de redimensionado: 30 px ≈ 3 cm.
  const before1 = (await tablixColumns('LinesTable2'))[0]!;
  // El scrub parte del valor que muestra el panel: espera a que la proyección
  // lo haya refrescado y a que el input no tenga foco (con foco el gesto
  // coloca el cursor en vez de arrastrar).
  await expect(widthInput).toHaveValue(before1.toFixed(2));
  await expect(widthInput).not.toBeFocused();
  const box = await widthInput.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width / 2 + 30, box!.y + box!.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect
    .poll(() => columnWidth(0), { message: 'el arrastre sobre el valor ajusta el tamaño' })
    .toBeCloseTo(before1 + 3, 3);

  await page.keyboard.press('Control+z');
  await expect.poll(() => columnWidth(0)).toBeCloseTo(before1, 3);
  await expect.poll(() => contentWidthAt(0, 0)).toBeCloseTo(originalContentWidth!, 3);
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

test('las opciones del textbox (CanGrow/KeepTogether) se editan y deshacen', async () => {
  // Textbox4 (encabezado) declara ambos flags en el corpus.
  await selectItemViaPalette('Textbox4');
  const canGrow = page.getByRole('checkbox', { name: 'Crecer con el texto (CanGrow)' });
  const keepTogether = page.getByRole('checkbox', { name: 'Mantener junto (KeepTogether)' });
  await expect(canGrow).toBeChecked();
  await expect(keepTogether).toBeChecked();

  // Apagar quita la etiqueta (false = predeterminado en RDL).
  await canGrow.click();
  await expect.poll(() => itemOption('Textbox4', 'canGrow')).toBeUndefined();
  await expect(keepTogether).toBeChecked();

  // Un solo undo la restaura.
  await page.keyboard.press('Control+z');
  await expect(canGrow).toBeChecked();
  await expect.poll(() => itemOption('Textbox4', 'canGrow')).toBe(true);
});

test('el menú de celda trae al frente (ZIndex) y el undo lo revierte', async () => {
  // Textbox4 es el primer hijo de Rectangle1 (sin ZIndex); sus hermanos van 1…7.
  await selectItemViaPalette('Textbox4');
  const center = await nodeCenter('Textbox4');
  expect(center).not.toBeNull();

  await page.mouse.click(center!.x, center!.y, { button: 'right' });
  await page.getByRole('menuitem', { name: 'Orden' }).click();
  await page.getByRole('menuitem', { name: 'Traer al frente' }).click();

  await expect.poll(() => itemZIndex('Textbox4')).toBe(8);

  await page.keyboard.press('Control+z');
  await expect.poll(() => itemZIndex('Textbox4')).toBeUndefined();
});

test('el panel edita los bordes por lado y el lienzo los pinta', async () => {
  // Textbox4 declara el genérico `<Border><Style>None</Style>` (sin lados).
  await selectItemViaPalette('Textbox4');
  const topStyle = page.getByLabel('Borde superior: estilo');
  await expect(topStyle).toHaveValue('None');
  await expect.poll(() => itemBorderStrokes('Textbox4')).toEqual([]);

  await topStyle.selectOption('Solid');
  await expect.poll(async () => (await itemBorderSide('Textbox4', 'top'))?.style).toBe('Solid');
  // La línea se pinta dentro del nodo del item (color por defecto).
  await expect.poll(() => itemBorderStrokes('Textbox4')).toEqual(['#111827']);

  // Un solo undo revierte estilo y pintado.
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await itemBorderSide('Textbox4', 'top'))?.style).toBe('None');
  await expect.poll(() => itemBorderStrokes('Textbox4')).toEqual([]);
});

test('el panel edita el padding por lado (con undo)', async () => {
  // Textbox4 (encabezado) declara `PaddingTop 2pt` en el corpus.
  await selectItemViaPalette('Textbox4');
  const top = page.getByLabel('Padding superior', { exact: true });
  // El NumberInput estándar muestra el valor con dos decimales fijos.
  await expect(top).toHaveValue('2.00');

  await top.fill('5');
  await top.press('Enter');
  await expect.poll(() => itemPadding('Textbox4', 'top')).toEqual({ value: 5, unit: 'pt' });

  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
  await page.keyboard.press('Control+z');
  await expect.poll(() => itemPadding('Textbox4', 'top')).toEqual({ value: 2, unit: 'pt' });
});

test('el panel edita el salto de página de un rectángulo (con undo)', async () => {
  // Rectangle2 (encabezado) no declara `PageBreak`.
  await selectItemViaPalette('Rectangle2');
  const pageBreak = page.getByLabel('Salto de página');
  await expect(pageBreak).toHaveValue('None');

  await pageBreak.selectOption('Start');
  await expect.poll(() => itemPageBreak('Rectangle2')).toBe('Start');

  await page.keyboard.press('Control+z');
  await expect.poll(() => itemPageBreak('Rectangle2')).toBeUndefined();
});

test('una cabecera vacía recibe un item insertado (y el undo lo quita)', async () => {
  // Textbox73 vive en la cabecera de columna 1 de Tablix7.
  await selectItemViaPalette('Textbox73');
  const point = await nodeCenter('Textbox73');
  expect(point).not.toBeNull();

  // Se libera la celda (el corpus no trae huecos de cabecera).
  await page.keyboard.press('Delete');
  await expect.poll(() => headerCellId('Tablix7', 'column', 0)).toBeUndefined();

  // Click derecho sobre el hueco: «Insertar» está disponible y el item nace ahí.
  await page.mouse.click(point!.x, point!.y, { button: 'right' });
  await page.getByRole('menuitem', { name: 'Insertar' }).click();
  await page.getByRole('menuitem', { name: 'Textbox' }).click();

  await expect.poll(() => headerCellId('Tablix7', 'column', 0)).toBeDefined();

  // Un solo undo quita el item insertado (el borrado previo es otro paso).
  await page.keyboard.press('Control+z');
  await expect.poll(() => headerCellId('Tablix7', 'column', 0)).toBeUndefined();
});

test('mover un rectángulo un poco no intenta reparentarlo (sin error)', async () => {
  // Rectangle2 (encabezado, vacío): arrastrarlo unos píxeles deja el puntero
  // dentro de él; antes se intentaba reparentar en sí mismo y daba error.
  await selectItemViaPalette('Rectangle2');
  const before = await itemLocation('Rectangle2');
  const from = await nodeCenter('Rectangle2');
  expect(from).not.toBeNull();

  await page.mouse.move(from!.x, from!.y);
  await page.mouse.down();
  await page.mouse.move(from!.x + 14, from!.y + 10, { steps: 6 });
  await page.mouse.up();

  await expect(page.getByRole('contentinfo')).toContainText('setLocation');
  await expect(page.getByText(/dentro de sí mismo/)).toHaveCount(0);
  await expect.poll(() => itemLocation('Rectangle2')).not.toEqual(before);
});

test('un Tablix seleccionado se elimina desde el menú contextual', async () => {
  await selectItemViaPalette('Tablix3');
  await expect.poll(() => tablixRowCount('Tablix3')).toBeGreaterThan(0);

  // Click derecho en vacío (regla): el menú muestra las acciones de la selección.
  const stageBox = await page.locator('canvas').first().boundingBox();
  await page.mouse.click(stageBox!.x - 8, stageBox!.y + 20, { button: 'right' });
  await page.getByRole('menuitem', { name: 'Eliminar' }).click();

  await expect
    .poll(async () => {
      const proj = await projection();
      return Boolean(findItem(proj.page.body.items, 'Tablix3'));
    })
    .toBe(false);

  await page.keyboard.press('Control+z');
  await expect
    .poll(async () => {
      const proj = await projection();
      return Boolean(findItem(proj.page.body.items, 'Tablix3'));
    })
    .toBe(true);
});

test('arrastrar un textbox a otro contenedor lo reparenta (con undo)', async () => {
  // Textbox4 vive en Rectangle1 (encabezado); el destino es Rectangle2.
  await selectItemViaPalette('Textbox4');
  const from = await nodeCenter('Textbox4');
  const target = await nodeCenter('Rectangle2');
  expect(from).not.toBeNull();
  expect(target).not.toBeNull();

  await page.mouse.move(from!.x, from!.y);
  await page.mouse.down();
  await page.mouse.move(target!.x, target!.y, { steps: 12 });
  await page.mouse.up();

  await expect
    .poll(async () => {
      const proj = await projection();
      const r1 = findItem(proj.page.header.items, 'Rectangle1');
      const r2 = findItem(proj.page.header.items, 'Rectangle2');
      return {
        inSource: Boolean(r1?.children?.some((child) => child.id === 'Textbox4')),
        inTarget: containsId(r2, 'Textbox4'),
      };
    })
    .toEqual({ inSource: false, inTarget: true });

  // Un solo undo lo devuelve a su contenedor y a su sitio.
  await page.keyboard.press('Control+z');
  await expect
    .poll(async () => {
      const proj = await projection();
      const r1 = findItem(proj.page.header.items, 'Rectangle1');
      return Boolean(r1?.children?.some((child) => child.id === 'Textbox4'));
    })
    .toBe(true);
});

test('«Informe…» edita el alto y la impresión del encabezado y el pie', async () => {
  await page.getByRole('button', { name: 'Informe…' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Propiedades del informe' })).toBeVisible();

  await dialog.getByLabel('Alto del encabezado (cm)', { exact: true }).fill('2');
  await dialog.getByLabel('Alto del pie (cm)', { exact: true }).fill('1.5');
  await dialog
    .getByRole('checkbox', { name: 'Imprimir el encabezado en la primera página' })
    .click();
  await dialog.getByRole('button', { name: 'Aplicar' }).click();

  await expect.poll(() => regionHeight('header')).toBe(2);
  await expect.poll(() => regionHeight('footer')).toBe(1.5);
  await expect.poll(() => regionFlag('header', 'printOnFirstPage')).toBe(false);
  await expect.poll(() => regionFlag('header', 'printOnLastPage')).toBe(true);
  await expect.poll(() => regionFlag('footer', 'printOnFirstPage')).toBe(true);
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

test('los filtros del Tablix se editan desde la estructura (con undo)', async () => {
  await selectItemViaPalette('Tablix7');
  const expected = {
    expression: '=Cstr(Len(Fields!VATIdentifier_VatAmountLine.Value))',
    operator: 'NotEqual',
    values: ['0'],
  };
  await expect.poll(() => tablixFilters('Tablix7')).toEqual([expected]);

  await page.getByRole('button', { name: 'Filtros (1)' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Filtros del Tablix' })).toBeVisible();
  await dialog.getByLabel('Operador del filtro 1').selectOption('Equal');
  await dialog.getByRole('button', { name: 'Aplicar' }).click();
  await expect(dialog).toBeHidden();

  await expect.poll(() => tablixFilters('Tablix7')).toEqual([{ ...expected, operator: 'Equal' }]);

  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
  await page.keyboard.press('Control+z');
  await expect.poll(() => tablixFilters('Tablix7')).toEqual([expected]);
});

test('las propiedades del grupo renombran el grupo (con undo)', async () => {
  await selectItemViaPalette('Tablix7');
  await page.getByRole('button', { name: 'Propiedades del grupo de la fila 1' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: /Propiedades del grupo/ })).toBeVisible();

  const name = dialog.getByLabel('Nombre');
  await expect(name).toHaveValue('VATIdentifier_VatAmountLine');
  await name.fill('VATGrupoNuevo');
  await dialog.getByRole('button', { name: 'Aplicar' }).click();
  await expect(dialog).toBeHidden();

  await expect.poll(() => memberName('Tablix7', 'row', [0])).toBe('VATGrupoNuevo');

  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
  await page.keyboard.press('Control+z');
  await expect.poll(() => memberName('Tablix7', 'row', [0])).toBe('VATIdentifier_VatAmountLine');
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

test('extender un grupo con la fila contigua desde la estructura (con undo)', async () => {
  await selectItemViaPalette('LinesTable');
  await expect.poll(() => memberChildCount('LinesTable', 'row', [2])).toBe(2);

  // La fila anterior (1-based 2) pasa a ser la primera hoja del grupo: el
  // miembro raíz [1] desaparece y el grupo baja a la posición [1].
  await page.getByRole('button', { name: 'Añadir la fila 2 al grupo' }).click();
  await expect.poll(() => memberChildCount('LinesTable', 'row', [1])).toBe(3);
  await expect
    .poll(() => memberExpression('LinesTable', 'row', [1]))
    .toBe('=Fields!LineNo_Line.Value');
  // El body no cambia: sigue teniendo 5 filas.
  expect(await tablixRowCount('LinesTable')).toBe(5);

  await page.keyboard.press('Control+z');
  await expect.poll(() => memberChildCount('LinesTable', 'row', [2])).toBe(2);
});

test('el menú contextual inserta fila fuera del grupo y abre sus propiedades', async () => {
  // Celda de la primera fila del grupo LineNo de LinesTable2 (fila 3, hoja 2).
  const proj = await projection();
  const tablix = findItem(proj.page.body.items, 'LinesTable2') as
    (ItemLike & { body: { rows: { cells: (CellLike | null)[] }[] } }) | undefined;
  const content = tablix?.body.rows[2]?.cells
    .map((cell) => cell?.content)
    .find((entry): entry is ItemLike => Boolean(entry));
  expect(content).toBeTruthy();

  const point = await nodeCenter(content!.id);
  expect(point).not.toBeNull();
  const rowsBefore = await tablixRowCount('LinesTable2');

  // Fuera del grupo, encima: la fila nace antes del grupo (el grupo baja a [3]).
  await page.mouse.click(point!.x, point!.y, { button: 'right' });
  await page.getByRole('menuitem', { name: 'Insertar fila o columna' }).click();
  await page.getByRole('menuitem', { name: 'Fuera del grupo: fila encima' }).click();
  await expect.poll(() => tablixRowCount('LinesTable2')).toBe(rowsBefore + 1);
  await expect.poll(() => memberExpression('LinesTable2', 'row', [2])).toBeUndefined();
  await expect
    .poll(() => memberExpression('LinesTable2', 'row', [3]))
    .toBe('=Fields!LineNo_Line.Value');

  await page.keyboard.press('Control+z');
  await expect
    .poll(() => memberExpression('LinesTable2', 'row', [2]))
    .toBe('=Fields!LineNo_Line.Value');
  await expect.poll(() => tablixRowCount('LinesTable2')).toBe(rowsBefore);

  // Dentro del grupo, debajo de su ÚLTIMA fila: la fila nace dentro del grupo
  // (antes se colaba fuera por el borde inferior).
  const lastContent = tablix?.body.rows[3]?.cells
    .map((cell) => cell?.content)
    .find((entry): entry is ItemLike => Boolean(entry));
  expect(lastContent).toBeTruthy();
  const lastPoint = await nodeCenter(lastContent!.id);
  expect(lastPoint).not.toBeNull();

  await page.mouse.click(lastPoint!.x, lastPoint!.y, { button: 'right' });
  await page.getByRole('menuitem', { name: 'Insertar fila o columna' }).click();
  await page.getByRole('menuitem', { name: 'Dentro del grupo: fila debajo' }).click();
  await expect.poll(() => tablixRowCount('LinesTable2')).toBe(rowsBefore + 1);
  await expect.poll(() => memberChildCount('LinesTable2', 'row', [2])).toBe(3);

  await page.keyboard.press('Control+z');
  await expect.poll(() => memberChildCount('LinesTable2', 'row', [2])).toBe(2);
  await expect.poll(() => tablixRowCount('LinesTable2')).toBe(rowsBefore);

  // Propiedades del grupo… desde el menú contextual.
  await page.mouse.click(point!.x, point!.y, { button: 'right' });
  await page.getByRole('menuitem', { name: 'Propiedades del grupo…' }).click();
  const dialog = page.getByRole('dialog');
  await expect(
    dialog.getByRole('heading', { name: 'Propiedades del grupo · LineNo' }),
  ).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancelar' }).click();
  await expect(dialog).toBeHidden();
});

/** Valores del primer run de cada celda con contenido de una fila. */
async function rowRunValues(tablixId: string, row: number): Promise<string[]> {
  const proj = await projection();
  const tablix = findItem(proj.page.body.items, tablixId) as
    (ItemLike & { body: { rows: { cells: (CellLike | null)[] }[] } }) | undefined;
  return (tablix?.body.rows[row]?.cells ?? [])
    .map((cell) => cell?.content?.paragraphs?.[0]?.runs[0]?.value)
    .filter((value): value is string => typeof value === 'string');
}

test('el total del grupo se añade desde el menú con los agregados por columna (con undo)', async () => {
  // Celda de la primera fila del grupo LineNo2 de LinesTable2 (fila 3, hoja 2):
  // el mismo punto que usa el test de «fuera del grupo».
  const proj = await projection();
  const tablix = findItem(proj.page.body.items, 'LinesTable2') as
    (ItemLike & { body: { rows: { cells: (CellLike | null)[] }[] } }) | undefined;
  const content = tablix?.body.rows[2]?.cells
    .map((cell) => cell?.content)
    .find((entry): entry is ItemLike => Boolean(entry));
  expect(content).toBeTruthy();

  const point = await nodeCenter(content!.id);
  expect(point).not.toBeNull();
  const rowsBefore = await tablixRowCount('LinesTable2');

  await page.mouse.click(point!.x, point!.y, { button: 'right' });
  await page.getByRole('menuitem', { name: 'Total del grupo' }).click();
  await page.getByRole('menuitem', { name: 'Fila de total debajo' }).click();

  await expect.poll(() => tablixRowCount('LinesTable2')).toBe(rowsBefore + 1);
  // Nace pegada al grupo (tras su última hoja: índice 4) con los agregados por
  // columna y el ámbito del grupo; `UnitPrice` no se suma en el informe.
  const values = await rowRunValues('LinesTable2', 4);
  expect(values).toContain('=Sum(Fields!BTCQuantity.Value, "LineNo2")');
  expect(values).toContain('=Sum(Fields!LineAmount_Line.Value, "LineNo2")');
  expect(values).toContain('=First(Fields!UnitPrice.Value, "LineNo2")');

  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
  await page.keyboard.press('Control+z');
  await expect.poll(() => tablixRowCount('LinesTable2')).toBe(rowsBefore);
});

test('un grupo hoja (Tablix7) gana una fila dentro y se anida en la estructura', async () => {
  await selectItemViaPalette('Tablix7');
  await expect.poll(() => memberChildCount('Tablix7', 'row', [0])).toBe(0);

  const proj = await projection();
  const tablix = findItem(proj.page.body.items, 'Tablix7') as
    (ItemLike & { body: { rows: { cells: (CellLike | null)[] }[] } }) | undefined;
  const content = tablix?.body.rows[0]?.cells
    .map((cell) => cell?.content)
    .find((entry): entry is ItemLike => Boolean(entry));
  expect(content).toBeTruthy();
  const point = await nodeCenter(content!.id);
  expect(point).not.toBeNull();

  // «Dentro del grupo, fila debajo»: el grupo hoja pasa a contenedor con la
  // fila original debajo (el body no cambia de orden).
  await page.mouse.click(point!.x, point!.y, { button: 'right' });
  await page.getByRole('menuitem', { name: 'Insertar fila o columna' }).click();
  await page.getByRole('menuitem', { name: 'Dentro del grupo: fila debajo' }).click();
  await expect.poll(() => tablixRowCount('Tablix7')).toBe(2);
  await expect.poll(() => memberChildCount('Tablix7', 'row', [0])).toBe(2);
  // En Estructura, el grupo muestra las dos filas anidadas.
  await expect(page.getByRole('button', { name: 'Seleccionar fila 1' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Seleccionar fila 2' })).toBeVisible();

  await page.keyboard.press('Control+z');
  await expect.poll(() => tablixRowCount('Tablix7')).toBe(1);
  await expect.poll(() => memberChildCount('Tablix7', 'row', [0])).toBe(0);
});

/* ------------------------ F3 · grupos de columna ------------------------- */

test('agrupar una columna crea el grupo sin tocar la rejilla (con undo)', async () => {
  // Tablix3: 2 filas × 6 columnas estáticas, sin grupos de columna.
  await selectItemViaPalette('Tablix3');
  const columnsBefore = await tablixColumnCount('Tablix3');

  await page.getByRole('button', { name: 'Agrupar la columna 2…' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Agrupar la columna 2' })).toBeVisible();
  const editor = dialog.locator('.monaco-editor');
  await expect(editor).toBeVisible({ timeout: 15_000 });
  await editor.click();
  await page.keyboard.type('=Fields!DocumentNo.Value');
  await dialog.getByRole('button', { name: 'Aplicar' }).click();
  await expect(dialog).toBeHidden();

  await expect
    .poll(() => memberExpression('Tablix3', 'column', [1]))
    .toBe('=Fields!DocumentNo.Value');
  // El grupo nuevo envuelve la columna: la rejilla no cambia.
  expect(await tablixColumnCount('Tablix3')).toBe(columnsBefore);
  await expect(page.getByRole('button', { name: 'Propiedades del grupo' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Seleccionar columna 2' })).toBeVisible();

  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
  await page.keyboard.press('Control+z');
  await expect.poll(() => memberExpression('Tablix3', 'column', [1])).toBeUndefined();
  expect(await tablixColumnCount('Tablix3')).toBe(columnsBefore);
});

test('extender un grupo de columna con la contigua desde la estructura (con undo)', async () => {
  await selectItemViaPalette('Tablix3');
  const columnsBefore = await tablixColumnCount('Tablix3');

  // Grupo en la columna 2; la columna 3 (contigua) se añade como última hoja.
  await page.getByRole('button', { name: 'Agrupar la columna 2…' }).click();
  const dialog = page.getByRole('dialog');
  const editor = dialog.locator('.monaco-editor');
  await expect(editor).toBeVisible({ timeout: 15_000 });
  await editor.click();
  await page.keyboard.type('=Fields!DocumentNo.Value');
  await dialog.getByRole('button', { name: 'Aplicar' }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(() => memberChildCount('Tablix3', 'column', [1])).toBe(1);

  await page.getByRole('button', { name: 'Añadir la columna 3 al grupo' }).click();
  await expect.poll(() => memberChildCount('Tablix3', 'column', [1])).toBe(2);
  // La rejilla no cambia (la columna 3 se anida en el grupo).
  expect(await tablixColumnCount('Tablix3')).toBe(columnsBefore);

  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
  await page.keyboard.press('Control+z');
  await expect.poll(() => memberChildCount('Tablix3', 'column', [1])).toBe(1);
  await page.keyboard.press('Control+z');
  await expect.poll(() => memberExpression('Tablix3', 'column', [1])).toBeUndefined();
  expect(await tablixColumnCount('Tablix3')).toBe(columnsBefore);
});

/* ------------- U10 · redimensionado de página en el lienzo ---------------- */

/** Factor px↔cm del lienzo (96 dpi, como `geometry.ts` del front). */
const PX_PER_CM = 96 / 2.54;

/** Longitud proyectada en cm (los ficheros de BC usan cm, pero no se asume). */
function lengthToCm(length: { value: number; unit: string } | undefined): number {
  if (!length) return 0;
  if (length.unit === 'mm') return length.value / 10;
  if (length.unit === 'in') return length.value * 2.54;
  if (length.unit === 'pt') return (length.value * 2.54) / 72;
  return length.value;
}

/** Imán de 0,1 cm del redimensionado de página. */
function snapCm(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Borde derecho más lejano del contenido (items de primer nivel), en cm. */
function contentRightCm(proj: Projection): number {
  const right = (item: {
    left?: { value: number; unit: string };
    width?: { value: number; unit: string };
  }): number => lengthToCm(item.left) + lengthToCm(item.width);
  return Math.max(
    ...[...proj.page.header.items, ...proj.page.body.items, ...proj.page.footer.items].map(right),
  );
}

/** Zoom vivo del escenario (los tests de zoom previos pueden haberlo cambiado). */
async function stageZoom(): Promise<number> {
  return page.evaluate(() => {
    const stage = (window as never as Record<string, unknown>)['__rdlcStage'] as {
      scaleX(): number;
    } | null;
    return stage?.scaleX() ?? 1;
  });
}

/**
 * Punto de pantalla de una zona de redimensionado de página
 * (`header`/`body`/`footer`/`section`). Las zonas viven **bajo el papel**, así
 * que se busca un punto de la zona **libre** (sin item encima) con el
 * `getIntersection` de Konva; si hace falta, se centra el contenedor con scroll.
 */
async function pageZonePoint(zone: string): Promise<{ x: number; y: number }> {
  return page.evaluate((name) => {
    const stage = (window as never as Record<string, unknown>)['__rdlcStage'] as {
      container(): HTMLElement;
      scaleX(): number;
      getIntersection(pos: { x: number; y: number }): { name(): string } | null;
      findOne(predicate: (node: { name: () => string }) => boolean): {
        getAbsolutePosition(): { x: number; y: number };
        width(): number;
        height(): number;
        name(): string;
      } | null;
    } | null;
    if (!stage) throw new Error('sin stage');
    const node = stage.findOne((candidate) => candidate.name() === `page-resize-${name}`);
    if (!node) throw new Error(`sin zona de página '${name}'`);
    const scale = stage.scaleX();

    /** Primer punto de muestreo de la zona que no tiene un item encima. */
    const freePoint = (): { x: number; y: number } => {
      const abs = node.getAbsolutePosition();
      const width = node.width() * scale;
      const height = node.height() * scale;
      const vertical = name === 'section';
      const samples = 40;
      // En las bandas se busca desde la izquierda (margen); en la sección, desde
      // abajo (junto al margen inferior): son los tramos libres habituales.
      for (let index = 0; index < samples; index += 1) {
        const t = vertical ? 1 - (index + 0.5) / samples : (index + 0.5) / samples;
        const x = abs.x + (vertical ? width / 2 : width * t);
        const y = abs.y + (vertical ? height * t : height / 2);
        const hit = stage.getIntersection({ x, y });
        if (!hit || hit === node) {
          const rect = stage.container().getBoundingClientRect();
          return { x: rect.left + x, y: rect.top + y };
        }
      }
      // Sin hueco libre: el centro (el arrastre tocará el item, no la zona).
      const rect = stage.container().getBoundingClientRect();
      return {
        x: rect.left + abs.x + width / 2,
        y: rect.top + abs.y + height / 2,
      };
    };

    let point = freePoint();
    if (
      point.x < 60 ||
      point.y < 60 ||
      point.x > window.innerWidth - 60 ||
      point.y > window.innerHeight - 60
    ) {
      const scroll = document.querySelector('div.overflow-auto');
      scroll?.scrollBy({
        left: point.x - window.innerWidth / 2,
        top: point.y - window.innerHeight / 2,
      });
      point = freePoint();
    }
    return point;
  }, zone);
}

/** Etiqueta de la previsualización de página (null si está oculta). */
async function pageResizePreview(): Promise<string | null> {
  return page.evaluate(() => {
    const stage = (window as never as Record<string, unknown>)['__rdlcStage'] as {
      findOne(predicate: (node: { name: () => string }) => boolean): {
        getAttr(name: string): unknown;
        text?: () => string;
      } | null;
    } | null;
    const group = stage?.findOne((candidate) => candidate.name() === 'page-resize-preview');
    const label = stage?.findOne((candidate) => candidate.name() === 'page-resize-label');
    const visible = (group?.getAttr('visible') as boolean | undefined) ?? false;
    return visible ? (label?.text?.() ?? null) : null;
  });
}

/** Puntos de la línea de la previsualización (px de papel; null si no hay). */
async function pageResizePreviewLine(): Promise<{
  x1: number;
  y1: number;
  x2: number;
  y2: number;
} | null> {
  return page.evaluate(() => {
    const stage = (window as never as Record<string, unknown>)['__rdlcStage'] as {
      findOne(predicate: (node: { name: () => string }) => boolean): {
        points?: () => number[];
      } | null;
    } | null;
    const line = stage?.findOne((candidate) => candidate.name() === 'page-resize-line');
    const points = line?.points?.();
    if (!points || points.length < 4) return null;
    return { x1: points[0]!, y1: points[1]!, x2: points[2]!, y2: points[3]! };
  });
}

/** Rect de la pastilla de la previsualización (px de papel; null si no hay). */
async function pageResizeBadge(): Promise<{
  x: number;
  y: number;
  width: number;
  height: number;
} | null> {
  return page.evaluate(() => {
    const stage = (window as never as Record<string, unknown>)['__rdlcStage'] as {
      findOne(predicate: (node: { name: () => string }) => boolean): {
        getAttr(name: string): unknown;
      } | null;
    } | null;
    const group = stage?.findOne((candidate) => candidate.name() === 'page-resize-preview');
    const visible = (group?.getAttr('visible') as boolean | undefined) ?? false;
    if (!visible) return null;
    const badge = stage?.findOne((candidate) => candidate.name() === 'page-resize-badge');
    if (!badge) return null;
    return {
      x: badge.getAttr('x') as number,
      y: badge.getAttr('y') as number,
      width: badge.getAttr('width') as number,
      height: badge.getAttr('height') as number,
    };
  });
}

/** Clic en un item de un submenú Radix: el nodo se re-monta y no siempre
 *  queda "estable" para el clic con ratón. */
async function clickMenuItem(name: string): Promise<void> {
  const item = page.getByRole('menuitem', { name });
  await expect(item).toBeVisible();
  await item.dispatchEvent('click');
}

/** Arrastra desde un punto y devuelve la previsualización (etiqueta y línea). */
async function dragFromPoint(
  point: { x: number; y: number },
  dx: number,
  dy: number,
): Promise<{
  label: string | null;
  line: { x1: number; y1: number; x2: number; y2: number } | null;
}> {
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.mouse.move(point.x + dx, point.y + dy, { steps: 8 });
  const label = await pageResizePreview();
  const line = await pageResizePreviewLine();
  await page.mouse.up();
  return { label, line };
}

test('el borde inferior del cuerpo cambia su alto con previsualización (y undo)', async () => {
  const zoom = await stageZoom();
  const page0 = await projection();
  const before = lengthToCm(page0.page.body.height);
  const point = await pageZonePoint('body');

  const { label } = await dragFromPoint(point, 0, 20);
  const expected = snapCm(before + 20 / zoom / PX_PER_CM);
  expect(label, 'la previsualización muestra el alto resultante').not.toBeNull();
  expect(Number((label ?? '').replace(' cm', ''))).toBeCloseTo(expected, 1);

  await expect
    .poll(async () => lengthToCm((await projection()).page.body.height))
    .toBeCloseTo(expected, 2);

  // Encoger no puede dejar contenido fuera: el cuerpo se queda en el fondo de
  // sus items (misma regla que el ancho de sección).
  const contentBottom = Math.max(
    ...page0.page.body.items.map((item) => lengthToCm(item.top) + lengthToCm(item.height)),
  );
  const shrinkPoint = await pageZonePoint('body');
  const shrink = await dragFromPoint(shrinkPoint, 0, -300);
  expect(Number((shrink.label ?? '').replace(' cm', ''))).toBeCloseTo(contentBottom, 1);
  await expect
    .poll(async () => lengthToCm((await projection()).page.body.height))
    .toBeCloseTo(contentBottom, 2);

  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
  await page.keyboard.press('Control+z');
  await expect
    .poll(async () => lengthToCm((await projection()).page.body.height))
    .toBeCloseTo(expected, 2);
  await page.keyboard.press('Control+z');
  await expect
    .poll(async () => lengthToCm((await projection()).page.body.height))
    .toBeCloseTo(before, 2);
});

test('los bordes del encabezado y del pie redimensionan sus bandas (con undo)', async () => {
  const zoom = await stageZoom();
  const page0 = await projection();
  const headerBefore = lengthToCm(page0.page.header.height);
  const footerBefore = lengthToCm(page0.page.footer.height);
  const topMargin = lengthToCm(page0.page.margins.top);
  const sheetHeight = lengthToCm(page0.page.height);
  const bottomMargin = lengthToCm(page0.page.margins.bottom);
  const contentBottom = (region: 'header' | 'footer'): number =>
    Math.max(
      ...page0.page[region].items.map((item) => lengthToCm(item.top) + lengthToCm(item.height)),
    );

  // Encabezado: crece al arrastrar su borde inferior hacia abajo. La guía viaja
  // con el **borde inferior** resultante (margen superior + alto).
  const headerPoint = await pageZonePoint('header');
  const headerDrag = await dragFromPoint(headerPoint, 0, 20);
  const headerExpected = snapCm(headerBefore + 20 / zoom / PX_PER_CM);
  expect(Number((headerDrag.label ?? '').replace(' cm', ''))).toBeCloseTo(headerExpected, 1);
  expect(headerDrag.line?.y1 ?? -1).toBeCloseTo((topMargin + headerExpected) * PX_PER_CM, 1);
  await expect
    .poll(async () => lengthToCm((await projection()).page.header.height))
    .toBeCloseTo(headerExpected, 2);

  // Encoger se topa con el contenido del encabezado (8.43921cm lo llena).
  const headerMin = contentBottom('header');
  const headerShrinkPoint = await pageZonePoint('header');
  const headerShrink = await dragFromPoint(headerShrinkPoint, 0, -300);
  expect(Number((headerShrink.label ?? '').replace(' cm', ''))).toBeCloseTo(headerMin, 1);
  expect(headerShrink.line?.y1 ?? -1).toBeCloseTo((topMargin + headerMin) * PX_PER_CM, 1);
  await expect
    .poll(async () => lengthToCm((await projection()).page.header.height))
    .toBeCloseTo(headerMin, 2);

  // Pie: se arrastra su borde superior hacia arriba (crece). La guía viaja con
  // el **nuevo borde superior** (fondo del pie menos su alto), no con la base.
  const footerPoint = await pageZonePoint('footer');
  const footerDrag = await dragFromPoint(footerPoint, 0, -20);
  const footerExpected = snapCm(footerBefore + 20 / zoom / PX_PER_CM);
  expect(Number((footerDrag.label ?? '').replace(' cm', ''))).toBeCloseTo(footerExpected, 1);
  expect(footerDrag.line?.y1 ?? -1).toBeCloseTo(
    (sheetHeight - bottomMargin - footerExpected) * PX_PER_CM,
    1,
  );
  await expect
    .poll(async () => lengthToCm((await projection()).page.footer.height))
    .toBeCloseTo(footerExpected, 2);

  // Encoger el pie se topa con su contenido (2.53503cm).
  const footerMin = contentBottom('footer');
  const footerShrinkPoint = await pageZonePoint('footer');
  const footerShrink = await dragFromPoint(footerShrinkPoint, 0, 300);
  expect(Number((footerShrink.label ?? '').replace(' cm', ''))).toBeCloseTo(footerMin, 1);
  await expect
    .poll(async () => lengthToCm((await projection()).page.footer.height))
    .toBeCloseTo(footerMin, 2);

  // Undo por pasos: pie (clamp, crecer), encabezado (clamp, crecer) → estado inicial.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
  await page.keyboard.press('Control+z');
  await expect
    .poll(async () => lengthToCm((await projection()).page.footer.height))
    .toBeCloseTo(footerExpected, 2);
  await page.keyboard.press('Control+z');
  await expect
    .poll(async () => lengthToCm((await projection()).page.footer.height))
    .toBeCloseTo(footerBefore, 2);
  await page.keyboard.press('Control+z');
  await expect
    .poll(async () => lengthToCm((await projection()).page.header.height))
    .toBeCloseTo(headerExpected, 2);
  await page.keyboard.press('Control+z');
  await expect
    .poll(async () => lengthToCm((await projection()).page.header.height))
    .toBeCloseTo(headerBefore, 2);
});

test('el borde derecho cambia el ancho de sección del informe (con undo)', async () => {
  const zoom = await stageZoom();
  const page0 = await projection();
  const before = lengthToCm(page0.page.body.width);
  const sheet = lengthToCm(page0.page.width);
  const point = await pageZonePoint('section');

  const { label } = await dragFromPoint(point, 20, 0);
  const expected = Math.min(snapCm(before + 20 / zoom / PX_PER_CM), snapCm(sheet));
  expect(label, 'la previsualización muestra el ancho resultante').not.toBeNull();
  expect(Number((label ?? '').replace(' cm', ''))).toBeCloseTo(expected, 1);

  await expect
    .poll(async () => lengthToCm((await projection()).page.body.width))
    .toBeCloseTo(expected, 2);
  // Las tres bandas comparten el ancho de la sección.
  const after = await projection();
  expect(lengthToCm(after.page.header.width)).toBeCloseTo(expected, 2);
  expect(lengthToCm(after.page.footer.width)).toBeCloseTo(expected, 2);

  // Encoger no puede dejar contenido fuera: la sección se queda en el borde
  // derecho del contenido (el cuerpo "crece" hasta él) y la guía lo muestra.
  const contentRight = contentRightCm(page0);
  const shrinkPoint = await pageZonePoint('section');
  const shrink = await dragFromPoint(shrinkPoint, -200, 0);
  expect(Number((shrink.label ?? '').replace(' cm', ''))).toBeCloseTo(contentRight, 1);
  await expect
    .poll(async () => lengthToCm((await projection()).page.body.width))
    .toBeCloseTo(contentRight, 2);

  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
  await page.keyboard.press('Control+z');
  await expect
    .poll(async () => lengthToCm((await projection()).page.body.width))
    .toBeCloseTo(expected, 2);
  await page.keyboard.press('Control+z');
  await expect
    .poll(async () => lengthToCm((await projection()).page.body.width))
    .toBeCloseTo(before, 2);
});

test('los márgenes se arrastran desde la regla (previsualización junto a la línea, con undo)', async () => {
  const zoom = await stageZoom();
  const before = lengthToCm((await projection()).page.margins.left);
  const marker = page.getByRole('slider', { name: 'Margen izquierdo' });
  const box = (await marker.boundingBox())!;
  expect(box).not.toBeNull();

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 20, box.y + box.height / 2, { steps: 8 });
  const label = await pageResizePreview();
  expect(label, 'la previsualización muestra el margen resultante').not.toBeNull();
  expect(label).toContain('Margen izq.');
  const expected = snapCm(before + 20 / zoom / PX_PER_CM);
  expect(Number((label ?? '').replace('Margen izq.', '').replace(' cm', ''))).toBeCloseTo(
    expected,
    2,
  );
  // Línea vertical sobre la nueva frontera y pastilla a su derecha, pegada.
  const line = await pageResizePreviewLine();
  const badge = await pageResizeBadge();
  expect(line).not.toBeNull();
  expect(line!.x1).toBeCloseTo(expected * PX_PER_CM, 2);
  expect(line!.x1).toBeCloseTo(line!.x2, 5);
  expect(badge).not.toBeNull();
  expect(badge!.x).toBeGreaterThan(line!.x1);
  expect(badge!.x - line!.x1).toBeLessThanOrEqual(24 / zoom);
  expect(badge!.y).toBeLessThanOrEqual(24 / zoom);
  // La pastilla crece con el texto: «Margen izq. X cm» no se recorta.
  expect(badge!.width * zoom).toBeGreaterThan(80);
  await page.mouse.up();

  await expect
    .poll(async () => lengthToCm((await projection()).page.margins.left))
    .toBeCloseTo(expected, 2);

  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
  await page.keyboard.press('Control+z');
  await expect
    .poll(async () => lengthToCm((await projection()).page.margins.left))
    .toBeCloseTo(before, 2);

  // El margen superior (regla vertical): línea horizontal con la pastilla
  // encima y el tamaño resultante.
  const topBefore = lengthToCm((await projection()).page.margins.top);
  const topMarker = page.getByRole('slider', { name: 'Margen superior' });
  const topBox = (await topMarker.boundingBox())!;
  await page.mouse.move(topBox.x + topBox.width / 2, topBox.y + topBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(topBox.x + topBox.width / 2, topBox.y + topBox.height / 2 + 80, {
    steps: 8,
  });
  const topLabel = await pageResizePreview();
  const topLine = await pageResizePreviewLine();
  const topBadge = await pageResizeBadge();
  const topExpected = snapCm(topBefore + 80 / zoom / PX_PER_CM);
  expect(topLabel).toContain('Margen sup.');
  expect(Number((topLabel ?? '').replace('Margen sup.', '').replace(' cm', ''))).toBeCloseTo(
    topExpected,
    2,
  );
  expect(topLine).not.toBeNull();
  expect(topLine!.y1).toBeCloseTo(topExpected * PX_PER_CM, 2);
  expect(topLine!.y1).toBeCloseTo(topLine!.y2, 5);
  expect(topBadge).not.toBeNull();
  expect(topBadge!.y + topBadge!.height).toBeLessThanOrEqual(topLine!.y1);
  expect(topLine!.y1 - (topBadge!.y + topBadge!.height)).toBeLessThanOrEqual(24 / zoom);
  await page.mouse.up();

  await expect
    .poll(async () => lengthToCm((await projection()).page.margins.top))
    .toBeCloseTo(topExpected, 2);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
  await page.keyboard.press('Control+z');
  await expect
    .poll(async () => lengthToCm((await projection()).page.margins.top))
    .toBeCloseTo(topBefore, 2);
});

test('la regla marca el área imprimible y las bandas de encabezado y pie', async () => {
  const zoom = await stageZoom();
  const proj = await projection();
  const headerCm = lengthToCm(proj.page.header.height);

  // El área imprimible se marca en las dos reglas.
  await expect(page.getByTitle('Área imprimible')).toHaveCount(2);

  // La banda del encabezado (regla vertical) mide su alto real en pantalla.
  const header = page.getByTitle('Encabezado');
  await expect(header).toHaveCount(1);
  const box = (await header.boundingBox())!;
  expect(box).not.toBeNull();
  const expectedPx = headerCm * zoom * PX_PER_CM;
  expect(Math.abs(box.height - expectedPx)).toBeLessThan(2);

  // El pie también está delimitado (la proyección lo trae con alto > 0).
  await expect(page.getByTitle('Pie')).toHaveCount(1);
});

/* ----------------------- U6 · zoom: presets y atajos ---------------------- */

/** Ancho del escenario Konva en px de pantalla (A4 a zoom 1 ≈ 793,7). */
async function stageWidth(): Promise<number> {
  return page.evaluate(() =>
    ((window as never as Record<string, unknown>)['__rdlcStage'] as { width(): number }).width(),
  );
}

/** Ancho útil del hueco del lienzo (sin paddings ni regla). */
async function canvasAvailableWidth(): Promise<number> {
  return page.evaluate(() => {
    const scroller = document.querySelector('canvas')?.closest('.overflow-auto');
    return scroller instanceof HTMLElement ? scroller.clientWidth - 24 * 2 - 20 : 0;
  });
}

test('el zoom tiene presets, «ajustar al ancho» y atajos', async () => {
  const a4Px = (21 * 96) / 2.54; // 21 cm de papel

  // 100 % (tamaño real) desde el menú del porcentaje.
  await page.getByRole('button', { name: /^Zoom:/ }).click();
  await page.getByRole('menuitem', { name: 'Tamaño real (100 %)' }).click();
  await expect.poll(stageWidth).toBeCloseTo(a4Px, 0);

  // Ctrl+1: ajusta el papel al hueco visible (la regla y los paddings no cuentan).
  await page.keyboard.press('Control+1');
  const available = await canvasAvailableWidth();
  expect(available).toBeGreaterThan(200);
  expect(await stageWidth()).toBeGreaterThan(available - 2);
  expect(await stageWidth()).toBeLessThan(available + 2);

  // Ctrl+0 vuelve al 100 %.
  await page.keyboard.press('Control+0');
  await expect.poll(stageWidth).toBeCloseTo(a4Px, 0);

  // Un preset del menú (50 %). `exact` evita que «150 %» también encaje.
  await page.getByRole('button', { name: /^Zoom:/ }).click();
  await page.getByRole('menuitem', { name: '50 %', exact: true }).click();
  await expect.poll(stageWidth).toBeCloseTo(a4Px * 0.5, 0);

  // Vuelve al 60 % inicial (100 % y cuatro pasos de −) para no condicionar a
  // los tests siguientes.
  await page.keyboard.press('Control+0');
  for (let step = 0; step < 4; step += 1) {
    await page.getByRole('button', { name: 'Reducir zoom' }).click();
  }
  await expect.poll(stageWidth).toBeCloseTo(a4Px * 0.6, 0);
});

/* ------------------ U7 · paleta: acciones nuevas del editor ---------------- */

test('la paleta ofrece las acciones nuevas (filtros, texto y zoom)', async () => {
  // Con un Tablix seleccionado, «Filtros del Tablix…» está habilitada.
  await selectItemViaPalette('Tablix7');
  await page.keyboard.press('Control+k');
  await page.getByPlaceholder('Buscar elemento, variable o acción…').fill('Filtros del Tablix');
  await page.getByRole('option', { name: /Filtros del Tablix/ }).click();
  const filters = page.getByRole('dialog', { name: 'Filtros del Tablix' });
  await expect(filters.getByRole('heading', { name: 'Filtros del Tablix' })).toBeVisible();
  await filters.getByRole('button', { name: 'Cancelar' }).click();
  await expect(filters).toBeHidden();

  // Con un textbox seleccionado, «Editar el texto…» abre su editor.
  await selectItemViaPalette('Textbox128');
  await page.keyboard.press('Control+k');
  await page.getByPlaceholder('Buscar elemento, variable o acción…').fill('Editar el texto');
  await page.getByRole('option', { name: /Editar el texto/ }).click();
  const text = page.getByRole('dialog', { name: 'Texto de Textbox128' });
  await expect(text.getByRole('heading', { name: 'Texto de Textbox128' })).toBeVisible();
  await text.getByRole('button', { name: 'Cancelar' }).click();
  await expect(text).toBeHidden();

  // «Ajustar al ancho» también vive en la paleta.
  await page.keyboard.press('Control+0');
  const a4Px = (21 * 96) / 2.54;
  await expect.poll(stageWidth).toBeCloseTo(a4Px, 0);
  await page.keyboard.press('Control+k');
  await page.getByPlaceholder('Buscar elemento, variable o acción…').fill('Ajustar al ancho');
  await page.getByRole('option', { name: /Ajustar al ancho/ }).click();
  const available = await canvasAvailableWidth();
  expect(await stageWidth()).toBeGreaterThan(available - 2);
  expect(await stageWidth()).toBeLessThan(available + 2);
});

/* --------- U8 · agrupar la fila en el menú contextual (+ Ctrl+Intro) ------- */

test('el menú contextual agrupa una fila estática (Ctrl+Intro aplica)', async () => {
  await selectItemViaPalette('Tablix3');
  const proj = await projection();
  const tablix = findItem(proj.page.body.items, 'Tablix3') as
    (ItemLike & { body: { rows: { cells: (CellLike | null)[] }[] } }) | undefined;
  const content = tablix?.body.rows[0]?.cells[0]?.content;
  expect(content).toBeTruthy();
  const point = await nodeCenter(content!.id);
  expect(point).not.toBeNull();

  await page.mouse.click(point!.x, point!.y, { button: 'right' });
  await page.getByRole('menuitem', { name: 'Agrupar la fila 1…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Agrupar la fila 1' });
  await expect(dialog.getByRole('heading', { name: 'Agrupar la fila 1' })).toBeVisible();
  // U9: el botón de cerrar del diálogo tiene nombre accesible en español.
  await expect(dialog.getByRole('button', { name: 'Cerrar' })).toBeVisible();

  const editor = dialog.locator('.monaco-editor');
  await expect(editor).toBeVisible({ timeout: 15_000 });
  await editor.click();
  await page.keyboard.type('=Fields!BTCNo_BTCHeader.Value');
  // Ctrl+Intro aplica el diálogo sin usar el botón.
  await page.keyboard.press('Control+Enter');
  await expect(dialog).toBeHidden();
  await expect
    .poll(() => memberExpression('Tablix3', 'row', [0]))
    .toBe('=Fields!BTCNo_BTCHeader.Value');

  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
  await page.keyboard.press('Control+z');
  await expect.poll(() => memberExpression('Tablix3', 'row', [0])).toBeUndefined();
});

/* --------------------- U9 · atajos y foco de los diálogos ------------------ */

test('Ctrl+S guarda y Ctrl+K no se cuela dentro de un diálogo', async () => {
  // Ctrl+S: la promesa de la paleta, sin botón de por medio.
  await page.keyboard.press('Control+s');
  await expect(page.getByText(/Guardado/)).toBeVisible();

  // Con un diálogo abierto, Ctrl+K no abre la paleta por encima (el foco y la
  // trampa de Radix mandan).
  await page.getByRole('button', { name: 'Informe…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Propiedades del informe' });
  await expect(dialog.getByRole('heading', { name: 'Propiedades del informe' })).toBeVisible();
  await page.keyboard.press('Control+k');
  await expect(page.getByPlaceholder('Buscar elemento, variable o acción…')).toBeHidden();
  // Escape cierra el diálogo y devuelve el foco sin tocar la selección.
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

test('Jerarquía y breadcrumb navegan por los contenedores', async () => {
  await selectItemViaPalette('Textbox4'); // encabezado, dentro de Rectangle1

  // Breadcrumb: la ruta y el salto al contenedor.
  const crumbs = page.getByRole('navigation', { name: 'Ruta del elemento seleccionado' });
  await expect(crumbs).toContainText('Encabezado');
  await expect(crumbs).toContainText('Rectangle1');
  await crumbs.getByRole('button', { name: 'Rectangle1' }).click();
  await expect.poll(selectedId).toBe('Rectangle1');

  // Panel de Jerarquía: el buscador filtra el árbol y selecciona el anidado.
  await page.getByRole('button', { name: 'Jerarquía' }).click();
  const tree = page.getByRole('tree', { name: 'Jerarquía del informe' });
  await expect(tree).toBeVisible();
  await page.getByRole('textbox', { name: 'Buscar en la jerarquía' }).fill('Textbox4');
  await expect(tree.getByText('Sin resultados.')).toHaveCount(0);
  await tree.locator('button', { hasText: 'Textbox4' }).first().click();
  await expect.poll(selectedId).toBe('Textbox4');
});

test('el z-order tiene atajos (Ctrl+Shift+] / Ctrl+Shift+[)', async () => {
  await selectItemViaPalette('Textbox4');
  expect(await itemZIndex('Textbox4')).toBeUndefined();

  await page.keyboard.press('Control+Shift+]');
  await expect.poll(() => itemZIndex('Textbox4')).toBeGreaterThan(0);

  await page.keyboard.press('Control+z');
  await expect.poll(() => itemZIndex('Textbox4')).toBeUndefined();
});

test('el lote compara el estilo efectivo (Arial/Visible/8pt) sin declararlo en el item', async () => {
  // Textbox93 y Textbox95 declaran 8pt/Bold en el run y no declaran fuente ni
  // visibilidad: el panel debe mostrar los valores efectivos, no «—».
  await selectItemViaPalette('Textbox93');
  const center = await nodeCenter('Textbox95');
  expect(center).not.toBeNull();
  await page.keyboard.down('Control');
  await page.mouse.click(center!.x, center!.y);
  await page.keyboard.up('Control');

  const panel = page.getByTestId('multi-selection-panel');
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('2 elementos');
  await expect(page.getByLabel('Fuente de la selección')).toHaveValue('Arial');
  await expect(page.getByLabel('Tamaño de la selección (pt)', { exact: true })).toHaveValue('8.00');
  await expect(page.getByLabel('Visibilidad de la selección')).toHaveValue('visible');

  // Borde izquierdo mezclado (93 Sólido, 95 Sin borde): se marca «—» y se edita.
  const leftBorder = panel.getByLabel('Borde izquierdo: estilo');
  await expect(leftBorder).toHaveValue('');
  await leftBorder.selectOption('Solid');
  await expect.poll(async () => (await itemBorderSide('Textbox93', 'left'))?.style).toBe('Solid');
  await expect.poll(async () => (await itemBorderSide('Textbox95', 'left'))?.style).toBe('Solid');

  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await itemBorderSide('Textbox95', 'left'))?.style).toBe('None');
});

test('multiselección: Ctrl+click, alinear en lote y un solo undo', async () => {
  // Textbox4 y Textbox17 viven en Rectangle1 (encabezado), con lefts distintos.
  await selectItemViaPalette('Textbox4');
  const center = await nodeCenter('Textbox17');
  expect(center).not.toBeNull();
  await page.keyboard.down('Control');
  await page.mouse.click(center!.x, center!.y);
  await page.keyboard.up('Control');

  const panel = page.getByTestId('multi-selection-panel');
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('2 elementos');

  const before4 = await itemLocation('Textbox4');
  const before17 = await itemLocation('Textbox17');
  expect(before4).toBeDefined();
  expect(before17).toBeDefined();
  const minLeft = Math.min(before4!.left, before17!.left);

  await panel.getByRole('button', { name: 'Alinear a la izquierda' }).click();
  await expect.poll(async () => (await itemLocation('Textbox4'))?.left).toBeCloseTo(minLeft, 3);
  await expect.poll(async () => (await itemLocation('Textbox17'))?.left).toBeCloseTo(minLeft, 3);

  // Un único Ctrl+Z revierte los dos (el lote es atómico).
  await page.keyboard.press('Control+z');
  await expect
    .poll(async () => (await itemLocation('Textbox4'))?.left)
    .toBeCloseTo(before4!.left, 3);
  await expect
    .poll(async () => (await itemLocation('Textbox17'))?.left)
    .toBeCloseTo(before17!.left, 3);
});
