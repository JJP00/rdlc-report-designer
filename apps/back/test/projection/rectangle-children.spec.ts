import { describe, expect, it } from 'vitest';
import type { ItemDto, ProjectionDto } from '@rdlc-designer/contracts';
import { TrueFormatProjectionAdapter } from '../../src/infrastructure/rdlc/TrueFormatProjectionAdapter.js';
import { TrueFormatXmlAdapter } from '../../src/infrastructure/rdlc/TrueFormatXmlAdapter.js';
import { BLANK_REPORT_XML } from '../../src/domain/document/templates/blankReport.js';

/**
 * Regresión (BTCSalesQuote · `VATSpec`/`Tablix3`): en RDL las coordenadas de un
 * item son **relativas a su contenedor**. Report Builder/BC omiten el `Top`
 * cuando vale 0, y RB lo muestra como 0cm; la proyección lo heredaba del
 * rectángulo contenedor (2.85767cm), así que el panel y el lienzo los colocaban
 * desplazados (y arrastrarlos escribía esa Y falsa en el fichero).
 */

const xmlAdapter = new TrueFormatXmlAdapter();
const projectionAdapter = new TrueFormatProjectionAdapter();

const REPORT_XML = BLANK_REPORT_XML.replace(
  '<Body>',
  `<Body>
        <ReportItems>
          <Rectangle Name="Rectangle3">
            <ReportItems>
              <Tablix Name="Tablix3">
                <TablixBody>
                  <TablixColumns>
                    <TablixColumn><Width>2cm</Width></TablixColumn>
                  </TablixColumns>
                  <TablixRows>
                    <TablixRow>
                      <Height>0.5cm</Height>
                      <TablixCells>
                        <TablixCell>
                          <CellContents>
                            <Textbox Name="Celda1">
                              <Paragraphs><Paragraph><TextRuns><TextRun><Value>x</Value><Style /></TextRun></TextRuns><Style /></Paragraph></Paragraphs>
                              <Style />
                            </Textbox>
                          </CellContents>
                        </TablixCell>
                      </TablixCells>
                    </TablixRow>
                  </TablixRows>
                </TablixBody>
                <Left>6.12885cm</Left>
                <Height>0.99596cm</Height>
                <Width>12.10768cm</Width>
                <Style><Border><Style>None</Style></Border></Style>
              </Tablix>
              <Textbox Name="Suelto">
                <Paragraphs><Paragraph><TextRuns><TextRun><Value>x</Value><Style /></TextRun></TextRuns><Style /></Paragraph></Paragraphs>
                <Height>1cm</Height>
                <Width>4cm</Width>
                <Style />
              </Textbox>
              <Textbox Name="ConTop">
                <Paragraphs><Paragraph><TextRuns><TextRun><Value>x</Value><Style /></TextRun></TextRuns><Style /></Paragraph></Paragraphs>
                <Top>1cm</Top>
                <Left>2cm</Left>
                <Height>1cm</Height>
                <Width>3cm</Width>
                <Style />
              </Textbox>
              <Textbox Name="SinLeft">
                <Paragraphs><Paragraph><TextRuns><TextRun><Value>x</Value><Style /></TextRun></TextRuns><Style /></Paragraph></Paragraphs>
                <Top>0.5cm</Top>
                <Height>1cm</Height>
                <Width>3cm</Width>
                <Style />
              </Textbox>
            </ReportItems>
            <Top>2.85767cm</Top>
            <Left>0.02694cm</Left>
            <Height>3.51781cm</Height>
            <Width>18.23653cm</Width>
            <Style><Border><Style>None</Style></Border></Style>
          </Rectangle>
        </ReportItems>`,
);

function project(): ProjectionDto {
  const doc = xmlAdapter.parse(REPORT_XML);
  return projectionAdapter.project({
    sessionId: 'test',
    filePath: 'regresion.rdlc',
    document: doc,
    version: 1,
  });
}

function itemById(projection: ProjectionDto, id: string): ItemDto | undefined {
  const body = projection.page.body.items;
  const rectangle = body.find((item) => item.id === 'Rectangle3');
  const children = rectangle?.kind === 'rectangle' ? rectangle.children : [];
  return [...body, ...children].find((item) => item.id === id);
}

describe('proyección · hijos de un rectángulo sin Top/Left', () => {
  const projection = project();

  it('un item sin `Top`/`Left` va al origen de su rectángulo (0cm), no a la posición del padre', () => {
    const tablix = itemById(projection, 'Tablix3');
    expect(tablix).toBeDefined();
    expect(tablix?.top).toEqual({ value: 0, unit: 'cm' });
    expect(tablix?.left).toEqual({ value: 6.12885, unit: 'cm' });

    const suelto = itemById(projection, 'Suelto');
    expect(suelto?.top).toEqual({ value: 0, unit: 'cm' });
    expect(suelto?.left).toEqual({ value: 0, unit: 'cm' });
  });

  it('conserva las coordenadas declaradas del hijo y las del propio rectángulo', () => {
    const rectangle = itemById(projection, 'Rectangle3');
    expect(rectangle?.kind).toBe('rectangle');
    expect(rectangle?.top).toEqual({ value: 2.85767, unit: 'cm' });
    expect(rectangle?.left).toEqual({ value: 0.02694, unit: 'cm' });

    const conTop = itemById(projection, 'ConTop');
    expect(conTop?.top).toEqual({ value: 1, unit: 'cm' });
    expect(conTop?.left).toEqual({ value: 2, unit: 'cm' });

    // Caso más frecuente del corpus (BC omite `Left` cuando vale 0).
    const sinLeft = itemById(projection, 'SinLeft');
    expect(sinLeft?.top).toEqual({ value: 0.5, unit: 'cm' });
    expect(sinLeft?.left).toEqual({ value: 0, unit: 'cm' });
  });
});
