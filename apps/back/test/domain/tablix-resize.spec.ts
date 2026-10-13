import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ItemDto, Length, ScopeRef, TablixDto } from '@rdlc-designer/contracts';
import { describe, expect, it } from 'vitest';
import { undoAll } from './command-test-utils.js';
import { applyCommand } from '../../src/domain/document/commands/applyCommand.js';
import { DocumentIndex } from '../../src/domain/document/index/DocumentIndex.js';
import type { RdlcNode } from '../../src/domain/document/tree/RdlcNode.js';
import {
  memberLeafRange,
  positionedCells,
  tablixRows,
} from '../../src/domain/document/commands/tablixParts.js';
import { TrueFormatProjectionAdapter } from '../../src/infrastructure/rdlc/TrueFormatProjectionAdapter.js';
import { TrueFormatXmlAdapter } from '../../src/infrastructure/rdlc/TrueFormatXmlAdapter.js';
import { LibXml2SchemaValidatorAdapter } from '../../src/infrastructure/validation/LibXml2SchemaValidatorAdapter.js';
import { corpusByName } from '../golden/fixtures.js';

/**
 * F2 · geometría del Tablix: la rejilla (columnas/filas del `TablixBody`) manda.
 * `resizeColumn`/`resizeRow` son las primitivas (separadores de la rejilla) y
 * `resizeTable` el redimensionado de la tabla entera con los tiradores.
 */

const adapter = new TrueFormatXmlAdapter();
const projectionAdapter = new TrueFormatProjectionAdapter();
const here = dirname(fileURLToPath(import.meta.url));
const validator = new LibXml2SchemaValidatorAdapter(
  resolve(here, '../../resources/rdl2016/ReportDefinition2016.xsd'),
);

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
  return (tablix?.child('TablixBody')?.child('TablixRows')?.children('TablixRow') ?? []).map(
    (row) => Number.parseFloat(row.child('Height')?.text()?.replace('cm', '') ?? '0'),
  );
}

