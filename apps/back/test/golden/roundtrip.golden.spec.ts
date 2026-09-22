import { describe, expect, it } from 'vitest';
import { DocumentIndex } from '../../src/domain/document/index/DocumentIndex.js';
import { TrueFormatXmlAdapter } from '../../src/infrastructure/rdlc/TrueFormatXmlAdapter.js';
import { corpusByName, firstDiff, loadCorpus } from './fixtures.js';

/**
 * Fase 0 — Gate go/no-go.
 *
 * Parsear y serializar cada fichero del corpus debe devolver los bytes
 * originales, exactos: CRLF, BOM, whitespace, comentarios, comillas y orden de
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

describe('F0 · parcheo quirúrgico (solo se toca lo editado)', () => {
  it('cambiar un valor altera exactamente un carácter del XML', () => {
    const { xml } = corpusByName('PalletOutput.rdlc');
    const doc = adapter.parse(xml);
    const index = DocumentIndex.build(doc.root);

    const target = index
      .names()
      .map((name) => index.get(name))
      .find(
        (node) => node !== undefined && /^\d+(\.\d+)?cm$/.test(node.child('Top')?.text() ?? ''),
      );
    expect(target).toBeDefined();

    const top = target!.child('Top')!;
    const original = top.text()!;
    const match = /^(.*?)(\d)(cm)$/.exec(original)!;
    top.setText(`${match[1]}${(Number(match[2]) + 1) % 10}cm`);

    const out = adapter.serialize(doc);

    expect(out.length).toBe(xml.length);
    expect(out).not.toBe(xml);

    let diffs = 0;
    for (let i = 0; i < out.length; i += 1) {
      if (out[i] !== xml[i]) diffs += 1;
    }
    expect(diffs, `se alteraron ${diffs} caracteres, se esperaba 1`).toBe(1);
  });
});
