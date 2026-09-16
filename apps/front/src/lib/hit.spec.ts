import type { ItemDto, RectangleDto, TablixDto, TextboxDto } from '@rdlc-designer/contracts';
import { describe, expect, it } from 'vitest';
import { hitTestItems } from './hit';

/** Hit-test del lienzo: item de arriba + contenedor donde insertar. */

function box(
  id: string,
  leftCm: number,
  topCm: number,
  widthCm: number,
  heightCm: number,
): TextboxDto {
  return {
    kind: 'textbox',
    id,
    top: { value: topCm, unit: 'cm' },
    left: { value: leftCm, unit: 'cm' },
    width: { value: widthCm, unit: 'cm' },
    height: { value: heightCm, unit: 'cm' },
    paragraphs: [{ runs: [{ value: id }] }],
  };
}

const fallback = { kind: 'body' } as const;

describe('hitTestItems', () => {
  it('sin items devuelve el contenedor con índice 0', () => {
    expect(hitTestItems([], { x: 1, y: 1 }, fallback)).toEqual({
      scope: fallback,
      index: 0,
      point: { x: 1, y: 1 },
    });
  });

  it('punto en vacío: inserta al final del contenedor', () => {
    const items = [box('A', 0, 0, 2, 2), box('B', 5, 5, 2, 2)];
    expect(hitTestItems(items, { x: 10, y: 10 }, fallback)).toEqual({
      scope: fallback,
      index: 2,
      point: { x: 10, y: 10 },
    });
  });

  it('devuelve el item de encima y el contenedor de inserción', () => {
    const items = [box('Fondo', 0, 0, 10, 10), box('Encima', 2, 2, 4, 4)];
    const hit = hitTestItems(items, { x: 3, y: 3 }, fallback);
    expect(hit.item?.id).toBe('Encima');
    expect(hit.scope).toEqual(fallback);
    expect(hit.index).toBe(2);
  });

  it('dentro de un rectángulo: el scope es el rectángulo (el más interno)', () => {
    const inner: TextboxDto = box('Dentro', 1, 1, 2, 2);
    const outer: RectangleDto = {
      kind: 'rectangle',
      id: 'Externo',
      top: { value: 0, unit: 'cm' },
      left: { value: 0, unit: 'cm' },
      width: { value: 10, unit: 'cm' },
      height: { value: 10, unit: 'cm' },
      children: [
        {
          kind: 'rectangle',
          id: 'Interno',
          top: { value: 2, unit: 'cm' },
          left: { value: 2, unit: 'cm' },
          width: { value: 6, unit: 'cm' },
          height: { value: 6, unit: 'cm' },
          children: [inner],
        },
      ],
    };

    const hit = hitTestItems([outer], { x: 3, y: 3 }, fallback);
    expect(hit.item?.id).toBe('Dentro');
    expect(hit.scope).toEqual({ kind: 'rectangle', id: 'Interno' });
    expect(hit.index).toBe(1);
    // El punto llega en coordenadas del contenedor de inserción.
    expect(hit.point).toEqual({ x: 1, y: 1 });
  });

  it('dentro de un rectángulo vacío: se inserta en él', () => {
    const rectangle: RectangleDto = {
      kind: 'rectangle',
      id: 'Rect',
      top: { value: 1, unit: 'cm' },
      left: { value: 1, unit: 'cm' },
      width: { value: 4, unit: 'cm' },
      height: { value: 4, unit: 'cm' },
      children: [],
    };

    const hit = hitTestItems([rectangle], { x: 2, y: 2 }, fallback);
    expect(hit.item?.id).toBe('Rect');
    expect(hit.scope).toEqual({ kind: 'rectangle', id: 'Rect' });
    expect(hit.index).toBe(0);
  });

  it('un tablix tapa el punto pero no cambia el contenedor de inserción', () => {
    const tablix: TablixDto = {
      kind: 'tablix',
      id: 'Tablix1',
      top: { value: 0, unit: 'cm' },
      left: { value: 0, unit: 'cm' },
      width: { value: 8, unit: 'cm' },
      height: { value: 4, unit: 'cm' },
      body: { columns: [], rows: [] },
      rowHierarchy: [],
      columnHierarchy: [],
    };

    const hit = hitTestItems([tablix], { x: 1, y: 1 }, fallback);
    expect(hit.item?.id).toBe('Tablix1');
    expect(hit.scope).toEqual(fallback);
  });

  it('un item anidado gana en el hit aunque el rectángulo esté detrás', () => {
    const nested = box('Anidado', 0, 0, 5, 5);
    const rectangle: RectangleDto = {
      kind: 'rectangle',
      id: 'Rect',
      top: { value: 0, unit: 'cm' },
      left: { value: 0, unit: 'cm' },
      width: { value: 5, unit: 'cm' },
      height: { value: 5, unit: 'cm' },
      children: [nested],
    };
    // Item suelto encima del rectángulo (último en el array = encima).
    const onTop: ItemDto = box('Suelto', 1, 1, 2, 2);

    const hit = hitTestItems([rectangle, onTop], { x: 1.5, y: 1.5 }, fallback);
    expect(hit.item?.id).toBe('Suelto');
    expect(hit.scope).toEqual(fallback);
  });
});
