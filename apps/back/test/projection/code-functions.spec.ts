import { describe, expect, it } from 'vitest';
import { TrueFormatProjectionAdapter } from '../../src/infrastructure/rdlc/TrueFormatProjectionAdapter.js';
import { TrueFormatXmlAdapter } from '../../src/infrastructure/rdlc/TrueFormatXmlAdapter.js';
import { corpusByName } from '../golden/fixtures.js';

/**
 * Meta del informe: el bloque `<Code>` VB alimenta la lista de variables y el
 * autocompletado de Monaco, así que las firmas deben salir limpias (`ByVal
 * Value As String` → `Value`).
 */

const xmlAdapter = new TrueFormatXmlAdapter();
const projectionAdapter = new TrueFormatProjectionAdapter();

function functionsOf(name: string): { name: string; parameters?: string[] }[] {
  const { xml } = corpusByName(name);
  const doc = xmlAdapter.parse(xml);
  const projection = projectionAdapter.project({
    sessionId: 'test',
    filePath: name,
    document: doc,
    version: 1,
  });
  return projection.meta.code.functions;
}

describe('proyección · funciones del bloque <Code>', () => {
  it('extrae las funciones del corpus con sus parámetros sin modo de paso ni tipo', () => {
    const functions = functionsOf('BTCQualityControl.rdlc');
    expect(functions.length).toBeGreaterThan(0);

    for (const fn of functions) {
      expect(fn.name).toMatch(/^[A-Za-z_]\w*$/);
      for (const parameter of fn.parameters ?? []) {
        expect(parameter).not.toMatch(/\b(?:ByVal|ByRef|As)\b/);
        expect(parameter.trim()).toBe(parameter);
      }
    }
  });

  it('PalletOutput: las funciones con parámetros traen el nombre pelado', () => {
    const functions = functionsOf('PalletOutput.rdlc');
    const names = functions.map((fn) => fn.name);
    expect(names).toContain('BlankZero');

    const withParams = functions.filter((fn) => (fn.parameters?.length ?? 0) > 0);
    expect(withParams.length).toBeGreaterThan(0);
    for (const fn of withParams) {
      for (const parameter of fn.parameters ?? []) {
        expect(parameter).toMatch(/^[A-Za-z_]\w*$/);
      }
    }
  });
});
