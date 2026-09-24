import { describe, expect, it } from 'vitest';
import type { ProjectionDto, TablixDto } from '@rdlc-designer/contracts';
import type { CanvasHit } from './hit';
import { insertSpecAt } from './insert';

/** El item insertado en una celda de Tablix ocupa la celda (como RB). */

function textbox(id: string) {
  return {
    kind: 'textbox' as const,
    id,
    top: { value: 0, unit: 'cm' as const },
    left: { value: 0, unit: 'cm' as const },
    width: { value: 0, unit: 'cm' as const },
    height: { value: 0, unit: 'cm' as const },
    paragraphs: [],
  };
}

const TABLIX: TablixDto = {
  kind: 'tablix',
  id: 'T',
  top: { value: 1, unit: 'cm' },
  left: { value: 2, unit: 'cm' },
  width: { value: 6, unit: 'cm' },
  height: { value: 1.2, unit: 'cm' },
  body: {
    columns: [
      { value: 2, unit: 'cm' },
      { value: 3, unit: 'cm' },
      { value: 1, unit: 'cm' },
    ],
    rows: [
      {
        height: { value: 1.2, unit: 'cm' },
        cells: [{ content: textbox('A') }, { content: null }, { content: null }],
      },
    ],
  },
  rowHierarchy: [],
  columnHierarchy: [],
};

const PROJECTION: ProjectionDto = {
  sessionId: 's',
  version: 1,
  reportName: 'r',
  meta: { code: { text: '', functions: [] }, fields: [], parameters: [] },
  page: {
    width: { value: 21, unit: 'cm' },
    height: { value: 29.7, unit: 'cm' },
    margins: {
      top: { value: 0, unit: 'cm' },
      left: { value: 0, unit: 'cm' },
      bottom: { value: 0, unit: 'cm' },
      right: { value: 0, unit: 'cm' },
    },
    header: { width: { value: 21, unit: 'cm' }, height: { value: 0, unit: 'cm' }, items: [] },
    body: {
      width: { value: 21, unit: 'cm' },
      height: { value: 29.7, unit: 'cm' },
      items: [TABLIX],
    },
    footer: { width: { value: 21, unit: 'cm' }, height: { value: 0, unit: 'cm' }, items: [] },
  },
};

function hit(scope: CanvasHit['scope'], point: { x: number; y: number }): CanvasHit {
  return { scope, index: 0, point };
}

describe('insertSpecAt', () => {
  it('dentro de una celda: nace con el tamaño de la celda y en su origen', () => {
    // Celda (0,1): 3 cm de ancho × 1,2 cm de alto.
    const spec = insertSpecAt(
      'textbox',
      hit({ kind: 'tablixCell', id: 'T', row: 0, col: 1 }, { x: 1.7, y: 0.4 }),
      PROJECTION,
    );
    expect(spec.top).toEqual({ value: 0, unit: 'cm' });
    expect(spec.left).toEqual({ value: 0, unit: 'cm' });
    expect(spec.width).toEqual({ value: 3, unit: 'cm' });
    expect(spec.height).toEqual({ value: 1.2, unit: 'cm' });
    if (spec.kind === 'textbox') expect(spec.text).toBe('');
  });

  it('fuera de una celda: nace en el punto del cursor con su tamaño', () => {
    const spec = insertSpecAt('textbox', hit({ kind: 'body' }, { x: 1.7, y: 0.4 }), PROJECTION);
    expect(spec.top).toEqual({ value: 0.4, unit: 'cm' });
    expect(spec.left).toEqual({ value: 1.7, unit: 'cm' });
    expect(spec.width).toEqual({ value: 5, unit: 'cm' });
    expect(spec.height).toEqual({ value: 1, unit: 'cm' });
  });
});
