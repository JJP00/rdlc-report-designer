import type { ProjectionDto, TablixDto, TextboxDto } from '@rdlc-designer/contracts';
import { describe, expect, it } from 'vitest';
import {
  PALETTE_ACTIONS,
  paletteDisabledActions,
  paletteElements,
  paletteFilter,
  PALETTE_ACTION_MARK,
  type PaletteCapabilities,
} from './palette';

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
  body: {
    columns: [],
    rows: [
      {
        height: { value: 1, unit: 'cm' },
        cells: [{ content: textbox('TextboxEnCelda', '=Fields!Total.Value') }],
      },
    ],
  },
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

describe('paletteDisabledActions', () => {
  const none: PaletteCapabilities = {
    hasDocument: false,
    hasTextbox: false,
    hasTablix: false,
  };
  const everything: PaletteCapabilities = {
    hasDocument: true,
    hasTextbox: true,
    hasTablix: true,
  };

  it('sin documento solo queda «Abrir»', () => {
    const disabled = paletteDisabledActions(none);
    expect(disabled).toContain('save');
    expect(disabled).toContain('insert:tablix');
    expect(disabled).toContain('zoom:fit-width');
    expect(disabled).toContain('undo');
    expect(disabled).not.toContain('open');
  });

  it('con documento pero sin selección, editar texto y filtros siguen fuera', () => {
    const disabled = paletteDisabledActions({
      hasDocument: true,
      hasTextbox: false,
      hasTablix: false,
    });
    expect(disabled).not.toContain('save');
    expect(disabled).not.toContain('insert:tablix');
    expect(disabled).toContain('edit-text');
    expect(disabled).toContain('tablix-filters');
  });

  it('con un textbox seleccionado se habilita «Editar el texto»', () => {
    const disabled = paletteDisabledActions({
      hasDocument: true,
      hasTextbox: true,
      hasTablix: false,
    });
    expect(disabled).not.toContain('edit-text');
    expect(disabled).toContain('tablix-filters');
  });

  it('con un Tablix en contexto se habilitan sus filtros', () => {
    const disabled = paletteDisabledActions(everything);
    expect(disabled.size).toBe(0);
  });

  it('todas las acciones declaran un contexto conocido', () => {
    expect(PALETTE_ACTIONS.map((action) => action.id)).toContain('close');
    expect(PALETTE_ACTIONS.map((action) => action.id)).toContain('zoom:fit-width');
    expect(PALETTE_ACTIONS.map((action) => action.id)).toContain('tablix-filters');
  });
});

describe('paletteFilter', () => {
  it('no devuelve ruido para una búsqueda sin coincidencia literal', () => {
    expect(paletteFilter('Textbox95', 'zzzz', ['Textbox95 · Textbox'])).toBe(0);
    // Una subsecuencia («txb95») ya no basta.
    expect(paletteFilter('Textbox95', 'txb95')).toBe(0);
  });

  it('ignora mayúsculas y acentos, y exige todas las palabras', () => {
    expect(paletteFilter('Textbox95', 'TEXTBOX')).toBeGreaterThan(0);
    expect(paletteFilter(`${PALETTE_ACTION_MARK}Jerarquía`, 'jerarquia')).toBeGreaterThan(0);
    expect(paletteFilter('Textbox95', 'textbox rectangulo')).toBe(0);
  });

  it('las acciones puntúan por encima de un elemento con la misma coincidencia', () => {
    const action = paletteFilter(`${PALETTE_ACTION_MARK}Guardar como…`, 'guardar');
    const element = paletteFilter('Guardar', 'guardar');
    expect(action).toBeGreaterThan(element);
  });
});
