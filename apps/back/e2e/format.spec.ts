import { appEnv } from './launch.js';
import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Locator,
  type Page,
} from '@playwright/test';
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Formato numérico/fecha (`<Format>`) — docs/features/0003.
 *
 * El panel de texto muestra el formato **efectivo** de los runs (run > párrafo
 * > item) en el campo «Formato», lo cambia (preset, cadena libre con
 * comillas/`;`, sin escapar) y «General» lo quita (`null`). Las expresiones
 * (`=Fields!…`) se editan con **Monaco**; las cadenas .NET, con el campo
 * simple. El guardado escribe el XML y el undo deja el fichero **byte a byte**
 * como estaba.
 *
 * Convenciones del directorio: copia temporal de la fixture, instancia propia
 * por `describe` y selección por la paleta (Ctrl+K), sin geometría del lienzo.
 * El textbox de prueba se busca en la proyección: la fixture decide cuál es.
 */

const here = fileURLToPath(new URL('.', import.meta.url));
const mainEntry = join(here, '..', 'out', 'main', 'main.js');
const corpus = join(here, '..', '..', '..', 'fixtures', 'corpus');
const FIXTURE = 'SalesInvoiceESP.rdlc';

/** Cadena personalizada del doc §4.1: `;`, comas y comillas, literal. */
const CUSTOM_FORMAT = '#,##0.00;(#,##0.00);""';

interface Ctx {
  app: ElectronApplication;
  page: Page;
  /** Copia temporal sobre la que se guarda. */
  file: string;
  /** Bytes del fichero al abrir: referencia del round-trip. */
  original: Buffer;
}

