/** Cabeceras del Tablix (arriba y a la izquierda), como en Report Builder. */
export const HEADER_PX = 16;

/**
 * ¿El punto (px de papel) cae en las cabeceras de fila/columna o en la esquina
 * del marco (el «chrome» del Tablix, lo que dibuja `TablixHeaders`)? Lo usa el
 * lienzo: el click derecho ahí manda la **tabla**, como el izquierdo selecciona
 * la fila/columna. `offset` es el hueco de las cabeceras internas del cuerpo.
 */
export function tablixChromeAt(
  rect: { x: number; y: number; width: number; height: number },
  offset: { x: number; y: number } | undefined,
  x: number,
  y: number,
): boolean {
  const offsetX = offset?.x ?? 0;
  const offsetY = offset?.y ?? 0;
  const inColumnStrip =
    y >= rect.y - HEADER_PX && y <= rect.y && x >= rect.x + offsetX && x <= rect.x + rect.width;
  const inRowStrip =
    x >= rect.x - HEADER_PX && x <= rect.x && y >= rect.y + offsetY && y <= rect.y + rect.height;
  const inCorner = x >= rect.x - HEADER_PX && x <= rect.x && y >= rect.y - HEADER_PX && y <= rect.y;
  return inColumnStrip || inRowStrip || inCorner;
}
