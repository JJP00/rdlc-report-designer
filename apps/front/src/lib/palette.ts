import type { ItemDto, ProjectionDto } from '@rdlc-designer/contracts';
import { flattenItems } from './projection';

/**
 * Datos de la paleta de comandos (Ctrl+K): elementos del informe para saltar a
 * ellos, variables para insertar y acciones del editor (cada una declara qué
 * contexto necesita para estar habilitada).
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
  | 'new'
  | 'open'
  | 'save'
  | 'save-as'
  | 'close'
  | 'report-properties'
  | 'toggle-variables'
  | 'toggle-hierarchy'
  | 'toggle-theme'
  | 'tab:next'
  | 'tab:prev'
  | 'tab:move-left'
  | 'tab:move-right'
  | 'zoom:fit-width'
  | 'zoom:100'
  | 'undo'
  | 'redo'
  | 'edit-text'
  | 'tablix-filters'
  | 'insert:textbox'
  | 'insert:rectangle'
  | 'insert:line'
  | 'insert:image'
  | 'insert:tablix';

/** Contexto que necesita una acción para poder ejecutarse. */
export type PaletteContext = 'none' | 'document' | 'textbox' | 'tablix';

export interface PaletteAction {
  id: PaletteActionId;
  label: string;
  group: string;
  shortcut?: string;
  /** Contexto mínimo para ejecutarla (por defecto `none`: siempre disponible). */
  needs?: PaletteContext;
}

/** Acciones del editor que ofrece la paleta. */
export const PALETTE_ACTIONS: PaletteAction[] = [
  { id: 'new', label: 'Nuevo informe', group: 'Informe', shortcut: 'Ctrl+N' },
  { id: 'open', label: 'Abrir informe…', group: 'Informe', shortcut: 'Ctrl+O' },
  { id: 'save', label: 'Guardar', group: 'Informe', shortcut: 'Ctrl+S', needs: 'document' },
  {
    id: 'save-as',
    label: 'Guardar como…',
    group: 'Informe',
    shortcut: 'Ctrl+Mayús+S',
    needs: 'document',
  },
  {
    id: 'close',
    label: 'Cerrar informe',
    group: 'Informe',
    shortcut: 'Ctrl+W',
    needs: 'document',
  },
  {
    id: 'report-properties',
    label: 'Propiedades del informe…',
    group: 'Informe',
    needs: 'document',
  },
  { id: 'toggle-variables', label: 'Mostrar u ocultar variables', group: 'Ver', needs: 'document' },
  { id: 'toggle-hierarchy', label: 'Mostrar u ocultar jerarquía', group: 'Ver', needs: 'document' },
  { id: 'toggle-theme', label: 'Modo oscuro / modo claro', group: 'Ver' },
  {
    id: 'tab:next',
    label: 'Pestaña siguiente',
    group: 'Pestañas',
    shortcut: 'Ctrl+Tab',
    needs: 'document',
  },
  {
    id: 'tab:prev',
    label: 'Pestaña anterior',
    group: 'Pestañas',
    shortcut: 'Ctrl+Mayús+Tab',
    needs: 'document',
  },
  {
    id: 'tab:move-left',
    label: 'Mover pestaña a la izquierda',
    group: 'Pestañas',
    shortcut: 'Ctrl+Mayús+RePág',
    needs: 'document',
  },
  {
    id: 'tab:move-right',
    label: 'Mover pestaña a la derecha',
    group: 'Pestañas',
    shortcut: 'Ctrl+Mayús+AvPág',
    needs: 'document',
  },
  {
    id: 'zoom:fit-width',
    label: 'Ajustar al ancho',
    group: 'Ver',
    shortcut: 'Ctrl+1',
    needs: 'document',
  },
  {
    id: 'zoom:100',
    label: 'Zoom 100 % (tamaño real)',
    group: 'Ver',
    shortcut: 'Ctrl+0',
    needs: 'document',
  },
  { id: 'undo', label: 'Deshacer', group: 'Edición', shortcut: 'Ctrl+Z', needs: 'document' },
  { id: 'redo', label: 'Rehacer', group: 'Edición', shortcut: 'Ctrl+Y', needs: 'document' },
  {
    id: 'edit-text',
    label: 'Editar el texto del textbox…',
    group: 'Edición',
    needs: 'textbox',
  },
  { id: 'tablix-filters', label: 'Filtros del Tablix…', group: 'Edición', needs: 'tablix' },
  { id: 'insert:textbox', label: 'Insertar textbox', group: 'Insertar', needs: 'document' },
  { id: 'insert:rectangle', label: 'Insertar rectángulo', group: 'Insertar', needs: 'document' },
  { id: 'insert:line', label: 'Insertar línea', group: 'Insertar', needs: 'document' },
  { id: 'insert:image', label: 'Insertar imagen', group: 'Insertar', needs: 'document' },
  { id: 'insert:tablix', label: 'Insertar tabla (Tablix)', group: 'Insertar', needs: 'document' },
];

