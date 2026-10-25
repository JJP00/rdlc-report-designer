import { describe, expect, it } from 'vitest';
import { undoAll } from './command-test-utils.js';
import { applyCommand } from '../../src/domain/document/commands/applyCommand.js';
import type { CommandContext } from '../../src/domain/document/commands/CommandContext.js';
import {
  copyCellContents,
  type CellClipboardEntry,
} from '../../src/domain/document/commands/pasteCells.js';
import { DocumentIndex } from '../../src/domain/document/index/DocumentIndex.js';
import type { RdlcNode } from '../../src/domain/document/tree/RdlcNode.js';
import { TrueFormatXmlAdapter } from '../../src/infrastructure/rdlc/TrueFormatXmlAdapter.js';

/**
 * Copiar y pegar celdas de un Tablix: copia del contenido con su diseño
 * relativo (`copyCellContents`) y pegado desde una celda ancla
 * (`insertCellClones`): bloque, huecos, recorte en el borde, fusiones,
 * sustitución, nombres únicos y un solo paso de undo byte-exacto.
 */

const adapter = new TrueFormatXmlAdapter();

function textbox(name: string, value: string): string {
  return `<Textbox Name="${name}"><Paragraphs><Paragraph><TextRuns><TextRun><Value>${value}</Value></TextRun></TextRuns></Paragraph></Paragraphs></Textbox>`;
}

function cell(inner: string, spans = ''): string {
  return `<TablixCell><CellContents>${inner}${spans}</CellContents></TablixCell>`;
}

/**
 * Tablix `T` de 4 columnas (2 cm) × 3 filas (0,6 / 0,6 / 0,9 cm):
 *   fila 0: a0 b0 c0 [Rectangle R con un Textbox dentro]
 *   fila 1: a1 b1 c1 [celda vacía: CellContents sin item]
 *   fila 2: [M fusionada en 2 columnas] c2 d2   (convención del editor: 3 celdas)
 * `a0` se referencia a sí mismo con `ReportItems!a0`.
 */
const XML = `<?xml version="1.0" encoding="utf-8"?>
<Report xmlns="http://schemas.microsoft.com/sqlserver/reporting/2016/01/reportdefinition">
  <ReportSections>
    <ReportSection>
      <Body>
        <ReportItems>
          <Tablix Name="T">
            <TablixBody>
              <TablixColumns>
                <TablixColumn><Width>2cm</Width></TablixColumn>
                <TablixColumn><Width>2cm</Width></TablixColumn>
                <TablixColumn><Width>2cm</Width></TablixColumn>
                <TablixColumn><Width>2cm</Width></TablixColumn>
              </TablixColumns>
              <TablixRows>
                <TablixRow><Height>0.6cm</Height><TablixCells>
                  ${cell(textbox('a0', '=ReportItems!a0.Value'))}
                  ${cell(textbox('b0', 'B0'))}
                  ${cell(textbox('c0', 'C0'))}
                  ${cell(`<Rectangle Name="R"><ReportItems>${textbox('Inner', 'in')}</ReportItems><Top>0.1cm</Top><Left>0.1cm</Left><Height>3cm</Height><Width>5cm</Width></Rectangle>`)}
                </TablixCells></TablixRow>
                <TablixRow><Height>0.6cm</Height><TablixCells>
                  ${cell(textbox('a1', 'A1'))}
                  ${cell(textbox('b1', 'B1'))}
                  ${cell(textbox('c1', 'C1'))}
                  <TablixCell><CellContents /></TablixCell>
                </TablixCells></TablixRow>
                <TablixRow><Height>0.9cm</Height><TablixCells>
                  ${cell(textbox('M', 'MERGED'), '<ColSpan>2</ColSpan>')}
                  ${cell(textbox('c2', 'C2'))}
                  ${cell(textbox('d2', 'D2'))}
                </TablixCells></TablixRow>
              </TablixRows>
            </TablixBody>
            <TablixRowHierarchy><TablixMembers><TablixMember /><TablixMember /><TablixMember /></TablixMembers></TablixRowHierarchy>
            <TablixColumnHierarchy><TablixMembers><TablixMember /><TablixMember /><TablixMember /><TablixMember /></TablixMembers></TablixColumnHierarchy>
          </Tablix>
        </ReportItems>
        <Height>5cm</Height>
      </Body>
    </ReportSection>
  </ReportSections>
</Report>`;

