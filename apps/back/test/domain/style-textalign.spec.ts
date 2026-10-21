import { describe, expect, it } from 'vitest';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ProjectionDto, TextboxDto } from '@rdlc-designer/contracts';
import { applyCommand } from '../../src/domain/document/commands/applyCommand.js';
import { DocumentIndex } from '../../src/domain/document/index/DocumentIndex.js';
import { TrueFormatProjectionAdapter } from '../../src/infrastructure/rdlc/TrueFormatProjectionAdapter.js';
import { TrueFormatXmlAdapter } from '../../src/infrastructure/rdlc/TrueFormatXmlAdapter.js';
import { LibXml2SchemaValidatorAdapter } from '../../src/infrastructure/validation/LibXml2SchemaValidatorAdapter.js';
import { corpusByName, loadCorpus } from '../golden/fixtures.js';
import { appliedOf, undoAll } from './command-test-utils.js';

/**
 * `TextAlign` de un textbox (BC lo escribe y **solo lo lee** en el `<Style>` de
 * cada `<Paragraph>`; en el del item lo ignora — verificado con `CartaCMR.rdlc`:
 * `TextBoxPrueba` solo lo tenía en el item y no se alineaba).
 *
 * El comando escribe la alineación en **todos** los párrafos, creando su
 * `<Style>` si falta; un `<TextAlign>` legado en el item se sincroniza con el
 * de los párrafos y `null` lo quita de los tres sitios. Todo con undo
 * byte-exacto (los nodos borrados se reinsertan en su índice prístino).
 */

const adapter = new TrueFormatXmlAdapter();
const projectionAdapter = new TrueFormatProjectionAdapter();
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
  const at = xml.indexOf(`<Textbox Name="${name}">`);
  if (at === -1) throw new Error(`No está '${name}' en el XML`);
  const end = xml.indexOf('</Textbox>', at);
  return xml.slice(at, end === -1 ? at + 8000 : end);
}

/** Raba del textbox desde su último `</Paragraphs>`: nombre, geometría y `<Style>` propio. */
function itemTailOf(xml: string, name: string): string {
  const textbox = itemSlice(xml, name);
  const at = textbox.lastIndexOf('</Paragraphs>');
  return at === -1 ? textbox : textbox.slice(at);
}

/** El XML sin el textbox `name`, para comprobar que solo cambia ese item. */
function withoutTextbox(xml: string, name: string): string {
  const marker = `<Textbox Name="${name}">`;
  const start = xml.indexOf(marker);
  if (start === -1) throw new Error(`No está '${name}' en el XML`);
  const end = xml.indexOf('</Textbox>', start);
  return xml.slice(0, start) + xml.slice(end + '</Textbox>'.length);
}

/** Proyecta y localiza un Textbox por id (recorre rectángulos y celdas). */
function findTextbox(projection: ProjectionDto, id: string): TextboxDto | undefined {
  const all: TextboxDto[] = [];
  const walk = (items: ProjectionDto['page']['body']['items']): void => {
    for (const item of items) {
      if (item.kind === 'textbox') all.push(item);
      if (item.kind === 'rectangle') walk(item.children);
      if (item.kind === 'tablix') {
        for (const row of item.body.rows) {
          for (const cell of row.cells) if (cell?.content) walk([cell.content]);
        }
        for (const band of [...(item.headers?.columns ?? []), ...(item.headers?.rows ?? [])]) {
          for (const cell of band.cells) if (cell) walk([cell]);
        }
        for (const row of item.headers?.corner ?? []) {
          for (const cell of row) if (cell) walk([cell]);
        }
      }
    }
  };
  walk(projection.page.header.items);
  walk(projection.page.body.items);
  walk(projection.page.footer.items);
  return all.find((item) => item.id === id);
}

function project(doc: ReturnType<TrueFormatXmlAdapter['parse']>): ProjectionDto {
  return projectionAdapter.project({
    sessionId: 'test',
    filePath: 'test.rdlc',
    document: doc,
    version: 1,
  });
}

