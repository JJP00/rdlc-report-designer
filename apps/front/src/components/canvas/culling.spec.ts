import { describe, expect, it } from 'vitest';
import type { ProjectionDto, RectangleDto, TablixDto, TextboxDto } from '@rdlc-designer/contracts';
import { CULL_MIN_ITEMS, countProjectionItems, intersectsBox, itemExtent } from './culling';

const textbox = (
  id: string,
  top: number,
  left: number,
  width: number,
  height: number,
): TextboxDto => ({
  kind: 'textbox',
  id,
  top: { value: top, unit: 'cm' },
  left: { value: left, unit: 'cm' },
  width: { value: width, unit: 'cm' },
  height: { value: height, unit: 'cm' },
  paragraphs: [{ runs: [{ value: 'x' }] }],
});

describe('intersectsBox', () => {
  const window = { x: 100, y: 100, width: 200, height: 200 };

  it('detecta el solape', () => {
    expect(intersectsBox({ x: 150, y: 150, width: 10, height: 10 }, window)).toBe(true);
    expect(intersectsBox({ x: 0, y: 0, width: 150, height: 150 }, window)).toBe(true);
  });

  it('no cuenta el borde compartido ni lo que queda fuera', () => {
    expect(intersectsBox({ x: 300, y: 100, width: 50, height: 50 }, window)).toBe(false);
    expect(intersectsBox({ x: 0, y: 0, width: 100, height: 100 }, window)).toBe(false);
    expect(intersectsBox({ x: 0, y: 0, width: 50, height: 50 }, window)).toBe(false);
  });
});

describe('itemExtent', () => {
  it('usa la caja del item en px de papel', () => {
    // 37.795 px/cm
    const box = itemExtent(textbox('t', 1, 2, 3, 4), 0, 0);
    expect(box.x).toBeCloseTo(75.59, 1);
    expect(box.y).toBeCloseTo(37.8, 1);
    expect(box.width).toBeCloseTo(113.39, 1);
    expect(box.height).toBeCloseTo(151.18, 1);
  });

  it('une la caja de los hijos de un rectángulo (no lo recorta)', () => {
    const rectangle: RectangleDto = {
      kind: 'rectangle',
      id: 'r',
      top: { value: 0, unit: 'cm' },
      left: { value: 0, unit: 'cm' },
      width: { value: 2, unit: 'cm' },
      height: { value: 2, unit: 'cm' },
      children: [textbox('hijo', 3, 4, 1, 1)],
    };
    const box = itemExtent(rectangle, 0, 0);
    expect(box.width).toBeGreaterThan(2 * 37.79);
    expect(box.height).toBeGreaterThan(3 * 37.79);
  });

  it('suma el origen del contenedor', () => {
    const box = itemExtent(textbox('t', 1, 1, 1, 1), 100, 50);
    expect(box.x).toBeCloseTo(100 + 37.8, 1);
    expect(box.y).toBeCloseTo(50 + 37.8, 1);
  });

  it('un Tablix usa su tamaño total (cabeceras incluidas)', () => {
    const tablix: TablixDto = {
      kind: 'tablix',
      id: 'tablix',
      top: { value: 0, unit: 'cm' },
      left: { value: 0, unit: 'cm' },
      width: { value: 0, unit: 'cm' },
      height: { value: 0, unit: 'cm' },
      body: {
        columns: [{ value: 4, unit: 'cm' }],
        rows: [{ height: { value: 1, unit: 'cm' }, cells: [{ content: null }] }],
      },
      rowHierarchy: [],
      columnHierarchy: [],
      headers: {
        offset: { top: { value: 0.8, unit: 'cm' }, left: { value: 0.5, unit: 'cm' } },
        rows: [{ size: { value: 0.5, unit: 'cm' }, cells: [null] }],
        columns: [{ size: { value: 0.8, unit: 'cm' }, cells: [null] }],
        corner: [],
      },
    };
    const box = itemExtent(tablix, 0, 0);
    expect(box.width).toBeCloseTo(4.5 * 37.79, 1);
    expect(box.height).toBeCloseTo(1.8 * 37.79, 1);
  });
});

describe('countProjectionItems', () => {
  it('cuenta bands, rectángulos anidados y celdas', () => {
    const projection = {
      sessionId: 's',
      version: 1,
      reportName: 'x',
      meta: { code: { text: '', functions: [] }, fields: [], parameters: [] },
      page: {
        width: { value: 21, unit: 'cm' },
        height: { value: 29.7, unit: 'cm' },
        margins: {
          top: { value: 0, unit: 'cm' },
          bottom: { value: 0, unit: 'cm' },
          left: { value: 0, unit: 'cm' },
          right: { value: 0, unit: 'cm' },
        },
        header: {
          width: { value: 21, unit: 'cm' },
          height: { value: 0, unit: 'cm' },
          items: [textbox('h', 0, 0, 1, 1)],
        },
        body: {
          width: { value: 21, unit: 'cm' },
          height: { value: 10, unit: 'cm' },
          items: [
            {
              kind: 'rectangle',
              id: 'r',
              top: { value: 0, unit: 'cm' },
              left: { value: 0, unit: 'cm' },
              width: { value: 5, unit: 'cm' },
              height: { value: 5, unit: 'cm' },
              children: [textbox('t1', 0, 0, 1, 1), textbox('t2', 1, 0, 1, 1)],
            } satisfies RectangleDto,
          ],
        },
        footer: { width: { value: 21, unit: 'cm' }, height: { value: 0, unit: 'cm' }, items: [] },
      },
    } as ProjectionDto;

    // 1 (encabezado) + 1 (rectángulo) + 2 (hijos) = 4
    expect(countProjectionItems(projection)).toBe(4);
    expect(CULL_MIN_ITEMS).toBeGreaterThan(4);
  });
});
