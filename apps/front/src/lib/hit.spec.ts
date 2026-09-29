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
  zIndex?: number,
): TextboxDto {
  return {
    kind: 'textbox',
    id,
    top: { value: topCm, unit: 'cm' },
    left: { value: leftCm, unit: 'cm' },
    width: { value: widthCm, unit: 'cm' },
    height: { value: heightCm, unit: 'cm' },
    paragraphs: [{ runs: [{ value: id }] }],
    ...(zIndex !== undefined ? { zIndex } : {}),
  };
}

const fallback = { kind: 'body' } as const;

/**
 * Tablix con cabecera de columna ocupada (Textbox73), cabecera de fila vacía y
 * esquina vacía: los tres huecos de G8.
 */
function tablixWithHeaders(): TablixDto {
  return {
    kind: 'tablix',
    id: 'T7',
    top: { value: 0, unit: 'cm' },
    left: { value: 0, unit: 'cm' },
    width: { value: 4, unit: 'cm' },
    height: { value: 2, unit: 'cm' },
    body: {
      columns: [{ value: 4, unit: 'cm' }],
      rows: [{ height: { value: 2, unit: 'cm' }, cells: [{ content: null }] }],
    },
    rowHierarchy: [],
    columnHierarchy: [],
    headers: {
      offset: { top: { value: 0.6, unit: 'cm' }, left: { value: 0.5, unit: 'cm' } },
      columns: [
        {
          size: { value: 0.6, unit: 'cm' },
          cells: [{ ...box('Textbox73', 0.5, 0, 4, 0.6) }],
          members: [{ path: [0], start: 0, span: 1 }],
        },
      ],
      rows: [
        {
          size: { value: 0.5, unit: 'cm' },
          cells: [null],
          members: [{ path: [0], start: 0, span: 1 }],
        },
      ],
      corner: [[null]],
    },
  };
}

