import type {
  ItemDto,
  Length,
  NewItemSpec,
  ParagraphDto,
  ProjectionDto,
  RdlcCommand,
  ScopeRef,
  StyleDto,
  StylePatch,
  TextboxDto,
  TextRunDto,
} from '@rdlc-designer/contracts';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiErrorMessage } from '@/lib/errors';
import type { CanvasHit } from '@/lib/hit';
import { insertSpecAt } from '@/lib/insert';
import { cm, findItem, findParentItemId, isCellContent, patchItem, toCm } from '@/lib/projection';
import { hitSelectionCell, isCellInRange, isCellSelected, type SelectedCell } from '@/lib/tablix';
import type { DocumentCore } from './useDocumentCore';

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
  selectedItem: ItemDto | undefined;
  setSelectedId: (id: string | null) => void;
  /** Celda de Tablix seleccionada (independiente del item seleccionado). */
  selectedCell: SelectedCell | null;
  setSelectedCell: (cell: SelectedCell | null) => void;
  /** Selecciona una celda; `extend` amplía el rango (Shift) y `toggle` añade/quita (Ctrl). */
  selectCell: (cell: SelectedCell, extend?: boolean, toggle?: boolean) => void;
  /** Click derecho: conserva el rango si la celda ya estaba dentro. */
  selectCellForContext: (cell: SelectedCell) => void;
  /** Último hit del click derecho: destino del menú, "Insertar" y "Pegar". */
  menuHit: CanvasHit | null;
  /** Click derecho sobre el lienzo: fija el hit y ajusta la selección. */
  showContextMenu: (hit: CanvasHit) => void;
  /** Selecciona y pide al lienzo que traiga el elemento a la vista. */
  selectAndReveal: (id: string) => void;
  /** Sube un nivel en la jerarquía (Esc): selecciona el contenedor del item. */
  selectParent: () => void;
  reveal: { id: string; nonce: number } | null;

  /** Vacía la ráfaga de flechas pendiente (antes de borrar/undo, p. ej.). */
  flushNudge: () => void;
  nudge: (dxCm: number, dyCm: number) => void;
  moveItem: (id: string, top: Length, left: Length) => void;
  setItemLocation: (top: Length, left: Length) => void;
  setItemSize: (width: Length, height: Length) => void;
  /** Mueve y redimensiona a la vez (tiradores): un paso de undo. */
  resizeItem: (
    id: string,
    box: { top: Length; left: Length; width: Length; height: Length },
  ) => void;
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
  /** Inserta una fila de relleno fuera del grupo (`where` = borde). */
  addRowOutsideGroup: (tablixId: string, row: number, where: 'above' | 'below') => void;
  /** Inserta una fila de relleno dentro del grupo, pegada a la fila indicada. */
  addRowInsideGroup: (tablixId: string, row: number, where: 'above' | 'below') => void;
  /** Envuelve la fila en un grupo nuevo con esa expresión. */
  addRowGroup: (tablixId: string, row: number, expression: string) => void;
  /** Quita el grupo: las filas que cuelgan se quedan como filas estáticas. */
  deleteRowGroup: (tablixId: string, axis: 'row' | 'column', path: number[]) => void;
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

