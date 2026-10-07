import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { CommandService } from '../../src/application/services/CommandService.js';
import { applyCommand } from '../../src/domain/document/commands/applyCommand.js';
import type { CommandContext } from '../../src/domain/document/commands/CommandContext.js';
import { DocumentIndex } from '../../src/domain/document/index/DocumentIndex.js';
import type { RdlcNode } from '../../src/domain/document/tree/RdlcNode.js';
import { TrueFormatXmlAdapter } from '../../src/infrastructure/rdlc/TrueFormatXmlAdapter.js';
import { cleanupTempDirs, makeService } from '../application/test-utils.js';
import { undoAll } from '../domain/command-test-utils.js';

/**
 * Regresiones de bugs CONOCIDOS del dominio de comandos.
 *
 * Cada `describe('BUG-NN …')` reproduce un bug todavía sin corregir con
 * `it.fails(...)`: las aserciones describen el comportamiento CORRECTO, así que
 * hoy fallan (y el suite queda verde). Al corregir un bug, quita `.fails` de su
 * test: entonces debe pasar.
 */

afterEach(cleanupTempDirs);

const adapter = new TrueFormatXmlAdapter();

function openXml(xml: string): {
  doc: ReturnType<TrueFormatXmlAdapter['parse']>;
  ctx: CommandContext;
} {
  const doc = adapter.parse(xml);
  return { doc, ctx: { root: doc.root, index: DocumentIndex.build(doc.root) } };
}

/** Reconstruye el índice (lo que hace la sesión tras un comando estructural). */
function rebuilt(ctx: CommandContext): CommandContext {
  return { root: ctx.root, index: DocumentIndex.build(ctx.root) };
}

/* ------------------------------- helpers -------------------------------- */

function walk(node: RdlcNode, visit: (node: RdlcNode) => void): void {
  visit(node);
  for (const child of node.children()) walk(child, visit);
}

const REPORT_ITEM_TAGS = new Set([
  'Line',
  'Rectangle',
  'Textbox',
  'Image',
  'Subreport',
  'Chart',
  'GaugePanel',
  'Map',
  'Tablix',
  'CustomReportItem',
]);

/** Nombres de todos los report items del documento (en orden de documento). */
function reportItemNames(root: RdlcNode): string[] {
  const names: string[] = [];
  walk(root, (node) => {
    const name = REPORT_ITEM_TAGS.has(node.tagName) ? node.attribute('Name') : undefined;
    if (name) names.push(name);
  });
  return names;
}

/** Nombres de todos los `<Group>` del documento. */
function groupNames(root: RdlcNode): string[] {
  const names: string[] = [];
  walk(root, (node) => {
    const name = node.tagName === 'Group' ? node.attribute('Name') : undefined;
    if (name) names.push(name);
  });
  return names;
}

/** Nombres repetidos (sin distinguir mayúsculas, como RB/VB). */
function duplicatesIgnoringCase(names: string[]): string[] {
  const seen = new Set<string>();
  const dupes: string[] = [];
  for (const name of names) {
    const lower = name.toLowerCase();
    if (seen.has(lower)) dupes.push(name);
    seen.add(lower);
  }
  return dupes;
}

function tablixRows(tablix: RdlcNode | undefined): RdlcNode[] {
  return tablix?.child('TablixBody')?.child('TablixRows')?.children('TablixRow') ?? [];
}

function tablixColumns(tablix: RdlcNode | undefined): RdlcNode[] {
  return tablix?.child('TablixBody')?.child('TablixColumns')?.children('TablixColumn') ?? [];
}

function rowCells(row: RdlcNode | undefined): RdlcNode[] {
  return row?.child('TablixCells')?.children('TablixCell') ?? [];
}

/** Hojas de una jerarquía de miembros (cada hoja = una fila/columna del body). */
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

/* ------------------------------- fixtures ------------------------------- */

