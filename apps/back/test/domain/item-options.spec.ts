import { describe, expect, it } from 'vitest';
import { applyCommand } from '../../src/domain/document/commands/applyCommand.js';
import { DocumentIndex } from '../../src/domain/document/index/DocumentIndex.js';
import { TrueFormatXmlAdapter } from '../../src/infrastructure/rdlc/TrueFormatXmlAdapter.js';
import { corpusByName } from '../golden/fixtures.js';
import { undoAll } from './command-test-utils.js';

/**
 * F1 · `setItemOptions` (`CanGrow` / `KeepTogether` de un Textbox).
 *
 * En RDL el valor por defecto es `false`: apagar una opción **quita** la
 * etiqueta (como Report Builder) en vez de escribir `false`. El undo es
 * byte-exacto en los tres caminos (crear, cambiar texto, borrar).
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

describe('F1 · setItemOptions', () => {
  it('enciende KeepTogether en orden canónico (tras CanGrow y antes de Paragraphs)', () => {
    const { xml, doc, index } = open('BTCWhseShipment.rdlc');

    const applied = applyCommand(
      { root: doc.root, index },
      { cmd: 'setItemOptions', id: 'FooterTemperatureValue', keepTogether: true },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;
    expect(applied.value.snapshotOut).toBe(true);

    const output = adapter.serialize(doc);
    const item = textboxSlice(output, 'FooterTemperatureValue');
    expect(item).toContain('<KeepTogether>true</KeepTogether>');
    expect(item.indexOf('<CanGrow>')).toBeLessThan(item.indexOf('<KeepTogether>'));
    expect(item.indexOf('<KeepTogether>')).toBeLessThan(item.indexOf('<Paragraphs>'));

    const undone = undoAll({ root: doc.root, index }, applied.value);
    expect(undone.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(xml);
  });

  it('apaga CanGrow quitando la etiqueta (y el undo la restaura)', () => {
    const { xml, doc, index } = open('PalletOutput.rdlc');

    const applied = applyCommand(
      { root: doc.root, index },
      { cmd: 'setItemOptions', id: 'Textbox25', canGrow: false },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    const item = textboxSlice(adapter.serialize(doc), 'Textbox25');
    expect(item).not.toContain('<CanGrow>');
    expect(item).toContain('<KeepTogether>true</KeepTogether>');

    const undone = undoAll({ root: doc.root, index }, applied.value);
    expect(undone.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(xml);
  });

  it('rechaza items que no son Textbox y comandos sin cambios', () => {
    const { doc, index } = open('PalletOutput.rdlc');
    const rectangle = applyCommand(
      { root: doc.root, index },
      { cmd: 'setItemOptions', id: 'Rectangle1', keepTogether: true },
    );
    expect(rectangle.isLeft()).toBe(true);

    const empty = applyCommand(
      { root: doc.root, index },
      { cmd: 'setItemOptions', id: 'Textbox25' },
    );
    expect(empty.isLeft()).toBe(true);
  });
});

/** Subárbol XML del Textbox (del `Name` a su cierre). */
function textboxSlice(output: string, id: string): string {
  const start = output.indexOf(`Name="${id}"`);
  return output.slice(start, output.indexOf('</Textbox>', start));
}
