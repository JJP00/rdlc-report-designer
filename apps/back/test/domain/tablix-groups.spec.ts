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
    if (empty.isLeft()) expect(empty.value.reason).toBe('groupExpressionEmpty');

    // Tablix7: la cabecera de columna 0 es un miembro estático (sin Group).
    const staticMember = applyCommand(ctx, {
      cmd: 'setGroupExpression',
      id: 'Tablix7',
      axis: 'column',
      path: [0],
      expression: '=Fields!X.Value',
    });
    expect(staticMember.isLeft()).toBe(true);
    if (staticMember.isLeft()) expect(staticMember.value.reason).toBe('notAGroup');

    const badPath = applyCommand(ctx, {
      cmd: 'setGroupExpression',
      id: 'Tablix7',
      axis: 'row',
      path: [9],
      expression: '=Fields!X.Value',
    });
    expect(badPath.isLeft()).toBe(true);
    if (badPath.isLeft()) expect(badPath.value.reason).toBe('rowPathMissing');
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
    if (applied.isLeft()) expect(applied.value.reason).toBe('groupExpressionsMultiple');
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

    const outOfRange = applyCommand(ctx, {
      cmd: 'addRowGroup',
      id: 'Tablix3',
      row: 9,
      expression: '=Fields!A.Value',
    });
    expect(outOfRange.isLeft()).toBe(true);
    if (outOfRange.isLeft()) expect(outOfRange.value.reason).toBe('rowOutOfTablix');

    const blank = applyCommand(ctx, { cmd: 'addRowGroup', id: 'Tablix3', row: 0, expression: ' ' });
    expect(blank.isLeft()).toBe(true);
    if (blank.isLeft()) expect(blank.value.reason).toBe('groupExpressionEmpty');
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

  it('eleva las filas de un grupo con hijos y quita el miembro (LinesTable · LineNo)', () => {
    const { xml, doc, index } = open('SalesCreditMemoESP.rdlc');
    const hierarchy = hierarchyOf(index.get('LinesTable'), 'row');
    // 2 filas estáticas + 2 del grupo + 1 de total.
    expect(leafCount(hierarchy)).toBe(5);
    expect(hierarchy?.child('TablixMembers')?.children('TablixMember')).toHaveLength(4);

    const applied = applyCommand(
      { root: doc.root, index },
      { cmd: 'deleteRowGroup', id: 'LinesTable', axis: 'row', path: [2] },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    // El grupo desaparece y sus dos filas pasan al nivel raíz (sin línea fantasma).
    const rootMembers = hierarchyOf(index.get('LinesTable'), 'row')?.child('TablixMembers');
    expect(rootMembers?.children('TablixMember')).toHaveLength(5);
    expect(memberByPath(hierarchy, [2])?.child('Group')).toBeUndefined();
    expect(memberByPath(hierarchy, [3])?.child('Group')).toBeUndefined();
    expect(memberByPath(hierarchy, [2])?.child('TablixMembers')).toBeUndefined();
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
    const staticMember = applyCommand(ctx, {
      cmd: 'deleteRowGroup',
      id: 'Tablix7',
      axis: 'column',
      path: [0],
    });
    expect(staticMember.isLeft()).toBe(true);
    if (staticMember.isLeft()) expect(staticMember.value.reason).toBe('notAGroup');

    const badPath = applyCommand(ctx, {
      cmd: 'deleteRowGroup',
      id: 'Tablix7',
      axis: 'row',
      path: [5],
    });
    expect(badPath.isLeft()).toBe(true);
    if (badPath.isLeft()) expect(badPath.value.reason).toBe('rowPathMissing');
  });
});

