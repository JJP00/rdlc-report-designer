import { describe, expect, it } from 'vitest';
import type { ProjectionDto, TextboxDto } from '@rdlc-designer/contracts';
import { TrueFormatProjectionAdapter } from '../../src/infrastructure/rdlc/TrueFormatProjectionAdapter.js';
import { TrueFormatXmlAdapter } from '../../src/infrastructure/rdlc/TrueFormatXmlAdapter.js';

/**
 * `ListStyle` (viñetas/numeración) es un **hijo directo de `<Paragraph>`** en
 * RDL 2016, no una propiedad de `<Style>` (donde el XSD lo rechaza).
 */

const xmlAdapter = new TrueFormatXmlAdapter();
const projectionAdapter = new TrueFormatProjectionAdapter();

function textboxOf(paragraph: string): TextboxDto | undefined {
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<Report xmlns="http://schemas.microsoft.com/sqlserver/reporting/2016/01/reportdefinition">
  <ReportSections>
    <ReportSection>
      <Body>
        <ReportItems>
          <Textbox Name="T">
            <Paragraphs>
              ${paragraph}
            </Paragraphs>
            <Style>
              <FontSize>8pt</FontSize>
            </Style>
          </Textbox>
        </ReportItems>
      </Body>
      </ReportSection>
  </ReportSections>
</Report>`;
  const doc = xmlAdapter.parse(xml);
  const projection: ProjectionDto = projectionAdapter.project({
    sessionId: 'test',
    filePath: 'test.rdlc',
    document: doc,
    version: 1,
  });
  return projection.page.body.items.find((item): item is TextboxDto => item.kind === 'textbox');
}

describe('proyección · ListStyle del párrafo', () => {
  it('lee el ListStyle directo del <Paragraph>', () => {
    const textbox = textboxOf(
      '<Paragraph><TextRuns><TextRun><Value>x</Value></TextRun></TextRuns><ListStyle>Bulleted</ListStyle></Paragraph>',
    );
    expect(textbox?.paragraphs[0]?.style?.listStyle).toBe('Bulleted');
  });

  it('ignora el ListStyle legado dentro de <Style>', () => {
    const textbox = textboxOf(
      '<Paragraph><TextRuns><TextRun><Value>x</Value></TextRun></TextRuns><Style><ListStyle>Numbered</ListStyle></Style></Paragraph>',
    );
    expect(textbox?.paragraphs[0]?.style?.listStyle).toBeUndefined();
    expect(textbox?.style?.listStyle).toBeUndefined();
  });
});
