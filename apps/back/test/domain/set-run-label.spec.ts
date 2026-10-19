import { describe, expect, it } from 'vitest';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { undoAll } from './command-test-utils.js';
import { applyCommand } from '../../src/domain/document/commands/applyCommand.js';
import { DocumentIndex } from '../../src/domain/document/index/DocumentIndex.js';
import type { RdlcNode } from '../../src/domain/document/tree/RdlcNode.js';
import { TrueFormatXmlAdapter } from '../../src/infrastructure/rdlc/TrueFormatXmlAdapter.js';
import { LibXml2SchemaValidatorAdapter } from '../../src/infrastructure/validation/LibXml2SchemaValidatorAdapter.js';
import { corpusByName } from '../golden/fixtures.js';

/**
 * `setRunLabel` (etiqueta de diseñador `<Label>` de un TextRun): es lo que
 * BC/RB muestra en lugar de la expresión. Va **antes** del `<Value>` (orden del
 * XSD) y el undo es byte-exacto también al crear y al quitar el nodo.
 */

const adapter = new TrueFormatXmlAdapter();
const validator = new LibXml2SchemaValidatorAdapter(
  resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../../resources/rdl2016/ReportDefinition2016.xsd',
  ),
);

/** Textbox con dos runs: el [0] lleva etiqueta y el [1] no. */
const SOURCE = `<?xml version="1.0" encoding="utf-8"?>
<Report xmlns="http://schemas.microsoft.com/sqlserver/reporting/2016/01/reportdefinition">
  <ReportSections>
    <ReportSection>
      <Body>
        <ReportItems>
          <Textbox Name="T">
            <Paragraphs>
              <Paragraph><TextRuns><TextRun><Label>Old</Label><Value>=Fields!A.Value</Value></TextRun><TextRun><Value>=Fields!B.Value</Value></TextRun></TextRuns></Paragraph>
            </Paragraphs>
          </Textbox>
        </ReportItems>
      </Body>
    </ReportSection>
  </ReportSections>
</Report>`;

function open(name: string): {
  xml: string;
  doc: ReturnType<TrueFormatXmlAdapter['parse']>;
  index: DocumentIndex;
} {
  const { xml } = corpusByName(name);
  const doc = adapter.parse(xml);
  return { xml, doc, index: DocumentIndex.build(doc.root) };
}

function parse(source: string): {
  doc: ReturnType<TrueFormatXmlAdapter['parse']>;
  index: DocumentIndex;
} {
  const doc = adapter.parse(source);
  return { doc, index: DocumentIndex.build(doc.root) };
}

function runAt(index: DocumentIndex, id: string, p: number, r: number): RdlcNode | undefined {
  const paragraph = index.get(id)?.child('Paragraphs')?.children('Paragraph')[p];
  return paragraph?.child('TextRuns')?.children('TextRun')[r];
}

/** Primer run del corpus sin etiqueta (para probar la creación sobre BC real). */
function firstRunWithoutLabel(index: DocumentIndex): { id: string; run: RdlcNode } {
  for (const name of index.names()) {
    const node = index.get(name);
    if (!node || node.tagName !== 'Textbox') continue;
    const run = runAt(index, name, 0, 0);
    if (run && !run.child('Label')) return { id: name, run };
  }
  throw new Error('El corpus no tiene Textbox con un run sin etiqueta');
}

describe('setRunLabel · etiqueta de diseñador del run', () => {
  it('crea la etiqueta delante del Value cuando no existe (y valida el XSD)', () => {
    const { doc, index } = parse(SOURCE);
    const applied = applyCommand(
      { root: doc.root, index },
      { cmd: 'setRunLabel', id: 'T', p: 0, r: 1, label: 'B' },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    const run = runAt(index, 'T', 0, 1)!;
    // Orden del XSD: `Label` antes de `Value`.
    expect(run.children().map((child) => child.tagName)).toEqual(['Label', 'Value']);
    expect(run.child('Label')?.text()).toBe('B');

    const output = adapter.serialize(doc);
    expect(output).toContain('<TextRun><Label>B</Label><Value>=Fields!B.Value</Value></TextRun>');
    const problems = validator.validate(output).problems;
    expect(problems, problems.join(' | ')).toEqual([]);

    const undone = undoAll({ root: doc.root, index }, applied.value);
    expect(undone.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(SOURCE);
  });

  it('cambia y quita la etiqueta existente (undo byte-exacto en ambos casos)', () => {
    const changed = parse(SOURCE);
    const change = applyCommand(
      { root: changed.doc.root, index: changed.index },
      { cmd: 'setRunLabel', id: 'T', p: 0, r: 0, label: 'Nuevo' },
    );
    expect(change.isRight()).toBe(true);
    if (!change.isRight()) return;
    expect(runAt(changed.index, 'T', 0, 0)?.child('Label')?.text()).toBe('Nuevo');
    expect(undoAll({ root: changed.doc.root, index: changed.index }, change.value).isRight()).toBe(
      true,
    );
    expect(adapter.serialize(changed.doc)).toBe(SOURCE);

    const removed = parse(SOURCE);
    const remove = applyCommand(
      { root: removed.doc.root, index: removed.index },
      { cmd: 'setRunLabel', id: 'T', p: 0, r: 0, label: null },
    );
    expect(remove.isRight()).toBe(true);
    if (!remove.isRight()) return;
    expect(runAt(removed.index, 'T', 0, 0)?.child('Label')).toBeUndefined();
    expect(adapter.serialize(removed.doc)).toContain('<TextRun><Value>=Fields!A.Value</Value>');
    expect(undoAll({ root: removed.doc.root, index: removed.index }, remove.value).isRight()).toBe(
      true,
    );
    expect(adapter.serialize(removed.doc)).toBe(SOURCE);
  });

  it('quitar una etiqueta que no existe es un no-op sin inversos', () => {
    const { doc, index } = parse(SOURCE);
    const applied = applyCommand(
      { root: doc.root, index },
      { cmd: 'setRunLabel', id: 'T', p: 0, r: 1, label: null },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;
    expect(applied.value.inverse).toHaveLength(0);
    expect(adapter.serialize(doc)).toBe(SOURCE);
  });

  it('rechaza elementos y runs inexistentes', () => {
    const { doc, index } = parse(SOURCE);
    const ctx = { root: doc.root, index };

    for (const command of [
      { cmd: 'setRunLabel' as const, id: 'Nope', p: 0, r: 0, label: 'X' },
      { cmd: 'setRunLabel' as const, id: 'T', p: 9, r: 0, label: 'X' },
    ]) {
      const result = applyCommand(ctx, command);
      expect(result.isLeft()).toBe(true);
      if (result.isLeft()) expect(result.value.code).toBe('E_COMMAND_REJECTED');
    }
  });

  it('sobre un Textbox real del corpus (validación XSD incluida)', () => {
    const { xml, doc, index } = open('PalletOutput.rdlc');
    const { id } = firstRunWithoutLabel(index);

    const applied = applyCommand(
      { root: doc.root, index },
      { cmd: 'setRunLabel', id, p: 0, r: 0, label: 'OrderDate' },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    expect(runAt(index, id, 0, 0)?.child('Label')?.text()).toBe('OrderDate');
    const output = adapter.serialize(doc);
    const problems = validator.validate(output).problems;
    expect(problems, problems.join(' | ')).toEqual([]);

    const undone = undoAll({ root: doc.root, index }, applied.value);
    expect(undone.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(xml);
  });
});
