import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CLOSE_ACK_TIMEOUT_MS,
  createWindowLifecycle,
  type LifecycleDialogOptions,
} from '../../src/lifecycle/windowLifecycle.js';

/**
 * Ciclo de vida de la ventana (BUG-51): vigilante de cierre sin acuse, render
 * caído y «no responde». Sin Electron: diálogo y acciones inyectados, timers
 * falsos de vitest.
 */

interface PendingDialog {
  options: LifecycleDialogOptions;
  answer: (button: number) => void;
  fail: (error: unknown) => void;
}

function setup(overrides: { isBench?: boolean } = {}) {
  const dialogs: PendingDialog[] = [];
  let destroyed = false;
  const closeWindow = vi.fn();
  const destroyWindow = vi.fn();
  const reload = vi.fn();
  const log = { error: vi.fn() };
  const showDialog = vi.fn(
    (options: LifecycleDialogOptions) =>
      new Promise<number>((resolve, reject) => {
        dialogs.push({ options, answer: resolve, fail: reject });
      }),
  );

  const lifecycle = createWindowLifecycle({
    isBench: overrides.isBench ?? false,
    setTimer: (callback, ms) => setTimeout(callback, ms),
    clearTimer: (handle) => clearTimeout(handle as NodeJS.Timeout),
    showDialog,
    closeWindow,
    destroyWindow,
    reload,
    isDestroyed: () => destroyed,
    log,
  });

  return {
    lifecycle,
    dialogs,
    showDialog,
    closeWindow,
    destroyWindow,
    reload,
    log,
    destroy: () => {
      destroyed = true;
    },
  };
}

