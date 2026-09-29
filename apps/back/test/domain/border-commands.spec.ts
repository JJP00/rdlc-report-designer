import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ItemDto } from '@rdlc-designer/contracts';
import { describe, expect, it } from 'vitest';
import { applyCommand } from '../../src/domain/document/commands/applyCommand.js';
import { DocumentIndex } from '../../src/domain/document/index/DocumentIndex.js';
import { TrueFormatProjectionAdapter } from '../../src/infrastructure/rdlc/TrueFormatProjectionAdapter.js';
import { TrueFormatXmlAdapter } from '../../src/infrastructure/rdlc/TrueFormatXmlAdapter.js';
import { LibXml2SchemaValidatorAdapter } from '../../src/infrastructure/validation/LibXml2SchemaValidatorAdapter.js';
import { corpusByName } from '../golden/fixtures.js';
import { undoAll } from './command-test-utils.js';

/**
 * G2 · bordes por lado.
 *
 * Casos reales del corpus:
 * - `SalesCreditMemoESP · Textbox4`: genérico `<Border><Style>None</Style>` sin
 *   overrides (escribir un lado lo crea).
 * - `PalletOutput · Textbox25`: genérico Solid + `TopBorder`/`BottomBorder`
 *   **solo con `Width`** (herencia propiedad a propiedad).
 * - `BTCWhseShipment · Textbox24`: genérico None + `BottomBorder` Solid.
 */

const xmlAdapter = new TrueFormatXmlAdapter();
const projectionAdapter = new TrueFormatProjectionAdapter();
const here = dirname(fileURLToPath(import.meta.url));
const validator = new LibXml2SchemaValidatorAdapter(
  resolve(here, '../../resources/rdl2016/ReportDefinition2016.xsd'),
);

function open(name: string): {
  xml: string;
  doc: ReturnType<TrueFormatXmlAdapter['parse']>;
  index: DocumentIndex;
} {
  const { xml } = corpusByName(name);
  const doc = xmlAdapter.parse(xml);
  return { xml, doc, index: DocumentIndex.build(doc.root) };
}

/** Subárbol XML del Textbox (del `Name` a su cierre). */
function textboxSlice(output: string, id: string): string {
  const start = output.indexOf(`Name="${id}"`);
  return output.slice(start, output.indexOf('</Textbox>', start));
}

