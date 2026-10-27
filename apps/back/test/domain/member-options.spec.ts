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
 * `setMemberOptions` · `RepeatOnNewPage`, `KeepWithGroup` y `KeepTogether` del
 * `TablixMember` (fila o columna), con direccionamiento por `axis` + `path`.
 *
 * Valores por defecto (`false` / `None`): apagar **quita** la etiqueta. El undo
 * es byte-exacto y cada llamada es un único paso de undo.
 */

const adapter = new TrueFormatXmlAdapter();
const validator = new LibXml2SchemaValidatorAdapter(
  resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../../resources/rdl2016/ReportDefinition2016.xsd',
  ),
);

/**
 * Tablix mínimo: filas `[0]` = grupo `G` (dinámico) y `[1]` = miembro estático
 * (sin `Group`). `groupMemberExtra` se inserta tras el `Group` de la fila 0.
 */
function tablixXml(groupMemberExtra = ''): string {
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
              </TablixColumns>
              <TablixRows>
                <TablixRow>
                  <Height>0.6cm</Height>
                  <TablixCells>
                    <TablixCell><CellContents><Textbox Name="A"><Paragraphs><Paragraph><TextRuns><TextRun><Value>a</Value></TextRun></TextRuns></Paragraph></Paragraphs></Textbox></CellContents></TablixCell>
                  </TablixCells>
                </TablixRow>
                <TablixRow>
                  <Height>0.6cm</Height>
                  <TablixCells>
                    <TablixCell><CellContents><Textbox Name="B"><Paragraphs><Paragraph><TextRuns><TextRun><Value>b</Value></TextRun></TextRuns></Paragraph></Paragraphs></Textbox></CellContents></TablixCell>
                  </TablixCells>
                </TablixRow>
              </TablixRows>
            </TablixBody>
            <TablixRowHierarchy>
              <TablixMembers>
                <TablixMember>
                  <Group Name="G">
                    <GroupExpressions>
                      <GroupExpression>=Fields!A.Value</GroupExpression>
                    </GroupExpressions>
                  </Group>
                  ${groupMemberExtra}
                </TablixMember>
                <TablixMember />
              </TablixMembers>
            </TablixRowHierarchy>
            <TablixColumnHierarchy>
              <TablixMembers><TablixMember /></TablixMembers>
            </TablixColumnHierarchy>
          </Tablix>
        </ReportItems>
        <Height>5cm</Height>
      </Body>
    </ReportSection>
  </ReportSections>
</Report>`;
}

function openXml(xml: string): {
  doc: ReturnType<TrueFormatXmlAdapter['parse']>;
  index: DocumentIndex;
} {
  const doc = adapter.parse(xml);
  return { doc, index: DocumentIndex.build(doc.root) };
}

function rowMember(index: DocumentIndex, path: number[]): RdlcNode | undefined {
  let container = index.get('T')?.child('TablixRowHierarchy')?.child('TablixMembers');
  let member: RdlcNode | undefined;
  for (const position of path) {
    member = container?.children('TablixMember')[position];
    if (!member) return undefined;
    const nested = member.child('TablixMembers');
    if (nested) container = nested;
  }
  return member;
}

/** Nombres de hijo del miembro en orden de documento (para comprobar el orden). */
function childTags(member: RdlcNode | undefined): string[] {
  return member?.children().map((child) => child.tagName) ?? [];
}

describe('setMemberOptions', () => {
  it('enciende RepeatOnNewPage en la fila de grupo y la escribe tras el Group', () => {
    const { doc, index } = openXml(tablixXml());
    const applied = applyCommand(
      { root: doc.root, index },
      { cmd: 'setMemberOptions', id: 'T', axis: 'row', path: [0], repeatOnNewPage: true },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;
    expect(applied.value.snapshotOut).toBe(true);

    expect(rowMember(index, [0])?.child('RepeatOnNewPage')?.text()).toBe('true');
    expect(childTags(rowMember(index, [0]))).toEqual(['Group', 'RepeatOnNewPage']);
    const problems = validator.validate(adapter.serialize(doc)).problems;
    expect(problems, problems.join(' | ')).toEqual([]);
  });

  it('enciende KeepWithGroup After y KeepTogether en orden canónico', () => {
    const { doc, index } = openXml(tablixXml());
    const applied = applyCommand(
      { root: doc.root, index },
      {
        cmd: 'setMemberOptions',
        id: 'T',
        axis: 'row',
        path: [0],
        keepTogether: true,
        keepWithGroup: 'After',
      },
    );
    expect(applied.isRight()).toBe(true);
    expect(childTags(rowMember(index, [0]))).toEqual(['Group', 'KeepWithGroup', 'KeepTogether']);
    expect(rowMember(index, [0])?.child('KeepWithGroup')?.text()).toBe('After');
    expect(rowMember(index, [0])?.child('KeepTogether')?.text()).toBe('true');
    const problems = validator.validate(adapter.serialize(doc)).problems;
    expect(problems, problems.join(' | ')).toEqual([]);
  });

  it('combo RepeatOnNewPage + KeepWithGroup After en una sola llamada, con un solo undo', () => {
    const { xml, doc, index } = { xml: tablixXml(), ...openXml(tablixXml()) };
    const ctx = { root: doc.root, index };
    const applied = applyCommand(ctx, {
      cmd: 'setMemberOptions',
      id: 'T',
      axis: 'row',
      path: [0],
      repeatOnNewPage: true,
      keepWithGroup: 'After',
    });
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;
    expect(childTags(rowMember(index, [0]))).toEqual(['Group', 'RepeatOnNewPage', 'KeepWithGroup']);

    const undo = undoAll(ctx, applied.value);
    expect(undo.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(xml);
  });

  it('acepta un miembro estático (sin Group) en la columna y en la fila', () => {
    const { xml, doc, index } = { xml: tablixXml(), ...openXml(tablixXml()) };
    const ctx = { root: doc.root, index };

    const rowApplied = applyCommand(ctx, {
      cmd: 'setMemberOptions',
      id: 'T',
      axis: 'row',
      path: [1],
      keepTogether: true,
    });
    expect(rowApplied.isRight()).toBe(true);
    expect(rowMember(index, [1])?.child('KeepTogether')?.text()).toBe('true');

    const columnApplied = applyCommand(ctx, {
      cmd: 'setMemberOptions',
      id: 'T',
      axis: 'column',
      path: [0],
      repeatOnNewPage: true,
    });
    expect(columnApplied.isRight()).toBe(true);
    const column = index
      .get('T')
      ?.child('TablixColumnHierarchy')
      ?.child('TablixMembers')
      ?.children('TablixMember')[0];
    expect(column?.child('RepeatOnNewPage')?.text()).toBe('true');

    if (!rowApplied.isRight() || !columnApplied.isRight()) return;
    expect(undoAll(ctx, columnApplied.value).isRight()).toBe(true);
    expect(undoAll(ctx, rowApplied.value).isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(xml);
  });

  it('apagar quita las etiquetas (false / None) y el undo las restaura byte a byte', () => {
    const before = tablixXml(`<RepeatOnNewPage>true</RepeatOnNewPage>
                  <KeepWithGroup>Before</KeepWithGroup>
                  <KeepTogether>true</KeepTogether>`);
    const { doc, index } = openXml(before);
    const ctx = { root: doc.root, index };
    // El serializador normaliza el formato: el undo se compara con la salida original.
    const baseline = adapter.serialize(doc);

    const applied = applyCommand(ctx, {
      cmd: 'setMemberOptions',
      id: 'T',
      axis: 'row',
      path: [0],
      repeatOnNewPage: false,
      keepWithGroup: 'None',
      keepTogether: false,
    });
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;
    expect(childTags(rowMember(index, [0]))).toEqual(['Group']);
    const problems = validator.validate(adapter.serialize(doc)).problems;
    expect(problems, problems.join(' | ')).toEqual([]);

    expect(undoAll(ctx, applied.value).isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(baseline);
  });

  it('cambiar un valor existente (Before -> After) reescribe el texto y el undo lo devuelve', () => {
    const before = tablixXml('<KeepWithGroup>Before</KeepWithGroup>');
    const { doc, index } = openXml(before);
    const ctx = { root: doc.root, index };
    const baseline = adapter.serialize(doc);

    const applied = applyCommand(ctx, {
      cmd: 'setMemberOptions',
      id: 'T',
      axis: 'row',
      path: [0],
      keepWithGroup: 'After',
    });
    expect(applied.isRight()).toBe(true);
    expect(rowMember(index, [0])?.child('KeepWithGroup')?.text()).toBe('After');
    if (!applied.isRight()) return;

    expect(undoAll(ctx, applied.value).isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(baseline);
  });

  it('encender una opción ya encendida no genera cambios (no-op)', () => {
    const before = tablixXml('<RepeatOnNewPage>true</RepeatOnNewPage>');
    const { doc, index } = openXml(before);

    const applied = applyCommand(
      { root: doc.root, index },
      { cmd: 'setMemberOptions', id: 'T', axis: 'row', path: [0], repeatOnNewPage: true },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;
    expect(applied.value.inverse).toEqual([]);
    expect(adapter.serialize(doc)).toBe(before);
  });

  it('funciona sobre un Tablix real del corpus (Tablix2 · Details) y pasa el XSD', () => {
    const { xml } = corpusByName('SalesCreditMemoESP.rdlc');
    const doc = adapter.parse(xml);
    const index = DocumentIndex.build(doc.root);
    const ctx = { root: doc.root, index };

    const applied = applyCommand(ctx, {
      cmd: 'setMemberOptions',
      id: 'Tablix2',
      axis: 'row',
      path: [0],
      keepTogether: true,
      repeatOnNewPage: true,
    });
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;
    const problems = validator.validate(adapter.serialize(doc)).problems;
    expect(problems, problems.join(' | ')).toEqual([]);

    expect(undoAll(ctx, applied.value).isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(xml);
  });

  it('rechaza un id que no existe', () => {
    const { doc, index } = openXml(tablixXml());
    const applied = applyCommand(
      { root: doc.root, index },
      { cmd: 'setMemberOptions', id: 'NoExiste', axis: 'row', path: [0], keepTogether: true },
    );
    expect(applied.isLeft()).toBe(true);
    if (!applied.isLeft()) return;
    expect(applied.value).toMatchObject({ reason: 'itemMissing' });
  });

  it('rechaza un path que no apunta a ningún miembro (fila y columna)', () => {
    const { doc, index } = openXml(tablixXml());
    const row = applyCommand(
      { root: doc.root, index },
      { cmd: 'setMemberOptions', id: 'T', axis: 'row', path: [7], keepTogether: true },
    );
    expect(row.isLeft()).toBe(true);
    if (!row.isLeft()) return;
    expect(row.value).toMatchObject({ reason: 'rowPathMissing' });

    const column = applyCommand(
      { root: doc.root, index },
      { cmd: 'setMemberOptions', id: 'T', axis: 'column', path: [3], keepTogether: true },
    );
    expect(column.isLeft()).toBe(true);
    if (!column.isLeft()) return;
    expect(column.value).toMatchObject({ reason: 'columnPathMissing' });
  });

  it('rechaza una llamada sin ninguna opción', () => {
    const { doc, index } = openXml(tablixXml());
    const applied = applyCommand(
      { root: doc.root, index },
      { cmd: 'setMemberOptions', id: 'T', axis: 'row', path: [0] },
    );
    expect(applied.isLeft()).toBe(true);
    if (!applied.isLeft()) return;
    expect(applied.value).toMatchObject({ reason: 'noOptionToChange' });
  });
});
