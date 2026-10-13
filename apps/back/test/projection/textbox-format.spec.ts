import { describe, expect, it } from 'vitest';
import type { ItemDto, ProjectionDto, TextboxDto } from '@rdlc-designer/contracts';
import { TrueFormatProjectionAdapter } from '../../src/infrastructure/rdlc/TrueFormatProjectionAdapter.js';
import { TrueFormatXmlAdapter } from '../../src/infrastructure/rdlc/TrueFormatXmlAdapter.js';
import { corpusByName } from '../golden/fixtures.js';

/**
 * F1 · proyección de `<Format>` (doc `docs/features/0003-formato-numerico.md`).
 *
 * El front resuelve la precedencia run > párrafo > item sobre la proyección,
 * así que los tres niveles deben exponer `style.format`. BC escribe el formato
 * en el run: en el corpus aparece ahí, a veces con expresiones y comillas.
 */

const xmlAdapter = new TrueFormatXmlAdapter();
const projectionAdapter = new TrueFormatProjectionAdapter();

function project(xml: string): ProjectionDto {
  return projectionAdapter.project({
    sessionId: 'test',
    filePath: 'test.rdlc',
    document: xmlAdapter.parse(xml),
    version: 1,
  });
}

/** Recorre items, rectángulos, celdas de Tablix y cabeceras. */
function allItems(projection: ProjectionDto): ItemDto[] {
  const found: ItemDto[] = [];
  const walk = (items: ItemDto[]): void => {
    for (const item of items) {
      found.push(item);
      if (item.kind === 'rectangle') walk(item.children);
      if (item.kind === 'tablix') {
        for (const row of item.body.rows) {
          for (const cell of row.cells) if (cell?.content) walk([cell.content]);
        }
        for (const band of [...(item.headers?.columns ?? []), ...(item.headers?.rows ?? [])]) {
          for (const cell of band.cells) if (cell) walk([cell]);
        }
        for (const row of item.headers?.corner ?? []) {
          for (const cell of row) if (cell) walk([cell]);
        }
      }
    }
  };
  walk(projection.page.header.items);
  walk(projection.page.body.items);
  walk(projection.page.footer.items);
  return found;
}

function textboxOf(projection: ProjectionDto, id: string): TextboxDto | undefined {
  return allItems(projection).find(
    (item): item is TextboxDto => item.kind === 'textbox' && item.id === id,
  );
}

describe('proyección · <Format>', () => {
  it('expone format en item, párrafo y run', () => {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<Report xmlns="http://schemas.microsoft.com/sqlserver/reporting/2016/01/reportdefinition">
  <ReportSections>
    <ReportSection>
      <Body>
        <ReportItems>
          <Textbox Name="T">
            <Paragraphs>
              <Paragraph>
                <TextRuns>
                  <TextRun><Value>a</Value><Style><Format>N2</Format></Style></TextRun>
                  <TextRun><Value>b</Value><Style /></TextRun>
                </TextRuns>
                <Style><Format>P0</Format></Style>
              </Paragraph>
            </Paragraphs>
            <Style><Format>C2</Format></Style>
          </Textbox>
        </ReportItems>
      </Body>
    </ReportSection>
  </ReportSections>
</Report>`;

    const textbox = textboxOf(project(xml), 'T');
    expect(textbox?.style?.format).toBe('C2');
    expect(textbox?.paragraphs[0]?.style?.format).toBe('P0');
    expect(textbox?.paragraphs[0]?.runs[0]?.style?.format).toBe('N2');
    expect(textbox?.paragraphs[0]?.runs[1]?.style?.format).toBeUndefined();
  });

  it('un <Format /> vacío no se proyecta (equivale a «General»)', () => {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<Report xmlns="http://schemas.microsoft.com/sqlserver/reporting/2016/01/reportdefinition">
  <ReportSections>
    <ReportSection>
      <Body>
        <ReportItems>
          <Textbox Name="T">
            <Paragraphs>
              <Paragraph>
                <TextRuns><TextRun><Value>a</Value><Style><Format /></Style></TextRun></TextRuns>
              </Paragraph>
            </Paragraphs>
          </Textbox>
        </ReportItems>
      </Body>
    </ReportSection>
  </ReportSections>
</Report>`;

    const textbox = textboxOf(project(xml), 'T');
    expect(textbox?.paragraphs[0]?.runs[0]?.style?.format).toBeUndefined();
  });

  it('lee el formato del corpus con la expresión intacta (comillas incluidas)', () => {
    const projection = project(corpusByName('SalesInvoiceESP.rdlc').xml);

    const quantity = textboxOf(projection, 'Quantity_Line');
    expect(quantity?.paragraphs[0]?.runs[0]?.style?.format).toBe(
      '=Fields!BTCQtyIntegerFormat.Value',
    );

    // Textbox146: dos runs con el mismo formato-expresión y uno sin él (mixto).
    const mixed = textboxOf(projection, 'Textbox146');
    expect(mixed?.paragraphs[0]?.runs.map((run) => run.style?.format)).toEqual([
      '=First(Fields!BTCFormatcurrency_Lbl.Value, "DataSet_Result")',
      '=First(Fields!BTCFormatcurrency_Lbl.Value, "DataSet_Result")',
      undefined,
    ]);
  });
});
