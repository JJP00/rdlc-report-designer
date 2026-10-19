import type { TextboxDto } from '@rdlc-designer/contracts';
import { describe, expect, it } from 'vitest';
import {
  contrastColor,
  effectiveTextStyle,
  paintColor,
  sameStyleValue,
  toHexColor,
  toPt,
} from './style';

/** Estilo efectivo del textbox: precedencia RDL run > párrafo > item. */

function textbox(overrides: Partial<TextboxDto> = {}): TextboxDto {
  return {
    kind: 'textbox',
    id: 'Textbox1',
    top: { value: 1, unit: 'cm' },
    left: { value: 1, unit: 'cm' },
    width: { value: 5, unit: 'cm' },
    height: { value: 0.5, unit: 'cm' },
    paragraphs: [{ runs: [{ value: 'Hola' }] }],
    ...overrides,
  };
}

describe('effectiveTextStyle', () => {
  it('sin estilos en ningún nivel devuelve undefined', () => {
    expect(effectiveTextStyle(textbox())).toBeUndefined();
  });

  it('el run gana al item cuando todos los runs coinciden', () => {
    const item = textbox({
      style: { fontSize: { value: 10, unit: 'pt' }, fontWeight: 'Normal' },
      paragraphs: [
        {
          runs: [
            { value: 'A', style: { fontSize: { value: 12, unit: 'pt' } } },
            { value: 'B', style: { fontSize: { value: 12, unit: 'pt' } } },
          ],
        },
      ],
    });

    const style = effectiveTextStyle(item);
    expect(style?.fontSize).toEqual({ value: 12, unit: 'pt' });
    // Solo el tamaño está en el run: el peso sigue siendo el del item.
    expect(style?.fontWeight).toBe('Normal');
  });

  it('el párrafo gana al item cuando los runs no declaran la propiedad', () => {
    const item = textbox({
      style: { textAlign: 'Left' },
      paragraphs: [
        { style: { textAlign: 'Center' }, runs: [{ value: 'A' }] },
        { style: { textAlign: 'Center' }, runs: [{ value: 'B' }] },
      ],
    });

    expect(effectiveTextStyle(item)?.textAlign).toBe('Center');
  });

  it('si los niveles discrepan se cae al nivel superior (no miente)', () => {
    const item = textbox({
      style: { fontSize: { value: 10, unit: 'pt' } },
      paragraphs: [
        {
          runs: [
            { value: 'A', style: { fontSize: { value: 12, unit: 'pt' } } },
            { value: 'B', style: { fontSize: { value: 8, unit: 'pt' } } },
          ],
        },
      ],
    });

    expect(effectiveTextStyle(item)?.fontSize).toEqual({ value: 10, unit: 'pt' });
  });

  it('acepta el estilo del párrafo aunque el item no declare nada', () => {
    const item = textbox({
      paragraphs: [
        { style: { padding: { left: { value: 5, unit: 'pt' } } }, runs: [{ value: 'A' }] },
      ],
    });

    expect(effectiveTextStyle(item)?.padding).toEqual({ left: { value: 5, unit: 'pt' } });
  });
});

describe('sameStyleValue', () => {
  it('compara estructuras iguales aunque no compartan referencia', () => {
    expect(sameStyleValue({ style: 'Solid' }, { style: 'Solid' })).toBe(true);
    expect(sameStyleValue({ value: 10, unit: 'pt' }, { value: 10, unit: 'pt' })).toBe(true);
    expect(sameStyleValue({ value: 10, unit: 'pt' }, { value: 12, unit: 'pt' })).toBe(false);
    expect(sameStyleValue('Bold', 'Bold')).toBe(true);
  });
});

describe('toPt', () => {
  it('convierte las unidades del contrato a puntos', () => {
    expect(toPt({ value: 10, unit: 'pt' })).toBeCloseTo(10);
    expect(toPt({ value: 1, unit: 'in' })).toBeCloseTo(72);
    expect(toPt({ value: 2.54, unit: 'cm' })).toBeCloseTo(72);
    expect(toPt({ value: 25.4, unit: 'mm' })).toBeCloseTo(72);
  });
});

describe('paintColor', () => {
  it('las expresiones RDL no se pintan en diseño: cae al color por defecto', () => {
    // Caso real del corpus: fondo por fila con IIF (BC lo evalúa, el diseñador no).
    expect(
      paintColor(
        '=IIF((Fields!BTCLineNo.Value \\ 10000) Mod 2 = 0, "LightGray", "White")',
        '#ffffff',
      ),
    ).toBe('#ffffff');
  });

  it('los colores con nombre de RDL se respetan', () => {
    expect(paintColor('Silver', '#ffffff')).toBe('Silver');
    expect(paintColor('#D9D9D9', '#ffffff')).toBe('#D9D9D9');
  });

  it('sin valor usa el defecto', () => {
    expect(paintColor(undefined, 'rgba(0,0,0,0)')).toBe('rgba(0,0,0,0)');
  });
});

describe('toHexColor', () => {
  it('las expresiones caen al color por defecto (input type=color)', () => {
    expect(toHexColor('=Fields!X.Value', '#111827')).toBe('#111827');
  });

  it('un hex se devuelve tal cual', () => {
    expect(toHexColor('#ff8800', '#111827')).toBe('#ff8800');
  });
});

describe('contrastColor', () => {
  it('fondo claro → texto oscuro; fondo oscuro → blanco', () => {
    expect(contrastColor('#ffffff')).toBe('#111827');
    expect(contrastColor('#facc15')).toBe('#111827');
    expect(contrastColor('#000000')).toBe('#ffffff');
    expect(contrastColor('#1d4ed8')).toBe('#ffffff');
  });

  it('un valor no legible cae al texto oscuro', () => {
    expect(contrastColor('=Fields!X.Value')).toBe('#111827');
    expect(contrastColor('')).toBe('#111827');
  });
});
