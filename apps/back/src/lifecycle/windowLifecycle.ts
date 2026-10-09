/**
 * Lógica de decisión del ciclo de vida de la ventana (BUG-51), sin dependencia
 * de Electron: el cierre sin acuse del renderer, el render caído y el «no
 * responde». Todo lo nativo (diálogos, timers, acciones sobre la ventana) se
 * inyecta, de modo que `main.ts` es solo el cableado y esto se prueba con
 * timers falsos.
 */

/** Tiempo máximo que se espera a que el renderer acuse la petición de cierre. */
export const CLOSE_ACK_TIMEOUT_MS = 2000;

export interface LifecycleDialogOptions {
  type: 'warning';
  buttons: string[];
  defaultId: number;
  cancelId: number;
  title: string;
  message: string;
  detail: string;
}

export interface WindowLifecycleDeps {
  /** En benchmark no se instala la vigilancia de «no responde». */
  isBench: boolean;
  setTimer: (callback: () => void, ms: number) => unknown;
  clearTimer: (handle: unknown) => void;
  /** Muestra un diálogo nativo y devuelve el índice del botón pulsado. */
  showDialog: (options: LifecycleDialogOptions) => Promise<number>;
  closeWindow: () => void;
  destroyWindow: () => void;
  reload: () => void;
  isDestroyed: () => boolean;
  log: { error: (message: string, error?: unknown) => void };
}

export interface WindowLifecycle {
  /** true cuando el front ya confirmó el cierre (no se vuelve a interceptar). */
  allowClose: boolean;
  /** El SO pidió cerrar y se envió la petición al front: arma el vigilante. */
  armCloseWatchdog: () => void;
  /** El renderer acusó (o respondió a) la petición: el vigilante ya no procede. */
  cancelCloseWatchdog: () => void;
  /** `render-process-gone` del `webContents`. */
  handleRenderProcessGone: (reason: string) => void;
  /** `unresponsive` de la ventana (ignorado en benchmark). */
  handleUnresponsive: () => void;
  /** `responsive` de la ventana: limpia la re-entrada del «no responde». */
  handleResponsive: () => void;
}

export function createWindowLifecycle(deps: WindowLifecycleDeps): WindowLifecycle {
  let closeWatchdog: unknown = null;
  /** Evita apilar diálogos nativos (cierre, render caído, «no responde»). */
  let dialogOpen = false;
  /** Re-entrada del diálogo de «no responde»; `responsive` la limpia. */
  let unresponsiveDialogOpen = false;

  const lifecycle: WindowLifecycle = {
    allowClose: deps.isBench,
    armCloseWatchdog,
    cancelCloseWatchdog,
    handleRenderProcessGone,
    handleUnresponsive,
    handleResponsive,
  };

  function cancelCloseWatchdog(): void {
    if (closeWatchdog === null) return;
    deps.clearTimer(closeWatchdog);
    closeWatchdog = null;
  }

  /** Arma el vigilante: sin acuse del renderer, se ofrece cerrar sin guardar. */
  function armCloseWatchdog(): void {
    cancelCloseWatchdog();
    closeWatchdog = deps.setTimer(() => {
      closeWatchdog = null;
      void showCloseFallbackDialog();
    }, CLOSE_ACK_TIMEOUT_MS);
  }

  /** Cierre sin acuse del front (ErrorBoundary, renderer colgado): decide el usuario. */
  async function showCloseFallbackDialog(): Promise<void> {
    if (dialogOpen || deps.isDestroyed()) return;
    dialogOpen = true;
    try {
      const response = await deps.showDialog({
        type: 'warning',
        buttons: ['Cerrar sin guardar', 'Cancelar'],
        defaultId: 1,
        cancelId: 1,
        title: 'RDLC Report Designer',
        message: 'La interfaz no responde.',
        detail:
          'El trabajo sin guardar sigue en memoria del editor. Puedes cerrar sin guardar o cancelar.',
      });
      if (response === 0) {
        lifecycle.allowClose = true;
        if (!deps.isDestroyed()) deps.closeWindow();
      }
      // «Cancelar»: nada; un nuevo intento de cierre vuelve a armar el vigilante.
    } catch (error) {
      deps.log.error('No se pudo mostrar el diálogo de cierre', error);
    } finally {
      dialogOpen = false;
    }
  }

  /** Proceso del renderer caído: recargar (el front re-adopta sesiones) o cerrar. */
  async function showRenderProcessGoneDialog(): Promise<void> {
    if (dialogOpen || deps.isDestroyed()) return;
    dialogOpen = true;
    try {
      const response = await deps.showDialog({
        type: 'warning',
        buttons: ['Recargar la interfaz', 'Cerrar sin guardar'],
        defaultId: 0,
        cancelId: 1,
        title: 'RDLC Report Designer',
        message: 'La interfaz se ha cerrado de forma inesperada.',
        detail:
          'El trabajo sin guardar sigue en memoria del editor. Recarga la interfaz para recuperarlo o cierra sin guardar.',
      });
      if (response === 0) {
        // Al montar, el front re-adopta las sesiones vivas vía `listSessions`.
        if (!deps.isDestroyed()) deps.reload();
        return;
      }
      lifecycle.allowClose = true;
      deps.destroyWindow();
    } catch (error) {
      deps.log.error('No se pudo mostrar el diálogo de render caído', error);
    } finally {
      dialogOpen = false;
    }
  }

  /** El front se quedó colgado: esperar o recargar la interfaz. */
  async function showUnresponsiveDialog(): Promise<void> {
    if (dialogOpen || deps.isDestroyed()) return;
    dialogOpen = true;
    try {
      const response = await deps.showDialog({
        type: 'warning',
        buttons: ['Esperar', 'Recargar la interfaz'],
        defaultId: 0,
        cancelId: 0,
        title: 'RDLC Report Designer',
        message: 'La interfaz no responde.',
        detail:
          'Puedes esperar a que termine o recargar la interfaz; el trabajo sin guardar sigue en memoria del editor.',
      });
      if (response === 1 && !deps.isDestroyed()) deps.reload();
    } catch (error) {
      deps.log.error('No se pudo mostrar el diálogo de aplicación bloqueada', error);
    } finally {
      dialogOpen = false;
      unresponsiveDialogOpen = false;
    }
  }

  function handleRenderProcessGone(reason: string): void {
    if (lifecycle.allowClose || reason === 'clean-exit') return;
    void showRenderProcessGoneDialog();
  }

  function handleUnresponsive(): void {
    // En benchmark no se interviene (mismo comportamiento de siempre).
    if (deps.isBench || unresponsiveDialogOpen) return;
    unresponsiveDialogOpen = true;
    void showUnresponsiveDialog();
  }

  function handleResponsive(): void {
    if (deps.isBench) return;
    unresponsiveDialogOpen = false;
  }

  return lifecycle;
}
