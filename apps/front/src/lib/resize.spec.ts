import { describe, expect, it } from 'vitest';
import { computeResize, MIN_SIZE_CM, type BoxCm } from './resize';

/** Redimensionado con tiradores: tamaño mínimo, imán y límites. */

const box: BoxCm = { top: 2, left: 3, width: 5, height: 1 };
const noSnap = { snap: false, snapCm: 0.1 };

describe('computeResize', () => {
  it('la esquina sureste crece ancho y alto', () => {
    const result = computeResize({ handle: 'se', start: box, dxCm: 2, dyCm: 0.5, ...noSnap });
    expect(result).toEqual({ top: 2, left: 3, width: 7, height: 1.5 });
  });

  it('la esquina noroeste mueve el origen además del tamaño', () => {
    const result = computeResize({ handle: 'nw', start: box, dxCm: 1, dyCm: 0.5, ...noSnap });
    expect(result).toEqual({ top: 2.5, left: 4, width: 4, height: 0.5 });
  });

  it('los tiradores de lado solo tocan un eje', () => {
    const east = computeResize({ handle: 'e', start: box, dxCm: -1, dyCm: 9, ...noSnap });
    expect(east).toEqual({ top: 2, left: 3, width: 4, height: 1 });

    const north = computeResize({ handle: 'n', start: box, dxCm: 9, dyCm: 0.25, ...noSnap });
    expect(north).toEqual({ top: 2.25, left: 3, width: 5, height: 0.75 });
  });

  it('no se baja del tamaño mínimo (y ancla el borde opuesto)', () => {
    const result = computeResize({ handle: 'nw', start: box, dxCm: 50, dyCm: 50, ...noSnap });
    expect(result.width).toBe(MIN_SIZE_CM);
    expect(result.height).toBe(MIN_SIZE_CM);
    // La esquina sureste se queda donde estaba.
    expect(result.left).toBeCloseTo(8 - MIN_SIZE_CM, 4);
    expect(result.top).toBeCloseTo(3 - MIN_SIZE_CM, 4);
  });

  it('el imán redondea el tamaño y, si se mueve el origen, también la posición', () => {
    const snapped = computeResize({ handle: 'se', start: box, dxCm: 1.24, dyCm: 0.34, snap: true, snapCm: 0.1 });
    expect(snapped).toEqual({ top: 2, left: 3, width: 6.2, height: 1.3 });

    const west = computeResize({ handle: 'w', start: box, dxCm: -1.24, snap: true, snapCm: 0.1, dyCm: 0 });
    expect(west.left).toBe(1.8);
    expect(west.width).toBe(6.2);
    // El borde este (que no se arrastra) se queda donde estaba.
    expect(west.left + west.width).toBeCloseTo(box.left + box.width, 4);
  });

  it('no deja salir de la región por la derecha ni por abajo', () => {
    const bounds = { width: 10, height: 5 };
    const result = computeResize({
      handle: 'se',
      start: { top: 4, left: 8, width: 2, height: 1 },
      dxCm: 5,
      dyCm: 5,
      bounds,
      ...noSnap,
    });
    expect(result.left + result.width).toBeLessThanOrEqual(bounds.width);
    expect(result.top + result.height).toBeLessThanOrEqual(bounds.height);
  });

  it('arrastrando el borde oeste contra el límite derecho, el ancho se recorta', () => {
    const bounds = { width: 10, height: 5 };
    const result = computeResize({
      handle: 'w',
      start: { top: 0, left: 8, width: 2, height: 1 },
      dxCm: -20,
      dyCm: 0,
      bounds,
      ...noSnap,
    });
    expect(result.left).toBe(0);
    expect(result.width).toBe(10);
  });

  it('sin región (item anidado) no se sale del papel por arriba/izquierda', () => {
    const result = computeResize({ handle: 'nw', start: box, dxCm: -5, dyCm: -5, ...noSnap });
    expect(result.left).toBe(0);
    expect(result.top).toBe(0);
  });
});