const documents = new WeakMap<CommandContext, ReturnType<TrueFormatXmlAdapter['parse']>>();

function open(): { xml: string; ctx: CommandContext } {
  const doc = adapter.parse(XML);
  const ctx = { root: doc.root, index: DocumentIndex.build(doc.root) };
  documents.set(ctx, doc);
  return { xml: XML, ctx };
}

function serialize(ctx: CommandContext): string {
  return adapter.serialize(documents.get(ctx)!);
}

/** Celda por su posición en `TablixCells` de la fila (no por columna de rejilla). */
function cellAt(ctx: CommandContext, row: number, cellIndex: number): RdlcNode {
  const rows = ctx.index.get('T')!.child('TablixBody')!.child('TablixRows')!.children('TablixRow');
  return rows[row]!.child('TablixCells')!.children('TablixCell')[cellIndex]!;
}

/** Primer report item de una celda (sin `ColSpan`/`RowSpan`). */
function itemOf(ctx: CommandContext, row: number, cellIndex: number): RdlcNode | undefined {
  return cellAt(ctx, row, cellIndex)
    .child('CellContents')
    ?.children()
    .find((child) => !['ColSpan', 'RowSpan'].includes(child.tagName));
}

/** Texto del primer TextRun del item de la celda. */
function textOf(ctx: CommandContext, row: number, cellIndex: number): string | undefined {
  return itemOf(ctx, row, cellIndex)
    ?.child('Paragraphs')
    ?.child('Paragraph')
    ?.child('TextRuns')
    ?.child('TextRun')
    ?.child('Value')
    ?.text();
}

function copy(ctx: CommandContext, cells: { row: number; col: number }[]): CellClipboardEntry[] {
  const copied = copyCellContents(ctx, 'T', cells);
  expect(copied.isRight()).toBe(true);
  if (!copied.isRight()) throw new Error('no copió');
  return copied.value;
}

function paste(ctx: CommandContext, entries: CellClipboardEntry[], row: number, col: number) {
  return applyCommand(ctx, { cmd: 'insertCellClones', id: 'T', row, col, entries });
}

/** Todos los `Name` del documento (para comprobar que son únicos). */
function allNames(root: RdlcNode): string[] {
  const names: string[] = [];
  const walk = (node: RdlcNode): void => {
    const name = node.attribute('Name');
    if (name !== undefined) names.push(name);
    node.children().forEach(walk);
  };
  walk(root);
  return names;
}

describe('copyCellContents', () => {
  it('guarda el contenido con su posición relativa a la caja de la selección', () => {
    const { ctx } = open();
    const entries = copy(ctx, [
      { row: 1, col: 1 },
      { row: 1, col: 2 },
      { row: 0, col: 2 },
    ]);
    expect(entries.map((entry) => [entry.dRow, entry.dCol])).toEqual([
      [1, 0],
      [1, 1],
      [0, 1],
    ]);
    // Son clones desprendidos: no tocan el documento.
    expect(entries.every((entry) => entry.source.parent === null)).toBe(true);
  });

  it('una celda vacía no entra, pero cuenta para la caja (se conserva el hueco)', () => {
    const { ctx } = open();
    const entries = copy(ctx, [
      { row: 1, col: 3 }, // vacía
      { row: 1, col: 2 },
    ]);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ dRow: 0, dCol: 0 });

    // Con la vacía a la izquierda, la copia se desplaza un hueco.
    const shifted = copy(ctx, [
      { row: 1, col: 2 },
      { row: 1, col: 3 },
    ]);
    expect(shifted).toHaveLength(1);
    expect(shifted[0]).toMatchObject({ dRow: 0, dCol: 0 });
  });

  it('una celda fusionada aporta su contenido una vez, en la primera celda pedida', () => {
    const { ctx } = open();
    const entries = copy(ctx, [
      { row: 2, col: 0 },
      { row: 2, col: 1 },
      { row: 2, col: 2 },
    ]);
    expect(entries.map((entry) => [entry.dRow, entry.dCol])).toEqual([
      [0, 0],
      [0, 2],
    ]);
  });

  it('rechaza una celda que no existe', () => {
    const { ctx } = open();
    const copied = copyCellContents(ctx, 'T', [{ row: 7, col: 0 }]);
    expect(copied.isLeft()).toBe(true);
    if (copied.isLeft()) expect(copied.value.reason).toBe('cellMissing');
  });
});

