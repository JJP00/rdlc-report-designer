import type { ItemDto, Length, StylePatch, TablixDto } from '@rdlc-designer/contracts';
import type { ReactNode } from 'react';
import type { ImageOptionsPatch } from '@/components/panels/ImagePanel';
import { ItemPanels } from '@/components/panels/ItemPanels';
import { TablixStructurePanel } from '@/components/panels/TablixStructurePanel';
import type { SelectedCell } from '@/lib/tablix';

export interface InspectorPanelProps {
  /** Tablix cuya estructura se edita (el seleccionado o el de la celda). */
  tablix: TablixDto | undefined;
  selectedCell: SelectedCell | null;
  item: ItemDto | undefined;
  /** El item es contenido directo de una celda (lo fija la celda). */
  cellContent: boolean;
  onSelectCell: (cell: SelectedCell | null) => void;
  onAddRow: (id: string, row: number) => void;
  onDeleteRow: (id: string, row: number) => void;
  onAddColumn: (id: string, column: number) => void;
  onDeleteColumn: (id: string, column: number) => void;
  onSetLocation: (top: Length, left: Length) => void;
  onSetSize: (width: Length, height: Length) => void;
  onSetStyle: (patch: StylePatch) => void;
  onSetText: (p: number, r: number, value: string) => void;
  onSetImageOptions: (patch: ImageOptionsPatch) => void;
  /** Abre el editor de texto del textbox (párrafos → runs). */
  onEditText: (id: string) => void;
}

/** Columna derecha: estructura del Tablix + propiedades del item seleccionado. */
export function InspectorPanel({
  tablix,
  selectedCell,
  item,
  cellContent,
  onSelectCell,
  onAddRow,
  onDeleteRow,
  onAddColumn,
  onDeleteColumn,
  onSetLocation,
  onSetSize,
  onSetStyle,
  onSetText,
  onSetImageOptions,
  onEditText,
}: InspectorPanelProps): ReactNode {
  return (
    <aside className="flex w-80 shrink-0 flex-col overflow-y-auto border-l bg-background">
      {tablix ? (
        <TablixStructurePanel
          tablix={tablix}
          selectedCell={selectedCell}
          onSelectCell={onSelectCell}
          onAddRow={(row) => onAddRow(tablix.id, row)}
          onDeleteRow={(row) => onDeleteRow(tablix.id, row)}
          onAddColumn={(column) => onAddColumn(tablix.id, column)}
          onDeleteColumn={(column) => onDeleteColumn(tablix.id, column)}
        />
      ) : null}
      <ItemPanels
        item={item}
        cellContent={cellContent}
        onSetLocation={onSetLocation}
        onSetSize={onSetSize}
        onSetStyle={onSetStyle}
        onSetText={onSetText}
        onSetImageOptions={onSetImageOptions}
        onEditText={onEditText}
      />
    </aside>
  );
}
