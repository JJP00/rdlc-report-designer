import { useGlobalKeys } from './useGlobalKeys';
import type { WorkspaceCore } from './useWorkspace';
import type { ItemEditing } from './useItemEditing';

export interface EditorKeysOptions {
  core: WorkspaceCore;
  items: ItemEditing;
  /** Multiselección actual (Supr borra en lote con un solo undo). */
  selectedIds: string[];
  zoomFitWidth: () => void;
  zoomReset: () => void;
  onTogglePalette: () => void;
}

/**
 * Atajos globales del editor cableados con el núcleo y la edición. Vive en un
 * hook para que `App` no acumule una treintena de callbacks.
 */
export function useEditorKeys({
  core,
  items,
  selectedIds,
  zoomFitWidth,
  zoomReset,
  onTogglePalette,
}: EditorKeysOptions): void {
  useGlobalKeys({
    hasDocument: core.doc !== null,
    // Una celda de Tablix también es selección (Esc sube a su tabla).
    hasSelection: items.selectedItem !== undefined || items.selectedCell !== null,
    bodyIndex: core.doc?.projection.page.body.items.length ?? 0,
    onTogglePalette,
    onSave: () => void core.save(),
    onSaveAs: () => void core.saveAs(),
    onNew: core.createNew,
    onOpen: core.open,
    onCloseTab: core.close,
    onCycleTab: core.cycleTab,
    onUndo: () => void core.undo(),
    onRedo: () => void core.redo(),
    onZoomFitWidth: zoomFitWidth,
    onZoomReset: zoomReset,
    onNudge: items.nudge,
    onFlushNudge: items.flushNudge,
    onDelete: () => {
      // Con multiselección, borrar es un solo paso de undo (batch).
      if (selectedIds.length > 1) {
        items.batchEdit(selectedIds.map((id) => ({ cmd: 'deleteItem', id })));
      } else {
        items.deleteSelected();
      }
    },
    onDuplicate: items.duplicateSelected,
    onCopy: items.copySelected,
    onCut: items.cutSelected,
    onPasteAtBody: (index) => items.pasteAt({ kind: 'body' }, index),
    onBringToFront: () => items.zOrder('front'),
    onSendToBack: () => items.zOrder('back'),
    onSelectParent: items.selectParent,
  });
}
