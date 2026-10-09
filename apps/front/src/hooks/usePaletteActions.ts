import type { ItemDto } from '@rdlc-designer/contracts';
import { paletteRunner, type PaletteActionId } from '@/lib/palette';
import type { WorkspaceCore } from './useWorkspace';
import type { ItemEditing } from './useItemEditing';

export interface PaletteActionsOptions {
  core: WorkspaceCore;
  items: ItemEditing;
  selectedItem: ItemDto | undefined;
  structureTablix: ItemDto | undefined;
  zoomFitWidth: () => void;
  zoomReset: () => void;
  toggleVariables: () => void;
  toggleHierarchy: () => void;
  toggleTheme: () => void;
  setPropertiesOpen: (open: boolean) => void;
  setEditingTextId: (id: string) => void;
  setFiltersTablixId: (id: string) => void;
}

/** Acciones de la paleta Ctrl+K cableadas con el núcleo y la edición. */
export function usePaletteActions(
  options: PaletteActionsOptions,
): (action: PaletteActionId) => void {
  const { core, items, selectedItem, structureTablix, zoomFitWidth, zoomReset } = options;
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
    toggleTheme: options.toggleTheme,
    nextTab: () => core.cycleTab(1),
    prevTab: () => core.cycleTab(-1),
    moveTabLeft: () => core.moveActiveTab(-1),
    moveTabRight: () => core.moveActiveTab(1),
    reportProperties: () => options.setPropertiesOpen(true),
    zoomFitWidth,
    zoom100: zoomReset,
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
