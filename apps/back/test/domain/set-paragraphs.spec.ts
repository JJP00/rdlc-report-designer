import { describe, expect, it } from 'vitest';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { undoAll } from './command-test-utils.js';
import { applyCommand } from '../../src/domain/document/commands/applyCommand.js';
import { DocumentIndex } from '../../src/domain/document/index/DocumentIndex.js';
import { TrueFormatXmlAdapter } from '../../src/infrastructure/rdlc/TrueFormatXmlAdapter.js';
import { LibXml2SchemaValidatorAdapter } from '../../src/infrastructure/validation/LibXml2SchemaValidatorAdapter.js';
import { corpusByName } from '../golden/fixtures.js';

/**
 * `setParagraphs` (editor de texto): reemplaza los párrafos de un Textbox con
 * formato por run/párrafo. Un paso de undo, byte-exacto, y el XML resultante
 * valida el XSD (el guardado se bloquea si no).
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

describe('setParagraphs · texto mixto', () => {
  it('reemplaza los párrafos con runs, etiquetas y formato (y el undo es exacto)', () => {
    const { xml, doc, index } = open('SalesCreditMemoESP.rdlc');
    const applied = applyCommand(
      { root: doc.root, index },
      {
        cmd: 'setParagraphs',
        id: 'TextboxVATClauseDesc',
        paragraphs: [
          {
            style: { textAlign: 'Center' },
            runs: [
              { value: 'IVA: ' },
              {
                value: '=Fields!BTCVATClause_Code.Value',
                label: 'BTCVATClause_Code',
                style: { fontWeight: 'Bold', fontSize: { value: 9, unit: 'pt' } },
              },
            ],
          },
          { runs: [{ value: 'Segunda línea' }] },
        ],
      },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    const paragraphs = index
      .get('TextboxVATClauseDesc')
      ?.child('Paragraphs')
      ?.children('Paragraph');
    expect(paragraphs).toHaveLength(2);

    const runs = paragraphs![0]!.child('TextRuns')?.children('TextRun');
    expect(runs).toHaveLength(2);
    expect(runs![0]?.child('Value')?.text()).toBe('IVA: ');
    // La etiqueta de diseñador se conserva (BC la muestra en lugar del valor).
    expect(runs![1]?.child('Label')?.text()).toBe('BTCVATClause_Code');
    expect(runs![1]?.child('Value')?.text()).toBe('=Fields!BTCVATClause_Code.Value');
    expect(runs![1]?.child('Style')?.child('FontWeight')?.text()).toBe('Bold');
    expect(runs![1]?.child('Style')?.child('FontSize')?.text()).toBe('9pt');
    // El estilo del párrafo (alineación) va en su propio `<Style>`.
    expect(paragraphs![0]!.child('Style')?.child('TextAlign')?.text()).toBe('Center');
    expect(paragraphs![1]!.child('TextRuns')?.children('TextRun')).toHaveLength(1);

    const problems = validator.validate(adapter.serialize(doc)).problems;
    expect(problems, problems.join(' | ')).toEqual([]);

    const undone = undoAll({ root: doc.root, index }, applied.value);
    expect(undone.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(xml);
  });

  it('escribe ListStyle como hijo del Paragraph (no en su Style)', () => {
    const { doc, index } = open('SalesCreditMemoESP.rdlc');
    const applied = applyCommand(
      { root: doc.root, index },
      {
        cmd: 'setParagraphs',
        id: 'TextboxVATClauseDesc',
        paragraphs: [{ style: { listStyle: 'Bulleted' }, runs: [{ value: 'Primera' }] }],
      },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    const paragraph = index
      .get('TextboxVATClauseDesc')
      ?.child('Paragraphs')
      ?.children('Paragraph')[0];
    expect(paragraph?.child('ListStyle')?.text()).toBe('Bulleted');
    expect(paragraph?.child('Style')?.child('ListStyle')).toBeUndefined();

    const problems = validator.validate(adapter.serialize(doc)).problems;
    expect(problems, problems.join(' | ')).toEqual([]);
  });

  it('hereda las fuentes del item en los runs nuevos (RB las resuelve ahí)', () => {
    const source = `<?xml version="1.0" encoding="utf-8"?>
<Report xmlns="http://schemas.microsoft.com/sqlserver/reporting/2016/01/reportdefinition">
  <ReportSections>
    <ReportSection>
      <Body>
        <ReportItems>
          <Textbox Name="T">
            <Paragraphs>
              <Paragraph><TextRuns><TextRun><Value>x</Value></TextRun></TextRuns></Paragraph>
            </Paragraphs>
            <Style><FontSize>9pt</FontSize><FontWeight>Bold</FontWeight></Style>
          </Textbox>
        </ReportItems>
      </Body>
    </ReportSection>
  </ReportSections>
</Report>`;
    const doc = adapter.parse(source);
    const index = DocumentIndex.build(doc.root);

    const applied = applyCommand(
      { root: doc.root, index },
      { cmd: 'setParagraphs', id: 'T', paragraphs: [{ runs: [{ value: 'nuevo' }] }] },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    const output = adapter.serialize(doc);
    // El run nuevo hereda la fuente del item (BC la escribe en el run).
    expect(output).toMatch(
      /<TextRun><Value>nuevo<\/Value><Style><FontSize>9pt<\/FontSize><FontWeight>Bold<\/FontWeight><\/Style><\/TextRun>/,
    );
    const problems = validator.validate(output).problems;
    expect(problems, problems.join(' | ')).toEqual([]);

    const undone = undoAll({ root: doc.root, index }, applied.value);
    expect(undone.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(source);
  });

  it('rechaza elementos que no son Textbox y párrafos sin runs', () => {
    const { doc, index } = open('SalesCreditMemoESP.rdlc');

    const notTextbox = applyCommand(
      { root: doc.root, index },
      { cmd: 'setParagraphs', id: 'LinesTable', paragraphs: [{ runs: [{ value: 'x' }] }] },
    );
    expect(notTextbox.isLeft()).toBe(true);

    const noRuns = applyCommand(
      { root: doc.root, index },
      { cmd: 'setParagraphs', id: 'TextboxVATClauseDesc', paragraphs: [{ runs: [] }] },
    );
    expect(noRuns.isLeft()).toBe(true);

    const noParagraphs = applyCommand(
      { root: doc.root, index },
      { cmd: 'setParagraphs', id: 'TextboxVATClauseDesc', paragraphs: [] },
    );
    expect(noParagraphs.isLeft()).toBe(true);
  });
});
