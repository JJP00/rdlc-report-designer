import type { ProjectionDto, TablixMemberDto } from '@rdlc-designer/contracts';
import type { ReactNode } from 'react';
import { Breadcrumb } from '@/components/Breadcrumb';
import { CanvasArea } from '@/components/CanvasArea';
import type { ItemEditing } from '@/hooks/useItemEditing';
import type { CanvasHit } from '@/lib/hit';
import { cm } from '@/lib/projection';
import type { SelectedCell } from '@/lib/tablix';

export interface CanvasColumnProps {
  projection: ProjectionDto | null;
  zoom: number;
  selectedId: string | null;
  selectedIds: string[];
  selectedCell: SelectedCell | null;
  menuHit: CanvasHit | null;
  hasClipboard: boolean;
  reveal: { id: string; nonce: number } | null;
  /** Edición de items (callbacks): se pasa el hook compuesto tal cual. */
  editing: ItemEditing;
  /** Estado vacío: abrir un informe y los recientes. */
  onOpenReport: () => void;
  recents: string[];
  onOpenRecent: (path: string) => void;
  onZoomChange: (zoom: number) => void;
  onFitZoomChange: (zoom: number) => void;
  onOpenGroupProperties: (
    tablixId: string,
    axis: 'row' | 'column',
    member: TablixMemberDto,
  ) => void;
  onEditText: (id: string) => void;
}

/** Columna central: breadcrumb del contenedor + lienzo con su selección. */
export function CanvasColumn({
  projection,
  zoom,
  selectedId,
  selectedIds,
  selectedCell,
  menuHit,
  hasClipboard,
  reveal,
  editing,
  onOpenReport,
  recents,
  onOpenRecent,
  onZoomChange,
  onFitZoomChange,
  onOpenGroupProperties,
  onEditText,
}: CanvasColumnProps): ReactNode {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {projection ? (
        <Breadcrumb
          projection={projection}
          selectedId={selectedId}
          selectedCell={selectedCell}
          onSelectItem={editing.selectAndReveal}
          onSelectCell={editing.selectCell}
        />
      ) : null}
      <CanvasArea
        projection={projection}
        onOpenReport={onOpenReport}
        recents={recents}
        onOpenRecent={onOpenRecent}
        zoom={zoom}
        selectedId={selectedId}
        extraSelectedIds={selectedIds.filter((id) => id !== selectedId)}
        selectedCell={selectedCell}
        menuHit={menuHit}
        hasClipboard={hasClipboard}
        reveal={reveal}
        onSelect={(id, additive) => {
          if (id === null) editing.setSelectedId(null);
          else if (additive) editing.toggleItemSelection(id);
          else editing.setSelectedId(id);
        }}
        onSelectMany={editing.setSelectedIds}
        onSelectCell={editing.selectCell}
        onContextMenuHit={editing.showContextMenu}
        onZoomChange={onZoomChange}
        onFitZoomChange={onFitZoomChange}
        onMoveTo={editing.moveTo}
        onMoveItemToScope={editing.moveItemToScope}
        onResizeItem={editing.resizeItem}
        onResizeColumn={editing.resizeColumn}
        onResizeRow={editing.resizeRow}
        onResizeRegion={(region, value) => editing.setRegionHeight(region, cm(value))}
        onResizeSectionWidth={(value) => editing.setSectionWidth(cm(value))}
        onSetPageMargins={editing.setPageMargins}
        onInsertAt={editing.insertAt}
        onAddRow={editing.addRow}
        onAddRowOutside={editing.addRowOutsideGroup}
        onAddRowInside={editing.addRowInsideGroup}
        onAddTotal={editing.addTotalRow}
        onAddRowGroup={editing.addRowGroup}
        onOpenGroupProperties={onOpenGroupProperties}
        onDeleteRow={editing.deleteRow}
        onAddColumn={editing.addColumn}
        onDeleteColumn={editing.deleteColumn}
        onDeleteRows={editing.deleteRows}
        onDeleteColumns={editing.deleteColumns}
        onMergeCells={editing.mergeCells}
        onUnmergeCells={editing.unmergeCells}
        onDuplicate={editing.duplicateSelected}
        onCopy={editing.copySelected}
        onCut={editing.cutSelected}
        onPasteAt={editing.pasteAt}
        onDelete={editing.deleteSelected}
        onEditText={onEditText}
        onSelectParent={editing.selectParent}
        onBringToFront={() => editing.zOrder('front')}
        onSendToBack={() => editing.zOrder('back')}
      />
    </div>
  );
}
