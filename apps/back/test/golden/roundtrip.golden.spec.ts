import { XmlDocument, XmlElement, XmlText } from 'xml-trueformat';
import { describe, expect, it } from 'vitest';
import { TrueFormatXmlAdapter } from '../../src/infrastructure/rdlc/TrueFormatXmlAdapter.js';
import { corpusByName, firstDiff, loadCorpus } from './fixtures.js';

/**
 * Fase 0 — Gate go/no-go.
 *
 * Parsear y serializar cada fichero del corpus debe devolver los bytes
 * originales, exactos: CRLF, whitespace, comentarios, comillas y orden de
 * atributos, namespaces `rd:`, self-closing, `<Code>` VB incluido.
 */

const adapter = new TrueFormatXmlAdapter();
const corpus = loadCorpus();

describe('F0 · golden round-trip byte a byte', () => {
  it('el corpus tiene los 10 ficheros esperados', () => {
    expect(corpus).toHaveLength(10);
  });

  it.each(corpus)('$name · parse → serialize es idéntico', ({ name, bytes, xml }) => {
    const doc = adapter.parse(xml);
    const out = adapter.serialize(doc);
    const diff = firstDiff(xml, out);
    expect(diff ? `${name} difiere en ${diff.index}: ${diff.around}` : null).toBeNull();
    expect(Buffer.from(out, 'utf8').equals(bytes)).toBe(true);
  });

  it.each(corpus)('$name · preserva BOM, CRLF y la declaración XML', ({ bytes, xml }) => {
    expect([bytes[0], bytes[1], bytes[2]]).toEqual([0xef, 0xbb, 0xbf]);
    expect(xml).toContain('\r\n');
    expect(xml.slice(1).startsWith('<?xml version="1.0" encoding="utf-8"?>')).toBe(true);
  });

  it.each(corpus)('$name · el segundo round-trip es estable (idempotente)', ({ xml }) => {
    const once = adapter.serialize(adapter.parse(xml));
    const twice = adapter.serialize(adapter.parse(once));
    expect(twice).toBe(once);
  });
});

/* ------------------------- parcheo quirúrgico --------------------------- */

function findDeep(el: XmlElement, tagName: string): XmlElement | undefined {
  if (el.tagName === tagName) return el;
  for (const child of el.children) {
    if (child instanceof XmlElement) {
      const found = findDeep(child, tagName);
      if (found) return found;
    }
  }
  return undefined;
}

describe('F0 · parcheo quirúrgico (solo se toca lo editado)', () => {
  it('cambiar un valor altera exactamente un carácter del XML', () => {
    const { xml } = corpusByName('PalletOutput.rdlc');
    const doc = adapter.parse(xml);
    const xmlDoc = doc as unknown as XmlDocument;

    const top = findDeep(xmlDoc.getRootElement(), 'Top');
    expect(top).toBeDefined();

    const textNode = top!.children.find((c): c is XmlText => c instanceof XmlText);
    expect(textNode).toBeDefined();
    expect(textNode!.text).toMatch(/^\d+(\.\d+)?cm$/);

    const original = textNode!.text;
    const m = /^(.*?)(\d)(cm)$/.exec(original)!;
    const tweaked = `${m[1]}${(Number(m[2]) + 1) % 10}cm`;
    textNode!.setText(tweaked);

    const out = adapter.serialize(doc);

    expect(out.length).toBe(xml.length);
    expect(out).not.toBe(xml);

    let diffs = 0;
    for (let i = 0; i < out.length; i += 1) {
      if (out[i] !== xml[i]) diffs += 1;
    }
    expect(diffs, `se alteraron ${diffs} caracteres, se esperaba 1`).toBe(1);
    expect(out).toContain(tweaked);
  });
});
