import type { CommandResult, ItemDto, ProjectionDto, RdlcCommand } from '@rdlc-designer/contracts';
import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { setCompletionMeta } from '@/lib/completionMeta';
import { apiErrorMessage, hasErrorDetails, isPersistentErrorCode } from '@/lib/errors';
import {
  createSerialQueue,
  createSessionOps,
  QUEUED_OPERATION_STATUS,
  visibleBusyLabel,
} from '@/lib/fileOps';
import { patchItem } from '@/lib/projection';
import { loadTabUi, removeTabUi, saveTabUi } from '@/lib/tabUiStorage';
import { formatWindowTitle } from '@/lib/windowTitle';
import {
  activateTab,
  adoptSessions,
  applyConflictDetected,
  applyDirtyChanged,
  applyDocumentChanged,
  applyExternalReloadFailed,
  applyFileMissingChanged,
  applySavedEvent,
  applySessionClosed,
  CLOSED_STATUS,
  createTab,
  createWorkspace,
  createdStatus,
  closeTargets,
  cycleTab as cycleWorkspaceTab,
  EMPTY_TAB_UI,
  findTabByPath,
  IDLE_STATUS,
  markClipboard,
  moveTab as moveWorkspaceTab,
  normalizePath,
  openTab,
  openedStatus,
  patchTabProjection,
  RELOADED_STATUS,
  removeTab,
  updateTab,
  updateTabUi as patchTabUi,
  resolveTabUiPatch,
  type CloseScope,
  type TabState,
  type TabUiPatch,
  type TabUiState,
  type WorkspaceState,
} from '@/lib/workspace';
import {
  planWindowClose,
  saveAfterInFlight,
  saveTabsInOrder,
  type PendingIntent,
  type PendingResolution,
} from '@/lib/windowClose';

/**
 * Workspace de pestañas (fase MVP, bloque A): **única autoridad del front**
 * sobre qué hay abierto y qué pestaña está activa. Mantiene las sesiones del
 * backend como pestañas independientes (proyección, `dirty`, conflicto,
 * estado y errores por sesión) y enruta cada evento por su `sessionId`.
 *
 * La superficie que consumen los hooks de edición (`useItemEditing`,
 * `useEditorKeys`, `usePaletteActions`) y los diálogos es la de **la pestaña
 * activa**, con la misma forma que el antiguo `DocumentCore`.
 */

export interface OpenDocument {
  sessionId: string;
  path: string;
  projection: ProjectionDto;
}

/** Guarda de cierre (Bloque C): tipos y resolución viven en `lib/windowClose`. */
export type { PendingIntent, PendingResolution } from '@/lib/windowClose';

export interface WorkspaceCore {
  /** Documento de la pestaña activa (null sin pestañas). */
  doc: OpenDocument | null;
  /** Pestañas abiertas, en orden (la activa es `activeSessionId`). */
  tabs: TabState[];
  activeSessionId: string | null;
  /**
   * Estado de UI de la pestaña activa (selección, zoom, paneles). Con varias
   * pestañas sobrevive al cambio; sin ninguna, es el estado por defecto.
   */
  ui: TabUiState;
  /** false si no hay preload (renderer abierto en un navegador). */
  hasBackend: boolean;
  /** Estado de la pestaña activa (o del pie si no hay ninguna). */
  status: string;
  error: string | null;
  dirty: boolean;
  /**
   * La pestaña activa ya tiene algo copiado/cortado en **su** sesión: habilita
   * «Pegar» (el portapapeles del backend es por sesión, bloque E).
   */
  hasClipboard: boolean;
  /** Ruta del fichero que cambió por fuera mientras había cambios locales. */
  conflict: string | null;
  /** Ruta de la sesión activa que ya no existe en disco (null si existe). */
  fileMissing: string | null;
  /** Hay una operación de fichero en curso (abrir/crear/guardar, BUG-54). */
  busy: boolean;
  /** Nº de recargas externas de la pestaña activa. */
  reloads: number;
  /** Ficheros recientes (para el desplegable de «Abrir…»). */
  recents: string[];
  /** Intención en espera de que el usuario resuelva los cambios sin guardar. */
  pendingIntent: PendingIntent | null;

  setStatus: (message: string) => void;
  /**
   * Muestra (o borra con `null`) el aviso de error. `persistent` impide el
   * cierre automático: para errores que exigen una acción (BUG-57).
   */
  setError: (message: string | null, options?: { persistent?: boolean }) => void;
  /** Ejecuta un comando en la pestaña activa y reconcilia el optimismo. */
  sendCommand: (command: RdlcCommand, sessionId?: string) => Promise<CommandResult | undefined>;
  /** Actualiza la proyección de la pestaña activa de forma optimista. */
  updateProjection: (patch: (projection: ProjectionDto) => ProjectionDto) => void;
  /**
   * Actualiza el `ui` (selección, zoom, paneles) de la pestaña **activa**; si
   * el parche no cambia nada, no re-renderiza.
   */
  updateUi: (patch: Partial<TabUiState>) => void;
  /**
   * Actualiza el `ui` de una pestaña concreta: para respuestas diferidas que
   * deben escribir en la sesión que originó la acción, no en la activa. El
   * parche puede derivarse del estado actual (funcional) para no perder
   * actualizaciones concurrentes.
   */
  updateTabUi: (sessionId: string, patch: TabUiPatch) => void;
  /**
   * La sesión ya tiene algo en el portapapeles (copiar/cortar OK): habilita
   * «Pegar» **en su pestaña**, no en las demás (bloque E).
   */
  markClipboard: (sessionId: string) => void;

