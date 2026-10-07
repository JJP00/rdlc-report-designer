import { describe, expect, it } from 'vitest';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyCommand } from '../../src/domain/document/commands/applyCommand.js';
import { DocumentIndex } from '../../src/domain/document/index/DocumentIndex.js';
import { TrueFormatXmlAdapter } from '../../src/infrastructure/rdlc/TrueFormatXmlAdapter.js';
import { LibXml2SchemaValidatorAdapter } from '../../src/infrastructure/validation/LibXml2SchemaValidatorAdapter.js';
import { corpusByName } from '../golden/fixtures.js';
import { appliedOf, undoAll } from './command-test-utils.js';

/** F1 — estilo del item (`setStyle`): fuente, colores, alineación, viñetas. */

const adapter = new TrueFormatXmlAdapter();
const validator = new LibXml2SchemaValidatorAdapter(
  resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../../resources/rdl2016/ReportDefinition2016.xsd',
  ),
);

function open(name: string): {
  xml: string;
  doc: ReturnType<TrueFormatXmlAdapter['parse']>;
  index: DocumentIndex;
} {
  const { xml } = corpusByName(name);
  const doc = adapter.parse(xml);
  return { xml, doc, index: DocumentIndex.build(doc.root) };
}

/** XML del item `name` (del `Name="…"` a su cierre), para asertar solo lo suyo. */
function itemSlice(xml: string, name: string): string {
  const at = xml.indexOf(`Name="${name}"`);
  if (at === -1) throw new Error(`No está '${name}' en el XML`);
  const end = xml.indexOf('</Textbox>', at);
  return xml.slice(at, end === -1 ? at + 6000 : end);
}

