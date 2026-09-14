import { describe, expect, it } from 'vitest';
import { applyCommand } from '../../src/domain/document/commands/applyCommand.js';
import { DocumentIndex } from '../../src/domain/document/index/DocumentIndex.js';
import type { RdlcNode } from '../../src/domain/document/tree/RdlcNode.js';
import { TrueFormatXmlAdapter } from '../../src/infrastructure/rdlc/TrueFormatXmlAdapter.js';
import { corpusByName } from '../golden/fixtures.js';

/**
 * F1 — comandos con inverso.
 *
 * La propiedad clave: aplicar un comando y luego su inversa devuelve el
 * documento **byte a byte** al original (parcheo quirúrgico + undo gratis).
 */

const adapter = new TrueFormatXmlAdapter();

function open(name: string): { xml: string; doc: ReturnType<TrueFormatXmlAdapter['parse']>; index: DocumentIndex } {
  const { xml } = corpusByName(name);
  const doc = adapter.parse(xml);
  return { xml, doc, index: DocumentIndex.build(doc.root) };
}

function firstTextboxWithGeometry(index: DocumentIndex): RdlcNode {
  for (const name of index.names()) {
    const node = index.get(name);
    if (node && node.tagName === 'Textbox' && node.child('Top') && node.child('Left')) return node;
  }
  throw new Error('El corpus no tiene textboxes con geometría');
}

/** `"17.84194cm"` → `"17.84195cm"` (misma longitud, un carácter distinto). */
function bumpLastDigit(raw: string): string {
  const match = /^(.*?)(\d)(cm|mm|in|pt)$/.exec(raw);
  if (!match) throw new Error(`Sin dígito que incrementar en '${raw}'`);
  return `${match[1]}${(Number(match[2]) + 1) % 10}${match[3]}`;
}

/** `"17.84195cm"` → `{ value: 17.84195, unit: 'cm' }` para el comando. */
function parseExpected(raw: string): { value: number; unit: 'cm' | 'mm' | 'in' | 'pt' } {
  const match = /^(\d+(?:\.\d+)?)(cm|mm|in|pt)$/.exec(raw);
  if (!match) throw new Error(`Longitud no parseable: '${raw}'`);
  return { value: Number(match[1]), unit: match[2] as 'cm' | 'mm' | 'in' | 'pt' };
}

describe('F1 · DocumentIndex', () => {
  it('indexa los nombres del corpus (unicidad y tamaño)', () => {
    const { index } = open('PalletOutput.rdlc');
    expect(index.size).toBeGreaterThan(5);
    expect(index.get('Tablix4')).toBeDefined();
    expect(index.get('no-existe')).toBeUndefined();
  });
});

