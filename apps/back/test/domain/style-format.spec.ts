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
 * F1 · `setStyle` con `format` (doc `docs/features/0003-formato-numerico.md`).
 *
 * BC escribe `<Format>` en el `<Style>` del **TextRun** (precedencia RDL
 * run > párrafo > item), no en el del textbox. El comando escribe el valor en
 * **todos** los runs y deja el item intacto; `null` o `''` («General») quitan
 * el tag de los tres niveles. Todo con undo byte-exacto.
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

/** XML del item `name` (del `Name="…"` a su cierre). */
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

describe('F1 · setStyle · format en los runs', () => {
  it('escribe <Format> en todos los runs y deja el <Style> del item intacto', () => {
    const { xml, doc, index } = open('SalesInvoiceESP.rdlc');

    // Textbox146 (en una celda de Tablix): 3 runs, 2 con expresión de formato y
    // uno sin ella. El item no declara `<Format>`.
    const applied = applyCommand(
      { root: doc.root, index },
      { cmd: 'setStyle', id: 'Textbox146', style: { format: 'C2' } },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    const output = adapter.serialize(doc);
    expect(output.match(/<Format>C2<\/Format>/g)).toHaveLength(3);

    // El `<Style>` propio del item no cambia ni gana `<Format>`.
    expect(itemTailOf(output, 'Textbox146')).toBe(itemTailOf(xml, 'Textbox146'));
    expect(itemTailOf(output, 'Textbox146')).not.toContain('<Format>');

    // `applied` refleja el item real (sin format); la proyección va por
    // `snapshotOut` porque el formato vive en los runs.
    const values = appliedOf(applied.value, 'Textbox146');
    expect(values).toMatchObject({ style: { verticalAlign: 'Top' } });
    expect((values?.style as Record<string, unknown>).format).toBeUndefined();
    expect(applied.value.snapshotOut).toBe(true);

    const problems = validator.validate(output).problems;
    expect(problems, problems.join(' | ')).toEqual([]);

    // La proyección expone el formato por run (lo que verá el front).
    const dto = findTextbox(project(doc), 'Textbox146');
    expect(dto?.paragraphs[0]?.runs.map((run) => run.style?.format)).toEqual(['C2', 'C2', 'C2']);
    expect(dto?.style?.format).toBeUndefined();

    const undone = undoAll({ root: doc.root, index }, applied.value);
    expect(undone.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(xml);
  });

  it('conserva la expresión tal cual (comillas incluidas, sin validar sintaxis)', () => {
    const { xml, doc, index } = open('SalesInvoiceESP.rdlc');
    const expression = '=First(Fields!BTCFormatcurrency_Lbl.Value, "DataSet_Result")';

    const applied = applyCommand(
      { root: doc.root, index },
      { cmd: 'setStyle', id: 'Textbox146', style: { format: expression } },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    const output = adapter.serialize(doc);
    const raw = `<Format>${expression}</Format>`;
    expect(itemSlice(output, 'Textbox146').split(raw).length - 1).toBe(3);
    // El resto del corpus conserva sus propias expresiones de formato.
    expect(withoutTextbox(output, 'Textbox146')).toBe(withoutTextbox(xml, 'Textbox146'));

    const undone = undoAll({ root: doc.root, index }, applied.value);
    expect(undone.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(xml);
  });

  it('combina format con otras claves: el item conserva su estilo y el formato va a los runs', () => {
    const { xml, doc, index } = open('PalletOutput.rdlc');

    const applied = applyCommand(
      { root: doc.root, index },
      { cmd: 'setStyle', id: 'Textbox28', style: { fontFamily: 'Arial', format: 'P0' } },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    const output = adapter.serialize(doc);
    const textbox = itemSlice(output, 'Textbox28');
    expect(itemTailOf(output, 'Textbox28')).toContain('<FontFamily>Arial</FontFamily>');
    expect(itemTailOf(output, 'Textbox28')).not.toContain('<Format>');
    // 3 runs (fuente sincronizada) + el item; y el formato, solo en los 3 runs.
    expect(textbox.match(/<FontFamily>Arial<\/FontFamily>/g)).toHaveLength(4);
    expect(textbox.match(/<Format>P0<\/Format>/g)).toHaveLength(3);

    const undone = undoAll({ root: doc.root, index }, applied.value);
    expect(undone.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(xml);
  });

  it('crea el <Style> del run cuando falta y el undo lo vuelve a quitar', () => {
    const source = reportWith(`<Textbox Name="T">
              <Paragraphs>
                <Paragraph>
                  <TextRuns>
                    <TextRun><Value>a</Value></TextRun>
                    <TextRun><Value>b</Value></TextRun>
                  </TextRuns>
                </Paragraph>
              </Paragraphs>
            </Textbox>`);
    const doc = adapter.parse(source);
    const index = DocumentIndex.build(doc.root);

    const applied = applyCommand(
      { root: doc.root, index },
      { cmd: 'setStyle', id: 'T', style: { format: 'N2' } },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    const output = adapter.serialize(doc);
    expect(output.match(/<Style>\s*<Format>N2<\/Format>\s*<\/Style>/g)).toHaveLength(2);
    expect(output.split('<Style').length - 1).toBe(2);
    expect(adapter.serialize(doc)).not.toBe(source);

    const undone = undoAll({ root: doc.root, index }, applied.value);
    expect(undone.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(source);
  });

  it('expande los <Style /> autocerrados del corpus y el undo los devuelve tal cual', () => {
    const { xml, doc, index } = open('PalletOutput.rdlc');

    // Textbox25: 4 runs con `<Style />` (vacíos y autocerrados).
    const applied = applyCommand(
      { root: doc.root, index },
      { cmd: 'setStyle', id: 'Textbox25', style: { format: 'N2' } },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    const output = adapter.serialize(doc);
    const textbox = itemSlice(output, 'Textbox25');
    expect(textbox.match(/<Format>N2<\/Format>/g)).toHaveLength(4);
    expect(itemTailOf(output, 'Textbox25')).not.toContain('<Format>');

    const undone = undoAll({ root: doc.root, index }, applied.value);
    expect(undone.isRight()).toBe(true);
    // Byte-exacto: los `<Style />` vuelven a quedar autocerrados.
    expect(adapter.serialize(doc)).toBe(xml);
  });
});

describe('F1 · setStyle · quitar format (General)', () => {
  /** Item, párrafo y runs con `<Format>`: la retirada limpia los tres. */
  const threeLevels = reportWith(`<Textbox Name="T">
              <Paragraphs>
                <Paragraph>
                  <TextRuns>
                    <TextRun>
                      <Value>a</Value>
                      <Style><FontSize>8pt</FontSize><Format>N2</Format></Style>
                    </TextRun>
                    <TextRun>
                      <Value>b</Value>
                      <Style><Format>d</Format></Style>
                    </TextRun>
                  </TextRuns>
                  <Style><TextAlign>Right</TextAlign><Format>P0</Format></Style>
                </Paragraph>
              </Paragraphs>
              <Style><Format>C2</Format></Style>
            </Textbox>`);

  it('quita <Format> de runs, párrafo e item y el undo restaura cada nodo en su sitio', () => {
    const doc = adapter.parse(threeLevels);
    const index = DocumentIndex.build(doc.root);

    const applied = applyCommand(
      { root: doc.root, index },
      { cmd: 'setStyle', id: 'T', style: { format: null } },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    const output = adapter.serialize(doc);
    expect(output).not.toContain('<Format>');
    // Solo se quita el tag: el resto de cada `<Style>` sigue ahí.
    expect(output).toContain('<FontSize>8pt</FontSize>');
    expect(output).toContain('<TextAlign>Right</TextAlign>');
    expect(applied.value.snapshotOut).toBe(true);

    const problems = validator.validate(output).problems;
    expect(problems, problems.join(' | ')).toEqual([]);

    const undone = undoAll({ root: doc.root, index }, applied.value);
    expect(undone.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(threeLevels);
  });

  it("un literal vacío ('') se comporta como null", () => {
    const doc = adapter.parse(threeLevels);
    const index = DocumentIndex.build(doc.root);

    const applied = applyCommand(
      { root: doc.root, index },
      { cmd: 'setStyle', id: 'T', style: { format: '' } },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    expect(adapter.serialize(doc)).not.toContain('<Format>');

    const undone = undoAll({ root: doc.root, index }, applied.value);
    expect(undone.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(threeLevels);
  });

  it('en el corpus quita los <Format> del textbox sin tocar los demás', () => {
    const { xml, doc, index } = open('SalesInvoiceESP.rdlc');
    expect(itemSlice(xml, 'Textbox146')).toContain('<Format>');

    const applied = applyCommand(
      { root: doc.root, index },
      { cmd: 'setStyle', id: 'Textbox146', style: { format: null } },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    const output = adapter.serialize(doc);
    expect(itemSlice(output, 'Textbox146')).not.toContain('<Format>');
    expect(withoutTextbox(output, 'Textbox146')).toBe(withoutTextbox(xml, 'Textbox146'));

    const undone = undoAll({ root: doc.root, index }, applied.value);
    expect(undone.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(xml);
  });

  it('escribir y luego quitar (General) deshace en dos pasos byte-exactos', () => {
    const { xml, doc, index } = open('SalesInvoiceESP.rdlc');

    const written = applyCommand(
      { root: doc.root, index },
      { cmd: 'setStyle', id: 'Textbox146', style: { format: 'N2' } },
    );
    expect(written.isRight()).toBe(true);
    if (!written.isRight()) return;
    const afterWrite = adapter.serialize(doc);

    // El nodo que creó el primer comando (run 3) lo quita el segundo: su undo
    // tiene que reinsertarlo en el mismo sitio (índice prístino del momento).
    const cleared = applyCommand(
      { root: doc.root, index },
      { cmd: 'setStyle', id: 'Textbox146', style: { format: null } },
    );
    expect(cleared.isRight()).toBe(true);
    if (!cleared.isRight()) return;
    expect(itemSlice(adapter.serialize(doc), 'Textbox146')).not.toContain('<Format>');

    undoAll({ root: doc.root, index }, cleared.value);
    expect(adapter.serialize(doc)).toBe(afterWrite);

    undoAll({ root: doc.root, index }, written.value);
    expect(adapter.serialize(doc)).toBe(xml);
  });
});

describe('F1 · setStyle · precedencia y ediciones no relacionadas', () => {
  it('el run manda: escribir el formato del textbox reescribe los overrides de los runs y no toca el item', () => {
    const source = reportWith(`<Textbox Name="T">
              <Paragraphs>
                <Paragraph>
                  <TextRuns>
                    <TextRun><Value>a</Value><Style><Format>N2</Format></Style></TextRun>
                    <TextRun><Value>b</Value></TextRun>
                  </TextRuns>
                </Paragraph>
              </Paragraphs>
              <Style><Format>C2</Format></Style>
            </Textbox>`);
    const doc = adapter.parse(source);
    const index = DocumentIndex.build(doc.root);

    const applied = applyCommand(
      { root: doc.root, index },
      { cmd: 'setStyle', id: 'T', style: { format: 'P0' } },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    const output = adapter.serialize(doc);
    // El run con override se reescribe y el que no lo tenía lo recibe.
    expect(output.split('<Format>P0</Format>').length - 1).toBe(2);
    // El del item sobrevive (no se toca): RDL resuelve el del run.
    expect(output).toContain('<Format>C2</Format>');

    const undone = undoAll({ root: doc.root, index }, applied.value);
    expect(undone.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(source);
  });

  it('una edición de fuente no materializa el <Format> del item en los runs', () => {
    const source = reportWith(`<Textbox Name="T">
              <Paragraphs>
                <Paragraph>
                  <TextRuns>
                    <TextRun><Value>a</Value><Style><Format>N2</Format></Style></TextRun>
                    <TextRun><Value>b</Value></TextRun>
                  </TextRuns>
                </Paragraph>
              </Paragraphs>
              <Style><FontFamily>Arial</FontFamily><Format>C2</Format></Style>
            </Textbox>`);
    const doc = adapter.parse(source);
    const index = DocumentIndex.build(doc.root);

    const applied = applyCommand(
      { root: doc.root, index },
      { cmd: 'setStyle', id: 'T', style: { fontFamily: 'Segoe UI' } },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    const output = adapter.serialize(doc);
    // La fuente se sincroniza en los dos runs, pero el <Format> no se copia:
    // el item conserva el suyo, el run 1 el suyo y el run 2 sigue sin tag.
    expect(output.split('<FontFamily>Segoe UI</FontFamily>').length - 1).toBe(3);
    expect(output.split('<Format>').length - 1).toBe(2);
    expect(output).toContain('<Format>N2</Format>');
    expect(output).toContain('<Format>C2</Format>');
    const secondRun = output.slice(
      output.indexOf('<Value>b</Value>'),
      output.indexOf('</TextRuns>'),
    );
    expect(secondRun).not.toContain('<Format>');

    const undone = undoAll({ root: doc.root, index }, applied.value);
    expect(undone.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(source);
  });

  it('una edición de color no pisa el <Format> de los runs', () => {
    const source = reportWith(`<Textbox Name="T">
              <Paragraphs>
                <Paragraph>
                  <TextRuns>
                    <TextRun><Value>a</Value><Style><Format>N2</Format></Style></TextRun>
                    <TextRun><Value>b</Value></TextRun>
                  </TextRuns>
                </Paragraph>
              </Paragraphs>
              <Style><Color>#000000</Color><Format>C2</Format></Style>
            </Textbox>`);
    const doc = adapter.parse(source);
    const index = DocumentIndex.build(doc.root);

    const applied = applyCommand(
      { root: doc.root, index },
      { cmd: 'setStyle', id: 'T', style: { color: '#FF0000' } },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    const output = adapter.serialize(doc);
    expect(output).toContain('<Color>#FF0000</Color>');
    expect(output.split('<Format>').length - 1).toBe(2);
    expect(output).toContain('<Format>N2</Format>');
    expect(output).toContain('<Format>C2</Format>');

    const undone = undoAll({ root: doc.root, index }, applied.value);
    expect(undone.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(source);
  });
});

describe('F1 · setStyle · textbox sin runs', () => {
  it('sin párrafos, el formato cae al <Style> del item (no se pierde) y el undo lo quita', () => {
    const source = reportWith('<Textbox Name="Vacio"><CanGrow>true</CanGrow></Textbox>');
    const doc = adapter.parse(source);
    const index = DocumentIndex.build(doc.root);

    const applied = applyCommand(
      { root: doc.root, index },
      { cmd: 'setStyle', id: 'Vacio', style: { format: 'N2' } },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    const output = adapter.serialize(doc);
    expect(itemTailOf(output, 'Vacio')).toContain('<Format>N2</Format>');
    // `applied` sí expresa el resultado: es el único caso que toca el item.
    expect(appliedOf(applied.value, 'Vacio')).toMatchObject({ style: { format: 'N2' } });

    const undone = undoAll({ root: doc.root, index }, applied.value);
    expect(undone.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(source);
  });

  it('con párrafos pero sin TextRun también cae al item', () => {
    const source = reportWith(`<Textbox Name="SinRuns">
              <Paragraphs><Paragraph><TextRuns /></Paragraph></Paragraphs>
            </Textbox>`);
    const doc = adapter.parse(source);
    const index = DocumentIndex.build(doc.root);

    const applied = applyCommand(
      { root: doc.root, index },
      { cmd: 'setStyle', id: 'SinRuns', style: { format: 'd' } },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    expect(itemSlice(adapter.serialize(doc), 'SinRuns')).toContain('<Format>d</Format>');

    const undone = undoAll({ root: doc.root, index }, applied.value);
    expect(undone.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(source);
  });
});

describe('F1 · setStyle · golden del corpus', () => {
  it('aplicar formato a un textbox solo cambia ese textbox (y el undo es byte-exacto)', () => {
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

      const applied = applyCommand(
        { root: doc.root, index },
        { cmd: 'setStyle', id: name, style: { format: 'N2' } },
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
