import type { ProjectionDto } from '@rdlc-designer/contracts';
import { useEffect, useMemo, useState, type RefObject } from 'react';
import { CULL_MIN_ITEMS, countProjectionItems, type VisibleRect } from './culling';
import { CANVAS_PADDING_PX, RULER_PX } from './geometry';

/**
 * Culling del lienzo (T3): calcula la **ventana visible en px de papel** a
 * partir del contenedor con scroll, recortada al stage (lo que el canvas
 * recorta no se ve). El origen se cuantiza a pasos de 400 px y se deja un
 * margen de 600 (> paso) para que al hacer scroll no haya pop-in y solo se
 * re-renderice cada 400 px de desplazamiento.
 *
 * Devuelve `null` mientras el informe no supera `CULL_MIN_ITEMS` (los informes
 * normales de BC se pintan completos, como siempre).
 */

const CULL_STEP_PX = 400;
const CULL_MARGIN_PX = 600;

export interface UseVisibleRectOptions {
  containerRef: RefObject<HTMLDivElement | null>;
  projection: ProjectionDto;
  zoom: number;
  /** Tamaño del papel (px de papel), para recortar la ventana al stage. */
  sheetWidth: number;
  sheetHeight: number;
}

export function useVisibleRect({
  containerRef,
  projection,
  zoom,
  sheetWidth,
  sheetHeight,
}: UseVisibleRectOptions): VisibleRect | null {
  const itemCount = useMemo(() => countProjectionItems(projection), [projection]);
  const [visibleRect, setVisibleRect] = useState<VisibleRect | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || itemCount < CULL_MIN_ITEMS) {
      setVisibleRect(null);
      return;
    }

    let frame = 0;
    const update = (): void => {
      frame = 0;
      // Ventana en px de papel = intersección del hueco de scroll con el
      // **stage** (lo que el canvas recorta no se ve aunque esté en el hueco).
      const rawLeft = (container.scrollLeft - CANVAS_PADDING_PX - RULER_PX) / zoom;
      const rawTop = (container.scrollTop - CANVAS_PADDING_PX - RULER_PX) / zoom;
      const rawRight = rawLeft + container.clientWidth / zoom;
      const rawBottom = rawTop + container.clientHeight / zoom;

      const left = Math.max(rawLeft, 0);
      const top = Math.max(rawTop, 0);
      const right = Math.min(rawRight, sheetWidth);
      const bottom = Math.min(rawBottom, sheetHeight);

      const x0 = Math.max(0, Math.floor(left / CULL_STEP_PX) * CULL_STEP_PX - CULL_MARGIN_PX);
      const y0 = Math.max(0, Math.floor(top / CULL_STEP_PX) * CULL_STEP_PX - CULL_MARGIN_PX);
      const x1 = Math.min(sheetWidth, Math.max(right, 0) + CULL_MARGIN_PX + CULL_STEP_PX);
      const y1 = Math.min(sheetHeight, Math.max(bottom, 0) + CULL_MARGIN_PX + CULL_STEP_PX);
      const next: VisibleRect = {
        x: x0,
        y: y0,
        width: Math.max(x1 - x0, 0),
        height: Math.max(y1 - y0, 0),
      };
      setVisibleRect((prev) =>
        prev &&
        prev.x === next.x &&
        prev.y === next.y &&
        prev.width === next.width &&
        prev.height === next.height
          ? prev
          : next,
      );
    };
    const schedule = (): void => {
      if (frame === 0) frame = requestAnimationFrame(update);
    };

    update();
    container.addEventListener('scroll', schedule, { passive: true });
    const observer = new ResizeObserver(schedule);
    observer.observe(container);
    return () => {
      if (frame !== 0) cancelAnimationFrame(frame);
      container.removeEventListener('scroll', schedule);
      observer.disconnect();
    };
  }, [containerRef, itemCount, zoom, sheetWidth, sheetHeight]);

  return visibleRect;
}
