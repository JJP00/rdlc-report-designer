import { describe, expect, it } from 'vitest';
import type { StyleDto, TextboxDto } from '@rdlc-designer/contracts';
import { layoutTextbox, type TextLayoutContext } from './textLayout';

/**
 * Layout del texto del lienzo: la alineación del párrafo (donde la pone BC) y la
 * precedencia `run > párrafo > item` tienen que verse en el canvas.
 */

/** Medidor falso: 1 px por carácter. */
const ctx: TextLayoutContext = {
  toPx: (length) => (length.unit === 'pt' ? length.value * (96 / 72) : length.value),
  measure: (text) => text.length,
};

function textbox(partial: Partial<TextboxDto>): TextboxDto {
  return {
    kind: 'textbox',
    id: 'T',
    top: { value: 0, unit: 'cm' },
    left: { value: 0, unit: 'cm' },
    width: { value: 10, unit: 'cm' },
    height: { value: 5, unit: 'cm' },
    paragraphs: [],
    ...partial,
  };
}

describe('layoutTextbox', () => {
  it('alinea cada párrafo con su `TextAlign` (izquierda/centro/derecha)', () => {
    const item = textbox({
      paragraphs: [
        { style: { textAlign: 'Center' }, runs: [{ value: 'abcd' }] }, // 4 px de ancho
        { style: { textAlign: 'Right' }, runs: [{ value: 'ab' }] }, // 2 px
        { runs: [{ value: 'abcd' }] }, // 4 px, sin align → izquierda
      ],
    });
    const layout = layoutTextbox(item, { width: 20, height: 20 }, undefined, ctx);
    expect(layout.runs.map((run) => run.x)).toEqual([8, 18, 0]);
    const ys = layout.runs.map((run) => run.y);
    expect(ys[0]).toBeCloseTo(0, 6);
    expect(ys[1]).toBeCloseTo(14.4, 6);
    expect(ys[2]).toBeCloseTo(28.8, 6);
  });

  it('el estilo del run gana al del párrafo y al del item', () => {
    const item = textbox({
      style: { fontSize: { value: 12, unit: 'pt' }, color: '#000000' },
      paragraphs: [
        {
          style: { fontSize: { value: 10, unit: 'pt' }, color: '#111111' },
          runs: [
            { value: 'a' },
            { value: 'b', style: { fontSize: { value: 8, unit: 'pt' }, color: '#FF0000' } },
          ],
        },
      ],
    });
    const layout = layoutTextbox(item, { width: 20, height: 20 }, item.style, ctx);
    // 12pt = 16 px, 10pt = 13.33 px, 8pt = 10.66 px
    expect(layout.runs[0]!.fontSize).toBeCloseTo(13.33, 1);
    expect(layout.runs[0]!.fill).toBe('#111111');
    expect(layout.runs[1]!.fontSize).toBeCloseTo(10.66, 1);
    expect(layout.runs[1]!.fill).toBe('#FF0000');
  });

  it('coloca los runs de un párrafo en secuencia y aplica negrita/cursiva', () => {
    const item = textbox({
      paragraphs: [
        {
          runs: [
            { value: 'ab', style: { fontWeight: 'Bold' } }, // 2 px
            { value: 'cde', style: { fontStyle: 'Italic' } }, // 3 px
          ],
        },
      ],
    });
    const layout = layoutTextbox(item, { width: 20, height: 20 }, undefined, ctx);
    expect(layout.runs.map((run) => run.x)).toEqual([0, 2]);
    expect(layout.runs[0]!.fontStyle).toBe('bold');
    expect(layout.runs[1]!.fontStyle).toBe('italic');
  });

  it('pinta el texto de diseño: etiqueta de BC, `[exp]` o el texto', () => {
    const item = textbox({
      paragraphs: [
        {
          runs: [
            { value: '=Fields!X.Value', label: 'X' },
            { value: '=Sum(Fields!Y.Value)' },
            { value: 'Total' },
          ],
        },
      ],
    });
    const layout = layoutTextbox(item, { width: 40, height: 20 }, undefined, ctx);
    expect(layout.runs.map((run) => run.text)).toEqual(['[X]', '[exp]', 'Total']);
    // Las posiciones acumulan el ancho del texto de diseño, no de la expresión.
    expect(layout.runs.map((run) => run.x)).toEqual([0, 3, 8]);
  });

  it('respeta el `VerticalAlign` del item (centro)', () => {
    const item = textbox({ paragraphs: [{ runs: [{ value: 'a' }] }] });
    const layout = layoutTextbox(
      item,
      { width: 20, height: 30 },
      { verticalAlign: 'Middle' } as StyleDto,
      ctx,
    );
    const lineHeight = 12 * 1.2;
    expect(layout.height).toBeCloseTo(lineHeight, 4);
    expect(layout.runs[0]!.y).toBeCloseTo((30 - lineHeight) / 2, 4);
  });
});
