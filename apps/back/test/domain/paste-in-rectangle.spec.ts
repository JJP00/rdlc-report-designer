import { describe, expect, it } from 'vitest';
import { undoAll } from './command-test-utils.js';
import { applyCommand } from '../../src/domain/document/commands/applyCommand.js';
import type { CommandContext } from '../../src/domain/document/commands/CommandContext.js';
import { readLength } from '../../src/domain/document/geometry/geometry.js';
import { toCm } from '../../src/domain/document/style/Length.js';
import { DocumentIndex } from '../../src/domain/document/index/DocumentIndex.js';
import type { RdlcNode } from '../../src/domain/document/tree/RdlcNode.js';
import { corpusByName } from '../golden/fixtures.js';
import { TrueFormatXmlAdapter } from '../../src/infrastructure/rdlc/TrueFormatXmlAdapter.js';

/**
 * Pegar dentro de un rectángulo: los clones conservan el `Top`/`Left` de su
 * origen, así que se desplazan (como grupo) para quedar dentro de él; si no
 * caben, a su esquina. Sin tamaño declarado en el rectángulo no se toca nada.
 */

const adapter = new TrueFormatXmlAdapter();

const XML = `<?xml version="1.0" encoding="utf-8"?>
<Report xmlns="http://schemas.microsoft.com/sqlserver/reporting/2016/01/reportdefinition">
  <ReportSections>
    <ReportSection>
      <Body>
        <ReportItems>
          <Rectangle Name="Box"><ReportItems /><Top>1cm</Top><Left>1cm</Left><Height>3cm</Height><Width>4cm</Width></Rectangle>
          <Rectangle Name="Bare"><ReportItems /><Top>5cm</Top><Left>1cm</Left></Rectangle>
          <Rectangle Name="Far"><Top>6.7cm</Top><Left>11.6cm</Left><Height>0.3cm</Height><Width>0.5cm</Width></Rectangle>
          <Rectangle Name="FarToo"><Top>7.7cm</Top><Left>12.6cm</Left><Height>0.3cm</Height><Width>0.5cm</Width></Rectangle>
          <Rectangle Name="Huge"><Top>2cm</Top><Left>2cm</Left><Height>9cm</Height><Width>9cm</Width></Rectangle>
          <Rectangle Name="Inside"><Top>0.5cm</Top><Left>0.5cm</Left><Height>1cm</Height><Width>1cm</Width></Rectangle>
        </ReportItems>
        <Height>10cm</Height>
      </Body>
    </ReportSection>
  </ReportSections>
</Report>`;

function open(): { ctx: CommandContext; serialize: () => string } {
  const doc = adapter.parse(XML);
  const ctx = { root: doc.root, index: DocumentIndex.build(doc.root) };
  return { ctx, serialize: () => adapter.serialize(doc) };
}

function source(ctx: CommandContext, name: string): RdlcNode {
  return ctx.index.get(name)!.clone();
}

/** Clones pegados en el rectángulo `container` (el índice no se refresca en el dominio). */
function pasted(ctx: CommandContext, container: string): RdlcNode[] {
  return ctx.index.get(container)!.child('ReportItems')!.children();
}

function pos(node: RdlcNode): { top: number; left: number } {
  return { top: toCm(readLength(node, 'Top')!), left: toCm(readLength(node, 'Left')!) };
}

