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
    if (value === undefined || !sameStyleValue(value, first)) return undefined;
  }
  return first;
}

/**
 * Igualdad **estructural** de valores de estilo: los objetos de la proyección
 * (`Length`, `padding`, `border`) se construyen nodo a nodo, así que comparar
 * por referencia siempre dice «distinto» aunque el valor sea idéntico.
 */
export function sameStyleValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Longitud en puntos (la barra de formato trabaja en pt). */
export function toPt(length: Length): number {
  return (toCm(length) / 2.54) * 72;
}

/**
 * Color pintable en el lienzo. En tiempo de diseño las expresiones RDL (`=…`)
 * **no se evalúan** (RB tampoco: muestra el fondo por defecto), y un color que
 * el navegador no entienda dejaría el `fillStyle` del canvas en negro.
 */
export function paintColor(value: string | undefined, fallback: string): string {
  if (!value || value.startsWith('=')) return fallback;
  if (
    typeof CSS !== 'undefined' &&
    typeof CSS.supports === 'function' &&
    !CSS.supports('color', value)
  ) {
    return fallback;
  }
  return value;
}

/**
 * Color normalizado a `#rrggbb` para `<input type="color">`: convierte nombres
 * CSS (`Silver`) y `rgb()`. Las expresiones y lo no pintable caen al defecto.
 */
export function toHexColor(value: string | undefined, fallback: string): string {
  const color = paintColor(value, fallback);
  if (/^#[0-9a-f]{6}$/i.test(color)) return color;
  if (typeof document === 'undefined') return fallback;

  const context = document.createElement('canvas').getContext('2d');
  if (!context) return fallback;
  context.fillStyle = '#000000';
  context.fillStyle = color;
  const normalized = context.fillStyle;
  if (/^#[0-9a-f]{6}$/i.test(normalized)) return normalized;

  const match = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(normalized);
  if (!match) return fallback;
  const hex = [match[1], match[2], match[3]]
    .map((part) => Number(part).toString(16).padStart(2, '0'))
    .join('');
  return `#${hex}`;
}

/** Texto por defecto del editor (y de la barra de formato) sobre fondo claro. */
const DARK_TEXT = '#111827';

/**
 * Color de texto **legible** sobre un fondo hex (`#rrggbb`): el texto oscuro
 * del editor o blanco, según la luminancia relativa (WCAG) del fondo. El
 * umbral 0.179 es el punto donde el contraste con negro y con blanco se iguala,
 * y lo usan los iconos de color de la barra de formato (el resaltado pinta la
 * «A» encima del color elegido: con blanco se quedaba ilegible en modo oscuro).
 * Un valor no legible cae al texto oscuro.
 */
export function contrastColor(background: string): string {
  const match = /^#([0-9a-f]{6})$/i.exec(background);
  if (!match) return DARK_TEXT;
  const value = Number.parseInt(match[1]!, 16);
  const channel = (raw: number): number => {
    const c = raw / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const luminance =
    0.2126 * channel((value >> 16) & 0xff) +
    0.7152 * channel((value >> 8) & 0xff) +
    0.0722 * channel(value & 0xff);
  return luminance > 0.179 ? DARK_TEXT : '#ffffff';
}