describe('F2.b.2 · deleteRowGroup eleva las filas y protege la cabecera', () => {
  it('eleva el hijo del grupo de Tablix6 (con orden y visibilidad) y el undo es exacto', () => {
    const { xml, doc, index } = open('SalesCreditMemoESP.rdlc');
    const hierarchy = hierarchyOf(index.get('Tablix6'), 'row');
    expect(leafCount(hierarchy)).toBe(2);

    const applied = applyCommand(
      { root: doc.root, index },
      { cmd: 'deleteRowGroup', id: 'Tablix6', axis: 'row', path: [1] },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    expect(hierarchy?.child('TablixMembers')?.children('TablixMember')).toHaveLength(2);
    expect(memberByPath(hierarchy, [1])?.child('Group')).toBeUndefined();
    expect(memberByPath(hierarchy, [1])?.child('TablixMembers')).toBeUndefined();
    expect(leafCount(hierarchy)).toBe(2);

    const problems = validator.validate(adapter.serialize(doc)).problems;
    expect(problems, problems.join(' | ')).toEqual([]);

    const undo = undoAll({ root: doc.root, index }, applied.value);
    expect(undo.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(xml);
  });

  it('rechaza quitar un grupo con cabecera con contenido (no se pierde nada)', () => {
    const { doc, index } = openXml(groupWithHeaderXml('TextboxHeader'));
    const before = adapter.serialize(doc);
    const applied = applyCommand(
      { root: doc.root, index },
      { cmd: 'deleteRowGroup', id: 'T', axis: 'row', path: [0] },
    );
    expect(applied.isLeft()).toBe(true);
    if (applied.isLeft()) expect(applied.value.reason).toBe('groupHeaderHasContent');
    // El documento queda intacto: se rechaza antes de tocar nada.
    expect(adapter.serialize(doc)).toBe(before);
  });

  it('eleva las filas aunque el grupo tenga cabecera vacía (y el undo es exacto)', () => {
    const { doc, index } = openXml(groupWithHeaderXml(''));
    const before = adapter.serialize(doc);
    const applied = applyCommand(
      { root: doc.root, index },
      { cmd: 'deleteRowGroup', id: 'T', axis: 'row', path: [0] },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    const hierarchy = hierarchyOf(index.get('T'), 'row');
    expect(hierarchy?.child('TablixMembers')?.children('TablixMember')).toHaveLength(1);
    expect(memberByPath(hierarchy, [0])?.child('Group')).toBeUndefined();
    expect(leafCount(hierarchy)).toBe(1);

    const undo = undoAll({ root: doc.root, index }, applied.value);
    expect(undo.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(before);
  });
});

describe('F2.b.2 · setGroupExpressions', () => {
  it('reemplaza la lista de expresiones (Group on / And on) y el undo es exacto', () => {
    const { xml, doc, index } = open('SalesCreditMemoESP.rdlc');
    const applied = applyCommand(
      { root: doc.root, index },
      {
        cmd: 'setGroupExpressions',
        id: 'Tablix2',
        axis: 'row',
        path: [0],
        expressions: ['=Fields!BTCDocumentNo.Value', '=Fields!BTCNo.Value'],
      },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    const group = memberByPath(hierarchyOf(index.get('Tablix2'), 'row'), [0]);
    expect(
      group
        ?.child('Group')
        ?.child('GroupExpressions')
        ?.children('GroupExpression')
        .map((node) => node.text()),
    ).toEqual(['=Fields!BTCDocumentNo.Value', '=Fields!BTCNo.Value']);

    const problems = validator.validate(adapter.serialize(doc)).problems;
    expect(problems, problems.join(' | ')).toEqual([]);

    const undo = undoAll({ root: doc.root, index }, applied.value);
    expect(undo.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(xml);
  });

  it('sincroniza la ordenación que espejaba la primera expresión (Tablix1)', () => {
    const { doc, index } = open('SalesCreditMemoESP.rdlc');
    const applied = applyCommand(
      { root: doc.root, index },
      {
        cmd: 'setGroupExpressions',
        id: 'Tablix1',
        axis: 'row',
        path: [1],
        expressions: ['=Fields!BTCDocumentNo.Value'],
      },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    const group = memberByPath(hierarchyOf(index.get('Tablix1'), 'row'), [1]);
    expect(groupExpression(group)).toBe('=Fields!BTCDocumentNo.Value');
    expect(sortExpressions(group)).toEqual(['=Fields!BTCDocumentNo.Value']);
  });

  it('rechaza listas vacías o con expresiones en blanco', () => {
    const { doc, index } = open('SalesCreditMemoESP.rdlc');
    const ctx = { root: doc.root, index };

    const none = applyCommand(ctx, {
      cmd: 'setGroupExpressions',
      id: 'Tablix2',
      axis: 'row',
      path: [0],
      expressions: [],
    });
    expect(none.isLeft()).toBe(true);
    if (none.isLeft()) expect(none.value.reason).toBe('groupNeedsExpression');

    const blank = applyCommand(ctx, {
      cmd: 'setGroupExpressions',
      id: 'Tablix2',
      axis: 'row',
      path: [0],
      expressions: [' '],
    });
    expect(blank.isLeft()).toBe(true);
    if (blank.isLeft()) expect(blank.value.reason).toBe('groupExpressionEmpty');
  });
});

describe('F2.b.2 · setGroupSorting', () => {
  it('crea la ordenación desde cero (ascendente sin Direction) y el undo es exacto', () => {
    const { xml, doc, index } = open('SalesCreditMemoESP.rdlc');
    expect(
      memberByPath(hierarchyOf(index.get('Tablix2'), 'row'), [0])?.child('SortExpressions'),
    ).toBeUndefined();

    const applied = applyCommand(
      { root: doc.root, index },
      {
        cmd: 'setGroupSorting',
        id: 'Tablix2',
        axis: 'row',
        path: [0],
        sorts: [
          { expression: '=Fields!BTCDocumentNo.Value', direction: 'Ascending' },
          { expression: '=Fields!BTCNo.Value', direction: 'Descending' },
        ],
      },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    const group = memberByPath(hierarchyOf(index.get('Tablix2'), 'row'), [0]);
    expect(sortExpressions(group)).toEqual(['=Fields!BTCDocumentNo.Value', '=Fields!BTCNo.Value']);
    const sortNodes = group?.child('SortExpressions')?.children('SortExpression') ?? [];
    expect(sortNodes[0]?.child('Direction')).toBeUndefined();
    expect(sortNodes[1]?.child('Direction')?.text()).toBe('Descending');

    const problems = validator.validate(adapter.serialize(doc)).problems;
    expect(problems, problems.join(' | ')).toEqual([]);

    const undo = undoAll({ root: doc.root, index }, applied.value);
    expect(undo.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(xml);
  });

  it('cambia expresión y dirección de una ordenación existente (Tablix7)', () => {
    const { xml, doc, index } = open('SalesCreditMemoESP.rdlc');
    const applied = applyCommand(
      { root: doc.root, index },
      {
        cmd: 'setGroupSorting',
        id: 'Tablix7',
        axis: 'row',
        path: [0],
        sorts: [{ expression: '=Fields!VATPct_VatAmountLine.Value', direction: 'Descending' }],
      },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    const group = memberByPath(hierarchyOf(index.get('Tablix7'), 'row'), [0]);
    expect(sortExpressions(group)).toEqual(['=Fields!VATPct_VatAmountLine.Value']);
    expect(
      group?.child('SortExpressions')?.child('SortExpression')?.child('Direction')?.text(),
    ).toBe('Descending');

    const undo = undoAll({ root: doc.root, index }, applied.value);
    expect(undo.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(xml);
  });

  it('con lista vacía quita el bloque de ordenación y el undo es exacto', () => {
    const { xml, doc, index } = open('SalesCreditMemoESP.rdlc');
    const applied = applyCommand(
      { root: doc.root, index },
      { cmd: 'setGroupSorting', id: 'Tablix7', axis: 'row', path: [0], sorts: [] },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;
    expect(
      memberByPath(hierarchyOf(index.get('Tablix7'), 'row'), [0])?.child('SortExpressions'),
    ).toBeUndefined();

    const undo = undoAll({ root: doc.root, index }, applied.value);
    expect(undo.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(xml);
  });
});

describe('F2.b.2 · setGroupPageBreaks', () => {
  it('escribe un PageBreak por opción (Between, Start) y el undo es exacto', () => {
    const { xml, doc, index } = open('SalesCreditMemoESP.rdlc');

    const applied = applyCommand(
      { root: doc.root, index },
      {
        cmd: 'setGroupPageBreaks',
        id: 'Tablix2',
        axis: 'row',
        path: [0],
        between: true,
        start: true,
        end: false,
      },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    const group = memberByPath(hierarchyOf(index.get('Tablix2'), 'row'), [0])?.child('Group');
    expect(
      group?.children('PageBreak').map((pageBreak) => pageBreak.child('BreakLocation')?.text()),
    ).toEqual(['Between', 'Start']);

    const problems = validator.validate(adapter.serialize(doc)).problems;
    expect(problems, problems.join(' | ')).toEqual([]);

    const undo = undoAll({ root: doc.root, index }, applied.value);
    expect(undo.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(xml);
  });

  it('quita los gestionados que se desmarcan y respeta los no gestionados', () => {
    const { doc, index } = openXml(PAGE_BREAK_NONE_XML);
    const before = adapter.serialize(doc);
    const ctx = { root: doc.root, index };

    const applied = applyCommand(ctx, {
      cmd: 'setGroupPageBreaks',
      id: 'T',
      axis: 'row',
      path: [0],
      between: false,
      start: true,
      end: false,
    });
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    const group = memberByPath(hierarchyOf(index.get('T'), 'row'), [0])?.child('Group');
    expect(
      group?.children('PageBreak').map((pageBreak) => pageBreak.child('BreakLocation')?.text()),
    ).toEqual(['None', 'Start']);

    const undo = undoAll(ctx, applied.value);
    expect(undo.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(before);
  });

  it('desmarcar todo quita los PageBreak gestionados (byte-exacto al deshacer)', () => {
    const { xml, doc, index } = open('SalesCreditMemoESP.rdlc');
    const ctx = { root: doc.root, index };

    const added = applyCommand(ctx, {
      cmd: 'setGroupPageBreaks',
      id: 'Tablix7',
      axis: 'row',
      path: [0],
      between: true,
      start: false,
      end: false,
    });
    expect(added.isRight()).toBe(true);
    if (!added.isRight()) return;
    const afterAdd = adapter.serialize(doc);

    const removed = applyCommand(ctx, {
      cmd: 'setGroupPageBreaks',
      id: 'Tablix7',
      axis: 'row',
      path: [0],
      between: false,
      start: false,
      end: false,
    });
    expect(removed.isRight()).toBe(true);
    if (!removed.isRight()) return;
    const group = memberByPath(hierarchyOf(index.get('Tablix7'), 'row'), [0])?.child('Group');
    expect(group?.children('PageBreak')).toHaveLength(0);

    const undo = undoAll(ctx, removed.value);
    expect(undo.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(afterAdd);
    const undoAllAdded = undoAll(ctx, added.value);
    expect(undoAllAdded.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(xml);
  });
});

describe('F2.b.2 · setMemberToggleItem', () => {
  it('crea Visibility/ToggleItem y el undo es exacto (y quitar lo deja limpio)', () => {
    const { xml, doc, index } = open('SalesCreditMemoESP.rdlc');
    const ctx = { root: doc.root, index };
    const member = () => memberByPath(hierarchyOf(index.get('Tablix3'), 'row'), [0]);

    expect(member()?.child('Visibility')).toBeUndefined();

    const applied = applyCommand(ctx, {
      cmd: 'setMemberToggleItem',
      id: 'Tablix3',
      axis: 'row',
      path: [0],
      item: 'Textbox1',
    });
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;
    expect(member()?.child('Visibility')?.child('ToggleItem')?.text()).toBe('Textbox1');

    const problems = validator.validate(adapter.serialize(doc)).problems;
    expect(problems, problems.join(' | ')).toEqual([]);

    const undo = undoAll(ctx, applied.value);
    expect(undo.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(xml);
  });

  it('conserva la Hidden y quita Visibility solo si se queda vacía', () => {
    const { xml, doc, index } = open('SalesCreditMemoESP.rdlc');
    const ctx = { root: doc.root, index };
    // LinesTable fila 1: Visibility > Hidden declarado.
    const member = () => memberByPath(hierarchyOf(index.get('LinesTable'), 'row'), [0]);
    const hiddenBefore = member()?.child('Visibility')?.child('Hidden')?.text();

    const applied = applyCommand(ctx, {
      cmd: 'setMemberToggleItem',
      id: 'LinesTable',
      axis: 'row',
      path: [0],
      item: 'Textbox1',
    });
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;
    expect(member()?.child('Visibility')?.child('ToggleItem')?.text()).toBe('Textbox1');
    expect(member()?.child('Visibility')?.child('Hidden')?.text()).toBe(hiddenBefore);

    const cleared = applyCommand(ctx, {
      cmd: 'setMemberToggleItem',
      id: 'LinesTable',
      axis: 'row',
      path: [0],
      item: null,
    });
    expect(cleared.isRight()).toBe(true);
    if (!cleared.isRight()) return;
    expect(member()?.child('Visibility')?.child('ToggleItem')).toBeUndefined();
    expect(member()?.child('Visibility')?.child('Hidden')?.text()).toBe(hiddenBefore);

    const undoCleared = undoAll(ctx, cleared.value);
    expect(undoCleared.isRight()).toBe(true);
    const undoApplied = undoAll(ctx, applied.value);
    expect(undoApplied.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(xml);
  });
});

describe('F2.b.3 · addRowToGroup (extender un grupo con filas contiguas)', () => {
  it('añade la fila anterior al grupo y el undo es exacto (LinesTable · LineNo)', () => {
    const { xml, doc, index } = open('SalesCreditMemoESP.rdlc');
    const hierarchy = hierarchyOf(index.get('LinesTable'), 'row');
    expect(
      memberByPath(hierarchy, [2])?.child('TablixMembers')?.children('TablixMember'),
    ).toHaveLength(2);

    const applied = applyCommand(
      { root: doc.root, index },
      { cmd: 'addRowToGroup', id: 'LinesTable', row: 1, groupPath: [2] },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    // La fila 1 es ahora la primera hoja del grupo; el body no cambia.
    // (El miembro raíz [1] desaparece: el grupo baja a la posición [1].)
    expect(
      memberByPath(hierarchy, [1])?.child('TablixMembers')?.children('TablixMember'),
    ).toHaveLength(3);
    expect(hierarchy?.child('TablixMembers')?.children('TablixMember')).toHaveLength(3);
    expect(leafCount(hierarchy)).toBe(5);

    const problems = validator.validate(adapter.serialize(doc)).problems;
    expect(problems, problems.join(' | ')).toEqual([]);

    const undo = undoAll({ root: doc.root, index }, applied.value);
    expect(undo.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(xml);
  });

  it('añade la fila siguiente (el total) al grupo y el undo es exacto', () => {
    const { xml, doc, index } = open('SalesCreditMemoESP.rdlc');
    const hierarchy = hierarchyOf(index.get('LinesTable'), 'row');

    const applied = applyCommand(
      { root: doc.root, index },
      { cmd: 'addRowToGroup', id: 'LinesTable', row: 4, groupPath: [2] },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    expect(
      memberByPath(hierarchy, [2])?.child('TablixMembers')?.children('TablixMember'),
    ).toHaveLength(3);
    expect(leafCount(hierarchy)).toBe(5);

    const undo = undoAll({ root: doc.root, index }, applied.value);
    expect(undo.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(xml);
  });

  it('rechaza añadir filas a un grupo hoja (su fila desaparecería)', () => {
    const { doc, index } = open('SalesCreditMemoESP.rdlc');
    const ctx = { root: doc.root, index };

    const leafGroup = applyCommand(ctx, {
      cmd: 'addRowToGroup',
      id: 'Tablix1',
      row: 0,
      groupPath: [1],
    });
    expect(leafGroup.isLeft()).toBe(true);
    if (leafGroup.isLeft()) expect(leafGroup.value.reason).toBe('rowGroupIsLeaf');

    const oddPath = applyCommand(ctx, {
      cmd: 'addRowToGroup',
      id: 'Tablix7',
      row: 0,
      groupPath: [0],
    });
    expect(oddPath.isLeft()).toBe(true);
    if (oddPath.isLeft()) expect(oddPath.value.reason).toBe('rowIsThatGroup');
  });

  it('rechaza filas no contiguas, ya incluidas o destinos que no son grupo', () => {
    const { doc, index } = open('SalesCreditMemoESP.rdlc');
    const ctx = { root: doc.root, index };

    // La fila 0 no toca el rango del grupo [2] (hojas 2-3).
    const nonContiguous = applyCommand(ctx, {
      cmd: 'addRowToGroup',
      id: 'LinesTable',
      row: 0,
      groupPath: [2],
    });
    expect(nonContiguous.isLeft()).toBe(true);
    if (nonContiguous.isLeft()) expect(nonContiguous.value.reason).toBe('onlyContiguousRows');

    // Ya está dentro del grupo.
    const inside = applyCommand(ctx, {
      cmd: 'addRowToGroup',
      id: 'LinesTable',
      row: 2,
      groupPath: [2],
    });
    expect(inside.isLeft()).toBe(true);
    if (inside.isLeft()) expect(inside.value.reason).toBe('rowAlreadyInGroup');

    // El destino es una fila estática (no un grupo).
    const notGroup = applyCommand(ctx, {
      cmd: 'addRowToGroup',
      id: 'LinesTable',
      row: 1,
      groupPath: [0],
    });
    expect(notGroup.isLeft()).toBe(true);
    if (notGroup.isLeft()) expect(notGroup.value.reason).toBe('notAGroup');

    // La fila ya es ese grupo hoja.
    const isThatGroup = applyCommand(ctx, {
      cmd: 'addRowToGroup',
      id: 'Tablix7',
      row: 0,
      groupPath: [0],
    });
    expect(isThatGroup.isLeft()).toBe(true);
    if (isThatGroup.isLeft()) expect(isThatGroup.value.reason).toBe('rowIsThatGroup');

    // Fuera de rango.
    const outOfRange = applyCommand(ctx, {
      cmd: 'addRowToGroup',
      id: 'LinesTable',
      row: 9,
      groupPath: [2],
    });
    expect(outOfRange.isLeft()).toBe(true);
    if (outOfRange.isLeft()) expect(outOfRange.value.reason).toBe('rowOutOfTablix');
  });

  it('rechaza mover la única fila de un grupo (lo dejaría sin hojas)', () => {
    const { doc, index } = openXml(TWO_GROUPS_XML);
    const applied = applyCommand(
      { root: doc.root, index },
      { cmd: 'addRowToGroup', id: 'T', row: 0, groupPath: [1] },
    );
    expect(applied.isLeft()).toBe(true);
    if (applied.isLeft()) expect(applied.value.reason).toBe('rowOnlyLeafInGroup');
  });
});

describe('G11 · setGroupName (renombrar grupo)', () => {
  it('renombra el grupo hoja (Tablix2 · Details) y el undo es exacto', () => {
    const { xml, doc, index } = open('SalesCreditMemoESP.rdlc');
    const hierarchy = hierarchyOf(index.get('Tablix2'), 'row');
    expect(groupName(memberByPath(hierarchy, [0]))).toBe('Details');

    const applied = applyCommand(
      { root: doc.root, index },
      { cmd: 'setGroupName', id: 'Tablix2', axis: 'row', path: [0], name: 'DetalleNuevo' },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;
    expect(applied.value.snapshotOut).toBe(true);

    expect(groupName(memberByPath(hierarchy, [0]))).toBe('DetalleNuevo');
    expect(adapter.serialize(doc)).toContain('Group Name="DetalleNuevo"');

    const undone = undoAll({ root: doc.root, index }, applied.value);
    expect(undone.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(xml);
  });

  it('rechaza nombres ya usados (items u otros grupos) y vacíos', () => {
    const { doc, index } = open('SalesCreditMemoESP.rdlc');

    const taken = applyCommand(
      { root: doc.root, index },
      { cmd: 'setGroupName', id: 'Tablix2', axis: 'row', path: [0], name: 'Tablix2' },
    );
    expect(taken.isLeft()).toBe(true);
    if (taken.isLeft()) expect(taken.value.reason).toBe('nameTaken');

    const blank = applyCommand(
      { root: doc.root, index },
      { cmd: 'setGroupName', id: 'Tablix2', axis: 'row', path: [0], name: '   ' },
    );
    expect(blank.isLeft()).toBe(true);
    if (blank.isLeft()) expect(blank.value.reason).toBe('groupNameEmpty');

    const notGroup = applyCommand(
      { root: doc.root, index },
      { cmd: 'setGroupName', id: 'Tablix3', axis: 'row', path: [0], name: 'Otro' },
    );
    expect(notGroup.isLeft()).toBe(true);
    if (notGroup.isLeft()) expect(notGroup.value.reason).toBe('notAGroup');
  });
});

/* ------------------------- XML de casos límite --------------------------- */

/** Tablix mínimo con un grupo, cabecera (con o sin contenido) y un hijo. */
function groupWithHeaderXml(headerContent: string): string {
  const content = headerContent
    ? `<Textbox Name="${headerContent}">
         <Paragraphs><Paragraph><TextRuns><TextRun><Value>x</Value></TextRun></TextRuns></Paragraph></Paragraphs>
       </Textbox>`
    : '';
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
                  <TablixHeader>
                    <Size>0.6cm</Size>
                    <CellContents>${content}</CellContents>
                  </TablixHeader>
                  <TablixMembers>
                    <TablixMember />
                  </TablixMembers>
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
}

const PAGE_BREAK_NONE_XML = `<?xml version="1.0" encoding="utf-8"?>
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
                  <Group Name="G">
                    <GroupExpressions>
                      <GroupExpression>=Fields!A.Value</GroupExpression>
                    </GroupExpressions>
                    <PageBreak>
                      <BreakLocation>None</BreakLocation>
                    </PageBreak>
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

/** Tablix mínimo con dos grupos de un único hijo (para validaciones). */
const TWO_GROUPS_XML = `<?xml version="1.0" encoding="utf-8"?>
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
                  <Group Name="G1">
                    <GroupExpressions>
                      <GroupExpression>=Fields!A.Value</GroupExpression>
                    </GroupExpressions>
                  </Group>
                  <TablixMembers>
                    <TablixMember />
                  </TablixMembers>
                </TablixMember>
                <TablixMember>
                  <Group Name="G2">
                    <GroupExpressions>
                      <GroupExpression>=Fields!B.Value</GroupExpression>
                    </GroupExpressions>
                  </Group>
                  <TablixMembers>
                    <TablixMember />
                  </TablixMembers>
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