describe('pegar dentro de un rectángulo', () => {
  it('mete un clon lejano en el rectángulo', () => {
    const { ctx } = open();
    const result = applyCommand(ctx, {
      cmd: 'insertClone',
      scope: { kind: 'rectangle', id: 'Box' },
      index: 0,
      source: source(ctx, 'Far'),
    });
    expect(result.isRight()).toBe(true);
    const { top, left } = pos(pasted(ctx, 'Box')[0]!);
    // 0,5 × 0,3 cm en un rectángulo de 4 × 3 cm: pegado a la esquina inferior derecha.
    expect(left).toBeCloseTo(4 - 0.5, 6);
    expect(top).toBeCloseTo(3 - 0.3, 6);
  });

  it('no mueve un clon que ya cabe', () => {
    const { ctx } = open();
    const result = applyCommand(ctx, {
      cmd: 'insertClone',
      scope: { kind: 'rectangle', id: 'Box' },
      index: 0,
      source: source(ctx, 'Inside'),
    });
    expect(result.isRight()).toBe(true);
    expect(pos(pasted(ctx, 'Box')[0]!)).toEqual({ top: 0.5, left: 0.5 });
  });

  it('si no cabe, lo deja en la esquina', () => {
    const { ctx } = open();
    const result = applyCommand(ctx, {
      cmd: 'insertClone',
      scope: { kind: 'rectangle', id: 'Box' },
      index: 0,
      source: source(ctx, 'Huge'),
    });
    expect(result.isRight()).toBe(true);
    expect(pos(pasted(ctx, 'Box')[0]!)).toEqual({ top: 0, left: 0 });
  });

  it('desplaza el lote entero y conserva su disposición relativa', () => {
    const { ctx } = open();
    const result = applyCommand(ctx, {
      cmd: 'insertClones',
      scope: { kind: 'rectangle', id: 'Box' },
      index: 0,
      sources: [source(ctx, 'Far'), source(ctx, 'FarToo')],
    });
    expect(result.isRight()).toBe(true);
    const ids = result.isRight() ? result.value.createdIds! : [];
    const [firstNode, secondNode] = pasted(ctx, 'Box');
    const first = pos(firstNode!);
    const second = pos(secondNode!);
    // Mismo desfase que en origen (1 cm abajo y a la derecha) y todo dentro de 4 × 3 cm.
    expect(second.top - first.top).toBeCloseTo(1, 6);
    expect(second.left - first.left).toBeCloseTo(1, 6);
    expect(second.left + 0.5).toBeCloseTo(4, 6);
    expect(second.top + 0.3).toBeCloseTo(3, 6);
    // La geometría que se devuelve al front es la ya ajustada.
    const applied = result.isRight() ? result.value.applied! : [];
    expect(applied.map((entry) => entry.id)).toEqual(ids);
  });

  it('no toca un rectángulo sin tamaño declarado', () => {
    const { ctx } = open();
    const result = applyCommand(ctx, {
      cmd: 'insertClone',
      scope: { kind: 'rectangle', id: 'Bare' },
      index: 0,
      source: source(ctx, 'Far'),
    });
    expect(result.isRight()).toBe(true);
    expect(pos(pasted(ctx, 'Bare')[0]!)).toEqual({ top: 6.7, left: 11.6 });
  });

  it('el undo del pegado devuelve el documento tal cual', () => {
    const { ctx, serialize } = open();
    const before = serialize();
    const result = applyCommand(ctx, {
      cmd: 'insertClone',
      scope: { kind: 'rectangle', id: 'Box' },
      index: 0,
      source: source(ctx, 'Far'),
    });
    expect(result.isRight()).toBe(true);
    if (result.isRight()) undoAll(ctx, result.value);
    expect(serialize()).toBe(before);
  });
});

describe('pegar en un rectángulo dentro de una celda (informe real)', () => {
  it('SalesCreditMemoESP (fila 5, col 1 de LinesTable2): el clon de BTC_Header_Carrier queda dentro del rectángulo de la celda', () => {
    const real = new TrueFormatXmlAdapter();
    const doc = real.parse(corpusByName('SalesCreditMemoESP.rdlc').xml);
    const ctx = { root: doc.root, index: DocumentIndex.build(doc.root) };

    const deleted = applyCommand(ctx, { cmd: 'deleteItem', id: 'Textbox170' });
    expect(deleted.isRight()).toBe(true);
    ctx.index = DocumentIndex.build(doc.root);

    const scope = { kind: 'tablixCell', id: 'LinesTable2', row: 4, col: 0 } as const;
    const inserted = applyCommand(ctx, {
      cmd: 'insertItem',
      scope,
      index: 0,
      item: {
        kind: 'rectangle',
        top: { value: 0, unit: 'cm' },
        left: { value: 0, unit: 'cm' },
        width: { value: 2, unit: 'cm' },
        height: { value: 1, unit: 'cm' },
      },
    });
    expect(inserted.isRight()).toBe(true);
    const rectangleId = inserted.isRight() ? inserted.value.createdId! : '';
    ctx.index = DocumentIndex.build(doc.root);

    const pastedResult = applyCommand(ctx, {
      cmd: 'insertClone',
      scope: { kind: 'rectangle', id: rectangleId },
      index: 0,
      source: ctx.index.get('BTC_Header_Carrier')!.clone(),
    });
    expect(pastedResult.isRight()).toBe(true);

    const rectangle = ctx.index.get(rectangleId)!;
    const width = toCm(readLength(rectangle, 'Width')!);
    const height = toCm(readLength(rectangle, 'Height')!);
    const clone = rectangle.child('ReportItems')!.children()[0]!;
    const { top, left } = pos(clone);
    expect(left).toBeGreaterThanOrEqual(0);
    expect(top).toBeGreaterThanOrEqual(0);
    expect(left + toCm(readLength(clone, 'Width')!)).toBeLessThanOrEqual(width + 1e-9);
    expect(top + toCm(readLength(clone, 'Height')!)).toBeLessThanOrEqual(height + 1e-9);
  });
});
