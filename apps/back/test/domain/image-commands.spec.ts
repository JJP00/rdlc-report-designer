import { describe, expect, it } from 'vitest';
import { applyCommand } from '../../src/domain/document/commands/applyCommand.js';
import { DocumentIndex } from '../../src/domain/document/index/DocumentIndex.js';
import { TrueFormatXmlAdapter } from '../../src/infrastructure/rdlc/TrueFormatXmlAdapter.js';
import { corpusByName } from '../golden/fixtures.js';
import { appliedOf, undoAll } from './command-test-utils.js';

/** F1 — opciones de `<Image>`: origen, campo/expresión, MIME y ajuste. */

const adapter = new TrueFormatXmlAdapter();

function open(name: string): {
  xml: string;
  doc: ReturnType<TrueFormatXmlAdapter['parse']>;
  index: DocumentIndex;
} {
  const { xml } = corpusByName(name);
  const doc = adapter.parse(xml);
  return { xml, doc, index: DocumentIndex.build(doc.root) };
}

describe('F1 · setImageOptions', () => {
  it('cambia origen/valor/MIME y el undo restaura los bytes exactos', () => {
    const { xml, doc, index } = open('SalesInvoiceESP.rdlc');

    const applied = applyCommand(
      { root: doc.root, index },
      {
        cmd: 'setImageOptions',
        id: 'Image1',
        source: 'Database',
        value: '=Fields!CompanyPicture.Value',
        mimeType: 'image/jpeg',
      },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    const output = adapter.serialize(doc);
    expect(output).toContain('<Value>=Fields!CompanyPicture.Value</Value>');
    expect(output).toContain('<MIMEType>image/jpeg</MIMEType>');
    expect(appliedOf(applied.value, 'Image1')).toMatchObject({
      source: 'Database',
      mimeType: 'image/jpeg',
    });

    const undone = undoAll({ root: doc.root, index }, applied.value);
    expect(undone.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(xml);
  });

  it('pasar a origen External con URL (y volver)', () => {
    const { xml, doc, index } = open('SalesShipment.rdlc');

    const applied = applyCommand(
      { root: doc.root, index },
      {
        cmd: 'setImageOptions',
        id: 'Image1',
        source: 'External',
        value: 'https://intranet/logo.png',
        mimeType: null,
      },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    const output = adapter.serialize(doc);
    expect(output).toContain('<Source>External</Source>');
    expect(output).toContain('<Value>https://intranet/logo.png</Value>');
    expect(output).not.toContain('<MIMEType>');

    const undone = undoAll({ root: doc.root, index }, applied.value);
    expect(undone.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(xml);
  });

  it('rechaza elementos que no son imágenes', () => {
    const { doc, index } = open('PalletOutput.rdlc');
    const result = applyCommand(
      { root: doc.root, index },
      { cmd: 'setImageOptions', id: 'Textbox25', source: 'Database' },
    );
    expect(result.isLeft()).toBe(true);
  });
});
