import type { Length } from '@rdlc-designer/contracts';

/** Geometría del lienzo: unidades de papel (cm) ↔ px de pantalla. */

export const PX_PER_CM = 96 / 2.54;
/** Rejilla de imán en cm (Shift la ignora al soltar). */
export const SNAP_CM = 0.1;
/** Grosor de las reglas (px de pantalla, no escala con el zoom). */
export const RULER_PX = 20;

export function toPx(length: Length): number {
  switch (length.unit) {
    case 'cm':
      return length.value * PX_PER_CM;
    case 'mm':
      return (length.value / 10) * PX_PER_CM;
    case 'in':
      return length.value * 96;
    case 'pt':
      return length.value * (96 / 72);
  }
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}
