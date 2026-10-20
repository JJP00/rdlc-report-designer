import type { ItemDto, ScopeRef } from '@rdlc-designer/contracts';
import type { Translator } from '@rdlc-designer/i18n';
import { toCm } from '@/lib/projection';

/**
 * Piezas **puras** de accesibilidad del lienzo: orden de lectura, anuncios para
 * el lector de pantalla y etiquetas del destino de una inserción. Sin DOM ni
 * estado (y sin React: el traductor entra por parámetro) para poder probarlas.
 */

/** Traductor que necesitan los anuncios: el que devuelve `useT()` en el renderer. */
type Translate = Translator['t'];

/** cm con dos decimales y coma (formato español): `2` → «2,00 cm». */
export function formatCmEs(value: number): string {
  return `${value.toFixed(2).replace('.', ',')} cm`;
}

/** Anuncio del elemento seleccionado: «Textbox2, x 2,00 cm, y 3,40 cm». */
export function selectionAnnouncement(item: ItemDto, t: Translate): string {
  return t('canvas.a11y.selection', {
    id: item.id,
    x: formatCmEs(toCm(item.left)),
    y: formatCmEs(toCm(item.top)),
  });
}

/**
 * Siguiente id del orden de lectura para Tab/Shift+Tab. `null` = no hay destino
 * (borde de la lista o sin elementos): el llamante **no** intercepta la tecla,
 * para que el foco pueda entrar y salir del lienzo.
 */
export function nextReadingId(
  ids: readonly string[],
  selectedId: string | null,
  direction: 1 | -1,
): string | null {
  if (ids.length === 0) return null;
  const index = selectedId === null ? -1 : ids.indexOf(selectedId);
  // Sin selección (o con una que ya no existe) Tab entra por el primero;
  // Shift+Tab no intercepta para que el foco salga hacia atrás.
  if (index < 0) return direction === 1 ? (ids[0] ?? null) : null;
  return ids[index + direction] ?? null;
}

/** Primer o último id del orden de lectura (Inicio/Fin). `null` si no hay. */
export function edgeReadingId(ids: readonly string[], edge: 'first' | 'last'): string | null {
  if (ids.length === 0) return null;
  return edge === 'first' ? (ids[0] ?? null) : (ids[ids.length - 1] ?? null);
}

/**
 * Destino legible de una inserción para el mensaje del pie: «Celda 1,2» (mismo
 * formato que la Jerarquía), «el cuerpo», «el encabezado de página»…
 */
export function insertDestinationLabel(scope: ScopeRef, t: Translate): string {
  switch (scope.kind) {
    case 'body':
      return t('canvas.insert.body');
    case 'pageHeader':
      return t('canvas.insert.pageHeader');
    case 'pageFooter':
      return t('canvas.insert.pageFooter');
    case 'tablixCell':
      return t('canvas.insert.tablixCell', { row: scope.row + 1, col: scope.col + 1 });
    case 'rectangle':
      return t('canvas.insert.rectangle', { id: scope.id });
    case 'tablixHeader':
      return t('canvas.insert.tablixHeader', { id: scope.id });
    case 'tablixCorner':
      return t('canvas.insert.tablixCorner', { id: scope.id });
  }
}

/**
 * Esc en el lienzo sin selecci�n: la salida con teclado (WCAG 2.1.2). `true`
 * si la tecla debe devolver el foco a la pesta�a activa.
 */
export function shouldLeaveCanvas(opts: {
  key: string;
  defaultPrevented: boolean;
  hasSelection: boolean;
  inCanvas: boolean;
  typing: boolean;
  dialogOpen: boolean;
}): boolean {
  return (
    opts.key === 'Escape' &&
    !opts.defaultPrevented &&
    !opts.hasSelection &&
    opts.inCanvas &&
    !opts.typing &&
    !opts.dialogOpen
  );
}

/** Mueve el foco a la pesta�a activa de la tira. `false` si no hay ninguna. */
export function focusActiveTab(root: ParentNode = document): boolean {
  const tab = root.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
  if (!tab) return false;
  tab.focus();
  return true;
}
