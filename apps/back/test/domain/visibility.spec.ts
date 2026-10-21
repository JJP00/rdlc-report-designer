import { describe, expect, it } from 'vitest';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { appliedOf, undoAll } from './command-test-utils.js';
import { applyCommand } from '../../src/domain/document/commands/applyCommand.js';
import { DocumentIndex } from '../../src/domain/document/index/DocumentIndex.js';
import type { RdlcNode } from '../../src/domain/document/tree/RdlcNode.js';
import { TrueFormatXmlAdapter } from '../../src/infrastructure/rdlc/TrueFormatXmlAdapter.js';
import { LibXml2SchemaValidatorAdapter } from '../../src/infrastructure/validation/LibXml2SchemaValidatorAdapter.js';
import { corpusByName } from '../golden/fixtures.js';

/**
 * `setVisibility`: escribe `<Visibility><Hidden>` (literal o expresión) y
 * `null` lo quita. El `Hidden` va antes de un `ToggleItem` (orden del XSD) y el
 * undo es byte-exacto.
 */

const adapter = new TrueFormatXmlAdapter();
const validator = new LibXml2SchemaValidatorAdapter(
  resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../../resources/rdl2016/ReportDefinition2016.xsd',
  ),
);

function open(name: string): {
  xml: string;
  doc: ReturnType<TrueFormatXmlAdapter['parse']>;
  index: DocumentIndex;
} {
  const { xml } = corpusByName(name);
  const doc = adapter.parse(xml);
  return { xml, doc, index: DocumentIndex.build(doc.root) };
}

function openXml(xml: string): {
  doc: ReturnType<TrueFormatXmlAdapter['parse']>;
  index: DocumentIndex;
} {
  const doc = adapter.parse(xml);
  return { doc, index: DocumentIndex.build(doc.root) };
}

function hiddenNode(node: RdlcNode | undefined): RdlcNode | undefined {
  return node?.child('Visibility')?.child('Hidden');
}

function expectValid(doc: ReturnType<TrueFormatXmlAdapter['parse']>): void {
  const problems = validator.validate(adapter.serialize(doc)).problems;
  expect(problems, problems.join(' | ')).toEqual([]);
}

