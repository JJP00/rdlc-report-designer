import type { TextboxDto } from '@rdlc-designer/contracts';
import { describe, expect, it } from 'vitest';
import { effectiveTextStyle, toPt } from './style';

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

describe('toPt', () => {
  it('convierte las unidades del contrato a puntos', () => {
    expect(toPt({ value: 10, unit: 'pt' })).toBeCloseTo(10);
    expect(toPt({ value: 1, unit: 'in' })).toBeCloseTo(72);
    expect(toPt({ value: 2.54, unit: 'cm' })).toBeCloseTo(72);
    expect(toPt({ value: 25.4, unit: 'mm' })).toBeCloseTo(72);
  });
});
