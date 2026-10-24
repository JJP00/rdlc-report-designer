import type { ItemDto, Length, ProjectionDto, TablixDto } from '@rdlc-designer/contracts';
import { describe, expect, it } from 'vitest';
import { applyCommand } from '../../src/domain/document/commands/applyCommand.js';
import { DocumentIndex } from '../../src/domain/document/index/DocumentIndex.js';
import { TrueFormatProjectionAdapter } from '../../src/infrastructure/rdlc/TrueFormatProjectionAdapter.js';
import { TrueFormatXmlAdapter } from '../../src/infrastructure/rdlc/TrueFormatXmlAdapter.js';
import { corpusByName } from '../golden/fixtures.js';
import { undoAll } from './command-test-utils.js';

/**
 * Insertar un item en una celda del body de un Tablix: manda la celda. Aunque
 * el llamante pida otra posición/tamaño (el Rectangle nace 5 × 1 cm en el
 * cuerpo), el item queda en el origen de la celda y con su caja (columnas y
 * filas que cubre, `ColSpan`/`RowSpan` incluidos): no se sale de ella.
 *
 * `SalesShipment · SalesLine` fila 2: la columna 1 es un `ColSpan` de 5 (cols. 1 a 5).
 */

const xmlAdapter = new TrueFormatXmlAdapter();
const projectionAdapter = new TrueFormatProjectionAdapter();

const cm = (value: number): Length => ({ value, unit: 'cm' });

/** Tamaño por defecto del Rectangle en el cuerpo (el que NO cabe en la celda). */
const RECTANGLE = {
  kind: 'rectangle' as const,
  top: cm(2),
  left: cm(2),
  width: cm(5),
  height: cm(1),
};

function open(): {
  doc: ReturnType<TrueFormatXmlAdapter['parse']>;
  index: DocumentIndex;
} {
  const doc = xmlAdapter.parse(corpusByName('SalesShipment.rdlc').xml);
  return { doc, index: DocumentIndex.build(doc.root) };
}

function project(doc: ReturnType<TrueFormatXmlAdapter['parse']>): ProjectionDto {
  return projectionAdapter.project({
    sessionId: 'test',
    filePath: 'SalesShipment.rdlc',
    document: doc,
    version: 1,
  });
}

function findTablix(projection: ProjectionDto, id: string): TablixDto | undefined {
  const walk = (items: ItemDto[]): TablixDto | undefined => {
    for (const item of items) {
      if (item.kind === 'tablix' && item.id === id) return item;
      const nested =
        item.kind === 'rectangle'
          ? item.children
          : item.kind === 'tablix'
            ? item.body.rows.flatMap((row) => row.cells.map((cell) => cell.content))
            : [];
      const found = walk(nested.filter((child): child is ItemDto => child !== null));
      if (found) return found;
    }
    return undefined;
  };
  return walk([...projection.page.body.items, ...projection.page.header.items]);
}

const sumCm = (lengths: Length[]): number => lengths.reduce((total, l) => total + l.value, 0);

describe('insertItem en una celda de Tablix', () => {
  it('un Rectangle en una celda vaciada nace en 0,0 con el tamaño de la celda', () => {
    const { doc, index } = open();
    const ctx = { root: doc.root, index };

    // Celda (2, 6): un Textbox suelto. Se borra y se inserta un Rectangle.
    const before = findTablix(project(doc), 'SalesLine')!;
    const textbox = before.body.rows[2]!.cells[2]!.content!;
    expect(applyCommand(ctx, { cmd: 'deleteItem', id: textbox.id }).isRight()).toBe(true);

    const scope = { kind: 'tablixCell' as const, id: 'SalesLine', row: 2, col: 6 };
    const applied = applyCommand(ctx, { cmd: 'insertItem', scope, index: 0, item: RECTANGLE });
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    const tablix = findTablix(project(doc), 'SalesLine')!;
    const rectangle = tablix.body.rows[2]!.cells[2]!.content!;
    expect(rectangle.kind).toBe('rectangle');

    // La caja de la columna 6 y de la fila 2 salen de la rejilla.
    expect(rectangle.top.value).toBe(0);
    expect(rectangle.left.value).toBe(0);
    expect(rectangle.width.value).toBeCloseTo(tablix.body.columns[6]!.value, 4);
    expect(rectangle.height.value).toBeCloseTo(tablix.body.rows[2]!.height.value, 4);

    // Lo que devuelve el comando (lo usa el front) es lo que se escribió.
    expect(applied.value.applied?.[0]?.values).toMatchObject({ kind: 'rectangle' });

    // El undo quita el Rectangle sin dejar rastro.
    expect(undoAll(ctx, applied.value).isRight()).toBe(true);
    expect(findTablix(project(doc), 'SalesLine')!.body.rows[2]!.cells[2]!.content).toBeNull();
  });

  it('en una celda con ColSpan ocupa todas las columnas que cubre', () => {
    const { doc, index } = open();
    const ctx = { root: doc.root, index };

    const before = findTablix(project(doc), 'SalesLine')!;
    const merged = before.body.rows[2]!.cells[1]!;
    expect(merged.colSpan).toBe(5);
    expect(applyCommand(ctx, { cmd: 'deleteItem', id: merged.content!.id }).isRight()).toBe(true);

    const scope = { kind: 'tablixCell' as const, id: 'SalesLine', row: 2, col: 1 };
    const applied = applyCommand(ctx, {
      cmd: 'insertItem',
      scope,
      index: 0,
      item: { ...RECTANGLE, width: cm(0.5), height: cm(0.1) },
    });
    expect(applied.isRight()).toBe(true);

    const tablix = findTablix(project(doc), 'SalesLine')!;
    const rectangle = tablix.body.rows[2]!.cells[1]!.content!;
    expect(rectangle.kind).toBe('rectangle');
    expect(rectangle.width.value).toBeCloseTo(sumCm(tablix.body.columns.slice(1, 6)), 4);
    expect(rectangle.height.value).toBeCloseTo(tablix.body.rows[2]!.height.value, 4);
  });
});
