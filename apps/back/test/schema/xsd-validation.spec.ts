import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { applyCommand } from '../../src/domain/document/commands/applyCommand.js';
import { DocumentIndex } from '../../src/domain/document/index/DocumentIndex.js';
import { TrueFormatXmlAdapter } from '../../src/infrastructure/rdlc/TrueFormatXmlAdapter.js';
import { LibXml2SchemaValidatorAdapter } from '../../src/infrastructure/validation/LibXml2SchemaValidatorAdapter.js';
import { corpusByName, loadCorpus } from '../golden/fixtures.js';

/**
 * Validación contra el XSD oficial RDL 2016/01 (MS-RDL §5.8, XSD distribuido
 * con ReportViewer). Gate: el corpus de BC debe validar tal cual (incluye
 * extensiones del diseñador `rd:*` y `<Label>`).
 */

const here = dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = resolve(here, '../../resources/rdl2016/ReportDefinition2016.xsd');

const validator = new LibXml2SchemaValidatorAdapter(SCHEMA_PATH);

describe('validación XSD RDL 2016/01', () => {
  it('el corpus completo valida', () => {
    for (const { name, xml } of loadCorpus()) {
      const result = validator.validate(xml);
      expect(result.problems, `${name}: ${result.problems.join(' | ')}`).toEqual([]);
      expect(result.valid).toBe(true);
    }
  });

  it('un Tablix insertado por el editor valida contra el XSD', () => {
    const adapter = new TrueFormatXmlAdapter();
    const { xml } = corpusByName('PalletOutput.rdlc');
    const doc = adapter.parse(xml);
    const index = DocumentIndex.build(doc.root);

    const applied = applyCommand(
      { root: doc.root, index },
      {
        cmd: 'insertItem',
        scope: { kind: 'body' },
        index: 0,
        item: {
          kind: 'tablix',
          top: { value: 1, unit: 'cm' },
          left: { value: 1, unit: 'cm' },
          width: { value: 8, unit: 'cm' },
          height: { value: 2.5, unit: 'cm' },
        },
      },
    );
    expect(applied.isRight()).toBe(true);

    const result = validator.validate(adapter.serialize(doc));
    expect(result.problems, result.problems.join(' | ')).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('detecta XML estructuralmente inválido con problemas legibles', () => {
    const { xml } = corpusByName('PalletOutput.rdlc');
    // Un hijo que no existe en el modelo de Report: inválido de narices.
    const broken = xml.replace(
      '<AutoRefresh>0</AutoRefresh>',
      '<AutoRefresh>0</AutoRefresh><BogusElement/>',
    );

    const result = validator.validate(broken);
    expect(result.valid).toBe(false);
    expect(result.problems.length).toBeGreaterThan(0);
    expect(result.problems.join(' ')).toContain('BogusElement');
  });

  it('reutiliza el esquema compilado (validaciones consecutivas rápidas)', () => {
    const { xml } = corpusByName('SalesInvoiceESP.rdlc');
    const start = performance.now();
    for (let i = 0; i < 5; i += 1) expect(validator.validate(xml).valid).toBe(true);
    expect(performance.now() - start).toBeLessThan(2000);
  });

  it('el esquema viaja con la app (ruta de recursos)', () => {
    const content = readFileSync(SCHEMA_PATH, 'utf8');
    expect(content).toContain('2016/01/reportdefinition');
  });
});
