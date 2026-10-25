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
    if (last.isLeft()) expect(last.value.reason).toBe('tablixNeedsRow');

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

  it('respeto del ColSpan: insertar dentro lo alarga con un relleno en la fila SSRS', () => {
    const { xml, doc, index } = open('SalesCreditMemoESP.rdlc');
    const tablix = index.get('LinesTable');
    const row = rows(tablix)[2]!;
    const spanned = row.child('TablixCells')!.children('TablixCell')[1]!;
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
    // BC/SSRS: una celda por columna; la fila del span gana una celda de relleno
    // (vacía) para la columna nueva y las demás ganan una celda con textbox.
    expect(rowCells(rows(index.get('LinesTable'))[2])).toHaveLength(spanCellsBefore + 1);
    expect(
      rows(index.get('LinesTable'))[2]
        ?.child('TablixCells')
        ?.children('TablixCell')[3]
        ?.child('CellContents'),
    ).toBeUndefined();
    expect(rowCells(rows(index.get('LinesTable'))[0])).toHaveLength(normalCellsBefore + 1);

    const undone = undoAll({ root: doc.root, index }, applied.value);
    expect(undone.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(xml);
  });

  it('respeto del ColSpan al eliminar: la celda fusionada se acorta y la fila SSRS pierde su relleno', () => {
    const { xml, doc, index } = open('SalesCreditMemoESP.rdlc');
    const row = rows(index.get('LinesTable'))[2]!;
    const spanned = row.child('TablixCells')!.children('TablixCell')[1]!;
    const cellsBefore = rowCells(row).length;

    const applied = applyCommand(
      { root: doc.root, index },
      { cmd: 'deleteColumn', id: 'LinesTable', column: 3 },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;
    expect(spanned.child('CellContents')?.child('ColSpan')?.text()).toBe('5');
    // Una celda por columna: al quitar la columna desaparece también su relleno.
    expect(rowCells(rows(index.get('LinesTable'))[2])).toHaveLength(cellsBefore - 1);
    expect(rowCells(rows(index.get('LinesTable'))[2])).toHaveLength(
      columns(index.get('LinesTable')).length,
    );

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
    // La celda cubierta se queda como relleno vacío (BC/SSRS exigen una celda
    // por columna: RB lanza «índice fuera de intervalo» si desaparece); las
    // demás filas no se tocan.
    const row0After = rowCells(rows(index.get('LinesTable2'))[0]);
    expect(row0After).toHaveLength(row0Before);
    expect(row0After[1]?.child('CellContents')).toBeUndefined();
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
    if (applied.isLeft()) expect(applied.value.reason).toBe('mergeNeedsSingleRow');
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
    if (crossing.isLeft()) expect(crossing.value.reason).toBe('selectionCutsMergedCell');

    const single = applyCommand(
      { root: doc.root, index },
      { cmd: 'mergeCells', id: 'LinesTable2', row: 0, col: 0, rowSpan: 1, colSpan: 1 },
    );
    expect(single.isLeft()).toBe(true);
    if (single.isLeft()) expect(single.value.reason).toBe('mergeSingleCell');
  });
});

