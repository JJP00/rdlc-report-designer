import type { CommandResult, ItemDto, ProjectionDto, RdlcCommand } from '@rdlc-designer/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';
import { setCompletionMeta } from '@/lib/completionMeta';
import { apiErrorMessage } from '@/lib/errors';
import { patchItem } from '@/lib/projection';

/**
 * Ciclo de vida del documento abierto: estado de sesión (pestaña), eventos del
 * backend (recargas, dirty, conflicto), envío de comandos con reconciliación del
 * optimismo y las acciones de fichero (abrir/guardar/cerrar/undo/redo).
 *
 * `App` queda como composición: aquí vive todo lo que habla con el backend.
 */

export interface OpenDocument {
  sessionId: string;
  path: string;
  projection: ProjectionDto;
}

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
  setStatus: (message: string) => void;
  setError: (message: string | null) => void;
  /** Ejecuta un comando y reconcilia el optimismo con lo aplicado por el dominio. */
  sendCommand: (command: RdlcCommand) => Promise<CommandResult | undefined>;
  /** Refleja los valores normalizados que devuelve un comando. */
  reconcile: (applied: { id: string; values: Record<string, unknown> }[] | undefined) => void;
  /** Actualiza la proyección de forma optimista (sin tocar el backend). */
  updateProjection: (patch: (projection: ProjectionDto) => ProjectionDto) => void;
  open: () => Promise<boolean>;
  save: () => Promise<void>;
  close: (force?: boolean) => Promise<void>;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
}

/** Tiempo que permanece visible un aviso de error (se borra solo). */
const ERROR_BANNER_MS = 6000;

export function useDocumentCore(): DocumentCore {
  const [doc, setDoc] = useState<OpenDocument | null>(null);
  const [status, setStatus] = useState('Listo. Abre un .rdlc exportado de Business Central.');
  const [error, setErrorState] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [conflict, setConflict] = useState<string | null>(null);
  const [reloads, setReloads] = useState(0);
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

  /* ------------------------------- fichero -------------------------------- */

  const open = useCallback(async (): Promise<boolean> => {
    setError(null);
    const picked = await window.api.pickFile();
    if (!picked.ok || !picked.path) return false;

    const result = await window.api.openFile(picked.path);
    if (!result.ok) {
      setError(apiErrorMessage(result, 'error al abrir'));
      return false;
    }
    setDoc({ sessionId: result.sessionId, path: picked.path, projection: result.projection });
    setDirty(false);
    setConflict(null);
    setStatus(`Abierto: ${picked.path}`);
    return true;
  }, []);

  const save = useCallback(async (): Promise<void> => {
    if (!doc) return;
    setError(null);
    const result = await window.api.save(doc.sessionId);
    if (!result.ok) {
      setError(apiErrorMessage(result, 'error al guardar'));
      return;
    }
    setConflict(null);
    setStatus(
      result.bytesIdentical
        ? `Guardado — bytes idénticos al original ✓ (${result.path})`
        : `Guardado: ${result.path}`,
    );
  }, [doc]);

  const close = useCallback(
    async (force = false): Promise<void> => {
      if (!doc) return;
      const result = await window.api.close(doc.sessionId, force);

      // Hay cambios sin guardar: se pregunta antes de cerrar (una sola vez).
      if (!result.ok && 'needsConfirmation' in result) {
        const confirmed = window.confirm(
          'Este informe tiene cambios sin guardar. ¿Cerrar de todos modos? (se perderán)',
        );
        if (confirmed) await close(true);
        return;
      }

      if (!result.ok) {
        if ('code' in result) {
          setError(apiErrorMessage(result, 'no se pudo cerrar'));
        } else {
          setError('No se pudo cerrar el documento.');
        }
        return;
      }
      setDoc(null);
      setDirty(false);
      setConflict(null);
      setStatus('Documento cerrado.');
    },
    [doc],
  );

  const undo = useCallback(async (): Promise<void> => {
    if (!doc) return;
    const result = await window.api.undo(doc.sessionId);
    if (!result.ok) setError(apiErrorMessage(result, 'no se pudo deshacer'));
    else setStatus(`Deshecho (v${result.version ?? '?'})`);
  }, [doc]);

  const redo = useCallback(async (): Promise<void> => {
    if (!doc) return;
    const result = await window.api.redo(doc.sessionId);
    if (!result.ok) setError(apiErrorMessage(result, 'no se pudo rehacer'));
    else setStatus(`Rehecho (v${result.version ?? '?'})`);
  }, [doc]);

  return {
    doc,
    hasBackend,
    status,
    error,
    dirty,
    conflict,
    reloads,
    setStatus,
    setError,
    sendCommand,
    reconcile,
    updateProjection,
    open,
    save,
    close,
    undo,
    redo,
  };
}