function cell(name: string, value: string): string {
  return `<TablixCell>
                      <CellContents>
                        <Textbox Name="${name}">
                          <Paragraphs><Paragraph><TextRuns><TextRun><Value>${value}</Value></TextRun></TextRuns></Paragraph></Paragraphs>
                        </Textbox>
                      </CellContents>
                    </TablixCell>`;
}

/**
 * Informe mínimo sin `<Page>`:
 * - Tablix `T` de 3 columnas × 2 filas sin fusiones (textbox `Description` en
 *   la cabecera: colisión con el campo del mismo nombre).
 * - Rectángulo `Rect` con `Toggler` y `Target` (Target se alterna con Toggler).
 * - Textbox `Styled` (FontSize 10pt en el item, 8pt en el run).
 * - Textbox `Legacy` con un `<ListStyle>` legado dentro de `<Style>`.
 */
const BASE_XML = `<?xml version="1.0" encoding="utf-8"?>
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
                <TablixColumn><Width>2cm</Width></TablixColumn>
              </TablixColumns>
              <TablixRows>
                <TablixRow>
                  <Height>0.6cm</Height>
                  <TablixCells>
                    ${cell('Description', 'Description')}
                    ${cell('H2', 'h2')}
                    ${cell('H3', 'h3')}
                  </TablixCells>
                </TablixRow>
                <TablixRow>
                  <Height>0.6cm</Height>
                  <TablixCells>
                    ${cell('D1', '=Fields!Description.Value')}
                    ${cell('D2', 'd2')}
                    ${cell('D3', 'd3')}
                  </TablixCells>
                </TablixRow>
              </TablixRows>
            </TablixBody>
            <TablixColumnHierarchy>
              <TablixMembers><TablixMember /><TablixMember /><TablixMember /></TablixMembers>
            </TablixColumnHierarchy>
            <TablixRowHierarchy>
              <TablixMembers><TablixMember /><TablixMember /></TablixMembers>
            </TablixRowHierarchy>
            <Top>0cm</Top>
            <Left>0cm</Left>
            <Height>1.2cm</Height>
            <Width>6cm</Width>
          </Tablix>
          <Rectangle Name="Rect">
            <ReportItems>
              <Textbox Name="Toggler">
                <Paragraphs><Paragraph><TextRuns><TextRun><Value>+</Value></TextRun></TextRuns></Paragraph></Paragraphs>
                <Top>0cm</Top>
                <Left>0cm</Left>
                <Height>0.5cm</Height>
                <Width>1cm</Width>
              </Textbox>
              <Textbox Name="Target">
                <Paragraphs><Paragraph><TextRuns><TextRun><Value>detail</Value></TextRun></TextRuns></Paragraph></Paragraphs>
                <Top>0.5cm</Top>
                <Left>0cm</Left>
                <Height>0.5cm</Height>
                <Width>3cm</Width>
                <Visibility>
                  <Hidden>true</Hidden>
                  <ToggleItem>Toggler</ToggleItem>
                </Visibility>
              </Textbox>
            </ReportItems>
            <Top>2cm</Top>
            <Left>0cm</Left>
            <Height>1cm</Height>
            <Width>4cm</Width>
          </Rectangle>
          <Textbox Name="Styled">
            <Paragraphs>
              <Paragraph>
                <TextRuns>
                  <TextRun>
                    <Value>styled</Value>
                    <Style>
                      <FontSize>8pt</FontSize>
                    </Style>
                  </TextRun>
                </TextRuns>
              </Paragraph>
            </Paragraphs>
            <Top>3.5cm</Top>
            <Left>0cm</Left>
            <Height>0.5cm</Height>
            <Width>3cm</Width>
            <Style>
              <FontSize>10pt</FontSize>
            </Style>
          </Textbox>
          <Textbox Name="Legacy">
            <Paragraphs><Paragraph><TextRuns><TextRun><Value>legacy</Value></TextRun></TextRuns></Paragraph></Paragraphs>
            <Top>4.5cm</Top>
            <Left>0cm</Left>
            <Height>0.5cm</Height>
            <Width>3cm</Width>
            <Style>
              <Color>Red</Color>
              <FontWeight>Bold</FontWeight>
              <ListStyle>Bulleted</ListStyle>
            </Style>
          </Textbox>
        </ReportItems>
        <Height>6cm</Height>
      </Body>
      <Width>15cm</Width>
    </ReportSection>
  </ReportSections>
  <DataSets>
    <DataSet Name="DataSet_Result">
      <Fields>
        <Field Name="Description">
          <DataField>Description</DataField>
        </Field>
      </Fields>
    </DataSet>
  </DataSets>
</Report>`;

