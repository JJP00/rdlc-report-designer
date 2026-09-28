/**
 * Visibilidad RDL de un item (`<Visibility><Hidden>`).
 *
 * En diseño, un `Hidden = true` literal se pinta **atenuado**: el layout sigue
 * completo (se puede seleccionar, mover y editar). Las expresiones
 * (`=IIF(...)`) no se evalúan en diseño (RB tampoco), así que se pintan
 * normales.
 */

/** Opacidad de un item oculto (suficiente para verlo y distinguirlo). */
export const HIDDEN_ITEM_OPACITY = 0.4;

export function itemOpacity(hidden?: boolean | string): number {
  return hidden === true ? HIDDEN_ITEM_OPACITY : 1;
}

/** Modo del campo de visibilidad del panel de propiedades. */
export type VisibilityMode = 'visible' | 'hidden' | 'expression';

/**
 * La visibilidad **predeterminada es visible**: `Hidden` ausente (o `false`) y
 * la declaración explícita `false` son el mismo estado para el usuario.
 */
export function visibilityMode(hidden?: boolean | string): VisibilityMode {
  if (hidden === true) return 'hidden';
  if (typeof hidden === 'string') return 'expression';
  return 'visible';
}
