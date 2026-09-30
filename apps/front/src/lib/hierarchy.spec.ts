import type { ProjectionDto, RectangleDto, TablixDto, TextboxDto } from '@rdlc-designer/contracts';
import { describe, expect, it } from 'vitest';
import { breadcrumbEntries, hierarchyTree } from './hierarchy';

/** Jerarquía del informe: breadcrumb de la selección y árbol de items. */

function textbox(id: string): TextboxDto {
  return {
    kind: 'textbox',
    id,
    top: { value: 0, unit: 'cm' },
    left: { value: 0, unit: 'cm' },
    width: { value: 3, unit: 'cm' },
    height: { value: 1, unit: 'cm' },
    paragraphs: [{ runs: [{ value: `[${id}]` }] }],
  };
}

function rectangle(id: string, children: RectangleDto['children']): RectangleDto {
  return {
    kind: 'rectangle',
    id,
    top: { value: 0, unit: 'cm' },
    left: { value: 0, unit: 'cm' },
    width: { value: 5, unit: 'cm' },
    height: { value: 3, unit: 'cm' },
    children,
  };
}

const tablix: TablixDto = {
  kind: 'tablix',
  id: 'Tablix1',
  top: { value: 0, unit: 'cm' },
  left: { value: 0, unit: 'cm' },
  width: { value: 6, unit: 'cm' },
  height: { value: 2, unit: 'cm' },
  rowHierarchy: [],
  columnHierarchy: [],
  body: {
    columns: [{ value: 6, unit: 'cm' }],
    rows: [
      {
        height: { value: 1, unit: 'cm' },
        cells: [{ colSpan: 1, rowSpan: 1, content: textbox('TextboxDentro') }],
      },
    ],
  },
};

function projection(): ProjectionDto {
  return {
    sessionId: 's1',
    version: 1,
    reportName: 'Informe',
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
      header: {
        width: { value: 19, unit: 'cm' },
        height: { value: 1, unit: 'cm' },
        items: [textbox('TextboxCabecera')],
      },
      body: {
        width: { value: 19, unit: 'cm' },
        height: { value: 20, unit: 'cm' },
        items: [rectangle('Rectangle1', [textbox('TextboxAnidado')]), tablix],
      },
      footer: { width: { value: 19, unit: 'cm' }, height: { value: 0, unit: 'cm' }, items: [] },
    },
  };
}

describe('breadcrumbEntries', () => {
  it('con la selección vacía solo está la raíz', () => {
    expect(breadcrumbEntries(projection(), {})).toEqual([{ label: 'Informe' }]);
  });

  it('sitúa un item anidado por sus contenedores y región', () => {
    const entries = breadcrumbEntries(projection(), { itemId: 'TextboxAnidado' });
    expect(entries.map((entry) => entry.label)).toEqual([
      'Informe',
      'Cuerpo',
      'Rectangle1',
      'TextboxAnidado',
    ]);
    expect(entries[2]?.target).toEqual({ kind: 'item', id: 'Rectangle1' });
  });

  it('sitúa el contenido de una celda con su «Celda r,c»', () => {
    const entries = breadcrumbEntries(projection(), { itemId: 'TextboxDentro' });
    expect(entries.map((entry) => entry.label)).toEqual([
      'Informe',
      'Cuerpo',
      'Tablix1',
      'Celda 1,1',
      'TextboxDentro',
    ]);
    expect(entries[3]?.target).toEqual({ kind: 'cell', id: 'Tablix1', row: 0, col: 0 });
  });

  it('con una celda seleccionada termina en la celda', () => {
    const entries = breadcrumbEntries(projection(), {
      cell: { id: 'Tablix1', row: 0, col: 0 },
    });
    expect(entries.map((entry) => entry.label)).toEqual(['Informe', 'Cuerpo', 'Tablix1', 'Celda 1,1']);
  });

  it('encuentra items del encabezado', () => {
    const entries = breadcrumbEntries(projection(), { itemId: 'TextboxCabecera' });
    expect(entries.map((entry) => entry.label)).toEqual(['Informe', 'Encabezado', 'TextboxCabecera']);
  });
});

describe('hierarchyTree', () => {
  it('anida regiones, rectángulos, celdas y contenido', () => {
    const tree = hierarchyTree(projection());
    const [header, body, footer] = tree;
    expect(header?.children[0]?.label).toBe('TextboxCabecera');

    const rectangleNode = body?.children.find((node) => node.label === 'Rectangle1');
    expect(rectangleNode?.children[0]?.label).toBe('TextboxAnidado');

    const tablixNode = body?.children.find((node) => node.label === 'Tablix1');
    const cellNode = tablixNode?.children[0];
    expect(cellNode?.label).toBe('Celda 1,1');
    expect(cellNode?.target).toEqual({ kind: 'cell', id: 'Tablix1', row: 0, col: 0 });
    expect(cellNode?.children[0]?.label).toBe('TextboxDentro');

    expect(footer?.children).toEqual([]);
  });
});
