import type Konva from 'konva';
import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import { clampZoom, roundZoom } from '@/lib/zoom';
import { CANVAS_PADDING_PX } from './geometry';

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
  const onZoomChangeRef = useRef(onZoomChange);
  onZoomChangeRef.current = onZoomChange;
  useLayoutEffect(() => {
    // El zoom confirmado ya redibujó el papel: se retira la escala provisional.
    wheelTargetRef.current = null;
    if (paperRef.current) paperRef.current.style.transform = '';
  }, [zoom]);
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
    const base = wheelTargetRef.current ?? zoom;
    const target = roundZoom(clampZoom(base * (deltaY > 0 ? 1 / 1.1 : 1.1)));
    wheelTargetRef.current = target;
    const paper = paperRef.current;
    const container = scrollRef.current;
    if (paper) {
      // El preview escala sobre el **centro del hueco** (no sobre el origen del
      // papel): lo que el usuario está mirando se queda quieto y la ventana del
      // stage no deja huecos con un paso de rueda.
      const originX =
        (container?.scrollLeft ?? 0) + (container?.clientWidth ?? 0) / 2 - CANVAS_PADDING_PX;
      const originY =
        (container?.scrollTop ?? 0) + (container?.clientHeight ?? 0) / 2 - CANVAS_PADDING_PX;
      paper.style.transformOrigin = `${originX}px ${originY}px`;
      paper.style.transform = `scale(${target / zoom})`;
    }
    window.clearTimeout(wheelTimerRef.current);
    wheelTimerRef.current = window.setTimeout(() => {
      wheelTimerRef.current = 0;
      const confirmed = wheelTargetRef.current;
      if (confirmed === null) return;
      if (confirmed === zoom) {
        wheelTargetRef.current = null;
        if (paperRef.current) paperRef.current.style.transform = '';
      } else onZoomChangeRef.current?.(confirmed);
    }, 120);
  };

  return { paperRef, handleWheel };
}
