import { effectiveTextStyle } from '@/lib/style';
import type { ItemEditing } from './useItemEditing';
import type { WorkspaceCore } from './useWorkspace';

export type TextFormat = 'bold' | 'italic' | 'underline';

/**
 * Ctrl+B / Ctrl+I / Ctrl+U y los botones B, I, U: activa o quita el formato
 * según el estilo que muestra la barra (el efectivo, en un textbox).
 */
export function toggleTextFormat(items: ItemEditing, format: TextFormat): void {
  const item = items.selectedItem;
  if (!item) return;
  const style = item.kind === 'textbox' ? effectiveTextStyle(item) : item.style;
  if (format === 'bold') {
    items.setItemStyle({ fontWeight: style?.fontWeight === 'Bold' ? 'Normal' : 'Bold' });
  } else if (format === 'italic') {
    items.setItemStyle({ fontStyle: style?.fontStyle === 'Italic' ? 'Normal' : 'Italic' });
  } else {
    items.setItemStyle({
      textDecoration: style?.textDecoration === 'Underline' ? 'None' : 'Underline',
    });
  }
}

/**
 * Comandos de edición que comparten los atajos (`useEditorKeys`) y la paleta
 * (`usePaletteActions`): la misma acción hace lo mismo se lance desde donde se
 * lance.
 */

/** Supr: con multiselección, un solo paso de deshacer (batch). */
export function deleteSelection(items: ItemEditing, selectedIds: string[]): void {
  if (selectedIds.length > 1) {
    items.batchEdit(selectedIds.map((id) => ({ cmd: 'deleteItem', id })));
  } else {
    items.deleteSelected();
  }
}

/** Ctrl+V: el destino depende de la selección (celdas, rectángulo o cuerpo). */
export function pasteIntoSelection(core: WorkspaceCore, items: ItemEditing): void {
  // Con celdas seleccionadas se pega el bloque desde su esquina (Excel).
  if (items.selectedCell) {
    items.pasteCells();
    return;
  }
  // Con un rectángulo seleccionado, se pega dentro de él (al final: el clon se
  // pinta encima).
  const target = items.selectedItem;
  if (target?.kind === 'rectangle') {
    items.pasteAt({ kind: 'rectangle', id: target.id }, target.children.length);
    return;
  }
  // Pinchar una celda con texto selecciona su Textbox: cuenta como la celda.
  if (items.pasteCells()) return;
  items.pasteAt({ kind: 'body' }, core.doc?.projection.page.body.items.length ?? 0);
}
