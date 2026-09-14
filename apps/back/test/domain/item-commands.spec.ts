import { describe, expect, it } from 'vitest';
import { applyCommand } from '../../src/domain/document/commands/applyCommand.js';
import { DocumentIndex } from '../../src/domain/document/index/DocumentIndex.js';
import { TrueFormatXmlAdapter } from '../../src/infrastructure/rdlc/TrueFormatXmlAdapter.js';
import { corpusByName } from '../golden/fixtures.js';
import { appliedOf, undoAll } from './command-test-utils.js';

/**
 * F1 — insertar / duplicar / eliminar items.
 *
 * Propiedad clave en todos: después del undo el XML es **byte a byte** el
 * original (los inversos internos reinsertan el mismo subárbol sin regenerar).
 */

const adapter = new TrueFormatXmlAdapter();

function open(name: string): {
  xml: string;
  doc: ReturnType<TrueFormatXmlAdapter['parse']>;
  index: DocumentIndex;
} {
  const { xml } = corpusByName(name);
  const doc = adapter.parse(xml);
  return { xml, doc, index: DocumentIndex.build(doc.root) };
}

describe('F1 · insertItem', () => {
  it('inserta un textbox en el cuerpo con hijos obligatorios y orden canónico', () => {
    const { doc, index } = open('PalletOutput.rdlc');

    const applied = applyCommand(
      { root: doc.root, index },
      {
        cmd: 'insertItem',
        scope: { kind: 'body' },
        index: 0,
        item: {
          kind: 'textbox',
          name: 'TextboxNuevo',
          top: { value: 1, unit: 'cm' },
          left: { value: 2, unit: 'cm' },
          width: { value: 5, unit: 'cm' },
          height: { value: 0.5, unit: 'cm' },
          text: 'Hola',
        },
      },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    const output = adapter.serialize(doc);
    expect(output).toContain('Name="TextboxNuevo"');
    expect(output).toContain('<Value>Hola</Value>');
    expect(output).toContain('<CanGrow>true</CanGrow>');
    expect(appliedOf(applied.value, 'TextboxNuevo')).toMatchObject({
      top: { value: 1, unit: 'cm' },
      left: { value: 2, unit: 'cm' },
    });

    // Orden canónico: Top antes que Height y Paragraphs al final.
    const inserted = output.slice(output.indexOf('TextboxNuevo'));
    expect(inserted.indexOf('<Top>1cm</Top>')).toBeLessThan(inserted.indexOf('<Height>0.5cm</Height>'));
    expect(inserted.indexOf('<Height>')).toBeLessThan(inserted.indexOf('<Paragraphs>'));
  });

  it('el undo de la inserción deja el XML byte a byte igual', () => {
    const { xml, doc, index } = open('PalletOutput.rdlc');

    const applied = applyCommand(
      { root: doc.root, index },
      {
        cmd: 'insertItem',
        scope: { kind: 'body' },
        index: 0,
        item: {
          kind: 'rectangle',
          name: 'RectangleNuevo',
          top: { value: 3, unit: 'cm' },
          left: { value: 3, unit: 'cm' },
          width: { value: 4, unit: 'cm' },
          height: { value: 2, unit: 'cm' },
        },
      },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;
    expect(adapter.serialize(doc)).not.toBe(xml);

    const undone = undoAll({ root: doc.root, index }, applied.value);
    expect(undone.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(xml);
  });

  it('rechaza nombres duplicados', () => {
    const { doc, index } = open('PalletOutput.rdlc');
    const result = applyCommand(
      { root: doc.root, index },
      {
        cmd: 'insertItem',
        scope: { kind: 'body' },
        index: 0,
        item: {
          kind: 'textbox',
          name: 'Tablix4',
          top: { value: 0, unit: 'cm' },
          left: { value: 0, unit: 'cm' },
          width: { value: 1, unit: 'cm' },
          height: { value: 1, unit: 'cm' },
        },
      },
    );
    expect(result.isLeft()).toBe(true);
  });

  it('inserta dentro de un rectángulo (scope rectangle)', () => {
    const { doc, index } = open('SalesInvoiceESP.rdlc');
    const inside = applyCommand(
      { root: doc.root, index },
      {
        cmd: 'insertItem',
        scope: { kind: 'rectangle', id: 'Rectangle1' },
        index: 0,
        item: {
          kind: 'textbox',
          name: 'TextboxDentro',
          top: { value: 0.5, unit: 'cm' },
          left: { value: 0.5, unit: 'cm' },
          width: { value: 3, unit: 'cm' },
          height: { value: 0.5, unit: 'cm' },
          text: '=Fields!BTCClientName.Value',
        },
      },
    );
    expect(inside.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toContain('Name="TextboxDentro"');
  });
});

describe('F1 · duplicateItem', () => {
  it('clona el subárbol exacto con nombre nuevo y el undo lo elimina', () => {
    const { xml, doc, index } = open('SalesInvoiceESP.rdlc');

    const applied = applyCommand(
      { root: doc.root, index },
      { cmd: 'duplicateItem', id: 'Textbox23', name: 'Textbox23Copia' },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    const output = adapter.serialize(doc);
    expect(output).toContain('Name="Textbox23Copia"');
    // El clon conserva valor y estilo del original.
    expect(output.match(/BTCClientName/g)?.length).toBeGreaterThan(2);

    const undone = undoAll({ root: doc.root, index }, applied.value);
    expect(undone.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(xml);
  });
});

describe('F1 · deleteItem', () => {
  it('elimina el elemento y el undo lo restaura byte a byte', () => {
    const { xml, doc, index } = open('PalletOutput.rdlc');

    const applied = applyCommand({ root: doc.root, index }, { cmd: 'deleteItem', id: 'Textbox25' });
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    const removed = adapter.serialize(doc);
    expect(removed).not.toContain('Name="Textbox25"');

    const undone = undoAll({ root: doc.root, index }, applied.value);
    expect(undone.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(xml);
  });

  it('eliminar y volver a eliminar el mismo id falla (no hay elemento)', () => {
    const { doc, index } = open('PalletOutput.rdlc');
    applyCommand({ root: doc.root, index }, { cmd: 'deleteItem', id: 'Textbox25' });
    // El caso de uso real reconstruye el índice tras comandos estructurales.
    const rebuilt = DocumentIndex.build(doc.root);
    const again = applyCommand({ root: doc.root, index: rebuilt }, { cmd: 'deleteItem', id: 'Textbox25' });
    expect(again.isLeft()).toBe(true);
  });
});
