import { describe, expect, it } from 'vitest';
import { lintDocument } from '../../../src/domain/lint/lintDocument.js';
import { loadCorpus } from '../../golden/fixtures.js';
import { TrueFormatXmlAdapter } from '../../../src/infrastructure/rdlc/TrueFormatXmlAdapter.js';
import { dataSet, reportRoot, textbox } from './support.js';

/**
 * `lintDocument`: compone las reglas, ordena por gravedad y después por orden
 * de documento, y no lanza sobre ningún fichero del corpus.
 */

const adapter = new TrueFormatXmlAdapter();

describe('lintDocument', () => {
  it('un informe limpio no produce hallazgos', () => {
    const root = reportRoot({
      dataSets: dataSet('DataSet_Result', ['No']),
      items: textbox('T1', '=Fields!No.Value'),
    });
    expect(lintDocument(root)).toEqual([]);
  });

  it('ordena los hallazgos en orden de documento', () => {
    const root = reportRoot({
      dataSets: dataSet('DataSet_Result', ['No']),
      items:
        // error: campo desconocido (primero en el documento)
        textbox('T1', '=Fields!Gone.Value') +
        // error: campo desconocido (segundo), por detrás del error de T1
        textbox('T3', '=Fields!Other.Value'),
    });

    const result = lintDocument(root);
    expect(result.map((f) => [f.severity, f.itemId, f.rule])).toEqual([
      ['error', 'T1', 'unknownField'],
      ['error', 'T3', 'unknownField'],
    ]);
  });

  it('pasa el paréntesis desemparejado del cuerpo y del Code como unbalancedBracket', () => {
    const root = reportRoot({
      items: textbox('T1', '=Round((1 + 2'),
      code: 'Public Function F(',
    });
    const brackets = lintDocument(root).filter((f) => f.rule === 'unbalancedBracket');
    expect(brackets).toEqual([
      {
        rule: 'unbalancedBracket',
        severity: 'error',
        itemId: 'T1',
        location: 'Value',
        params: { char: '(', index: 6 },
      },
      {
        rule: 'unbalancedBracket',
        severity: 'error',
        itemId: 'T1',
        location: 'Value',
        params: { char: '(', index: 7 },
      },
      {
        rule: 'unbalancedBracket',
        severity: 'error',
        location: 'Code',
        params: { char: '(', index: 17 },
      },
    ]);
  });

  it('no lanza sobre ningún fichero del corpus y no muta el documento', () => {
    for (const file of loadCorpus()) {
      const doc = adapter.parse(file.xml);
      const before = adapter.serialize(doc);
      expect(() => lintDocument(doc.root), file.name).not.toThrow();
      expect(adapter.serialize(doc), file.name).toBe(before);
    }
  });
});
