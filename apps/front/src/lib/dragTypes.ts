/**
 * Tipo MIME propio del drag&drop de la toolbox (el navegador lo pasa a
 * minúsculas). Vive aparte de los componentes para no romper Fast Refresh.
 */
export const ITEM_DRAG_TYPE = 'application/x-rdlc-item';

/**
 * Contexto del final de un drag: dónde soltó el puntero y cuánto había
 * agarrado dentro del item (cm). Lo usa el lienzo para decidir si el item
 * cambia de contenedor (`moveItem`) y con qué `Top`/`Left`.
 */
export interface DropInfo {
  clientX: number;
  clientY: number;
  /** Distancia del puntero al origen del item al empezar el drag (cm). */
  grabCm: { x: number; y: number };
}
