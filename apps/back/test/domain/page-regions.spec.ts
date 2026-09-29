import { describe, expect, it } from 'vitest';
import { applyCommand } from '../../src/domain/document/commands/applyCommand.js';
import { DocumentIndex } from '../../src/domain/document/index/DocumentIndex.js';
import { TrueFormatProjectionAdapter } from '../../src/infrastructure/rdlc/TrueFormatProjectionAdapter.js';
import { TrueFormatXmlAdapter } from '../../src/infrastructure/rdlc/TrueFormatXmlAdapter.js';
import { corpusByName } from '../golden/fixtures.js';
import { undoAll } from './command-test-utils.js';

/**
 * G6 · bandas de página: `setRegionHeight` y `setHeaderFooterOptions`.
 *
 * `PalletOutput` no tiene `PageHeader`/`PageFooter` (caso de creación) y
 * `SalesCreditMemoESP` los trae con `PrintOnFirstPage/LastPage` (caso de edición).
 */

const xmlAdapter = new TrueFormatXmlAdapter();
const projectionAdapter = new TrueFormatProjectionAdapter();

function open(name: string): {
  xml: string;
  doc: ReturnType<TrueFormatXmlAdapter['parse']>;
  index: DocumentIndex;
} {
  const { xml } = corpusByName(name);
  const doc = xmlAdapter.parse(xml);
  return { xml, doc, index: DocumentIndex.build(doc.root) };
}

describe('G6 · bandas de página', () => {
  it('setRegionHeight cambia el alto del encabezado y el undo es byte-exacto', () => {
    const { xml, doc, index } = open('SalesCreditMemoESP.rdlc');

    const applied = applyCommand(
      { root: doc.root, index },
      { cmd: 'setRegionHeight', region: 'pageHeader', height: { value: 4, unit: 'cm' } },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    const output = xmlAdapter.serialize(doc);
    expect(output).toContain('<PageHeader>');
    const header = output.slice(output.indexOf('<PageHeader>'), output.indexOf('</PageHeader>'));
    expect(header).toContain('<Height>4cm</Height>');

    const undone = undoAll({ root: doc.root, index }, applied.value);
    expect(undone.isRight()).toBe(true);
    expect(xmlAdapter.serialize(doc)).toBe(xml);
  });

  it('setRegionHeight crea el PageHeader si falta y el undo lo quita', () => {
    const { xml, doc, index } = open('PalletOutput.rdlc');

    const applied = applyCommand(
      { root: doc.root, index },
      { cmd: 'setRegionHeight', region: 'pageHeader', height: { value: 2.5, unit: 'cm' } },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    const output = xmlAdapter.serialize(doc);
    expect(output).toContain('<PageHeader>');
    expect(output).toContain('<Height>2.5cm</Height>');
    // El `Height` va antes de `ReportItems` (orden canónico de la banda).
    const header = output.slice(output.indexOf('<PageHeader>'), output.indexOf('</PageHeader>'));
    if (header.includes('<ReportItems>')) {
      expect(header.indexOf('<Height>')).toBeLessThan(header.indexOf('<ReportItems>'));
    }

    const undone = undoAll({ root: doc.root, index }, applied.value);
    expect(undone.isRight()).toBe(true);
    expect(xmlAdapter.serialize(doc)).toBe(xml);
  });

  it('setHeaderFooterOptions escribe los flags y el undo es byte-exacto', () => {
    const { xml, doc, index } = open('SalesCreditMemoESP.rdlc');

    const applied = applyCommand(
      { root: doc.root, index },
      {
        cmd: 'setHeaderFooterOptions',
        region: 'pageFooter',
        printOnFirstPage: false,
        printOnLastPage: true,
      },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;
    expect(applied.value.snapshotOut).toBe(true);

    const output = xmlAdapter.serialize(doc);
    const footer = output.slice(output.indexOf('<PageFooter>'), output.indexOf('</PageFooter>'));
    expect(footer).toContain('<PrintOnFirstPage>false</PrintOnFirstPage>');
    expect(footer).toContain('<PrintOnLastPage>true</PrintOnLastPage>');
    expect(footer.indexOf('<PrintOnFirstPage>')).toBeLessThan(footer.indexOf('<PrintOnLastPage>'));

    const undone = undoAll({ root: doc.root, index }, applied.value);
    expect(undone.isRight()).toBe(true);
    expect(xmlAdapter.serialize(doc)).toBe(xml);
  });

  it('la proyección lee los flags (y los deja ausentes si no existen)', () => {
    const withFlags = projectionAdapter.project({
      sessionId: 'test',
      filePath: 'SalesCreditMemoESP.rdlc',
      document: xmlAdapter.parse(corpusByName('SalesCreditMemoESP.rdlc').xml),
      version: 1,
    });
    expect(withFlags.page.header.printOnFirstPage).toBe(true);
    expect(withFlags.page.footer.printOnLastPage).toBe(true);

    const withoutFlags = projectionAdapter.project({
      sessionId: 'test',
      filePath: 'PalletOutput.rdlc',
      document: xmlAdapter.parse(corpusByName('PalletOutput.rdlc').xml),
      version: 1,
    });
    expect(withoutFlags.page.header.printOnFirstPage).toBeUndefined();
    expect(withoutFlags.page.footer.printOnLastPage).toBeUndefined();
  });
});