/** Tablix 2×2 con un RowSpan en (0,0); la fila de abajo omite la celda cubierta. */
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

/**
 * Tablix 3×2 en convención SSRS/BC (una `TablixCell` por columna) con un bloque
 * RowSpan 2 × ColSpan 2 en (0,0): las posiciones cubiertas son celdas vacías.
 */
const BLOCK_SLOT_XML = `<?xml version="1.0" encoding="utf-8"?>
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
                <TablixColumn><Width>2cm</Width></TablixColumn>
              </TablixColumns>
              <TablixRows>
                <TablixRow>
                  <Height>0.6cm</Height>
                  <TablixCells>
                    <TablixCell>
                      <CellContents>
                        <Textbox Name="A">
                          <Paragraphs><Paragraph><TextRuns><TextRun><Value>a</Value></TextRun></TextRuns></Paragraph></Paragraphs>
                        </Textbox>
                        <ColSpan>2</ColSpan>
                        <RowSpan>2</RowSpan>
                      </CellContents>
                    </TablixCell>
                    <TablixCell />
                    ${cell('B', 'b')}
                  </TablixCells>
                </TablixRow>
                <TablixRow>
                  <Height>0.6cm</Height>
                  <TablixCells>
                    <TablixCell />
                    <TablixCell />
                    ${cell('C', 'c')}
                  </TablixCells>
                </TablixRow>
              </TablixRows>
            </TablixBody>
            <TablixColumnHierarchy>
              <TablixMembers><TablixMember /><TablixMember /><TablixMember /></TablixMembers>
            </TablixColumnHierarchy>
            <TablixRowHierarchy>
              <TablixMembers><TablixMember /><TablixMember /></TablixMembers>
            </TablixRowHierarchy>
          </Tablix>
        </ReportItems>
        <Height>5cm</Height>
      </Body>
    </ReportSection>
  </ReportSections>
</Report>`;

/* --------------------------------- bugs --------------------------------- */

/*
 * BUG-02 · deleteRows/deleteColumns no son atómicos.
 * `deleteMany` (src/domain/document/commands/tablixStructure.ts:705) aplica los
 * borrados uno a uno y, si uno posterior falla, devuelve el error SIN revertir
 * los ya aplicados: el documento queda medio borrado y sin entrada de undo.
 * Remove `.fails` when fixing; the test must then pass.
 */
describe('BUG-02 · deleteRows/deleteColumns atómicos', () => {
  it.fails('deleteRows de todas las filas se rechaza y deja el documento intacto', () => {
    const { doc, ctx } = openXml(BASE_XML);
    const before = adapter.serialize(doc);

    const result = applyCommand(ctx, { cmd: 'deleteRows', id: 'T', rows: [0, 1] });

    expect(result.isLeft(), 'borrar todas las filas debe rechazarse').toBe(true);
    expect(adapter.serialize(doc), 'un rechazo no debe dejar filas borradas a medias').toBe(before);
  });

  it.fails('deleteColumns de todas las columnas se rechaza y deja el documento intacto', () => {
    const { doc, ctx } = openXml(BASE_XML);
    const before = adapter.serialize(doc);

    const result = applyCommand(ctx, { cmd: 'deleteColumns', id: 'T', columns: [0, 1, 2] });

    expect(result.isLeft(), 'borrar todas las columnas debe rechazarse').toBe(true);
    expect(adapter.serialize(doc), 'un rechazo no debe dejar columnas borradas a medias').toBe(
      before,
    );
  });
});