describe('F1 · setVisibility', () => {
  it('crea Visibility/Hidden con literal true y el undo es exacto', () => {
    const { xml, doc, index } = open('SalesCreditMemoESP.rdlc');
    expect(index.get('Textbox4')?.child('Visibility')).toBeUndefined();

    const applied = applyCommand(
      { root: doc.root, index },
      { cmd: 'setVisibility', id: 'Textbox4', hidden: true },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    expect(appliedOf(applied.value, 'Textbox4')).toEqual({ hidden: true });
    expect(hiddenNode(index.get('Textbox4'))?.text()).toBe('true');
    expectValid(doc);

    const undone = undoAll({ root: doc.root, index }, applied.value);
    expect(undone.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(xml);
  });

  it('reescribe un Hidden existente (literal y expresión) con undo exacto', () => {
    const { xml, doc, index } = open('BTCLoadingOrder.rdlc');
    expect(hiddenNode(index.get('BTC_PickUpGroupKeyCtx'))?.text()).toBe('true');

    const literal = applyCommand(
      { root: doc.root, index },
      { cmd: 'setVisibility', id: 'BTC_PickUpGroupKeyCtx', hidden: false },
    );
    expect(literal.isRight()).toBe(true);
    if (!literal.isRight()) return;
    expect(hiddenNode(index.get('BTC_PickUpGroupKeyCtx'))?.text()).toBe('false');

    // Una expresión se escribe tal cual.
    const expression = applyCommand(
      { root: doc.root, index },
      { cmd: 'setVisibility', id: 'BTC_PickUpGroupKeyCtx', hidden: '=Fields!X.Value = "S"' },
    );
    expect(expression.isRight()).toBe(true);
    if (!expression.isRight()) return;
    expect(hiddenNode(index.get('BTC_PickUpGroupKeyCtx'))?.text()).toBe('=Fields!X.Value = "S"');
    expectValid(doc);

    // Deshacer en orden inverso al de aplicación.
    const undoExpression = undoAll({ root: doc.root, index }, expression.value);
    expect(undoExpression.isRight()).toBe(true);
    expect(hiddenNode(index.get('BTC_PickUpGroupKeyCtx'))?.text()).toBe('false');
    const undoLiteral = undoAll({ root: doc.root, index }, literal.value);
    expect(undoLiteral.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(xml);
  });

  it('con null quita el Hidden y, si el Visibility queda vacío, también el bloque', () => {
    const { xml, doc, index } = open('BTCLoadingOrder.rdlc');

    const applied = applyCommand(
      { root: doc.root, index },
      { cmd: 'setVisibility', id: 'BTC_PickUpGroupKeyCtx', hidden: null },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    expect(index.get('BTC_PickUpGroupKeyCtx')?.child('Visibility')).toBeUndefined();
    expectValid(doc);

    const undone = undoAll({ root: doc.root, index }, applied.value);
    expect(undone.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(xml);
  });

  it('rechaza una expresión vacía sin tocar el documento', () => {
    const { xml, doc, index } = open('SalesCreditMemoESP.rdlc');
    const applied = applyCommand(
      { root: doc.root, index },
      { cmd: 'setVisibility', id: 'Textbox4', hidden: '   ' },
    );
    expect(applied.isLeft()).toBe(true);
    if (applied.isLeft()) expect(applied.value.reason).toBe('visibilityExpressionEmpty');
    expect(adapter.serialize(doc)).toBe(xml);
  });
});

const TOGGLE_XML = `<?xml version="1.0" encoding="utf-8"?>
<Report xmlns="http://schemas.microsoft.com/sqlserver/reporting/2016/01/reportdefinition">
  <ReportSections>
    <ReportSection>
      <Body>
        <ReportItems>
          <Textbox Name="T">
            <Visibility>
              <ToggleItem>Toggle</ToggleItem>
            </Visibility>
            <Paragraphs><Paragraph><TextRuns><TextRun><Value>x</Value></TextRun></TextRuns></Paragraph></Paragraphs>
          </Textbox>
        </ReportItems>
        <Height>5cm</Height>
      </Body>
    </ReportSection>
  </ReportSections>
</Report>`;

describe('F1 · setVisibility con ToggleItem', () => {
  it('inserta el Hidden antes del ToggleItem y quitar solo el Hidden lo respeta', () => {
    const { doc, index } = openXml(TOGGLE_XML);
    const before = adapter.serialize(doc);

    const applied = applyCommand(
      { root: doc.root, index },
      { cmd: 'setVisibility', id: 'T', hidden: '=Fields!X.Value > 3' },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    const visibility = index.get('T')?.child('Visibility');
    expect(visibility?.children().map((child) => child.tagName)).toEqual(['Hidden', 'ToggleItem']);
    expectValid(doc);

    // Quitar con null respeta el ToggleItem: sigue habiendo Visibility.
    const cleared = applyCommand(
      { root: doc.root, index },
      { cmd: 'setVisibility', id: 'T', hidden: null },
    );
    expect(cleared.isRight()).toBe(true);
    if (!cleared.isRight()) return;
    expect(hiddenNode(index.get('T'))).toBeUndefined();
    expect(index.get('T')?.child('Visibility')?.child('ToggleItem')?.text()).toBe('Toggle');
    expectValid(doc);

    // Deshacer en orden inverso: vuelve el Hidden y luego todo el XML.
    const undoClear = undoAll({ root: doc.root, index }, cleared.value);
    expect(undoClear.isRight()).toBe(true);
    const undoWrite = undoAll({ root: doc.root, index }, applied.value);
    expect(undoWrite.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(before);
  });
});
