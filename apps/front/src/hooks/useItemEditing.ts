import type {
  BatchableCommand,
  ItemDto,
  Length,
  NewItemSpec,
  ParagraphDto,
  RdlcCommand,
  ScopeRef,
  StyleDto,
  StylePatch,
  TablixFilterDto,
  TextboxDto,
  TextRunDto,
} from '@rdlc-designer/contracts';
import { useT, useTranslator } from '@rdlc-designer/i18n/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { insertDestinationLabel } from '@/hooks/canvasA11y';
import { topLevelIds } from '@/lib/align';
import { apiErrorMessage } from '@/lib/errors';
import type { CanvasHit } from '@/lib/hit';
import { insertSpecAt } from '@/lib/insert';
import {
  cm,
  findItem,
  findParentItemId,
  findSiblings,
  isCellContent,
  patchItem,
  toCm,
} from '@/lib/projection';
import { hitSelectionCell, isCellInRange, isCellSelected, type SelectedCell } from '@/lib/tablix';
import type { TabUiPatch } from '@/lib/workspace';
import type { WorkspaceCore } from './useWorkspace';

/**
 * Edición de items: selección, mover/redimensionar/estilar, insertar, duplicar,
 * portapapeles, propiedades de página/código y el *nudge* con flechas.
 *
 * Todo cambio se aplica de forma **optimista** en la proyección y se manda como
 * comando al backend; si el comando devuelve valores normalizados, se reconcilia.
 */

/** Paso de las flechas: 1pt (Shift = 10pt). */
export const NUDGE_PT_CM = 2.54 / 72;
/** Racha de flechas: se agrupa en UN comando (un paso de undo). */
const NUDGE_BURST_MS = 400;

export interface ImageOptionsPatch {
  source?: 'External' | 'Embedded' | 'Database' | null;
  value?: string | null;
  mimeType?: string | null;
  sizing?: string | null;
}

export interface ItemEditing {
  selectedId: string | null;
  /** Multiselección de items (el ancla es el último id). */
  selectedIds: string[];
  /** Items completos de la multiselección (U3). */
  selectedItems: ItemDto[];
  /** De los seleccionados, los movibles (no contenido de celda). */
  movableIds: string[];
  /** El item seleccionado es contenido directo de una celda (lo fija la celda). */
  selectedIsCellContent: boolean;
  selectedItem: ItemDto | undefined;
  setSelectedId: (id: string | null) => void;
  /** Fija la multiselección completa (marco de selección). */
  setSelectedIds: (ids: string[]) => void;
  /** Ctrl/Shift+click: añade o quita un item de la multiselección. */
  toggleItemSelection: (id: string) => void;
  /** Celda de Tablix seleccionada (independiente del item seleccionado). */
  selectedCell: SelectedCell | null;
  setSelectedCell: (cell: SelectedCell | null) => void;
  /** Selecciona una celda; `extend` amplía el rango (Shift) y `toggle` añade/quita (Ctrl). */
  selectCell: (cell: SelectedCell, extend?: boolean, toggle?: boolean) => void;
  /** Click derecho: conserva el rango si la celda ya estaba dentro. */
  selectCellForContext: (cell: SelectedCell) => void;
  /** Último hit del click derecho: destino del menú, "Insertar" y "Pegar". */
  menuHit: CanvasHit | null;
  /**
   * Click derecho sobre el lienzo: fija el hit y ajusta la selección. `null`
   * (click fuera del papel o de las bandas) limpia el destino: el menú queda
   * con las **acciones de la selección** y sin Insertar/Pegar, que necesitan
   * un hit fresco (antes se colaba el del click derecho anterior).
   */
  showContextMenu: (hit: CanvasHit | null) => void;
  /** Selecciona y pide al lienzo que traiga el elemento a la vista. */
  selectAndReveal: (id: string) => void;
  /** Sube un nivel en la jerarquía (Esc): selecciona el contenedor del item. */
  selectParent: () => void;
  reveal: { id: string; nonce: number } | null;

  /** Vacía la ráfaga de flechas pendiente (antes de borrar/undo, p. ej.). */
  flushNudge: () => void;
  nudge: (dxCm: number, dyCm: number) => void;
  moveTo: (id: string, top: Length, left: Length) => void;
  moveMany: (moves: { id: string; top: Length; left: Length }[]) => void;
  /** Reparenta/reordena un item (fin de drag) en un solo paso de undo. */
  moveItemToScope: (id: string, scope: ScopeRef, index: number, top: Length, left: Length) => void;
  setItemLocation: (top: Length, left: Length) => void;
  setItemSize: (width: Length, height: Length) => void;
  /** Mueve y redimensiona a la vez (tiradores): un paso de undo. */
  resizeItem: (
    id: string,
    box: { top: Length; left: Length; width: Length; height: Length },
  ) => void;
  /** Multiselección: escala el bloque entero en un `batch` (un solo undo). */
  resizeMany: (commands: BatchableCommand[]) => void;
  /** Separadores de la rejilla del Tablix. */
  resizeColumn: (id: string, column: number, width: Length) => void;
  resizeRow: (id: string, row: number, height: Length) => void;
  /** Estructura del Tablix (F2 parte 3): filas y columnas. */
  addRow: (id: string, row: number) => void;
  deleteRow: (id: string, row: number) => void;
  addColumn: (id: string, column: number) => void;
  deleteColumn: (id: string, column: number) => void;
  /** Varias filas/columnas en un solo paso de undo. */
  deleteRows: (id: string, rows: number[]) => void;
  deleteColumns: (id: string, columns: number[]) => void;
  /** Fusionar el bloque desde (row, col) y separarlo. */
  mergeCells: (id: string, row: number, col: number, rowSpan: number, colSpan: number) => void;
  unmergeCells: (id: string, row: number, col: number) => void;
  setItemStyle: (patch: StylePatch) => void;
  /** Edición en lote (multiselección): varios comandos, un solo paso de undo. */
  batchEdit: (commands: BatchableCommand[]) => void;
  /** Orden de apilado entre los hermanos del mismo contenedor. */
  zOrder: (direction: 'front' | 'back') => void;
  /** `CanGrow`/`KeepTogether` de un Textbox (apagarlas quita la etiqueta). */
  setItemOptions: (options: { canGrow?: boolean; keepTogether?: boolean }) => void;
  /** Salto de página del item (`None`/`null` quitan el bloque). */
  setItemPageBreak: (breakLocation: 'None' | 'Start' | 'End' | 'Between') => void;
  /** Renombra el elemento (el nombre debe ser único; lo valida el dominio). */
  setItemName: (name: string) => void;
  /** Visibilidad del item (`null` = quitarla). */
  setVisibility: (hidden: boolean | string | null) => void;
  /** Visibilidad de una fila/columna/grupo de un Tablix (`path` de la proyección). */
  setMemberVisibility: (
    tablixId: string,
    axis: 'row' | 'column',
    path: number[],
    hidden: boolean | string | null,
  ) => void;
  /** Aplica «Propiedades del grupo»: los comandos ya vienen filtrados. */
  applyGroupProperties: (commands: RdlcCommand[]) => void;
  /** Añade una fila contigua al grupo (extiende su rango de hojas). */
  addRowToGroup: (tablixId: string, row: number, groupPath: number[]) => void;
  /** F3 · Matrix: añade una columna contigua al grupo (espejo de la fila). */
  addColumnToGroup: (tablixId: string, column: number, groupPath: number[]) => void;
  /** Inserta una fila de relleno fuera del grupo (`where` = borde). */
  addRowOutsideGroup: (tablixId: string, row: number, where: 'above' | 'below') => void;
  /** Inserta una fila de relleno dentro del grupo, pegada a la fila indicada. */
  addRowInsideGroup: (tablixId: string, row: number, where: 'above' | 'below') => void;
  /** F2.c: fila de totales pegada al grupo, con los agregados por columna. */
  addTotalRow: (tablixId: string, row: number, where: 'above' | 'below') => void;
  /** Envuelve la fila en un grupo nuevo con esa expresión. */
  addRowGroup: (tablixId: string, row: number, expression: string) => void;
  /** F3 · Matrix: envuelve la columna en un grupo nuevo con esa expresión. */
  addColumnGroup: (tablixId: string, column: number, expression: string) => void;
  /** Quita el grupo: las filas que cuelgan se quedan como filas estáticas. */
  deleteRowGroup: (tablixId: string, axis: 'row' | 'column', path: number[]) => void;
  /** Reemplaza los filtros del Tablix (`[]` los quita): un paso de undo. */
  setTablixFilters: (tablixId: string, filters: TablixFilterDto[]) => void;
  setImageOptions: (patch: ImageOptionsPatch) => void;
  setRunText: (p: number, r: number, value: string) => void;
  /** Etiqueta de diseñador del run (`<Label>`); `null` la quita. */
  setRunLabel: (p: number, r: number, label: string | null) => void;
  /** Reemplaza los párrafos del Textbox (editor de texto): un paso de undo. */
  setParagraphs: (id: string, paragraphs: ParagraphDto[]) => void;

