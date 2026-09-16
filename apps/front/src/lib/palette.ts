import type { ItemDto, ProjectionDto } from '@rdlc-designer/contracts';
import { flattenItems } from './projection';

/**
 * Datos de la paleta de comandos (Ctrl+K): elementos del informe para saltar a
 * ellos, variables para insertar y acciones del editor.
 */

export interface PaletteElement {
  id: string;
  kind: ItemDto['kind'];
  /** Texto por el que además del nombre se puede buscar (contenido del item). */
  haystack: string;
}

/** Todos los items con su texto buscable (nombre + texto/expresión). */
export function paletteElements(projection: ProjectionDto): PaletteElement[] {
  return flattenItems(projection).map((item) => ({
    id: item.id,
    kind: item.kind,
    haystack: [item.id, itemKindLabel(item.kind), searchableText(item)]
      .filter((part) => part.length > 0)
      .join(' · '),
  }));
}

/** Texto/expresión de un item (lo que el usuario reconoce al buscar). */
function searchableText(item: ItemDto): string {
  switch (item.kind) {
    case 'textbox':
      return item.paragraphs
        .flatMap((paragraph) =>
          paragraph.runs.map((run) => (run.label ? `${run.value} [${run.label}]` : run.value)),
        )
        .join(' ');
    case 'image':
      return item.value ?? '';
    default:
      return '';
  }
}

export function itemKindLabel(kind: ItemDto['kind']): string {
  switch (kind) {
    case 'textbox':
      return 'Textbox';
    case 'rectangle':
      return 'Rectángulo';
    case 'line':
      return 'Línea';
    case 'image':
      return 'Imagen';
    case 'tablix':
      return 'Tablix';
    case 'unknown':
      return 'Desconocido';
  }
}

export type PaletteActionId =
  | 'open'
  | 'save'
  | 'undo'
  | 'redo'
  | 'insert:textbox'
  | 'insert:rectangle'
  | 'insert:line'
  | 'insert:image'
  | 'toggle-variables'
  | 'report-properties';

export interface PaletteAction {
  id: PaletteActionId;
  label: string;
  group: string;
  shortcut?: string;
}

/** Acciones del editor que ofrece la paleta. */
export const PALETTE_ACTIONS: PaletteAction[] = [
  { id: 'open', label: 'Abrir informe…', group: 'Informe' },
  { id: 'save', label: 'Guardar', group: 'Informe', shortcut: 'Ctrl+S' },
  { id: 'report-properties', label: 'Propiedades del informe…', group: 'Informe' },
  {
    id: 'toggle-variables',
    label: 'Mostrar/ocultar variables',
    group: 'Ver',
  },
  { id: 'undo', label: 'Deshacer', group: 'Edición', shortcut: 'Ctrl+Z' },
  { id: 'redo', label: 'Rehacer', group: 'Edición', shortcut: 'Ctrl+Y' },
  { id: 'insert:textbox', label: 'Insertar textbox', group: 'Insertar' },
  { id: 'insert:rectangle', label: 'Insertar rectángulo', group: 'Insertar' },
  { id: 'insert:line', label: 'Insertar línea', group: 'Insertar' },
  { id: 'insert:image', label: 'Insertar imagen', group: 'Insertar' },
];