describe('hitTestItems', () => {
  it('a igualdad de ZIndex, el último hermano del XML gana el hit', () => {
    const items = [box('Fondo', 0, 0, 5, 5), box('Encima', 0, 0, 5, 5)];
    expect(hitTestItems(items, { x: 1, y: 1 }, fallback).item?.id).toBe('Encima');
  });

  it('el ZIndex manda sobre el orden del XML (el que está encima gana)', () => {
    // `Alto` va primero en el XML pero con ZIndex mayor: se pinta y se golpea él.
    const items = [box('Alto', 0, 0, 5, 5, 10), box('Bajo', 0, 0, 5, 5, 1)];

    expect(hitTestItems(items, { x: 1, y: 1 }, fallback).item?.id).toBe('Alto');

    const reversed = [box('Bajo', 0, 0, 5, 5, 1), box('Alto', 0, 0, 5, 5, 10)];
    expect(hitTestItems(reversed, { x: 1, y: 1 }, fallback).item?.id).toBe('Alto');
  });

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

  it('un Tablix resuelve el hit por celdas: celda vacía selecciona la celda', () => {
    const tablix: TablixDto = {
      kind: 'tablix',
      id: 'Tablix1',
      top: { value: 0, unit: 'cm' },
      left: { value: 0, unit: 'cm' },
      width: { value: 8, unit: 'cm' },
      height: { value: 2, unit: 'cm' },
      body: {
        columns: [
          { value: 4, unit: 'cm' },
          { value: 4, unit: 'cm' },
        ],
        rows: [{ height: { value: 2, unit: 'cm' }, cells: [{ content: null }, { content: null }] }],
      },
      rowHierarchy: [],
      columnHierarchy: [],
    };

    const hit = hitTestItems([tablix], { x: 5, y: 1 }, fallback);
    expect(hit.item).toBeUndefined();
    expect(hit.scope).toEqual({ kind: 'tablixCell', id: 'Tablix1', row: 0, col: 1 });
    expect(hit.cells).toEqual([{ id: 'Tablix1', row: 0, col: 1 }]);
    expect(hit.index).toBe(0);
    // El punto llega en coordenadas de la celda.
    expect(hit.point).toEqual({ x: 1, y: 1 });
  });

  it('el contenido de una celda gana el hit y hereda la celda como contenedor', () => {
    const tablix: TablixDto = {
      kind: 'tablix',
      id: 'Tablix1',
      top: { value: 0, unit: 'cm' },
      left: { value: 0, unit: 'cm' },
      width: { value: 8, unit: 'cm' },
      height: { value: 2, unit: 'cm' },
      body: {
        columns: [
          { value: 4, unit: 'cm' },
          { value: 4, unit: 'cm' },
        ],
        rows: [
          {
            height: { value: 2, unit: 'cm' },
            cells: [{ content: box('Dentro', 1, 0.5, 2, 1) }, { content: null }],
          },
        ],
      },
      rowHierarchy: [],
      columnHierarchy: [],
    };

    const hit = hitTestItems([tablix], { x: 2, y: 1 }, fallback);
    expect(hit.item?.id).toBe('Dentro');
    expect(hit.scope).toEqual({ kind: 'tablixCell', id: 'Tablix1', row: 0, col: 0 });
    expect(hit.cells).toEqual([{ id: 'Tablix1', row: 0, col: 0 }]);
    expect(hit.index).toBe(1);
    // El punto sigue en coordenadas del contenedor de inserción (la celda).
    expect(hit.point).toEqual({ x: 2, y: 1 });
  });

  it('un rectángulo dentro de una celda conserva la celda en el hit', () => {
    const rectangle: RectangleDto = {
      kind: 'rectangle',
      id: 'Rect',
      top: { value: 0, unit: 'cm' },
      left: { value: 0, unit: 'cm' },
      width: { value: 4, unit: 'cm' },
      height: { value: 2, unit: 'cm' },
      children: [],
    };
    const tablix: TablixDto = {
      kind: 'tablix',
      id: 'Tablix1',
      top: { value: 0, unit: 'cm' },
      left: { value: 0, unit: 'cm' },
      width: { value: 8, unit: 'cm' },
      height: { value: 2, unit: 'cm' },
      body: {
        columns: [
          { value: 4, unit: 'cm' },
          { value: 4, unit: 'cm' },
        ],
        rows: [
          { height: { value: 2, unit: 'cm' }, cells: [{ content: rectangle }, { content: null }] },
        ],
      },
      rowHierarchy: [],
      columnHierarchy: [],
    };

    const hit = hitTestItems([tablix], { x: 2, y: 1 }, fallback);
    expect(hit.item?.id).toBe('Rect');
    // El scope para insertar es el rectángulo, pero la celda viaja en el hit.
    expect(hit.scope).toEqual({ kind: 'rectangle', id: 'Rect' });
    expect(hit.cells).toEqual([{ id: 'Tablix1', row: 0, col: 0 }]);
  });

  it('con tablixes anidados la cadena de celdas va de fuera a dentro', () => {
    const inner: TablixDto = {
      kind: 'tablix',
      id: 'Interno',
      top: { value: 0, unit: 'cm' },
      left: { value: 0, unit: 'cm' },
      width: { value: 8, unit: 'cm' },
      height: { value: 2, unit: 'cm' },
      body: {
        columns: [{ value: 8, unit: 'cm' }],
        rows: [
          { height: { value: 2, unit: 'cm' }, cells: [{ content: box('Dentro', 0, 0, 4, 2) }] },
        ],
      },
      rowHierarchy: [],
      columnHierarchy: [],
    };
    const rectangle: RectangleDto = {
      kind: 'rectangle',
      id: 'Rect',
      top: { value: 0, unit: 'cm' },
      left: { value: 0, unit: 'cm' },
      width: { value: 8, unit: 'cm' },
      height: { value: 2, unit: 'cm' },
      children: [inner],
    };
    const outer: TablixDto = {
      kind: 'tablix',
      id: 'Externo',
      top: { value: 0, unit: 'cm' },
      left: { value: 0, unit: 'cm' },
      width: { value: 8, unit: 'cm' },
      height: { value: 2, unit: 'cm' },
      body: {
        columns: [{ value: 8, unit: 'cm' }],
        rows: [{ height: { value: 2, unit: 'cm' }, cells: [{ content: rectangle }] }],
      },
      rowHierarchy: [],
      columnHierarchy: [],
    };

    const hit = hitTestItems([outer], { x: 1, y: 1 }, fallback);
    expect(hit.item?.id).toBe('Dentro');
    expect(hit.cells).toEqual([
      { id: 'Externo', row: 0, col: 0 },
      { id: 'Interno', row: 0, col: 0 },
    ]);
  });

  it('la cabecera ocupada devuelve su scope (para pegar/propiedades)', () => {
    const hit = hitTestItems([tablixWithHeaders()], { x: 1, y: 0.3 }, fallback);
    expect(hit.item?.id).toBe('Textbox73');
    expect(hit.scope).toEqual({ kind: 'tablixHeader', id: 'T7', axis: 'column', path: [0] });
    expect(hit.slot).toEqual({ width: 4, height: 0.6 });
  });

  it('un hueco vacío de cabecera es scope de inserción con su caja', () => {
    const hit = hitTestItems([tablixWithHeaders()], { x: 0.25, y: 1 }, fallback);
    expect(hit.item).toBeUndefined();
    expect(hit.scope).toEqual({ kind: 'tablixHeader', id: 'T7', axis: 'row', path: [0] });
    expect(hit.slot).toEqual({ width: 0.5, height: 2 });
    expect(hit.point).toEqual({ x: 0.25, y: 0.4 });
  });

  it('un hueco vacío de la esquina es scope de inserción', () => {
    const hit = hitTestItems([tablixWithHeaders()], { x: 0.25, y: 0.3 }, fallback);
    expect(hit.item).toBeUndefined();
    expect(hit.scope).toEqual({ kind: 'tablixCorner', id: 'T7', row: 0, col: 0 });
    expect(hit.slot).toEqual({ width: 0.5, height: 0.6 });
  });

  it('fuera de la rejilla (bandas sin slot) el hit devuelve el Tablix', () => {
    const tablix: TablixDto = {
      kind: 'tablix',
      id: 'T9',
      top: { value: 0, unit: 'cm' },
      left: { value: 0, unit: 'cm' },
      width: { value: 4, unit: 'cm' },
      height: { value: 2.6, unit: 'cm' },
      body: {
        columns: [{ value: 4, unit: 'cm' }],
        rows: [{ height: { value: 2, unit: 'cm' }, cells: [{ content: null }] }],
      },
      rowHierarchy: [],
      columnHierarchy: [],
      headers: {
        offset: { top: { value: 0.6, unit: 'cm' }, left: { value: 0, unit: 'cm' } },
        // Banda sin `members` (proyecciones antiguas): cae al Tablix.
        columns: [{ size: { value: 0.6, unit: 'cm' }, cells: [null] }],
        rows: [],
        corner: [],
      },
    };

    const hit = hitTestItems([tablix], { x: 2, y: 0.3 }, fallback);
    expect(hit.item?.id).toBe('T9');
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