/*
 * BUG-03 · batch de duplicateItem repite nombres.
 * `applyDuplicateItem` (src/domain/document/commands/duplicateItem.ts:35) llama
 * a `insertCloneAt` sin un registro `taken` compartido y el índice no se
 * reconstruye entre los comandos del batch: dos clones del mismo lote eligen el
 * mismo `TextboxN` (el pegado `insertClones` de applyCommand.ts ~210 sí lo
 * comparte).
 * Remove `.fails` when fixing; the test must then pass.
 */
describe('BUG-03 · batch de duplicateItem con nombres únicos', () => {
  it.fails('duplicar dos textboxes en un batch da clones con Name distinto', () => {
    const { doc, ctx } = openXml(BASE_XML);

    const result = applyCommand(ctx, {
      cmd: 'batch',
      commands: [
        { cmd: 'duplicateItem', id: 'Styled' },
        { cmd: 'duplicateItem', id: 'Legacy' },
      ],
    });
    expect(result.isRight(), 'el batch debe aplicarse').toBe(true);
    if (!result.isRight()) return;

    const created = result.value.createdIds ?? [];
    expect(created).toHaveLength(2);
    expect(new Set(created.map((id) => id.toLowerCase())).size, `createdIds: ${created}`).toBe(2);
    const dupes = duplicatesIgnoringCase(reportItemNames(doc.root));
    expect(dupes, 'ningún Name de report item puede repetirse').toEqual([]);
  });
});

/*
 * BUG-04 · deleteRow deja un grupo hoja fantasma.
 * Tras `addRowGroup` sobre una fila, `deleteRow` de esa fila quita la hoja y el
 * `TablixMembers` vacío (`removeEmptyContainer`,
 * src/domain/document/commands/tablixStructure.ts:1151, llamado desde ~492/664)
 * pero el `TablixMember` del grupo se queda como hoja SIN fila en el body: la
 * jerarquía tiene más hojas que filas.
 * Remove `.fails` when fixing; the test must then pass.
 */
describe('BUG-04 · borrar la fila de un grupo no deja hojas sin fila', () => {
  it.fails('addRowGroup + deleteRow mantiene hojas de filas == TablixRows', () => {
    const { ctx } = openXml(BASE_XML);

    const grouped = applyCommand(ctx, {
      cmd: 'addRowGroup',
      id: 'T',
      row: 1,
      expression: '=Fields!Description.Value',
    });
    expect(grouped.isRight(), 'addRowGroup debe aplicarse').toBe(true);

    const deleted = applyCommand(ctx, { cmd: 'deleteRow', id: 'T', row: 1 });
    expect(deleted.isRight(), 'deleteRow debe aplicarse').toBe(true);

    const tablix = ctx.index.get('T');
    expect(
      leafCount(tablix?.child('TablixRowHierarchy')),
      'cada hoja de TablixRowHierarchy debe corresponder a una TablixRow',
    ).toBe(tablixRows(tablix).length);
  });

  it.fails('addColumnGroup + deleteColumn mantiene hojas de columnas == TablixColumns', () => {
    const { ctx } = openXml(BASE_XML);

    const grouped = applyCommand(ctx, {
      cmd: 'addColumnGroup',
      id: 'T',
      column: 2,
      expression: '=Fields!Description.Value',
    });
    expect(grouped.isRight(), 'addColumnGroup debe aplicarse').toBe(true);

    const deleted = applyCommand(ctx, { cmd: 'deleteColumn', id: 'T', column: 2 });
    expect(deleted.isRight(), 'deleteColumn debe aplicarse').toBe(true);

    const tablix = ctx.index.get('T');
    expect(
      leafCount(tablix?.child('TablixColumnHierarchy')),
      'cada hoja de TablixColumnHierarchy debe corresponder a una TablixColumn',
    ).toBe(tablixColumns(tablix).length);
  });
});

