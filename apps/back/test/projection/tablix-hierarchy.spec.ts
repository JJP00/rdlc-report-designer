import { describe, expect, it } from 'vitest';
import type { ItemDto, ProjectionDto, TablixDto, TablixMemberDto } from '@rdlc-designer/contracts';
import { TrueFormatProjectionAdapter } from '../../src/infrastructure/rdlc/TrueFormatProjectionAdapter.js';
import { TrueFormatXmlAdapter } from '../../src/infrastructure/rdlc/TrueFormatXmlAdapter.js';
import { corpusByName } from '../golden/fixtures.js';

/**
 * F2 parte 3: la proyección ya no devuelve jerarquías vacías — los grupos
 * (expresión, hijos, path) y los totales (inferidos: una fila con agregados
 * pegada a un grupo) viajan al front para el panel de estructura.
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

function tablixByName(projection: ProjectionDto, name: string): TablixDto | undefined {
  return allItems(projection).find(
    (item): item is TablixDto => item.kind === 'tablix' && item.id === name,
  );
}

function leafCount(members: TablixMemberDto[]): number {
  return members.reduce(
    (acc, member) => acc + (member.children.length === 0 ? 1 : leafCount(member.children)),
    0,
  );
}

describe('proyección · jerarquías del Tablix', () => {
  it('proyecta grupos con expresión, hijos y path', () => {
    const tablix = tablixByName(project('SalesCreditMemoESP.rdlc'), 'LinesTable');
    expect(tablix).toBeDefined();
    expect(tablix!.rowHierarchy).toHaveLength(4);

    const group = tablix!.rowHierarchy[2]!;
    expect(group.expression).toBe('=Fields!LineNo_Line.Value');
    expect(group.children).toHaveLength(2);
    expect(group.children[0]?.path).toEqual([2, 0]);
    expect(group.children[1]?.path).toEqual([2, 1]);
    expect(group.total).toBe('none');
  });

  it('una hoja de jerarquía por fila y por columna de la rejilla', () => {
    const tablix = tablixByName(project('SalesCreditMemoESP.rdlc'), 'LinesTable');
    expect(leafCount(tablix!.rowHierarchy)).toBe(tablix!.body.rows.length);
    expect(leafCount(tablix!.columnHierarchy)).toBe(tablix!.body.columns.length);
  });

  it('infiere la fila de total: agregados pegados al grupo (`after`)', () => {
    const tablix = tablixByName(project('SalesCreditMemoESP.rdlc'), 'LinesTable');
    // La última fila de LinesTable son los `=Sum(...)`: total después del grupo.
    const total = tablix!.rowHierarchy[3]!;
    expect(total.expression).toBeUndefined();
    expect(total.total).toBe('after');
    // Las cabeceras (sin agregados) no se marcan.
    expect(tablix!.rowHierarchy[0]!.total).toBe('none');
    expect(tablix!.rowHierarchy[1]!.total).toBe('none');
  });

  it('proyecta la visibilidad de los miembros', () => {
    const tablix = tablixByName(project('SalesCreditMemoESP.rdlc'), 'LinesTable');
    expect(tablix!.rowHierarchy[0]!.hidden).toBe('=Fields!BTCJobNo.Value <> ""');
  });

  it('proyecta grupos hoja (sin hijos) con su expresión: son filas que se repiten', () => {
    // Tablix2 (`Details`) y Tablix7 (`VATIdentifier_VatAmountLine`): el grupo
    // ES la fila de detalle; el front lo clasifica por `expression`, no por
    // tener hijos.
    const details = tablixByName(project('SalesCreditMemoESP.rdlc'), 'Tablix2');
    expect(details!.rowHierarchy).toHaveLength(1);
    expect(details!.rowHierarchy[0]!.expression).toBe('=Fields!DocumentNo.Value');
    expect(details!.rowHierarchy[0]!.children).toEqual([]);
    expect(leafCount(details!.rowHierarchy)).toBe(details!.body.rows.length);

    const vat = tablixByName(project('SalesCreditMemoESP.rdlc'), 'Tablix7');
    expect(vat!.rowHierarchy).toHaveLength(1);
    expect(vat!.rowHierarchy[0]!.expression).toBe('=Fields!VATPct_VatAmountLine.Value');
    expect(vat!.rowHierarchy[0]!.children).toEqual([]);
  });
});
