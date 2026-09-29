import { describe, expect, it } from 'vitest';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { undoAll } from './command-test-utils.js';
import { applyCommand } from '../../src/domain/document/commands/applyCommand.js';
import { DocumentIndex } from '../../src/domain/document/index/DocumentIndex.js';
import type { RdlcNode } from '../../src/domain/document/tree/RdlcNode.js';
import { TrueFormatXmlAdapter } from '../../src/infrastructure/rdlc/TrueFormatXmlAdapter.js';
import { LibXml2SchemaValidatorAdapter } from '../../src/infrastructure/validation/LibXml2SchemaValidatorAdapter.js';
import { corpusByName } from '../golden/fixtures.js';

/**
 * F2 parte 3 · estructura del Tablix: `addRow`/`deleteRow`/`addColumn`/
 * `deleteColumn` sincronizan la rejilla (`TablixBody`) con las jerarquías y
 * respetan las celdas fusionadas. El undo es byte-exacto.
 */

const adapter = new TrueFormatXmlAdapter();
const validator = new LibXml2SchemaValidatorAdapter(
  resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../../resources/rdl2016/ReportDefinition2016.xsd',
  ),
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

function openXml(xml: string): {
  doc: ReturnType<TrueFormatXmlAdapter['parse']>;
  index: DocumentIndex;
} {
  const doc = adapter.parse(xml);
  return { doc, index: DocumentIndex.build(doc.root) };
}

function body(tablix: RdlcNode | undefined): RdlcNode | undefined {
  return tablix?.child('TablixBody');
}

function rows(tablix: RdlcNode | undefined): RdlcNode[] {
  return body(tablix)?.child('TablixRows')?.children('TablixRow') ?? [];
}

function columns(tablix: RdlcNode | undefined): RdlcNode[] {
  return body(tablix)?.child('TablixColumns')?.children('TablixColumn') ?? [];
}

function rowCells(row: RdlcNode | undefined): RdlcNode[] {
  return row?.child('TablixCells')?.children('TablixCell') ?? [];
}

/** Textbox de una celda (el contenido real, no los `ColSpan`/`RowSpan`). */
function cellTextbox(cell: RdlcNode | undefined): RdlcNode | undefined {
  return cell?.child('CellContents')?.children('Textbox')[0];
}

/** Nombres de los textboxes de una lista de celdas, en orden. */
function textboxNames(cells: RdlcNode[]): (string | undefined)[] {
  return cells.map((cell) => cellTextbox(cell)?.attribute('Name'));
}

/** Hojas de una jerarquía: cada hoja es una fila/columna del body. */
function leafCount(hierarchy: RdlcNode | undefined): number {
  const members = hierarchy?.child('TablixMembers');
  if (!members) return 0;
  const count = (member: RdlcNode): number => {
    const nested = member.child('TablixMembers');
    if (!nested) return 1;
    return nested.children('TablixMember').reduce((acc, child) => acc + count(child), 0);
  };
  return members.children('TablixMember').reduce((acc, child) => acc + count(child), 0);
}