/*
 * BUG-05 · celdas de más/de menos bajo un RowSpan.
 * `usesSlotCells` (src/domain/document/commands/tablixParts.ts) solo reconoce
 * la convención SSRS/BC si hay un `ColSpan` que desborda la cuenta; una fila con
 * una celda de relleno bajo un `RowSpan` (sin ColSpan) se toma por convención
 * del editor:
 * - `applyUnmergeCells` (tablixStructure.ts ~872) inserta una celda nueva en
 *   vez de rellenar el hueco → la fila creada por `addRow` bajo el RowSpan acaba
 *   con más `TablixCell` que columnas.
 * - `applyAddColumn` (tablixStructure.ts ~556) no añade relleno en una fila
 *   cubierta por un bloque RowSpan×ColSpan → se queda con una celda de menos.
 * Remove `.fails` when fixing; the test must then pass.
 */
describe('BUG-05 · número de celdas coherente bajo un RowSpan', () => {
  it.fails('addRow bajo un RowSpan + unmergeCells: cada fila tiene una celda por columna', () => {
    const { ctx } = openXml(ROWSPAN_XML);

    const added = applyCommand(ctx, { cmd: 'addRow', id: 'T', row: 1 });
    expect(added.isRight(), 'addRow debe aplicarse').toBe(true);
    const split = applyCommand(rebuilt(ctx), { cmd: 'unmergeCells', id: 'T', row: 0, col: 0 });
    expect(split.isRight(), 'unmergeCells debe aplicarse').toBe(true);

    const tablix = ctx.root
      .child('ReportSections')
      ?.child('ReportSection')
      ?.child('Body')
      ?.child('ReportItems')
      ?.child('Tablix');
    const columnCount = tablixColumns(tablix).length;
    // Sin fusiones, las dos convenciones coinciden: una celda por columna.
    expect(
      tablixRows(tablix).map((row) => rowCells(row).length),
      'tras separar, cada TablixRow debe tener exactamente una TablixCell por columna',
    ).toEqual(tablixRows(tablix).map(() => columnCount));
  });

  it.fails(
    'addColumn dentro de un bloque RowSpan×ColSpan: la fila cubierta gana su relleno',
    () => {
      const { ctx } = openXml(BLOCK_SLOT_XML);

      const added = applyCommand(ctx, { cmd: 'addColumn', id: 'T', column: 1 });
      expect(added.isRight(), 'addColumn debe aplicarse').toBe(true);

      const tablix = ctx.index.get('T');
      const columnCount = tablixColumns(tablix).length;
      expect(columnCount).toBe(4);
      // Convención SSRS/BC: una TablixCell por columna en todas las filas.
      expect(
        tablixRows(tablix).map((row) => rowCells(row).length),
        'cada TablixRow (convención slot) debe tener una TablixCell por columna',
      ).toEqual([columnCount, columnCount]);
    },
  );
});

/*
 * BUG-10 · undo de setStyle no byte-exacto con override en el run.
 * `applySetStyle` (src/domain/document/commands/setStyle.ts:99/121) devuelve
 * los inversos [setStyle(previo), ...restored]; el journal los aplica al revés,
 * así que primero restaura el run (8pt) y DESPUÉS el `setStyle` inverso vuelve a
 * sincronizar los overrides y pisa el run con el valor del item (10pt).
 * Remove `.fails` when fixing; the test must then pass.
 */
describe('BUG-10 · undo de setStyle con override en el run', () => {
  it.fails('setStyle fontSize + undo devuelve el XML byte a byte (run a 8pt)', () => {
    const { doc, ctx } = openXml(BASE_XML);
    const before = adapter.serialize(doc);

    const applied = applyCommand(ctx, {
      cmd: 'setStyle',
      id: 'Styled',
      style: { fontSize: { value: 12, unit: 'pt' } },
    });
    expect(applied.isRight(), 'setStyle debe aplicarse').toBe(true);
    if (!applied.isRight()) return;

    const undone = undoAll(ctx, applied.value);
    expect(undone.isRight(), 'el undo debe aplicarse').toBe(true);

    const run = ctx.index
      .get('Styled')
      ?.child('Paragraphs')
      ?.child('Paragraph')
      ?.child('TextRuns')
      ?.child('TextRun');
    expect(run?.child('Style')?.child('FontSize')?.text(), 'el run vuelve a su 8pt').toBe('8pt');
    expect(adapter.serialize(doc), 'el undo debe ser byte-exacto').toBe(before);
  });
});

