import { describe, expect, it } from 'vitest';
import { appliedOf, undoAll } from './command-test-utils.js';
import { applyCommand } from '../../src/domain/document/commands/applyCommand.js';
import { DocumentIndex } from '../../src/domain/document/index/DocumentIndex.js';
import { TrueFormatXmlAdapter } from '../../src/infrastructure/rdlc/TrueFormatXmlAdapter.js';
import { corpusByName } from '../golden/fixtures.js';

/**
 * F1 · `setBounds`: mover **y** redimensionar en un solo comando (tiradores de
 * la selección) para que el undo sea un único paso.
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

describe('F1 · setBounds', () => {
  it('cambia posición y tamaño, y el undo restaura los bytes', () => {
    const { xml, doc, index } = open('PalletOutput.rdlc');

    const applied = applyCommand(
      { root: doc.root, index },
      {
        cmd: 'setBounds',
        id: 'Textbox25',
        top: { value: 3, unit: 'cm' },
        left: { value: 4, unit: 'cm' },
        width: { value: 7.5, unit: 'cm' },
        height: { value: 2, unit: 'cm' },
      },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    const values = appliedOf(applied.value, 'Textbox25');
    expect(values).toMatchObject({
      top: { value: 3, unit: 'cm' },
      left: { value: 4, unit: 'cm' },
      width: { value: 7.5, unit: 'cm' },
      height: { value: 2, unit: 'cm' },
    });

    const output = adapter.serialize(doc);
    expect(output).toContain('<Width>7.5cm</Width>');
    expect(output).toContain('<Top>3cm</Top>');

    // Un solo inverso → un único paso de undo, byte a byte.
    const undone = undoAll({ root: doc.root, index }, applied.value);
    expect(undone.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(xml);
  });

  it('normaliza a la región como setLocation + setSize (no se sale de la banda)', () => {
    // `Textbox1` de BTCWhseShipment es de primer nivel (PalletOutput los tiene
    // todos dentro del tablix, y ahí el dominio no clampa).
    const { doc, index } = open('BTCWhseShipment.rdlc');
    const body = index.bounds().body;
    const topLevel = 'Textbox1';
    expect(index.get(topLevel)).toBeDefined();
    expect(index.isNested(topLevel)).toBe(false);

    const applied = applyCommand(
      { root: doc.root, index },
      {
        cmd: 'setBounds',
        id: topLevel,
        top: { value: 999, unit: 'cm' },
        left: { value: 999, unit: 'cm' },
        width: { value: 5, unit: 'cm' },
        height: { value: 1, unit: 'cm' },
      },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    const values = appliedOf(applied.value, topLevel) as {
      top: { value: number };
      left: { value: number };
      width: { value: number };
      height: { value: number };
    };
    expect(values.left.value + values.width.value).toBeLessThanOrEqual(body.width.value + 1e-9);
    expect(values.top.value + values.height.value).toBeLessThanOrEqual(body.height.value + 1e-9);
  });

  it('encoger por la esquina noroeste funciona (top/left suben y el tamaño baja)', () => {
    const { doc, index } = open('PalletOutput.rdlc');
    const before = index.get('Textbox25');
    expect(before).toBeDefined();
    if (!before) return;

    const applied = applyCommand(
      { root: doc.root, index },
      {
        cmd: 'setBounds',
        id: 'Textbox25',
        top: { value: 0.5, unit: 'cm' },
        left: { value: 0.5, unit: 'cm' },
        width: { value: 4, unit: 'cm' },
        height: { value: 0.5, unit: 'cm' },
      },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    const output = adapter.serialize(doc);
    expect(output).toContain('<Top>0.5cm</Top>');
    expect(output).toContain('<Height>0.5cm</Height>');
  });
});
