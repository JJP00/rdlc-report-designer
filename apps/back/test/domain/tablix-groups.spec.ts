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
 * F2.b · grupos de fila del Tablix: `setGroupExpression` (editar la expresión),
 * `addRowGroup` (envolver una fila en un grupo) y `deleteRowGroup` (quitar el
 * grupo sin perder filas ni cabecera). El undo es byte-exacto.
 *
 * Casos reales de BC: grupos **hoja** (`Tablix2` → `Details`, `Tablix7` →
 * `VATIdentifier_VatAmountLine`, `Tablix1` → `BTCBillNo1`) y grupos con hijos
 * (`LinesTable` → `LineNo`, `Tablix6` → `BTCVATClause_Code`).
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

function hierarchyOf(tablix: RdlcNode | undefined, axis: 'row' | 'column'): RdlcNode | undefined {
  const tag = axis === 'row' ? 'TablixRowHierarchy' : 'TablixColumnHierarchy';
  return tablix?.child(tag);
}

function memberByPath(hierarchy: RdlcNode | undefined, path: number[]): RdlcNode | undefined {
  let container = hierarchy?.child('TablixMembers');
  let member: RdlcNode | undefined;
  for (const index of path) {
    member = container?.children('TablixMember')[index];
    if (!member) return undefined;
    const nested = member.child('TablixMembers');
    if (nested) container = nested;
  }
  return member;
}

function groupExpression(member: RdlcNode | undefined): string | undefined {
  return member?.child('Group')?.child('GroupExpressions')?.child('GroupExpression')?.text();
}

function groupName(member: RdlcNode | undefined): string | undefined {
  return member?.child('Group')?.attribute('Name');
}

function sortExpressions(member: RdlcNode | undefined): (string | undefined)[] {
  return (member?.child('SortExpressions')?.children('SortExpression') ?? []).map((sort) =>
    sort.child('Value')?.text(),
  );
}

/** Número de hojas de la jerarquía (cada hoja es una fila/columna del body). */
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