describe('G2 · setStyle · border', () => {
  it('crea el override de un lado (Style) sin tocar el genérico, con undo exacto', () => {
    const { xml, doc, index } = open('SalesCreditMemoESP.rdlc');

    const applied = applyCommand(
      { root: doc.root, index },
      { cmd: 'setStyle', id: 'Textbox4', style: { border: { top: { style: 'Solid' } } } },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    const item = textboxSlice(xmlAdapter.serialize(doc), 'Textbox4');
    expect(item).toMatch(/<TopBorder>\s*<Style>Solid<\/Style>\s*<\/TopBorder>/);
    // El genérico sigue declarando None para los demás lados.
    expect(item).toContain('<Border>');

    const undone = undoAll({ root: doc.root, index }, applied.value);
    expect(undone.isRight()).toBe(true);
    expect(xmlAdapter.serialize(doc)).toBe(xml);
  });

  it('reemplaza el contenido de un lado existente (Color/Style/Width) y el undo es exacto', () => {
    const { xml, doc, index } = open('BTCWhseShipment.rdlc');

    const applied = applyCommand(
      { root: doc.root, index },
      {
        cmd: 'setStyle',
        id: 'Textbox24',
        style: {
          border: {
            bottom: { style: 'Dashed', color: 'Red', width: { value: 2, unit: 'pt' } },
          },
        },
      },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    const item = textboxSlice(xmlAdapter.serialize(doc), 'Textbox24');
    // Orden de BC: Color, Style, Width.
    expect(item).toMatch(
      /<BottomBorder>\s*<Color>Red<\/Color>\s*<Style>Dashed<\/Style>\s*<Width>2pt<\/Width>\s*<\/BottomBorder>/,
    );

    const undone = undoAll({ root: doc.root, index }, applied.value);
    expect(undone.isRight()).toBe(true);
    expect(xmlAdapter.serialize(doc)).toBe(xml);
  });

  it('un lado a null quita su override (el genérico vuelve a aplicar)', () => {
    const { xml, doc, index } = open('BTCWhseShipment.rdlc');

    const applied = applyCommand(
      { root: doc.root, index },
      { cmd: 'setStyle', id: 'Textbox24', style: { border: { bottom: null } } },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    const item = textboxSlice(xmlAdapter.serialize(doc), 'Textbox24');
    expect(item).not.toContain('<BottomBorder>');
    expect(item).toContain('<Border>');

    const undone = undoAll({ root: doc.root, index }, applied.value);
    expect(undone.isRight()).toBe(true);
    expect(xmlAdapter.serialize(doc)).toBe(xml);
  });

  it('border a null quita genérico y overrides por lado', () => {
    const { xml, doc, index } = open('PalletOutput.rdlc');

    const applied = applyCommand(
      { root: doc.root, index },
      { cmd: 'setStyle', id: 'Textbox25', style: { border: null } },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    const item = textboxSlice(xmlAdapter.serialize(doc), 'Textbox25');
    expect(item).not.toContain('<Border>');
    expect(item).not.toContain('<TopBorder>');
    expect(item).not.toContain('<BottomBorder>');

    const undone = undoAll({ root: doc.root, index }, applied.value);
    expect(undone.isRight()).toBe(true);
    expect(xmlAdapter.serialize(doc)).toBe(xml);
  });

  it('el borde escrito valida contra el XSD', () => {
    const { doc, index } = open('SalesCreditMemoESP.rdlc');
    const applied = applyCommand(
      { root: doc.root, index },
      {
        cmd: 'setStyle',
        id: 'Textbox4',
        style: {
          border: {
            top: { style: 'Solid', color: 'Black', width: { value: 1, unit: 'pt' } },
            bottom: { style: 'None' },
          },
        },
      },
    );
    expect(applied.isRight()).toBe(true);

    const result = validator.validate(xmlAdapter.serialize(doc));
    expect(result.problems, result.problems.join(' | ')).toEqual([]);
  });
});

describe('G2 · proyección · border', () => {
  function project(name: string) {
    return projectionAdapter.project({
      sessionId: 'test',
      filePath: name,
      document: xmlAdapter.parse(corpusByName(name).xml),
      version: 1,
    });
  }

  /** Busca un item en todas las regiones (incluye rectángulos y celdas). */
  function findById(items: ItemDto[], id: string): ItemDto | undefined {
    for (const item of items) {
      if (item.id === id) return item;
      if (item.kind === 'rectangle') {
        const found = findById(item.children, id);
        if (found) return found;
      }
      if (item.kind === 'tablix') {
        for (const row of item.body.rows) {
          for (const cell of row.cells) {
            if (!cell?.content) continue;
            const found = findById([cell.content], id);
            if (found) return found;
          }
        }
      }
    }
    return undefined;
  }

  function borderOf(projection: ReturnType<typeof project>, id: string) {
    const item = findById(
      [
        ...projection.page.header.items,
        ...projection.page.body.items,
        ...projection.page.footer.items,
      ],
      id,
    );
    return item?.style?.border;
  }

  it('resuelve la herencia del genérico propiedad a propiedad (PalletOutput)', () => {
    const border = borderOf(project('PalletOutput.rdlc'), 'Textbox25');

    // El genérico aporta el `Style` (Solid) y cada lado su `Width` (1pt).
    for (const side of ['top', 'left', 'bottom', 'right'] as const) {
      expect(border?.[side]).toEqual({ style: 'Solid', width: { value: 1, unit: 'pt' } });
    }
  });

  it('proyecta todos los lados cuando el genérico declara None (SalesCreditMemoESP)', () => {
    const border = borderOf(project('SalesCreditMemoESP.rdlc'), 'Textbox4');

    for (const side of ['top', 'left', 'bottom', 'right'] as const) {
      expect(border?.[side]).toEqual({ style: 'None' });
    }
  });
});
