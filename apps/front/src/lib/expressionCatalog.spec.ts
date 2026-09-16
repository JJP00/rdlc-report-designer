import type { ReportMetaDto } from '@rdlc-designer/contracts';
import { describe, expect, it } from 'vitest';
import {
  completionSuggestions,
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

describe('completionSuggestions', () => {
  it('las funciones se ofrecen con su firma y el paréntesis cerrado (snippet)', () => {
    const suggestions = completionSuggestions(meta);
    const blank = suggestions.find((entry) => entry.label === 'BlankZero');

    expect(blank?.labelDetail).toBe('(v)');
    expect(blank?.insertText).toBe('Code.BlankZero($0)');
    expect(blank?.snippet).toBe(true);
  });

  it('las funciones del estándar también se insertan como llamada', () => {
    const iif = completionSuggestions(meta).find((entry) => entry.label === 'IIf');

    expect(iif?.insertText).toBe('IIf($0)');
    expect(iif?.snippet).toBe(true);
    expect(iif?.labelDetail).toBeUndefined();
    expect(iif?.detail).toBe('función RDL');
  });

  it('los campos y parámetros no llevan snippet ni firma', () => {
    const suggestions = completionSuggestions(meta);
    const field = suggestions.find((entry) => entry.label === 'BTCDescriptionLbl');
    const parameter = suggestions.find((entry) => entry.label === 'CompanyName');

    expect(field?.insertText).toBe('Fields!BTCDescriptionLbl.Value');
    expect(field?.snippet).toBe(false);
    expect(field?.labelDetail).toBeUndefined();
    expect(parameter?.insertText).toBe('Parameters!CompanyName.Value');
  });

  it('ordena por grupos: campos, parámetros, Code., globals/user y RDL', () => {
    const suggestions = completionSuggestions(meta);
    const order = (label: string): number =>
      Number(suggestions.find((entry) => entry.label === label)?.sortText.split('-')[0]);

    expect(order('BTCDescriptionLbl')).toBeLessThan(order('CompanyName'));
    expect(order('CompanyName')).toBeLessThan(order('BlankZero'));
    expect(order('BlankZero')).toBeLessThan(order('PageNumber'));
    expect(order('PageNumber')).toBeLessThan(order('IIf'));
  });
});
