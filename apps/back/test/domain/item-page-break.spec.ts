import type { ItemDto } from '@rdlc-designer/contracts';
import { describe, expect, it } from 'vitest';
import { applyCommand } from '../../src/domain/document/commands/applyCommand.js';
import { DocumentIndex } from '../../src/domain/document/index/DocumentIndex.js';
import { TrueFormatProjectionAdapter } from '../../src/infrastructure/rdlc/TrueFormatProjectionAdapter.js';
import { TrueFormatXmlAdapter } from '../../src/infrastructure/rdlc/TrueFormatXmlAdapter.js';
import { corpusByName } from '../golden/fixtures.js';
import { undoAll } from './command-test-utils.js';

/**
 * G9 · salto de página del item (`PageBreak > BreakLocation`).
 *
 * Casos reales: `BTCQualityControl · Rectangle1` (`Start`) y
 * `SalesCreditMemoDEU · Rectangle3` (`End`); `PalletOutput · Rectangle1` no lo
 * declara (caso de creación).
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

describe('G9 · setItemPageBreak', () => {
  it('crea el PageBreak en un item que no lo tenía y el undo es exacto', () => {
    const { xml, doc, index } = open('PalletOutput.rdlc');

    const applied = applyCommand(
      { root: doc.root, index },
      { cmd: 'setItemPageBreak', id: 'Rectangle1', breakLocation: 'Between' },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;
    expect(applied.value.applied?.[0]).toMatchObject({
      id: 'Rectangle1',
      values: { pageBreak: 'Between' },
    });

    const item = subtreeOf(xmlAdapter.serialize(doc), 'Rectangle1');
    expect(item).toMatch(/<PageBreak>\s*<BreakLocation>Between<\/BreakLocation>\s*<\/PageBreak>/);

    const undone = undoAll({ root: doc.root, index }, applied.value);
    expect(undone.isRight()).toBe(true);
    expect(xmlAdapter.serialize(doc)).toBe(xml);
  });

  it('actualiza el BreakLocation existente (y el undo restaura el texto)', () => {
    const { xml, doc, index } = open('SalesCreditMemoDEU.rdlc');

    const applied = applyCommand(
      { root: doc.root, index },
      { cmd: 'setItemPageBreak', id: 'Rectangle3', breakLocation: 'Start' },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    expect(xmlAdapter.serialize(doc)).toContain('<BreakLocation>Start</BreakLocation>');

    const undone = undoAll({ root: doc.root, index }, applied.value);
    expect(undone.isRight()).toBe(true);
    expect(xmlAdapter.serialize(doc)).toBe(xml);
  });

  it('quitarlo con null borra el bloque (y el undo lo reinserta)', () => {
    const { xml, doc, index } = open('BTCQualityControl.rdlc');
    // El rectángulo contiene un Tablix con saltos de grupo: solo se quita el suyo.
    const before = (xml.match(/<PageBreak>/g) ?? []).length;

    const applied = applyCommand(
      { root: doc.root, index },
      { cmd: 'setItemPageBreak', id: 'Rectangle1', breakLocation: null },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    const after = (xmlAdapter.serialize(doc).match(/<PageBreak>/g) ?? []).length;
    expect(after).toBe(before - 1);

    const undone = undoAll({ root: doc.root, index }, applied.value);
    expect(undone.isRight()).toBe(true);
    expect(xmlAdapter.serialize(doc)).toBe(xml);
  });

  it('la proyección lee el salto de página del item', () => {
    const withBreak = projectionAdapter.project({
      sessionId: 'test',
      filePath: 'SalesCreditMemoDEU.rdlc',
      document: xmlAdapter.parse(corpusByName('SalesCreditMemoDEU.rdlc').xml),
      version: 1,
    });
    const rectangle = findItemDeep(withBreak, 'Rectangle3');
    expect(rectangle?.pageBreak).toBe('End');

    const without = projectionAdapter.project({
      sessionId: 'test',
      filePath: 'PalletOutput.rdlc',
      document: xmlAdapter.parse(corpusByName('PalletOutput.rdlc').xml),
      version: 1,
    });
    expect(findItemDeep(without, 'Rectangle1')?.pageBreak).toBeUndefined();
  });
});

/** Subárbol XML balanceado del item con ese `Name` (evita cortar en anidados). */
function subtreeOf(output: string, name: string): string {
  const start = output.indexOf(`Name="${name}"`);
  if (start === -1) return '';
  const tagStart = output.lastIndexOf('<', start);
  const tagName = /^<([A-Za-z]+)/.exec(output.slice(tagStart))?.[1];
  if (!tagName) return '';

  const open = new RegExp(`<${tagName}(\\s|>)`, 'g');
  const close = new RegExp(`</${tagName}>`, 'g');
  let depth = 0;
  let index = tagStart;
  while (index < output.length) {
    open.lastIndex = index;
    close.lastIndex = index;
    const nextOpen = open.exec(output);
    const nextClose = close.exec(output);
    if (!nextClose) break;
    if (nextOpen && nextOpen.index < nextClose.index) {
      depth += 1;
      index = nextOpen.index + 1;
    } else {
      depth -= 1;
      index = nextClose.index + nextClose[0].length;
      if (depth === 0) return output.slice(tagStart, index);
    }
  }
  return output.slice(tagStart);
}

function findItemDeep(
  projection: ReturnType<TrueFormatProjectionAdapter['project']>,
  id: string,
): ItemDto | undefined {
  const walk = (items: ItemDto[]): ItemDto | undefined => {
    for (const item of items) {
      if (item.id === id) return item;
      if (item.kind === 'rectangle') {
        const found = walk(item.children);
        if (found) return found;
      }
      if (item.kind === 'tablix') {
        for (const row of item.body.rows) {
          for (const cell of row.cells) {
            if (!cell?.content) continue;
            const found = walk([cell.content]);
            if (found) return found;
          }
        }
      }
    }
    return undefined;
  };

  for (const region of [projection.page.header, projection.page.body, projection.page.footer]) {
    const found = walk(region.items);
    if (found) return found;
  }
  return undefined;
}
