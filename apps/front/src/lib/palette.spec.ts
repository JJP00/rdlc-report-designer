import type { ProjectionDto, TablixDto, TextboxDto } from '@rdlc-designer/contracts';
import { describe, expect, it } from 'vitest';
import { paletteElements } from './palette';

/** Elementos de la paleta (Ctrl+K): nombre + contenido buscable. */

function textbox(id: string, value: string, label?: string): TextboxDto {
  return {
    kind: 'textbox',
    id,
    top: { value: 0, unit: 'cm' },
    left: { value: 0, unit: 'cm' },
    width: { value: 5, unit: 'cm' },
    height: { value: 1, unit: 'cm' },
    paragraphs: [{ runs: [{ value, ...(label ? { label } : {}) }] }],
  };
}

function projectionWith(items: ProjectionDto['page']['body']['items']): ProjectionDto {
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
      header: { width: { value: 19, unit: 'cm' }, height: { value: 0, unit: 'cm' }, items: [] },
      body: {
        width: { value: 19, unit: 'cm' },
        height: { value: 20, unit: 'cm' },
        items,
      },
      footer: { width: { value: 19, unit: 'cm' }, height: { value: 0, unit: 'cm' }, items: [] },
    },
  };
}

const tablix: TablixDto = {
  kind: 'tablix',
  id: 'Tablix1',
  top: { value: 0, unit: 'cm' },
  left: { value: 0, unit: 'cm' },
  width: { value: 8, unit: 'cm' },
  height: { value: 3, unit: 'cm' },
  body: { columns: [], rows: [{ height: { value: 1, unit: 'cm' }, cells: [{ content: textbox('TextboxEnCelda', '=Fields!Total.Value') }] }] },
  rowHierarchy: [],
  columnHierarchy: [],
};

describe('paletteElements', () => {
  it('aplana regiones, anidados y celdas de Tablix', () => {
    const projection = projectionWith([
      textbox('Textbox1', 'Total: '),
      {
        kind: 'rectangle',
        id: 'Rectangle1',
        top: { value: 0, unit: 'cm' },
        left: { value: 0, unit: 'cm' },
        width: { value: 5, unit: 'cm' },
        height: { value: 2, unit: 'cm' },
        children: [textbox('TextboxAnidado', '=Fields!Item_No.Value')],
      },
      tablix,
    ]);

    expect(paletteElements(projection).map((element) => element.id)).toEqual([
      'Textbox1',
      'Rectangle1',
      'TextboxAnidado',
      'Tablix1',
      'TextboxEnCelda',
    ]);
  });

  it('el texto buscable incluye el contenido y la etiqueta, no solo el nombre', () => {
    const projection = projectionWith([
      textbox('Textbox9', '=Fields!BTCDescriptionLbl.Value', 'BTCDescriptionLbl'),
    ]);

    const [element] = paletteElements(projection);
    expect(element?.haystack).toContain('Textbox9');
    expect(element?.haystack).toContain('=Fields!BTCDescriptionLbl.Value');
    expect(element?.haystack).toContain('[BTCDescriptionLbl]');
    expect(element?.haystack).toContain('Textbox');
  });
});
