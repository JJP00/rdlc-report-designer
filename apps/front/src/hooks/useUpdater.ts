import type { UpdateState, UpdateStateResult, UpdateStatus } from '@rdlc-designer/contracts';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { UpdaterController } from '@/hooks/updaterContext';

/**
 * Estado de las actualizaciones en el renderer. El main hace todo el trabajo
 * (red, descarga, instalación) y publica `updateStateChanged`; aquí solo se
 * refleja ese estado y se decide cuándo se abre el diálogo:
 *
 * - una oferta nueva (comprobación automática del arranque) lo abre sola;
 * - «Más tarde» lo cierra y la oferta sigue en Fichero hasta instalarla.
 */
export function useUpdater(): UpdaterController {
  const [state, setState] = useState<UpdateState | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const lastStatus = useRef<UpdateStatus | null>(null);

  const apply = useCallback((next: UpdateState): void => {
    lastStatus.current = next.status;
    setState(next);
  }, []);

  useEffect(() => {
    const api = window.api;
    if (!api?.getUpdateState) return undefined;
    let cancelled = false;

    void api
      .getUpdateState()
      .then((result) => {
        if (!cancelled && result.ok) apply(result.state);
      })
      .catch(() => undefined);

    const unsubscribe = api.onUpdateStateChanged((next) => {
      // Oferta nueva (no una actualización de progreso de la misma): se muestra.
      if (next.status === 'available' && lastStatus.current !== 'available') setDialogOpen(true);
      apply(next);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [apply]);

  const run = useCallback(
    async (call: () => Promise<UpdateStateResult>): Promise<void> => {
      try {
        const result = await call();
        if (result.ok) apply(result.state);
      } catch {
        // El main publica sus errores por estado; un fallo de IPC no debe romper la UI.
      }
    },
    [apply],
  );

  const check = useCallback(async (): Promise<void> => {
    setDialogOpen(true);
    await run(() => window.api.checkForUpdates());
  }, [run]);

  const download = useCallback((): Promise<void> => run(() => window.api.downloadUpdate()), [run]);

  const install = useCallback(async (): Promise<void> => {
    // El diálogo se cierra antes: la guarda de cambios sin guardar es la que debe verse.
    setDialogOpen(false);
    await run(() => window.api.installUpdate());
  }, [run]);

  const skip = useCallback(async (): Promise<void> => {
    setDialogOpen(false);
    await run(() => window.api.skipUpdateVersion());
  }, [run]);

  const openReleasePage = useCallback(async (): Promise<void> => {
    try {
      await window.api.openReleasePage();
    } catch {
      // Sin navegador por defecto no hay nada más que hacer.
    }
  }, []);

  const openDialog = useCallback((): void => setDialogOpen(true), []);

  const hasPending =
    state?.status === 'available' ||
    state?.status === 'downloading' ||
    state?.status === 'downloaded';

  return useMemo(
    () => ({
      state,
      dialogOpen,
      setDialogOpen,
      hasPending,
      check,
      openDialog,
      download,
      install,
      skip,
      openReleasePage,
    }),
    [state, dialogOpen, hasPending, check, openDialog, download, install, skip, openReleasePage],
  );
}
