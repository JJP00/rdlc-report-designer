import type { ItemDto, TablixDto } from '@rdlc-designer/contracts';
import { describe, expect, it } from 'vitest';
import { applyCommand } from '../../src/domain/document/commands/applyCommand.js';
import { DocumentIndex } from '../../src/domain/document/index/DocumentIndex.js';
import { TrueFormatProjectionAdapter } from '../../src/infrastructure/rdlc/TrueFormatProjectionAdapter.js';
import { TrueFormatXmlAdapter } from '../../src/infrastructure/rdlc/TrueFormatXmlAdapter.js';
import { corpusByName } from '../golden/fixtures.js';
import { undoAll } from './command-test-utils.js';

/**
 * G10 · filtros del Tablix (`Filters > Filter`). Caso real: `Tablix7` de
 * `SalesCreditMemoESP` (`=Cstr(Len(Fields!VATIdentifier_VatAmountLine.Value))`
 * `NotEqual` `0`).
 */

const xmlAdapter = new TrueFormatXmlAdapter();
const projectionAdapter = new TrueFormatProjectionAdapter();

function open(name: string): {
  xml: string;
  doc: ReturnType<TrueFormatXmlAdapter['parse']>;
  index: DocumentIndex;
} {
  const { xml } = corpusByName(name);
  const doc = xmlAdapter.parse(xml);
  return { xml, doc, index: DocumentIndex.build(doc.root) };
}

describe('G10 · setTablixFilters', () => {
  it('reemplaza los filtros del Tablix y el undo es byte-exacto', () => {
    const { xml, doc, index } = open('SalesCreditMemoESP.rdlc');

    const applied = applyCommand(
      { root: doc.root, index },
      {
        cmd: 'setTablixFilters',
        id: 'Tablix7',
        filters: [
          { expression: '=Fields!VATIdentifier_.Value', operator: 'Like', values: ['ES*'] },
          { expression: '=Fields!VATPct.Value', operator: 'Between', values: ['1', '27'] },
        ],
      },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    const output = xmlAdapter.serialize(doc);
    expect(output).toContain('<FilterExpression>=Fields!VATIdentifier_.Value</FilterExpression>');
    expect(output).toContain('<Operator>Like</Operator>');
    expect(output).toContain('<FilterValue>ES*</FilterValue>');
    expect(output).toContain('<Operator>Between</Operator>');
    expect((output.match(/<Filter>/g) ?? []).length).toBeGreaterThanOrEqual(2);

    const undone = undoAll({ root: doc.root, index }, applied.value);
    expect(undone.isRight()).toBe(true);
    expect(xmlAdapter.serialize(doc)).toBe(xml);
  });

  it('una lista vacía quita el bloque (y el undo lo reinserta)', () => {
    const { xml, doc, index } = open('SalesCreditMemoESP.rdlc');
    const before = (xml.match(/<Filters>/g) ?? []).length;

    const applied = applyCommand(
      { root: doc.root, index },
      { cmd: 'setTablixFilters', id: 'Tablix7', filters: [] },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    expect((xmlAdapter.serialize(doc).match(/<Filters>/g) ?? []).length).toBe(before - 1);

    const undone = undoAll({ root: doc.root, index }, applied.value);
    expect(undone.isRight()).toBe(true);
    expect(xmlAdapter.serialize(doc)).toBe(xml);
  });

  it('crea los filtros en un Tablix que no los tenía', () => {
    const { xml, doc, index } = open('PalletOutput.rdlc');

    const applied = applyCommand(
      { root: doc.root, index },
      {
        cmd: 'setTablixFilters',
        id: 'Tablix4',
        filters: [{ expression: '=Fields!Item_No.Value', operator: 'NotEqual', values: [''] }],
      },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    const tablix = index.get('Tablix4')!;
    expect(tablix.child('Filters')).toBeDefined();

    const undone = undoAll({ root: doc.root, index }, applied.value);
    expect(undone.isRight()).toBe(true);
    expect(xmlAdapter.serialize(doc)).toBe(xml);
  });

  it('rechaza expresiones vacías y elementos que no son Tablix', () => {
    const { doc, index } = open('PalletOutput.rdlc');

    const blank = applyCommand(
      { root: doc.root, index },
      {
        cmd: 'setTablixFilters',
        id: 'Tablix4',
        filters: [{ expression: '  ', operator: 'Equal', values: ['x'] }],
      },
    );
    expect(blank.isLeft()).toBe(true);

    const notTablix = applyCommand(
      { root: doc.root, index },
      { cmd: 'setTablixFilters', id: 'Textbox25', filters: [] },
    );
    expect(notTablix.isLeft()).toBe(true);
  });

  it('la proyección lee los filtros del Tablix', () => {
    const projection = projectionAdapter.project({
      sessionId: 'test',
      filePath: 'SalesCreditMemoESP.rdlc',
      document: xmlAdapter.parse(corpusByName('SalesCreditMemoESP.rdlc').xml),
      version: 1,
    });

    const tablix = findTablix(projection, 'Tablix7');
    expect(tablix?.filters).toEqual([
      {
        expression: '=Cstr(Len(Fields!VATIdentifier_VatAmountLine.Value))',
        operator: 'NotEqual',
        values: ['0'],
      },
    ]);
  });
});

function findTablix(
  projection: ReturnType<TrueFormatProjectionAdapter['project']>,
  id: string,
): TablixDto | undefined {
  const walk = (items: ItemDto[]): TablixDto | undefined => {
    for (const item of items) {
      if (item.kind === 'tablix') {
        if (item.id === id) return item;
        for (const row of item.body.rows) {
          for (const cell of row.cells) {
            if (!cell?.content) continue;
            const found = walk([cell.content]);
            if (found) return found;
          }
        }
      }
      if (item.kind === 'rectangle') {
        const found = walk(item.children);
        if (found) return found;
      }
    }
    return undefined;
  };

  return (
    walk(projection.page.body.items) ??
    walk(projection.page.header.items) ??
    walk(projection.page.footer.items)
  );
}
