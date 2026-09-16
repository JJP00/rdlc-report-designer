import { describe, expect, it } from 'vitest';
import { applyCommand } from '../../src/domain/document/commands/applyCommand.js';
import { DocumentIndex } from '../../src/domain/document/index/DocumentIndex.js';
import { TrueFormatXmlAdapter } from '../../src/infrastructure/rdlc/TrueFormatXmlAdapter.js';
import { corpusByName } from '../golden/fixtures.js';

/**
 * F1 — escapado del XML en nodos **nuevos**.
 *
 * `setText` ya escapaba, pero las etiquetas creadas por `createElement` (el
 * `<Value>` de una imagen nueva, el texto de un textbox insertado…) metían el
 * texto crudo: un `&` de una expresión VB o de una URL generaba XML inválido y
 * el guardado reventaba. La prueba es el round-trip: si el XML es inválido, el
 * parser lanza.
 */

const adapter = new TrueFormatXmlAdapter();

/** Expresión VB típica de BC: `&` de concatenación y `<` de comparación. */
const EXPRESSION = '=IIf(Fields!Qty.Value < 1, "", Fields!A.Value & " x " & Fields!B.Value)';

describe('F1 · escapado de nodos nuevos', () => {
  it('el <Value> de una imagen insertada escapa `&` y `<`', () => {
    const { doc } = { doc: adapter.parse(corpusByName('PalletOutput.rdlc').xml) };
    const index = DocumentIndex.build(doc.root);

    const inserted = applyCommand(
      { root: doc.root, index },
      {
        cmd: 'insertItem',
        scope: { kind: 'body' },
        index: 0,
        item: {
          kind: 'image',
          name: 'ImagenNueva',
          top: { value: 1, unit: 'cm' },
          left: { value: 1, unit: 'cm' },
          width: { value: 3, unit: 'cm' },
          height: { value: 2, unit: 'cm' },
        },
      },
    );
    expect(inserted.isRight()).toBe(true);

    const applied = applyCommand(
      { root: doc.root, index: DocumentIndex.build(doc.root) },
      { cmd: 'setImageOptions', id: 'ImagenNueva', value: EXPRESSION },
    );
    expect(applied.isRight()).toBe(true);

    const output = adapter.serialize(doc);
    expect(output).toContain('&amp;');
    expect(output).not.toContain('& "');

    // Round-trip: el XML sigue siendo parseable y el texto vuelve igual.
    const reparsed = adapter.parse(output);
    const reparsedIndex = DocumentIndex.build(reparsed.root);
    expect(reparsedIndex.get('ImagenNueva')?.child('Value')?.text()).toBe(EXPRESSION);
  });

  it('el texto de un textbox insertado escapa `&` y `<`', () => {
    const doc = adapter.parse(corpusByName('PalletOutput.rdlc').xml);
    const index = DocumentIndex.build(doc.root);

    const text = 'A & B < C';
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
          left: { value: 1, unit: 'cm' },
          width: { value: 5, unit: 'cm' },
          height: { value: 1, unit: 'cm' },
          text,
        },
      },
    );
    expect(applied.isRight()).toBe(true);

    const output = adapter.serialize(doc);
    expect(output).toContain('<Value>A &amp; B &lt; C</Value>');

    const reparsed = adapter.parse(output);
    const reparsedIndex = DocumentIndex.build(reparsed.root);
    expect(
      reparsedIndex
        .get('TextboxNuevo')
        ?.child('Paragraphs')
        ?.child('Paragraph')
        ?.child('TextRuns')
        ?.child('TextRun')
        ?.child('Value')
        ?.text(),
    ).toBe(text);
  });
});
