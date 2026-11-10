import type { ProjectionDto, TablixDto, TablixMemberDto } from '@rdlc-designer/contracts';
import { useT } from '@rdlc-designer/i18n/react';
import { PanelRightClose, PanelRightOpen } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import { InspectorPanel } from '@/components/InspectorPanel';
import { ReportPropertiesPanel } from '@/components/panels/ReportPropertiesPanel';
import { Button } from '@/components/ui/button';
import { PanelResizer, canvasRoom } from '@/components/ui/panel-resizer';
import type { BatchSelection } from '@/hooks/useBatchSelection';
import type { ItemEditing } from '@/hooks/useItemEditing';
import type { PanelLayoutApi } from '@/hooks/usePanelLayout';
import { CANVAS_MIN_PX, PANEL_LIMITS } from '@/lib/panelLayout';
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
  /** Ancho y plegado del panel (lo comparte la app). */
  panels: PanelLayoutApi;
}

/**
 * Columna derecha: estructura del Tablix + propiedades del item seleccionado.
 * Extraída de `App` para que el shell no crezca con el cableado del panel.
 *
 * El ancho se ajusta desde su borde izquierdo y el panel se **pliega** a una
 * tira con su nombre (botón de la cabecera o de la barra); la tira lo vuelve a
 * abrir. El foco pasa del botón que pliega al que despliega y al revés.
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
  panels,
}: InspectorColumnProps): ReactNode {
  const t = useT();
  const { sizes, inspectorCollapsed } = panels.layout;
  const collapseRef = useRef<HTMLButtonElement | null>(null);
  const expandRef = useRef<HTMLButtonElement | null>(null);
  /** Botón que toma el foco tras plegar/desplegar desde el propio panel. */
  const focusNextRef = useRef<'collapse' | 'expand' | null>(null);

  useEffect(() => {
    const next = focusNextRef.current;
    focusNextRef.current = null;
    if (next === 'expand') expandRef.current?.focus();
    if (next === 'collapse') collapseRef.current?.focus();
  }, [inspectorCollapsed]);

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

  if (inspectorCollapsed) {
    return (
      <button
        ref={expandRef}
        type="button"
        aria-label={t('toolbar.report.expandInspector')}
        aria-expanded={false}
        title={t('toolbar.report.expandInspector')}
        className="flex w-8 shrink-0 flex-col items-center gap-2 border-l bg-background py-2 text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
        onClick={() => {
          focusNextRef.current = 'collapse';
          panels.setInspectorCollapsed(false);
        }}
      >
        <PanelRightOpen aria-hidden className="size-4" />
        <span aria-hidden className="text-xs font-medium [writing-mode:vertical-rl]">
          {t('toolbar.report.inspectorTitle')}
        </span>
      </button>
    );
  }

  return (
    <div
      className="relative flex shrink flex-col border-l bg-background"
      style={{ width: sizes.inspector, minWidth: PANEL_LIMITS.inspector.min }}
    >
      <PanelResizer
        panel="inspector"
        edge="left"
        size={sizes.inspector}
        onResize={(px) => panels.setSize('inspector', px)}
        onReset={() => panels.resetSize('inspector')}
        room={() => canvasRoom(CANVAS_MIN_PX)}
        label={t('lib.panel.inspectorAria')}
      />
      <div className="flex shrink-0 items-center justify-between border-b py-1 pr-1 pl-2">
        <span className="text-xs font-medium text-muted-foreground">
          {t('toolbar.report.inspectorTitle')}
        </span>
        <Button
          ref={collapseRef}
          variant="ghost"
          size="icon-xs"
          aria-label={t('toolbar.report.collapseInspector')}
          aria-expanded
          title={t('toolbar.report.collapseInspector')}
          onClick={() => {
            focusNextRef.current = 'expand';
            panels.setInspectorCollapsed(true);
          }}
        >
          <PanelRightClose />
        </Button>
      </div>
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
    </div>
  );
}
