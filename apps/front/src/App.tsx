import type { NewItemSpec } from '@rdlc-designer/contracts';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { CanvasArea } from '@/components/CanvasArea';
import { EditorToolbar } from '@/components/EditorToolbar';
import { StatusBar } from '@/components/StatusBar';
import { CommandPalette } from '@/components/panels/CommandPalette';
import { FormatToolbar } from '@/components/panels/FormatToolbar';
import { ItemPanels } from '@/components/panels/ItemPanels';
import { ReportPropertiesDialog } from '@/components/panels/ReportPropertiesDialog';
import { VariablesPanel } from '@/components/panels/VariablesPanel';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useDocumentCore } from '@/hooks/useDocumentCore';
import { useGlobalKeys } from '@/hooks/useGlobalKeys';
import { useItemEditing } from '@/hooks/useItemEditing';
import { insertIntoExpressionEditor } from '@/lib/expressionEditor';
import type { CanvasHit } from '@/lib/hit';
import { paletteRunner, type PaletteActionId } from '@/lib/palette';
import { countItems, formatKinds } from '@/lib/projection';
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
  const [propertiesOpen, setPropertiesOpen] = useState(false);
  const [showVariables, setShowVariables] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  /** Último hit del click derecho: destino de "Insertar" y de "Pegar". */
  const [menuHit, setMenuHit] = useState<CanvasHit | null>(null);

  const { doc, status, error, dirty, conflict, reloads, hasBackend } = core;
  const { selectedId, selectedItem } = items;
  const stats = useMemo(() => (doc ? countItems(doc.projection) : null), [doc]);

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
  const { open, save, close, undo, redo } = core;
  const {
    setSelectedId,
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
    setItemStyle,
    setImageOptions,
    setRunText,
    setPageSize,
    setPageMargins,
    setReportCode,
    hasClipboard,
    reveal,
    selectAndReveal,
  } = items;

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

        {error ? (
          <div className="border-b border-destructive/30 bg-destructive/10 px-3 py-1.5 text-destructive">
            {error}
          </div>
        ) : null}
        {conflict ? (
          <div className="border-b border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-amber-700">
            El fichero <span className="font-mono">{conflict}</span> cambió por fuera y hay cambios
            sin guardar: no se ha recargado para no perderlos. Guarda para sobrescribir, o cierra y
            vuelve a abrir el fichero para descartar los tuyos.
          </div>
        ) : null}
        {!hasBackend ? (
          <div className="border-b border-destructive/30 bg-destructive/10 px-3 py-1.5 text-destructive">
            Modo navegador: sin backend IPC. Arranca la aplicación con{' '}
            <code>pnpm --filter @rdlc-designer/back dev</code>.
          </div>
        ) : null}

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
            menuHit={menuHit}
            hasClipboard={hasClipboard}
            reveal={reveal}
            onSelect={setSelectedId}
            onContextMenuHit={(hit) => {
              setMenuHit(hit);
              // Como en VS/RB: el click derecho selecciona lo que hay debajo.
              setSelectedId(hit.item?.id ?? null);
            }}
            onZoomChange={setZoom}
            onMoveItem={moveItem}
            onInsertAt={insertAt}
            onDuplicate={duplicateSelected}
            onCopy={copySelected}
            onCut={cutSelected}
            onPasteAt={pasteAt}
            onDelete={deleteSelected}
          />

          <aside className="flex w-80 shrink-0 flex-col overflow-y-auto border-l bg-background">
            <ItemPanels
              item={selectedItem}
              onSetLocation={setItemLocation}
              onSetSize={setItemSize}
              onSetStyle={setItemStyle}
              onSetText={setRunText}
              onSetImageOptions={setImageOptions}
            />
          </aside>
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
