import { createTranslator, type Translator } from '@rdlc-designer/i18n';

/**
 * Helpers puros de la tira de pestañas (`TabStrip`): navegación con teclado,
 * destino de arrastres y textos accesibles. Viven aparte del componente para
 * que su fichero solo exporte componentes (Fast Refresh) y para ejercerlos en
 * tests sin React.
 */

/**
 * Traductor por defecto de los helpers puros de la tira: los tests los ejercen
 * sin React y afirman los textos ES del catálogo; la app pasa siempre el
 * traductor del idioma vigente.
 */
const defaultT: Translator['t'] = createTranslator('es').t;

/**
 * Nombre accesible de la pestaña: nombre del fichero y, si procede, el estado
 * que un lector de pantalla no puede deducir del `*` ámbar (hallazgo 9). El
 * conflicto puede darse sin cambios locales.
 */
export function tabAriaLabel(
  name: string,
  dirty: boolean,
  conflict: boolean,
  t: Translator['t'] = defaultT,
): string {
  const states = [
    dirty ? t('app.tabs.stateDirty') : null,
    conflict ? t('app.tabs.stateConflict') : null,
  ].filter((state): state is string => state !== null);
  return [name, ...states].join(', ');
}

/**
 * Índice de la pestaña destino de ←/→ (con vuelta circular) e Inicio/Fin
 * (extremos) en el `tablist`. `null` si la tecla no navega.
 */
export function focusTargetIndex(index: number, count: number, key: string): number | null {
  if (count <= 0) return null;
  switch (key) {
    case 'ArrowLeft':
      return (index - 1 + count) % count;
    case 'ArrowRight':
      return (index + 1) % count;
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    default:
      return null;
  }
}

/**
 * Índice final de un arrastre: la ranura de destino cuenta con la pestaña aún
 * en su sitio, así que al quitarla las de la derecha se desplazan una posición
 * (el mismo cálculo que recibe `onMove`).
 */
export function dropTargetIndex(from: number, drop: number): number {
  return drop > from ? drop - 1 : drop;
}

/**
 * Índice final de reordenar `delta` puestos, acotado al rango como `moveTab`
 * (`lib/workspace`); así el anuncio coincide con la posición real.
 */
export function moveTargetIndex(index: number, delta: number, count: number): number {
  return Math.max(0, Math.min(count - 1, index + delta));
}

/** Texto del anuncio del reordenado (hallazgo 21): «nombre», posición i de N. */
export function moveAnnouncement(
  name: string,
  index: number,
  count: number,
  t: Translator['t'] = defaultT,
): string {
  return t('app.tabs.moveAnnouncement', { name, position: index + 1, count });
}
