import type { Length, StyleDto, TextboxDto } from '@rdlc-designer/contracts';
import { toCm } from './projection';

/**
 * Precedencia de estilos RDL: **run > párrafo > item**.
 *
 * El lienzo y la barra de formato solo conocen lo que declara cada nivel, así que
 * hay que resolver el valor *efectivo*: si un run lleva su propio `<FontSize>`,
 * el del item no se aplica al renderizar y el diseñador debe mostrarlo.
 *
 * Regla: un nivel manda solo si **todos** sus elementos declaran el valor y
 * coinciden (un textbox mixto no tiene "un" tamaño); si no, se cae al siguiente
 * nivel.
 */
export function effectiveTextStyle(item: TextboxDto): StyleDto | undefined {
  const runs = item.paragraphs.flatMap((paragraph) => paragraph.runs);
  const result: StyleDto = {};

  for (const key of STYLE_KEYS) {
    const value =
      agreed(runs.map((run) => run.style?.[key])) ??
      agreed(item.paragraphs.map((paragraph) => paragraph.style?.[key])) ??
      item.style?.[key];
    if (value !== undefined) {
      (result as Record<string, unknown>)[key] = value;
    }
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

const STYLE_KEYS = [
  'fontFamily',
  'fontSize',
  'fontWeight',
  'fontStyle',
  'textDecoration',
  'color',
  'backgroundColor',
  'textAlign',
  'verticalAlign',
  'padding',
  'format',
  'listStyle',
] as const satisfies readonly (keyof StyleDto)[];

/** El valor común del nivel, o `undefined` si falta en alguno o discrepan. */
function agreed<T>(values: (T | undefined)[]): T | undefined {
  const [first] = values;
  if (first === undefined) return undefined;

  for (const value of values) {
    if (value === undefined || !sameValue(value, first)) return undefined;
  }
  return first;
}

function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Longitud en puntos (la barra de formato trabaja en pt). */
export function toPt(length: Length): number {
  return (toCm(length) / 2.54) * 72;
}