async function launch(): Promise<Ctx> {
  const workspace = join(
    tmpdir(),
    `rdlc-e2e-format-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  );
  mkdirSync(workspace, { recursive: true });
  const file = join(workspace, FIXTURE);
  copyFileSync(join(corpus, FIXTURE), file);
  const original = readFileSync(file);
  const app = await electron.launch({
    args: [mainEntry, file, `--user-data-dir=${join(workspace, 'user-data')}`],
    env: appEnv(),
  });
  const page = await app.firstWindow();
  await page.waitForFunction(() =>
    Boolean((window as never as Record<string, unknown>)['__rdlcProjection']),
  );
  return { app, page, file, original };
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

async function statusText(page: Page): Promise<string> {
  return (await page.locator('footer').first().innerText()).replace(/\s+/g, ' ');
}

/** Selección viva del front (`__rdlcSelection`). */
async function selectedId(page: Page): Promise<string | null> {
  return page.evaluate(
    () =>
      ((window as never as Record<string, unknown>)['__rdlcSelection'] as { id?: string } | null)
        ?.id ?? null,
  );
}

/** Escapa el id para el valor de un selector de atributo CSS. */
function escapeCssValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/**
 * Opción de la paleta del **elemento** por su `id` exacto. El nombre accesible
 * no sirve de clave: un campo del dataset con el mismo nombre que el textbox
 * (`Quantity_Line`) comparte el prefijo y la paleta ofrece las dos opciones.
 * cmdk estampa el `value` de cada CommandItem en `data-value` (el del elemento
 * es el id a secas; el de la variable incluye su expresión).
 */
function paletteElementOption(page: Page, id: string) {
  return page.locator(`[role="option"][data-value="${escapeCssValue(id)}"]`);
}

/** Selecciona un elemento por nombre desde la paleta (Ctrl+K). */
async function selectItemViaPalette(page: Page, id: string): Promise<void> {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
  await page.keyboard.press('Control+k');
  await page.getByPlaceholder('Buscar elemento, variable o acción…').fill(id);
  await page.waitForTimeout(250);
  await paletteElementOption(page, id).click();
  await expect.poll(() => selectedId(page)).toBe(id);
}

/** Guarda (Ctrl+S) y espera la confirmación del pie. */
async function save(page: Page): Promise<void> {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
  await page.keyboard.press('Control+s');
  await expect
    .poll(() => statusText(page), { message: 'el guardado debe confirmarse' })
    .toContain('Guardado');
}

/** Deshace la última edición (con el foco fuera de los campos de texto). */
async function undo(page: Page): Promise<void> {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
  await page.keyboard.press('Control+z');
}

interface FormatCandidate {
  /** `Name` del textbox. */
  id: string;
  /** `<Format>` declarado en sus runs (la misma cadena en todos). */
  format: string;
}

/**
 * Primer textbox de la proyección cuyo `<Format>` está declarado **en sus
 * runs** y es el mismo en todos, y que **no** declara formato en el item ni en
 * sus párrafos. Así el campo del panel muestra esa cadena (y no «Mixto») y
 * «General» puede dejar el textbox sin ningún formato efectivo. Es como lo
 * genera BC (el formato vive en el `<Style>` del run).
 */
async function findTextboxWithFormat(page: Page): Promise<FormatCandidate | null> {
  return page.evaluate(() => {
    const projection = (window as never as Record<string, unknown>)['__rdlcProjection'];
    let found: { id: string; format: string } | null = null;

    const runLevelFormat = (node: Record<string, unknown>): string | null => {
      const itemStyle = node['style'] as { format?: string } | undefined;
      if (itemStyle?.format !== undefined) return null;

      const paragraphs =
        (node['paragraphs'] as
          | { runs?: { style?: { format?: string } }[]; style?: { format?: string } }[]
          | undefined) ?? [];
      const formats: (string | undefined)[] = [];
      for (const paragraph of paragraphs) {
        if (paragraph.style?.format !== undefined) return null;
        for (const run of paragraph.runs ?? []) formats.push(run.style?.format);
      }
      if (formats.length === 0 || formats.some((format) => format === undefined)) return null;
      const [first] = formats;
      return first !== undefined && formats.every((format) => format === first) ? first : null;
    };

    const walk = (value: unknown): void => {
      if (found || value === null || typeof value !== 'object') return;
      if (Array.isArray(value)) {
        for (const entry of value) walk(entry);
        return;
      }
      const node = value as Record<string, unknown>;
      if (node['kind'] === 'textbox' && typeof node['id'] === 'string') {
        const format = runLevelFormat(node);
        if (format !== null) {
          found = { id: node['id'], format };
          return;
        }
      }
      for (const entry of Object.values(node)) walk(entry);
    };

    walk(projection);
    return found;
  });
}

/**
 * Formato efectivo común del textbox en la proyección viva: la cadena,
 * `'mixed'` si los runs discrepan o `null` si es General (o no está).
 */
async function commonFormat(page: Page, id: string): Promise<string | 'mixed' | null> {
  return page.evaluate((itemId) => {
    const projection = (window as never as Record<string, unknown>)['__rdlcProjection'];
    interface ItemLike {
      id?: string;
      kind?: string;
      style?: { format?: string };
      paragraphs?: { runs: { style?: { format?: string } }[]; style?: { format?: string } }[];
    }
    let found: ItemLike | null = null;

    const walk = (value: unknown): void => {
      if (found || value === null || typeof value !== 'object') return;
      if (Array.isArray(value)) {
        for (const entry of value) walk(entry);
        return;
      }
      const node = value as Record<string, unknown>;
      if (node['id'] === itemId && node['kind'] === 'textbox') {
        found = node as ItemLike;
        return;
      }
      for (const entry of Object.values(node)) walk(entry);
    };

    walk(projection);
    if (!found) return null;

    const item = found as ItemLike;
    const formats: (string | undefined)[] = [];
    for (const paragraph of item.paragraphs ?? []) {
      for (const run of paragraph.runs) {
        formats.push(run.style?.format ?? paragraph.style?.format ?? item.style?.format);
      }
    }
    if (formats.length === 0) return null;
    const [first] = formats;
    return formats.every((format) => format === first) ? (first ?? null) : 'mixed';
  }, id);
}

/** XML del `<Textbox Name="id">` (los textboxes no anidan: hasta su cierre). */
function textboxXml(xml: string, id: string): string {
  const start = xml.indexOf(`Name="${id}"`);
  expect(start, `el textbox ${id} debe estar en el XML guardado`).toBeGreaterThanOrEqual(0);
  const end = xml.indexOf('</Textbox>', start);
  return end === -1 ? xml.slice(start) : xml.slice(start, end);
}

/** Bloques `<TextRun>…</TextRun>` de un textbox (su `<Style>` lleva el `<Format>`). */
function runBlocks(textbox: string): string[] {
  return [...textbox.matchAll(/<TextRun>[\s\S]*?<\/TextRun>/g)].map((match) => match[0]);
}

/** Campo «Formato» del panel: selector de presets. */
function formatSelect(page: Page) {
  return page.getByLabel('Formato del textbox', { exact: true });
}

/** Editor (Monaco) del formato cuando contiene una **cadena .NET**. */
function formatLiteral(page: Page) {
  return page.locator('[data-rdlc-format-literal] .monaco-editor');
}

/** El mismo editor cuando contiene una **expresión de BC**. */
function formatExpression(page: Page) {
  return page.locator('[data-rdlc-format-expression] .monaco-editor');
}

/**
 * Texto pintado por un Monaco, sin espacios: el ajuste de línea parte una
 * cadena larga en varias líneas visuales.
 */
async function monacoText(editor: Locator): Promise<string> {
  return (await editor.locator('.view-lines').innerText()).replace(/\s+/g, '');
}

/* --------------------------------- tests --------------------------------- */

test.describe('Formato (`<Format>`, 0003)', () => {
  const ctx = useApp();

  test('muestra la expresión del run, la cambia y el undo la deja byte a byte', async () => {
    const { page, file, original } = ctx();

    const candidate = await findTextboxWithFormat(page);
    expect(candidate, 'la fixture debe traer un textbox con <Format> en sus runs').not.toBeNull();
    expect(candidate!.format.startsWith('='), 'el <Format> de la fixture es una expresión').toBe(
      true,
    );

    await selectItemViaPalette(page, candidate!.id);
    // La expresión se edita con Monaco (no con el campo simple) y el selector
    // lo refleja.
    await expect(formatSelect(page)).toHaveValue('expression');
    const editor = formatExpression(page);
    await expect(editor).toBeVisible({ timeout: 15_000 });
    // Monaco pinta el texto en un fotograma posterior a ser visible: se sondea
    // el contenido en vez de leerlo una vez (con el runner cargado tarda).
    await expect
      .poll(async () => (await editor.locator('.view-lines').innerText()).replace(/\s+/g, ' '), {
        message: 'Monaco muestra la expresión del run',
      })
      .toContain(candidate!.format.slice(0, 10));

    // Cambio con el editor (cadena personalizada, sin escapar comillas ni `;`).
    await editor.click();
    await page.keyboard.press('Control+a');
    await page.keyboard.type(CUSTOM_FORMAT);
    await page.keyboard.press('Enter');
    // Mismo editor (sin cambiar de campo ni perder el foco), ahora con una cadena.
    await expect(formatSelect(page)).toHaveValue('custom');
    await expect.poll(() => monacoText(formatLiteral(page))).toBe(CUSTOM_FORMAT);
    await expect
      .poll(() => commonFormat(page, candidate!.id), {
        message: 'la proyección debe reflejar el formato nuevo',
      })
      .toBe(CUSTOM_FORMAT);

    await save(page);
    const written = readFileSync(file, 'utf8');
    const blocks = runBlocks(textboxXml(written, candidate!.id));
    expect(
      blocks.some((block) => block.includes(`<Format>${CUSTOM_FORMAT}</Format>`)),
      'el XML debe llevar el formato nuevo en el run',
    ).toBe(true);
    expect(
      blocks.every((block) => !block.includes(candidate!.format)),
      'ningún run debe conservar el formato anterior',
    ).toBe(true);

    // Deshacer: vuelve el formato original (una expresión, otra vez con Monaco)
    // y el guardado es idéntico al de abrir.
    await undo(page);
    await expect
      .poll(() => commonFormat(page, candidate!.id), {
        message: 'el undo debe devolver el formato original',
      })
      .toBe(candidate!.format);
    await expect(formatExpression(page)).toBeVisible({ timeout: 15_000 });
    await save(page);
    expect(
      readFileSync(file).equals(original),
      'el round-trip tras deshacer debe ser byte a byte',
    ).toBe(true);
  });

  test('«General» quita el <Format> (`null`) y el undo lo restaura', async () => {
    const { page, file, original } = ctx();

    const candidate = await findTextboxWithFormat(page);
    expect(candidate, 'la fixture debe traer un textbox con <Format> en sus runs').not.toBeNull();
    expect(candidate!.format.startsWith('='), 'el <Format> de la fixture es una expresión').toBe(
      true,
    );

    await selectItemViaPalette(page, candidate!.id);
    await expect(formatSelect(page)).toHaveValue('expression');
    const editor = formatExpression(page);
    await expect(editor).toBeVisible({ timeout: 15_000 });

    // Vaciar el editor Monaco y confirmar = General: el selector lo confirma y
    // el backend recibe `format: null` (quitar el tag), nunca la cadena vacía.
    await editor.click();
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Delete');
    await page.keyboard.press('Enter');
    await expect(formatSelect(page)).toHaveValue('general');
    await expect.poll(() => monacoText(formatLiteral(page))).toBe('');
    await expect
      .poll(() => commonFormat(page, candidate!.id), {
        message: 'General debe dejar el textbox sin formato',
      })
      .toBe(null);

    await save(page);
    const blocks = runBlocks(textboxXml(readFileSync(file, 'utf8'), candidate!.id));
    expect(
      blocks.every((block) => !block.includes('<Format>')),
      'ningún run debe conservar el <Format>',
    ).toBe(true);

    await undo(page);
    await expect
      .poll(() => commonFormat(page, candidate!.id), {
        message: 'el undo debe devolver el <Format> original',
      })
      .toBe(candidate!.format);
    await expect(formatExpression(page)).toBeVisible({ timeout: 15_000 });
    await save(page);
    expect(
      readFileSync(file).equals(original),
      'el round-trip tras deshacer debe ser byte a byte',
    ).toBe(true);
  });
});