/*
 * BUG-11 · colisión de nombres entre items y grupos.
 * - `nextGroupName` (src/domain/document/commands/tablixGroups.ts:211/752) solo
 *   mira `Group`/`DataSet`: agrupar por `Fields!Description` con un textbox
 *   `Description` crea un grupo llamado `Description`.
 * - `applySetName` (setName.ts) e `applyInsertItem` (insertItem.ts) solo
 *   comprueban el índice de items: permiten usar el nombre de un grupo.
 * Remove `.fails` when fixing; the test must then pass.
 */
describe('BUG-11 · nombres de items y grupos no colisionan', () => {
  it.fails('addRowGroup no reutiliza el nombre de un report item', () => {
    const { doc, ctx } = openXml(BASE_XML);

    const grouped = applyCommand(ctx, {
      cmd: 'addRowGroup',
      id: 'T',
      row: 1,
      expression: '=Fields!Description.Value',
    });
    expect(grouped.isRight(), 'addRowGroup debe aplicarse').toBe(true);

    const items = new Set(reportItemNames(doc.root).map((name) => name.toLowerCase()));
    const clashing = groupNames(doc.root).filter((name) => items.has(name.toLowerCase()));
    expect(clashing, 'ningún grupo puede llamarse como un report item').toEqual([]);
  });

  it.fails('setName rechaza renombrar un item al nombre de un grupo existente', () => {
    const { ctx } = openXml(BASE_XML);
    const grouped = applyCommand(ctx, {
      cmd: 'addRowGroup',
      id: 'T',
      row: 1,
      expression: '=Fields!D2.Value',
    });
    expect(grouped.isRight()).toBe(true);
    const ctx2 = rebuilt(ctx);
    const group = groupNames(ctx2.root)[0]!;
    expect(group).toBe('D2');
    // `D2` ya es un textbox; se renombra primero para que el único dueño sea el grupo.
    expect(applyCommand(ctx2, { cmd: 'setName', id: 'D2', name: 'D2Cell' }).isRight()).toBe(true);
    const ctx3 = rebuilt(ctx2);

    const renamed = applyCommand(ctx3, { cmd: 'setName', id: 'H2', name: group });
    expect(renamed.isLeft(), `renombrar H2 a '${group}' (nombre de grupo) debe rechazarse`).toBe(
      true,
    );
  });

  it.fails('insertItem rechaza un nombre que ya usa un grupo', () => {
    const { doc, ctx } = openXml(BASE_XML);
    const grouped = applyCommand(ctx, {
      cmd: 'addRowGroup',
      id: 'T',
      row: 1,
      expression: '=Fields!Category.Value',
    });
    expect(grouped.isRight()).toBe(true);
    expect(groupNames(doc.root)).toEqual(['Category']);

    const inserted = applyCommand(rebuilt(ctx), {
      cmd: 'insertItem',
      scope: { kind: 'body' },
      index: 0,
      item: {
        kind: 'textbox',
        name: 'Category',
        top: { value: 5, unit: 'cm' },
        left: { value: 0, unit: 'cm' },
        width: { value: 2, unit: 'cm' },
        height: { value: 0.5, unit: 'cm' },
        text: '',
      },
    });
    expect(
      inserted.isLeft(),
      "insertar un textbox 'Category' (nombre de grupo) debe rechazarse",
    ).toBe(true);
  });
});

/*
 * BUG-12 · clonar no reescribe las referencias a los descendientes renombrados.
 * `renameDescendants` (src/domain/document/commands/cloneInsert.ts:44) renombra
 * los hijos del clon pero no sus referencias (`ToggleItem`): el textbox clonado
 * sigue alternándose con el `Toggler` ORIGINAL.
 * Remove `.fails` when fixing; the test must then pass.
 */
