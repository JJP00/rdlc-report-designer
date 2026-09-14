import { describe, expect, it } from 'vitest';
import { applyCommand } from '../../src/domain/document/commands/applyCommand.js';
import { DocumentIndex } from '../../src/domain/document/index/DocumentIndex.js';
import { TrueFormatXmlAdapter } from '../../src/infrastructure/rdlc/TrueFormatXmlAdapter.js';
import { corpusByName } from '../golden/fixtures.js';
import { appliedOf, undoAll } from './command-test-utils.js';

/** F1 — estilo del item (`setStyle`): fuente, colores, alineación, viñetas. */

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

describe('F1 · setStyle', () => {
  it('escribe fuente/tamaño/negrita en orden canónico y el undo restaura bytes', () => {
    const { xml, doc, index } = open('PalletOutput.rdlc');

    const applied = applyCommand(
      { root: doc.root, index },
      {
        cmd: 'setStyle',
        id: 'Textbox25',
        style: {
          fontFamily: 'Arial',
          fontSize: { value: 12, unit: 'pt' },
          fontWeight: 'Bold',
          textAlign: 'Center',
        },
      },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    const output = adapter.serialize(doc);
    expect(output).toContain('<FontFamily>Arial</FontFamily>');
    expect(output).toContain('<FontSize>12pt</FontSize>');
    expect(output).toContain('<FontWeight>Bold</FontWeight>');

    // Orden canónico dentro de <Style>: FontFamily < FontSize < FontWeight.
    const styleStart = output.indexOf('<FontFamily>Arial</FontFamily>');
    expect(styleStart).toBeGreaterThan(0);
    expect(output.indexOf('<FontSize>12pt</FontSize>')).toBeGreaterThan(styleStart);
    expect(output.indexOf('<FontWeight>Bold</FontWeight>')).toBeGreaterThan(
      output.indexOf('<FontSize>12pt</FontSize>'),
    );

    // `applied` lleva el estilo completo para reconciliar el front.
    expect(appliedOf(applied.value, 'Textbox25')).toMatchObject({
      style: { fontFamily: 'Arial', fontWeight: 'Bold' },
    });

    const undone = undoAll({ root: doc.root, index }, applied.value);
    expect(undone.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(xml);
  });

  it('respeta el estilo existente del item (no lo pisa)', () => {
    const { doc, index } = open('SalesInvoiceESP.rdlc');

    // Textbox23 ya tiene VerticalAlign=Bottom y padding.
    const applied = applyCommand(
      { root: doc.root, index },
      { cmd: 'setStyle', id: 'Textbox23', style: { fontStyle: 'Italic' } },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    const output = adapter.serialize(doc);
    expect(output).toContain('<FontStyle>Italic</FontStyle>');
    expect(output).toContain('<VerticalAlign>Bottom</VerticalAlign>');
    expect(output).toContain('<PaddingLeft>2pt</PaddingLeft>');
  });

  it('aplica y revierte viñetas (ListStyle)', () => {
    const { xml, doc, index } = open('PalletOutput.rdlc');

    const applied = applyCommand(
      { root: doc.root, index },
      { cmd: 'setStyle', id: 'Textbox25', style: { listStyle: 'Bulleted' } },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;
    expect(adapter.serialize(doc)).toContain('<ListStyle>Bulleted</ListStyle>');

    const undone = undoAll({ root: doc.root, index }, applied.value);
    expect(undone.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(xml);
  });

  it('la inversa devuelve el valor anterior (no borra el nodo)', () => {
    const { doc, index } = open('PalletOutput.rdlc');

    const first = applyCommand(
      { root: doc.root, index },
      { cmd: 'setStyle', id: 'Textbox25', style: { color: '#FF0000' } },
    );
    expect(first.isRight()).toBe(true);
    if (!first.isRight()) return;

    const second = applyCommand(
      { root: doc.root, index },
      { cmd: 'setStyle', id: 'Textbox25', style: { color: '#00FF00' } },
    );
    expect(second.isRight()).toBe(true);
    if (!second.isRight()) return;

    // Deshacer el segundo comando devuelve '#FF0000'.
    undoAll({ root: doc.root, index }, second.value);
    expect(adapter.serialize(doc)).toContain('<Color>#FF0000</Color>');

    // Y deshacer el primero quita el nodo (inverso sin valor previo = comando con {}).
    undoAll({ root: doc.root, index }, first.value);
    expect(adapter.serialize(doc)).not.toContain('#FF0000');
  });
});
