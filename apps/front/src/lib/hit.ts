import type { ItemDto, ScopeRef } from '@rdlc-designer/contracts';
import { toCm } from './projection';

/**
 * Hit-test del lienzo en coordenadas de la proyección (cm, relativas a la
 * banda). No usa Konva: trabaja sobre el JSON de renderizado, así que sirve
 * igual para el menú contextual y para soltar un item arrastrado.
 *
 * Devuelve:
 * - `item`: el item de más arriba bajo el punto (para cortar/copiar/duplicar/…).
 * - `scope`/`index`: dónde insertar (el rectángulo más interno que contiene el
 *   punto, o la banda) y en qué posición (al final: el nuevo item se pinta encima).
 */

export interface PointCm {
  x: number;
  y: number;
}

export interface CanvasHit {
  item?: ItemDto;
  scope: ScopeRef;
  index: number;
  /** Punto (cm) relativo al origen del `scope`: dónde soltar/menuar el item. */
  point: PointCm;
}

export function hitTestItems(items: ItemDto[], point: PointCm, fallback: ScopeRef): CanvasHit {
  // De arriba abajo: el último hermano se dibuja encima.
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const candidate = items[index];
    if (!candidate || !contains(candidate, point)) continue;

    if (candidate.kind !== 'rectangle') {
      // El item tapa el punto, pero se inserta en el contenedor actual.
      return { item: candidate, scope: fallback, index: items.length, point };
    }

    const inner = hitTestItems(
      candidate.children,
      { x: point.x - toCm(candidate.left), y: point.y - toCm(candidate.top) },
      { kind: 'rectangle', id: candidate.id },
    );
    return {
      item: inner.item ?? candidate,
      scope: inner.scope,
      index: inner.index,
      point: inner.point,
    };
  }

  // Vacío: se inserta al final de este contenedor.
  return { scope: fallback, index: items.length, point };
}

function contains(item: ItemDto, point: PointCm): boolean {
  const left = toCm(item.left);
  const top = toCm(item.top);
  return (
    point.x >= left &&
    point.x <= left + toCm(item.width) &&
    point.y >= top &&
    point.y <= top + toCm(item.height)
  );
}
