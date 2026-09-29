import { describe, expect, it } from 'vitest';
import type { ProjectionDto, TablixDto, TablixMemberDto } from '@rdlc-designer/contracts';
import {
  canMergeSelection,
  cellBoxAt,
  cellRange,
  containerGroupPath,
  findCellAt,
  findOwnerTablix,
  formatIndexList,
  hitSelectionCell,
  isCellInRange,
  isCellSelected,
  isRectangleSelection,
  memberForLeafGroup,
  rangeCols,
  rangeRows,
  selectionBounds,
  selectionCells,
  selectionCols,
  selectionRows,
  tablixLayout,
  tablixRowsTree,
  tablixTree,
} from './tablix';

/**
 * F2 parte 3 · helpers del Tablix en el front: cajas de celda (con espacios),
 * hit-test de celda y árbol de miembros para el panel de estructura.
 */

function textbox(id: string) {
  return {
    kind: 'textbox' as const,
    id,
    top: { value: 0, unit: 'cm' as const },
    left: { value: 0, unit: 'cm' as const },
    width: { value: 0, unit: 'cm' as const },
    height: { value: 0, unit: 'cm' as const },
    paragraphs: [],
  };
}

function leaf(path: number[], extra?: Partial<TablixMemberDto>): TablixMemberDto {
  return { path, total: 'none', children: [], ...extra };
}

const TABLIX: TablixDto = {
  kind: 'tablix',
  id: 'T',
  top: { value: 0, unit: 'cm' },
  left: { value: 0, unit: 'cm' },
  width: { value: 6, unit: 'cm' },
  height: { value: 1.2, unit: 'cm' },
  body: {
    columns: [
      { value: 2, unit: 'cm' },
      { value: 3, unit: 'cm' },
      { value: 1, unit: 'cm' },
    ],
    rows: [
      {
        height: { value: 0.5, unit: 'cm' },
        cells: [{ content: textbox('A') }, { colSpan: 2, content: textbox('B') }],
      },
      {
        height: { value: 0.7, unit: 'cm' },
        cells: [{ content: textbox('C') }, { content: textbox('D') }, { content: textbox('E') }],
      },
    ],
  },
  rowHierarchy: [
    leaf([0]),
    {
      path: [1],
      expression: '=Fields!X.Value',
      total: 'none',
      children: [leaf([1, 0]), leaf([1, 1], { total: 'after' })],
    },
    leaf([2]),
  ],
  columnHierarchy: [],
};

describe('tablix · layout y celdas', () => {
  it('calcula las cajas con ColSpan y sus offsets', () => {
    const layout = tablixLayout(TABLIX);
    expect(layout.width).toBeCloseTo(6);
    expect(layout.height).toBeCloseTo(1.2);
    expect(layout.cells).toHaveLength(5);

    const b = layout.cells.find((cell) => cell.content?.id === 'B')!;
    expect(b.col).toBe(1);
    expect(b.colSpan).toBe(2);
    expect(b.x).toBeCloseTo(2);
    expect(b.width).toBeCloseTo(4);

    const e = layout.cells.find((cell) => cell.content?.id === 'E')!;
    expect(e.row).toBe(1);
    expect(e.x).toBeCloseTo(5);
    expect(e.y).toBeCloseTo(0.5);
    expect(e.height).toBeCloseTo(0.7);
  });

  it('encuentra la celda que contiene un punto (y respeta los espacios)', () => {
    expect(findCellAt(TABLIX, 2.5, 0.2)?.content?.id).toBe('B');
    expect(findCellAt(TABLIX, 5.5, 0.6)?.content?.id).toBe('E');
    expect(findCellAt(TABLIX, 9, 9)).toBeUndefined();
  });

  it('localiza la celda por su ancla (fila, columna)', () => {
    expect(cellBoxAt(TABLIX, 0, 1)?.content?.id).toBe('B');
    expect(cellBoxAt(TABLIX, 0, 1)?.width).toBeCloseTo(4);
    expect(cellBoxAt(TABLIX, 1, 2)?.width).toBeCloseTo(1);
    expect(cellBoxAt(TABLIX, 9, 9)).toBeUndefined();
  });
});