describe('F2 · convención SSRS/BC (una celda por columna)', () => {
  it('mergeCells vacía la celda cubierta sin quitarla (fila de BC)', () => {
    const { xml, doc, index } = open('SalesShipment.rdlc');
    const row = rows(index.get('SalesLine'))[2]!;
    const cellsBefore = rowCells(row).length;

    // `Textbox55` (columna 6) y `Textbox64` (columna 7): detrás de un `ColSpan`
    // con celdas de relleno.
    const applied = applyCommand(
      { root: doc.root, index },
      { cmd: 'mergeCells', id: 'SalesLine', row: 2, col: 6, rowSpan: 1, colSpan: 2 },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    const after = rows(index.get('SalesLine'))[2]!;
    // Una celda por columna: la cubierta se queda como relleno vacío.
    expect(rowCells(after)).toHaveLength(cellsBefore);
    expect(rowCells(after)).toHaveLength(columns(index.get('SalesLine')).length);
    expect(rowCells(after)[6]?.child('CellContents')?.child('ColSpan')?.text()).toBe('2');
    expect(rowCells(after)[7]?.child('CellContents')).toBeUndefined();

    const undone = undoAll({ root: doc.root, index }, applied.value);
    expect(undone.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(xml);
  });

  it('unmergeCells rellena el hueco existente en vez de insertar una celda', () => {
    const { doc, index } = open('SalesShipment.rdlc');
    const merged = applyCommand(
      { root: doc.root, index },
      { cmd: 'mergeCells', id: 'SalesLine', row: 2, col: 6, rowSpan: 1, colSpan: 2 },
    );
    expect(merged.isRight()).toBe(true);
    if (!merged.isRight()) return;
    const afterMerge = adapter.serialize(doc);
    const cellsAfterMerge = rowCells(rows(index.get('SalesLine'))[2]).length;

    const split = applyCommand(
      { root: doc.root, index },
      { cmd: 'unmergeCells', id: 'SalesLine', row: 2, col: 6 },
    );
    expect(split.isRight()).toBe(true);
    if (!split.isRight()) return;

    expect(rowCells(rows(index.get('SalesLine'))[2])).toHaveLength(cellsAfterMerge);
    const filled = rowCells(rows(index.get('SalesLine'))[2])[7];
    expect(cellTextbox(filled)?.attribute('Name')).toMatch(/^Textbox\d+$/);
    const problems = validator.validate(adapter.serialize(doc)).problems;
    expect(problems, problems.join(' | ')).toEqual([]);

    const undone = undoAll({ root: doc.root, index }, split.value);
    expect(undone.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(afterMerge);
  });

  it('insertar en una celda usa la columna de rejilla (detrás de un ColSpan)', () => {
    const { doc, index } = open('SalesShipment.rdlc');
    const ctx = { root: doc.root, index };
    const scope = { kind: 'tablixCell' as const, id: 'SalesLine', row: 2, col: 6 };
    const item = {
      kind: 'textbox' as const,
      name: 'TxtColumnaRejilla',
      top: { value: 0, unit: 'cm' as const },
      left: { value: 0, unit: 'cm' as const },
      width: { value: 1, unit: 'cm' as const },
      height: { value: 0.4, unit: 'cm' as const },
      text: '',
    };

    // La columna 6 es `Textbox55`, detrás de un `ColSpan` de 5 y sus rellenos.
    const applied = applyCommand(ctx, { cmd: 'insertItem', scope, index: 0, item });
    expect(applied.isRight()).toBe(true);
    const cell = rows(index.get('SalesLine'))[2]?.child('TablixCells')?.children('TablixCell')[6];
    expect(cell?.child('CellContents')?.children('Textbox')[0]?.attribute('Name')).toBe(
      'TxtColumnaRejilla',
    );

    // Una columna cubierta por el `ColSpan` es relleno: no admite contenido.
    const covered = applyCommand(ctx, {
      cmd: 'insertItem',
      scope: { kind: 'tablixCell', id: 'SalesLine', row: 2, col: 3 },
      index: 0,
      item: { ...item, name: 'TxtRelleno' },
    });
    expect(covered.isLeft()).toBe(true);
  });
});

describe('F2 · celdas fusionadas verticales', () => {
  it('insertar en medio de un RowSpan lo alarga y la fila nueva nace con un relleno', () => {
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
    // La fila nueva nace con una celda por columna: relleno vacío en la columna
    // cubierta por el RowSpan y textbox en la libre.
    expect(rowCells(rowsAfter[1])).toHaveLength(2);
    expect(rowCells(rowsAfter[1])[0]?.child('CellContents')).toBeUndefined();
    expect(cellTextbox(rowCells(rowsAfter[1])[1])?.attribute('Name')).toMatch(/^Textbox\d+$/);
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
    if (applied.isLeft()) expect(applied.value.reason).toBe('rowHasVerticalMerge');
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

/* ------------------------ formato heredado de la vecina ------------------------ */

interface CellStyles {
  /** Contenido del `Style` del run / párrafo / textbox. */
  run?: string;
  para?: string;
  box?: string;
  /** `ColSpan`/`RowSpan` de la celda (XML ya escrito). */
  span?: string;
  /** Nodos extra del textbox que NO deben heredarse (visibilidad, acciones…). */
  extra?: string;
}

function styledCell(name: string, styles: CellStyles = {}): string {
  const { run, para, box, span = '', extra = '' } = styles;
  return `<TablixCell><CellContents>${span}<Textbox Name="${name}"><CanGrow>true</CanGrow><Paragraphs><Paragraph><TextRuns><TextRun><Value>${name} texto</Value>${run ? `<Style>${run}</Style>` : ''}</TextRun></TextRuns>${para ? `<Style>${para}</Style>` : ''}</Paragraph></Paragraphs>${extra}${box ? `<Style>${box}</Style>` : ''}</Textbox></CellContents></TablixCell>`;
}

/** Tablix `T` de 2 columnas con las filas dadas (XML de `TablixRow`). */
function tablixXml(tablixRows: string[]): string {
  const members = tablixRows.map(() => '<TablixMember />').join('');
  return `<?xml version="1.0" encoding="utf-8"?>
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
              <TablixRows>${tablixRows.join('')}</TablixRows>
            </TablixBody>
            <TablixRowHierarchy><TablixMembers>${members}</TablixMembers></TablixRowHierarchy>
            <TablixColumnHierarchy><TablixMembers><TablixMember /><TablixMember /></TablixMembers></TablixColumnHierarchy>
          </Tablix>
        </ReportItems>
        <Height>5cm</Height>
      </Body>
    </ReportSection>
  </ReportSections>
</Report>`;
}

function row(...cells: string[]): string {
  return `<TablixRow><Height>0.6cm</Height><TablixCells>${cells.join('')}</TablixCells></TablixRow>`;
}

/** Cabecera / cuerpo / pie con un formato distinto por fila y por columna. */
const FORMAT_XML = tablixXml([
  row(
    styledCell('H0', {
      run: '<FontWeight>Bold</FontWeight>',
      para: '<TextAlign>Center</TextAlign>',
      box: '<BackgroundColor>LightGrey</BackgroundColor>',
      extra: '<Visibility><Hidden>true</Hidden></Visibility>',
    }),
    styledCell('H1', { run: '<FontStyle>Italic</FontStyle>' }),
  ),
  row(
    styledCell('B0', { run: '<Color>Red</Color>' }),
    styledCell('B1', { run: '<Color>Blue</Color>' }),
  ),
  row(
    styledCell('F0', { run: '<FontSize>14pt</FontSize>' }),
    styledCell('F1', { run: '<FontSize>16pt</FontSize>' }),
  ),
]);

function textOfCell(cell: RdlcNode | undefined): string | undefined {
  return cellTextbox(cell)
    ?.child('Paragraphs')
    ?.child('Paragraph')
    ?.child('TextRuns')
    ?.child('TextRun')
    ?.child('Value')
    ?.text();
}

function runStyle(cell: RdlcNode | undefined, tag: string): string | undefined {
  return cellTextbox(cell)
    ?.child('Paragraphs')
    ?.child('Paragraph')
    ?.child('TextRuns')
    ?.child('TextRun')
    ?.child('Style')
    ?.child(tag)
    ?.text();
}

function paragraphStyle(cell: RdlcNode | undefined, tag: string): string | undefined {
  return cellTextbox(cell)
    ?.child('Paragraphs')
    ?.child('Paragraph')
    ?.child('Style')
    ?.child(tag)
    ?.text();
}

function boxStyle(cell: RdlcNode | undefined, tag: string): string | undefined {
  return cellTextbox(cell)?.child('Style')?.child(tag)?.text();
}

function cellAt(tablix: RdlcNode | undefined, r: number, c: number): RdlcNode | undefined {
  return rowCells(rows(tablix)[r])[c];
}

describe('F2 · las filas/columnas nuevas heredan el formato de la vecina', () => {
  it('fila encima: copia la fila que baja (celda a celda), con texto vacío', () => {
    const { doc, index } = openXml(FORMAT_XML);
    const applied = applyCommand({ root: doc.root, index }, { cmd: 'addRow', id: 'T', row: 1 });
    expect(applied.isRight()).toBe(true);

    const tablix = index.get('T');
    expect(rows(tablix)).toHaveLength(4);
    // La fila 1 nueva copia la antigua fila 1 (ahora en la 2): rojo / azul.
    expect(runStyle(cellAt(tablix, 1, 0), 'Color')).toBe('Red');
    expect(runStyle(cellAt(tablix, 1, 1), 'Color')).toBe('Blue');
    expect(textOfCell(cellAt(tablix, 1, 0))).toBe('');
    expect(textOfCell(cellAt(tablix, 1, 1))).toBe('');
    // Es una celda nueva: nombre propio, no el de la original.
    expect(cellTextbox(cellAt(tablix, 1, 0))?.attribute('Name')).toMatch(/^Textbox\d+$/);
  });

  it('fila debajo: copia la fila de arriba; sin `where` rige el índice (la que baja)', () => {
    const below = openXml(FORMAT_XML);
    // "Debajo de la fila 1" = índice 2: copia la fila 1 (arriba), no la 2.
    const applied = applyCommand(
      { root: below.doc.root, index: below.index },
      { cmd: 'addRow', id: 'T', row: 2, where: 'below' },
    );
    expect(applied.isRight()).toBe(true);
    expect(runStyle(cellAt(below.index.get('T'), 2, 0), 'Color')).toBe('Red');
    expect(runStyle(cellAt(below.index.get('T'), 2, 1), 'Color')).toBe('Blue');
    expect(runStyle(cellAt(below.index.get('T'), 2, 0), 'FontSize')).toBeUndefined();

    const above = openXml(FORMAT_XML);
    applyCommand({ root: above.doc.root, index: above.index }, { cmd: 'addRow', id: 'T', row: 2 });
    expect(runStyle(cellAt(above.index.get('T'), 2, 0), 'FontSize')).toBe('14pt');
    expect(runStyle(cellAt(above.index.get('T'), 2, 1), 'FontSize')).toBe('16pt');
  });

  it('copia los estilos de textbox, párrafo y run, y solo eso (sin visibilidad ni nombre)', () => {
    const { doc, index } = openXml(FORMAT_XML);
    applyCommand({ root: doc.root, index }, { cmd: 'addRow', id: 'T', row: 0 });

    const cell = cellAt(index.get('T'), 0, 0);
    expect(runStyle(cell, 'FontWeight')).toBe('Bold');
    expect(paragraphStyle(cell, 'TextAlign')).toBe('Center');
    expect(boxStyle(cell, 'BackgroundColor')).toBe('LightGrey');
    // Nada comportamental: ni la visibilidad ni el nombre de la original.
    expect(cellTextbox(cell)?.child('Visibility')).toBeUndefined();
    expect(cellTextbox(cell)?.attribute('Name')).not.toBe('H0');
    // Orden canónico: el `Style` del textbox cierra tras los párrafos.
    expect(
      cellTextbox(cell)
        ?.children()
        .map((child) => child.tagName),
    ).toEqual(['CanGrow', 'Paragraphs', 'Style']);
    // La original no se toca.
    expect(boxStyle(cellAt(index.get('T'), 1, 0), 'BackgroundColor')).toBe('LightGrey');
  });

  it('en el borde de la tabla usa la otra vecina', () => {
    // Al final (índice = nº de filas): no hay "la que baja", copia la última.
    const end = openXml(FORMAT_XML);
    applyCommand({ root: end.doc.root, index: end.index }, { cmd: 'addRow', id: 'T', row: 3 });
    expect(runStyle(cellAt(end.index.get('T'), 3, 0), 'FontSize')).toBe('14pt');

    // Debajo de nada (índice 0 con `below`): no hay fila previa, copia la primera.
    const start = openXml(FORMAT_XML);
    applyCommand(
      { root: start.doc.root, index: start.index },
      { cmd: 'addRow', id: 'T', row: 0, where: 'below' },
    );
    expect(runStyle(cellAt(start.index.get('T'), 0, 0), 'FontWeight')).toBe('Bold');
  });

  it('columna a la izquierda: copia la columna que se corre; a la derecha, la anterior', () => {
    const left = openXml(FORMAT_XML);
    const applied = applyCommand(
      { root: left.doc.root, index: left.index },
      { cmd: 'addColumn', id: 'T', column: 1 },
    );
    expect(applied.isRight()).toBe(true);
    // Copia la columna 1 original (azul / cursiva / 16pt), celda a celda.
    expect(runStyle(cellAt(left.index.get('T'), 0, 1), 'FontStyle')).toBe('Italic');
    expect(runStyle(cellAt(left.index.get('T'), 1, 1), 'Color')).toBe('Blue');
    expect(runStyle(cellAt(left.index.get('T'), 2, 1), 'FontSize')).toBe('16pt');
    expect(textOfCell(cellAt(left.index.get('T'), 1, 1))).toBe('');

    const right = openXml(FORMAT_XML);
    applyCommand(
      { root: right.doc.root, index: right.index },
      { cmd: 'addColumn', id: 'T', column: 1, where: 'right' },
    );
    // "A la derecha de la columna 0": copia la 0 (negrita / rojo / 14pt).
    expect(runStyle(cellAt(right.index.get('T'), 0, 1), 'FontWeight')).toBe('Bold');
    expect(paragraphStyle(cellAt(right.index.get('T'), 0, 1), 'TextAlign')).toBe('Center');
    expect(runStyle(cellAt(right.index.get('T'), 1, 1), 'Color')).toBe('Red');
    expect(runStyle(cellAt(right.index.get('T'), 2, 1), 'FontSize')).toBe('14pt');
  });

  it('columna en el borde usa la otra vecina', () => {
    const end = openXml(FORMAT_XML);
    applyCommand(
      { root: end.doc.root, index: end.index },
      { cmd: 'addColumn', id: 'T', column: 2 },
    );
    expect(runStyle(cellAt(end.index.get('T'), 1, 2), 'Color')).toBe('Blue');

    const start = openXml(FORMAT_XML);
    applyCommand(
      { root: start.doc.root, index: start.index },
      { cmd: 'addColumn', id: 'T', column: 0, where: 'right' },
    );
    expect(runStyle(cellAt(start.index.get('T'), 1, 0), 'Color')).toBe('Red');
  });

  it('una referencia fusionada (ColSpan) presta el formato de su ancla en cada columna que cubre', () => {
    const MERGED_XML = tablixXml([
      row(
        styledCell('M', {
          span: '<ColSpan>2</ColSpan>',
          run: '<FontWeight>Bold</FontWeight>',
          box: '<BackgroundColor>Gold</BackgroundColor>',
        }),
        '<TablixCell />',
      ),
      row(styledCell('C', { run: '<Color>Red</Color>' }), styledCell('D')),
    ]);

    // Fila debajo de la fusionada: las dos columnas heredan el estilo del ancla.
    const addedRow = openXml(MERGED_XML);
    const rowApplied = applyCommand(
      { root: addedRow.doc.root, index: addedRow.index },
      { cmd: 'addRow', id: 'T', row: 1, where: 'below' },
    );
    expect(rowApplied.isRight()).toBe(true);
    expect(runStyle(cellAt(addedRow.index.get('T'), 1, 0), 'FontWeight')).toBe('Bold');
    expect(runStyle(cellAt(addedRow.index.get('T'), 1, 1), 'FontWeight')).toBe('Bold');
    expect(boxStyle(cellAt(addedRow.index.get('T'), 1, 1), 'BackgroundColor')).toBe('Gold');

    // Columna nueva al borde derecho: la fila fusionada recibe el estilo del ancla.
    const addedColumn = openXml(MERGED_XML);
    const columnApplied = applyCommand(
      { root: addedColumn.doc.root, index: addedColumn.index },
      { cmd: 'addColumn', id: 'T', column: 2 },
    );
    expect(columnApplied.isRight()).toBe(true);
    expect(runStyle(cellAt(addedColumn.index.get('T'), 0, 2), 'FontWeight')).toBe('Bold');
    expect(runStyle(cellAt(addedColumn.index.get('T'), 1, 2), 'Color')).toBeUndefined();
  });

  it('una referencia cubierta por un RowSpan de arriba toma el estilo de su ancla', () => {
    const ROWSPAN_FORMAT_XML = tablixXml([
      row(
        styledCell('P', { span: '<RowSpan>2</RowSpan>', run: '<FontWeight>Bold</FontWeight>' }),
        styledCell('Q', { run: '<Color>Red</Color>' }),
      ),
      row('<TablixCell />', styledCell('R', { run: '<Color>Green</Color>' })),
    ]);
    const { doc, index } = openXml(ROWSPAN_FORMAT_XML);
    const applied = applyCommand(
      { root: doc.root, index },
      { cmd: 'addRow', id: 'T', row: 2, where: 'below' },
    );
    expect(applied.isRight()).toBe(true);
    expect(runStyle(cellAt(index.get('T'), 2, 0), 'FontWeight')).toBe('Bold');
    expect(runStyle(cellAt(index.get('T'), 2, 1), 'Color')).toBe('Green');
  });

  it('sin estilo en la referencia, o sin Textbox, la celda nueva queda con el textbox vacío por defecto', () => {
    const plain = openXml(ROWSPAN_XML);
    const applied = applyCommand(
      { root: plain.doc.root, index: plain.index },
      {
        cmd: 'addRow',
        id: 'T',
        row: 0,
      },
    );
    expect(applied.isRight()).toBe(true);
    const created = cellTextbox(cellAt(plain.index.get('T'), 0, 1));
    expect(created?.child('Style')).toBeUndefined();
    expect(created?.child('Paragraphs')?.child('Paragraph')?.child('Style')).toBeUndefined();

    // Referencia con contenido que no es un Textbox (una Line): nada que copiar.
    const NOT_TEXTBOX_XML = tablixXml([
      row(
        '<TablixCell><CellContents><Line Name="L"><Height>0cm</Height></Line></CellContents></TablixCell>',
        '<TablixCell />',
      ),
    ]);
    const other = openXml(NOT_TEXTBOX_XML);
    const added = applyCommand(
      { root: other.doc.root, index: other.index },
      { cmd: 'addRow', id: 'T', row: 1, where: 'below' },
    );
    expect(added.isRight()).toBe(true);
    expect(cellTextbox(cellAt(other.index.get('T'), 1, 0))?.child('Style')).toBeUndefined();
    expect(textOfCell(cellAt(other.index.get('T'), 1, 0))).toBe('');
  });

  it('separar una fusión: las celdas liberadas heredan el formato de la fusionada', () => {
    const MERGED_XML = tablixXml([
      row(
        styledCell('M', { span: '<ColSpan>2</ColSpan>', run: '<FontWeight>Bold</FontWeight>' }),
        '<TablixCell />',
      ),
    ]);
    const { doc, index } = openXml(MERGED_XML);
    const applied = applyCommand(
      { root: doc.root, index },
      { cmd: 'unmergeCells', id: 'T', row: 0, col: 0 },
    );
    expect(applied.isRight()).toBe(true);
    expect(runStyle(cellAt(index.get('T'), 0, 1), 'FontWeight')).toBe('Bold');
    expect(textOfCell(cellAt(index.get('T'), 0, 1))).toBe('');
  });

  it('el undo de insertar fila/columna con formato es un solo paso y byte-exacto', () => {
    for (const command of [
      { cmd: 'addRow', id: 'T', row: 1, where: 'below' },
      { cmd: 'addColumn', id: 'T', column: 1, where: 'right' },
    ] as const) {
      const { doc, index } = openXml(FORMAT_XML);
      const before = adapter.serialize(doc);
      const applied = applyCommand({ root: doc.root, index }, command);
      expect(applied.isRight()).toBe(true);
      if (!applied.isRight()) return;
      expect(adapter.serialize(doc)).not.toBe(before);

      const undone = undoAll({ root: doc.root, index }, applied.value);
      expect(undone.isRight()).toBe(true);
      expect(adapter.serialize(doc)).toBe(before);
    }
  });

  it('en un informe real el resultado hereda estilos y valida contra el XSD', () => {
    const { xml, doc, index } = open('SalesCreditMemoESP.rdlc');
    const tablix = index.get('LinesTable');
    const source = cellTextbox(rowCells(rows(tablix)[1])[0]);

    const applied = applyCommand(
      { root: doc.root, index },
      { cmd: 'addRow', id: 'LinesTable', row: 1 },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    const created = cellTextbox(rowCells(rows(index.get('LinesTable'))[1])[0]);
    expect(Boolean(created?.child('Style'))).toBe(Boolean(source?.child('Style')));
    const problems = validator.validate(adapter.serialize(doc)).problems;
    expect(problems, problems.join(' | ')).toEqual([]);

    const undone = undoAll({ root: doc.root, index }, applied.value);
    expect(undone.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(xml);
  });
});

/* ----------------- alto/ancho heredado de la misma vecina ----------------- */

/** Tablix `T` con las alturas de fila y anchuras de columna dadas (una celda por hueco). */
function sizedXml(heights: string[], widths: string[]): string {
  const cells = widths.map((_, c) => styledCell(`C${c}`)).join('');
  const sizedRows = heights
    .map((h) => `<TablixRow><Height>${h}</Height><TablixCells>${cells}</TablixCells></TablixRow>`)
    .join('');
  return `<?xml version="1.0" encoding="utf-8"?>
<Report xmlns="http://schemas.microsoft.com/sqlserver/reporting/2016/01/reportdefinition">
  <ReportSections>
    <ReportSection>
      <Body>
        <ReportItems>
          <Tablix Name="T">
            <TablixBody>
              <TablixColumns>${widths.map((w) => `<TablixColumn><Width>${w}</Width></TablixColumn>`).join('')}</TablixColumns>
              <TablixRows>${sizedRows}</TablixRows>
            </TablixBody>
            <TablixRowHierarchy><TablixMembers>${heights.map(() => '<TablixMember />').join('')}</TablixMembers></TablixRowHierarchy>
            <TablixColumnHierarchy><TablixMembers>${widths.map(() => '<TablixMember />').join('')}</TablixMembers></TablixColumnHierarchy>
          </Tablix>
        </ReportItems>
        <Height>5cm</Height>
      </Body>
    </ReportSection>
  </ReportSections>
</Report>`;
}

function heightsOf(tablix: RdlcNode | undefined): (string | undefined)[] {
  return rows(tablix).map((r) => r.child('Height')?.text());
}

function widthsOf(tablix: RdlcNode | undefined): (string | undefined)[] {
  return columns(tablix).map((c) => c.child('Width')?.text());
}

describe('F2 · la fila/columna nueva hereda también el alto/ancho de la vecina', () => {
  const XML_SIZES = sizedXml(['0.6cm', '1.2cm', '2.4cm'], ['2cm', '3cm', '4cm']);

  it('fila encima de la 1: toma el alto de la fila que baja', () => {
    const { doc, index } = openXml(XML_SIZES);
    applyCommand({ root: doc.root, index }, { cmd: 'addRow', id: 'T', row: 1, where: 'above' });
    expect(heightsOf(index.get('T'))).toEqual(['0.6cm', '1.2cm', '1.2cm', '2.4cm']);
  });

  it('fila debajo de la 1: toma el alto de la fila de arriba (no el de la que baja)', () => {
    const { doc, index } = openXml(XML_SIZES);
    applyCommand({ root: doc.root, index }, { cmd: 'addRow', id: 'T', row: 2, where: 'below' });
    expect(heightsOf(index.get('T'))).toEqual(['0.6cm', '1.2cm', '1.2cm', '2.4cm']);
  });

  it('fila al final de la tabla: toma el alto de la última', () => {
    const { doc, index } = openXml(XML_SIZES);
    applyCommand({ root: doc.root, index }, { cmd: 'addRow', id: 'T', row: 3, where: 'below' });
    expect(heightsOf(index.get('T'))).toEqual(['0.6cm', '1.2cm', '2.4cm', '2.4cm']);
  });

  it('columna a la izquierda de la 1: toma el ancho de la columna que se corre', () => {
    const { doc, index } = openXml(XML_SIZES);
    applyCommand(
      { root: doc.root, index },
      { cmd: 'addColumn', id: 'T', column: 1, where: 'left' },
    );
    expect(widthsOf(index.get('T'))).toEqual(['2cm', '3cm', '3cm', '4cm']);
  });

  it('columna a la derecha de la 0: toma el ancho de la columna de la izquierda', () => {
    const { doc, index } = openXml(XML_SIZES);
    applyCommand(
      { root: doc.root, index },
      { cmd: 'addColumn', id: 'T', column: 1, where: 'right' },
    );
    expect(widthsOf(index.get('T'))).toEqual(['2cm', '2cm', '3cm', '4cm']);
  });

  it('columna al final de la tabla: toma el ancho de la última', () => {
    const { doc, index } = openXml(XML_SIZES);
    applyCommand(
      { root: doc.root, index },
      { cmd: 'addColumn', id: 'T', column: 3, where: 'right' },
    );
    expect(widthsOf(index.get('T'))).toEqual(['2cm', '3cm', '4cm', '4cm']);
  });
});
