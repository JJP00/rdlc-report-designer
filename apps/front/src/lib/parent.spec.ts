import type { ProjectionDto, TablixDto, TextboxDto } from '@rdlc-designer/contracts';
import { describe, expect, it } from 'vitest';
import { findParentItemId } from './projection';

/** Jerarquía para «subir un nivel» (Esc): contenedores de un item. */

function textbox(id: string): TextboxDto {
  return {
    kind: 'textbox',
    id,
    top: { value: 0, unit: 'cm' },
    left: { value: 0, unit: 'cm' },
    width: { value: 1, unit: 'cm' },
    height: { value: 1, unit: 'cm' },
    paragraphs: [{ runs: [{ value: id }] }],
  };
}

function projectionWith(items: ProjectionDto['page']['body']['items']): ProjectionDto {
  return {
    sessionId: 's',
    version: 1,
    reportName: 'R',
    meta: { code: { text: '', functions: [] }, fields: [], parameters: [] },
    page: {
      width: { value: 21, unit: 'cm' },
      height: { value: 29.7, unit: 'cm' },
      margins: {
        top: { value: 1, unit: 'cm' },
        bottom: { value: 1, unit: 'cm' },
        left: { value: 1, unit: 'cm' },
        right: { value: 1, unit: 'cm' },
      },
      header: { width: { value: 19, unit: 'cm' }, height: { value: 0, unit: 'cm' }, items: [] },
      body: { width: { value: 19, unit: 'cm' }, height: { value: 20, unit: 'cm' }, items },
      footer: { width: { value: 19, unit: 'cm' }, height: { value: 0, unit: 'cm' }, items: [] },
    },
  };
}

/** Tablix con una celda que contiene `content`. */
function tablix(id: string, content: TextboxDto): TablixDto {
  return {
    kind: 'tablix',
    id,
    top: { value: 0, unit: 'cm' },
    left: { value: 0, unit: 'cm' },
    width: { value: 5, unit: 'cm' },
    height: { value: 2, unit: 'cm' },
    body: {
      columns: [{ value: 5, unit: 'cm' }],
      rows: [{ height: { value: 2, unit: 'cm' }, cells: [{ content }] }],
    },
    rowHierarchy: [],
    columnHierarchy: [],
  };
}

describe('findParentItemId', () => {
  it('el contenido de una celda tiene por padre su Tablix', () => {
    const projection = projectionWith([tablix('Outer', textbox('EnCelda'))]);
    expect(findParentItemId(projection, 'EnCelda')).toBe('Outer');
  });

  it('un item dentro de un rectángulo tiene por padre el rectángulo', () => {
    const projection = projectionWith([
      {
        kind: 'rectangle',
        id: 'Rect',
        top: { value: 0, unit: 'cm' },
        left: { value: 0, unit: 'cm' },
        width: { value: 5, unit: 'cm' },
        height: { value: 5, unit: 'cm' },
        children: [textbox('Dentro')],
      },
    ]);
    expect(findParentItemId(projection, 'Dentro')).toBe('Rect');
  });

  it('un tablix dentro de una celda tiene por padre la tabla exterior (varios niveles)', () => {
    const inner = tablix('Inner', textbox('Muy dentro'));
    const projection = projectionWith([tablix('Outer', inner as unknown as TextboxDto)]);

    expect(findParentItemId(projection, 'Inner')).toBe('Outer');
    expect(findParentItemId(projection, 'Muy dentro')).toBe('Inner');
  });

  it('un item de primer nivel no tiene padre', () => {
    const projection = projectionWith([textbox('Suelto')]);
    expect(findParentItemId(projection, 'Suelto')).toBeUndefined();
    expect(findParentItemId(projection, 'NoExiste')).toBeUndefined();
  });
});
