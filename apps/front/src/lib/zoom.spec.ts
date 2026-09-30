import { describe, expect, it } from 'vitest';
import { clampZoom, fitWidthZoom, roundZoom, ZOOM_MAX, ZOOM_MIN, ZOOM_PRESETS } from './zoom';

describe('clampZoom', () => {
  it('acota a los límites del lienzo', () => {
    expect(clampZoom(0.05)).toBe(ZOOM_MIN);
    expect(clampZoom(5)).toBe(ZOOM_MAX);
    expect(clampZoom(0.6)).toBe(0.6);
  });
});

describe('roundZoom', () => {
  it('deja 3 decimales como la rueda', () => {
    expect(roundZoom(0.6000000001)).toBe(0.6);
    expect(roundZoom(0.8282828)).toBe(0.828);
  });
});

describe('fitWidthZoom', () => {
  it('reparte el ancho disponible entre el ancho del papel', () => {
    // 794 px de A4 y 441 px disponibles → 0,555…
    expect(fitWidthZoom(441, 794)).toBe(0.555);
  });

  it('respeta los límites del zoom', () => {
    expect(fitWidthZoom(10, 794)).toBe(ZOOM_MIN);
    expect(fitWidthZoom(5000, 794)).toBe(ZOOM_MAX);
  });

  it('devuelve null sin medidas (aún no hay lienzo montado)', () => {
    expect(fitWidthZoom(0, 794)).toBeNull();
    expect(fitWidthZoom(441, 0)).toBeNull();
    expect(fitWidthZoom(-10, -10)).toBeNull();
  });
});

describe('ZOOM_PRESETS', () => {
  it('no incluye el 100 % (va con «tamaño real») ni valores fuera de rango', () => {
    expect(ZOOM_PRESETS).not.toContain(1);
    for (const preset of ZOOM_PRESETS) {
      expect(preset).toBeGreaterThanOrEqual(ZOOM_MIN);
      expect(preset).toBeLessThanOrEqual(ZOOM_MAX);
    }
  });
});
