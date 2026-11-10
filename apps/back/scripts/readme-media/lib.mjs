/**
 * Utilidades de las capturas y GIF del README (ver `../readme-media.mjs`).
 *
 * - `launch`: la app real (build `--mode e2e`) con **copias** del corpus, a W×H,
 *   con un cursor dibujado (el ratón de Playwright no se ve en las capturas), un
 *   rótulo de teclas y la ruta temporal enmascarada en todo momento.
 * - `record`: graba con el screencast de Chromium (un PNG por cambio, con su
 *   hora), remuestrea a 25 fps como máximo y codifica el GIF con ffmpeg.
 * - Gestos (`moveTo`, `click`, `clickLocator`, `clickItem`, `press`, `type`):
 *   mueven el cursor suavemente para que el GIF se pueda seguir.
 */
import { _electron as electron } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const mainEntry = join(here, '..', '..', 'out', 'main', 'main.js');
const corpus = join(here, '..', '..', '..', '..', 'fixtures', 'corpus');

export const W = 1440;
export const H = 900;
export const INVOICE = 'SalesInvoiceESP.rdlc';
export const THREE_TABS = [INVOICE, 'SalesShipment.rdlc', 'BTCLoadingOrder.rdlc'];
/** Ms entre teclas al escribir. */
export const TYPE_DELAY = 90;
/** Ms que el GIF se queda en el último fotograma antes de repetir. */
export const HOLD_MS = 2000;
/** Intervalo mínimo entre fotogramas del GIF (25 fps). */
const FRAME_S = 0.04;

