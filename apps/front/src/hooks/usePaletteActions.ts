import type { ItemDto, StylePatch } from '@rdlc-designer/contracts';
import { paletteRunner, type PaletteActionId } from '@/lib/palette';
import { INITIAL_PANEL_LAYOUT, type PanelKey } from '@/lib/panelLayout';
import { clampZoom } from '@/lib/zoom';
import { deleteSelection, pasteIntoSelection, toggleTextFormat } from './editorCommands';
import type { PanelLayoutApi } from './usePanelLayout';
import type { WorkspaceCore } from './useWorkspace';
import type { ItemEditing } from './useItemEditing';

export interface PaletteActionsOptions {
  core: WorkspaceCore;
  items: ItemEditing;
  selectedItem: ItemDto | undefined;
  /** Multiselección (Eliminar borra en lote, como Supr). */
  selectedIds: string[];
  structureTablix: ItemDto | undefined;
  zoom: number;
  setZoom: (zoom: number) => void;
  zoomFitWidth: () => void;
  zoomReset: () => void;
  toggleVariables: () => void;
  toggleHierarchy: () => void;
  toggleTheme: () => void;
  toggleProblems: () => void;
  panels: PanelLayoutApi;
  /** Fichero → Buscar actualizaciones… (sin servicio, no hace nada). */
  checkUpdates: () => void;
  setPropertiesOpen: (open: boolean) => void;
  setEditingTextId: (id: string) => void;
  setFiltersTablixId: (id: string) => void;
}

/**
 * Acciones de la paleta Ctrl+K cableadas con el núcleo y la edición: cada una
 * llama a lo mismo que su botón, su menú o su atajo.
 */
export function usePaletteActions(
  options: PaletteActionsOptions,
): (action: PaletteActionId) => void {
  const { core, items, selectedItem, structureTablix, zoomFitWidth, zoomReset, panels } = options;
  const setStyle = (patch: StylePatch): void => {
    if (selectedItem) items.setItemStyle(patch);
  };

  return paletteRunner({
    newReport: core.createNew,
    open: core.open,
    save: () => void core.save(),
    saveAs: () => void core.saveAs(),
    close: core.close,
    undo: () => void core.undo(),
    redo: () => void core.redo(),
    toggleVariables: options.toggleVariables,
    toggleHierarchy: options.toggleHierarchy,
    toggleInspector: () => panels.setInspectorCollapsed(!panels.layout.inspectorCollapsed),
    toggleProblems: options.toggleProblems,
    resetPanels: () => {
      for (const key of Object.keys(INITIAL_PANEL_LAYOUT.sizes) as PanelKey[]) {
        panels.resetSize(key);
      }
      panels.setInspectorCollapsed(false);
    },
    toggleTheme: options.toggleTheme,
    nextTab: () => core.cycleTab(1),
    prevTab: () => core.cycleTab(-1),
    moveTabLeft: () => core.moveActiveTab(-1),
    moveTabRight: () => core.moveActiveTab(1),
    // Los mismos cierres que el menú de la pestaña, sobre la activa.
    closeTabs: (scope) => {
      if (core.activeSessionId) core.closeTabs(scope, core.activeSessionId);
    },
    reportProperties: () => options.setPropertiesOpen(true),
    zoomFitWidth,
    zoom100: zoomReset,
    // El paso de los botones − / + de la barra.
    zoomStep: (direction) => options.setZoom(clampZoom(options.zoom + 0.1 * direction)),
    copy: items.copySelected,
    cut: items.cutSelected,
    paste: () => pasteIntoSelection(core, items),
    duplicate: items.duplicateSelected,
    delete: () => deleteSelection(items, options.selectedIds),
    zOrder: (where) => items.zOrder(where),
    selectParent: items.selectParent,
    // Lo mismo que los botones B, I, U y Ctrl+B / Ctrl+I / Ctrl+U.
    toggleFormat: (format) => toggleTextFormat(items, format),
    setTextAlign: (textAlign) => setStyle({ textAlign }),
    setVerticalAlign: (verticalAlign) => setStyle({ verticalAlign }),
    setListStyle: (listStyle) => setStyle({ listStyle }),
    checkUpdates: options.checkUpdates,
    editText: () => {
      if (selectedItem?.kind === 'textbox') options.setEditingTextId(selectedItem.id);
    },
    tablixFilters: () => {
      if (structureTablix) options.setFiltersTablixId(structureTablix.id);
    },
    insertTextbox: () => items.insertItem('textbox'),
    insertRectangle: () => items.insertItem('rectangle'),
    insertLine: () => items.insertItem('line'),
    insertImage: () => items.insertItem('image'),
    insertTablix: () => items.insertItem('tablix'),
  });
}
