import { describe, expect, it } from 'vitest';
import { applyCommand } from '../../src/domain/document/commands/applyCommand.js';
import { DocumentIndex } from '../../src/domain/document/index/DocumentIndex.js';
import { TrueFormatXmlAdapter } from '../../src/infrastructure/rdlc/TrueFormatXmlAdapter.js';
import { corpusByName } from '../golden/fixtures.js';
import { appliedOf, undoAll } from './command-test-utils.js';

/**
 * G3 · `moveItem`: reparentar/reordenar (drag&drop) con un solo paso de undo.
 *
 * - `SalesCreditMemoESP · Rectangle1` (cabecera) tiene 8 textboxes hermanos.
 * - `BTCWhseShipment · Rectangle3` es un rectángulo **con tamaño explícito**
 *   (2.09 × 0.57 cm): al meterle un hijo que se sale, crece.
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

/** Nombres de los items dentro del `ReportItems` de un contenedor. */
function childNames(node: ReturnType<DocumentIndex['get']>): string[] {
  const items = node?.child('ReportItems');
  if (!items) return [];
  return items
    .children()
    .map((child) => child.attribute('Name'))
    .filter((name): name is string => name !== undefined);
}

describe('G3 · moveItem', () => {
  it('saca un textbox de un rectángulo al cuerpo, con su posición nueva', () => {
    const { xml, doc, index } = open('SalesCreditMemoESP.rdlc');

    const applied = applyCommand(
      { root: doc.root, index },
      {
        cmd: 'moveItem',
        id: 'Textbox4',
        toScope: { kind: 'body' },
        toIndex: 0,
        top: { value: 5, unit: 'cm' },
        left: { value: 6, unit: 'cm' },
      },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    const output = adapter.serialize(doc);
    const item = output.slice(output.indexOf('Name="Textbox4"'), output.indexOf('</Textbox>'));
    expect(item).toContain('<Top>5cm</Top>');
    expect(item).toContain('<Left>6cm</Left>');

    const rebuilt = DocumentIndex.build(doc.root);
    const moved = rebuilt.get('Textbox4');
    expect(moved?.parent?.tagName).toBe('ReportItems');
    expect(moved?.parent?.parent?.tagName).toBe('Body');
    // Y ya no cuelga de Rectangle1.
    expect(childNames(rebuilt.get('Rectangle1'))).not.toContain('Textbox4');

    const undone = undoAll({ root: doc.root, index }, applied.value);
    expect(undone.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(xml);
  });

  it('al entrar en una celda quita Top/Left (los pone la celda) y el undo los restaura', () => {
    const { xml, doc, index } = open('SalesCreditMemoESP.rdlc');

    const applied = applyCommand(
      { root: doc.root, index },
      {
        cmd: 'moveItem',
        id: 'Textbox17',
        toScope: { kind: 'tablixCell', id: 'Tablix2', row: 0, col: 0 },
        toIndex: 1,
      },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    const output = adapter.serialize(doc);
    const item = output.slice(output.indexOf('Name="Textbox17"'), output.indexOf('</Textbox>'));
    expect(item).not.toContain('<Top>');
    expect(item).not.toContain('<Left>');

    const undone = undoAll({ root: doc.root, index }, applied.value);
    expect(undone.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(xml);
  });

  it('rechaza mover un elemento dentro de sí mismo o de un descendiente', () => {
    const { doc, index } = open('SalesCreditMemoESP.rdlc');

    const intoItself = applyCommand(
      { root: doc.root, index },
      {
        cmd: 'moveItem',
        id: 'Rectangle3',
        toScope: { kind: 'rectangle', id: 'Rectangle3' },
        toIndex: 0,
      },
    );
    expect(intoItself.isLeft()).toBe(true);

    // `BTC_Header_Carrier` cuelga de `Rectangle3`: mover el padre ahí es un ciclo.
    const intoDescendant = applyCommand(
      { root: doc.root, index },
      {
        cmd: 'moveItem',
        id: 'Rectangle3',
        toScope: { kind: 'rectangle', id: 'BTC_Header_Carrier' },
        toIndex: 0,
      },
    );
    expect(intoDescendant.isLeft()).toBe(true);
  });

  it('reordena dentro del mismo contenedor (el índice cuenta el item en su sitio)', () => {
    const { xml, doc, index } = open('SalesCreditMemoESP.rdlc');

    // Rectangle1: [Textbox4, Textbox17, …, Textbox18]; mover el primero al final.
    const applied = applyCommand(
      { root: doc.root, index },
      {
        cmd: 'moveItem',
        id: 'Textbox4',
        toScope: { kind: 'rectangle', id: 'Rectangle1' },
        toIndex: 8,
      },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    const rebuilt = DocumentIndex.build(doc.root);
    expect(childNames(rebuilt.get('Rectangle1')).at(-1)).toBe('Textbox4');

    const undone = undoAll({ root: doc.root, index }, applied.value);
    expect(undone.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(xml);
  });

  it('el rectángulo destino con tamaño explícito crece para envolver al hijo', () => {
    const { xml, doc, index } = open('BTCWhseShipment.rdlc');

    const applied = applyCommand(
      { root: doc.root, index },
      {
        cmd: 'moveItem',
        id: 'Textbox24',
        toScope: { kind: 'rectangle', id: 'Rectangle3' },
        toIndex: 0,
        top: { value: 2, unit: 'cm' },
        left: { value: 3, unit: 'cm' },
      },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    const values = appliedOf(applied.value, 'Rectangle3') as
      { width?: { value: number; unit: string } } | undefined;
    expect(values?.width?.unit).toBe('cm');
    // De 2.09 cm a 3 (el textbox no declara Width: manda la celda de origen).
    expect(values?.width?.value).toBeGreaterThan(2.5);

    const undone = undoAll({ root: doc.root, index }, applied.value);
    expect(undone.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(xml);
  });
});
