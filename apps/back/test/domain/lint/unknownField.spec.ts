import { describe, expect, it } from 'vitest';
import { lintUnknownFields } from '../../../src/domain/lint/rules/unknownField.js';
import { dataSet, reportRoot, textbox } from './support.js';

/**
 * Regla `unknownField`: `Fields!X` con `X` que no es campo de ningún DataSet.
 */

const DATASETS = dataSet('DataSet_Result', ['No', 'Amount']);

describe('lintUnknownFields', () => {
  it('no reporta campos que existen en algún DataSet (sin distinguir mayúsculas)', () => {
    const root = reportRoot({
      dataSets: DATASETS,
      items: textbox('T1', '=Fields!No.Value') + textbox('T2', '=fields!amount.Value'),
    });
    expect(lintUnknownFields(root)).toEqual([]);
  });

  it('reporta un campo inexistente con su item y la etiqueta del elemento', () => {
    const root = reportRoot({
      dataSets: DATASETS,
      items: textbox('T1', '=Fields!Missing.Value'),
    });
    expect(lintUnknownFields(root)).toEqual([
      {
        rule: 'unknownField',
        severity: 'error',
        itemId: 'T1',
        location: 'Value',
        params: { field: 'Missing' },
      },
    ]);
  });

  it('reporta cada campo una sola vez por expresión', () => {
    const root = reportRoot({
      dataSets: DATASETS,
      items: textbox('T1', '=Fields!Missing.Value &amp; Fields!Missing.Value'),
    });
    expect(lintUnknownFields(root)).toHaveLength(1);
  });

  it('ignora las referencias dentro de cadenas', () => {
    const root = reportRoot({
      dataSets: DATASETS,
      items: textbox('T1', '="Fields!Missing" &amp; Fields!No.Value'),
    });
    expect(lintUnknownFields(root)).toEqual([]);
  });

  it('no lanza sin DataSets: todo campo referenciado es desconocido', () => {
    const root = reportRoot({ items: textbox('T1', '=Fields!No.Value') });
    expect(lintUnknownFields(root)).toHaveLength(1);
  });
});