/** Lee una longitud escrita (`3.35cm`, `25mm`…) en cm. */
function readCm(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const match = /^([-\d.]+)\s*(cm|mm|in|pt)$/.exec(raw.trim());
  if (!match) return undefined;
  const value = Number.parseFloat(match[1]!);
  switch (match[2]!) {
    case 'cm':
      return value;
    case 'mm':
      return value / 10;
    case 'in':
      return value * 2.54;
    case 'pt':
      return (value * 2.54) / 72;
  }
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

describe('F2 · resize · el contenido de las celdas acompaña a la rejilla', () => {
  /** Textbox insertado con longitud declarada (lo que deja el editor al insertar). */
  function insertTextboxIn(
    ctx: { root: RdlcNode; index: DocumentIndex },
    scope: ScopeRef,
    width: number,
    height: number,
  ) {
    const applied = applyCommand(ctx, {
      cmd: 'insertItem',
      scope,
      index: 0,
      item: {
        kind: 'textbox',
        name: 'TxtCeldaPrueba',
        top: { value: 0, unit: 'cm' },
        left: { value: 0, unit: 'cm' },
        width: { value: width, unit: 'cm' },
        height: { value: height, unit: 'cm' },
        text: '',
      },
    });
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) throw new Error('insert falló');
    return applied.value;
  }

  /** Contenido de una celda: primer hijo de CellContents que no sea ColSpan/RowSpan. */
  function contentOfCell(cell: RdlcNode): RdlcNode | undefined {
    return cell
      .child('CellContents')
      ?.children()
      .find((child) => !['ColSpan', 'RowSpan'].includes(child.tagName));
  }

  it('resizeColumn ajusta el ancho declarado del contenido cubierto y el undo lo restaura', () => {
    const { xml, doc, index } = open('SalesInvoiceESP.rdlc');
    const ctx = { root: doc.root, index };
    const tablix = index.get('Tablix2');
    expect(tablix).toBeDefined();
    const cell = positionedCells(tablixRows(tablix!)[0]!)[0]!.cell;

    // El contenido canónico de BC no declara tamaños: se sustituye por un
    // textbox con longitud declarada, como deja el editor al insertar.
    const originalId = contentOfCell(cell)!.attribute('Name')!;
    const del = applyCommand(ctx, { cmd: 'deleteItem', id: originalId });
    expect(del.isRight()).toBe(true);
    if (!del.isRight()) return;
    const inserted = insertTextboxIn(
      ctx,
      { kind: 'tablixCell', id: 'Tablix2', row: 0, col: 0 },
      2,
      0.6,
    );

    const applied = applyCommand(ctx, {
      cmd: 'resizeColumn',
      id: 'Tablix2',
      column: 0,
      width: { value: 5, unit: 'cm' },
    });
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;
    const content = contentOfCell(cell)!;
    expect(content.child('Width')?.text()).toBe('5cm');

    const undone = undoAll(ctx, applied.value);
    expect(undone.isRight()).toBe(true);
    expect(content.child('Width')?.text()).toBe('2cm');

    // Undo del resto de la cadena: byte exacto contra el corpus.
    expect(undoAll(ctx, inserted).isRight()).toBe(true);
    expect(undoAll(ctx, del.value).isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(xml);
  });

  it('resizeRow ajusta el alto declarado del contenido cubierto y el undo lo restaura', () => {
    const { xml, doc, index } = open('SalesInvoiceESP.rdlc');
    const ctx = { root: doc.root, index };
    const tablix = index.get('Tablix2');
    const cell = positionedCells(tablixRows(tablix!)[0]!)[0]!.cell;

    const originalId = contentOfCell(cell)!.attribute('Name')!;
    const del = applyCommand(ctx, { cmd: 'deleteItem', id: originalId });
    expect(del.isRight()).toBe(true);
    if (!del.isRight()) return;
    const inserted = insertTextboxIn(
      ctx,
      { kind: 'tablixCell', id: 'Tablix2', row: 0, col: 0 },
      2,
      0.6,
    );

    const applied = applyCommand(ctx, {
      cmd: 'resizeRow',
      id: 'Tablix2',
      row: 0,
      height: { value: 1.5, unit: 'cm' },
    });
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;
    const content = contentOfCell(cell)!;
    expect(content.child('Height')?.text()).toBe('1.5cm');

    const undone = undoAll(ctx, applied.value);
    expect(undone.isRight()).toBe(true);
    expect(content.child('Height')?.text()).toBe('0.6cm');

    expect(undoAll(ctx, inserted).isRight()).toBe(true);
    expect(undoAll(ctx, del.value).isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(xml);
  });

  it('una celda combinada toma la suma de las columnas que cubre', () => {
    // `Tablix2` solo tiene una columna: la fusión se prueba en `LinesTable2`.
    const { doc, index } = open('SalesInvoiceESP.rdlc');
    const ctx = { root: doc.root, index };
    const tablix = index.get('LinesTable2');
    const row = tablixRows(tablix!)[0]!;

    // Vacía las dos primeras celdas y deja un textbox en la primera.
    for (const positioned of positionedCells(row).slice(0, 2)) {
      const del = applyCommand(ctx, {
        cmd: 'deleteItem',
        id: contentOfCell(positioned.cell)!.attribute('Name')!,
      });
      expect(del.isRight()).toBe(true);
    }
    insertTextboxIn(ctx, { kind: 'tablixCell', id: 'LinesTable2', row: 0, col: 0 }, 2, 0.6);

    const merged = applyCommand(ctx, {
      cmd: 'mergeCells',
      id: 'LinesTable2',
      row: 0,
      col: 0,
      rowSpan: 1,
      colSpan: 2,
    });
    expect(merged.isRight()).toBe(true);

    const before = columnWidths(tablix!);
    const applied = applyCommand(ctx, {
      cmd: 'resizeColumn',
      id: 'LinesTable2',
      column: 0,
      width: { value: 4, unit: 'cm' },
    });
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    const anchorCell = positionedCells(tablixRows(tablix!)[0]!)[0]!.cell;
    const content = contentOfCell(anchorCell)!;
    // En este modelo canónico el span vive dentro de `CellContents`.
    expect(anchorCell.child('CellContents')?.child('ColSpan')?.text()).toBe('2');
    // 4cm (columna 0) + ancho actual de la columna 1.
    expect(readCm(content.child('Width')?.text())).toBeCloseTo(4 + columnWidths(tablix!)[1]!, 3);
    expect(before[1]).toBe(columnWidths(tablix!)[1]);
  });

  it('resizeColumn ajusta también el contenido declarado de las cabeceras', () => {
    const { xml, doc, index } = open('SalesInvoiceESP.rdlc');
    const ctx = { root: doc.root, index };
    const tablix = index.get('Tablix7');
    expect(tablix).toBeDefined();
    const hierarchy = tablix!.child('TablixColumnHierarchy');
    const member = hierarchy?.child('TablixMembers')?.children('TablixMember')[0];
    expect(member?.child('TablixHeader')).toBeDefined();
    // La cabecera que probamos cubre desde la columna 0.
    expect(memberLeafRange(hierarchy!, member!)?.start).toBe(0);

    // Sustituye el contenido canónico de la cabecera por un textbox declarado.
    const headerCell = member!.child('TablixHeader')!.child('CellContents')!;
    const originalId = headerCell
      .children()
      .find((child) => !['ColSpan', 'RowSpan'].includes(child.tagName))!
      .attribute('Name')!;
    const del = applyCommand(ctx, { cmd: 'deleteItem', id: originalId });
    expect(del.isRight()).toBe(true);
    if (!del.isRight()) return;
    const inserted = insertTextboxIn(
      ctx,
      { kind: 'tablixHeader', id: 'Tablix7', axis: 'column', path: [0] },
      2,
      0.6,
    );

    const applied = applyCommand(ctx, {
      cmd: 'resizeColumn',
      id: 'Tablix7',
      column: 0,
      width: { value: 5, unit: 'cm' },
    });
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    const content = headerCell.children().find((child) => child.tagName === 'Textbox')!;
    const range = memberLeafRange(hierarchy!, member!);
    expect(range).toBeDefined();
    if (!range) return;
    const widths = columnWidths(tablix!);
    const expected = widths
      .slice(range.start, range.end + 1)
      .reduce((acc, value) => acc + value, 0);
    expect(readCm(content.child('Width')?.text())).toBeCloseTo(expected, 3);

    expect(undoAll(ctx, applied.value).isRight()).toBe(true);
    expect(undoAll(ctx, inserted).isRight()).toBe(true);
    expect(undoAll(ctx, del.value).isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(xml);
  });

  it('resizeTable también ajusta el contenido declarado de las celdas', () => {
    const { doc, index } = open('SalesInvoiceESP.rdlc');
    const ctx = { root: doc.root, index };
    const tablix = index.get('Tablix2');
    const cell = positionedCells(tablixRows(tablix!)[0]!)[0]!.cell;

    const originalId = contentOfCell(cell)!.attribute('Name')!;
    const del = applyCommand(ctx, { cmd: 'deleteItem', id: originalId });
    expect(del.isRight()).toBe(true);
    if (!del.isRight()) return;
    const inserted = insertTextboxIn(
      ctx,
      { kind: 'tablixCell', id: 'Tablix2', row: 0, col: 0 },
      2,
      0.6,
    );

    const applied = applyCommand(ctx, {
      cmd: 'resizeTable',
      id: 'Tablix2',
      top: { value: 0, unit: 'cm' },
      left: { value: 0, unit: 'cm' },
      width: { value: 10, unit: 'cm' },
      height: { value: 20, unit: 'cm' },
    });
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    const content = contentOfCell(cell)!;
    expect(readCm(content.child('Width')?.text())).toBeCloseTo(columnWidths(tablix!)[0]!, 3);
    expect(readCm(content.child('Height')?.text())).toBeCloseTo(rowHeights(tablix!)[0]!, 3);

    expect(undoAll(ctx, applied.value).isRight()).toBe(true);
    expect(undoAll(ctx, inserted).isRight()).toBe(true);
    expect(undoAll(ctx, del.value).isRight()).toBe(true);
  });

  it('el documento con contenidos ajustados sigue validando el XSD', () => {
    const { doc, index } = open('SalesInvoiceESP.rdlc');
    const ctx = { root: doc.root, index };
    const tablix = index.get('Tablix2');
    const cell = positionedCells(tablixRows(tablix!)[0]!)[0]!.cell;

    const originalId = contentOfCell(cell)!.attribute('Name')!;
    applyCommand(ctx, { cmd: 'deleteItem', id: originalId });
    insertTextboxIn(ctx, { kind: 'tablixCell', id: 'Tablix2', row: 0, col: 0 }, 2, 0.6);
    applyCommand(ctx, {
      cmd: 'resizeColumn',
      id: 'Tablix2',
      column: 0,
      width: { value: 5, unit: 'cm' },
    });
    applyCommand(ctx, {
      cmd: 'resizeRow',
      id: 'Tablix2',
      row: 0,
      height: { value: 1.5, unit: 'cm' },
    });

    const result = validator.validate(adapter.serialize(doc));
    expect(result.problems, result.problems.join(' | ')).toEqual([]);
  });

  it('la proyección muestra el contenido siguiendo a la celda (fallback) o declarado', () => {
    const { doc, index } = open('SalesInvoiceESP.rdlc');
    const ctx = { root: doc.root, index };
    const tablix = index.get('Tablix2');
    const cell = positionedCells(tablixRows(tablix!)[0]!)[0]!.cell;

    // Contenido canónico sin longitudes declaradas: tras el resize la proyección
    // lo presenta con el tamaño de la celda (el fallback manda).
    applyCommand(ctx, {
      cmd: 'resizeColumn',
      id: 'Tablix2',
      column: 0,
      width: { value: 5, unit: 'cm' },
    });
    const canonical = tablixOf(projectAll('SalesInvoiceESP.rdlc', doc), 'Tablix2')!.body.rows[0]!
      .cells[0]!.content;
    expect(canonical?.width && readLengthCm(canonical.width)).toBeCloseTo(5, 3);

    // Con longitud declarada la proyección usa el valor declarado (y el sync
    // del resize lo acaba dejando en el tamaño de la celda).
    const originalId = contentOfCell(cell)!.attribute('Name')!;
    applyCommand(ctx, { cmd: 'deleteItem', id: originalId });
    insertTextboxIn(ctx, { kind: 'tablixCell', id: 'Tablix2', row: 0, col: 0 }, 2, 0.6);
    applyCommand(ctx, {
      cmd: 'resizeColumn',
      id: 'Tablix2',
      column: 0,
      width: { value: 6, unit: 'cm' },
    });
    const declared = tablixOf(projectAll('SalesInvoiceESP.rdlc', doc), 'Tablix2')!.body.rows[0]!
      .cells[0]!.content;
    expect(declared?.width && readLengthCm(declared.width)).toBeCloseTo(6, 3);
  });
});

/** Proyecta el documento y junta los items de todas las regiones. */
function projectAll(name: string, doc: ReturnType<TrueFormatXmlAdapter['parse']>): ItemDto[] {
  const projection = projectionAdapter.project({
    sessionId: 'test',
    filePath: name,
    document: doc,
    version: 1,
  });
  return [
    ...projection.page.header.items,
    ...projection.page.body.items,
    ...projection.page.footer.items,
  ];
}

/** Busca un Tablix por id en la proyección (dentro de rectángulos también). */
function tablixOf(items: ItemDto[], id: string): TablixDto | undefined {
  for (const item of items) {
    if (item.kind === 'tablix' && item.id === id) return item;
    if (item.kind === 'rectangle') {
      const nested = tablixOf(item.children, id);
      if (nested) return nested;
    }
  }
  return undefined;
}

/** cm de una longitud (evita depender de la proyección). */
function readLengthCm(length: Length): number {
  switch (length.unit) {
    case 'cm':
      return length.value;
    case 'mm':
      return length.value / 10;
    case 'in':
      return length.value * 2.54;
    case 'pt':
      return (length.value * 2.54) / 72;
  }
}
