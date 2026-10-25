import { appEnv } from './launch.js';
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
 * Ctrl+rueda sobre el lienzo: el zoom se ancla al **cursor**. El punto del
 * papel que hay bajo el puntero al empezar el gesto debe seguir bajo él cuando
 * el zoom se confirma (~120 ms tras el último paso de rueda).
 *
 * Se mide en espacio de papel con el stage de Konva (`__rdlcStage`):
 * `p = (cliente − rect del contenedor del stage − stage.x/y) / zoom`, antes del
 * gesto; después se proyecta ese mismo `p` a pantalla con el zoom/posición nuevos
 * y se compara con la posición original del cursor.
 *
 * Límite conocido: si el papel cabe en el hueco (sin rango de scroll en un eje),
 * el layout se centra y el anclaje exacto es imposible en ese eje; también se
 * satura el scroll en los extremos. Por eso los escenarios parten de un zoom
 * alto (con rango de scroll a ambos lados) y el extremo inferior (20 %) no
 * afirma anclaje, solo que el zoom se acota y no hay errores.
 */

const here = fileURLToPath(new URL('.', import.meta.url));
const mainEntry = join(here, '..', 'out', 'main', 'main.js');
const fixture = join(here, '..', '..', '..', 'fixtures', 'corpus', 'SalesCreditMemoESP.rdlc');

/** Tolerancia del anclaje (px de pantalla) en cada eje. */
const TOLERANCE_PX = 2;

let app: ElectronApplication;
let page: Page;
const pageErrors: string[] = [];
const consoleErrors: string[] = [];

