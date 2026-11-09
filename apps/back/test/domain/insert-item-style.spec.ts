import { describe, expect, it } from 'vitest';
import { applyCommand } from '../../src/domain/document/commands/applyCommand.js';
import { DocumentIndex } from '../../src/domain/document/index/DocumentIndex.js';
import { TrueFormatXmlAdapter } from '../../src/infrastructure/rdlc/TrueFormatXmlAdapter.js';
import { corpusByName } from '../golden/fixtures.js';
import { appliedOf, undoAll } from './command-test-utils.js';

/**
 * `insertItem.item.style` viaja en el contrato (MCP/IPC). Antes se aceptaba y se
 * descartaba en silencio: el agente recibía `ok:true` y el item nacía sin fuente
 * ni bordes. Ahora se aplica con la misma lógica que `setStyle` (fuente a los
 * runs, `TextAlign` a los párrafos, bordes y `VerticalAlign` al item) y el eco
 * de `applied` lo incluye.
 */

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

const cm = (value: number): { value: number; unit: 'cm' } => ({ value, unit: 'cm' });
const pt = (value: number): { value: number; unit: 'pt' } => ({ value, unit: 'pt' });

/** XML del item `name` (de su apertura al cierre de su etiqueta). */
function itemXml(output: string, name: string, tag: 'Textbox' | 'Rectangle'): string {
  const start = output.indexOf(`<${tag} Name="${name}"`);
  expect(start).toBeGreaterThanOrEqual(0);
  return output.slice(start, output.indexOf(`</${tag}>`, start));
}

