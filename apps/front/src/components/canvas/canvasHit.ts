import type { ScopeRef } from '@rdlc-designer/contracts';
import type Konva from 'konva';
import type { CanvasHit, HitOptions } from '@/lib/hit';
import { hitTestItems } from '@/lib/hit';
import { findItemInList, toCm } from '@/lib/projection';
import { bandAt, type PaperLayout } from './bands';
import { clamp, PX_PER_CM, RULER_PX, toPx } from './geometry';

/**
 * Helpers puros del lienzo: de un evento del DOM al `CanvasHit`, traer un item
 * a la vista y comparar scopes. Viven fuera del componente para que lo usen los
 * hooks del lienzo sin importarse entre sí.
 */

/** Scope del contrato para cada banda del papel. */
function scopeOfBand(key: string): ScopeRef {
  if (key === 'header') return { kind: 'pageHeader' };
  if (key === 'footer') return { kind: 'pageFooter' };
  return { kind: 'body' };
}

/** Traduce un evento del DOM (drop, click derecho) a `CanvasHit`. */
export function hitAtEvent(
  stage: Konva.Stage,
  zoom: number,
  layout: PaperLayout,
  event: { clientX: number; clientY: number },
  options?: HitOptions,
): CanvasHit | undefined {
  const rect = stage.container().getBoundingClientRect();
  // El stage está desplazado a la ventana renderizada (`x`/`y` en px de
  // pantalla): el punto se mide desde el origen del **papel**.
  const contentX = (event.clientX - rect.left - stage.x()) / zoom;
  const contentY = (event.clientY - rect.top - stage.y()) / zoom;
  if (
    contentX < 0 ||
    contentY < 0 ||
    contentX > layout.sheetWidth ||
    contentY > layout.sheetHeight
  ) {
    return undefined;
  }

  const band = bandAt(layout, contentX, contentY);
  if (!band) return undefined;

  const point = {
    x: clamp((contentX - band.x) / PX_PER_CM, 0, toCm(band.region.width)),
    y: clamp((contentY - band.y) / PX_PER_CM, 0, toCm(band.region.height)),
  };
  return hitTestItems(band.region.items, point, scopeOfBand(band.key), options);
}

/**
 * Desplaza el hueco del lienzo hasta el item pedido con un margen cómodo (lo
 * usan el «traer a la vista» de la paleta y la navegación por teclado). Si el
 * item no está en una banda visible (encabezado/pie apagados), no hace nada.
 */
export function scrollToItem(
  container: HTMLDivElement,
  bands: PaperLayout['bands'],
  id: string,
  zoom: number,
): void {
  for (const band of bands) {
    const item = findItemInList(band.region.items, id);
    if (!item) continue;

    const x = RULER_PX + (band.x + toPx(item.left)) * zoom;
    const y = RULER_PX + (band.y + toPx(item.top)) * zoom;
    container.scrollTo({
      left: Math.max(0, x - 120),
      top: Math.max(0, y - 120),
      behavior: 'smooth',
    });
    return;
  }
}

export function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

/** ¿Los dos scopes son el mismo contenedor? (mover vs reparentar). */
export function sameScope(a: ScopeRef, b: ScopeRef): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'rectangle' && b.kind === 'rectangle') return a.id === b.id;
  if (a.kind === 'tablixCell' && b.kind === 'tablixCell') {
    return a.id === b.id && a.row === b.row && a.col === b.col;
  }
  return true;
}
