import type { ImageDto } from '@rdlc-designer/contracts';
import { describe, expect, it } from 'vitest';
import { TrueFormatProjectionAdapter } from '../../src/infrastructure/rdlc/TrueFormatProjectionAdapter.js';
import { TrueFormatXmlAdapter } from '../../src/infrastructure/rdlc/TrueFormatXmlAdapter.js';

/**
 * G13 · imágenes embebidas: el catálogo `<EmbeddedImages>` se proyecta (solo
 * nombre y MIME; el `ImageData` base64 no viaja) y una imagen con
 * `Source=Embedded` apunta a una entrada por su `<Value>`.
 */

const adapter = new TrueFormatXmlAdapter();
const projectionAdapter = new TrueFormatProjectionAdapter();

const XML = `<?xml version="1.0" encoding="utf-8"?>
<Report xmlns="http://schemas.microsoft.com/sqlserver/reporting/2016/01/reportdefinition">
  <EmbeddedImages>
    <EmbeddedImage Name="Logo">
      <MIMEType>image/png</MIMEType>
      <ImageData>AAAA</ImageData>
    </EmbeddedImage>
    <EmbeddedImage Name="Firma">
      <MIMEType>image/jpeg</MIMEType>
      <ImageData>BBBB</ImageData>
    </EmbeddedImage>
  </EmbeddedImages>
  <ReportSections>
    <ReportSection>
      <Body>
        <ReportItems>
          <Image Name="ImgLogo">
            <Source>Embedded</Source>
            <Value>Logo</Value>
            <Sizing>FitProportional</Sizing>
            <Top>1cm</Top>
            <Left>1cm</Left>
            <Height>2cm</Height>
            <Width>2cm</Width>
          </Image>
        </ReportItems>
        <Height>5cm</Height>
      </Body>
    </ReportSection>
  </ReportSections>
</Report>`;

function project() {
  return projectionAdapter.project({
    sessionId: 'test',
    filePath: 'Embedded.rdlc',
    document: adapter.parse(XML),
    version: 1,
  });
}

describe('G13 · imágenes embebidas', () => {
  it('proyecta el catálogo (nombre + MIME, sin ImageData)', () => {
    expect(project().meta.embeddedImages).toEqual([
      { name: 'Logo', mimeType: 'image/png' },
      { name: 'Firma', mimeType: 'image/jpeg' },
    ]);
  });

  it('la imagen Embedded apunta a la entrada por su Value', () => {
    const image = project().page.body.items[0] as ImageDto;
    expect(image.kind).toBe('image');
    expect(image.source).toBe('Embedded');
    expect(image.value).toBe('Logo');
  });
});