describe('insertItem con style', () => {
  it('un textbox nace con la fuente en el run y el resto del estilo donde BC lo lee', () => {
    const { doc, index } = open('PalletOutput.rdlc');

    const applied = applyCommand(
      { root: doc.root, index },
      {
        cmd: 'insertItem',
        scope: { kind: 'body' },
        index: 0,
        item: {
          kind: 'textbox',
          name: 'ReportTitle',
          top: cm(0.3),
          left: cm(0.2),
          width: cm(13),
          height: cm(1.1),
          text: '=Parameters!ReportCaption.Value',
          style: {
            fontFamily: 'Arial',
            fontSize: pt(22),
            fontWeight: 'Bold',
            fontStyle: 'Italic',
            verticalAlign: 'Middle',
            textAlign: 'Center',
            border: {
              top: { style: 'Solid', width: pt(1) },
              bottom: { style: 'Solid', width: pt(1) },
            },
          },
        },
      },
    );
    expect(applied.isRight()).toBe(true);

    const textbox = itemXml(adapter.serialize(doc), 'ReportTitle', 'Textbox');

    // Fuente en el run (lo que BC y RB leen), no solo en el item.
    const run = textbox.slice(textbox.indexOf('<TextRun>'), textbox.indexOf('</TextRun>'));
    expect(run).toContain('<FontFamily>Arial</FontFamily>');
    expect(run).toContain('<FontSize>22pt</FontSize>');
    expect(run).toContain('<FontWeight>Bold</FontWeight>');
    expect(run).toContain('<FontStyle>Italic</FontStyle>');
    // `TextAlign` va al párrafo; `VerticalAlign` y los bordes, al item.
    expect(textbox).toContain('<TextAlign>Center</TextAlign>');
    expect(textbox).toContain('<VerticalAlign>Middle</VerticalAlign>');
    expect(textbox).toContain('<TopBorder>');
    expect(textbox).toContain('<BottomBorder>');
    expect(textbox).not.toContain('<LeftBorder>');
  });

  it('el eco de applied incluye el estilo aplicado (nada se pierde en silencio)', () => {
    const { doc, index } = open('PalletOutput.rdlc');

    const applied = applyCommand(
      { root: doc.root, index },
      {
        cmd: 'insertItem',
        scope: { kind: 'body' },
        index: 0,
        item: {
          kind: 'textbox',
          name: 'Echo',
          top: cm(0),
          left: cm(0),
          width: cm(4),
          height: cm(1),
          style: { fontFamily: 'Arial', verticalAlign: 'Middle', textAlign: 'Right' },
        },
      },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    expect(appliedOf(applied.value, 'Echo')).toMatchObject({
      kind: 'textbox',
      style: { fontFamily: 'Arial', verticalAlign: 'Middle', textAlign: 'Right' },
    });
  });

  it('un rectángulo con borde lo conserva; sin style no aparece `style` en applied', () => {
    const { doc, index } = open('PalletOutput.rdlc');
    const ctx = { root: doc.root, index };

    const bordered = applyCommand(ctx, {
      cmd: 'insertItem',
      scope: { kind: 'body' },
      index: 0,
      item: {
        kind: 'rectangle',
        name: 'InfoBox',
        top: cm(2),
        left: cm(0),
        width: cm(8),
        height: cm(3),
        style: { border: { left: { style: 'Solid', color: 'Black' } } },
      },
    });
    expect(bordered.isRight()).toBe(true);
    if (!bordered.isRight()) return;
    expect(itemXml(adapter.serialize(doc), 'InfoBox', 'Rectangle')).toContain('<LeftBorder>');
    expect(appliedOf(bordered.value, 'InfoBox')).toHaveProperty('style');

    const plain = applyCommand(ctx, {
      cmd: 'insertItem',
      scope: { kind: 'body' },
      index: 0,
      item: {
        kind: 'rectangle',
        name: 'PlainBox',
        top: cm(6),
        left: cm(0),
        width: cm(2),
        height: cm(1),
      },
    });
    expect(plain.isRight()).toBe(true);
    if (!plain.isRight()) return;
    expect(appliedOf(plain.value, 'PlainBox')).not.toHaveProperty('style');
  });

  it('un item dentro de un rectángulo también recibe su estilo', () => {
    const { doc, index } = open('PalletOutput.rdlc');

    const rect = applyCommand(
      { root: doc.root, index },
      {
        cmd: 'insertItem',
        scope: { kind: 'body' },
        index: 0,
        item: {
          kind: 'rectangle',
          name: 'OrderRect',
          top: cm(0),
          left: cm(0),
          width: cm(15),
          height: cm(5),
        },
      },
    );
    expect(rect.isRight()).toBe(true);
    // El caso de uso real reconstruye el índice tras comandos estructurales.
    const rebuilt = { root: doc.root, index: DocumentIndex.build(doc.root) };

    const child = applyCommand(rebuilt, {
      cmd: 'insertItem',
      scope: { kind: 'rectangle', id: 'OrderRect' },
      index: 0,
      item: {
        kind: 'textbox',
        name: 'OrderNoBox',
        top: cm(0.5),
        left: cm(0.5),
        width: cm(4),
        height: cm(1),
        text: 'No.',
        style: {
          fontWeight: 'Bold',
          border: { top: { style: 'Solid' }, right: { style: 'Solid' } },
        },
      },
    });
    expect(child.isRight()).toBe(true);

    const textbox = itemXml(adapter.serialize(doc), 'OrderNoBox', 'Textbox');
    expect(textbox).toContain('<FontWeight>Bold</FontWeight>');
    expect(textbox).toContain('<RightBorder>');
  });

  it('el undo de una inserción con estilo deja el XML byte a byte igual', () => {
    const { xml, doc, index } = open('PalletOutput.rdlc');

    const applied = applyCommand(
      { root: doc.root, index },
      {
        cmd: 'insertItem',
        scope: { kind: 'body' },
        index: 0,
        item: {
          kind: 'textbox',
          name: 'Styled',
          top: cm(1),
          left: cm(1),
          width: cm(5),
          height: cm(1),
          text: 'x',
          style: {
            fontFamily: 'Arial',
            fontWeight: 'Bold',
            textAlign: 'Center',
            border: { top: { style: 'Solid' } },
          },
        },
      },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;
    expect(adapter.serialize(doc)).not.toBe(xml);

    const undone = undoAll({ root: doc.root, index }, applied.value);
    expect(undone.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(xml);
  });

  it('un parche con claves no soportadas se rechaza y no inserta nada', () => {
    const { xml, doc, index } = open('PalletOutput.rdlc');

    const applied = applyCommand(
      { root: doc.root, index },
      {
        cmd: 'insertItem',
        scope: { kind: 'body' },
        index: 0,
        item: {
          kind: 'textbox',
          name: 'Bad',
          top: cm(1),
          left: cm(1),
          width: cm(5),
          height: cm(1),
          // El esquema Zod no deja pasar esto: se fuerza para probar el dominio.
          style: { fontFamily: 'Arial', glow: 'yes' } as never,
        },
      },
    );
    expect(applied.isLeft()).toBe(true);
    if (!applied.isLeft()) return;
    expect(applied.value.reason).toBe('styleUnsupported');
    expect(adapter.serialize(doc)).toBe(xml);
  });
});
