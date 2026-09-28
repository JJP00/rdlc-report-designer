import { describe, expect, it } from 'vitest';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { appliedOf, undoAll } from './command-test-utils.js';
import { applyCommand } from '../../src/domain/document/commands/applyCommand.js';
import { DocumentIndex } from '../../src/domain/document/index/DocumentIndex.js';
import type { RdlcNode } from '../../src/domain/document/tree/RdlcNode.js';
import { TrueFormatXmlAdapter } from '../../src/infrastructure/rdlc/TrueFormatXmlAdapter.js';
import { LibXml2SchemaValidatorAdapter } from '../../src/infrastructure/validation/LibXml2SchemaValidatorAdapter.js';
import { corpusByName } from '../golden/fixtures.js';

/**
 * `setName`: renombra un item (`Name`) con nombre **único** y sincroniza
 * `<rd:DefaultName>` solo si espejaba el nombre anterior (como al duplicar).
 * El undo es byte-exacto.
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

/** Índice rehecho tras un comando estructural (como hace `CommandService`). */
function rebuild(doc: { root: RdlcNode }): DocumentIndex {
  return DocumentIndex.build(doc.root);
}

function defaultNameOf(node: RdlcNode | undefined): string | undefined {
  return node
    ?.children()
    .find((child) => child.tagName === 'rd:DefaultName')
    ?.text();
}

describe('F1 · setName', () => {
  it('renombra el item y el undo es byte-exacto', () => {
    const { xml, doc, index } = open('SalesCreditMemoESP.rdlc');

    const applied = applyCommand(
      { root: doc.root, index },
      { cmd: 'setName', id: 'Textbox4', name: 'MiTextbox' },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    expect(appliedOf(applied.value, 'Textbox4')).toEqual({ id: 'MiTextbox' });
    expect(rebuild(doc).get('MiTextbox')?.attribute('Name')).toBe('MiTextbox');
    const problems = validator.validate(adapter.serialize(doc)).problems;
    expect(problems, problems.join(' | ')).toEqual([]);

    const undone = undoAll({ root: doc.root, index: rebuild(doc) }, applied.value);
    expect(undone.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(xml);
  });

  it('sincroniza rd:DefaultName solo si espejaba el nombre anterior', () => {
    const { doc, index } = open('SalesCreditMemoESP.rdlc');
    // Textbox115 tiene `<rd:DefaultName>Textbox115</rd:DefaultName>`.
    expect(defaultNameOf(index.get('Textbox115'))).toBe('Textbox115');

    const applied = applyCommand(
      { root: doc.root, index },
      { cmd: 'setName', id: 'Textbox115', name: 'TotalVAT' },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;
    expect(defaultNameOf(rebuild(doc).get('TotalVAT'))).toBe('TotalVAT');

    // ItemNo_Line_Lbl2 conserva el nombre "original" en rd:DefaultName.
    const preserved = applyCommand(
      { root: doc.root, index: rebuild(doc) },
      { cmd: 'setName', id: 'ItemNo_Line_Lbl2', name: 'ArticuloLinea' },
    );
    expect(preserved.isRight()).toBe(true);
    if (!preserved.isRight()) return;
    expect(defaultNameOf(rebuild(doc).get('ArticuloLinea'))).toBe('ItemNo_Line_Lbl');

    const undoPreserved = undoAll({ root: doc.root, index: rebuild(doc) }, preserved.value);
    expect(undoPreserved.isRight()).toBe(true);
    expect(rebuild(doc).get('ItemNo_Line_Lbl2')?.attribute('Name')).toBe('ItemNo_Line_Lbl2');
    expect(defaultNameOf(rebuild(doc).get('ItemNo_Line_Lbl2'))).toBe('ItemNo_Line_Lbl');

    const undoApplied = undoAll({ root: doc.root, index: rebuild(doc) }, applied.value);
    expect(undoApplied.isRight()).toBe(true);
    expect(defaultNameOf(rebuild(doc).get('Textbox115'))).toBe('Textbox115');
  });

  it('rechaza nombres duplicados o vacíos sin tocar el documento', () => {
    const { xml, doc, index } = open('SalesCreditMemoESP.rdlc');

    const duplicate = applyCommand(
      { root: doc.root, index },
      { cmd: 'setName', id: 'Textbox4', name: 'Tablix2' },
    );
    expect(duplicate.isLeft()).toBe(true);

    const empty = applyCommand(
      { root: doc.root, index },
      { cmd: 'setName', id: 'Textbox4', name: '   ' },
    );
    expect(empty.isLeft()).toBe(true);

    expect(adapter.serialize(doc)).toBe(xml);
  });

  it('renombrar al mismo nombre no escribe nada', () => {
    const { xml, doc, index } = open('SalesCreditMemoESP.rdlc');
    const applied = applyCommand(
      { root: doc.root, index },
      { cmd: 'setName', id: 'Textbox4', name: 'Textbox4' },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;
    // Sin estructurales: no hay ningún nodo que restaurar.
    expect(applied.value.inverse).toEqual([]);
    expect(adapter.serialize(doc)).toBe(xml);
  });
});
