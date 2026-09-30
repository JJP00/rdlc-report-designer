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
 * F3 · Matrix: grupos de **columna** del Tablix (`TablixColumnHierarchy`).
 * `addColumnGroup`/`addColumnToGroup` son el espejo exacto de los de fila; la
 * rejilla (`TablixBody > TablixColumns`) no cambia y el undo es byte-exacto.
 *
 * Casos reales de `BTCLoadingOrder.rdlc`: `LinesTbl` tiene 6 columnas estáticas
 * y `Tablix2` trae un grupo **hoja** de columna (`BTC_Document_No_`, con
 * expresión, ordenación y visibilidad).
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

/** Número de hojas de la jerarquía (cada hoja es una columna del body). */
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

/** Columnas declaradas en la rejilla (`TablixBody > TablixColumns`). */
function columnCount(tablix: RdlcNode | undefined): number {
  return tablix?.child('TablixBody')?.child('TablixColumns')?.children('TablixColumn').length ?? 0;
}

describe('F3 · addColumnGroup', () => {
  it('envuelve una columna estática en un grupo con nombre, orden y XSD válidos', () => {
    const { xml, doc, index } = open('BTCLoadingOrder.rdlc');
    const hierarchy = hierarchyOf(index.get('LinesTbl'), 'column');
    const columnsBefore = columnCount(index.get('LinesTbl'));
    expect(columnsBefore).toBe(6);
    expect(leafCount(hierarchy)).toBe(columnsBefore);

    const applied = applyCommand(
      { root: doc.root, index },
      { cmd: 'addColumnGroup', id: 'LinesTbl', column: 2, expression: '=Fields!ItemNo_Item.Value' },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    // La raíz mantiene sus 6 miembros; el tercero es el grupo nuevo.
    const rootMembers = hierarchyOf(index.get('LinesTbl'), 'column')?.child('TablixMembers');
    expect(rootMembers?.children('TablixMember')).toHaveLength(6);
    const group = memberByPath(hierarchyOf(index.get('LinesTbl'), 'column'), [2]);
    expect(groupName(group)).toBe('ItemNo_Item');
    expect(groupExpression(group)).toBe('=Fields!ItemNo_Item.Value');
    expect(sortExpressions(group)).toEqual(['=Fields!ItemNo_Item.Value']);
    // La columna envuelta pasa a ser la hoja del grupo: la rejilla no cambia.
    expect(leafCount(hierarchyOf(index.get('LinesTbl'), 'column'))).toBe(columnsBefore);
    expect(columnCount(index.get('LinesTbl'))).toBe(columnsBefore);
    expect(group?.child('TablixMembers')?.children('TablixMember')).toHaveLength(1);

    const problems = validator.validate(adapter.serialize(doc)).problems;
    expect(problems, problems.join(' | ')).toEqual([]);

    const undo = undoAll({ root: doc.root, index }, applied.value);
    expect(undo.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(xml);
  });

  it('agrupa un grupo hoja de columna (Tablix2 · BTC_Document_No_) por fuera', () => {
    const { xml, doc, index } = open('BTCLoadingOrder.rdlc');
    const hierarchy = hierarchyOf(index.get('Tablix2'), 'column');
    expect(leafCount(hierarchy)).toBe(2);

    const applied = applyCommand(
      { root: doc.root, index },
      { cmd: 'addColumnGroup', id: 'Tablix2', column: 1, expression: '=Fields!CompanyName.Value' },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    // El grupo nuevo envuelve al grupo hoja: la columna que se repite no cambia.
    const outer = memberByPath(hierarchy, [1]);
    expect(groupName(outer)).toBe('CompanyName');
    expect(groupExpression(outer)).toBe('=Fields!CompanyName.Value');
    const inner = memberByPath(hierarchy, [1, 0]);
    expect(groupExpression(inner)).toBe('=Fields!BTC_Document_No_.Value');
    expect(leafCount(hierarchy)).toBe(2);
    expect(columnCount(index.get('Tablix2'))).toBe(2);

    const problems = validator.validate(adapter.serialize(doc)).problems;
    expect(problems, problems.join(' | ')).toEqual([]);

    const undo = undoAll({ root: doc.root, index }, applied.value);
    expect(undo.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(xml);
  });

  it('se rechaza una columna fuera de rango o sin expresión', () => {
    const { doc, index } = open('BTCLoadingOrder.rdlc');
    const ctx = { root: doc.root, index };

    expect(
      applyCommand(ctx, {
        cmd: 'addColumnGroup',
        id: 'LinesTbl',
        column: 9,
        expression: '=Fields!A.Value',
      }).isLeft(),
    ).toBe(true);
    expect(
      applyCommand(ctx, {
        cmd: 'addColumnGroup',
        id: 'LinesTbl',
        column: 0,
        expression: ' ',
      }).isLeft(),
    ).toBe(true);
  });
});

describe('F3 · addColumnToGroup', () => {
  it('extiende el grupo con la columna contigua (y el undo devuelve todo)', () => {
    const { xml, doc, index } = open('BTCLoadingOrder.rdlc');
    const ctx = { root: doc.root, index };

    const created = applyCommand(ctx, {
      cmd: 'addColumnGroup',
      id: 'LinesTbl',
      column: 2,
      expression: '=Fields!ItemNo_Item.Value',
    });
    expect(created.isRight()).toBe(true);
    if (!created.isRight()) return;

    const extended = applyCommand(ctx, {
      cmd: 'addColumnToGroup',
      id: 'LinesTbl',
      column: 3,
      groupPath: [2],
    });
    expect(extended.isRight()).toBe(true);
    if (!extended.isRight()) return;

    // La columna 3 pasa a ser la última hoja del grupo: la rejilla no cambia.
    const hierarchy = hierarchyOf(index.get('LinesTbl'), 'column');
    const group = memberByPath(hierarchy, [2]);
    expect(group?.child('TablixMembers')?.children('TablixMember')).toHaveLength(2);
    expect(leafCount(hierarchy)).toBe(6);
    expect(columnCount(index.get('LinesTbl'))).toBe(6);
    // La raíz pierde el miembro de la columna 3: quedan 5.
    expect(hierarchy?.child('TablixMembers')?.children('TablixMember')).toHaveLength(5);

    const problems = validator.validate(adapter.serialize(doc)).problems;
    expect(problems, problems.join(' | ')).toEqual([]);

    const undoSecond = undoAll(ctx, extended.value);
    expect(undoSecond.isRight()).toBe(true);
    const undoFirst = undoAll(ctx, created.value);
    expect(undoFirst.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(xml);
  });

  it('rechaza columnas no contiguas, ya incluidas y grupos hoja', () => {
    const { doc, index } = open('BTCLoadingOrder.rdlc');
    const ctx = { root: doc.root, index };

    const created = applyCommand(ctx, {
      cmd: 'addColumnGroup',
      id: 'LinesTbl',
      column: 2,
      expression: '=Fields!ItemNo_Item.Value',
    });
    expect(created.isRight()).toBe(true);

    // No contigua: la columna 5 no toca el rango (2) del grupo [2].
    expect(
      applyCommand(ctx, {
        cmd: 'addColumnToGroup',
        id: 'LinesTbl',
        column: 5,
        groupPath: [2],
      }).isLeft(),
    ).toBe(true);
    // Ya está dentro del grupo.
    expect(
      applyCommand(ctx, {
        cmd: 'addColumnToGroup',
        id: 'LinesTbl',
        column: 2,
        groupPath: [2],
      }).isLeft(),
    ).toBe(true);
    // Grupo hoja (Tablix2 · BTC_Document_No_): añadirle columnas lo haría contenedor.
    expect(
      applyCommand(ctx, {
        cmd: 'addColumnToGroup',
        id: 'Tablix2',
        column: 0,
        groupPath: [1],
      }).isLeft(),
    ).toBe(true);
  });
});

describe('F3 · setGroupExpression (eje columna)', () => {
  it('edita la expresión del grupo de columna y sincroniza su ordenación', () => {
    const { xml, doc, index } = open('BTCLoadingOrder.rdlc');
    const hierarchy = hierarchyOf(index.get('Tablix2'), 'column');
    const group = memberByPath(hierarchy, [1]);
    expect(groupExpression(group)).toBe('=Fields!BTC_Document_No_.Value');
    expect(sortExpressions(group)).toEqual(['=Fields!BTC_Document_No_.Value']);

    const applied = applyCommand(
      { root: doc.root, index },
      {
        cmd: 'setGroupExpression',
        id: 'Tablix2',
        axis: 'column',
        path: [1],
        expression: '=Fields!DocumentNo.Value',
      },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    // El grupo sigue siendo hoja (una columna) y su orden espeja la expresión.
    expect(groupExpression(memberByPath(hierarchy, [1]))).toBe('=Fields!DocumentNo.Value');
    expect(sortExpressions(memberByPath(hierarchy, [1]))).toEqual(['=Fields!DocumentNo.Value']);
    expect(leafCount(hierarchy)).toBe(2);
    expect(memberByPath(hierarchy, [1])?.children('TablixMembers')).toHaveLength(0);

    const undo = undoAll({ root: doc.root, index }, applied.value);
    expect(undo.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(xml);
  });
});
