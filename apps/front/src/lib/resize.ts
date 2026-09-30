/**
 * Matemática del redimensionado con tiradores (como `drag.ts`, pero para cajas).
 *
 * El handle indica qué bordes se mueven: `n`, `s`, `e`, `o` (oeste) y las
 * combinaciones de esquina. Se trabaja en cm y se devuelve la caja normalizada:
 * tamaño mínimo, sin salirse de la región (si hay `bounds`) e imán opcional
 * (Shift lo desactiva).
 */

import type { Length } from '@rdlc-designer/contracts';

export const RESIZE_HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const;
export type ResizeHandle = (typeof RESIZE_HANDLES)[number];

/** Tamaño mínimo de un item (el mismo que usa el dominio al clamar). */
export const MIN_SIZE_CM = 0.05;

/** Convierte un `Length` a cm (evita depender de lib/projection). */
function toCm(length: Length): number {
  switch (length.unit) {
    case 'cm':
      return length.value;
    case 'mm':
      return length.value / 10;
    case 'in':
      return length.value * 2.54;
    case 'pt':
      return (length.value * 2.54) / 72;
  }
}

export interface BoxCm {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface ResizeInput {
  handle: ResizeHandle;
  /** Caja al empezar el arrastre (cm). */
  start: BoxCm;
  /** Desplazamiento del puntero desde el inicio del arrastre, en cm. */
  dxCm: number;
  dyCm: number;
  /** Límites de la región en cm (solo items de primer nivel). */
  bounds?: { width: number; height: number };
  snap: boolean;
  snapCm: number;
}

export function computeResize(input: ResizeInput): BoxCm {
  const { handle, start } = input;
  const movesWest = handle.includes('w');
  const movesEast = handle.includes('e');
  const movesNorth = handle.startsWith('n');
  const movesSouth = handle.startsWith('s');

  let { top, left, width, height } = start;

  if (movesEast) width = start.width + input.dxCm;
  if (movesWest) {
    // Al arrastrar el borde oeste se mueve también el origen.
    width = start.width - input.dxCm;
    left = start.left + input.dxCm;
  }
  if (movesSouth) height = start.height + input.dyCm;
  if (movesNorth) {
    height = start.height - input.dyCm;
    top = start.top + input.dyCm;
  }

  // Tamaño mínimo: si se cruza, se ancla el borde que no se arrastra.
  if (width < MIN_SIZE_CM) {
    if (movesWest) left = start.left + start.width - MIN_SIZE_CM;
    width = MIN_SIZE_CM;
  }
  if (height < MIN_SIZE_CM) {
    if (movesNorth) top = start.top + start.height - MIN_SIZE_CM;
    height = MIN_SIZE_CM;
  }

  if (input.snap) {
    width = snapValue(width, input.snapCm);
    height = snapValue(height, input.snapCm);
    // La posición solo se imanta si se está moviendo ese borde.
    if (movesWest) left = snapValue(left, input.snapCm);
    if (movesNorth) top = snapValue(top, input.snapCm);
  }

  const bounds = input.bounds;
  if (bounds) {
    // La caja no puede salirse de la región: se recorta por el lado que empuja.
    const overflowRight = left + width - bounds.width;
    if (overflowRight > 0) {
      if (movesWest) left = Math.max(0, left - overflowRight);
      width = Math.max(MIN_SIZE_CM, Math.min(width, bounds.width - left));
    }
    const overflowBottom = top + height - bounds.height;
    if (overflowBottom > 0) {
      if (movesNorth) top = Math.max(0, top - overflowBottom);
      height = Math.max(MIN_SIZE_CM, Math.min(height, bounds.height - top));
    }
    if (left < 0) {
      if (movesWest) width = Math.max(MIN_SIZE_CM, width + left);
      left = 0;
    }
    if (top < 0) {
      if (movesNorth) height = Math.max(MIN_SIZE_CM, height + top);
      top = 0;
    }
  } else {
    // Items anidados: el contenedor no es un límite duro, pero no puede salir
    // del papel por arriba/izquierda.
    if (left < 0) {
      if (movesWest) width = Math.max(MIN_SIZE_CM, width + left);
      left = 0;
    }
    if (top < 0) {
      if (movesNorth) height = Math.max(MIN_SIZE_CM, height + top);
      top = 0;
    }
  }

  return {
    top: round4(top),
    left: round4(left),
    width: round4(width),
    height: round4(height),
  };
}

/** Ancho/alto de una frontera de la rejilla tras arrastrarla (nunca < mínimo). */
export function resizeBoundary(
  current: Length,
  deltaCm: number,
  snapCm: number | null = 0.1,
): Length {
  let cm = toCm(current) + deltaCm;
  if (snapCm !== null && snapCm > 0) cm = Math.round(cm / snapCm) * snapCm;
  // El mínimo se aplica al final: el imán no puede dejarlo por debajo.
  cm = Math.max(cm, MIN_SIZE_CM);

  return resizeBoundaryTo(current, cm);
}

/** Fija una frontera de la rejilla a un valor absoluto (cm), mantiene la unidad. */
export function resizeBoundaryTo(current: Length, cm: number): Length {
  const value = fromCm(Math.max(cm, MIN_SIZE_CM), current.unit);
  return { value: Math.round(value * 10000) / 10000, unit: current.unit };
}

/** cm → unidad de la longitud (para no mezclar unidades al devolver). */
function fromCm(cm: number, unit: Length['unit']): number {
  switch (unit) {
    case 'cm':
      return cm;
    case 'mm':
      return cm * 10;
    case 'in':
      return cm / 2.54;
    case 'pt':
      return (cm / 2.54) * 72;
  }
}

function snapValue(value: number, step: number): number {
  return Math.round(value / step) * step;
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}
