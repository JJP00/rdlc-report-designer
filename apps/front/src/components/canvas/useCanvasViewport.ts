import type { ProjectionDto } from '@rdlc-designer/contracts';
import type Konva from 'konva';
import { useEffect, useMemo, type RefObject } from 'react';
import { TEST_HOOKS_ENABLED } from '@/lib/testHooks';
import { fitWidthZoom } from '@/lib/zoom';
import { paperLayout, type PaperLayout } from './bands';
import { CULL_MIN_ITEMS, countProjectionItems, type VisibleRect } from './culling';
import { CANVAS_PADDING_PX, RULER_PX } from './geometry';
import { useVisibleRect } from './useVisibleRect';
import { fallbackWindow } from './window';

/**
 * Papel, cámara y culling del lienzo: el layout del papel, la ventana visible
 * que cubre el stage, el recorte de items fuera de ella y el zoom de «ajustar
 * al ancho» que se publica al padre.
 */
export function useCanvasViewport({
  projection,
  zoom,
  scrollRef,
  stageRef,
  onFitZoomChange,
}: {
  projection: ProjectionDto;
  zoom: number;
  scrollRef: RefObject<HTMLDivElement | null>;
  stageRef: RefObject<Konva.Stage | null>;
  onFitZoomChange: ((zoom: number) => void) | undefined;
}): {
  layout: PaperLayout;
  visibleBands: PaperLayout['bands'];
  cull: VisibleRect | null;
  stageWindow: VisibleRect;
} {
  const layout = paperLayout(projection);
  const visibleBands = layout.bands.filter((band) => band.visible);

  /**
   * Cámara + culling (T3/T4): ventana visible en px de papel. El stage cubre
   * **solo esta ventana**, no el papel entero a `papel × zoom`: así el coste de
   * memoria del canvas depende del hueco del lienzo, no del zoom ni del tamaño
   * del papel (un A4 a 400 % serían ~57 MB por canvas). `null` hasta la primera
   * medida; el stage arranca con la ventana provisional de `window.ts`.
   */
  const visibleRect = useVisibleRect({
    containerRef: scrollRef,
    zoom,
    sheetWidth: layout.sheetWidth,
    sheetHeight: layout.sheetHeight,
  });
  const itemCount = useMemo(() => countProjectionItems(projection), [projection]);
  // El culling (T3) se reserva a informes grandes: los normales se pintan enteros.
  const cull = itemCount >= CULL_MIN_ITEMS ? visibleRect : null;
  // Sin medida todavía (primera pasada): ventana provisional pequeña, para que
  // el stage monte ya con un canvas acotado. No llega a pintarse: la medida
  // real se publica antes del primer pintado (`useVisibleRect`).
  const stageWindow = useMemo<VisibleRect>(
    () =>
      visibleRect ??
      fallbackWindow({ sheetWidth: layout.sheetWidth, sheetHeight: layout.sheetHeight, zoom }),
    [visibleRect, layout.sheetWidth, layout.sheetHeight, zoom],
  );

  // QA: el stage real (los guiones consultan `getIntersection` y el zoom). Depende
  // de la ventana porque el stage se monta en cuanto hay una medida.
  useEffect(() => {
    if (TEST_HOOKS_ENABLED) {
      (window as Window & { __rdlcStage?: Konva.Stage | null }).__rdlcStage = stageRef.current;
    }
  }, [visibleRect, stageRef]);

  /**
   * «Ajustar al ancho»: mide el hueco real del lienzo (menos paddings y reglas)
   * y publica el zoom que deja el papel entero a la vista. El padre lo guarda y
   * lo aplica cuando el usuario lo pide (menú o Ctrl+1), no en cada resize.
   */
  useEffect(() => {
    const container = scrollRef.current;
    if (!container || !onFitZoomChange) return;
    const update = (): void => {
      const available = container.clientWidth - CANVAS_PADDING_PX * 2 - RULER_PX;
      const fit = fitWidthZoom(available, layout.sheetWidth);
      if (fit !== null) onFitZoomChange(fit);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(container);
    return () => observer.disconnect();
  }, [layout.sheetWidth, onFitZoomChange, scrollRef]);

  return { layout, visibleBands, cull, stageWindow };
}
