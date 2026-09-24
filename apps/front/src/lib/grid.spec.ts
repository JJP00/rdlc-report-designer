import { describe, expect, it } from 'vitest';
import type { TablixDto } from '@rdlc-designer/contracts';
import { tablixGrid } from './grid';

/**
 * Rejilla segmentada: sin líneas dentro de celdas fusionadas (el caso de
 * `TextboxVATClauseDesc` en `SalesCreditMemoESP`: una celda con `ColSpan 2`
 * parecía partida en dos).
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

/** 3 columnas (1, 2, 3 cm) × 2 filas (1, 1 cm); fila 0 con una celda ColSpan 2. */
const TABLIX: TablixDto = {
  kind: 'tablix',
  id: 'T',
  top: { value: 0, unit: 'cm' },
  left: { value: 0, unit: 'cm' },
  width: { value: 6, unit: 'cm' },
  height: { value: 2, unit: 'cm' },
  body: {
    columns: [
      { value: 1, unit: 'cm' },
      { value: 2, unit: 'cm' },
      { value: 3, unit: 'cm' },
    ],
    rows: [
      {
        height: { value: 1, unit: 'cm' },
        cells: [{ colSpan: 2, content: textbox('A') }, { content: textbox('B') }],
      },
      {
        height: { value: 1, unit: 'cm' },
        cells: [{ content: textbox('C') }, { content: textbox('D') }, { content: textbox('E') }],
      },
    ],
  },
  rowHierarchy: [],
  columnHierarchy: [],
};

describe('tablixGrid', () => {
  it('no dibuja la frontera que cruza una celda fusionada (ColSpan)', () => {
    const { vertical } = tablixGrid(TABLIX);

    // Fronteras en x = 1, 3 y 6 (el borde derecho).
    const atOne = vertical.filter((segment) => segment.fixed === 1);
    // La frontera x=1 cruza la celda fusionada de la fila 0: solo se dibuja en
    // la fila 1 (de y=1 a y=2).
    expect(atOne).toEqual([{ fixed: 1, from: 1, to: 2 }]);
    // La frontera x=3 se dibuja completa (nadie la cruza) y en un solo tramo.
    expect(vertical.filter((segment) => segment.fixed === 3)).toEqual([
      { fixed: 3, from: 0, to: 2 },
    ]);
  });

  it('no dibuja la frontera que cruza una celda fusionada (RowSpan)', () => {
    const tablix: TablixDto = {
      ...TABLIX,
      body: {
        columns: TABLIX.body.columns,
        rows: [
          {
            height: { value: 1, unit: 'cm' },
            cells: [{ rowSpan: 2, content: textbox('A') }, { content: textbox('B') }],
          },
          { height: { value: 1, unit: 'cm' }, cells: [{ content: textbox('C') }] },
        ],
      },
    };

    const { horizontal } = tablixGrid(tablix);
    // La frontera y=1 cruza la celda con RowSpan en la columna 0: solo se
    // dibuja desde el borde derecho de esa columna hasta el final (x=1 → x=6);
    // y=2 es el borde inferior del Tablix.
    expect(horizontal).toEqual([
      { fixed: 1, from: 1, to: 6 },
      { fixed: 2, from: 0, to: 6 },
    ]);
  });

  it('sin fusiones, la rejilla son las líneas completas de columnas y filas', () => {
    const tablix: TablixDto = {
      ...TABLIX,
      body: {
        columns: TABLIX.body.columns,
        rows: [
          {
            height: { value: 1, unit: 'cm' },
            cells: [
              { content: textbox('A') },
              { content: textbox('B') },
              { content: textbox('C') },
            ],
          },
          TABLIX.body.rows[1]!,
        ],
      },
    };

    const { vertical, horizontal } = tablixGrid(tablix);
    // Sin fusiones: cada frontera es un segmento completo (se unen los tramos
    // contiguos), incluida la del borde derecho/inferior.
    expect(vertical.map((segment) => [segment.fixed, segment.from, segment.to])).toEqual([
      [1, 0, 2],
      [3, 0, 2],
      [6, 0, 2],
    ]);
    expect(horizontal.map((segment) => [segment.fixed, segment.from, segment.to])).toEqual([
      [1, 0, 6],
      [2, 0, 6],
    ]);
  });
});
