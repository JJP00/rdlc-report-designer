import type { ProjectionDto } from '@rdlc-designer/contracts';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { CanvasArea } from '@/components/CanvasArea';
import { EditorBanners } from '@/components/EditorBanners';
import { EditorToolbar } from '@/components/EditorToolbar';
import { InspectorPanel } from '@/components/InspectorPanel';
import { StatusBar } from '@/components/StatusBar';
import { CommandPalette } from '@/components/panels/CommandPalette';
import { FormatToolbar } from '@/components/panels/FormatToolbar';
import { ReportPropertiesDialog } from '@/components/panels/ReportPropertiesDialog';
import { VariablesPanel } from '@/components/panels/VariablesPanel';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useDocumentCore } from '@/hooks/useDocumentCore';
import { useGlobalKeys } from '@/hooks/useGlobalKeys';
import { useItemEditing } from '@/hooks/useItemEditing';
import { insertIntoExpressionEditor } from '@/lib/expressionEditor';
import type { CanvasHit } from '@/lib/hit';
import { paletteRunner, type PaletteActionId } from '@/lib/palette';
import { countItems, formatKinds, isCellContent } from '@/lib/projection';
import { findOwnerTablix, hitSelectionCell } from '@/lib/tablix';
import { effectiveTextStyle } from '@/lib/style';
import { TEST_HOOKS_ENABLED } from '@/lib/testHooks';

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
  const [propertiesOpen, setPropertiesOpen] = useState(false);
  const [showVariables, setShowVariables] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  /** Último hit del click derecho: destino de "Insertar" y de "Pegar". */
  const [menuHit, setMenuHit] = useState<CanvasHit | null>(null);

  const { doc, status, error, dirty, conflict, reloads, hasBackend } = core;
  const { selectedId, selectedItem, selectedCell } = items;
  const stats = useMemo(() => (doc ? countItems(doc.projection) : null), [doc]);

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

  /** El item seleccionado es contenido directo de una celda (lo fija la celda). */
  const selectedIsCellContent = useMemo(
    () => (doc && selectedItem ? isCellContent(doc.projection, selectedItem.id) : false),
    [doc, selectedItem],
  );

  // QA/diagnóstico: la proyección viva, para los E2E de Playwright.
  useEffect(() => {
    if (!TEST_HOOKS_ENABLED) return;
    (window as Window & { __rdlcProjection?: ProjectionDto | null }).__rdlcProjection =
      doc?.projection ?? null;
  }, [doc]);

  // QA/diagnóstico: el último hit del click derecho (celda/scope del menú).
  useEffect(() => {
    if (!TEST_HOOKS_ENABLED) return;
    (window as Window & { __rdlcMenuHit?: CanvasHit | null }).__rdlcMenuHit = menuHit;
  }, [menuHit]);

  const setStatus = core.setStatus;
  const pickExpression = useCallback(
    (expression: string, name: string): void => {
      if (insertIntoExpressionEditor(expression)) {
        setStatus(`${name} insertada en el editor`);
        return;
      }
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        void navigator.clipboard.writeText(expression);
      }
      setStatus(`${name} copiada al portapapeles: ${expression}`);
    },
    [setStatus],
  );

  useGlobalKeys({
    hasDocument: doc !== null,
    hasSelection: selectedItem !== undefined,
    bodyIndex: doc?.projection.page.body.items.length ?? 0,
    onTogglePalette: () => setPaletteOpen((value) => !value),
    onUndo: () => void core.undo(),
    onRedo: () => void core.redo(),
    onNudge: items.nudge,
    onFlushNudge: items.flushNudge,
    onDelete: items.deleteSelected,
    onDuplicate: items.duplicateSelected,
    onCopy: items.copySelected,
    onCut: items.cutSelected,
    onPasteAtBody: (index) => items.pasteAt({ kind: 'body' }, index),
    onSelectParent: items.selectParent,
  });

  /** Acciones que ofrece la paleta (Ctrl+K). */
  const runPaletteAction = paletteRunner({
    open: () => void core.open(),
    save: () => void core.save(),
    undo: () => void core.undo(),
    redo: () => void core.redo(),
    toggleVariables: () => setShowVariables((value) => !value),
    reportProperties: () => setPropertiesOpen(true),
    insertTextbox: () => items.insertItem('textbox'),
    insertRectangle: () => items.insertItem('rectangle'),
    insertLine: () => items.insertItem('line'),
    insertImage: () => items.insertItem('image'),
  });

  /* Acciones del JSX (los hooks ya resuelven la lógica). */
  const { open, save, close, undo, redo, setError } = core;
  const {
    setSelectedId,
    setSelectedCell,
    selectCell,
    selectCellForContext,
    insertItem,
    insertAt,
    duplicateSelected,
    deleteSelected,
    copySelected,
    cutSelected,
    pasteAt,
    moveItem,
    setItemLocation,
    setItemSize,
    resizeItem,
    resizeColumn,
    resizeRow,
    addRow,
    deleteRow,
    addColumn,
    deleteColumn,
    deleteRows,
    deleteColumns,
    mergeCells,
    unmergeCells,
    setItemStyle,
    setImageOptions,
    setRunText,
    setPageSize,
    setPageMargins,
    setReportCode,
    hasClipboard,
    reveal,
    selectAndReveal,
    selectParent,
  } = items;

  /**
   * Click derecho: si cae dentro de una selección de celdas del Tablix (el
   * rectángulo o las añadidas con Ctrl+click, en el tablix que sea de la cadena
   * de anidados), el rango manda y no se pierde (fusión / borrado en lote). Si
   * no, selecciona lo que hay debajo.
   */
  const handleContextMenuHit = useCallback(
    (hit: CanvasHit): void => {
      setMenuHit(hit);
      if (hitSelectionCell(hit.cells, selectedCell)) return;
      if (hit.item) {
        setSelectedId(hit.item.id);
        return;
      }
      if (hit.scope.kind === 'tablixCell') {
        selectCellForContext({
          id: hit.scope.id,
          row: hit.scope.row,
          col: hit.scope.col,
        });
        return;
      }
      setSelectedId(null);
    },
    [selectCellForContext, selectedCell, setSelectedId],
  );

  return (
    <TooltipProvider>
      <div className="flex h-full flex-col bg-background">
        <EditorToolbar
          hasDocument={doc !== null}
          hasSelection={selectedItem !== undefined}
          selectedId={selectedId}
          zoom={zoom}
          showVariables={showVariables}
          onOpen={() => void open()}
          onSave={() => void save()}
          onClose={() => void close()}
          onOpenProperties={() => setPropertiesOpen(true)}
          onToggleVariables={() => setShowVariables((value) => !value)}
          onInsert={insertItem}
          onDuplicate={duplicateSelected}
          onDelete={deleteSelected}
          onUndo={() => void undo()}
          onRedo={() => void redo()}
          onZoomChange={setZoom}
        />

        {/* Barra de formato de texto (ribbon), bajo la toolbar principal. */}
        <FormatToolbar
          style={selectedItem?.kind === 'textbox' ? effectiveTextStyle(selectedItem) : undefined}
          onSetStyle={setItemStyle}
          disabled={selectedItem?.kind !== 'textbox'}
        />

        <EditorBanners
          error={error}
          conflict={conflict}
          hasBackend={hasBackend}
          onDismissError={() => setError(null)}
        />

        <main className="flex min-h-0 flex-1">
          {showVariables && doc ? (
            <aside className="flex w-72 shrink-0 flex-col overflow-hidden border-r bg-background">
              <VariablesPanel meta={doc.projection.meta} onPick={pickExpression} />
            </aside>
          ) : null}

          <CanvasArea
            projection={doc?.projection ?? null}
            zoom={zoom}
            selectedId={selectedId}
            selectedCell={selectedCell}
            menuHit={menuHit}
            hasClipboard={hasClipboard}
            reveal={reveal}
            onSelect={setSelectedId}
            onSelectCell={selectCell}
            onContextMenuHit={handleContextMenuHit}
            onZoomChange={setZoom}
            onMoveItem={moveItem}
            onResizeItem={resizeItem}
            onResizeColumn={resizeColumn}
            onResizeRow={resizeRow}
            onInsertAt={insertAt}
            onAddRow={addRow}
            onDeleteRow={deleteRow}
            onAddColumn={addColumn}
            onDeleteColumn={deleteColumn}
            onDeleteRows={deleteRows}
            onDeleteColumns={deleteColumns}
            onMergeCells={mergeCells}
            onUnmergeCells={unmergeCells}
            onDuplicate={duplicateSelected}
            onCopy={copySelected}
            onCut={cutSelected}
            onPasteAt={pasteAt}
            onDelete={deleteSelected}
            onSelectParent={selectParent}
          />

          <InspectorPanel
            tablix={structureTablix}
            selectedCell={selectedCell}
            item={selectedItem}
            cellContent={selectedIsCellContent}
            onSelectCell={setSelectedCell}
            onAddRow={addRow}
            onDeleteRow={deleteRow}
            onAddColumn={addColumn}
            onDeleteColumn={deleteColumn}
            onSetLocation={setItemLocation}
            onSetSize={setItemSize}
            onSetStyle={setItemStyle}
            onSetText={setRunText}
            onSetImageOptions={setImageOptions}
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

      {doc ? (
        <ReportPropertiesDialog
          projection={doc.projection}
          open={propertiesOpen}
          onOpenChange={setPropertiesOpen}
          onSetPageSize={setPageSize}
          onSetPageMargins={setPageMargins}
          onSetReportCode={setReportCode}
        />
      ) : null}

      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        projection={doc?.projection ?? null}
        hasDocument={doc !== null}
        onSelectItem={selectAndReveal}
        onPickExpression={pickExpression}
        onAction={runPaletteAction}
      />
    </TooltipProvider>
  );
}