describe('insertCellClones', () => {
  it('una fila de 3 celdas rellena el ancla y las siguientes a la derecha', () => {
    const { ctx } = open();
    const entries = copy(ctx, [
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 0, col: 2 },
    ]);
    const applied = paste(ctx, entries, 1, 1);
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    expect(applied.value.cells).toEqual({ done: 3, total: 3 });
    expect(textOf(ctx, 1, 0)).toBe('A1'); // no se toca
    expect(textOf(ctx, 1, 1)).toContain('ReportItems!'); // copia de a0
    expect(textOf(ctx, 1, 2)).toBe('B0');
    expect(textOf(ctx, 1, 3)).toBe('C0'); // la celda vacía recibe contenido
    expect(itemOf(ctx, 1, 3)?.tagName).toBe('Textbox');
  });

  it('una columna de 3 celdas rellena el ancla y las de abajo', () => {
    const { ctx } = open();
    const entries = copy(ctx, [
      { row: 0, col: 2 },
      { row: 1, col: 2 },
      { row: 2, col: 2 },
    ]);
    const applied = paste(ctx, entries, 0, 3);
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;
    expect(applied.value.cells).toEqual({ done: 3, total: 3 });
    expect(textOf(ctx, 0, 3)).toBe('C0'); // sustituye al Rectangle
    expect(itemOf(ctx, 0, 3)?.tagName).toBe('Textbox');
    expect(textOf(ctx, 1, 3)).toBe('C1');
    expect(textOf(ctx, 2, 2)).toBe('C2'); // fila 2: [M, c2, d2]; col 3 = d2
  });

  it('una columna que no cabe por abajo se recorta', () => {
    const { ctx } = open();
    const entries = copy(ctx, [
      { row: 0, col: 2 },
      { row: 1, col: 2 },
      { row: 2, col: 2 },
    ]);
    const applied = paste(ctx, entries, 1, 0);
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;
    expect(applied.value.cells).toEqual({ done: 2, total: 3 });
    expect(textOf(ctx, 1, 0)).toBe('C0');
    expect(textOf(ctx, 2, 0)).toBe('C1'); // en la fusión M
  });

  it('un bloque 2D conserva su forma', () => {
    const { ctx } = open();
    const entries = copy(ctx, [
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 1, col: 0 },
      { row: 1, col: 1 },
    ]);
    const applied = paste(ctx, entries, 1, 2);
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;
    expect(applied.value.cells).toEqual({ done: 4, total: 4 });
    expect(textOf(ctx, 1, 2)).toContain('ReportItems!');
    expect(textOf(ctx, 1, 3)).toBe('B0');
    // Fila 2: (2,2) = c2 (índice 1) y (2,3) = d2 (índice 2).
    expect(textOf(ctx, 2, 1)).toBe('A1');
    expect(textOf(ctx, 2, 2)).toBe('B1');
  });

  it('una selección no contigua conserva su diseño y no toca los huecos', () => {
    const { ctx } = open();
    // (0,0) y (0,2): hueco en (0,1).
    const entries = copy(ctx, [
      { row: 0, col: 0 },
      { row: 0, col: 2 },
    ]);
    const applied = paste(ctx, entries, 1, 0);
    expect(applied.isRight()).toBe(true);
    expect(textOf(ctx, 1, 0)).toContain('ReportItems!');
    expect(textOf(ctx, 1, 1)).toBe('B1'); // el hueco queda como estaba
    expect(textOf(ctx, 1, 2)).toBe('C0');
  });

  it('recorta en el borde: no crece la tabla y informa de lo pegado', () => {
    const { xml, ctx } = open();
    const entries = copy(ctx, [
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 0, col: 2 },
    ]);
    const applied = paste(ctx, entries, 0, 2);
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;
    expect(applied.value.cells).toEqual({ done: 2, total: 3 });

    const tablix = ctx.index.get('T')!;
    expect(tablix.child('TablixBody')!.child('TablixColumns')!.children()).toHaveLength(4);
    expect(tablix.child('TablixBody')!.child('TablixRows')!.children()).toHaveLength(3);
    expect(tablix.child('TablixRowHierarchy')!.child('TablixMembers')!.children()).toHaveLength(3);

    expect(undoAll(ctx, applied.value).isRight()).toBe(true);
    expect(serialize(ctx)).toBe(xml);
  });

  it('rechaza si nada cabe y deja el documento intacto', () => {
    const { xml, ctx } = open();
    const [entry] = copy(ctx, [{ row: 0, col: 1 }]);
    const applied = paste(ctx, [{ ...entry!, dRow: 5, dCol: 5 }], 0, 0);
    expect(applied.isLeft()).toBe(true);
    if (applied.isLeft()) expect(applied.value.reason).toBe('pasteCellsNothingFits');
    expect(serialize(ctx)).toBe(xml);
  });

  it('rechaza un ancla que no existe', () => {
    const { ctx } = open();
    const applied = paste(ctx, copy(ctx, [{ row: 0, col: 1 }]), 9, 0);
    expect(applied.isLeft()).toBe(true);
    if (applied.isLeft()) expect(applied.value.reason).toBe('cellMissing');
  });

  it('una posición cubierta por una fusión escribe en su ancla sin tocar los spans', () => {
    const { ctx } = open();
    // (2,1) está cubierta por la fusión M (columnas 0-1).
    const applied = paste(ctx, copy(ctx, [{ row: 0, col: 1 }]), 2, 1);
    expect(applied.isRight()).toBe(true);
    expect(textOf(ctx, 2, 0)).toBe('B0');
    expect(cellAt(ctx, 2, 0).child('CellContents')!.child('ColSpan')!.text()).toBe('2');
    expect(cellAt(ctx, 2, 0).parent!.children('TablixCell')).toHaveLength(3);
    // Un solo item en la celda fusionada.
    expect(cellAt(ctx, 2, 0).child('CellContents')!.children('Textbox')).toHaveLength(1);
  });

  it('dos posiciones de una misma celda fusionada: gana la primera y cuenta una', () => {
    const { ctx } = open();
    const entries = copy(ctx, [
      { row: 0, col: 0 },
      { row: 0, col: 1 },
    ]);
    const applied = paste(ctx, entries, 2, 0); // ambas caen en M
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;
    expect(applied.value.cells).toEqual({ done: 1, total: 2 });
    expect(textOf(ctx, 2, 0)).toContain('ReportItems!');
  });

  it('sustituye el contenido existente (una celda, un item) y el undo lo restaura byte a byte', () => {
    const { xml, ctx } = open();
    const applied = paste(ctx, copy(ctx, [{ row: 0, col: 1 }]), 1, 1);
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    expect(itemOf(ctx, 1, 1)?.attribute('Name')).not.toBe('b1');
    expect(textOf(ctx, 1, 1)).toBe('B0');
    expect(cellAt(ctx, 1, 1).child('CellContents')!.children('Textbox')).toHaveLength(1);

    expect(undoAll(ctx, applied.value).isRight()).toBe(true);
    expect(serialize(ctx)).toBe(xml);
  });

  it('un bloque entero es un solo paso de undo (incluye la celda vacía y la fusionada)', () => {
    const { xml, ctx } = open();
    const entries = copy(ctx, [
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 0, col: 2 },
      { row: 1, col: 0 },
      { row: 1, col: 1 },
      { row: 1, col: 2 },
    ]);
    const applied = paste(ctx, entries, 1, 0);
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;
    // Filas 1 y 2 (la 3 no existe); (2,1) cae en M, que ya recibió (2,0).
    expect(applied.value.cells).toEqual({ done: 5, total: 6 });

    expect(undoAll(ctx, applied.value).isRight()).toBe(true);
    expect(serialize(ctx)).toBe(xml);
  });

  it('una celda sin CellContents recibe uno nuevo y el undo lo quita', () => {
    const { ctx } = open();
    cellAt(ctx, 1, 3).child('CellContents')!.remove();
    const before = serialize(ctx);

    const applied = paste(ctx, copy(ctx, [{ row: 0, col: 1 }]), 1, 3);
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;
    expect(textOf(ctx, 1, 3)).toBe('B0');

    expect(undoAll(ctx, applied.value).isRight()).toBe(true);
    expect(serialize(ctx)).toBe(before);
  });

  it('un Textbox no lleva longitudes en la celda; un Rectangle ocupa la celda (0,0 y su tamaño)', () => {
    const { ctx } = open();
    // Rectangle (dCol 2) y Textbox (dCol 0): con ancla en (2,0) el Textbox cae en
    // la fusión M y el Rectangle en c2 (2 cm × 0,9 cm).
    const entries = copy(ctx, [
      { row: 0, col: 3 },
      { row: 0, col: 1 },
    ]);
    const applied = paste(ctx, entries, 2, 0);
    expect(applied.isRight()).toBe(true);

    const textboxClone = itemOf(ctx, 2, 0)!;
    expect(textboxClone.tagName).toBe('Textbox');
    for (const tag of ['Top', 'Left', 'Width', 'Height']) {
      expect(textboxClone.child(tag)).toBeUndefined();
    }

    const rectangle = itemOf(ctx, 2, 1)!;
    expect(rectangle.tagName).toBe('Rectangle');
    expect(rectangle.child('Top')!.text()).toBe('0cm');
    expect(rectangle.child('Left')!.text()).toBe('0cm');
    expect(rectangle.child('Width')!.text()).toBe('2cm');
    expect(rectangle.child('Height')!.text()).toBe('0.9cm');
  });

  it('un item pegado en una celda fusionada toma la caja entera de la fusión', () => {
    const { ctx } = open();
    const applied = paste(ctx, copy(ctx, [{ row: 0, col: 3 }]), 2, 1);
    expect(applied.isRight()).toBe(true);
    const rectangle = itemOf(ctx, 2, 0)!;
    expect(rectangle.tagName).toBe('Rectangle');
    expect(rectangle.child('Width')!.text()).toBe('4cm');
  });

  it('clona con nombres únicos (también los hijos) y reescribe las referencias internas', () => {
    const { ctx } = open();
    const entries = copy(ctx, [
      { row: 0, col: 0 },
      { row: 0, col: 3 },
    ]);
    const first = paste(ctx, entries, 1, 0);
    expect(first.isRight()).toBe(true);
    // Pegar otra vez (índice al día, como entre dos comandos del servicio): los
    // nombres no se repiten entre pegados.
    const rebuilt = { root: ctx.root, index: DocumentIndex.build(ctx.root) };
    expect(paste(rebuilt, entries, 2, 2).isRight()).toBe(true);

    const names = allNames(ctx.root);
    expect(new Set(names.map((name) => name.toLowerCase())).size).toBe(names.length);

    const cloneName = itemOf(ctx, 1, 0)!.attribute('Name')!;
    expect(cloneName).not.toBe('a0');
    // `ReportItems!a0` del clon apunta al propio clon, no al original.
    expect(textOf(ctx, 1, 0)).toBe(`=ReportItems!${cloneName}.Value`);
    expect(textOf(ctx, 0, 0)).toBe('=ReportItems!a0.Value');
  });

  it('pegar un item suelto con geometría de lienzo en una celda lo deja sin longitudes', () => {
    const { ctx } = open();
    const free = ctx.index.get('b0')!.clone();
    free.appendChild(free.createElement('Top', '1cm'));
    free.appendChild(free.createElement('Width', '3cm'));

    const applied = paste(ctx, [{ dRow: 0, dCol: 0, source: free }], 1, 0);
    expect(applied.isRight()).toBe(true);
    const pasted = itemOf(ctx, 1, 0)!;
    expect(pasted.child('Top')).toBeUndefined();
    expect(pasted.child('Width')).toBeUndefined();
  });
});
