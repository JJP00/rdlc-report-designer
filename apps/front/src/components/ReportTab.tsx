import type { TablixDto, TablixMemberDto } from '@rdlc-designer/contracts';
import { useMemo, type ReactNode } from 'react';
import { CanvasColumn } from '@/components/CanvasColumn';
import { EditorBanners } from '@/components/EditorBanners';
import { EditorToolbar } from '@/components/EditorToolbar';
import { InspectorColumn } from '@/components/InspectorColumn';
import { LeftPanels } from '@/components/LeftPanels';
import { StatusBar } from '@/components/StatusBar';
import { FormatToolbar } from '@/components/panels/FormatToolbar';
import type { ItemEditing } from '@/hooks/useItemEditing';
import type { WorkspaceCore } from '@/hooks/useWorkspace';
import { useBatchSelection } from '@/hooks/useBatchSelection';
import { countItems, formatKinds } from '@/lib/projection';
import { effectiveTextStyle } from '@/lib/style';

export interface ReportTabProps {
  core: WorkspaceCore;
  items: ItemEditing;
  /** Tablix del que muestra la estructura el inspector (lo calcula el shell). */
  structureTablix: TablixDto | undefined;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  zoom: number;
  onZoomChange: (zoom: number) => void;
  onZoomFitWidth: () => void;
  onFitZoomChange: (zoom: number | null) => void;
  showVariables: boolean;
  onToggleVariables: () => void;
  showHierarchy: boolean;
  onToggleHierarchy: () => void;
  /** Abre el diálogo de propiedades del informe. */
  onOpenProperties: () => void;
  onEditText: (id: string) => void;
  onOpenGroupProperties: (tablixId: string, axis: 'row' | 'column', member: TablixMemberDto) => void;
  onOpenTablixFilters: (tablixId: string) => void;
  /** Reabre el diálogo de conflicto (aviso superior). */
  onResolveConflict: () => void;
  onPickExpression: (expression: string, name: string) => void;
}

/**
 * Cuerpo del editor de **una** pestaña (fase MVP de pestañas, bloque D): toolbar,
 * barra de formato, avisos, paneles, lienzo y pie. `App` lo monta con
 * `key={activeSessionId}`, así que cambiar de pestaña desmonta el cuerpo entero
 * (un único stage Konva) y lo vuelve a montar limpio; el estado que sobrevive
 * (selección, zoom, paneles) vive en `tab.ui` y lo consume `useItemEditing`.
 */
export function ReportTab({
  core,
  items,
  structureTablix,
  theme,
  onToggleTheme,
  zoom,
  onZoomChange,
  onZoomFitWidth,
  onFitZoomChange,
  showVariables,
  onToggleVariables,
  showHierarchy,
  onToggleHierarchy,
  onOpenProperties,
  onEditText,
  onOpenGroupProperties,
  onOpenTablixFilters,
  onResolveConflict,
  onPickExpression,
}: ReportTabProps): ReactNode {
  const {
    doc,
    status,
    error,
    dirty,
    conflict,
    fileMissing,
    busy,
    reloads,
    hasBackend,
    recents,
    open,
    save,
    saveAs,
    createNew,
    openPath,
    close,
    undo,
    redo,
    setError,
  } = core;
  const { selectedId, selectedIds, selectedItems, movableIds, selectedItem, selectedCell } = items;
  const stats = useMemo(() => (doc ? countItems(doc.projection) : null), [doc]);

  /** Qué edita el panel de lote: multiselección de items o contenidos de celdas. */
  const batchSelection = useBatchSelection({
    projection: doc?.projection ?? null,
    selectedIds,
    selectedItems,
    movableIds,
    selectedCell,
  });

  return (
    <>
      <EditorToolbar
        hasDocument={doc !== null}
        hasSelection={selectedItem !== undefined}
        selectedId={selectedId}
        busy={busy}
        zoom={zoom}
        showVariables={showVariables}
        showHierarchy={showHierarchy}
        theme={theme}
        recents={recents}
        onNew={createNew}
        onOpen={open}
        onOpenRecent={openPath}
        onSave={() => void save()}
        onSaveAs={() => void saveAs()}
        onClose={close}
        onOpenProperties={onOpenProperties}
        onToggleVariables={onToggleVariables}
        onToggleHierarchy={onToggleHierarchy}
        onToggleTheme={onToggleTheme}
        onDuplicate={items.duplicateSelected}
        onDelete={items.deleteSelected}
        onUndo={() => void undo()}
        onRedo={() => void redo()}
        onZoomChange={onZoomChange}
        onZoomFitWidth={onZoomFitWidth}
      />

      {/* Barra de formato de texto + insertar (una sola línea). */}
      <FormatToolbar
        style={
          selectedItem
            ? selectedItem.kind === 'textbox'
              ? effectiveTextStyle(selectedItem)
              : selectedItem.style
            : undefined
        }
        onSetStyle={items.setItemStyle}
        disabled={selectedItem === undefined}
        onInsert={items.insertItem}
        insertDisabled={doc === null}
      />

      <EditorBanners
        error={error}
        conflict={conflict}
        fileMissing={fileMissing}
        hasBackend={hasBackend}
        onDismissError={() => setError(null)}
        onResolveConflict={onResolveConflict}
      />

      <main className="flex min-h-0 flex-1">
        <LeftPanels
          projection={doc?.projection ?? null}
          showHierarchy={showHierarchy}
          showVariables={showVariables}
          selectedId={selectedId}
          selectedCell={selectedCell}
          onSelectItem={items.selectAndReveal}
          onSelectCell={items.selectCell}
          onPickExpression={onPickExpression}
        />

        <CanvasColumn
          projection={doc?.projection ?? null}
          zoom={zoom}
          selectedId={selectedId}
          selectedIds={selectedIds}
          selectedCell={selectedCell}
          menuHit={items.menuHit}
          hasClipboard={items.hasClipboard}
          reveal={items.reveal}
          editing={items}
          onZoomChange={onZoomChange}
          onFitZoomChange={onFitZoomChange}
          onOpenGroupProperties={onOpenGroupProperties}
          onEditText={onEditText}
        />

        <InspectorColumn
          tablix={structureTablix}
          selectedCell={selectedCell}
          items={items}
          batchSelection={batchSelection}
          projection={doc?.projection ?? null}
          onOpenGroupProperties={onOpenGroupProperties}
          onOpenTablixFilters={onOpenTablixFilters}
          onEditText={onEditText}
        />
      </main>

      <StatusBar
        status={status}
        path={doc?.path ?? null}
        dirty={dirty}
        stats={stats ? `${stats.total} elementos · ${formatKinds(stats.byKind)}` : null}
        reloads={reloads}
      />
    </>
  );
}
