import type { ItemDto } from '@rdlc-designer/contracts';
import { paletteRunner, type PaletteActionId } from '@/lib/palette';
import type { DocumentCore } from './useDocumentCore';
import type { ItemEditing } from './useItemEditing';

export interface PaletteActionsOptions {
  core: DocumentCore;
  items: ItemEditing;
  selectedItem: ItemDto | undefined;
  structureTablix: ItemDto | undefined;
  zoomFitWidth: () => void;
  zoomReset: () => void;
  setShowVariables: (updater: (value: boolean) => boolean) => void;
  setPropertiesOpen: (open: boolean) => void;
  setEditingTextId: (id: string) => void;
  setFiltersTablixId: (id: string) => void;
}

/** Acciones de la paleta Ctrl+K cableadas con el núcleo y la edición. */
export function usePaletteActions(options: PaletteActionsOptions): (action: PaletteActionId) => void {
  const { core, items, selectedItem, structureTablix, zoomFitWidth, zoomReset } = options;
  return paletteRunner({
    open: core.open,
    save: () => void core.save(),
    close: core.close,
    undo: () => void core.undo(),
    redo: () => void core.redo(),
    toggleVariables: () => options.setShowVariables((value) => !value),
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