describe('tablix · rango de celdas', () => {
  it('normaliza el rango (el ancla puede quedar abajo-derecha)', () => {
    const selection = { id: 'T', row: 2, col: 3, endRow: 0, endCol: 1 };
    expect(cellRange(selection)).toEqual({ row0: 0, row1: 2, col0: 1, col1: 3 });
    expect(rangeRows(cellRange(selection))).toBe(3);
    expect(rangeCols(cellRange(selection))).toBe(3);
    expect(isCellInRange({ row: 1, col: 2 }, selection)).toBe(true);
    expect(isCellInRange({ row: 3, col: 2 }, selection)).toBe(false);
  });

  it('sin foco es una sola celda', () => {
    const selection = { id: 'T', row: 4, col: 2 };
    expect(cellRange(selection)).toEqual({ row0: 4, row1: 4, col0: 2, col1: 2 });
    expect(isCellInRange({ row: 4, col: 2 }, selection)).toBe(true);
    expect(isCellInRange({ row: 4, col: 3 }, selection)).toBe(false);
  });

  it('Ctrl+click añade celdas sueltas y la fusión exige un rectángulo', () => {
    const selection = {
      id: 'T',
      row: 0,
      col: 0,
      endRow: 1,
      endCol: 1,
      extra: [{ row: 3, col: 2 }],
    };
    expect(selectionCells(selection)).toHaveLength(5);
    expect(selectionRows(selection)).toEqual([0, 1, 3]);
    expect(selectionCols(selection)).toEqual([0, 1, 2]);
    expect(isRectangleSelection(selection)).toBe(false);
    expect(isRectangleSelection({ id: 'T', row: 0, col: 0, endRow: 1, endCol: 1 })).toBe(true);
    // La celda suelta cuenta como seleccionada (el click derecho no la pierde).
    expect(isCellSelected({ row: 3, col: 2 }, selection)).toBe(true);
    expect(isCellSelected({ row: 3, col: 1 }, selection)).toBe(false);
    expect(formatIndexList([0, 1, 2])).toBe('1–3');
    expect(formatIndexList([0, 2])).toBe('1, 3');
  });

  it('la fusión solo aplica a un tramo contiguo de una misma fila', () => {
    // Una fila con celdas contiguas: se puede combinar (ColSpan).
    expect(canMergeSelection({ id: 'T', row: 1, col: 0, endRow: 1, endCol: 2 })).toBe(true);
    // Varias filas: no (se descartaría el contenido de las celdas de abajo).
    expect(canMergeSelection({ id: 'T', row: 0, col: 0, endRow: 1, endCol: 1 })).toBe(false);
    // Una sola celda: no.
    expect(canMergeSelection({ id: 'T', row: 0, col: 0 })).toBe(false);
    // Sueltas de Ctrl+click en la misma fila y contiguas: también se combinan
    // (llegan en `extra`, no en el rectángulo ancla→foco).
    expect(
      canMergeSelection({
        id: 'T',
        row: 0,
        col: 1,
        extra: [
          { row: 0, col: 0 },
          { row: 0, col: 2 },
        ],
      }),
    ).toBe(true);
    // Con un hueco entre ellas: no.
    expect(canMergeSelection({ id: 'T', row: 0, col: 0, extra: [{ row: 0, col: 2 }] })).toBe(false);
    // Si una suelta cae en otra fila: no.
    expect(canMergeSelection({ id: 'T', row: 0, col: 0, extra: [{ row: 1, col: 0 }] })).toBe(false);
  });

  it('selectionBounds cubre también las celdas sueltas', () => {
    expect(selectionBounds({ id: 'T', row: 0, col: 0, extra: [{ row: 0, col: 2 }] })).toEqual({
      row0: 0,
      row1: 0,
      col0: 0,
      col1: 2,
    });
    expect(selectionBounds({ id: 'T', row: 2, col: 3, endRow: 0, endCol: 1 })).toEqual({
      row0: 0,
      row1: 2,
      col0: 1,
      col1: 3,
    });
  });

  it('la celda seleccionada se reconoce en la cadena de un hit anidado', () => {
    const selection = { id: 'LinesTable2', row: 0, col: 0, endRow: 0, endCol: 1 };
    // Cadena de fuera a dentro: Tablix2 (contenedor) → LinesTable2 (seleccionada).
    const chain = [
      { id: 'Tablix2', row: 0, col: 0 },
      { id: 'LinesTable2', row: 0, col: 1 },
    ];
    expect(hitSelectionCell(chain, selection)).toEqual({
      id: 'LinesTable2',
      row: 0,
      col: 1,
    });
    // Celdas del mismo tablix pero fuera de la selección: no cuenta.
    expect(hitSelectionCell([{ id: 'LinesTable2', row: 1, col: 0 }], selection)).toBeUndefined();
    expect(hitSelectionCell(undefined, selection)).toBeUndefined();
    expect(hitSelectionCell(chain, null)).toBeUndefined();
  });
});

