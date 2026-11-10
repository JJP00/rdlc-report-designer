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
  | 'toggle-inspector'
  | 'toggle-problems'
  | 'reset-panels'
  | 'toggle-theme'
  | 'tab:next'
  | 'tab:prev'
  | 'tab:move-left'
  | 'tab:move-right'
  | 'tab:close-others'
  | 'tab:close-right'
  | 'tab:close-saved'
  | 'tab:close-all'
  | 'zoom:fit-width'
  | 'zoom:100'
  | 'zoom:in'
  | 'zoom:out'
  | 'undo'
  | 'redo'
  | 'copy'
  | 'cut'
  | 'paste'
  | 'duplicate'
  | 'delete'
  | 'bring-to-front'
  | 'send-to-back'
  | 'select-parent'
  | 'format:bold'
  | 'format:italic'
  | 'format:underline'
  | 'align:left'
  | 'align:center'
  | 'align:right'
  | 'valign:top'
  | 'valign:middle'
  | 'valign:bottom'
  | 'list:bulleted'
  | 'list:numbered'
  | 'list:none'
  | 'check-updates'
  | 'edit-text'
  | 'tablix-filters'
  | 'insert:textbox'
  | 'insert:rectangle'
  | 'insert:line'
  | 'insert:image'
  | 'insert:tablix';

/**
 * Contexto que necesita una acción para poder ejecutarse: documento abierto,
 * algo seleccionado (item o celda), un textbox, un Tablix, algo en el
 * portapapeles, otras pestañas, pestañas a la derecha, pestañas sin cambios o
 * el servicio de actualizaciones (solo en la app de escritorio).
 */
export type PaletteContext =
  | 'none'
  | 'document'
  | 'selection'
  | 'textbox'
  | 'tablix'
  | 'clipboard'
  | 'otherTabs'
  | 'tabsRight'
  | 'savedTabs'
  | 'updates';

/** Categoría visible que agrupa una acción en la paleta (etiqueta de la derecha). */
export type PaletteCategory = 'report' | 'view' | 'tabs' | 'edit' | 'format' | 'insert' | 'app';