  /** Abrir… (pide ruta y abre una pestaña; nunca cierra la anterior). */
  open: () => void;
  /** Abrir una ruta concreta (recientes): activa su pestaña si ya estaba. */
  openPath: (path: string) => void;
  /** Abrir varias rutas (drag&drop): cada una su pestaña. */
  openPaths: (paths: string[]) => void;
  /** Nuevo… (pide ruta y escribe la plantilla). */
  createNew: () => void;
  /** Guardar la pestaña activa; `true` si se escribió. */
  save: () => Promise<boolean>;
  /** Guardar como… (pide ruta); `true` si se escribió. */
  saveAs: () => Promise<boolean>;
  /** Cerrar la pestaña activa (con guarda de cambios). */
  close: () => void;
  /** Cerrar una pestaña concreta (botón de la tira, con guarda). */
  closeTab: (sessionId: string) => void;
  /** Cierra varias pestañas desde `sessionId` (menú contextual), con guarda. */
  closeTabs: (scope: CloseScope, sessionId: string) => void;
  /** Activar una pestaña. */
  activateTab: (sessionId: string) => void;
  /** Rotar la pestaña activa (Ctrl+Tab). */
  cycleTab: (direction: 1 | -1) => void;
  /** Mueve una pestaña a la posición `toIndex` de la tira (reordenar). */
  moveTab: (sessionId: string, toIndex: number) => void;
  /** Mueve la pestaña activa una posición a la izquierda (-1) o derecha (1). */
  moveActiveTab: (direction: 1 | -1) => void;
  /** Recargar desde disco descartando lo local (conflicto). */
  reloadFromDisk: () => Promise<void>;
  /** Relee los ficheros recientes (tras abrir/guardar como). */
  refreshRecents: () => void;
  /** Resuelve la intención pendiente (diálogo de cambios sin guardar). */
  resolvePending: (resolution: PendingResolution) => void;

  undo: () => Promise<void>;
  redo: () => Promise<void>;
}

/** Tiempo que permanece visible un aviso de error (se borra solo). */
const ERROR_BANNER_MS = 6000;
/** Retardo antes de mostrar «Abriendo…/Guardando…» en el pie (BUG-54). */
const BUSY_STATUS_MS = 300;
/** Debounce de la escritura del `ui` por pestaña en sessionStorage. */
const UI_PERSIST_MS = 300;
/** Clave del error del pie cuando no hay ninguna pestaña. */
const WORKSPACE_ERROR_KEY = '__workspace__';

