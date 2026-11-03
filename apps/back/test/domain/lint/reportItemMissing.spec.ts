import { describe, expect, it } from 'vitest';
import { lintReportItemMissing } from '../../../src/domain/lint/rules/reportItemMissing.js';
import { reportRoot, textbox } from './support.js';

/**
 * Regla `reportItemMissing`: `ReportItems!X` sin ningún item de informe `X`.
 */

describe('lintReportItemMissing', () => {
  it('no reporta una referencia a un textbox existente (sin distinguir mayúsculas)', () => {
    const root = reportRoot({
      items: textbox('Label1', 'Hola') + textbox('T1', '=ReportItems!label1.Value'),
    });
    expect(lintReportItemMissing(root)).toEqual([]);
  });

  it('reporta un item inexistente como error con params {name}', () => {
    const root = reportRoot({
      items: textbox('T1', '=ReportItems!Nope.Value'),
    });
    expect(lintReportItemMissing(root)).toEqual([
      {
        rule: 'reportItemMissing',
        severity: 'error',
        itemId: 'T1',
        location: 'Value',
        params: { name: 'Nope' },
      },
    ]);
  });

  it('busca también en las cabeceras', () => {
    const root = reportRoot({
      items: textbox('Body1', 'x'),
      header: textbox('H1', '=ReportItems!Body1.Value &amp; ReportItems!Gone.Value'),
    });
    expect(lintReportItemMissing(root).map((f) => f.params)).toEqual([{ name: 'Gone' }]);
  });
});
