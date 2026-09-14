import { describe, expect, it } from 'vitest';
import type { ItemDto, ProjectionDto, TablixDto } from '@rdlc-designer/contracts';
import { TrueFormatProjectionAdapter } from '../../src/infrastructure/rdlc/TrueFormatProjectionAdapter.js';
import { TrueFormatXmlAdapter } from '../../src/infrastructure/rdlc/TrueFormatXmlAdapter.js';
import { corpusByName } from '../golden/fixtures.js';

/**
 * Regresión: en RDL, el contenido de una celda de Tablix **no declara tamaño**
 * (lo define la celda, con ColSpan/RowSpan). Si la proyección no lo hereda, el
 * item se dibuja 0×0 y la celda aparece en blanco.
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
  walk(
    [...projection.page.header.items, ...projection.page.body.items, ...projection.page.footer.items],
    (item) => items.push(item),
  );
  return items;
}

describe('proyección · geometría de celdas de Tablix', () => {
  it('el contenido de las celdas hereda el tamaño de la celda (no 0×0)', () => {
    const projection = project('SalesInvoiceESP.rdlc');
    const items = allItems(projection);
    const tablix = items.find(
      (item): item is TablixDto => item.kind === 'tablix' && item.id === 'LinesTable',
    );
    expect(tablix).toBeDefined();

    const cell = tablix!.body.rows[0]?.cells[0];
    expect(cell?.content).toBeDefined();
    expect(cell!.content!.width.value).toBeGreaterThan(0);
    expect(cell!.content!.height.value).toBeGreaterThan(0);
  });

  it('no confunde ColSpan/RowSpan/Height con el contenido de la celda', () => {
    const projection = project('SalesInvoiceESP.rdlc');
    const unknowns = allItems(projection).filter(
      (item) => item.kind === 'unknown' && /ColSpan|RowSpan/.test(item.tagName),
    );
    expect(unknowns).toHaveLength(0);
  });

  it('las celdas con ColSpan reflejan el ancho sumado de sus columnas', () => {
    const projection = project('SalesInvoiceESP.rdlc');
    const tablixes = allItems(projection).filter((item): item is TablixDto => item.kind === 'tablix');
    const spanned = tablixes.flatMap((tablix) => tablix.body.rows.flatMap((row) => row.cells)).find(
      (cell) => (cell.colSpan ?? 1) > 1 && cell.content !== null,
    );
    expect(spanned).toBeDefined();

    const content = spanned!.content!;
    // Un item con ColSpan debe ser más ancho que la primera columna suelta.
    expect(content.width.value).toBeGreaterThan(0);
  });

  it('PalletOutput: el textbox dentro de rectángulo dentro de celda también tiene tamaño', () => {
    const projection = project('PalletOutput.rdlc');
    const items = allItems(projection);
    const textbox = items.find((item) => item.id === 'Textbox25');
    expect(textbox).toBeDefined();
    expect(textbox!.width.value).toBeGreaterThan(0);
    expect(textbox!.height.value).toBeGreaterThan(0);
  });
});
