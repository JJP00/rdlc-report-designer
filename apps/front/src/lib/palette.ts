import type { ItemDto, ProjectionDto } from '@rdlc-designer/contracts';
import type { CatalogKey } from '@rdlc-designer/i18n';
import { flattenItems } from './projection';

/**
 * Datos de la paleta de comandos (Ctrl+K): elementos del informe para saltar a
 * ellos, variables para insertar y acciones del editor (cada una declara qué
 * contexto necesita para estar habilitada y las claves `palette.*` con su
 * nombre visible: la paleta es su superficie).
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

/** Categoría visible que agrupa una acción en la paleta (etiqueta de la derecha). */
export type PaletteCategory = 'report' | 'view' | 'tabs' | 'edit' | 'insert';

/** Claves del catálogo de cada categoría. */
export const PALETTE_CATEGORY_KEYS: Record<PaletteCategory, CatalogKey> = {
  report: 'palette.category.report',
  view: 'palette.category.view',
  tabs: 'palette.category.tabs',
  edit: 'palette.category.edit',
  insert: 'palette.category.insert',
};

export interface PaletteAction {
  id: PaletteActionId;
  /** Clave del catálogo del nombre visible («Deshacer» reutiliza `common.undo`). */
  labelKey: CatalogKey;
  /** Categoría visible de la acción (también es palabra clave de búsqueda). */
  group: PaletteCategory;
  /** Atajo neutral al idioma (símbolos/nombres de tecla iguales en EN y ES). */
  shortcut?: string;
  /** Atajo con nombre de tecla localizable (`common.shortcuts.*`). */
  shortcutKey?: CatalogKey;
  /** Contexto mínimo para ejecutarla (por defecto `none`: siempre disponible). */
  needs?: PaletteContext;
}

/** Acciones del editor que ofrece la paleta. */
export const PALETTE_ACTIONS: PaletteAction[] = [
  { id: 'new', labelKey: 'palette.action.new', group: 'report', shortcut: 'Ctrl+N' },
  { id: 'open', labelKey: 'palette.action.open', group: 'report', shortcut: 'Ctrl+O' },
  {
    id: 'save',
    labelKey: 'palette.action.save',
    group: 'report',
    shortcut: 'Ctrl+S',
    needs: 'document',
  },
  {
    id: 'save-as',
    labelKey: 'palette.action.saveAs',
    group: 'report',
    shortcutKey: 'common.shortcuts.saveAs',
    needs: 'document',
  },
  {
    id: 'close',
    labelKey: 'palette.action.close',
    group: 'report',
    shortcut: 'Ctrl+W',
    needs: 'document',
  },
  {
    id: 'report-properties',
    labelKey: 'palette.action.reportProperties',
    group: 'report',
    needs: 'document',
  },
  {
    id: 'toggle-variables',
    labelKey: 'palette.action.toggleVariables',
    group: 'view',
    needs: 'document',
  },
  {
    id: 'toggle-hierarchy',
    labelKey: 'palette.action.toggleHierarchy',
    group: 'view',
    needs: 'document',
  },
  { id: 'toggle-theme', labelKey: 'palette.action.toggleTheme', group: 'view' },
  {
    id: 'tab:next',
    labelKey: 'palette.action.nextTab',
    group: 'tabs',
    shortcut: 'Ctrl+Tab',
    needs: 'document',
  },
  {
    id: 'tab:prev',
    labelKey: 'palette.action.prevTab',
    group: 'tabs',
    shortcutKey: 'common.shortcuts.prevTab',
    needs: 'document',
  },
  {
    id: 'tab:move-left',
    labelKey: 'palette.action.moveTabLeft',
    group: 'tabs',
    shortcutKey: 'common.shortcuts.pageUp',
    needs: 'document',
  },
  {
    id: 'tab:move-right',
    labelKey: 'palette.action.moveTabRight',
    group: 'tabs',
    shortcutKey: 'common.shortcuts.pageDown',
    needs: 'document',
  },
  {
    id: 'zoom:fit-width',
    labelKey: 'palette.action.zoomFitWidth',
    group: 'view',
    shortcut: 'Ctrl+1',
    needs: 'document',
  },
  {
    id: 'zoom:100',
    labelKey: 'palette.action.zoom100',
    group: 'view',
    shortcut: 'Ctrl+0',
    needs: 'document',
  },
  {
    id: 'undo',
    labelKey: 'common.undo',
    group: 'edit',
    shortcut: 'Ctrl+Z',
    needs: 'document',
  },
  {
    id: 'redo',
    labelKey: 'common.redo',
    group: 'edit',
    shortcut: 'Ctrl+Y',
    needs: 'document',
  },
  { id: 'edit-text', labelKey: 'palette.action.editText', group: 'edit', needs: 'textbox' },
  {
    id: 'tablix-filters',
    labelKey: 'palette.action.tablixFilters',
    group: 'edit',
    needs: 'tablix',
  },
  {
    id: 'insert:textbox',
    labelKey: 'palette.action.insertTextbox',
    group: 'insert',
    needs: 'document',
  },
  {
    id: 'insert:rectangle',
    labelKey: 'palette.action.insertRectangle',
    group: 'insert',
    needs: 'document',
  },
  { id: 'insert:line', labelKey: 'palette.action.insertLine', group: 'insert', needs: 'document' },
  {
    id: 'insert:image',
    labelKey: 'palette.action.insertImage',
    group: 'insert',
    needs: 'document',
  },
  {
    id: 'insert:tablix',
    labelKey: 'palette.action.insertTablix',
    group: 'insert',
    needs: 'document',
  },
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
