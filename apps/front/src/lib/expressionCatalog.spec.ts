import type { ReportMetaDto } from '@rdlc-designer/contracts';
import { describe, expect, it } from 'vitest';
import {
  expressionCompletions,
  RDL_BUILTINS,
  VB_KEYWORDS,
} from './expressionCatalog';
import { variableEntries } from './variables';

/** Autocompletado del editor de expresiones. */

const meta: ReportMetaDto = {
  code: { text: '', functions: [{ name: 'BlankZero', parameters: ['v'] }] },
  fields: [{ name: 'BTCDescriptionLbl', dataType: 'String' }],
  parameters: [{ name: 'CompanyName', dataType: 'String' }],
};

describe('expressionCompletions', () => {
  it('ofrece las variables del informe sin el `=` inicial', () => {
    const entries = expressionCompletions(meta);
    const field = entries.find((entry) => entry.label === 'BTCDescriptionLbl');

    expect(field?.insertText).toBe('Fields!BTCDescriptionLbl.Value');
    expect(field?.kind).toBe('field');
    expect(field?.detail).toBe('String');
  });

  it('traduce cada grupo a su tipo de icono', () => {
    const kinds = new Map(expressionCompletions(meta).map((entry) => [entry.label, entry.kind]));

    expect(kinds.get('BTCDescriptionLbl')).toBe('field');
    expect(kinds.get('CompanyName')).toBe('parameter');
    expect(kinds.get('BlankZero')).toBe('code');
    expect(kinds.get('PageNumber')).toBe('global');
    expect(kinds.get('UserID')).toBe('user');
    expect(kinds.get('IIf')).toBe('builtin');
  });

  it('las funciones del estándar se insertan con paréntesis', () => {
    const iif = expressionCompletions(meta).find((entry) => entry.label === 'IIf');
    expect(iif?.insertText).toBe('IIf(');
    expect(iif?.detail).toBe('función RDL');
  });

  it('cubre todo el catálogo de variables y de funciones', () => {
    const entries = expressionCompletions(meta);
    const labels = new Set(entries.map((entry) => entry.label));

    for (const entry of variableEntries(meta)) expect(labels.has(entry.name)).toBe(true);
    for (const builtin of RDL_BUILTINS) expect(labels.has(builtin)).toBe(true);
    expect(entries).toHaveLength(variableEntries(meta).length + RDL_BUILTINS.length);
  });

  it('el catálogo de funciones y el de palabras clave no tienen duplicados', () => {
    expect(new Set(RDL_BUILTINS).size).toBe(RDL_BUILTINS.length);
    expect(new Set(VB_KEYWORDS).size).toBe(VB_KEYWORDS.length);
  });
});
