import type { BatchableCommand, ItemDto } from '@rdlc-designer/contracts';
import { cm, tablixHeaderItems, toCm } from './projection';

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

/** Hijos directos de un item (rectángulos, celdas y cabeceras de Tablix). */
function directChildren(item: ItemDto): ItemDto[] {
  if (item.kind === 'rectangle') return item.children;
  if (item.kind === 'tablix') {
    const cellContents = item.body.rows.flatMap((row) =>
      row.cells.flatMap((cell) => (cell?.content ? [cell.content] : [])),
    );
    return [...cellContents, ...tablixHeaderItems(item)];
  }
  return [];
}

/**
 * De los ids seleccionados, los que **no** están contenidos en otro item
 * seleccionado. La multiselección por lazo incluye el rectángulo y sus hijos;
 * los hijos con un contenedor seleccionado viajan con él (sus `top/left` son
 * relativos y no comparten espacio de coordenadas: alinear el conjunto movía
 * el contenedor al borde del hijo, y borrarlos por separado hacía fallar el
 * `batch` porque el padre ya no estaba — BUG-35).
 */
export function topLevelIds(items: ItemDto[], ids: string[]): string[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  const selected = new Set(ids.filter((id) => byId.has(id)));

  const nested = new Set<string>();
  const collectSelectedDescendants = (item: ItemDto): void => {
    for (const child of directChildren(item)) {
      if (selected.has(child.id)) nested.add(child.id);
      collectSelectedDescendants(child);
    }
  };
  for (const id of selected) {
    const item = byId.get(id);
    if (item) collectSelectedDescendants(item);
  }

  return ids.filter((id) => selected.has(id) && !nested.has(id));
}

/** Cajas (cm) de los items indicados, en el orden recibido. */
export function alignBoxes(items: ItemDto[], ids: string[]): AlignBox[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  return topLevelIds(items, ids).flatMap((id) => {
    const item = byId.get(id);
    if (!item) return [];
    return [
      {
        id: item.id,
        top: toCm(item.top),
        left: toCm(item.left),
        width: toCm(item.width),
        height: toCm(item.height),
      },
    ];
  });
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
