import type { ProjectionDto } from '@rdlc-designer/contracts';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { CanvasColumn } from '@/components/CanvasColumn';
import { type GroupPropertiesRequest } from '@/components/DocumentDialogs';
import { EditorBanners } from '@/components/EditorBanners';
import { EditorToolbar } from '@/components/EditorToolbar';
import { InspectorPanel } from '@/components/InspectorPanel';
import { LeftPanels } from '@/components/LeftPanels';
import { StatusBar } from '@/components/StatusBar';
import { WorkspaceDialogs } from '@/components/WorkspaceDialogs';
import { CommandPalette } from '@/components/panels/CommandPalette';
import { FormatToolbar } from '@/components/panels/FormatToolbar';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useDocumentCore } from '@/hooks/useDocumentCore';
import { useBatchSelection } from '@/hooks/useBatchSelection';
import { useEditorKeys } from '@/hooks/useEditorKeys';
import { useFileDrop } from '@/hooks/useFileDrop';
import { useItemEditing } from '@/hooks/useItemEditing';
import { usePaletteActions } from '@/hooks/usePaletteActions';
import { useQaHooks } from '@/hooks/useQaHooks';
import { insertIntoExpressionEditor } from '@/lib/expressionEditor';
import { countItems, findItem, formatKinds } from '@/lib/projection';
import { findOwnerTablix } from '@/lib/tablix';
import { effectiveTextStyle } from '@/lib/style';

/**
 * Shell del editor: composición de hooks (`useDocumentCore` para el ciclo de
 * vida del fichero, `useItemEditing` para la edición y `useGlobalKeys` para los
 * atajos) y del chrome (toolbar, barra de formato, lienzo y paneles).
 */
