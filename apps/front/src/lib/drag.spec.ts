import { describe, expect, it } from 'vitest';
import { computeDragEnd } from './drag';

/** 96 ppp: 1 cm = 37.795 px (mismo factor que el lienzo). */
const PX_PER_CM = 96 / 2.54;

describe('lib/drag · fin de arrastre', () => {
  it('un elemento anidado sigue al ratón (no se fuerza a 0,0)', () => {
    // Caso del bug: textbox que ocupa casi todo su rectángulo, dentro de otro.
    const result = computeDragEnd({
      x: 4 * PX_PER_CM,
      y: 2 * PX_PER_CM,
      itemSize: { width: 7.4 * PX_PER_CM, height: 0.5 * PX_PER_CM },
      bounds: undefined, // anidado: sin límite de contenedor
      snap: true,
      pxPerCm: PX_PER_CM,
      snapCm: 0.1,
    });

    expect(result.left).toBeCloseTo(4, 2);
    expect(result.top).toBeCloseTo(2, 2);
  });

  it('un elemento que llena su contenedor tampoco se fuerza a 0,0', () => {
    const size = { width: 10 * PX_PER_CM, height: 3 * PX_PER_CM };
    const result = computeDragEnd({
      x: 0.5 * PX_PER_CM,
      y: 0.7 * PX_PER_CM,
      itemSize: size,
      bounds: size, // región exactamente del tamaño del item
      snap: false,
      pxPerCm: PX_PER_CM,
      snapCm: 0.1,
    });

    expect(result.left).toBeCloseTo(0.5, 2);
    expect(result.top).toBeCloseTo(0.7, 2);
  });

  it('los items de primer nivel sí se limitan a su región', () => {
    const result = computeDragEnd({
      x: 30 * PX_PER_CM,
      y: 40 * PX_PER_CM,
      itemSize: { width: 5 * PX_PER_CM, height: 1 * PX_PER_CM },
      bounds: { width: 20 * PX_PER_CM, height: 10 * PX_PER_CM },
      snap: false,
      pxPerCm: PX_PER_CM,
      snapCm: 0.1,
    });

    expect(result.left).toBeCloseTo(15, 1);
    expect(result.top).toBeCloseTo(9, 1);
  });

  it('nunca deja coordenadas negativas', () => {
    const result = computeDragEnd({
      x: -3 * PX_PER_CM,
      y: -1 * PX_PER_CM,
      itemSize: { width: 2 * PX_PER_CM, height: 0.5 * PX_PER_CM },
      snap: true,
      pxPerCm: PX_PER_CM,
      snapCm: 0.1,
    });

    expect(result.left).toBe(0);
    expect(result.top).toBe(0);
  });

  it('el imán redondea a 0,1 cm', () => {
    const result = computeDragEnd({
      x: 1.24 * PX_PER_CM,
      y: 2.36 * PX_PER_CM,
      itemSize: { width: PX_PER_CM, height: PX_PER_CM },
      snap: true,
      pxPerCm: PX_PER_CM,
      snapCm: 0.1,
    });

    expect(result.left).toBeCloseTo(1.2, 5);
    expect(result.top).toBeCloseTo(2.4, 5);
  });

  it('el imán no puede sacar al item de su región', () => {
    const result = computeDragEnd({
      x: 19.98 * PX_PER_CM,
      y: 0,
      itemSize: { width: 5 * PX_PER_CM, height: PX_PER_CM },
      bounds: { width: 20 * PX_PER_CM, height: 10 * PX_PER_CM },
      snap: true,
      pxPerCm: PX_PER_CM,
      snapCm: 0.1,
    });

    expect(result.left).toBeCloseTo(15, 5);
  });
});