describe('F2.b · setGroupExpression', () => {
  it('edita la expresión de un grupo hoja (Tablix2 · Details) y el undo es exacto', () => {
    const { xml, doc, index } = open('SalesCreditMemoESP.rdlc');
    const hierarchy = hierarchyOf(index.get('Tablix2'), 'row');
    const group = memberByPath(hierarchy, [0]);

    expect(groupExpression(group)).toBe('=Fields!DocumentNo.Value');

    const applied = applyCommand(
      { root: doc.root, index },
      {
        cmd: 'setGroupExpression',
        id: 'Tablix2',
        axis: 'row',
        path: [0],
        expression: '=Fields!BTCDocumentNo.Value',
      },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    expect(groupExpression(memberByPath(hierarchy, [0]))).toBe('=Fields!BTCDocumentNo.Value');
    // Sigue siendo el mismo grupo hoja: una sola hoja, sin hijos.
    expect(leafCount(hierarchy)).toBe(1);
    expect(memberByPath(hierarchy, [0])?.children('TablixMembers')).toHaveLength(0);

    const undo = undoAll({ root: doc.root, index }, applied.value);
    expect(undo.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(xml);
  });

  it('sincroniza la ordenación que espejaba la expresión anterior (Tablix1 · BTCBillNo1)', () => {
    const { xml, doc, index } = open('SalesCreditMemoESP.rdlc');
    const hierarchy = hierarchyOf(index.get('Tablix1'), 'row');
    expect(groupExpression(memberByPath(hierarchy, [1]))).toBe('=Fields!BTCBillNo.Value');
    expect(sortExpressions(memberByPath(hierarchy, [1]))).toEqual(['=Fields!BTCBillNo.Value']);

    const applied = applyCommand(
      { root: doc.root, index },
      {
        cmd: 'setGroupExpression',
        id: 'Tablix1',
        axis: 'row',
        path: [1],
        expression: '=Fields!BTCDocumentNo.Value',
      },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    const group = memberByPath(hierarchy, [1]);
    expect(groupExpression(group)).toBe('=Fields!BTCDocumentNo.Value');
    expect(sortExpressions(group)).toEqual(['=Fields!BTCDocumentNo.Value']);

    const undo = undoAll({ root: doc.root, index }, applied.value);
    expect(undo.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(xml);
  });

  it('respeta la ordenación que ordena por otro campo (Tablix7)', () => {
    const { doc, index } = open('SalesCreditMemoESP.rdlc');
    const hierarchy = hierarchyOf(index.get('Tablix7'), 'row');
    expect(sortExpressions(memberByPath(hierarchy, [0]))).toEqual([
      '=Fields!VATIdentifier_VatAmountLine.Value',
    ]);

    const applied = applyCommand(
      { root: doc.root, index },
      {
        cmd: 'setGroupExpression',
        id: 'Tablix7',
        axis: 'row',
        path: [0],
        expression: '=Fields!VATPct_VatAmountLine.Value * 2',
      },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    expect(groupExpression(memberByPath(hierarchy, [0]))).toBe(
      '=Fields!VATPct_VatAmountLine.Value * 2',
    );
    // La ordenación no espejaba la expresión: se queda como estaba.
    expect(sortExpressions(memberByPath(hierarchy, [0]))).toEqual([
      '=Fields!VATIdentifier_VatAmountLine.Value',
    ]);
  });

  it('normaliza la expresión (añade `=`) y se rechaza vacía o en un miembro sin grupo', () => {
    const { doc, index } = open('SalesCreditMemoESP.rdlc');
    const ctx = { root: doc.root, index };

    const applied = applyCommand(ctx, {
      cmd: 'setGroupExpression',
      id: 'Tablix2',
      axis: 'row',
      path: [0],
      expression: 'Fields!CompanyName.Value',
    });
    expect(applied.isRight()).toBe(true);
    if (applied.isRight()) {
      expect(groupExpression(memberByPath(hierarchyOf(index.get('Tablix2'), 'row'), [0]))).toBe(
        '=Fields!CompanyName.Value',
      );
      undoAll(ctx, applied.value);
      expect(groupExpression(memberByPath(hierarchyOf(index.get('Tablix2'), 'row'), [0]))).toBe(
        '=Fields!DocumentNo.Value',
      );
    }

    const empty = applyCommand(ctx, {
      cmd: 'setGroupExpression',
      id: 'Tablix2',
      axis: 'row',
      path: [0],
      expression: ' = ',
    });
    expect(empty.isLeft()).toBe(true);

    // Tablix7: la cabecera de columna 0 es un miembro estático (sin Group).
    const staticMember = applyCommand(ctx, {
      cmd: 'setGroupExpression',
      id: 'Tablix7',
      axis: 'column',
      path: [0],
      expression: '=Fields!X.Value',
    });
    expect(staticMember.isLeft()).toBe(true);

    const badPath = applyCommand(ctx, {
      cmd: 'setGroupExpression',
      id: 'Tablix7',
      axis: 'row',
      path: [9],
      expression: '=Fields!X.Value',
    });
    expect(badPath.isLeft()).toBe(true);
  });

  it('rechaza grupos con varias expresiones (no se puede editar sin ambigüedad)', () => {
    const { doc, index } = openXml(MULTI_EXPRESSION_XML);
    const applied = applyCommand(
      { root: doc.root, index },
      {
        cmd: 'setGroupExpression',
        id: 'T',
        axis: 'row',
        path: [0],
        expression: '=Fields!C.Value',
      },
    );
    expect(applied.isLeft()).toBe(true);
  });
});

describe('F2.b · addRowGroup', () => {
  it('envuelve una fila estática en un grupo con nombre, orden y XSD válidos', () => {
    const { xml, doc, index } = open('SalesCreditMemoESP.rdlc');
    const hierarchy = hierarchyOf(index.get('Tablix3'), 'row');
    const bodyRows = index.get('Tablix3')?.child('TablixBody')?.child('TablixRows');
    const rowsBefore = bodyRows?.children('TablixRow').length ?? 0;
    expect(leafCount(hierarchy)).toBe(rowsBefore);

    const applied = applyCommand(
      { root: doc.root, index },
      { cmd: 'addRowGroup', id: 'Tablix3', row: 0, expression: '=Fields!BTCNo_BTCHeader.Value' },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    // La jerarquía raíz mantiene sus 2 miembros; el primero es el grupo nuevo.
    const rootMembers = hierarchyOf(index.get('Tablix3'), 'row')?.child('TablixMembers');
    expect(rootMembers?.children('TablixMember')).toHaveLength(2);
    const group = memberByPath(hierarchyOf(index.get('Tablix3'), 'row'), [0]);
    expect(groupName(group)).toBe('BTCNo_BTCHeader');
    expect(groupExpression(group)).toBe('=Fields!BTCNo_BTCHeader.Value');
    expect(sortExpressions(group)).toEqual(['=Fields!BTCNo_BTCHeader.Value']);
    // La fila envuelta pasa a ser la hoja del grupo: el body no cambia.
    expect(leafCount(hierarchyOf(index.get('Tablix3'), 'row'))).toBe(rowsBefore);
    expect(group?.child('TablixMembers')?.children('TablixMember')).toHaveLength(1);
    expect(
      index.get('Tablix3')?.child('TablixBody')?.child('TablixRows')?.children('TablixRow'),
    ).toHaveLength(rowsBefore);

    const problems = validator.validate(adapter.serialize(doc)).problems;
    expect(problems, problems.join(' | ')).toEqual([]);

    const undo = undoAll({ root: doc.root, index }, applied.value);
    expect(undo.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(xml);
  });

  it('el nombre del grupo se deriva de la expresión y es único (1, 2…)', () => {
    const { doc, index } = open('SalesCreditMemoESP.rdlc');
    const ctx = { root: doc.root, index };

    applyCommand(ctx, {
      cmd: 'addRowGroup',
      id: 'Tablix3',
      row: 0,
      expression: '=Fields!LineNo_Line.Value',
    });
    const second = applyCommand(ctx, {
      cmd: 'addRowGroup',
      id: 'Tablix3',
      row: 1,
      expression: '=Fields!LineNo_Line.Value',
    });
    expect(second.isRight()).toBe(true);
    if (!second.isRight()) return;

    const hierarchy = hierarchyOf(index.get('Tablix3'), 'row');
    expect(groupName(memberByPath(hierarchy, [0]))).toBe('LineNo_Line');
    expect(groupName(memberByPath(hierarchy, [1]))).toBe('LineNo_Line1');
  });

  it('agrupa un grupo hoja (anida el grupo nuevo por fuera) sin tocar el body', () => {
    const { xml, doc, index } = open('SalesCreditMemoESP.rdlc');
    const hierarchy = hierarchyOf(index.get('Tablix2'), 'row');

    const applied = applyCommand(
      { root: doc.root, index },
      { cmd: 'addRowGroup', id: 'Tablix2', row: 0, expression: '=Fields!CompanyName.Value' },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    // Raíz: 1 miembro (el grupo nuevo) → su hoja es el grupo `Details` original.
    const outer = memberByPath(hierarchy, [0]);
    expect(groupName(outer)).toBe('CompanyName');
    expect(groupExpression(outer)).toBe('=Fields!CompanyName.Value');
    const inner = memberByPath(hierarchy, [0, 0]);
    expect(groupExpression(inner)).toBe('=Fields!DocumentNo.Value');
    expect(leafCount(hierarchy)).toBe(1);

    const problems = validator.validate(adapter.serialize(doc)).problems;
    expect(problems, problems.join(' | ')).toEqual([]);

    const undo = undoAll({ root: doc.root, index }, applied.value);
    expect(undo.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(xml);
  });

  it('se rechaza una fila fuera de rango o sin expresión', () => {
    const { doc, index } = open('SalesCreditMemoESP.rdlc');
    const ctx = { root: doc.root, index };

    expect(
      applyCommand(ctx, {
        cmd: 'addRowGroup',
        id: 'Tablix3',
        row: 9,
        expression: '=Fields!A.Value',
      }).isLeft(),
    ).toBe(true);
    expect(
      applyCommand(ctx, { cmd: 'addRowGroup', id: 'Tablix3', row: 0, expression: ' ' }).isLeft(),
    ).toBe(true);
  });
});

describe('F2.b · deleteRowGroup', () => {
  it('quita el grupo de un grupo hoja y la fila se queda (Tablix2 · Details)', () => {
    const { xml, doc, index } = open('SalesCreditMemoESP.rdlc');
    const hierarchy = hierarchyOf(index.get('Tablix2'), 'row');

    const applied = applyCommand(
      { root: doc.root, index },
      { cmd: 'deleteRowGroup', id: 'Tablix2', axis: 'row', path: [0] },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    const member = memberByPath(hierarchy, [0]);
    expect(member?.child('Group')).toBeUndefined();
    expect(leafCount(hierarchy)).toBe(1);
    // Sigue siendo válido: un miembro estático hoja en su sitio.
    const problems = validator.validate(adapter.serialize(doc)).problems;
    expect(problems, problems.join(' | ')).toEqual([]);

    const undo = undoAll({ root: doc.root, index }, applied.value);
    expect(undo.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(xml);
  });

  it('quita el grupo de un grupo con hijos y ordenación (LinesTable · LineNo)', () => {
    const { xml, doc, index } = open('SalesCreditMemoESP.rdlc');
    const hierarchy = hierarchyOf(index.get('LinesTable'), 'row');
    // 2 filas estáticas + 2 del grupo + 1 de total.
    expect(leafCount(hierarchy)).toBe(5);

    const applied = applyCommand(
      { root: doc.root, index },
      { cmd: 'deleteRowGroup', id: 'LinesTable', axis: 'row', path: [2] },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    const member = memberByPath(hierarchy, [2]);
    expect(member?.child('Group')).toBeUndefined();
    expect(member?.child('SortExpressions')).toBeUndefined();
    // Las dos filas del grupo siguen colgando del miembro (sin perder nada).
    expect(member?.child('TablixMembers')?.children('TablixMember')).toHaveLength(2);
    expect(leafCount(hierarchy)).toBe(5);

    const problems = validator.validate(adapter.serialize(doc)).problems;
    expect(problems, problems.join(' | ')).toEqual([]);

    const undo = undoAll({ root: doc.root, index }, applied.value);
    expect(undo.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(xml);
  });

  it('quita el grupo de un grupo hoja con ordenación y visibilidad (Tablix1 · BTCBillNo1)', () => {
    const { xml, doc, index } = open('SalesCreditMemoESP.rdlc');
    const hierarchy = hierarchyOf(index.get('Tablix1'), 'row');
    expect(leafCount(hierarchy)).toBe(3);

    const applied = applyCommand(
      { root: doc.root, index },
      { cmd: 'deleteRowGroup', id: 'Tablix1', axis: 'row', path: [1] },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    const member = memberByPath(hierarchy, [1]);
    expect(member?.child('Group')).toBeUndefined();
    expect(member?.child('SortExpressions')).toBeUndefined();
    // La visibilidad del miembro se conserva (no pertenece al grupo).
    expect(member?.child('Visibility')?.child('Hidden')?.text()).toContain('BTCHasEffectsHeader');
    expect(leafCount(hierarchy)).toBe(3);

    const problems = validator.validate(adapter.serialize(doc)).problems;
    expect(problems, problems.join(' | ')).toEqual([]);

    const undo = undoAll({ root: doc.root, index }, applied.value);
    expect(undo.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(xml);
  });

  it('rechaza miembros que no son grupos o rutas inexistentes', () => {
    const { doc, index } = open('SalesCreditMemoESP.rdlc');
    const ctx = { root: doc.root, index };

    // Columna estática de Tablix7 (tiene TablixHeader pero no Group).
    expect(
      applyCommand(ctx, {
        cmd: 'deleteRowGroup',
        id: 'Tablix7',
        axis: 'column',
        path: [0],
      }).isLeft(),
    ).toBe(true);
    expect(
      applyCommand(ctx, { cmd: 'deleteRowGroup', id: 'Tablix7', axis: 'row', path: [5] }).isLeft(),
    ).toBe(true);
  });
});

/* ------------------------- XML de casos límite --------------------------- */

const MULTI_EXPRESSION_XML = `<?xml version="1.0" encoding="utf-8"?>
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
              </TablixRows>
            </TablixBody>
            <TablixRowHierarchy>
              <TablixMembers>
                <TablixMember>
                  <Group Name="Multi">
                    <GroupExpressions>
                      <GroupExpression>=Fields!A.Value</GroupExpression>
                      <GroupExpression>=Fields!B.Value</GroupExpression>
                    </GroupExpressions>
                  </Group>
                </TablixMember>
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
