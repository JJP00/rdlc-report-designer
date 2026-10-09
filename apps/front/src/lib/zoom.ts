/**
 * Zoom del lienzo: límites, presets y la matemática de «ajustar al ancho».
 * Es lógica pura (sin DOM) para poder probarla y compartirla entre la toolbar,
 * el lienzo y los atajos globales.
 */

/** Límites del zoom (los respetan +/−, la rueda, los presets y los atajos). */
export const ZOOM_MIN = 0.2;
export const ZOOM_MAX = 4;

/** Presets del menú de zoom (el 100 % va aparte, junto a «ajustar al ancho»). */
export const ZOOM_PRESETS = [0.5, 0.75, 1.25, 1.5, 2, 3, 4] as const;

/** Redondeo del zoom (3 decimales, como Ctrl+rueda): evita derivas visibles. */
export function roundZoom(value: number): number {
  return Number(value.toFixed(3));
}

/** Acota el zoom a los límites del lienzo. */
export function clampZoom(value: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, value));
}

/**
 * Zoom de «ajustar al ancho»: el ancho disponible del lienzo repartido entre el
 * ancho del papel (px a zoom 1). `null` si aún no hay medidas (el efecto de
 * medida del lienzo publica el valor real en cuanto monta).
 */
export function fitWidthZoom(availableWidth: number, sheetWidth: number): number | null {
  if (!(availableWidth > 0) || !(sheetWidth > 0)) return null;
  return roundZoom(clampZoom(availableWidth / sheetWidth));
}
