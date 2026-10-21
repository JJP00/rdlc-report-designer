import type { Length, StyleDto, TextboxDto } from '@rdlc-designer/contracts';
import { runDisplayText } from './text';

/**
 * Layout del texto de un textbox para el lienzo: **un run por nodo**, con la
 * alineación del párrafo (`TextAlign` del párrafo, que es el único que BC lee:
 * el del item lo ignora) y la precedencia RDL `run > párrafo > item`.
 *
 * El alto de línea es el del párrafo (`fontSize` efectivo × 1,2) y tanto la
 * medición de ancho como la conversión de longitudes a px entran por parámetro
 * para poder testear sin canvas.
 */

export interface TextRunBox {
  /** Índice del párrafo (para tests/diagnóstico). */
  paragraph: number;
  text: string;
  x: number;
  y: number;
  fontSize: number;
  fontFamily: string;
  /** `"bold italic"` como lo espera Konva. */
  fontStyle: string;
  fill: string;
  textDecoration?: string;
}

export interface TextLayout {
  runs: TextRunBox[];
  /** Alto total del bloque (para alinear verticalmente). */
  height: number;
  lineHeight: number;
}

export interface TextLayoutContext {
  /** Conversión de longitudes RDL a px del lienzo (`toPx` del canvas). */
  toPx: (length: Length) => number;
  /** Medición de ancho de un texto para una `font` CSS. */
  measure: (text: string, font: string) => number;
}

const DEFAULT_FONT_SIZE = 12;
const LINE_HEIGHT_FACTOR = 1.2;
const DEFAULT_FAMILY = 'Segoe UI';
const DEFAULT_COLOR = '#111827';

export function layoutTextbox(
  item: TextboxDto,
  box: { width: number; height: number },
  itemStyle: StyleDto | undefined,
  ctx: TextLayoutContext,
): TextLayout {
  const runs: TextRunBox[] = [];
  let line = 0;
  let lineHeight = 0;

  item.paragraphs.forEach((paragraph, paragraphIndex) => {
    const base = mergeStyles(itemStyle, paragraph.style);
    const currentLineHeight = fontPx(base, ctx) * LINE_HEIGHT_FACTOR;
    lineHeight = Math.max(lineHeight, currentLineHeight);

    // Ancho de cada run del párrafo, para colocar el bloque según el `TextAlign`.
    // Se mide el **texto de diseño** (etiqueta de BC o `<Exp>`), que es lo que
    // se pinta y no la expresión cruda.
    const widths = paragraph.runs.map((run) =>
      ctx.measure(runDisplayText(run), cssFont(mergeStyles(base, run.style), ctx)),
    );
    const total = widths.reduce((acc, value) => acc + value, 0);
    // Solo el párrafo alinea: BC ignora el `<TextAlign>` del item (ver
    // `effectiveTextStyle`).
    const align = (paragraph.style?.textAlign ?? 'Left').toLowerCase();
    const start =
      align === 'center' ? (box.width - total) / 2 : align === 'right' ? box.width - total : 0;

    let cursor = start;
    paragraph.runs.forEach((run, runIndex) => {
      const style = mergeStyles(base, run.style);
      runs.push({
        paragraph: paragraphIndex,
        text: runDisplayText(run),
        x: cursor,
        y: line * currentLineHeight,
        fontSize: fontPx(style, ctx),
        fontFamily: style.fontFamily ?? DEFAULT_FAMILY,
        fontStyle: cssFontStyle(style),
        fill: style.color && !style.color.startsWith('=') ? style.color : DEFAULT_COLOR,
        ...(style.textDecoration !== undefined
          ? { textDecoration: style.textDecoration.toLowerCase() }
          : {}),
      });
      cursor += widths[runIndex] ?? 0;
    });

    line += 1;
  });

  const height = line * lineHeight;
  const vertical = (itemStyle?.verticalAlign ?? 'Top').toLowerCase();
  const offset =
    vertical === 'middle'
      ? (box.height - height) / 2
      : vertical === 'bottom'
        ? box.height - height
        : 0;
  if (offset !== 0) {
    for (const run of runs) run.y += offset;
  }

  return { runs, height, lineHeight };
}

/** Estilo fusionado (el segundo gana); `undefined` no pisa. */
function mergeStyles(base: StyleDto | undefined, patch: StyleDto | undefined): StyleDto {
  const result: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch ?? {})) {
    if (value !== undefined) result[key] = value;
  }
  return result as StyleDto;
}

function fontPx(style: StyleDto, ctx: TextLayoutContext): number {
  return style.fontSize ? ctx.toPx(style.fontSize) : DEFAULT_FONT_SIZE;
}

function cssFontStyle(style: StyleDto): string {
  return [style.fontWeight === 'Bold' ? 'bold' : '', style.fontStyle === 'Italic' ? 'italic' : '']
    .filter(Boolean)
    .join(' ');
}

/** `font` CSS para medir como lo hará Konva. */
function cssFont(style: StyleDto, ctx: TextLayoutContext): string {
  const size = fontPx(style, ctx);
  const weight = style.fontWeight === 'Bold' ? 'bold ' : '';
  const italic = style.fontStyle === 'Italic' ? 'italic ' : '';
  return `${italic}${weight}${size}px ${style.fontFamily ?? DEFAULT_FAMILY}`;
}

/* ----------------------------- medición real ---------------------------- */

let measureCanvas: HTMLCanvasElement | null = null;

/** Medidor real (canvas 2D compartido, el mismo que usa Konva por debajo). */
export function browserTextMeasurer(): (text: string, font: string) => number {
  return (text, font) => {
    if (typeof document === 'undefined') return text.length * 6;
    if (!measureCanvas) measureCanvas = document.createElement('canvas');
    const context = measureCanvas.getContext('2d');
    if (!context) return text.length * 6;
    context.font = font;
    return context.measureText(text).width;
  };
}