/** Respuesta del usuario y vaciado de microtareas. */
async function answer(dialog: PendingDialog | undefined, button: number): Promise<void> {
  if (!dialog) throw new Error('no hay diálogo');
  dialog.answer(button);
  await vi.advanceTimersByTimeAsync(0);
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Ciclo de vida · cierre sin acuse (BUG-51)', () => {
  it('sin acuse a los 2 s sale el diálogo «Cerrar sin guardar / Cancelar»', async () => {
    const t = setup();
    t.lifecycle.armCloseWatchdog();

    await vi.advanceTimersByTimeAsync(CLOSE_ACK_TIMEOUT_MS - 1);
    expect(t.showDialog).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(t.showDialog).toHaveBeenCalledTimes(1);
    expect(t.dialogs[0]?.options.buttons).toEqual(['Cerrar sin guardar', 'Cancelar']);
    expect(t.closeWindow).not.toHaveBeenCalled();
  });

  it('con acuse a tiempo el diálogo no sale', async () => {
    const t = setup();
    t.lifecycle.armCloseWatchdog();
    await vi.advanceTimersByTimeAsync(CLOSE_ACK_TIMEOUT_MS - 100);
    t.lifecycle.cancelCloseWatchdog();

    await vi.advanceTimersByTimeAsync(CLOSE_ACK_TIMEOUT_MS * 2);
    expect(t.showDialog).not.toHaveBeenCalled();
  });

  it('«Cancelar» no cierra y un nuevo intento de cierre rearma el vigilante', async () => {
    const t = setup();
    t.lifecycle.armCloseWatchdog();
    await vi.advanceTimersByTimeAsync(CLOSE_ACK_TIMEOUT_MS);
    await answer(t.dialogs[0], 1);

    expect(t.closeWindow).not.toHaveBeenCalled();
    expect(t.lifecycle.allowClose).toBe(false);

    t.lifecycle.armCloseWatchdog();
    await vi.advanceTimersByTimeAsync(CLOSE_ACK_TIMEOUT_MS);
    expect(t.showDialog).toHaveBeenCalledTimes(2);
  });

  it('«Cerrar sin guardar» pone allowClose y cierra la ventana', async () => {
    const t = setup();
    t.lifecycle.armCloseWatchdog();
    await vi.advanceTimersByTimeAsync(CLOSE_ACK_TIMEOUT_MS);
    await answer(t.dialogs[0], 0);

    expect(t.lifecycle.allowClose).toBe(true);
    expect(t.closeWindow).toHaveBeenCalledTimes(1);
  });

  it('rearmar reinicia el plazo (un solo temporizador vivo)', async () => {
    const t = setup();
    t.lifecycle.armCloseWatchdog();
    await vi.advanceTimersByTimeAsync(1500);
    t.lifecycle.armCloseWatchdog();
    await vi.advanceTimersByTimeAsync(1500);
    expect(t.showDialog).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(500);
    expect(t.showDialog).toHaveBeenCalledTimes(1);
  });

  it('no apila diálogos: con uno abierto, otro vigilante vencido no abre más', async () => {
    const t = setup();
    t.lifecycle.armCloseWatchdog();
    await vi.advanceTimersByTimeAsync(CLOSE_ACK_TIMEOUT_MS);
    expect(t.showDialog).toHaveBeenCalledTimes(1);

    t.lifecycle.armCloseWatchdog();
    await vi.advanceTimersByTimeAsync(CLOSE_ACK_TIMEOUT_MS);
    t.lifecycle.handleRenderProcessGone('crashed');
    t.lifecycle.handleUnresponsive();
    await vi.advanceTimersByTimeAsync(0);
    expect(t.showDialog).toHaveBeenCalledTimes(1);

    // Al cerrar el primero, se libera y puede salir otro.
    await answer(t.dialogs[0], 1);
    t.lifecycle.armCloseWatchdog();
    await vi.advanceTimersByTimeAsync(CLOSE_ACK_TIMEOUT_MS);
    expect(t.showDialog).toHaveBeenCalledTimes(2);
  });

  it('ventana destruida: no hay diálogo ni acciones', async () => {
    const t = setup();
    t.lifecycle.armCloseWatchdog();
    t.destroy();
    await vi.advanceTimersByTimeAsync(CLOSE_ACK_TIMEOUT_MS);
    t.lifecycle.handleRenderProcessGone('crashed');
    t.lifecycle.handleUnresponsive();
    await vi.advanceTimersByTimeAsync(0);

    expect(t.showDialog).not.toHaveBeenCalled();
    expect(t.closeWindow).not.toHaveBeenCalled();
    expect(t.reload).not.toHaveBeenCalled();
  });

  it('ventana destruida mientras el diálogo está abierto: no cierra ni recarga', async () => {
    const t = setup();
    t.lifecycle.armCloseWatchdog();
    await vi.advanceTimersByTimeAsync(CLOSE_ACK_TIMEOUT_MS);
    t.destroy();
    await answer(t.dialogs[0], 0);

    expect(t.closeWindow).not.toHaveBeenCalled();
  });

  it('un error de showDialog se loguea y libera el diálogo', async () => {
    const t = setup();
    t.lifecycle.armCloseWatchdog();
    await vi.advanceTimersByTimeAsync(CLOSE_ACK_TIMEOUT_MS);
    t.dialogs[0]?.fail(new Error('boom'));
    await vi.advanceTimersByTimeAsync(0);

    expect(t.log.error).toHaveBeenCalledTimes(1);
    expect(t.closeWindow).not.toHaveBeenCalled();

    t.lifecycle.armCloseWatchdog();
    await vi.advanceTimersByTimeAsync(CLOSE_ACK_TIMEOUT_MS);
    expect(t.showDialog).toHaveBeenCalledTimes(2);
  });
});