export function App(): ReactNode {
  const core = useDocumentCore();
  const items = useItemEditing(core);

  // Estado de UI (no del documento).
  const [zoom, setZoom] = useState(0.6);
  /** Zoom «ajustar al ancho» que publica el lienzo al medir (Ctrl+1 lo aplica). */
  const [fitZoom, setFitZoom] = useState<number | null>(null);
  const [propertiesOpen, setPropertiesOpen] = useState(false);
  const [showVariables, setShowVariables] = useState(false);
  /** Panel de Jerarquía (árbol de items) visible. */
  const [showHierarchy, setShowHierarchy] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  /** Textbox cuyo editor de texto está abierto (párrafos → runs). */
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  /** Grupo cuyas «Propiedades» están abiertas (null = cerrado). */
  const [groupProperties, setGroupProperties] = useState<GroupPropertiesRequest | null>(null);
  /** Tablix cuyos «Filtros…» están abiertos (null = cerrado). */
  const [filtersTablixId, setFiltersTablixId] = useState<string | null>(null);

  const {
    doc,
    status,
    error,
    dirty,
    conflict,
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

  /** Conflicto: el diálogo se reabre al detectarse (y con el botón del aviso). */
  const [conflictOpen, setConflictOpen] = useState(false);
  useEffect(() => {
    setConflictOpen(conflict !== null);
  }, [conflict]);

  /** Drag&drop de `.rdlc` sobre la ventana (overlay + apertura con guardas). */
  const { dropActive, dropHandlers } = useFileDrop({
    enabled: hasBackend,
    onOpenPath: core.openPath,
    onInvalid: core.setError,
  });

  /**
   * Tablix del que muestra la estructura el panel derecho: el seleccionado, o
   * el que contiene la celda/item seleccionados (el más interno).
   */
  const structureTablix = useMemo(() => {
    if (selectedItem?.kind === 'tablix') return selectedItem;
    if (!doc) return undefined;
    if (selectedCell) return findOwnerTablix(doc.projection, selectedCell.id);
    if (selectedItem) return findOwnerTablix(doc.projection, selectedItem.id);
    return undefined;
  }, [doc, selectedItem, selectedCell]);

  /** Tablix de los «Filtros…» abiertos (se deriva: si desaparece, se cierra). */
  const filtersTablix = useMemo(() => {
    if (!doc || filtersTablixId === null) return null;
    const item = findItem(doc.projection, filtersTablixId);
    return item?.kind === 'tablix' ? item : null;
  }, [doc, filtersTablixId]);

  /**
   * Qué edita el panel de lote: multiselección de items o contenidos de las
   * celdas seleccionadas (rango/extras).
   */
  const batchSelection = useBatchSelection({
    projection: doc?.projection ?? null,
    selectedIds,
    selectedItems,
    movableIds,
    selectedCell,
  });

  /** Textbox en edición (el editor se monta al abrirlo y no se resincroniza). */
  const editingText = useMemo(() => {
    if (!doc || editingTextId === null) return undefined;
    const item = findItem(doc.projection, editingTextId);
    return item?.kind === 'textbox' ? item : undefined;
  }, [doc, editingTextId]);

  // QA/diagnóstico: proyección viva y último hit del click derecho (E2E).
  useQaHooks(doc?.projection ?? null, items.menuHit, selectedIds);

  const pickExpression = useCallback(
    (expression: string, name: string): void => {
      if (insertIntoExpressionEditor(expression)) {
        core.setStatus(`${name} insertada en el editor`);
        return;
      }
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        void navigator.clipboard.writeText(expression);
      }
      core.setStatus(`${name} copiada al portapapeles: ${expression}`);
    },
    [core],
  );

  /** Zoom presets (menú de la toolbar, paleta y atajos Ctrl+1/Ctrl+0). */
  const zoomFitWidth = useCallback((): void => {
    if (fitZoom !== null) setZoom(fitZoom);
  }, [fitZoom]);
  const zoomReset = useCallback((): void => setZoom(1), []);

  useEditorKeys({
    core,
    items,
    selectedIds,
    zoomFitWidth,
    zoomReset,
    onTogglePalette: () => setPaletteOpen((value) => !value),
  });

  /** Acciones que ofrece la paleta (Ctrl+K). */
  const runPaletteAction = usePaletteActions({
    core,
    items,
    selectedItem,
    structureTablix,
    zoomFitWidth,
    zoomReset,
    setShowVariables,
    setPropertiesOpen,
    setEditingTextId,
    setFiltersTablixId,
  });

  return (
    <TooltipProvider>
      <div className="relative flex h-full flex-col bg-background" {...dropHandlers}>
        {dropActive ? (
          <div className="pointer-events-none absolute inset-3 z-40 flex items-center justify-center rounded-xl border-2 border-dashed border-primary/60 bg-primary/10 text-sm font-medium text-primary">
            Suelta el fichero .rdlc para abrirlo
          </div>
        ) : null}
        <EditorToolbar
          hasDocument={doc !== null}
          hasSelection={selectedItem !== undefined}
          selectedId={selectedId}
          zoom={zoom}
          showVariables={showVariables}
          showHierarchy={showHierarchy}
          recents={recents}
          onNew={createNew}
          onOpen={open}
          onOpenRecent={openPath}
          onSave={() => void save()}
          onSaveAs={() => void saveAs()}
          onClose={close}
          onOpenProperties={() => setPropertiesOpen(true)}
          onToggleVariables={() => setShowVariables((value) => !value)}
          onToggleHierarchy={() => setShowHierarchy((value) => !value)}
          onInsert={items.insertItem}
          onDuplicate={items.duplicateSelected}
          onDelete={items.deleteSelected}
          onUndo={() => void undo()}
          onRedo={() => void redo()}
          onZoomChange={setZoom}
          onZoomFitWidth={zoomFitWidth}
        />

        {/* Barra de formato de texto (ribbon), bajo la toolbar principal. */}
        <FormatToolbar
          style={selectedItem?.kind === 'textbox' ? effectiveTextStyle(selectedItem) : undefined}
          onSetStyle={items.setItemStyle}
          disabled={selectedItem?.kind !== 'textbox'}
        />

        <EditorBanners
          error={error}
          conflict={conflict}
          hasBackend={hasBackend}
          onDismissError={() => setError(null)}
          onResolveConflict={() => setConflictOpen(true)}
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
            onPickExpression={pickExpression}
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
            onZoomChange={setZoom}
            onFitZoomChange={setFitZoom}
            onOpenGroupProperties={(tablixId, axis, member) =>
              setGroupProperties({ tablixId, axis, member })
            }
            onEditText={setEditingTextId}
          />

          <InspectorPanel
            tablix={structureTablix}
            selectedCell={selectedCell}
            item={selectedItem}
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
            onOpenGroupProperties={(tablixId, axis, member) =>
              setGroupProperties({ tablixId, axis, member })
            }
            onAddRowToGroup={items.addRowToGroup}
            onAddRowGroup={items.addRowGroup}
            onDeleteRowGroup={items.deleteRowGroup}
            onResizeRow={items.resizeRow}
            onResizeColumn={items.resizeColumn}
            onOpenTablixFilters={setFiltersTablixId}
            onSetText={items.setRunText}
            onSetLabel={items.setRunLabel}
            onSetImageOptions={items.setImageOptions}
            embeddedImages={doc?.projection.meta.embeddedImages ?? []}
            onEditText={setEditingTextId}
          />
        </main>

        <StatusBar
          status={status}
          path={doc?.path ?? null}
          dirty={dirty}
          stats={stats ? `${stats.total} elementos · ${formatKinds(stats.byKind)}` : null}
          reloads={reloads}
        />
      </div>

      <WorkspaceDialogs
        core={core}
        items={items}
        propertiesOpen={propertiesOpen}
        onPropertiesOpenChange={setPropertiesOpen}
        editingText={editingText}
        onEditingTextOpenChange={(open) => {
          if (!open) setEditingTextId(null);
        }}
        groupProperties={groupProperties}
        onCloseGroupProperties={() => setGroupProperties(null)}
        filtersTablix={filtersTablix}
        onCloseTablixFilters={() => setFiltersTablixId(null)}
        conflictOpen={conflictOpen}
        onConflictOpenChange={setConflictOpen}
      />

      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        projection={doc?.projection ?? null}
        capabilities={{
          hasDocument: doc !== null,
          hasTextbox: selectedItem?.kind === 'textbox',
          hasTablix: structureTablix !== undefined,
        }}
        onSelectItem={items.selectAndReveal}
        onPickExpression={pickExpression}
        onAction={runPaletteAction}
      />
    </TooltipProvider>
  );
}
