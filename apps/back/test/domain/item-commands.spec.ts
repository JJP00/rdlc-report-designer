import { describe, expect, it } from 'vitest';
import { applyCommand } from '../../src/domain/document/commands/applyCommand.js';
import { DocumentIndex } from '../../src/domain/document/index/DocumentIndex.js';
import type { RdlcNode } from '../../src/domain/document/tree/RdlcNode.js';
import { TrueFormatXmlAdapter } from '../../src/infrastructure/rdlc/TrueFormatXmlAdapter.js';
import { corpusByName } from '../golden/fixtures.js';
import { appliedOf, undoAll } from './command-test-utils.js';

/**
 * F1 — insertar / duplicar / eliminar items.
 *
 * Propiedad clave en todos: después del undo el XML es **byte a byte** el
 * original (los inversos internos reinsertan el mismo subárbol sin regenerar).
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

describe('F1 · insertItem', () => {
  it('inserta un textbox en el cuerpo con hijos obligatorios y orden canónico', () => {
    const { doc, index } = open('PalletOutput.rdlc');

    const applied = applyCommand(
      { root: doc.root, index },
      {
        cmd: 'insertItem',
        scope: { kind: 'body' },
        index: 0,
        item: {
          kind: 'textbox',
          name: 'TextboxNuevo',
          top: { value: 1, unit: 'cm' },
          left: { value: 2, unit: 'cm' },
          width: { value: 5, unit: 'cm' },
          height: { value: 0.5, unit: 'cm' },
          text: 'Hola',
        },
      },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    const output = adapter.serialize(doc);
    expect(output).toContain('Name="TextboxNuevo"');
    expect(output).toContain('<Value>Hola</Value>');
    expect(output).toContain('<CanGrow>true</CanGrow>');
    expect(appliedOf(applied.value, 'TextboxNuevo')).toMatchObject({
      top: { value: 1, unit: 'cm' },
      left: { value: 2, unit: 'cm' },
    });

    // Orden canónico: Top antes que Height y Paragraphs al final.
    const inserted = output.slice(output.indexOf('TextboxNuevo'));
    expect(inserted.indexOf('<Top>1cm</Top>')).toBeLessThan(
      inserted.indexOf('<Height>0.5cm</Height>'),
    );
    expect(inserted.indexOf('<Height>')).toBeLessThan(inserted.indexOf('<Paragraphs>'));
  });

  it('el undo de la inserción deja el XML byte a byte igual', () => {
    const { xml, doc, index } = open('PalletOutput.rdlc');

    const applied = applyCommand(
      { root: doc.root, index },
      {
        cmd: 'insertItem',
        scope: { kind: 'body' },
        index: 0,
        item: {
          kind: 'rectangle',
          name: 'RectangleNuevo',
          top: { value: 3, unit: 'cm' },
          left: { value: 3, unit: 'cm' },
          width: { value: 4, unit: 'cm' },
          height: { value: 2, unit: 'cm' },
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

  it('rechaza nombres duplicados', () => {
    const { doc, index } = open('PalletOutput.rdlc');
    const result = applyCommand(
      { root: doc.root, index },
      {
        cmd: 'insertItem',
        scope: { kind: 'body' },
        index: 0,
        item: {
          kind: 'textbox',
          name: 'Tablix4',
          top: { value: 0, unit: 'cm' },
          left: { value: 0, unit: 'cm' },
          width: { value: 1, unit: 'cm' },
          height: { value: 1, unit: 'cm' },
        },
      },
    );
    expect(result.isLeft()).toBe(true);
  });

  it('inserta dentro de un rectángulo (scope rectangle)', () => {
    const { doc, index } = open('SalesInvoiceESP.rdlc');
    const inside = applyCommand(
      { root: doc.root, index },
      {
        cmd: 'insertItem',
        scope: { kind: 'rectangle', id: 'Rectangle1' },
        index: 0,
        item: {
          kind: 'textbox',
          name: 'TextboxDentro',
          top: { value: 0.5, unit: 'cm' },
          left: { value: 0.5, unit: 'cm' },
          width: { value: 3, unit: 'cm' },
          height: { value: 0.5, unit: 'cm' },
          text: '=Fields!BTCClientName.Value',
        },
      },
    );
    expect(inside.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toContain('Name="TextboxDentro"');
  });

  it('normaliza la posición: un item soltado fuera de la banda entra en ella', () => {
    const { doc, index } = open('PalletOutput.rdlc');
    const body = index.bounds().body;

    const result = applyCommand(
      { root: doc.root, index },
      {
        cmd: 'insertItem',
        scope: { kind: 'body' },
        index: 0,
        item: {
          kind: 'textbox',
          name: 'TextboxBorde',
          // Muy a la derecha y por debajo del final del cuerpo.
          top: { value: 999, unit: 'cm' },
          left: { value: 999, unit: 'cm' },
          width: { value: 5, unit: 'cm' },
          height: { value: 1, unit: 'cm' },
        },
      },
    );
    expect(result.isRight()).toBe(true);
    if (!result.isRight()) return;

    const applied = appliedOf(result.value, 'TextboxBorde');
    expect(applied).toMatchObject({
      top: { value: body.height.value - 1, unit: 'cm' },
      left: { value: body.width.value - 5, unit: 'cm' },
    });
  });
});

describe('F2 · insertItem tablix', () => {
  it('crea la rejilla 2×3 (celdas con textbox), ambas jerarquías y undo byte-exacto', () => {
    const { xml, doc, index } = open('PalletOutput.rdlc');

    const applied = applyCommand(
      { root: doc.root, index },
      {
        cmd: 'insertItem',
        scope: { kind: 'body' },
        index: 0,
        item: {
          kind: 'tablix',
          top: { value: 1, unit: 'cm' },
          left: { value: 2, unit: 'cm' },
          // Total: 7,5 × 1,2 cm → celdas de 2,5 × 0,6 cm.
          width: { value: 7.5, unit: 'cm' },
          height: { value: 1.2, unit: 'cm' },
        },
      },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    const id = applied.value.createdId;
    expect(id).toMatch(/^Tablix\d+$/);
    if (!id) return;

    const output = adapter.serialize(doc);
    const start = output.indexOf(`Name="${id}"`);
    const inserted = output.slice(start, output.indexOf('</Tablix>', start));
    expect(inserted).toContain('<TablixBody>');
    expect(inserted).toContain('<TablixColumnHierarchy>');
    expect(inserted).toContain('<TablixRowHierarchy>');
    // 3 columnas de 2,5 cm y 2 filas de 0,6 cm.
    expect((inserted.match(/<Width>2\.5cm<\/Width>/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect((inserted.match(/<Height>0\.6cm<\/Height>/g) ?? []).length).toBeGreaterThanOrEqual(2);

    const rebuilt = DocumentIndex.build(doc.root);
    const tablix = rebuilt.get(id);
    const rows = tablix?.child('TablixBody')?.child('TablixRows')?.children('TablixRow') ?? [];
    expect(rows).toHaveLength(2);
    const firstRowCells = rows[0]?.child('TablixCells')?.children('TablixCell') ?? [];
    expect(firstRowCells).toHaveLength(3);

    // Las 6 celdas nacen con un Textbox con nombre propio y libre.
    const textboxNames = rows.flatMap(
      (row) =>
        row
          .child('TablixCells')
          ?.children('TablixCell')
          .map((cell) => cell.child('CellContents')?.child('Textbox')?.attribute('Name') ?? '') ??
        [],
    );
    expect(textboxNames).toHaveLength(6);
    expect(new Set(textboxNames).size).toBe(6);
    for (const name of textboxNames) {
      expect(name).toMatch(/^Textbox\d+$/);
      expect(rebuilt.get(name)).toBeDefined();
    }

    // Jerarquías a juego: 3 columnas y 2 filas.
    expect(
      tablix?.child('TablixColumnHierarchy')?.child('TablixMembers')?.children('TablixMember'),
    ).toHaveLength(3);
    expect(
      tablix?.child('TablixRowHierarchy')?.child('TablixMembers')?.children('TablixMember'),
    ).toHaveLength(2);

    const undone = undoAll({ root: doc.root, index }, applied.value);
    expect(undone.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(xml);
  });
});

describe('F1 · duplicateItem', () => {
  it('clona el subárbol exacto con nombre nuevo y el undo lo elimina', () => {
    const { xml, doc, index } = open('SalesInvoiceESP.rdlc');

    const applied = applyCommand(
      { root: doc.root, index },
      { cmd: 'duplicateItem', id: 'Textbox23', name: 'Textbox23Copia' },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    const output = adapter.serialize(doc);
    expect(output).toContain('Name="Textbox23Copia"');
    // El clon conserva valor y estilo del original.
    expect(output.match(/BTCClientName/g)?.length).toBeGreaterThan(2);

    const undone = undoAll({ root: doc.root, index }, applied.value);
    expect(undone.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(xml);
  });

  it('renombra los hijos del contenedor clonado (no quedan nombres repetidos)', () => {
    const { xml, doc, index } = open('SalesInvoiceESP.rdlc');

    const original = index.get('Rectangle1');
    expect(original).toBeDefined();
    if (!original) return;
    const childNames = collectNames(original);
    expect(childNames.length).toBeGreaterThan(0);

    const applied = applyCommand(
      { root: doc.root, index },
      { cmd: 'duplicateItem', id: 'Rectangle1' },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    const cloneName = applied.value.applied?.[0]?.id;
    expect(cloneName).toBeDefined();
    if (!cloneName) return;

    const rebuilt = DocumentIndex.build(doc.root);
    const clone = rebuilt.get(cloneName);
    expect(clone).toBeDefined();
    if (!clone) return;

    // Mismo número de hijos, ninguno repite nombre con el original.
    const cloneChildNames = collectNames(clone);
    expect(cloneChildNames).toHaveLength(childNames.length);
    for (const name of cloneChildNames) expect(childNames).not.toContain(name);

    // El original sigue siendo el dueño de sus nombres.
    for (const name of childNames) {
      const node = rebuilt.get(name);
      expect(node).toBeDefined();
      expect(isDescendantOf(node!, original)).toBe(true);
    }

    // Y el `rd:DefaultName` de los hijos acompaña al nombre nuevo.
    for (const child of clone.children()) {
      const name = child.attribute('Name');
      const defaultName = child.children('rd:DefaultName')[0]?.text();
      if (name && defaultName !== undefined) expect(defaultName).toBe(name);
    }

    const undone = undoAll({ root: doc.root, index }, applied.value);
    expect(undone.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(xml);
  });
});

/** Nombres de item (`Name`) de todo el subárbol, sin contar la raíz. */
function collectNames(node: RdlcNode): string[] {
  const names: string[] = [];
  const walk = (child: RdlcNode): void => {
    const name = child.attribute('Name');
    if (name !== undefined) names.push(name);
    for (const grandChild of child.children()) walk(grandChild);
  };
  for (const child of node.children()) walk(child);
  return names;
}

