import { useEffect } from 'react';
import { focusActiveTab, shouldLeaveCanvas } from './canvasA11y';
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
  /** F2: abre el editor del textbox seleccionado (lo comprueba `App`). */
  onEditSelectedText?: () => void;
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
  onEditSelectedText,
}: EditorKeysOptions): void {
  const hasSelection = items.selectedItem !== undefined || items.selectedCell !== null;

  // Salida del lienzo con teclado: con el lienzo enfocado y nada seleccionado
  // (Esc ya subi� hasta deseleccionar), Esc devuelve el foco a la pesta�a activa.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target instanceof Element ? event.target : null;
      const leave = shouldLeaveCanvas({
        key: event.key,
        defaultPrevented: event.defaultPrevented,
        hasSelection,
        inCanvas: target?.closest('.canvas-dots') != null,
        typing: target?.closest('input, textarea, select, [contenteditable="true"]') != null,
        dialogOpen:
          document.querySelector(
            '[role="dialog"][data-state="open"], [role="menu"][data-state="open"]',
          ) !== null,
      });
      if (leave && focusActiveTab()) event.preventDefault();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [hasSelection]);

  useGlobalKeys({
    hasDocument: core.doc !== null,
    // Una celda de Tablix también es selección (Esc sube a su tabla).
    hasSelection,
    bodyIndex: core.doc?.projection.page.body.items.length ?? 0,
    onTogglePalette,
    onSave: () => void core.save(),
    onSaveAs: () => void core.saveAs(),
    onNew: core.createNew,
    onOpen: core.open,
    onCloseTab: core.close,
    onCycleTab: core.cycleTab,
    onMoveTab: core.moveActiveTab,
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
    ...(onEditSelectedText ? { onEditSelectedText } : {}),
  });
}
