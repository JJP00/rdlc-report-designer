import type {
  ItemDto,
  Length,
  NewItemSpec,
  ScopeRef,
  StyleDto,
  StylePatch,
  TextboxDto,
} from '@rdlc-designer/contracts';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CanvasHit } from '@/lib/hit';
import { cm, findItem, patchItem, toCm } from '@/lib/projection';
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

/** Tamaño con el que nace cada item insertado. */
const NEW_ITEM_SIZES: Record<NewItemSpec['kind'], { width: Length; height: Length }> = {
  textbox: { width: { value: 5, unit: 'cm' }, height: { value: 1, unit: 'cm' } },
  rectangle: { width: { value: 5, unit: 'cm' }, height: { value: 1, unit: 'cm' } },
  line: { width: { value: 4, unit: 'cm' }, height: { value: 0, unit: 'cm' } },
  image: { width: { value: 3, unit: 'cm' }, height: { value: 2, unit: 'cm' } },
};

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
  /** Selecciona y pide al lienzo que traiga el elemento a la vista. */
  selectAndReveal: (id: string) => void;
  reveal: { id: string; nonce: number } | null;

  /** Vacía la ráfaga de flechas pendiente (antes de borrar/undo, p. ej.). */
  flushNudge: () => void;
  nudge: (dxCm: number, dyCm: number) => void;
  moveItem: (id: string, top: Length, left: Length) => void;
  setItemLocation: (top: Length, left: Length) => void;
  setItemSize: (width: Length, height: Length) => void;
  /** Mueve y redimensiona a la vez (tiradores): un paso de undo. */
  resizeItem: (id: string, box: { top: Length; left: Length; width: Length; height: Length }) => void;
  setItemStyle: (patch: StylePatch) => void;
  setImageOptions: (patch: ImageOptionsPatch) => void;
  setRunText: (p: number, r: number, value: string) => void;

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

export function useItemEditing(core: DocumentCore): ItemEditing {
  const { doc, sendCommand, reconcile, updateProjection, setStatus, setError } = core;

  const [selectedIdState, setSelectedId] = useState<string | null>(null);
  const [reveal, setReveal] = useState<{ id: string; nonce: number } | null>(null);
  const [hasClipboard, setHasClipboard] = useState(false);

  const selectedItemRaw = useMemo(
    () => (doc && selectedIdState ? findItem(doc.projection, selectedIdState) : undefined),
    [doc, selectedIdState],
  );

  // La selección solo vale si el item sigue existiendo (undo/redo, recarga,
  // borrado): se **deriva** en vez de sincronizarse con un efecto.
  const selectedId = selectedItemRaw ? selectedIdState : null;
  const selectedItem = selectedItemRaw;

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
    [selectedItem, updateProjection],
  );

  /* --------------------------- geometría y estilo ------------------------- */

  const moveItem = useCallback(
    (id: string, top: Length, left: Length): void => {
      // Optimista: el lienzo ya movió el nodo; aquí se refleja en la proyección.
      updateProjection((projection) => patchItem(projection, id, { top, left }));
      void sendCommand({ cmd: 'setLocation', id, top, left }).then((result) =>
        reconcile(result?.ok ? result.applied : undefined),
      );
    },
    [reconcile, sendCommand, updateProjection],
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

  /* ---------------------- insertar / duplicar / eliminar ------------------ */

  const insertAt = useCallback(
    (kind: NewItemSpec['kind'], hit: CanvasHit): void => {
      if (!doc) return;
      const size = NEW_ITEM_SIZES[kind];
      // El nombre lo elige el **backend** (su índice está siempre al día): así
      // dos inserciones seguidas no pueden chocar de nombre.
      void sendCommand({
        cmd: 'insertItem',
        scope: hit.scope,
        index: hit.index,
        item: {
          kind,
          top: cm(round4(hit.point.y)),
          left: cm(round4(hit.point.x)),
          width: size.width,
          height: size.height,
          ...(kind === 'textbox' ? { text: '' } : {}),
        },
      }).then((result) => {
        if (result?.ok && result.id) setSelectedId(result.id);
      });
    },
    [doc, sendCommand],
  );

  const insertItem = useCallback(
    (kind: NewItemSpec['kind']): void => {
      if (!doc) return;
      insertAt(kind, {
        scope: { kind: 'body' },
        index: doc.projection.page.body.items.length,
        point: { x: 2, y: 2 },
      });
    },
    [doc, insertAt],
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
        setError(`${result.code}: ${result.message ?? 'no se pudo copiar'}`);
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
        setError(`${result.code}: ${result.message ?? 'no se pudo cortar'}`);
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
          setError(`${result.code}: ${result.message ?? 'no se pudo pegar'}`);
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
      updateProjection((projection) => ({ ...projection, page: { ...projection.page, width, height } }));
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

  /* -------------------------------- paleta -------------------------------- */

  const selectAndReveal = useCallback((id: string): void => {
    setSelectedId(id);
    setReveal({ id, nonce: Date.now() });
  }, []);

  return {
    selectedId,
    selectedItem,
    setSelectedId,
    selectAndReveal,
    reveal,
    flushNudge: () => flushRef.current(),
    nudge,
    moveItem,
    setItemLocation,
    setItemSize,
    resizeItem,
    setItemStyle,
    setImageOptions,
    setRunText,
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