export function useWorkspace(): WorkspaceCore {
  const [state, setState] = useState<WorkspaceState>(createWorkspace);
  const stateRef = useRef(state);

  /** Todas las mutaciones pasan por aquí: el ref queda al día al instante. */
  const setWorkspace = useCallback(
    (updater: (current: WorkspaceState) => WorkspaceState): void => {
      setState((current) => {
        const next = updater(current);
        stateRef.current = next;
        return next;
      });
    },
    [],
  );

  const [workspaceStatus, setWorkspaceStatus] = useState(IDLE_STATUS);
  const [workspaceError, setWorkspaceErrorState] = useState<string | null>(null);
  const [recents, setRecents] = useState<string[]>([]);
  const [pendingIntent, setPendingIntent] = useState<PendingIntent | null>(null);

  /* ------------------------------- errores -------------------------------- */

  const errorTimers = useRef(new Map<string, number>());

  const clearErrorTimer = useCallback((key: string): void => {
    const timer = errorTimers.current.get(key);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      errorTimers.current.delete(key);
    }
  }, []);

  /** Error de UNA pestaña (aunque no sea la activa: errores por sesión). */
  const setTabError = useCallback(
    (sessionId: string, message: string | null, options?: { persistent?: boolean }): void => {
      clearErrorTimer(sessionId);
      setWorkspace((current) =>
        current.tabs.has(sessionId) ? updateTab(current, sessionId, { error: message }) : current,
      );
      if (message && !options?.persistent && !hasErrorDetails(message)) {
        const timer = window.setTimeout(() => {
          errorTimers.current.delete(sessionId);
          setWorkspace((current) => {
            const tab = current.tabs.get(sessionId);
            return tab?.error === message ? updateTab(current, sessionId, { error: null }) : current;
          });
        }, ERROR_BANNER_MS);
        errorTimers.current.set(sessionId, timer);
      }
    },
    [clearErrorTimer, setWorkspace],
  );

  /** Error del pie sin pestaña asociada (p. ej. abrir un fichero que falla). */
  const setWorkspaceError = useCallback(
    (message: string | null, options?: { persistent?: boolean }): void => {
      clearErrorTimer(WORKSPACE_ERROR_KEY);
      setWorkspaceErrorState(message);
      if (message && !options?.persistent && !hasErrorDetails(message)) {
        const timer = window.setTimeout(() => {
          errorTimers.current.delete(WORKSPACE_ERROR_KEY);
          setWorkspaceErrorState((current) => (current === message ? null : current));
        }, ERROR_BANNER_MS);
        errorTimers.current.set(WORKSPACE_ERROR_KEY, timer);
      }
    },
    [clearErrorTimer],
  );

  const setError = useCallback(
    (message: string | null, options?: { persistent?: boolean }): void => {
      const sessionId = stateRef.current.activeSessionId;
      if (message === null) {
        setWorkspaceError(null);
        if (sessionId !== null) setTabError(sessionId, null);
        return;
      }
      if (sessionId !== null && stateRef.current.tabs.has(sessionId)) {
        setTabError(sessionId, message, options);
      } else {
        setWorkspaceError(message, options);
      }
    },
    [setTabError, setWorkspaceError],
  );

  const setStatus = useCallback(
    (message: string): void => {
      const sessionId = stateRef.current.activeSessionId;
      if (sessionId !== null && stateRef.current.tabs.has(sessionId)) {
        setWorkspace((current) => updateTab(current, sessionId, { status: message }));
      } else {
        setWorkspaceStatus(message);
      }
    },
    [setWorkspace],
  );

  useEffect(
    () => () => {
      for (const timer of errorTimers.current.values()) window.clearTimeout(timer);
      errorTimers.current.clear();
    },
    [],
  );

  /* ------------------------- guarda de operaciones ------------------------ */

  /** Operación de fichero en curso (abrir/crear: `sessionId` null; guardar: su pestaña). */
  interface ActiveOperation {
    id: number;
    sessionId: string | null;
    label: string;
    /** La etiqueta solo se enseña pasados ~300 ms (operaciones rápidas no parpadean). */
    shown: boolean;
  }
  const [operations, setOperations] = useState<ActiveOperation[]>([]);
  const operationTimers = useRef(new Map<number, number>());
  const operationSeq = useRef(0);
  /** Guarda POR SESIÓN de guardar/guardar como: una pestaña no bloquea a otra. */
  const sessionOps = useRef(createSessionOps());
  /** Cola secuencial de abrir/crear: lo que llega con una apertura en curso se encola. */
  const openQueue = useRef(createSerialQueue());

  /**
   * Registra una operación visible en el pie (con aviso diferido, BUG-54).
   * Devuelve la función que la termina.
   */
  const beginOperation = useCallback((sessionId: string | null, label: string): (() => void) => {
    operationSeq.current += 1;
    const id = operationSeq.current;
    setOperations((current) => [...current, { id, sessionId, label, shown: false }]);
    operationTimers.current.set(
      id,
      window.setTimeout(() => {
        operationTimers.current.delete(id);
        setOperations((current) => current.map((op) => (op.id === id ? { ...op, shown: true } : op)));
      }, BUSY_STATUS_MS),
    );
    return () => {
      const timer = operationTimers.current.get(id);
      if (timer !== undefined) {
        window.clearTimeout(timer);
        operationTimers.current.delete(id);
      }
      setOperations((current) => current.filter((op) => op.id !== id));
    };
  }, []);

  const busy = operations.length > 0;
  const busyLabel = visibleBusyLabel(
    operations.filter((op) => op.shown),
    state.activeSessionId,
  );

  useEffect(
    () => () => {
      for (const timer of operationTimers.current.values()) window.clearTimeout(timer);
      operationTimers.current.clear();
    },
    [],
  );

  // Sin preload (p. ej. abriendo el renderer en un navegador) no hay backend IPC.
  const hasBackend = typeof window !== 'undefined' && window.api !== undefined;

  /* ------------------------------- recents -------------------------------- */

  const refreshRecents = useCallback((): void => {
    if (!hasBackend || typeof window.api.recentFiles !== 'function') return;
    void window.api
      .recentFiles()
      .then((result) => setRecents(result.files))
      .catch(() => setRecents([]));
  }, [hasBackend]);

  const refreshRecentsRef = useRef(refreshRecents);
  useEffect(() => {
    refreshRecentsRef.current = refreshRecents;
  }, [refreshRecents]);

  useEffect(() => {
    refreshRecents();
  }, [refreshRecents]);

  /* ------------------------------ fichero --------------------------------- */

  /**
   * Abre una ruta en una pestaña nueva (o activa la existente, anti-duplicados,
   * también en recents y drag&drop). Devuelve `true` si abrió una sesión nueva.
   * Nunca cierra la sesión anterior. No lleva guarda de operación: la ejercen
   * `openPaths` y `createNew` en bloque.
   */
  const openOne = useCallback(
    async (path: string): Promise<boolean> => {
      const existing = findTabByPath(stateRef.current, path);
      if (existing !== undefined) {
        setWorkspace((current) => activateTab(current, existing));
        return false;
      }
      const result = await window.api.openFile(path);
      if (!result.ok) {
        setWorkspaceError(apiErrorMessage(result, 'error al abrir'), {
          persistent: isPersistentErrorCode(result.code),
        });
        return false;
      }
      setWorkspace((current) =>
        openTab(
          current,
          createTab({
            sessionId: result.sessionId,
            path,
            projection: result.projection,
            status: openedStatus(path),
          }),
        ),
      );
      return true;
    },
    [setWorkspace, setWorkspaceError],
  );

  // `openOne` es estable, pero se mantiene un ref para no re-suscribir el
  // arranque si alguna vez dejara de serlo.
  const openOneRef = useRef(openOne);
  useEffect(() => {
    openOneRef.current = openOne;
  }, [openOne]);

  /** Abre varias rutas de una vez (drag&drop): cada fichero válido, su pestaña. */
  const openPaths = useCallback(
    (paths: string[]): void => {
      if (paths.length === 0) return;
      const started = openQueue.current.enqueue(async () => {
        const endOperation = beginOperation(null, 'Abriendo…');
        try {
          setWorkspaceError(null);
          const activeId = stateRef.current.activeSessionId;
          if (activeId !== null) setTabError(activeId, null);

          const seen = new Set<string>();
          let opened = false;
          for (const path of paths) {
            const key = normalizePath(path);
            if (seen.has(key)) continue;
            seen.add(key);
            if (await openOne(path)) opened = true;
          }
          if (opened) refreshRecentsRef.current();
        } finally {
          endOperation();
        }
      });
      // Nada de retornos silenciosos: si hay una apertura en curso, la nueva se
      // encola (se hará a continuación) y el pie lo dice.
      if (!started) setStatus(QUEUED_OPERATION_STATUS);
    },
    [beginOperation, openOne, setStatus, setTabError, setWorkspaceError],
  );

  const openPath = useCallback(
    (path: string): void => {
      openPaths([path]);
    },
    [openPaths],
  );

  const open = useCallback((): void => {
    void window.api.pickFile().then((picked) => {
      if (!picked.ok || !picked.path) return;
      openPaths([picked.path]);
    });
  }, [openPaths]);

  /** Nuevo: pide ruta, escribe la plantilla en blanco y la abre en su pestaña. */
  const createNew = useCallback((): void => {
    const job = async (): Promise<void> => {
      const endOperation = beginOperation(null, 'Creando…');
      try {
        setWorkspaceError(null);
        const picked = await window.api.pickSavePath('Nuevo informe.rdlc');
        if (!picked.ok || !picked.path) return;
        const path = picked.path;

        // Anti-duplicados: si esa ruta ya está abierta, se activa (nunca se
        // escribe la plantilla encima de un documento abierto).
        const existing = findTabByPath(stateRef.current, path);
        if (existing !== undefined) {
          setWorkspace((current) => activateTab(current, existing));
          return;
        }
        const result = await window.api.createNew(path);
        if (!result.ok) {
          setWorkspaceError(apiErrorMessage(result, 'no se pudo crear el informe'), {
            persistent: isPersistentErrorCode(result.code),
          });
          return;
        }
        setWorkspace((current) =>
          openTab(
            current,
            createTab({
              sessionId: result.sessionId,
              path,
              projection: result.projection,
              status: createdStatus(path),
            }),
          ),
        );
        refreshRecentsRef.current();
      } finally {
        endOperation();
      }
    };
    if (!openQueue.current.enqueue(job)) setStatus(QUEUED_OPERATION_STATUS);
  }, [beginOperation, setStatus, setWorkspace, setWorkspaceError]);

  /** Cuerpo del guardado (sin guarda): lo ejecuta `saveTab` bajo la guarda por sesión. */
  const runSave = useCallback(
    async (sessionId: string): Promise<boolean> => {
      const tab = stateRef.current.tabs.get(sessionId);
      if (!tab) return false;
      const endOperation = beginOperation(sessionId, 'Guardando…');
      try {
        setWorkspaceError(null);
        setTabError(sessionId, null);
        const result = await window.api.save(sessionId);
        if (!stateRef.current.tabs.has(sessionId)) return false;
        if (!result.ok) {
          // El backend rechazó pisar un cambio externo que no llegó a detectar:
          // se abre el diálogo de conflicto para que el usuario decida (BUG-52).
          if (result.code === 'E_CONFLICT') {
            setWorkspace((current) => updateTab(current, sessionId, { conflict: tab.path }));
          }
          setTabError(sessionId, apiErrorMessage(result, 'error al guardar'), {
            persistent: isPersistentErrorCode(result.code),
          });
          return false;
        }
        const saved = result.bytesIdentical
          ? `Guardado — bytes idénticos al original ✓ (${result.path})`
          : `Guardado: ${result.path}`;
        // El aviso no bloqueante del backend (p. ej. watcher no montado, BUG-56)
        // se suma al estado del guardado.
        setWorkspace((current) =>
          updateTab(current, sessionId, {
            conflict: null,
            fileMissing: null,
            status: result.warning ? `${saved} — ${result.warning}` : saved,
          }),
        );
        return true;
      } finally {
        endOperation();
      }
    },
    [beginOperation, setTabError, setWorkspace, setWorkspaceError],
  );

  /** Guardar: `true` si se escribió (para encadenar «guardar y …»). */
  const saveTab = useCallback(
    async (sessionId: string): Promise<boolean> => {
      if (!stateRef.current.tabs.has(sessionId)) return false;
      // Guarda por sesión: si ya hay una operación en esta pestaña se encadena
      // detrás (no se descarta); otras pestañas no se ven afectadas.
      return sessionOps.current.run(sessionId, 'save', () => runSave(sessionId));
    },
    [runSave],
  );

  const save = useCallback((): Promise<boolean> => {
    const sessionId = stateRef.current.activeSessionId;
    return sessionId === null ? Promise.resolve(false) : saveTab(sessionId);
  }, [saveTab]);

  /** Guardar como: pide ruta y la sesión pasa a apuntar ahí (clave del anti-duplicados). */
  const runSaveAs = useCallback(
    async (sessionId: string): Promise<boolean> => {
      const tab = stateRef.current.tabs.get(sessionId);
      if (!tab) return false;
      const endOperation = beginOperation(sessionId, 'Guardando…');
      try {
        setWorkspaceError(null);
        setTabError(sessionId, null);
        const picked = await window.api.pickSavePath(tab.path);
        if (!picked.ok || !picked.path) return false;
        // Anti-duplicados (invariante de la fase): dos pestañas no pueden
        // apuntar a la misma ruta (el backend lo permitiría). Se detecta
        // **antes** de llamar a la API y se aborta el guardado con un aviso
        // persistente en la pestaña que lo intentó; comparación normalizada
        // (case-insensitive en Windows) con `findTabByPath`.
        const otherSessionId = findTabByPath(stateRef.current, picked.path);
        if (otherSessionId !== undefined && otherSessionId !== sessionId) {
          const otherPath = stateRef.current.tabs.get(otherSessionId)?.path ?? picked.path;
          setTabError(sessionId, `Esa ruta ya está abierta en otra pestaña: ${otherPath}`, {
            persistent: true,
          });
          return false;
        }
        const result = await window.api.saveAs(sessionId, picked.path);
        if (!stateRef.current.tabs.has(sessionId)) return false;
        if (!result.ok) {
          setTabError(sessionId, apiErrorMessage(result, 'error al guardar'), {
            persistent: isPersistentErrorCode(result.code),
          });
          return false;
        }
        const saved = `Guardado como: ${result.path}`;
        setWorkspace((current) =>
          updateTab(current, sessionId, {
            path: result.path,
            conflict: null,
            fileMissing: null,
            status: result.warning ? `${saved} — ${result.warning}` : saved,
          }),
        );
        refreshRecentsRef.current();
        return true;
      } finally {
        endOperation();
      }
    },
    [beginOperation, setTabError, setWorkspace, setWorkspaceError],
  );

  const saveAsTab = useCallback(
    async (sessionId: string): Promise<boolean> => {
      if (!stateRef.current.tabs.has(sessionId)) return false;
      return sessionOps.current.run(sessionId, 'saveAs', () => runSaveAs(sessionId));
    },
    [runSaveAs],
  );

  const saveAs = useCallback((): Promise<boolean> => {
    const sessionId = stateRef.current.activeSessionId;
    return sessionId === null ? Promise.resolve(false) : saveAsTab(sessionId);
  }, [saveAsTab]);

  /** Recargar desde disco descartando los cambios locales (conflicto). */
  const reloadTab = useCallback(
    async (sessionId: string): Promise<void> => {
      const tab = stateRef.current.tabs.get(sessionId);
      if (!tab) return;
      setTabError(sessionId, null);
      const result = await window.api.reloadFile(sessionId);
      if (!stateRef.current.tabs.has(sessionId)) return;
      if (!result.ok) {
        setTabError(sessionId, apiErrorMessage(result, 'no se pudo recargar'), {
          persistent: isPersistentErrorCode(result.code),
        });
        return;
      }
      setWorkspace((current) =>
        updateTab(current, sessionId, {
          projection: result.projection,
          dirty: false,
          conflict: null,
          fileMissing: null,
          status: RELOADED_STATUS,
          // El backend descarta el documento local al recargar: su portapapeles
          // (nodos del árbol viejo) también se va.
          hasClipboard: false,
        }),
      );
    },
    [setTabError, setWorkspace],
  );

  const reloadFromDisk = useCallback(async (): Promise<void> => {
    const sessionId = stateRef.current.activeSessionId;
    if (sessionId !== null) await reloadTab(sessionId);
  }, [reloadTab]);

  /* ------------------------------- cerrar ---------------------------------- */

  /** Cierra la sesión de verdad (las guardas ya se resolvieron). */
  const closeTabNow = useCallback(
    async (sessionId: string): Promise<void> => {
      const result = await window.api.close(sessionId, true);
      if (!stateRef.current.tabs.has(sessionId)) return;
      if (!result.ok) {
        // `force: true`: el backend cierra sin pedir confirmación, así que
        // `needsConfirmation` es inalcanzable en este camino; un fallo real
        // (E_IO…) siempre trae `code`. La rama estrecha el tipo.
        if ('code' in result) {
          setTabError(sessionId, apiErrorMessage(result, 'no se pudo cerrar'), {
            persistent: isPersistentErrorCode(result.code),
          });
        }
        return;
      }
      const remaining = stateRef.current.order.filter((id) => id !== sessionId).length;
      setWorkspace((current) => removeTab(current, sessionId));
      // Cerrar la última pestaña deja el editor vacío, no cierra la ventana.
      if (remaining === 0) setWorkspaceStatus(CLOSED_STATUS);
    },
    [setTabError, setWorkspace],
  );

  /** Cerrar una pestaña: con cambios sin guardar, guarda scoped a esa pestaña. */
  const requestCloseTab = useCallback(
    (sessionId: string): void => {
      const tab = stateRef.current.tabs.get(sessionId);
      if (!tab) return;
      if (tab.dirty) {
        setWorkspace((current) => activateTab(current, sessionId));
        setPendingIntent({ kind: 'close', sessionId, path: tab.path });
        return;
      }
      void closeTabNow(sessionId);
    },
    [closeTabNow, setWorkspace],
  );

  /**
   * Cierre múltiple (menú contextual de la tira). Si no hay sucias entre las
   * afectadas se cierran sin preguntar; con una sola pestaña sucia y sola, la
   * guarda de siempre; con varias, «Guardar todas / Descartar todas / Cancelar»
   * y no se cierra nada hasta resolverlo (atómico: Cancelar no deja huecos).
   */
  const requestCloseTabs = useCallback(
    (scope: CloseScope, anchorId: string): void => {
      const current = stateRef.current;
      const targets = closeTargets(current, scope, anchorId);
      if (targets.length === 0) return;
      if (targets.length === 1) {
        requestCloseTab(targets[0]!);
        return;
      }
      const dirty = targets.flatMap((id) => {
        const tab = current.tabs.get(id);
        return tab?.dirty ? [{ sessionId: id, path: tab.path }] : [];
      });
      if (dirty.length === 0) {
        void (async () => {
          for (const id of targets) await closeTabNow(id);
        })();
        return;
      }
      setWorkspace((state) => activateTab(state, dirty[0]!.sessionId));
      setPendingIntent({ kind: 'closeMany', tabs: dirty, targets });
    },
    [closeTabNow, requestCloseTab, setWorkspace],
  );

  const close = useCallback((): void => {
    const sessionId = stateRef.current.activeSessionId;
    if (sessionId !== null) requestCloseTab(sessionId);
  }, [requestCloseTab]);

  /* ------------------------- activar / rotar pestañas ---------------------- */

  const activate = useCallback(
    (sessionId: string): void => {
      setWorkspace((current) => activateTab(current, sessionId));
    },
    [setWorkspace],
  );

  const cycle = useCallback(
    (direction: 1 | -1): void => {
      setWorkspace((current) => cycleWorkspaceTab(current, direction));
    },
    [setWorkspace],
  );

  const move = useCallback(
    (sessionId: string, toIndex: number): void => {
      setWorkspace((current) => moveWorkspaceTab(current, sessionId, toIndex));
    },
    [setWorkspace],
  );

  const moveActive = useCallback(
    (direction: 1 | -1): void => {
      setWorkspace((current) => {
        const id = current.activeSessionId;
        if (id === null) return current;
        return moveWorkspaceTab(current, id, current.order.indexOf(id) + direction);
      });
    },
    [setWorkspace],
  );

  /**
   * Guardado previo a cerrar: si la pestaña ya está guardando, ESPERA a esa
   * operación (y re-guarda si quedó sucia); si la operación en curso falla, el
   * cierre se cancela y la pestaña conserva su error.
   */
  const saveTabForClose = useCallback(
    (sessionId: string): Promise<boolean> =>
      saveAfterInFlight(
        sessionOps.current.pending(sessionId),
        () => stateRef.current.tabs.get(sessionId)?.dirty ?? false,
        () => saveTab(sessionId),
      ),
    [saveTab],
  );

  /* ------------------------ guardas de trabajo sin guardar ------------------ */

  /**
   * Resolución del diálogo de cambios sin guardar. Cerrar una pestaña guarda
   * solo esa. El cierre de ventana con **una** sucia usa la guarda de una
   * pestaña; con **varias**, «Guardar todas» guarda en orden y aborta al primer
   * fallo (esa pestaña queda activa con su error), «Descartar todas» no guarda
   * nada y ambos confirman el cierre **una sola vez**, cuando no queda trabajo.
   */
  const resolvePending = useCallback(
    (resolution: PendingResolution): void => {
      if (!pendingIntent) return;

      if (pendingIntent.kind === 'close') {
        if (resolution === 'cancel') {
          setPendingIntent(null);
          return;
        }
        if (resolution === 'save') {
          // Si el guardado falla (p. ej. validación), el diálogo sigue abierto:
          // no se pierde el trabajo y el usuario puede corregir.
          void saveTabForClose(pendingIntent.sessionId).then((ok) => {
            if (!ok) return;
            setPendingIntent(null);
            void closeTabNow(pendingIntent.sessionId);
          });
          return;
        }
        setPendingIntent(null);
        void closeTabNow(pendingIntent.sessionId);
        return;
      }

      if (pendingIntent.kind === 'windowClose') {
        const { sessionId } = pendingIntent;
        setPendingIntent(null);
        if (resolution === 'cancel') return;
        if (resolution === 'discard') {
          void window.api.confirmWindowClose(true);
          return;
        }
        // Un fallo cancela el cierre: esa pestaña queda activa con su error.
        void saveTabForClose(sessionId).then((ok) => {
          if (ok) void window.api.confirmWindowClose(true);
        });
        return;
      }

      if (pendingIntent.kind === 'closeMany') {
        const { tabs, targets } = pendingIntent;
        if (resolution === 'cancel') {
          setPendingIntent(null);
          return;
        }
        const closeAll = async (): Promise<void> => {
          for (const id of targets) await closeTabNow(id);
        };
        if (resolution === 'discard') {
          setPendingIntent(null);
          void closeAll();
          return;
        }
        // Guardar todas: al primer fallo no se cierra nada y esa pestaña queda
        // activa con su error (el diálogo se cierra para poder verlo).
        setPendingIntent(null);
        void (async () => {
          const outcome = await saveTabsInOrder(
            tabs,
            (sessionId) => stateRef.current.tabs.has(sessionId),
            saveTabForClose,
          );
          if (outcome.ok) await closeAll();
          else setWorkspace((state) => activateTab(state, outcome.failed.sessionId));
        })();
        return;
      }

      // windowCloseAll: guardar todas en orden o descartar todas.
      const { tabs } = pendingIntent;
      setPendingIntent(null);
      if (resolution === 'cancel') return;
      if (resolution === 'discard') {
        void window.api.confirmWindowClose(true);
        return;
      }
      void (async () => {
        const outcome = await saveTabsInOrder(
          tabs,
          (sessionId) => stateRef.current.tabs.has(sessionId),
          saveTabForClose,
        );
        if (outcome.ok) {
          // `confirmWindowClose(true)` se llama una sola vez, ya sin trabajo.
          void window.api.confirmWindowClose(true);
          return;
        }
        // Al primer fallo se cancela el cierre y la pestaña que falló queda
        // activa con su error visible.
        setWorkspace((current) => activateTab(current, outcome.failed.sessionId));
      })();
    },
    [closeTabNow, pendingIntent, saveTabForClose, setWorkspace],
  );

  // El SO quiere cerrar la ventana: sin sucias se confirma directamente; con
  // una o varias se abre la guarda correspondiente (una sola vez).
  const onWindowCloseRequested = useEffectEvent((): void => {
    const current = stateRef.current;
    const tabs = current.order.flatMap((sessionId) => {
      const tab = current.tabs.get(sessionId);
      return tab ? [tab] : [];
    });
    const plan = planWindowClose(tabs);
    if (plan.kind === 'confirm') {
      void window.api.confirmWindowClose(true);
      return;
    }
    if (plan.intent.kind === 'windowClose') {
      const { sessionId } = plan.intent;
      setWorkspace((state) => activateTab(state, sessionId));
    }
    setPendingIntent(plan.intent);
  });

  /* ------------------------------- eventos -------------------------------- */

  useEffect(() => {
    if (!hasBackend) return;
    // Guarda para preloads antiguos en dev (requiere reinicio al cambiar el preload).
    if (typeof window.api.consumePendingOpen !== 'function') return;

    let cancelled = false;
    void (async () => {
      try {
        const pending = await window.api.consumePendingOpen();
        if (cancelled) return;
        if (!pending.path) {
          // Sin fichero pendiente, el renderer viene de recargar la interfaz
          // (o de un arranque en caliente): se re-adoptan **todas** las
          // sesiones vivas del backend como pestañas (BUG-51).
          if (typeof window.api.listSessions !== 'function') return;
          const listed = await window.api.listSessions();
          if (cancelled || !listed.ok || listed.sessions.length === 0) return;
          setWorkspace((current) => adoptSessions(current, listed.sessions, loadTabUi));
          return;
        }
        await openOneRef.current(pending.path);
        if (!cancelled) refreshRecentsRef.current();
      } catch (error) {
        if (!cancelled) setWorkspaceError(error instanceof Error ? error.message : String(error));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [hasBackend, setWorkspace, setWorkspaceError]);

  useEffect(() => {
    if (!hasBackend) return;

    const offDocument = window.api.onDocumentChanged((event) =>
      setWorkspace((current) => applyDocumentChanged(current, event)),
    );
    const offDirty = window.api.onDirtyChanged((event) =>
      setWorkspace((current) => applyDirtyChanged(current, event)),
    );
    const offConflict =
      typeof window.api.onConflictDetected === 'function'
        ? window.api.onConflictDetected((event) =>
            setWorkspace((current) => applyConflictDetected(current, event)),
          )
        : () => {};
    const offFileMissing =
      typeof window.api.onFileMissingChanged === 'function'
        ? window.api.onFileMissingChanged((event) =>
            setWorkspace((current) => applyFileMissingChanged(current, event)),
          )
        : () => {};
    const offReloadFailed =
      typeof window.api.onExternalReloadFailed === 'function'
        ? window.api.onExternalReloadFailed((event) =>
            setWorkspace((current) => applyExternalReloadFailed(current, event)),
          )
        : () => {};
    const offSaved =
      typeof window.api.onSaved === 'function'
        ? window.api.onSaved((event) =>
            setWorkspace((current) => applySavedEvent(current, event)),
          )
        : () => {};
    const offClosed =
      typeof window.api.onSessionClosed === 'function'
        ? window.api.onSessionClosed((event) =>
            setWorkspace((current) => applySessionClosed(current, event)),
          )
        : () => {};

    return () => {
      offDocument();
      offDirty();
      offConflict();
      offFileMissing();
      offReloadFailed();
      offSaved();
      offClosed();
    };
  }, [hasBackend, setWorkspace]);

  useEffect(() => {
    if (!hasBackend || typeof window.api.onCloseRequested !== 'function') return;
    return window.api.onCloseRequested(() => {
      // El renderer está vivo y va a decidir: cancela el vigilante del main
      // (sin esto, a los ~2 s saldría el diálogo nativo de cierre, BUG-51).
      if (typeof window.api.acknowledgeCloseRequest === 'function') {
        void window.api.acknowledgeCloseRequest();
      }
      onWindowCloseRequested();
    });
  }, [hasBackend]);

  /* ------------------------------ comandos -------------------------------- */

  const resyncProjection = useCallback(
    async (sessionId: string): Promise<void> => {
      // Preload antiguo en dev: sin canal, no hay nada que hacer.
      if (typeof window.api.readProjection !== 'function') return;
      const result = await window.api.readProjection(sessionId);
      if (!result.ok) return;
      setWorkspace((current) => patchTabProjection(current, sessionId, () => result.projection));
    },
    [setWorkspace],
  );

  const sendCommand = useCallback(
    async (command: RdlcCommand, sessionId?: string): Promise<CommandResult | undefined> => {
      // Por defecto, la pestaña activa; los flujos diferidos (nudge) fijan la
      // suya para no enviar un comando del documento A a la sesión B.
      const targetSessionId = sessionId ?? stateRef.current.activeSessionId;
      if (targetSessionId === null || !stateRef.current.tabs.has(targetSessionId)) {
        return undefined;
      }
      const result = await window.api.executeCommand(targetSessionId, command);
      // Respuesta de una pestaña que ya se cerró: se descarta en bloque, sin
      // reconciliar ni avisar (generalización de BUG-42 a pestañas).
      if (!stateRef.current.tabs.has(targetSessionId)) return undefined;
      if (import.meta.env.DEV) {
        console.log(
          `[debug] cmd ${command.cmd} → ok=${result.ok}` +
            (result.ok
              ? ` v=${result.version} applied=${JSON.stringify(result.applied ?? null)}`
              : ` code=${result.code} ${result.message ?? ''}`),
        );
      }
      if (!result.ok) {
        setTabError(targetSessionId, apiErrorMessage(result, 'comando rechazado'));
        void resyncProjection(targetSessionId);
        return result;
      }
      // Los valores normalizados por el dominio se reconcilian en la pestaña
      // que lanzó el comando (aunque el usuario haya cambiado de pestaña).
      if (result.applied && result.applied.length > 0) {
        const applied = result.applied;
        setWorkspace((current) =>
          patchTabProjection(current, targetSessionId, (projection) =>
            applied.reduce(
              (next, entry) => patchItem(next, entry.id, entry.values as Partial<ItemDto>),
              projection,
            ),
          ),
        );
      }
      // Los comandos rutinarios (mover, estilo, insertar…) no dicen nada en el
      // pie: el lienzo ya muestra el resultado (BUG-58).
      return result;
    },
    [resyncProjection, setTabError, setWorkspace],
  );

  const updateProjection = useCallback(
    (patch: (projection: ProjectionDto) => ProjectionDto): void => {
      const sessionId = stateRef.current.activeSessionId;
      if (sessionId === null) return;
      setWorkspace((current) => patchTabProjection(current, sessionId, patch));
    },
    [setWorkspace],
  );

  /* ------------------------------ ui por pestaña -------------------------- */

  /**
   * El `ui` (selección, zoom, paneles) vive en `tab.ui`: la activa lo lee al
   * renderizar y cada cambio se escribe aquí. `patchTabUi` descarta los parches
   * que no cambian nada, así que esto no puede encadenar renders.
   */
  const updateTabUiFor = useCallback(
    (sessionId: string, patch: TabUiPatch): void => {
      setWorkspace((current) => {
        const tab = current.tabs.get(sessionId);
        if (!tab) return current;
        return patchTabUi(current, sessionId, resolveTabUiPatch(tab.ui, patch));
      });
    },
    [setWorkspace],
  );

  const updateUi = useCallback(
    (patch: Partial<TabUiState>): void => {
      const sessionId = stateRef.current.activeSessionId;
      if (sessionId === null) return;
      updateTabUiFor(sessionId, patch);
    },
    [updateTabUiFor],
  );

  /* ----------------------- persistencia del ui (recarga) ------------------- */

  /** Último `ui` escrito en sessionStorage por sesión (comparación por referencia). */
  const persistedUi = useRef(new Map<string, TabUiState>());
  const persistTimer = useRef<number | null>(null);

  /** Vuelca a sessionStorage los `ui` que cambiaron y borra los de sesiones cerradas. */
  const flushTabUi = useCallback((): void => {
    persistTimer.current = null;
    const known = persistedUi.current;
    const { tabs: liveTabs } = stateRef.current;
    for (const [sessionId, tab] of liveTabs) {
      if (known.get(sessionId) === tab.ui) continue;
      saveTabUi(sessionId, tab.ui);
      known.set(sessionId, tab.ui);
    }
    for (const sessionId of [...known.keys()]) {
      if (liveTabs.has(sessionId)) continue;
      removeTabUi(sessionId);
      known.delete(sessionId);
    }
  }, []);

  // Con debounce y sin `setState`: no provoca renders extra. `pagehide` fuerza el
  // volcado final antes de recargar la interfaz.
  useEffect(() => {
    const known = persistedUi.current;
    let dirtyUi = known.size !== state.tabs.size;
    for (const [sessionId, tab] of state.tabs) {
      if (known.get(sessionId) !== tab.ui) dirtyUi = true;
    }
    if (!dirtyUi || persistTimer.current !== null) return;
    persistTimer.current = window.setTimeout(flushTabUi, UI_PERSIST_MS);
  }, [state.tabs, flushTabUi]);

  useEffect(() => {
    window.addEventListener('pagehide', flushTabUi);
    return () => {
      window.removeEventListener('pagehide', flushTabUi);
      if (persistTimer.current !== null) window.clearTimeout(persistTimer.current);
      flushTabUi();
    };
  }, [flushTabUi]);

  /** Copiar/cortar en esa sesión: su pestaña queda con «Pegar» disponible. */
  const markSessionClipboard = useCallback(
    (sessionId: string): void => {
      setWorkspace((current) => markClipboard(current, sessionId));
    },
    [setWorkspace],
  );

  /* ------------------------------ deshacer/rehacer ------------------------ */

  const undo = useCallback(async (): Promise<void> => {
    const sessionId = stateRef.current.activeSessionId;
    if (sessionId === null) return;
    const result = await window.api.undo(sessionId);
    if (!stateRef.current.tabs.has(sessionId)) return;
    if (!result.ok) setTabError(sessionId, apiErrorMessage(result, 'no se pudo deshacer'));
    else setWorkspace((current) => updateTab(current, sessionId, { status: 'Deshecho' }));
  }, [setTabError, setWorkspace]);

  const redo = useCallback(async (): Promise<void> => {
    const sessionId = stateRef.current.activeSessionId;
    if (sessionId === null) return;
    const result = await window.api.redo(sessionId);
    if (!stateRef.current.tabs.has(sessionId)) return;
    if (!result.ok) setTabError(sessionId, apiErrorMessage(result, 'no se pudo rehacer'));
    else setWorkspace((current) => updateTab(current, sessionId, { status: 'Rehecho' }));
  }, [setTabError, setWorkspace]);

  /* -------------------------------- vista --------------------------------- */

  const activeTab = state.activeSessionId ? state.tabs.get(state.activeSessionId) ?? null : null;

  /** UI de la pestaña activa; sin pestañas, el estado por defecto (estable). */
  const ui = activeTab?.ui ?? EMPTY_TAB_UI;

  const doc = useMemo<OpenDocument | null>(() => {
    if (!activeTab) return null;
    return {
      sessionId: activeTab.sessionId,
      path: activeTab.path,
      projection: activeTab.projection,
    };
  }, [activeTab]);

  const tabs = useMemo(
    () =>
      state.order.flatMap((sessionId) => {
        const tab = state.tabs.get(sessionId);
        return tab ? [tab] : [];
      }),
    [state],
  );

  // El autocompletado de expresiones se alimenta de la meta del informe activo.
  useEffect(() => {
    setCompletionMeta(activeTab?.projection.meta ?? null);
  }, [activeTab?.projection]);

  // El título de la ventana muestra la pestaña activa y su `*` (BUG-59).
  useEffect(() => {
    document.title = formatWindowTitle(activeTab?.path ?? null, activeTab?.dirty ?? false);
  }, [activeTab?.path, activeTab?.dirty]);

  return {
    doc,
    tabs,
    activeSessionId: state.activeSessionId,
    ui,
    hasBackend,
    status: busyLabel ?? activeTab?.status ?? workspaceStatus,
    error: workspaceError ?? activeTab?.error ?? null,
    dirty: activeTab?.dirty ?? false,
    hasClipboard: activeTab?.hasClipboard ?? false,
    conflict: activeTab?.conflict ?? null,
    fileMissing: activeTab?.fileMissing ?? null,
    busy,
    reloads: activeTab?.reloads ?? 0,
    recents,
    pendingIntent,
    setStatus,
    setError,
    sendCommand,
    updateProjection,
    updateUi,
    updateTabUi: updateTabUiFor,
    markClipboard: markSessionClipboard,
    open,
    openPath,
    openPaths,
    createNew,
    save,
    saveAs,
    close,
    closeTab: requestCloseTab,
    closeTabs: requestCloseTabs,
    activateTab: activate,
    cycleTab: cycle,
    moveTab: move,
    moveActiveTab: moveActive,
    reloadFromDisk,
    refreshRecents,
    resolvePending,
    undo,
    redo,
  };
}
