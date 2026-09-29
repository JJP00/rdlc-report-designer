import type { ProjectionDto, RectangleDto, TablixDto, TextboxDto } from '@rdlc-designer/contracts';
import { describe, expect, it } from 'vitest';
import { cm, countItems, findItem, findItemScope, patchItem, toCm } from './projection';

/** Proyección mínima: textbox top-level + rectángulo anidado + tablix con celda. */

function textbox(id: string): TextboxDto {
  return {
    kind: 'textbox',
    id,
    top: { value: 1, unit: 'cm' },
    left: { value: 1, unit: 'cm' },
    width: { value: 5, unit: 'cm' },
    height: { value: 0.5, unit: 'cm' },
    paragraphs: [{ runs: [{ value: '=Fields!No.Value' }] }],
  };
}

function makeProjection(): ProjectionDto {
  const nested: TextboxDto = textbox('TextboxNested');
  const rectangle: RectangleDto = {
    kind: 'rectangle',
    id: 'Rectangle1',
    top: { value: 2, unit: 'cm' },
    left: { value: 2, unit: 'cm' },
    width: { value: 8, unit: 'cm' },
    height: { value: 4, unit: 'cm' },
    children: [nested],
  };
  const cell: TextboxDto = textbox('TextboxInCell');
  const tablix: TablixDto = {
    kind: 'tablix',
    id: 'Tablix1',
    top: { value: 6, unit: 'cm' },
    left: { value: 0, unit: 'cm' },
    width: { value: 10, unit: 'cm' },
    height: { value: 3, unit: 'cm' },
    body: {
      columns: [{ value: 10, unit: 'cm' }],
      rows: [{ height: { value: 3, unit: 'cm' }, cells: [{ content: cell }] }],
    },
    rowHierarchy: [],
    columnHierarchy: [],
  };

  return {
    sessionId: 'test',
    version: 1,
    reportName: 'Test',
    meta: { code: { text: '', functions: [] }, fields: [], parameters: [] },
    page: {
      width: { value: 21, unit: 'cm' },
      height: { value: 29.7, unit: 'cm' },
      margins: {
        top: { value: 2.5, unit: 'cm' },
        bottom: { value: 2.5, unit: 'cm' },
        left: { value: 1.9, unit: 'cm' },
        right: { value: 1.9, unit: 'cm' },
      },
      header: { width: { value: 21, unit: 'cm' }, height: { value: 0, unit: 'cm' }, items: [] },
      body: {
        width: { value: 21, unit: 'cm' },
        height: { value: 29.7, unit: 'cm' },
        items: [rectangle, tablix],
      },
      footer: { width: { value: 21, unit: 'cm' }, height: { value: 0, unit: 'cm' }, items: [] },
    },
  };
}

describe('lib/projection', () => {
  it('encuentra items anidados (rectángulo y celda de tablix)', () => {
    const projection = makeProjection();
    expect(findItem(projection, 'Rectangle1')?.kind).toBe('rectangle');
    expect(findItem(projection, 'TextboxNested')?.kind).toBe('textbox');
    expect(findItem(projection, 'TextboxInCell')?.id).toBe('TextboxInCell');
    expect(findItem(projection, 'NoExiste')).toBeUndefined();
  });

  it('parchea un item anidado sin mutar el original', () => {
    const projection = makeProjection();
    const patched = patchItem(projection, 'TextboxNested', {
      top: { value: 3.5, unit: 'cm' },
      left: { value: 4.5, unit: 'cm' },
    });

    const original = findItem(projection, 'TextboxNested');
    expect(original?.top.value).toBe(1);

    const updated = findItem(patched, 'TextboxNested');
    expect(updated?.top.value).toBe(3.5);
    expect(updated?.left.value).toBe(4.5);

    // El resto se conserva.
    expect(findItem(patched, 'Tablix1')?.kind).toBe('tablix');
    expect(findItem(patched, 'TextboxInCell')?.top.value).toBe(1);
  });

  it('cuenta items de todas las regiones y profundidades', () => {
    const projection = makeProjection();
    const stats = countItems(projection);
    expect(stats.total).toBe(4);
    expect(stats.byKind['rectangle']).toBe(1);
    expect(stats.byKind['tablix']).toBe(1);
    expect(stats.byKind['textbox']).toBe(2);
  });

  it('encuentra el scope (banda, rectángulo o celda) de un item', () => {
    const projection = makeProjection();
    expect(findItemScope(projection, 'Rectangle1')).toEqual({ kind: 'body' });
    expect(findItemScope(projection, 'TextboxNested')).toEqual({
      kind: 'rectangle',
      id: 'Rectangle1',
    });
    expect(findItemScope(projection, 'Tablix1')).toEqual({ kind: 'body' });
    expect(findItemScope(projection, 'TextboxInCell')).toEqual({
      kind: 'tablixCell',
      id: 'Tablix1',
      row: 0,
      col: 0,
    });
    expect(findItemScope(projection, 'NoExiste')).toBeUndefined();
  });

  it('convierte longitudes a cm', () => {
    expect(toCm({ value: 2, unit: 'cm' })).toBe(2);
    expect(toCm({ value: 20, unit: 'mm' })).toBe(2);
    expect(toCm({ value: 1, unit: 'in' })).toBeCloseTo(2.54, 5);
    expect(toCm({ value: 72, unit: 'pt' })).toBeCloseTo(2.54, 5);
    expect(cm(2.123456)).toEqual({ value: 2.1235, unit: 'cm' });
  });
});
