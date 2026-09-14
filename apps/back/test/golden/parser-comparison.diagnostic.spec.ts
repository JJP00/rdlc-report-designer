import { describe, expect, it } from 'vitest';
import { FastXmlAdapter } from '../../src/infrastructure/rdlc/FastXmlAdapter.js';
import { TrueFormatXmlAdapter } from '../../src/infrastructure/rdlc/TrueFormatXmlAdapter.js';
import { loadCorpus } from './fixtures.js';

/**
 * F0 — Comparativa empírica de candidatos a parser lossless.
 *
 * Este test no valida el producto: genera la evidencia del ADR
 * `docs/adr/0001-parser-xml-lossless.md`. El criterio de aceptación
 * (10/10 byte-idénticos) se exige al adaptador elegido.
 */

const corpus = loadCorpus();

interface Codec {
  name: string;
  roundTrip(xml: string): string;
}

const trueFormat = new TrueFormatXmlAdapter();
const fastXml = new FastXmlAdapter();
const codecs: Codec[] = [
  { name: trueFormat.name, roundTrip: (xml) => trueFormat.serialize(trueFormat.parse(xml)) },
  { name: fastXml.name, roundTrip: (xml) => fastXml.roundTrip(xml) },
];

describe('F0 · comparativa de adaptadores (evidencia ADR)', () => {
  it('mide el round-trip byte a byte de cada candidato', () => {
    const rows: string[] = [];
    const scores = new Map<string, number>();

    for (const codec of codecs) {
      let ok = 0;
      for (const { name, bytes, xml } of corpus) {
        try {
          const out = codec.roundTrip(xml);
          const identical = Buffer.from(out, 'utf8').equals(bytes);
          if (identical) ok += 1;
          rows.push(
            `${codec.name.padEnd(18)} ${name.padEnd(26)} ${identical ? 'OK' : 'FAIL'} (${bytes.length} bytes)`,
          );
        } catch (err) {
          rows.push(
            `${codec.name.padEnd(18)} ${name.padEnd(26)} ERROR: ${(err as Error).message}`,
          );
        }
      }
      scores.set(codec.name, ok);
    }

    // eslint-disable-next-line no-console
    console.log(`\nRound-trip byte a byte sobre ${corpus.length} ficheros:\n${rows.join('\n')}\n`);

    expect(scores.get('xml-trueformat')).toBe(corpus.length);
  });

  it('mide tiempos de parseo y serialización (presupuesto: parse < 2 s)', () => {
    const adapter = new TrueFormatXmlAdapter();
    const rows: string[] = [];

    for (const { name, bytes, xml } of corpus) {
      const t0 = performance.now();
      const doc = adapter.parse(xml);
      const parseMs = performance.now() - t0;

      const t1 = performance.now();
      const out = adapter.serialize(doc);
      const serializeMs = performance.now() - t1;

      expect(Buffer.from(out, 'utf8').equals(bytes)).toBe(true);
      expect(parseMs, `${name} tardó ${parseMs.toFixed(1)} ms en parsear`).toBeLessThan(2000);

      rows.push(
        `${name.padEnd(26)} ${String(bytes.length).padStart(7)} bytes  parse ${parseMs
          .toFixed(1)
          .padStart(7)} ms  serialize ${serializeMs.toFixed(1).padStart(7)} ms`,
      );
    }

    // eslint-disable-next-line no-console
    console.log(`\nTiempos xml-trueformat:\n${rows.join('\n')}\n`);
  });

  it('mide memoria retenida con los 10 documentos en memoria', () => {
    const gc = (globalThis as { gc?: () => void }).gc;
    if (!gc) {
      // eslint-disable-next-line no-console
      console.log('\nMemoria: gc no disponible (ejecutar con --expose-gc); medición omitida\n');
      return;
    }

    const adapter = new TrueFormatXmlAdapter();
    gc();
    const before = process.memoryUsage().heapUsed;
    const docs = corpus.map(({ xml }) => adapter.parse(xml));
    gc();
    const retained = process.memoryUsage().heapUsed - before;

    const totalMb = retained / 1024 / 1024;
    const corpusBytes = corpus.reduce((acc, f) => acc + f.bytes.length, 0);

    // eslint-disable-next-line no-console
    console.log(
      `\nMemoria retenida: ${totalMb.toFixed(1)} MB para ${(corpusBytes / 1024 / 1024).toFixed(
        2,
      )} MB de XML (${(retained / corpusBytes).toFixed(1)}× los bytes de origen)\n`,
    );

    expect(docs).toHaveLength(corpus.length);
    expect(retained).toBeGreaterThan(0);
  });
});
