import type { ItemDto, ProjectionDto } from '@rdlc-designer/contracts';
import { tablixHeaderItems } from '@/lib/projection';
import { tablixLayout } from '@/lib/tablix';
import { PX_PER_CM, toPx } from './geometry';

/**
 * Culling del lienzo (T3): en informes grandes solo se pintan los items que
 * cruzan la ventana visible. Se aplica a partir de `CULL_MIN_ITEMS` para no
 * cambiar el comportamiento (ni los E2E) de los informes normales de BC.
 */

/** Ventana visible del lienzo en px de papel (coordenadas del stage). */
export interface VisibleRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Caja en px de papel. */
export interface BoxPx {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Nº mínimo de items para activar el culling. */
export const CULL_MIN_ITEMS = 250;

/** ¿Se cruzan las cajas? (el borde compartido no cuenta). */
export function intersectsBox(a: BoxPx, b: VisibleRect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

/**
 * Caja **absoluta** (px de papel) del item con sus descendientes. Los
 * rectángulos no recortan a sus hijos, así que su extensión es la unión; un
 * Tablix recorta a las celdas y basta con su tamaño total (cabeceras incluidas).
 */
export function itemExtent(item: ItemDto, originX: number, originY: number): BoxPx {
  const x = originX + toPx(item.left);
  const y = originY + toPx(item.top);
  let width = toPx(item.width);
  let height = toPx(item.height);

  if (item.kind === 'tablix') {
    const layout = tablixLayout(item);
    width = Math.max(width, layout.width * PX_PER_CM);
    height = Math.max(height, layout.height * PX_PER_CM);
    return { x, y, width, height };
  }

  if (item.kind === 'rectangle') {
    for (const child of item.children) {
      const childBox = itemExtent(child, x, y);
      width = Math.max(width, childBox.x + childBox.width - x);
      height = Math.max(height, childBox.y + childBox.height - y);
    }
  }

  return { x, y, width, height };
}

/** Número total de items del informe (las tres bandas, recursivo). */
export function countProjectionItems(projection: ProjectionDto): number {
  let total = 0;
  for (const region of [projection.page.header, projection.page.body, projection.page.footer]) {
    for (const item of region.items) total += countItem(item);
  }
  return total;
}

function countItem(item: ItemDto): number {
  let total = 1;
  if (item.kind === 'rectangle') {
    for (const child of item.children) total += countItem(child);
  } else if (item.kind === 'tablix') {
    for (const row of item.body.rows) {
      for (const cell of row.cells) {
        if (cell.content) total += countItem(cell.content);
      }
    }
    for (const header of tablixHeaderItems(item)) total += countItem(header);
  }
  return total;
}
