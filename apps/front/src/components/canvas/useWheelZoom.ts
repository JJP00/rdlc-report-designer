import type Konva from 'konva';
import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import { clampZoom, roundZoom } from '@/lib/zoom';
import { scrollDeltaToKeepAnchor, zoomAnchorAt, type ZoomAnchor } from './zoomAnchor';

/**
 * Ctrl+rueda: cada cambio de zoom redibuja el lienzo entero (con 136 elementos
 * a 400 % ~350 ms). Durante el gesto el papel solo se escala con CSS
 * (transform, barato) y el zoom real se confirma una vez, al parar la rueda.
 */
export function useWheelZoom({
  zoom,
  onZoomChange,
  scrollRef,
}: {
  zoom: number;
  onZoomChange: ((zoom: number) => void) | undefined;
  scrollRef: RefObject<HTMLDivElement | null>;
}): {
  paperRef: RefObject<HTMLDivElement | null>;
  handleWheel: (event: Konva.KonvaEventObject<WheelEvent>) => void;
} {
  const paperRef = useRef<HTMLDivElement | null>(null);
  const wheelTargetRef = useRef<number | null>(null);
  const wheelTimerRef = useRef(0);
  // El temporizador de la rueda llama al `onZoomChange` más reciente: el ref se
  // actualiza tras el render (no durante él), antes de que pueda dispararse.
  const onZoomChangeRef = useRef(onZoomChange);
  useLayoutEffect(() => {
    onZoomChangeRef.current = onZoomChange;
  });
  // Punto del papel bajo el cursor al empezar el gesto (zoom anclado al cursor).
  const anchorRef = useRef<ZoomAnchor | null>(null);
  useLayoutEffect(() => {
    // El zoom confirmado ya redibujó el papel: se retira la escala provisional...
    wheelTargetRef.current = null;
    const paper = paperRef.current;
    if (paper) paper.style.transform = '';
    // ...y se corrige el scroll para que el punto anclado siga bajo el cursor
    // (sin esto, el papel crece desde su esquina y el contenido «salta»).
    const anchor = anchorRef.current;
    anchorRef.current = null;
    const container = scrollRef.current;
    if (!anchor || !paper || !container) return;
    const { dx, dy } = scrollDeltaToKeepAnchor(paper.getBoundingClientRect(), anchor, zoom);
    container.scrollLeft += dx;
    container.scrollTop += dy;
  }, [zoom, scrollRef]);
  useEffect(
    () => () => {
      if (wheelTimerRef.current) window.clearTimeout(wheelTimerRef.current);
    },
    [],
  );
  const handleWheel = (event: Konva.KonvaEventObject<WheelEvent>): void => {
    if (!onZoomChange) return;
    const { ctrlKey, metaKey, deltaY } = event.evt;
    if (!ctrlKey && !metaKey) return;
    // En Electron, sin preventDefault Chromium haría zoom de toda la app.
    event.evt.preventDefault();
    const paper = paperRef.current;
    // El gesto empieza con el papel sin escala provisional: ahí se fija el punto
    // bajo el cursor, que ya no cambia hasta confirmar el zoom.
    if (wheelTargetRef.current === null && paper) {
      anchorRef.current = zoomAnchorAt(paper.getBoundingClientRect(), event.evt, zoom);
    }
    const base = wheelTargetRef.current ?? zoom;
    const target = roundZoom(clampZoom(base * (deltaY > 0 ? 1 / 1.1 : 1.1)));
    wheelTargetRef.current = target;
    const anchor = anchorRef.current;
    if (paper && anchor) {
      // El preview escala sobre el **cursor**: lo que hay bajo él se queda quieto
      // mientras gira la rueda, y al confirmar el zoom el scroll lo mantiene ahí.
      paper.style.transformOrigin = `${anchor.originX}px ${anchor.originY}px`;
      paper.style.transform = `scale(${target / zoom})`;
    }
    window.clearTimeout(wheelTimerRef.current);
    wheelTimerRef.current = window.setTimeout(() => {
      wheelTimerRef.current = 0;
      const confirmed = wheelTargetRef.current;
      if (confirmed === null) return;
      if (confirmed === zoom) {
        wheelTargetRef.current = null;
        anchorRef.current = null;
        if (paperRef.current) paperRef.current.style.transform = '';
      } else onZoomChangeRef.current?.(confirmed);
    }, 120);
  };

  return { paperRef, handleWheel };
}