describe('BUG-12 · clonar actualiza ToggleItem a los nombres del clon', () => {
  it.fails(
    'duplicateItem de un rectángulo: el ToggleItem del clon apunta al toggler del clon',
    () => {
      const { ctx } = openXml(BASE_XML);

      const result = applyCommand(ctx, { cmd: 'duplicateItem', id: 'Rect' });
      expect(result.isRight(), 'duplicateItem debe aplicarse').toBe(true);
      if (!result.isRight()) return;

      const clone = rebuilt(ctx).index.get(result.value.createdId!);
      const [toggler, target] = clone?.child('ReportItems')?.children('Textbox') ?? [];
      expect(toggler?.attribute('Name')).not.toBe('Toggler');
      expect(
        target?.child('Visibility')?.child('ToggleItem')?.text(),
        'el ToggleItem del clon debe referenciar el Toggler renombrado del clon',
      ).toBe(toggler?.attribute('Name'));
    },
  );
});

/*
 * BUG-13 · mergeCells rechaza ampliar una fusión existente.
 * `applyMergeCells` (src/domain/document/commands/tablixStructure.ts:779)
 * compara `entry !== anchor` por identidad de objeto entre dos llamadas a
 * `positionedCells` (objetos distintos): el ancla ya fusionada se toma por
 * «celda ya fusionada» y la ampliación se rechaza.
 * Remove `.fails` when fixing; the test must then pass.
 */
describe('BUG-13 · ampliar una celda ya combinada', () => {
  it.fails('mergeCells colSpan 2 y luego colSpan 3 desde la misma ancla', () => {
    const { ctx } = openXml(BASE_XML);

    const first = applyCommand(ctx, {
      cmd: 'mergeCells',
      id: 'T',
      row: 0,
      col: 0,
      rowSpan: 1,
      colSpan: 2,
    });
    expect(first.isRight(), 'la primera fusión debe aplicarse').toBe(true);

    const ctx2 = rebuilt(ctx);
    const extended = applyCommand(ctx2, {
      cmd: 'mergeCells',
      id: 'T',
      row: 0,
      col: 0,
      rowSpan: 1,
      colSpan: 3,
    });
    expect(
      extended.isRight(),
      `ampliar la fusión debe aplicarse (rechazo: ${extended.isLeft() ? extended.value.errorMessage : ''})`,
    ).toBe(true);
    const anchor = rowCells(tablixRows(ctx2.index.get('T'))[0])[0];
    expect(anchor?.child('CellContents')?.child('ColSpan')?.text()).toBe('3');
  });
});

/*
 * BUG-14 · setRegionPresent deja un `<Page>` vacío al deshacer.
 * `applySetRegionPresent` (src/domain/document/commands/pageRegions.ts:170)
 * crea `<Page>` con `childOrCreate` si no existe, pero su inverso solo quita la
 * banda: el undo deja un `<Page>` vacío (no byte-exacto).
 * Remove `.fails` when fixing; the test must then pass.
 */
describe('BUG-14 · undo de setRegionPresent sin <Page> previo', () => {
  it.fails('añadir el encabezado en un documento sin <Page> y deshacer es byte-exacto', () => {
    const { doc, ctx } = openXml(BASE_XML);
    const before = adapter.serialize(doc);
    expect(before).not.toContain('<Page>');

    const applied = applyCommand(ctx, {
      cmd: 'setRegionPresent',
      region: 'pageHeader',
      present: true,
    });
    expect(applied.isRight(), 'setRegionPresent debe aplicarse').toBe(true);
    if (!applied.isRight()) return;

    const undone = undoAll(ctx, applied.value);
    expect(undone.isRight(), 'el undo debe aplicarse').toBe(true);
    expect(adapter.serialize(doc), 'el undo no debe dejar un <Page> vacío').toBe(before);
  });
});

