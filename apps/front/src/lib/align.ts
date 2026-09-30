import type { BatchableCommand, ItemDto } from '@rdlc-designer/contracts';
import { cm, toCm } from './projection';

/**
 * Alinear y distribuir para la edición en lote (U3): matemática pura sobre las
 * cajas (cm) de los items; la salida son comandos `setLocation` que el panel
 * envía juntos en un `batch` (un solo paso de undo).
 */

export interface AlignBox {
  id: string;
  top: number;
  left: number;
  width: number;
  height: number;
}

export type AlignMode = 'left' | 'centerX' | 'right' | 'top' | 'middleY' | 'bottom';

function round4(value: number): number {
  return Number(value.toFixed(4));
}

/** Cajas (cm) de los items indicados, en el orden recibido. */
export function alignBoxes(items: ItemDto[], ids: string[]): AlignBox[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  return ids
    .map((id) => byId.get(id))
    .filter((item): item is ItemDto => item !== undefined)
    .map((item) => ({
      id: item.id,
      top: toCm(item.top),
      left: toCm(item.left),
      width: toCm(item.width),
      height: toCm(item.height),
    }));
}

/** Alinea por el borde/centro de la **caja envolvente** de la selección. */
export function alignCommands(boxes: AlignBox[], mode: AlignMode): BatchableCommand[] {
  if (boxes.length < 2) return [];
  const minLeft = Math.min(...boxes.map((box) => box.left));
  const maxRight = Math.max(...boxes.map((box) => box.left + box.width));
  const minTop = Math.min(...boxes.map((box) => box.top));
  const maxBottom = Math.max(...boxes.map((box) => box.top + box.height));
  const centerX = (minLeft + maxRight) / 2;
  const centerY = (minTop + maxBottom) / 2;

  return boxes.map((box) => {
    let left = box.left;
    let top = box.top;
    switch (mode) {
      case 'left':
        left = minLeft;
        break;
      case 'centerX':
        left = centerX - box.width / 2;
        break;
      case 'right':
        left = maxRight - box.width;
        break;
      case 'top':
        top = minTop;
        break;
      case 'middleY':
        top = centerY - box.height / 2;
        break;
      case 'bottom':
        top = maxBottom - box.height;
        break;
    }
    return { cmd: 'setLocation', id: box.id, top: cm(round4(top)), left: cm(round4(left)) };
  });
}

/** Reparte los centros uniformemente entre el primero y el último (≥3 items). */
export function distributeCommands(boxes: AlignBox[], axis: 'x' | 'y'): BatchableCommand[] {
  if (boxes.length < 3) return [];
  const position = (box: AlignBox): number =>
    axis === 'x' ? box.left + box.width / 2 : box.top + box.height / 2;
  const sorted = [...boxes].sort((a, b) => position(a) - position(b));
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  const step = (position(last) - position(first)) / (sorted.length - 1);

  return sorted.map((box, index) => {
    const center = position(first) + step * index;
    const left = axis === 'x' ? center - box.width / 2 : box.left;
    const top = axis === 'y' ? center - box.height / 2 : box.top;
    return { cmd: 'setLocation', id: box.id, top: cm(round4(top)), left: cm(round4(left)) };
  });
}
