/**
 * Matemática del fin de drag (px dentro del contenedor → cm + imán + límites).
 *
 * Reglas:
 * - nunca negativo;
 * - el tope máximo solo aplica si hay `bounds` (región de primer nivel) **y**
 *   el item cabe: los items anidados pueden desbordar su contenedor en RDL y
 *   un item que ocupa todo el contenedor no debe ser forzado a (0,0);
 * - el imán redondea a la rejilla y después se vuelve a comprobar el tope.
 */

export interface SizePx {
  width: number;
  height: number;
}

export interface DragEndInput {
  /** Posición del nodo en px, relativa a su contenedor. */
  x: number;
  y: number;
  itemSize: SizePx;
  /** Solo para items de primer nivel (banda/región). */
  bounds?: SizePx;
  /** Imán activo (Shift lo desactiva). */
  snap: boolean;
  pxPerCm: number;
  snapCm: number;
}

export interface DragEndResult {
  top: number;
  left: number;
}

function clampPosition(
  x: number,
  y: number,
  itemSize: SizePx,
  bounds?: SizePx,
): { x: number; y: number } {
  let cx = Math.max(x, 0);
  let cy = Math.max(y, 0);

  if (bounds) {
    const maxX = bounds.width - itemSize.width;
    const maxY = bounds.height - itemSize.height;
    if (maxX > 0) cx = Math.min(cx, maxX);
    if (maxY > 0) cy = Math.min(cy, maxY);
  }
  return { x: cx, y: cy };
}

export function computeDragEnd(input: DragEndInput): DragEndResult {
  const { itemSize, bounds, pxPerCm, snapCm } = input;

  const clamped = clampPosition(input.x, input.y, itemSize, bounds);
  let leftCm = clamped.x / pxPerCm;
  let topCm = clamped.y / pxPerCm;

  if (input.snap) {
    leftCm = Math.round(leftCm / snapCm) * snapCm;
    topCm = Math.round(topCm / snapCm) * snapCm;
  }

  // El imán no puede sacar al item de su límite.
  const afterSnap = clampPosition(leftCm * pxPerCm, topCm * pxPerCm, itemSize, bounds);
  return {
    left: round2(afterSnap.x / pxPerCm),
    top: round2(afterSnap.y / pxPerCm),
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
