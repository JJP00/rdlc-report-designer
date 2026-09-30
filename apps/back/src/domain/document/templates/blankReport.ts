/**
 * Plantilla de un informe **nuevo en blanco** (RDL 2016/01, XSD válido):
 * cuerpo vacío de 2 cm con el estilo mínimo y página A4 vertical con márgenes
 * de 2 cm. Es la que escribe `SessionService.createNew` antes de abrir el
 * fichero; a partir de ahí todo son comandos normales (insertar, página…).
 */
export const BLANK_REPORT_XML = `<?xml version="1.0" encoding="utf-8"?>
<Report xmlns="http://schemas.microsoft.com/sqlserver/reporting/2016/01/reportdefinition" xmlns:rd="http://schemas.microsoft.com/SQLServer/reporting/reportdesigner">
  <AutoRefresh>0</AutoRefresh>
  <DataSources>
    <DataSource Name="DataSource">
      <ConnectionProperties>
        <DataProvider>SQL</DataProvider>
        <ConnectString />
      </ConnectionProperties>
      <rd:SecurityType>None</rd:SecurityType>
      <rd:DataSourceID>00000000-0000-0000-0000-000000000000</rd:DataSourceID>
    </DataSource>
  </DataSources>
  <ReportSections>
    <ReportSection>
      <Body>
        <Height>2cm</Height>
        <Style>
          <Border>
            <Style>None</Style>
          </Border>
        </Style>
      </Body>
      <Width>21cm</Width>
      <Page>
        <PageHeight>29.7cm</PageHeight>
        <PageWidth>21cm</PageWidth>
        <LeftMargin>2cm</LeftMargin>
        <RightMargin>2cm</RightMargin>
        <TopMargin>2cm</TopMargin>
        <BottomMargin>2cm</BottomMargin>
        <Style>
          <Border>
            <Style>None</Style>
          </Border>
        </Style>
      </Page>
    </ReportSection>
  </ReportSections>
</Report>
`;
