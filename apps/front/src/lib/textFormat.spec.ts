import type { ParagraphDto } from '@rdlc-designer/contracts';
import { describe, expect, it } from 'vitest';
import {
  FORMAT_PRESETS,
  GENERAL_FORMAT,
  commonEffectiveFormat,
  effectiveRunFormat,
  formatPresetId,
  isExpressionFormat,
  normalizeFormatInput,
  presetValue,
} from './textFormat';

/** La expresión real del corpus: comillas dobles y `First(…)` intactos. */
const CORPUS_EXPRESSION = '=First(Fields!BTCFormatcurrency_Lbl.Value, "DataSet_Result")';

describe('textFormat · presets', () => {
  it('cada preset mapea a su cadena .NET', () => {
    expect(presetValue('n0')).toBe('N0');
    expect(presetValue('n2')).toBe('N2');
    expect(presetValue('p0')).toBe('P0');
    expect(presetValue('p2')).toBe('P2');
    expect(presetValue('c2')).toBe('C2');
    expect(presetValue('date-short')).toBe('d');
    expect(presetValue('date-long')).toBe('D');
    expect(presetValue('date-time')).toBe('g');
  });

  it('los presets no repiten id ni cadena, y no hay preset vacío (General no es una cadena)', () => {
    const ids = FORMAT_PRESETS.map((preset) => preset.id);
    const values = FORMAT_PRESETS.map((preset) => preset.value);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(values).size).toBe(values.length);
    expect(values.every((value) => value !== '')).toBe(true);
  });
});

describe('textFormat · General', () => {
  it("Vaciar el campo vuelve a General con `null` (nunca `''`)", () => {
    expect(normalizeFormatInput('')).toBeNull();
    expect(normalizeFormatInput('   ')).toBeNull();
    // Un `=` suelto es una expresión rota: también vuelve a General.
    expect(normalizeFormatInput('=')).toBeNull();
    expect(GENERAL_FORMAT).toBeNull();
  });

  it('el selector marca General cuando no hay formato', () => {
    expect(formatPresetId(undefined)).toBe('general');
  });
});

describe('textFormat · campo libre y expresiones', () => {
  it('una cadena personalizada se escribe literal (con `;` y `\\`)', () => {
    expect(normalizeFormatInput('  #,##0.00;(#,##0.00)  ')).toBe('#,##0.00;(#,##0.00)');
  });

  it('la expresión se pasa sin escapar: comillas y paréntesis intactos', () => {
    expect(normalizeFormatInput(CORPUS_EXPRESSION)).toBe(CORPUS_EXPRESSION);
    expect(normalizeFormatInput(` ${CORPUS_EXPRESSION} `)).toBe(CORPUS_EXPRESSION);
    expect(isExpressionFormat(CORPUS_EXPRESSION)).toBe(true);
    expect(isExpressionFormat('N2')).toBe(false);
    expect(formatPresetId(CORPUS_EXPRESSION)).toBe('expression');
  });

  it('un literal que no es preset se marca como personalizado', () => {
    expect(formatPresetId('#,##0.00')).toBe('custom');
    expect(formatPresetId('N2')).toBe('n2');
    expect(formatPresetId('mixed')).toBe('mixed');
  });
});

describe('textFormat · formato efectivo', () => {
  it('el run gana al párrafo y al item', () => {
    const paragraph: ParagraphDto = {
      runs: [{ value: 'A', style: { format: 'N0' } }],
      style: { format: 'N2' },
    };
    expect(effectiveRunFormat(paragraph, paragraph.runs[0]!, { format: 'C2' })).toBe('N0');
  });

  it('sin formato en el run cae al párrafo, y sin párrafo al item', () => {
    const paragraph: ParagraphDto = { runs: [{ value: 'A' }], style: { format: 'N2' } };
    expect(effectiveRunFormat(paragraph, paragraph.runs[0]!, { format: 'C2' })).toBe('N2');
    expect(effectiveRunFormat({ runs: [{ value: 'A' }] }, { value: 'A' }, { format: 'C2' })).toBe(
      'C2',
    );
    expect(effectiveRunFormat({ runs: [{ value: 'A' }] }, { value: 'A' })).toBeUndefined();
  });

  it('todos los runs iguales (aunque hereden de niveles distintos) → la cadena común', () => {
    const paragraphs: ParagraphDto[] = [
      { runs: [{ value: 'A', style: { format: 'N2' } }] },
      { runs: [{ value: 'B' }], style: { format: 'N2' } },
    ];
    expect(commonEffectiveFormat(paragraphs, { format: 'N2' })).toBe('N2');
  });

  it('runs con formatos distintos → «mixed»', () => {
    const paragraphs: ParagraphDto[] = [
      { runs: [{ value: 'A', style: { format: 'N2' } }, { value: 'B' }] },
    ];
    expect(commonEffectiveFormat(paragraphs, { format: 'C2' })).toBe('mixed');
  });

  it('un run con formato y otro que hereda algo distinto → «mixed»', () => {
    const paragraphs: ParagraphDto[] = [
      {
        runs: [
          { value: 'A', style: { format: 'N2' } },
          { value: 'B', style: { format: 'N2' } },
        ],
      },
      { runs: [{ value: 'C' }] },
    ];
    // El párrafo 2 y el item no declaran formato: el run C queda sin formato.
    expect(commonEffectiveFormat(paragraphs)).toBe('mixed');
  });

  it('sin formato en ningún nivel → General (undefined); sin runs → undefined', () => {
    expect(commonEffectiveFormat([{ runs: [{ value: 'A' }] }])).toBeUndefined();
    expect(commonEffectiveFormat([], { format: 'N2' })).toBeUndefined();
  });
});