/** Claves del catálogo de cada categoría. */
export const PALETTE_CATEGORY_KEYS: Record<PaletteCategory, CatalogKey> = {
  report: 'palette.category.report',
  view: 'palette.category.view',
  tabs: 'palette.category.tabs',
  edit: 'palette.category.edit',
  format: 'palette.category.format',
  insert: 'palette.category.insert',
  app: 'palette.category.app',
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
  {
    id: 'toggle-inspector',
    labelKey: 'palette.action.toggleInspector',
    group: 'view',
    needs: 'document',
  },
  {
    id: 'toggle-problems',
    labelKey: 'palette.action.toggleProblems',
    group: 'view',
    needs: 'document',
  },
  { id: 'reset-panels', labelKey: 'palette.action.resetPanels', group: 'view' },
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
    id: 'tab:close-others',
    labelKey: 'palette.action.closeOtherTabs',
    group: 'tabs',
    needs: 'otherTabs',
  },
  {
    id: 'tab:close-right',
    labelKey: 'palette.action.closeTabsRight',
    group: 'tabs',
    needs: 'tabsRight',
  },
  {
    id: 'tab:close-saved',
    labelKey: 'palette.action.closeSavedTabs',
    group: 'tabs',
    needs: 'savedTabs',
  },
  {
    id: 'tab:close-all',
    labelKey: 'palette.action.closeAllTabs',
    group: 'tabs',
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
  { id: 'zoom:in', labelKey: 'palette.action.zoomIn', group: 'view', needs: 'document' },
  { id: 'zoom:out', labelKey: 'palette.action.zoomOut', group: 'view', needs: 'document' },
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
  {
    id: 'copy',
    labelKey: 'palette.action.copy',
    group: 'edit',
    shortcut: 'Ctrl+C',
    needs: 'selection',
  },
  {
    id: 'cut',
    labelKey: 'palette.action.cut',
    group: 'edit',
    shortcut: 'Ctrl+X',
    needs: 'selection',
  },
  {
    id: 'paste',
    labelKey: 'palette.action.paste',
    group: 'edit',
    shortcut: 'Ctrl+V',
    needs: 'clipboard',
  },
  {
    id: 'duplicate',
    labelKey: 'palette.action.duplicate',
    group: 'edit',
    shortcut: 'Ctrl+D',
    needs: 'selection',
  },
  {
    id: 'delete',
    labelKey: 'palette.action.delete',
    group: 'edit',
    shortcutKey: 'common.shortcuts.delete',
    needs: 'selection',
  },
  {
    id: 'bring-to-front',
    labelKey: 'palette.action.bringToFront',
    group: 'edit',
    shortcut: 'Ctrl+Shift+]',
    needs: 'selection',
  },
  {
    id: 'send-to-back',
    labelKey: 'palette.action.sendToBack',
    group: 'edit',
    shortcut: 'Ctrl+Shift+[',
    needs: 'selection',
  },
  {
    id: 'select-parent',
    labelKey: 'palette.action.selectParent',
    group: 'edit',
    shortcut: 'Esc',
    needs: 'selection',
  },
  {
    id: 'format:bold',
    labelKey: 'palette.action.bold',
    group: 'format',
    needs: 'selection',
  },
  {
    id: 'format:italic',
    labelKey: 'palette.action.italic',
    group: 'format',
    needs: 'selection',
  },
  {
    id: 'format:underline',
    labelKey: 'palette.action.underline',
    group: 'format',
    needs: 'selection',
  },
  { id: 'align:left', labelKey: 'palette.action.alignLeft', group: 'format', needs: 'selection' },
  {
    id: 'align:center',
    labelKey: 'palette.action.alignCenter',
    group: 'format',
    needs: 'selection',
  },
  { id: 'align:right', labelKey: 'palette.action.alignRight', group: 'format', needs: 'selection' },
  { id: 'valign:top', labelKey: 'palette.action.alignTop', group: 'format', needs: 'selection' },
  {
    id: 'valign:middle',
    labelKey: 'palette.action.alignMiddle',
    group: 'format',
    needs: 'selection',
  },
  {
    id: 'valign:bottom',
    labelKey: 'palette.action.alignBottom',
    group: 'format',
    needs: 'selection',
  },
  { id: 'list:bulleted', labelKey: 'palette.action.bullets', group: 'format', needs: 'textbox' },
  { id: 'list:numbered', labelKey: 'palette.action.numbering', group: 'format', needs: 'textbox' },
  { id: 'list:none', labelKey: 'palette.action.noList', group: 'format', needs: 'textbox' },
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
  { id: 'check-updates', labelKey: 'palette.action.checkUpdates', group: 'app', needs: 'updates' },
];

/** Estado del editor del que depende cada acción de la paleta. */
export interface PaletteCapabilities {
  hasDocument: boolean;
  /** Hay item o celda seleccionados (copiar, duplicar, formato…). */
  hasSelection: boolean;
  /** El item seleccionado es un textbox (habilita «Editar el texto»). */
  hasTextbox: boolean;
  /** Hay un Tablix en contexto (seleccionado o el de la celda seleccionada). */
  hasTablix: boolean;
  /** Hay algo copiado que pegar. */
  hasClipboard: boolean;
  /** Pestañas abiertas y posición de la activa (0-based; -1 sin pestañas). */
  tabCount: number;
  activeTabIndex: number;
  /** Alguna pestaña no tiene cambios sin guardar. */
  hasSavedTab: boolean;
  /** Hay servicio de actualizaciones (la app de escritorio). */
  canCheckUpdates: boolean;
}