describe('Ciclo de vida · render-process-gone (BUG-51)', () => {
  it('recargar: recarga la interfaz y no cierra', async () => {
    const t = setup();
    t.lifecycle.handleRenderProcessGone('crashed');
    await vi.advanceTimersByTimeAsync(0);
    expect(t.dialogs[0]?.options.buttons).toEqual(['Recargar la interfaz', 'Cerrar sin guardar']);

    await answer(t.dialogs[0], 0);
    expect(t.reload).toHaveBeenCalledTimes(1);
    expect(t.destroyWindow).not.toHaveBeenCalled();
    expect(t.lifecycle.allowClose).toBe(false);
  });

  it('cerrar sin guardar: allowClose y destroy', async () => {
    const t = setup();
    t.lifecycle.handleRenderProcessGone('oom');
    await vi.advanceTimersByTimeAsync(0);
    await answer(t.dialogs[0], 1);

    expect(t.lifecycle.allowClose).toBe(true);
    expect(t.destroyWindow).toHaveBeenCalledTimes(1);
    expect(t.reload).not.toHaveBeenCalled();
  });

  it('clean-exit se ignora', async () => {
    const t = setup();
    t.lifecycle.handleRenderProcessGone('clean-exit');
    await vi.advanceTimersByTimeAsync(0);
    expect(t.showDialog).not.toHaveBeenCalled();
  });

  it('con allowClose (cierre ya confirmado) se ignora', async () => {
    const t = setup();
    t.lifecycle.allowClose = true;
    t.lifecycle.handleRenderProcessGone('crashed');
    await vi.advanceTimersByTimeAsync(0);
    expect(t.showDialog).not.toHaveBeenCalled();
  });
});

describe('Ciclo de vida · unresponsive/responsive (BUG-51)', () => {
  it('esperar: no recarga', async () => {
    const t = setup();
    t.lifecycle.handleUnresponsive();
    await vi.advanceTimersByTimeAsync(0);
    expect(t.dialogs[0]?.options.buttons).toEqual(['Esperar', 'Recargar la interfaz']);

    await answer(t.dialogs[0], 0);
    expect(t.reload).not.toHaveBeenCalled();
  });

  it('recargar la interfaz: recarga', async () => {
    const t = setup();
    t.lifecycle.handleUnresponsive();
    await vi.advanceTimersByTimeAsync(0);
    await answer(t.dialogs[0], 1);
    expect(t.reload).toHaveBeenCalledTimes(1);
  });

  it('no re-entra mientras haya diálogo; tras responder, vuelve a poder salir', async () => {
    const t = setup();
    t.lifecycle.handleUnresponsive();
    t.lifecycle.handleUnresponsive();
    t.lifecycle.handleUnresponsive();
    await vi.advanceTimersByTimeAsync(0);
    expect(t.showDialog).toHaveBeenCalledTimes(1);

    await answer(t.dialogs[0], 0);
    t.lifecycle.handleUnresponsive();
    await vi.advanceTimersByTimeAsync(0);
    expect(t.showDialog).toHaveBeenCalledTimes(2);
  });

  it('responsive limpia la re-entrada pero no abre otro diálogo si sigue uno abierto', async () => {
    const t = setup();
    t.lifecycle.handleUnresponsive();
    await vi.advanceTimersByTimeAsync(0);

    t.lifecycle.handleResponsive();
    t.lifecycle.handleUnresponsive();
    await vi.advanceTimersByTimeAsync(0);
    // `dialogOpen` sigue activo: no se apila.
    expect(t.showDialog).toHaveBeenCalledTimes(1);
  });

  it('un error de showDialog se loguea y libera la re-entrada', async () => {
    const t = setup();
    t.lifecycle.handleUnresponsive();
    await vi.advanceTimersByTimeAsync(0);
    t.dialogs[0]?.fail(new Error('boom'));
    await vi.advanceTimersByTimeAsync(0);
    expect(t.log.error).toHaveBeenCalledTimes(1);

    t.lifecycle.handleUnresponsive();
    await vi.advanceTimersByTimeAsync(0);
    expect(t.showDialog).toHaveBeenCalledTimes(2);
  });

  it('en benchmark no se instala la vigilancia de unresponsive', async () => {
    const t = setup({ isBench: true });
    expect(t.lifecycle.allowClose).toBe(true);
    t.lifecycle.handleUnresponsive();
    await vi.advanceTimersByTimeAsync(0);
    expect(t.showDialog).not.toHaveBeenCalled();
  });
});
