import { describe, expect, it } from 'vitest';
import type { ItemDto, Length, ProjectionDto, TablixDto } from '@rdlc-designer/contracts';
import { TrueFormatProjectionAdapter } from '../../src/infrastructure/rdlc/TrueFormatProjectionAdapter.js';
import { TrueFormatXmlAdapter } from '../../src/infrastructure/rdlc/TrueFormatXmlAdapter.js';
import { corpusByName } from '../golden/fixtures.js';

/**
 * Cabeceras del Tablix (`TablixMember > TablixHeader`) y esquina
 * (`TablixCorner`): se proyectan **fuera de la rejilla** con su geometría
 * (grosor = `Size`, largo = filas/columnas que cubre) y un `offset` que desplaza
 * el body. Caso real: `Tablix7` de `SalesInvoiceESP`.
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

function findTablix(projection: ProjectionDto, id: string): TablixDto | undefined {
  let found: TablixDto | undefined;
  walk(projection.page.body.items, (item) => {
    if (item.kind === 'tablix' && item.id === id) found = item;
  });
  return found;
}

function cmLength(value: number): Length {
  return { value, unit: 'cm' };
}

function expectCm(actual: Length | undefined, cm: number): void {
  expect(actual?.unit).toBe('cm');
  expect(actual?.value ?? Number.NaN).toBeCloseTo(cm, 5);
}

describe('proyección · cabeceras del Tablix', () => {
  it('Tablix7: bandas de columna/fila, esquina y offset (geometría del body)', () => {
    const tablix = findTablix(project('SalesInvoiceESP.rdlc'), 'Tablix7');
    expect(tablix).toBeDefined();
    if (!tablix) return;

    const headers = tablix.headers;
    expect(headers).toBeDefined();
    if (!headers) return;

    // El body de Tablix7 mide 4.65229 × 0.6 cm; declarado: 7.85172 × 1.2 cm.
    expectCm(headers.offset.top, 0.6);
    expectCm(headers.offset.left, 3.19943);

    // Cabecera de fila (grupo por VATPct): 3.19943 cm de ancho, 0.6 de alto.
    expect(headers.rows).toHaveLength(1);
    expectCm(headers.rows[0]?.size, 3.19943);
    expect(headers.rows[0]?.cells).toHaveLength(1);
    const rowHeader = headers.rows[0]?.cells[0];
    expect(rowHeader?.id).toBe('VATIdentifier_VatAmountLine');
    expectCm(rowHeader?.left, 0);
    expectCm(rowHeader?.top, 0.6);
    expectCm(rowHeader?.width, 3.19943);
    expectCm(rowHeader?.height, 0.6);

    // Cabeceras de columna: una banda de 0.6 cm con los dos rótulos.
    expect(headers.columns).toHaveLength(1);
    expectCm(headers.columns[0]?.size, 0.6);
    const [first, second] = headers.columns[0]?.cells ?? [];
    expect(first?.id).toBe('Textbox73');
    expectCm(first?.left, 3.19943);
    expectCm(first?.top, 0);
    expectCm(first?.width, 2.15229);
    expectCm(first?.height, 0.6);
    expect(second?.id).toBe('Textbox75');
    expectCm(second?.left, 3.19943 + 2.15229);
    expectCm(second?.width, 2.5);

    // Esquina: 3.19943 × 0.6 cm en el origen.
    expect(headers.corner).toHaveLength(1);
    expect(headers.corner[0]).toHaveLength(1);
    const corner = headers.corner[0]?.[0];
    expect(corner?.id).toBe('Textbox72');
    expectCm(corner?.left, 0);
    expectCm(corner?.top, 0);
    expectCm(corner?.width, 3.19943);
    expectCm(corner?.height, 0.6);
  });

  it('un Tablix sin cabeceras no trae el bloque', () => {
    const tablix = findTablix(project('SalesCreditMemoESP.rdlc'), 'Tablix3');
    expect(tablix).toBeDefined();
    expect(tablix?.headers).toBeUndefined();
    // Y la geometría del body no cambia: sin offset.
    expectCm(tablix?.body.columns[0], 2.92649);
    expect(tablix?.headers?.offset).toBeUndefined();
  });

  it('el ancho/alto declarado del Tablix cuadra con cabeceras + rejilla', () => {
    const tablix = findTablix(project('SalesInvoiceESP.rdlc'), 'Tablix7');
    expect(tablix).toBeDefined();
    if (!tablix) return;
    const bodyWidth = tablix.body.columns.reduce((acc, width) => acc + width.value, 0);
    const bodyHeight = tablix.body.rows.reduce((acc, row) => acc + row.height.value, 0);
    expectCm(tablix.width, Number((bodyWidth + 3.19943).toFixed(5)));
    expectCm(tablix.height, Number((bodyHeight + 0.6).toFixed(5)));
    expectCm(cmLength(bodyHeight), 0.6);
  });
});
