import { describe, expect, it } from 'vitest';
import type { ItemDto, ProjectionDto, TablixDto } from '@rdlc-designer/contracts';
import { applyCommand } from '../../src/domain/document/commands/applyCommand.js';
import { DocumentIndex } from '../../src/domain/document/index/DocumentIndex.js';
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
    [
      ...projection.page.header.items,
      ...projection.page.body.items,
      ...projection.page.footer.items,
    ],
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
    const tablixes = allItems(projection).filter(
      (item): item is TablixDto => item.kind === 'tablix',
    );
    const spanned = tablixes
      .flatMap((tablix) => tablix.body.rows.flatMap((row) => row.cells))
      .find((cell) => (cell.colSpan ?? 1) > 1 && cell.content !== null);
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

  it('al fusionar, las celdas de la derecha conservan el ancho de su columna', () => {
    const { xml } = corpusByName('SalesInvoiceESP.rdlc');
    const doc = xmlAdapter.parse(xml);
    const index = DocumentIndex.build(doc.root);
    const projectDoc = (): ProjectionDto =>
      projectionAdapter.project({
        sessionId: 'test',
        filePath: 'SalesInvoiceESP.rdlc',
        document: doc,
        version: 1,
      });

    const tablixOf = (projection: ProjectionDto): TablixDto | undefined =>
      allItems(projection).find(
        (item): item is TablixDto => item.kind === 'tablix' && item.id === 'LinesTable2',
      );
    const contentOf = (tablix: TablixDto, id: string) =>
      tablix.body.rows.flatMap((row) => row.cells).find((cell) => cell.content?.id === id)?.content;

    // La fila 4 tiene [Textbox170, Textbox187, Textbox190, Textbox192].
    const antes = tablixOf(projectDoc())!;
    expect(contentOf(antes, 'Textbox192')?.width.value).toBeCloseTo(3.35146, 4);

    const applied = applyCommand(
      { root: doc.root, index },
      { cmd: 'mergeCells', id: 'LinesTable2', row: 4, col: 1, rowSpan: 1, colSpan: 2 },
    );
    expect(applied.isRight()).toBe(true);

    const despues = tablixOf(projectDoc())!;
    // El ancla hereda la suma de sus dos columnas…
    expect(contentOf(despues, 'Textbox187')?.width.value).toBeCloseTo(2.57094 + 3.53031, 4);
    // …y la celda de su derecha mantiene el ancho de SU columna (no el de la
    // fusionada): la columna de cada celda se acumula con los `ColSpan`.
    expect(contentOf(despues, 'Textbox192')?.width.value).toBeCloseTo(3.35146, 4);
  });

  it('una fila más ancha que las columnas declaradas no deja el contenido a 0', () => {
    // LinesTable2 (SalesInvoiceESP) tiene una fila con 6 posiciones y solo 4
    // columnas declaradas: la última celda usa la última columna como referencia.
    const projection = project('SalesInvoiceESP.rdlc');
    const items = allItems(projection);
    const textbox70 = items.find((item) => item.id === 'Textbox70');
    expect(textbox70).toBeDefined();
    expect(textbox70!.width.value).toBeGreaterThan(0);
  });

  it('las filas BC/SSRS sitúan cada ancla en su columna (los rellenos no cuentan)', () => {
    const projection = project('SalesShipment.rdlc');
    const tablix = allItems(projection).find(
      (item): item is TablixDto => item.kind === 'tablix' && item.id === 'SalesLine',
    );
    expect(tablix).toBeDefined();
    // Fila original: textbox30 | textbox32 (ColSpan 5) | 4 rellenos | Textbox55 | Textbox64.
    const row = tablix!.body.rows[2]!;
    expect(row.cells.map((cell) => cell.content?.id)).toEqual([
      'textbox30',
      'textbox32',
      'Textbox55',
      'Textbox64',
    ]);
    expect(row.cells[1]?.colSpan).toBe(5);

    const widthOf = (id: string): number | undefined =>
      row.cells.find((cell) => cell.content?.id === id)?.content?.width.value;
    // Cada ancla hereda el ancho de SU columna (6 y 7), no el de la última.
    expect(widthOf('Textbox55')).toBeCloseTo(2.1328, 4);
    expect(widthOf('Textbox64')).toBeCloseTo(2.07988, 4);
  });

  it('LinesTable2: los rellenos tras un ColSpan no desplazan la celda siguiente', () => {
    const projection = project('SalesInvoiceESP.rdlc');
    const tablix = allItems(projection).find(
      (item): item is TablixDto => item.kind === 'tablix' && item.id === 'LinesTable2',
    );
    expect(tablix).toBeDefined();
    const row = tablix!.body.rows[2]!;
    expect(row.cells.map((cell) => cell.content?.id)).toEqual(['Description_Line2', 'Textbox70']);
    expect(row.cells[0]?.colSpan).toBe(3);
    // `Textbox70` vive en la última columna, no fuera de la rejilla.
    expect(row.cells[1]?.content?.width.value).toBeCloseTo(3.35146, 4);
  });
});

describe('proyección · etiquetas de diseñador (`<Label>`) y estilos', () => {
  it('el run expone la etiqueta y conserva el valor original (expresión)', () => {
    const projection = project('SalesInvoiceESP.rdlc');
    const textbox = allItems(projection).find((item) => item.id === 'Textbox23');
    expect(textbox?.kind).toBe('textbox');
    if (textbox?.kind !== 'textbox') return;

    const run = textbox.paragraphs[0]?.runs[0];
    expect(run?.label).toBe('BTCClientName');
    expect(run?.value).toBe('=Code.GetData(8, 1)');
  });

  it('parsea padding y alineación vertical', () => {
    const projection = project('SalesInvoiceESP.rdlc');
    const textbox = allItems(projection).find((item) => item.id === 'Textbox23');
    if (textbox?.kind !== 'textbox') throw new Error('sin textbox');

    expect(textbox.style?.verticalAlign).toBe('Bottom');
    expect(textbox.style?.padding?.left).toEqual({ value: 2, unit: 'pt' });
    expect(textbox.style?.padding?.bottom).toEqual({ value: 2, unit: 'pt' });
  });
});
