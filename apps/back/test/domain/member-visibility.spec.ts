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
 * `setMemberVisibility`: visibilidad (`<Visibility><Hidden>`) de filas,
 * columnas y grupos de un Tablix sobre `TablixMember`, con la **misma** ruta
 * que la proyección (`path`). Undo byte-exacto y XSD válido.
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

function memberRoot(tablix: RdlcNode | undefined, axis: 'row' | 'column'): RdlcNode | undefined {
  const tag = axis === 'row' ? 'TablixRowHierarchy' : 'TablixColumnHierarchy';
  return tablix?.child(tag)?.child('TablixMembers');
}

function memberAt(root: RdlcNode | undefined, path: number[]): RdlcNode | undefined {
  let container = root;
  let member: RdlcNode | undefined;
  for (const index of path) {
    member = container?.children('TablixMember')[index];
    if (!member) return undefined;
    const nested = member.child('TablixMembers');
    if (nested) container = nested;
  }
  return member;
}

function hiddenOf(member: RdlcNode | undefined): string | undefined {
  return member?.child('Visibility')?.child('Hidden')?.text();
}

function expectValid(doc: ReturnType<TrueFormatXmlAdapter['parse']>): void {
  const problems = validator.validate(adapter.serialize(doc)).problems;
  expect(problems, problems.join(' | ')).toEqual([]);
}

describe('F2 · setMemberVisibility', () => {
  it('oculta una fila y una columna, y el undo es exacto', () => {
    const { xml, doc, index } = open('SalesCreditMemoESP.rdlc');

    const row = applyCommand(
      { root: doc.root, index },
      { cmd: 'setMemberVisibility', id: 'LinesTable2', axis: 'row', path: [0], hidden: true },
    );
    expect(row.isRight()).toBe(true);
    if (!row.isRight()) return;
    expect(hiddenOf(memberAt(memberRoot(index.get('LinesTable2'), 'row'), [0]))).toBe('true');
    expect(row.value.snapshotOut).toBe(true);
    expectValid(doc);

    const column = applyCommand(
      { root: doc.root, index },
      {
        cmd: 'setMemberVisibility',
        id: 'LinesTable2',
        axis: 'column',
        path: [0],
        hidden: '=Fields!BTCIsServiceInvoice.Value',
      },
    );
    expect(column.isRight()).toBe(true);
    if (!column.isRight()) return;
    expect(hiddenOf(memberAt(memberRoot(index.get('LinesTable2'), 'column'), [0]))).toBe(
      '=Fields!BTCIsServiceInvoice.Value',
    );
    expectValid(doc);

    // Deshacer en orden inverso al de aplicación.
    const undoColumn = undoAll({ root: doc.root, index }, column.value);
    expect(undoColumn.isRight()).toBe(true);
    const undoRow = undoAll({ root: doc.root, index }, row.value);
    expect(undoRow.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(xml);
  });

  it('llega a un grupo y a sus hojas anidadas', () => {
    const { xml, doc, index } = open('SalesCreditMemoESP.rdlc');
    const root = memberRoot(index.get('LinesTable'), 'row');
    // La jerarquía de LinesTable tiene un grupo en la posición 2 con dos hojas.
    expect(root?.children('TablixMember')[2]?.child('TablixMembers')).toBeDefined();

    const group = applyCommand(
      { root: doc.root, index },
      { cmd: 'setMemberVisibility', id: 'LinesTable', axis: 'row', path: [2], hidden: true },
    );
    expect(group.isRight()).toBe(true);
    if (!group.isRight()) return;
    expect(hiddenOf(memberAt(root, [2]))).toBe('true');

    const leaf = applyCommand(
      { root: doc.root, index },
      {
        cmd: 'setMemberVisibility',
        id: 'LinesTable',
        axis: 'row',
        path: [2, 1],
        hidden: '=Fields!X.Value',
      },
    );
    expect(leaf.isRight()).toBe(true);
    if (!leaf.isRight()) return;
    expect(hiddenOf(memberAt(root, [2, 1]))).toBe('=Fields!X.Value');
    // El grupo no se toca al ocultar su hoja.
    expect(hiddenOf(memberAt(root, [2]))).toBe('true');
    expectValid(doc);

    const undoLeaf = undoAll({ root: doc.root, index }, leaf.value);
    expect(undoLeaf.isRight()).toBe(true);
    const undoGroup = undoAll({ root: doc.root, index }, group.value);
    expect(undoGroup.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(xml);
  });

  it('con null quita la visibilidad del miembro (y el bloque si queda vacío)', () => {
    const { xml, doc, index } = open('SalesCreditMemoESP.rdlc');

    const applied = applyCommand(
      { root: doc.root, index },
      { cmd: 'setMemberVisibility', id: 'LinesTable2', axis: 'row', path: [1], hidden: true },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    const cleared = applyCommand(
      { root: doc.root, index },
      { cmd: 'setMemberVisibility', id: 'LinesTable2', axis: 'row', path: [1], hidden: null },
    );
    expect(cleared.isRight()).toBe(true);
    if (!cleared.isRight()) return;
    expect(
      memberAt(memberRoot(index.get('LinesTable2'), 'row'), [1])?.child('Visibility'),
    ).toBeUndefined();
    expectValid(doc);

    const undoClear = undoAll({ root: doc.root, index }, cleared.value);
    expect(undoClear.isRight()).toBe(true);
    expect(hiddenOf(memberAt(memberRoot(index.get('LinesTable2'), 'row'), [1]))).toBe('true');
    const undoApply = undoAll({ root: doc.root, index }, applied.value);
    expect(undoApply.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(xml);
  });

  it('rechaza rutas inexistentes, ejes sin jerarquía y expresiones vacías', () => {
    const { xml, doc, index } = open('SalesCreditMemoESP.rdlc');

    const badPath = applyCommand(
      { root: doc.root, index },
      { cmd: 'setMemberVisibility', id: 'LinesTable2', axis: 'row', path: [99], hidden: true },
    );
    expect(badPath.isLeft()).toBe(true);

    const notTablix = applyCommand(
      { root: doc.root, index },
      { cmd: 'setMemberVisibility', id: 'Textbox4', axis: 'row', path: [0], hidden: true },
    );
    expect(notTablix.isLeft()).toBe(true);

    const empty = applyCommand(
      { root: doc.root, index },
      { cmd: 'setMemberVisibility', id: 'LinesTable2', axis: 'row', path: [0], hidden: '  ' },
    );
    expect(empty.isLeft()).toBe(true);

    expect(adapter.serialize(doc)).toBe(xml);
  });
});