/** Ids deshabilitadas en el contexto actual (según su `needs`). */
export function paletteDisabledActions(capabilities: PaletteCapabilities): Set<PaletteActionId> {
  const { hasDocument, tabCount, activeTabIndex } = capabilities;
  const available: Record<PaletteContext, boolean> = {
    none: true,
    document: hasDocument,
    selection: hasDocument && capabilities.hasSelection,
    textbox: capabilities.hasTextbox,
    tablix: capabilities.hasTablix,
    clipboard: hasDocument && capabilities.hasClipboard,
    otherTabs: tabCount > 1,
    tabsRight: activeTabIndex >= 0 && activeTabIndex < tabCount - 1,
    savedTabs: capabilities.hasSavedTab,
    updates: capabilities.canCheckUpdates,
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
  toggleInspector: () => void;
  toggleProblems: () => void;
  resetPanels: () => void;
  toggleTheme: () => void;
  nextTab: () => void;
  prevTab: () => void;
  moveTabLeft: () => void;
  moveTabRight: () => void;
  closeTabs: (scope: 'others' | 'right' | 'saved' | 'all') => void;
  reportProperties: () => void;
  zoomFitWidth: () => void;
  zoom100: () => void;
  /** `+1` aumenta, `-1` reduce (el mismo paso que los botones de la barra). */
  zoomStep: (direction: 1 | -1) => void;
  copy: () => void;
  cut: () => void;
  paste: () => void;
  duplicate: () => void;
  delete: () => void;
  zOrder: (where: 'front' | 'back') => void;
  selectParent: () => void;
  /** Activa o quita negrita, cursiva o subrayado según el estilo vigente. */
  toggleFormat: (format: 'bold' | 'italic' | 'underline') => void;
  setTextAlign: (align: 'Left' | 'Center' | 'Right') => void;
  setVerticalAlign: (align: 'Top' | 'Middle' | 'Bottom') => void;
  setListStyle: (list: 'Bulleted' | 'Numbered' | 'None') => void;
  checkUpdates: () => void;
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
    'toggle-inspector': handlers.toggleInspector,
    'toggle-problems': handlers.toggleProblems,
    'reset-panels': handlers.resetPanels,
    'toggle-theme': handlers.toggleTheme,
    'tab:next': handlers.nextTab,
    'tab:prev': handlers.prevTab,
    'tab:move-left': handlers.moveTabLeft,
    'tab:move-right': handlers.moveTabRight,
    'tab:close-others': () => handlers.closeTabs('others'),
    'tab:close-right': () => handlers.closeTabs('right'),
    'tab:close-saved': () => handlers.closeTabs('saved'),
    'tab:close-all': () => handlers.closeTabs('all'),
    'report-properties': handlers.reportProperties,
    'zoom:fit-width': handlers.zoomFitWidth,
    'zoom:100': handlers.zoom100,
    'zoom:in': () => handlers.zoomStep(1),
    'zoom:out': () => handlers.zoomStep(-1),
    copy: handlers.copy,
    cut: handlers.cut,
    paste: handlers.paste,
    duplicate: handlers.duplicate,
    delete: handlers.delete,
    'bring-to-front': () => handlers.zOrder('front'),
    'send-to-back': () => handlers.zOrder('back'),
    'select-parent': handlers.selectParent,
    'format:bold': () => handlers.toggleFormat('bold'),
    'format:italic': () => handlers.toggleFormat('italic'),
    'format:underline': () => handlers.toggleFormat('underline'),
    'align:left': () => handlers.setTextAlign('Left'),
    'align:center': () => handlers.setTextAlign('Center'),
    'align:right': () => handlers.setTextAlign('Right'),
    'valign:top': () => handlers.setVerticalAlign('Top'),
    'valign:middle': () => handlers.setVerticalAlign('Middle'),
    'valign:bottom': () => handlers.setVerticalAlign('Bottom'),
    'list:bulleted': () => handlers.setListStyle('Bulleted'),
    'list:numbered': () => handlers.setListStyle('Numbered'),
    'list:none': () => handlers.setListStyle('None'),
    'check-updates': handlers.checkUpdates,
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
