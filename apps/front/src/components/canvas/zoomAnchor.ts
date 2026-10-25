import { RULER_PX } from './geometry';

/**
 * Zoom anclado al cursor: el punto del papel que queda bajo el puntero al
 * empezar el gesto debe seguir bajo el puntero cuando el zoom se confirma. El
 * elemento del papel es la regla (`RULER_PX`, no escala) más la hoja (escala con
 * el zoom), así que el punto se guarda en px de papel a zoom 1.
 */
export interface ZoomAnchor {
  /** Punto del papel bajo el cursor (px de papel a zoom 1, sin la regla). */
  x: number;
  y: number;
  /** Posición del cursor en la ventana al empezar el gesto. */
  clientX: number;
  clientY: number;
  /** Cursor dentro del elemento del papel: origen de la escala provisional. */
  originX: number;
  originY: number;
}

interface PaperOrigin {
  left: number;
  top: number;
}

/** Ancla del gesto: el punto del papel bajo el puntero, con el papel sin escala provisional. */
export function zoomAnchorAt(
  paper: PaperOrigin,
  pointer: { clientX: number; clientY: number },
  zoom: number,
): ZoomAnchor {
  const originX = pointer.clientX - paper.left;
  const originY = pointer.clientY - paper.top;
  return {
    x: (originX - RULER_PX) / zoom,
    y: (originY - RULER_PX) / zoom,
    clientX: pointer.clientX,
    clientY: pointer.clientY,
    originX,
    originY,
  };
}

/**
 * Cuánto hay que desplazar el scroll (px) tras confirmar `zoom` para que el
 * punto anclado vuelva a quedar bajo el puntero. `paper` es el elemento del
 * papel ya redibujado al nuevo zoom y sin la escala provisional.
 */
export function scrollDeltaToKeepAnchor(
  paper: PaperOrigin,
  anchor: ZoomAnchor,
  zoom: number,
): { dx: number; dy: number } {
  return {
    dx: paper.left + RULER_PX + anchor.x * zoom - anchor.clientX,
    dy: paper.top + RULER_PX + anchor.y * zoom - anchor.clientY,
  };
}
