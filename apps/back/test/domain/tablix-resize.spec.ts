import { describe, expect, it } from 'vitest';
import { appliedOf, undoAll } from './command-test-utils.js';
import { applyCommand } from '../../src/domain/document/commands/applyCommand.js';
import { DocumentIndex } from '../../src/domain/document/index/DocumentIndex.js';
import type { RdlcNode } from '../../src/domain/document/tree/RdlcNode.js';
import { TrueFormatXmlAdapter } from '../../src/infrastructure/rdlc/TrueFormatXmlAdapter.js';
import { corpusByName } from '../golden/fixtures.js';

/**
 * F2 · geometría del Tablix: la rejilla (columnas/filas del `TablixBody`) manda.
 * `resizeColumn`/`resizeRow` son las primitivas (separadores de la rejilla) y
 * `resizeTable` el redimensionado de la tabla entera con los tiradores.
 */

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

function columnWidths(tablix: RdlcNode | undefined): number[] {
  return (tablix?.child('TablixBody')?.child('TablixColumns')?.children('TablixColumn') ?? []).map(
    (column) => Number.parseFloat(column.child('Width')?.text()?.replace('cm', '') ?? '0'),
  );
}

function rowHeights(tablix: RdlcNode | undefined): number[] {
  return (tablix?.child('TablixBody')?.child('TablixRows')?.children('TablixRow') ?? []).map((row) =>
    Number.parseFloat(row.child('Height')?.text()?.replace('cm', '') ?? '0'),
  );
}

describe('F2 · resizeColumn / resizeRow', () => {
  it('cambia el ancho de una columna y el undo restaura los bytes', () => {
    const { xml, doc, index } = open('SalesInvoiceESP.rdlc');
    const before = columnWidths(index.get('Tablix2'));

    const applied = applyCommand(
      { root: doc.root, index },
      { cmd: 'resizeColumn', id: 'Tablix2', column: 0, width: { value: 12, unit: 'cm' } },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    expect(adapter.serialize(doc)).toContain('<Width>12cm</Width>');
    const undone = undoAll({ root: doc.root, index }, applied.value);
    expect(undone.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(xml);
    expect(columnWidths(index.get('Tablix2'))).toEqual(before);
  });

  it('rechaza una columna/fila que no existe', () => {
    const { doc, index } = open('SalesInvoiceESP.rdlc');

    const column = applyCommand(
      { root: doc.root, index },
      { cmd: 'resizeColumn', id: 'Tablix2', column: 99, width: { value: 1, unit: 'cm' } },
    );
    expect(column.isLeft()).toBe(true);

    const row = applyCommand(
      { root: doc.root, index },
      { cmd: 'resizeRow', id: 'Tablix2', row: 99, height: { value: 1, unit: 'cm' } },
    );
    expect(row.isLeft()).toBe(true);
  });

  it('no baja del tamaño mínimo', () => {
    const { doc, index } = open('SalesInvoiceESP.rdlc');

    applyCommand(
      { root: doc.root, index },
      { cmd: 'resizeColumn', id: 'Tablix2', column: 0, width: { value: -5, unit: 'cm' } },
    );
    expect(columnWidths(index.get('Tablix2'))[0]).toBeGreaterThanOrEqual(0.05);
  });
});

describe('F2 · resizeTable (tiradores de la tabla)', () => {
  it('reparte el ancho entre las columnas y el alto entre las filas manteniendo la suma', () => {
    const { doc, index } = open('SalesInvoiceESP.rdlc');

    const applied = applyCommand(
      { root: doc.root, index },
      {
        cmd: 'resizeTable',
        id: 'Tablix2',
        top: { value: 0, unit: 'cm' },
        left: { value: 0, unit: 'cm' },
        width: { value: 10, unit: 'cm' },
        height: { value: 20, unit: 'cm' },
      },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    const columns = columnWidths(index.get('Tablix2'));
    const rows = rowHeights(index.get('Tablix2'));
    expect(columns.reduce((acc, value) => acc + value, 0)).toBeCloseTo(10, 3);
    expect(rows.reduce((acc, value) => acc + value, 0)).toBeCloseTo(20, 3);
    // Todas las columnas participan del reparto.
    expect(columns.every((width) => width > 0)).toBe(true);
  });

  it('el undo de la tabla entera es exacto y en un paso (aunque toque la posición)', () => {
    const { xml, doc, index } = open('SalesInvoiceESP.rdlc');
    const tablix = index.get('Tablix2');
    expect(tablix).toBeDefined();
    // `Tablix2` no declara `Left` (es 0 en BC): el comando lo crea y el undo lo quita.
    expect(tablix?.child('Left')).toBeUndefined();

    const applied = applyCommand(
      { root: doc.root, index },
      {
        cmd: 'resizeTable',
        id: 'Tablix2',
        top: { value: 1.5, unit: 'cm' },
        left: { value: 1, unit: 'cm' },
        width: { value: 12, unit: 'cm' },
        height: { value: 15, unit: 'cm' },
      },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;
    expect(adapter.serialize(doc)).toContain('<Top>1.5cm</Top>');
    expect(adapter.serialize(doc)).toContain('<Left>1cm</Left>');

    const undone = undoAll({ root: doc.root, index }, applied.value);
    expect(undone.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(xml);
  });

  it('sincroniza el Width/Height declarado con la rejilla (y no inventa Left si no se mueve)', () => {
    const { doc, index } = open('SalesInvoiceESP.rdlc');
    expect(index.get('Tablix2')?.child('Width')).toBeDefined();

    applyCommand(
      { root: doc.root, index },
      {
        cmd: 'resizeTable',
        id: 'Tablix2',
        top: { value: 0, unit: 'cm' },
        left: { value: 0, unit: 'cm' },
        width: { value: 9, unit: 'cm' },
        height: { value: 9, unit: 'cm' },
      },
    );

    const tablix = index.get('Tablix2');
    expect(tablix?.child('Width')?.text()).toBe('9cm');
    expect(tablix?.child('Height')?.text()).toBe('9cm');
    // La posición no cambió (Top ya era 0 y Left no existe): nada que crear.
    expect(tablix?.child('Left')).toBeUndefined();
  });

  it('rechaza elementos que no son Tablix', () => {
    const { doc, index } = open('SalesInvoiceESP.rdlc');

    const applied = applyCommand(
      { root: doc.root, index },
      {
        cmd: 'resizeTable',
        id: 'Textbox23',
        top: { value: 0, unit: 'cm' },
        left: { value: 0, unit: 'cm' },
        width: { value: 5, unit: 'cm' },
        height: { value: 1, unit: 'cm' },
      },
    );
    expect(applied.isLeft()).toBe(true);
  });
});
