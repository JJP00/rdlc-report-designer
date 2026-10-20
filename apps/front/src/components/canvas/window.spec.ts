import { describe, expect, it } from 'vitest';
import {
  canvasWindow,
  fallbackWindow,
  sameWindow,
  WINDOW_FALLBACK_PX,
  WINDOW_MARGIN_PX,
  WINDOW_STEP_PX,
} from './window';

/** A4 en px de papel (96 dpi / 2.54). */
const SHEET = { sheetWidth: (21 * 96) / 2.54, sheetHeight: (29.7 * 96) / 2.54 };
const VIEWPORT = { viewportWidth: 1400, viewportHeight: 900 };

const window = (left: number, top: number, zoom: number) =>
  canvasWindow({ ...SHEET, ...VIEWPORT, left, top, zoom });

describe('canvasWindow', () => {
  it('contiene siempre lo visible (barrido de scroll y zoom)', () => {
    for (const zoom of [0.2, 0.6, 1, 2, 3, 4]) {
      const visibleWidth = VIEWPORT.viewportWidth / zoom;
      const visibleHeight = VIEWPORT.viewportHeight / zoom;
      for (let left = 0; left <= SHEET.sheetWidth; left += 37) {
        for (let top = 0; top <= SHEET.sheetHeight; top += 41) {
          const rect = window(left, top, zoom);
          // Lo visible recortado al papel (fuera del papel no hay nada que pintar).
          const right = Math.min(left + visibleWidth, SHEET.sheetWidth);
          const bottom = Math.min(top + visibleHeight, SHEET.sheetHeight);
          expect(rect.x).toBeLessThanOrEqual(Math.min(left, SHEET.sheetWidth));
          expect(rect.y).toBeLessThanOrEqual(Math.min(top, SHEET.sheetHeight));
          expect(rect.x + rect.width).toBeGreaterThanOrEqual(right);
          expect(rect.y + rect.height).toBeGreaterThanOrEqual(bottom);
        }
      }
    }
  });

  it('cuantiza los dos bordes a pasos (el stage no se redimensiona a cada píxel)', () => {
    // Papel grande (100 cm) para que a zoom 1 el hueco no cubra la página: con
    // zoom 1 los px de papel y de pantalla coinciden y los pasos caen en
    // múltiplos de `WINDOW_STEP_PX`.
    const big = { sheetWidth: (100 * 96) / 2.54, sheetHeight: (100 * 96) / 2.54 };
    const at = (left: number, top: number) =>
      canvasWindow({ ...big, ...VIEWPORT, left, top, zoom: 1 });

    // Dentro de un paso, como mucho un cambio de ventana (los dos bordes se
    // cuantizan por separado).
    const seen = new Set<string>();
    for (let left = 1200; left < 1200 + WINDOW_STEP_PX; left += 1) {
      const rect = at(left, 1500);
      seen.add(`${rect.x}:${rect.y}:${rect.width}:${rect.height}`);
    }
    expect(seen.size).toBeLessThanOrEqual(2);

    // Desplazar el scroll un paso mueve la ventana exactamente un paso (lejos
    // de los bordes del papel, donde la ventana se recorta).
    const limit = big.sheetWidth - VIEWPORT.viewportWidth - 2 * WINDOW_MARGIN_PX - WINDOW_STEP_PX;
    for (let left = 1000; left <= limit; left += 137) {
      const from = at(left, 1500);
      const to = at(left + WINDOW_STEP_PX, 1500);
      expect(to.x - from.x).toBe(WINDOW_STEP_PX);
      expect(to.width).toBe(from.width);
    }
  });

  it('recorta la ventana al papel', () => {
    const rect = window(SHEET.sheetWidth, SHEET.sheetHeight, 4);
    expect(rect.x).toBeGreaterThanOrEqual(0);
    expect(rect.y).toBeGreaterThanOrEqual(0);
    expect(rect.x + rect.width).toBeLessThanOrEqual(SHEET.sheetWidth);
    expect(rect.y + rect.height).toBeLessThanOrEqual(SHEET.sheetHeight);
  });

  it('con el papel entero a la vista, la ventana es el papel', () => {
    const rect = window(0, 0, 0.5);
    expect(rect).toEqual({ x: 0, y: 0, width: SHEET.sheetWidth, height: SHEET.sheetHeight });
  });

  it('acota el coste de memoria (el caso del zoom cercano)', () => {
    // A4 a 400 %: el stage completo serían 3176×4492 px; la ventana, el hueco
    // visible + márgenes.
    const rect = window(1000, 1000, 4);
    const full = SHEET.sheetWidth * 4 * (SHEET.sheetHeight * 4);
    const windowed = rect.width * 4 * (rect.height * 4);
    expect(windowed).toBeLessThan(full * 0.35);
    expect(rect.width * 4).toBeLessThanOrEqual(
      VIEWPORT.viewportWidth + 2 * (WINDOW_STEP_PX + WINDOW_MARGIN_PX),
    );
    expect(rect.height * 4).toBeLessThanOrEqual(
      VIEWPORT.viewportHeight + 2 * (WINDOW_STEP_PX + WINDOW_MARGIN_PX),
    );
  });

  it('sin hueco medido (0×0) no revienta', () => {
    const rect = canvasWindow({
      ...SHEET,
      left: 0,
      top: 0,
      viewportWidth: 0,
      viewportHeight: 0,
      zoom: 1,
    });
    expect(rect.width).toBeGreaterThanOrEqual(0);
    expect(rect.height).toBeGreaterThanOrEqual(0);
  });
});

describe('sameWindow', () => {
  it('compara por valor', () => {
    const rect = { x: 0, y: 0, width: 10, height: 10 };
    expect(sameWindow(rect, { ...rect })).toBe(true);
    expect(sameWindow(rect, { ...rect, x: 1 })).toBe(false);
    expect(sameWindow(null, rect)).toBe(false);
    expect(sameWindow(null, null)).toBe(true);
  });
});

describe('fallbackWindow', () => {
  it('acota el canvas de la primera pasada en px de pantalla', () => {
    // A 400 % un A4 serían 3176×4492 px: la ventana provisional es pequeña.
    const rect = fallbackWindow({ ...SHEET, zoom: 4 });
    expect(rect.x).toBe(0);
    expect(rect.y).toBe(0);
    expect(rect.width * 4).toBeLessThanOrEqual(WINDOW_FALLBACK_PX.width);
    expect(rect.height * 4).toBeLessThanOrEqual(WINDOW_FALLBACK_PX.height);
  });

  it('no agranda el papel', () => {
    // Papel pequeño (10 cm): la ventana provisional no lo infla.
    const small = { sheetWidth: (10 * 96) / 2.54, sheetHeight: (10 * 96) / 2.54 };
    expect(fallbackWindow({ ...small, zoom: 1 })).toEqual({
      x: 0,
      y: 0,
      width: small.sheetWidth,
      height: small.sheetHeight,
    });
  });
});
