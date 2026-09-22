import { describe, expect, it } from 'vitest';
import { undoAll } from './command-test-utils.js';
import { applyCommand } from '../../src/domain/document/commands/applyCommand.js';
import { DocumentIndex } from '../../src/domain/document/index/DocumentIndex.js';
import { TrueFormatProjectionAdapter } from '../../src/infrastructure/rdlc/TrueFormatProjectionAdapter.js';
import { TrueFormatXmlAdapter } from '../../src/infrastructure/rdlc/TrueFormatXmlAdapter.js';
import { corpusByName } from '../golden/fixtures.js';

/** F1 — comandos de página y de informe (Configurar página / Código VB). */

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

describe('F1 · setPageSize', () => {
  it('cambia el tamaño de página y la inversa restaura los bytes exactos', () => {
    const { xml, doc, index } = open('SalesInvoiceESP.rdlc');

    const applied = applyCommand(
      { root: doc.root, index },
      {
        cmd: 'setPageSize',
        width: { value: 21.59, unit: 'cm' },
        height: { value: 27.94, unit: 'cm' },
      },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    const output = adapter.serialize(doc);
    expect(output).toContain('<PageWidth>21.59cm</PageWidth>');
    expect(output).toContain('<PageHeight>27.94cm</PageHeight>');

    const undone = undoAll({ root: doc.root, index }, applied.value);
    expect(undone.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(xml);
  });

  it('crea PageWidth/PageHeight si el <Page> no los trae (PalletOutput) y se ve en la proyección', () => {
    const { doc, index } = open('PalletOutput.rdlc');
    const page = doc.root.child('ReportSections')?.child('ReportSection')?.child('Page');
    expect(page).toBeDefined();
    expect(page?.child('PageWidth')).toBeUndefined();

    const applied = applyCommand(
      { root: doc.root, index },
      { cmd: 'setPageSize', width: { value: 21, unit: 'cm' }, height: { value: 29.7, unit: 'cm' } },
    );
    expect(applied.isRight()).toBe(true);

    const output = adapter.serialize(doc);
    expect(output).toContain('<PageWidth>21cm</PageWidth>');
    expect(output).toContain('<PageHeight>29.7cm</PageHeight>');

    const projection = new TrueFormatProjectionAdapter().project({
      sessionId: 'test',
      filePath: 'PalletOutput.rdlc',
      document: doc,
      version: 1,
    });
    expect(projection.page.width.value).toBeCloseTo(21, 3);
    expect(projection.page.height.value).toBeCloseTo(29.7, 3);
  });
});

describe('F1 · setPageMargins', () => {
  it('cambia los márgenes y la inversa restaura los bytes exactos', () => {
    const { xml, doc, index } = open('SalesShipment.rdlc');

    const applied = applyCommand(
      { root: doc.root, index },
      {
        cmd: 'setPageMargins',
        top: { value: 1.5, unit: 'cm' },
        bottom: { value: 1.5, unit: 'cm' },
        left: { value: 1, unit: 'cm' },
        right: { value: 1, unit: 'cm' },
      },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    const output = adapter.serialize(doc);
    expect(output).toContain('<TopMargin>1.5cm</TopMargin>');
    expect(output).toContain('<LeftMargin>1cm</LeftMargin>');

    const undone = undoAll({ root: doc.root, index }, applied.value);
    expect(undone.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(xml);
  });
});

describe('F1 · setReportCode', () => {
  it('reemplaza el bloque VB y la inversa restaura los bytes exactos', () => {
    const { xml, doc, index } = open('PalletOutput.rdlc');

    const currentCode = doc.root.child('Code')?.text() ?? '';
    expect(currentCode.length).toBeGreaterThan(0);

    const newCode = `${currentCode}\nPublic Function Doble(ByVal Value As Integer) As Integer\n    Return Value * 2\nEnd Function`;
    const applied = applyCommand(
      { root: doc.root, index },
      { cmd: 'setReportCode', code: newCode },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    expect(adapter.serialize(doc)).toContain('Doble');

    const undone = undoAll({ root: doc.root, index }, applied.value);
    expect(undone.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(xml);
  });

  it('no toca el resto del documento (solo el bloque <Code>)', () => {
    const { xml, doc, index } = open('PalletOutput.rdlc');
    const applied = applyCommand({ root: doc.root, index }, { cmd: 'setReportCode', code: 'x' });
    expect(applied.isRight()).toBe(true);

    const output = adapter.serialize(doc);
    expect(output).toContain('<Code>x</Code>');
    expect(output.length).toBeLessThan(xml.length);
  });

  it('vaciar el código quita el bloque <Code> y el undo lo restaura byte a byte', () => {
    const { xml, doc, index } = open('PalletOutput.rdlc');

    const applied = applyCommand({ root: doc.root, index }, { cmd: 'setReportCode', code: '   ' });
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    expect(adapter.serialize(doc)).not.toContain('<Code>');

    const undone = undoAll({ root: doc.root, index }, applied.value);
    expect(undone.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(xml);
  });

  it('en un informe sin <Code>, vaciar no crea un bloque vacío', () => {
    // Informe mínimo sin bloque de código (los del corpus lo traen todos).
    const minimal =
      '<Report xmlns:rd="http://schemas.microsoft.com/SQLServer/reporting/reportdesigner">' +
      '<ReportSections><ReportSection><Body><ReportItems /></Body></ReportSection></ReportSections>' +
      '</Report>';
    const doc = adapter.parse(minimal);
    const index = DocumentIndex.build(doc.root);
    expect(doc.root.child('Code')).toBeUndefined();

    const applied = applyCommand({ root: doc.root, index }, { cmd: 'setReportCode', code: '  ' });
    expect(applied.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(minimal);
  });

  it('crear el bloque desde cero: el undo no deja un <Code> vacío', () => {
    // Informe mínimo sin bloque de código.
    const minimal =
      '<Report xmlns:rd="http://schemas.microsoft.com/SQLServer/reporting/reportdesigner">' +
      '<ReportSections><ReportSection><Body><ReportItems /></Body></ReportSection></ReportSections>' +
      '</Report>';
    const doc = adapter.parse(minimal);
    const index = DocumentIndex.build(doc.root);

    const applied = applyCommand(
      { root: doc.root, index },
      { cmd: 'setReportCode', code: 'Sub Hola()\nEnd Sub' },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;
    expect(adapter.serialize(doc)).toContain('<Code>Sub Hola()');

    const undone = undoAll({ root: doc.root, index }, applied.value);
    expect(undone.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(minimal);
  });
});

describe('F1 · límites tras cambiar la página', () => {
  it('el índice reconstruido sigue viendo la región (el tamaño de página no la cambia)', () => {
    const { doc, index } = open('PalletOutput.rdlc');

    applyCommand(
      { root: doc.root, index },
      { cmd: 'setPageSize', width: { value: 21, unit: 'cm' }, height: { value: 29.7, unit: 'cm' } },
    );

    const rebuilt = DocumentIndex.build(doc.root);
    expect(rebuilt.size).toBe(index.size);
    expect(rebuilt.bounds().body.width.value).toBeCloseTo(index.bounds().body.width.value, 6);
  });
});
