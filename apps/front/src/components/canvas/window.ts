import type { VisibleRect } from './culling';

/**
 * Ventana renderizada del lienzo (T4): el **stage de Konva cubre solo la parte
 * visible del papel** (más un margen) en vez de todo el papel a tamaño
 * `papel × zoom`. Un stage cuesta `ancho × alto × 4` bytes **por capa** (más el
 * canvas de hit de las capas que escuchan): un A4 a 400 % son ~57 MB por canvas
 * (y cientos de MB contando capas, × dpr² con el escalado de Windows). Con la
 * ventana el coste depende del hueco del lienzo, no del zoom ni del papel.
 *
 * La ventana se **cuantiza en px de pantalla** (no de papel): al hacer scroll
 * solo se re-renderiza al cruzar un paso, y el margen (≥ el paso) garantiza que
 * lo visible quede dentro entre dos actualizaciones. Cuantizar en px de papel
 * dejaría el paso a merced del zoom: a 400 % un paso de 400 px de papel son
 * 1600 px de pantalla y la ventana acabaría siendo la página entera.
 */

/** Paso de cuantización de la ventana (px de pantalla). */
export const WINDOW_STEP_PX = 300;
/** Margen alrededor de lo visible (px de pantalla). */
export const WINDOW_MARGIN_PX = 300;

export interface CanvasWindowInput {
  /** Borde superior/izquierdo visible (px de papel). */
  left: number;
  top: number;
  /** Hueco visible del lienzo (px de pantalla). */
  viewportWidth: number;
  viewportHeight: number;
  /** Tamaño del papel (px de papel). */
  sheetWidth: number;
  sheetHeight: number;
  zoom: number;
}

/**
 * Rect (px de papel) que debe cubrir el stage: lo visible + margen, cuantizado
 * a pasos de pantalla y recortado al papel. **Contiene siempre lo visible**:
 * entre dos actualizaciones la vista avanza como mucho un paso y el margen lo
 * cubre.
 */
export function canvasWindow(input: CanvasWindowInput): VisibleRect {
  const { viewportWidth, viewportHeight, sheetWidth, sheetHeight, zoom } = input;
  // El hueco visible, en px de papel (nunca negativo).
  const visibleWidth = Math.max(viewportWidth, 0) / zoom;
  const visibleHeight = Math.max(viewportHeight, 0) / zoom;
  // Los bordes visibles, dentro del papel (el hueco puede salirse por el padding).
  const left = Math.min(Math.max(input.left, 0), Math.max(sheetWidth - visibleWidth, 0));
  const top = Math.min(Math.max(input.top, 0), Math.max(sheetHeight - visibleHeight, 0));

  // A px de pantalla (relativos al papel), cuantizados y recortados al papel.
  const leftPx = left * zoom;
  const topPx = top * zoom;
  const widthPx = sheetWidth * zoom;
  const heightPx = sheetHeight * zoom;
  const x0 = Math.max(0, Math.floor(leftPx / WINDOW_STEP_PX) * WINDOW_STEP_PX - WINDOW_MARGIN_PX);
  const y0 = Math.max(0, Math.floor(topPx / WINDOW_STEP_PX) * WINDOW_STEP_PX - WINDOW_MARGIN_PX);
  const x1 = Math.min(
    widthPx,
    Math.ceil((leftPx + Math.max(viewportWidth, 0)) / WINDOW_STEP_PX) * WINDOW_STEP_PX +
      WINDOW_MARGIN_PX,
  );
  const y1 = Math.min(
    heightPx,
    Math.ceil((topPx + Math.max(viewportHeight, 0)) / WINDOW_STEP_PX) * WINDOW_STEP_PX +
      WINDOW_MARGIN_PX,
  );

  return {
    x: x0 / zoom,
    y: y0 / zoom,
    width: Math.max(x1 - x0, 0) / zoom,
    height: Math.max(y1 - y0, 0) / zoom,
  };
}

/** ¿Las dos ventanas son la misma caja? (evita re-renderizar por ruido). */
export function sameWindow(a: VisibleRect | null, b: VisibleRect | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

/** Ventana de la primera pasada (antes de medir el hueco), en px de pantalla. */
export const WINDOW_FALLBACK_PX = { width: 1600, height: 1000 };

/**
 * Ventana provisional mientras no hay medida del hueco: el papel recortado a
 * `WINDOW_FALLBACK_PX`. El stage monta ya con un canvas pequeño (nunca el
 * papel entero) y `useVisibleRect` la sustituye por la real **antes del primer
 * pintado** (su medida va en `useLayoutEffect`), así que no llega a verse.
 */
export function fallbackWindow(input: {
  sheetWidth: number;
  sheetHeight: number;
  zoom: number;
}): VisibleRect {
  const { sheetWidth, sheetHeight, zoom } = input;
  return {
    x: 0,
    y: 0,
    width: Math.min(sheetWidth, WINDOW_FALLBACK_PX.width / zoom),
    height: Math.min(sheetHeight, WINDOW_FALLBACK_PX.height / zoom),
  };
}
