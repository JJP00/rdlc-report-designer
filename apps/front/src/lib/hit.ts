import type { ItemDto, ScopeRef } from '@rdlc-designer/contracts';
import { sortByZIndex, toCm } from './projection';
import { findCellAt, tablixLayout, type CellRef } from './tablix';

/**
 * Hit-test del lienzo en coordenadas de la proyección (cm, relativas a la
 * banda). No usa Konva: trabaja sobre el JSON de renderizado, así que sirve
 * igual para el menú contextual y para soltar un item arrastrado.
 *
 * Devuelve:
 * - `item`: el item de más arriba bajo el punto (para cortar/copiar/duplicar/…).
 * - `scope`/`index`: dónde insertar (el rectángulo o **celda de Tablix** más
 *   interna que contiene el punto, o la banda) y en qué posición (al final: el
 *   nuevo item se pinta encima).
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
  /**
   * Celdas de Tablix atravesadas por el punto, **de la más externa a la más
   * interna** (hay tablixes anidados): la usa el click derecho para no perder
   * una selección de celdas activa.
   */
  cells?: CellRef[];
}

export function hitTestItems(items: ItemDto[], point: PointCm, fallback: ScopeRef): CanvasHit {
  // De arriba abajo: manda el ZIndex (a igualdad, el último hermano).
  const ordered = sortByZIndex(items);
  for (let index = ordered.length - 1; index >= 0; index -= 1) {
    const candidate = ordered[index];
    if (!candidate || !contains(candidate, point)) continue;

    const relX = point.x - toCm(candidate.left);
    const relY = point.y - toCm(candidate.top);

    // Un Tablix se resuelve por celdas: el contenido de la celda manda.
    if (candidate.kind === 'tablix') {
      const cell = findCellAt(candidate, relX, relY);
      if (!cell) continue;
      const cellRef: CellRef = { id: candidate.id, row: cell.row, col: cell.col };
      const scope: ScopeRef = {
        kind: 'tablixCell',
        id: candidate.id,
        row: cell.row,
        col: cell.col,
      };
      const local = { x: relX - cell.x, y: relY - cell.y };
      if (!cell.content) {
        return { scope, index: 0, point: local, cells: [cellRef] };
      }
      const inner = hitTestItems([cell.content], local, scope);
      // La cadena va de fuera a dentro (un Tablix puede estar dentro de otro).
      return { ...inner, cells: [cellRef, ...(inner.cells ?? [])] };
    }

    if (candidate.kind !== 'rectangle') {
      // El item tapa el punto, pero se inserta en el contenedor actual.
      return { item: candidate, scope: fallback, index: items.length, point };
    }

    const inner = hitTestItems(
      candidate.children,
      { x: relX, y: relY },
      { kind: 'rectangle', id: candidate.id },
    );
    return {
      item: inner.item ?? candidate,
      scope: inner.scope,
      index: inner.index,
      point: inner.point,
      ...(inner.cells ? { cells: inner.cells } : {}),
    };
  }

  // Vacío: se inserta al final de este contenedor.
  return { scope: fallback, index: items.length, point };
}

function contains(item: ItemDto, point: PointCm): boolean {
  const left = toCm(item.left);
  const top = toCm(item.top);
  // En un Tablix manda la rejilla: los ficheros de BC no siempre declaran su Width/Height.
  const size =
    item.kind === 'tablix'
      ? tablixLayout(item)
      : { width: toCm(item.width), height: toCm(item.height) };
  return (
    point.x >= left &&
    point.x <= left + size.width &&
    point.y >= top &&
    point.y <= top + size.height
  );
}
