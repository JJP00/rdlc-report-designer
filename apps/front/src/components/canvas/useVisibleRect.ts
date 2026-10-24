import type { RefObject } from 'react';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { VisibleRect } from './culling';
import { CANVAS_PADDING_PX, RULER_PX } from './geometry';
import { canvasWindow, sameWindow } from './window';

/**
 * Ventana visible del lienzo (T3/T4): el hueco del scroller en px de papel,
 * ampliado con un margen y cuantizado (`canvasWindow`). Es la ventana que
 * **renderiza el stage** (cámara: el canvas cubre el hueco, no el papel entero)
 * y, en informes grandes, la que recorta el culling.
 *
 * Se publica **antes del primer pintado** (`useLayoutEffect`): el stage nace ya
 * con la ventana correcta y nunca se asigna un canvas del tamaño del papel. Al
 * hacer scroll solo se publica estado nuevo al cruzar un paso (`canvasWindow`),
 * así el scroll no re-renderiza a cada píxel.
 */

/** Medidas crudas del scroller (px de pantalla), tal como se leen del DOM. */
interface CanvasViewport {
  scrollLeft: number;
  scrollTop: number;
  width: number;
  height: number;
}

/** Tamaño del papel (px de papel). */
interface PaperSize {
  sheetWidth: number;
  sheetHeight: number;
}

/** Ventana de una medida cruda del scroller, con el zoom y el papel dados. */
function windowOf(measure: CanvasViewport, zoom: number, sheet: PaperSize): VisibleRect {
  return canvasWindow({
    // Borde visible en px de papel = intersección del hueco de scroll con el
    // **stage** (lo que el canvas recorta no se ve aunque esté en el hueco).
    left: (measure.scrollLeft - CANVAS_PADDING_PX - RULER_PX) / zoom,
    top: (measure.scrollTop - CANVAS_PADDING_PX - RULER_PX) / zoom,
    viewportWidth: measure.width,
    viewportHeight: measure.height,
    sheetWidth: sheet.sheetWidth,
    sheetHeight: sheet.sheetHeight,
    zoom,
  });
}

export interface UseVisibleRectOptions {
  containerRef: RefObject<HTMLDivElement | null>;
  zoom: number;
  /** Tamaño del papel (px de papel). */
  sheetWidth: number;
  sheetHeight: number;
}

export function useVisibleRect({
  containerRef,
  zoom,
  sheetWidth,
  sheetHeight,
}: UseVisibleRectOptions): VisibleRect | null {
  const [viewport, setViewport] = useState<CanvasViewport | null>(null);
  // Última medida publicada (no la última leída): comparar ventanas, no píxeles.
  const publishedRef = useRef<CanvasViewport | null>(null);

  // La ventana se deriva en render: un cambio de zoom (o de papel) no deja un
  // frame con la ventana antigua, aunque la medida cruda sea de hace un paso.
  const window = useMemo(
    () => (viewport ? windowOf(viewport, zoom, { sheetWidth, sheetHeight }) : null),
    [viewport, zoom, sheetWidth, sheetHeight],
  );

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let frame = 0;
    const read = (): CanvasViewport => ({
      scrollLeft: container.scrollLeft,
      scrollTop: container.scrollTop,
      width: container.clientWidth,
      height: container.clientHeight,
    });
    // El efecto se vuelve a montar al cambiar zoom o papel: los valores del cierre
    // son siempre los vigentes (no hace falta copiarlos a un ref durante el render).
    const sheet = { sheetWidth, sheetHeight };
    const publish = (next: CanvasViewport): void => {
      const previous = publishedRef.current;
      if (previous && sameWindow(windowOf(previous, zoom, sheet), windowOf(next, zoom, sheet))) {
        return;
      }
      publishedRef.current = next;
      setViewport(next);
    };
    const update = (): void => {
      frame = 0;
      publish(read());
    };
    const schedule = (): void => {
      if (frame === 0) frame = requestAnimationFrame(update);
    };

    // Medida inicial antes del primer pintado (el stage nace con la ventana).
    update();
    container.addEventListener('scroll', schedule, { passive: true });
    const observer = new ResizeObserver(schedule);
    observer.observe(container);
    return () => {
      if (frame !== 0) cancelAnimationFrame(frame);
      container.removeEventListener('scroll', schedule);
      observer.disconnect();
    };
  }, [containerRef, zoom, sheetWidth, sheetHeight]);

  return window;
}
