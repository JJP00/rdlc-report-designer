import type { CommandResult, ItemDto, ProjectionDto, RdlcCommand } from '@rdlc-designer/contracts';
import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react';
import { setCompletionMeta } from '@/lib/completionMeta';
import { apiErrorMessage } from '@/lib/errors';
import { patchItem } from '@/lib/projection';

/**
 * Ciclo de vida del documento abierto: estado de sesión (pestaña), eventos del
 * backend (recargas, dirty, conflicto), envío de comandos con reconciliación del
 * optimismo y las acciones de fichero (abrir/guardar/cerrar/undo/redo).
 *
 * `App` queda como composición: aquí vive todo lo que habla con el backend.
 *
 * **Guardas de trabajo sin guardar**: abrir otro informe, crear uno nuevo,
 * cerrar la pestaña o cerrar la ventana pasan por una intención pendiente
 * (`pendingIntent`) que el diálogo resuelve (guardar / descartar / cancelar).
 */

export interface OpenDocument {
  sessionId: string;
  path: string;
  projection: ProjectionDto;
}

/** Acción que perdería cambios sin guardar y exige confirmación. */
export type PendingIntent =
  | { kind: 'open' }
  | { kind: 'openPath'; path: string }
  | { kind: 'new' }
  | { kind: 'close' }
  | { kind: 'windowClose' };

/** Resolución del diálogo de cambios sin guardar. */
export type PendingResolution = 'save' | 'discard' | 'cancel';

export interface DocumentCore {
  doc: OpenDocument | null;
  /** false si no hay preload (renderer abierto en un navegador). */
  hasBackend: boolean;
  status: string;
  error: string | null;
  dirty: boolean;
  /** Ruta del fichero que cambió por fuera mientras había cambios locales. */
  conflict: string | null;
  /** Nº de recargas externas (los snapshots internos no cuentan). */
  reloads: number;
  /** Ficheros recientes (para el desplegable de «Abrir…»). */
  recents: string[];
  /** Intención en espera de que el usuario resuelva los cambios sin guardar. */
  pendingIntent: PendingIntent | null;

  setStatus: (message: string) => void;
  setError: (message: string | null) => void;
  /** Ejecuta un comando y reconcilia el optimismo con lo aplicado por el dominio. */
  sendCommand: (command: RdlcCommand) => Promise<CommandResult | undefined>;
  /** Refleja los valores normalizados que devuelve un comando. */
  reconcile: (applied: { id: string; values: Record<string, unknown> }[] | undefined) => void;
  /** Actualiza la proyección de forma optimista (sin tocar el backend). */
  updateProjection: (patch: (projection: ProjectionDto) => ProjectionDto) => void;

