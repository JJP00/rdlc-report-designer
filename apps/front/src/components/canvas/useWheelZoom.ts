import type Konva from 'konva';
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { clampZoom, roundZoom } from '@/lib/zoom';
import { RULER_PX } from './geometry';
import { scrollDeltaToKeepAnchor, zoomAnchorAt, type ZoomAnchor } from './zoomAnchor';

/**
 * Zoom provisional del gesto de la rueda. Las reglas lo leen en vivo (sin
 * re-render de React) para acompañar al papel mientras gira la rueda.
 */
export interface ZoomPreview {
  /** Zoom provisional (el que se confirmará al parar la rueda). */
  zoom: number;
  /** Desplazamiento en px del 0 del papel por escalar sobre el cursor. */
  shiftX: number;
  shiftY: number;
}

export interface ZoomPreviewSource {
  get(): ZoomPreview | null;
  subscribe(listener: () => void): () => void;
}

interface ZoomPreviewStore extends ZoomPreviewSource {
  set(preview: ZoomPreview | null): void;
}

function createZoomPreviewStore(): ZoomPreviewStore {
  let current: ZoomPreview | null = null;
  const listeners = new Set<() => void>();
  return {
    get: () => current,
    set: (preview) => {
      if (preview === current) return;
      current = preview;
      // Síncrono: al confirmar el zoom, las reglas se repintan antes del paint.
      for (const listener of listeners) listener();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/**
 * Ctrl+rueda: cada cambio de zoom redibuja el lienzo entero (con 136 elementos
 * a 400 % ~350 ms). Durante el gesto el stage solo se escala con CSS
 * (transform, barato) y el zoom real se confirma una vez, al parar la rueda.
 * Las reglas no se escalan: se redibujan con el zoom provisional (`preview`).
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
  /** Capa que se escala durante el gesto (el stage, sin las reglas). */
  sheetRef: RefObject<HTMLDivElement | null>;
  preview: ZoomPreviewSource;
  handleWheel: (event: Konva.KonvaEventObject<WheelEvent>) => void;
} {
  const paperRef = useRef<HTMLDivElement | null>(null);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const [preview] = useState(createZoomPreviewStore);
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
    const sheet = sheetRef.current;
    if (sheet) sheet.style.transform = '';
    preview.set(null);
    // ...y se corrige el scroll para que el punto anclado siga bajo el cursor
    // (sin esto, el papel crece desde su esquina y el contenido «salta»).
    const anchor = anchorRef.current;
    anchorRef.current = null;
    const paper = paperRef.current;
    const container = scrollRef.current;
    if (!anchor || !paper || !container) return;
    const { dx, dy } = scrollDeltaToKeepAnchor(paper.getBoundingClientRect(), anchor, zoom);
    container.scrollLeft += dx;
    container.scrollTop += dy;
  }, [zoom, scrollRef, preview]);
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
    const sheet = sheetRef.current;
    if (sheet && anchor) {
      // El preview escala sobre el **cursor**: lo que hay bajo él se queda quieto
      // mientras gira la rueda, y al confirmar el zoom el scroll lo mantiene ahí.
      // El origen va en coordenadas del stage (el ancla está en las del papel).
      const scale = target / zoom;
      sheet.style.transformOrigin = `${anchor.originX - sheet.offsetLeft}px ${anchor.originY - sheet.offsetTop}px`;
      sheet.style.transform = `scale(${scale})`;
      // Las reglas miden desde el borde del papel: su 0 se desplaza lo mismo que
      // el del papel al escalar sobre el cursor.
      preview.set({
        zoom: target,
        shiftX: (anchor.originX - RULER_PX) * (1 - scale),
        shiftY: (anchor.originY - RULER_PX) * (1 - scale),
      });
    }
    window.clearTimeout(wheelTimerRef.current);
    wheelTimerRef.current = window.setTimeout(() => {
      wheelTimerRef.current = 0;
      const confirmed = wheelTargetRef.current;
      if (confirmed === null) return;
      if (confirmed === zoom) {
        wheelTargetRef.current = null;
        anchorRef.current = null;
        if (sheetRef.current) sheetRef.current.style.transform = '';
        preview.set(null);
      } else onZoomChangeRef.current?.(confirmed);
    }, 120);
  };

  return { paperRef, sheetRef, preview, handleWheel };
}
