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
 * F2.c · fila de **totales del grupo** (`addTotalRow`): nace pegada al grupo
 * (encima/debajo) y precarga cada celda con el agregado de su columna, con el
 * ámbito del grupo. La heurística es documental: `Sum` si el campo aparece en
 * algún `Sum(` del informe; si no, `First` (campos no aditivos).
 *
 * Caso real: `LinesTable` (SalesCreditMemoESP), grupo `LineNo` sobre las filas
 * 2–3; la fila 3 es el detalle (`BTCNoOfBoxes` se suma en el informe,
 * `ItemReferenceNo_Line` no) y la fila 2 es un resumen con `ColSpan`.
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

function rowsOf(tablix: RdlcNode | undefined): RdlcNode[] {
  return tablix?.child('TablixBody')?.child('TablixRows')?.children('TablixRow') ?? [];
}

/** Todos los `<Value>` no vacíos de una fila (en orden de documento). */
function rowValues(row: RdlcNode | undefined): string[] {
  const values: string[] = [];
  const walk = (node: RdlcNode): void => {
    if (node.tagName === 'Value') {
      const text = node.text();
      if (text) values.push(text);
    }
    for (const child of node.children()) walk(child);
  };
  if (row) walk(row);
  return values;
}

function memberAt(hierarchy: RdlcNode | undefined, path: number[]): RdlcNode | undefined {
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

describe('F2.c · addTotalRow', () => {
  it('debajo del grupo: Sum/First por columna, XSD válido y undo byte-exacto', () => {
    const { xml, doc, index } = open('SalesCreditMemoESP.rdlc');
    expect(rowsOf(index.get('LinesTable'))).toHaveLength(5);

    const applied = applyCommand(
      { root: doc.root, index },
      { cmd: 'addTotalRow', id: 'LinesTable', row: 3, where: 'below' },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    const rows = rowsOf(index.get('LinesTable'));
    expect(rows).toHaveLength(6);
    // Nace pegada al grupo: después de su última hoja (índice 4).
    const values = rowValues(rows[4]);
    // `BTCNoOfBoxes` y `LineAmount_Line` ya se suman en el informe.
    expect(values).toContain('=Sum(Fields!BTCNoOfBoxes.Value, "LineNo")');
    expect(values).toContain('=Sum(Fields!LineAmount_Line.Value, "LineNo")');
    // `ItemReferenceNo_Line` no es aditivo: total con `First`.
    expect(values).toContain('=First(Fields!ItemReferenceNo_Line.Value, "LineNo")');
    // El detalle no se ha tocado.
    expect(rowValues(rows[3])).toContain('=Fields!LineAmount_Line.Value');

    const problems = validator.validate(adapter.serialize(doc)).problems;
    expect(problems, problems.join(' | ')).toEqual([]);

    const undo = undoAll({ root: doc.root, index }, applied.value);
    expect(undo.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(xml);
  });

  it('encima del grupo: la fila nace antes de su primera hoja y el grupo baja', () => {
    const { xml, doc, index } = open('SalesCreditMemoESP.rdlc');

    const applied = applyCommand(
      { root: doc.root, index },
      { cmd: 'addTotalRow', id: 'LinesTable', row: 2, where: 'above' },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    const rows = rowsOf(index.get('LinesTable'));
    expect(rows).toHaveLength(6);
    expect(rowValues(rows[2])).toContain('=Sum(Fields!BTCNoOfBoxes.Value, "LineNo")');
    // El grupo (miembro [3] tras el insertado) sigue siendo el mismo.
    const hierarchy = index.get('LinesTable')?.child('TablixRowHierarchy');
    const group = memberAt(hierarchy, [3]);
    expect(group?.child('Group')?.attribute('Name')).toBe('LineNo');

    const problems = validator.validate(adapter.serialize(doc)).problems;
    expect(problems, problems.join(' | ')).toEqual([]);

    const undo = undoAll({ root: doc.root, index }, applied.value);
    expect(undo.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(xml);
  });

  it('un grupo hoja también admite total (su fila es el grupo)', () => {
    const { xml, doc, index } = open('SalesCreditMemoESP.rdlc');
    const before = rowsOf(index.get('Tablix7'));
    expect(before).toHaveLength(1);

    const applied = applyCommand(
      { root: doc.root, index },
      { cmd: 'addTotalRow', id: 'Tablix7', row: 0, where: 'below' },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    const rows = rowsOf(index.get('Tablix7'));
    expect(rows).toHaveLength(2);
    // El importe (sumado en el informe) se agrega con el ámbito del grupo y el
    // porcentaje (`Format(...)`, no aditivo) con `First`.
    expect(rowValues(rows[1])).toContain(
      '=Sum(Fields!VATAmount_VatAmountLine.Value, "VATIdentifier_VatAmountLine")',
    );
    expect(rowValues(rows[1])).toContain(
      '=First(Fields!VATPct_VatAmountLine.Value, "VATIdentifier_VatAmountLine")',
    );

    const undo = undoAll({ root: doc.root, index }, applied.value);
    expect(undo.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(xml);
  });

  it('se rechaza si la fila no está dentro de un grupo', () => {
    const { doc, index } = open('SalesCreditMemoESP.rdlc');
    const applied = applyCommand(
      { root: doc.root, index },
      { cmd: 'addTotalRow', id: 'Tablix3', row: 0, where: 'below' },
    );
    expect(applied.isLeft()).toBe(true);
  });
});