describe('F1 · setStyle', () => {
  it('escribe fuente/tamaño/negrita en orden canónico y el undo restaura bytes', () => {
    const { xml, doc, index } = open('PalletOutput.rdlc');

    const applied = applyCommand(
      { root: doc.root, index },
      {
        cmd: 'setStyle',
        id: 'Textbox25',
        style: {
          fontFamily: 'Arial',
          fontSize: { value: 12, unit: 'pt' },
          fontWeight: 'Bold',
          textAlign: 'Center',
        },
      },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    const output = adapter.serialize(doc);
    expect(output).toContain('<FontFamily>Arial</FontFamily>');
    expect(output).toContain('<FontSize>12pt</FontSize>');
    expect(output).toContain('<FontWeight>Bold</FontWeight>');

    // Orden canónico dentro de <Style>: FontFamily < FontSize < FontWeight.
    const styleStart = output.indexOf('<FontFamily>Arial</FontFamily>');
    expect(styleStart).toBeGreaterThan(0);
    expect(output.indexOf('<FontSize>12pt</FontSize>')).toBeGreaterThan(styleStart);
    expect(output.indexOf('<FontWeight>Bold</FontWeight>')).toBeGreaterThan(
      output.indexOf('<FontSize>12pt</FontSize>'),
    );

    // `applied` lleva el estilo completo para reconciliar el front.
    expect(appliedOf(applied.value, 'Textbox25')).toMatchObject({
      style: { fontFamily: 'Arial', fontWeight: 'Bold' },
    });

    const undone = undoAll({ root: doc.root, index }, applied.value);
    expect(undone.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(xml);
  });

  it('respeta el estilo existente del item (no lo pisa)', () => {
    const { doc, index } = open('SalesInvoiceESP.rdlc');

    // Textbox23 ya tiene VerticalAlign=Bottom y padding.
    const applied = applyCommand(
      { root: doc.root, index },
      { cmd: 'setStyle', id: 'Textbox23', style: { fontStyle: 'Italic' } },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    const output = adapter.serialize(doc);
    expect(output).toContain('<FontStyle>Italic</FontStyle>');
    expect(output).toContain('<VerticalAlign>Bottom</VerticalAlign>');
    expect(output).toContain('<PaddingLeft>2pt</PaddingLeft>');
  });

  it('no escribe en un campo de DataSet con el mismo nombre (colisión)', () => {
    const { xml, doc, index } = open('SalesInvoiceESP.rdlc');

    // `Description_Line` es a la vez un Textbox (con padding 5pt) y un campo del
    // DataSet, que va al final del documento. El índice no debe dejar que el
    // campo pise al item: el parche de estilo tiene que ir al Textbox.
    expect(index.get('Description_Line')?.tagName).toBe('Textbox');

    const applied = applyCommand(
      { root: doc.root, index },
      {
        cmd: 'setStyle',
        id: 'Description_Line',
        style: { border: { top: { style: 'Solid', color: '#123456' } } },
      },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    const output = adapter.serialize(doc);
    const textbox = itemSlice(output, 'Description_Line');
    expect(textbox).toContain('<Color>#123456</Color>');
    // El padding del textbox no se toca…
    expect(textbox).toContain('<PaddingLeft>5pt</PaddingLeft>');
    expect(textbox).toContain('<PaddingRight>5pt</PaddingRight>');
    // …y el campo homónimo del DataSet se queda sin `<Style>`.
    const field = output.slice(output.indexOf('<Field Name="Description_Line">'));
    expect(field.slice(0, field.indexOf('</Field>'))).not.toContain('<Style>');

    // `applied` lleva el estilo real del item (con el padding) para el front.
    expect(appliedOf(applied.value, 'Description_Line')).toMatchObject({
      style: {
        padding: { left: { value: 5, unit: 'pt' }, right: { value: 5, unit: 'pt' } },
        border: { top: { style: 'Solid', color: '#123456' } },
      },
    });

    const undone = undoAll({ root: doc.root, index }, applied.value);
    expect(undone.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(xml);
  });

  it('aplica y revierte viñetas (ListStyle)', () => {
    const { xml, doc, index } = open('PalletOutput.rdlc');

    const applied = applyCommand(
      { root: doc.root, index },
      { cmd: 'setStyle', id: 'Textbox25', style: { listStyle: 'Bulleted' } },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;
    expect(adapter.serialize(doc)).toContain('<ListStyle>Bulleted</ListStyle>');

    const undone = undoAll({ root: doc.root, index }, applied.value);
    expect(undone.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(xml);
  });

  it('la inversa devuelve el valor anterior (no borra el nodo)', () => {
    const { doc, index } = open('PalletOutput.rdlc');

    const first = applyCommand(
      { root: doc.root, index },
      { cmd: 'setStyle', id: 'Textbox25', style: { color: '#FF0000' } },
    );
    expect(first.isRight()).toBe(true);
    if (!first.isRight()) return;

    const second = applyCommand(
      { root: doc.root, index },
      { cmd: 'setStyle', id: 'Textbox25', style: { color: '#00FF00' } },
    );
    expect(second.isRight()).toBe(true);
    if (!second.isRight()) return;

    // Deshacer el segundo comando devuelve '#FF0000'.
    undoAll({ root: doc.root, index }, second.value);
    expect(adapter.serialize(doc)).toContain('<Color>#FF0000</Color>');

    // Y deshacer el primero quita el nodo (inverso sin valor previo = comando con {}).
    undoAll({ root: doc.root, index }, first.value);
    expect(adapter.serialize(doc)).not.toContain('#FF0000');
  });

  it('aplica padding anidado (contrato) y el undo restaura bytes', () => {
    const { xml, doc, index } = open('SalesInvoiceESP.rdlc');

    // Textbox23 ya tiene padding por lados: se toca solo `left`.
    const applied = applyCommand(
      { root: doc.root, index },
      { cmd: 'setStyle', id: 'Textbox23', style: { padding: { left: { value: 7, unit: 'pt' } } } },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    const output = adapter.serialize(doc);
    expect(output).toContain('<PaddingLeft>7pt</PaddingLeft>');
    // El resto del padding no se pierde en la ida (ni en `applied`).
    expect(appliedOf(applied.value, 'Textbox23')).toMatchObject({
      style: { padding: { left: { value: 7, unit: 'pt' } } },
    });

    const undone = undoAll({ root: doc.root, index }, applied.value);
    expect(undone.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(xml);
  });

  it('crea el <Style> y todos los lados del padding si no existen (imagen nueva)', () => {
    const { doc, index } = open('PalletOutput.rdlc');

    // Imagen recién insertada: nace sin <Style>, así que el padding lo crea.
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
    const afterInsert = adapter.serialize(doc);

    const applied = applyCommand(
      { root: doc.root, index: DocumentIndex.build(doc.root) },
      {
        cmd: 'setStyle',
        id: 'ImagenNueva',
        style: {
          padding: {
            top: { value: 1, unit: 'pt' },
            left: { value: 2, unit: 'pt' },
            bottom: { value: 3, unit: 'pt' },
            right: { value: 4, unit: 'pt' },
          },
        },
      },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    const output = adapter.serialize(doc);
    expect(output).toContain('<PaddingTop>1pt</PaddingTop>');
    expect(output).toContain('<PaddingLeft>2pt</PaddingLeft>');
    expect(output).toContain('<PaddingBottom>3pt</PaddingBottom>');
    expect(output).toContain('<PaddingRight>4pt</PaddingRight>');

    // El undo devuelve el XML al estado justo después de insertar.
    const undone = undoAll({ root: doc.root, index: DocumentIndex.build(doc.root) }, applied.value);
    expect(undone.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(afterInsert);
  });

  it('`padding: null` quita los cuatro lados y el undo los restaura', () => {
    const { xml, doc, index } = open('SalesInvoiceESP.rdlc');

    const applied = applyCommand(
      { root: doc.root, index },
      { cmd: 'setStyle', id: 'Textbox23', style: { padding: null } },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;
    expect(itemSlice(adapter.serialize(doc), 'Textbox23')).not.toContain('<Padding');

    const undone = undoAll({ root: doc.root, index }, applied.value);
    expect(undone.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(xml);
  });

  it('escribe ListStyle como hijo de Paragraph (no de Style) y valida el XSD', () => {
    const { xml, doc, index } = open('PalletOutput.rdlc');

    const applied = applyCommand(
      { root: doc.root, index },
      { cmd: 'setStyle', id: 'Textbox25', style: { listStyle: 'Bulleted' } },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    const output = adapter.serialize(doc);
    const textbox = itemSlice(output, 'Textbox25');
    expect(textbox).toContain('<ListStyle>Bulleted</ListStyle>');
    // Nunca dentro de un `<Style>`: el XSD no lo admite y el guardado se bloquea.
    expect(textbox).not.toMatch(/<Style>\s*<ListStyle>/);
    // El front necesita la proyección nueva (los párrafos no viajan en `applied`).
    expect(applied.value.snapshotOut).toBe(true);

    const problems = validator.validate(output).problems;
    expect(problems, problems.join(' | ')).toEqual([]);

    const undone = undoAll({ root: doc.root, index }, applied.value);
    expect(undone.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(xml);
  });

  it('replica las fuentes en los runs (BC/RB las resuelven ahí)', () => {
    const source = `<?xml version="1.0" encoding="utf-8"?>
<Report xmlns="http://schemas.microsoft.com/sqlserver/reporting/2016/01/reportdefinition">
  <ReportSections>
    <ReportSection>
      <Body>
        <ReportItems>
          <Textbox Name="T">
            <Paragraphs>
              <Paragraph><TextRuns><TextRun><Value>x</Value></TextRun></TextRuns></Paragraph>
            </Paragraphs>
          </Textbox>
        </ReportItems>
      </Body>
    </ReportSection>
  </ReportSections>
</Report>`;
    const doc = adapter.parse(source);
    const index = DocumentIndex.build(doc.root);

    const applied = applyCommand(
      { root: doc.root, index },
      {
        cmd: 'setStyle',
        id: 'T',
        style: { fontSize: { value: 7, unit: 'pt' }, fontWeight: 'Bold' },
      },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    const output = adapter.serialize(doc);
    // Item + run: BC escribe la fuente en el run; solo con la del item, RB
    // muestra el Arial 10 por defecto.
    expect(output.match(/<FontSize>7pt<\/FontSize>/g)).toHaveLength(2);
    expect(output.match(/<FontWeight>Bold<\/FontWeight>/g)).toHaveLength(2);
    const problems = validator.validate(output).problems;
    expect(problems, problems.join(' | ')).toEqual([]);

    const undone = undoAll({ root: doc.root, index }, applied.value);
    expect(undone.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(source);
  });

  it('limpia un ListStyle legado dentro de <Style> (fichero de versiones anteriores)', () => {
    const source = `<?xml version="1.0" encoding="utf-8"?>
<Report xmlns="http://schemas.microsoft.com/sqlserver/reporting/2016/01/reportdefinition">
  <ReportSections>
    <ReportSection>
      <Body>
        <ReportItems>
          <Textbox Name="T">
            <Paragraphs>
              <Paragraph>
                <TextRuns><TextRun><Value>x</Value></TextRun></TextRuns>
                <Style><ListStyle>None</ListStyle></Style>
              </Paragraph>
            </Paragraphs>
          </Textbox>
        </ReportItems>
      </Body>
      </ReportSection>
  </ReportSections>
</Report>`;
    const doc = adapter.parse(source);
    const index = DocumentIndex.build(doc.root);

    const applied = applyCommand(
      { root: doc.root, index },
      { cmd: 'setStyle', id: 'T', style: { listStyle: 'Numbered' } },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    const output = adapter.serialize(doc);
    expect(output).not.toMatch(/<Style>\s*<ListStyle>/);
    expect(output).toContain('<ListStyle>Numbered</ListStyle>');
    const problems = validator.validate(output).problems;
    expect(problems, problems.join(' | ')).toEqual([]);

    const undone = undoAll({ root: doc.root, index }, applied.value);
    expect(undone.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(source);
  });

  // Los bordes por lado (G2) viven en `border-commands.spec.ts`.
});

describe('F1 · setStyle · precedencia run > párrafo > item', () => {
  /**
   * `Textbox28` de PalletOutput: el tamaño vive en el *run*
   * (`<FontSize>12pt</FontSize>`), no en el item. Escribir en el item no basta:
   * hay que sincronizar el run o BC seguiría renderizando lo de antes.
   */
  it('sincroniza el override del run con el valor del item', () => {
    const { xml, doc, index } = open('PalletOutput.rdlc');

    const applied = applyCommand(
      { root: doc.root, index },
      { cmd: 'setStyle', id: 'Textbox28', style: { fontSize: { value: 14, unit: 'pt' } } },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    const textbox = itemSlice(adapter.serialize(doc), 'Textbox28');
    expect(textbox).not.toContain('<FontSize>12pt</FontSize>');
    expect(textbox).toContain('<FontSize>14pt</FontSize>');
    // 3 runs + el estilo del item (el valor del item manda en los cuatro).
    expect(textbox.match(/<FontSize>14pt<\/FontSize>/g)).toHaveLength(4);

    // El front necesita proyección nueva: hay overrides que `applied` no expresa.
    expect(applied.value.snapshotOut).toBe(true);

    const undone = undoAll({ root: doc.root, index }, applied.value);
    expect(undone.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(xml);
  });

  it('sincroniza el override del párrafo (TextAlign) con el valor del item', () => {
    const { xml, doc, index } = open('PalletOutput.rdlc');

    // Textbox25 tiene <TextAlign>Center</TextAlign> en el párrafo.
    const applied = applyCommand(
      { root: doc.root, index },
      { cmd: 'setStyle', id: 'Textbox25', style: { textAlign: 'Right' } },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    const textbox = itemSlice(adapter.serialize(doc), 'Textbox25');
    expect(textbox).not.toContain('<TextAlign>Center</TextAlign>');
    expect(textbox).toContain('<TextAlign>Right</TextAlign>');
    expect(textbox.match(/<TextAlign>Right<\/TextAlign>/g)).toHaveLength(2);

    const undone = undoAll({ root: doc.root, index }, applied.value);
    expect(undone.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(xml);
  });

  it('no toca los overrides cuando no se escribe esa propiedad', () => {
    const { doc, index } = open('PalletOutput.rdlc');

    const applied = applyCommand(
      { root: doc.root, index },
      { cmd: 'setStyle', id: 'Textbox28', style: { color: '#FF0000' } },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    const textbox = itemSlice(adapter.serialize(doc), 'Textbox28');
    // El tamaño de los runs no se toca…
    expect(textbox.match(/<FontSize>12pt<\/FontSize>/g)).toHaveLength(3);
    // …pero el color sí se replica en los runs (RB lo resuelve ahí) → snapshot.
    expect(textbox.match(/<Color>#FF0000<\/Color>/g)).toHaveLength(4);
    expect(applied.value.snapshotOut).toBe(true);
  });
});
