import type { RdlcNode } from '../../../src/domain/document/tree/RdlcNode.js';
import { TrueFormatXmlAdapter } from '../../../src/infrastructure/rdlc/TrueFormatXmlAdapter.js';

/**
 * Utilidades de los specs del lint: construyen un informe RDL mínimo a partir
 * de fragmentos XML y devuelven su `<Report>`. Las expresiones se escriben ya
 * escapadas (`&lt;`, `&amp;`) porque son XML.
 */

const adapter = new TrueFormatXmlAdapter();

export interface ReportParts {
  /** Items del `<Body>`. */
  items?: string;
  /** Items de `<PageHeader>` (si se pasa, la cabecera se declara). */
  header?: string;
  /** Items de `<PageFooter>` (si se pasa, el pie se declara). */
  footer?: string;
  /** Contenido de `<DataSets>` (`<DataSet>…</DataSet>`). */
  dataSets?: string;
  /** Texto VB del bloque `<Code>`. */
  code?: string;
}

export function reportRoot(parts: ReportParts = {}): RdlcNode {
  const header =
    parts.header !== undefined
      ? `<PageHeader><Height>1cm</Height><ReportItems>${parts.header}</ReportItems></PageHeader>`
      : '';
  const footer =
    parts.footer !== undefined
      ? `<PageFooter><Height>1cm</Height><ReportItems>${parts.footer}</ReportItems></PageFooter>`
      : '';
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<Report xmlns="http://schemas.microsoft.com/sqlserver/reporting/2016/01/reportdefinition">
  <ReportSections>
    <ReportSection>
      <Body>
        <ReportItems>${parts.items ?? ''}</ReportItems>
        <Height>5cm</Height>
      </Body>
      <Width>10cm</Width>
      <Page>${header}${footer}</Page>
    </ReportSection>
  </ReportSections>
  <Code>${parts.code ?? ''}</Code>
  <DataSets>${parts.dataSets ?? ''}</DataSets>
</Report>`;
  return adapter.parse(xml).root;
}

/** `DataSet` con los campos indicados (sin consulta). */
export function dataSet(name: string, fields: string[]): string {
  const list = fields.map((f) => `<Field Name="${f}"><DataField>${f}</DataField></Field>`).join('');
  return `<DataSet Name="${name}"><Fields>${list}</Fields></DataSet>`;
}

/** Textbox con un único TextRun cuyo `Value` es `value`. */
export function textbox(name: string, value: string, extra = ''): string {
  return `<Textbox Name="${name}"><Paragraphs><Paragraph><TextRuns><TextRun><Value>${value}</Value></TextRun></TextRuns></Paragraph></Paragraphs>${extra}</Textbox>`;
}
