import type { ProjectionDto, TablixDto, TablixMemberDto } from '@rdlc-designer/contracts';
import type { ReactNode } from 'react';
import { InspectorPanel } from '@/components/InspectorPanel';
import { ReportPropertiesPanel } from '@/components/panels/ReportPropertiesPanel';
import type { BatchSelection } from '@/hooks/useBatchSelection';
import type { ItemEditing } from '@/hooks/useItemEditing';
import type { SelectedCell } from '@/lib/tablix';

export interface InspectorColumnProps {
  /** Tablix del que muestra la estructura (el seleccionado o su contenedor). */
  tablix: TablixDto | undefined;
  selectedCell: SelectedCell | null;
  /** Edición de items (callbacks): se pasa el hook compuesto tal cual. */
  items: ItemEditing;
  /** Lote de la multiselección (items o celdas). */
  batchSelection: BatchSelection;
  projection: ProjectionDto | null;
  onOpenGroupProperties: (
    tablixId: string,
    axis: 'row' | 'column',
    member: TablixMemberDto,
  ) => void;
  onOpenTablixFilters: (tablixId: string) => void;
  onEditText: (id: string) => void;
}

/**
 * Columna derecha: estructura del Tablix + propiedades del item seleccionado.
 * Extraída de `App` para que el shell no crezca con el cableado del panel.
 */
export function InspectorColumn({
  tablix,
  selectedCell,
  items,
  batchSelection,
  projection,
  onOpenGroupProperties,
  onOpenTablixFilters,
  onEditText,
}: InspectorColumnProps): ReactNode {
  // Sin nada seleccionado el inspector muestra las propiedades del informe,
  // igual que la ventana de propiedades de Report Builder.
  const reportProperties =
    projection !== null && items.selectedItem === undefined && selectedCell === null ? (
      <ReportPropertiesPanel
        projection={projection}
        onSetPageSize={items.setPageSize}
        onSetPageMargins={items.setPageMargins}
        onSetRegionHeight={items.setRegionHeight}
        onSetSectionWidth={items.setSectionWidth}
        onSetHeaderFooterOptions={items.setHeaderFooterOptions}
        onSetRegionPresent={items.setRegionPresent}
        onSetReportCode={items.setReportCode}
      />
    ) : undefined;

  return (
    <InspectorPanel
      tablix={tablix}
      selectedCell={selectedCell}
      item={items.selectedItem}
      selectedItems={batchSelection.items}
      movableIds={batchSelection.movableIds}
      cellBatch={batchSelection.fromCells}
      onBatchEdit={items.batchEdit}
      cellContent={items.selectedIsCellContent}
      onSelectCell={items.setSelectedCell}
      onAddRow={items.addRow}
      onDeleteRow={items.deleteRow}
      onAddColumn={items.addColumn}
      onDeleteColumn={items.deleteColumn}
      onSetLocation={items.setItemLocation}
      onSetSize={items.setItemSize}
      onSetStyle={items.setItemStyle}
      onSetName={items.setItemName}
      onSetVisibility={items.setVisibility}
      onSetItemOptions={items.setItemOptions}
      onSetPageBreak={items.setItemPageBreak}
      onSetMemberVisibility={items.setMemberVisibility}
      onOpenGroupProperties={onOpenGroupProperties}
      onAddRowToGroup={items.addRowToGroup}
      onAddColumnToGroup={items.addColumnToGroup}
      onAddRowGroup={items.addRowGroup}
      onAddColumnGroup={items.addColumnGroup}
      onDeleteRowGroup={items.deleteRowGroup}
      onResizeRow={items.resizeRow}
      onResizeColumn={items.resizeColumn}
      onOpenTablixFilters={onOpenTablixFilters}
      onSetText={items.setRunText}
      onSetLabel={items.setRunLabel}
      onSetImageOptions={items.setImageOptions}
      embeddedImages={projection?.meta.embeddedImages ?? []}
      onEditText={onEditText}
      reportProperties={reportProperties}
    />
  );
}