/** Report mínimo con el `<Textbox>` indicado, para casos de laboratorio. */
function reportWith(textbox: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<Report xmlns="http://schemas.microsoft.com/sqlserver/reporting/2016/01/reportdefinition">
  <ReportSections>
    <ReportSection>
      <Body>
        <ReportItems>
          ${textbox}
        </ReportItems>
      </Body>
    </ReportSection>
  </ReportSections>
</Report>`;
}

describe('setStyle · TextAlign en los párrafos', () => {
  it('escribe <TextAlign> en todos los párrafos y deja el <Style> del item intacto', () => {
    const source = reportWith(`<Textbox Name="T">
              <Paragraphs>
                <Paragraph>
                  <TextRuns><TextRun><Value>a</Value></TextRun></TextRuns>
                  <Style><FontSize>8pt</FontSize><TextAlign>Center</TextAlign></Style>
                </Paragraph>
                <Paragraph>
                  <TextRuns><TextRun><Value>b</Value></TextRun></TextRuns>
                </Paragraph>
              </Paragraphs>
              <Style><FontFamily>Arial</FontFamily></Style>
            </Textbox>`);
    const doc = adapter.parse(source);
    const index = DocumentIndex.build(doc.root);

    const applied = applyCommand(
      { root: doc.root, index },
      { cmd: 'setStyle', id: 'T', style: { textAlign: 'Right' } },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    const output = adapter.serialize(doc);
    expect(output.match(/<TextAlign>Right<\/TextAlign>/g)).toHaveLength(2);
    expect(output).not.toContain('<TextAlign>Center</TextAlign>');
    // El párrafo sin `<Style>` lo gana (solo con la alineación)…
    expect(output).toMatch(/<Style>\s*<TextAlign>Right<\/TextAlign>\s*<\/Style>/);
    // …y el `<Style>` del item no cambia ni gana `<TextAlign>`.
    expect(itemTailOf(output, 'T')).toBe(itemTailOf(source, 'T'));
    expect(itemTailOf(output, 'T')).not.toContain('<TextAlign>');

    // `applied` refleja el item real (sin align); la proyección va por
    // `snapshotOut` porque la alineación vive en los párrafos.
    const values = appliedOf(applied.value, 'T');
    expect(values?.style).toBeDefined();
    expect((values?.style as Record<string, unknown>).textAlign).toBeUndefined();
    expect(applied.value.snapshotOut).toBe(true);

    const problems = validator.validate(output).problems;
    expect(problems, problems.join(' | ')).toEqual([]);

    // La proyección expone la alineación por párrafo (lo que verá el front).
    const dto = findTextbox(project(doc), 'T');
    expect(dto?.paragraphs.map((paragraph) => paragraph.style?.textAlign)).toEqual([
      'Right',
      'Right',
    ]);
    expect(dto?.style?.textAlign).toBeUndefined();

    const undone = undoAll({ root: doc.root, index }, applied.value);
    expect(undone.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(source);
  });

  it('un párrafo sin runs también recibe la alineación (no cae al item)', () => {
    const source = reportWith(`<Textbox Name="T">
              <Paragraphs><Paragraph><TextRuns /></Paragraph></Paragraphs>
            </Textbox>`);
    const doc = adapter.parse(source);
    const index = DocumentIndex.build(doc.root);

    const applied = applyCommand(
      { root: doc.root, index },
      { cmd: 'setStyle', id: 'T', style: { textAlign: 'Center' } },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    const output = adapter.serialize(doc);
    expect(itemSlice(output, 'T')).toContain('<TextAlign>Center</TextAlign>');
    expect(itemTailOf(output, 'T')).not.toContain('<TextAlign>');

    const undone = undoAll({ root: doc.root, index }, applied.value);
    expect(undone.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(source);
  });

  it('sincroniza un <TextAlign> legado del item con el de los párrafos', () => {
    const source = reportWith(`<Textbox Name="T">
              <Paragraphs>
                <Paragraph><TextRuns><TextRun><Value>a</Value></TextRun></TextRuns></Paragraph>
              </Paragraphs>
              <Style><TextAlign>Left</TextAlign></Style>
            </Textbox>`);
    const doc = adapter.parse(source);
    const index = DocumentIndex.build(doc.root);

    const applied = applyCommand(
      { root: doc.root, index },
      { cmd: 'setStyle', id: 'T', style: { textAlign: 'Right' } },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    const output = adapter.serialize(doc);
    // Párrafo + item sincronizado (el item ya lo declaraba: se reescribe).
    expect(output.match(/<TextAlign>Right<\/TextAlign>/g)).toHaveLength(2);
    expect(output).not.toContain('<TextAlign>Left</TextAlign>');
    expect((appliedOf(applied.value, 'T')?.style as Record<string, unknown>).textAlign).toBe(
      'Right',
    );

    const undone = undoAll({ root: doc.root, index }, applied.value);
    expect(undone.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(source);
  });

  it('no crea <TextAlign> en el item si no lo declaraba', () => {
    const source = reportWith(`<Textbox Name="T">
              <Paragraphs>
                <Paragraph><TextRuns><TextRun><Value>a</Value></TextRun></TextRuns></Paragraph>
              </Paragraphs>
            </Textbox>`);
    const doc = adapter.parse(source);
    const index = DocumentIndex.build(doc.root);

    const applied = applyCommand(
      { root: doc.root, index },
      { cmd: 'setStyle', id: 'T', style: { textAlign: 'Center' } },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    const output = adapter.serialize(doc);
    expect(output.match(/<TextAlign>Center<\/TextAlign>/g)).toHaveLength(1);
    expect(itemTailOf(output, 'T')).not.toContain('<TextAlign>');

    const undone = undoAll({ root: doc.root, index }, applied.value);
    expect(undone.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(source);
  });

  it('sin párrafos el valor cae al <Style> del item (no se pierde) y el undo lo quita', () => {
    const source = reportWith('<Textbox Name="Vacio"><CanGrow>true</CanGrow></Textbox>');
    const doc = adapter.parse(source);
    const index = DocumentIndex.build(doc.root);

    const applied = applyCommand(
      { root: doc.root, index },
      { cmd: 'setStyle', id: 'Vacio', style: { textAlign: 'Center' } },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    const output = adapter.serialize(doc);
    expect(itemTailOf(output, 'Vacio')).toContain('<TextAlign>Center</TextAlign>');
    // Es el único caso que toca el item: `applied` sí expresa el resultado.
    expect((appliedOf(applied.value, 'Vacio')?.style as Record<string, unknown>).textAlign).toBe(
      'Center',
    );

    const undone = undoAll({ root: doc.root, index }, applied.value);
    expect(undone.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(source);
  });
});

describe('setStyle · quitar TextAlign (null)', () => {
  /** Item, párrafo y run con estilos: la retirada toca párrafos e item, no los runs. */
  const mixed = reportWith(`<Textbox Name="T">
              <Paragraphs>
                <Paragraph>
                  <TextRuns>
                    <TextRun><Value>a</Value><Style><FontSize>8pt</FontSize></Style></TextRun>
                  </TextRuns>
                  <Style><TextAlign>Right</TextAlign><FontFamily>Arial</FontFamily></Style>
                </Paragraph>
              </Paragraphs>
              <Style><TextAlign>Center</TextAlign><FontFamily>Segoe UI</FontFamily></Style>
            </Textbox>`);

  it('quita <TextAlign> de párrafos e item y el undo reinserta cada nodo en su sitio', () => {
    const doc = adapter.parse(mixed);
    const index = DocumentIndex.build(doc.root);

    const applied = applyCommand(
      { root: doc.root, index },
      { cmd: 'setStyle', id: 'T', style: { textAlign: null } },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    const output = adapter.serialize(doc);
    expect(output).not.toContain('<TextAlign>');
    // Solo se quita el tag: el resto de cada `<Style>` sigue ahí.
    expect(output).toContain('<FontSize>8pt</FontSize>');
    expect(output).toContain('<FontFamily>Arial</FontFamily>');
    expect(output).toContain('<FontFamily>Segoe UI</FontFamily>');
    expect(applied.value.snapshotOut).toBe(true);

    const problems = validator.validate(output).problems;
    expect(problems, problems.join(' | ')).toEqual([]);

    const undone = undoAll({ root: doc.root, index }, applied.value);
    expect(undone.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(mixed);
  });

  it('en el corpus quita el <TextAlign> del textbox sin tocar los demás', () => {
    const { xml, doc, index } = open('SalesInvoiceESP.rdlc');
    // Textbox146 nace con <TextAlign> en su párrafo.
    expect(itemSlice(xml, 'Textbox146')).toContain('<TextAlign>');

    const applied = applyCommand(
      { root: doc.root, index },
      { cmd: 'setStyle', id: 'Textbox146', style: { textAlign: null } },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    const output = adapter.serialize(doc);
    expect(itemSlice(output, 'Textbox146')).not.toContain('<TextAlign>');
    expect(withoutTextbox(output, 'Textbox146')).toBe(withoutTextbox(xml, 'Textbox146'));

    const undone = undoAll({ root: doc.root, index }, applied.value);
    expect(undone.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(xml);
  });
});

describe('setStyle · TextAlign · golden del corpus', () => {
  it('alinear un textbox solo cambia ese textbox (y el undo es byte-exacto)', () => {
    for (const file of loadCorpus()) {
      // Un nombre único para que el recorte del textbox no confunda copias.
      const names = [...file.xml.matchAll(/<Textbox Name="([^"]+)"/g)].map((match) => match[1]!);
      const name = names.find(
        (candidate) => names.indexOf(candidate) === names.lastIndexOf(candidate),
      );
      expect(name, `${file.name}: sin Textbox`).toBeTruthy();
      if (!name) continue;

      const doc = adapter.parse(file.xml);
      const index = DocumentIndex.build(doc.root);
      expect(index.get(name)?.tagName, `${file.name}: '${name}' no es un Textbox`).toBe('Textbox');

      // `Justify` no aparece en el corpus: el comando siempre escribe algo.
      const applied = applyCommand(
        { root: doc.root, index },
        { cmd: 'setStyle', id: name, style: { textAlign: 'Justify' } },
      );
      expect(applied.isRight(), `${file.name}: comando rechazado`).toBe(true);
      if (!applied.isRight()) continue;

      const output = adapter.serialize(doc);
      expect(output, `${file.name}: el comando no escribió nada`).not.toBe(file.xml);
      expect(withoutTextbox(output, name), `${file.name}: cambió algo fuera de '${name}'`).toBe(
        withoutTextbox(file.xml, name),
      );

      const undone = undoAll({ root: doc.root, index }, applied.value);
      expect(undone.isRight(), `${file.name}: undo rechazado`).toBe(true);
      expect(adapter.serialize(doc), `${file.name}: undo no byte-exacto`).toBe(file.xml);
    }
  });
});