  insertItem: (kind: NewItemSpec['kind']) => void;
  insertAt: (kind: NewItemSpec['kind'], hit: CanvasHit) => void;
  duplicateSelected: () => void;
  deleteSelected: () => void;

  copySelected: () => void;
  cutSelected: () => void;
  pasteAt: (scope: ScopeRef, index: number) => void;
  hasClipboard: boolean;

  setPageSize: (width: Length, height: Length) => void;
  setPageMargins: (margins: { top: Length; bottom: Length; left: Length; right: Length }) => void;
  /** Alto de la banda de página o del **cuerpo** (`Height` del contenedor). */
  setRegionHeight: (region: 'pageHeader' | 'pageFooter' | 'body', height: Length) => void;
  /** Ancho de la sección (`ReportSection > Width`: manda en las tres bandas). */
  setSectionWidth: (width: Length) => void;
  /** Impresión del encabezado/pie en la primera/última página. */
  setHeaderFooterOptions: (
    region: 'pageHeader' | 'pageFooter',
    options: { printOnFirstPage?: boolean; printOnLastPage?: boolean },
  ) => void;
  /** Inserta (`true`) o quita (`false`) la banda de página entera. */
  setRegionPresent: (region: 'pageHeader' | 'pageFooter', present: boolean) => void;
  setReportCode: (code: string) => void;
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

/** Run con la etiqueta puesta (`null`/'' la quita). */
function withLabel(run: TextRunDto, label: string | null): TextRunDto {
  const next: TextRunDto = { ...run };
  if (label === null || label === '') delete next.label;
  else next.label = label;
  return next;
}

/**
 * Fusiona un `StylePatch` en un estilo: `null` quita la propiedad y `padding`/
 * `border` (anidados) se fusionan lado a lado sin borrar los demás. Se usa en
 * el camino optimista de `setStyle` (un item y el lote de la multiselección).
 */
function mergeStylePatch(style: StyleDto | undefined, patch: StylePatch): StyleDto {
  const nextStyle: StyleDto = { ...(style ?? {}) };
  const target = nextStyle as Record<string, unknown>;
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) delete target[key];
    else if (value === undefined) continue;
    else if (key === 'padding') {
      target[key] = {
        ...((target[key] as Record<string, unknown> | undefined) ?? {}),
        ...(value as Record<string, unknown>),
      };
    } else if (key === 'border') {
      // Parche por lado: un lado a `null` quita su override.
      const next: Record<string, unknown> = {
        ...((target[key] as Record<string, unknown> | undefined) ?? {}),
      };
      for (const [side, sideValue] of Object.entries(value as Record<string, unknown>)) {
        if (sideValue === null) delete next[side];
        else if (sideValue !== undefined) next[side] = sideValue;
      }
      if (Object.keys(next).length > 0) target[key] = next;
      else delete target[key];
    } else target[key] = value;
  }
  return nextStyle;
}

/**
 * Parche optimista de un `StylePatch` sobre un item. `textAlign` se redirige al
 * `<Style>` de **cada párrafo** (BC solo lo lee ahí: ver `setStyle` del dominio)
 * y, si el item no tiene párrafos (Rectangle…), cae a su `<Style>` como en el
 * backend. El resto del parche va al item como siempre. Sin esta redirección la
 * barra de formato parecería no responder: los párrafos sombrean al item.
 */
function optimisticStylePatch(item: ItemDto, patch: StylePatch): Partial<ItemDto> {
  const { textAlign, ...rest } = patch;
  const toParagraphs =
    textAlign !== undefined && item.kind === 'textbox' && item.paragraphs.length > 0;

  const style = mergeStylePatch(item.style, toParagraphs ? rest : patch);
  const paragraphs =
    toParagraphs && item.kind === 'textbox'
      ? item.paragraphs.map((paragraph) => ({
          ...paragraph,
          style: mergeStylePatch(paragraph.style, { textAlign }),
        }))
      : undefined;

  return {
    style: Object.keys(style).length > 0 ? style : undefined,
    ...(paragraphs ? { paragraphs } : {}),
  };
}

