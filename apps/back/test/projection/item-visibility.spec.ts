import { describe, expect, it } from 'vitest';
import type { ItemDto, ProjectionDto } from '@rdlc-designer/contracts';
import { TrueFormatProjectionAdapter } from '../../src/infrastructure/rdlc/TrueFormatProjectionAdapter.js';
import { TrueFormatXmlAdapter } from '../../src/infrastructure/rdlc/TrueFormatXmlAdapter.js';
import { corpusByName } from '../golden/fixtures.js';

/**
 * Visibilidad de los items (`<Visibility><Hidden>`): en RDL el `Hidden` cuelga
 * de `Visibility`, **no** es hijo directo del item. Buscarlo como hijo directo
 * dejaba `hidden` siempre indefinido y el lienzo no podía atenuar los items
 * ocultos (bug real: `BTC_PickUpGroupKeyCtx` de `BTCLoadingOrder`).
 *
 * Los valores con expresión (`=IIF(...)`) se proyectan tal cual: en diseño no se
 * evalúan (RB tampoco), así que el lienzo los pinta normales.
 */

const xmlAdapter = new TrueFormatXmlAdapter();
const projectionAdapter = new TrueFormatProjectionAdapter();

function project(name: string): ProjectionDto {
  const { xml } = corpusByName(name);
  const doc = xmlAdapter.parse(xml);
  return projectionAdapter.project({
    sessionId: 'test',
    filePath: name,
    document: doc,
    version: 1,
  });
}

function walk(items: ItemDto[], visit: (item: ItemDto) => void): void {
  for (const item of items) {
    visit(item);
    if (item.kind === 'rectangle') walk(item.children, visit);
    if (item.kind === 'tablix') {
      for (const row of item.body.rows) {
        for (const cell of row.cells) {
          if (cell?.content) walk([cell.content], visit);
        }
      }
    }
  }
}

function allItems(projection: ProjectionDto): ItemDto[] {
  const items: ItemDto[] = [];
  walk(projection.page.body.items, (item) => items.push(item));
  return items;
}

function byId(items: ItemDto[], id: string): ItemDto | undefined {
  return items.find((item) => item.id === id);
}

describe('proyección · visibilidad de items', () => {
  it('proyecta Hidden literal (true) de un Textbox dentro de una celda', () => {
    const items = allItems(project('BTCLoadingOrder.rdlc'));
    expect(byId(items, 'BTC_PickUpGroupKeyCtx')?.hidden).toBe(true);
  });

  it('proyecta Hidden con expresión de un Textbox y de un Tablix', () => {
    const textbox = byId(allItems(project('BTCLoadingOrder.rdlc')), 'Textbox3')?.hidden;
    expect(typeof textbox).toBe('string');
    expect(String(textbox).startsWith('=')).toBe(true);

    const tablix = byId(allItems(project('SalesCreditMemoESP.rdlc')), 'LinesTable')?.hidden;
    expect(typeof tablix).toBe('string');
    expect(String(tablix).startsWith('=')).toBe(true);
  });

  it('no inventa visibilidad cuando no hay Visibility', () => {
    const items = allItems(project('SalesCreditMemoESP.rdlc'));
    expect(byId(items, 'Textbox4')?.hidden).toBeUndefined();
  });
});
