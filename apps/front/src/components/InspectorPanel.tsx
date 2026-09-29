import type {
  EmbeddedImageDto,
  ItemDto,
  Length,
  StylePatch,
  TablixDto,
  TablixMemberDto,
} from '@rdlc-designer/contracts';
import type { ReactNode } from 'react';
import type { ImageOptionsPatch } from '@/components/panels/ImagePanel';
import type { ItemOptionsPatch } from '@/components/panels/PropertiesPanel';
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
  /** Renombra el elemento (lo valida el dominio). */
  onSetName: (name: string) => void;
  /** `null` = quitar la visibilidad declarada. */
  onSetVisibility: (hidden: boolean | string | null) => void;
  /** `CanGrow`/`KeepTogether` (solo Textbox). */
  onSetItemOptions: (options: ItemOptionsPatch) => void;
  /** Salto de página del item (Rectangle/Tablix). */
  onSetPageBreak: (breakLocation: 'None' | 'Start' | 'End' | 'Between') => void;
  /** Visibilidad de una fila/columna/grupo de un Tablix. */
  onSetMemberVisibility: (
    tablixId: string,
    axis: 'row' | 'column',
    path: number[],
    hidden: boolean | string | null,
  ) => void;
  /** Abre «Propiedades del grupo» del miembro indicado. */
  onOpenGroupProperties: (
    tablixId: string,
    axis: 'row' | 'column',
    member: TablixMemberDto,
  ) => void;
  /** Añade una fila contigua al grupo (extiende su rango de hojas). */
  onAddRowToGroup: (tablixId: string, row: number, groupPath: number[]) => void;
  /** Envuelve la fila en un grupo nuevo con esa expresión. */
  onAddRowGroup: (tablixId: string, row: number, expression: string) => void;
  /** Quita el grupo: las filas que cuelgan se quedan como filas estáticas. */
  onDeleteRowGroup: (tablixId: string, axis: 'row' | 'column', path: number[]) => void;
  onSetText: (p: number, r: number, value: string) => void;
  /** Etiqueta de diseñador del run (`<Label>`); `null` la quita. */
  onSetLabel: (p: number, r: number, label: string | null) => void;
  onSetImageOptions: (patch: ImageOptionsPatch) => void;
  /** Catálogo `<EmbeddedImages>` del informe (panel de imagen). */
  embeddedImages?: EmbeddedImageDto[];
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
  onSetName,
  onSetVisibility,
  onSetItemOptions,
  onSetPageBreak,
  onSetMemberVisibility,
  onOpenGroupProperties,
  onAddRowToGroup,
  onAddRowGroup,
  onDeleteRowGroup,
  onSetText,
  onSetLabel,
  onSetImageOptions,
  embeddedImages,
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
          onSetMemberVisibility={(axis, path, hidden) =>
            onSetMemberVisibility(tablix.id, axis, path, hidden)
          }
          onOpenGroupProperties={(axis, member) => onOpenGroupProperties(tablix.id, axis, member)}
          onAddRowToGroup={(row, groupPath) => onAddRowToGroup(tablix.id, row, groupPath)}
          onAddRowGroup={(row, expression) => onAddRowGroup(tablix.id, row, expression)}
          onDeleteGroup={(axis, path) => onDeleteRowGroup(tablix.id, axis, path)}
        />
      ) : null}
      <ItemPanels
        item={item}
        cellContent={cellContent}
        onSetLocation={onSetLocation}
        onSetSize={onSetSize}
        onSetStyle={onSetStyle}
        onSetName={onSetName}
        onSetVisibility={onSetVisibility}
        onSetItemOptions={onSetItemOptions}
        onSetPageBreak={onSetPageBreak}
        onSetText={onSetText}
        onSetLabel={onSetLabel}
        onSetImageOptions={onSetImageOptions}
        embeddedImages={embeddedImages}
        onEditText={onEditText}
      />
    </aside>
  );
}
