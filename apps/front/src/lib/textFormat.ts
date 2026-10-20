import type { ParagraphDto, StyleDto, TextRunDto } from '@rdlc-designer/contracts';
import type { CatalogKey } from '@rdlc-designer/i18n';

/**
 * Formato (`<Format>`) del panel de texto y del editor de runs.
 *
 * El valor de un `<Format>` es una **cadena de formato .NET** de RDL (`N2`,
 * `P0`, `C2`, `d`, `D`, `g`, `#,##0.00;(#,##0.00)`) o una **expresión** que BC
 * evalúa en tiempo de ejecución (`=Fields!BTCQtyIntegerFormat.Value`). Las
 * expresiones se conservan **tal cual**: comillas y barras incluidas, sin
 * escapar nada (el escape es del XML, no de la cadena).
 */

/** Preset del selector: id estable en la interfaz + clave de catálogo + cadena .NET que escribe. */
export interface FormatPreset {
  id: string;
  /** Clave tipada del catálogo (`toolbar.formatField.presets.*`); la resuelve la superficie. */
  labelKey: CatalogKey;
  value: string;
}

/**
 * Presets habituales de informes de BC; el campo libre cubre el resto.
 * La etiqueta vive en el catálogo y la pinta `FormatField.tsx` con `t()`.
 */
export const FORMAT_PRESETS: readonly FormatPreset[] = [
  { id: 'n0', labelKey: 'toolbar.formatField.presets.n0', value: 'N0' },
  { id: 'n2', labelKey: 'toolbar.formatField.presets.n2', value: 'N2' },
  { id: 'p0', labelKey: 'toolbar.formatField.presets.p0', value: 'P0' },
  { id: 'p2', labelKey: 'toolbar.formatField.presets.p2', value: 'P2' },
  { id: 'c2', labelKey: 'toolbar.formatField.presets.c2', value: 'C2' },
  { id: 'date-short', labelKey: 'toolbar.formatField.presets.dateShort', value: 'd' },
  { id: 'date-long', labelKey: 'toolbar.formatField.presets.dateLong', value: 'D' },
  { id: 'date-time', labelKey: 'toolbar.formatField.presets.dateTime', value: 'g' },
];

/**
 * Valor de `format` para «General»: quitar el `<Format>` (**`null`**, nunca
 * `''`: el parche de estilo usa `null` para borrar la propiedad).
 */
export const GENERAL_FORMAT: null = null;

/** Formato vigente del campo: cadena, `undefined` (General) o «Mixto». */
export type FormatSelection = string | 'mixed' | undefined;

/** Cadena .NET del preset, o `undefined` si el id no es un preset. */
export function presetValue(id: string): string | undefined {
  return FORMAT_PRESETS.find((preset) => preset.id === id)?.value;
}

/** Una expresión de BC (`=Fields!…`, `=First(…)`) que el renderizador evalúa. */
export function isExpressionFormat(value: string): boolean {
  return value.trimStart().startsWith('=');
}

/**
 * Texto tecleado → valor del `format`. Vacío (o un `=` suelto, que sería una
 * expresión rota) vuelve a **General** (`null`); el resto se conserva sin
 * tocar comillas ni barras (solo se recortan los espacios de los bordes).
 */
export function normalizeFormatInput(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed === '' || trimmed === '=') return null;
  return trimmed;
}

/**
 * Id del `<option>` del selector que corresponde al valor vigente: un preset,
 * `'expression'` (`=…`), `'custom'` (cadena libre), `'general'` o `'mixed'`.
 */
export function formatPresetId(value: FormatSelection): string {
  if (value === undefined) return 'general';
  if (value === 'mixed') return 'mixed';
  const preset = FORMAT_PRESETS.find((candidate) => candidate.value === value);
  if (preset) return preset.id;
  return isExpressionFormat(value) ? 'expression' : 'custom';
}

/** Formato que rige un run: manda el suyo; si no, párrafo; si no, item. */
export function effectiveRunFormat(
  paragraph: ParagraphDto,
  run: TextRunDto,
  itemStyle?: StyleDto,
): string | undefined {
  return run.style?.format ?? paragraph.style?.format ?? itemStyle?.format;
}

/**
 * Formato común **efectivo** de los runs del textbox (run > párrafo > item):
 * la cadena si todos coinciden —aunque la declaren en niveles distintos—,
 * `'mixed'` si discrepan y `undefined` si ninguno tiene formato (General).
 */
export function commonEffectiveFormat(
  paragraphs: ParagraphDto[],
  itemStyle?: StyleDto,
): FormatSelection {
  const formats: (string | undefined)[] = [];
  for (const paragraph of paragraphs) {
    for (const run of paragraph.runs) {
      formats.push(effectiveRunFormat(paragraph, run, itemStyle));
    }
  }
  if (formats.length === 0) return undefined;

  const [first] = formats;
  return formats.every((format) => format === first) ? first : 'mixed';
}
