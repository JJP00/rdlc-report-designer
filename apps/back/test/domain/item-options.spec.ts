import { describe, expect, it } from 'vitest';
import { applyCommand } from '../../src/domain/document/commands/applyCommand.js';
import { DocumentIndex } from '../../src/domain/document/index/DocumentIndex.js';
import { TrueFormatXmlAdapter } from '../../src/infrastructure/rdlc/TrueFormatXmlAdapter.js';
import { corpusByName } from '../golden/fixtures.js';
import { undoAll } from './command-test-utils.js';

/**
 * F1 · `setItemOptions`.
 *
 * - `CanGrow`: solo Textbox.
 * - `KeepTogether`: Textbox, Tablix y Rectangle (vive en el propio item).
 * - `RepeatColumnHeaders` / `RepeatRowHeaders` / `NoRowsMessage`: solo Tablix.
 *
 * En RDL el valor por defecto de los booleanos es `false`: apagar una opción
 * **quita** la etiqueta (como Report Builder) en vez de escribir `false`, y un
 * `NoRowsMessage` vacío también la quita. El undo es byte-exacto en los tres
 * caminos (crear, cambiar texto, borrar).
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

/** Texto de la etiqueta directa `tag` del item `id` (o `undefined` si no está). */
function optionOf(index: DocumentIndex, id: string, tag: string): string | undefined {
  const node = index.get(id);
  if (!node) throw new Error(`No existe el item ${id}`);
  const child = node.child(tag);
  return child ? (child.text() ?? '') : undefined;
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

  it('KeepTogether en Tablix y Rectangle: enciende, apaga y el undo es byte-exacto', () => {
    for (const id of ['Tablix4', 'Rectangle1']) {
      const { xml, doc, index } = open('PalletOutput.rdlc');
      const ctx = { root: doc.root, index };

      const on = applyCommand(ctx, { cmd: 'setItemOptions', id, keepTogether: true });
      expect(on.isRight(), id).toBe(true);
      if (!on.isRight()) return;
      expect(optionOf(index, id, 'KeepTogether'), id).toBe('true');

      const off = applyCommand(ctx, { cmd: 'setItemOptions', id, keepTogether: false });
      expect(off.isRight(), id).toBe(true);
      if (!off.isRight()) return;
      expect(optionOf(index, id, 'KeepTogether'), id).toBeUndefined();

      expect(undoAll(ctx, off.value).isRight(), id).toBe(true);
      expect(optionOf(index, id, 'KeepTogether'), id).toBe('true');
      expect(undoAll(ctx, on.value).isRight(), id).toBe(true);
      expect(adapter.serialize(doc), id).toBe(xml);
    }
  });

  it('RepeatRowHeaders existente: apagar quita la etiqueta y el undo la restaura', () => {
    const { xml, doc, index } = open('SalesInvoiceESP.rdlc');
    const ctx = { root: doc.root, index };
    expect(optionOf(index, 'LinesTable', 'RepeatRowHeaders')).toBe('true');

    const off = applyCommand(ctx, {
      cmd: 'setItemOptions',
      id: 'LinesTable',
      repeatRowHeaders: false,
    });
    expect(off.isRight()).toBe(true);
    if (!off.isRight()) return;
    expect(optionOf(index, 'LinesTable', 'RepeatRowHeaders')).toBeUndefined();

    expect(undoAll(ctx, off.value).isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(xml);
  });

  it('RepeatColumnHeaders y RepeatRowHeaders en Tablix: enciende en orden canónico y el undo es byte-exacto', () => {
    const { xml, doc, index } = open('PalletOutput.rdlc');
    const ctx = { root: doc.root, index };

    const applied = applyCommand(ctx, {
      cmd: 'setItemOptions',
      id: 'Tablix4',
      repeatColumnHeaders: true,
      repeatRowHeaders: true,
    });
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;
    expect(optionOf(index, 'Tablix4', 'RepeatColumnHeaders')).toBe('true');
    expect(optionOf(index, 'Tablix4', 'RepeatRowHeaders')).toBe('true');

    const tablix = textTablixChildren(adapter.serialize(doc), 'Tablix4');
    expect(tablix.indexOf('<RepeatColumnHeaders>')).toBeLessThan(
      tablix.indexOf('<RepeatRowHeaders>'),
    );

    expect(undoAll(ctx, applied.value).isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(xml);
  });

  it('NoRowsMessage: escribe el texto (escapado), cambia y vacío quita; el undo es byte-exacto', () => {
    const { xml, doc, index } = open('PalletOutput.rdlc');
    const ctx = { root: doc.root, index };

    const set = applyCommand(ctx, {
      cmd: 'setItemOptions',
      id: 'Tablix4',
      noRowsMessage: 'Sin datos & <más>',
    });
    expect(set.isRight()).toBe(true);
    if (!set.isRight()) return;
    expect(adapter.serialize(doc)).toContain(
      '<NoRowsMessage>Sin datos &amp; &lt;más&gt;</NoRowsMessage>',
    );
    expect(optionOf(index, 'Tablix4', 'NoRowsMessage')).toBe('Sin datos & <más>');

    const changed = applyCommand(ctx, {
      cmd: 'setItemOptions',
      id: 'Tablix4',
      noRowsMessage: 'Nada que mostrar',
    });
    expect(changed.isRight()).toBe(true);
    if (!changed.isRight()) return;
    expect(optionOf(index, 'Tablix4', 'NoRowsMessage')).toBe('Nada que mostrar');

    const cleared = applyCommand(ctx, {
      cmd: 'setItemOptions',
      id: 'Tablix4',
      noRowsMessage: '',
    });
    expect(cleared.isRight()).toBe(true);
    if (!cleared.isRight()) return;
    expect(optionOf(index, 'Tablix4', 'NoRowsMessage')).toBeUndefined();

    expect(undoAll(ctx, cleared.value).isRight()).toBe(true);
    expect(optionOf(index, 'Tablix4', 'NoRowsMessage')).toBe('Nada que mostrar');
    expect(undoAll(ctx, changed.value).isRight()).toBe(true);
    expect(undoAll(ctx, set.value).isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(xml);
  });

  it('rechaza cada opción en un item que no la admite', () => {
    const { doc, index } = open('PalletOutput.rdlc');
    const ctx = { root: doc.root, index };
    const cases: Array<[string, Parameters<typeof applyCommand>[1]]> = [
      ['Tablix4', { cmd: 'setItemOptions', id: 'Tablix4', canGrow: true }],
      ['Rectangle1', { cmd: 'setItemOptions', id: 'Rectangle1', canGrow: true }],
      ['Textbox25', { cmd: 'setItemOptions', id: 'Textbox25', repeatRowHeaders: true }],
      ['Textbox25', { cmd: 'setItemOptions', id: 'Textbox25', repeatColumnHeaders: true }],
      ['Rectangle1', { cmd: 'setItemOptions', id: 'Rectangle1', noRowsMessage: 'x' }],
    ];
    for (const [id, command] of cases) {
      const result = applyCommand(ctx, command);
      expect(result.isLeft(), id).toBe(true);
      if (result.isLeft()) expect(result.value.reason, id).toBe('itemOptionsUnsupported');
    }

    const empty = applyCommand(ctx, { cmd: 'setItemOptions', id: 'Tablix4' });
    expect(empty.isLeft()).toBe(true);
    if (empty.isLeft()) expect(empty.value.reason).toBe('noOptionToChange');

    const missing = applyCommand(ctx, {
      cmd: 'setItemOptions',
      id: 'NoExiste',
      keepTogether: true,
    });
    expect(missing.isLeft()).toBe(true);
    if (missing.isLeft()) expect(missing.value.reason).toBe('itemMissing');
  });
});

/** Subárbol XML del Textbox (del `Name` a su cierre). */
function textboxSlice(output: string, id: string): string {
  const start = output.indexOf(`Name="${id}"`);
  return output.slice(start, output.indexOf('</Textbox>', start));
}

/** Subárbol XML del Tablix (del `Name` a su cierre); el primero tras el nombre. */
function textTablixChildren(output: string, id: string): string {
  const start = output.indexOf(`<Tablix Name="${id}"`);
  return output.slice(start, output.indexOf('</Tablix>', start));
}
