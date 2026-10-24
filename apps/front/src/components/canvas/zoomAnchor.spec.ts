import { describe, expect, it } from 'vitest';
import { RULER_PX } from './geometry';
import { scrollDeltaToKeepAnchor, zoomAnchorAt } from './zoomAnchor';

/** Zoom anclado al cursor: el punto bajo el puntero no se mueve al confirmar el zoom. */
describe('zoomAnchorAt', () => {
  it('guarda el punto del papel bajo el cursor a zoom 1 (sin contar la regla)', () => {
    const anchor = zoomAnchorAt({ left: 100, top: 50 }, { clientX: 400, clientY: 250 }, 1);
    expect(anchor.x).toBe(400 - 100 - RULER_PX);
    expect(anchor.y).toBe(250 - 50 - RULER_PX);
    expect(anchor.originX).toBe(300);
    expect(anchor.originY).toBe(200);
  });

  it('con zoom, el punto se expresa en px de papel (no de pantalla)', () => {
    const anchor = zoomAnchorAt(
      { left: 0, top: 0 },
      { clientX: RULER_PX + 200, clientY: RULER_PX },
      2,
    );
    expect(anchor.x).toBe(100);
    expect(anchor.y).toBe(0);
  });
});

describe('scrollDeltaToKeepAnchor', () => {
  it('sin cambio de zoom ni de posición no hay que desplazar nada', () => {
    const paper = { left: 100, top: 50 };
    const anchor = zoomAnchorAt(paper, { clientX: 400, clientY: 250 }, 1.5);
    expect(scrollDeltaToKeepAnchor(paper, anchor, 1.5)).toEqual({ dx: 0, dy: 0 });
  });

  it('al ampliar, el punto bajo el cursor se aleja del origen y el scroll lo compensa', () => {
    const paper = { left: 100, top: 50 };
    const anchor = zoomAnchorAt(paper, { clientX: 400, clientY: 250 }, 1);
    // A zoom 2 el papel sigue empezando en el mismo sitio (el scroll no se ha movido):
    // el punto anclado ha pasado de x a 2x, y hay que desplazar justo esa diferencia.
    const { dx, dy } = scrollDeltaToKeepAnchor(paper, anchor, 2);
    expect(dx).toBe(anchor.x);
    expect(dy).toBe(anchor.y);
  });

  it('tras aplicar el desplazamiento el punto queda exactamente bajo el cursor', () => {
    const before = { left: 80, top: 30 };
    const pointer = { clientX: 520, clientY: 310 };
    const anchor = zoomAnchorAt(before, pointer, 1);
    const zoom = 2.5;
    const { dx, dy } = scrollDeltaToKeepAnchor(before, anchor, zoom);
    // Hacer scroll `dx` mueve el papel `-dx` en pantalla.
    const after = { left: before.left - dx, top: before.top - dy };
    expect(after.left + RULER_PX + anchor.x * zoom).toBeCloseTo(pointer.clientX, 9);
    expect(after.top + RULER_PX + anchor.y * zoom).toBeCloseTo(pointer.clientY, 9);
  });

  it('al reducir, el desplazamiento es negativo', () => {
    const paper = { left: 0, top: 0 };
    const anchor = zoomAnchorAt(paper, { clientX: 600, clientY: 400 }, 2);
    const { dx, dy } = scrollDeltaToKeepAnchor(paper, anchor, 1);
    expect(dx).toBeLessThan(0);
    expect(dy).toBeLessThan(0);
  });
});
