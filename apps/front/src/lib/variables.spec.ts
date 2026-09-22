import type { ReportMetaDto } from '@rdlc-designer/contracts';
import { describe, expect, it } from 'vitest';
import { variableEntries, VARIABLE_GROUPS } from './variables';

/** Entradas de variables que comparten el panel y la paleta (Ctrl+K). */

const meta: ReportMetaDto = {
  code: {
    text: 'Function BlankZero(v)\nEnd Function',
    functions: [{ name: 'BlankZero', parameters: ['v'] }, { name: 'SinParametros' }],
  },
  fields: [
    { name: 'BTCDescriptionLbl', dataType: 'String' },
    { name: 'Item_No', dataType: 'String' },
  ],
  parameters: [{ name: 'CompanyName', dataType: 'String', prompt: 'Empresa' }],
};

describe('variableEntries', () => {
  it('construye la expresión de cada grupo', () => {
    const entries = variableEntries(meta);
    const byName = new Map(entries.map((entry) => [entry.name, entry]));

    expect(byName.get('BTCDescriptionLbl')?.expression).toBe('=Fields!BTCDescriptionLbl.Value');
    expect(byName.get('CompanyName')?.expression).toBe('=Parameters!CompanyName.Value');
    expect(byName.get('BlankZero')?.expression).toBe('=Code.BlankZero(');
    expect(byName.get('PageNumber')?.expression).toBe('=Globals!PageNumber.Value');
    expect(byName.get('UserID')?.expression).toBe('=User!UserID');
  });

  it('agrupa por tipo y respeta el orden (campos, parámetros, funciones, globales, user)', () => {
    const groups = variableEntries(meta).map((entry) => entry.group);
    const firstIndex = (group: string): number => groups.indexOf(group);

    expect(firstIndex(VARIABLE_GROUPS.fields)).toBeLessThan(firstIndex(VARIABLE_GROUPS.parameters));
    expect(firstIndex(VARIABLE_GROUPS.parameters)).toBeLessThan(
      firstIndex(VARIABLE_GROUPS.functions),
    );
    expect(firstIndex(VARIABLE_GROUPS.functions)).toBeLessThan(firstIndex(VARIABLE_GROUPS.globals));
    expect(firstIndex(VARIABLE_GROUPS.globals)).toBeLessThan(firstIndex(VARIABLE_GROUPS.user));
  });

  it('lleva el detalle (tipo de dato / parámetros) solo si existe', () => {
    const entries = variableEntries(meta);
    const byName = new Map(entries.map((entry) => [entry.name, entry]));

    expect(byName.get('BTCDescriptionLbl')?.detail).toBe('String');
    expect(byName.get('BlankZero')?.detail).toBe('v');
    expect(byName.get('SinParametros')?.detail).toBeUndefined();
    expect(byName.get('PageNumber')?.detail).toBeUndefined();
  });
});