export function useItemEditing(core: WorkspaceCore): ItemEditing {
  const t = useT();
  const translator = useTranslator();
  const {
    doc,
    sendCommand,
    updateProjection,
    setStatus,
    setError,
    ui: tabUi,
    updateTabUi,
    hasClipboard: tabHasClipboard,
    markClipboard,
  } = core;

  /** Sesión de la pestaña activa (las respuestas diferidas escriben en la suya). */
  const sessionId = doc?.sessionId ?? null;

  /**
   * Selección de la pestaña activa: vive en su `ui` (bloque D) y sobrevive al
   * cambio de pestaña. No hay copia local que sincronizar —se lee al renderizar
   * y se escribe con `writeTabUi` en callbacks—, así que no puede haber bucle
   * `setState` ↔ store (el riesgo documentado de la fase).
   */
  const selectedIdsState = tabUi.selectedIds;
  const selectedCellState = tabUi.selectedCell;

  /**
   * Escribe un parche de UI en la sesión **capturada** al crear el callback, no
   * en la activa: una respuesta diferida (insertar, pegar, duplicar…) no debe
   * tocar la pestaña que el usuario tenga delante. El parche que no cambia nada
   * se descarta en el store y no re-renderiza.
   */
  const writeTabUi = useCallback(
    (patch: TabUiPatch): void => {
      if (sessionId === null) return;
      updateTabUi(sessionId, patch);
    },
    [sessionId, updateTabUi],
  );

  const [revealState, setReveal] = useState<{
    id: string;
    nonce: number;
    sessionId: string;
  } | null>(null);

  /** Item y celda son excluyentes: seleccionar uno limpia el otro. */
  const setSelectedId = useCallback(
    (id: string | null): void => {
      writeTabUi({ selectedId: id, selectedIds: id ? [id] : [], selectedCell: null });
    },
    [writeTabUi],
  );

  /** Fija la multiselección completa (marco, «seleccionar todo», etc.). */
  const setSelectedIds = useCallback(
    (ids: string[]): void => {
      writeTabUi({
        selectedId: ids[ids.length - 1] ?? null,
        selectedIds: ids,
        selectedCell: null,
      });
    },
    [writeTabUi],
  );

  /** Ctrl/Shift+click: añade o quita el item de la multiselección. */
  const toggleItemSelection = useCallback(
    (id: string): void => {
      writeTabUi((ui) => {
        const next = ui.selectedIds.includes(id)
          ? ui.selectedIds.filter((candidate) => candidate !== id)
          : [...ui.selectedIds, id];
        return {
          selectedId: next[next.length - 1] ?? null,
          selectedIds: next,
          selectedCell: null,
        };
      });
    },
    [writeTabUi],
  );

  const setSelectedCell = useCallback(
    (cell: SelectedCell | null): void => {
      writeTabUi({ selectedId: null, selectedIds: [], selectedCell: cell });
    },
    [writeTabUi],
  );

  /** Shift amplía el rango desde el ancla; Ctrl añade/quita celdas sueltas. */
  const selectCell = useCallback(
    (cell: SelectedCell, extend = false, toggle = false): void => {
      writeTabUi((ui) => {
        const current = ui.selectedCell;
        const clearItems = { selectedId: null, selectedIds: [] as string[] };
        if (!current || current.id !== cell.id) {
          return {
            ...clearItems,
            selectedCell: {
              id: cell.id,
              row: cell.row,
              col: cell.col,
              ...(cell.endRow !== undefined ? { endRow: cell.endRow } : {}),
              ...(cell.endCol !== undefined ? { endCol: cell.endCol } : {}),
            },
          };
        }

        if (toggle) {
          const extras = current.extra ?? [];
          const isExtra = extras.some((entry) => entry.row === cell.row && entry.col === cell.col);
          if (isExtra) {
            const next = extras.filter((entry) => entry.row !== cell.row || entry.col !== cell.col);
            return {
              ...clearItems,
              selectedCell:
                next.length > 0 ? { ...current, extra: next } : { ...current, extra: [] },
            };
          }
          if (isCellInRange(cell, current)) return {};
          return {
            ...clearItems,
            selectedCell: { ...current, extra: [...extras, { row: cell.row, col: cell.col }] },
          };
        }

        if (extend) {
          return {
            ...clearItems,
            selectedCell: {
              ...current,
              endRow: cell.endRow ?? cell.row,
              endCol: cell.endCol ?? cell.col,
            },
          };
        }

        return {
          ...clearItems,
          selectedCell: {
            id: cell.id,
            row: cell.row,
            col: cell.col,
            ...(cell.endRow !== undefined ? { endRow: cell.endRow } : {}),
            ...(cell.endCol !== undefined ? { endCol: cell.endCol } : {}),
          },
        };
      });
    },
    [writeTabUi],
  );

  /** Click derecho: si la celda ya forma parte de la selección, no la pierde. */
  const selectCellForContext = useCallback(
    (cell: SelectedCell): void => {
      writeTabUi((ui) => {
        const current = ui.selectedCell;
        if (current && current.id === cell.id && isCellSelected(cell, current)) return {};
        return {
          selectedId: null,
          selectedIds: [],
          selectedCell: { id: cell.id, row: cell.row, col: cell.col },
        };
      });
    },
    [writeTabUi],
  );

  // La selección solo vale si los items siguen existiendo (undo/redo, recarga,
  // borrado): se **deriva** en vez de sincronizarse con un efecto.
  const selectedIds = useMemo(
    () => (doc ? selectedIdsState.filter((id) => findItem(doc.projection, id) !== undefined) : []),
    [doc, selectedIdsState],
  );
  const selectedId = selectedIds.length > 0 ? (selectedIds[selectedIds.length - 1] ?? null) : null;
  const selectedItem = useMemo(
    () => (doc && selectedId ? findItem(doc.projection, selectedId) : undefined),
    [doc, selectedId],
  );
  /** El item seleccionado es contenido directo de una celda (lo fija la celda). */
  const selectedIsCellContent = useMemo(
    () => (doc && selectedItem ? isCellContent(doc.projection, selectedItem.id) : false),
    [doc, selectedItem],
  );

  /** Items completos de la multiselección (U3) y cuáles pueden moverse. */
  const selectedItems = useMemo(() => {
    if (!doc) return [];
    return selectedIds.flatMap((id) => {
      const item = findItem(doc.projection, id);
      return item ? [item] : [];
    });
  }, [doc, selectedIds]);
  const movableIds = useMemo(
    () => (doc ? selectedIds.filter((id) => !isCellContent(doc.projection, id)) : []),
    [doc, selectedIds],
  );

  // La celda seleccionada tampoco sobrevive si su Tablix desaparece o si la
  // rejilla se encogió por debajo de ella (borrar/deshacer la última
  // fila/columna): una celda fuera de rango dejaría el resaltado y el siguiente
  // `insertItem` apuntando a una celda que ya no existe (BUG-40).
  const selectedCell = useMemo(() => {
    if (!doc || !selectedCellState) return null;
    const tablix = findItem(doc.projection, selectedCellState.id);
    if (tablix?.kind !== 'tablix') return null;

    const rows = tablix.body.rows.length;
    const columns = tablix.body.columns.length;
    const inGrid = (row: number, col: number): boolean =>
      row >= 0 && row < rows && col >= 0 && col < columns;
    const endRow = selectedCellState.endRow ?? selectedCellState.row;
    const endCol = selectedCellState.endCol ?? selectedCellState.col;
    if (!inGrid(selectedCellState.row, selectedCellState.col)) return null;
    if (!inGrid(endRow, endCol)) return null;
    if ((selectedCellState.extra ?? []).some((entry) => !inGrid(entry.row, entry.col))) return null;
    return selectedCellState;
  }, [doc, selectedCellState]);

  /* -------------------------- click derecho ------------------------------- */

  const [menuHit, setMenuHit] = useState<CanvasHit | null>(null);

  /**
   * Click derecho: si cae dentro de una selección de celdas del Tablix (el
   * rectángulo o las añadidas con Ctrl+click, en el tablix que sea de la cadena
   * de anidados), el rango manda y no se pierde (fusión / borrado en lote). Si
   * no, selecciona lo que hay debajo. `null` (fuera del papel) solo limpia el
   * destino: el menú queda con las acciones de la selección actual.
   */
  const showContextMenu = useCallback(
    (hit: CanvasHit | null): void => {
      setMenuHit(hit);
      if (!hit) return;
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

  /* --------------------- mover con flechas (1pt / 10pt) ------------------ */

  interface PendingMove {
    /** Identifica la ráfaga: los ids movidos (una multiselección es una sola ráfaga). */
    key: string;
    members: { id: string; topCm: number; leftCm: number }[];
    /** Sesión que originó el movimiento: el flush diferido no viaja a otra pestaña. */
    sessionId: string;
    timer: number;
  }

  const pendingMove = useRef<PendingMove | null>(null);

  const flushNudge = useCallback((): void => {
    const pending = pendingMove.current;
    if (!pending) return;
    pendingMove.current = null;
    window.clearTimeout(pending.timer);
    // La reconciliación de los valores normalizados la hace `sendCommand` en
    // la sesión que originó el movimiento (aunque la activa haya cambiado).
    const commands = pending.members.map((member) => ({
      cmd: 'setLocation' as const,
      id: member.id,
      top: cm(member.topCm),
      left: cm(member.leftCm),
    }));
    void sendCommand(
      commands.length === 1 ? commands[0]! : { cmd: 'batch', commands },
      pending.sessionId,
    );
  }, [sendCommand]);

  // El flush se invoca desde efectos/limpiezas: usa un ref para no depender
  // de su identidad (que cambia con cada mutación del documento).
  const flushRef = useRef(flushNudge);
  useEffect(() => {
    flushRef.current = flushNudge;
  }, [flushNudge]);

  // Al cambiar de selección, cierra la ráfaga pendiente.
  useEffect(() => () => flushRef.current(), [selectedId]);

  const nudge = useCallback(
    (dxCm: number, dyCm: number): void => {
      if (!doc) return;
      // Multiselección: se mueven todos los miembros movibles juntos.
      const group =
        selectedIds.length > 1
          ? selectedItems.filter((item) => movableIds.includes(item.id))
          : selectedItem
            ? [selectedItem]
            : [];
      if (group.length === 0) return;

      // El contenido directo de una celda está anclado: la celda fija su
      // posición (Report Builder tampoco deja moverlo).
      if (selectedIds.length <= 1 && isCellContent(doc.projection, group[0]!.id)) {
        setStatus(t('app.status.cellLocked'));
        return;
      }

      const key = group.map((item) => item.id).join('|');
      const sessionId = doc.sessionId;
      const current = pendingMove.current;
      // Ráfaga de otra selección u otra sesión: se cierra contra su pestaña
      // antes de empezar la nueva (el flush fija su `sessionId`).
      if (current && (current.key !== key || current.sessionId !== sessionId)) {
        flushRef.current();
      }
      const previous = pendingMove.current;
      const pending: PendingMove =
        previous && previous.key === key && previous.sessionId === sessionId
          ? previous
          : {
              key,
              sessionId,
              members: group.map((item) => ({
                id: item.id,
                topCm: toCm(item.top),
                leftCm: toCm(item.left),
              })),
              timer: 0,
            };

      // Nada que mover (p. ej. ya están en el borde): no se envía nada.
      const nextMembers = pending.members.map((member) => ({
        id: member.id,
        topCm: Math.max(0, member.topCm + dyCm),
        leftCm: Math.max(0, member.leftCm + dxCm),
      }));
      if (
        nextMembers.every(
          (member, index) =>
            round4(member.topCm) === round4(pending.members[index]!.topCm) &&
            round4(member.leftCm) === round4(pending.members[index]!.leftCm),
        )
      ) {
        return;
      }
      pending.members = nextMembers;
      // Un temporizador por ráfaga (no se reinicia con cada tecla): mantén la
      // tecla pulsada = unos pocos comandos, no uno por repetición.
      if (pending.timer === 0) {
        pending.timer = window.setTimeout(() => flushRef.current(), NUDGE_BURST_MS);
      }
      pendingMove.current = pending;

      updateProjection((projection) => {
        let next = projection;
        for (const member of pending.members) {
          next = patchItem(next, member.id, { top: cm(member.topCm), left: cm(member.leftCm) });
        }
        return next;
      });
    },
    [doc, movableIds, selectedIds, selectedItem, selectedItems, setStatus, t, updateProjection],
  );

  /* --------------------------- geometría y estilo ------------------------- */

  const moveTo = useCallback(
    (id: string, top: Length, left: Length): void => {
      // Cualquier camino (drag, panel, atajos) respeta el anclaje de la celda.
      if (doc && isCellContent(doc.projection, id)) {
        setStatus(t('app.status.cellLocked'));
        return;
      }
      // Optimista: el lienzo ya movió el nodo; aquí se refleja en la proyección.
      updateProjection((projection) => patchItem(projection, id, { top, left }));
      void sendCommand({ cmd: 'setLocation', id, top, left });
    },
    [doc, sendCommand, setStatus, t, updateProjection],
  );

  /** Arrastre de una multiselección: todos a la vez, un solo paso de undo. */
  const moveMany = useCallback(
    (moves: { id: string; top: Length; left: Length }[]): void => {
      const movable = doc ? moves.filter((move) => !isCellContent(doc.projection, move.id)) : [];
      if (movable.length === 0) return;
      updateProjection((projection) => {
        let next = projection;
        for (const move of movable) {
          next = patchItem(next, move.id, { top: move.top, left: move.left });
        }
        return next;
      });
      void sendCommand({
        cmd: 'batch',
        commands: movable.map((move) => ({
          cmd: 'setLocation' as const,
          id: move.id,
          top: move.top,
          left: move.left,
        })),
      });
    },
    [doc, sendCommand, updateProjection],
  );

  /**
   * Reparentado por drag&drop: el comando es estructural (pide snapshot), así
   * que no hay optimismo: la proyección y el árbol llegan del backend.
   */
  const moveItemToScope = useCallback(
    (id: string, scope: ScopeRef, index: number, top: Length, left: Length): void => {
      void sendCommand({ cmd: 'moveItem', id, toScope: scope, toIndex: index, top, left });
    },
    [sendCommand],
  );

  const setItemLocation = useCallback(
    (top: Length, left: Length): void => {
      if (!selectedItem) return;
      moveTo(selectedItem.id, top, left);
    },
    [moveTo, selectedItem],
  );

  const setItemSize = useCallback(
    (width: Length, height: Length): void => {
      if (!selectedItem) return;
      const id = selectedItem.id;
      updateProjection((projection) => patchItem(projection, id, { width, height }));
      void sendCommand({ cmd: 'setSize', id, width, height });
    },
    [selectedItem, sendCommand, updateProjection],
  );

  /**
   * Mover y redimensionar a la vez (tiradores de la selección): **un solo
   * comando**, así el undo es un paso aunque cambien posición y tamaño.
   *
   * Un Tablix no tiene caja propia útil: su tamaño es la **rejilla** (columnas y
   * filas), así que se manda `resizeTable` (reparto proporcional) y el front no
   * hace optimismo: el backend devuelve la proyección con la rejilla nueva.
   */
  const resizeItem = useCallback(
    (id: string, box: { top: Length; left: Length; width: Length; height: Length }): void => {
      const item = doc ? findItem(doc.projection, id) : undefined;
      if (item?.kind === 'tablix') {
        void sendCommand({ cmd: 'resizeTable', id, ...box });
        return;
      }

      updateProjection((projection) => patchItem(projection, id, box));
      void sendCommand({ cmd: 'setBounds', id, ...box });
    },
    [doc, sendCommand, updateProjection],
  );

  /**
   * Redimensionado del bloque (multiselección): los comandos ya vienen
   * calculados (`lib/groupResize`) y viajan en un `batch` — **un solo paso de
   * undo**. Los `setBounds` se reflejan ya en la proyección; un Tablix
   * (`resizeTable`) refresca con el snapshot del backend (su rejilla no viaja
   * en `applied`).
   */
  const resizeMany = useCallback(
    (commands: BatchableCommand[]): void => {
      if (commands.length === 0) return;
      updateProjection((projection) => {
        let next = projection;
        for (const command of commands) {
          if (command.cmd !== 'setBounds') continue;
          next = patchItem(next, command.id, {
            top: command.top,
            left: command.left,
            width: command.width,
            height: command.height,
          });
        }
        return next;
      });
      void sendCommand({ cmd: 'batch', commands });
    },
    [sendCommand, updateProjection],
  );

  /**
   * Edición en lote de la multiselección: los comandos van juntos en `batch` y
   * el backend los aplica como **un solo paso de undo**.
   */
  const batchEdit = useCallback(
    (commands: BatchableCommand[]): void => {
      if (commands.length === 0) return;
      void sendCommand({ cmd: 'batch', commands });
    },
    [sendCommand],
  );

  const setItemStyle = useCallback(
    (patch: StylePatch): void => {
      // Multiselección: se aplica a **todos** los seleccionados (igual que el
      // panel de selección múltiple), no solo al último, en un solo `batch`.
      if (selectedIds.length > 1) {
        updateProjection((projection) => {
          let next = projection;
          for (const id of selectedIds) {
            const item = findItem(next, id);
            if (!item) continue;
            next = patchItem(next, id, optimisticStylePatch(item, patch));
          }
          return next;
        });
        batchEdit(selectedIds.map((id) => ({ cmd: 'setStyle' as const, id, style: patch })));
        return;
      }

      if (!selectedItem) return;
      const id = selectedItem.id;

      // Optimista: aplica el parche (TextAlign va a los párrafos); `null` =
      // quitar la propiedad.
      updateProjection((projection) =>
        patchItem(projection, id, optimisticStylePatch(selectedItem, patch)),
      );
      void sendCommand({ cmd: 'setStyle', id, style: patch });
    },
    [batchEdit, selectedIds, selectedItem, sendCommand, updateProjection],
  );

  /**
   * «Traer al frente» / «Enviar atrás»: zIndex por delante del máximo (o por
   * detrás del mínimo) de los **hermanos** del contenedor. Sin hermanos no hay
   * orden que cambiar. «Enviar atrás» manda `-1` cuando el mínimo es 0: el
   * dominio corre los hermanos (un solo comando, un paso de undo).
   */
  const zOrder = useCallback(
    (direction: 'front' | 'back'): void => {
      if (!doc || !selectedItem) return;
      const siblings = findSiblings(doc.projection, selectedItem.id);
      const others = siblings?.filter((item) => item.id !== selectedItem.id);
      if (!others || others.length === 0) return;

      const effective = (item: ItemDto): number => item.zIndex ?? 0;
      const min = Math.min(...others.map(effective));
      const max = Math.max(...others.map(effective));
      const zIndex = direction === 'front' ? max + 1 : min > 0 ? min - 1 : -1;
      // Al frente: el dominio devuelve el `ZIndex` aplicado y se reconcilia.
      // Atrás (negativo): el dominio corre a los hermanos y pide snapshot.
      void sendCommand({ cmd: 'setZIndex', id: selectedItem.id, zIndex });
    },
    [doc, selectedItem, sendCommand],
  );

  const setItemOptions = useCallback(
    (options: { canGrow?: boolean; keepTogether?: boolean }): void => {
      if (!selectedItem || selectedItem.kind !== 'textbox') return;
      // Sin optimismo: el comando pide snapshot (apagar = quitar la etiqueta y
      // la proyección devuelve el flag como `undefined`).
      void sendCommand({ cmd: 'setItemOptions', id: selectedItem.id, ...options });
    },
    [selectedItem, sendCommand],
  );

  const setItemPageBreak = useCallback(
    (breakLocation: 'None' | 'Start' | 'End' | 'Between'): void => {
      if (!selectedItem) return;
      const id = selectedItem.id;
      // Optimista: `None` = sin salto declarado.
      updateProjection((projection) =>
        patchItem(projection, id, {
          pageBreak: breakLocation === 'None' ? undefined : breakLocation,
        }),
      );
      void sendCommand({ cmd: 'setItemPageBreak', id, breakLocation });
    },
    [selectedItem, sendCommand, updateProjection],
  );

  const setItemName = useCallback(
    (name: string): void => {
      if (!selectedItem) return;
      const id = selectedItem.id;

      // El id del elemento **es** su nombre: si el comando se acepta, la
      // selección se mueve al nombre nuevo (y la proyección llega por snapshot,
      // que es estructural).
      void sendCommand({ cmd: 'setName', id, name }).then((result) => {
        if (result?.ok) setSelectedId(name);
      });
    },
    [selectedItem, sendCommand, setSelectedId],
  );

  const setMemberVisibility = useCallback(
    (
      tablixId: string,
      axis: 'row' | 'column',
      path: number[],
      hidden: boolean | string | null,
    ): void => {
      // El comando pide snapshot (el miembro no viaja en `applied`): la
      // proyección y el árbol de estructura se refrescan solos.
      void sendCommand({ cmd: 'setMemberVisibility', id: tablixId, axis, path, hidden });
    },
    [sendCommand],
  );

  /**
   * Propiedades del grupo (F2.b.2): el diálogo manda solo las secciones
   * cambiadas, cada una un comando (y un paso de undo). Los tres comandos piden
   * snapshot, así que la proyección y el árbol se refrescan solos.
   */
  const applyGroupProperties = useCallback(
    (commands: RdlcCommand[]): void => {
      for (const command of commands) void sendCommand(command);
    },
    [sendCommand],
  );

  const addRowGroup = useCallback(
    (tablixId: string, row: number, expression: string): void => {
      void sendCommand({ cmd: 'addRowGroup', id: tablixId, row, expression });
    },
    [sendCommand],
  );

  const addColumnGroup = useCallback(
    (tablixId: string, column: number, expression: string): void => {
      void sendCommand({ cmd: 'addColumnGroup', id: tablixId, column, expression });
    },
    [sendCommand],
  );

  const addRowToGroup = useCallback(
    (tablixId: string, row: number, groupPath: number[]): void => {
      void sendCommand({ cmd: 'addRowToGroup', id: tablixId, row, groupPath });
    },
    [sendCommand],
  );

  const addColumnToGroup = useCallback(
    (tablixId: string, column: number, groupPath: number[]): void => {
      void sendCommand({ cmd: 'addColumnToGroup', id: tablixId, column, groupPath });
    },
    [sendCommand],
  );

  const addRowOutsideGroup = useCallback(
    (tablixId: string, row: number, where: 'above' | 'below'): void => {
      void sendCommand({ cmd: 'addRowOutsideGroup', id: tablixId, row, where });
    },
    [sendCommand],
  );

  const addRowInsideGroup = useCallback(
    (tablixId: string, row: number, where: 'above' | 'below'): void => {
      void sendCommand({ cmd: 'addRowInsideGroup', id: tablixId, row, where });
    },
    [sendCommand],
  );

  const addTotalRow = useCallback(
    (tablixId: string, row: number, where: 'above' | 'below'): void => {
      // El dominio infiere los agregados (Sum/First) con el ámbito del grupo.
      void sendCommand({ cmd: 'addTotalRow', id: tablixId, row, where });
    },
    [sendCommand],
  );

  const deleteRowGroup = useCallback(
    (tablixId: string, axis: 'row' | 'column', path: number[]): void => {
      void sendCommand({ cmd: 'deleteRowGroup', id: tablixId, axis, path });
    },
    [sendCommand],
  );

  const setTablixFilters = useCallback(
    (tablixId: string, filters: TablixFilterDto[]): void => {
      // El bloque se reemplaza entero y pide snapshot (no hay item que parchear).
      void sendCommand({ cmd: 'setTablixFilters', id: tablixId, filters });
    },
    [sendCommand],
  );

  const setVisibility = useCallback(
    (hidden: boolean | string | null): void => {
      if (!selectedItem) return;
      const id = selectedItem.id;

      // Optimista: `null` = quitar la visibilidad declarada.
      updateProjection((projection) =>
        patchItem(projection, id, hidden === null ? { hidden: undefined } : { hidden }),
      );
      void sendCommand({ cmd: 'setVisibility', id, hidden });
    },
    [selectedItem, sendCommand, updateProjection],
  );

  const setImageOptions = useCallback(
    (patch: ImageOptionsPatch): void => {
      if (!selectedItem || selectedItem.kind !== 'image') return;
      const id = selectedItem.id;

      const next: Record<string, unknown> = { ...selectedItem };
      for (const [key, value] of Object.entries(patch)) {
        if (value === null) delete next[key];
        else if (value !== undefined) next[key] = value;
      }

      updateProjection((projection) => patchItem(projection, id, next));
      void sendCommand({ cmd: 'setImageOptions', id, ...patch });
    },
    [selectedItem, sendCommand, updateProjection],
  );

  const setRunText = useCallback(
    (p: number, r: number, value: string): void => {
      if (!selectedItem || selectedItem.kind !== 'textbox') return;
      const updated: TextboxDto = {
        ...selectedItem,
        paragraphs: selectedItem.paragraphs.map((paragraph, paragraphIndex) =>
          paragraphIndex === p
            ? {
                ...paragraph,
                runs: paragraph.runs.map((run, runIndex) =>
                  runIndex === r ? { ...run, value } : run,
                ),
              }
            : paragraph,
        ),
      };
      updateProjection((projection) => patchItem(projection, selectedItem.id, updated));
      void sendCommand({ cmd: 'setText', id: selectedItem.id, p, r, value });
    },
    [selectedItem, sendCommand, updateProjection],
  );

  /**
   * Etiqueta de diseñador de un run (`<Label>`, lo que BC pinta en lugar de la
   * expresión). `null` la quita. Se aplica con `setParagraphs` (un paso de undo
   * y byte-exacto, el mismo camino que el editor de texto).
   */
  const setRunLabel = useCallback(
    (p: number, r: number, label: string | null): void => {
      if (!selectedItem || selectedItem.kind !== 'textbox') return;
      const paragraphs = selectedItem.paragraphs.map((paragraph, paragraphIndex) =>
        paragraphIndex === p
          ? {
              ...paragraph,
              runs: paragraph.runs.map((run, runIndex) =>
                runIndex === r ? withLabel(run, label) : run,
              ),
            }
          : paragraph,
      );
      updateProjection((projection) =>
        patchItem(projection, selectedItem.id, { ...selectedItem, paragraphs }),
      );
      void sendCommand({ cmd: 'setParagraphs', id: selectedItem.id, paragraphs });
    },
    [selectedItem, sendCommand, updateProjection],
  );

  /* ---------------------- insertar / duplicar / eliminar ------------------ */

  /**
   * Texto mixto: reemplaza los párrafos del Textbox de una vez (un paso de
   * undo). La proyección nueva llega con el snapshot del comando.
   */
  const setParagraphs = useCallback(
    (id: string, paragraphs: ParagraphDto[]): void => {
      void sendCommand({ cmd: 'setParagraphs', id, paragraphs });
    },
    [sendCommand],
  );

  const insertAt = useCallback(
    (kind: NewItemSpec['kind'], hit: CanvasHit): void => {
      if (!doc) return;
      // El nombre lo elige el **backend** (su índice está siempre al día): así
      // dos inserciones seguidas no pueden chocar de nombre.
      void sendCommand({
        cmd: 'insertItem',
        scope: hit.scope,
        index: hit.index,
        item: insertSpecAt(kind, hit, doc.projection),
      }).then((result) => {
        if (!result?.ok || !result.id) return;
        setSelectedId(result.id);
        // El elemento nace fuera de la vista a veces: se trae a la vista y el
        // pie dice dónde quedó (hallazgo 7).
        setReveal({ id: result.id, nonce: Date.now(), sessionId: doc.sessionId });
        setStatus(
          t('app.status.inserted', {
            name: result.id,
            destination: insertDestinationLabel(hit.scope, t),
          }),
        );
      });
    },
    [doc, sendCommand, setSelectedId, setStatus, t],
  );

  const insertItem = useCallback(
    (kind: NewItemSpec['kind']): void => {
      if (!doc) return;
      // Con una celda seleccionada, el item nace dentro de la celda.
      if (selectedCell) {
        insertAt(kind, {
          scope: {
            kind: 'tablixCell',
            id: selectedCell.id,
            row: selectedCell.row,
            col: selectedCell.col,
          },
          index: 0,
          point: { x: 0.2, y: 0.2 },
        });
        return;
      }
      insertAt(kind, {
        scope: { kind: 'body' },
        index: doc.projection.page.body.items.length,
        point: { x: 2, y: 2 },
      });
    },
    [doc, insertAt, selectedCell],
  );

  const duplicateSelected = useCallback((): void => {
    // Con multiselección: todos los duplicados en un solo paso de undo y se
    // seleccionan los clones (el batch devuelve sus ids).
    if (selectedIds.length > 1) {
      flushNudge();
      void sendCommand({
        cmd: 'batch',
        commands: selectedIds.map((id) => ({ cmd: 'duplicateItem' as const, id })),
      }).then((result) => {
        if (result?.ok && result.ids && result.ids.length > 0) setSelectedIds(result.ids);
      });
      return;
    }
    if (!selectedItem) return;
    void sendCommand({ cmd: 'duplicateItem', id: selectedItem.id }).then((result) => {
      if (result?.ok && result.id) setSelectedId(result.id);
    });
  }, [flushNudge, selectedIds, selectedItem, sendCommand, setSelectedId, setSelectedIds]);

  const deleteSelected = useCallback((): void => {
    if (selectedItems.length === 0) return;
    flushNudge();
    // Multiselección (y rectángulo + hijos) en un solo `batch`: un solo paso de
    // undo y borrado atómico. La selección solo se limpia si el borrado fue
    // bien (BUG-39). Los hijos de un contenedor seleccionado se omiten: viajan
    // con él (BUG-35).
    const ids = topLevelIds(selectedItems, selectedIds);
    if (ids.length === 0) return;
    if (ids.length === 1) {
      void sendCommand({ cmd: 'deleteItem', id: ids[0]! }).then((result) => {
        if (result?.ok) setSelectedId(null);
      });
      return;
    }
    void sendCommand({
      cmd: 'batch',
      commands: ids.map((id) => ({ cmd: 'deleteItem' as const, id })),
    }).then((result) => {
      if (result?.ok) setSelectedIds([]);
    });
  }, [flushNudge, selectedIds, selectedItems, sendCommand, setSelectedId, setSelectedIds]);

  /* ------------------------------ portapapeles ---------------------------- */

  const copySelected = useCallback((): void => {
    const ids = selectedIds.length > 0 ? selectedIds : selectedItem ? [selectedItem.id] : [];
    if (!doc || ids.length === 0) return;
    void window.api.copy(doc.sessionId, ids).then((result) => {
      if (!result.ok) {
        setError(apiErrorMessage(result, translator, t('app.error.copy')));
        return;
      }
      markClipboard(doc.sessionId);
      setStatus(
        ids.length === 1
          ? t('app.status.copied', { name: ids[0]! })
          : t('app.status.copiedMany', { count: ids.length }),
      );
    });
  }, [doc, markClipboard, selectedIds, selectedItem, setError, setStatus, t, translator]);

  const cutSelected = useCallback((): void => {
    const ids = selectedIds.length > 0 ? selectedIds : selectedItem ? [selectedItem.id] : [];
    if (!doc || ids.length === 0) return;
    flushNudge();
    void window.api.cut(doc.sessionId, ids).then((result) => {
      if (!result.ok) {
        setError(apiErrorMessage(result, translator, t('app.error.cut')));
        return;
      }
      markClipboard(doc.sessionId);
      setSelectedIds([]);
      setStatus(
        ids.length === 1
          ? t('app.status.cut', { name: ids[0]! })
          : t('app.status.cutMany', { count: ids.length }),
      );
    });
  }, [
    doc,
    flushNudge,
    markClipboard,
    selectedIds,
    selectedItem,
    setError,
    setSelectedIds,
    setStatus,
    t,
    translator,
  ]);

  const pasteAt = useCallback(
    (scope: ScopeRef, index: number): void => {
      if (!doc) return;
      void window.api.paste(doc.sessionId, scope, index).then((result) => {
        if (!result.ok) {
          setError(apiErrorMessage(result, translator, t('app.error.paste')));
          return;
        }
        if (result.ids && result.ids.length > 0) setSelectedIds(result.ids);
        else if (result.id) setSelectedId(result.id);
        setStatus(
          result.ids && result.ids.length > 1
            ? t('app.status.pastedMany', { count: result.ids.length })
            : t('app.status.pasted', { name: result.id ?? '' }),
        );
      });
    },
    [doc, setError, setSelectedId, setSelectedIds, setStatus, t, translator],
  );

  /* --------------------------- página y código ---------------------------- */

  const setPageSize = useCallback(
    (width: Length, height: Length): void => {
      if (!doc) return;
      updateProjection((projection) => ({
        ...projection,
        page: { ...projection.page, width, height },
      }));
      void sendCommand({ cmd: 'setPageSize', width, height });
    },
    [doc, sendCommand, updateProjection],
  );

  const setPageMargins = useCallback(
    (margins: { top: Length; bottom: Length; left: Length; right: Length }): void => {
      if (!doc) return;
      updateProjection((projection) => ({
        ...projection,
        page: { ...projection.page, margins },
      }));
      void sendCommand({ cmd: 'setPageMargins', ...margins });
    },
    [doc, sendCommand, updateProjection],
  );

  // Bandas de página y cuerpo: la proyección se refresca con el snapshot del
  // comando (no hay un item que parchear de forma optimista).
  const setRegionHeight = useCallback(
    (region: 'pageHeader' | 'pageFooter' | 'body', height: Length): void => {
      void sendCommand({ cmd: 'setRegionHeight', region, height });
    },
    [sendCommand],
  );

  const setSectionWidth = useCallback(
    (width: Length): void => {
      void sendCommand({ cmd: 'setSectionWidth', width });
    },
    [sendCommand],
  );

  const setHeaderFooterOptions = useCallback(
    (
      region: 'pageHeader' | 'pageFooter',
      options: { printOnFirstPage?: boolean; printOnLastPage?: boolean },
    ): void => {
      void sendCommand({ cmd: 'setHeaderFooterOptions', region, ...options });
    },
    [sendCommand],
  );

  /** Inserta o quita la banda de página (el snapshot refresca el lienzo). */
  const setRegionPresent = useCallback(
    (region: 'pageHeader' | 'pageFooter', present: boolean): void => {
      void sendCommand({ cmd: 'setRegionPresent', region, present });
    },
    [sendCommand],
  );

  const setReportCode = useCallback(
    (code: string): void => {
      if (!doc) return;
      updateProjection((projection) => ({
        ...projection,
        meta: { ...projection.meta, code: { ...projection.meta.code, text: code } },
      }));
      void sendCommand({ cmd: 'setReportCode', code });
    },
    [doc, sendCommand, updateProjection],
  );

  /**
   * Redimensionar una columna/fila de la rejilla (separadores internos del
   * Tablix). No hay optimismo: el comando devuelve la proyección con la rejilla
   * nueva (`snapshotOut`).
   */
  const resizeColumn = useCallback(
    (id: string, column: number, width: Length): void => {
      void sendCommand({ cmd: 'resizeColumn', id, column, width });
    },
    [sendCommand],
  );

  const resizeRow = useCallback(
    (id: string, row: number, height: Length): void => {
      void sendCommand({ cmd: 'resizeRow', id, row, height });
    },
    [sendCommand],
  );

  /* ------------------------ estructura del Tablix ------------------------- */

  const addRow = useCallback(
    (id: string, row: number): void => {
      void sendCommand({ cmd: 'addRow', id, row });
    },
    [sendCommand],
  );

  const deleteRow = useCallback(
    (id: string, row: number): void => {
      void sendCommand({ cmd: 'deleteRow', id, row });
    },
    [sendCommand],
  );

  const addColumn = useCallback(
    (id: string, column: number): void => {
      void sendCommand({ cmd: 'addColumn', id, column });
    },
    [sendCommand],
  );

  const deleteColumn = useCallback(
    (id: string, column: number): void => {
      void sendCommand({ cmd: 'deleteColumn', id, column });
    },
    [sendCommand],
  );

  const deleteRows = useCallback(
    (id: string, rows: number[]): void => {
      void sendCommand({ cmd: 'deleteRows', id, rows });
    },
    [sendCommand],
  );

  const deleteColumns = useCallback(
    (id: string, columns: number[]): void => {
      void sendCommand({ cmd: 'deleteColumns', id, columns });
    },
    [sendCommand],
  );

  const mergeCells = useCallback(
    (id: string, row: number, col: number, rowSpan: number, colSpan: number): void => {
      void sendCommand({ cmd: 'mergeCells', id, row, col, rowSpan, colSpan });
    },
    [sendCommand],
  );

  const unmergeCells = useCallback(
    (id: string, row: number, col: number): void => {
      void sendCommand({ cmd: 'unmergeCells', id, row, col });
    },
    [sendCommand],
  );

  /* -------------------------------- paleta -------------------------------- */

  const selectAndReveal = useCallback(
    (id: string): void => {
      setSelectedId(id);
      if (doc) setReveal({ id, nonce: Date.now(), sessionId: doc.sessionId });
    },
    [doc, setSelectedId],
  );

  /** Esc: sube al contenedor (rectángulo o tabla) del item seleccionado. */
  const selectParent = useCallback((): void => {
    if (!doc) return;
    // Con una celda seleccionada, el contenedor es su Tablix.
    if (selectedCell) {
      setSelectedId(selectedCell.id);
      return;
    }
    if (!selectedId) return;
    const parent = findParentItemId(doc.projection, selectedId);
    setSelectedId(parent ?? null);
    if (parent) setReveal({ id: parent, nonce: Date.now(), sessionId: doc.sessionId });
  }, [doc, selectedCell, selectedId, setSelectedId]);

  return {
    selectedId,
    selectedIds,
    selectedItems,
    movableIds,
    selectedIsCellContent,
    selectedItem,
    setSelectedId,
    setSelectedIds,
    toggleItemSelection,
    selectedCell,
    setSelectedCell,
    selectCell,
    selectCellForContext,
    menuHit,
    showContextMenu,
    selectAndReveal,
    selectParent,
    // El pedido de "traer a la vista" no viaja entre pestañas: si es de otra
    // sesión (aún no consumido), se oculta a la que está delante.
    reveal: revealState && revealState.sessionId === sessionId ? revealState : null,
    flushNudge: () => flushRef.current(),
    nudge,
    moveTo,
    moveMany,
    moveItemToScope,
    setItemLocation,
    setItemSize,
    resizeItem,
    resizeMany,
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
    zOrder,
    setItemOptions,
    setItemPageBreak,
    setItemName,
    setVisibility,
    setMemberVisibility,
    applyGroupProperties,
    addRowToGroup,
    addColumnToGroup,
    addRowOutsideGroup,
    addRowInsideGroup,
    addTotalRow,
    addRowGroup,
    addColumnGroup,
    deleteRowGroup,
    setTablixFilters,
    setImageOptions,
    setRunText,
    setRunLabel,
    setParagraphs,
    insertItem,
    insertAt,
    duplicateSelected,
    deleteSelected,
    copySelected,
    cutSelected,
    pasteAt,
    hasClipboard: tabHasClipboard,
    setPageSize,
    setPageMargins,
    setRegionHeight,
    setSectionWidth,
    setHeaderFooterOptions,
    setRegionPresent,
    setReportCode,
    batchEdit,
  };
}