describe('F1 · setLocation', () => {
  it('mueve el item y la inversa restaura los bytes exactos', () => {
    const { xml, doc, index } = open('PalletOutput.rdlc');
    const target = firstTextboxWithGeometry(index);
    const id = target.attribute('Name')!;
    const previousTop = target.child('Top')!.text()!;
    const previousLeft = target.child('Left')!.text()!;

    expect(doc.isDirty()).toBe(false);

    const applied = applyCommand(
      { root: doc.root, index },
      { cmd: 'setLocation', id, top: { value: 2.1, unit: 'cm' }, left: { value: 1.4, unit: 'cm' } },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    expect(doc.isDirty()).toBe(true);
    const moved = adapter.serialize(doc);
    expect(moved).toContain('<Top>2.1cm</Top>');
    expect(moved).toContain('<Left>1.4cm</Left>');
    expect(moved.length).toBeGreaterThan(0);
    expect(moved).not.toBe(xml);

    // Deshacer = aplicar la inversa.
    const undone = applyCommand({ root: doc.root, index }, applied.value.inverse);
    expect(undone.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(xml);
    expect(target.child('Top')!.text()).toBe(previousTop);
    expect(target.child('Left')!.text()).toBe(previousLeft);
  });

  it('no altera ningún otro fragmento del documento (mismo tamaño y solo 2 valores)', () => {
    const { xml, doc, index } = open('BTCLoadingOrder.rdlc');
    const target = firstTextboxWithGeometry(index);
    const id = target.attribute('Name')!;
    const oldTop = target.child('Top')!.text()!;
    const oldLeft = target.child('Left')!.text()!;
    // Cambios de la MISMA longitud para poder comparar carácter a carácter.
    const newTop = bumpLastDigit(oldTop);
    const newLeft = bumpLastDigit(oldLeft);

    const applied = applyCommand(
      { root: doc.root, index },
      {
        cmd: 'setLocation',
        id,
        top: parseExpected(newTop),
        left: parseExpected(newLeft),
      },
    );
    expect(applied.isRight()).toBe(true);

    const moved = adapter.serialize(doc);
    expect(moved.length).toBe(xml.length);
    expect(
      moved
        .replace(`<Top>${newTop}</Top>`, `<Top>${oldTop}</Top>`)
        .replace(`<Left>${newLeft}</Left>`, `<Left>${oldLeft}</Left>`),
    ).toBe(xml);
  });

  it('rechaza ids inexistentes con E_COMMAND_REJECTED', () => {
    const { doc, index } = open('PalletOutput.rdlc');
    const result = applyCommand(
      { root: doc.root, index },
      { cmd: 'setLocation', id: 'NoExiste', top: { value: 1, unit: 'cm' }, left: { value: 1, unit: 'cm' } },
    );
    expect(result.isLeft()).toBe(true);
    if (result.isLeft()) expect(result.value.code).toBe('E_COMMAND_REJECTED');
  });
});

describe('F1 · setText', () => {
  it('edita un valor y la inversa restaura el texto anterior', () => {
    const { xml, doc, index } = open('PalletOutput.rdlc');
    const target = firstTextboxWithGeometry(index);
    const id = target.attribute('Name')!;

    const applied = applyCommand(
      { root: doc.root, index },
      { cmd: 'setText', id, p: 0, r: 0, value: '=Fields!Item_No.Value' },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    expect(adapter.serialize(doc)).toContain('=Fields!Item_No.Value');

    const undone = applyCommand({ root: doc.root, index }, applied.value.inverse);
    expect(undone.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(xml);
  });

  it('rechaza runs inexistentes', () => {
    const { doc, index } = open('PalletOutput.rdlc');
    const target = firstTextboxWithGeometry(index);
    const id = target.attribute('Name')!;
    const result = applyCommand(
      { root: doc.root, index },
      { cmd: 'setText', id, p: 99, r: 99, value: 'x' },
    );
    expect(result.isLeft()).toBe(true);
  });
});

describe('F1 · setSize', () => {
  it('redimensiona y la inversa restaura los bytes exactos', () => {
    const { xml, doc, index } = open('SalesShipment.rdlc');
    const target = firstTextboxWithGeometry(index);
    const id = target.attribute('Name')!;

    const applied = applyCommand(
      { root: doc.root, index },
      { cmd: 'setSize', id, width: { value: 5.5, unit: 'cm' }, height: { value: 1.2, unit: 'cm' } },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;
    expect(adapter.serialize(doc)).toContain('<Width>5.5cm</Width>');

    const undone = applyCommand({ root: doc.root, index }, applied.value.inverse);
    expect(undone.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(xml);
  });
});

describe('F1 · límites de región (invariante: no salir del body/cabecera/pie)', () => {
  it('clampa la posición dentro del body y la inversa restaura los bytes', () => {
    const { xml, doc, index } = open('BTCLoadingOrder.rdlc');
    const target = firstTextboxWithGeometry(index);
    const id = target.attribute('Name')!;
    const bounds = index.boundsOf(id);

    const applied = applyCommand(
      { root: doc.root, index },
      { cmd: 'setLocation', id, top: { value: 999, unit: 'cm' }, left: { value: 999, unit: 'cm' } },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    const top = parseExpected(target.child('Top')!.text()!);
    const left = parseExpected(target.child('Left')!.text()!);
    const width = parseExpected(target.child('Width')!.text()!);
    const height = parseExpected(target.child('Height')!.text()!);

    expect(top.value + height.value).toBeLessThanOrEqual(bounds.height.value + 1e-6);
    expect(left.value + width.value).toBeLessThanOrEqual(bounds.width.value + 1e-6);

    // Los valores normalizados viajan para que el front reconcilie.
    expect(applied.value.applied).toMatchObject({ top, left });

    const undone = applyCommand({ root: doc.root, index }, applied.value.inverse);
    expect(undone.isRight()).toBe(true);
    expect(adapter.serialize(doc)).toBe(xml);
  });

  it('clampa a 0 las posiciones negativas', () => {
    const { doc, index } = open('SalesShipment.rdlc');
    const target = firstTextboxWithGeometry(index);
    const id = target.attribute('Name')!;

    const applied = applyCommand(
      { root: doc.root, index },
      { cmd: 'setLocation', id, top: { value: -5, unit: 'cm' }, left: { value: -3, unit: 'cm' } },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    expect(target.child('Top')!.text()).toBe('0cm');
    expect(target.child('Left')!.text()).toBe('0cm');
  });

  it('un item del encabezado no puede salir del encabezado', () => {
    const { doc, index } = open('BTCLoadingOrder.rdlc');
    const headerName = index
      .names()
      .find((name) => index.regionOf(name) === 'pageHeader' && index.get(name)!.child('Top'));
    expect(headerName).toBeDefined();
    const id = headerName!;
    const bounds = index.boundsOf(id);

    const applied = applyCommand(
      { root: doc.root, index },
      { cmd: 'setLocation', id, top: { value: 999, unit: 'cm' }, left: { value: 0, unit: 'cm' } },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    const top = parseExpected(index.get(id)!.child('Top')!.text()!);
    const height = parseExpected(index.get(id)!.child('Height')!.text()!);
    expect(top.value + height.value).toBeLessThanOrEqual(bounds.height.value + 1e-6);
  });

  it('setSize no deja que el item se salga de su región', () => {
    const { doc, index } = open('PalletOutput.rdlc');
    const target = firstTextboxWithGeometry(index);
    const id = target.attribute('Name')!;
    const bounds = index.boundsOf(id);

    const applied = applyCommand(
      { root: doc.root, index },
      { cmd: 'setSize', id, width: { value: 999, unit: 'cm' }, height: { value: 999, unit: 'cm' } },
    );
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    const width = parseExpected(target.child('Width')!.text()!);
    const height = parseExpected(target.child('Height')!.text()!);
    const left = parseExpected(target.child('Left')!.text()!);
    const top = parseExpected(target.child('Top')!.text()!);
    expect(left.value + width.value).toBeLessThanOrEqual(bounds.width.value + 1e-6);
    expect(top.value + height.value).toBeLessThanOrEqual(bounds.height.value + 1e-6);
  });
});

describe('F1 · comandos no implementados', () => {
  it('se rechazan explícitamente, nunca en silencio', () => {
    const { doc, index } = open('PalletOutput.rdlc');
    const result = applyCommand({ root: doc.root, index }, { cmd: 'deleteItem', id: 'Textbox25' });
    expect(result.isLeft()).toBe(true);
    if (result.isLeft()) expect(result.value.errorMessage).toContain('no implementado');
  });
});