describe('tablix · árbol de estructura', () => {
  it('aplana grupos y hojas manteniendo profundidad, path y total', () => {
    const entries = tablixTree(TABLIX.rowHierarchy);
    expect(entries.map((entry) => [entry.kind, entry.depth, entry.index])).toEqual([
      ['row', 0, 0],
      ['group', 0, undefined],
      ['row', 1, 1],
      ['row', 1, 2],
      ['row', 0, 3],
    ]);
    expect(entries[1]?.expression).toBe('=Fields!X.Value');
    expect(entries[3]?.total).toBe('after');
  });

  it('sin jerarquía proyectada, cada fila es una hoja suelta', () => {
    const entries = tablixRowsTree({ ...TABLIX, rowHierarchy: [] });
    expect(entries).toHaveLength(2);
    expect(entries[0]?.index).toBe(0);
  });

  it('un grupo hoja (sin hijos) se clasifica por su expresión y conserva su fila', () => {
    const entries = tablixTree([
      { path: [0], expression: '=Fields!DocumentNo.Value', total: 'none', children: [] },
      leaf([1]),
    ]);
    expect(entries.map((entry) => [entry.kind, entry.index])).toEqual([
      ['group', 0],
      ['row', 1],
    ]);
    expect(entries[0]?.expression).toBe('=Fields!DocumentNo.Value');
    expect(entries[0]?.depth).toBe(0);
  });

  it('leafStart/leafEnd cubren el rango de hojas de cada miembro', () => {
    const entries = tablixTree(TABLIX.rowHierarchy);
    expect(entries.map((entry) => [entry.kind, entry.leafStart, entry.leafEnd])).toEqual([
      ['row', 0, 0],
      ['group', 1, 2],
      ['row', 1, 1],
      ['row', 2, 2],
      ['row', 3, 3],
    ]);
  });

  it('containerGroupPath devuelve el grupo contenedor sin contar la propia hoja', () => {
    // En TABLIX, las hojas 1 y 2 están dentro del grupo [1]; 0 y 3 no.
    expect(containerGroupPath(TABLIX, 'row', 1)).toEqual([1]);
    expect(containerGroupPath(TABLIX, 'row', 2)).toEqual([1]);
    expect(containerGroupPath(TABLIX, 'row', 0)).toBeUndefined();
    expect(containerGroupPath(TABLIX, 'row', 3)).toBeUndefined();
  });

  it('memberForLeafGroup incluye el propio grupo hoja (destino de propiedades)', () => {
    const withLeafGroup: TablixDto = {
      ...TABLIX,
      rowHierarchy: [
        { path: [0], expression: '=Fields!X.Value', total: 'none', children: [] },
        leaf([1]),
      ],
    };
    expect(memberForLeafGroup(withLeafGroup, 'row', 0)?.path).toEqual([0]);
    expect(memberForLeafGroup(withLeafGroup, 'row', 1)).toBeUndefined();
  });
});

describe('tablix · tablix propietario', () => {
  it('devuelve el Tablix más interno que contiene al item', () => {
    const projection: ProjectionDto = {
      sessionId: 's',
      version: 1,
      reportName: 'r',
      meta: { code: { text: '', functions: [] }, fields: [], parameters: [] },
      page: {
        width: { value: 21, unit: 'cm' },
        height: { value: 29.7, unit: 'cm' },
        margins: {
          top: { value: 0, unit: 'cm' },
          left: { value: 0, unit: 'cm' },
          bottom: { value: 0, unit: 'cm' },
          right: { value: 0, unit: 'cm' },
        },
        header: { width: { value: 21, unit: 'cm' }, height: { value: 0, unit: 'cm' }, items: [] },
        body: {
          width: { value: 21, unit: 'cm' },
          height: { value: 29.7, unit: 'cm' },
          items: [TABLIX],
        },
        footer: { width: { value: 21, unit: 'cm' }, height: { value: 0, unit: 'cm' }, items: [] },
      },
    };
    expect(findOwnerTablix(projection, 'C')?.id).toBe('T');
    // El propio Tablix se devuelve a sí mismo (celdas seleccionadas).
    expect(findOwnerTablix(projection, 'T')?.id).toBe('T');
    expect(findOwnerTablix(projection, 'NoExiste')).toBeUndefined();
  });
});
