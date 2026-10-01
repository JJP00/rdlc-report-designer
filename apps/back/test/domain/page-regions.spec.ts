import { describe, expect, it } from 'vitest';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyCommand } from '../../src/domain/document/commands/applyCommand.js';
import { DocumentIndex } from '../../src/domain/document/index/DocumentIndex.js';
import { TrueFormatProjectionAdapter } from '../../src/infrastructure/rdlc/TrueFormatProjectionAdapter.js';
import { TrueFormatXmlAdapter } from '../../src/infrastructure/rdlc/TrueFormatXmlAdapter.js';
import { LibXml2SchemaValidatorAdapter } from '../../src/infrastructure/validation/LibXml2SchemaValidatorAdapter.js';
import { corpusByName } from '../golden/fixtures.js';
import { undoAll } from './command-test-utils.js';

/**
 * G6 · bandas de página: `setRegionHeight` (encabezado, pie y **cuerpo**) y
 * `setHeaderFooterOptions`; U10 · ancho de sección (`setSectionWidth`).
 *
 * `PalletOutput` no tiene `PageHeader`/`PageFooter` (caso de creación) y
 * `SalesCreditMemoESP` los trae con `PrintOnFirstPage/LastPage` (caso de edición).
 */

const xmlAdapter = new TrueFormatXmlAdapter();
const projectionAdapter = new TrueFormatProjectionAdapter();
const validator = new LibXml2SchemaValidatorAdapter(
  resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../../resources/rdl2016/ReportDefinition2016.xsd',
  ),
);

/** Documento mínimo con un `Body` sin `Height` (caso defensivo de creación). */
const BODY_WITHOUT_HEIGHT_XML = `<?xml version="1.0" encoding="utf-8"?>
<Report xmlns:rd="http://schemas.microsoft.com/SQLServer/reporting/reportdesigner" xmlns="http://schemas.microsoft.com/sqlserver/reporting/2016/01/reportdefinition">
  <ReportSections>
    <ReportSection>
      <Body>
        <ReportItems />
      </Body>
      <Width>15cm</Width>
      <Page>
        <PageHeight>29.7cm</PageHeight>
        <PageWidth>21cm</PageWidth>
      </Page>
    </ReportSection>
  </ReportSections>
</Report>`;

function open(name: string): {
  xml: string;
  doc: ReturnType<TrueFormatXmlAdapter['parse']>;
  index: DocumentIndex;
} {
  const { xml } = corpusByName(name);
  const doc = xmlAdapter.parse(xml);
  return { xml, doc, index: DocumentIndex.build(doc.root) };
}

function openXml(xml: string): {
  doc: ReturnType<TrueFormatXmlAdapter['parse']>;
  index: DocumentIndex;
} {
  const doc = xmlAdapter.parse(xml);
  return { doc, index: DocumentIndex.build(doc.root) };
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

describe('G6/U10 · cuerpo y ancho de sección', () => {
  it('setRegionHeight · body cambia el alto del cuerpo (proyección incluida) y el undo es exacto', () => {
    const { xml, doc, index } = open('SalesCreditMemoESP.rdlc');

    const applied = applyCommand(
      { root: doc.root, index },
      { cmd: 'setRegionHeight', region: 'body', height: { value: 12, unit: 'cm' } },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    const output = xmlAdapter.serialize(doc);
    const body = output.slice(output.indexOf('<Body>'), output.indexOf('</Body>'));
    expect(body).toContain('<Height>12cm</Height>');
    // El `Height` va después de los items (orden canónico del cuerpo).
    if (body.includes('<ReportItems>')) {
      expect(body.indexOf('<Height>')).toBeGreaterThan(body.indexOf('<ReportItems>'));
    }

    const projected = projectionAdapter.project({
      sessionId: 'test',
      filePath: 'SalesCreditMemoESP.rdlc',
      document: doc,
      version: 2,
    });
    expect(projected.page.body.height).toEqual({ value: 12, unit: 'cm' });

    const problems = validator.validate(output).problems;
    expect(problems, problems.join(' | ')).toEqual([]);

    const undone = undoAll({ root: doc.root, index }, applied.value);
    expect(undone.isRight()).toBe(true);
    expect(xmlAdapter.serialize(doc)).toBe(xml);
  });

  it('setRegionHeight · body crea el Height si falta y el undo lo quita', () => {
    const { doc, index } = openXml(BODY_WITHOUT_HEIGHT_XML);

    const applied = applyCommand(
      { root: doc.root, index },
      { cmd: 'setRegionHeight', region: 'body', height: { value: 5, unit: 'cm' } },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    const output = xmlAdapter.serialize(doc);
    const body = output.slice(output.indexOf('<Body>'), output.indexOf('</Body>'));
    expect(body).toContain('<Height>5cm</Height>');
    expect(body.indexOf('<Height>')).toBeGreaterThan(body.indexOf('<ReportItems>'));

    const undone = undoAll({ root: doc.root, index }, applied.value);
    expect(undone.isRight()).toBe(true);
    expect(xmlAdapter.serialize(doc)).toBe(BODY_WITHOUT_HEIGHT_XML);
  });

  it('setSectionWidth cambia el ancho de la sección y el undo es byte-exacto', () => {
    const { xml, doc, index } = open('SalesCreditMemoESP.rdlc');
    // La sección actual: 19cm (manda en el ancho de las tres bandas).
    expect(xml.slice(xml.indexOf('</Body>'))).toContain('<Width>19cm</Width>');

    const applied = applyCommand(
      { root: doc.root, index },
      { cmd: 'setSectionWidth', width: { value: 15, unit: 'cm' } },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    const output = xmlAdapter.serialize(doc);
    // El `Width` de la sección (tras `</Body>`), no los de los items.
    const section = output.slice(output.indexOf('</Body>'));
    expect(section).toContain('<Width>15cm</Width>');

    const projected = projectionAdapter.project({
      sessionId: 'test',
      filePath: 'SalesCreditMemoESP.rdlc',
      document: doc,
      version: 2,
    });
    expect(projected.page.body.width).toEqual({ value: 15, unit: 'cm' });
    expect(projected.page.header.width).toEqual({ value: 15, unit: 'cm' });
    expect(projected.page.footer.width).toEqual({ value: 15, unit: 'cm' });

    const problems = validator.validate(output).problems;
    expect(problems, problems.join(' | ')).toEqual([]);

    const undone = undoAll({ root: doc.root, index }, applied.value);
    expect(undone.isRight()).toBe(true);
    expect(xmlAdapter.serialize(doc)).toBe(xml);
  });
});