  /** Abrir… (con guarda de cambios). */
  open: () => void;
  /** Abrir una ruta concreta (recientes, drag&drop), con guarda. */
  openPath: (path: string) => void;
  /** Nuevo… (pide ruta y escribe la plantilla), con guarda. */
  createNew: () => void;
  /** Guardar; devuelve `true` si se escribió. */
  save: () => Promise<boolean>;
  /** Guardar como… (pide ruta); devuelve `true` si se escribió. */
  saveAs: () => Promise<boolean>;
  /** Cerrar la pestaña (con guarda). */
  close: () => void;
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

export function useDocumentCore(): DocumentCore {
  const [doc, setDoc] = useState<OpenDocument | null>(null);
  const [status, setStatus] = useState(
    'Listo. Abre un informe .rdlc de Business Central o un .rdl 2016.',
  );
  const [error, setErrorState] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [conflict, setConflict] = useState<string | null>(null);
  const [reloads, setReloads] = useState(0);
  const [recents, setRecents] = useState<string[]>([]);
  const [pendingIntent, setPendingIntent] = useState<PendingIntent | null>(null);
  const errorTimer = useRef<number | null>(null);

  /**
   * Muestra un aviso de error: se pinta sin el código (`apiErrorMessage`) y se
   * borra solo pasados unos segundos (o al llegar otro aviso, que lo re-arma).
   */
  const setError = useCallback((message: string | null): void => {
    if (errorTimer.current !== null) {
      window.clearTimeout(errorTimer.current);
      errorTimer.current = null;
    }
    setErrorState(message);
    if (message) {
      errorTimer.current = window.setTimeout(() => {
        errorTimer.current = null;
        setErrorState(null);
      }, ERROR_BANNER_MS);
    }
  }, []);

  useEffect(
    () => () => {
      if (errorTimer.current !== null) window.clearTimeout(errorTimer.current);
    },
    [],
  );

  // Sin preload (p. ej. abriendo el renderer en un navegador) no hay backend IPC.
  const hasBackend = typeof window !== 'undefined' && window.api !== undefined;

  /* --------------------------- eventos del backend ------------------------ */

  useEffect(() => {
    if (!hasBackend) return;
    // Guarda para preloads antiguos en dev (requiere reinicio al cambiar el preload).
    if (typeof window.api.consumePendingOpen !== 'function') return;

    let cancelled = false;
    void window.api
      .consumePendingOpen()
      .then(async (pending) => {
        if (cancelled || !pending.path) return;
        const result = await window.api.openFile(pending.path);
        if (cancelled) return;
        if (!result.ok) {
          setError(apiErrorMessage(result, 'error al abrir'));
          return;
        }
        setDoc({ sessionId: result.sessionId, path: pending.path, projection: result.projection });
        setStatus(`Abierto: ${pending.path}`);
        void refreshRecentsRef.current();
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });

    return () => {
      cancelled = true;
    };
  }, [hasBackend]);

  useEffect(() => {
    if (!hasBackend) return;

    const offDocument = window.api.onDocumentChanged((event) => {
      setDoc((current) => {
        if (!current || current.sessionId !== event.sessionId) return current;
        // Los snapshots solo avanzan: un evento viejo (duplicado o reordenado)
        // no debe pisar una proyección más nueva.
        if (event.projection.version < current.projection.version) return current;
        return { ...current, projection: event.projection };
      });
      // Solo las recargas externas cuentan (y avisan): los snapshots internos
      // (insert/undo/redo) son parte del trabajo normal.
      if (event.reason === 'external') {
        setReloads((count) => count + 1);
        setStatus(`Recargado desde disco (v${event.projection.version})`);
      }
    });

    const offDirty = window.api.onDirtyChanged((event) => setDirty(event.dirty));

    // El fichero cambió en disco con cambios locales: el backend NO recarga
    // (sería perder el trabajo); aquí se avisa y el usuario decide.
    const offConflict =
      typeof window.api.onConflictDetected === 'function'
        ? window.api.onConflictDetected((event) => {
            setConflict(event.filePath);
            setStatus('El fichero cambió en disco. Tus cambios siguen en el editor.');
          })
        : () => {};

    return () => {
      offDocument();
      offDirty();
      offConflict();
    };
  }, [hasBackend]);

  // El autocompletado de expresiones se alimenta de la meta del informe activo.
  useEffect(() => {
    setCompletionMeta(doc?.projection.meta ?? null);
  }, [doc]);

  /* ------------------------------ comandos -------------------------------- */

  const updateProjection = useCallback(
    (patch: (projection: ProjectionDto) => ProjectionDto): void => {
      setDoc((current) =>
        current ? { ...current, projection: patch(current.projection) } : current,
      );
    },
    [],
  );

  /** Reconcilia el optimismo con los valores normalizados por el dominio. */
  const reconcile = useCallback(
    (applied: { id: string; values: Record<string, unknown> }[] | undefined): void => {
      if (!applied || applied.length === 0) return;
      setDoc((current) =>
        current
          ? {
              ...current,
              projection: applied.reduce(
                (projection, entry) =>
                  patchItem(projection, entry.id, entry.values as Partial<ItemDto>),
                current.projection,
              ),
            }
          : current,
      );
    },
    [],
  );

  const sendCommand = useCallback(
    async (command: RdlcCommand): Promise<CommandResult | undefined> => {
      if (!doc) return undefined;
      const result = await window.api.executeCommand(doc.sessionId, command);
      if (import.meta.env.DEV) {
        console.log(
          `[debug] cmd ${command.cmd} → ok=${result.ok}` +
            (result.ok
              ? ` v=${result.version} applied=${JSON.stringify(result.applied ?? null)}`
              : ` code=${result.code} ${result.message ?? ''}`),
        );
      }
      if (!result.ok) {
        setError(apiErrorMessage(result, 'comando rechazado'));
        return result;
      }
      setStatus(`Comando '${command.cmd}' aplicado (v${result.version ?? '?'})`);
      return result;
    },
    [doc],
  );

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

  /** Abre una ruta concreta: cierra la sesión anterior y adopta la nueva. */
  const openPath = useCallback(
    async (path: string): Promise<void> => {
      setError(null);
      if (doc) {
        // La sesión anterior (y su watcher) se cierra: no dejamos fugas.
        await window.api.close(doc.sessionId, true);
      }
      const result = await window.api.openFile(path);
      if (!result.ok) {
        setError(apiErrorMessage(result, 'error al abrir'));
        return;
      }
      setDoc({ sessionId: result.sessionId, path, projection: result.projection });
      setDirty(false);
      setConflict(null);
      setStatus(`Abierto: ${path}`);
      refreshRecents();
    },
    [doc, refreshRecents, setError],
  );

  const pickAndOpen = useCallback(async (): Promise<void> => {
    setError(null);
    const picked = await window.api.pickFile();
    if (!picked.ok || !picked.path) return;
    await openPath(picked.path);
  }, [openPath, setError]);

  /** Nuevo: pide ruta, escribe la plantilla en blanco y la abre. */
  const createNew = useCallback(async (): Promise<void> => {
    setError(null);
    const picked = await window.api.pickSavePath('Nuevo informe.rdlc');
    if (!picked.ok || !picked.path) return;
    if (doc) await window.api.close(doc.sessionId, true);
    const result = await window.api.createNew(picked.path);
    if (!result.ok) {
      setError(apiErrorMessage(result, 'no se pudo crear el informe'));
      return;
    }
    setDoc({ sessionId: result.sessionId, path: picked.path, projection: result.projection });
    setDirty(false);
    setConflict(null);
    setStatus(`Nuevo informe: ${picked.path}`);
    refreshRecents();
  }, [doc, refreshRecents, setError]);

  /** Guardar: `true` si se escribió (para encadenar «guardar y …»). */
  const save = useCallback(async (): Promise<boolean> => {
    if (!doc) return false;
    setError(null);
    const result = await window.api.save(doc.sessionId);
    if (!result.ok) {
      setError(apiErrorMessage(result, 'error al guardar'));
      return false;
    }
    setConflict(null);
    setStatus(
      result.bytesIdentical
        ? `Guardado — bytes idénticos al original ✓ (${result.path})`
        : `Guardado: ${result.path}`,
    );
    return true;
  }, [doc, setError]);

  /** Guardar como: pide ruta y la sesión pasa a apuntar ahí. */
  const saveAs = useCallback(async (): Promise<boolean> => {
    if (!doc) return false;
    setError(null);
    const picked = await window.api.pickSavePath(doc.path);
    if (!picked.ok || !picked.path) return false;
    const result = await window.api.saveAs(doc.sessionId, picked.path);
    if (!result.ok) {
      setError(apiErrorMessage(result, 'error al guardar'));
      return false;
    }
    setDoc((current) => (current ? { ...current, path: result.path } : current));
    setConflict(null);
    setStatus(`Guardado como: ${result.path}`);
    refreshRecents();
    return true;
  }, [doc, refreshRecents, setError]);

  /** Recargar desde disco descartando los cambios locales (conflicto). */
  const reloadFromDisk = useCallback(async (): Promise<void> => {
    if (!doc) return;
    setError(null);
    const result = await window.api.reloadFile(doc.sessionId);
    if (!result.ok) {
      setError(apiErrorMessage(result, 'no se pudo recargar'));
      return;
    }
    setDoc({ sessionId: result.sessionId, path: doc.path, projection: result.projection });
    setDirty(false);
    setConflict(null);
    setStatus(`Recargado desde disco (v${result.projection.version})`);
  }, [doc, setError]);

  /** Cerrar la pestaña (el usuario ya decidió sobre los cambios, si había). */
  const closeNow = useCallback(async (): Promise<void> => {
    if (!doc) return;
    const result = await window.api.close(doc.sessionId, true);
    if (!result.ok && 'code' in result) {
      setError(apiErrorMessage(result, 'no se pudo cerrar'));
      return;
    }
    setDoc(null);
    setDirty(false);
    setConflict(null);
    setStatus('Documento cerrado.');
  }, [doc, setError]);

  /* --------------------- guardas de cambios sin guardar -------------------- */

  const executeIntent = useCallback(
    async (intent: PendingIntent): Promise<void> => {
      switch (intent.kind) {
        case 'open':
          await pickAndOpen();
          return;
        case 'openPath':
          await openPath(intent.path);
          return;
        case 'new':
          await createNew();
          return;
        case 'close':
          await closeNow();
          return;
        case 'windowClose':
          await window.api.confirmWindowClose(true);
          return;
      }
    },
    [closeNow, createNew, openPath, pickAndOpen],
  );

  /** Lanza una intención: si hay cambios sin guardar, pide decisión primero. */
  const requestIntent = useCallback(
    (intent: PendingIntent): void => {
      if (dirty && doc) {
        setPendingIntent(intent);
        return;
      }
      void executeIntent(intent);
    },
    [dirty, doc, executeIntent],
  );

  const resolvePending = useCallback(
    (resolution: PendingResolution): void => {
      const intent = pendingIntent;
      if (!intent) return;
      if (resolution === 'cancel') {
        setPendingIntent(null);
        return;
      }
      if (resolution === 'save') {
        // Si el guardado falla (p. ej. validación), el diálogo sigue abierto:
        // no se pierde el trabajo y el usuario puede corregir.
        void save().then((ok) => {
          if (!ok) return;
          setPendingIntent(null);
          void executeIntent(intent);
        });
        return;
      }
      setPendingIntent(null);
      void executeIntent(intent);
    },
    [executeIntent, pendingIntent, save],
  );

  // El SO quiere cerrar la ventana: con cambios sin guardar se pregunta.
  const onWindowCloseRequested = useEffectEvent((): void => {
    requestIntent({ kind: 'windowClose' });
  });

  useEffect(() => {
    if (!hasBackend || typeof window.api.onCloseRequested !== 'function') return;
    return window.api.onCloseRequested(() => onWindowCloseRequested());
  }, [hasBackend]);

  /* ------------------------------ deshacer/rehacer ------------------------ */

  const undo = useCallback(async (): Promise<void> => {
    if (!doc) return;
    const result = await window.api.undo(doc.sessionId);
    if (!result.ok) setError(apiErrorMessage(result, 'no se pudo deshacer'));
    else setStatus(`Deshecho (v${result.version ?? '?'})`);
  }, [doc, setError]);

  const redo = useCallback(async (): Promise<void> => {
    if (!doc) return;
    const result = await window.api.redo(doc.sessionId);
    if (!result.ok) setError(apiErrorMessage(result, 'no se pudo rehacer'));
    else setStatus(`Rehecho (v${result.version ?? '?'})`);
  }, [doc, setError]);

  return {
    doc,
    hasBackend,
    status,
    error,
    dirty,
    conflict,
    reloads,
    recents,
    pendingIntent,
    setStatus,
    setError,
    sendCommand,
    reconcile,
    updateProjection,
    open: () => requestIntent({ kind: 'open' }),
    openPath: (path: string) => requestIntent({ kind: 'openPath', path }),
    createNew: () => requestIntent({ kind: 'new' }),
    save,
    saveAs,
    close: () => requestIntent({ kind: 'close' }),
    reloadFromDisk,
    refreshRecents,
    resolvePending,
    undo,
    redo,
  };
}
