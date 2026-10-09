import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { type GroupPropertiesRequest } from '@/components/DocumentDialogs';
import { ReportTab } from '@/components/ReportTab';
import { TabStrip } from '@/components/TabStrip';
import { WorkspaceDialogs } from '@/components/WorkspaceDialogs';
import { CommandPalette } from '@/components/panels/CommandPalette';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useEditorKeys } from '@/hooks/useEditorKeys';
import { useFileDrop } from '@/hooks/useFileDrop';
import { useItemEditing } from '@/hooks/useItemEditing';
import { usePaletteActions } from '@/hooks/usePaletteActions';
import { useQaHooks } from '@/hooks/useQaHooks';
import { useTheme } from '@/hooks/useTheme';
import { useWorkspace } from '@/hooks/useWorkspace';
import { insertIntoExpressionEditor } from '@/lib/expressionEditor';
import { findItem } from '@/lib/projection';
import { findOwnerTablix } from '@/lib/tablix';

/**
 * Shell del editor: composición de hooks (`useWorkspace` para el workspace de
 * pestañas, `useItemEditing` para la edición de la activa y `useEditorKeys`
 * para los atajos) y del chrome (tira de pestañas + cuerpo de la pestaña
 * activa). Los diálogos de trabajo y la paleta viven **fuera** del cuerpo
 * (el cuerpo de `ReportTab` lleva `key={sessionId}`): al cambiar de pestaña se monta un
 * cuerpo nuevo y los diálogos de la anterior se cierran.
 */
export function App(): ReactNode {
  const core = useWorkspace();
  const items = useItemEditing(core);

  // Estado de UI del shell; el de la pestaña (selección, zoom, paneles) vive en
  // `tab.ui` (bloque D) y sobrevive al cambio de pestaña.
  const [fitZoom, setFitZoom] = useState<number | null>(null);
  /** Tema claro/oscuro (persistido en `localStorage`). */
  const { theme, toggleTheme } = useTheme();
  const [propertiesOpen, setPropertiesOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  /** Textbox cuyo editor de texto está abierto (párrafos → runs). */
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  /** Grupo cuyas «Propiedades» están abiertas (null = cerrado). */
  const [groupProperties, setGroupProperties] = useState<GroupPropertiesRequest | null>(null);
  /** Tablix cuyos «Filtros…» están abiertos (null = cerrado). */
  const [filtersTablixId, setFiltersTablixId] = useState<string | null>(null);
  /** Conflicto: el diálogo se reabre al detectarse (y con el botón del aviso). */
  const [conflictOpen, setConflictOpen] = useState(false);

  const {
    doc,
    tabs,
    activeSessionId,
    ui,
    updateUi,
    hasBackend,
    conflict,
    closeTab,
    closeTabs,
    activateTab,
    moveTab,
  } = core;
  const { selectedIds, selectedItem, selectedCell, menuHit } = items;

  /** Zoom presets: escriben el zoom de la pestaña activa (menú, paleta, atajos). */
  const setZoom = useCallback((value: number): void => updateUi({ zoom: value }), [updateUi]);
  const zoomFitWidth = useCallback((): void => {
    if (fitZoom !== null) setZoom(fitZoom);
  }, [fitZoom, setZoom]);
  const zoomReset = useCallback((): void => setZoom(1), [setZoom]);

  /** Paneles de la pestaña activa (viven en su `ui`, bloque D). */
  const showVariables = ui.showVariables;
  const showHierarchy = ui.showHierarchy;
  const toggleVariables = useCallback((): void => {
    updateUi({ showVariables: !showVariables });
  }, [showVariables, updateUi]);
  const toggleHierarchy = useCallback((): void => {
    updateUi({ showHierarchy: !showHierarchy });
  }, [showHierarchy, updateUi]);

  // Diálogos y paleta pertenecen a la pestaña activa: cambiar de pestaña los
  // cierra para que no viajen al documento nuevo (bloque D).
  useEffect(() => {
    setPropertiesOpen(false);
    setPaletteOpen(false);
    setEditingTextId(null);
    setGroupProperties(null);
    setFiltersTablixId(null);
    setConflictOpen(false);
    // El «ajustar al ancho» medido es del lienzo anterior: el nuevo lo publica
    // al montar (y así Ctrl+1 no aplica una medida de otra pestaña).
    setFitZoom(null);
  }, [activeSessionId]);

  // El conflicto es de la pestaña activa: el diálogo sigue su valor (tras el
  // cierre del cambio de pestaña, este efecto decide si el nuevo lo tiene).
  useEffect(() => {
    setConflictOpen(conflict !== null);
  }, [conflict]);

  /** Drag&drop de `.rdlc`/`.rdl` sobre la ventana (overlay + apertura en pestañas). */
  const { dropActive, dropHandlers } = useFileDrop({
    enabled: hasBackend,
    onOpenPaths: core.openPaths,
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

  /** Textbox en edición (el editor se monta al abrirlo y no se resincroniza). */
  const editingText = useMemo(() => {
    if (!doc || editingTextId === null) return undefined;
    const item = findItem(doc.projection, editingTextId);
    return item?.kind === 'textbox' ? item : undefined;
  }, [doc, editingTextId]);

  // QA/diagnóstico: proyección viva y último hit del click derecho (E2E).
  useQaHooks(doc?.projection ?? null, menuHit, selectedIds);

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
    setShowVariables: (updater) => updateUi({ showVariables: updater(showVariables) }),
    setPropertiesOpen,
    setEditingTextId,
    setFiltersTablixId,
  });

  return (
    <TooltipProvider>
      <div className="relative flex h-full flex-col bg-background" {...dropHandlers}>
        {dropActive ? (
          <div className="pointer-events-none absolute inset-3 z-40 flex items-center justify-center rounded-xl border-2 border-dashed border-primary/60 bg-primary/10 text-sm font-medium text-primary">
            Suelta el fichero .rdlc o .rdl para abrirlo
          </div>
        ) : null}

        {/* Marco estable (toolbars + tira de pestañas); el cuerpo se remonta por pestaña. */}
        <ReportTab
          core={core}
          tabStrip={
            <TabStrip
              tabs={tabs}
              activeSessionId={activeSessionId}
              onActivate={activateTab}
              onMove={moveTab}
              onClose={closeTab}
              onCloseMany={closeTabs}
            />
          }
          items={items}
          structureTablix={structureTablix}
          theme={theme}
          onToggleTheme={toggleTheme}
          zoom={ui.zoom}
          onZoomChange={setZoom}
          onZoomFitWidth={zoomFitWidth}
          onFitZoomChange={setFitZoom}
          showVariables={showVariables}
          onToggleVariables={toggleVariables}
          showHierarchy={showHierarchy}
          onToggleHierarchy={toggleHierarchy}
          onOpenProperties={() => setPropertiesOpen(true)}
          onEditText={setEditingTextId}
          onOpenGroupProperties={(tablixId, axis, member) =>
            setGroupProperties({ tablixId, axis, member })
          }
          onOpenTablixFilters={setFiltersTablixId}
          onResolveConflict={() => setConflictOpen(true)}
          onPickExpression={pickExpression}
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