/*
 * BUG-15 · setStyle: quitar un <ListStyle> legado y una clave `null` del mismo
 * `<Style>` se deshace en otro orden.
 * `writeStylePatch` registra el índice PRÍSTINO del tag quitado, pero
 * `removeStyleChild` (src/domain/document/commands/setStyle.ts, writeListStyle)
 * registra el índice VIVO (ya desplazado por el borrado anterior); al
 * reinsertar, el `<ListStyle>` vuelve en otra posición.
 * Remove `.fails` when fixing; the test must then pass.
 */
describe('BUG-15 · undo de setStyle con ListStyle legado + clave null', () => {
  it.fails('color:null + listStyle:null y undo devuelven el <Style> en su orden original', () => {
    const { doc, ctx } = openXml(BASE_XML);
    const before = adapter.serialize(doc);

    const applied = applyCommand(ctx, {
      cmd: 'setStyle',
      id: 'Legacy',
      style: { color: null, listStyle: null } as never,
    });
    expect(applied.isRight(), 'setStyle debe aplicarse').toBe(true);
    if (!applied.isRight()) return;

    const undone = undoAll(ctx, applied.value);
    expect(undone.isRight(), 'el undo debe aplicarse').toBe(true);
    const order = ctx.index
      .get('Legacy')
      ?.child('Style')
      ?.children()
      .map((node) => node.tagName);
    expect(order, 'orden de los hijos de <Style> tras el undo').toEqual([
      'Color',
      'FontWeight',
      'ListStyle',
    ]);
    expect(adapter.serialize(doc), 'el undo debe ser byte-exacto').toBe(before);
  });
});

/*
 * BUG-16 · índice obsoleto tras deleteRow/deleteColumn y comandos de grupo.
 * `STRUCTURAL_COMMANDS` (src/application/services/CommandService.ts:23) no
 * incluye `deleteRow`/`deleteColumn`/`deleteRows`/`deleteColumns` ni los
 * comandos de grupo: el `DocumentIndex` sigue devolviendo los textboxes de la
 * fila borrada (nodos desprendidos) y un `setText` sobre ellos se acepta.
 * Remove `.fails` when fixing; the test must then pass.
 */
describe('BUG-16 · el índice se reconstruye tras borrar filas/columnas', () => {
  async function openBase(): Promise<{
    commands: CommandService;
    service: Awaited<ReturnType<typeof makeService>>['service'];
    sessionId: string;
  }> {
    const { service, tmp } = await makeService();
    const path = join(tmp, 'KnownBugs.rdlc');
    await writeFile(path, BASE_XML, 'utf8');
    const opened = await service.open(path);
    if (!opened.isRight()) throw new Error(`no abrió: ${opened.value.errorMessage}`);
    return { commands: new CommandService(service), service, sessionId: opened.value.sessionId };
  }

  it.fails('setText sobre un textbox de una fila borrada se rechaza (no encontrado)', async () => {
    const { commands, service, sessionId } = await openBase();

    expect(commands.execute(sessionId, { cmd: 'deleteRow', id: 'T', row: 1 }).isRight()).toBe(true);

    const target = service.getEditTarget(sessionId);
    if (!target.isRight()) throw new Error('sin edit target');
    expect(target.value.index.get('D1'), 'D1 ya no está en el documento').toBeUndefined();

    const edited = commands.execute(sessionId, {
      cmd: 'setText',
      id: 'D1',
      p: 0,
      r: 0,
      value: 'fantasma',
    });
    expect(edited.isLeft(), 'setText sobre un textbox borrado debe rechazarse').toBe(true);
  });

  it.fails(
    'setText sobre un textbox de una columna borrada se rechaza (no encontrado)',
    async () => {
      const { commands, sessionId } = await openBase();

      expect(
        commands.execute(sessionId, { cmd: 'deleteColumn', id: 'T', column: 2 }).isRight(),
      ).toBe(true);

      const edited = commands.execute(sessionId, {
        cmd: 'setText',
        id: 'D3',
        p: 0,
        r: 0,
        value: 'fantasma',
      });
      expect(edited.isLeft(), 'setText sobre un textbox borrado debe rechazarse').toBe(true);
    },
  );
});