/** Lanza la app con copias de `files` (la primera activa) a W×H. */
export async function launch(files, outDir) {
  const workspace = join(
    tmpdir(),
    `rdlc-readme-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  );
  const reports = join(workspace, 'reports');
  mkdirSync(reports, { recursive: true });
  const paths = files.map((name) => {
    const target = join(reports, name);
    copyFileSync(join(corpus, name), target);
    return target;
  });
  const app = await electron.launch({
    args: [mainEntry, paths[0], `--user-data-dir=${join(workspace, 'user-data')}`],
    env: { ...process.env, RDLC_LOCALE: 'en' },
  });
  const page = await app.firstWindow();
  await app.evaluate(
    ({ BrowserWindow }, size) => {
      const win = BrowserWindow.getAllWindows()[0];
      win.unmaximize();
      win.setContentSize(size.w, size.h);
      win.center();
    },
    { w: W, h: H },
  );
  await page.waitForFunction(() => Boolean(window.__rdlcStage && window.__rdlcProjection));
  await installPathMask(page, reports);
  await installOverlay(page);
  await page.waitForTimeout(1200);
  const ctx = { app, page, reports, paths, outDir, cursor: { x: W / 2, y: H / 2 + 120 } };
  for (const extra of paths.slice(1)) await openViaToolbar(ctx, extra);
  if (paths.length > 1) {
    await page.getByTestId('tab-item').first().click();
    await page.waitForTimeout(800);
  }
  return ctx;
}

/** Abre una ruta en otra pestaña por Fichero → Abrir… (diálogo nativo sustituido). */
async function openViaToolbar(ctx, path) {
  await ctx.app.evaluate(({ dialog }, p) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [p] });
  }, path);
  await ctx.page.getByRole('button', { name: 'File' }).click();
  await ctx.page.getByRole('menuitem', { name: 'Open…' }).click();
  await ctx.page.waitForTimeout(1200);
}

/**
 * Cierra sin preguntar: con cambios sin guardar `app.close()` se queda esperando
 * al diálogo de la app; `app.exit()` de Electron sale sin pasar por él.
 */
export async function close(ctx) {
  await ctx.app.evaluate(({ app }) => app.exit(0)).catch(() => undefined);
  await ctx.app.close().catch(() => undefined);
}

/**
 * Sustituye la ruta temporal de los informes por `C:\reports` en textos y
 * `title`, ahora y en cada cambio del DOM (antes de pintar: el observador corre
 * como microtarea). La ruta lleva el usuario de la máquina.
 */
async function installPathMask(page, prefix) {
  await page.evaluate((reportsDir) => {
    const variants = [reportsDir, reportsDir.replace(/\\/g, '/')];
    const has = (text) => typeof text === 'string' && variants.some((v) => text.includes(v));
    const fix = (text) => variants.reduce((acc, v) => acc.split(v).join('C:\\reports'), text);
    const fixText = (node) => {
      if (has(node.nodeValue)) node.nodeValue = fix(node.nodeValue);
    };
    const fixTitle = (element) => {
      const title = element.getAttribute?.('title');
      if (has(title)) element.setAttribute('title', fix(title));
    };
    const scrub = (root) => {
      if (root.nodeType === Node.TEXT_NODE) return fixText(root);
      if (root.nodeType !== Node.ELEMENT_NODE) return;
      fixTitle(root);
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) fixText(node);
      for (const element of root.querySelectorAll('[title]')) fixTitle(element);
    };
    scrub(document.body);
    new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === 'characterData') fixText(record.target);
        else if (record.type === 'attributes') fixTitle(record.target);
        else for (const node of record.addedNodes) scrub(node);
      }
    }).observe(document.documentElement, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['title'],
    });
  }, prefix);
}

/**
 * Capa por encima de todo (fuera de `body`, sin eventos): un cursor que sigue
 * al ratón, una onda en cada clic y el rótulo de teclas (`window.__readmeKeys`).
 */
async function installOverlay(page) {
  await page.evaluate(() => {
    if (document.getElementById('__readme-overlay')) return;
    const root = document.createElement('div');
    root.id = '__readme-overlay';
    root.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647;';
    root.innerHTML = `
      <div data-cursor style="position:absolute;left:0;top:0;width:24px;height:24px;display:none;will-change:transform;transition:scale 80ms;transform-origin:4px 2px">
        <svg width="24" height="24" viewBox="0 0 24 24" style="filter:drop-shadow(0 1px 1.5px rgb(0 0 0 / .35))">
          <path d="M4 2 L4 19.5 L8.6 15.2 L11.6 21.8 L14.4 20.6 L11.4 14 L17.6 14 Z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/>
        </svg>
      </div>
      <div data-keys style="position:absolute;left:0;top:0;display:flex;gap:6px;align-items:center;padding:8px 12px;border-radius:12px;background:rgb(17 17 17 / .82);color:#fff;font:600 16px/1 system-ui,sans-serif;transform:translate(-50%,-100%);opacity:0;transition:opacity 180ms"></div>`;
    document.documentElement.appendChild(root);
    const cursor = root.querySelector('[data-cursor]');
    const keys = root.querySelector('[data-keys]');
    let visible = true;
    let pointer = true;
    const place = (event) => {
      cursor.style.transform = `translate(${event.clientX - 4}px, ${event.clientY - 2}px)`;
      cursor.style.display = visible && pointer ? 'block' : 'none';
    };
    window.__readmeCursor = (show) => {
      pointer = show;
      if (!show) cursor.style.display = 'none';
    };
    window.addEventListener('pointermove', place, true);
    window.addEventListener(
      'pointerdown',
      (event) => {
        place(event);
        cursor.style.scale = '0.86';
        const ring = document.createElement('div');
        ring.style.cssText = `position:absolute;left:${event.clientX - 18}px;top:${event.clientY - 18}px;width:36px;height:36px;border-radius:50%;background:rgb(59 130 246 / .35);border:2px solid rgb(59 130 246 / .9)`;
        root.insertBefore(ring, cursor);
        ring
          .animate(
            [
              { transform: 'scale(.3)', opacity: 1 },
              { transform: 'scale(1.3)', opacity: 0 },
            ],
            { duration: 450, easing: 'ease-out' },
          )
          .finished.then(() => ring.remove());
      },
      true,
    );
    window.addEventListener('pointerup', () => (cursor.style.scale = '1'), true);

    let anchor = { x: window.innerWidth / 2, y: window.innerHeight - 40 };
    let hideTimer = 0;
    window.__readmeKeysAnchor = (next) => (anchor = next);
    window.__readmeKeys = (label) => {
      keys.replaceChildren(
        ...label.split('+').map((part) => {
          const kbd = document.createElement('kbd');
          kbd.textContent = part.trim();
          kbd.style.cssText =
            'padding:4px 8px;border-radius:6px;background:rgb(255 255 255 / .16);border:1px solid rgb(255 255 255 / .28);font:inherit';
          return kbd;
        }),
      );
      keys.style.left = `${anchor.x}px`;
      keys.style.top = `${anchor.y}px`;
      keys.style.opacity = '1';
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => (keys.style.opacity = '0'), 1100);
    };
    window.__readmeKeysHide = () => {
      clearTimeout(hideTimer);
      keys.style.opacity = '0';
    };
    window.__readmeOverlay = (show) => {
      visible = show;
      if (!show) cursor.style.display = 'none';
      root.style.visibility = show ? 'visible' : 'hidden';
    };
  });
}

// ─── Gestos ──────────────────────────────────────────────────────────────────

export const pause = (ctx, ms) => ctx.page.waitForTimeout(ms);

/** Enseña u oculta el cursor dibujado (aparece al siguiente movimiento). */
export async function setCursor(ctx, show) {
  await ctx.page.evaluate((value) => window.__readmeCursor(value), show);
}

const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/** Lleva el cursor a (x, y) con una curva suave (`duration` ms). */
export async function moveTo(ctx, x, y, { duration = 450 } = {}) {
  const from = ctx.cursor;
  const steps = Math.max(6, Math.round(duration / 16));
  for (let i = 1; i <= steps; i++) {
    const e = easeInOut(i / steps);
    await ctx.page.mouse.move(from.x + (x - from.x) * e, from.y + (y - from.y) * e);
    await ctx.page.waitForTimeout(duration / steps / 2);
  }
  ctx.cursor = { x, y };
}

/** Mueve el cursor a (x, y) y hace clic (`count: 2` = doble clic). */
export async function click(ctx, x, y, { duration, count = 1 } = {}) {
  await moveTo(ctx, x, y, { duration });
  await ctx.page.waitForTimeout(140);
  if (count === 2) await ctx.page.mouse.dblclick(x, y);
  else {
    await ctx.page.mouse.down();
    await ctx.page.waitForTimeout(70);
    await ctx.page.mouse.up();
  }
  await ctx.page.waitForTimeout(250);
}

/** Clic (moviendo el cursor) en un punto de un locator de Playwright (`fx`, `fy` ∈ 0..1). */
export async function clickLocator(ctx, locator, { fx = 0.5, fy = 0.5, ...options } = {}) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) throw new Error('el locator no está visible');
  await click(ctx, box.x + box.width * fx, box.y + box.height * fy, options);
}

/** Rectángulo de pantalla de un nodo Konva por id (`null` si no está). */
export async function nodeRect(page, id) {
  return page.evaluate((nodeId) => {
    const stage = window.__rdlcStage;
    const node = stage.findOne((candidate) => candidate.id() === nodeId);
    if (!node) return null;
    const box = node.getClientRect({ relativeTo: stage });
    const container = stage.container().getBoundingClientRect();
    const zoom = stage.scaleX();
    return {
      x: container.left + stage.x() + box.x * zoom,
      y: container.top + stage.y() + box.y * zoom,
      width: box.width * zoom,
      height: box.height * zoom,
    };
  }, id);
}

/** Clic (moviendo el cursor) en un item del lienzo. */
export async function clickItem(ctx, id, { fx = 0.5, ...options } = {}) {
  const rect = await nodeRect(ctx.page, id);
  if (!rect) throw new Error(`no hay nodo ${id} en el lienzo`);
  await click(ctx, rect.x + rect.width * fx, rect.y + rect.height / 2, options);
}

/** `Control+k` → `Ctrl + K`. */
function keyLabel(key) {
  const names = { Control: 'Ctrl', Meta: 'Win', ArrowDown: '↓', ArrowUp: '↑', Enter: 'Enter' };
  return key
    .split('+')
    .map((part) => names[part] ?? (part.length === 1 ? part.toUpperCase() : part))
    .join(' + ');
}

/**
 * Pulsa una tecla. Con `show` (por defecto en atajos con modificador) la
 * enseña en el rótulo; `show: 'texto'` enseña ese texto.
 */
export async function press(ctx, key, { show = /[+]/.test(key), after = 250 } = {}) {
  if (show) {
    await ctx.page.evaluate(
      (label) => window.__readmeKeys(label),
      typeof show === 'string' ? show : keyLabel(key),
    );
    await ctx.page.waitForTimeout(250);
  }
  await ctx.page.keyboard.press(key);
  await ctx.page.waitForTimeout(after);
}

/** Escribe como una persona (`TYPE_DELAY` ms por tecla). */
export async function type(ctx, text, { delay = TYPE_DELAY } = {}) {
  await ctx.page.keyboard.type(text, { delay });
}

// ─── Capturas ────────────────────────────────────────────────────────────────

/** Recorte que envuelve varias cajas con un margen, sin salirse de la ventana. */
export function around(boxes, pad) {
  const x0 = Math.max(0, Math.min(...boxes.map((box) => box.x)) - pad);
  const y0 = Math.max(0, Math.min(...boxes.map((box) => box.y)) - pad);
  const x1 = Math.min(W, Math.max(...boxes.map((box) => box.x + box.width)) + pad);
  const y1 = Math.min(H, Math.max(...boxes.map((box) => box.y + box.height)) + pad);
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

/** PNG estático (sin cursor ni rótulo). */
export async function shot(ctx, name, clip) {
  await ctx.page.evaluate(() => window.__readmeOverlay(false));
  await ctx.page.waitForTimeout(150);
  await ctx.page.screenshot({ path: join(ctx.outDir, `${name}.png`), ...(clip ? { clip } : {}) });
  await ctx.page.evaluate(() => window.__readmeOverlay(true));
}

/**
 * Graba `fn` y guarda `<name>.gif` recortado a `clip` (px de ventana) y escalado
 * a `width` (por defecto el ancho del recorte, como mucho 960). El rótulo de
 * teclas se coloca abajo en el centro del recorte (o en `keysAt`). El cursor
 * empieza en `cursorAt` (o donde quedó); `cursor: false` lo oculta en escenas
 * solo de teclado (`setCursor(ctx, true)` lo vuelve a enseñar a mitad).
 */
export async function record(
  ctx,
  name,
  clip,
  fn,
  { width, hold = HOLD_MS, lead = 600, keysAt, cursor = true, cursorAt } = {},
) {
  const { page } = ctx;
  const area = normalizeClip(clip);
  await page.evaluate(
    (anchor) => window.__readmeKeysAnchor(anchor),
    keysAt ?? { x: area.x + area.width / 2, y: area.y + area.height - 24 },
  );
  await page.evaluate(() => window.__readmeOverlay(true));
  await setCursor(ctx, cursor);
  if (cursorAt) ctx.cursor = { ...cursorAt };
  await page.mouse.move(ctx.cursor.x, ctx.cursor.y);

  const cdp = await page.context().newCDPSession(page);
  const frames = [];
  cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
    frames.push({ t: metadata.timestamp, data });
    cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => undefined);
  });
  await cdp.send('Page.startScreencast', { format: 'png', everyNthFrame: 1 });
  await page.waitForTimeout(lead);
  await fn();
  // El último fotograma se repite `hold` ms: sin rótulo a medio desvanecer.
  await page.evaluate(() => window.__readmeKeysHide());
  await page.waitForTimeout(500);
  await cdp.send('Page.stopScreencast');
  await cdp.detach().catch(() => undefined);
  if (frames.length === 0) throw new Error('el screencast no envió fotogramas');

  const out = join(ctx.outDir, `${name}.gif`);
  encodeGif(frames, out, area, width ?? Math.min(960, area.width), hold);
  const size = statSync(out).size;
  console.log(
    `     ${name}.gif ${(size / 1024 / 1024).toFixed(2)} MB, ${frames.length} fotogramas`,
  );
  if (size > 8 * 1024 * 1024) console.log(`     ⚠ ${name}.gif pasa de 8 MB (GitHub corta en 10)`);
}

function normalizeClip(clip) {
  const x = Math.max(0, Math.round(clip.x));
  const y = Math.max(0, Math.round(clip.y));
  const even = (n) => n - (n % 2);
  return {
    x,
    y,
    width: even(Math.min(W - x, Math.round(clip.width))),
    height: even(Math.min(H - y, Math.round(clip.height))),
  };
}

/**
 * Remuestrea a una rejilla de 40 ms (en cada hueco, el último fotograma
 * recibido), junta los huecos iguales en un fotograma más largo y pasa la lista
 * a ffmpeg (concat con duraciones → recorte → escala → paleta propia → GIF).
 */
function encodeGif(frames, out, clip, width, hold) {
  const dir = mkdtempSync(join(tmpdir(), 'rdlc-gif-'));
  try {
    const t0 = frames[0].t;
    const end = frames.at(-1).t;
    const slots = [];
    for (let i = 0, k = 0; k * FRAME_S <= end - t0 + 1e-6; k++) {
      while (i + 1 < frames.length && frames[i + 1].t - t0 <= k * FRAME_S + 1e-6) i++;
      if (slots.at(-1)?.index === i) slots.at(-1).duration += FRAME_S;
      else slots.push({ index: i, duration: FRAME_S });
    }
    slots.at(-1).duration += hold / 1000;

    // Fotogramas en px de dispositivo: el recorte se escala con ellos.
    const first = Buffer.from(frames[0].data, 'base64');
    const scale = first.readUInt32BE(16) / W;
    const lines = [];
    for (const [n, slot] of slots.entries()) {
      const file = `f${String(n).padStart(5, '0')}.png`;
      writeFileSync(join(dir, file), Buffer.from(frames[slot.index].data, 'base64'));
      lines.push(`file '${file}'`, `duration ${slot.duration.toFixed(3)}`);
    }
    lines.push(lines.at(-2)); // concat: la última duración solo cuenta si se repite el fichero
    writeFileSync(join(dir, 'list.txt'), `${lines.join('\n')}\n`);

    const crop = [clip.width, clip.height, clip.x, clip.y]
      .map((n) => Math.round(n * scale))
      .join(':');
    const filter =
      `crop=${crop},scale=${width}:-2:flags=lanczos,split[a][b];` +
      '[a]palettegen=max_colors=256:stats_mode=full[p];' +
      '[b][p]paletteuse=dither=none:diff_mode=rectangle';
    const result = spawnSync(
      'ffmpeg',
      [
        '-y',
        '-v',
        'error',
        '-f',
        'concat',
        '-safe',
        '0',
        '-i',
        'list.txt',
        '-filter_complex',
        filter,
        '-fps_mode',
        'passthrough',
        '-loop',
        '0',
        out,
      ],
      { cwd: dir, encoding: 'utf8' },
    );
    if (result.error)
      throw new Error(`no se pudo lanzar ffmpeg (¿está en el PATH?): ${result.error.message}`);
    if (result.status !== 0) throw new Error(`ffmpeg falló: ${result.stderr}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
