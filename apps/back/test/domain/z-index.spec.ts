import { describe, expect, it } from 'vitest';
import { applyCommand } from '../../src/domain/document/commands/applyCommand.js';
import { DocumentIndex } from '../../src/domain/document/index/DocumentIndex.js';
import { TrueFormatXmlAdapter } from '../../src/infrastructure/rdlc/TrueFormatXmlAdapter.js';
import { corpusByName } from '../golden/fixtures.js';
import { undoAll } from './command-test-utils.js';

/**
 * F1 · `setZIndex`: orden de apilado (`ZIndex` es `unsignedInt` en el XSD).
 *
 * En `SalesCreditMemoESP`, `Rectangle1` (cabecera) tiene 8 hijos: `Textbox4`
 * sin `ZIndex` y `Textbox17`…`Textbox18` con 1…7. Es el caso real de este test.
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

/** Subárbol XML del Textbox (del `Name` a su cierre). */
function textboxSlice(output: string, id: string): string {
  const start = output.indexOf(`Name="${id}"`);
  return output.slice(start, output.indexOf('</Textbox>', start));
}

describe('F1 · setZIndex', () => {
  it('escribe el ZIndex (creándolo en orden canónico) y el undo es exacto', () => {
    const { xml, doc, index } = open('SalesCreditMemoESP.rdlc');

    const applied = applyCommand(
      { root: doc.root, index },
      { cmd: 'setZIndex', id: 'Textbox4', zIndex: 8 },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;
    expect(applied.value.applied?.[0]).toMatchObject({
      id: 'Textbox4',
      values: { zIndex: 8 },
    });

    expect(textboxSlice(adapter.serialize(doc), 'Textbox4')).toContain('<ZIndex>8</ZIndex>');

    const undone = undoAll({ root: doc.root, index }, applied.value);
    expect(undone.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(xml);
  });

  it('zIndex 0 quita la etiqueta (el valor por defecto no se declara)', () => {
    const { xml, doc, index } = open('SalesCreditMemoESP.rdlc');

    const applied = applyCommand(
      { root: doc.root, index },
      { cmd: 'setZIndex', id: 'Textbox17', zIndex: 0 },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    expect(textboxSlice(adapter.serialize(doc), 'Textbox17')).not.toContain('<ZIndex>');

    const undone = undoAll({ root: doc.root, index }, applied.value);
    expect(undone.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(xml);
  });

  it('un valor negativo manda el item detrás de todos (corre a los hermanos)', () => {
    const { xml, doc, index } = open('SalesCreditMemoESP.rdlc');

    // Textbox18 tenía ZIndex 7; con -1 queda a 0 y los hermanos suben 1.
    const applied = applyCommand(
      { root: doc.root, index },
      { cmd: 'setZIndex', id: 'Textbox18', zIndex: -1 },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;
    expect(applied.value.snapshotOut).toBe(true);

    const output = adapter.serialize(doc);
    const moved = textboxSlice(output, 'Textbox18');
    expect(moved).not.toContain('<ZIndex>');
    // Los que no tenían ZIndex lo estrenan con 1; los que tenían, suben 1.
    expect(textboxSlice(output, 'Textbox4')).toContain('<ZIndex>1</ZIndex>');
    expect(textboxSlice(output, 'Textbox17')).toContain('<ZIndex>2</ZIndex>');
    expect(textboxSlice(output, 'Textbox21')).toContain('<ZIndex>7</ZIndex>');

    const undone = undoAll({ root: doc.root, index }, applied.value);
    expect(undone.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(xml);
  });

  it('rechaza items inexistentes', () => {
    const { doc, index } = open('SalesCreditMemoESP.rdlc');
    const result = applyCommand(
      { root: doc.root, index },
      { cmd: 'setZIndex', id: 'NoExiste', zIndex: 1 },
    );
    expect(result.isLeft()).toBe(true);
  });
});