function isDescendantOf(node: RdlcNode, ancestor: RdlcNode): boolean {
  let current = node.parent;
  while (current) {
    if (current.equals(ancestor)) return true;
    current = current.parent;
  }
  return false;
}

describe('F1 · deleteItem', () => {
  it('elimina el elemento y el undo lo restaura byte a byte', () => {
    const { xml, doc, index } = open('PalletOutput.rdlc');

    const applied = applyCommand({ root: doc.root, index }, { cmd: 'deleteItem', id: 'Textbox25' });
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    const removed = adapter.serialize(doc);
    expect(removed).not.toContain('Name="Textbox25"');

    const undone = undoAll({ root: doc.root, index }, applied.value);
    expect(undone.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(xml);
  });

  it('eliminar y volver a eliminar el mismo id falla (no hay elemento)', () => {
    const { doc, index } = open('PalletOutput.rdlc');
    applyCommand({ root: doc.root, index }, { cmd: 'deleteItem', id: 'Textbox25' });
    // El caso de uso real reconstruye el índice tras comandos estructurales.
    const rebuilt = DocumentIndex.build(doc.root);
    const again = applyCommand(
      { root: doc.root, index: rebuilt },
      { cmd: 'deleteItem', id: 'Textbox25' },
    );
    expect(again.isLeft()).toBe(true);
  });
});
