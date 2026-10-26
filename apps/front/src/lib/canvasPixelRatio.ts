import Konva from 'konva';

/**
 * Tope de la densidad de píxeles de los canvas de Konva.
 *
 * Cada canvas cuesta `ancho × alto × dpr²` bytes ×4: con el escalado de Windows
 * al 200 % (dpr 2) son 4× los de dpr 1. Por encima de 1,5 el texto del lienzo
 * apenas gana nitidez y la memoria sigue creciendo, así que se limita.
 */
export const MAX_CANVAS_PIXEL_RATIO = 1.5;

/** Densidad de píxeles que usará Konva para un `devicePixelRatio` dado. */
export function cappedPixelRatio(devicePixelRatio: number): number {
  if (!Number.isFinite(devicePixelRatio) || devicePixelRatio <= 0) return 1;
  return Math.min(devicePixelRatio, MAX_CANVAS_PIXEL_RATIO);
}

/**
 * Aplica el tope a todos los canvas que cree Konva a partir de ahora. Se llama
 * una vez al arrancar, **antes** del primer render: Konva lee `Konva.pixelRatio`
 * al crear cada canvas.
 */
export function limitKonvaPixelRatio(): void {
  Konva.pixelRatio = cappedPixelRatio(window.devicePixelRatio);
}