/** Estado del editor del que depende cada acción de la paleta. */
export interface PaletteCapabilities {
  hasDocument: boolean;
  /** El item seleccionado es un textbox (habilita «Editar el texto»). */
  hasTextbox: boolean;
  /** Hay un Tablix en contexto (seleccionado o el de la celda seleccionada). */
  hasTablix: boolean;
}

/** Ids deshabilitadas en el contexto actual (según su `needs`). */
export function paletteDisabledActions(capabilities: PaletteCapabilities): Set<PaletteActionId> {
  const available: Record<PaletteContext, boolean> = {
    none: true,
    document: capabilities.hasDocument,
    textbox: capabilities.hasTextbox,
    tablix: capabilities.hasTablix,
  };
  return new Set(
    PALETTE_ACTIONS.filter((action) => !available[action.needs ?? 'none']).map(
      (action) => action.id,
    ),
  );
}

/** Qué hacer con cada acción (lo cablea el shell del editor). */
export interface PaletteActionHandlers {
  newReport: () => void;
  open: () => void;
  save: () => void;
  saveAs: () => void;
  close: () => void;
  undo: () => void;
  redo: () => void;
  toggleVariables: () => void;
  toggleHierarchy: () => void;
  toggleTheme: () => void;
  nextTab: () => void;
  prevTab: () => void;
  moveTabLeft: () => void;
  moveTabRight: () => void;
  reportProperties: () => void;
  zoomFitWidth: () => void;
  zoom100: () => void;
  editText: () => void;
  tablixFilters: () => void;
  insertTextbox: () => void;
  insertRectangle: () => void;
  insertLine: () => void;
  insertImage: () => void;
  insertTablix: () => void;
}

/** Ejecutor de acciones de la paleta (sin `switch` en el componente). */
export function paletteRunner(handlers: PaletteActionHandlers): (action: PaletteActionId) => void {
  const map: Record<PaletteActionId, () => void> = {
    new: handlers.newReport,
    open: handlers.open,
    save: handlers.save,
    'save-as': handlers.saveAs,
    close: handlers.close,
    undo: handlers.undo,
    redo: handlers.redo,
    'toggle-variables': handlers.toggleVariables,
    'toggle-hierarchy': handlers.toggleHierarchy,
    'toggle-theme': handlers.toggleTheme,
    'tab:next': handlers.nextTab,
    'tab:prev': handlers.prevTab,
    'tab:move-left': handlers.moveTabLeft,
    'tab:move-right': handlers.moveTabRight,
    'report-properties': handlers.reportProperties,
    'zoom:fit-width': handlers.zoomFitWidth,
    'zoom:100': handlers.zoom100,
    'edit-text': handlers.editText,
    'tablix-filters': handlers.tablixFilters,
    'insert:textbox': handlers.insertTextbox,
    'insert:rectangle': handlers.insertRectangle,
    'insert:line': handlers.insertLine,
    'insert:image': handlers.insertImage,
    'insert:tablix': handlers.insertTablix,
  };
  return (action) => map[action]();
}

/** Minúsculas sin acentos (la búsqueda de la paleta ignora ambos). */
function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/** Prefijo del `value` de las acciones: sube su puntuación sobre elementos y variables. */
export const PALETTE_ACTION_MARK = '\u203a';

/**
 * Filtro de la paleta: cada palabra de la búsqueda debe aparecer **como
 * subcadena** (sin acentos ni mayúsculas) en el valor o las palabras clave; el
 * difuso por subsecuencia devolvía ruido («zzzz»). Puntúa más el inicio de
 * palabra y el valor sobre las palabras clave; las acciones llevan bonus para
 * ir antes que los elementos.
 */
export function paletteFilter(value: string, search: string, keywords: string[] = []): number {
  const terms = fold(search).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return 1;
  const isAction = value.startsWith(PALETTE_ACTION_MARK);
  const main = fold(isAction ? value.slice(PALETTE_ACTION_MARK.length) : value);
  const extra = fold(keywords.join(' '));
  let score = 0;
  for (const term of terms) {
    const inMain = main.indexOf(term);
    const inExtra = inMain < 0 ? extra.indexOf(term) : -1;
    if (inMain < 0 && inExtra < 0) return 0;
    const text = inMain >= 0 ? main : extra;
    const at = inMain >= 0 ? inMain : inExtra;
    const wordStart = at === 0 || /[^a-z0-9]/.test(text[at - 1] ?? '');
    score += (inMain >= 0 ? 0.6 : 0.3) + (wordStart ? 0.4 : 0);
  }
  return score / terms.length + (isAction ? 1 : 0);
}
