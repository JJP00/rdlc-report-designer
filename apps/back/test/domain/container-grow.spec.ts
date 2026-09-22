import { describe, expect, it } from 'vitest';
import { applyCommand } from '../../src/domain/document/commands/applyCommand.js';
import { DocumentIndex } from '../../src/domain/document/index/DocumentIndex.js';
import { readLength } from '../../src/domain/document/geometry/geometry.js';
import { toCm } from '../../src/domain/document/style/Length.js';
import { TrueFormatXmlAdapter } from '../../src/infrastructure/rdlc/TrueFormatXmlAdapter.js';
import { corpusByName } from '../golden/fixtures.js';
import { appliedOf, undoAll } from './command-test-utils.js';

/**
 * F1 — el contenedor crece para envolver a sus hijos (como el diseñador):
 * mover un hijo fuera de un rectángulo con tamaño explícito agranda el
 * rectángulo; los contenedores implícitos 0×0 (celdas) no se tocan.
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

describe('F1 · auto-crecimiento del contenedor', () => {
  it('mover un hijo fuera del rectángulo agranda el rectángulo (y el undo lo restaura)', () => {
    const { xml, doc, index } = open('SalesInvoiceESP.rdlc');

    // Rectangle1 del encabezado: 7.4752 × 3.04894 cm (tamaño explícito).
    const rectangle = index.get('Rectangle1')!;
    expect(readLength(rectangle, 'Width')).toBeDefined();

    // Hijo que se sale por la derecha: left 6cm + ancho 2.26cm = 8.26cm.
    const childId = 'Textbox4';
    const child = index.get(childId)!;
    expect(toCm(readLength(child, 'Left')!)).toBeLessThan(6);

    const applied = applyCommand(
      { root: doc.root, index },
      {
        cmd: 'setLocation',
        id: childId,
        top: readLength(child, 'Top')!,
        left: { value: 6, unit: 'cm' },
      },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    // El contenedor ha crecido hasta envolverlo.
    const grownWidth = toCm(readLength(rectangle, 'Width')!);
    const childRight = 6 + toCm(readLength(child, 'Width')!);
    expect(grownWidth).toBeCloseTo(childRight, 6);

    // Los valores normalizados incluyen al contenedor.
    expect(appliedOf(applied.value, 'Rectangle1')).toMatchObject({
      width: { value: childRight, unit: 'cm' },
    });

    // Undo: bytes exactos (posición del hijo + tamaño del contenedor).
    const undone = undoAll({ root: doc.root, index }, applied.value);
    expect(undone.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(xml);
  });

  it('los rectángulos 0×0 (implícitos, dentro de celdas) no crecen', () => {
    const { doc, index } = open('PalletOutput.rdlc');

    // Rectangle1 en PalletOutput: sin tamaño explícito (lo pone la celda).
    const implicit = index.get('Rectangle1')!;
    const implicitWidth = readLength(implicit, 'Width');
    expect(implicitWidth === undefined || toCm(implicitWidth) === 0).toBe(true);

    const child = index.get('Textbox25')!;
    const applied = applyCommand(
      { root: doc.root, index },
      {
        cmd: 'setLocation',
        id: 'Textbox25',
        top: { value: 1, unit: 'cm' },
        left: { value: 12, unit: 'cm' },
      },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    // El rectángulo no se toca (sigue sin tamaño); solo cambia el hijo.
    const afterWidth = readLength(implicit, 'Width');
    expect(afterWidth === undefined || toCm(afterWidth) === 0).toBe(true);
    expect(toCm(readLength(child, 'Left')!)).toBe(12);
    expect(appliedOf(applied.value, 'Rectangle1')).toBeUndefined();
  });

  it('agrandar un hijo también agranda el contenedor (setSize)', () => {
    const { doc, index } = open('SalesInvoiceESP.rdlc');
    const rectangle = index.get('Rectangle1')!;
    const before = toCm(readLength(rectangle, 'Width')!);

    const child = index.get('Textbox4')!;
    const childLeft = toCm(readLength(child, 'Left')!);
    const newWidth = before; // el hijo pasa a medir todo el ancho del contenedor + margen

    const applied = applyCommand(
      { root: doc.root, index },
      {
        cmd: 'setSize',
        id: 'Textbox4',
        width: { value: newWidth, unit: 'cm' },
        height: readLength(child, 'Height')!,
      },
    );
    expect(applied.isRight()).toBe(true);

    const grownWidth = toCm(readLength(rectangle, 'Width')!);
    expect(grownWidth).toBeCloseTo(childLeft + newWidth, 6);
    expect(grownWidth).toBeGreaterThan(before);
  });
});
