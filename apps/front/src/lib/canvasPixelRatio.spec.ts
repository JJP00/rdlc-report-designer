import { describe, expect, it } from 'vitest';
import { cappedPixelRatio, MAX_CANVAS_PIXEL_RATIO } from './canvasPixelRatio';

describe('cappedPixelRatio', () => {
  it('deja pasar las densidades por debajo del tope', () => {
    expect(cappedPixelRatio(1)).toBe(1);
    expect(cappedPixelRatio(1.25)).toBe(1.25);
    expect(cappedPixelRatio(MAX_CANVAS_PIXEL_RATIO)).toBe(MAX_CANVAS_PIXEL_RATIO);
  });

  it('limita las densidades altas (escalado de Windows 175–200 %)', () => {
    expect(cappedPixelRatio(1.75)).toBe(MAX_CANVAS_PIXEL_RATIO);
    expect(cappedPixelRatio(2)).toBe(MAX_CANVAS_PIXEL_RATIO);
    expect(cappedPixelRatio(3)).toBe(MAX_CANVAS_PIXEL_RATIO);
  });

  it('cae a 1 con valores no válidos', () => {
    expect(cappedPixelRatio(0)).toBe(1);
    expect(cappedPixelRatio(-2)).toBe(1);
    expect(cappedPixelRatio(Number.NaN)).toBe(1);
    expect(cappedPixelRatio(Number.POSITIVE_INFINITY)).toBe(1);
  });
});