export function useItemEditing(core: DocumentCore): ItemEditing {
  const { doc, sendCommand, reconcile, updateProjection, setStatus, setError } = core;

  const [selectedIdState, setSelectedIdState] = useState<string | null>(null);
  const [selectedCellState, setSelectedCellState] = useState<SelectedCell | null>(null);
  const [reveal, setReveal] = useState<{ id: string; nonce: number } | null>(null);
  const [hasClipboard, setHasClipboard] = useState(false);

  /** Item y celda son excluyentes: seleccionar uno limpia el otro. */
  const setSelectedId = useCallback((id: string | null): void => {
    setSelectedCellState(null);
    setSelectedIdState(id);
  }, []);

  const setSelectedCell = useCallback((cell: SelectedCell | null): void => {
    setSelectedIdState(null);
    setSelectedCellState(cell);
  }, []);

  /** Shift amplía el rango desde el ancla; Ctrl añade/quita celdas sueltas. */
  const selectCell = useCallback((cell: SelectedCell, extend = false, toggle = false): void => {
    setSelectedIdState(null);
    setSelectedCellState((current) => {
      if (!current || current.id !== cell.id) {
        return {
          id: cell.id,
          row: cell.row,
          col: cell.col,
          ...(cell.endRow !== undefined ? { endRow: cell.endRow } : {}),
          ...(cell.endCol !== undefined ? { endCol: cell.endCol } : {}),
        };
      }

      if (toggle) {
        const extras = current.extra ?? [];
        const isExtra = extras.some((entry) => entry.row === cell.row && entry.col === cell.col);
        if (isExtra) {
          const next = extras.filter((entry) => entry.row !== cell.row || entry.col !== cell.col);
          return next.length > 0 ? { ...current, extra: next } : { ...current, extra: [] };
        }
        if (isCellInRange(cell, current)) return current;
        return { ...current, extra: [...extras, { row: cell.row, col: cell.col }] };
      }

      if (extend) {
        return {
          ...current,
          endRow: cell.endRow ?? cell.row,
          endCol: cell.endCol ?? cell.col,
        };
      }

      return {
        id: cell.id,
        row: cell.row,
        col: cell.col,
        ...(cell.endRow !== undefined ? { endRow: cell.endRow } : {}),
        ...(cell.endCol !== undefined ? { endCol: cell.endCol } : {}),
      };
    });
  }, []);

  /** Click derecho: si la celda ya forma parte de la selección, no la pierde. */
  const selectCellForContext = useCallback((cell: SelectedCell): void => {
    setSelectedIdState(null);
    setSelectedCellState((current) =>
      current && current.id === cell.id && isCellSelected(cell, current)
        ? current
        : { id: cell.id, row: cell.row, col: cell.col },
    );
  }, []);

  const selectedItemRaw = useMemo(
    () => (doc && selectedIdState ? findItem(doc.projection, selectedIdState) : undefined),
    [doc, selectedIdState],
  );

  // La selección solo vale si el item sigue existiendo (undo/redo, recarga,
  // borrado): se **deriva** en vez de sincronizarse con un efecto.
  const selectedId = selectedItemRaw ? selectedIdState : null;
  const selectedItem = selectedItemRaw;

  // La celda seleccionada tampoco sobrevive si su Tablix desaparece.
  const selectedCell = useMemo(
    () =>
      doc && selectedCellState && findItem(doc.projection, selectedCellState.id)
        ? selectedCellState
        : null,
    [doc, selectedCellState],
  );

  /* -------------------------- click derecho ------------------------------- */

  const [menuHit, setMenuHit] = useState<CanvasHit | null>(null);

  /**
   * Click derecho: si cae dentro de una selección de celdas del Tablix (el
   * rectángulo o las añadidas con Ctrl+click, en el tablix que sea de la cadena
   * de anidados), el rango manda y no se pierde (fusión / borrado en lote). Si
   * no, selecciona lo que hay debajo.
   */
  const showContextMenu = useCallback(
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

  /* --------------------- mover con flechas (1pt / 10pt) ------------------ */

  interface PendingMove {
    id: string;
    topCm: number;
    leftCm: number;
    timer: number;
  }

  const pendingMove = useRef<PendingMove | null>(null);

  const flushNudge = useCallback((): void => {
    const pending = pendingMove.current;
    if (!pending) return;
    pendingMove.current = null;
    window.clearTimeout(pending.timer);
    void sendCommand({
      cmd: 'setLocation',
      id: pending.id,
      top: cm(pending.topCm),
      left: cm(pending.leftCm),
    }).then((result) => reconcile(result?.ok ? result.applied : undefined));
  }, [reconcile, sendCommand]);

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
      if (!selectedItem) return;

      // El contenido directo de una celda está anclado: la celda fija su
      // posición (Report Builder tampoco deja moverlo).
      if (doc && isCellContent(doc.projection, selectedItem.id)) {
        setStatus('La celda fija el contenido: no se puede mover');
        return;
      }

      const id = selectedItem.id;
      const current = pendingMove.current;
      const pending: PendingMove =
        current && current.id === id
          ? current
          : {
              id,
              topCm: toCm(selectedItem.top),
              leftCm: toCm(selectedItem.left),
              timer: 0,
            };

      const nextTop = pending.topCm + dyCm;
      const nextLeft = pending.leftCm + dxCm;

      // Nada que mover (p. ej. ya está en el borde): no se envía nada.
      if (
        round4(nextTop) === round4(toCm(selectedItem.top)) &&
        round4(nextLeft) === round4(toCm(selectedItem.left))
      ) {
        return;
      }

      pending.topCm = nextTop;
      pending.leftCm = nextLeft;
      // Un temporizador por ráfaga (no se reinicia con cada tecla): mantén la
      // tecla pulsada = unos pocos comandos, no uno por repetición.
      if (pending.timer === 0) {
        pending.timer = window.setTimeout(() => flushRef.current(), NUDGE_BURST_MS);
      }
      pendingMove.current = pending;

      updateProjection((projection) =>
        patchItem(projection, id, { top: cm(pending.topCm), left: cm(pending.leftCm) }),
      );
    },
    [doc, selectedItem, setStatus, updateProjection],
  );

  /* --------------------------- geometría y estilo ------------------------- */

  const moveItem = useCallback(
    (id: string, top: Length, left: Length): void => {
      // Cualquier camino (drag, panel, atajos) respeta el anclaje de la celda.
      if (doc && isCellContent(doc.projection, id)) {
        setStatus('La celda fija el contenido: no se puede mover');
        return;
      }
      // Optimista: el lienzo ya movió el nodo; aquí se refleja en la proyección.
      updateProjection((projection) => patchItem(projection, id, { top, left }));
      void sendCommand({ cmd: 'setLocation', id, top, left }).then((result) =>
        reconcile(result?.ok ? result.applied : undefined),
      );
    },
    [doc, reconcile, sendCommand, setStatus, updateProjection],
  );

  const setItemLocation = useCallback(
    (top: Length, left: Length): void => {
      if (!selectedItem) return;
      moveItem(selectedItem.id, top, left);
    },
    [moveItem, selectedItem],
  );

  const setItemSize = useCallback(
    (width: Length, height: Length): void => {
      if (!selectedItem) return;
      const id = selectedItem.id;
      updateProjection((projection) => patchItem(projection, id, { width, height }));
      void sendCommand({ cmd: 'setSize', id, width, height }).then((result) =>
        reconcile(result?.ok ? result.applied : undefined),
      );
    },
    [reconcile, selectedItem, sendCommand, updateProjection],
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
      void sendCommand({ cmd: 'setBounds', id, ...box }).then((result) =>
        reconcile(result?.ok ? result.applied : undefined),
      );
    },
    [doc, reconcile, sendCommand, updateProjection],
  );

  const setItemStyle = useCallback(
    (patch: StylePatch): void => {
      if (!selectedItem) return;
      const id = selectedItem.id;

      // Optimista: aplica el parche; `null` = quitar la propiedad.
      // `padding` es anidado, así que se fusiona lado a lado (el parche de un
      // lado no debe borrar los demás).
      const nextStyle: StyleDto = { ...(selectedItem.style ?? {}) };
      const target = nextStyle as Record<string, unknown>;
      for (const [key, value] of Object.entries(patch)) {
        if (value === null) delete target[key];
        else if (value === undefined) continue;
        else if (key === 'padding') {
          target[key] = {
            ...((target[key] as Record<string, unknown> | undefined) ?? {}),
            ...(value as Record<string, unknown>),
          };
        } else target[key] = value;
      }

      updateProjection((projection) => patchItem(projection, id, { style: nextStyle }));
      void sendCommand({ cmd: 'setStyle', id, style: patch }).then((result) =>
        reconcile(result?.ok ? result.applied : undefined),
      );
    },
    [reconcile, selectedItem, sendCommand, updateProjection],
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

  const addRowToGroup = useCallback(
    (tablixId: string, row: number, groupPath: number[]): void => {
      void sendCommand({ cmd: 'addRowToGroup', id: tablixId, row, groupPath });
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

  const deleteRowGroup = useCallback(
    (tablixId: string, axis: 'row' | 'column', path: number[]): void => {
      void sendCommand({ cmd: 'deleteRowGroup', id: tablixId, axis, path });
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
      void sendCommand({ cmd: 'setVisibility', id, hidden }).then((result) =>
        reconcile(result?.ok ? result.applied : undefined),
      );
    },
    [reconcile, selectedItem, sendCommand, updateProjection],
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
      void sendCommand({ cmd: 'setImageOptions', id, ...patch }).then((result) =>
        reconcile(result?.ok ? result.applied : undefined),
      );
    },
    [reconcile, selectedItem, sendCommand, updateProjection],
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
        if (result?.ok && result.id) setSelectedId(result.id);
      });
    },
    [doc, sendCommand],
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
    if (!selectedItem) return;
    void sendCommand({ cmd: 'duplicateItem', id: selectedItem.id }).then((result) => {
      if (result?.ok && result.id) setSelectedId(result.id);
    });
  }, [selectedItem, sendCommand]);

  const deleteSelected = useCallback((): void => {
    if (!selectedItem) return;
    flushNudge();
    void sendCommand({ cmd: 'deleteItem', id: selectedItem.id }).then(() => setSelectedId(null));
  }, [flushNudge, selectedItem, sendCommand]);

  /* ------------------------------ portapapeles ---------------------------- */

  const copySelected = useCallback((): void => {
    if (!doc || !selectedItem) return;
    const id = selectedItem.id;
    void window.api.copy(doc.sessionId, id).then((result) => {
      if (!result.ok) {
        setError(apiErrorMessage(result, 'no se pudo copiar'));
        return;
      }
      setHasClipboard(true);
      setStatus(`Copiado: ${id}`);
    });
  }, [doc, selectedItem, setError, setStatus]);

  const cutSelected = useCallback((): void => {
    if (!doc || !selectedItem) return;
    const id = selectedItem.id;
    flushNudge();
    void window.api.cut(doc.sessionId, id).then((result) => {
      if (!result.ok) {
        setError(apiErrorMessage(result, 'no se pudo cortar'));
        return;
      }
      setHasClipboard(true);
      setSelectedId(null);
      setStatus(`Cortado: ${id}`);
    });
  }, [doc, flushNudge, selectedItem, setError, setStatus]);

  const pasteAt = useCallback(
    (scope: ScopeRef, index: number): void => {
      if (!doc) return;
      void window.api.paste(doc.sessionId, scope, index).then((result) => {
        if (!result.ok) {
          setError(apiErrorMessage(result, 'no se pudo pegar'));
          return;
        }
        if (result.id) setSelectedId(result.id);
        setStatus(`Pegado: ${result.id ?? ''}`);
      });
    },
    [doc, setError, setStatus],
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

  const selectAndReveal = useCallback((id: string): void => {
    setSelectedId(id);
    setReveal({ id, nonce: Date.now() });
  }, []);

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
    if (parent) setReveal({ id: parent, nonce: Date.now() });
  }, [doc, selectedCell, selectedId, setSelectedId]);

  return {
    selectedId,
    selectedItem,
    setSelectedId,
    selectedCell,
    setSelectedCell,
    selectCell,
    selectCellForContext,
    menuHit,
    showContextMenu,
    selectAndReveal,
    selectParent,
    reveal,
    flushNudge: () => flushRef.current(),
    nudge,
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
    setItemName,
    setVisibility,
    setMemberVisibility,
    applyGroupProperties,
    addRowToGroup,
    addRowOutsideGroup,
    addRowInsideGroup,
    addRowGroup,
    deleteRowGroup,
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
    hasClipboard,
    setPageSize,
    setPageMargins,
    setReportCode,
  };
}