describe('F2 · addRow / deleteRow', () => {
  it('inserta una fila con una celda por columna y su miembro, y el undo es exacto', () => {
    const { xml, doc, index } = open('SalesCreditMemoESP.rdlc');
    const tablix = index.get('Tablix3');
    const before = rows(tablix).length;

    const applied = applyCommand(
      { root: doc.root, index },
      { cmd: 'addRow', id: 'Tablix3', row: 1 },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    expect(rows(index.get('Tablix3'))).toHaveLength(before + 1);
    expect(rowCells(rows(index.get('Tablix3'))[1])).toHaveLength(columns(tablix).length);
    expect(leafCount(index.get('Tablix3')?.child('TablixRowHierarchy'))).toBe(before + 1);

    const undone = undoAll({ root: doc.root, index }, applied.value);
    expect(undone.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(xml);
  });

  it('hereda el alto de la fila vecina', () => {
    const { doc, index } = open('SalesCreditMemoESP.rdlc');
    const tablix = index.get('Tablix3');
    const neighborHeight = rows(tablix)[0]?.child('Height')?.text();

    applyCommand({ root: doc.root, index }, { cmd: 'addRow', id: 'Tablix3', row: 0 });
    expect(rows(index.get('Tablix3'))[0]?.child('Height')?.text()).toBe(neighborHeight);
  });

  it('las celdas nuevas nacen con un textbox vacío (nombre único, sin longitudes y XSD válido)', () => {
    const { xml, doc, index } = open('SalesCreditMemoESP.rdlc');
    const applied = applyCommand(
      { root: doc.root, index },
      { cmd: 'addRow', id: 'Tablix3', row: 1 },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    const cells = rowCells(rows(index.get('Tablix3'))[1]);
    expect(cells).toHaveLength(columns(index.get('Tablix3')).length);
    const names = textboxNames(cells);
    for (const name of names) expect(name).toMatch(/^Textbox\d+$/);
    // Sin duplicados dentro del mismo comando.
    expect(new Set(names).size).toBe(names.length);
    for (const cell of cells) {
      const textbox = cellTextbox(cell);
      // Sin longitudes: el tamaño lo pone la celda, como en BC.
      expect(textbox?.child('Width')).toBeUndefined();
      expect(textbox?.child('Height')).toBeUndefined();
      // Listo para escribir: un párrafo con un run vacío.
      expect(textbox?.child('Paragraphs')?.children('Paragraph')).toHaveLength(1);
    }

    const problems = validator.validate(adapter.serialize(doc)).problems;
    expect(problems, problems.join(' | ')).toEqual([]);

    const undone = undoAll({ root: doc.root, index }, applied.value);
    expect(undone.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(xml);
  });

  it('elimina la fila y su miembro; se rechaza quedarse sin filas', () => {
    const { xml, doc, index } = open('SalesCreditMemoESP.rdlc');
    const applied = applyCommand(
      { root: doc.root, index },
      { cmd: 'deleteRow', id: 'Tablix3', row: 1 },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;
    expect(rows(index.get('Tablix3'))).toHaveLength(1);

    const last = applyCommand(
      { root: doc.root, index },
      { cmd: 'deleteRow', id: 'Tablix3', row: 0 },
    );
    expect(last.isLeft()).toBe(true);

    const undone = undoAll({ root: doc.root, index }, applied.value);
    expect(undone.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(xml);
  });

  it('dentro de un grupo, la fila nueva entra como hoja del grupo', () => {
    const { xml, doc, index } = open('SalesCreditMemoESP.rdlc');
    const groupBefore = index
      .get('LinesTable')
      ?.child('TablixRowHierarchy')
      ?.child('TablixMembers')
      ?.children('TablixMember')[2];
    expect(groupBefore?.child('TablixMembers')?.children('TablixMember')).toHaveLength(2);

    const applied = applyCommand(
      { root: doc.root, index },
      { cmd: 'addRow', id: 'LinesTable', row: 3 },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    const groupAfter = index
      .get('LinesTable')
      ?.child('TablixRowHierarchy')
      ?.child('TablixMembers')
      ?.children('TablixMember')[2];
    expect(groupAfter?.child('TablixMembers')?.children('TablixMember')).toHaveLength(3);

    const undone = undoAll({ root: doc.root, index }, applied.value);
    expect(undone.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(xml);
  });
});

describe('F2 · addRowOutsideGroup', () => {
  it('inserta la fila fuera del grupo por encima (miembro antes del grupo)', () => {
    const { xml, doc, index } = open('SalesCreditMemoESP.rdlc');
    const rowsBefore = rows(index.get('LinesTable')).length;

    const applied = applyCommand(
      { root: doc.root, index },
      { cmd: 'addRowOutsideGroup', id: 'LinesTable', row: 2, where: 'above' },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    // La fila nace justo antes de la primera hoja del grupo (índice 2).
    expect(rows(index.get('LinesTable'))).toHaveLength(rowsBefore + 1);
    expect(rowCells(rows(index.get('LinesTable'))[2])).toHaveLength(
      columns(index.get('LinesTable')).length,
    );
    // El miembro nuevo es el anterior al grupo en el nivel raíz: 5 miembros.
    const rootMembers = index
      .get('LinesTable')
      ?.child('TablixRowHierarchy')
      ?.child('TablixMembers')
      ?.children('TablixMember');
    expect(rootMembers).toHaveLength(5);
    expect(rootMembers?.[2]?.child('Group')).toBeUndefined();
    expect(rootMembers?.[3]?.child('Group')?.attribute('Name')).toBe('LineNo');
    expect(rootMembers?.[3]?.child('TablixMembers')?.children('TablixMember')).toHaveLength(2);

    const problems = validator.validate(adapter.serialize(doc)).problems;
    expect(problems, problems.join(' | ')).toEqual([]);

    const undone = undoAll({ root: doc.root, index }, applied.value);
    expect(undone.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(xml);
  });

  it('inserta la fila fuera del grupo por debajo (miembro después del grupo)', () => {
    const { xml, doc, index } = open('SalesCreditMemoESP.rdlc');
    const rowsBefore = rows(index.get('LinesTable')).length;

    const applied = applyCommand(
      { root: doc.root, index },
      { cmd: 'addRowOutsideGroup', id: 'LinesTable', row: 3, where: 'below' },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    // El grupo cubre las hojas 2-3: la fila nueva nace en la 4 (tras el grupo).
    expect(rows(index.get('LinesTable'))).toHaveLength(rowsBefore + 1);
    const rootMembers = index
      .get('LinesTable')
      ?.child('TablixRowHierarchy')
      ?.child('TablixMembers')
      ?.children('TablixMember');
    expect(rootMembers?.[2]?.child('Group')?.attribute('Name')).toBe('LineNo');
    expect(rootMembers?.[3]?.child('Group')).toBeUndefined();
    expect(rootMembers?.[4]?.child('Group')).toBeUndefined();

    const problems = validator.validate(adapter.serialize(doc)).problems;
    expect(problems, problems.join(' | ')).toEqual([]);

    const undone = undoAll({ root: doc.root, index }, applied.value);
    expect(undone.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(xml);
  });

  it('un grupo hoja también admite fila fuera (antes de su única hoja)', () => {
    const { xml, doc, index } = open('SalesCreditMemoESP.rdlc');
    const applied = applyCommand(
      { root: doc.root, index },
      { cmd: 'addRowOutsideGroup', id: 'Tablix7', row: 0, where: 'above' },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    expect(rows(index.get('Tablix7'))).toHaveLength(2);
    const rootMembers = index
      .get('Tablix7')
      ?.child('TablixRowHierarchy')
      ?.child('TablixMembers')
      ?.children('TablixMember');
    expect(rootMembers).toHaveLength(2);
    expect(rootMembers?.[1]?.child('Group')).toBeDefined();

    const problems = validator.validate(adapter.serialize(doc)).problems;
    expect(problems, problems.join(' | ')).toEqual([]);

    const undone = undoAll({ root: doc.root, index }, applied.value);
    expect(undone.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(xml);
  });

  it('rechaza filas sin grupo y fuera de rango', () => {
    const { doc, index } = open('SalesCreditMemoESP.rdlc');
    const ctx = { root: doc.root, index };

    // Tablix3 no tiene grupos.
    expect(
      applyCommand(ctx, {
        cmd: 'addRowOutsideGroup',
        id: 'Tablix3',
        row: 0,
        where: 'above',
      }).isLeft(),
    ).toBe(true);
    expect(
      applyCommand(ctx, {
        cmd: 'addRowOutsideGroup',
        id: 'LinesTable',
        row: 9,
        where: 'below',
      }).isLeft(),
    ).toBe(true);
  });
});

describe('F2 · addRowInsideGroup', () => {
  it('en la última fila del grupo, la fila nueva entra DENTRO (no fuera)', () => {
    const { xml, doc, index } = open('SalesCreditMemoESP.rdlc');
    const tablix = index.get('LinesTable2');
    const rowsBefore = rows(tablix).length;

    const applied = applyCommand(
      { root: doc.root, index },
      { cmd: 'addRowInsideGroup', id: 'LinesTable2', row: 3, where: 'below' },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    // El grupo (raíz [2]) gana un hijo; el nivel raíz no cambia.
    const rootMembers = tablix
      ?.child('TablixRowHierarchy')
      ?.child('TablixMembers')
      ?.children('TablixMember');
    expect(rootMembers).toHaveLength(4);
    expect(rootMembers?.[2]?.child('TablixMembers')?.children('TablixMember')).toHaveLength(3);
    expect(rows(index.get('LinesTable2'))).toHaveLength(rowsBefore + 1);
    // La fila nueva nace pegada por debajo de la última hoja del grupo (4).
    expect(
      rows(index.get('LinesTable2'))?.[4]?.child('TablixCells')?.children('TablixCell'),
    ).toBeTruthy();

    const problems = validator.validate(adapter.serialize(doc)).problems;
    expect(problems, problems.join(' | ')).toEqual([]);

    const undone = undoAll({ root: doc.root, index }, applied.value);
    expect(undone.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(xml);
  });

  it('encima de la primera fila del grupo también entra dentro', () => {
    const { xml, doc, index } = open('SalesCreditMemoESP.rdlc');
    const applied = applyCommand(
      { root: doc.root, index },
      { cmd: 'addRowInsideGroup', id: 'LinesTable2', row: 2, where: 'above' },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    const rootMembers = index
      .get('LinesTable2')
      ?.child('TablixRowHierarchy')
      ?.child('TablixMembers')
      ?.children('TablixMember');
    expect(rootMembers).toHaveLength(4);
    expect(rootMembers?.[2]?.child('TablixMembers')?.children('TablixMember')).toHaveLength(3);

    const undone = undoAll({ root: doc.root, index }, applied.value);
    expect(undone.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(xml);
  });

  it('un grupo hoja (Tablix7) se convierte en contenedor conservando su fila', () => {
    const { xml, doc, index } = open('SalesCreditMemoESP.rdlc');
    const tablix = index.get('Tablix7');
    const group = tablix
      ?.child('TablixRowHierarchy')
      ?.child('TablixMembers')
      ?.children('TablixMember')[0];
    expect(group?.child('TablixMembers')).toBeUndefined();

    const applied = applyCommand(
      { root: doc.root, index },
      { cmd: 'addRowInsideGroup', id: 'Tablix7', row: 0, where: 'below' },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    // La fila original pasa a ser el primer miembro y nace la segunda.
    expect(group?.child('TablixMembers')?.children('TablixMember')).toHaveLength(2);
    expect(rows(index.get('Tablix7'))).toHaveLength(2);
    expect(
      tablix?.child('TablixRowHierarchy')?.child('TablixMembers')?.children('TablixMember'),
    ).toHaveLength(1);
    // La cabecera del grupo se conserva (el grupo sigue siendo el mismo).
    expect(group?.child('TablixHeader')).toBeDefined();

    const problems = validator.validate(adapter.serialize(doc)).problems;
    expect(problems, problems.join(' | ')).toEqual([]);

    const undone = undoAll({ root: doc.root, index }, applied.value);
    expect(undone.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(xml);
  });

  it('rechaza filas sin grupo y fuera de rango', () => {
    const { doc, index } = open('SalesCreditMemoESP.rdlc');
    const ctx = { root: doc.root, index };

    expect(
      applyCommand(ctx, {
        cmd: 'addRowInsideGroup',
        id: 'Tablix3',
        row: 0,
        where: 'below',
      }).isLeft(),
    ).toBe(true);
    expect(
      applyCommand(ctx, {
        cmd: 'addRowInsideGroup',
        id: 'LinesTable2',
        row: 9,
        where: 'below',
      }).isLeft(),
    ).toBe(true);
  });
});

describe('F2 · addColumn / deleteColumn', () => {
  it('inserta la columna en todas las filas y su miembro, y el undo es exacto', () => {
    const { xml, doc, index } = open('SalesCreditMemoESP.rdlc');
    const before = columns(index.get('Tablix3')).length;

    const applied = applyCommand(
      { root: doc.root, index },
      { cmd: 'addColumn', id: 'Tablix3', column: 2 },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    expect(columns(index.get('Tablix3'))).toHaveLength(before + 1);
    for (const row of rows(index.get('Tablix3'))) {
      expect(rowCells(row)).toHaveLength(before + 1);
    }
    expect(leafCount(index.get('Tablix3')?.child('TablixColumnHierarchy'))).toBe(before + 1);

    const undone = undoAll({ root: doc.root, index }, applied.value);
    expect(undone.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(xml);
  });

  it('las celdas nuevas de la columna nacen con un textbox vacío (nombre único y XSD válido)', () => {
    const { xml, doc, index } = open('SalesCreditMemoESP.rdlc');
    const applied = applyCommand(
      { root: doc.root, index },
      { cmd: 'addColumn', id: 'Tablix3', column: 2 },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    // Tablix3 no tiene celdas fusionadas: la celda 2 de cada fila es la nueva.
    const names: (string | undefined)[] = [];
    for (const row of rows(index.get('Tablix3'))) {
      const name = cellTextbox(rowCells(row)[2])?.attribute('Name');
      expect(name).toMatch(/^Textbox\d+$/);
      names.push(name);
    }
    expect(names).toHaveLength(rows(index.get('Tablix3')).length);
    expect(new Set(names).size).toBe(names.length);

    const problems = validator.validate(adapter.serialize(doc)).problems;
    expect(problems, problems.join(' | ')).toEqual([]);

    const undone = undoAll({ root: doc.root, index }, applied.value);
    expect(undone.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(xml);
  });

  it('elimina la columna en todas las filas y su miembro; se rechaza quedarse sin columnas', () => {
    const { xml, doc, index } = open('SalesCreditMemoESP.rdlc');
    const applied = applyCommand(
      { root: doc.root, index },
      { cmd: 'deleteColumn', id: 'Tablix3', column: 0 },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    expect(columns(index.get('Tablix3'))).toHaveLength(5);
    for (const row of rows(index.get('Tablix3'))) {
      expect(rowCells(row)).toHaveLength(5);
    }

    const undone = undoAll({ root: doc.root, index }, applied.value);
    expect(undone.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(xml);
  });

  it('respeto del ColSpan: insertar dentro lo alarga; la fila no gana celda y las demás sí', () => {
    const { xml, doc, index } = open('SalesCreditMemoESP.rdlc');
    const tablix = index.get('LinesTable');
    const row = rows(tablix)[2]!;
    const spanned = row.child('TablixCells')?.children('TablixCell')[1]!;
    expect(spanned.child('CellContents')?.child('ColSpan')?.text()).toBe('6');

    const spanCellsBefore = rowCells(row).length;
    const normalCellsBefore = rowCells(rows(tablix)[0]).length;

    const applied = applyCommand(
      { root: doc.root, index },
      { cmd: 'addColumn', id: 'LinesTable', column: 3 },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    expect(spanned.child('CellContents')?.child('ColSpan')?.text()).toBe('7');
    // La fila del span mantiene sus celdas; una fila normal gana una.
    expect(rowCells(rows(index.get('LinesTable'))[2])).toHaveLength(spanCellsBefore);
    expect(rowCells(rows(index.get('LinesTable'))[0])).toHaveLength(normalCellsBefore + 1);

    const undone = undoAll({ root: doc.root, index }, applied.value);
    expect(undone.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(xml);
  });

  it('respeto del ColSpan al eliminar: la celda fusionada se acorta', () => {
    const { xml, doc, index } = open('SalesCreditMemoESP.rdlc');
    const row = rows(index.get('LinesTable'))[2]!;
    const spanned = row.child('TablixCells')?.children('TablixCell')[1]!;

    const applied = applyCommand(
      { root: doc.root, index },
      { cmd: 'deleteColumn', id: 'LinesTable', column: 3 },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;
    expect(spanned.child('CellContents')?.child('ColSpan')?.text()).toBe('5');

    const undone = undoAll({ root: doc.root, index }, applied.value);
    expect(undone.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(xml);
  });
});

/* ---------------- celdas fusionadas verticales (RowSpan) ---------------- */

const ROWSPAN_XML = `<?xml version="1.0" encoding="utf-8"?>
<Report xmlns="http://schemas.microsoft.com/sqlserver/reporting/2016/01/reportdefinition">
  <ReportSections>
    <ReportSection>
      <Body>
        <ReportItems>
          <Tablix Name="T">
            <TablixBody>
              <TablixColumns>
                <TablixColumn><Width>2cm</Width></TablixColumn>
                <TablixColumn><Width>2cm</Width></TablixColumn>
              </TablixColumns>
              <TablixRows>
                <TablixRow>
                  <Height>0.6cm</Height>
                  <TablixCells>
                    <TablixCell>
                      <CellContents>
                        <RowSpan>2</RowSpan>
                        <Textbox Name="A">
                          <Paragraphs><Paragraph><TextRuns><TextRun><Value>a</Value></TextRun></TextRuns></Paragraph></Paragraphs>
                        </Textbox>
                      </CellContents>
                    </TablixCell>
                    <TablixCell>
                      <CellContents>
                        <Textbox Name="B">
                          <Paragraphs><Paragraph><TextRuns><TextRun><Value>b</Value></TextRun></TextRuns></Paragraph></Paragraphs>
                        </Textbox>
                      </CellContents>
                    </TablixCell>
                  </TablixCells>
                </TablixRow>
                <TablixRow>
                  <Height>0.6cm</Height>
                  <TablixCells>
                    <TablixCell>
                      <CellContents>
                        <Textbox Name="C">
                          <Paragraphs><Paragraph><TextRuns><TextRun><Value>c</Value></TextRun></TextRuns></Paragraph></Paragraphs>
                        </Textbox>
                      </CellContents>
                    </TablixCell>
                  </TablixCells>
                </TablixRow>
              </TablixRows>
            </TablixBody>
            <TablixRowHierarchy>
              <TablixMembers><TablixMember /><TablixMember /></TablixMembers>
            </TablixRowHierarchy>
            <TablixColumnHierarchy>
              <TablixMembers><TablixMember /><TablixMember /></TablixMembers>
            </TablixColumnHierarchy>
          </Tablix>
        </ReportItems>
        <Height>5cm</Height>
      </Body>
    </ReportSection>
  </ReportSections>
</Report>`;

describe('F2 · borrado en lote y fusión de celdas', () => {
  it('deleteRows borra varias filas en un solo undo (byte-exacto)', () => {
    const { xml, doc, index } = open('SalesCreditMemoESP.rdlc');
    const before = rows(index.get('LinesTable')).length;

    const applied = applyCommand(
      { root: doc.root, index },
      { cmd: 'deleteRows', id: 'LinesTable', rows: [3, 1] },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    expect(rows(index.get('LinesTable'))).toHaveLength(before - 2);
    expect(leafCount(index.get('LinesTable')?.child('TablixRowHierarchy'))).toBe(before - 2);

    const undone = undoAll({ root: doc.root, index }, applied.value);
    expect(undone.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(xml);
  });

  it('deleteColumns borra varias columnas en un solo undo (con ColSpan por medio)', () => {
    const { xml, doc, index } = open('SalesCreditMemoESP.rdlc');
    const before = columns(index.get('LinesTable')).length;

    const applied = applyCommand(
      { root: doc.root, index },
      { cmd: 'deleteColumns', id: 'LinesTable', columns: [2, 0] },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    expect(columns(index.get('LinesTable'))).toHaveLength(before - 2);
    for (const row of rows(index.get('LinesTable'))) {
      expect(rowCells(row).length).toBeGreaterThan(0);
    }

    const undone = undoAll({ root: doc.root, index }, applied.value);
    expect(undone.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(xml);
  });

  it('mergeCells combina celdas contiguas de la misma fila y el undo restaura la celda', () => {
    const { xml, doc, index } = open('SalesCreditMemoESP.rdlc');
    const row0Before = rowCells(rows(index.get('LinesTable2'))[0]).length;
    const row1Before = rowCells(rows(index.get('LinesTable2'))[1]).length;

    const applied = applyCommand(
      { root: doc.root, index },
      { cmd: 'mergeCells', id: 'LinesTable2', row: 0, col: 0, rowSpan: 1, colSpan: 2 },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    const anchor = rowCells(rows(index.get('LinesTable2'))[0])[0];
    expect(anchor?.child('CellContents')?.child('ColSpan')?.text()).toBe('2');
    // La celda cubierta desaparece de su fila; las demás filas no se tocan.
    expect(rowCells(rows(index.get('LinesTable2'))[0])).toHaveLength(row0Before - 1);
    expect(rowCells(rows(index.get('LinesTable2'))[1])).toHaveLength(row1Before);

    const undone = undoAll({ root: doc.root, index }, applied.value);
    expect(undone.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(xml);
  });

  it('rechaza la fusión de celdas de otras filas (bloque vertical)', () => {
    const { xml, doc, index } = open('SalesCreditMemoESP.rdlc');

    const applied = applyCommand(
      { root: doc.root, index },
      { cmd: 'mergeCells', id: 'LinesTable2', row: 0, col: 0, rowSpan: 2, colSpan: 2 },
    );
    expect(applied.isLeft()).toBe(true);
    // El documento queda intacto: se rechaza antes de tocar nada.
    expect(adapter.serialize(doc)).toBe(xml);
  });

  it('unmergeCells separa la celda, crea textbox en las nuevas y valida el XSD', () => {
    const { doc, index } = open('SalesCreditMemoESP.rdlc');
    const cellsBefore = rowCells(rows(index.get('LinesTable2'))[0]).length;
    const merged = applyCommand(
      { root: doc.root, index },
      { cmd: 'mergeCells', id: 'LinesTable2', row: 0, col: 0, rowSpan: 1, colSpan: 2 },
    );
    expect(merged.isRight()).toBe(true);
    if (!merged.isRight()) return;
    const afterMerge = adapter.serialize(doc);

    const split = applyCommand(
      { root: doc.root, index },
      { cmd: 'unmergeCells', id: 'LinesTable2', row: 0, col: 0 },
    );
    expect(split.isRight()).toBe(true);
    if (!split.isRight()) return;
    expect(rowCells(rows(index.get('LinesTable2'))[0])).toHaveLength(cellsBefore);

    // La celda cubierta se recrea con un textbox vacío (sin longitudes: el
    // tamaño lo pone la celda) y el documento sigue siendo válido.
    const recreated = rowCells(rows(index.get('LinesTable2'))[0])[1];
    const textbox = recreated?.child('CellContents')?.children('Textbox')[0];
    expect(textbox?.attribute('Name')).toMatch(/^Textbox\d+$/);
    expect(textbox?.child('Width')).toBeUndefined();
    expect(textbox?.child('Height')).toBeUndefined();
    const problems = validator.validate(adapter.serialize(doc)).problems;
    expect(problems, problems.join(' | ')).toEqual([]);

    // El undo del split vuelve exactamente al documento combinado.
    const undoneSplit = undoAll({ root: doc.root, index }, split.value);
    expect(undoneSplit.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(afterMerge);
  });

  it('rechaza fusiones que cortan celdas ya combinadas o de una sola celda', () => {
    const { doc, index } = open('SalesCreditMemoESP.rdlc');

    // La fila 2 de LinesTable tiene un ColSpan 6 en la columna 1.
    const crossing = applyCommand(
      { root: doc.root, index },
      { cmd: 'mergeCells', id: 'LinesTable', row: 2, col: 0, rowSpan: 1, colSpan: 3 },
    );
    expect(crossing.isLeft()).toBe(true);

    const single = applyCommand(
      { root: doc.root, index },
      { cmd: 'mergeCells', id: 'LinesTable2', row: 0, col: 0, rowSpan: 1, colSpan: 1 },
    );
    expect(single.isLeft()).toBe(true);
  });
});

describe('F2 · celdas fusionadas verticales', () => {
  it('insertar en medio de un RowSpan lo alarga y la fila nueva nace sin esa celda', () => {
    const { doc, index } = openXml(ROWSPAN_XML);
    const applied = applyCommand({ root: doc.root, index }, { cmd: 'addRow', id: 'T', row: 1 });
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    const rowsAfter = rows(index.get('T'));
    expect(rowsAfter).toHaveLength(3);
    expect(
      rowsAfter[0]
        ?.child('TablixCells')
        ?.children('TablixCell')[0]
        ?.child('CellContents')
        ?.child('RowSpan')
        ?.text(),
    ).toBe('3');
    // La fila nueva solo tiene la celda de la columna no cubierta.
    expect(rowCells(rowsAfter[1])).toHaveLength(1);
    expect(cellTextbox(rowCells(rowsAfter[1])[0])?.attribute('Name')).toMatch(/^Textbox\d+$/);
  });

  it('eliminar una fila cubierta por un RowSpan lo acorta y el undo es exacto', () => {
    const { doc, index } = openXml(ROWSPAN_XML);
    const before = adapter.serialize(doc);
    const applied = applyCommand({ root: doc.root, index }, { cmd: 'deleteRow', id: 'T', row: 1 });
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    expect(rows(index.get('T'))).toHaveLength(1);
    expect(
      rows(index.get('T'))[0]
        ?.child('TablixCells')
        ?.children('TablixCell')[0]
        ?.child('CellContents')
        ?.child('RowSpan')
        ?.text(),
    ).toBe('1');

    const undone = undoAll({ root: doc.root, index }, applied.value);
    expect(undone.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(before);
  });

  it('rechaza eliminar una fila que inicia un RowSpan (dejaría huérfanas las de abajo)', () => {
    const { doc, index } = openXml(ROWSPAN_XML);
    const applied = applyCommand({ root: doc.root, index }, { cmd: 'deleteRow', id: 'T', row: 0 });
    expect(applied.isLeft()).toBe(true);
  });

  it('unmergeCells separa una fusión vertical que ya venía en el fichero', () => {
    const { doc, index } = openXml(ROWSPAN_XML);
    const before = adapter.serialize(doc);

    const split = applyCommand(
      { root: doc.root, index },
      { cmd: 'unmergeCells', id: 'T', row: 0, col: 0 },
    );
    expect(split.isRight()).toBe(true);
    if (!split.isRight()) return;

    expect(
      rowCells(rows(index.get('T'))[0])[0]
        ?.child('CellContents')
        ?.child('RowSpan'),
    ).toBeUndefined();
    // La fila de abajo recupera su celda (posición 0, vacía).
    expect(rowCells(rows(index.get('T'))[1])).toHaveLength(2);

    const undone = undoAll({ root: doc.root, index }, split.value);
    expect(undone.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(before);
  });
});
