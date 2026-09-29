import type { Length, NewItemSpec, ProjectionDto } from '@rdlc-designer/contracts';
import type { CanvasHit } from './hit';
import { cm, findItem } from './projection';
import { cellBoxAt } from './tablix';

/**
 * Spec del item que nace al insertar en el lienzo. **Dentro de una celda de
 * Tablix** ocupa la celda (origen 0,0 y su ancho/alto), como hace Report
 * Builder; en el resto, nace en el punto del cursor con su tamaño por defecto.
 */

export const NEW_ITEM_SIZES: Record<NewItemSpec['kind'], { width: Length; height: Length }> = {
  textbox: { width: { value: 5, unit: 'cm' }, height: { value: 1, unit: 'cm' } },
  rectangle: { width: { value: 5, unit: 'cm' }, height: { value: 1, unit: 'cm' } },
  line: { width: { value: 4, unit: 'cm' }, height: { value: 0, unit: 'cm' } },
  image: { width: { value: 3, unit: 'cm' }, height: { value: 2, unit: 'cm' } },
  // Un Tablix nace 2 filas × 3 columnas y el tamaño es el **total**: con
  // 7,5 × 1,2 cm las celdas quedan en 2,5 × 0,6 cm (como Report Builder).
  tablix: { width: { value: 7.5, unit: 'cm' }, height: { value: 1.2, unit: 'cm' } },
};

export function insertSpecAt(
  kind: NewItemSpec['kind'],
  hit: CanvasHit,
  projection: ProjectionDto,
): NewItemSpec {
  const size = NEW_ITEM_SIZES[kind];
  // Dentro de una celda o de un hueco de cabecera/esquina, el item ocupa el
  // hueco (origen 0,0 y su tamaño); fuera, nace en el punto del cursor.
  const box = hit.slot ?? cellBoxOfScope(projection, hit);
  return {
    kind,
    top: cm(box ? 0 : round4(hit.point.y)),
    left: cm(box ? 0 : round4(hit.point.x)),
    width: box ? cm(round4(box.width)) : size.width,
    height: box ? cm(round4(box.height)) : size.height,
    ...(kind === 'textbox' ? { text: '' } : {}),
  };
}

/** Caja (cm) de la celda del hit; `undefined` si no cae en una celda. */
function cellBoxOfScope(
  projection: ProjectionDto,
  hit: CanvasHit,
): { width: number; height: number } | undefined {
  const scope = hit.scope;
  if (scope.kind !== 'tablixCell') return undefined;
  const tablix = findItem(projection, scope.id);
  if (tablix?.kind !== 'tablix') return undefined;
  const box = cellBoxAt(tablix, scope.row, scope.col);
  return box ? { width: box.width, height: box.height } : undefined;
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}