test.beforeAll(async () => {
  const workspace = join(tmpdir(), `rdlc-e2e-zoomcursor-${Date.now()}`);
  mkdirSync(workspace, { recursive: true });
  const file = join(workspace, 'SalesCreditMemoESP.rdlc');
  copyFileSync(fixture, file);

  app = await electron.launch({
    args: [mainEntry, file, `--user-data-dir=${join(workspace, 'user-data')}`],
    env: appEnv(),
  });
  page = await app.firstWindow();
  page.on('pageerror', (error) => pageErrors.push(String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  await page.waitForFunction(() =>
    Boolean((window as never as Record<string, unknown>)['__rdlcStage']),
  );
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

test.beforeEach(() => {
  pageErrors.length = 0;
  consoleErrors.length = 0;
});

test.afterEach(() => {
  expect(pageErrors, 'errores de página (pageerror)').toEqual([]);
  expect(consoleErrors, 'errores de consola').toEqual([]);
});

interface Measure {
  zoom: number;
  stageX: number;
  stageY: number;
  left: number;
  top: number;
  scrollLeft: number;
  scrollTop: number;
  maxScrollLeft: number;
  maxScrollTop: number;
  viewWidth: number;
  viewHeight: number;
  viewLeft: number;
  viewTop: number;
  /** `transform` provisional del papel (vacío = sin gesto pendiente). */
  transform: string;
}

interface Point {
  x: number;
  y: number;
}

/** Estado vivo del stage y del scroller (el stage puede re-montarse: se lee siempre fresco). */
async function measure(): Promise<Measure> {
  return page.evaluate(() => {
    const stage = (window as never as Record<string, unknown>)['__rdlcStage'] as {
      scaleX(): number;
      x(): number;
      y(): number;
      container(): HTMLElement;
    };
    const rect = stage.container().getBoundingClientRect();
    const scroller = document.getElementById('lienzo') as HTMLElement;
    const view = scroller.getBoundingClientRect();
    const paper = scroller.querySelector(':scope > div.relative') as HTMLElement | null;
    return {
      zoom: stage.scaleX(),
      stageX: stage.x(),
      stageY: stage.y(),
      left: rect.left,
      top: rect.top,
      scrollLeft: scroller.scrollLeft,
      scrollTop: scroller.scrollTop,
      maxScrollLeft: scroller.scrollWidth - scroller.clientWidth,
      maxScrollTop: scroller.scrollHeight - scroller.clientHeight,
      viewWidth: scroller.clientWidth,
      viewHeight: scroller.clientHeight,
      viewLeft: view.left,
      viewTop: view.top,
      transform: paper?.style.transform ?? '',
    };
  });
}

/** Punto del papel (px a zoom 1) bajo una posición de pantalla. */
function paperPointAt(m: Measure, client: Point): Point {
  return {
    x: (client.x - m.left - m.stageX) / m.zoom,
    y: (client.y - m.top - m.stageY) / m.zoom,
  };
}

/** Posición de pantalla de un punto del papel con la medida dada. */
function screenOf(m: Measure, p: Point): Point {
  return { x: m.left + m.stageX + p.x * m.zoom, y: m.top + m.stageY + p.y * m.zoom };
}

/**
 * Espera a que el lienzo esté en calma: sin escala provisional pendiente y con
 * el estado (zoom, stage, scroll, rect) sin cambios durante varios frames.
 */
async function settle(): Promise<Measure> {
  await expect.poll(async () => (await measure()).transform, { timeout: 10_000 }).toBe('');
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const read = (): string => {
          const stage = (window as never as Record<string, unknown>)['__rdlcStage'] as {
            scaleX(): number;
            x(): number;
            y(): number;
            container(): HTMLElement;
          };
          const rect = stage.container().getBoundingClientRect();
          const scroller = document.getElementById('lienzo') as HTMLElement;
          return [
            stage.scaleX(),
            stage.x(),
            stage.y(),
            rect.left,
            rect.top,
            scroller.scrollLeft,
            scroller.scrollTop,
            scroller.scrollWidth,
            scroller.scrollHeight,
          ].join('|');
        };
        let last = '';
        let same = 0;
        const start = performance.now();
        const tick = (): void => {
          const current = read();
          same = current === last ? same + 1 : 0;
          last = current;
          if (same >= 10 || performance.now() - start > 5000) resolve();
          else requestAnimationFrame(tick);
        };
        tick();
      }),
  );
  return measure();
}

/** Preset del menú de zoom (200 % → '200 %'). */
async function setZoomPreset(label: string): Promise<void> {
  await page.getByRole('button', { name: /^Zoom:/ }).click();
  await page.getByRole('menuitem', { name: label, exact: true }).click();
  await settle();
}

/** Coloca el scroll del lienzo (px) y espera a que la ventana del stage se actualice. */
async function scrollTo(left: number, top: number): Promise<Measure> {
  await page.evaluate(
    ([l, t]) => {
      const scroller = document.getElementById('lienzo') as HTMLElement;
      scroller.scrollLeft = l as number;
      scroller.scrollTop = t as number;
    },
    [left, top],
  );
  return settle();
}

/**
 * Gesto real: ratón sobre `at`, Ctrl pulsado, `ticks` pasos de rueda. Devuelve la
 * medida previa y la ya confirmada y en calma. Si `expectChange`, espera a que el
 * zoom confirmado difiera del inicial.
 */
async function wheelGesture(
  at: Point,
  ticks: number,
  direction: 'in' | 'out',
  expectChange = true,
): Promise<{ before: Measure; after: Measure }> {
  const before = await measure();
  await page.mouse.move(at.x, at.y);
  await page.keyboard.down('Control');
  try {
    for (let i = 0; i < ticks; i += 1) await page.mouse.wheel(0, direction === 'in' ? -120 : 120);
  } finally {
    await page.keyboard.up('Control');
  }
  if (expectChange) {
    await expect
      .poll(async () => (await measure()).zoom, { timeout: 10_000 })
      .not.toBe(before.zoom);
  }
  const after = await settle();
  return { before, after };
}

/** Deriva (px) del punto de papel `p` respecto a la posición de pantalla `at`. */
function drift(after: Measure, p: Point, at: Point): Point {
  const s = screenOf(after, p);
  return { x: s.x - at.x, y: s.y - at.y };
}

/** Punto de pantalla a una fracción del hueco visible del lienzo. */
function fractionOfView(m: Measure, fx: number, fy: number): Point {
  return { x: m.viewLeft + m.viewWidth * fx, y: m.viewTop + m.viewHeight * fy };
}

function expectAnchored(label: string, d: Point): void {
  console.log(`[zoom-cursor] ${label}: deriva (${d.x.toFixed(2)}, ${d.y.toFixed(2)}) px`);
  expect(Math.abs(d.x), `${label}: deriva X`).toBeLessThanOrEqual(TOLERANCE_PX);
  expect(Math.abs(d.y), `${label}: deriva Y`).toBeLessThanOrEqual(TOLERANCE_PX);
}

/** Deja el lienzo a un zoom con rango de scroll y el scroll a mitad de recorrido. */
async function startAt(label: string): Promise<Measure> {
  await setZoomPreset(label);
  const m = await measure();
  return scrollTo(m.maxScrollLeft / 2, m.maxScrollTop / 2);
}

test('zoom in: el punto bajo el cursor (descentrado) sigue bajo el cursor', async () => {
  const start = await startAt('200 %');
  expect(start.maxScrollTop, 'a 200 % el papel tiene rango de scroll vertical').toBeGreaterThan(
    100,
  );
  const at = fractionOfView(start, 0.25, 0.25);
  const p = paperPointAt(start, at);

  const { before, after } = await wheelGesture(at, 5, 'in');
  expect(after.zoom).toBeCloseTo(Math.min(4, before.zoom * 1.1 ** 5), 2);
  expectAnchored('zoom in 200 % (25 %, 25 %)', drift(after, p, at));

  // (e) La corrección de scroll corrió: el scroll cambió (el cursor no está en
  // el origen del contenido).
  console.log(
    `[zoom-cursor] scroll (${before.scrollLeft.toFixed(1)}, ${before.scrollTop.toFixed(1)}) -> (${after.scrollLeft.toFixed(1)}, ${after.scrollTop.toFixed(1)}); rango máx. X=${after.maxScrollLeft}, Y=${after.maxScrollTop}`,
  );
  expect(Math.abs(after.scrollTop - before.scrollTop), 'scrollTop corregido').toBeGreaterThan(5);
});

test('zoom in sobre un textbox del informe: el textbox sigue bajo el cursor', async () => {
  const start = await startAt('150 %');
  // Primer texto del informe visible en el hueco del lienzo, localizado en el
  // stage de Konva (rect del nodo en el contenedor → pantalla).
  const target = await page.evaluate(
    ([viewLeft, viewTop, viewWidth, viewHeight]) => {
      const stage = (window as never as Record<string, unknown>)['__rdlcStage'] as {
        find(sel: string): {
          getClientRect(): { x: number; y: number; width: number; height: number };
        }[];
        container(): HTMLElement;
      };
      const rect = stage.container().getBoundingClientRect();
      for (const node of stage.find('Text')) {
        const box = node.getClientRect();
        const cx = rect.left + box.x + box.width / 2;
        const cy = rect.top + box.y + box.height / 2;
        if (
          box.width > 12 &&
          box.height > 6 &&
          cx > viewLeft + 60 &&
          cx < viewLeft + viewWidth - 60 &&
          cy > viewTop + 60 &&
          cy < viewTop + viewHeight - 60
        ) {
          return { x: cx, y: cy };
        }
      }
      return null;
    },
    [start.viewLeft, start.viewTop, start.viewWidth, start.viewHeight] as [
      number,
      number,
      number,
      number,
    ],
  );
  expect(target, 'debe haber un texto del informe visible en el hueco').not.toBeNull();
  const at = target as Point;
  const p = paperPointAt(start, at);

  const { after } = await wheelGesture(at, 6, 'in');
  expectAnchored('zoom in 150 % sobre un texto', drift(after, p, at));
});

test('zoom out en otro punto descentrado mantiene el punto bajo el cursor', async () => {
  const start = await startAt('300 %');
  const at = fractionOfView(start, 0.7, 0.4);
  const p = paperPointAt(start, at);

  const { before, after } = await wheelGesture(at, 4, 'out');
  expect(after.zoom).toBeLessThan(before.zoom);
  expect(after.zoom).toBeCloseTo(before.zoom / 1.1 ** 4, 2);
  // De 3 a ~2,05 el papel sigue desbordando el hueco: anclaje exacto.
  expect(after.maxScrollTop).toBeGreaterThan(0);
  expectAnchored('zoom out 300 % (70 %, 40 %)', drift(after, p, at));
});

test('un segundo gesto seguido en otro punto recaptura el ancla', async () => {
  const start = await startAt('200 %');
  const atA = fractionOfView(start, 0.3, 0.3);
  const pA = paperPointAt(start, atA);
  const first = await wheelGesture(atA, 4, 'in');
  expectAnchored('gesto 1 (30 %, 30 %)', drift(first.after, pA, atA));

  // Sin recolocar el scroll: otro punto del hueco, acercando de nuevo.
  const atB = fractionOfView(first.after, 0.75, 0.65);
  const pB = paperPointAt(first.after, atB);
  const second = await wheelGesture(atB, 3, 'in');
  expectAnchored('gesto 2 (75 %, 65 %)', drift(second.after, pB, atB));
  // El ancla del primer gesto ya no manda: ese punto de papel no sigue bajo el
  // primer cursor (si no se recapturara, el segundo gesto lo mantendría ahí).
  const stale = drift(second.after, pA, atA);
  expect(Math.hypot(stale.x, stale.y), 'el ancla vieja no debe persistir').toBeGreaterThan(20);

  // Y un tercero alejando, otra vez en un punto distinto.
  const atC = fractionOfView(second.after, 0.4, 0.55);
  const pC = paperPointAt(second.after, atC);
  const third = await wheelGesture(atC, 2, 'out');
  expectAnchored('gesto 3 (40 %, 55 %)', drift(third.after, pC, atC));
});

test('límites: el zoom se acota a 400 % y 20 % sin errores ni deriva en el tope', async () => {
  // --- Tope superior (400 %): más pasos de los necesarios.
  const start = await startAt('300 %');
  const at = fractionOfView(start, 0.35, 0.3);
  const p = paperPointAt(start, at);
  const up = await wheelGesture(at, 8, 'in');
  expect(up.after.zoom).toBe(4);
  expectAnchored('hasta el tope 400 %', drift(up.after, p, at));

  // Ya en el tope: más pasos no cambian nada (zoom, scroll) ni derivan.
  const again = await wheelGesture(at, 3, 'in', false);
  expect(again.after.zoom).toBe(4);
  expect(again.after.scrollLeft).toBeCloseTo(up.after.scrollLeft, 0);
  expect(again.after.scrollTop).toBeCloseTo(up.after.scrollTop, 0);
  expectAnchored('en el tope 400 % (sin cambio)', drift(again.after, p, at));

  // --- Tope inferior (20 %): el papel cabe en el hueco y se centra, así que el
  // anclaje exacto es imposible; solo se exige el acotado y que no haya errores.
  await setZoomPreset('50 %');
  const mid = await measure();
  const atLow = fractionOfView(mid, 0.5, 0.3);
  const pLow = paperPointAt(mid, atLow);
  const low = await wheelGesture(atLow, 20, 'out');
  expect(low.after.zoom).toBe(0.2);
  console.log(
    `[zoom-cursor] tope 20 % (sin aserción, papel centrado): deriva ${JSON.stringify(drift(low.after, pLow, atLow))}`,
  );
  const lowAgain = await wheelGesture(atLow, 3, 'out', false);
  expect(lowAgain.after.zoom).toBe(0.2);

  // Restablece el zoom inicial de la suite (60 %: 100 % y cuatro pasos de −).
  await page.keyboard.press('Control+0');
  for (let step = 0; step < 4; step += 1) {
    await page.getByRole('button', { name: 'Reducir zoom' }).click();
  }
  await settle();
});
