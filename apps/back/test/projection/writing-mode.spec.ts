import { describe, expect, it } from 'vitest';
import type { ItemDto } from '@rdlc-designer/contracts';
import { applyCommand } from '../../src/domain/document/commands/applyCommand.js';
import { DocumentIndex } from '../../src/domain/document/index/DocumentIndex.js';
import { TrueFormatProjectionAdapter } from '../../src/infrastructure/rdlc/TrueFormatProjectionAdapter.js';
import { TrueFormatXmlAdapter } from '../../src/infrastructure/rdlc/TrueFormatXmlAdapter.js';
import { corpusByName } from '../golden/fixtures.js';

/** `WritingMode` del `<Style>` del item: proyección de lectura (round trip del comando). */

const xmlAdapter = new TrueFormatXmlAdapter();
const projectionAdapter = new TrueFormatProjectionAdapter();

function projectedTextbox(
  name: string,
  id: string,
  writingMode: string | null,
): ItemDto | undefined {
  const { xml } = corpusByName(name);
  const doc = xmlAdapter.parse(xml);
  const index = DocumentIndex.build(doc.root);
  if (writingMode !== null) {
    const applied = applyCommand(
      { root: doc.root, index },
      { cmd: 'setStyle', id, style: { writingMode: writingMode as 'Vertical' } },
    );
    expect(applied.isRight()).toBe(true);
  }

  const reparsed = xmlAdapter.parse(xmlAdapter.serialize(doc));
  const projection = projectionAdapter.project({
    sessionId: 'test',
    filePath: name,
    document: reparsed,
    version: 1,
  });
  const found: ItemDto[] = [];
  const walk = (items: ItemDto[]): void => {
    for (const item of items) {
      if (item.id === id) found.push(item);
      if (item.kind === 'rectangle') walk(item.children);
      if (item.kind === 'tablix') {
        for (const row of item.body.rows) {
          for (const cell of row.cells) if (cell?.content) walk([cell.content]);
        }
      }
    }
  };
  walk([
    ...projection.page.header.items,
    ...projection.page.body.items,
    ...projection.page.footer.items,
  ]);
  return found[0];
}

describe('proyección de WritingMode', () => {
  it.each(['Default', 'Horizontal', 'Vertical', 'Rotate270'])(
    'lee %s del <Style> del textbox',
    (mode) => {
      const item = projectedTextbox('PalletOutput.rdlc', 'Textbox25', mode);
      expect(item?.style?.writingMode).toBe(mode);
    },
  );

  it('sin <WritingMode> no inventa valor', () => {
    const item = projectedTextbox('PalletOutput.rdlc', 'Textbox25', null);
    expect(item?.style?.writingMode).toBeUndefined();
  });
});
